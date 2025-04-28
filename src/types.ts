/**
 * Types for Ethereum providers and transactions
 */

/**
 * Ethereum transaction request parameters
 */
export interface EthereumTransactionParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  [key: string]: unknown;
}

/**
 * Ethereum JSON-RPC request payload
 */
export interface EthereumRequestPayload {
  method: string;
  params?: EthereumTransactionParams[] | unknown[];
  id?: number | string;
  jsonrpc?: string;
  [key: string]: unknown;
}

/**
 * Ethereum provider interface
 */
export interface EthereumProvider {
  request: (payload: EthereumRequestPayload) => Promise<unknown>;
  [key: string]: unknown;
  __intercepted?: boolean;
}

/**
 * Window with Ethereum providers
 */
export interface WindowWithEthereum extends Window {
  ethereum?: EthereumProvider;
  rabby?: EthereumProvider;
}

/**
 * List of Ethereum signing methods to monitor
 */
export const SIGNING_METHODS = [
  'eth_signTransaction',
  'eth_sendTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'wallet_sendTransaction',
  'wallet_signTransaction',
  'wallet_sign',
  'wallet_signTypedData',
] as const;

/**
 * List of transaction methods that are currently supported for monitoring
 */
export const SUPPORTED_METHODS: string[] = ['eth_sendTransaction', 'eth_signTypedData_v4'] as const;

export type SigningMethod = (typeof SIGNING_METHODS)[number];

/**
 * Type for EIP-712 transaction data
 */
export interface EIP712SafeTx {
  chainId: string;
  safeAddress: string;
  from: string;
  to: string;
  value: string;
  data: string;
  operation: string;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: string;
}

/**
 * Type for regular EOA transactions
 */
export interface EoaTx {
  nonce: string;
  chainId: string;
  from: string;
  to: string;
  value: string;
  data: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * Type for regular Permit approval
 */
export interface PermitTx {
  chainId: string;
  coinName: string;
  verifyingContract: string;
  version: string;
  from: string;
  deadline: string;
  nonce: string;
  owner: string;
  spender: string;
  value: string;
}
