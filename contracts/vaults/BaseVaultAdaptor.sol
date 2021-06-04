// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "contracts/vaults/yearnv2/v032/IYearnV2Vault.sol";
import "../common/Controllable.sol";
import "../common/Whitelist.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IController.sol";
import "../interfaces/IInsurance.sol";
import "../common/Constants.sol";
import "../interfaces/IERC20Detailed.sol";

/// @notice Base contract for gro protocol vault adaptors - Vault adaptors act as a
///     layer between the protocol and any yield aggregator vault. They provides additional
///     functionality needed by the protocol, and allow the protocol to be agnostic
///     to the type of underlying vault it interacts with.
///
///     ###############################################
///     Base Vault Adaptor specifications
///     ###############################################
///
///     Any deposit/withdrawal into the system will always attempt to interact with the
///     appropriate vault adaptor (depending on token).
///     - Deposit: A deposit will move assets into the vault adaptor, which will be
///         available for investment into the underlying vault once a large enough amount
///         of assets has amassed in the vault adaptor.
///     - Withdrawal: A withdrawal will always attempt to pull from the vaultAdaptor if possible,
///         if the assets in the adaptor fail to cover the withdrawal, the adaptor will
///         attempt to withdraw assets from the underlying vaults strategies. The latter will
///         also depend on whether pwrd or gvt is being withdrawn, as strategy assets affect
///         system exposure levels.
///     - Invest: Once a significant amount of assets have amassed in the vault adaptor, the
///         invest trigger will signal that the adaptor is ready to invest assets. The adaptor
///         always aims to hold a percent of total assets as univested assets (vaultReserve).
///         This allows for smaller withdrawals to be cheaper as they dont have to interact with
///         the underlying strategies.
///     - Debt ratios: Ratio in %BP of assets to invest in the underlying strategies of a vault
abstract contract BaseVaultAdaptor is Controllable, Constants, Whitelist, IVault {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 constant MAX_STRATS = 20;

    // Underlying token
    address public immutable override token;
    uint256 public immutable decimals;
    // Underlying vault
    address public immutable override vault;
    // Number of strategies
    uint256 public strategiesLength;
    // Used to determine if its OK to invest assets to underlying vault
    uint256 public investThreshold;
    // Used to establish if the strategy debt ratios need to be updated
    uint256 public strategyRatioBuffer;
    // Last total amount of assets recorded (vault adaptor + vault + strategies)
    uint256 public lastTotalAssets;
    // How much of total assets should be held in the vault adaptor (%BP)
    uint256 public vaultReserve;

    event LogAdaptorToken(address token);
    event LogAdaptorVault(address vault);
    event LogAdaptorReserve(uint256 reserve);
    event LogAdaptorStrategies(uint256 length);
    event LogNewAdaptorInvestThreshold(uint256 threshold);
    event LogNewAdaptorStrategyBuffer(uint256 buffer);
    event LogNewDebtRatios(uint256[] strategyRetios);

    /// @notice Only the underlying vault is allowed to call
    modifier onlyVault() {
        require(msg.sender == vault);
        _;
    }

    constructor(address _vault, address _token) public {
        vault = _vault;
        token = _token;
        decimals = IERC20Detailed(_token).decimals();
        IERC20(_token).safeApprove(address(_vault), 0);
        IERC20(_token).safeApprove(address(_vault), type(uint256).max);
    }

    function setVaultReserve(uint256 reserve) external onlyOwner {
        require(reserve <= PERCENTAGE_DECIMAL_FACTOR);
        vaultReserve = reserve;
        emit LogAdaptorReserve(reserve);
    }

    function setStrategiesLength(uint256 _strategiesLength) external onlyOwner {
        strategiesLength = _strategiesLength;
        emit LogAdaptorStrategies(_strategiesLength);
    }

    function setInvestThreshold(uint256 _investThreshold) external onlyOwner {
        investThreshold = _investThreshold;
        emit LogNewAdaptorInvestThreshold(_investThreshold);
    }

    function setStrategyRatioBuffer(uint256 _strategyRatioBuffer) external onlyOwner {
        strategyRatioBuffer = _strategyRatioBuffer;
        emit LogNewAdaptorStrategyBuffer(_strategyRatioBuffer);
    }

    /// @notice Determine if assets should be moved from the vault adaptors into the underlying vault
    function investTrigger() external view override returns (bool) {
        uint256 vaultHold = _totalAssets().mul(vaultReserve).div(PERCENTAGE_DECIMAL_FACTOR);
        uint256 _investThreshold = investThreshold.mul(uint256(10)**decimals);
        uint256 balance = IERC20(token).balanceOf(address(this));

        if (balance < _investThreshold) {
            return false;
        } else if (balance.sub(_investThreshold) > vaultHold) {
            return true;
        } else {
            return false;
        }
    }

    /// @notice Move assets from vault adaptor into the underlying vault
    function invest() external override onlyWhitelist {
        uint256 vaultHold = _totalAssets().mul(vaultReserve).div(PERCENTAGE_DECIMAL_FACTOR);
        uint256 _investThreshold = investThreshold.mul(uint256(10)**decimals);
        uint256 balance = IERC20(token).balanceOf(address(this));

        if (balance <= vaultHold) return;

        if (balance.sub(vaultHold) > _investThreshold) {
            depositToUnderlyingVault(balance.sub(vaultHold));
        }

        // Check and update strategies debt ratio
        if (strategiesLength > 1) {
            // Only for stablecoin vaults
            uint256[] memory targetRatios =
                IInsurance(_controller().insurance()).getStrategiesTargetRatio();
            uint256[] memory currentRatios = getStrategiesDebtRatio();
            bool update;
            for (uint256 i; i < strategiesLength; i++) {
                if (
                    currentRatios[i] < targetRatios[i] &&
                    targetRatios[i].sub(currentRatios[i]) > strategyRatioBuffer
                ) {
                    update = true;
                    break;
                }

                if (
                    currentRatios[i] > targetRatios[i] &&
                    currentRatios[i].sub(targetRatios[i]) > strategyRatioBuffer
                ) {
                    update = true;
                    break;
                }
            }
            if (update) {
                updateStrategiesDebtRatio(targetRatios);
            }
        }
    }

    /// @notice Calculate system total assets
    function totalAssets() external view override returns (uint256) {
        return _totalAssets();
    }

    /// @notice Get number of strategies in underlying vault
    function getStrategiesLength() external view override returns (uint256) {
        return strategiesLength;
    }

    /// @notice Withdraw assets from underlying vault
    /// @param amount Amount to withdraw
    /// @dev Sends assets to msg.sender
    function withdraw(uint256 amount) external override onlyWhitelist {
        withdraw(amount, msg.sender);
    }

    /// @notice Withdraw assets from underlying vault
    /// @param amount Amount to withdraw
    /// @param recipient Target recipient
    /// @dev Will try to pull assets from adaptor before moving on to pull
    ///     assets from unerlying vault/strategies
    function withdraw(uint256 amount, address recipient) public override onlyWhitelist {
        if (!_withdrawFromAdapter(amount, recipient)) {
            amount = _withdraw(calculateShare(amount), recipient);
        }
        lastTotalAssets = lastTotalAssets < amount ? 0 : lastTotalAssets.sub(amount);
    }

    /// @notice Withdraw assets from vault to vault adaptor
    /// @param amount Amount to withdraw
    function withdrawToAdapter(uint256 amount) external onlyWhitelist {
        amount = _withdraw(calculateShare(amount), address(this));
    }

    /// @notice Withdraw assets from underlying vault, but do so in a specific strategy order
    /// @param amount Amount to withdraw
    /// @param recipient Target recipient
    /// @param reversed reverse strategy order
    /// @dev This is an addaptation for yearn v2 vaults - these vaults have a defined withdraw
    ///     order. Gro protocol needs to respect prtocol exposure, and thus might have to withdraw
    ///     from different strategies depending on if pwrd or gvts are withdrawn.
    function withdrawByStrategyOrder(
        uint256 amount,
        address recipient,
        bool reversed
    ) external override onlyWhitelist {
        if (!_withdrawFromAdapter(amount, recipient)) {
            amount = _withdrawByStrategyOrder(calculateShare(amount), recipient, reversed);
        }
        lastTotalAssets = lastTotalAssets < amount ? 0 : lastTotalAssets.sub(amount);
    }

    /// @notice Withdraw assets from underlying vault, but do so from a specific strategy
    /// @param amount Amount to withdraw
    /// @param recipient Target recipient
    /// @param strategyIndex Index of target strategy
    /// @dev Same as for withdrawByStrategyOrder, but now we withdraw from a specific strategy.
    ///     This functionality exists to be able to move assets from overExposed strategies.
    function withdrawByStrategyIndex(
        uint256 amount,
        address recipient,
        uint256 strategyIndex
    ) external override onlyWhitelist {
        if (!_withdrawFromAdapter(amount, recipient)) {
            amount = _withdrawByStrategyIndex(calculateShare(amount), recipient, strategyIndex);
        }
        lastTotalAssets = lastTotalAssets < amount ? 0 : lastTotalAssets.sub(amount);
    }

    /// @notice Withdraw assets from the vault adaptor itself
    /// @param amount Amount to withdraw
    /// @param recipient Target recipient
    function _withdrawFromAdapter(uint256 amount, address recipient)
        private
        returns (bool _success)
    {
        uint256 adapterAmount = IERC20(token).balanceOf(address(this));
        if (adapterAmount >= amount) {
            IERC20(token).safeTransfer(recipient, amount);
            return true;
        } else {
            return false;
        }
    }

    /// @notice Calculate gains/loss changes in vault adaptor
    function calcPnL() external view override returns (uint256 gain, uint256 loss) {
        // Use totalAsset to ignore unrealised profits
        uint256 currentTotalAssets = _totalAssets();
        gain = currentTotalAssets > lastTotalAssets ? currentTotalAssets.sub(lastTotalAssets) : 0;
        loss = currentTotalAssets < lastTotalAssets ? lastTotalAssets.sub(currentTotalAssets) : 0;
    }

    /// @notice Update current total assets, disregarding unraalized profits/losses
    function execPnL() external override onlyWhitelist {
        lastTotalAssets = _totalAssets();
    }

    /// @notice Get total amount invested in strategy
    /// @param index Index of strategy
    function getStrategyAssets(uint256 index) external view override returns (uint256 amount) {
        return getStrategyTotalAssets(index);
    }

    /// @notice Deposit assets into the vault adaptor
    /// @param amount Deposit amount
    function deposit(uint256 amount) external override onlyWhitelist {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        depositWithPnL(amount);
    }

    /// @notice Update vault adapter total assets
    /// @param amount Amount to add to total assets
    function updatePnL(uint256 amount) external override onlyWhitelist {
        depositWithPnL(amount);
    }

    /// @notice Set new strategy debt ratios
    /// @param strategyRetios Array of new debt ratios
    function updateStrategyRatio(uint256[] calldata strategyRetios)
        external
        override
        onlyWhitelist
    {
        updateStrategiesDebtRatio(strategyRetios);
        emit LogNewDebtRatios(strategyRetios);
    }

    /// @notice Check if underlying strategy needs to be harvested
    /// @param index Index of stratey
    /// @param callCost Cost of harvest
    function strategyHarvestTrigger(uint256 index, uint256 callCost)
        external
        view
        override
        onlyWhitelist
        returns (bool harvested)
    {
        require(index < strategiesLength, "invalid index");
        return _strategyHarvestTrigger(index, callCost);
    }

    /// @notice Harvest underlying strategy
    /// @param index Index of strategy
    /// @param callCost Cost of harvest
    function strategyHarvest(uint256 index, uint256 callCost)
        external
        override
        onlyWhitelist
        returns (bool harvested)
    {
        require(index < strategiesLength, "invalid index");
        if (_strategyHarvestTrigger(index, callCost)) {
            _strategyHarvest(index);
            harvested = true;
        }
    }

    // Virtual functions
    function _strategyHarvest(uint256 index) internal virtual;

    function updateStrategiesDebtRatio(uint256[] memory ratios) internal virtual;

    function getStrategiesDebtRatio() internal view virtual returns (uint256[] memory);

    /// @notice Deposit from vault adaptors to underlying vaults
    function depositToUnderlyingVault(uint256 amount) internal virtual;

    function _withdraw(uint256 share, address recipient) internal virtual returns (uint256);

    function _withdrawByStrategyOrder(
        uint256 share,
        address recipient,
        bool reversed
    ) internal virtual returns (uint256);

    function _withdrawByStrategyIndex(
        uint256 share,
        address recipient,
        uint256 index
    ) internal virtual returns (uint256);

    function _strategyHarvestTrigger(uint256 index, uint256 callCost)
        internal
        view
        virtual
        returns (bool);

    function getStrategyEstimatedTotalAssets(uint256 index)
        internal
        view
        virtual
        returns (uint256);

    function getStrategyTotalAssets(uint256 index) internal view virtual returns (uint256);

    function vaultTotalAssets() internal view virtual returns (uint256);

    function _totalAssets() internal view returns (uint256) {
        uint256 total = IERC20(token).balanceOf(address(this)).add(vaultTotalAssets());
        return total;
    }

    function depositWithPnL(uint256 amount) private {
        lastTotalAssets = lastTotalAssets.add(amount);
    }

    function calculateShare(uint256 amount) private view returns (uint256 share) {
        uint256 sharePrice = _getVaultSharePrice();
        share = amount.mul(uint256(10)**decimals).div(sharePrice);
        uint256 balance = IERC20(vault).balanceOf(address(this));
        share = share < balance ? share : balance;
    }

    /// @notice Withdraw and update vault adaptor total value
    /// @param amount Total amount to withdraw
    /// @param recipient Recipient of withdrawal
    function withdrawWithPnL(uint256 amount, address recipient) private {
        uint256 withdrawalAmount = _withdraw(calculateShare(amount), recipient);
        lastTotalAssets = lastTotalAssets < withdrawalAmount
            ? 0
            : lastTotalAssets.sub(withdrawalAmount);
    }

    /// @notice Calculate system total assets including estimated profits
    function totalEstimatedAssets() external view returns (uint256) {
        uint256 total =
            IERC20(token).balanceOf(address(this)).add(IERC20(token).balanceOf(address(vault)));
        for (uint256 i = 0; i < strategiesLength; i++) {
            total = total.add(getStrategyEstimatedTotalAssets(i));
        }
        return total;
    }

    function _getVaultSharePrice() internal view virtual returns (uint256);
}
