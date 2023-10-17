import axios from "axios";
import { parseGwei } from "viem";

export type GasInfo = {
  safeLow: {
    maxPriorityFee: number;
    maxFee: number;
  };
  standard: {
    maxPriorityFee: number;
    maxFee: number;
  };
  fast: {
    maxPriorityFee: number;
    maxFee: number;
  };
  estimatedBaseFee: number;
  blockTime: number;
  blockNumber: number;
};

const POLYGON_GAS_STATION_URL = "https://gasstation.polygon.technology/v2";

/**
 * Returns the current gas price for the Polygon network in gwei
 * Uses the Polygon Gas Station API (Fast fees)
 */
export const getPolygonGasPrice = async (): Promise<{
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  estimatedBaseFee: bigint;
}> => {
  const response = await axios.get(POLYGON_GAS_STATION_URL);
  const {
    fast: { maxPriorityFee, maxFee },
    estimatedBaseFee,
  } = response.data as GasInfo;

  return {
    maxPriorityFeePerGas: parseGwei(maxPriorityFee.toString(10)),
    maxFeePerGas: parseGwei(maxFee.toString(10)),
    estimatedBaseFee: parseGwei(estimatedBaseFee.toString(10)),
  };
};
