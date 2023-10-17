import {
  Alchemy,
  AlchemySettings,
  AlchemySubscription,
  Network,
} from "alchemy-sdk";

export type HexString = `0x${string}`;

export type AlchemyPendingTxDetails = {
  blockHash: null;
  blockNumber: null;
  from: HexString;
  gas: HexString;
  gasPrice: HexString;
  maxFeePerGas: HexString;
  maxPriorityFeePerGas: HexString;
  hash: HexString;
  input: HexString;
  nonce: HexString;
  to: HexString;
  transactionIndex: null;
  value: HexString;
  type: string;
  accessList: [];
  chainId: HexString;
  v: HexString;
  r: HexString;
  s: HexString;
};

// Clean up the code by using a settings object
const settings: AlchemySettings = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.MATIC_MAINNET,
};

let alchemyClient: Alchemy;

export const getAlchemyClient = () => {
  if (!alchemyClient) {
    alchemyClient = new Alchemy(settings);
  }
  return alchemyClient;
};

/**
 * Subscribe to pending transactions in the mempool for the bank contract "withdraw" function
 * JSON RPC WebSocket subscription method "alchemy_pendingTransactions" provided by Alchemy
 * Ability to filter by "toAddress" and "fromAddress", with single RPC call
 *
 * https://docs.alchemy.com/reference/alchemy-pendingtransactions
 *
 * @param alchemy
 * @param addressToMonitor
 * @param callback
 */
export const alchemySubscribeToPendingTx = (
  alchemy: Alchemy,
  addressToMonitor: string,
  callback: (tx: AlchemyPendingTxDetails) => void,
) => {
  return alchemy.ws.on(
    {
      method: AlchemySubscription.PENDING_TRANSACTIONS,
      toAddress: addressToMonitor,
    },
    callback,
  );
};
