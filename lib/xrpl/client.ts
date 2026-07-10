import { Client } from "xrpl";

const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";

let clientInstance: Client | null = null;

export function getXrplUrl(): string {
  return process.env.XRPL_NODE_URL ?? TESTNET_URL;
}

export async function getClient(): Promise<Client> {
  if (clientInstance && clientInstance.isConnected()) {
    return clientInstance;
  }

  clientInstance = new Client(getXrplUrl());
  await clientInstance.connect();
  return clientInstance;
}

export async function disconnectClient(): Promise<void> {
  if (clientInstance && clientInstance.isConnected()) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}

export function isTestnet(): boolean {
  return getXrplUrl().includes("altnet") || getXrplUrl().includes("testnet");
}
