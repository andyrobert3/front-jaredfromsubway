import {
  alchemySubscribeToPendingTx,
  getAlchemyClient,
  HexString,
} from "./Alchemy";
import { getInfuraPublicClient, getQuickNodePublicClient } from "./ViemClient";
import { Address, hexToBigInt, PublicClient } from "viem";
import { BANK_CONTRACT_ADDRESS, withdrawFnSelector } from "../BankContract";
import Bottleneck from "bottleneck";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../utils/logger";

const alchemySdkClient = getAlchemyClient();
const infuraPublicClient = getInfuraPublicClient();
const quickNodePublicClient = getQuickNodePublicClient();

// Rate limiter to prevent spamming the RPC provider (429 errors)
const limiter = new Bottleneck({
  maxConcurrent: 3, // Number of requests that can run concurrently
  minTime: 50, // Minimum time (in milliseconds) between subsequent tasks
});

/**
 * Check if a transaction is a valid "withdraw" transaction and if it is not from the MEV account
 */
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

export type PendingSubscriptionTxInfo = {
  hash: HexString;
  input: HexString;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
};

/**
 * Subscribe to pending transactions in the mempool for the bank contract "withdraw" function
 */
export const subscribeToWithdrawPendingTx = (
  callback: (txDetails: PendingSubscriptionTxInfo) => void,
) => {
  // Store the lower case hash of the transaction to prevent duplicates from being processed
  const seenPendingTxHashes = new Set<string>();

  // Handler for pending transactions in mempool
  const handlePendingTx = async (
    hash: HexString,
    publicClient: PublicClient,
  ) => {
    const tx = await publicClient.getTransaction({
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
  const throttleHandlePendingTx = (
    hash: HexString,
    publicClient: PublicClient,
  ) => limiter.schedule(() => handlePendingTx(hash, publicClient));

  logger.info(`Listening to pending transactions in mempool...`);

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
  quickNodePublicClient.watchPendingTransactions({
    onTransactions: async (hashes) => {
      await Promise.allSettled(
        hashes.map((hash) =>
          throttleHandlePendingTx(hash, quickNodePublicClient),
        ),
      );
    },
  });

  // Subscribe to pending transactions in mempool with Infura
  infuraPublicClient.watchPendingTransactions({
    onTransactions: async (hashes) => {
      await Promise.allSettled(
        hashes.map((hash) => throttleHandlePendingTx(hash, infuraPublicClient)),
      );
    },
  });
};
