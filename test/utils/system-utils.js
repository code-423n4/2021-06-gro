'use strict'

const { BN, toBN } = require('web3-utils')
const { expect } = require('./common-utils')

const stableCoinsRatios = {
    daiRatio: toBN(3800),
    usdcRatio: toBN(2600),
    usdtRatio: toBN(3600),
}

const getSystemInfo = async (controller) => {
    const lifeguard = controller.lifeguard
    const buoy = lifeguard.buoy
    const gvt = controller.gvt
    const pwrd = controller.pwrd
    const [DAI, USDC, USDT] = controller.underlyingTokens
    const LPT = lifeguard.lpt;
    const [
        DAIVaultAdaptor,
        USDCVaultAdaptor,
        USDTVaultAdaptor,
        CurveVaultAdaptor
    ] = controller.vaults
    const [DAIVault, USDCVault, USDTVault, CurveVault] = [
        DAIVaultAdaptor.vault,
        USDCVaultAdaptor.vault,
        USDTVaultAdaptor.vault,
        CurveVaultAdaptor.vault
    ]
    const [
        DAIAlphaStrategy,
        DAIBetaStrategy,
    ] = DAIVaultAdaptor.strategies;
    const [
        USDCAlphaStrategy,
        USDCBetaStrategy,
    ] = USDCVaultAdaptor.strategies;
    const [
        USDTAlphaStrategy,
        USDTBetaStrategy,
    ] = USDTVaultAdaptor.strategies;

    const [CurveAlphaStrategy] = CurveVaultAdaptor.strategies;

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
    systemAssets.lifeguardDaiBalance = await DAI.balanceOf(lifeguard.address)
    systemAssets.lifeguardUsdcBalance = await USDC.balanceOf(lifeguard.address)
    systemAssets.lifeguardUsdtBalance = await USDT.balanceOf(lifeguard.address)
    systemAssets.lifeguardLptBalance = await LPT.balanceOf(lifeguard.address)

    systemAssets.daiAdapterTotalAsset = await DAIVaultAdaptor.totalAssets()
    systemAssets.usdcAdapterTotalAsset = await USDCVaultAdaptor.totalAssets()
    systemAssets.usdtAdapterTotalAsset = await USDTVaultAdaptor.totalAssets()
    systemAssets.curveAdapterTotalAsset = await CurveVaultAdaptor.totalAssets()

    systemAssets.daiAdapterTotalAssetUsd = await buoy.singleStableToUsd(systemAssets.daiAdapterTotalAsset, 0)
    systemAssets.usdcAdapterTotalAssetUsd = await buoy.singleStableToUsd(systemAssets.usdcAdapterTotalAsset, 1)
    systemAssets.usdtAdapterTotalAssetUsd = await buoy.singleStableToUsd(systemAssets.usdtAdapterTotalAsset, 2)
    systemAssets.curveAdapterTotalAssetUsd = await buoy.lpToUsd(systemAssets.curveAdapterTotalAsset)

    systemAssets.daiVaultTotalAsset = await DAIVault.totalAssets()
    systemAssets.usdcVaultTotalAsset = await USDCVault.totalAssets()
    systemAssets.usdtVaultTotalAsset = await USDTVault.totalAssets()
    systemAssets.curveVaultTotalAsset = await CurveVault.totalAssets()

    systemAssets.daiVaultBalance = await DAI.balanceOf(DAIVault.address)
    systemAssets.usdcVaultBalance = await USDC.balanceOf(USDCVault.address)
    systemAssets.usdtVaultBalance = await USDT.balanceOf(USDTVault.address)
    systemAssets.curveVaultBalance = await LPT.balanceOf(CurveVault.address)

    systemAssets.daiAdapterBalance = await DAI.balanceOf(DAIVaultAdaptor.address)
    systemAssets.usdcAdapterBalance = await USDC.balanceOf(USDCVaultAdaptor.address)
    systemAssets.usdtAdapterBalance = await USDT.balanceOf(USDTVaultAdaptor.address)
    systemAssets.curveAdapterBalance = await LPT.balanceOf(CurveVaultAdaptor.address)

    systemAssets.daiVaultStrategy = {}
    let daiStrategies = systemAssets.daiVaultStrategy
    daiStrategies.alphaRatio = (
        await DAIVault.strategies(DAIAlphaStrategy.address)
    ).debtRatio
    daiStrategies.alphaBalance = await DAI.balanceOf(
        DAIAlphaStrategy.address,
    )
    daiStrategies.alpha = (
        await DAIVault.strategies(DAIAlphaStrategy.address)
    ).totalDebt
    daiStrategies.alphaUsd = await buoy.singleStableToUsd(daiStrategies.alpha, 0);
    daiStrategies.betaRatio = (
        await DAIVault.strategies(DAIBetaStrategy.address)
    ).debtRatio
    daiStrategies.betaBalance = await DAI.balanceOf(
        DAIBetaStrategy.address,
    )
    daiStrategies.beta = (
        await DAIVault.strategies(DAIBetaStrategy.address)
    ).totalDebt
    daiStrategies.betaUsd = await buoy.singleStableToUsd(daiStrategies.beta, 0)

    systemAssets.usdcVaultStrategy = {}
    let usdcStrategies = systemAssets.usdcVaultStrategy
    usdcStrategies.alphaRatio = (
        await USDCVault.strategies(USDCAlphaStrategy.address)
    ).debtRatio
    usdcStrategies.alphaBalance = await USDC.balanceOf(
        USDCAlphaStrategy.address,
    )
    usdcStrategies.alpha = (
        await USDCVault.strategies(USDCAlphaStrategy.address)
    ).totalDebt
    usdcStrategies.alphaUsd = await buoy.singleStableToUsd(usdcStrategies.alpha, 1)
    usdcStrategies.betaRatio = (
        await USDCVault.strategies(USDCBetaStrategy.address)
    ).debtRatio
    usdcStrategies.betaBalance = await USDC.balanceOf(
        USDCBetaStrategy.address,
    )
    usdcStrategies.beta = (
        await USDCVault.strategies(USDCBetaStrategy.address)
    ).totalDebt
    usdcStrategies.betaUsd = await buoy.singleStableToUsd(usdcStrategies.beta, 1)

    systemAssets.usdtVaultStrategy = {}
    let usdtStrategies = systemAssets.usdtVaultStrategy
    usdtStrategies.alphaRatio = (
        await USDTVault.strategies(USDTAlphaStrategy.address)
    ).debtRatio
    usdtStrategies.alphaBalance = await USDT.balanceOf(
        USDTAlphaStrategy.address,
    )
    usdtStrategies.alpha = (
        await USDTVault.strategies(USDTAlphaStrategy.address)
    ).totalDebt
    usdtStrategies.alphaUsd = await buoy.singleStableToUsd(usdtStrategies.alpha, 2)
    usdtStrategies.betaRatio = (
        await USDTVault.strategies(USDTBetaStrategy.address)
    ).debtRatio
    usdtStrategies.betaBalance = await USDT.balanceOf(
        USDTBetaStrategy.address,
    )
    usdtStrategies.beta = (
        await USDTVault.strategies(USDTBetaStrategy.address)
    ).totalDebt
    usdtStrategies.betaUsd = await buoy.singleStableToUsd(usdtStrategies.beta, 2)

    systemAssets.curveVaultStrategy = {}
    let curveStrategies = systemAssets.curveVaultStrategy
    curveStrategies.alphaRatio = (
        await CurveVault.strategies(CurveAlphaStrategy.address)
    ).debtRatio
    curveStrategies.alphaBalance = await LPT.balanceOf(
        CurveAlphaStrategy.address,
    )
    curveStrategies.alpha = (
        await CurveVault.strategies(CurveAlphaStrategy.address)
    ).totalDebt
    curveStrategies.alphaUsd = await buoy.singleStableToUsd(curveStrategies.alpha, 2)

    return systemAssets
}

