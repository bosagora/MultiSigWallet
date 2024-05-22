import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { MultiSigWallet, MultiSigWalletFactory, TestMultiSigToken } from "../typechain-types";

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
    required: number,
    seed: BigNumber
): Promise<MultiSigWallet | undefined> {
    const contractFactory = await ethers.getContractFactory("MultiSigWalletFactory");
    const factoryContract = contractFactory.attach(factoryAddress) as MultiSigWalletFactory;

    const address = await ContractUtils.getEventValueString(
        await factoryContract.connect(deployer).create(name, description, owners, required, seed),
        factoryContract.interface,
        "ContractInstantiation",
        "wallet"
    );

    if (address !== undefined) {
        return (await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet;
    } else return undefined;
}

describe("Test for SubmitTransaction - filter factoryAddress, IMultiSigWalletFactory.addMember, IMultiSigWalletFactory.removeMember", () => {
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, account0, account1, account2, account3, account4] = raws;
    const owners1 = [account0, account1, account2];

    let multiSigFactory0: MultiSigWalletFactory;
    let multiSigFactory1: MultiSigWalletFactory;
    let multiSigWallet0: MultiSigWallet | undefined;
    let multiSigWallet1: MultiSigWallet | undefined;
    const requiredConfirmations = 2;

    before(async () => {
        multiSigFactory0 = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory0);
        multiSigFactory1 = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory1);
    });

    it("Create Wallet 0 by Factory 0", async () => {
        multiSigWallet0 = await deployMultiSigWallet(
            multiSigFactory0.address,
            deployer,
            "My Wallet 1",
            "My first multi-sign wallet",
            owners1.map((m) => m.address),
            requiredConfirmations,
            BigNumber.from(1)
        );
        assert.ok(multiSigWallet0);

        assert.deepStrictEqual(
            await multiSigWallet0.getMembers(),
            owners1.map((m) => m.address)
        );

        assert.deepStrictEqual(await multiSigFactory0.getNumberOfWalletsForMember(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory0.getNumberOfWalletsForMember(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory0.getNumberOfWalletsForMember(account2.address), BigNumber.from(1));
    });

    it("Create Wallet 1 by Factory 1", async () => {
        multiSigWallet1 = await deployMultiSigWallet(
            multiSigFactory1.address,
            deployer,
            "My Wallet 1",
            "My first multi-sign wallet",
            owners1.map((m) => m.address),
            requiredConfirmations,
            BigNumber.from(2)
        );
        assert.ok(multiSigWallet1);

        assert.deepStrictEqual(
            await multiSigWallet1.getMembers(),
            owners1.map((m) => m.address)
        );

        assert.deepStrictEqual(await multiSigFactory1.getNumberOfWalletsForMember(account0.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory1.getNumberOfWalletsForMember(account1.address), BigNumber.from(1));
        assert.deepStrictEqual(await multiSigFactory1.getNumberOfWalletsForMember(account2.address), BigNumber.from(1));
    });

    it("should reject transaction to factory address", async () => {
        assert.ok(multiSigWallet0);

        await assert.rejects(
            multiSigWallet0.submitTransaction("Test Title", "Test Description", multiSigFactory0.address, 0, "0x"),
            "Invalid destination"
        );
    });

    it("should reject addMember function call", async () => {
        assert.ok(multiSigWallet0);

        const addMemberData = multiSigFactory0.interface.encodeFunctionData("addMember", [
            account3.address,
            multiSigWallet0.address,
        ]);

        await assert.rejects(
            multiSigWallet0.submitTransaction(
                "Test Title",
                "Test Description",
                multiSigFactory1.address,
                0,
                addMemberData
            ),
            "Invalid function call"
        );
    });

    it("should reject removeMember function call", async () => {
        assert.ok(multiSigWallet0);

        const addMemberData = multiSigFactory0.interface.encodeFunctionData("removeMember", [
            account3.address,
            multiSigWallet0.address,
        ]);

        await assert.rejects(
            multiSigWallet0.submitTransaction(
                "Test Title",
                "Test Description",
                multiSigFactory1.address,
                0,
                addMemberData
            ),
            "Invalid function call"
        );
    });
});
