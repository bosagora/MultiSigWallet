# Multi-Signature Wallet

---

Forked from Repository https://github.com/gnosis/MultiSigWallet

The following features have been changed

-   Change the version of the smart contract to 0.8.2.
-   Change to hardhat instead of truffle

The following features have been added

-   Implement a feature that provides the address of the owner's multi-sig wallet contracts
-   The interface and the class were separated

## Install NodeJS

https://nodejs.org/en/download

## Install yarn

```shell
npm install -g yarn
```

## Install Project

```shell
git clone https://github.com/bosagora/MultiSigWallet.git
cd MultiSigWallet
yarn install
```

## Test Project

```shell
cd packages/contracts
cp -r env/.env.sample env/.env
yarn run test
```
