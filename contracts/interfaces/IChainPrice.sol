// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

interface IChainPrice{

    function updateTokenRatios(address token) external; 

    function getRatio(uint i, uint j) external view returns (uint, uint);

    function priceUpdateCheck(address _token) external view returns (bool _priceCheck);

    function getPriceFeed(address _token) external view returns (uint _price); 
}
