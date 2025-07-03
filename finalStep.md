# **AURA v1.3 Final Implementation Plan**

## **Introduction**

This document provides a clear, actionable, step-by-step plan to implement the final fixes and enhancements for the AURA v1.3 protocol. The tasks are prioritized, starting with critical bugs that affect functionality, followed by robustness enhancements and security hardening.

Execute these steps in the specified order to finalize the implementation.

## **Part 1: Critical Functionality Fixes**

These tasks address bugs that can cause silent failures or incorrect behavior.

### **Step 1.1: Correct the File Lock API Usage**

* **File:** packages/ai-core-cli/src/index.ts  
* **Action:** Modify the file locking logic to use the returned release function. The current implementation with unlock(path) will leave stale lock files.  
* **Code Change:** Update all lockfile calls.  
  **Current (Incorrect) Code:**  
  try {  
    await lockfile.lock(cacheDir, { retries: 3 });  
    fs.writeFileSync(stateFile, JSON.stringify(auraState));  
  } finally {  
    await lockfile.unlock(cacheDir); // This is wrong  
  }

  **Corrected Code:**  
  // In handleAURAEvent() and executeCapability()  
  const release \= await lockfile.lock(cacheDir, { retries: 3 });  
  try {  
    // ... perform file system operations ...  
    fs.writeFileSync(stateFile, JSON.stringify(auraState));  
  } finally {  
    await release(); // Use the returned release function  
  }

### **Step 1.2: Strengthen Manifest Detection Logic**

* **File:** packages/aura-adapter/background.ts  
* **Action:** Update the AURA support detection logic. A site should be considered "supported" if it has *either* a /.well-known/aura.json manifest *or* an AURA-State header, as some pages might only provide state.  
* **Code Change:** Modify the GET\_AURA\_SUPPORT\_STATUS message handler.  
  // In packages/aura-adapter/background.ts

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) \=\> {  
    // ... other message handlers ...

    if (message.type \=== 'GET\_AURA\_SUPPORT\_STATUS' && sender.tab?.id) {  
      const tabId \= sender.tab.id;  
      const manifestUrl \= auraManifestUrlByTab.get(tabId);  
      const hasStateHeader \= auraStateByTab.has(tabId);

      // A site is supported if it has a manifest OR a state header  
      const isSupported \= \!\!manifestUrl || hasStateHeader;

      const status \= {  
        supported: isSupported,  
        url: manifestUrl || '',  
        version: manifestUrl ? '1.3' : (hasStateHeader ? 'state-only' : '')  
      };  
      sendResponse({ status });  
    }

    return true; // For async response  
  });

## **Part 2: Robustness and Feature Enhancements**

These tasks make the system more resilient to edge cases and more powerful.

### **Step 2.1: Prevent Dropped Events with a Background Queue**

* **File:** packages/aura-adapter/background.ts  
* **Action:** Implement a simple in-memory queue in the background script and add a proactive trigger to flush it as soon as a tab becomes active. This prevents data loss.  
* **Code Change:** Update the forwardEventToActiveTab function and add a new listener.  
  // In packages/aura-adapter/background.ts

  let backgroundEventQueue: AURAEvent\[\] \= \[\];

  function forwardEventToActiveTab(payload: AURAEvent\['payload'\]) {  
    const event: AURAEvent \= { /\* ... create event ... \*/ };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) \=\> {  
      const activeTab \= tabs\[0\];  
      if (activeTab && activeTab.id) {  
        // If there's an active tab, send immediately  
        chrome.tabs.sendMessage(activeTab.id, {  
          type: 'FORWARD\_AURA\_EVENT',  
          event  
        }).catch(() \=\> {  
          // If sending fails (e.g., content script not ready), queue it  
          console.log('Failed to forward event, queuing...');  
          backgroundEventQueue.push(event);  
        });  
      } else {  
        // If no active tab, queue the event  
        console.log('No active tab found, queuing event...');  
        backgroundEventQueue.push(event);  
      }  
    });  
  }

  // Add a new function to flush the queue  
  function flushBackgroundQueue() {  
      if (backgroundEventQueue.length \=== 0\) return;

      const event \= backgroundEventQueue.shift(); // Get the oldest event  
      if (event) {  
          forwardEventToActiveTab(event.payload);  
          // Attempt to flush more if the queue is still populated  
          if (backgroundEventQueue.length \> 0\) {  
              setTimeout(flushBackgroundQueue, 100);  
          }  
      }  
  }

  // Add a new listener to trigger the flush when a tab becomes active.  
  chrome.tabs.onActivated.addListener(() \=\> {  
      console.log('Tab activated, attempting to flush background event queue...');  
      flushBackgroundQueue();  
  });

### **Step 2.2: Enhance LLM Interaction with Function Calling**

