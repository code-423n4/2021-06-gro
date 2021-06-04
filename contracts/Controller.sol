// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import {FixedStablecoins, FixedGTokens} from "./common/FixedContracts.sol";
import "./common/Whitelist.sol";
import "./interfaces/IBuoy.sol";
import "./interfaces/IController.sol";
import "./interfaces/IERC20Detailed.sol";
import "./interfaces/IInsurance.sol";
import "./interfaces/ILifeGuard.sol";
import "./interfaces/IPnL.sol";
import "./interfaces/IToken.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IChainPrice.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice The main hub for Gro protocol - the controller links up the other contracts,
///     and acts a route for the other contracts to call one another.
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
        underlyingVaults[index] = vault;
        emit LogNewVault(index, vault);
    }

    function setCurveVault(address _curveVault) external onlyOwner {
        require(_curveVault != address(0), "setCurveVault: 0x");
        curveVault = _curveVault;
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

    function eoaOnly(address sender) public override {
        if (preventSmartContracts && !safeAddresses[tx.origin]) {
            require(sender == tx.origin, "EOA only");
        }
    }

    /// @notice TotalAssets = lifeguard + stablecoin vaults + LP vault
    function _totalAssets() private view returns (uint256) {
        uint256 total = ILifeGuard(lifeGuard).totalAssetsUsd();
        total = total.add(IBuoy(buoy).lpToUsd(IVault(curveVault).totalAssets()));
        uint256[N_COINS] memory vaultAssets;
        for (uint256 i = 0; i < N_COINS; i++) {
            vaultAssets[i] = IVault(underlyingVaults[i]).totalAssets();
        }
        total = total.add(IBuoy(buoy).stableToUsd(vaultAssets, true));

        return total;
    }

    function _totalAssetsEmergency() private view returns (uint256) {
        IChainPrice chainPrice = IBuoy(buoy).chainOracle();
        uint256 total;
        for (uint256 i = 0; i < N_COINS; i++) {
            if (i != deadCoin) {
                address tokenAddress = getToken(i);
                uint256 decimals = getDecimal(i);
                IERC20 token = IERC20(tokenAddress);
                uint256 price = chainPrice.getPriceFeed(tokenAddress);
                uint256 assets =
                    IVault(underlyingVaults[i]).totalAssets().add(token.balanceOf(lifeGuard));
                assets = assets.mul(price).div(CHAINLINK_PRICE_DECIMAL_FACTOR);
                assets = assets.mul(DEFAULT_DECIMALS_FACTOR.div(decimals));
                total = total.add(assets);
            }
        }

        return total;
    }

    function emergency(uint256 coin) external onlyWhitelist {
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

    function restart(uint256[] calldata allocations) external onlyOwner whenPaused {
        _unpause();
        deadCoin = 99;
        emergencyState = false;

        for (uint256 i; i < N_COINS; i++) {
            IInsurance(insurance).setUnderlyingTokenPercent(i, allocations[i]);
        }
        IPnL(pnl).recover();
    }
}