const getUserInfo = async (controller, userAccount) => {
    const gvt = controller.gvt
    const pwrd = controller.pwrd
    const [DAI, USDC, USDT] = controller.underlyingTokens
    let userAssets = {}
    userAssets.daiBalance = await DAI.balanceOf(userAccount)
    userAssets.usdcBalance = await USDC.balanceOf(userAccount)
    userAssets.usdtBalance = await USDT.balanceOf(userAccount)
    userAssets.gvtBalance = await gvt.balanceOf(userAccount)
    userAssets.gvtAssets = await gvt.getAssets(userAccount)
    userAssets.pwrdBalance = await pwrd.balanceOf(userAccount)
    userAssets.pwrdAssets = await pwrd.getAssets(userAccount)
    return userAssets
}

const printSystemInfo = (systemAsset) => {
    console.log('=================== System Assets ===============')
    console.log('totalAsset : ' + systemAsset.totalAsset)
    console.log('gvtAsset : ' + systemAsset.gvtAsset)
    console.log('pwrdAsset : ' + systemAsset.pwrdAsset)
    console.log('gvtTotalSupply : ' + systemAsset.gvtTotalSupply)
    console.log('pwrdTotalSupply : ' + systemAsset.pwrdTotalSupply)
    console.log('gvtFactor : ' + systemAsset.gvtFactor)
    console.log('pwrdFactor : ' + systemAsset.pwrdFactor)
    console.log(
        'lifeguardUsd : ' + systemAsset.lifeguardUsd,
    )
    console.log('lifeguardDaiBalance : ' + systemAsset.lifeguardDaiBalance)
    console.log('lifeguardUsdcBalance : ' + systemAsset.lifeguardUsdcBalance)
    console.log('lifeguardUsdtBalance : ' + systemAsset.lifeguardUsdtBalance)
    console.log('lifeguardLptBalance : ' + systemAsset.lifeguardLptBalance)

    console.log(
        'daiAdapterTotalAssetUsd : ' + systemAsset.daiAdapterTotalAssetUsd,
    )
    console.log(
        'usdcAdapterTotalAssetUsd : ' + systemAsset.usdcAdapterTotalAssetUsd,
    )
    console.log(
        'usdtAdapterTotalAssetUsd : ' + systemAsset.usdtAdapterTotalAssetUsd,
    )
    console.log(
        'curveAdapterTotalAssetUsd : ' + systemAsset.curveAdapterTotalAssetUsd,
    )

    console.log(
        'daiAdapterTotalAsset : ' + systemAsset.daiAdapterTotalAsset,
    )
    console.log(
        'usdcAdapterTotalAsset : ' + systemAsset.usdcAdapterTotalAsset,
    )
    console.log(
        'usdtAdapterTotalAsset : ' + systemAsset.usdtAdapterTotalAsset,
    )
    console.log(
        'curveAdapterTotalAsset : ' + systemAsset.curveAdapterTotalAsset,
    )

    console.log(
        'daiVaultTotalAsset : ' + systemAsset.daiVaultTotalAsset,
    )
    console.log(
        'usdcVaultTotalAsset : ' + systemAsset.usdcVaultTotalAsset,
    )
    console.log(
        'usdtVaultTotalAsset : ' + systemAsset.usdtVaultTotalAsset,
    )
    console.log(
        'curveVaultTotalAsset : ' + systemAsset.curveVaultTotalAsset,
    )

    console.log('daiVaultBalance : ' + systemAsset.daiVaultBalance)
    console.log('usdcVaultBalance : ' + systemAsset.usdcVaultBalance)
    console.log('usdtVaultBalance : ' + systemAsset.usdtVaultBalance)
    console.log('curveVaultBalance : ' + systemAsset.curveVaultBalance)

    console.log('daiAdapterBalance : ' + systemAsset.daiAdapterBalance)
    console.log('usdcAdapterBalance : ' + systemAsset.usdcAdapterBalance)
    console.log('usdtAdapterBalance : ' + systemAsset.usdtAdapterBalance)
    console.log('curveAdapterBalance : ' + systemAsset.curveAdapterBalance)

    console.log(
        'daiVaultStrategy.alphaRatio : ' +
        systemAsset.daiVaultStrategy.alphaRatio,
    )
    console.log(
        'daiVaultStrategy.betaRatio : ' + systemAsset.daiVaultStrategy.betaRatio,
    )
    console.log(
        'daiVaultStrategy.alpha : ' +
        systemAsset.daiVaultStrategy.alpha,
    )
    console.log(
        'daiVaultStrategy.beta : ' + systemAsset.daiVaultStrategy.beta,
    )
    console.log(
        'daiVaultStrategy.alphaUsd : ' +
        systemAsset.daiVaultStrategy.alphaUsd,
    )
    console.log(
        'daiVaultStrategy.betaUsd : ' + systemAsset.daiVaultStrategy.betaUsd,
    )
    console.log(
        'daiVaultStrategy.alphaBalance : ' +
        systemAsset.daiVaultStrategy.alphaBalance,
    )
    console.log(
        'daiVaultStrategy.betaBalance : ' +
        systemAsset.daiVaultStrategy.betaBalance,
    )

    console.log(
        'usdcVaultStrategy.alphaRatio : ' +
        systemAsset.usdcVaultStrategy.alphaRatio,
    )
    console.log(
        'usdcVaultStrategy.betaRatio : ' +
        systemAsset.usdcVaultStrategy.betaRatio,
    )
    console.log(
        'usdcVaultStrategy.alpha : ' +
        systemAsset.usdcVaultStrategy.alpha,
    )
    console.log(
        'usdcVaultStrategy.beta : ' +
        systemAsset.usdcVaultStrategy.beta,
    )
    console.log(
        'usdcVaultStrategy.alphaUsd : ' +
        systemAsset.usdcVaultStrategy.alphaUsd,
    )
    console.log(
        'usdcVaultStrategy.betaUsd : ' +
        systemAsset.usdcVaultStrategy.betaUsd,
    )
    console.log(
        'usdcVaultStrategy.alphaBalance : ' +
        systemAsset.usdcVaultStrategy.alphaBalance,
    )
    console.log(
        'usdcVaultStrategy.betaBalance : ' +
        systemAsset.usdcVaultStrategy.betaBalance,
    )

    console.log(
        'usdtVaultStrategy.alphaRatio : ' +
        systemAsset.usdtVaultStrategy.alphaRatio,
    )
    console.log(
        'usdtVaultStrategy.betaRatio : ' +
        systemAsset.usdtVaultStrategy.betaRatio,
    )
    console.log(
        'usdtVaultStrategy.alpha : ' +
        systemAsset.usdtVaultStrategy.alpha,
    )
    console.log(
        'usdtVaultStrategy.beta : ' +
        systemAsset.usdtVaultStrategy.beta,
    )
    console.log(
        'usdtVaultStrategy.alphaUsd : ' +
        systemAsset.usdtVaultStrategy.alphaUsd,
    )
    console.log(
        'usdtVaultStrategy.betaUsd : ' +
        systemAsset.usdtVaultStrategy.betaUsd,
    )
    console.log(
        'usdtVaultStrategy.alphaBalance : ' +
        systemAsset.usdtVaultStrategy.alphaBalance,
    )
    console.log(
        'usdtVaultStrategy.betaBalance : ' +
        systemAsset.usdtVaultStrategy.betaBalance,
    )

    console.log(
        'curveVaultStrategy.alphaRatio : ' +
        systemAsset.curveVaultStrategy.alphaRatio,
    )
    console.log(
        'curveVaultStrategy.alpha : ' +
        systemAsset.curveVaultStrategy.alpha,
    )
    console.log(
        'curveVaultStrategy.alphaUsd : ' +
        systemAsset.curveVaultStrategy.alphaUsd,
    )
    console.log(
        'curveVaultStrategy.alphaBalance : ' +
        systemAsset.curveVaultStrategy.alphaBalance,
    )
}

