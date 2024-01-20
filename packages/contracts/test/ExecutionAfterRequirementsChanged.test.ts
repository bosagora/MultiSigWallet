import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { BOACoin } from "../src/utils/Amount";
import { ContractUtils } from "../src/utils/ContractUtils";
import { MultiSigWallet } from "../typechain-types";

import assert from "assert";
import { BigNumber, Wallet } from "ethers";

import { AddressZero } from "@ethersproject/constants";

async function deployMultiSigWallet(deployer: Wallet, owners: string[], required: number): Promise<MultiSigWallet> {
    const factory = await ethers.getContractFactory("MultiSigWallet");
    const contract = (await factory.connect(deployer).deploy(AddressZero, owners, required)) as MultiSigWallet;
    await contract.deployed();
    await contract.deployTransaction.wait();
    return contract;
}

describe("MultiSigWallet", () => {
    let multisigInstance: MultiSigWallet;
    const requiredConfirmations = 2;
    const provider = ethers.provider;
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, owner0, owner1, owner2, owner3, account0, account1, account2] = raws;
    const owners = [owner0, owner1, owner2, owner3];
    const accounts = [account0, account1, account2];

    before(async () => {
        multisigInstance = await deployMultiSigWallet(
            deployer,
            owners.map((m) => m.address),
            requiredConfirmations
        );
        assert.ok(multisigInstance);
    });

    it("test execution after requirements changed", async () => {
        const deposit = BOACoin.make("100").value;

        await deployer.sendTransaction({
            to: multisigInstance.address,
            value: deposit,
        });
        const balance = await provider.getBalance(multisigInstance.address);
        assert.deepStrictEqual(balance.valueOf(), deposit);

        // Add owner wa_4
        const addOwnerData = multisigInstance.interface.encodeFunctionData("addOwner", [owners[3].address]);
        const transactionId = await ContractUtils.getEventValueBigNumber(
            await multisigInstance.connect(owners[0]).submitTransaction(multisigInstance.address, 0, addOwnerData),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId !== undefined);

        // There is one pending transaction
        const excludePending = false;
        const includePending = true;
        const excludeExecuted = false;
        const includeExecuted = true;
        assert.deepStrictEqual(await multisigInstance.getTransactionIds(0, 1, includePending, excludeExecuted), [
            BigNumber.from(transactionId),
        ]);

        // Update required to 1
        const newRequired = 1;
        const updateRequirementData = multisigInstance.interface.encodeFunctionData("changeRequirement", [newRequired]);

        // Submit successfully
        const transactionId2 = await ContractUtils.getEventValueBigNumber(
            await multisigInstance
                .connect(owners[0])
                .submitTransaction(multisigInstance.address, 0, updateRequirementData),
            multisigInstance.interface,
            "Submission",
            "transactionId"
        );
        assert.ok(transactionId2 !== undefined);

        assert.deepStrictEqual(await multisigInstance.getTransactionIds(0, 2, includePending, excludeExecuted), [
            BigNumber.from(transactionId),
            BigNumber.from(transactionId2),
        ]);

        // Confirm change requirement transaction
        await multisigInstance.connect(owners[1]).confirmTransaction(transactionId2);
        assert.equal((await multisigInstance.required()).toNumber(), newRequired);
        assert.deepStrictEqual(await multisigInstance.getTransactionIds(0, 1, excludePending, includeExecuted), [
            BigNumber.from(transactionId2),
        ]);

        await multisigInstance.connect(owners[0]).executeTransaction(transactionId);
        assert.deepStrictEqual(await multisigInstance.getTransactionIds(0, 2, excludePending, includeExecuted), [
            BigNumber.from(transactionId2),
            BigNumber.from(transactionId),
        ]);
    });
});
