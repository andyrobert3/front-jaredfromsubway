import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  WalletClient,
  webSocket,
} from "viem";
import { polygon } from "viem/chains";
import { HexString } from "./Alchemy";
import { RequireAtLeastOne } from "alchemy-sdk";

export const getWalletClient = (
  privateKey: HexString,
  {
    httpRpcUrl,
    wsRpcUrl,
  }: RequireAtLeastOne<{ httpRpcUrl?: string; wsRpcUrl?: string }>,
) => {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: polygon,
    transport: httpRpcUrl ? http(httpRpcUrl) : webSocket(wsRpcUrl),
  });
};

export const getPublicClient = ({
  httpRpcUrl,
  wsRpcUrl,
}: RequireAtLeastOne<{ httpRpcUrl?: string; wsRpcUrl?: string }>) => {
  return createPublicClient({
    chain: polygon,
    transport: httpRpcUrl ? http(httpRpcUrl) : webSocket(wsRpcUrl),
  });
};

// Create clients for Alchemy, Infura and QuickNode
let alchemyWalletClient: WalletClient;
let infuraWalletClient: WalletClient;
let quickNodeWalletClient: WalletClient;

let infuraPublicClient: PublicClient;
let quickNodePublicClient: PublicClient;

const getAlchemyWalletClient = () => {
  if (!alchemyWalletClient) {
    alchemyWalletClient = getWalletClient(
      process.env.PRIVATE_KEY as HexString,
      {
        wsRpcUrl: process.env.ALCHEMY_WEBSOCKET_RPC_URL as string,
      },
    );
  }
  return alchemyWalletClient;
};

const getInfuraWalletClient = () => {
  if (!infuraWalletClient) {
    infuraWalletClient = getWalletClient(process.env.PRIVATE_KEY as HexString, {
      httpRpcUrl: process.env.INFURA_RPC_URL as string,
    });
  }
  return infuraWalletClient;
};

const getInfuraPublicClient = () => {
  if (!infuraPublicClient) {
    infuraPublicClient = getPublicClient({
      httpRpcUrl: process.env.INFURA_RPC_URL as string,
    });
  }
  return infuraPublicClient;
};

const getQuickNodeWalletClient = () => {
  if (!quickNodeWalletClient) {
    quickNodeWalletClient = getWalletClient(
      process.env.PRIVATE_KEY as HexString,
      {
        wsRpcUrl: process.env.QUICKNODE_WEBSOCKET_RPC_URL_1 as string,
      },
    );
  }
  return quickNodeWalletClient;
};

const getQuickNodePublicClient = () => {
  if (!quickNodePublicClient) {
    quickNodePublicClient = getPublicClient({
      httpRpcUrl: process.env.QUICKNODE_WEBSOCKET_RPC_URL_1 as string,
    });
  }

  return quickNodePublicClient;
};

export {
  getAlchemyWalletClient,
  getInfuraWalletClient,
  getQuickNodeWalletClient,
  getInfuraPublicClient,
  getQuickNodePublicClient,
};
