# **AURA v1.3 Final Polish: Step-by-Step Refactoring Guide**

## **Introduction**

This document provides a clear, step-by-step process to implement the final, critical fixes on your codebase. Following these steps will resolve the identified bugs, harden the architecture, and align the implementation perfectly with the v1.3 specification.

The process is divided into three parts:

1. **Part 1: Critical Bug Fixes:** Addressing issues that currently break core functionality.  
2. **Part 2: Robustness & Feature Enhancements:** Implementing features that make the system more resilient and capable.  
3. **Part 3: Final Polish & Verification:** Small but important tweaks for production readiness.

Execute these steps in the specified order.

## **Part 1: Critical Bug Fixes (Unblockers)**

### **Step 1.1: Relocate Cookie Listener to Background Script**

**\[FIX\]**

* **File(s):**  
  * packages/aura-adapter/contents/event-handler.ts (Remove from here)  
  * packages/aura-adapter/background.ts (Add to here)  
* **Why:** The chrome.cookies API is not available in content scripts. The listener must live in the background script to function correctly.  
* **Code Changes:**  
  1. **DELETE** the following code block from packages/aura-adapter/contents/event-handler.ts:  
     // DELETE THIS ENTIRE BLOCK  
     // Monitor cookie changes  
     chrome.cookies.onChanged.addListener((changeInfo) \=\> {  
       // ... implementation ...  
     });

  2. **ADD** this logic to packages/aura-adapter/background.ts:  
     // ADD THIS TO background.ts, inside setupAuthListeners()

     chrome.cookies.onChanged.addListener((changeInfo) \=\> {  
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
           type: 'AUTH\_TOKEN\_ACQUIRED',  
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

  3. You will also need a helper function in background.ts to forward events:  
     // ADD THIS HELPER FUNCTION TO background.ts

     function forwardEventToActiveTab(payload: AURAEvent\['payload'\]) {  
       const event: AURAEvent \= {  
         protocol: 'AURAEvent',  
         version: '1.0',  
         eventId: \`bg-${Date.now()}\`,  
         payload,  
       };

       chrome.tabs.query({ active: true, currentWindow: true }, (tabs) \=\> {  
         if (tabs\[0\] && tabs\[0\].id) {  
           chrome.tabs.sendMessage(tabs\[0\].id, {  
             type: 'FORWARD\_AURA\_EVENT',  
             event  
           }).catch(() \=\> console.error('Failed to forward event. Content script may not be ready.'));  
         }  
       });  
     }

  4. Finally, update event-handler.ts to listen for these forwarded events:  
     // ADD THIS TO event-handler.ts  
     chrome.runtime.onMessage.addListener((message, sender, sendResponse) \=\> {  
       if (message.type \=== 'FORWARD\_AURA\_EVENT' && message.event) {  
         sendAURAEvent(message.event.payload.type, message.event.payload.data);  
       }  
     });

### **Step 1.2: Fix localStorage Monitoring with Script Injection**

**\[FIX\]**

* **File(s):** packages/aura-adapter/contents/event-handler.ts  
* **Why:** Content scripts run in an "isolated world" and cannot directly override the page's localStorage.setItem. The correct method is to inject a script into the page's main world.  
* **Code Changes:**  
  1. **DELETE** the localStorage and sessionStorage override blocks from event-handler.ts.  
  2. **ADD** this new function and call it inside your main init() function in event-handler.ts:  
     // ADD THIS FUNCTION TO event-handler.ts

     function injectStorageMonitor() {  
       const script \= document.createElement('script');  
       script.textContent \= \`  
         (function() {  
           const sendEvent \= (storageType, key, value) \=\> {  
             window.postMessage({  
               type: 'AURA\_STORAGE\_EVENT',  
               detail: { storage: storageType, key, value }  
             }, '\*');  
           };

           const originalSetItem \= localStorage.setItem;  
           localStorage.setItem \= function(key, value) {  
             if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {  
               sendEvent('localStorage', key, value);  
             }  
             originalSetItem.apply(this, arguments);  
           };

           const originalSessionSetItem \= sessionStorage.setItem;  
           sessionStorage.setItem \= function(key, value) {  
             if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {  
               sendEvent('sessionStorage', key, value);  
             }  
             originalSessionSetItem.apply(this, arguments);  
           };  
         })();  
       \`;  
       (document.head || document.documentElement).appendChild(script);  
       script.remove(); // Clean up the script tag

       // Listen for messages from the injected script  
       window.addEventListener('message', (event) \=\> {  
         if (event.source \=== window && event.data.type \=== 'AURA\_STORAGE\_EVENT') {  
           sendAURAEvent('AUTH\_TOKEN\_ACQUIRED', event.data.detail);  
         }  
       });  
     }

     // CALL IT IN YOUR (async function init() { ... })  
     injectStorageMonitor();

### **Step 1.3: Remove Inefficient HEAD Request from Content Script**

**\[REPLACE\]**

* **File(s):** packages/aura-adapter/contents/aura-detector.ts  
* **Why:** The fetch call from a content script is unreliable due to CORS and CSP. The webRequest API in background.ts is the single source of truth for AURA support and state. The content script should simply ask the background script.  
* **Code Changes:**  
  1. **DELETE** the entire content of packages/aura-adapter/contents/aura-detector.ts.  
  2. **REPLACE** it with this simplified logic:  
     // New content for aura-detector.ts  
     import type { PlasmoCSConfig } from "plasmo";

     export const config: PlasmoCSConfig \= {  
       matches: \["\<all\_urls\>"\],  
       run\_at: "document\_end"  
     };

     // Ask the background script for the status of the current tab  
     chrome.runtime.sendMessage({ type: 'GET\_AURA\_SUPPORT\_STATUS' }, (response) \=\> {  
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

  3. You will need to update background.ts to handle this message:  
     // ADD THIS TO background.ts

     // Store manifest URL by tab ID  
     const auraManifestUrlByTab: Map\<number, string\> \= new Map();

     // Inside the onHeadersReceived listener, when you find a manifest:  
     // ...  
     // auraManifestUrlByTab.set(details.tabId, manifestUrl);  
     // ...

     // Add this listener to handle messages from content scripts  
     chrome.runtime.onMessage.addListener((message, sender, sendResponse) \=\> {  
       if (message.type \=== 'GET\_AURA\_SUPPORT\_STATUS' && sender.tab?.id) {  
         const tabId \= sender.tab.id;  
         const manifestUrl \= auraManifestUrlByTab.get(tabId);  
         const status \= {  
           supported: \!\!manifestUrl,  
           url: manifestUrl || '',  
           version: manifestUrl ? '1.3' : '' // Assuming v1.3 if detected this way  
         };  
         sendResponse({ status });  
       }  
       return true; // For async response  
     });

## **Part 2: Robustness & Feature Enhancements**

### **Step 2.1: Implement Robust URI Template Parser**

**\[REPLACE\]**

* **File(s):** packages/ai-core-cli/src/index.ts  
* **Why:** The current RegEx-based URL builder is fragile and doesn't fully support RFC 6570, especially for array-based query parameters.  
* **Code Changes:**  
  1. **Install a library:**  
     npm install uri-template-lite

  2. **REPLACE** the buildHttpRequest function with this new version:  
     // REPLACE the old function in ai-core-cli/src/index.ts  
     import { URI } from 'uri-template-lite';

     function buildHttpRequest(capability: Capability, args: Record\<string, any\>, baseUrl: string) {  
       const template \= new URI.Template(capability.action.urlTemplate);  
       const expandedUrl \= template.expand(args);

       let body: any \= null;  
       if (capability.action.method \!== 'GET' && capability.action.method \!== 'DELETE') {  
         if (capability.action.encoding \=== 'json' || capability.action.encoding \=== 'multipart') {  
           // For JSON/multipart, the body is the arguments not used in the path  
           const pathParams \= new Set(new URI.Template(capability.action.urlTemplate).keys.map(k \=\> k.name));  
           body \= Object.fromEntries(  
             Object.entries(args).filter((\[key\]) \=\> \!pathParams.has(key))  
           );  
         }  
       }

       return { url: \`${baseUrl}${expandedUrl}\`, body };  
     }

### **Step 2.2: Implement Dynamic CSRF Token Fetching**

**\[UPDATE\]**

* **File(s):**  
  * packages/ai-core-cli/src/index.ts  
  * packages/aura-lighthouse-app/pages/api/csrf-token.ts (New file)  
* **Why:** To support sites with dynamic CSRF tokens, the agent must be able to fetch them before making a POST/PUT/DELETE request.  
* **Code Changes:**  
  1. **CREATE** a new API endpoint in the demo app:  
     // CREATE THIS FILE: packages/aura-lighthouse-app/pages/api/csrf-token.ts  
     import type { NextApiRequest, NextApiResponse } from 'next';  
     import { serialize } from 'cookie';

     export default function handler(req: NextApiRequest, res: NextApiResponse) {  
       // In a real app, generate and store this token in the user's session  
       const csrfToken \= \`csrf\_${Math.random().toString(36).substr(2, 10)}\`;

       // Set a double-submit cookie  
       res.setHeader('Set-Cookie', serialize('csrf-token', csrfToken, {  
         path: '/',  
         httpOnly: true, // For security  
       }));

       // Return the token in the response body for the agent to use in headers  
       res.status(200).json({ token: csrfToken });  
     }

  2. **UPDATE** the executeCapability function in ai-core-cli/src/index.ts:  
     // UPDATE this section in executeCapability

     const headers: Record\<string, string\> \= { /\* ... \*/ };

     // Add CSRF token if required  
     const csrfConfig \= capability.action.security?.csrf;  
     if (csrfConfig) {  
       if (csrfConfig.startsWith('header:')) {  
         const headerName \= csrfConfig.replace('header:', '');  
         // This is a placeholder; in a real scenario, the token would be stored  
         headers\[headerName\] \= 'demo-static-csrf-token';   
       } else if (csrfConfig.startsWith('fetch:')) {  
         const fetchUrl \= \`${baseUrl}${csrfConfig.replace('fetch:', '')}\`;  
         console.log(\`Fetching dynamic CSRF token from ${fetchUrl}...\`);  
         const csrfResponse \= await axios.get(fetchUrl);  
         const token \= csrfResponse.data.token;  
         headers\['X-CSRF-Token'\] \= token; // Assuming standard header name  
       }  
     }

### **Step 2.3: Add File Lock for State Cache**

**\[UPDATE\]**

* **File(s):** packages/ai-core-cli/src/index.ts  
* **Why:** To prevent race conditions when multiple CLI processes access the same cache files.  
* **Code Changes:**  
  1. **Install a library:**  
     npm install proper-lockfile

  2. **UPDATE** the file writing logic in ai-core-cli:  
     // UPDATE file writing in ai-core-cli/src/index.ts  
     import \* as lockfile from 'proper-lockfile';

     // Example: Caching the AURA state  
     const stateFile \= path.join(cacheDir, 'aura-state.json');  
     try {  
       await lockfile.lock(cacheDir, { retries: 3 });  
       fs.writeFileSync(stateFile, JSON.stringify(auraState));  
     } finally {  
       await lockfile.unlock(cacheDir);  
     }

## **Part 3: Final Polish & Verification**

### **Step 3.1: Refine Protocol Definitions**

**\[UPDATE\]**

* **File(s):** packages/aura-protocol/src/index.ts  
* **Why:** To incorporate the final small but useful additions from our review.  
* **Code Changes:**  
  // In packages/aura-protocol/src/index.ts

  export interface Policy {  
    rateLimit?: {  
      limit: number;  
      window: 'second' | 'minute' | 'hour' | 'day'; // ADD 'day'  
    };  
    authHint?: 'none' | 'cookie' | 'bearer' | 'oauth2' | '401\_challenge';  
    // ADD cookieNames for precision  
    cookieNames?: string\[\];   
  }

  export interface HttpAction {  
    // ...  
    encoding?: 'json' | 'form-data' | 'multipart' | 'query'; // ADD 'multipart'  
    // ...  
  }

### **Step 3.2: Fix Module Import Cycle**

**\[REFACTOR\]**

* **File(s):**  
  * packages/aura-lighthouse-app/pages/api/posts/index.ts  
  * packages/aura-lighthouse-app/pages/api/posts/\[id\].ts  
  * packages/aura-lighthouse-app/lib/db.ts (New file)  
* **Why:** To resolve the hot-reload warning and improve code organization.  
* **Code Changes:**  
  1. **CREATE** packages/aura-lighthouse-app/lib/db.ts:  
     // Mock database  
     export const posts: any\[\] \= \[ /\* ... your posts array ... \*/ \];

  2. **UPDATE** both index.ts and \[id\].ts to import from the new file:  
     // In both post API files  
     import { posts } from '../../../lib/db';

  3. **REMOVE** the export { posts } line from \[id\].ts.

### **Step 3.3: Final Verification**

**\[VERIFY\]**

1. **Run npm install** in the root to install the new dependencies (uri-template-lite, proper-lockfile).  
2. **Run your build script** for the @aura/protocol package to ensure the schema is regenerated with the latest changes.  
3. **Run npx aura-validate** against your aura.json file to confirm it's still valid.  
4. **Test the full flow:** Run the CLI with a prompt that requires a POST request to verify the CSRF fetching and new request builder are working.