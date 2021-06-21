// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {FixedStablecoins, FixedGTokens, FixedVaults} from "./common/FixedContracts.sol";
import "./common/Controllable.sol";

import "./interfaces/IChainPrice.sol";
import "./interfaces/IERC20Detailed.sol";
import "./interfaces/IEmergencyHandler.sol";
import "./interfaces/IInsurance.sol";
import "./interfaces/IPausable.sol";
import "./interfaces/IPnL.sol";
import "./interfaces/IToken.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWithdrawHandler.sol";

/// @notice Alternate route for withdrawals during protocol emergency states:
///     EmergencyHanlder is not called directly, rather calls to the withdrawHandler
///     are rerouted to the emergencyHandler if the system enters a emergency state.
///     All deposits are blocked in a emegency state, and withdrawals are priced against
///     Chainlink rather than curve. 
///     An emergency state assumes that something has gone wrong with curve, which means that
///     pricing and swapping no longer works correctly. In this state the system will give back
///     any assets it has in excess to the user withdrawing [excluding any broken asset].
contract EmergencyHandler is Controllable, FixedStablecoins, FixedGTokens, FixedVaults, IEmergencyHandler {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IChainPrice public immutable chain;
    IWithdrawHandler public withdrawHandler;
    IInsurance public insurance;
    IController public ctrl;
    IPnL public pnl;

    event LogEmergencyWithdrawal();
    event LogNewDependencies();

    constructor(
        address pwrd,
        address gvt,
        address _chain,
        address[N_COINS] memory _vaults,
        address[N_COINS] memory _tokens,
        uint256[N_COINS] memory _decimals
    ) public FixedStablecoins(_tokens, _decimals) FixedGTokens(pwrd, gvt) FixedVaults(_vaults) {
        chain = IChainPrice(_chain);
    }

    /// @notice Update protocol dependencies
    function setDependencies() external onlyOwner {
        ctrl = _controller();
        insurance = IInsurance(ctrl.insurance());
        withdrawHandler = IWithdrawHandler(ctrl.withdrawHandler());
        pnl = IPnL(ctrl.pnl());
        emit LogNewDependencies();
    }

    /// @notice Withdraw all
    /// @param user User address
    /// @param pwrd pwrd/gvt token
    /// @param minAmount min amount of token to withdraw
    function emergencyWithdrawAll(
        address user,
        bool pwrd,
        uint256 minAmount
    ) external override {
        // Only withdrawHandler can call this method
        require(msg.sender == address(withdrawHandler), "EmergencyHandler: !WithdrawHandler");
        IToken gt = IToken(gTokens(pwrd));
        uint256 userAssets = gt.getAssets(user);

        _withdraw(user, pwrd, true, userAssets, minAmount);
    }

    /// @notice Withdraw partial
    /// @param user User address
    /// @param pwrd pwrd/gvt token
    /// @param inAmount usd to witdraw
    /// @param minAmount min amount of token to withdraw
    function emergencyWithdrawal(
        address user,
        bool pwrd,
        uint256 inAmount,
        uint256 minAmount
    ) external override {
        // Only withdrawHandler can call this method
        require(msg.sender == address(withdrawHandler), "EmergencyHandler: !WithdrawHandler");
        IToken gt = IToken(gTokens(pwrd));
        uint256 userAssets = gt.getAssets(user);
        // User must have a positive amount of gTokens
        require(userAssets >= inAmount, "EmergencyHandler: !userGTokens");

        _withdraw(user, pwrd, false, inAmount, minAmount);
    }

    /// @notice emergency withdraw
    /// @param user user address
    /// @param pwrd pwrd/gvt token
    /// @param all withdraw all
    /// @param deductUsd usd to witdraw
    /// @param minAmount min amount of token to withdraw
    function _withdraw(
        address user,
        bool pwrd,
        bool all,
        uint256 deductUsd,
        uint256 minAmount
    ) private {
        uint256 withdrawalFee = deductUsd.mul(withdrawHandler.withdrawalFee(pwrd)).div(PERCENTAGE_DECIMAL_FACTOR);

        uint256 reductUsd = deductUsd.sub(withdrawalFee);

        /// Gvt can still be block if there are enough pwrd in the system
        if (!pwrd) {
            require(
                validGTokenDecrease(reductUsd, withdrawHandler.utilisationRatioLimitGvt()),
                "exceeds utilisation limit"
            );
        }

        uint256[N_COINS] memory vaultIndexes = insurance.sortVaultsByDelta(false);
        IERC20 token = IERC20(getToken(vaultIndexes[2]));
        IVault _vault = IVault(getVault(vaultIndexes[2]));
        uint256 tokenAmount = reductUsd.mul(CHAINLINK_PRICE_DECIMAL_FACTOR).div(chain.getPriceFeed(vaultIndexes[2]));
        tokenAmount = tokenAmount.mul(getDecimal(vaultIndexes[2])).div(DEFAULT_DECIMALS_FACTOR);

        uint256 vaultAssets = _vault.totalAssets();
        if (vaultAssets < tokenAmount) {
            if (vaultAssets > minAmount) {
                tokenAmount = vaultAssets;
            } else {
                revert("EmergencyHandler: !totalAssets");
            }
        }

        _vault.withdrawByStrategyOrder(tokenAmount, address(this), pwrd);
        uint256 outAmount = token.balanceOf(address(this));
        require(outAmount >= minAmount, "EmergencyHandler: !minAmount");
        token.safeTransfer(user, outAmount);

        IToken gt = IToken(gTokens(pwrd));
        if (all) {
            gt.burnAll(user);
        } else {
            gt.burn(user, gt.factor(), deductUsd);
        }
        pnl.decreaseGTokenLastAmount(address(gt), deductUsd);
        ctrl.distributeHodlerBonus(withdrawalFee);
        emit LogEmergencyWithdrawal();
    }

    /// @notice Check if it's OK to burn the specified amount of tokens, this affects
    ///     gvt, as they have a lower bound set by the amount of pwrds
    /// @param amount Amount of token to burn
    function validGTokenDecrease(uint256 amount, uint256 utilisationRatioLimitGvt) private view returns (bool) {
        return
            gTokens(false).totalAssets().sub(amount).mul(utilisationRatioLimitGvt).div(PERCENTAGE_DECIMAL_FACTOR) >=
            gTokens(true).totalAssets();
    }
}
