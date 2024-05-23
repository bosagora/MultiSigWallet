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

    let multiSigFactory: MultiSigWalletFactory;
    let multiSigWallet: MultiSigWallet | undefined;
    const requiredConfirmations = 2;

    before(async () => {
        multiSigFactory = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory);
    });

    it("Create Wallet 0 by Factory 0", async () => {
        multiSigWallet = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            "My Wallet 1",
            "My first multi-sign wallet",
            owners1.map((m) => m.address),
            requiredConfirmations,
            BigNumber.from(1)
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

    it("should reject addMember function call", async () => {
        assert.ok(multiSigWallet);

        const addMemberData = multiSigFactory.interface.encodeFunctionData("addMember", [
            account3.address,
            multiSigWallet.address,
        ]);

        await assert.rejects(
            multiSigWallet.submitTransaction(
                "Test Title",
                "Test Description",
                multiSigFactory.address,
                0,
                addMemberData
            ),
            "Invalid destination"
        );
    });

    it("should reject removeMember function call", async () => {
        assert.ok(multiSigWallet);

        const addMemberData = multiSigFactory.interface.encodeFunctionData("removeMember", [
            account3.address,
            multiSigWallet.address,
        ]);

        await assert.rejects(
            multiSigWallet.submitTransaction(
                "Test Title",
                "Test Description",
                multiSigFactory.address,
                0,
                addMemberData
            ),
            "Invalid destination"
        );
    });
});
