// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IPnL.sol";
import "../common/Controllable.sol";
import "../common/Whitelist.sol";
import "../interfaces/IPnL.sol";
import "../interfaces/ILifeGuard.sol";
import "../interfaces/IBuoy.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IToken.sol";
import "../common/Constants.sol";
import {FixedGTokens} from "../common/FixedContracts.sol";

/// @notice Contract for calculating protocol profit and loss. The PnL contract stores snapshots
///     of total assets in pwrd and gvt, which are used to calculate utilisation ratio and establish
///     changes in underling pwrd and gvt factors. The protocol will allow these values to drift as long
///     as they stay within a certain threshold of protocol actuals, or large amounts of assets are being
///     deposited or withdrawn from the protocol. The PnL contract ensures that any profits are distributed
///     between pwrd and gvt based on the utilisation ratio - as this ratio movese towards 1, a larger
///     amount of the pwrd profit is shifted to gvt. Protocol losses are on the other hand soaked up
///     by gvt, ensuring that pwrd never lose value.
///
///     ###############################################
///     PnL variables and calculations
///     ###############################################
///
///     yield - system gains and losses from assets invested into strategies are realised once
///         a vault has gained/lost a set amount of assets (gain/lossPercentThreshold). This
///         will prompt the pnlTrigger to return true and signal that the PnL should be calculated.
///         Yield is ditributed to pwrd and gvt based on the utilisation ratio of the
///         two tokens (see _calcProfit).
///
///     PerformanceFee - The performance fee is deducted from any yield profits, and is used to
///         buy back and distribute governance tokens to users.
///
///     hodler Fee - Withdrawals experience a hodler fee that is socialized to all other holders.
///         Like other gains, this isn't realised on withdrawal, but rather when a critical amount
///         has amassed in the system (totalAssetsPercentThreshold).
///
///     ###############################################
///     PnL Actions
///     ###############################################
///
///     Pnl has two trigger mechanisms:
///         - The primary are large movers (whale deposit/withdrawals),
///         any large actions will force update the systems current assets before executing.
///         This will prevent any front-running opportunities.
///         - The secondary relies on external calls - Any whitelisted account can call and update
///         the system through the PnL contract. A PnL trigger function exists to help establish,
///         when the update needs to be called.
contract PnL is Controllable, Constants, Whitelist, FixedGTokens, IPnL {
    using SafeMath for uint256;

    uint256 public override lastGvtAssets;
    uint256 public override lastPwrdAssets;
    uint256 public withdrawalBonus;
    bool public rebase = true;

    uint256 public lossPercentThreshold; // How much loss to tolerate before updating
    uint256 public gainPercentThreshold; // How much gain to tolerate before updating
    uint256 public totalAssetsPercentThreshold; // How large a change in total assets to tolerate before updating
    uint256 public performanceFee; // Amount of gains to use to buy back and distribute gov tokens

    event LogNewLossThreshold(uint256 threshold);
    event LogNewGainThreshold(uint256 threshold);
    event LogRebaseSwitch(bool status);
    event LogNewTotalChangeThreshold(uint256 threshold);
    event LogNewPerfromanceFee(uint256 fee);
    event LogNewGtokenChange(bool pwrd, int256 change);
    event LogPnLExecution(
        uint256 deductedAssets,
        int256 totalPnL,
        int256 investPnL,
        int256 pricePnL,
        uint256 withdrawalBonus,
        uint256 performanceBonus,
        uint256 beforeGvtAssets,
        uint256 beforePwrdAssets,
        uint256 afterGvtAssets,
        uint256 afterPwrdAssets
    );

    struct PnLState {
        int256 totalPnL;
        int256 investPnL;
        int256 pricePnL;
        uint256 gvtAssets;
        uint256 pwrdAssets;
        uint256 withdrawalBonus;
        uint256 performanceBonus;
        uint256 lastGvtAssets;
        uint256 lastPwrdAssets;
    }

    constructor(address pwrd, address gvt) public FixedGTokens(pwrd, gvt) {}

    /// @notice Set loss threshold, pnlTrigger method will return true if loss > lossThreshold
    /// @param _lossPercentThreshold The loss threshold to execute PnL
    function setLossPercentThreshold(uint256 _lossPercentThreshold) external onlyOwner {
        lossPercentThreshold = _lossPercentThreshold;
        emit LogNewLossThreshold(_lossPercentThreshold);
    }

    /// @notice Set gain threshold, pnlTrigger method will return true if gain > gainThreshold
    /// @param _gainPercentThreshold The gain threshold to execute PnL
    function setGainPercentThreshold(uint256 _gainPercentThreshold) external onlyOwner {
        gainPercentThreshold = _gainPercentThreshold;
        emit LogNewGainThreshold(_gainPercentThreshold);
    }

    /// @notice Turn pwrd rebasing on/off - This stops yield/ hodler bonuses to be distributed to the pwrd
    ///     token, which effectively stops it from rebasing any further.
    function setRebase(bool _rebase) external onlyOwner {
        rebase = _rebase;
        emit LogRebaseSwitch(_rebase);
    }

    /// @notice Set threshold for change in total underlying value, totalAssetsChangeTrigger method
    ///     will return true if totalchange > Threshold
    /// @param _totalAssetsPercentThreshold The threshold to execute PnL
    function setTotalAssetsPercentThreshold(uint256 _totalAssetsPercentThreshold)
        external
        onlyOwner
    {
        totalAssetsPercentThreshold = _totalAssetsPercentThreshold;
        emit LogNewTotalChangeThreshold(_totalAssetsPercentThreshold);
    }

    /// @notice Fee taken from gains to be redistributed to users who stake their tokens
    /// @param _performanceFee Amount to remove from gains (%BP)
    function setPerformanceFee(uint256 _performanceFee) external onlyOwner {
        performanceFee = _performanceFee;
        emit LogNewPerfromanceFee(_performanceFee);
    }

    function increaseWithdrawalBonus(uint256 newBonus) external override onlyWhitelist {
        withdrawalBonus = withdrawalBonus.add(newBonus);
    }

    /// @notice Calculate profit and loss
    /// @dev This function is used by the controller to control for deposits and
    ///     withdrawals when calculating PnL
    /// @param deductedAssets Assets to remove from profit and loss calculations
    function execPnL(uint256 deductedAssets) public override onlyWhitelist {
        PnLState memory pnlState =
            _controller().emergencyState() ? _execPnLEmergency() : _execPnL(deductedAssets);
        emit LogPnLExecution(
            deductedAssets,
            pnlState.totalPnL,
            pnlState.investPnL,
            pnlState.pricePnL,
            pnlState.withdrawalBonus,
            pnlState.performanceBonus,
            pnlState.lastGvtAssets,
            pnlState.lastPwrdAssets,
            pnlState.gvtAssets,
            pnlState.pwrdAssets
        );
    }

    /// @notice Increase previously recorded GToken assets by specific amount
    /// @param gTokenAddress Gvt/pwrd address
    /// @param dollarAmount Amount to increase by
    function increaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount)
        external
        override
        onlyWhitelist
    {
        bool _pwrd;
        if (gTokenAddress == address(gvt)) {
            lastGvtAssets = lastGvtAssets.add(dollarAmount);
        }
        if (gTokenAddress == address(pwrd)) {
            lastPwrdAssets = lastPwrdAssets.add(dollarAmount);
            _pwrd = true;
        }
        emit LogNewGtokenChange(_pwrd, int256(dollarAmount));
    }

    /// @notice Decrease previously recorded GToken assets by specific amount
    /// @param gTokenAddress Gvt/pwrd address
    /// @param dollarAmount Amount to decrease by
    function decreaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount)
        external
        override
        onlyWhitelist
    {
        bool _pwrd;
        if (gTokenAddress == address(gvt)) {
            lastGvtAssets = dollarAmount > lastGvtAssets ? 0 : lastGvtAssets.sub(dollarAmount);
        }
        if (gTokenAddress == address(pwrd)) {
            lastPwrdAssets = dollarAmount > lastPwrdAssets ? 0 : lastPwrdAssets.sub(dollarAmount);
            _pwrd = true;
        }
        emit LogNewGtokenChange(_pwrd, int256(-dollarAmount));
    }

    /// @notice Return latest system asset states
    function calcPnL() external view override returns (uint256, uint256) {
        return (lastGvtAssets, lastPwrdAssets);
    }

    /// @notice Check if gains/losses in vaults are large enough to warrant running PnL
    function pnlTrigger() external view override returns (bool) {
        uint256 lastTotalAssets = lastGvtAssets.add(lastPwrdAssets);
        (uint256 gain, uint256 loss, ) = _getInvestPnL();
        return
            loss > lastTotalAssets.mul(lossPercentThreshold).div(PERCENTAGE_DECIMAL_FACTOR) ||
            gain > lastTotalAssets.mul(gainPercentThreshold).div(PERCENTAGE_DECIMAL_FACTOR);
    }

    /// @notice Assess if the system TVL has changed enough to warrant running PnL
    function totalAssetsChangeTrigger() external view returns (bool) {
        uint256 lastTotalAssets = lastGvtAssets.add(lastPwrdAssets);
        uint256 totalAssets = _controller().totalAssets();
        if (totalAssets > lastTotalAssets) {
            return
                totalAssets.sub(lastTotalAssets) >
                lastTotalAssets.mul(totalAssetsPercentThreshold).div(PERCENTAGE_DECIMAL_FACTOR);
        } else {
            return
                lastTotalAssets.sub(totalAssets) >
                lastTotalAssets.mul(totalAssetsPercentThreshold).div(PERCENTAGE_DECIMAL_FACTOR);
        }
    }

    /// @notice Calculate utilisation ratio between gvt and pwrd
    function utilisationRatio() external view override returns (uint256) {
        return
            lastGvtAssets != 0
                ? lastPwrdAssets.mul(PERCENTAGE_DECIMAL_FACTOR).div(lastGvtAssets)
                : 0;
    }

    function emergencyPnL() external override {
        require(msg.sender == controller, "emergencyPnL: !controller");
        forceDistribute();
        withdrawalBonus = 0;
    }

    function recover() external override {
        require(msg.sender == controller, "recover: !controller");
        forceDistribute();
        withdrawalBonus = 0;
    }

    /// @notice Execute profit and loss
    /// @param deductedAssets Amount of assets to remove from calculation
    function _execPnL(uint256 deductedAssets) private returns (PnLState memory result) {
        IController ctrl = _controller();

        result.lastGvtAssets = lastGvtAssets;
        result.lastPwrdAssets = lastPwrdAssets;
        uint256 lastTotalAssets = result.lastGvtAssets.add(result.lastPwrdAssets);
        uint256 currentTotalAssets = ctrl.totalAssets().sub(deductedAssets);
        result.totalPnL = int256(currentTotalAssets) - int256(lastTotalAssets);

        // Calculate invest proft and loss
        (, , result.investPnL) = _getInvestPnL();
        result.withdrawalBonus = withdrawalBonus;
        result.pricePnL = result.totalPnL - result.investPnL - int256(result.withdrawalBonus);

        int256 investPnL = result.investPnL;
        address reward = ctrl.reward();
        if (result.investPnL > 0 && performanceFee > 0 && reward != address(0)) {
            result.performanceBonus = uint256(investPnL).mul(performanceFee).div(
                PERCENTAGE_DECIMAL_FACTOR
            );
            investPnL = investPnL - int256(result.performanceBonus);
        }

        result.gvtAssets = result.lastGvtAssets;
        result.pwrdAssets = result.lastPwrdAssets;

        // Handle invest pnl
        if (investPnL > 0) {
            result = _calcInvestProfit(result, uint256(investPnL));
        } else if (investPnL < 0) {
            result = _calcLoss(result, uint256(-investPnL));
        }

        // Handle withdrawal bonus
        if (rebase) {
            result.gvtAssets = result.gvtAssets.add(
                result.withdrawalBonus.mul(result.lastGvtAssets).div(lastTotalAssets)
            );
            result.pwrdAssets = result.pwrdAssets.add(
                result.withdrawalBonus.mul(result.lastPwrdAssets).div(lastTotalAssets)
            );
        } else {
            result.gvtAssets = result.gvtAssets.add(result.withdrawalBonus);
        }
        withdrawalBonus = 0;

        // Handle price pnl
        if (result.pricePnL > 0) {
            result.gvtAssets = result.gvtAssets.add(uint256(result.pricePnL));
        } else if (result.pricePnL < 0) {
            result = _calcLoss(result, uint256(-result.pricePnL));
        }

        // Handle performance bonus
        if (result.performanceBonus > 0) {
            gvt.mint(reward, gvt.factor(result.gvtAssets), result.performanceBonus);
            result.gvtAssets = result.gvtAssets.add(result.performanceBonus);
        }

        lastGvtAssets = result.gvtAssets;
        lastPwrdAssets = result.pwrdAssets;

        address[N_COINS] memory vaults = ctrl.vaults();
        /// Update vault current assets
        for (uint256 i = 0; i < N_COINS; i++) {
            IVault(vaults[i]).execPnL();
        }
        IVault(ctrl.curveVault()).execPnL();
    }

    function _execPnLEmergency() private returns (PnLState memory result) {
        result.lastGvtAssets = lastGvtAssets;
        result.lastPwrdAssets = lastPwrdAssets;
        uint256 lastTotalAssets = result.lastGvtAssets.add(result.lastPwrdAssets);
        uint256 currentTotalAssets = _controller().totalAssets();
        result.totalPnL = int256(currentTotalAssets) - int256(lastTotalAssets);

        result.withdrawalBonus = withdrawalBonus;
        result.pricePnL = result.totalPnL - int256(result.withdrawalBonus);

        result.gvtAssets = result.lastGvtAssets;
        result.pwrdAssets = result.lastPwrdAssets;

        // Handle withdrawal bonus
        if (rebase) {
            result.gvtAssets = result.gvtAssets.add(
                result.withdrawalBonus.mul(result.lastGvtAssets).div(lastTotalAssets)
            );
            result.pwrdAssets = result.pwrdAssets.add(
                result.withdrawalBonus.mul(result.lastPwrdAssets).div(lastTotalAssets)
            );
        } else {
            result.gvtAssets = result.gvtAssets.add(result.withdrawalBonus);
        }
        withdrawalBonus = 0;

        // Handle price pnl
        if (result.pricePnL > 0) {
            result.gvtAssets = result.gvtAssets.add(uint256(result.pricePnL));
        } else if (result.pricePnL < 0) {
            result = _calcLoss(result, uint256(-result.pricePnL));
        }

        lastGvtAssets = result.gvtAssets;
        lastPwrdAssets = result.pwrdAssets;
    }

    /// @notice Calculate system profit and loss
    function _getInvestPnL()
        private
        view
        returns (
            uint256 investGain,
            uint256 investLoss,
            int256 investPnL
        )
    {
        IController controller = _controller();
        address[N_COINS] memory vaults = controller.vaults();
        uint256[N_COINS] memory gains;
        uint256[N_COINS] memory losses;
        uint256 curveGains;
        uint256 curveLosses;

        uint256 profit = 0;
        uint256 loss = 0;
        for (uint256 i = 0; i < N_COINS; i++) {
            (gains[i], losses[i]) = IVault(vaults[i]).calcPnL();
        }
        // Curve gains/losses calculated speretaly...
        (curveGains, curveLosses) = IVault(controller.curveVault()).calcPnL();

        ILifeGuard lg = ILifeGuard(controller.lifeGuard());
        IBuoy buoy = IBuoy(lg.getBuoy());
        profit = buoy.stableToUsd(gains, true);
        loss = buoy.stableToUsd(losses, true);

        // ...and added to total profit/loss
        if (curveGains > 0) {
            profit = profit.add(
                curveGains.mul(buoy.getVirtualPrice()).div(DEFAULT_DECIMALS_FACTOR)
            );
        } else if (curveLosses > 0) {
            loss = loss.add(curveLosses.mul(buoy.getVirtualPrice()).div(DEFAULT_DECIMALS_FACTOR));
        }
        if (profit > loss) {
            investGain = profit - loss;
        } else if (profit < loss) {
            investLoss = loss - profit;
        }
        investPnL = int256(profit) - int256(loss);
    }

    /// @notice Calculate profit distribution between gvt and pwrd
    /// @param profit Protocol profit
    function _calcInvestProfit(PnLState memory pnlState, uint256 profit)
        private
        view
        returns (PnLState memory)
    {
        if (rebase) {
            uint256 lastTotalAssets = pnlState.lastPwrdAssets.add(pnlState.lastGvtAssets);
            uint256 ldProfit = profit.mul(pnlState.lastGvtAssets).div(lastTotalAssets);
            uint256 pwrdProfit = profit.mul(pnlState.lastPwrdAssets).div(lastTotalAssets);

            uint256 factor = pnlState.lastPwrdAssets.mul(10000).div(pnlState.lastGvtAssets);
            if (factor > 10000) factor = 10000;
            if (factor < 8000) {
                factor = factor.mul(3).div(8).add(3000);
            } else {
                factor = factor.sub(8000).mul(2).add(6000);
            }

            uint256 portionFromPwrdProfit = pwrdProfit.mul(factor).div(10000);
            pnlState.gvtAssets = pnlState.gvtAssets.add(ldProfit.add(portionFromPwrdProfit));
            pnlState.pwrdAssets = pnlState.pwrdAssets.add(pwrdProfit.sub(portionFromPwrdProfit));
        } else {
            pnlState.gvtAssets = pnlState.gvtAssets.add(profit);
        }
        return pnlState;
    }

    /// @notice Protocol loss handling
    /// @param loss Protocol loss
    function _calcLoss(PnLState memory pnlState, uint256 loss)
        private
        pure
        returns (PnLState memory)
    {
        uint256 maxGvtLoss = pnlState.gvtAssets.sub(DEFAULT_DECIMALS_FACTOR);
        if (loss > maxGvtLoss) {
            pnlState.gvtAssets = DEFAULT_DECIMALS_FACTOR;
            pnlState.pwrdAssets = pnlState.pwrdAssets.sub(loss.sub(maxGvtLoss));
        } else {
            pnlState.gvtAssets = pnlState.gvtAssets - loss;
        }
        return pnlState;
    }

    function forceDistribute() private {
        uint256 total = _controller().totalAssets();

        if (total > lastPwrdAssets.add(DEFAULT_DECIMALS_FACTOR)) {
            lastGvtAssets = total - lastPwrdAssets;
        } else {
            lastGvtAssets = DEFAULT_DECIMALS_FACTOR;
            lastPwrdAssets = total.sub(DEFAULT_DECIMALS_FACTOR);
        }
    }
}
