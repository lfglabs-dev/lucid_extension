import {
  EthereumProvider,
  EthereumRequestPayload,
  SIGNING_METHODS,
  WindowWithEthereum,
} from "./types";

/**
 * Lucid - Ethereum Transaction Interceptor
 *
 * This script is injected into web pages to monitor Ethereum transaction requests
 * for enhanced security and visibility.
 */
(() => {
  console.log("[Lucid] Transaction monitoring active");

  // Track which requests we've already seen to prevent duplicates
  let lastRequestKey: string | null = null;

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
