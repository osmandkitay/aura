## **AURA Protocol: Refactoring for a Universal Vision**

This document outlines the step-by-step process to transform the AURA project from a proof-of-concept application into a clean, lightweight, and universal protocol specification. The goal is to create a foundational repository that clearly communicates the vision for a new standard of AI-web interaction.

### **Philosophy: Protocol, Not Platform**

Our guiding principle is to present AURA as a **protocol**, not a specific platform or application. The repository should serve as the canonical source for the AURA specification, with minimal, clean examples of how to implement it. Others will build the ecosystem (browser extensions, complex agents, framework integrations) on top of this foundation.

### **Step 1: Drastic Simplification \- Delete Non-Core Packages**

The first and most critical step is to remove all implementation-specific code that clouds the core protocol's message. Be bold. This is addition by subtraction.

**Your Task:** Delete the following entire directories from the packages/ folder. They are excellent proofs-of-concept but distract from the universal standard we are defining.

* **Sub-task: Delete the AI Core CLI.**  
  * **Command:** rm \-rf packages/ai-core-cli  
  * **Reasoning:** This package mixes too many concerns (LLM orchestration, WebSocket server, CLI). It makes AURA seem like a complex, monolithic application. We will replace its essential function with a much simpler reference client.  
* **Sub-task: Delete the Browser Adapter.**  
  * **Command:** rm \-rf packages/aura-adapter  
  * **Reasoning:** This is the most important deletion. The Chrome Extension is a *specific application* of AURA. By removing it, we sever the incorrect notion that AURA *requires* a browser extension to function. This immediately elevates the project to a more universal, backend-agnostic protocol.

After this step, your packages directory should only contain aura-protocol and aura-lighthouse-app.

### **Step 2: Restructure and Reframe Remaining Packages**

Now, we will rename and reposition the remaining packages to reflect their roles as *examples* of the protocol, not the protocol itself.

* **Sub-task: Rename the Lighthouse App to reference-server.**  
  * **Command:** mv packages/aura-lighthouse-app packages/reference-server  
  * **Reasoning:** Its name must reflect its purpose. It is the official "Reference Server Implementation" for the AURA protocol, demonstrating how any web developer can make their site AURA-compliant.  
* **Sub-task: Update the package.json inside reference-server.**  
  * **Action:** Open packages/reference-server/package.json and change the "name" field.  
  * **From:** "name": "aura-lighthouse-app"  
  * **To:** "name": "aura-reference-server"

### **Step 3: Create a Minimalist Reference Client**

We will now create a new package that demonstrates how to *consume* the protocol in its purest form, without any browser dependencies. This will showcase two powerful use-cases.

* **Sub-task: Create the package directory.**  
  * **Command:** mkdir \-p packages/reference-client/src  
* **Sub-task: Create the package.json for the client.**  
  * **Action:** Create a new file at packages/reference-client/package.json.  
  * **Content:**  
    {  
      "name": "aura-reference-client",  
      "version": "1.0.0",  
      "private": true,  
      "scripts": {  
        "agent": "ts-node src/agent.ts",  
        "crawler": "ts-node src/crawler.ts"  
      },  
      "dependencies": {  
        "@aura/protocol": "workspace:\*",  
        "axios": "^1.7.2",  
        "commander": "^12.1.0",  
        "dotenv": "^16.4.5",  
        "openai": "^4.52.0",  
        "ts-node": "^10.9.2",  
        "typescript": "^5.4.5"  
      }  
    }