const printUserInfo = (userAssets) => {
    console.log('=================== User Assets ===============')
    console.log('daiBalance : ' + userAssets.daiBalance)
    console.log('usdcBalance : ' + userAssets.usdcBalance)
    console.log('usdtBalance : ' + userAssets.usdtBalance)
    console.log('gvtBalance : ' + userAssets.gvtBalance)
    console.log('gvtAssets : ' + userAssets.gvtAssets)
    console.log('pwrdBalance : ' + userAssets.pwrdBalance)
}

const compareSystemInfo = (
    preSystemInfo,
    postSystemInfo,
    variations,
) => {
    expect(
        postSystemInfo.lifeguardUsd
            .sub(preSystemInfo.lifeguardUsd)
            .abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[0]),
        'System lifeguard total asset compare failed.',
    )
    expect(
        postSystemInfo.totalAsset.sub(preSystemInfo.totalAsset).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[1]),
        'System total Assets compare failed.',
    )
    expect(
        postSystemInfo.gvtAsset.sub(preSystemInfo.gvtAsset).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[2]),
        'System gvt Assets compare failed.',
    )
    expect(
        postSystemInfo.pwrdAsset.sub(preSystemInfo.pwrdAsset).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[3]),
        'System PWRD Assets compare failed.',
    )
    if (variations.length > 4) {
        expect(
            postSystemInfo.gvtFactor.sub(preSystemInfo.gvtFactor).abs(),
        ).to.be.a.bignumber.most(
            toBN(variations[4]),
            'System GVT factor compare failed.',
        )
    }
    if (variations.length > 5) {
        expect(
            postSystemInfo.pwrdFactor.sub(preSystemInfo.pwrdFactor).abs(),
        ).to.be.a.bignumber.most(
            toBN(variations[5]),
            'System PWRD factor compare failed.',
        )
    }
}

