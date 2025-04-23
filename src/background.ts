console.log('Background script loaded at:', new Date().toISOString());

import { getOrRefreshAuth } from './services/auth';

// Check and refresh auth if needed
async function checkAndRefreshAuth() {
  console.log('Checking auth status...');
  try {
    await getOrRefreshAuth();
  } catch (error) {
    console.error('Auth check/refresh failed:', error);
  }
}

// Handle initial registration on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  checkAndRefreshAuth();
});

// Handle token check on extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension starting up');
  checkAndRefreshAuth();
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_AUTH_TOKEN') {
    // Get the auth token and send it back
    console.log('[Lucid Background] Received GET_AUTH_TOKEN request');
    chrome.storage.local.get(['lucid_auth'], result => {
      const token = result.lucid_auth?.data?.jwt;
      console.log(
        '[Lucid Background] Auth token retrieved:',
        token ? 'found' : 'not found',
        result
      );
      sendResponse({ token });
    });
    return true; // Will respond asynchronously
  } else if (message.type === 'GET_ENCRYPTION_KEY') {
    // Get the encryption key and send it back
    console.log('[Lucid Background] Received GET_ENCRYPTION_KEY request');
    chrome.storage.local.get(['lucid_auth'], result => {
      const jwk = result.lucid_auth?.encryptionKey;
      console.log(
        '[Lucid Background] Encryption key retrieved:',
        jwk ? 'found' : 'not found',
        result.lucid_auth?.encryptionKey
      );

      // Check if the encryption key has the expected format
      if (jwk && typeof jwk === 'object' && jwk.k && jwk.alg) {
        console.log('[Lucid Background] Encryption key appears valid');
        sendResponse({ jwk });
      } else {
        console.error(
          '[Lucid Background] Encryption key is invalid or missing:',
          jwk ? 'Invalid format: ' + JSON.stringify(jwk) : 'Key is null/undefined'
        );
        sendResponse({
          jwk: null,
          error: 'Invalid encryption key format',
        });
      }
    });
    return true; // Will respond asynchronously
  } else if (message.type === 'MAKE_API_REQUEST') {
    // Make the API request from the background script to bypass CSP
    console.log('[Lucid Background] Received API request to:', message.url);

    // Use a separate function to handle the API request
    const makeApiRequest = async () => {
      try {
        console.log('[Lucid Background] Making API request to:', message.url);
        console.log('[Lucid Background] Request headers:', message.headers);

        const response = await fetch(message.url, {
          method: message.method,
          headers: message.headers,
          body: message.body,
        });

        let responseData;
        const responseText = await response.text();
        console.log(
          '[Lucid Background] Raw response:',
          responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
        );

        try {
          // Try to parse as JSON if possible
          responseData = JSON.parse(responseText);
          console.log('[Lucid Background] Parsed JSON response:', responseData);
        } catch (parseError) {
          // If parsing fails, use the text response
          console.log('[Lucid Background] Response is not valid JSON, using as text');
          responseData = responseText;
        }

        if (!response.ok) {
          console.error('[Lucid Background] API request failed:', response.status, responseData);
          return {
            error: `Server error: ${response.status}`,
            status: response.status,
            data: responseData,
          };
        } else {
          console.log('[Lucid Background] API request successful');
          return { data: responseData };
        }
      } catch (error) {
        console.error('[Lucid Background] Error making API request:', error);
        return {
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };

    // Execute the function and send the response
    makeApiRequest().then(result => {
      try {
        console.log('[Lucid Background] Sending API response back to content script:', result);
        sendResponse(result);
      } catch (err) {
        console.error('[Lucid Background] Error sending API response:', err);
        sendResponse({ error: 'Error sending response' });
      }
    });

    return true; // Will respond asynchronously
  }
});
