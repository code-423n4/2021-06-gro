const { isBN, isBigNumber } = require('web3-utils');
const { BigNumber } = require('ethers');

const defaultTruffleGasLimit = 6721975;
const timeoutMessage = '50 blocks'; // Substring of web3 timeout error.
const defaultWeb3Error = 'please check your gas limit'; // Substring of default Web3 error
const revertMessage = 'VM Exception while processing transaction: revert'; // Substring of default Web3 transaction revert

// Ganache custom methods
async function advanceOneBlockAndSetTime(web3, time) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: '2.0',
                method: 'evm_mine',
                params: [time],
                id: new Date().getTime(),
            },
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            },
        );
    });
}

// Ganache custom methods
async function advanceOneBlock(web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: new Date().getTime(),
        }, (err, result) => {
            if (err) { return reject(err); }
            return resolve(result);
        });
    });
}

async function advanceSpecialBlock(web3, num) {
    for (let i = 0; i < num; i++) {
        await advanceOneBlock(web3);
    }
}

async function stopMining(web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: '2.0',
                method: 'miner_stop',
                params: [],
                id: new Date().getTime(),
            },
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            },
        );
    });
}

async function startMining(web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send(
            {
                jsonrpc: '2.0',
                method: 'miner_start',
                params: [],
                id: new Date().getTime(),
            },
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            },
        );
    });
}

async function getTransGasLimit(web3) {
    const block = await web3.eth.getBlock('latest');
    const transLength = block.transactions.length;
    return transLength !== 0 ? block.gasLmit / transLength : defaultTruffleGasLimit;
}

/**
 * @dev This function will mine all transactions in `transactions` in the same block with block timestamp `time`
 * @param web3 input web3 object
 * @param transactions a web3 transaction array, one transaction generated like:
 * let transaction = truffleContract.contract.methods.myMethodName(arg1, arg2);
 * or if already using a web3 contract object:
 * let transaction = web3Contract.methods.myMethodName(arg1, arg2);
 * @param senders array of who send transaction
 * @param time used to set block timestamp, optional
 * @return transaction promise results, like this:
 * [{status: 'fulfilled', value: transaction receipt}, {status: 'rejected', reason: error reason, receipt: transaction receipt, transactionHash: transactionHash}, ...]
 */
async function mineTransactionsAtOneBlockAndSetTime(web3, transactions, senders, time) {
    const gasLimit = await getTransGasLimit(web3);
    const gasPrice = await web3.eth.getGasPrice();

    await stopMining(web3);

    try {
        const receiptPromises = [];
        for (let i = 0; i < transactions.length; i++) {
            const trans = transactions[i];
            const sender = senders[i];
            trans.arguments = prepareCall(trans.arguments);
            let gasCost = 0;
            await trans.estimateGas(
                {
                    from: sender,
                    gas: gasLimit,
                },
            ).then(
                (gas) => {gasCost = gas;},
                // ignore error
                (err) => {},
            );

            const transOptions = {
                gas: gasCost,
                gasPrice: gasPrice,
                from: sender,
            };

            const result = trans.send(transOptions);
            let transHash;
            result.once('transactionHash', (hash) => {
                console.log('transactionHash: ' + hash);
                transHash = hash;
            });

            receiptPromises.push(result.then(
                (receipt) => {
                    return { status: 'fulfilled', receipt: receipt };
                },

                async (error) => {
                    let reasonString = error.toString();
                    let errMessage = error.message;
                    const receipt = error.receipt;
                    const txHash = receipt !== undefined
                        ? receipt.transactionHash
                        : transHash;
                    const blockNumber = receipt !== undefined ? receipt.blockNumber : 'latest';
                    // see also eth-revert-reason(https://www.npmjs.com/package/eth-revert-reason)
                    await trans.call(transOptions, blockNumber).catch(err => {
                        errMessage = err.toString();
                        if (errMessage.includes(revertMessage)) {
                            reasonString = errMessage.split(revertMessage).pop().trim();
                        }
                    });
                    return {
                        status: 'rejected',
                        reason: reasonString,
                        message: errMessage,
                        transactionHash: txHash,
                        receipt: receipt,
                    };
                }),
            );
        }

        time === undefined ? await advanceOneBlock(web3)
            : await advanceOneBlockAndSetTime(web3, time);
        return await Promise.all(receiptPromises);
    } catch (err) {
        throw new Error(err.message);
    } finally {
        // We need to restart Ganache's mining no matter what, otherwise the caller would have to restart their Ganache instance.
        await startMining(web3);
    }
}

function prepareCall(_arguments) {
    return batchConvertToEthersBN(Array.prototype.slice.call(_arguments));
}

function batchConvertToEthersBN(originals) {
    const converted = [];
    originals.forEach(item => {
        // Recurse for arrays
        if (Array.isArray(item)) {
            converted.push(batchConvertToEthersBN(item));
        } else {
            converted.push(convertToEthersBN(item));
        }
    });
    return converted;
}

function convertToEthersBN(item) {
    // Convert Web3 BN / BigNumber
    if (is_big_number(item)) {
        //HACK: Since we can't rely on web3Utils.isBigNumber to tell
        //whether we have a bignumber.js BigNumber, we'll just check
        //whether it has the toFixed method
        const stringValue = item.toFixed
            ? item.toFixed() //prevents use of scientific notation
            : item.toString();
        item = BigNumber.from(stringValue);
    }
    return item;
}

function is_big_number(val) {
    if (typeof val !== 'object') return false;

    //NOTE: For some reason, contrary to the docs,
    //web3Utils.isBigNumber returns true not only for
    //bignumber.js BigNumbers, but also for ethers BigNumbers,
    //even though these are totally different things.
    return isBN(val) || isBigNumber(val);
}

module.exports = {
    mineTransactionsAtOneBlockAndSetTime,
    advanceOneBlockAndSetTime,
    advanceOneBlock,
    advanceSpecialBlock,
};

