import type { PlasmoCSConfig } from "plasmo";
import type { AURAEvent } from "@aura/protocol";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true,
  run_at: "document_start",
};

// WebSocket connection to the AI Core
let ws: WebSocket | null = null;
let reconnectInterval: NodeJS.Timeout | null = null;
let eventBuffer: AURAEvent[] = [];

// Initialize IndexedDB for buffering events
let db: IDBDatabase | null = null;

async function initDB() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('AuraEventBuffer', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains('events')) {
        database.createObjectStore('events', { autoIncrement: true });
      }
    };
  });
}

async function bufferEvent(event: AURAEvent) {
  if (!db) {
    eventBuffer.push(event);
    return;
  }
  
  const transaction = db.transaction(['events'], 'readwrite');
  const store = transaction.objectStore('events');
  store.add(event);
}

async function flushEventBuffer() {
  if (!db || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  const transaction = db.transaction(['events'], 'readwrite');
  const store = transaction.objectStore('events');
  const request = store.getAll();
  
  request.onsuccess = () => {
    const events = request.result;
    events.forEach((event: AURAEvent) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    });
    // Clear the store after sending
    store.clear();
  };
  
  // Also flush in-memory buffer
  eventBuffer.forEach(event => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });
  eventBuffer = [];
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  try {
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
      console.log('Connected to AURA AI Core');
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      // Flush any buffered events
      flushEventBuffer();
    };
    
    ws.onclose = () => {
      console.log('Disconnected from AURA AI Core');
      ws = null;
      startReconnect();
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws = null;
    };
  } catch (error) {
    console.error('Failed to connect to AURA AI Core:', error);
    startReconnect();
  }
}

function startReconnect() {
  if (reconnectInterval) return;
  
  reconnectInterval = setInterval(() => {
    console.log('Attempting to reconnect to AURA AI Core...');
    connectWebSocket();
  }, 5000);
}

function sendAURAEvent(type: AURAEvent['payload']['type'], data: any) {
  const event: AURAEvent = {
    protocol: 'AURAEvent',
    version: '1.0',
    eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    payload: { type, data }
  };
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  } else {
    // Buffer the event for later
    bufferEvent(event);
  }
}

// Monitor navigation for redirects
function setupNavigationListeners() {
  // Initial page load
  sendAURAEvent('REDIRECT_OCCURRED', {
    url: window.location.href,
    timestamp: new Date().toISOString()
  });
  
  // Monitor pushState/replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    sendAURAEvent('REDIRECT_OCCURRED', {
      url: window.location.href,
      method: 'pushState',
      timestamp: new Date().toISOString()
    });
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    sendAURAEvent('REDIRECT_OCCURRED', {
      url: window.location.href,
      method: 'replaceState',
      timestamp: new Date().toISOString()
    });
  };
  
  // Monitor popstate
  window.addEventListener('popstate', () => {
    sendAURAEvent('REDIRECT_OCCURRED', {
      url: window.location.href,
      method: 'popstate',
      timestamp: new Date().toISOString()
    });
  });
}

// Listen for forwarded events from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FORWARD_AURA_EVENT' && message.event) {
    sendAURAEvent(message.event.payload.type, message.event.payload.data);
  }
});

// Inject script to monitor storage changes in page context
function injectStorageMonitor() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const sendEvent = (storageType, key, value) => {
        window.postMessage({
          type: 'AURA_STORAGE_EVENT',
          detail: { storage: storageType, key, value }
        }, '*');
      };

      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
          sendEvent('localStorage', key, value);
        }
        originalSetItem.apply(this, arguments);
      };

      const originalSessionSetItem = sessionStorage.setItem;
      sessionStorage.setItem = function(key, value) {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
          sendEvent('sessionStorage', key, value);
        }
        originalSessionSetItem.apply(this, arguments);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove(); // Clean up the script tag

  // Listen for messages from the injected script
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'AURA_STORAGE_EVENT') {
      sendAURAEvent('AUTH_TOKEN_ACQUIRED', event.data.detail);
    }
  });
}

// Initialize everything
(async function init() {
  console.log('AURA Event Handler initializing...');
  
  await initDB();
  connectWebSocket();
  injectStorageMonitor();
  setupNavigationListeners();
  
  console.log('AURA Event Handler initialized');
})(); 