import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { MultiSigWallet, MultiSigWalletFactory } from "../typechain-types";

import assert from "assert";
import { BigNumber, Wallet } from "ethers";
import { ContractUtils } from "../src/utils/ContractUtils";

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

    if (address !== undefined)
        return (await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet;
    else return undefined;
}

describe("Test for MultiSigWalletFactory", () => {
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, account0, account1, account2, account3, account4, account5, account6, account7] = raws;
    const owners1 = [account0, account1, account2];
    const owners2 = [account3, account4, account5];
    const owners3 = [account0, account3];

    let multiSigFactory: MultiSigWalletFactory;
    let multiSigWallet1: MultiSigWallet | undefined;
    let multiSigWallet2: MultiSigWallet | undefined;
    let multiSigWallet3: MultiSigWallet | undefined;
    const requiredConfirmations = 2;

    const walletInfos = [
        {
            name: "My Wallet 1",
            description: "My first multi-sign wallet",
        },
        {
            name: "My Wallet 2",
            description: "My second multi-sign wallet",
        },
        {
            name: "My Wallet 3",
            description: "My third multi-sign wallet",
        },
        {
            name: "Fund",
            description: "Fund of develop",
        },
    ];

    before(async () => {
        multiSigFactory = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory);
    });

    it("Create Wallet by Factory", async () => {
        multiSigWallet1 = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            walletInfos[0].name,
            walletInfos[0].description,
            owners1.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multiSigWallet1);
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account2.address), BigNumber.from(1));

        multiSigWallet2 = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            walletInfos[1].name,
            walletInfos[1].description,
            owners2.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multiSigWallet2);
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account3.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account4.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account5.address), BigNumber.from(1));

        multiSigWallet3 = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            walletInfos[2].name,
            walletInfos[2].description,
            owners3.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multiSigWallet3);
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account0.address), BigNumber.from(2));
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account3.address), BigNumber.from(2));

        const res = await multiSigFactory.getWalletsForOwner(account0.address, 0, 2);
        assert.deepStrictEqual(
            res.map((m) => m.wallet),
            [multiSigWallet1.address, multiSigWallet3.address]
        );
        assert.deepStrictEqual(
            res.map((m) => m.name),
            [walletInfos[0].name, walletInfos[2].name]
        );
        assert.deepStrictEqual(
            res.map((m) => m.description),
            [walletInfos[0].description, walletInfos[2].description]
        );
    });

    it("Remove owner", async () => {
        assert.ok(multiSigWallet1);

        const removeOwnerEncoded = multiSigWallet1.interface.encodeFunctionData("removeOwner", [account2.address]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet1
                .connect(account0)
                .submitTransaction("title", "description", multiSigWallet1.address, 0, removeOwnerEncoded),
            multiSigWallet1.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet1.connect(account1).confirmTransaction(transactionId),
            multiSigWallet1.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account2.address), BigNumber.from(0));

        assert.deepStrictEqual(await multiSigWallet1.getOwners(), [account0.address, account1.address]);
    });

    it("Add owner", async () => {
        assert.ok(multiSigWallet1);

        const addOwnerEncoded = multiSigWallet1.interface.encodeFunctionData("addOwner", [account6.address]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet1
                .connect(account0)
                .submitTransaction("title", "description", multiSigWallet1.address, 0, addOwnerEncoded),
            multiSigWallet1.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet1.connect(account1).confirmTransaction(transactionId),
            multiSigWallet1.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account6.address), BigNumber.from(1));

        assert.deepStrictEqual(await multiSigWallet1.getOwners(), [
            account0.address,
            account1.address,
            account6.address,
        ]);

        const res = await multiSigFactory.getWalletsForOwner(account6.address, 0, 1);
        assert.deepStrictEqual(
            res.map((m) => m.wallet),
            [multiSigWallet1.address]
        );
        assert.deepStrictEqual(
            res.map((m) => m.name),
            [walletInfos[0].name]
        );
        assert.deepStrictEqual(
            res.map((m) => m.description),
            [walletInfos[0].description]
        );
    });

    it("Replace owner", async () => {
        assert.ok(multiSigWallet1);

        const replaceOwnerEncoded = multiSigWallet1.interface.encodeFunctionData("replaceOwner", [
            account1.address,
            account7.address,
        ]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet1
                .connect(account0)
                .submitTransaction("title", "description", multiSigWallet1.address, 0, replaceOwnerEncoded),
            multiSigWallet1.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        const executedTransactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet1.connect(account1).confirmTransaction(transactionId),
            multiSigWallet1.interface,
            "Execution",
            "transactionId"
        );

        // Check that transaction has been executed
        assert.deepStrictEqual(transactionId, executedTransactionId);
        assert.deepStrictEqual(await multiSigFactory.getNumberOfWalletsForOwner(account7.address), BigNumber.from(1));

        assert.deepStrictEqual(await multiSigWallet1.getOwners(), [
            account0.address,
            account7.address,
            account6.address,
        ]);

        const res = await multiSigFactory.getWalletsForOwner(account7.address, 0, 1);
        assert.deepStrictEqual(
            res.map((m) => m.wallet),
            [multiSigWallet1.address]
        );
        assert.deepStrictEqual(
            res.map((m) => m.name),
            [walletInfos[0].name]
        );
        assert.deepStrictEqual(
            res.map((m) => m.description),
            [walletInfos[0].description]
        );
    });

    it("getWalletInfo", async () => {
        assert.ok(multiSigWallet1);

        const res = await multiSigFactory.getWalletInfo(multiSigWallet1.address);
        assert.deepStrictEqual(res.wallet, multiSigWallet1.address);
        assert.deepStrictEqual(res.name, walletInfos[0].name);
        assert.deepStrictEqual(res.description, walletInfos[0].description);
    });

    it("changeName", async () => {
        assert.ok(multiSigWallet1);

        const newValue = await ContractUtils.getEventValueString(
            await multiSigFactory.connect(deployer).changeName(multiSigWallet1.address, walletInfos[3].name),
            multiSigFactory.interface,
            "ChangedName",
            "name"
        );
        assert.deepStrictEqual(newValue, walletInfos[3].name);

        const res = await multiSigFactory.getWalletInfo(multiSigWallet1.address);
        assert.deepStrictEqual(res.wallet, multiSigWallet1.address);
        assert.deepStrictEqual(res.name, walletInfos[3].name);
        assert.deepStrictEqual(res.description, walletInfos[0].description);
    });

    it("changeDescription", async () => {
        assert.ok(multiSigWallet1);

        const newValue = await ContractUtils.getEventValueString(
            await multiSigFactory
                .connect(deployer)
                .changeDescription(multiSigWallet1.address, walletInfos[3].description),
            multiSigFactory.interface,
            "ChangedDescription",
            "description"
        );
        assert.deepStrictEqual(newValue, walletInfos[3].description);

        const res = await multiSigFactory.getWalletInfo(multiSigWallet1.address);
        assert.deepStrictEqual(res.wallet, multiSigWallet1.address);
        assert.deepStrictEqual(res.name, walletInfos[3].name);
        assert.deepStrictEqual(res.description, walletInfos[3].description);
    });
});