const compareAdapters = (
    preSystemInfo,
    postSystemInfo,
    variations,
) => {
    expect(
        postSystemInfo.daiAdapterTotalAsset
            .sub(preSystemInfo.daiAdapterTotalAsset)
            .abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[0]),
        'DAIAdaptor total asset compare failed.',
    )
    expect(
        postSystemInfo.usdcAdapterTotalAsset.sub(preSystemInfo.usdcAdapterTotalAsset).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[1]),
        'USDCAdapter total Assets compare failed.',
    )
    expect(
        postSystemInfo.usdtAdapterTotalAsset.sub(preSystemInfo.usdtAdapterTotalAsset).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[2]),
        'USDTAdapter gvt Assets compare failed.',
    )
}

const compareUserStableCoins = (
    preUserInfo,
    postUserInfo,
    variations
) => {
    expect(
        postUserInfo.daiBalance.sub(preUserInfo.daiBalance).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[0]),
        "User's DAI balance compare failed.",
    )
    expect(
        postUserInfo.usdcBalance.sub(preUserInfo.usdcBalance).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[1]),
        "User's USDC balance compare failed.",
    )
    expect(
        postUserInfo.usdtBalance.sub(preUserInfo.usdtBalance).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[2]),
        "User's USDT balance compare failed.",
    )
}

const compareUserGTokens = (preUserInfo, postUserInfo, variations) => {
    expect(
        postUserInfo.gvtAssets.sub(preUserInfo.gvtAssets).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[0]),
        "User's gvt token compare failed.",
    )
    expect(
        postUserInfo.pwrdBalance.sub(preUserInfo.pwrdBalance).abs(),
    ).to.be.a.bignumber.most(
        toBN(variations[1]),
        "User's PWRD token compare failed.",
    )
}

module.exports = {
    getSystemInfo,
    getUserInfo,
    printSystemInfo,
    printUserInfo,
    compareSystemInfo,
    compareAdapters,
    compareUserStableCoins,
    compareUserGTokens,
    stableCoinsRatios,
}
