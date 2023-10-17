import axios from "axios";
import { parseGwei } from "viem";

interface BlockPrice {
  blockNumber: number;
  estimatedTransactionCount: number;
  baseFeePerGas: number;
  estimatedPrices: {
    confidence: number;
    price: number;
    maxPriorityFeePerGas: number;
    maxFeePerGas: number;
  }[];
}

interface BlockNativeGasInfo {
  system: string;
  network: string;
  unit: string;
  maxPrice: number;
  currentBlockNumber: number;
  msSinceLastBlock: number;
  blockPrices: BlockPrice[];
}

const BLOCKNATIVE_POLYGON_API_URL =
  "https://api.blocknative.com/gasprices/blockprices?chainid=137";

/**
 * Returns the current gas price for the Polygon network in gwei
 * Uses the BlockNative API
 * https://docs.blocknative.com/gas-prediction/gas-platform
 */
export const getBlockNativePolygonGasPrice = async (): Promise<{
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  estimatedBaseFee: bigint;
}> => {
  const response = await axios.get(BLOCKNATIVE_POLYGON_API_URL);
  const { blockPrices } = response.data as BlockNativeGasInfo;

  if (!blockPrices) {
    throw new Error("No block prices found");
  }

  // First is highest confidence level (99%)
  const blockPrice = blockPrices?.[0];
  const baseFee = blockPrice?.baseFeePerGas;

  const estimatedPrice = blockPrice?.estimatedPrices?.[0];
  if (!estimatedPrice) {
    throw new Error("No estimated price found");
  }

  const { maxPriorityFeePerGas, maxFeePerGas } = estimatedPrice;

  return {
    maxPriorityFeePerGas: parseGwei(maxPriorityFeePerGas.toString(10)),
    maxFeePerGas: parseGwei(maxFeePerGas.toString(10)),
    estimatedBaseFee: parseGwei(baseFee.toString(10)),
  };
};
