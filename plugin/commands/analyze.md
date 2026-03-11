---
description: Run health checks on one or more appliances by router name. Usage - /support-health-check:analyze <router-name> <router-name2> ...
---
Run health checks for the following router names: $ARGUMENTS

Steps:
1. Read `data/router_context.json`. If $ARGUMENTS is `all` (or empty), use every router in the file. Otherwise find the `full_path` for each named router; warn and skip any name not found. Use Glob to find `health_check.py` in the workspace — this gives its absolute path. Call its directory `<project_root>`.
2. For each matched router, run the full pipeline. You may run multiple routers in parallel since each writes its own results file:
   a. Run `python <project_root>/health_check.py <full_path> --router-name <router_name>`, then read `<project_root>/data/health_check_output_<router_name>.txt`. Display the result using this format:
      - Print the router name as a bold header (e.g. `**FFGCGEMEASOLAPL01P**`)
      - Under it, list every `[INFO]`, `[WARNING]`, `[FAIL]`, and `[GREP MATCH]` line from the file — indented, flat (no section headers)
      - Deduplicate: if an identical line appears in both the health check section and the troubleshoot report section, only show it once
      - Skip all lines from `[Section 1.1]` and `[Section 1.2]` blocks, and from `[1.1]`/`[1.2]` blocks in the troubleshoot report
      - Skip section header lines (`[Section X]`), report header lines (`=== Health Check Troubleshoot Report ===`), `Results written to`, `[INFO] Fails written to`, and `Health check completed...` lines
      - If there are no non-1.1/1.2 `[FAIL]` or `[WARNING]` lines, output only: `**<router_name>**` then `  [INFO] Appliance is Healthy`
   b. Read `data/health_check_results_<router_name>.json` and note whether any entry has `"status": "FAIL"` outside of sections 1.1 and 1.2 (for deciding which FAILs to search Confluence for).
3. If no router names matched, list the available router names from `router_context.json` and ask the user to try again.
4. After all health check outputs, search Confluence via the Atlassian MCP for KBAs matching each non-1.1/1.2 FAIL. Use the `mcp__atlassian__search` tool (Rovo Search) with a natural language query describing the failure — this gives better results than CQL. For each result, fetch the page content with `mcp__atlassian__getConfluencePage` and include the page title, URL, and the relevant troubleshooting steps in your response. **Skip sections 1.1 and 1.2 entirely — do not output anything about them.**

   **If the Confluence search fails or returns an auth error**, tell the user:
   > The Atlassian MCP is not authenticated. To enable Confluence search:
   > 1. Run `/mcp` inside Claude Code
   > 2. Select **atlassian** and choose **Authenticate**
   > 3. Complete the OAuth login in your browser
   > 4. Re-run `/support-health-check:analyze` once authenticated
