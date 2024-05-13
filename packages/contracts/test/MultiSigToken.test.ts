import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { MultiSigWallet, MultiSigWalletFactory, TestMultiSigToken } from "../typechain-types";

import assert from "assert";
import { BigNumber, Wallet } from "ethers";
import { ContractUtils } from "../src/utils/ContractUtils";

import { expect } from "chai";

async function deployMultiSigWalletFactory(deployer: Wallet): Promise<MultiSigWalletFactory> {
    const factory = await ethers.getContractFactory("MultiSigWalletFactory");
    const contract = (await factory.connect(deployer).deploy()) as MultiSigWalletFactory;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

async function deployMultiSigWallet(
    factoryAddress: string,
    deployer: Wallet,
    name: string,
    description: string,
    owners: string[],
    required: number
): Promise<MultiSigWallet | undefined> {
    const contractFactory = await ethers.getContractFactory("MultiSigWalletFactory");
    const factoryContract = contractFactory.attach(factoryAddress) as MultiSigWalletFactory;

    const address = await ContractUtils.getEventValueString(
        await factoryContract.connect(deployer).create(name, description, owners, required),
        factoryContract.interface,
        "ContractInstantiation",
        "wallet"
    );

    if (address !== undefined) {
        return (await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet;
    } else return undefined;
}

async function deployToken(deployer: Wallet, owner: string): Promise<TestMultiSigToken> {
    const factory = await ethers.getContractFactory("TestMultiSigToken");
    const contract = (await factory.connect(deployer).deploy(owner)) as TestMultiSigToken;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

describe("Test for MultiSigWalletFactory", () => {
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, account0, account1, account2, account3, account4] = raws;
    const owners1 = [account0, account1, account2];

    let multiSigFactory: MultiSigWalletFactory;
    let multiSigWallet: MultiSigWallet | undefined;
    let multiSigToken: TestMultiSigToken;
    const requiredConfirmations = 2;

    before(async () => {
        multiSigFactory = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory);
    });

    it("Create Wallet by Factory", async () => {
        multiSigWallet = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            "My Wallet 1",
            "My first multi-sign wallet",
            owners1.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multiSigWallet);

        assert.deepStrictEqual(
            await multiSigWallet.getMembers(),
            owners1.map((m) => m.address)
        );

        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account2.address), BigNumber.from(1));
    });

    it("Create Token, Owner is wallet", async () => {
        const factory = await ethers.getContractFactory("TestMultiSigToken");
        await expect(factory.connect(deployer).deploy(account0.address)).to.be.revertedWith(
            "function call to a non-contract account"
        );
    });

    it("Create Token, Owner is MultiSigWallet", async () => {
        assert.ok(multiSigWallet);

        multiSigToken = await deployToken(deployer, multiSigWallet.address);
        assert.deepStrictEqual(await multiSigToken.owner(), multiSigWallet.address);
        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), BigNumber.from(0));
    });

    it("Fail mint initial supply", async () => {
        const amount = BigNumber.from(10).pow(BigNumber.from(18));
        await expect(multiSigToken.connect(account0).mint(amount)).to.be.revertedWith("Only the owner can execute");
    });

    it("Success mint initial supply", async () => {
        assert.ok(multiSigWallet);
        assert.ok(multiSigToken);

        const initialSupply = BigNumber.from(10).pow(BigNumber.from(28));

        const mintEncoded = multiSigToken.interface.encodeFunctionData("mint", [initialSupply]);

        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(account0)
                .submitTransaction("title", "description", multiSigToken.address, 0, mintEncoded),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).confirmTransaction(transactionId),
            multiSigWallet.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);

        // Check balance of target
        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), initialSupply);
    });

    it("Fail transfer", async () => {
        const amount = BigNumber.from(10).pow(BigNumber.from(18));
        await expect(multiSigToken.connect(account0).transfer(account4.address, amount)).to.be.revertedWith(
            "ERC20: transfer amount exceeds balance"
        );
    });

    it("Success transfer", async () => {
        assert.ok(multiSigWallet);
        assert.ok(multiSigToken);

        const initialSupply = BigNumber.from(10)
            .pow(BigNumber.from(10))
            .mul(BigNumber.from(10).pow(BigNumber.from(18)));
        const amount = BigNumber.from(10).pow(BigNumber.from(18));

        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), initialSupply);

        const mintEncoded = multiSigToken.interface.encodeFunctionData("transfer", [account4.address, amount]);

        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(account0)
                .submitTransaction("title", "description", multiSigToken.address, 0, mintEncoded),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).confirmTransaction(transactionId),
            multiSigWallet.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);

        // Check balance of target
        assert.deepStrictEqual(await multiSigToken.balanceOf(account4.address), amount);

        // Check balance of wallet
        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), initialSupply.sub(amount));
    });
});

