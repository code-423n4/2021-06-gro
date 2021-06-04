// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "../interfaces/ICurve.sol";

// Mock curve 3pool
contract MockCurvePool is ICurve3Pool {

    address[] public override coins;

    uint N_COINS = 3;
    uint[] public PRECISION_MUL = [1, 1000000000000, 1000000000000];
    uint[] public decimals = [18, 6, 6];
    uint[] public rates = [1001835600000000000, 999482, 999069];
    uint constant vp = 1005330723799997871;
    uint[] vpSingle = [996343755718242128, 994191500557422927, 993764724471177721];

    constructor (address[] memory _tokens) public {
        coins = _tokens;
    }

    function setTokens(address[] calldata _tokens, uint[] calldata _precisions, uint[] calldata _rates)
        external
    {
        coins = _tokens;
        N_COINS = _tokens.length;
        PRECISION_MUL = _precisions;
        rates = _rates;
    }

    function calc_withdraw_one_coin(uint _token_amount, int128 i)
        external
        override
        view returns(uint)
    {
        return (vpSingle[uint(i)] * _token_amount) / ((uint(10)**18) * PRECISION_MUL[uint(i)]);
    }

    function calc_token_amount(uint[3] calldata inAmounts, bool deposit)
        external
        override
        view returns(uint)
    {
        deposit;
        uint totalAmount;
        for (uint i = 0;  i < vpSingle.length; i++){
            totalAmount += (inAmounts[i] * vpSingle[i]) / (10 ** decimals[i]);
        }
        return totalAmount;
    }

    function balances(int128 i) external override view returns(uint) {
        i;
    }

    function get_dy_underlying(int128 i, int128 j, uint256 dx)
        external
        override
        view
        returns (uint256)
    {
        dx;
        uint256 x = rates[uint(i)] * PRECISION_MUL[uint(i)] * (10**decimals[uint(j)]);
        uint256 y = rates[uint(j)] * PRECISION_MUL[uint(j)];
        return x / y;
    }

    function get_virtual_price() external override view returns (uint256) {
        return vp;
    }
}
