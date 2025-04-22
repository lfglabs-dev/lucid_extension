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
    chrome.storage.local.get(['lucid_auth'], result => {
      const token = result.lucid_auth?.data?.jwt;
      sendResponse({ token });
    });
    return true; // Will respond asynchronously
  } else if (message.type === 'GET_ENCRYPTION_KEY') {
    // Get the encryption key and send it back
    chrome.storage.local.get(['lucid_auth'], result => {
      const jwk = result.lucid_auth?.encryptionKey;
      sendResponse({ jwk });
    });
    return true; // Will respond asynchronously
  } else if (message.type === 'MAKE_API_REQUEST') {
    // Make the API request from the background script to bypass CSP
    (async () => {
      try {
        console.log('[Lucid Background] Making API request to:', message.url);

        const response = await fetch(message.url, {
          method: message.method,
          headers: message.headers,
          body: message.body,
        });

        let responseData;
        const responseText = await response.text();

        try {
          // Try to parse as JSON if possible
          responseData = JSON.parse(responseText);
        } catch {
          // If parsing fails, use the text response
          responseData = responseText;
        }

        if (!response.ok) {
          console.error('[Lucid Background] API request failed:', response.status, responseData);
          sendResponse({
            error: `Server error: ${response.status}`,
            status: response.status,
            data: responseData,
          });
        } else {
          console.log('[Lucid Background] API request successful:', responseData);
          sendResponse({ data: responseData });
        }
      } catch (error) {
        console.error('[Lucid Background] Error making API request:', error);
        sendResponse({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    return true; // Will respond asynchronously
  }
});
