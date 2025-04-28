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
chrome.runtime.onInstalled.addListener(async details => {
  console.log('Extension installed/updated with reason:', details.reason);

  // Check auth status
  checkAndRefreshAuth();

  // Programmatically inject content scripts into all matching tabs
  try {
    // Get content script details from manifest
    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts || [];

    console.log('Injecting content scripts into matching tabs...');

    // Process each content script configuration
    for (const cs of contentScripts) {
      // Skip if no JS files to inject
      if (!cs.js || cs.js.length === 0) continue;

      // Query tabs that match the content script's URL patterns
      const tabs = await chrome.tabs.query({ url: cs.matches });
      console.log(`Found ${tabs.length} tabs matching content script patterns`);

      // Inject into each matching tab
      for (const tab of tabs) {
        // Skip chrome:// and chrome-extension:// URLs
        if (tab.url && tab.url.match(/(chrome|chrome-extension):\/\//gi)) {
          console.log(`Skipping chrome URL: ${tab.url}`);
          continue;
        }

        // Skip if no tab ID
        if (!tab.id) continue;

        // Set up injection target
        const target = {
          tabId: tab.id,
          allFrames: cs.all_frames || false,
        };

        // Inject JS files
        for (const jsFile of cs.js) {
          try {
            await chrome.scripting.executeScript({
              files: [jsFile],
              injectImmediately: cs.run_at === 'document_start',
              target,
            });
            console.log(`Injected ${jsFile} into tab: ${tab.url}`);
          } catch (err) {
            console.error(`Failed to inject ${jsFile} into tab ${tab.url}:`, err);
          }
        }
      }
    }

    console.log('Content script injection complete');
  } catch (error) {
    console.error('Error injecting content scripts:', error);
  }
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
