import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end"
}

// Ask the background script for the status of the current tab
chrome.runtime.sendMessage({ type: 'GET_AURA_SUPPORT_STATUS' }, (response) => {
  if (chrome.runtime.lastError) {
    // Handle error, e.g., background script not ready
    return;
  }
  if (response && response.status) {
    // The background script has already detected and stored the status.
    // Now, we update the storage for the popup to use.
    chrome.storage.local.set({ auraStatus: response.status });
  }
}); 