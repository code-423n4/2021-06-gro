// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import {FixedStablecoins, FixedGTokens, FixedVaults} from "./common/FixedContracts.sol";
import "./common/Controllable.sol";
import "./common/Whitelist.sol";
import "./interfaces/ILifeGuard.sol";
import "./interfaces/IBuoy.sol";
import "./interfaces/IToken.sol";
import "./interfaces/IPnL.sol";
import "./interfaces/IInsurance.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWithdrawHandler.sol";
import "./interfaces/IDepositHandler.sol";
import "./interfaces/IEmergencyHandler.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @notice Entry point for withdrawal call to Gro Protocol - User withdrawals come as
///     either single asset or balanced withdrawals, which match the underling lifeguard Curve pool or our
///     Vault allocations. Like deposits, withdrawals come in three different sizes:
///         1) sardine - the smallest type of withdrawals, deemed to not affect the system exposure, and is
///            withdrawn directly from the vaults - Curve vault is used to price the withdrawal (buoy)
///         2) tuna - mid sized withdrawals, will withdraw from the most overexposed vault and exchange into
///            the desired asset (lifeguard). If the most overexposed asset is withdrawn, no exchange takes
///            place, this minimizes slippage as it doesn't need to perform any exchanges in the Curve pool
///         3) whale - the largest withdrawal - Withdraws from all stablecoin vaults in target deltas,
///            calculated as the difference between target allocations and vaults exposure (insurance). Uses
///            Curve pool to exchange withdrawns assets to desired assets.
contract WithdrawHandler is
    Controllable,
    FixedStablecoins,
    FixedGTokens,
    FixedVaults,
    Whitelist,
    IWithdrawHandler
{
    // Pwrd (true) and gvt (false) mapped to respective withdrawal fee
    mapping(bool => uint256) public override withdrawalFee;
    // Lower bound for how many gvt can be burned before getting to close to the utilisation ratio
    uint256 public override utilisationRatioLimitGvt;
    IEmergencyHandler public immutable EMH;

    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    IController ctrl;
    ILifeGuard lg;
    IBuoy buoy;
    IInsurance insurance;
    IPnL pnl;

    event LogNewWithdrawalFee(address user, bool pwrd, uint256 newFee);
    event LogNewUtilLimit(bool indexed pwrd, uint256 limit);
    event LogNewEmergencyHandler(address EMH);
    event LogNewDependencies(
        address controller,
        address lifeguard,
        address buoy,
        address insurance
    );
    event LogNewWithdrawal(
        address indexed user,
        address indexed referral,
        bool pwrd,
        bool balanced,
        bool all,
        uint256 deductUsd,
        uint256 returnUsd,
        uint256 lpAmount,
        uint256[N_COINS] tokenAmounts
    );

    // Data structure to hold data for withdrawals
    struct WithdrawParameter {
        address account;
        bool pwrd;
        bool balanced;
        bool all;
        uint256 index;
        uint256[N_COINS] minAmounts;
        uint256 lpAmount;
    }

    constructor(
        address pwrd,
        address gvt,
        address emh,
        address[N_COINS] memory _vaults,
        address[N_COINS] memory _tokens,
        uint256[N_COINS] memory _decimals
    ) public FixedStablecoins(_tokens, _decimals) FixedGTokens(pwrd, gvt) FixedVaults(_vaults) {
        EMH = IEmergencyHandler(emh);
    }

    /// @notice Update protocol dependencies
    function setDependencies() external onlyOwner {
        ctrl = _controller();
        lg = ILifeGuard(ctrl.lifeGuard());
        buoy = IBuoy(lg.getBuoy());
        insurance = IInsurance(ctrl.insurance());
        pnl = IPnL(ctrl.pnl());
        emit LogNewDependencies(address(ctrl), address(lg), address(buoy), address(insurance));
    }

    /// @notice Set withdrawal fee for token
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param newFee New token fee
    function setWithdrawalFee(bool pwrd, uint256 newFee) external onlyOwner {
        withdrawalFee[pwrd] = newFee;
        emit LogNewWithdrawalFee(msg.sender, pwrd, newFee);
    }

    /// @notice Set the lower bound for when to stop accepting gvt withdrawals
    /// @param _utilisationRatioLimitGvt Lower limit for pwrd (%BP)
    function setUtilisationRatioLimitGvt(uint256 _utilisationRatioLimitGvt) external onlyOwner {
        utilisationRatioLimitGvt = _utilisationRatioLimitGvt;
        emit LogNewUtilLimit(false, _utilisationRatioLimitGvt);
    }

    /// @notice Withdrawing by LP tokens will attempt to do a balanced
    ///     withdrawal from the lifeguard - Balanced meaning that the withdrawal
    ///     tries to match the token balances of the underlying Curve pool.
    ///     This is calculated by dividing the individual token balances of
    ///     the pool by the total amount. This should give minimal slippage.
    /// @param pwrd Pwrd or Gvt (pwrd/gvt)
    /// @param lpAmount Amount of LP tokens to burn
    /// @param minAmounts Minimum accepted amount of tokens to get back
    function withdrawByLPToken(
        bool pwrd,
        uint256 lpAmount,
        uint256[N_COINS] calldata minAmounts
    ) external override {
        require(!ctrl.emergencyState(), "withdrawByLPToken: emergencyState");
        WithdrawParameter memory parameters =
            WithdrawParameter(msg.sender, pwrd, true, false, N_COINS, minAmounts, lpAmount);
        _withdraw(parameters);
    }

    /// @notice Withdraws by one token from protocol.
    /// @param pwrd Pwrd or Gvt (pwrd/gvt)
    /// @param index Protocol index of stablecoin
    /// @param lpAmount LP token amount to burn
    /// @param minAmount Minimum amount of tokens to get back
    function withdrawByStablecoin(
        bool pwrd,
        uint256 index,
        uint256 lpAmount,
        uint256 minAmount
    ) external override {
        if (ctrl.emergencyState()) {
            EMH.emergencyWithdrawal(msg.sender, pwrd, lpAmount, minAmount);
        } else {
            require(index < N_COINS, "!withdrawByStablecoin: invalid index");
            uint256[N_COINS] memory minAmounts;
            minAmounts[index] = minAmount;
            WithdrawParameter memory parameters =
                WithdrawParameter(msg.sender, pwrd, false, false, index, minAmounts, lpAmount);
            _withdraw(parameters);
        }
    }

    /// @notice Withdraw all pwrd/gvt for a specifc stablecoin
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param index Protocol index of stablecoin
    /// @param minAmount Minimum amount of returned assets
    function withdrawAllSingle(
        bool pwrd,
        uint256 index,
        uint256 minAmount
    ) external override {
        if (ctrl.emergencyState()) {
            EMH.emergencyWithdrawAll(msg.sender, pwrd, minAmount);
        } else {
            _withdrawAllSingleFromAccount(msg.sender, pwrd, index, minAmount);
        }
    }

    /// @notice Burn a pwrd/gvt for a balanced amount of stablecoin assets
    /// @param pwrd Pwrd or Gvt (pwrd/gvt)
    /// @param minAmounts Minimum amount of returned assets
    function withdrawAllBalanced(bool pwrd, uint256[N_COINS] calldata minAmounts)
        external
        override
        whenNotPaused
    {
        require(!ctrl.emergencyState(), "withdrawByLPToken: emergencyState");
        WithdrawParameter memory parameters =
            WithdrawParameter(msg.sender, pwrd, true, true, N_COINS, minAmounts, 0);
        _withdraw(parameters);
    }

    /// @notice Function to get deltas for balanced withdrawals
    /// @param amount Amount to withdraw (denoted in LP tokens)
    /// @dev This function should be used to determine input values
    ///     when atempting a balanced withdrawal
    function getVaultDeltas(uint256 amount)
        external
        view
        returns (uint256[N_COINS] memory tokenAmounts)
    {
        uint256[N_COINS] memory delta = insurance.getDelta(buoy.lpToUsd(amount));
        for (uint256 i; i < N_COINS; i++) {
            uint256 withdraw = amount.mul(delta[i]).div(PERCENTAGE_DECIMAL_FACTOR);
            if (withdraw > 0) tokenAmounts[i] = buoy.singleStableFromLp(withdraw, int128(i));
        }
    }

    /// @notice Prepare for a single sided withdraw all action
    /// @param account User account
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param index Index of token
    /// @param minAmount Minimum amount accepted in return
    function _withdrawAllSingleFromAccount(
        address account,
        bool pwrd,
        uint256 index,
        uint256 minAmount
    ) private {
        require(index < N_COINS, "!withdrawAllSingleFromAccount: invalid index");
        uint256[N_COINS] memory minAmounts;
        minAmounts[index] = minAmount;
        WithdrawParameter memory parameters =
            WithdrawParameter(account, pwrd, false, true, index, minAmounts, 0);
        _withdraw(parameters);
    }

    /// @notice Main withdraw logic
    /// @param parameters Struct holding withdraw info
    function _withdraw(WithdrawParameter memory parameters) private {
        ctrl.eoaOnly(msg.sender);

        IToken gt = gTokens(parameters.pwrd);
        uint256 deductUsd;
        uint256 returnUsd;
        uint256 lpAmount;
        uint256 lpAmountFee;
        uint256[N_COINS] memory tokenAmounts;
        // If it's a "withdraw all" action
        uint256 virtualPrice = buoy.getVirtualPrice();
        if (parameters.all) {
            (deductUsd, returnUsd) = calculateWithdrawalAmountForAll(
                parameters.pwrd,
                parameters.account
            );
            lpAmountFee = returnUsd.mul(DEFAULT_DECIMALS_FACTOR).div(virtualPrice);
            // If it's a normal withdrawal
        } else {
            lpAmount = parameters.lpAmount;
            uint256 fee =
                lpAmount.mul(withdrawalFee[parameters.pwrd]).div(PERCENTAGE_DECIMAL_FACTOR);
            lpAmountFee = lpAmount.sub(fee);
            returnUsd = lpAmountFee.mul(virtualPrice).div(DEFAULT_DECIMALS_FACTOR);
            deductUsd = lpAmount.mul(virtualPrice).div(DEFAULT_DECIMALS_FACTOR);
            require(
                deductUsd <= gt.getAssets(parameters.account),
                "!withdraw: not enough balance"
            );
        }

        bool whale = ctrl.isBigFish(returnUsd);
        if (whale) {
            if (pnl.pnlTrigger()) {
                pnl.execPnL(0);

                // Recalculate withdrawal amounts after pnl
                if (parameters.all) {
                    (deductUsd, returnUsd) = calculateWithdrawalAmountForAll(
                        parameters.pwrd,
                        parameters.account
                    );
                    lpAmountFee = returnUsd.mul(DEFAULT_DECIMALS_FACTOR).div(virtualPrice);
                }
            }
        }
        pnl.increaseWithdrawalBonus(deductUsd.sub(returnUsd));

        // If it's a balanced withdrawal
        if (parameters.balanced) {
            (returnUsd, tokenAmounts) = _withdrawBalanced(
                parameters.account,
                parameters.pwrd,
                lpAmountFee,
                parameters.minAmounts,
                returnUsd
            );
            // If it's a single asset withdrawal
        } else {
            (returnUsd, tokenAmounts[parameters.index]) = _withdrawSingle(
                parameters.account,
                parameters.pwrd,
                lpAmountFee,
                parameters.minAmounts[parameters.index],
                parameters.index,
                returnUsd,
                whale
            );
        }

        // Check if new token amount breaks utilisation ratio
        if (!parameters.pwrd) {
            require(validGTokenDecrease(deductUsd), "exceeds utilisation limit");
        }

        if (!parameters.all) {
            gt.burn(parameters.account, gt.factor(), deductUsd);
        } else {
            gt.burnAll(parameters.account);
        }
        // Update underlying assets held in pwrd/gvt
        pnl.decreaseGTokenLastAmount(address(gt), deductUsd);

        emit LogNewWithdrawal(
            parameters.account,
            IDepositHandler(ctrl.depositHandler()).referral(parameters.account),
            parameters.pwrd,
            parameters.balanced,
            parameters.all,
            deductUsd,
            returnUsd,
            lpAmountFee,
            tokenAmounts
        );
    }

    /// @notice Withdrawal logic of single asset withdrawals
    /// @param account User account
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param lpAmount LP token value of withdrawal
    /// @param minAmount Minimum amount accepted in return
    /// @param index Index of token
    /// @param withdrawUsd USD value of withdrawals
    /// @param whale Whale withdrawal
    function _withdrawSingle(
        address account,
        bool pwrd,
        uint256 lpAmount,
        uint256 minAmount,
        uint256 index,
        uint256 withdrawUsd,
        bool whale
    ) private returns (uint256 dollarAmount, uint256 tokenAmount) {
        dollarAmount = withdrawUsd;
        // Is the withdrawal large...
        if (whale) {
            (dollarAmount, tokenAmount) = _prepareForWithdrawalSingle(
                account,
                pwrd,
                lpAmount,
                index,
                minAmount,
                withdrawUsd
            );
        } else {
            // ... or small
            IVault adapter = IVault(getVault(index));
            tokenAmount = buoy.singleStableFromLp(lpAmount, int128(index));
            adapter.withdrawByStrategyOrder(tokenAmount, account, pwrd);
        }
        require(tokenAmount >= minAmount, "!withdrawSingle: !minAmount");
    }

    /// @notice Withdrawal logic of balanced withdrawals - Balanced withdrawals
    ///     pull out assets from vault by delta difference between target allocations
    ///     and actual vault amounts ( insurane getDelta ). These withdrawals should
    ///     have minimal impact on user funds as they dont interact with curve (no slippage),
    ///     but are only possible as long as there are assets available to cover the withdrawal
    ///     in the stablecoin vaults - as no swapping or realancing will take place.
    /// @param account User account
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param lpAmount LP token value of withdrawal
    /// @param minAmounts Minimum amounts accepted in return
    /// @param withdrawUsd USD value of withdrawals
    function _withdrawBalanced(
        address account,
        bool pwrd,
        uint256 lpAmount,
        uint256[N_COINS] memory minAmounts,
        uint256 withdrawUsd
    ) private returns (uint256 dollarAmount, uint256[N_COINS] memory tokenAmounts) {
        uint256 coins = N_COINS;
        uint256[N_COINS] memory delta = insurance.getDelta(withdrawUsd);
        address[N_COINS] memory _vaults = vaults();
        for (uint256 i; i < coins; i++) {
            uint256 withdraw = lpAmount.mul(delta[i]).div(PERCENTAGE_DECIMAL_FACTOR);
            if (withdraw > 0) tokenAmounts[i] = buoy.singleStableFromLp(withdraw, int128(i));
            require(tokenAmounts[i] >= minAmounts[i], "!withdrawBalanced: !minAmount");
            IVault adapter = IVault(_vaults[i]);
            require(
                tokenAmounts[i] <= adapter.totalAssets(),
                "_withdrawBalanced: !adapterBalance"
            );
            adapter.withdrawByStrategyOrder(tokenAmounts[i], account, pwrd);
        }
        dollarAmount = buoy.stableToUsd(tokenAmounts, false);
    }

    /// @notice Withdrawal logic for large single asset withdrawals.
    ///     Large withdrawals are routed through the insurance layer to
    ///     ensure that withdrawal dont affect protocol exposure.
    /// @param account User account
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param lpAmount LP token value of withdrawal
    /// @param minAmount Minimum amount accepted in return
    /// @param index Index of token
    /// @param withdrawUsd USD value of withdrawals
    function _prepareForWithdrawalSingle(
        address account,
        bool pwrd,
        uint256 lpAmount,
        uint256 index,
        uint256 minAmount,
        uint256 withdrawUsd
    ) private returns (uint256 dollarAmount, uint256 amount) {
        // PnL executes during the rebalance
        insurance.rebalanceForWithdraw(withdrawUsd, pwrd);
        (dollarAmount, amount) = lg.withdrawSingleCoin(index, minAmount, account);
        require(minAmount <= amount, "!prepareForWithdrawalSingle: !minAmount");
    }

    /// @notice Check if it's OK to burn the specified amount of tokens, this affects
    ///     gvt, as they have a lower bound set by the amount of pwrds
    /// @param amount Amount of token to burn
    function validGTokenDecrease(uint256 amount) private view returns (bool) {
        return
            gTokens(false).totalAssets().sub(amount).mul(utilisationRatioLimitGvt).div(
                PERCENTAGE_DECIMAL_FACTOR
            ) >= gTokens(true).totalAssets();
    }

    /// @notice Calcualte withdrawal value when withdrawing all
    /// @param pwrd Pwrd or gvt (pwrd/gvt)
    /// @param account User account
    function calculateWithdrawalAmountForAll(bool pwrd, address account)
        private
        view
        returns (uint256 deductUsd, uint256 returnUsd)
    {
        IToken gt = gTokens(pwrd);
        deductUsd = gt.getAssets(account);
        returnUsd = deductUsd.sub(
            deductUsd.mul(withdrawalFee[pwrd]).div(PERCENTAGE_DECIMAL_FACTOR)
        );
    }
}
