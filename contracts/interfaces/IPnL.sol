// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

interface IPnL {
    function calcPnL() external view returns (uint256, uint256);

    function increaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount) external;

    function decreaseGTokenLastAmount(address gTokenAddress, uint256 dollarAmount) external;

    function lastGvtAssets() external view returns (uint256);

    function lastPwrdAssets() external view returns (uint256);

    function utilisationRatio() external view returns (uint256);

    function emergencyPnL() external;

    function recover() external;

    function distributeStrategyGainLoss(uint256 gain, uint256 loss) external;

    function distributeHodlerBonus(uint256 bonus) external;

    function distributePriceChange(uint256 currentTotalAssets) external;
}
