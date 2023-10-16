import {
  Alchemy,
  AlchemySettings,
  AlchemySubscription,
  Network,
} from "alchemy-sdk";

export type HexString = `0x${string}`;

export type PendingTransaction = {
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

export const alchemySubscribeToPendingTx = (
  alchemy: Alchemy,
  addressToMonitor: string,
  callback: (tx: PendingTransaction) => void,
) => {
  return alchemy.ws.on(
    {
      method: AlchemySubscription.PENDING_TRANSACTIONS,
      toAddress: addressToMonitor,
    },
    callback,
  );
};
