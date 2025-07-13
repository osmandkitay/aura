# **AURA Agent Improvement Plan**

This document outlines the refactoring steps required to enhance the AURA reference agent. The goal is to address two key areas: **state persistence** (for handling authentication) and **robust multi-step command processing**.

Implementing these changes will significantly increase the agent's capabilities, allowing it to perform complex, authenticated workflows as envisioned by the AURA protocol.

## **Part 1: Implement State Persistence for Authentication**

### **1.1. The Problem: Stateless Execution**

The agent currently operates in a stateless manner. Each time the agent script is run, it starts with a new, empty CookieJar.

* **Symptom:** After a successful login operation, the server sends a Set-Cookie header with an auth-token. However, the agent discards this cookie at the end of its execution. Subsequent commands (or even subsequent steps within a single complex command) are therefore unauthenticated. This is confirmed by the AURA-State header in the terminal output, which always shows "isAuthenticated": false".  
* **Why it's critical:** Without state persistence, the agent can never access capabilities that require authentication (e.g., create\_post, update\_profile), which severely limits its usefulness.

### **1.2. The Solution: Persist the CookieJar**

To solve this, we will persist the CookieJar to a file between executions. The agent will load cookies from this file at the start of a command and save any new or updated cookies back to the file after each network request.

* **Relevant File:** packages/reference-client/src/agent.ts

### **1.3. Action Steps**

1. **Import necessary modules.**  
   * Add fs (File System) and path to your imports in agent.ts to handle file operations.

import \* as fs from 'fs';  
import \* as path from 'path';

2. **Define a persistent storage path for the cookies.**  
   * Create a constant for the cookie file path. A hidden file in the user's home directory or the project directory is a good choice.

// At the top of agent.ts  
const COOKIE\_FILE\_PATH \= path.join(\_\_dirname, '.aura-cookies.json');

3. **Create a function to load the** CookieJar **from the file.**  
   * This function will read the JSON file, deserialize it, and create a CookieJar instance from the stored data. It should handle cases where the file doesn't exist yet.

// Add this helper function in agent.ts  
async function loadCookieJar(): Promise\<CookieJar\> {  
  try {  
    if (fs.existsSync(COOKIE\_FILE\_PATH)) {  
      const cookieJson \= await fs.promises.readFile(COOKIE\_FILE\_PATH, 'utf-8');  
      const deserializedJar \= JSON.parse(cookieJson);  
      return CookieJar.fromJSON(deserializedJar);  
    }  
  } catch (error) {  
    console.warn('\[State\] Could not load cookies, starting a new session.', error);  
  }  
  return new CookieJar();  
}

4. **Create a function to save the** CookieJar **to the file.**  
   * This function will serialize the current CookieJar state to JSON and write it to the file.

// Add this helper function in agent.ts  
async function saveCookieJar(jar: CookieJar): Promise\<void\> {  
  try {  
    const cookieJson \= JSON.stringify(jar.toJSON(), null, 2);  
    await fs.promises.writeFile(COOKIE\_FILE\_PATH, cookieJson, 'utf-8');  
  } catch (error) {  
    console.error('\[State\] Failed to save cookies.', error);  
  }  
}

5. **Integrate loading and saving into the main execution flow.**  
   * Modify the main function and the client initialization. The agent should load the CookieJar *before* the first request and save it *after* any request is made.

// In agent.ts, modify the client initialization and main function

// ... (imports)

// A global variable for the jar to be used across the script's lifecycle  
let cookieJar: CookieJar; 

// Replace the existing client creation  
const client \= wrapper(axios.create({  
  jar: new CookieJar(), // Start with a temporary one  
  withCredentials: true,  
}));

// In the main() function, at the very beginning:  
async function main() {  
  // ...  
  try {  
    cookieJar \= await loadCookieJar();  
    client.defaults.jar \= cookieJar; // Assign the loaded/new jar to the client instance  
    // ... rest of the main function  
  }   
  // ...  
}

// In the executeAction() function, after the request completes:  
async function executeAction(...) {  
    // ... (existing code for making the request)  
    const response \= await client({ /\* ... \*/ });

    // Save the state of the cookie jar after the request  
    await saveCookieJar(cookieJar);

    // ... (existing code for processing the response)  
    return { status: response.status, data: response.data, state: auraState };  
}

## **Part 2: Refactor Multi-Step Command Processing**

### **2.1. The Problem: Brittle Prompt Analysis**

The current analyzePromptComplexity function uses regular expressions to detect and parse multi-step commands.

* **Symptom:** When given a complex prompt like "login... and add new blog...", the logic correctly identifies the *pattern* but fails to *extract* the parameters correctly. This causes the function to fall back to treating the entire prompt as a single step, leading to incorrect behavior (only the login part is executed).  
* **Why it's critical:** The agent's ability to perform complex, sequential tasks is a core part of its intelligence. A brittle parser makes it unreliable and unable to fulfill user intent.

