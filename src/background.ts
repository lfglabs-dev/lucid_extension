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