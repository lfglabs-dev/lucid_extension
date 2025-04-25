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
  }
});
