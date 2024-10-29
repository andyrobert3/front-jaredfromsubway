# 🏦 Frontrunning Bank Contract

## Overview

Intercept and front-run the attacker's transaction to claim the reward prize for ourselves by utilizing the pending transaction input data.

- Contract Address: `0xD76465f2026F2ed2BC0016608E8354A99D8d60aC`
- Network: **Polygon Mainnet**
- Attacker's Address: `0x3d78949fA08c783a2B525AB58199cfe76713BCdA`
- Dummy Addresses: `0xe60A3306924f661425B1d85D0FA981820124Af65`, `0x0Aa75C388D22EEf9f01F9658aA813b9B6F923b14`, `0x2F0A8D24E2f7C530e9E4De13818fD1608651192A`, `0xE96822a88351CB89C739C99730d5272f02DbE100`, `0x75d0187A11CBC5b96354D35dF460E2973B3134a7`, `0x16FbAFDd1f0701cab76706e72362326c553758f9`, `0x3e8F91b7d7C86a074DCc542dB2F9EcB3E0625838`, `0xAA96A47ba969C93dFFCc3ca0756A865270e5245D`, `0xc9f2f14Fd97F7f4e5D078157218bAc7AC1a144E4`, `0x43FBc43689f4862a3645c0Ee97851646F0274df2`, `0x1aD2E34Fd3255D422340A17e00C625D564248DDd`, `0x8c5cFcF0b5bff4B050F5f0d3b9C415c9Ab1bae1A`, `0x668877d79dbE0aE02a0B1636042F015C85D99977`, `0xc0710deFB38c3AA9d6f12d89b96c1165aE96A4B8`, `0x24e78e308137BfECCf694b09777bAD5a5033D2aE`

## Setup & Execution

### Prerequisites

Ensure you have the necessary packages installed:

```bash
$ pnpm install
```

### Run the Script

```bash
$ pnpm run start
```

## Strategy

1. **Monitor Transactions**
   - Use the `eth_subscribe` RPC websocket endpoint to watch for pending transactions targeting the Bank contract's withdraw function.
   - Employ multiple node RPC endpoints to boost the probability of catching the transaction in the mempool.
   - Favor the Alchemy RPC provider due to its exclusive `alchemy_pendingTransations` websocket endpoint. This allows transaction subscriptions with the ability to filter by `from` and `to` addresses.
   - For alternate node providers, utilize `eth_getTransactionByHash` on every pending transaction hash to get the transaction details, then filter by `to` address.
   - Specifically, watch for transactions directed at the Bank contract's withdraw function that aren't initiated by the attacker's address.
2. **Manipulate Transaction Data**

   - Decode the transaction input data.
   - Re-encode this data, substituting the `address receiver` field with the attacker's address.

3. **Front run the Transaction**:
   - Push the modified transaction to the network, setting a gas price higher than the original transaction.
     - Prioritize the transaction using **higher** values for `maxPriorityFeePerGas` and `maxFeePerGas`.
     - Broadcast dummy transactions simultaneously with gas prices that fall between the original and the front-running transaction. We try to occupy block space, hindering the original transaction's mining chance.
     - Use various node RPC endpoints to boost the likelihood of the transaction's inclusion in the subsequent block.

## Potential Enhancements

1. **Bundle Transactions**
   - Bundle the front-running and dummy transactions, broadcasting them together via the `eth_sendBundle` RPC endpoint, leveraging Marlin Relay.
     - Marlin Relay, with `mev_bor`, will broadcast the bundle to the network's execution nodes.
     - Nodes typically execute bundles at the block's top, capitalizing on their profits.
     - The source code introduces `sendBundledTransactions` function to broadcast the bundle via Marlin Relay, the relay node on the Polygon network is currently offline due to a recent upgrade.
     - So the script defaults to broadcasting the transactions without bundling.
2. **Target Influential Nodes**
   - Propagate transactions to nodes boasting the highest power or those having produced the maximum blocks in the past 24 hours.
     - This can be achieved by modifying the node's source code, during slot generation to find out the next block producers.
     - Subsequently, transactions can be sent directly to these producers to maximise chance of inclusion.
3. **Optimized Timing**
   - Broadcast the front-running transaction around the time the proposer requests the current slot's header.
