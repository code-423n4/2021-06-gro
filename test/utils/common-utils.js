'use strict'

const { BN, toBN } = require('web3-utils')
const abi = require('ethereumjs-abi')
const chai = require('chai')
chai.use(require('chai-bn')(BN))
chai.use(require('chai-as-promised'))
chai.should()
const expect = chai.expect
const ZERO = '0x0000000000000000000000000000000000000000';

const thousandBaseNum = toBN(10).pow(toBN(3)),
  millionBaseNum = toBN(10).pow(toBN(6)),
  billionBaseNum = toBN(10).pow(toBN(8)),
  lgBaseNum = toBN(10).pow(toBN(18)),
  daiBaseNum = toBN(10).pow(toBN(18)),
  usdcBaseNum = toBN(10).pow(toBN(6)),
  usdtBaseNum = toBN(10).pow(toBN(6))

const sumTotal = function (nums) {
  let total = new BN(0)
  nums.forEach((element) => {
    total = total.add(element)
  })
  return total
}

const wait = function (ms) {
  new Promise((resolve) => setTimeout(resolve, ms))
}

const stableCoinsRatios = {
  daiRatio: toBN(3800),
  usdcRatio: toBN(2600),
  usdtRatio: toBN(3600),
}

const encodeCall = function (name, args, values) {
  const methodId = abi.methodID(name, args).toString('hex')
  const params = abi.rawEncode(args, values).toString('hex')
  return '0x' + methodId + params
}

// start and end need be bigNumber
function expectBignumberBetween(actual, start, end) {
  const [max, min] = start.gt(end) ? [start, end] : [end, start]
  console.log('actual : ' + actual.toString())
  console.log('start : ' + start.toString())
  console.log('end : ' + end.toString())
  expect(actual).to.be.a.bignumber.above(min)
  expect(actual).to.be.a.bignumber.most(max)
}

// start and end need be bigNumber
function expectBignumberBetweenInclude(actual, start, end) {
  const [max, min] = start.gte(end) ? [start, end] : [end, start]
  console.log('actual : ' + actual.toString())
  console.log('start : ' + start.toString())
  console.log('end : ' + end.toString())
  expect(actual).to.be.a.bignumber.least(min)
  expect(actual).to.be.a.bignumber.most(max)
}

function decodeLogs(logs, emitter, address, eventName) {
  let abi;
  abi = emitter.abi;

  let eventABI = abi.filter(x => x.type === 'event' && x.name === eventName);
  if (eventABI.length === 0) {
    throw new Error(`No ABI entry for event '${eventName}'`);
  } else if (eventABI.length > 1) {
    throw new Error(`Multiple ABI entries for event '${eventName}', only uniquely named events are supported`);
  }

  eventABI = eventABI[0];

  // The first topic will equal the hash of the event signature
  const eventSignature = `${eventName}(${eventABI.inputs.map(input => input.type).join(',')})`;
  const eventTopic = web3.utils.sha3(eventSignature);

  // Only decode events of type 'EventName'
  return logs
    .filter(log => log.topics.length > 0 && log.topics[0] === eventTopic && (!address || log.address === address))
    .map(log => web3.eth.abi.decodeLog(eventABI.inputs, log.data, log.topics.slice(1)))
    .map(decoded => ({ event: eventName, args: decoded }));
}

async function expectBignumberPromiseCloseTo(
  promise,
  expect,
  approximationFactor,
  desc,
) {
  await expect(promise).to.eventually.be.a.bignumber.closeTo(
    expect,
    approximationFactor,
    desc,
  )
}

async function expectBignumberPromiseEqual(promise, expect, desc) {
  await expect(promise).to.eventually.be.a.bignumber.equal(expect, desc)
}

async function compareStrategeBalance(
  controller,
  investAmount,
  vaultPercent,
  cointype,
  strategyRatios,
  compare = true,
) {
  const percentDecimal = toBN(10000)
  const [mockDAI, mockUSDC, mockUSDT] = controller.underlyingTokens
  const [
    DAIVaultAdaptor,
    USDCVaultAdaptor,
    USDTVaultAdaptor,
  ] = controller.vaults
  const [mockDAIVault, mockUSDCVault, mockUSDTVault] = [
    DAIVaultAdaptor.vault,
    USDCVaultAdaptor.vault,
    USDTVaultAdaptor.vault,
  ]

  const coinSettings = {
    dai: {
      coin: mockDAI,
      base: daiBaseNum,
      adapter: DAIVaultAdaptor,
      vault: mockDAIVault,
    },
    usdc: {
      coin: mockUSDC,
      base: usdcBaseNum,
      adapter: USDCVaultAdaptor,
      vault: mockUSDCVault,
    },
    usdt: {
      coin: mockUSDT,
      base: usdtBaseNum,
      adapter: USDTVaultAdaptor,
      vault: mockUSDTVault,
    },
  }

  console.log(
    `================= strategy compare result: ${cointype} ==================`,
  )
  console.log('invest amount : ' + investAmount)
  console.log('vault percent : ' + vaultPercent)
  console.log('strategy ratio : ' + strategyRatios)
  const coin = coinSettings[cointype].coin
  const coinBase = coinSettings[cointype].base
  const strategies = coinSettings[cointype].adapter.strategies

  const adapterBalance = await coin.balanceOf(
    coinSettings[cointype].adapter.address,
  )
  console.log('vault adapter balance: ' + adapterBalance.toString())
  const vaultBalance = await coin.balanceOf(
    coinSettings[cointype].vault.address,
  )
  console.log('vault balance: ' + vaultBalance.toString())

  const aplhaBalance = await coin.balanceOf(strategies[0].address)
  const aplhaExpected = investAmount
    .mul(vaultPercent)
    .div(percentDecimal)
    .mul(toBN(strategyRatios[0]))
    .div(percentDecimal)
    .mul(coinBase)
  console.log('aplhaBalance : ' + aplhaBalance)
  console.log('aplhaExpected : ' + aplhaExpected)
  if (compare)
    expect(aplhaBalance.sub(aplhaExpected).abs()).to.be.a.bignumber.most(
      toBN(10).mul(coinBase),
      'AplhaStrategy balance compare failed',
    )

  const curveBalance = await coin.balanceOf(strategies[1].address)
  const curveExpected = investAmount
    .mul(vaultPercent)
    .div(percentDecimal)
    .mul(toBN(strategyRatios[1]))
    .div(percentDecimal)
    .mul(coinBase)
  console.log('curveBalance : ' + curveBalance)
  console.log('curveExpected : ' + curveExpected)
  if (compare)
    expect(curveBalance.sub(curveExpected).abs()).to.be.a.bignumber.most(
      toBN(10).mul(coinBase),
      'CurveStrategy balance compare failed',
    )
}

