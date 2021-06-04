require('@nomiclabs/hardhat-truffle5')
require('@nomiclabs/hardhat-vyper')
require('@nomiclabs/hardhat-web3')
require('hardhat-gas-reporter')
require('@nomiclabs/hardhat-ethers')
require('hardhat-contract-sizer');
require('hardhat-abi-exporter');
require("solidity-coverage");
require('dotenv').config();

const fs = require("fs");
const Accounts = require('web3-eth-accounts');

const accounts = new Accounts('ws://localhost:8545');
let account, referal, bot, kovan, mainnet, ropsten, goerli;
if (process.env['DEPLOY_MAIN'] === '1') {
  let keystoreD = JSON.parse(fs.readFileSync("deployment"));
  let keyD = accounts.decrypt(keystoreD, process.env['PPASS']);
  let keystoreB = JSON.parse(fs.readFileSync("harvest_bot"));
  let keyB = accounts.decrypt(keystoreB, process.env['BOT']);
  account = keyD.privateKey
  bot = keyB.privateKey
  referal = process.env['REF']
} else {
  account = process.env['DEV']
  bot = process.env['DEV_BOT']
  referal = process.env['REF']
}
kovan = process.env['kovan']
mainnet = process.env['mainnet']
ropsten = process.env['ropsten']
goerli = process.env['goerli']

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
      gas: 12000000,
      blockGasLimit: 12000000
    },
    hardhat: {
      forking: {
          url: mainnet
      },
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
      allowUnlimitedContractSize: true,
      timeout: 1800000,
    },
    kovan: {
      url: kovan,
      accounts: [
        account,
        referal
      ],
      chainId: 42,
      gas: 'auto',
      gasPrice: 100000000000,
      timeout: 10000,
    },
  },
  mocha: {
    useColors: true,
    // reporter: 'eth-gas-reporter',
    timeout: 6000000,
  },
  abiExporter: {
    path: './data/abi',
    clear: true,
    flat: true,
    spacing: 2
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  solidity: {
    compilers: [
      {
        version: '0.6.8',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1337,
          },
        }
      },
      {
        version: '0.6.12',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1337,
          },
        }
      }
    ]
  },
  vyper: {
    version: '0.2.8',
  },
}
