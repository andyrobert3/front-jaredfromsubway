import {
  Address,
  decodeAbiParameters,
  encodeAbiParameters,
  getFunctionSelector,
  parseAbiItem,
} from "viem";
import { HexString } from "./rpc-service/Alchemy";

export const BANK_CONTRACT_ADDRESS =
  "0xD76465f2026F2ed2BC0016608E8354A99D8d60aC";
export const withdrawFnAbi = `function withdraw(bytes memory data, bytes memory signature, address receiver) public`;

// Gas limit for the "withdraw" function, based on empirical data from past transactions
export const WITHDRAW_FN_GAS_LIMIT = BigInt(67_500);

const withdrawFnAbiItem = parseAbiItem(withdrawFnAbi);
export const withdrawFnSelector = getFunctionSelector(withdrawFnAbiItem);

/**
 * Withdraw function can be seen here:
 * https://polygonscan.com/address/0xd76465f2026f2ed2bc0016608e8354a99d8d60ac#code
 *
 * Function signature
 * function withdraw(bytes memory data, bytes memory signature, address payable receiver)
 */
export const decodeWithdrawFnParameters = (txData: HexString) => {
  // Remove the function signature from the tx data
  const inputData: HexString = `0x${txData.slice(10)}`;
  return decodeAbiParameters(withdrawFnAbiItem.inputs, inputData);
};

export const encodeWithdrawFnParameters = (
  data: HexString,
  signature: HexString,
  receiver: Address,
): HexString => {
  const inputData = encodeAbiParameters(withdrawFnAbiItem.inputs, [
    data,
    signature,
    receiver,
  ]);
  // Add the function signature back to the tx data
  return `${withdrawFnSelector}${inputData.slice(2)}`;
};
