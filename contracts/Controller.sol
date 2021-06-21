// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import {FixedStablecoins, FixedGTokens} from "./common/FixedContracts.sol";
import "./common/Whitelist.sol";

import "./interfaces/IBuoy.sol";
import "./interfaces/IChainPrice.sol";
import "./interfaces/IController.sol";
import "./interfaces/IERC20Detailed.sol";
import "./interfaces/IInsurance.sol";
import "./interfaces/ILifeGuard.sol";
import "./interfaces/IPnL.sol";
import "./interfaces/IToken.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWithdrawHandler.sol";

/// @notice The main hub for Gro protocol - The controller links up the other contracts,
///     and acts a route for the other contracts to call one another. It holds global states
///     such as paused and emergency. Contracts that depend on the controller implement
///     Controllable.
///
///     *****************************************************************************
///     System tokens - GTokens:
///     gvt - high yield, uninsured
///     pwrd - insured by gvt, pays part of its yield to gvt (depending on utilisation)
///
///     Tokens order is DAI, USDC, USDT.
///     Index 0 - DAI, 1 - USDC, 2 - USDT
///
///     System vaults:
///     Stablecoin vaults: One per stablecoin
///     Curve vault: Vault for LP (liquidity pool) token
contract Controller is Pausable, Ownable, Whitelist, FixedStablecoins, FixedGTokens, IController {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public override curveVault; // LP token vault

    bool public preventSmartContracts = false;

    address public override insurance; // Insurance logic
    address public override pnl; // Profit and loss calculations
    address public override lifeGuard; // Asset swapping
    address public override buoy; // Oracle
    address public override withdrawHandler;
    address public override depositHandler;

    uint256 public override deadCoin = 99;
    bool public override emergencyState;

    /// Limits for what deposits/withdrawals that are considered 'large', and thus will be handled with
    ///     a different logic - limits are checked against total assets locked in etiher of the two tokens (pwrd, gvt)
    uint256 public bigFishThreshold = 100; // %Basis Points limit
    uint256 public bigFishAbsoluteThreshold = 0; // Absolute limit
    address public override reward;

    mapping(address => bool) public safeAddresses; // Some integrations need to be exempt from flashloan checks
    mapping(uint256 => address) public override underlyingVaults; // Protocol stablecoin vaults
    mapping(address => uint256) public vaultIndexes;

    event LogNewWithdrawHandler(address tokens);
    event LogNewDepositHandler(address tokens);
    event LogNewVault(uint256 index, address vault);
    event LogNewCurveVault(address curveVault);
    event LogNewLifeguard(address lifeguard);
    event LogNewInsurance(address insurance);
    event LogNewPnl(address pnl);
    event LogNewBigFishThreshold(uint256 percent, uint256 absolute);
    event LogFlashSwitchUpdated(bool status);
    event LogNewSafeAddress(address account);
    event LogNewRewardsContract(address reward);

    constructor(
        address pwrd,
        address gvt,
        address[N_COINS] memory _tokens,
        uint256[N_COINS] memory _decimals
    ) public FixedStablecoins(_tokens, _decimals) FixedGTokens(pwrd, gvt) {}

    function pause() external onlyWhitelist {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setWithdrawHandler(address _withdrawHandler) external onlyOwner {
        require(_withdrawHandler != address(0), "setWithdrawHandler: 0x");
        withdrawHandler = _withdrawHandler;
        emit LogNewWithdrawHandler(_withdrawHandler);
    }

    function setDepositHandler(address _depositHandler) external onlyOwner {
        require(_depositHandler != address(0), "setDepositHandler: 0x");
        depositHandler = _depositHandler;
        emit LogNewDepositHandler(_depositHandler);
    }

    function stablecoins() external view override returns (address[N_COINS] memory) {
        return underlyingTokens();
    }

    /// @notice Returns amount to skim of larger deposits for alternative vault (Curve)
    function getSkimPercent() external view override returns (uint256) {
        return IInsurance(insurance).calcSkim();
    }

    /// @notice Returns list of all the underling protocol vaults
    function vaults() external view override returns (address[N_COINS] memory) {
        address[N_COINS] memory result;
        for (uint256 i = 0; i < N_COINS; i++) {
            result[i] = underlyingVaults[i];
        }
        return result;
    }

    /// @notice Set system vaults, vault index should match its underlying token
    function setVault(uint256 index, address vault) external onlyOwner {
        require(vault != address(0), "setVault: 0x");
        require(index < N_COINS, "setVault: !index");
        underlyingVaults[index] = vault;
        vaultIndexes[vault] = index + 1;
        emit LogNewVault(index, vault);
    }

    function setCurveVault(address _curveVault) external onlyOwner {
        require(_curveVault != address(0), "setCurveVault: 0x");
        curveVault = _curveVault;
        vaultIndexes[_curveVault] = N_COINS + 1;
        emit LogNewCurveVault(_curveVault);
    }

    function setLifeGuard(address _lifeGuard) external onlyOwner {
        require(_lifeGuard != address(0), "setLifeGuard: 0x");
        lifeGuard = _lifeGuard;
        buoy = ILifeGuard(_lifeGuard).getBuoy();
        emit LogNewLifeguard(_lifeGuard);
    }

    function setInsurance(address _insurance) external onlyOwner {
        require(_insurance != address(0), "setInsurance: 0x");
        insurance = _insurance;
        emit LogNewInsurance(_insurance);
    }

    function setPnL(address _pnl) external onlyOwner {
        require(_pnl != address(0), "setPnl: 0x");
        pnl = _pnl;
        emit LogNewPnl(_pnl);
    }

    function addSafeAddress(address account) external onlyOwner {
        safeAddresses[account] = true;
        emit LogNewSafeAddress(account);
    }

    function switchEoaOnly(bool check) external onlyOwner {
        preventSmartContracts = check;
    }

    /// @notice Set limit for when a deposit will be rerouted for alternative logic
    /// @param _percent %BP limit
    /// @param _absolute Absolute limit
    /// @dev The two limits should be used as an upper and lower bound - the % limit
    ///     considers the current TVL in the token interacted with (gvt or pwrd) and will
    ///     act as the upper bound when the TVL is low. The absolute value will be the lower bound,
    ///     ensuring that small deposits won't suffer higher gas costs.
    function setBigFishThreshold(uint256 _percent, uint256 _absolute) external onlyOwner {
        require(_percent > 0, "_whaleLimit is 0");
        bigFishThreshold = _percent;
        bigFishAbsoluteThreshold = _absolute;
        emit LogNewBigFishThreshold(_percent, _absolute);
    }

    function setReward(address _reward) external onlyOwner {
        require(_reward != address(0), "setReward: 0x");
        reward = _reward;
        emit LogNewRewardsContract(_reward);
    }

    /// @notice Calculate system total assets
    function totalAssets() external view override returns (uint256) {
        return emergencyState ? _totalAssetsEmergency() : _totalAssets();
    }

    /// @notice Calculate pwrd/gro vault total assets
    function gTokenTotalAssets() public view override returns (uint256) {
        (uint256 gvtAssets, uint256 pwrdAssets) = IPnL(pnl).calcPnL();
        if (msg.sender == address(gvt)) {
            return gvtAssets;
        }
        if (msg.sender == address(pwrd)) {
            return pwrdAssets;
        }
        return 0;
    }

    function gToken(bool isPWRD) external view override returns (address) {
        return isPWRD ? address(pwrd) : address(gvt);
    }

    /// @notice Check if the deposit/withdrawal needs to go through alternate logic
    /// @param amount USD amount of deposit/withdrawal
    /// @dev Larger deposits are handled differently than small deposits in order
    ///     to guarantee that the system isn't overexposed to any one stablecoin
    function isBigFish(uint256 amount) external view override returns (bool) {
        (uint256 gvtAssets, uint256 pwrdAssets) = IPnL(pnl).calcPnL();
        uint256 assets = pwrdAssets.add(gvtAssets);
        if (amount < bigFishAbsoluteThreshold) {
            return false;
        } else if (amount > assets) {
            return true;
        } else {
            return amount > assets.mul(bigFishThreshold).div(PERCENTAGE_DECIMAL_FACTOR);
        }
    }

    /// @notice Block if not an EOA or whitelisted
    /// @param sender Address of contract to check
    function eoaOnly(address sender) public override {
        if (preventSmartContracts && !safeAddresses[tx.origin]) {
            require(sender == tx.origin, "EOA only");
        }
    }

    /// @notice TotalAssets = lifeguard + stablecoin vaults + LP vault
    function _totalAssets() private view returns (uint256) {
        require(IBuoy(buoy).safetyCheck(), "!buoy.safetyCheck");
        uint256[N_COINS] memory lgAssets = ILifeGuard(lifeGuard).getAssets();
        uint256[N_COINS] memory vaultAssets;
        for (uint256 i = 0; i < N_COINS; i++) {
            vaultAssets[i] = lgAssets[i].add(IVault(underlyingVaults[i]).totalAssets());
        }
        uint256 totalLp = IVault(curveVault).totalAssets();
        totalLp = totalLp.add(IBuoy(buoy).stableToLp(vaultAssets, true));
        uint256 vp = IBuoy(buoy).getVirtualPrice();

        return totalLp.mul(vp).div(DEFAULT_DECIMALS_FACTOR);
    }

    /// @notice Same as _totalAssets function, but excluding curve vault + 1 stablecoin
    ///             and uses chianlink as a price oracle
    function _totalAssetsEmergency() private view returns (uint256) {
        IChainPrice chainPrice = IChainPrice(buoy);
        uint256 total;
        for (uint256 i = 0; i < N_COINS; i++) {
            if (i != deadCoin) {
                address tokenAddress = getToken(i);
                uint256 decimals = getDecimal(i);
                IERC20 token = IERC20(tokenAddress);
                uint256 price = chainPrice.getPriceFeed(i);
                uint256 assets = IVault(underlyingVaults[i]).totalAssets().add(token.balanceOf(lifeGuard));
                assets = assets.mul(price).div(CHAINLINK_PRICE_DECIMAL_FACTOR);
                assets = assets.mul(DEFAULT_DECIMALS_FACTOR).div(decimals);
                total = total.add(assets);
            }
        }
        return total;
    }

    /// @notice Set protocol into emergency mode, disabling the use of a give stablecoin.
    ///             This state assumes:
    ///                 - Stablecoin of excessively of peg
    ///                 - Curve3Pool has failed
    ///             Swapping wil be disabled and the allocation target will be set to
    ///             100 % for the disabled stablecoin, effectively stopping the system from
    ///             returning any to the user. Deposit are disable in this mode.
    /// @param coin Stable coin to disable
    function emergency(uint256 coin) external onlyWhitelist {
        require(coin < N_COINS, "invalid coin");
        if (!paused()) {
            _pause();
        }
        deadCoin = coin;
        emergencyState = true;

        uint256 percent;
        for (uint256 i; i < N_COINS; i++) {
            if (i == coin) {
                percent = 10000;
            } else {
                percent = 0;
            }
            IInsurance(insurance).setUnderlyingTokenPercent(i, percent);
        }
        IPnL(pnl).emergencyPnL();
    }

    /// @notice Recover the system after emergency mode -
    /// @param allocations New system target allocations
    /// @dev Will recalculate system assets and atempt to give back any
    ///     recovered assets to the GVT side
    function restart(uint256[] calldata allocations) external onlyOwner whenPaused {
        _unpause();
        deadCoin = 99;
        emergencyState = false;

        for (uint256 i; i < N_COINS; i++) {
            IInsurance(insurance).setUnderlyingTokenPercent(i, allocations[i]);
        }
        IPnL(pnl).recover();
    }

    /// @notice Distribute any gains or losses generated from a harvest
    /// @param gain harvset gains
    /// @param loss harvest losses
    function distributeStrategyGainLoss(uint256 gain, uint256 loss) external override {
        uint256 index = vaultIndexes[msg.sender];
        require(index > 0 || index <= N_COINS + 1, "!VaultAdaptor");
        IPnL ipnl = IPnL(pnl);
        IBuoy ibuoy = IBuoy(buoy);
        uint256 gainUsd;
        uint256 lossUsd;
        index = index - 1;
        if (index < N_COINS) {
            if (gain > 0) {
                gainUsd = ibuoy.singleStableToUsd(gain, index);
            } else if (loss > 0) {
                lossUsd = ibuoy.singleStableToUsd(loss, index);
            }
        } else {
            if (gain > 0) {
                gainUsd = ibuoy.lpToUsd(gain);
            } else if (loss > 0) {
                lossUsd = ibuoy.lpToUsd(loss);
            }
        }
        ipnl.distributeStrategyGainLoss(gainUsd, lossUsd);
        // Check if curve spot price within tollerance, if so update them
        if (ibuoy.updateRatios()) {
            // If the curve ratios were successfully updated, realize system price changes
            ipnl.distributePriceChange(_totalAssets());
        }
    }

    /// @notice Distribute holder bonus after withdrawal,
    /// @param bonus amount to distribute
    function distributeHodlerBonus(uint256 bonus) external override {
        require(IWithdrawHandler(withdrawHandler).validHandler(msg.sender), "!WithdrawHandler");
        IPnL(pnl).distributeHodlerBonus(bonus);
    }
}
