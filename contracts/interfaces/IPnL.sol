// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

interface IPnL {
    function calcPnL() external view returns (uint256, uint256);

    function pnlTrigger() external view returns (bool);

    function execPnL(uint256 deductedAssets) external;

    function increaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount) external;

    function decreaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount) external;

    function increaseWithdrawalBonus(uint256 newBonus) external;

    function lastGvtAssets() external view returns (uint256);

    function lastPwrdAssets() external view returns (uint256);

    function utilisationRatio() external view returns (uint256);

    function emergencyPnL() external;

    function recover() external;
}