async function compareStrategiesBalance(
  controller,
  investAmount,
  vaultPercents,
  strategyRatios,
  lifeguardBufferUsd,
  compare = true,
) {
  const lifeguard = controller.lifeguard;
  const buffer = await lifeguard.totalAssetsUsd();
  const lgBaseNum = toBN(10).pow(toBN(18));
  console.log('lifegoard buffer usd : ' + buffer);
  if (compare)
    expect(
      buffer.sub(toBN(lifeguardBufferUsd).mul(lgBaseNum)).abs(),
    ).to.be.a.bignumber.most(
      toBN(10).mul(lgBaseNum),
      'lifeguard buffer compare failed',
    )
  await compareStrategeBalance(
    controller,
    investAmount,
    vaultPercents[0],
    'dai',
    strategyRatios,
    compare,
  )
  await compareStrategeBalance(
    controller,
    investAmount,
    vaultPercents[1],
    'usdc',
    strategyRatios,
    compare,
  )
  await compareStrategeBalance(
    controller,
    investAmount,
    vaultPercents[2],
    'usdt',
    strategyRatios,
    compare,
  )
}

function showRebalanceTriggerResult(rebalanceResult) {
  console.log('=================== Rebalance Paramters ===============')
  console.log('sysNeedRebalance : ' + rebalanceResult[0])
  console.log('lgNeedTopup: ' + rebalanceResult[1])
}

