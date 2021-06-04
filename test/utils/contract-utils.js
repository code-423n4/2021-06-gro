const { BN, toBN } = require('web3-utils');

const defaultSlippagePercent = toBN(1),
    defaultSlippageBaseNum = toBN(1000);
const defaultDollarApproxFactor = toBN(10).pow(toBN(19));

function slipping(
    amount,
    slippagePercent = defaultSlippagePercent,
    slippageBaseNum = defaultSlippageBaseNum,
) {
    const slippages = amount.mul(toBN(slippagePercent)).div(toBN(slippageBaseNum));
    const min = amount.sub(slippages);
    const max = amount.add(slippages);
    return { min, max };
}

async function batchApprove(investor, spender, tokens, tokenAmounts) {
    for (let i = 0; i < tokenAmounts.length; i++) {
        await tokens[i].approve(
            spender, tokenAmounts[i], { from: investor });
    }
}

async function batchApproveMain(investor, spender, tokens, tokenAmounts) {
    for (let i = 0; i < tokenAmounts.length; i++) {
        await tokens[i].methods.approve(
                        spender, tokenAmounts[i]
        ).send({ from: investor  });
    }
}

// input is contract || contract.address || [contract, ...] || [contract.address, ...]
function convertInputToContractAddr(input) {
    const covered = (item) => {
        return item.address ? item.address : item;
    };
    if (Array.isArray(input)) {
        const coveredInput = [];
        input.forEach((item) => {
            coveredInput.push(covered(item));
        });
        return coveredInput;
    }
    return covered(input);
}

module.exports = {
    batchApprove,
    batchApproveMain,
    defaultDollarApproxFactor,
    defaultSlippagePercent,
    defaultSlippageBaseNum,
    slipping,
    convertInputToContractAddr,
};
