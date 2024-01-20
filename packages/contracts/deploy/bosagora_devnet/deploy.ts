import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import { ethers } from "hardhat";

import { HardhatAccount } from "../../src/HardhatAccount";
import { MultiSigWalletFactory } from "../../typechain-types";

import { BaseContract, Wallet } from "ethers";

import fs from "fs";

interface IDeployedContract {
    name: string;
    address: string;
    contract: BaseContract;
}

interface IAccount {
    deployer: Wallet;
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public deployers: FnDeployer[];
    public accounts: IAccount;

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();
        this.deployers = [];

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [deployer] = raws;

        this.accounts = {
            deployer,
        };
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, {
            name,
            address,
            contract,
        });
    }

    public getContract(name: string): BaseContract | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.contract;
        } else {
            return undefined;
        }
    }

    public getContractAddress(name: string): string | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.address;
        } else {
            return undefined;
        }
    }

    public addDeployer(deployer: FnDeployer) {
        this.deployers.push(deployer);
    }

    public async doDeploy() {
        for (const elem of this.deployers) {
            try {
                await elem(this.accounts, this);
            } catch (error) {
                console.log(error);
            }
        }
    }

    static filename = "./deploy/bosagora_devnet/deployed_contracts.json";

    public async loadContractInfo() {
        if (!fs.existsSync(Deployments.filename)) return;
        const data: any = JSON.parse(fs.readFileSync(Deployments.filename, "utf-8"));
        for (const key of Object.keys(data)) {
            const name = key;
            const address = data[key];
            console.log(`Load ${name} - ${address}...`);
            this.deployments.set(key, {
                name,
                address,
                contract: (await ethers.getContractFactory(name)).attach(address),
            });
        }
    }

    public saveContractInfo() {
        const contents: any = {};
        for (const key of this.deployments.keys()) {
            const item = this.deployments.get(key);
            if (item !== undefined) {
                contents[key] = item.address;
            }
        }
        fs.writeFileSync(Deployments.filename, JSON.stringify(contents), "utf-8");
    }
}

async function deployMultiSigWalletFactory(accounts: IAccount, deployment: Deployments) {
    const contractName = "MultiSigWalletFactory";
    console.log(`Deploy ${contractName}...`);
    const factory = await ethers.getContractFactory("MultiSigWalletFactory");
    const contract = (await factory.connect(accounts.deployer).deploy()) as MultiSigWalletFactory;
    await contract.deployed();
    await contract.deployTransaction.wait();

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function main() {
    const deployments = new Deployments();

    deployments.addDeployer(deployMultiSigWalletFactory);
    await deployments.loadContractInfo();
    await deployments.doDeploy();
    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
