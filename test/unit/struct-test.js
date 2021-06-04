const MockStruct4Test = artifacts.require('MockStruct4Test')
const { expect } = require('../utils/common-utils')

contract('MockStruct4Test', function (accounts) {
    const [deployer, newContorller] = accounts;

    it('Struct Test', async function () {
        const structTest = await MockStruct4Test.new();
        await structTest.setOwner(newContorller);
        // console.log("deployer: " + deployer);
        // console.log("newContorller: " + newContorller);
        const result1 = await structTest.test1({ aUIA: [1, 2, 3], bS2: { aUI: 10, bUIA: [5, 6, 7], cB: true, dA: deployer } });
        // console.log("result1: " + JSON.stringify(result1));
        const result2 = await structTest.test2({ aUIA: [1, 2, 3], bS2: { aUI: 10, bUIA: [5, 6, 7], cB: true, dA: deployer } });
        // console.log("result2: " + JSON.stringify(result2));
        expect(JSON.stringify(result1)).equal('[["2","3","4"],["20",["6","7","8"],false,"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]]');
        return expect(JSON.stringify(result2)).equal('[["2","3","4"],["20",["6","7","8"],false,"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]]');
    })
})