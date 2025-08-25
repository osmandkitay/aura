# MCP-AURA Testing Guide

This guide shows how to test the mcp-aura package functionality using the test agent.

## Prerequisites

1. **AURA Reference Server Running:**
   ```bash
   # From the project root
   pnpm --filter aura-reference-server dev
   ```
   Server should be accessible at http://localhost:3000

2. **MCP-AURA Package Built:**
   ```bash
   # From packages/mcp-aura directory
   pnpm build
   ```

## Running the Test Agent

The test agent implements all scenarios from `step.md` to validate mcp-aura functionality:

```bash
# From packages/mcp-aura directory
pnpm test:agent

# Or directly:
node test-agent.js
```

## Test Scenarios

### Scenario A: Happy Path
- ✅ User Authentication (login with demo@aura.dev / password123)
- ✅ Get Profile Information (protected resource access)
- ✅ Create Post (write operation)

### Scenario B: Failure Path
- ❌ Unauthorized Access (without login)
- ❌ Non-Existent Capability (buy_laptop - not in manifest)
- ❌ Insufficient Arguments (login without credentials)

### Scenario C: Edge Cases
- 🔄 Semantic Equivalence (multiple ways to say "logout")
- 🔄 Disordered Arguments (args in different order)

## Expected Output

The test agent will:
1. Check if AURA server is running
2. Retrieve site information and available capabilities
3. Run all test scenarios with colored output:
   - ✅ Green: Successful tests
   - ❌ Red: Failed tests (some failures are expected!)
   - ⚠️ Yellow: Warnings
   - ℹ️ Blue: Information

## What Success Looks Like

- **Server Connection**: ✅ AURA server responds to manifest requests
- **Site Info**: ✅ Can retrieve site capabilities and manifest
- **Happy Path**: ✅ All authentication and CRUD operations work
- **Failure Path**: ❌ Failures are handled gracefully with proper error messages
- **Edge Cases**: ✅ Various input formats work correctly

## Troubleshooting

### "Cannot connect to AURA server"
- Make sure reference-server is running: `pnpm --filter reference-server dev`
- Check that http://localhost:3000 is accessible

### "Failed to load site manifest"
- Verify the AURA server has the correct manifest endpoint
- Check server logs for errors

### Import/Module Errors
- Run `pnpm build` to compile TypeScript to JavaScript
- Ensure all dependencies are installed: `pnpm install`

## Next Steps

Once basic tests pass, you can:
1. Integrate with an LLM (Ollama/Gemma3) for natural language processing
2. Add more complex test scenarios
3. Test with real user interactions via chat interface

The test agent validates that mcp-aura can correctly:
- Connect to AURA-enabled sites
- Execute capabilities with proper arguments
- Handle errors gracefully
- Maintain session state
- Validate capability existence before execution
