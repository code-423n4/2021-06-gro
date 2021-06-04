// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IChainPrice.sol";
import "../../common/Whitelist.sol";

/// @notice Oracle with Chainlink aggregators used to get stablecoin 
///     price in ETH via Chainlink v3 aggregators 
contract ChainPrice is IChainPrice, Whitelist {
    using SafeMath for uint;

    // Max time limit between price updates
    uint public MAX_LIMIT = 500000;

    address[] public tokens;
    
    // Price feed information
    struct priceFeed {
        AggregatorV3Interface aggregator;
        uint256 decimals;
        uint256 latestPrice;
        uint256 timeOfLatestPrice;
        uint256 timeOfLatestUpdate;
    }

    mapping(address => priceFeed) public tokenPriceFeed;
    mapping(address => mapping(address => uint)) public tokenRatios;

    event LogNewEthStableTokenAggregator(address indexed token, address aggregator);
    event LogNewPriceUpdate(address indexed user, address indexed token, uint newPrice);
    event LogNewMaxLimit(uint newLimit);
    event LogNewTokens(address[] tokens);
    
    /// @notice Add or replace an existing aggregator
    /// @param tokenIndex Index of underlying token
    /// @param _aggregator Chainlink price aggregator
    function addAggregators(uint256 tokenIndex, address _aggregator)
        external 
        onlyOwner 
    {
        require(tokenIndex < tokens.length, 'invalid token index');
        require(_aggregator != address(0), 'Invalid aggregator address');
        address _token = tokens[tokenIndex];
        if (tokenPriceFeed[_token].latestPrice != 0) {
            delete tokenPriceFeed[_token];
        }
        tokenPriceFeed[_token].aggregator = AggregatorV3Interface(_aggregator);
        tokenPriceFeed[_token].decimals = uint(10)**IERC20Detailed(_token).decimals();
        _updatePriceFeed(_token);
        emit LogNewEthStableTokenAggregator(_token, _aggregator);
    }

    /// @notice Set underlying tokens
    /// @param _tokens Underlying tokens
    function setTokens(address[] calldata _tokens) external onlyOwner {
        tokens = _tokens;
        emit LogNewTokens(_tokens);
    }

    /// @notice Set new timelimit for when oracle will attempt to force update
    /// @param _newLimit New time limit
    function setLimit(uint _newLimit) external onlyOwner {
        MAX_LIMIT = _newLimit;
        emit LogNewMaxLimit(_newLimit);
    }

    /// @notice Update price for ERC20 token/ETH pair
    /// @param _token Stablecoin to get ETH price for
    function updatePriceFeed(address _token) external onlyWhitelist {
        _updatePriceFeed(_token);
    }

    /// @notice Pull latest data for stablecoin from Chainlink and updates its ratios
    /// @param _token Stablecoin to update
    function updateTokenRatios(address _token) external override onlyWhitelist {
        _updatePriceFeed(_token);
        calcRatios(_token);
    }

    /// @notice Fetch ratio and decimals of input tokens
    /// @param i Token in
    /// @param j Token out
    function getRatio(uint i, uint j) external view override returns (uint, uint) {
        address token0 = tokens[i];
        address token1 = tokens[j];
        uint ratio = tokenRatios[token1][token0];
        require(ratio > 0, 'getRatio: !ratio > 0');
        return (ratio, tokenPriceFeed[token1].decimals);
    }

    function priceUpdateTrigger(address _token) external view returns (bool) {
        return _priceUpdateCheck(_token);
    }

    /// @notice Calculate price ratios for stablecoins.
    ///     Same as getPriceFeed, but with an integrated update check
    /// @param _token Stablecoin to get USD price for
    /// @dev If price update hasn't been made within a time limit when attemping to get 
    ///     the price (last time price was update + MAX Limit) force a price update.
    ///     This is to protect against external price update triggers becoming unavailable
    function getSafePriceFeed(address _token) external returns (uint _price) {
        require(_token != address(0), 'Invalid Token address');
        if (_priceUpdateCheck(_token)) {
            _updatePriceFeed(_token);
            calcRatios(_token);
        }
        _price = tokenPriceFeed[_token].latestPrice;
    }
    
    /// @notice Calculate price ratios for stablecoins
    ///     Get timestamp of when latest price was queried for a specific token
    /// @param _token Stablecoin in price pair
    function getTimeOfLastPrice(address _token) external view returns (uint) {
        return tokenPriceFeed[_token].timeOfLatestPrice;
    }

    /// @notice Calculate price ratios for stablecoins
    ///     Get USD price data for stablecoin
    /// @param _token Stablecoin to get USD price for
    function getPriceFeed(address _token) external view override returns (uint _price) {
        require(_token != address(0), 'Invalid Token address');
        _price = tokenPriceFeed[_token].latestPrice;
    }

    /// @notice Check if the price has been updated within the the limit
    /// @param _token To check if price has updated for
    function priceUpdateCheck(address _token) external view override returns (bool) {
        require(_token != address(0), 'Invalid Token address');
        return _priceUpdateCheck(_token);
    }

    /// @notice Update the price for a token
    /// @param _token Target token to update
    function _updatePriceFeed(address  _token) private {
        ( , int price, , uint timeStamp, ) = tokenPriceFeed[_token].aggregator.latestRoundData();

        tokenPriceFeed[_token].latestPrice = uint256(price);
        tokenPriceFeed[_token].timeOfLatestPrice = timeStamp;
        tokenPriceFeed[_token].timeOfLatestUpdate = block.timestamp;
        emit LogNewPriceUpdate(msg.sender, _token, uint256(price));
    }

    /// @notice Calculate price ratios for stablecoins
    /// @param token0 Stablecoin to calculate ratio for
    function calcRatios(address token0) private {
        for (uint i = 0;  i < tokens.length; i++){
            address token1 = tokens[i];
            if (token0 == token1) {
                tokenRatios[token0][token0] = tokenPriceFeed[token0].decimals;
            } else {
                tokenRatios[token1][token0] = tokenPriceFeed[token0].latestPrice
                    .mul(tokenPriceFeed[token1].decimals)
                    .div(tokenPriceFeed[token1].latestPrice);
            }
        }
    }

    function _priceUpdateCheck(address _token) private view returns (bool) {
        ( , int price, , , ) = tokenPriceFeed[_token].aggregator.latestRoundData();
        int256 latestPrice = price;
        return MAX_LIMIT < abs(latestPrice - int256(tokenPriceFeed[_token].latestPrice));
    }

    /// @notice Get absolute value
    function abs(int256 x) private pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }
}
