const WithdrawHandler = artifacts.require('WithdrawHandler');
const EmergencyHandler = artifacts.require('EmergencyHandler');
const DepositHandler = artifacts.require('DepositHandler');
const Controller = artifacts.require('Controller');
const MockGvtTokenToken = artifacts.require('MockGvtToken');
const MockPWRDToken = artifacts.require('MockPWRDToken');
const MockDAI = artifacts.require('MockDAI');
const MockUSDC = artifacts.require('MockUSDC');
const MockUSDT = artifacts.require('MockUSDT');
const MockVaultAdaptor = artifacts.require('MockVaultAdaptor');
const MockLifeGuard = artifacts.require('MockLifeGuard');
const MockBuoy = artifacts.require('MockBuoy');
const MockLPToken = artifacts.require('MockLPToken');
const PnL = artifacts.require('PnL');
const MockInsurance = artifacts.require('MockInsurance')
const { BN, toBN, isTopic } = require('web3-utils');
const { constants } = require('../utils/constants');
const { expect, ZERO } = require('../utils/common-utils');

contract('EmergencyHandler Test', function (accounts) {

    const deployer = accounts[0],
        governance = deployer,
        investor1 = accounts[1],
        investor2 = accounts[2],
        investor3 = accounts[3],
        newGovernance = accounts[8];

    const baseNum = new BN(10).pow(new BN(18));

    let controller, mockVault, mockPWRD, mockLifeGuard, mockBuoy, pnl, mockInsurance, withdrawHandler,
        daiBaseNum, usdcBaseNum, emergencyHandler,
        mockDAI, mockUSDC, mockUSDT, mockLPToken,
        mockDAIVault, mockUSDCVault, mockUSDTVault, mockCurveVault;

    async function calcWithdrawTokens(lpAmount, slippage = 1) {
        const tokenAmounts = await withdrawHandler.getVaultDeltas(lpAmount);
        const tokenAmountsWithSlippage = [];
        for (let i = 0; i < tokenAmounts.length; i++) {
            tokenAmountsWithSlippage[i] = tokenAmounts[i].sub(tokenAmounts[i].mul(toBN(slippage)).div(toBN(1000)));
        }
        return tokenAmountsWithSlippage;
    }

    async function calcWithdrawToken(lpAmount, index) {
        const tokenAmount = await mockBuoy.singleStableFromLp(lpAmount, index);
        return tokenAmount.sub(tokenAmount.mul(toBN(1)).div(toBN(1000)));
    }

    beforeEach(async function () {
        const decimals = ['1000000000000000000', '1000000', '1000000'];
        mockVault = await MockGvtTokenToken.new();
        mockPWRD = await MockPWRDToken.new();
        mockDAI = await MockDAI.new();
        mockUSDC = await MockUSDC.new();
        mockUSDT = await MockUSDT.new();
        mockLPToken = await MockLPToken.new();
        mockDAIVault = await MockVaultAdaptor.new();
        mockUSDCVault = await MockVaultAdaptor.new();
        mockUSDTVault = await MockVaultAdaptor.new();
        mockCurveVault = await MockVaultAdaptor.new();
        tokens = [mockDAI.address, mockUSDC.address, mockUSDT.address];
        vaults = [mockDAIVault.address, mockUSDCVault.address, mockUSDTVault.address];

        controller = await Controller.new(mockPWRD.address, mockVault.address, tokens, decimals);
        mockLifeGuard = await MockLifeGuard.new();
        mockBuoy = await MockBuoy.new();
        await mockLifeGuard.setBuoy(mockBuoy.address);
        await controller.setLifeGuard(mockLifeGuard.address);
        await mockLifeGuard.setStablecoins([mockDAI.address, mockUSDC.address, mockUSDT.address]);
        await mockLifeGuard.setController(controller.address);

        pnl = await PnL.new(mockPWRD.address, mockVault.address, 0, 0);
        pnl.setController(controller.address);
        await controller.setPnL(pnl.address);

        mockInsurance = await MockInsurance.new();
        await mockInsurance.setController(controller.address);
        await mockInsurance.setupTokens();
        await controller.setInsurance(mockInsurance.address);

        daiBaseNum = new BN(10).pow(await mockDAI.decimals());
        usdcBaseNum = new BN(10).pow(await mockUSDC.decimals());
        usdtBaseNum = new BN(10).pow(await mockUSDT.decimals());

        await mockDAIVault.setUnderlyingToken(mockDAI.address);
        await mockUSDCVault.setUnderlyingToken(mockUSDC.address);
        await mockUSDTVault.setUnderlyingToken(mockUSDT.address);
        await mockCurveVault.setUnderlyingToken(mockLPToken.address);

        await controller.addToWhitelist(governance, { from: governance });
        await controller.setVault(0, mockDAIVault.address);
        await controller.setVault(1, mockUSDCVault.address);
        await controller.setVault(2, mockUSDTVault.address);
        await controller.setCurveVault(mockCurveVault.address);

        depositHandler = await DepositHandler.new(
            '2',
            vaults,
            tokens,
            decimals
        );
        await controller.setDepositHandler(depositHandler.address);
        await depositHandler.setController(controller.address);
        await controller.setUtilisationRatioLimitPwrd(toBN(10000));
        await controller.addToWhitelist(depositHandler.address);

        emergencyHandler = await EmergencyHandler.new(
            mockPWRD.address,
            mockVault.address,
            mockBuoy.address,
            vaults,
            tokens,
            decimals
        );
        withdrawHandler = await WithdrawHandler.new(
            vaults,
            tokens,
            decimals
        );
        await controller.setWithdrawHandler(withdrawHandler.address, emergencyHandler.address);
        await withdrawHandler.setController(controller.address);
        await controller.setUtilisationRatioLimitGvt(toBN(10000));
        await controller.addToWhitelist(withdrawHandler.address);

        await controller.setWithdrawalFee(false, 50);
        await emergencyHandler.setController(controller.address);

        await controller.setBigFishThreshold(1000, toBN(1000).mul(baseNum));

        await mockDAI.mint(investor1, new BN(10000).mul(daiBaseNum), { from: deployer });
        await mockUSDC.mint(investor1, new BN(10000).mul(usdcBaseNum), { from: deployer });
        await mockUSDT.mint(investor1, new BN(10000).mul(usdtBaseNum), { from: deployer });

        await mockDAI.mint(investor2, new BN(10000).mul(daiBaseNum), { from: deployer });
        await mockUSDC.mint(investor2, new BN(10000).mul(usdcBaseNum), { from: deployer });
        await mockUSDT.mint(investor2, new BN(10000).mul(usdtBaseNum), { from: deployer });

        await mockUSDT.mint(mockDAIVault.address, new BN(10000).mul(usdtBaseNum), { from: deployer });
        await mockDAIVault.approve(mockLifeGuard.address, new BN(10000).mul(daiBaseNum));
        await mockUSDCVault.approve(mockLifeGuard.address, new BN(10000).mul(usdcBaseNum));
        await mockUSDTVault.approve(mockLifeGuard.address, new BN(10000).mul(usdtBaseNum));
        await withdrawHandler.setDependencies();
        await emergencyHandler.setDependencies();
        await depositHandler.setDependencies();
    });

    describe('Emergency Withdrawals', function () {
        beforeEach(async function () {
            let investAmount = [
                toBN(100).mul(daiBaseNum),
                toBN(100).mul(usdcBaseNum),
                toBN(100).mul(usdtBaseNum)
            ];

            await mockDAI.approve(depositHandler.address, investAmount[0], { from: investor1 });
            await mockUSDC.approve(depositHandler.address, investAmount[1], { from: investor1 });
            await mockUSDT.approve(depositHandler.address, investAmount[2], { from: investor1 });
            let lp = await mockBuoy.stableToLp(investAmount, true);
            let lpWithSlippage = lp.sub(lp.div(new BN("10000")));
            await mockLifeGuard.setDepositStableAmount(lp);
            await mockLifeGuard.setInAmounts(investAmount);
            await depositHandler.depositGvt(
                investAmount,
                lpWithSlippage,
                ZERO,
                { from: investor1 }
            );

            investAmount = [
                toBN(700).mul(daiBaseNum),
                toBN(700).mul(usdcBaseNum),
                toBN(700).mul(usdtBaseNum)
            ];
            await mockDAI.approve(depositHandler.address, investAmount[0], { from: investor2 });
            await mockUSDC.approve(depositHandler.address, investAmount[1], { from: investor2 });
            await mockUSDT.approve(depositHandler.address, investAmount[2], { from: investor2 });
            lp = await mockBuoy.stableToLp(investAmount, true);
            lpWithSlippage = lp.sub(lp.div(new BN("10000")));
            await mockLifeGuard.setDepositStableAmount(lp);
            await mockLifeGuard.setInAmounts(investAmount);
            await depositHandler.depositGvt(
                investAmount,
                lpWithSlippage,
                ZERO,
                { from: investor2 }
            );
        })

        it('Should not be able to deposit when the system is paused', async function () {
            await controller.pause({ from: governance });
            const investAmount = [
                toBN(100).mul(daiBaseNum),
                toBN(100).mul(usdcBaseNum),
                toBN(100).mul(usdtBaseNum)
            ];
            let lp = await mockBuoy.stableToLp(investAmount, true);
            let lpWithSlippage = lp.sub(lp.div(new BN("10000")));

            await expect(depositHandler.depositPwrd(
                investAmount,
                lpWithSlippage,
                ZERO,
                { from: investor1 }
            )).to.eventually.be.rejected;

            return expect(depositHandler.depositGvt(
                investAmount,
                lpWithSlippage,
                ZERO,
                { from: investor1 }
            )).to.eventually.be.rejected;
        })

        it('Should be able to enter emergency if not paused', async function () {
            return expect(controller.emergency(0, { from: governance }))
                .to.eventually.be.fulfilled;
        })

        it('Should be able to enter emergency if paused', async function () {
            await controller.pause({ from: governance });
            return expect(controller.emergency(0, { from: governance }))
                .to.eventually.be.fulfilled;
        })

        it('Should be possible to withdraw when the system is paused', async () => {
            const userDAIPre = await mockDAI.balanceOf(investor1);
            const userUSDCPre = await mockUSDC.balanceOf(investor1);
            const userUSDTPre = await mockUSDT.balanceOf(investor1);

            const vaultDAIPre = await mockDAI.balanceOf(mockDAIVault.address);
            const vaultUSDCPre = await mockUSDC.balanceOf(mockUSDCVault.address);
            const vaultUSDTPre = await mockUSDT.balanceOf(mockUSDTVault.address);

            const usd = toBN(100).mul(baseNum);
            const lp = await mockBuoy.usdToLp(usd);
            const lpWithoutFee = lp.sub(lp.mul(toBN('50')).div(toBN('10000')));
            const tokens = await calcWithdrawTokens(lpWithoutFee);

            await controller.pause({ from: governance });
            await withdrawHandler.withdrawByLPToken(false, lp, tokens, { from: investor1 });


            const userDAIPost = await mockDAI.balanceOf(investor1);
            const userUSDCPost = await mockUSDC.balanceOf(investor1);
            const userUSDTPost = await mockUSDT.balanceOf(investor1);

            const vaultDAIPost = await mockDAI.balanceOf(mockDAIVault.address);
            const vaultUSDCPost = await mockUSDC.balanceOf(mockUSDCVault.address);
            const vaultUSDTPost = await mockUSDT.balanceOf(mockUSDTVault.address);

            const expectedAmount = toBN(2300) // 2400 - 100 : deposit amount - withdrawAmount
            await expect(controller.gTokenTotalAssets({ from: mockVault.address })).to.eventually.be.a.bignumber
                .closeTo(expectedAmount.mul(baseNum), toBN(1).mul(baseNum));
            await expect(controller.totalAssets()).to.eventually.be.a.bignumber
                .closeTo(expectedAmount.mul(baseNum), toBN(1).mul(baseNum));
            expect(userDAIPost.sub(userDAIPre)).to.be.a.bignumber.equal(vaultDAIPre.sub(vaultDAIPost));
            expect(userUSDCPost.sub(userUSDCPre)).to.be.a.bignumber.equal(vaultUSDCPre.sub(vaultUSDCPost));
            return expect(userUSDTPost.sub(userUSDTPre)).to.be.a.bignumber.equal(vaultUSDTPre.sub(vaultUSDTPost));
        })

        it('Should be ok to do a whale withdrawal when the system is paused', async () => {
            await controller.setBigFishThreshold(1, 0);

            const userDAIPre = await mockDAI.balanceOf(investor1);
            const userUSDCPre = await mockUSDC.balanceOf(investor1);
            const userUSDTPre = await mockUSDT.balanceOf(investor1);

            const vaultDAIPre = await mockDAI.balanceOf(mockDAIVault.address);
            const vaultUSDCPre = await mockUSDC.balanceOf(mockUSDCVault.address);
            const vaultUSDTPre = await mockUSDT.balanceOf(mockUSDTVault.address);

            const usd = toBN(200).mul(baseNum);
            const lp = await mockBuoy.usdToLp(usd);
            const lpWithoutFee = lp.sub(lp.mul(toBN('50')).div(toBN('10000')));
            const tokens = await calcWithdrawTokens(lpWithoutFee);
            await mockLifeGuard.setDepositStableAmount(lpWithoutFee);

            await controller.pause({ from: governance });
            await withdrawHandler.withdrawByLPToken(false, lp, tokens, { from: investor1 });

            const userDAIPost = await mockDAI.balanceOf(investor1);
            const userUSDCPost = await mockUSDC.balanceOf(investor1);
            const userUSDTPost = await mockUSDT.balanceOf(investor1);

            const vaultDAIPost = await mockDAI.balanceOf(mockDAIVault.address);
            const vaultUSDCPost = await mockUSDC.balanceOf(mockUSDCVault.address);
            const vaultUSDTPost = await mockUSDT.balanceOf(mockUSDTVault.address);

            const expectedAmount = toBN(2200) // 2400 - 200 : deposit amount - withdrawAmount
            await expect(controller.gTokenTotalAssets({ from: mockVault.address })).to.eventually.be.a.bignumber
                .closeTo(expectedAmount.mul(baseNum), toBN(2).mul(baseNum));
            await expect(controller.totalAssets()).to.eventually.be.a.bignumber
                .closeTo(expectedAmount.mul(baseNum), toBN(2).mul(baseNum));
            expect(userDAIPost.sub(userDAIPre)).to.be.a.bignumber.equal(vaultDAIPre.sub(vaultDAIPost));
            expect(userUSDCPost.sub(userUSDCPre)).to.be.a.bignumber.equal(vaultUSDCPre.sub(vaultUSDCPost));
            return expect(userUSDTPost.sub(userUSDTPre)).to.be.a.bignumber.equal(vaultUSDTPre.sub(vaultUSDTPost));
        })

        it('Should be possible to withdraw when the system is in an emergency state', async () => {
            await controller.pause({ from: governance });
            await controller.emergency(0, { from: governance });

            const userUSDTPre = await mockUSDT.balanceOf(investor1);
            const userGvtPre = await mockVault.balanceOf(investor1);

            const usd = toBN(100).mul(baseNum);

            await mockUSDT.approve(mockUSDTVault.address, new BN(10000).mul(usdtBaseNum), { from: investor1 });
            await mockLifeGuard.setInAmounts([usd, 0, 0]);
            await withdrawHandler.withdrawByStablecoin(false, 0, usd, 0, { from: investor1 });

            const userUSDTPost = await mockUSDT.balanceOf(investor1);
            const userGvtPost = await mockVault.balanceOf(investor1);

            await expect(userGvtPre).to.be.a.bignumber.greaterThan('0');
            await expect(userGvtPost).to.be.a.bignumber.lessThan(userGvtPre);
            return expect(userUSDTPost.sub(userUSDTPre)).to.be.a.bignumber.closeTo(toBN('100')
                .mul(usdtBaseNum), usdtBaseNum);
        })

        it('Should be ok to do a whale withdrawal when the system is in an emergency state', async () => {
            await controller.pause({ from: governance });
            await controller.emergency(0, { from: governance });
            await controller.setBigFishThreshold(1, 0);

            const userUSDTPre = await mockUSDT.balanceOf(investor1);
            const userGvtPre = await mockVault.balanceOf(investor1);

            const usd = toBN(300).mul(baseNum);
            await mockLifeGuard.setInAmounts([usd, 0, 0]);
            await withdrawHandler.withdrawAllSingle(false, 0, 0, { from: investor1 });

            const userUSDTPost = await mockUSDT.balanceOf(investor1);
            const userGvtPost = await mockVault.balanceOf(investor1);


            await expect(userGvtPre).to.be.a.bignumber.greaterThan('0');
            await expect(userGvtPost).to.be.a.bignumber.equal('0');
            return expect(userUSDTPost.sub(userUSDTPre)).to.be.a.bignumber.closeTo(toBN('300')
                .mul(usdtBaseNum), toBN('5').mul(usdtBaseNum));
        })
    })
})
