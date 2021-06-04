// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

interface ICurve3Pool {

    function coins(uint256 i) external view returns (address);

    function get_virtual_price() external view returns (uint256);

    function get_dy_underlying(int128 i, int128 j, uint256 dx) external view returns (uint256);

    function calc_withdraw_one_coin(uint _token_amount, int128 i) external view returns(uint);

    function calc_token_amount(uint[3] calldata inAmounts, bool deposit) external view returns(uint);

    function balances(int128 i) external view returns(uint);
}

interface ICurve3Deposit {

    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external;

    function add_liquidity(uint[3] calldata uamounts, uint min_mint_amount) external;

    function remove_liquidity(uint amount, uint[3] calldata min_uamounts) external;

    function remove_liquidity_imbalance(uint256[3] calldata amounts, uint256 max_burn_amount) external;

    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint min_uamount) external;

    function get_dy_underlying(int128 i, int128 j, uint256 dx) external view returns (uint256);
}

interface ICurveMetaPool {

    function coins(uint256 i) external view returns (address);

    function get_virtual_price() external view returns (uint256);

    function get_dy_underlying(int128 i, int128 j, uint256 dx) external view returns (uint256);

    function calc_withdraw_one_coin(uint _token_amount, int128 i) external view returns(uint);

    function calc_token_amount(uint[2] calldata inAmounts, bool deposit) external view returns(uint);

    function balances(int128 i) external view returns(uint);
}

interface ICurveMetaDeposit {

    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external;

    function add_liquidity(uint[2] calldata uamounts, uint min_mint_amount) external;

    function remove_liquidity(uint amount, uint[2] calldata min_uamounts) external;

    function remove_liquidity_imbalance(uint256[2] calldata amounts, uint256 max_burn_amount) external;

    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint min_uamount) external;
}

interface ICurveZap {

    function add_liquidity(uint[4] calldata uamounts, uint min_mint_amount) external;

    function remove_liquidity(uint amount, uint[4] calldata min_uamounts) external;

    function remove_liquidity_imbalance(uint256[4] calldata amounts, uint256 max_burn_amount) external;

    function remove_liquidity_one_coin(uint _token_amount, int128 i, uint min_uamount) external;

    function calc_withdraw_one_coin(uint _token_amount, int128 i) external view returns(uint);

    function calc_token_amount(uint[4] calldata inAmounts, bool deposit) external view returns(uint);

    function pool() external view returns(address);
}
