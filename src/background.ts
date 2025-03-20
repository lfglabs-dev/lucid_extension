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
    chrome.storage.local.get(['lucid_auth'], (result) => {
      const token = result.lucid_auth?.data?.jwt;
      sendResponse({ token });
    });
    return true; // Will respond asynchronously
  }
});