### **2.2. The Solution: Leverage the LLM for Structured Output**

Instead of using regex on the prompt, we will instruct the LLM to act as the parser. We will ask it to return a structured JSON object representing the sequence of actions and their arguments. This is significantly more robust and scalable.

* **Relevant File:** packages/reference-client/src/agent.ts

### **2.3. Action Steps**

1. **Redefine the** planAction **function's role.**  
   * Instead of planning a single action, this function (perhaps renamed to createExecutionPlan) will now be responsible for creating the *entire* plan of steps from the initial prompt.  
2. **Modify the LLM system prompt to demand structured JSON output.**  
   * Update the prompt in what is now the createExecutionPlan function. The new prompt will instruct the model to return a JSON array of action objects.

// Replace the logic inside planAction (or a new createExecutionPlan function)  
async function createExecutionPlan(manifest: AuraManifest, prompt: string, state?: AuraState | null): Promise\<{ capabilityId: string; args: any; }\[\]\> {  
  console.log(\`\[Planning\] Creating execution plan for prompt: "${prompt}"\`);

  const availableCapabilities \= state?.capabilities || Object.keys(manifest.capabilities);  
  const tools \= availableCapabilities.map(capId \=\> {  
    // ... (existing tool generation logic)  
  }).filter(Boolean);

  const completion \= await openai.chat.completions.create({  
      model: 'gpt-4o-mini',  
      response\_format: { type: "json\_object" }, // Enforce JSON output\!  
      messages: \[  
          {  
              role: 'system',  
              content: \`You are an AI agent controller. Your task is to analyze the user's request and break it down into a sequence of executable steps.  
              Respond with a JSON object containing a "steps" key.  
              The value of "steps" must be an array of objects, where each object represents one capability to execute and has two keys: "capabilityId" (the name of the function to call) and "args" (an object of parameters for that function).  
              Current site state: ${JSON.stringify(state, null, 2)}  
              Available capabilities: ${availableCapabilities.join(', ')}\`  
          },  
          { role: 'user', content: prompt }  
      \],  
      tools: tools as any,  
      tool\_choice: 'auto',  
  });

  const responseContent \= completion.choices\[0\].message.tool\_calls?.\[0\].function.arguments;  
  if (\!responseContent) {  
      throw new Error("LLM failed to generate an execution plan.");  
  }

  console.log(\`\[Planning\] LLM generated plan: ${responseContent}\`);  
  try {  
      // The LLM tool-calling feature often wraps the response.  
      // Adjust parsing based on the actual output format.  
      // Let's assume the LLM provides the arguments to a single "execute\_plan" function.  
      const plan \= JSON.parse(responseContent);  
      if (\!plan.steps || \!Array.isArray(plan.steps)) {  
        throw new Error('LLM response is missing a valid "steps" array.');  
      }  
      return plan.steps;  
  } catch (e) {  
      console.error("Failed to parse execution plan from LLM.", e);  
      throw new Error("Could not parse the execution plan from the LLM response.");  
  }  
}

3. **Refactor the main execution loop.**  
   * Remove the old analyzePromptComplexity function entirely.  
   * The main loop will now call createExecutionPlan *once* at the beginning to get the full list of steps. It will then iterate through this structured plan and execute each action.

// In agent.ts, refactor the main() function  
async function main() {  
    const url \= process.argv\[2\];  
    const prompt \= process.argv\[3\];  
    // ... (error handling for url/prompt)

    try {  
        cookieJar \= await loadCookieJar();  
        client.defaults.jar \= cookieJar;

        const manifest \= await fetchManifest(url);

        // Get the full plan ONCE at the beginning.  
        // We can pass an initial state if we have one.  
        const executionPlan \= await createExecutionPlan(manifest, prompt, null);

        let currentState: AuraState | null \= null;  
        const allResults: any\[\] \= \[\];

        for (let i \= 0; i \< executionPlan.length; i++) {  
            const step \= executionPlan\[i\];  
            const { capabilityId, args } \= step;

            console.log(\`\\n--- Step ${i \+ 1}/${executionPlan.length}: Executing "${capabilityId}" \---\`);

            // No need to plan again, just execute\!  
            const result \= await executeAction(url, manifest, capabilityId, args, i \+ 1, executionPlan.length);

            // ... (rest of the loop for handling results and state remains the same)  
            currentState \= result.state;  
            if (result.status \>= 400\) {  
              // ... (handle failure and break loop)  
            }  
        }

        // ... (final summary logic)

    } catch (error) {  
        console.error("\\n❌ An error occurred:", (error as Error).message);  
    }  
}

By following these two major refactoring steps, your AURA agent will become stateful, robust, and significantly more capable of handling real-world, multi-step tasks.