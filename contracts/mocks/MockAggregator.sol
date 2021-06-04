// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

contract MockAggregator is AggregatorV3Interface {
    uint80 public roundId_;
    int256 public answer_;
    uint256 public startedAt_;
    uint256 public updatedAt_;
    uint80 public answeredInRound_;

    constructor(int256 latestPrice) public {
        roundId_ = 1;
        answer_ = latestPrice;
        startedAt_ = block.timestamp;
        updatedAt_ = block.timestamp;
        answeredInRound_ = 1;
    }

    function decimals() external view override returns (uint8) {}

    function description() external view override returns (string memory) {}

    function version() external view override returns (uint256) {}

    function setPrice(int256 newPrice) external {
        answer_ = newPrice;
        updatedAt_ = block.timestamp;
        answeredInRound_ = answeredInRound_ + 1;
        roundId_ = roundId_ + 1;
    }

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values
    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {}

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (roundId_, answer_, startedAt_, updatedAt_, answeredInRound_);
    }
}