* **File:** packages/ai-core-cli/src/index.ts  
* **Action:** Convert the free-form JSON prompt to the formal "Function Calling" / "Tool Use" API provided by OpenAI. This drastically reduces errors and improves reliability.  
* **Code Change:** Update the runAuraAgent function.  
  // In packages/ai-core-cli/src/index.ts, inside runAuraAgent()

  // 1\. Transform capabilities into the 'tools' format  
  const tools \= Object.values(manifest.capabilities).map(cap \=\> ({  
    type: 'function' as const,  
    function: {  
      name: cap.id,  
      description: cap.description,  
      parameters: cap.parameters || { type: 'object', properties: {} },  
    },  
  }));

  // 2\. Update the OpenAI API call to use tools  
  console.log('\[3/4\] Requesting action plan from LLM using function calling...');  
  const completion \= await openai.chat.completions.create({  
    model: 'gpt-4o-mini',  
    messages: \[  
      { role: 'system', content: \`You are an AI agent controller. Execute a function based on the user's request. Current AURA state: ${JSON.stringify(currentState, null, 2)}\` },  
      { role: 'user', content: userPrompt }  
    \],  
    tools: tools,  
    tool\_choice: 'auto',  
  });

  const toolCall \= completion.choices\[0\].message.tool\_calls?.\[0\];

  if (\!toolCall) {  
    throw new Error("LLM did not return a valid tool call.");  
  }

  const capabilityId \= toolCall.function.name;  
  const args \= JSON.parse(toolCall.function.arguments);

  // ... continue with executeCapability(manifest, capabilityId, args, url);

## **Part 3: Security Hardening and Final Polish**

These are the final touches to make the protocol and implementation production-grade.

### **Step 3.1: Add CSRF Protection to the login Capability**

* **File:** packages/aura-lighthouse-app/public/.well-known/aura.json  
* **Action:** For consistency and to prevent login CSRF, add a security requirement to the login capability.  
* **Code Change:**  
  // In aura.json, inside the "login" capability  
  "login": {  
    "id": "login",  
    "v": 1,  
    // ...  
    "action": {  
      // ...  
      "security": {  
        "csrf": "header:X-CSRF-TOKEN"  
      }  
    }  
  }

### **Step 3.2: Cache Fetched CSRF Tokens with Expiry**

* **File:** packages/ai-core-cli/src/index.ts  
* **Action:** Prevent the agent from using a stale CSRF token by checking an expiresAt timestamp before using the cached value.  
* **Code Change:** Update executeCapability.  
  // In packages/ai-core-cli/src/index.ts

  async function executeCapability(...) {  
    // ...  
    const csrfConfig \= capability.action.security?.csrf;  
    if (csrfConfig && csrfConfig.startsWith('fetch:')) {  
      const csrfCacheFile \= path.join(cacheDir, 'csrf-token.json');  
      let token;

      // Check cache first  
      if (fs.existsSync(csrfCacheFile)) {  
        const cachedData \= JSON.parse(fs.readFileSync(csrfCacheFile, 'utf-8'));  
        // Check if the token is expired  
        if (cachedData.expiresAt && new Date(cachedData.expiresAt) \> new Date()) {  
          token \= cachedData.token;  
          console.log('Using cached CSRF token.');  
        } else {  
          console.log('Cached CSRF token is expired or invalid.');  
        }  
      }

      // If token is not valid, fetch a new one  
      if (\!token) {  
        const fetchUrl \= \`${baseUrl}${csrfConfig.replace('fetch:', '')}\`;  
        console.log(\`Fetching dynamic CSRF token from ${fetchUrl}...\`);  
        const csrfResponse \= await axios.get(fetchUrl);  
        token \= csrfResponse.data.token;

        // Assume the server returns an expiry time in seconds  
        const expiresAt \= csrfResponse.data.expiresIn  
          ? new Date(Date.now() \+ csrfResponse.data.expiresIn \* 1000).toISOString()  
          : null;

        // Cache the new token with its expiry  
        fs.writeFileSync(csrfCacheFile, JSON.stringify({ token, expiresAt }));  
      }

      headers\['X-CSRF-Token'\] \= token;  
    }  
    // ...  
  }

### **Step 3.3: Add Vary: Origin Header**

* **File:** packages/aura-lighthouse-app/next.config.ts  
* **Action:** Add the Vary: Origin header to your CORS configuration to prevent potential CDN cache poisoning issues.  
* **Code Change:**  
  // In next.config.ts, inside async headers()  
  {  
    source: '/api/:path\*',  
    headers: \[  
      // ... other headers  
      {  
        key: 'Vary',  
        value: 'Origin',  
      },  
    \],  
  },

### **Step 3.4: Finalize Dependencies**

* **File:** packages/ai-core-cli/package.json  
* **Action:** Ensure uri-template-lite and proper-lockfile are listed under dependencies, not just as type definitions.  
* **Code Change:**  
  "dependencies": {  
    // ... other dependencies  
    "uri-template-lite": "^1.0.1",  
    "proper-lockfile": "^4.1.2"  
  },

  *Note: Run npm install after updating package.json.*