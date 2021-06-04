const ChainLinkOracle = artifacts.require('ChainPrice')
const MockDAI = artifacts.require('MockDAI')
const MockUSDC = artifacts.require('MockUSDC')
const MockUSDT = artifacts.require('MockUSDT')
const MockAggregatorC = artifacts.require('MockAggregator')
const { BN, toBN } = require('web3-utils')
const { expect, ZERO } = require('../utils/common-utils');
const { advanceSpecialBlock  } = require('../utils/contract-web3-utils');
const truffleAssert = require('truffle-assertions');
const timeMachine = require('ganache-time-traveler');

contract('Oracle test', function (accounts) {
  const tokenPrecision = new BN('1000000000000000000')
  const daiPrice = 2245940000000000 // 1 dai = 0.0022459 ether, decimal = 10e18;
  const usdcPrice = 2218500000000000 // 1 usdc = 0.0022185 ether, decimal = 10e18;
  const usdtPrice = 2208500000000000 // 1 usdc = 0.0022085 ether, decimal = 10e18;
  const [governance, user, priceModule] = accounts;

  let chainLinkOracle,
    ethEthAgg,
    daiEthAgg,
    usdcEthAgg,
    mockDAI,
    mockUSDC,
    mockUSDT,
    tokens;

  beforeEach('Setup Oracle and aggregator before each test', async function () {
    chainLinkOracle = await ChainLinkOracle.new()

    await chainLinkOracle.addToWhitelist(governance, {from: governance});

    mockDai= await MockDAI.new()
    mockUsdc = await MockUSDC.new()
    mockUsdt = await MockUSDT.new()
    tokens = [mockDai.address, mockUsdc.address, mockUsdt.address]

    daiEthAgg = await MockAggregatorC.new(daiPrice);
    usdcEthAgg = await MockAggregatorC.new(usdcPrice);
    usdtEthAgg = await MockAggregatorC.new(usdtPrice);

    // daiEthAgg = '0x773616E4d11A78F511299002da57A0a94577F1f4';
    // usdcEthAgg = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4';
    // usdtEthAgg = '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46';

    await chainLinkOracle.setTokens(tokens, {from: governance})
    await chainLinkOracle.addAggregators(0, daiEthAgg.address, {from: governance})
    await chainLinkOracle.addAggregators(1, usdcEthAgg.address, {from: governance})
    await chainLinkOracle.addAggregators(2, usdtEthAgg.address, {from: governance})

    await chainLinkOracle.setLimit(20, {from: governance});
    await chainLinkOracle.updateTokenRatios(mockDai.address, {from: governance})
    await chainLinkOracle.updateTokenRatios(mockUsdc.address, {from: governance})
    await chainLinkOracle.updateTokenRatios(mockUsdt.address, {from: governance})
    snapshotId = (await timeMachine.takeSnapshot())['result'];
  });

  afterEach(async() => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  describe('Oracle tests', function () {

    it('Should allow token prices to be queried', async function () {
        return expect(chainLinkOracle.getPriceFeed(mockDai.address, {from: governance})).to.be.fulfilled;
      });

    it('Should return token prices in Wei', async function () {
        await expect(chainLinkOracle.getPriceFeed(mockDai.address))
            .to.eventually.be.a.bignumber.greaterThan(new BN("0"));
        await expect(chainLinkOracle.getPriceFeed(mockUsdc.address))
            .to.eventually.be.a.bignumber.greaterThan(new BN("0"));
        return expect(chainLinkOracle.getPriceFeed(mockUsdt.address))
            .to.eventually.be.a.bignumber.greaterThan(new BN("0"));
    })

    it('Should return price ratios between tokens in Wei', async function () {
        const ratio1 = await chainLinkOracle.getRatio(0, 1);
        const ratio2 = await chainLinkOracle.getRatio(0, 2);
        const ratio3 = await chainLinkOracle.getRatio(1, 2);
        const ratio4 = await chainLinkOracle.getRatio(1, 0);
        const ratio5 = await chainLinkOracle.getRatio(1, 2);
        const ratio6 = await chainLinkOracle.getRatio(2, 0);

        await expect(ratio1[0]).to.be.a.bignumber.greaterThan(new BN('0'));
        await expect(ratio1[1]).to.be.a.bignumber.equal(new BN('1000000'));
        await expect(ratio2[0]).to.be.a.bignumber.greaterThan(new BN('0'));
        await expect(ratio2[1]).to.be.a.bignumber.equal(new BN('1000000'));
        await expect(ratio3[0]).to.be.a.bignumber.greaterThan(new BN('0'));
        await expect(ratio3[1]).to.be.a.bignumber.equal(new BN('1000000'));
        await expect(ratio4[0]).to.be.a.bignumber.greaterThan(new BN('0'));
        await expect(ratio4[1]).to.be.a.bignumber.equal(new BN('1000000000000000000'));
        await expect(ratio5[0]).to.be.a.bignumber.greaterThan(new BN('0'));
        await expect(ratio5[1]).to.be.a.bignumber.equal(new BN('1000000'));
        await expect(ratio6[0]).to.be.a.bignumber.greaterThan(new BN('0'));
        return expect(ratio6[1]).to.be.a.bignumber.equal(new BN('1000000000000000000'));

      });

    it('Should be possible to get timestamp of last check', async function () {
        return expect(chainLinkOracle.getTimeOfLastPrice(tokens[0]))
            .to.eventually.be.a.bignumber.greaterThan(new BN(0));
      });

    it.skip('Should be possible to check if the price has been updated within the time limit', async function () {
        await chainLinkOracle.updateTokenRatios(tokens[0]);
        await expect(chainLinkOracle.priceUpdateCheck(tokens[0])).to.eventually.be.false;
        await advanceSpecialBlock(web3, 100);
        return expect(chainLinkOracle.priceUpdateCheck(tokens[0])).to.eventually.be.true;
      });

    it('Should be possible to safetly get the pricefeed (force update is beyond time limit)',
        async function () {
            const oldPrice = await chainLinkOracle.getPriceFeed(tokens[0]);
            await expect(chainLinkOracle.getSafePriceFeed(tokens[0]))
                .to.eventually.be.fulfilled;
            await advanceSpecialBlock(web3, 100);
            const newPrice = new BN('2445940000000000')
            await daiEthAgg.setPrice(newPrice);
            await expect(chainLinkOracle.getSafePriceFeed(tokens[0]))
                .to.eventually.be.a.fulfilled;
            return expect(chainLinkOracle.getPriceFeed(tokens[0]))
                .to.eventually.be.a.bignumber.equal(newPrice);
      });

    it('Should be possible to set a new aggregator',
        async function () {
            const oldPrice = await chainLinkOracle.getPriceFeed(tokens[0]);
            await expect(chainLinkOracle.getSafePriceFeed(tokens[0]))
                .to.eventually.be.fulfilled;
            const newPrice = new BN('2445940000000000')
            const newDaiEthAgg = await MockAggregatorC.new(newPrice);
            await chainLinkOracle.addAggregators(0, newDaiEthAgg.address, {from: governance})
            await chainLinkOracle.updateTokenRatios(tokens[0]);
            await expect(chainLinkOracle.getSafePriceFeed(tokens[0]))
                .to.eventually.be.fulfilled;
            return expect(chainLinkOracle.getPriceFeed(tokens[0]))
                .to.eventually.be.a.bignumber.equal(newPrice);
      });
  });
});

