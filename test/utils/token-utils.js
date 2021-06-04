const IERC20Detailed = artifacts.require('IERC20Detailed');
const ZERO = '0x0000000000000000000000000000000000000000';
const ForceSend = artifacts.require('ForceSend'); // contracts/mocks/abi
const { BN, toBN, toWei } = require('web3-utils');

const getDetailed = async (address) => {
    const tokenDetailed = await IERC20Detailed.at(address);
    const name = await tokenDetailed.name();
    const symbol = await tokenDetailed.symbol();
    const decimals = await tokenDetailed.decimals();
    return { address, name, symbol, decimals };
}

let mainnetBank;

async function getMainnetBank() {
    if (mainnetBank === undefined) {
        const bank = '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7';
        try {
            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [bank],
            });
        } catch (e) {
            console.error(e);
        }
        const forceSend = await ForceSend.new();
        await forceSend.go(bank, { value: toWei('2', 'ether') });
        mainnetBank = bank;
    }
    return mainnetBank;
}

const mintToken = async (token, recipient, amount, mainnet) => {
    if (mainnet) {
        const bank = await getMainnetBank();
        await token.transfer(recipient, amount, { from: bank });
    } else {
        await token.mint(recipient, amount);
    }
}

const burnToken = async (token, holder, amount, mainnet) => {
    if (mainnet) {
        const forceSend = await ForceSend.new();
        await forceSend.go(holder, { value: toWei('2', 'ether') });
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [holder],
        });
        const bank = await getMainnetBank();
        await token.transfer(bank, amount, { from: holder });
    } else {
        await token.burn(holder, amount);
    }
}

module.exports = {
    getDetailed,
    mintToken,
    burnToken,
};