* **Sub-task: Create the "Agent" example.**  
  * **Action:** Create a new file at packages/reference-client/src/agent.ts. This is a stripped-down, backend-only version of your old CLI.  
  * **Content:**  
    // packages/reference-client/src/agent.ts  
    import 'dotenv/config';  
    import axios from 'axios';  
    import OpenAI from 'openai';  
    import { AuraManifest, AuraState } from '@aura/protocol';

    const openai \= new OpenAI({ apiKey: process.env.OPENAI\_API\_KEY });

    /\*\*  
     \* Fetches the AURA manifest from a given base URL.  
     \*/  
    async function fetchManifest(baseUrl: string): Promise\<AuraManifest\> {  
        const manifestUrl \= \`${baseUrl}/.well-known/aura.json\`;  
        console.log(\`\[1/3\] Fetching AURA manifest from ${manifestUrl}...\`);  
        const response \= await axios.get\<AuraManifest\>(manifestUrl);  
        console.log(\`\[1/3\] Success. Site: ${response.data.site.name}\`);  
        return response.data;  
    }

    /\*\*  
     \* Uses an LLM to decide which capability to use based on a user prompt.  
     \*/  
    async function planAction(manifest: AuraManifest, prompt: string, state?: AuraState | null): Promise\<{ capabilityId: string; args: any; }\> {  
        console.log(\`\[2/3\] Planning action for prompt: "${prompt}"\`);  
        const tools \= Object.values(manifest.capabilities).map(cap \=\> ({  
            type: 'function' as const,  
            function: {  
                name: cap.id,  
                description: cap.description,  
                parameters: cap.parameters || { type: 'object', properties: {} },  
            },  
        }));

        const completion \= await openai.chat.completions.create({  
            model: 'gpt-4o-mini',  
            messages: \[  
                {  
                    role: 'system',  
                    content: \`You are an AI agent controller. Your task is to select the single best capability to fulfill the user's request. Current site state is: ${JSON.stringify(state, null, 2)}\`  
                },  
                { role: 'user', content: prompt }  
            \],  
            tools,  
            tool\_choice: 'auto',  
        });

        const toolCall \= completion.choices\[0\].message.tool\_calls?.\[0\];  
        if (\!toolCall) {  
            throw new Error("LLM did not select a capability to execute.");  
        }

        console.log(\`\[2/3\] LLM selected capability: ${toolCall.function.name}\`);  
        return {  
            capabilityId: toolCall.function.name,  
            args: JSON.parse(toolCall.function.arguments),  
        };  
    }

    /\*\*  
     \* Executes the chosen capability via a direct HTTP request.  
     \*/  
    async function executeAction(baseUrl: string, manifest: AuraManifest, capabilityId: string, args: any): Promise\<{ status: number; data: any; state: AuraState | null; }\> {  
        console.log(\`\[3/3\] Executing capability "${capabilityId}"...\`);  
        const capability \= manifest.capabilities\[capabilityId\];  
        if (\!capability) throw new Error(\`Capability ${capabilityId} not found.\`);

        // Note: This is a simplified HTTP builder. A real library would handle URL templating more robustly.  
        const url \= \`${baseUrl}${capability.action.urlTemplate.split('{')\[0\]}\`;

        const response \= await axios({  
            method: capability.action.method,  
            url: url,  
            data: (capability.action.method \!== 'GET' && capability.action.method \!== 'DELETE') ? args : null,  
            params: (capability.action.method \=== 'GET' || capability.action.method \=== 'DELETE') ? args : null,  
            validateStatus: () \=\> true, // Accept all status codes  
        });

        const auraStateHeader \= response.headers\['aura-state'\];  
        let auraState: AuraState | null \= null;  
        if (auraStateHeader) {  
            auraState \= JSON.parse(Buffer.from(auraStateHeader, 'base64').toString('utf-8'));  
        }

        console.log(\`\[3/3\] Execution complete. Status: ${response.status}\`);  
        return { status: response.status, data: response.data, state: auraState };  
    }

    // Main execution flow  
    async function main() {  
        const url \= process.argv\[2\];  
        const prompt \= process.argv\[3\];

        if (\!url || \!prompt) {  
            console.error('Usage: npm run agent \<url\> "\<prompt\>"');  
            process.exit(1);  
        }

        try {  
            const manifest \= await fetchManifest(url);  
            const { capabilityId, args } \= await planAction(manifest, prompt);  
            const result \= await executeAction(url, manifest, capabilityId, args);

            console.log('\\n--- Execution Result \---');  
            console.log('Status:', result.status);  
            console.log('Data:', JSON.stringify(result.data, null, 2));  
            console.log('New AURA-State:', JSON.stringify(result.state, null, 2));  
            console.log('----------------------\\n');

        } catch (error) {  
            console.error("\\nAn error occurred:", (error as Error).message);  
        }  
    }

    main();

* **Sub-task: Create the "Crawler" example.**  
  * **Action:** Create a new file at packages/reference-client/src/crawler.ts. This is the lightweight script with the huge vision.  
  * **Content:**  
    // packages/reference-client/src/crawler.ts  
    import axios from 'axios';  
    import { AuraManifest } from '@aura/protocol';

    /\*\*  
     \* This script demonstrates how a search engine or indexer could crawl an AURA-enabled site.  
     \* Instead of just indexing text content, it indexes the site's semantic capabilities.  
     \*/  
    async function crawlSiteForCapabilities(baseUrl: string) {  
        console.log(\`Crawling ${baseUrl} for AURA capabilities...\`);  
        try {  
            const manifestUrl \= \`${baseUrl}/.well-known/aura.json\`;  
            const response \= await axios.get\<AuraManifest\>(manifestUrl);  
            const manifest \= response.data;

            const indexedData \= {  
                crawledUrl: baseUrl,  
                timestamp: new Date().toISOString(),  
                site: {  
                    name: manifest.site.name,  
                    description: manifest.site.description,  
                },  
                // Indexing the actions the site offers  
                capabilities: Object.values(manifest.capabilities).map(cap \=\> ({  
                    id: cap.id,  
                    description: cap.description,  
                    // A real crawler could index parameter schemas for deep linking  
                    parameters: Object.keys(cap.parameters?.properties || {}),   
                })),  
            };

            console.log("\\n--- AURA Site Index \---");  
            console.log("A crawler has discovered the following structured capabilities:");  
            console.log(JSON.stringify(indexedData, null, 2));  
            console.log("-----------------------\\n");  
            console.log("This structured data allows search engines to understand what a user can \*do\* on a site, not just what they can \*read\*.");

        } catch (error) {  
            console.error(\`Failed to crawl ${baseUrl}. Is it an AURA-enabled site with a valid manifest?\`);  
            console.error((error as Error).message);  
        }  
    }

    // Main execution flow  
    const url \= process.argv\[2\];  
    if (\!url) {  
        console.error('Usage: npm run crawler \<url\>');  
        process.exit(1);  
    }  
    crawlSiteForCapabilities(url);

### **Step 4: Refine the Core Protocol**

The protocol itself must be pure. AURAEvent is a concept for browser-based agents, which is an *application* of the protocol, not the core standard itself.

* **Sub-task: Simplify the protocol definition.**  
  * **Action:** Open packages/aura-protocol/src/index.ts.  
  * **Modification:** Delete the entire AURAEvent interface definition. The protocol should only concern itself with the AuraManifest and AuraState which are universal.  
  * **Reasoning:** This reinforces that AURA is fundamentally a stateless, HTTP-based protocol. Asynchronous events are an advanced, implementation-specific pattern that can be defined in a separate, future specification (e.g., "AURA-Events for Interactive Agents").

### **Step 5: Write the Manifesto \- The New README.md**

This is the most important written part. It must sell the vision. Replace your entire root README.md with the following.

* **Action:** rm README.md && touch README.md

* ## **Content:**   **\# AURA: The Protocol for a Machine-Readable Web**    **\*\*AURA (Agent-Usable Resource Assertion)\*\* is an open protocol for making websites understandable and operable by AI agents. It proposes a new standard for AI-web interaction that moves beyond fragile screen scraping and DOM manipulation towards a robust, secure, and efficient machine-readable layer for the internet.**    **The web was built for human eyes. AURA is a specification for giving it a machine-readable "API".**    **\[\!\[NPM Version\](https://img.shields.io/npm/v/@aura/protocol.svg)\](https://www.npmjs.com/package/@aura/protocol)**   **\[\!\[License\](https://img.shields.io/badge/license-MIT-blue.svg)\](LICENSE)**    **\---**    **\#\# The Vision: Why AURA?**    **Current AI agents interact with websites in a brittle and inefficient way:**   **1\.  \*\*Screen Scraping:\*\* They "look" at pixels and guess where to click. This is slow, expensive, and breaks with the slightest UI change.**   **2\.  \*\*DOM Manipulation:\*\* They parse complex HTML structures, which are inconsistent across sites and change frequently.**   **3\.  \*\*Insecurity:\*\* Website owners have no control over what an agent might do. An agent could accidentally or maliciously perform dangerous actions.**    **AURA solves this by allowing websites to \*\*declare their capabilities\*\* in a simple, standardized \`aura.json\` manifest file.**    **Instead of an agent guessing how to "create a post," the website explicitly states:**   **\> \*"I have a capability named \`create\_post\`. It's an \`HTTP POST\` to \`/api/posts\` and requires \`title\` and \`content\` parameters."\***    **This is a fundamental paradigm shift from \*imperative guessing\* to \*declarative interaction\*.**    **\#\# Core Concepts**    **\* \*\*Manifest (\`aura.json\`):\*\* A file served at \`/.well-known/aura.json\` that acts as a site's "API documentation" for AI agents. It defines all available resources and capabilities.**   **\* \*\*Capability:\*\* A single, discrete action an agent can perform (e.g., \`list\_posts\`, \`login\`, \`update\_profile\`). Each capability maps to a specific HTTP request.**   **\* \*\*State (\`AURA-State\` Header):\*\* A dynamic HTTP header sent by the server with each response, informing the agent about the current context (e.g., is the user authenticated?) and which capabilities are currently available to them.**    **\#\# This Repository**    **This repository is the \*\*canonical specification for the AURA protocol\*\*. It provides the core building blocks for the AURA ecosystem:**    **\* \*\*\`packages/protocol\`\*\*: The core \`@aura/protocol\` NPM package, containing TypeScript interfaces and the official JSON Schema for validation. \*\*This is the heart of AURA.\*\***   **\* \*\*\`packages/reference-server\`\*\*: A reference implementation of an AURA-enabled server built with Next.js. Use this to understand how to make your own website AURA-compliant.**   **\* \*\*\`packages/reference-client\`\*\*: A minimal, backend-only reference client demonstrating two powerful ways to consume the protocol, without any browser or extension required.**    **\#\# Getting Started: A 5-Minute Demonstration**    **See the protocol in action.**    **\#\#\# 1\. Run the Reference Server**    **The server is a sample website that "speaks" AURA.**    **\`\`\`bash**   **\# Navigate to the server directory**   **cd packages/reference-server**    **\# Install dependencies**   **npm install**    **\# Run the server (usually on http://localhost:3000)**   **npm run dev**    **You can now visit [http://localhost:3000/.well-known/aura.json](https://www.google.com/search?q=http://localhost:3000/.well-known/aura.json) in your browser to see the manifest.**   **2\. Run the Reference Agent**   **This simple agent uses an LLM to understand a prompt and execute a capability on the server.**   **\# (In a new terminal) Navigate to the client directory**   **cd packages/reference-client**    **\# Install dependencies**   **npm install**    **\# Set your OpenAI API Key**   **export OPENAI\_API\_KEY="sk-..."**    **\# Run the agent with a URL and a prompt**   **npm run agent \-- http://localhost:3000 "list all the blog posts"**    **Observe how the agent fetches the manifest, plans its action, and executes the list\_posts capability directly.**   **3\. Run the Crawler (The Big Vision)**   **This script demonstrates how a search engine could index an AURA-enabled site, understanding its functions, not just its content.**   **\# In the client directory**   **npm run crawler \-- http://localhost:3000**    **The output shows a structured JSON object representing the site's capabilities. This is the future of search: indexing actions, not just pages.**   **The Future is a Collaborative Ecosystem**   **This repository defines the standard. The true power of AURA will be realized when a community builds on top of it. We envision a future with:**

  * **Adapters** for all major web frameworks (Express, Laravel, Django, Ruby on Rails).  
  * **Clients** in every major language (Python, Go, Rust, Java).  
  * **Intelligent Applications** like browser extensions, search engines, and autonomous agents that leverage this new, structured layer of the web.

AURA is a public good. Fork it, build with it, and help us create a more intelligent and interoperable web.

You have now completed the transformation. Your repository is lean, powerful, and communicates a clear, ambitious, and universal vision. It is no longer a single application, but the blueprint for a new web.