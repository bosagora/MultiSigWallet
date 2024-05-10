import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { BOACoin } from "../src/utils/Amount";
import { ContractUtils } from "../src/utils/ContractUtils";
import { MultiSigWallet, TestCalls, TestToken } from "../typechain-types";

import assert from "assert";
import { BigNumber, Wallet } from "ethers";

import { AddressZero } from "@ethersproject/constants";

async function deployMultiSigWallet(deployer: Wallet, owners: string[], required: number): Promise<MultiSigWallet> {
    const factory = await ethers.getContractFactory("MultiSigWallet");
    const contract = (await factory
        .connect(deployer)
        .deploy(AddressZero, "name", "description", deployer.address, owners, required)) as MultiSigWallet;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

async function deployCalls(deployer: Wallet): Promise<TestCalls> {
    const factory = await ethers.getContractFactory("TestCalls");
    const contract = (await factory.connect(deployer).deploy()) as TestCalls;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

async function deployToken(deployer: Wallet): Promise<TestToken> {
    const factory = await ethers.getContractFactory("TestToken");
    const contract = (await factory.connect(deployer).deploy()) as TestToken;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}
describe("Test for Validator", () => {
    let multisigInstance: MultiSigWallet;
    let tokenInstance: TestToken;
    let callsInstance: TestCalls;
    const requiredConfirmations = 2;
    const provider = ethers.provider;
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, owner0, owner1, owner2, account0, account1, account2] = raws;
    const owners = [owner0, owner1, owner2];
    const accounts = [account0, account1, account2];

    before(async () => {
        multisigInstance = await deployMultiSigWallet(
            deployer,
            owners.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multisigInstance);
        tokenInstance = await deployToken(deployer);
        assert.ok(tokenInstance);
        callsInstance = await deployCalls(deployer);
        assert.ok(callsInstance);

        const deposit = BOACoin.make("100").value;

        await deployer.sendTransaction({
            to: multisigInstance.address,
            value: deposit,
        });
        const balance = await provider.getBalance(multisigInstance.address);
        assert.deepStrictEqual(balance.valueOf(), deposit);
    });

    it("transferBOA", async () => {
        const account = Wallet.createRandom();
        const amount = BOACoin.make("1").value;
        assert.deepStrictEqual(await provider.getBalance(account.address), BigNumber.from(0));
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction("title", "description", account.address, amount, "0x"),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const res = await multisigInstance.getTransaction(transactionId);
        assert.deepStrictEqual(res.title, "title");
        assert.deepStrictEqual(res.description, "description");
        assert.deepStrictEqual(res.destination, account.address);
        assert.deepStrictEqual(res.value, amount);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[1]).confirmTransaction(transactionId),
            multisigInstance.interface,
            "Execution",
            "transactionId"
        );

        assert.deepStrictEqual(transactionId, executedTransactionId);
        assert.deepStrictEqual(await provider.getBalance(account.address), amount);
    });

    it("transferWithPayloadSizeCheck", async () => {
        const amount = BOACoin.make("100").value;

        // Issue tokens to the multisig address
        await tokenInstance.connect(owners[0]).issueTokens(multisigInstance.address, amount);

        // Encode transfer call for the multisig
        const transferEncoded = tokenInstance.interface.encodeFunctionData("transfer", [accounts[1].address, amount]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction("title", "description", tokenInstance.address, 0, transferEncoded),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[1]).confirmTransaction(transactionId),
            multisigInstance.interface,
            "Execution",
            "transactionId"
        );

        assert.deepStrictEqual(transactionId, executedTransactionId);

        // Check that the transfer has actually occured
        assert.deepStrictEqual(amount, await tokenInstance.balanceOf(accounts[1].address));
    });

    it("transferFailure", async () => {
        const amount = BOACoin.make("100").value;
        // Encode transfer call for the multisig
        const transferEncoded = tokenInstance.interface.encodeFunctionData("transfer", [accounts[1].address, amount]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction("title", "description", tokenInstance.address, 0, transferEncoded),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        // Transfer without issuance - expected to fail
        const failedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[1]).confirmTransaction(transactionId),
            multisigInstance.interface,
            "ExecutionFailure",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, failedTransactionId);
    });

    it("callReceive1uint", async () => {
        // Encode call for the multisig
        const receive1uintEncoded = callsInstance.interface.encodeFunctionData("receive1uint", [12345]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction("title", "description", callsInstance.address, 67890, receive1uintEncoded),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[1]).confirmTransaction(transactionId),
            multisigInstance.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);
        // Check that the expected parameters and values were passed
        assert.deepStrictEqual(BigNumber.from(12345), await callsInstance.uint1());
        assert.deepStrictEqual(BigNumber.from(32 + 4), await callsInstance.lastMsgDataLength());
        assert.deepStrictEqual(BigNumber.from(67890), await callsInstance.lastMsgValue());
    });

    it("callReceive2uint", async () => {
        // Encode call for the multisig
        const receive2uintsEncoded = callsInstance.interface.encodeFunctionData("receive2uints", [12345, 67890]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction("title", "description", callsInstance.address, 4040404, receive2uintsEncoded),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[1]).confirmTransaction(transactionId),
            multisigInstance.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);
        // Check that the expected parameters and values were passed
        assert.deepStrictEqual(BigNumber.from(12345), await callsInstance.uint1());
        assert.deepStrictEqual(BigNumber.from(67890), await callsInstance.uint2());
        assert.deepStrictEqual(BigNumber.from(32 + 32 + 4), await callsInstance.lastMsgDataLength());
        assert.deepStrictEqual(BigNumber.from(4040404), await callsInstance.lastMsgValue());
    });

    it("callReceive1bytes", async () => {
        // Encode call for the multisig
        const dataHex = "0x" + "0123456789abcdef".repeat(100); // 800 bytes long

        const receive1bytesEncoded = callsInstance.interface.encodeFunctionData("receive1bytes", [dataHex]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction("title", "description", callsInstance.address, 10, receive1bytesEncoded),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[1]).confirmTransaction(transactionId),
            multisigInstance.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);
        // Check that the expected parameters and values were passed
        assert.deepStrictEqual(
            BigNumber.from(868), // 800 bytes data + 32 bytes offset + 32 bytes data length + 4 bytes method signature
            await callsInstance.lastMsgDataLength()
        );
        assert.deepStrictEqual(BigNumber.from(10), await callsInstance.lastMsgValue());
        assert.deepStrictEqual(dataHex, await callsInstance.byteArray1());
    });
});
