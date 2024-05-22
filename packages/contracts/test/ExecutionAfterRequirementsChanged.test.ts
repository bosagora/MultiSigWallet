import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { BOACoin } from "../src/utils/Amount";
import { ContractUtils } from "../src/utils/ContractUtils";
import { MultiSigWallet, MultiSigWalletFactory } from "../typechain-types";

import assert from "assert";
import { BigNumber, Wallet } from "ethers";

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
    owners: string[],
    required: number
): Promise<MultiSigWallet | undefined> {
    const contractFactory = await ethers.getContractFactory("MultiSigWalletFactory");
    const factoryContract = contractFactory.attach(factoryAddress) as MultiSigWalletFactory;

    const address = await ContractUtils.getEventValueString(
        await factoryContract.connect(deployer).create("name", "description", owners, required),
        factoryContract.interface,
        "ContractInstantiation",
        "wallet"
    );

    if (address !== undefined) {
        return (await ethers.getContractFactory("MultiSigWallet")).attach(address) as MultiSigWallet;
    } else return undefined;
}

describe("MultiSigWallet", () => {
    let multiSigFactory: MultiSigWalletFactory;
    let multiSigWallet: MultiSigWallet | undefined;
    const requiredConfirmations = 2;
    const provider = ethers.provider;
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, owner0, owner1, owner2, owner3] = raws;
    const owners = [owner0, owner1, owner2];

    before(async () => {
        multiSigFactory = await deployMultiSigWalletFactory(deployer);
        assert.ok(multiSigFactory);
    });

    before(async () => {
        multiSigWallet = await deployMultiSigWallet(
            multiSigFactory.address,
            deployer,
            owners.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multiSigWallet);
    });

    it("test execution after requirements changed", async () => {
        assert.ok(multiSigWallet);

        const deposit = BOACoin.make("100").value;

        await deployer.sendTransaction({
            to: multiSigWallet.address,
            value: deposit,
        });
        const balance = await provider.getBalance(multiSigWallet.address);
        assert.deepStrictEqual(balance.valueOf(), deposit);

        // Add owner wa_4
        const addOwnerData = multiSigWallet.interface.encodeFunctionData("addMember", [owner3.address]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(owners[0])
                .submitTransaction("title", "description", multiSigWallet.address, 0, addOwnerData),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        // There is one pending transaction
        const excludePending = false;
        const includePending = true;
        const excludeExecuted = false;
        const includeExecuted = true;
        assert.deepStrictEqual(
            await multiSigWallet.getTransactionIdsInCondition(0, 1, includePending, excludeExecuted),
            [BigNumber.from(transactionId)]
        );

        // Update required to 1
        const newRequired = 1;
        const updateRequirementData = multiSigWallet.interface.encodeFunctionData("changeRequirement", [newRequired]);

        // Submit successfully
        const transactionId2 = await ContractUtils.getEventValueBigNumber(
            await multiSigWallet
                .connect(owners[0])
                .submitTransaction("title", "description", multiSigWallet.address, 0, updateRequirementData),
            multiSigWallet.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId2 !== undefined);

        assert.deepStrictEqual(
            await multiSigWallet.getTransactionIdsInCondition(0, 2, includePending, excludeExecuted),
            [BigNumber.from(transactionId), BigNumber.from(transactionId2)]
        );

        // Confirm change requirement transaction
        const tx1 = await multiSigWallet.connect(owners[1]).confirmTransaction(transactionId2);
        await tx1.wait();
        assert.equal((await multiSigWallet.getRequired()).toNumber(), newRequired);
        assert.deepStrictEqual(
            await multiSigWallet.getTransactionIdsInCondition(0, 2, excludePending, includeExecuted),
            [BigNumber.from(transactionId2)]
        );

        const tx2 = await multiSigWallet.connect(owners[0]).executeTransaction(transactionId);
        await tx2.wait();
        assert.deepStrictEqual(
            await multiSigWallet.getTransactionIdsInCondition(0, 2, excludePending, includeExecuted),
            [BigNumber.from(transactionId), BigNumber.from(transactionId2)]
        );
    });
});
