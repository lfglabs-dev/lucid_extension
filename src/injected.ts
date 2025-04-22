import {
  EthereumProvider,
  EthereumRequestPayload,
  SIGNING_METHODS,
  WindowWithEthereum,
} from './types'
import { LUCID_API_URL } from './config'
import { encode } from 'cbor-x'

/**
 * Type for EIP-712 transaction data
 */
interface EIP712SafeTx {
  chainId: string
  safeAddress: string
  from: string
  to: string
  value: string
  data: string
  operation: string
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: string
  refundReceiver: string
  nonce: string
}

/**
 * Lucid - Ethereum Transaction Interceptor
 *
 * This script is injected into web pages to monitor Ethereum transaction requests
 * for enhanced security and visibility.
 */
;(() => {
  // Track which requests we've already seen to prevent duplicates
  let lastRequestKey: string | null = null

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
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))

      // Encode the transaction data using CBOR
      const encodedData = encode(transaction)

      // Encrypt the data
      const encryptedData = await globalThis.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        encryptionKey,
        encodedData
      )

      // Combine IV and encrypted data
      const result = new Uint8Array(iv.length + encryptedData.byteLength)
      result.set(iv, 0)
      result.set(new Uint8Array(encryptedData), iv.length)

      // Convert to base64 for transmission
      return btoa(String.fromCharCode.apply(null, Array.from(result)))
    } catch (error) {
      console.error('[Lucid] Encryption error:', error)
      throw new Error('Failed to encrypt transaction data')
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
          if (event.data.type === 'AUTH_TOKEN_RESPONSE') {
            window.removeEventListener('message', messageHandler)
            if (event.data.error) {
              console.error('[Lucid] Auth token error:', event.data.error)
              reject(new Error(event.data.error))
            } else if (event.data.token) {
              resolve(event.data.token)
            } else {
              reject(new Error('No auth token available'))
            }
          }
        }
        window.addEventListener('message', messageHandler)
        window.postMessage({ type: 'GET_AUTH_TOKEN' }, '*')
      })

      if (!token) {
        console.error('[Lucid] No auth token available')
        return
      }

      // Get the encryption key through window.postMessage
      const encryptionKey = await new Promise<CryptoKey>((resolve, reject) => {
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'ENCRYPTION_KEY_RESPONSE') {
            window.removeEventListener('message', messageHandler)
            if (event.data.error) {
              console.error('[Lucid] Encryption key error:', event.data.error)
              reject(new Error(event.data.error))
            } else if (event.data.jwk) {
              // Convert the JWK to a CryptoKey
              globalThis.crypto.subtle
                .importKey('jwk', event.data.jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
                .then(key => resolve(key))
                .catch(err => reject(err))
            } else {
              reject(new Error('No encryption key available'))
            }
          }
        }
        window.addEventListener('message', messageHandler)
        window.postMessage({ type: 'GET_ENCRYPTION_KEY' }, '*')
      })

      const requiredFields: (keyof EIP712SafeTx)[] = [
        'from',
        'to',
        'value',
        'data',
        'operation',
        'safeTxGas',
        'baseGas',
        'gasPrice',
        'gasToken',
        'refundReceiver',
        'nonce',
      ]

      for (const field of requiredFields) {
        if (content[field] === undefined) {
          throw new Error(`The field ${field} in the transaction content is undefined`)
        }
      }

      const requestContent: EIP712SafeTx = {
        chainId: content.chainId,
        safeAddress: content.safeAddress,
        from: content.from,
        to: content.to,
        value: content.value,
        data: content.data,
        operation: content.operation,
        safeTxGas: content.safeTxGas,
        baseGas: content.baseGas,
        gasPrice: content.gasPrice,
        gasToken: content.gasToken,
        refundReceiver: content.refundReceiver,
        nonce: content.nonce,
      }

      // Encrypt the transaction content
      const encryptedContent = await encryptTransaction(requestContent, encryptionKey)

      const requestBody = {
        request_type: 'eip712',
        content: encryptedContent,
      }

      console.log('[Lucid] Sending EIP-712 transaction to server:', {
        url: `${LUCID_API_URL}/request`,
        body: requestBody,
      })

      // const serverResponse = await fetch(`${LUCID_API_URL}/request`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${token}`,
      //   },
      //   body: JSON.stringify(requestBody),
      // })

      // // Send through background script to bypass CSP restrictions
      const response = await new Promise<any>((resolve, reject) => {
        //   const messageHandler = (event: MessageEvent) => {
        //     if (event.data.type === "API_REQUEST_RESPONSE") {
        //       window.removeEventListener("message", messageHandler)
        //       clearTimeout(timeoutId)

        //       if (event.data.error) {
        //         console.error("[Lucid] API request error:", event.data.error)
        //         reject(new Error(event.data.error))
        //       } else {
        //         resolve(event.data.response)
        //       }
        //     }
        //   }

        //   // Set a timeout to reject the promise after 30 seconds
        //   const timeoutId = setTimeout(() => {
        //     window.removeEventListener("message", messageHandler)
        //     console.error("[Lucid] API request timed out after 30 seconds")
        //     reject(new Error("API request timed out after 30 seconds"))
        //   }, 30000)

        //   window.addEventListener("message", messageHandler)
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
        )
      })

      // if (!serverResponse.ok) {
      //   const errorText = await serverResponse.text()
      //   throw new Error(`Server error: ${serverResponse.status} - ${errorText}`)
      // }

      // const data = await serverResponse.json()
      console.log('[Lucid] Server response:', response)
    } catch (error) {
      console.error('[Lucid] Error sending transaction:', error)
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
      return
    }

    const provider = obj as EthereumProvider

    // Mark this object as intercepted
    provider.__intercepted = true

    // Special handling for request method which is commonly used
    if (provider.request && typeof provider.request === 'function') {
      const originalRequest = provider.request

      provider.request = function (payload: EthereumRequestPayload): Promise<unknown> {
        // Check if it's a signing request
        const isSigningRequest = payload?.method && SIGNING_METHODS.includes(payload.method as any)

        // For signing requests, check if we've seen this exact payload before
        if (isSigningRequest) {
          // Create a key for this request based on its content
          const requestKey = JSON.stringify({
            method: payload.method,
            params: payload.params,
          })

          // Only log if this is a new request
          if (lastRequestKey !== requestKey) {
            lastRequestKey = requestKey

            // Extract transaction details for easier viewing
            const txParams = payload.params?.[0] as Record<string, unknown> | undefined

            console.log(`[Lucid] 🔴 TRANSACTION REQUEST 🔴`, {
              method: payload.method,
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
            })

            console.log('[Lucid] Detected EIP-712 transaction')
            console.log('[Lucid] Payload:', payload.params)
            console.log('[Lucid] txParams:', txParams)
            // If it's an eth_signTypedData_v4 (EIP-712) request, send it to the server
            if (
              // payload.method === 'eth_signTypedData_v4' &&
              txParams &&
              payload.params
              // &&
              // payload.params[1]
            ) {
              console.log('[Lucid] After if')

              // Parse the EIP-712 data from params[1]
              try {
                // const eip712Data = JSON.parse(payload.params[1] as string)

                // Extract the transaction data from the message field
                const txData: EIP712SafeTx = {
                  chainId: '0x0',
                  safeAddress: '0x0',
                  from: payload.params[0] as string,
                  to: '0x0',
                  value: '0x0',
                  data: '0x0',
                  operation: '0x0',
                  safeTxGas: '0x0',
                  baseGas: '0x0',
                  gasPrice: '0x0',
                  gasToken: '0x0',
                  refundReceiver: '0x0',
                  nonce: '0x0',
                }

                console.log('[Lucid] Extracted transaction data:', txData)

                sendEIP712Request(txData)
              } catch (error) {
                console.error('[Lucid] Error parsing EIP-712 data:', error)
              }
            }
          }
        }

        return originalRequest.apply(this, arguments as any)
      }
    }
  }

  // Get the window with Ethereum providers
  const win = window as WindowWithEthereum

  // Monitor ethereum and rabby objects
  if (win.ethereum) monitorObject(win.ethereum, 'ethereum')
  if (win.rabby) monitorObject(win.rabby, 'rabby')

  /**
   * Check for providers that may be added after page load
   */
  const checkForProviders = (): void => {
    if (win.ethereum && !win.ethereum.__intercepted) {
      monitorObject(win.ethereum, 'ethereum')
    }
    if (win.rabby && !win.rabby.__intercepted) {
      monitorObject(win.rabby, 'rabby')
    }
  }

  // Check periodically for new providers
  const watcherId = setInterval(checkForProviders, 500)

  // Clean up after 1 minute
  setTimeout(() => clearInterval(watcherId), 60000)

  // Also check after DOM changes
  const observer = new MutationObserver(checkForProviders)
  observer.observe(document, { childList: true, subtree: true })
})()
