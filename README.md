# Solace Appliance Health Check

## Project Structure

```
health-check-with-ui/
  back-end/    ← Python backend (health check engine + FastAPI server)
  front-end/   ← React/TypeScript UI (Vite + Tailwind)
  start-all.sh ← Launches both servers
```

## Quick Start (Full UI)

Run everything from the **project root** (`health-check-with-ui/`):

```bash
# 1. Install backend dependencies (first time only)
cd back-end && pip install -r requirements.txt && cd ..

# 2. Install frontend dependencies (first time only)
cd front-end && npm install && cd ..

# 3. Start both servers
./start-all.sh
```

- Backend API: http://localhost:8000
- Frontend UI: http://localhost:3000

## Running the Backend Only (CLI / no UI)

```bash
cd back-end

# Full orchestrated workflow (file picker if no args)
python run_health_check_application.py [gd-folder ...]

# Individual steps
python handle_gather_diagnostics.py <gd-file-or-folder> [...]
python establish_context.py <gd-folder> [gd-folder2 ...]
python health_check.py <gd-folder>

# Or use the plugin commands inside Claude Code
/health-check:initialize <gd1> <gd2>
/health-check:analyze <router-name>
```

---

## Atlassian MCP (Confluence Search)

The project includes a `.mcp.json` that configures the [Atlassian MCP server](https://mcp.atlassian.com) for Claude Code. This enables Claude to search Confluence directly using natural language rather than raw API calls.

### First-time setup

1. Open Claude Code in this project directory
2. Run `/mcp` inside Claude Code
3. Select **atlassian** and choose **Authenticate**
4. Complete the OAuth login in your browser — you'll be redirected back automatically

### Verify it's connected

```bash
claude mcp list
```

Once authenticated, Claude can search Confluence natively during health check analysis (e.g. looking up KBAs for FAIL results).
