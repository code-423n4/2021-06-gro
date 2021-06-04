// SPDX-License-Identifier: AGPLv3
pragma solidity >=0.6.0 <0.7.0;

import "./MockERC20.sol";

contract MockDAI is MockERC20 {
    constructor() public ERC20("DAI", "DAI")  {
        _setupDecimals(18);
    }
}