async function getSystemAssetsInfo(controller) {
  const lifeguard = controller.lifeguard
  const buoy = lifeguard.buoy
  const gvt = controller.gvt
  const pwrd = controller.pwrd
  const [mockDAI, mockUSDC, mockUSDT] = controller.underlyingTokens
  const mockLPT = lifeguard.lpt;
  const [
    DAIVaultAdaptor,
    USDCVaultAdaptor,
    USDTVaultAdaptor,
    CurveVaultAdaptor
  ] = controller.vaults
  const [mockDAIVault, mockUSDCVault, mockUSDTVault, mockCurveVault] = [
    DAIVaultAdaptor.vault,
    USDCVaultAdaptor.vault,
    USDTVaultAdaptor.vault,
    CurveVaultAdaptor.vault
  ]
  const [
    mockDAIAlphaStrategy,
    mockDAIBetaStrategy,
  ] = DAIVaultAdaptor.strategies
  const [
    mockUSDCAlphaStrategy,
    mockUSDCBetaStrategy,
  ] = USDCVaultAdaptor.strategies
  const [
    mockUSDTAlphaStrategy,
    mockUSDTBetaStrategy,
  ] = USDTVaultAdaptor.strategies
  let systemAssets = {}
  systemAssets.totalAsset = await controller.totalAssets()
  systemAssets.gvtAsset = await controller.gTokenTotalAssets({
    from: gvt.address,
  })
  systemAssets.pwrdAsset = await controller.gTokenTotalAssets({
    from: pwrd.address,
  })
  systemAssets.gvtTotalSupply = await gvt.totalSupply()
  systemAssets.pwrdTotalSupply = await pwrd.totalSupply()
  systemAssets.gvtFactor = await gvt.factor();
  systemAssets.pwrdFactor = await pwrd.factor();

  systemAssets.lifeguardUsd = await lifeguard.totalAssetsUsd()
  systemAssets.lifeguardDaiBalance = await mockDAI.balanceOf(lifeguard.address)
  systemAssets.lifeguardUsdcBalance = await mockUSDC.balanceOf(lifeguard.address)
  systemAssets.lifeguardUsdtBalance = await mockUSDT.balanceOf(lifeguard.address)
  systemAssets.lifeguardLptBalance = await mockLPT.balanceOf(lifeguard.address)

  systemAssets.daiAdapterTotalAsset = await DAIVaultAdaptor.totalAssets()
  systemAssets.usdcAdapterTotalAsset = await USDCVaultAdaptor.totalAssets()
  systemAssets.usdtAdapterTotalAsset = await USDTVaultAdaptor.totalAssets()
  systemAssets.curveAdapterTotalAsset = await CurveVaultAdaptor.totalAssets()

  systemAssets.daiAdapterTotalAssetUsd = await buoy.stableToUsd([systemAssets.daiAdapterTotalAsset, 0, 0], true)
  systemAssets.usdcAdapterTotalAssetUsd = await buoy.stableToUsd([0, systemAssets.usdcAdapterTotalAsset, 0], true)
  systemAssets.usdtAdapterTotalAssetUsd = await buoy.stableToUsd([0, 0, systemAssets.usdtAdapterTotalAsset], true)
  systemAssets.curveAdapterTotalAssetUsd = await buoy.lpToUsd(systemAssets.curveAdapterTotalAsset)

  systemAssets.daiVaultTotalAsset = await mockDAIVault.totalAssets()
  systemAssets.usdcVaultTotalAsset = await mockUSDCVault.totalAssets()
  systemAssets.usdtVaultTotalAsset = await mockUSDTVault.totalAssets()
  systemAssets.curveVaultTotalAsset = await mockCurveVault.totalAssets()

  systemAssets.daiVaultBalance = await mockDAI.balanceOf(mockDAIVault.address)
  systemAssets.usdcVaultBalance = await mockUSDC.balanceOf(mockUSDCVault.address)
  systemAssets.usdtVaultBalance = await mockUSDT.balanceOf(mockUSDTVault.address)
  systemAssets.curveVaultBalance = await mockLPT.balanceOf(mockCurveVault.address)

  systemAssets.daiAdapterBalance = await mockDAI.balanceOf(DAIVaultAdaptor.address)
  systemAssets.usdcAdapterBalance = await mockUSDC.balanceOf(USDCVaultAdaptor.address)
  systemAssets.usdtAdapterBalance = await mockUSDT.balanceOf(USDTVaultAdaptor.address)
  systemAssets.curveAdapterBalance = await mockUSDT.balanceOf(CurveVaultAdaptor.address)

  systemAssets.daiVaultStrategy = {}
  let daiStrategies = systemAssets.daiVaultStrategy
  daiStrategies.alphaRatio = (
    await mockDAIVault.strategies(mockDAIAlphaStrategy.address)
  ).debtRatio
  daiStrategies.alphaBalance = await mockDAI.balanceOf(
    mockDAIAlphaStrategy.address,
  )
  daiStrategies.alpha = (
    await mockDAIVault.strategies(mockDAIAlphaStrategy.address)
  ).totalDebt
  daiStrategies.alphaUsd = await buoy.stableToUsd([daiStrategies.alpha, 0, 0], true)
  daiStrategies.curveRatio = (
    await mockDAIVault.strategies(mockDAIBetaStrategy.address)
  ).debtRatio
  daiStrategies.curveBalance = await mockDAI.balanceOf(
    mockDAIBetaStrategy.address,
  )
  daiStrategies.curve = (
    await mockDAIVault.strategies(mockDAIBetaStrategy.address)
  ).totalDebt
  daiStrategies.curveUsd = await buoy.stableToUsd([daiStrategies.curve, 0, 0], true)
  systemAssets.usdcVaultStrategy = {}
  let usdcStrategies = systemAssets.usdcVaultStrategy
  usdcStrategies.alphaRatio = (
    await mockUSDCVault.strategies(mockUSDCAlphaStrategy.address)
  ).debtRatio
  usdcStrategies.alphaBalance = await mockUSDC.balanceOf(
    mockUSDCAlphaStrategy.address,
  )
  usdcStrategies.alpha = (
    await mockUSDCVault.strategies(mockUSDCAlphaStrategy.address)
  ).totalDebt
  usdcStrategies.alphaUsd = await buoy.stableToUsd([0, usdcStrategies.alpha, 0], true)
  usdcStrategies.curveRatio = (
    await mockUSDCVault.strategies(mockUSDCBetaStrategy.address)
  ).debtRatio
  usdcStrategies.curveBalance = await mockUSDC.balanceOf(
    mockUSDCBetaStrategy.address,
  )
  usdcStrategies.curve = (
    await mockUSDCVault.strategies(mockUSDCBetaStrategy.address)
  ).totalDebt
  usdcStrategies.curveUsd = await buoy.stableToUsd([0, usdcStrategies.curve, 0], true)
  systemAssets.usdtVaultStrategy = {}
  let usdtStrategies = systemAssets.usdtVaultStrategy
  usdtStrategies.alphaRatio = (
    await mockUSDTVault.strategies(mockUSDTAlphaStrategy.address)
  ).debtRatio
  usdtStrategies.alphaBalance = await mockUSDT.balanceOf(
    mockUSDTAlphaStrategy.address,
  )
  usdtStrategies.alpha = (
    await mockUSDTVault.strategies(mockUSDTAlphaStrategy.address)
  ).totalDebt
  usdtStrategies.alphaUsd = await buoy.stableToUsd([0, 0, usdtStrategies.alpha], true)
  usdtStrategies.curveRatio = (
    await mockUSDTVault.strategies(mockUSDTBetaStrategy.address)
  ).debtRatio
  usdtStrategies.curveBalance = await mockUSDT.balanceOf(
    mockUSDTBetaStrategy.address,
  )
  usdtStrategies.curve = (
    await mockUSDTVault.strategies(mockUSDTBetaStrategy.address)
  ).totalDebt
  usdtStrategies.curveUsd = await buoy.stableToUsd([0, 0, usdtStrategies.curve], true)
  return systemAssets
}

