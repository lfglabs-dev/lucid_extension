import {
  EthereumProvider,
  EthereumRequestPayload,
  SIGNING_METHODS,
  WindowWithEthereum,
} from "./types";
import { LUCID_API_URL } from "./config";
import { AUTH_STORAGE_KEY } from "./services/auth";
import { encode } from "cbor-x";

/**
 * Type for EIP-712 transaction data
 */
interface EIP712SafeTx {
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
 * Lucid - Ethereum Transaction Interceptor
 *
 * This script is injected into web pages to monitor Ethereum transaction requests
 * for enhanced security and visibility.
 */
(() => {
  // Track which requests we've already seen to prevent duplicates
  let lastRequestKey: string | null = null;

  /**
   * Encrypts transaction data using AES-256-GCM
   * @param transaction - The transaction data to encrypt
   * @param encryptionKey - The AES-256-GCM key to use for encryption
   * @returns Base64 encoded string with IV and encrypted data
   */
  async function encryptTransaction(
    transaction: EIP712SafeTx,
    encryptionKey: CryptoKey
  ): Promise<string> {
    try {
      // Generate a random IV
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

      // Encode the transaction data using CBOR
      const encodedData = encode(transaction);

      // Encrypt the data
      const encryptedData = await globalThis.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        encryptionKey,
        encodedData
      );

      // Combine IV and encrypted data
      const result = new Uint8Array(iv.length + encryptedData.byteLength);
      result.set(iv, 0);
      result.set(new Uint8Array(encryptedData), iv.length);

      // Convert to base64 for transmission
      return btoa(String.fromCharCode.apply(null, Array.from(result)));
    } catch (error) {
      console.error("[Lucid] Encryption error:", error);
      throw new Error("Failed to encrypt transaction data");
    }
  }

  /**
   * Sends a transaction request to the server
   * @param content - The EIP-712 transaction content to send
   */
  async function sendEIP712Request(content: EIP712SafeTx): Promise<void> {
    try {
      // Get the auth token through window.postMessage
      const token = await new Promise<string>((resolve, reject) => {
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === "AUTH_TOKEN_RESPONSE") {
            window.removeEventListener("message", messageHandler);
            if (event.data.error) {
              console.error("[Lucid] Auth token error:", event.data.error);
              reject(new Error(event.data.error));
            } else if (event.data.token) {
              resolve(event.data.token);
            } else {
              reject(new Error("No auth token available"));
            }
          }
        };
        window.addEventListener("message", messageHandler);
        window.postMessage({ type: "GET_AUTH_TOKEN" }, "*");
      });

      if (!token) {
        console.error("[Lucid] No auth token available");
        return;
      }

      // Get the encryption key through window.postMessage
      const encryptionKeyData = await new Promise<{ encryptionKey: JsonWebKey }>((resolve, reject) => {
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === "ENCRYPTION_KEY_RESPONSE") {
            window.removeEventListener("message", messageHandler);
            if (event.data.error) {
              console.error("[Lucid] Encryption key error:", event.data.error);
              reject(new Error(event.data.error));
            } else if (event.data.encryptionKey) {
              resolve({ encryptionKey: event.data.encryptionKey });
            } else {
              reject(new Error("No encryption key available"));
            }
          }
        };
        window.addEventListener("message", messageHandler);
        window.postMessage({ type: "GET_ENCRYPTION_KEY" }, "*");
      });

      if (!encryptionKeyData.encryptionKey) {
        throw new Error("No encryption key available");
      }

      const encryptionKey: CryptoKey = await globalThis.crypto.subtle.importKey(
        "jwk",
        encryptionKeyData.encryptionKey,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
      );

      // Encrypt the transaction content
      const encryptedContent = await encryptTransaction(
        content,
        encryptionKey
      );

      const requestBody = {
        request_type: "eip712",
        content: encryptedContent,
      };

      console.log("[Lucid] Sending EIP-712 transaction to server:", {
        url: `${LUCID_API_URL}/request`,
        body: requestBody,
      });

      const serverResponse = await fetch(`${LUCID_API_URL}/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!serverResponse.ok) {
        const errorText = await serverResponse.text();
        throw new Error(
          `Server error: ${serverResponse.status} - ${errorText}`
        );
      }

      const data = await serverResponse.json();
      console.log("[Lucid] Server response:", data);
    } catch (error) {
      console.error("[Lucid] Error sending transaction:", error);
    }
  }

  /**
   * Monitors an object for wallet-like behavior and intercepts transaction requests
   * @param obj - The potential Ethereum provider object
   * @param name - Optional name for logging
   */
  function monitorObject(obj: unknown, name?: string): void {
    // Skip if not a valid object or already intercepted
    if (
      !obj ||
      typeof obj !== "object" ||
      (obj as EthereumProvider).__intercepted
    ) {
      return;
    }

    const provider = obj as EthereumProvider;

    // Mark this object as intercepted
    provider.__intercepted = true;

    // Special handling for request method which is commonly used
    if (provider.request && typeof provider.request === "function") {
      const originalRequest = provider.request;

      provider.request = function (
        payload: EthereumRequestPayload
      ): Promise<unknown> {
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

          // Only log if this is a new request
          if (lastRequestKey !== requestKey) {
            lastRequestKey = requestKey;

            // Extract transaction details for easier viewing
            const txParams = payload.params?.[0] as
              | Record<string, unknown>
              | undefined;

            console.log(`[Lucid] 🔴 TRANSACTION REQUEST 🔴`, {
              method: payload.method,
              params: payload.params,
              // Extract common transaction fields for easier viewing
              ...(txParams && {
                from: txParams.from,
                to: txParams.to,
                value: txParams.value,
                data:
                  typeof txParams.data === "string"
                    ? txParams.data.substring(0, 64) + "..." // Truncate long data
                    : txParams.data,
              }),
            });

            // If it's an eth_signTypedData_v4 (EIP-712) request, send it to the server
            if (
              payload.method === "eth_signTypedData_v4" &&
              txParams &&
              payload.params &&
              payload.params[1]
            ) {
              console.log("[Lucid] Detected EIP-712 transaction");

              // Parse the EIP-712 data from params[1]
              try {
                const eip712Data = JSON.parse(payload.params[1] as string);

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

                console.log("[Lucid] Extracted transaction data:", txData);

                sendEIP712Request(txData);
              } catch (error) {
                console.error("[Lucid] Error parsing EIP-712 data:", error);
              }
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
  if (win.ethereum) monitorObject(win.ethereum, "ethereum");
  if (win.rabby) monitorObject(win.rabby, "rabby");

  /**
   * Check for providers that may be added after page load
   */
  const checkForProviders = (): void => {
    if (win.ethereum && !win.ethereum.__intercepted) {
      monitorObject(win.ethereum, "ethereum");
    }
    if (win.rabby && !win.rabby.__intercepted) {
      monitorObject(win.rabby, "rabby");
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
