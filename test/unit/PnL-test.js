const PnL = artifacts.require('PnL')
const MockController = artifacts.require('MockController')
const MockDAI = artifacts.require('MockDAI');
const MockUSDC = artifacts.require('MockUSDC');
const MockUSDT = artifacts.require('MockUSDT');
const MockLPToken = artifacts.require('MockLPToken');
const MockVaultAdaptor = artifacts.require('MockVaultAdaptor')
const MockLifeGuard = artifacts.require('MockLifeGuard')
const MockBuoy = artifacts.require('MockBuoy');
const MockGvtToken = artifacts.require('MockGvtToken')
const MockPWRD = artifacts.require('MockPWRDToken')
const { expect, thousandBaseNum, millionBaseNum, } = require('../utils/common-utils')
const { toBN, BN } = require('web3-utils')
const { distributeProfit } = require('../utils/pnl-utils');

contract('PnL Test', function (accounts) {
	const decimals = ['1000000000000000000', '1000000', '1000000'];
    const [deployer, governance,] = accounts;

    const lifeGuardBase = new BN(10).pow(new BN(18));

    let pnl, mockController, mockLifeGuard, mockBuoy, mockGvt, mockPWRD,
        daiBaseNum, usdcBaseNum, usdtBaseNum,
        mockDAI, mockUSDC, mockUSDT, mock3Crv,
        mockDAIVault, mockUSDCVault, mockUSDTVault, mockCurveVault, vaults;

    beforeEach(async function () {
        mockController = await MockController.new();

        mockGvt = await MockGvtToken.new();
        mockPWRD = await MockPWRD.new();
        await mockGvt.transferOwnership(mockController.address);
        await mockPWRD.transferOwnership(mockController.address);

        mockDAI = await MockDAI.new();
        mockUSDC = await MockUSDC.new();
        mockUSDT = await MockUSDT.new();
        mock3Crv = await MockLPToken.new();
        mockDAIVault = await MockVaultAdaptor.new();
        mockUSDCVault = await MockVaultAdaptor.new();
        mockUSDTVault = await MockVaultAdaptor.new();
        mockCurveVault = await MockVaultAdaptor.new();
        vaults = [mockDAIVault, mockUSDCVault, mockUSDTVault];
		tokens = [mockDAI.address, mockUSDC.address, mockUSDT.address];

        pnl = await PnL.new(mockPWRD.address, mockGvt.address);
        await pnl.setController(mockController.address);
        await pnl.addToWhitelist(mockController.address);
        await mockController.setPnL(pnl.address);
        await mockDAIVault.setUnderlyingToken(mockDAI.address);
        await mockUSDCVault.setUnderlyingToken(mockUSDC.address);
        await mockUSDTVault.setUnderlyingToken(mockUSDT.address);
        await mockCurveVault.setUnderlyingToken(mock3Crv.address);
        await mockController.setUnderlyingTokens([mockDAI.address, mockUSDC.address, mockUSDT.address]);
        await mockController.setVault(0, mockDAIVault.address);
        await mockController.setVault(1, mockUSDCVault.address);
        await mockController.setVault(2, mockUSDTVault.address);
        await mockController.setCurveVault(mockCurveVault.address);
        await mockController.setGVT(mockGvt.address);
        await mockController.setPWRD(mockPWRD.address);

        mockLifeGuard = await MockLifeGuard.new();
        mockBuoy = await MockBuoy.new();
        await mockLifeGuard.setBuoy(mockBuoy.address);
        await mockLifeGuard.setStablecoins([mockDAI.address, mockUSDC.address, mockUSDT.address]);
        await mockController.setLifeGuard(mockLifeGuard.address);

        daiBaseNum = new BN(10).pow(await mockDAI.decimals());
        usdcBaseNum = new BN(10).pow(await mockUSDC.decimals());
        usdtBaseNum = new BN(10).pow(await mockUSDT.decimals());
        crvBaseNum = new BN(10).pow(await mock3Crv.decimals());
    })

    describe('calcPnL', function () {
        it('ok', async function () {
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(50).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(150).mul(thousandBaseNum).mul(lifeGuardBase))

            const res = await pnl.calcPnL()
            // console.log("gvtAssets: " + res[0])
            // console.log("pwrdAssets: " + res[1])
            // console.log("totalAssets: " + await mockController.totalAssets())
            expect(res[0]).to.be.a.bignumber.closeTo(
                toBN(100).mul(thousandBaseNum).mul(lifeGuardBase), toBN(1));
            return expect(res[1]).to.be.a.bignumber.closeTo(
                toBN(50).mul(thousandBaseNum).mul(lifeGuardBase), toBN(1));
        })
    })

    describe('execPnL', function () {
        it('revert when invalid caller address', async function () {
            return expect(pnl.execPnL(0, { from: governance }))
                .to.be.rejectedWith('only whitelist');
        })

        it('ok when gain and ratio < 80%', async function () {
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(50).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(150).mul(thousandBaseNum).mul(lifeGuardBase))

            const profitAmounts = [
                toBN(1).mul(thousandBaseNum).mul(daiBaseNum),
                toBN(1).mul(thousandBaseNum).mul(usdcBaseNum),
                toBN(1).mul(thousandBaseNum).mul(usdtBaseNum),
            ];

            for (let i = 0; i < vaults.length; i++) {
                await vaults[i].setGain(profitAmounts[i]);
            }

            const profit = await mockBuoy.stableToUsd(profitAmounts, true);

            const totalAssets = await mockController.totalAssets();
            await mockController.setTotalAssets(totalAssets.add(profit));

            const lastGVTAssets = await pnl.lastGvtAssets();
            const lastPWRDAssets = await pnl.lastPwrdAssets();
            const [expectGVTAssets, expectPWRDAssets] = distributeProfit(
                profit, lastGVTAssets, lastPWRDAssets);

            await mockController.execPnL(0);
            const res = await pnl.calcPnL()
            // console.log("expectGVTAssets: " + expectGVTAssets)
            // console.log("expectPWRDAssets: " + expectPWRDAssets)
            // console.log("gvtAssets: " + res[0])
            // console.log("pwrdAssets: " + res[1])
            // console.log("totalAssets: " + await mockController.totalAssets())

            expect(expectGVTAssets).to.be.a.bignumber.closeTo(res[0], toBN(1));
            return expect(expectPWRDAssets).to.be.a.bignumber.closeTo(res[1], toBN(1));
        })

        it('ok when gain and ratio >= 80%', async function () {
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(85).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(185).mul(thousandBaseNum).mul(lifeGuardBase))

            const profitAmounts = [
                toBN(5).mul(thousandBaseNum).mul(daiBaseNum),
                0,
                0,
            ];

            for (let i = 0; i < profitAmounts.length; i++) {
                if (profitAmounts[i] > 0) {
                    await vaults[i].setGain(profitAmounts[i]);
                }
            }

            const profit = await mockBuoy.stableToUsd(profitAmounts, true);

            const totalAssets = await mockController.totalAssets();
            await mockController.setTotalAssets(totalAssets.add(profit));

            const lastGVTAssets = await pnl.lastGvtAssets();
            const lastPWRDAssets = await pnl.lastPwrdAssets();
            const [expectGVTAssets, expectPWRDAssets] = distributeProfit(
                profit, lastGVTAssets, lastPWRDAssets);

            await mockController.execPnL(0);
            const res = await pnl.calcPnL()
            // console.log("expectGVTAssets: " + expectGVTAssets)
            // console.log("expectPWRDAssets: " + expectPWRDAssets)
            // console.log("gvtAssets: " + res[0])
            // console.log("pwrdAssets: " + res[1])
            // console.log("totalAssets: " + await mockController.totalAssets())

            expect(expectGVTAssets).to.be.a.bignumber.closeTo(res[0], toBN(1));
            return expect(expectPWRDAssets).to.be.a.bignumber.closeTo(res[1], toBN(1));
        })

        it('ok when loss <= gvt assets', async function () {
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(85).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(185).mul(thousandBaseNum).mul(lifeGuardBase))

            const lossAmounts = [
                toBN(10).mul(thousandBaseNum).mul(daiBaseNum),
                toBN(10).mul(thousandBaseNum).mul(usdcBaseNum),
                0,
            ];

            for (let i = 0; i < lossAmounts.length; i++) {
                if (lossAmounts[i] > 0) {
                    await vaults[i].setLoss(lossAmounts[i]);
                }
            }

            const loss = await mockBuoy.stableToUsd(lossAmounts, true);

            const totalAssets = await mockController.totalAssets();
            await mockController.setTotalAssets(totalAssets.sub(loss));

            const lastGVTAssets = await pnl.lastGvtAssets();
            const lastPWRDAssets = await pnl.lastPwrdAssets();
            const expectGVTAssets = lastGVTAssets.sub(loss);
            const expectPWRDAssets = lastPWRDAssets;

            await mockController.execPnL(0);
            const res = await pnl.calcPnL()
            // console.log("expectGVTAssets: " + expectGVTAssets)
            // console.log("expectPWRDAssets: " + expectPWRDAssets)
            // console.log("gvtAssets: " + res[0])
            // console.log("pwrdAssets: " + res[1])
            // console.log("totalAssets: " + await mockController.totalAssets())

            expect(expectGVTAssets).to.be.a.bignumber.closeTo(res[0], toBN(1));
            return expect(expectPWRDAssets).to.be.a.bignumber.closeTo(res[1], toBN(1));
        })

        it('ok when loss > gvt assets', async function () {
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(50).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(150).mul(thousandBaseNum).mul(lifeGuardBase))

            const lossAmounts = [
                toBN(40).mul(thousandBaseNum).mul(daiBaseNum),
                toBN(40).mul(thousandBaseNum).mul(usdcBaseNum),
                toBN(40).mul(thousandBaseNum).mul(usdtBaseNum),
            ];

            for (let i = 0; i < lossAmounts.length; i++) {
                if (lossAmounts[i] > 0) {
                    await vaults[i].setLoss(lossAmounts[i]);
                }
            }

            const loss = await mockBuoy.stableToUsd(lossAmounts, true);

            const totalAssets = await mockController.totalAssets();
            await mockController.setTotalAssets(totalAssets.sub(loss));

            const lastGVTAssets = await pnl.lastGvtAssets();
            const lastPWRDAssets = await pnl.lastPwrdAssets();
            const expectGVTAssets = toBN(1).mul(lifeGuardBase);
            const expectPWRDAssets = lastPWRDAssets.sub(loss.add(toBN(1).mul(lifeGuardBase)).sub(lastGVTAssets));

            await mockController.execPnL(0);
            const res = await pnl.calcPnL()
            // console.log("expectGVTAssets: " + expectGVTAssets)
            // console.log("expectPWRDAssets: " + expectPWRDAssets)
            // console.log("gvtAssets: " + res[0])
            // console.log("pwrdAssets: " + res[1])
            // console.log("totalAssets: " + await mockController.totalAssets())

            expect(expectGVTAssets).to.be.a.bignumber.closeTo(res[0], toBN(1));
            return expect(expectPWRDAssets).to.be.a.bignumber.closeTo(res[1], toBN(1));
        })
    })

    describe('pnlTrigger', function () {
        it('should true when loss > threshold', async function () {
            await pnl.setLossPercentThreshold(1000);
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(85).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(185).mul(thousandBaseNum).mul(lifeGuardBase))

            const lossAmounts = [
                toBN(10).mul(thousandBaseNum).mul(daiBaseNum),
                toBN(10).mul(thousandBaseNum).mul(usdcBaseNum),
                0,
            ];

            for (let i = 0; i < lossAmounts.length; i++) {
                if (lossAmounts[i] > 0) {
                    await vaults[i].setLoss(lossAmounts[i]);
                }
            }
            // console.log("pnl.pnlTrigger: " + await pnl.pnlTrigger())

            return expect(pnl.pnlTrigger()).to.eventually.equal(true);
        })

        it('should false when loss < threshold', async function () {
            await pnl.setLossPercentThreshold(1500);
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(85).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(185).mul(thousandBaseNum).mul(lifeGuardBase))

            const lossAmounts = [
                toBN(10).mul(thousandBaseNum).mul(daiBaseNum),
                toBN(10).mul(thousandBaseNum).mul(usdcBaseNum),
                0,
            ];

            for (let i = 0; i < lossAmounts.length; i++) {
                if (lossAmounts[i] > 0) {
                    await vaults[i].setLoss(lossAmounts[i]);
                }
            }
            // console.log("pnl.pnlTrigger: " + await pnl.pnlTrigger())

            return expect(pnl.pnlTrigger()).to.eventually.equal(false);
        })

        it('should true when gain > threshold', async function () {
            await pnl.setGainPercentThreshold(500);
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(85).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(185).mul(thousandBaseNum).mul(lifeGuardBase))

            const gainAmounts = [
                toBN(10).mul(thousandBaseNum).mul(daiBaseNum),
                0,
                0,
            ];

            for (let i = 0; i < gainAmounts.length; i++) {
                if (gainAmounts[i] > 0) {
                    await vaults[i].setGain(gainAmounts[i]);
                }
            }
            // console.log("pnl.pnlTrigger: " + await pnl.pnlTrigger())

            return expect(pnl.pnlTrigger()).to.eventually.equal(true);
        })

        it('should true when gain < threshold', async function () {
            await pnl.setGainPercentThreshold(1000);
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(85).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(185).mul(thousandBaseNum).mul(lifeGuardBase))

            const gainAmounts = [
                toBN(10).mul(thousandBaseNum).mul(daiBaseNum),
                0,
                0,
            ];

            for (let i = 0; i < gainAmounts.length; i++) {
                if (gainAmounts[i] > 0) {
                    await vaults[i].setGain(gainAmounts[i]);
                }
            }
            // console.log("pnl.pnlTrigger: " + await pnl.pnlTrigger())

            return expect(pnl.pnlTrigger()).to.eventually.equal(false);
        })
    })

    describe('totalAssetsChangeTrigger', function () {
        it('should true when total assets > last total assets', async function () {
            await pnl.setTotalAssetsPercentThreshold(1000);
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(80).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(360).mul(thousandBaseNum).mul(lifeGuardBase))

            // console.log("pnl.pnlTrigger: " + await pnl.totalAssetsChangeTrigger())

            await expect(pnl.totalAssetsChangeTrigger()).to.eventually.equal(true);

            await mockController.execPnL(0);
            const result = await pnl.calcPnL();
            // console.log('result[0]: ' + result[0]);
            // console.log('result[1]: ' + result[1]);
            await expect(result[0]).to.be.a.bignumber.equal(toBN(280).mul(thousandBaseNum).mul(lifeGuardBase));
            return expect(result[1]).to.be.a.bignumber.equal(toBN(80).mul(thousandBaseNum).mul(lifeGuardBase));
        })

        it('should true when total assets > last total assets', async function () {
            await pnl.setTotalAssetsPercentThreshold(1000);
            await mockController.increaseGTokenLastAmount(mockGvt.address, toBN(100).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.increaseGTokenLastAmount(mockPWRD.address, toBN(80).mul(thousandBaseNum).mul(lifeGuardBase))
            await mockController.setTotalAssets(toBN(90).mul(thousandBaseNum).mul(lifeGuardBase))

            // console.log("pnl.pnlTrigger: " + await pnl.totalAssetsChangeTrigger())

            await expect(pnl.totalAssetsChangeTrigger()).to.eventually.equal(true);

            await mockController.execPnL(0);
            const result = await pnl.calcPnL();
            // console.log('result[0]: ' + result[0]);
            // console.log('result[1]: ' + result[1]);
            await expect(result[0]).to.be.a.bignumber.equal(toBN(10).mul(thousandBaseNum).mul(lifeGuardBase));
            return expect(result[1]).to.be.a.bignumber.equal(toBN(80).mul(thousandBaseNum).mul(lifeGuardBase));
        })
    })
})
