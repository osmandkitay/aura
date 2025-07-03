import type { AURAEvent, AuraState } from "@aura/protocol";

console.log("AURA Adapter v1.3 background script loaded.");

// Store for AURA states by tab
const auraStateByTab: Map<number, AuraState> = new Map();

// Store manifest URL by tab ID
const auraManifestUrlByTab: Map<number, string> = new Map();

// Setup header detection using webRequest API
function setupHeaderDetection() {
  // Listen for response headers
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      // Check if this is an AURA manifest request
      if (details.url.endsWith('/.well-known/aura.json') && details.statusCode === 200) {
        if (details.tabId >= 0) {
          auraManifestUrlByTab.set(details.tabId, details.url);
          console.log(`AURA manifest detected for tab ${details.tabId}: ${details.url}`);
        }
      }
      
      const auraStateHeader = details.responseHeaders?.find(
        header => header.name.toLowerCase() === 'aura-state'
      );
      
      if (auraStateHeader && auraStateHeader.value) {
        try {
          const decoded = atob(auraStateHeader.value);
          const auraState: AuraState = JSON.parse(decoded);
          
          // Store the state
          if (details.tabId >= 0) {
            auraStateByTab.set(details.tabId, auraState);
            console.log(`AURA-State detected for tab ${details.tabId}:`, auraState);
            
            // Notify content script
            chrome.tabs.sendMessage(details.tabId, {
              type: 'AURA_STATE_UPDATE',
              data: auraState
            }).catch(() => {
              // Content script might not be ready yet
            });
          }
        } catch (error) {
          console.error('Failed to parse AURA-State header:', error);
        }
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
  
  // Clean up state when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    auraStateByTab.delete(tabId);
    auraManifestUrlByTab.delete(tabId);
  });
}

// Helper function to forward events to active tab's content script
function forwardEventToActiveTab(payload: AURAEvent['payload']) {
  const event: AURAEvent = {
    protocol: 'AURAEvent',
    version: '1.0',
    eventId: `bg-${Date.now()}`,
    payload,
  };

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'FORWARD_AURA_EVENT',
        event
      }).catch(() => console.error('Failed to forward event. Content script may not be ready.'));
    }
  });
}

// Listen for auth-related events from new tabs/pop-ups
function setupAuthListeners() {
  // Monitor cookie changes
  chrome.cookies.onChanged.addListener((changeInfo) => {
    // We only care about auth-related cookies being set, not removed
    if (changeInfo.removed) {
      return;
    }

    // Check if the cookie name suggests it's an auth token
    if (changeInfo.cookie.name.toLowerCase().includes('auth')) {
      console.log('Auth-related cookie changed:', changeInfo.cookie.name);

      // Forward this event to the active tab's content script,
      // which will then send it to the AI Core via WebSocket.
      forwardEventToActiveTab({
        type: 'AUTH_TOKEN_ACQUIRED',
        data: {
          source: 'cookie',
          cookie: {
            name: changeInfo.cookie.name,
            domain: changeInfo.cookie.domain,
            value: changeInfo.cookie.value,
          }
        }
      });
    }
  });

  // Monitor new tabs/windows for OAuth flows
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.url && (
      tab.url.includes('oauth') || 
      tab.url.includes('callback') || 
      tab.url.includes('auth')
    )) {
      console.log('Potential auth flow detected:', tab.url);
      
      // Monitor this tab for completion
      const checkAuthCompletion = (tabId: number, changeInfo: any) => {
        if (tabId === tab.id && changeInfo.url) {
          // Check if this looks like a successful auth callback
          if (changeInfo.url.includes('token=') || changeInfo.url.includes('code=')) {
            const event: AURAEvent = {
              protocol: 'AURAEvent',
              version: '1.0',
              eventId: `bg-${Date.now()}`,
              payload: {
                type: 'AUTH_TOKEN_ACQUIRED',
                data: {
                  url: changeInfo.url,
                  tabId: tabId,
                  timestamp: new Date().toISOString()
                }
              }
            };
            
            // Forward to content script to send via WebSocket
            chrome.tabs.query({ active: true }, (tabs) => {
              if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'FORWARD_AURA_EVENT',
                  event
                }).catch(() => {
                  console.error('Failed to forward auth event');
                });
              }
            });
            
            // Remove listener after auth is complete
            chrome.tabs.onUpdated.removeListener(checkAuthCompletion);
          }
        }
      };
      
      chrome.tabs.onUpdated.addListener(checkAuthCompletion);
    }
  });
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('AURA Adapter installed/updated');
  
  // Request necessary permissions
  chrome.permissions.request({
    permissions: ['webRequest', 'webRequestBlocking'],
    origins: ['<all_urls>']
  }, (granted) => {
    if (granted) {
      console.log('webRequest permissions granted');
      setupHeaderDetection();
    } else {
      console.error('webRequest permissions denied');
    }
  });
});

// Initialize
setupHeaderDetection();
setupAuthListeners();

// Provide API for content scripts to query AURA state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_AURA_STATE' && sender.tab?.id) {
    const state = auraStateByTab.get(sender.tab.id);
    sendResponse({ state });
  }
  
  if (message.type === 'GET_AURA_SUPPORT_STATUS' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const manifestUrl = auraManifestUrlByTab.get(tabId);
    const status = {
      supported: !!manifestUrl,
      url: manifestUrl || '',
      version: manifestUrl ? '1.3' : '' // Assuming v1.3 if detected this way
    };
    sendResponse({ status });
  }
  
  return true; // Keep channel open for async response
}); 