// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "contracts/interfaces/IERC20Detailed.sol";
import "contracts/interfaces/IChainPrice.sol";
import "contracts/common/Whitelist.sol";

/// @notice Oracle with chainlink aggregators used to get Stablecoin 
///     price in ETH via chainlink v3 aggregators 
contract MockChainPrice is IChainPrice {
    using SafeMath for uint;

    uint public MAX_LIMIT = 3600;

    address[] public tokens;
    
    // price feed information
    mapping(address => uint256) price;
    mapping(uint256 => mapping(uint256 => uint256)) ratios;
    struct priceFeed {
        AggregatorV3Interface aggregator;
        uint256 decimals;
        uint256 latestPrice;
        uint256 timeOfLatestPrice;
    }

    mapping(address => priceFeed) public tokenPriceFeed;
    mapping(address => mapping(address => uint)) public tokenRatios;

    constructor() public {
    }

    /// @notice Set underlying tokens
    /// @param _tokens underlying tokens
    function setTokens(address[] calldata _tokens) external {
        tokens = _tokens;
        price[_tokens[0]] = 100113015;
        price[_tokens[1]] = 100012144; 
        price[_tokens[2]] = 100182073;
    }

    /// @notice update price for ERC20 token
    /// @param _token stable coin to get eth price for
    function updatePriceFeed(address _token) external {
    }

    /// @notice Pull latest data for stablecoin from chainlink and updates its ratios
    /// @param _token stable coin to update
    function updateTokenRatios(address _token) external override {
    }

    /// @notice Fetch ratio and decimals of input tokens
    /// @param i Denominator token index
    /// @param j Numerator token index
    function getRatio(uint i, uint j) external view override returns (uint, uint) {
    }

    /// @notice Calculate price ratios for stablecoins
    ///     Get USD price data for stablecoin
    /// @param _token stable coin to get usd price for
    function getPriceFeed(address _token) external view override returns (uint _price) {
        return price[_token];
    }

    function priceUpdateCheck(address _token) external view override returns (bool _priceCheck) {

    }

}
