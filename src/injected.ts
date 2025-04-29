import {
  EthereumProvider,
  EthereumRequestPayload,
  PermitTx,
  SIGNING_METHODS,
  SUPPORTED_METHODS,
  WindowWithEthereum,
} from './types';
import { LUCID_API_URL } from './config';
import { encode } from 'cbor-x';
import { BrowserProvider } from 'ethers';
import { WordArray } from 'crypto-es/lib/core';
import CryptoES from 'crypto-es';
import { hideTransactionModal, showTransactionModal } from './services/modal';
import { EIP712SafeTx, EoaTx } from './types';

// Check if we've already injected our code
if ((window as any).__lucidInjected) {
  console.log('[Lucid] Extension already injected, skipping');
} else {
  // Mark that we've injected our code
  (window as any).__lucidInjected = true;

  /**
   * Lucid - Ethereum Transaction Interceptor
   *
   * This script is injected into web pages to monitor Ethereum transaction requests
   * for enhanced security and visibility.
   */
  (() => {
    // Track which requests we've already seen to prevent duplicates
    let lastRequestKey: string | null = null;
    let processingTransactions = new Set<string>();
    console.log('[Lucid] Injecting into page');

    /**
     * Encrypts transaction data using AES-256-CTR
     * @param transaction - The transaction data to encrypt
     * @param encryptionKey - The JWK object containing the encryption key
     * @returns Base64 encoded string with IV and encrypted data
     */
    async function encryptTransaction(
      transaction: EIP712SafeTx | EoaTx | PermitTx,
      encryptionKey: { k: string; alg: string }
    ): Promise<string> {
      try {
        if (!encryptionKey || !encryptionKey.k || typeof encryptionKey.k !== 'string') {
          throw new Error('Invalid encryption key format - missing k property');
        }

        // Generate a random IV (16 bytes for CTR mode)
        const iv = CryptoES.lib.WordArray.random(16) as WordArray;

        // Encode the transaction data using CBOR
        const encodedData = encode(transaction);

        // Convert the CBOR ArrayBuffer to WordArray for CryptoES
        const dataWords = CryptoES.lib.WordArray.create(new Uint8Array(encodedData));

        // Get the key as WordArray from the JWK's k property
        const key = CryptoES.enc.Base64.parse(encryptionKey.k);

        // Encrypt the data
        const encrypted = CryptoES.AES.encrypt(dataWords, key, {
          mode: CryptoES.mode.CTR,
          padding: CryptoES.pad.NoPadding,
          iv,
        });

        // Get the ciphertext as WordArray
        const ciphertext = encrypted.ciphertext;

        // Combine IV and encrypted data
        const combined = CryptoES.lib.WordArray.create();
        combined.concat(iv);
        combined.concat(ciphertext as WordArray);

        // Convert to base64 for transmission
        return CryptoES.enc.Base64.stringify(combined);
      } catch (error: any) {
        console.error('[Lucid] Encryption error:', error);
        throw new Error('Failed to encrypt transaction data');
      }
    }

    /**
     * Sends a transaction request to the server
     * @param content - The transaction content to send (either EIP-712 or regular transaction)
     */
    async function sendTransactionRequest(
      content: EIP712SafeTx | EoaTx | PermitTx,
      requestType: 'eip712' | 'eoa_transaction' | 'permit'
    ): Promise<void> {
      console.log('[Lucid] Sending transaction request:', {
        content,
        requestType,
      });
      try {
        // Get the auth token through window.postMessage
        const token = await new Promise<string>((resolve, reject) => {
          const messageHandler = (event: MessageEvent) => {
            if (event.data.type === 'AUTH_TOKEN_RESPONSE') {
              window.removeEventListener('message', messageHandler);
              if (event.data.error) {
                console.error('[Lucid] Auth token error:', event.data.error);
                reject(new Error(event.data.error));
              } else if (event.data.token) {
                resolve(event.data.token);
              } else {
                reject(new Error('No auth token available'));
              }
            }
          };
          window.addEventListener('message', messageHandler);
          window.postMessage({ type: 'GET_AUTH_TOKEN' }, '*');
        });

        if (!token) {
          console.error('[Lucid] No auth token available');
          return;
        }

        // Get the encryption key through window.postMessage
        const encryptionKeyData = await new Promise<{ encryptionKey: { k: string; alg: string } }>(
          (resolve, reject) => {
            const messageHandler = (event: MessageEvent) => {
              if (event.data.type === 'ENCRYPTION_KEY_RESPONSE') {
                window.removeEventListener('message', messageHandler);
                if (event.data.error) {
                  console.error('[Lucid] Encryption key error:', event.data.error);
                  reject(new Error(event.data.error));
                } else if (event.data.encryptionKey) {
                  resolve({ encryptionKey: event.data.encryptionKey });
                } else {
                  reject(new Error('No encryption key available'));
                }
              }
            };
            window.addEventListener('message', messageHandler);
            window.postMessage({ type: 'GET_ENCRYPTION_KEY' }, '*');
          }
        );

        if (!encryptionKeyData.encryptionKey) {
          throw new Error('No encryption key available');
        }

        // Encrypt the transaction content using the base64 key directly
        const encryptedContent = await encryptTransaction(content, encryptionKeyData.encryptionKey);

        const requestBody = {
          request_type: requestType,
          content: encryptedContent,
          notification: {
            title: 'Trying to sign a transaction?',
            message: 'A new transaction was detected from your laptop, verify it on Lucid !',
          },
        };

        console.log('[Lucid] Sending transaction to server:', {
          url: `${LUCID_API_URL}/request`,
        });

        // Send through background script
        const response = await new Promise<any>((resolve, reject) => {
          // Set up message handler for the response
          const messageHandler = (event: MessageEvent) => {
            if (event.data.type === 'API_REQUEST_RESPONSE') {
              window.removeEventListener('message', messageHandler);
              clearTimeout(timeoutId);

              if (event.data.error) {
                console.error('[Lucid] API request error:', event.data.error);
                reject(new Error(event.data.error));
              } else {
                console.log('[Lucid] API request successful');
                resolve(event.data.response);
              }
            }
          };

          // Set a timeout to avoid hanging if no response is received
          const timeoutId = setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            console.error('[Lucid] API request timed out after 30 seconds');
            reject(new Error('API request timed out'));
          }, 30000);

          // Listen for the response
          window.addEventListener('message', messageHandler);

          // Send the request to the content script
          window.postMessage(
            {
              type: 'MAKE_API_REQUEST',
              url: `${LUCID_API_URL}/request`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(requestBody),
            },
            '*'
          );
        });

        console.log('[Lucid] Server response received:', response);
      } catch (error) {
        console.error('[Lucid] Error sending transaction:', error);
      }
    }

    /**
     * Monitors an object for wallet-like behavior and intercepts transaction requests
     * @param obj - The potential Ethereum provider object
     * @param name - Optional name for logging
     */
    function monitorObject(obj: unknown, name?: string): void {
      // Skip if not a valid object or already intercepted
      if (!obj || typeof obj !== 'object' || (obj as EthereumProvider).__intercepted) {
        return;
      }

      const provider = obj as EthereumProvider;

      // Mark this object as intercepted
      provider.__intercepted = true;

      // Special handling for request method which is commonly used
      if (provider.request && typeof provider.request === 'function') {
        const originalRequest = provider.request;

        provider.request = async function (payload: EthereumRequestPayload): Promise<unknown> {
          // Check if it's a signing request
          const isSigningRequest =
            payload?.method && SIGNING_METHODS.includes(payload.method as any);

          // For signing requests, check if we've seen this exact payload before
          if (isSigningRequest) {
            // Create a key for this request based on its content
            const requestKey = JSON.stringify({
              method: payload.method,
              params: payload.params,
            });

            // Skip if we're already processing this transaction
            if (processingTransactions.has(requestKey)) {
              console.log('[Lucid] Skipping duplicate transaction request:', requestKey);
              return originalRequest.apply(this, arguments as any);
            }

            // Only log if this is a new request
            if (lastRequestKey !== requestKey) {
              lastRequestKey = requestKey;
              console.log('[Lucid] New transaction request detected:', {
                method: payload.method,
                provider: name || 'unknown',
                payload: payload,
              });
            }

            // Extract transaction details for easier viewing
            const txParams = payload.params?.[0] as Record<string, unknown> | undefined;

            console.log(`[Lucid] 🔴 TRANSACTION REQUEST 🔴`, {
              method: payload.method,
              provider: name || 'unknown',
              params: payload.params,
              // Extract common transaction fields for easier viewing
              ...(txParams && {
                from: txParams.from,
                to: txParams.to,
                value: txParams.value,
                data:
                  typeof txParams.data === 'string'
                    ? txParams.data.substring(0, 64) + '...' // Truncate long data
                    : txParams.data,
              }),
            });

            // If it's a supported transaction method, send it to the server
            if (
              payload?.method &&
              SUPPORTED_METHODS.includes(payload.method) &&
              txParams &&
              payload.params
            ) {
              console.log('[Lucid] Detected transaction request', {
                method: payload.method,
                provider: name || 'unknown',
                params: payload.params,
              });

              // Add to processing set
              processingTransactions.add(requestKey);

              // Show the transaction modal
              showTransactionModal(
                'Trying to sign ?',
                "Don't forget to simulate your transaction on Lucid before !"
              );

              try {
                // Handle different transaction types
                if (
                  payload.method === 'eth_sendTransaction' ||
                  payload.method === 'wallet_sendTransaction'
                ) {
                  // Create provider from the window ethereum object
                  const provider = new BrowserProvider(
                    (window as WindowWithEthereum).ethereum as any
                  );

                  // Get the current network to get chainId
                  const network = await provider.getNetwork();

                  // Get the signer to get the nonce
                  const nonce = await provider.getTransactionCount(txParams.from as string);

                  // Get fee data for gas parameters
                  const feeData = await provider.getFeeData();

                  const txData: EoaTx = {
                    nonce: nonce.toString(),
                    chainId: network.chainId.toString(),
                    from: txParams.from as string,
                    to: txParams.to as string,
                    value: txParams.value as string,
                    data: txParams.data as string,
                    gas: txParams.gas as string,
                    maxFeePerGas: feeData.maxFeePerGas?.toString() || '0',
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || '0',
                  };

                  console.log('[Lucid] Extracted EOA transaction data:', txData);

                  await sendTransactionRequest(txData, 'eoa_transaction');
                } else if (payload.method === 'eth_signTypedData_v4') {
                  console.log('[Lucid] eth_signTypedData_v4', payload);
                  // Parse the EIP-712 data from params[1]
                  const eip712Data = JSON.parse(payload.params[1] as string);

                  if (eip712Data.primaryType === 'Permit') {
                    console.log('[Lucid] Permit type ', eip712Data);

                    const txData: PermitTx = {
                      chainId: eip712Data.domain.chainId,
                      coinName: eip712Data.domain.name,
                      verifyingContract: eip712Data.domain.verifyingContract,
                      version: eip712Data.domain.version,
                      from: payload.params[0] as string,
                      deadline: eip712Data.message.deadline,
                      nonce: eip712Data.message.nonce,
                      owner: eip712Data.message.owner,
                      spender: eip712Data.message.spender,
                      value: eip712Data.message.value,
                    };

                    console.log('[Lucid] Extracted EIP-712 transaction data:', txData);

                    await sendTransactionRequest(txData, 'permit');
                  } else {
                    // Extract the transaction data from the message field
                    const txData: EIP712SafeTx = {
                      chainId: eip712Data.domain.chainId,
                      safeAddress: eip712Data.domain.verifyingContract,
                      from: payload.params[0] as string,
                      to: eip712Data.message.to,
                      value: eip712Data.message.value,
                      data: eip712Data.message.data,
                      operation: eip712Data.message.operation,
                      safeTxGas: eip712Data.message.safeTxGas,
                      baseGas: eip712Data.message.baseGas,
                      gasPrice: eip712Data.message.gasPrice,
                      gasToken: eip712Data.message.gasToken,
                      refundReceiver: eip712Data.message.refundReceiver,
                      nonce: eip712Data.message.nonce,
                    };

                    console.log('[Lucid] Extracted EIP-712 transaction data:', txData);

                    await sendTransactionRequest(txData, 'eip712');
                  }
                } else if (payload.method === 'eth_sendRawTransaction') {
                  // For raw transactions, we'll just log the raw data
                  console.log('[Lucid] Raw transaction detected:', {
                    rawTx: payload.params[0],
                  });
                }

                // Wait for the original request to complete
                const result = await originalRequest.apply(this, arguments as any);

                // Remove from processing set
                processingTransactions.delete(requestKey);

                // Hide modal on success
                hideTransactionModal();

                return result;
              } catch (error) {
                // Remove from processing set on error
                processingTransactions.delete(requestKey);
                hideTransactionModal();
                throw error;
              }
            }
          }

          return originalRequest.apply(this, arguments as any);
        };
      }
    }

    // Get the window with Ethereum providers
    const win = window as WindowWithEthereum;

    // Monitor ethereum and rabby objects
    if (win.ethereum) monitorObject(win.ethereum, 'ethereum');
    if (win.rabby) monitorObject(win.rabby, 'rabby');
    if (win.phantom && win.phantom.ethereum) monitorObject(win.phantom.ethereum, 'phantom');
    if (win.coinbaseWalletExtension) monitorObject(win.coinbaseWalletExtension, 'coinbase');
    /**
     * Check for providers that may be added after page load
     */
    const checkForProviders = (): void => {
      if (win.ethereum && !win.ethereum.__intercepted) {
        monitorObject(win.ethereum, 'ethereum');
      }
      if (win.rabby && !win.rabby.__intercepted) {
        monitorObject(win.rabby, 'rabby');
      }
      if (win.phantom && !win.phantom.__intercepted) {
        monitorObject(win.phantom.ethereum, 'phantom');
      }

      if (win.coinbaseWalletExtension && !win.coinbaseWalletExtension.__intercepted) {
        console.log('[Lucid] Detected Coinbase provider');
        monitorObject(win.coinbaseWalletExtension, 'coinbase');
      }
    };

    // Check periodically for new providers
    const watcherId = setInterval(checkForProviders, 500);

    // Clean up after 1 minute
    setTimeout(() => clearInterval(watcherId), 60000);

    // Also check after DOM changes
    const observer = new MutationObserver(checkForProviders);
    observer.observe(document, { childList: true, subtree: true });
  })();
}
