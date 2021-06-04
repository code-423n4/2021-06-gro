// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IPnL.sol";
import "../common/Constants.sol";

contract MockPnL is Constants, IPnL {
    using SafeMath for uint256;

    uint256 public override lastGvtAssets;
    uint256 public override lastPwrdAssets;
    uint256 public totalProfit;

    function calcPnL() external view override returns (uint256, uint256) {
        return (lastGvtAssets, lastPwrdAssets);
    }

    function setLastGvtAssets(uint256 _lastGvtAssets) public {
        lastGvtAssets = _lastGvtAssets;
    }

    function setLastPwrdAssets(uint256 _lastPwrdAssets) public {
        lastPwrdAssets = _lastPwrdAssets;
    }

    function execPnL(uint256 deductedAssets) public override {}

    function setTotalProfit(uint256 _totalProfit) public {
        totalProfit = _totalProfit;
    }

    function increaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount)
        external
        override
    {}

    function decreaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount)
        external
        override
    {}

    function pnlTrigger() external view override returns (bool) {
        return false;
    }

    function utilisationRatio() external view override returns (uint256) {
        return
            lastGvtAssets != 0
                ? lastPwrdAssets.mul(PERCENTAGE_DECIMAL_FACTOR).div(lastGvtAssets)
                : 0;
    }

    function increaseWithdrawalBonus(uint256 newBonus) external override {}

    function emergencyPnL() external override {}

    function recover() external override {}
}
