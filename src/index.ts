import "dotenv/config";
import { getAlchemyClient } from "./alchemy";
import { getPolygonGasPrice } from "./polygon";
import { formatGwei } from "viem";
import {
  BANK_CONTRACT_ADDRESS,
  decodeWithdrawFnParameters,
  encodeWithdrawFnParameters,
  WITHDRAW_FN_GAS_LIMIT,
} from "./bank";
import { getAlchemyWalletClient, getPublicClient } from "./client";
import { subscribeToWithdrawPendingTx } from "./subscription";
import { BigNumber } from "ethers";
import {
  generateBundledTransactions,
  sendBundledTransactions,
} from "./flashbot";
import { broadcastTransactionWithDummyTxs } from "./broadcast";
import { polygon } from "viem/chains";

const alchemySdkClient = getAlchemyClient();
const walletClient = getAlchemyWalletClient();
const publicClient = getPublicClient({
  wsRpcUrl: process.env.ALCHEMY_WEBSOCKET_RPC_URL as string,
});

const walletAccount = walletClient.account!;

// Address of the bank contract

let polygonMaxFeePerGas: bigint = BigInt(0);
let polygonMaxPriorityFeePerGas: bigint = BigInt(0);
let polygonEstimatedBaseFee: bigint = BigInt(0);
let nonce: number = 0;

const shouldBroadcastViaMarlinBundle = process.env.ENABLE_MARLIN === "true";

const pollPolygonGasPrice = () => {
  const fetchPolygonGasPrice = async () => {
    try {
      const { maxPriorityFeePerGas, maxFeePerGas, estimatedBaseFee } =
        await getPolygonGasPrice();
      polygonMaxFeePerGas = maxFeePerGas;
      polygonMaxPriorityFeePerGas = maxPriorityFeePerGas;
      polygonEstimatedBaseFee = estimatedBaseFee;
    } catch (e) {
      // Use the previous gas price if fetching the new one fails
      console.error(e);
    }
  };

  fetchPolygonGasPrice();
  // Periodically fetch Polygon gas price from Polygon Gas Station API
  setInterval(fetchPolygonGasPrice, 20_000);
};

// Update nonce every 60s, avoid eth_getTransactionCount extra request
const pollNonce = () => {
  const fetchNonce = async () => {
    nonce = await publicClient.getTransactionCount({
      address: walletAccount!.address,
    });
  };

  fetchNonce();
  setInterval(fetchNonce, 60_000);
};

// Periodically fetch Polygon gas price from Polygon Gas Station API
pollNonce();
pollPolygonGasPrice();

// Subscribe to pending transactions in mempool that call "withdraw" function on Bank contract
subscribeToWithdrawPendingTx(async (txDetails) => {
  console.log(
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

  console.log({
    originalMaxFeePerGas: formatGwei(txDetails.maxFeePerGas!),
    originalMaxPriorityFeePerGas: formatGwei(txDetails.maxPriorityFeePerGas!),
  });

  // Broadcast the transaction to the network with higher gas fees, as a factor of 4x and 8x
  // PGA -> Priority Gas Auction
  const maxPriorityFeePerGas =
    txDetails.maxPriorityFeePerGas ?? polygonMaxPriorityFeePerGas;
  const bumpedMaxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(3);
  const bumpedMaxFeePerGas =
    (polygonEstimatedBaseFee * BigInt(3)) / BigInt(2) +
    bumpedMaxPriorityFeePerGas;

  console.log({
    bumpedMaxFeePerGas: formatGwei(bumpedMaxFeePerGas),
    bumpedMaxPriorityFeePerGas: formatGwei(bumpedMaxPriorityFeePerGas),
  });

  try {
    console.log(`Broadcasting transaction to network...`);

    if (shouldBroadcastViaMarlinBundle) {
      const bundledTransactions = await generateBundledTransactions(
        {
          maxPriorityFeePerGas: BigNumber.from(
            polygonMaxPriorityFeePerGas.toString(),
          ),
          maxFeePerGas: BigNumber.from(polygonMaxFeePerGas.toString()),
          data,
        },
        2,
      );

      const sentBundledTxResult =
        await sendBundledTransactions(bundledTransactions);

      console.log("sentBundledTxResult", sentBundledTxResult);
    } else {
      const dummyMaxPriorityFeePerGas =
        (maxPriorityFeePerGas * BigInt(3)) / BigInt(2);
      const dummyMaxFeePerGas =
        (polygonEstimatedBaseFee * BigInt(12)) / BigInt(10) +
        dummyMaxPriorityFeePerGas;

      console.log({
        dummyMaxFeePerGas: formatGwei(dummyMaxFeePerGas),
        dummyMaxPriorityFeePerGas: formatGwei(dummyMaxPriorityFeePerGas),
      });

      const txHash = await broadcastTransactionWithDummyTxs(
        {
          account: walletAccount,
          chain: polygon,
          data: modifiedInputTxData,
          to: BANK_CONTRACT_ADDRESS,
          maxFeePerGas: bumpedMaxFeePerGas,
          maxPriorityFeePerGas: bumpedMaxPriorityFeePerGas,
          nonce,
          gas: WITHDRAW_FN_GAS_LIMIT,
        },
        // For dummy transactions, we want it to be higher than the original "withdraw" transaction but lower than the MeV transaction
        {
          dummyMaxFeePerGas,
          dummyMaxPriorityFeePerGas,
        },
      );

      console.log(`Transaction ${txHash} broadcasted to network`);

      // Wait for the transaction to be mined
      const txReceipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (txReceipt.status === "success") {
        console.log(`Transaction ${txReceipt.transactionHash} mined`);
      } else {
        console.error(
          `Failed to frontrun "withdraw" transaction, txHash: ${txReceipt.transactionHash}`,
        );
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Clean up when the process is terminated
process.on("SIGINT", () => {
  // Remove dangling listeners
  alchemySdkClient.ws.removeAllListeners();
  process.exit();
});

// - Send dummy transactions, bundled with the withdraw transaction (Flashbots)