async function getSystemAssetsInfoMain(controller) {
  const lifeguard = controller.lifeguard
  const buoy = lifeguard.buoy
  const gvt = controller.gvt
  const pwrd = controller.pwrd
  const [mockDAI, mockUSDC, mockUSDT] = controller.underlyingTokens
  const [
    DAIVaultAdaptor,
    USDCVaultAdaptor,
    USDTVaultAdaptor,
  ] = controller.vaults
  const [mockDAIVault, mockUSDCVault, mockUSDTVault] = [
    DAIVaultAdaptor.vault,
    USDCVaultAdaptor.vault,
    USDTVaultAdaptor.vault,
  ]
  const [
    mockDAIAlphaStrategy,
    mockDAIBetaStrategy,
  ] = DAIVaultAdaptor.strategies
  const [
    mockUSDCAlphaStrategy,
    mockUSDCBetaStrategy,
  ] = USDCVaultAdaptor.strategies
  const [
    mockUSDTAlphaStrategy,
    mockUSDTBetaStrategy,
  ] = USDTVaultAdaptor.strategies
  let systemAssets = {}
  systemAssets.totalAsset = await controller.totalAssets()
  systemAssets.gvtAsset = await controller.gTokenTotalAssets({
    from: gvt.address,
  })
  systemAssets.pwrdAsset = await controller.gTokenTotalAssets({
    from: pwrd.address,
  })
  systemAssets.gvtTotalSupply = await gvt.totalSupply()
  systemAssets.pwrdTotalSupply = await pwrd.totalSupply()
  systemAssets.lifeguardBufferUsd = await lifeguard.totalAssetsUsd()

  systemAssets.daiAdapterTotalAsset = await DAIVaultAdaptor.totalAssets()
  systemAssets.usdcAdapterTotalAsset = await USDCVaultAdaptor.totalAssets()
  systemAssets.usdtAdapterTotalAsset = await USDTVaultAdaptor.totalAssets()
  systemAssets.daiAdapterTotalAssetUsd = await buoy.stableToUsd([systemAssets.daiAdapterTotalAsset, 0, 0], true)
  systemAssets.usdcAdapterTotalAssetUsd = await buoy.stableToUsd([0, systemAssets.usdcAdapterTotalAsset, 0], true)
  systemAssets.usdtAdapterTotalAssetUsd = await buoy.stableToUsd([0, 0, systemAssets.usdtAdapterTotalAsset], true)
  systemAssets.daiVaultTotalAsset = await mockDAIVault.totalAssets()
  systemAssets.usdcVaultTotalAsset = await mockUSDCVault.totalAssets()
  systemAssets.usdtVaultTotalAsset = await mockUSDTVault.totalAssets()
  systemAssets.daiVaultBalance = await mockDAI.methods.balanceOf(mockDAIVault.address).call()
  systemAssets.usdcVaultBalance = await mockUSDC.methods.balanceOf(
    mockUSDCVault.address,
  ).call()
  systemAssets.usdtVaultBalance = await mockUSDT.methods.balanceOf(
    mockUSDTVault.address,
  ).call()
  systemAssets.daiVaultStrategy = {}
  let daiStrategies = systemAssets.daiVaultStrategy
  daiStrategies.alphaRatio = (
    await mockDAIVault.strategies(mockDAIAlphaStrategy.address)
  ).debtRatio
  daiStrategies.alphaBalance = await mockDAI.methods.balanceOf(
    mockDAIAlphaStrategy.address,
  ).call()
  daiStrategies.alpha = (
    await mockDAIVault.strategies(mockDAIAlphaStrategy.address)
  ).totalDebt
  daiStrategies.alphaUsd = await buoy.stableToUsd([daiStrategies.alpha, 0, 0], true)
  daiStrategies.curveRatio = (
    await mockDAIVault.strategies(mockDAIBetaStrategy.address)
  ).debtRatio
  daiStrategies.curveBalance = await mockDAI.methods.balanceOf(
    mockDAIBetaStrategy.address,
  ).call()
  daiStrategies.curve = (
    await mockDAIVault.strategies(mockDAIBetaStrategy.address)
  ).totalDebt
  daiStrategies.curveUsd = await buoy.stableToUsd([daiStrategies.curve, 0, 0], true)
  systemAssets.usdcVaultStrategy = {}
  let usdcStrategies = systemAssets.usdcVaultStrategy
  usdcStrategies.alphaRatio = (
    await mockUSDCVault.strategies(mockUSDCAlphaStrategy.address)
  ).debtRatio
  usdcStrategies.alphaBalance = await mockUSDC.methods.balanceOf(
    mockUSDCAlphaStrategy.address,
  ).call()
  usdcStrategies.alpha = (
    await mockUSDCVault.strategies(mockUSDCAlphaStrategy.address)
  ).totalDebt
  usdcStrategies.alphaUsd = await buoy.stableToUsd([0, usdcStrategies.alpha, 0], true)
  usdcStrategies.curveRatio = (
    await mockUSDCVault.strategies(mockUSDCBetaStrategy.address)
  ).debtRatio
  usdcStrategies.curveBalance = await mockUSDC.methods.balanceOf(
    mockUSDCBetaStrategy.address,
  ).call()
  usdcStrategies.curve = (
    await mockUSDCVault.strategies(mockUSDCBetaStrategy.address)
  ).totalDebt
  usdcStrategies.curveUsd = await buoy.stableToUsd([0, usdcStrategies.curve, 0], true)
  systemAssets.usdtVaultStrategy = {}
  let usdtStrategies = systemAssets.usdtVaultStrategy
  usdtStrategies.alphaRatio = (
    await mockUSDTVault.strategies(mockUSDTAlphaStrategy.address)
  ).debtRatio
  usdtStrategies.alphaBalance = await mockUSDT.methods.balanceOf(
    mockUSDTAlphaStrategy.address,
  ).call()
  usdtStrategies.alpha = (
    await mockUSDTVault.strategies(mockUSDTAlphaStrategy.address)
  ).totalDebt
  usdtStrategies.alphaUsd = await buoy.stableToUsd([0, 0, usdtStrategies.alpha], true)
  usdtStrategies.curveRatio = (
    await mockUSDTVault.strategies(mockUSDTBetaStrategy.address)
  ).debtRatio
  usdtStrategies.curveBalance = await mockUSDT.methods.balanceOf(
    mockUSDTBetaStrategy.address,
  ).call()
  usdtStrategies.curve = (
    await mockUSDTVault.strategies(mockUSDTBetaStrategy.address)
  ).totalDebt
  usdtStrategies.curveUsd = await buoy.stableToUsd([0, 0, usdtStrategies.curve], true)
  return systemAssets
}

