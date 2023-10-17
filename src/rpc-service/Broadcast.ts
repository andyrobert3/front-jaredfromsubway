import { HexString } from "./Alchemy";
import {
  getAlchemyWalletClient,
  getInfuraWalletClient,
  getQuickNodeWalletClient,
  getWalletClient,
} from "./ViemClient";
import { parseUnits, SendTransactionParameters } from "viem";
import logger from "../utils/logger";

// Number is dependent on the number of dummy private keys in the .env file
const NUM_DUMMY_PRIVATE_KEYS = 15;
const NUM_WS_QUICKNODE_RPC_URLS = 4;

const dummyWalletPrivateKeys = Array(NUM_DUMMY_PRIVATE_KEYS)
  .fill(null)
  .map(
    (value, index) =>
      process.env[`DUMMY_PRIVATE_KEY_${index + 1}`] as HexString,
  );

const dummyWalletClients = dummyWalletPrivateKeys.map((privateKey, index) => {
  const wsRpcUrl = process.env[
    `QUICKNODE_WEBSOCKET_RPC_URL_${(index % NUM_WS_QUICKNODE_RPC_URLS) + 1}`
  ] as string;

  return getWalletClient(privateKey, {
    wsRpcUrl,
  });
});

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

  logger.info(`Broadcasting frontrun transaction to multiple nodes`);

  // Send transaction to multiple RPC nodes
  const [alchemyResult, infuraResult, quickNodeResult] =
    await Promise.allSettled([
      alchemyWalletClient.sendTransaction(sendTxParams),
      infuraWalletClient.sendTransaction(sendTxParams),
      quickNodeWalletClient.sendTransaction(sendTxParams),
    ]);

  logger.info(`Broadcasted frontrun transaction`);

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

  // QuickNode propagation must be successful by elimination
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
  // Generate dummy transactions, to be sent to the network with higher gas fees than the original "withdraw" transaction
  const dummyTxPromises = dummyWalletClients.map((dummyClient, index) => {
    const destinationWalletClient =
      dummyWalletClients[(index + 1) % dummyWalletClients.length];

    // Simple transfer transaction
    return dummyClient.sendTransaction({
      to: destinationWalletClient.account.address,
      maxFeePerGas,
      maxPriorityFeePerGas,
      data: "0x",
      value: parseUnits("0.0001", 18),
    });
  });

  logger.info(`Sending ${dummyTxPromises.length} dummy transactions...`);

  // Send dummy transactions to the network
  const dummyTxResults = await Promise.allSettled(dummyTxPromises);

  logger.info(`Sent dummy transactions!`);

  // Check if any of the dummy transactions failed to broadcast
  const failedDummyTxs = dummyTxResults.filter(
    (result) => result.status === "rejected",
  );

  if (failedDummyTxs.length > 0) {
    logger.warn(
      `Failed to broadcast ${failedDummyTxs.length} dummy transactions: ${failedDummyTxs})`,
    );
  }

  return dummyTxResults;
};

/**
 * Broadcasts the original "withdraw" transaction, together with dummy transactions to the network with higher gas fees than the original "withdraw" transaction
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