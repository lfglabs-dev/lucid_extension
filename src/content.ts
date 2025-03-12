/**
 * Lucid - Content Script
 *
 * This content script injects the main monitoring script into web pages
 * as early as possible in the page load process.
 */

try {
  // Create a script element that loads our injected.js
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.dataset.extension = "lucid";

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
      document.addEventListener("DOMContentLoaded", () => {
        document.head.insertBefore(script, document.head.firstChild);
      });
    }
  };

  // Try immediate injection
  injectScript();

  // Also set up a MutationObserver as backup to ensure we inject as early as possible
  const observer = new MutationObserver((mutations, obs) => {
    // If head appears and our script isn't injected yet, inject it
    if (
      document.head &&
      !document.querySelector('script[data-extension="lucid"]')
    ) {
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
} catch (e) {
  console.error("[Lucid] Error:", e);
}