function printSystemAsset(systemAsset) {
  console.log('=================== System Assets ===============')
  console.log('totalAsset : ' + systemAsset.totalAsset.toString())
  console.log('gvtAsset : ' + systemAsset.gvtAsset.toString())
  console.log('pwrdAsset : ' + systemAsset.pwrdAsset.toString())
  console.log('gvtTotalSupply : ' + systemAsset.gvtTotalSupply.toString())
  console.log('pwrdTotalSupply : ' + systemAsset.pwrdTotalSupply.toString())
  console.log('gvtFactor : ' + systemAsset.gvtFactor.toString())
  console.log('pwrdFactor : ' + systemAsset.pwrdFactor.toString())
  console.log(
    'lifeguardUsd : ' + systemAsset.lifeguardUsd.toString(),
  )
  console.log('lifeguardDaiBalance : ' + systemAsset.lifeguardDaiBalance.toString())
  console.log('lifeguardUsdcBalance : ' + systemAsset.lifeguardUsdcBalance.toString())
  console.log('lifeguardUsdtBalance : ' + systemAsset.lifeguardUsdtBalance.toString())
  console.log('lifeguardLptBalance : ' + systemAsset.lifeguardLptBalance.toString())

  console.log(
    'daiAdapterTotalAssetUsd : ' + systemAsset.daiAdapterTotalAssetUsd.toString(),
  )
  console.log(
    'usdcAdapterTotalAssetUsd : ' + systemAsset.usdcAdapterTotalAssetUsd.toString(),
  )
  console.log(
    'usdtAdapterTotalAssetUsd : ' + systemAsset.usdtAdapterTotalAssetUsd.toString(),
  )
  console.log(
    'curveAdapterTotalAssetUsd : ' + systemAsset.curveAdapterTotalAssetUsd.toString(),
  )

  console.log(
    'daiAdapterTotalAsset : ' + systemAsset.daiAdapterTotalAsset.toString(),
  )
  console.log(
    'usdcAdapterTotalAsset : ' + systemAsset.usdcAdapterTotalAsset.toString(),
  )
  console.log(
    'usdtAdapterTotalAsset : ' + systemAsset.usdtAdapterTotalAsset.toString(),
  )
  console.log(
    'curveAdapterTotalAsset : ' + systemAsset.curveAdapterTotalAsset.toString(),
  )

  console.log(
    'daiVaultTotalAsset : ' + systemAsset.daiVaultTotalAsset.toString(),
  )
  console.log(
    'usdcVaultTotalAsset : ' + systemAsset.usdcVaultTotalAsset.toString(),
  )
  console.log(
    'usdtVaultTotalAsset : ' + systemAsset.usdtVaultTotalAsset.toString(),
  )
  console.log(
    'curveVaultTotalAsset : ' + systemAsset.curveVaultTotalAsset.toString(),
  )

  console.log('daiVaultBalance : ' + systemAsset.daiVaultBalance.toString())
  console.log('usdcVaultBalance : ' + systemAsset.usdcVaultBalance.toString())
  console.log('usdtVaultBalance : ' + systemAsset.usdtVaultBalance.toString())
  console.log('curveVaultBalance : ' + systemAsset.curveVaultBalance.toString())

  console.log('daiAdapterBalance : ' + systemAsset.daiAdapterBalance.toString())
  console.log('usdcAdapterBalance : ' + systemAsset.usdcAdapterBalance.toString())
  console.log('usdtAdapterBalance : ' + systemAsset.usdtAdapterBalance.toString())
  console.log('curveAdapterBalance : ' + systemAsset.curveAdapterBalance.toString())

  console.log(
    'daiVaultStrategy.alphaRatio : ' +
    systemAsset.daiVaultStrategy.alphaRatio.toString(),
  )
  console.log(
    'daiVaultStrategy.curveRatio : ' + systemAsset.daiVaultStrategy.curveRatio.toString(),
  )
  console.log(
    'daiVaultStrategy.alphaRatio : ' +
    systemAsset.daiVaultStrategy.alphaRatio.toString(),
  )
  console.log(
    'daiVaultStrategy.curveRatio : ' + systemAsset.daiVaultStrategy.curveRatio.toString(),
  )
  console.log(
    'daiVaultStrategy.alpha : ' +
    systemAsset.daiVaultStrategy.alpha.toString(),
  )
  console.log(
    'daiVaultStrategy.curve : ' + systemAsset.daiVaultStrategy.curve.toString(),
  )
  console.log(
    'daiVaultStrategy.alphaUsd : ' +
    systemAsset.daiVaultStrategy.alphaUsd.toString(),
  )
  console.log(
    'daiVaultStrategy.curveUsd : ' + systemAsset.daiVaultStrategy.curveUsd.toString(),
  )
  console.log(
    'daiVaultStrategy.alphaBalance : ' +
    systemAsset.daiVaultStrategy.alphaBalance.toString(),
  )
  console.log(
    'daiVaultStrategy.curveBalance : ' +
    systemAsset.daiVaultStrategy.curveBalance.toString(),
  )
  console.log(
    'usdcVaultStrategy.alphaRatio : ' +
    systemAsset.usdcVaultStrategy.alphaRatio.toString(),
  )
  console.log(
    'usdcVaultStrategy.curveRatio : ' +
    systemAsset.usdcVaultStrategy.curveRatio.toString(),
  )
  console.log(
    'usdcVaultStrategy.alpha : ' +
    systemAsset.usdcVaultStrategy.alpha.toString(),
  )
  console.log(
    'usdcVaultStrategy.curve : ' +
    systemAsset.usdcVaultStrategy.curve.toString(),
  )
  console.log(
    'usdcVaultStrategy.alphaUsd : ' +
    systemAsset.usdcVaultStrategy.alphaUsd.toString(),
  )
  console.log(
    'usdcVaultStrategy.curveUsd : ' +
    systemAsset.usdcVaultStrategy.curveUsd.toString(),
  )
  console.log(
    'usdcVaultStrategy.alphaBalance : ' +
    systemAsset.usdcVaultStrategy.alphaBalance.toString(),
  )
  console.log(
    'usdcVaultStrategy.curveBalance : ' +
    systemAsset.usdcVaultStrategy.curveBalance.toString(),
  )
  console.log(
    'usdtVaultStrategy.alphaRatio : ' +
    systemAsset.usdtVaultStrategy.alphaRatio.toString(),
  )
  console.log(
    'usdtVaultStrategy.curveRatio : ' +
    systemAsset.usdtVaultStrategy.curveRatio.toString(),
  )
  console.log(
    'usdtVaultStrategy.alpha : ' +
    systemAsset.usdtVaultStrategy.alpha.toString(),
  )
  console.log(
    'usdtVaultStrategy.curve : ' +
    systemAsset.usdtVaultStrategy.curve.toString(),
  )
  console.log(
    'usdtVaultStrategy.alphaUsd : ' +
    systemAsset.usdtVaultStrategy.alphaUsd.toString(),
  )
  console.log(
    'usdtVaultStrategy.curveUsd : ' +
    systemAsset.usdtVaultStrategy.curveUsd.toString(),
  )
  console.log(
    'usdtVaultStrategy.alphaBalance : ' +
    systemAsset.usdtVaultStrategy.alphaBalance.toString(),
  )
  console.log(
    'usdtVaultStrategy.curveBalance : ' +
    systemAsset.usdtVaultStrategy.curveBalance.toString(),
  )
}

