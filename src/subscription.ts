import {
  alchemySubscribeToPendingTx,
  getAlchemyClient,
  HexString,
} from "./alchemy";
import { getInfuraPublicClient, getQuickNodePublicClient } from "./client";
import { Address, hexToBigInt } from "viem";
import { BANK_CONTRACT_ADDRESS, withdrawFnSelector } from "./bank";
import Bottleneck from "bottleneck";
import { privateKeyToAccount } from "viem/accounts";

const alchemySdkClient = getAlchemyClient();
const infuraWalletClient = getInfuraPublicClient();
const quickNodeWalletClient = getQuickNodePublicClient();

const limiter = new Bottleneck({
  maxConcurrent: 3, // Number of requests that can run concurrently
  minTime: 50, // Minimum time (in milliseconds) between subsequent tasks
});

const isValidWithdrawBankTx = (
  fromAddress: Address,
  toAddress: Address,
  inputData: HexString,
) => {
  // Only include transactions to the bank contract
  if (toAddress.toLowerCase() !== BANK_CONTRACT_ADDRESS.toLowerCase()) {
    return false;
  }

  // Do not include transactions from the MEV account that we are front running
  const mevAccount = privateKeyToAccount(process.env.PRIVATE_KEY as HexString);
  if (fromAddress.toLowerCase() === mevAccount.address.toLowerCase()) {
    return false;
  }

  // Only allow transactions that call the "withdraw" function
  return (
    inputData.slice(0, 10).toLowerCase() === withdrawFnSelector.toLowerCase()
  );
};

/**
 * Subscribe to pending transactions in the mempool for the bank contract "withdraw" function
 */
export const subscribeToWithdrawPendingTx = (
  callback: (txDetails: {
    hash: HexString;
    input: HexString;
    maxPriorityFeePerGas?: bigint;
    maxFeePerGas?: bigint;
  }) => void,
) => {
  const seenPendingTxHashes = new Set<string>();

  // Handler for pending transactions in mempool
  const handlePendingTx = async (hash: HexString) => {
    const tx = await quickNodeWalletClient.getTransaction({
      hash,
    });

    // Check if the transaction is a "withdraw" transaction, and if it has already been seen
    if (
      seenPendingTxHashes.has(tx.hash.toLowerCase()) ||
      tx.to === null ||
      !isValidWithdrawBankTx(tx.from, tx.to, tx.input)
    ) {
      return;
    }

    seenPendingTxHashes.add(tx.hash.toLowerCase());
    callback({
      hash: tx.hash,
      input: tx.input,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    });
  };
  const throttleHandlePendingTx = (hash: HexString) =>
    limiter.schedule(() => handlePendingTx(hash));

  console.log(`Listening to pending transactions in mempool...`);

  // Subscribe to pending transactions in mempool with Alchemy special RPC
  alchemySubscribeToPendingTx(alchemySdkClient, BANK_CONTRACT_ADDRESS, (tx) => {
    if (
      seenPendingTxHashes.has(tx.hash.toLowerCase()) ||
      !isValidWithdrawBankTx(tx.from, tx.to, tx.input)
    ) {
      return;
    }

    seenPendingTxHashes.add(tx.hash.toLowerCase());
    callback({
      hash: tx.hash,
      input: tx.input,
      maxFeePerGas: hexToBigInt(tx.maxFeePerGas),
      maxPriorityFeePerGas: hexToBigInt(tx.maxPriorityFeePerGas),
    });
  });

  // Subscribe to pending transactions in mempool with QuickNode
  quickNodeWalletClient.watchPendingTransactions({
    onTransactions: async (hashes) => {
      await Promise.allSettled(hashes.map(throttleHandlePendingTx));
    },
  });

  // Subscribe to pending transactions in mempool with Infura
  infuraWalletClient.watchPendingTransactions({
    onTransactions: async (hashes) => {
      await Promise.allSettled(hashes.map(throttleHandlePendingTx));
    },
  });
};