describe("Test for MultiSigWalletFactory 2", () => {
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, account0, account1, account2, account3, account4, account5] = raws;
    const owners1 = [account0, account1, account2, account3, account4];

    let multiSigFactory: MultiSigWalletFactory;
    let multiSigWallet: MultiSigWallet | undefined;
    let multiSigToken: TestMultiSigToken;
    const requiredConfirmations = 3;

    before(async () => {
        multiSigFactory = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory);
    });

    it("Create Wallet by Factory", async () => {
        multiSigWallet = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            "My Wallet 1",
            "My first multi-sign wallet",
            owners1.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multiSigWallet);

        assert.deepStrictEqual(
            await multiSigWallet.getMembers(),
            owners1.map((m) => m.address)
        );

        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForMember(account2.address), BigNumber.from(1));
    });

    it("Create Token, Owner is wallet", async () => {
        const factory = await ethers.getContractFactory("TestMultiSigToken");
        await expect(factory.connect(deployer).deploy(account0.address)).to.be.revertedWith(
            "function call to a non-contract account"
        );
    });

    it("Create Token, Owner is MultiSigWallet", async () => {
        assert.ok(multiSigWallet);

        multiSigToken = await deployToken(deployer, multiSigWallet.address);
        assert.deepStrictEqual(await multiSigToken.owner(), multiSigWallet.address);
        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), BigNumber.from(0));
    });

    it("mint initial supply", async () => {
        assert.ok(multiSigWallet);
        assert.ok(multiSigToken);

        const initialSupply = BigNumber.from(10).pow(BigNumber.from(28));

        const mintEncoded = multiSigToken.interface.encodeFunctionData("mint", [initialSupply]);

        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(account0)
                .submitTransaction("title", "description", multiSigToken.address, 0, mintEncoded),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId1 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).confirmTransaction(transactionId),
            multiSigWallet.interface,
            "Confirmation",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId1);

        const executedTransactionId2 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account2).confirmTransaction(transactionId),
            multiSigWallet.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId2);

        // Check balance of target
        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), initialSupply);
    });

    it("Success transfer", async () => {
        assert.ok(multiSigWallet);
        assert.ok(multiSigToken);

        const initialSupply = BigNumber.from(10).pow(BigNumber.from(28));
        const amount = BigNumber.from(10).pow(BigNumber.from(18));

        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), initialSupply);

        const mintEncoded = multiSigToken.interface.encodeFunctionData("transfer", [account5.address, amount]);

        const transactionId1 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(account0)
                .submitTransaction("title", "description", multiSigToken.address, 0, mintEncoded),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId1 !== undefined);

        const transaction1 = await multiSigWallet.getTransaction(transactionId1);
        assert.deepStrictEqual(transaction1.approval, [account0.address]);

        let transactionId2 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).confirmTransaction(transactionId1),
            multiSigWallet.interface,
            "Confirmation",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId1, transactionId2);

        let transaction2 = await multiSigWallet.getTransaction(transactionId1);
        assert.deepStrictEqual(transaction2.approval, [account0.address, account1.address]);

        transactionId2 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account1).revokeConfirmation(transactionId1),
            multiSigWallet.interface,
            "Revocation",
            "transactionId"
        );
        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId1, transactionId2);
        transaction2 = await multiSigWallet.getTransaction(transactionId1);
        assert.deepStrictEqual(transaction2.approval, [account0.address]);

        transactionId2 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account2).confirmTransaction(transactionId1),
            multiSigWallet.interface,
            "Confirmation",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId1, transactionId2);
        transaction2 = await multiSigWallet.getTransaction(transactionId1);
        assert.deepStrictEqual(transaction2.approval, [account0.address, account2.address]);

        const transactionId3 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet.connect(account3).confirmTransaction(transactionId1),
            multiSigWallet.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId1, transactionId3);
        transaction2 = await multiSigWallet.getTransaction(transactionId1);
        assert.deepStrictEqual(transaction2.approval, [account0.address, account2.address, account3.address]);

        // Check balance of target
        assert.deepStrictEqual(await multiSigToken.balanceOf(account5.address), amount);

        // Check balance of wallet
        assert.deepStrictEqual(await multiSigToken.balanceOf(multiSigWallet.address), initialSupply.sub(amount));
    });
});