function compareSystemStrategyAsset(
  currentSystemState,
  expectedSysemState,
  deviation = 0
) {
  const attributes = [
    'daiVaultStrategy',
    'usdcVaultStrategy',
    'usdtVaultStrategy',
  ]
  let strategies, strategyKey
  for (let i = 0; i < attributes.length; i++) {
    let key = attributes[i]
    let baseNum = toBN(10).pow(toBN(18))
    if (key.indexOf('usdc') > 0 || key.indexOf('usdt') > 0) {
      baseNum = toBN(10).pow(toBN(6))
    }
    strategies = Object.keys(currentSystemState[key])
    for (let j = 0; j < strategies.length; j++) {
      strategyKey = strategies[j]
      if (strategyKey.endsWith('Usd')) {
        continue;
      }
      if (deviation && deviation > 0) {
        expect(
          expectedSysemState[key][strategyKey]
            .sub(currentSystemState[key][strategyKey])
            .abs(),
        ).to.be.a.bignumber.most(toBN(deviation).mul(baseNum))
      } else {
        expect(expectedSysemState[key][strategyKey]).to.be.a.bignumber.equal(
          currentSystemState[key][strategyKey],
        )
      }
    }
  }
}

async function getUserAssets(controller, userAccount) {
  const gvt = controller.gvt
  const pwrd = controller.pwrd
  const [mockDAI, mockUSDC, mockUSDT] = controller.underlyingTokens
  let userAssets = {}
  userAssets.daiBalance = await mockDAI.balanceOf(userAccount)
  userAssets.usdcBalance = await mockUSDC.balanceOf(userAccount)
  userAssets.usdtBalance = await mockUSDT.balanceOf(userAccount)
  userAssets.gvtBalance = await gvt.balanceOf(userAccount)
  userAssets.gvtAssets = await gvt.getAssets(userAccount)
  userAssets.pwrdBalance = await pwrd.balanceOf(userAccount)
  return userAssets
}

