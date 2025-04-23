/**
 * Lucid - Content Script
 *
 * This content script injects the main monitoring script into web pages
 * as early as possible in the page load process.
 */

try {
  // Create a script element that loads our injected.js
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.dataset.extension = 'lucid';

  /**
   * Injects the script into the page
   */
  const injectScript = (): void => {
    // Try to inject into head first (if it exists)
    if (document.head) {
      document.head.insertBefore(script, document.head.firstChild);
    }
    // Otherwise inject into documentElement
    else if (document.documentElement) {
      document.documentElement.appendChild(script);
    }
    // Last resort - wait for DOMContentLoaded
    else {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.insertBefore(script, document.head.firstChild);
      });
    }
  };

  // Try immediate injection
  injectScript();

  // Also set up a MutationObserver as backup to ensure we inject as early as possible
  const observer = new MutationObserver((mutations, obs) => {
    // If head appears and our script isn't injected yet, inject it
    if (document.head && !document.querySelector('script[data-extension="lucid"]')) {
      document.head.insertBefore(
        script.cloneNode(true) as HTMLScriptElement,
        document.head.firstChild
      );
      obs.disconnect();
    }
  });

  // Start observing
  observer.observe(document, {
    childList: true,
    subtree: true,
  });

  // Handle messages from the injected script
  window.addEventListener('message', event => {
    if (event.data.type === 'GET_AUTH_TOKEN') {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        console.error(
          '[Lucid] Extension context invalid - extension may have been reloaded or disabled'
        );
        window.postMessage(
          {
            type: 'AUTH_TOKEN_RESPONSE',
            token: null,
            error: 'Extension context invalid - please refresh the page',
          },
          '*'
        );
        return;
      }

      // Forward the message to the background script
      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' }, response => {
        if (chrome.runtime.lastError) {
          console.error('[Lucid] Error getting auth token:', chrome.runtime.lastError);
          window.postMessage(
            {
              type: 'AUTH_TOKEN_RESPONSE',
              token: null,
              error: chrome.runtime.lastError.message,
            },
            '*'
          );
          return;
        }

        if (response?.token) {
          window.postMessage({ type: 'AUTH_TOKEN_RESPONSE', token: response.token }, '*');
        } else {
          console.error('[Lucid] No token received from background script');
          window.postMessage({ type: 'AUTH_TOKEN_RESPONSE', token: null }, '*');
        }
      });
    } else if (event.data.type === 'GET_ENCRYPTION_KEY') {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        console.error(
          '[Lucid] Extension context invalid - extension may have been reloaded or disabled'
        );
        window.postMessage(
          {
            type: 'ENCRYPTION_KEY_RESPONSE',
            encryptionKey: null,
            error: 'Extension context invalid - please refresh the page',
          },
          '*'
        );
        return;
      }

      // Forward the message to the background script
      chrome.runtime.sendMessage({ type: 'GET_ENCRYPTION_KEY' }, response => {
        if (chrome.runtime.lastError) {
          console.error('[Lucid] Error getting encryption key:', chrome.runtime.lastError);
          window.postMessage(
            {
              type: 'ENCRYPTION_KEY_RESPONSE',
              encryptionKey: null,
              error: chrome.runtime.lastError.message,
            },
            '*'
          );
          return;
        }

        if (response?.jwk) {
          console.log('[Lucid] Got encryption key, sending to page:', response.jwk);
          window.postMessage(
            {
              type: 'ENCRYPTION_KEY_RESPONSE',
              encryptionKey: response.jwk,
            },
            '*'
          );
        } else {
          console.error('[Lucid] No encryption key received from background script');
          window.postMessage(
            {
              type: 'ENCRYPTION_KEY_RESPONSE',
              encryptionKey: null,
            },
            '*'
          );
        }
      });
    } else if (event.data.type === 'MAKE_API_REQUEST') {
      console.log('[Lucid] Received API request from page:', event.data.url);
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        console.error(
          '[Lucid] Extension context invalid - extension may have been reloaded or disabled'
        );
        window.postMessage(
          {
            type: 'API_REQUEST_RESPONSE',
            response: null,
            error: 'Extension context invalid - please refresh the page',
          },
          '*'
        );
        return;
      }

      // Extract request details from the event data
      const { url, method, headers, body } = event.data;

      // Forward the request to the background script
      try {
        chrome.runtime.sendMessage(
          {
            type: 'MAKE_API_REQUEST',
            url,
            method,
            headers,
            body,
          },
          response => {
            // Check for runtime errors
            if (chrome.runtime.lastError) {
              console.error('[Lucid] Error making API request:', chrome.runtime.lastError);
              window.postMessage(
                {
                  type: 'API_REQUEST_RESPONSE',
                  response: null,
                  error: chrome.runtime.lastError.message,
                },
                '*'
              );
              return;
            }

            // Handle responses with errors
            if (response?.error) {
              console.error('[Lucid] API request failed with error:', response.error);
              window.postMessage(
                {
                  type: 'API_REQUEST_RESPONSE',
                  response: response,
                  error: response.error,
                },
                '*'
              );
              return;
            }

            // Success case
            console.log('[Lucid] API request successful, sending response to page');
            window.postMessage(
              {
                type: 'API_REQUEST_RESPONSE',
                response: response,
              },
              '*'
            );
          }
        );
      } catch (error) {
        // Handle unexpected exceptions
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Lucid] Exception making API request:', errorMessage);
        window.postMessage(
          {
            type: 'API_REQUEST_RESPONSE',
            response: null,
            error: errorMessage,
          },
          '*'
        );
      }
    }
  });
} catch (e) {
  console.error('[Lucid] Error:', e);
}
