import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { MultiSigToken, MultiSigWallet, MultiSigWalletFactory } from "../typechain-types";

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

    return address !== undefined
        ? ((await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet)
        : undefined;
}

async function deployToken(deployer: Wallet, owner: string): Promise<MultiSigToken> {
    const factory = await ethers.getContractFactory("MultiSigToken");
    const contract = (await factory.connect(deployer).deploy(owner)) as MultiSigToken;
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
    let multiSigToken: MultiSigToken;
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
            await multiSigWallet.getOwners(),
            owners1.map((m) => m.address)
        );

        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account2.address), BigNumber.from(1));
    });

    it("Create Token, Owner is wallet", async () => {
        const factory = await ethers.getContractFactory("MultiSigToken");
        await expect(factory.connect(deployer).deploy(account0.address)).to.be.revertedWith(
            "function call to a non-contract account"
        );
    });

    it("Create Token, Owner is MultiSigWallet", async () => {
        assert.ok(multiSigWallet);

        multiSigToken = await deployToken(deployer, multiSigWallet.address);
        assert.deepStrictEqual(await multiSigToken.owner(), multiSigWallet.address);
        assert.deepStrictEqual(
            await multiSigToken.balanceOf(multiSigWallet.address),
            BigNumber.from(10).pow(BigNumber.from(28))
        );
    });

    it("Fail mint", async () => {
        const amount = BigNumber.from(10).pow(BigNumber.from(18));
        await expect(multiSigToken.connect(account0).mint(account3.address, amount)).to.be.revertedWith(
            "Only the owner can execute"
        );
    });

    it("Success mint", async () => {
        assert.ok(multiSigWallet);
        assert.ok(multiSigToken);

        const amount = BigNumber.from(10).pow(BigNumber.from(18));

        const mintEncoded = multiSigToken.interface.encodeFunctionData("mint", [account3.address, amount]);

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
        assert.deepStrictEqual(await multiSigToken.balanceOf(account3.address), amount);
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