async function getUserAssetsMain(controller, userAccount) {
  const gvt = controller.gvt
  const pwrd = controller.pwrd
  const [mockDAI, mockUSDC, mockUSDT] = controller.underlyingTokens
  let userAssets = {}
  userAssets.daiBalance = toBN(await mockDAI.methods.balanceOf(userAccount).call())
  userAssets.usdcBalance = toBN(await mockUSDC.methods.balanceOf(userAccount).call())
  userAssets.usdtBalance = toBN(await mockUSDT.methods.balanceOf(userAccount).call())
  userAssets.gvtBalance = await gvt.balanceOf(userAccount)
  userAssets.gvtAssets = await gvt.getAssets(userAccount)
  userAssets.pwrdBalance = await pwrd.balanceOf(userAccount)
  return userAssets
}

function printUserAssets(userAssets) {
  console.log('=================== User Assets ===============')
  console.log('daiBalance : ' + userAssets.daiBalance.toString())
  console.log('usdcBalance : ' + userAssets.usdcBalance.toString())
  console.log('usdtBalance : ' + userAssets.usdtBalance.toString())
  console.log('gvtBalance : ' + userAssets.gvtBalance.toString())
  console.log('gvtAssets : ' + userAssets.gvtAssets.toString())
  console.log('pwrdBalance : ' + userAssets.pwrdBalance.toString())
}

function compareUserStableCoinAssets(
  preUserAssets,
  postUserAssets,
  variations,
  isAccurateCompare = false,
) {
  if (isAccurateCompare) {
    expect(
      postUserAssets.daiBalance.sub(preUserAssets.daiBalance).abs(),
    ).to.be.a.bignumber.equal(
      toBN(variations[0]).mul(daiBaseNum),
      "User's DAI balance compare failed.",
    )
    expect(
      postUserAssets.usdcBalance.sub(preUserAssets.usdcBalance).abs(),
    ).to.be.a.bignumber.equal(
      toBN(variations[1]).mul(usdcBaseNum),
      "User's USDC balance compare failed.",
    )
    expect(
      postUserAssets.usdtBalance.sub(preUserAssets.usdtBalance).abs(),
    ).to.be.a.bignumber.equal(
      toBN(variations[2]).mul(usdtBaseNum),
      "User's USDT balance compare failed.",
    )
  } else {
    expect(
      postUserAssets.daiBalance.sub(preUserAssets.daiBalance).abs(),
    ).to.be.a.bignumber.most(
      toBN(variations[0]).mul(daiBaseNum),
      "User's DAI balance compare failed.",
    )
    expect(
      postUserAssets.usdcBalance.sub(preUserAssets.usdcBalance).abs(),
    ).to.be.a.bignumber.most(
      toBN(variations[1]).mul(usdcBaseNum),
      "User's USDC balance compare failed.",
    )
    expect(
      postUserAssets.usdtBalance.sub(preUserAssets.usdtBalance).abs(),
    ).to.be.a.bignumber.most(
      toBN(variations[2]).mul(usdtBaseNum),
      "User's USDT balance compare failed.",
    )
  }
}

function compareUserGTokenAssets(preUserAssets, postUserAssets, variations) {
  console.log(postUserAssets.gvtAssets.toString())
  console.log(preUserAssets.gvtAssets.toString())
  console.log(postUserAssets.pwrdBalance.toString())
  console.log(preUserAssets.pwrdBalance.toString())
  expect(
    postUserAssets.gvtAssets.sub(preUserAssets.gvtAssets).abs(),
  ).to.be.a.bignumber.most(
    toBN(variations[0]).mul(lgBaseNum),
    "User's gvt token compare failed.",
  )
  expect(
    postUserAssets.pwrdBalance.sub(preUserAssets.pwrdBalance).abs(),
  ).to.be.a.bignumber.most(
    toBN(variations[1]).mul(lgBaseNum),
    "User's PWRD token compare failed.",
  )
}

function compareSystemAssetsExcludeFee(
  preSystemAssets,
  postSystemAssets,
  variations,
) {
  console.log('------compareSystemAssetsExcludeFee')
  console.log('pre: %s', preSystemAssets.lifeguardUsd)
  console.log('post: %s', postSystemAssets.lifeguardUsd)
  expect(
    postSystemAssets.lifeguardUsd
      .sub(preSystemAssets.lifeguardUsd)
      .abs(),
  ).to.be.a.bignumber.most(
    toBN(variations[0]).mul(lgBaseNum),
    'System lifeguard total asset compare failed.',
  )
  expect(
    postSystemAssets.totalAsset.sub(preSystemAssets.totalAsset).abs(),
  ).to.be.a.bignumber.most(
    toBN(variations[1]).mul(lgBaseNum),
    'System total Assets compare failed.',
  )
  expect(
    postSystemAssets.gvtAsset.sub(preSystemAssets.gvtAsset).abs(),
  ).to.be.a.bignumber.most(
    toBN(variations[2]).mul(lgBaseNum),
    'System gvt Assets compare failed.',
  )
  expect(
    postSystemAssets.pwrdAsset.sub(preSystemAssets.pwrdAsset).abs(),
  ).to.be.a.bignumber.most(
    toBN(variations[3]).mul(lgBaseNum),
    'System PWRD Assets compare failed.',
  )
}

