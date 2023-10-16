import { HexString } from "./alchemy";
import {
  getAlchemyWalletClient,
  getInfuraWalletClient,
  getQuickNodeWalletClient,
  getWalletClient,
} from "./client";
import { parseUnits, SendTransactionParameters } from "viem";

/**
 * Creates, signs & broadcasts transaction to multiple RPC nodes
 * Returns the transaction hash
 * @param sendTxParams Transaction parameters
 */
export const broadcastTransaction = async (
  sendTxParams: SendTransactionParameters,
): Promise<HexString> => {
  const alchemyWalletClient = getAlchemyWalletClient();
  const infuraWalletClient = getInfuraWalletClient();
  const quickNodeWalletClient = getQuickNodeWalletClient();

  // Send transaction to multiple RPC nodes
  const [alchemyResult, infuraResult, quickNodeResult] =
    await Promise.allSettled([
      alchemyWalletClient.sendTransaction(sendTxParams),
      infuraWalletClient.sendTransaction(sendTxParams),
      quickNodeWalletClient.sendTransaction(sendTxParams),
    ]);

  // Check if any of the RPC nodes failed to broadcast the transaction
  if (
    alchemyResult.status === "rejected" &&
    infuraResult.status === "rejected" &&
    quickNodeResult.status === "rejected"
  ) {
    throw new Error(
      `Failed to broadcast transaction to all RPC nodes: ${alchemyResult.reason}, ${infuraResult.reason}, ${quickNodeResult.reason}`,
    );
  }

  // Return the transaction hash from the first RPC node that successfully broadcasted the transaction
  if (alchemyResult.status === "fulfilled") {
    return alchemyResult.value;
  }
  if (infuraResult.status === "fulfilled") {
    return infuraResult.value;
  }

  return (quickNodeResult as PromiseFulfilledResult<`0x${string}`>).value;
};

/**
 * Create dummy transactions with higher gas price than the original "withdraw" transaction
 * This is to reduce the chance the original "withdraw" transaction is included in a block
 *
 * @param maxFeePerGas
 * @param maxPriorityFeePerGas
 */
export const sendDummyTransactions = async ({
  maxFeePerGas,
  maxPriorityFeePerGas,
}: {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}) => {
  // Generate dummy transactions, to be sent to the network with higher gas fees
  const dummyWalletClient1 = getWalletClient(
    process.env.DUMMY_PRIVATE_KEY_1 as HexString,
    { wsRpcUrl: process.env.QUICKNODE_WEBSOCKET_RPC_URL_1 as string },
  );
  const dummyWalletClient2 = getWalletClient(
    process.env.DUMMY_PRIVATE_KEY_2 as HexString,
    { wsRpcUrl: process.env.QUICKNODE_WEBSOCKET_RPC_URL_2 as string },
  );
  const dummyWalletClient3 = getWalletClient(
    process.env.DUMMY_PRIVATE_KEY_3 as HexString,
    { wsRpcUrl: process.env.QUICKNODE_WEBSOCKET_RPC_URL_3 as string },
  );
  const dummyWalletClient4 = getWalletClient(
    process.env.DUMMY_PRIVATE_KEY_4 as HexString,
    { wsRpcUrl: process.env.QUICKNODE_WEBSOCKET_RPC_URL_4 as string },
  );

  // Send dummy transactions to the network
  const dummyTx1Promise = dummyWalletClient1.sendTransaction({
    to: dummyWalletClient2.account.address,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data: "0x",
    value: parseUnits("0.0001", 18),
  });

  const dummyTx2Promise = dummyWalletClient2.sendTransaction({
    to: dummyWalletClient3.account.address,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data: "0x",
    value: parseUnits("0.0001", 18),
  });

  const dummyTx3Promise = dummyWalletClient3.sendTransaction({
    to: dummyWalletClient4.account.address,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data: "0x",
    value: parseUnits("0.0001", 18),
  });

  const dummyTx4Promise = dummyWalletClient4.sendTransaction({
    to: dummyWalletClient1.account.address,
    maxFeePerGas,
    maxPriorityFeePerGas,
    data: "0x",
    value: parseUnits("0.0001", 18),
  });

  console.log(`Sending dummy transactions...`);

  // Send dummy transactions to the network
  const dummyTxResults = await Promise.allSettled([
    dummyTx1Promise,
    dummyTx2Promise,
    dummyTx3Promise,
    dummyTx4Promise,
  ]);

  console.log(`Dummy transactions sent!`);

  // Check if any of the dummy transactions failed to broadcast
  const failedDummyTxs = dummyTxResults.filter(
    (result) => result.status === "rejected",
  );

  if (failedDummyTxs.length > 0) {
    throw new Error(
      `Failed to broadcast dummy transactions: ${failedDummyTxs.map(
        (result) => (result as PromiseRejectedResult).reason,
      )}`,
    );
  }

  return dummyTxResults;
};

/**
 * Broadcasts the original "withdraw" transaction, together with dummy transactions to the network with higher gas fees
 * @param sendTxParams
 * @param maxFeePerGas
 */
export const broadcastTransactionWithDummyTxs = async (
  sendTxParams: SendTransactionParameters,
  {
    dummyMaxPriorityFeePerGas,
    dummyMaxFeePerGas,
  }: { dummyMaxPriorityFeePerGas: bigint; dummyMaxFeePerGas: bigint },
) => {
  const [mevTxResult, dummyTxsResult] = await Promise.allSettled([
    broadcastTransaction(sendTxParams),
    sendDummyTransactions({
      maxFeePerGas: dummyMaxFeePerGas,
      maxPriorityFeePerGas: dummyMaxPriorityFeePerGas,
    }),
  ]);

  if (mevTxResult.status === "rejected") {
    throw new Error(
      `Failed to broadcast MeV transaction: ${mevTxResult.reason}`,
    );
  }

  if (dummyTxsResult.status === "rejected") {
    throw new Error(
      `Failed to broadcast dummy transactions: ${dummyTxsResult.reason}`,
    );
  }

  return mevTxResult.value;
};

// 2. Try fastlane -> https://fastlane-labs.gitbook.io/polygon-fastlane/searcher-guides/searcher-bundles/full-example
// 3. Wait for Merlin
// 4. Clean up code -> Cleaner error handling, retry mechanisms, etc.
