import { BigNumber, ethers, PopulatedTransaction } from "ethers";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import { polygon } from "viem/chains";
import { getEthersBankContract } from "../bankContract";
import { getAddress } from "viem";

const ethersProvider = new ethers.providers.JsonRpcProvider(
  { url: process.env.INFURA_RPC_URL as string },
  polygon.id,
);

const ethersSigner = new ethers.Wallet(
  process.env.PRIVATE_KEY as string,
  ethersProvider,
);

// Address that we want to send the dummy transactions to
// We control the private key of this address
const destinationAddress = "0xe60A3306924f661425B1d85D0FA981820124Af65";

/**
 * Send bundled transactions to the Marlin Relay (mev-bor) with "eth_sendBundle" RPC
 * Marlin Relay will forward to node RPC provided by "ethersProvider"
 * @param bundledTransactions
 */
export const sendBundledTransactions = async (
  bundledTransactions: FlashbotsBundleTransaction[],
) => {
  await ethersProvider.ready;

  // wrap it with the marlin relay provider
  const flashBundleProvider = new FlashbotsBundleProvider(
    ethersProvider,
    ethersSigner,
    { url: process.env.BUNDLER_RPC_URL as string },
    polygon.id,
  );

  const blk = await ethersProvider.getBlockNumber();

  // send bundle to marlin relay
  const result = await flashBundleProvider.sendBundle(
    bundledTransactions,
    blk + 1,
  );

  console.log("sendBundleResult", result);

  return result;
};

/**
 * Generates bundled transactions to be sent to the Marlin Relay (mev-bor)
 * MeV transaction is the first transaction in the bundle
 * The dummy transactions are ordered after the MeV transaction
 *
 * @returns FlashbotsBundleTransaction[]
 */
export const generateBundledTransactions = async (
  mevTxDetails: {
    maxPriorityFeePerGas: BigNumber;
    maxFeePerGas: BigNumber;
    data: string;
  } & Omit<PopulatedTransaction, "maxPriorityFeePerGas" | "maxFeePerGas">,
  numDummyTx: number,
): Promise<FlashbotsBundleTransaction[]> => {
  const bankContract = getEthersBankContract(ethersProvider);

  let nonce = await ethersProvider.getTransactionCount(ethersSigner.address);

  // Generate unsigned MeV transaction
  const mevPopulatedTx: ethers.PopulatedTransaction = {
    ...mevTxDetails,
    from: ethersSigner.address,
    to: bankContract.address,
    nonce: nonce++,
    value: BigNumber.from(0),
    chainId: polygon.id,
    gasLimit: BigNumber.from(75_000), // From previous transactions
    type: 2, // EIP-1559 transaction
  };

  // Generate unsigned dummy transactions, arbitrary transfers to another address -> owned by us
  const dummyPopulatedTxs = Array.from({ length: numDummyTx }).map(() => {
    const dummyMaxPriorityFeePerGas = mevTxDetails.maxPriorityFeePerGas
      .mul(7)
      .div(10);
    const dummyMaxFeePerGas = mevTxDetails.maxFeePerGas.mul(7).div(10);

    return createUnsignedTransaction({
      from: getAddress(ethersSigner.address),
      to: getAddress(destinationAddress),
      maxPriorityFeePerGas: dummyMaxPriorityFeePerGas,
      maxFeePerGas: dummyMaxFeePerGas,
      nonce: ++nonce,
    });
  });

  const populatedTransactions = [mevPopulatedTx].concat(dummyPopulatedTxs);
  return populatedTransactions.map((tx) => ({
    signer: ethersSigner,
    transaction: tx,
  }));
};

function createUnsignedTransaction({
  from,
  to,
  maxFeePerGas,
  maxPriorityFeePerGas,
  nonce,
}: {
  from: string;
  to: string;
  maxPriorityFeePerGas: BigNumber;
  maxFeePerGas: BigNumber;
  nonce: number;
}): ethers.PopulatedTransaction {
  // Define transaction details
  return {
    from,
    to,
    value: ethers.utils.parseEther("0.0001"), // Send miniscule amount, since we're only interested in tx position in the bundle
    nonce, // Get the nonce for the sender
    gasLimit: ethers.BigNumber.from(21_000), // Standard gas limit for ETH transfer
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasPrice: maxFeePerGas,
    chainId: polygon.id,
    // Simple transfer function
    data: "0x",
    type: 2, // EIP-1559 transaction
  };
}