function compareVaultAssets(
  preSystemAssets,
  postSystemAssets,
  variations,
  isAccurateCompare = false,
) {
  if (isAccurateCompare) {
    expect(
      postSystemAssets.daiVaultTotalAsset
        .sub(preSystemAssets.daiVaultTotalAsset)
        .abs(),
    ).to.be.a.bignumber.equal(
      toBN(variations[0]).mul(daiBaseNum),
      'DAI vault total asset compare failed.',
    )
    expect(
      postSystemAssets.usdcVaultTotalAsset
        .sub(preSystemAssets.usdcVaultTotalAsset)
        .abs(),
    ).to.be.a.bignumber.equal(
      toBN(variations[1]).mul(usdcBaseNum),
      'USDC vault total asset compare failed.',
    )
    expect(
      postSystemAssets.usdtVaultTotalAsset
        .sub(preSystemAssets.usdtVaultTotalAsset)
        .abs(),
    ).to.be.a.bignumber.equal(
      toBN(variations[2]).mul(usdtBaseNum),
      'USDT vault total asset compare failed.',
    )
  } else {
    expect(
      postSystemAssets.daiVaultTotalAsset
        .sub(preSystemAssets.daiVaultTotalAsset)
        .abs(),
    ).to.be.a.bignumber.most(
      toBN(variations[0]).mul(daiBaseNum),
      'DAI vault total asset compare failed.',
    )
    expect(
      postSystemAssets.usdcVaultTotalAsset
        .sub(preSystemAssets.usdcVaultTotalAsset)
        .abs(),
    ).to.be.a.bignumber.most(
      toBN(variations[1]).mul(usdcBaseNum),
      'USDC vault total asset compare failed.',
    )
    expect(
      postSystemAssets.usdtVaultTotalAsset
        .sub(preSystemAssets.usdtVaultTotalAsset)
        .abs(),
    ).to.be.a.bignumber.most(
      toBN(variations[2]).mul(usdtBaseNum),
      'USDT vault total asset compare failed.',
    )
  }
}

async function harvestStratgies(controller) {
  const [
    DAIVaultAdaptor,
    USDCVaultAdaptor,
    USDTVaultAdaptor,
  ] = controller.vaults
  const [
    mockDAIAlphaStrategy,
    mockDAIBetaStrategy,
  ] = DAIVaultAdaptor.strategies
  const [
    mockUSDCAlphaStrategy,
    mockUSDCBetaStrategy,
  ] = USDCVaultAdaptor.strategies
  const [
    mockUSDTAlphaStrategy,
    mockUSDTBetaStrategy,
  ] = USDTVaultAdaptor.strategies
  console.log('---------mockDAIAlphaStrategy')
  await mockDAIAlphaStrategy.harvest()
  console.log('---------mockDAIBetaStrategy')
  await mockDAIBetaStrategy.harvest()
  console.log('---------mockUSDCAlphaStrategy')
  await mockUSDCAlphaStrategy.harvest()
  console.log('---------mockUSDCBetaStrategy')
  await mockUSDCBetaStrategy.harvest()
  console.log('---------mockUSDTAlphaStrategy')
  await mockUSDTAlphaStrategy.harvest()
  console.log('---------mockUSDTBetaStrategy')
  await mockUSDTBetaStrategy.harvest()
}

async function investVaults(controller) {
  const [
    DAIVaultAdaptor,
    USDCVaultAdaptor,
    USDTVaultAdaptor,
  ] = controller.vaults
  const lifeguard = controller.lifeguard;
  console.log('---------InvestToDAIVaultAdaptor')
  await DAIVaultAdaptor.invest()
  console.log('---------InvestToUSDCVaultAdaptor')
  await USDCVaultAdaptor.invest()
  console.log('---------InvestToUSDTVaultAdaptor')
  await USDTVaultAdaptor.invest()
  console.log('---------InvestToCurveVault')
  await lifeguard.investToCurveVault();

}

module.exports = {
  expectBignumberBetween,
  expectBignumberBetweenInclude,
  expectBignumberPromiseCloseTo,
  expectBignumberPromiseEqual,
  decodeLogs,
  sumTotal,
  stableCoinsRatios,
  chai,
  expect,
  wait,
  encodeCall,
  thousandBaseNum,
  millionBaseNum,
  billionBaseNum,
  showRebalanceTriggerResult,
  compareStrategiesBalance,
  compareStrategeBalance,
  getSystemAssetsInfo,
  getSystemAssetsInfoMain,
  getUserAssets,
  getUserAssetsMain,
  compareSystemStrategyAsset,
  compareUserStableCoinAssets,
  compareUserGTokenAssets,
  compareSystemAssetsExcludeFee,
  compareVaultAssets,
  harvestStratgies,
  printUserAssets,
  printSystemAsset,
  investVaults,
  ZERO,
}
