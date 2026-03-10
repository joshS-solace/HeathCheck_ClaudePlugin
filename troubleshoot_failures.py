#!/usr/bin/env python3
"""
troubleshoot_failures.py
Reads health_check_results.json, prints troubleshooting context for each FAIL
section, then launches an interactive LLM chat session for follow-up questions.

Usage:
    python troubleshoot_failures.py [gather-diagnostics-folder ...]

Folders are optional — if omitted, they are auto-discovered from
router_context.json (if present). The chat session uses tools to search
cli-diagnostics.txt and log files on demand rather than pre-loading them.
"""

import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
RESULTS_FILE = SCRIPT_DIR / "data" / "health_check_results.json"
ROUTER_CONTEXT_FILE = SCRIPT_DIR / "data" / "router_context.json"
CHAT_MODEL = "anthropic/claude-sonnet-4-6"


def clean_message(msg):
    """Strip log source suffix like '(source: event.log.1)'."""
    return re.sub(r"\s*\(source:[^)]+\)", "", msg).strip()


APPLIANCE_FAILS_FILE = SCRIPT_DIR / "data" / "appliance_fails.json"


def build_fails_json(data):
    fails = [r for r in data["results"] if r["status"] == "FAIL"]
    output = []
    for result in fails:
        section = result["section"]
        entry = {"section": section, "description": result["description"], "failures": []}

        if section in ("1.1", "1.2"):
            for failure in result["failures"]:
                entry["failures"].append({"message": clean_message(failure["message"])})
            output.append(entry)
            continue

        for ctx in result.get("troubleshooting_context", []):
            matches = ctx.get("matches", [])
            correlated = ctx.get("correlated", [])
            if not matches and not correlated:
                continue
            ctx_entry = {"description": ctx["description"], "matches": [], "correlated": []}
            for m in matches:
                ctx_entry["matches"].append({
                    "source": m["source"],
                    "timestamp": m["timestamp"],
                    "message": m.get("message", m["line"]),
                })
            for m in correlated:
                ctx_entry["correlated"].append({
                    "source": m["source"],
                    "timestamp": m["timestamp"],
                    "message": m.get("message", m["line"]),
                })
            entry.setdefault("troubleshooting_context", []).append(ctx_entry)

        seen = set()
        for failure in result["failures"]:
            msg = clean_message(failure["message"])
            if msg in seen:
                continue
            seen.add(msg)
            fail_entry = {"message": msg, "matches": []}
            for m in failure.get("matches", []):
                fail_entry["matches"].append({
                    "source": m["source"],
                    "timestamp": m["timestamp"],
                    "message": m.get("message", m["line"]),
                })
            entry["failures"].append(fail_entry)

        output.append(entry)
    return output


def print_report(data):
    fails = [r for r in data["results"] if r["status"] == "FAIL"]
    if not fails:
        print("No FAILs found.")
        return

    print("=== Health Check Troubleshoot Report ===\n")

    for result in fails:
        section = result["section"]
        description = result["description"]
        print(f"[{section}] FAIL — {description}")

        if section in ("1.1", "1.2"):
            for failure in result["failures"]:
                print(f"  → Upgrade recommended: {clean_message(failure['message'])}")
            print()
            continue

        for ctx in result.get("troubleshooting_context", []):
            matches = ctx.get("matches", [])
            correlated = ctx.get("correlated", [])
            if not matches and not correlated:
                continue
            print(f"  [{ctx['description']}]")
            for m in matches:
                print(f"    [GREP MATCH] Source: {m['source']} | Time: {m['timestamp']} {m.get('message', m['line'])}")
            if correlated:
                print(f"    [CORRELATED EVENTS]")
                for m in correlated:
                    print(f"    [GREP MATCH] Source: {m['source']} | Time: {m['timestamp']} {m.get('message', m['line'])}")

        seen = set()
        for failure in result["failures"]:
            msg = clean_message(failure["message"])
            if msg in seen:
                continue
            seen.add(msg)
            print(f"  [FAIL] {msg}")
            for m in failure.get("matches", []):
                print(f"    [GREP MATCH] Source: {m['source']} | Time: {m['timestamp']} {m.get('message', m['line'])}")

        print()


def resolve_folders(cli_args):
    """Return folder Paths from CLI args, or auto-discover from router_context.json."""
    if cli_args:
        return [Path(a) for a in cli_args]

    rc_path = Path(ROUTER_CONTEXT_FILE)
    if not rc_path.exists():
        return []

    with open(rc_path) as f:
        rc = json.load(f)

    folders = []
    for ctx in rc:
        candidate = Path(ctx.get("full_path") or ctx.get("folder", ""))
        if candidate.exists() and candidate.is_dir():
            folders.append(candidate)
    return folders



def build_system_prompt(health_data, router_ctx, rules):
    parts = [
        "You are a Solace appliance health check assistant. You have been given "
        "health check results from one or more Solace appliances. Answer questions "
        "concisely and technically. Quote relevant output lines when helpful. "
        "Use the search_diagnostics tool to look up specific CLI command output, "
        "and search_logs to investigate log events. "
        "Do not use markdown formatting — no bold, no headers, no bullet asterisks, "
        "no backtick code fences. Plain text only.",
    ]

    if rules.get("healthcheck"):
        parts += [
            "",
            "## healthcheck_rules.yaml",
            "This file defines every health check section. The health_check_results.json "
            "was generated by running these rules against the appliance diagnostics.",
            rules["healthcheck"],
        ]

    if rules.get("troubleshooting"):
        parts += [
            "",
            "## further_troubleshooting_rules.yaml",
            "This file defines the log grep steps run on each FAIL. The troubleshooting_context "
            "entries in health_check_results.json were generated by these rules.",
            rules["troubleshooting"],
        ]

    parts += [
        "",
        "## Health Check Results",
        json.dumps(health_data, indent=2),
    ]

    if router_ctx:
        parts += [
            "",
            "## Router Context",
            json.dumps(router_ctx, indent=2),
        ]

    return "\n".join(parts)


def discover_log_files(folders):
    """Return {display_name: path} for all log files across folders."""
    log_files = {}
    log_names = ["command.log", "debug.log", "event.log", "system.log"]
    for folder in folders:
        log_dir = folder / "usr" / "sw" / "jail" / "logs"
        if not log_dir.exists():
            continue
        for name in log_names:
            base = log_dir / name
            if base.exists():
                log_files[f"{folder.name}/{name}"] = base
            for p in sorted(log_dir.glob(f"{name}.*")):
                if re.search(r"\.log\.\d+$", p.name):
                    log_files[f"{folder.name}/{p.name}"] = p
    return log_files


def run_chat(health_data, router_ctx, folders, rules):
    try:
        import anthropic as _anthropic
    except ImportError:
        print("\n[INFO] anthropic package not available — skipping chat.")
        print("  pip install anthropic")
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        try:
            import llm as _llm
            api_key = _llm.get_key("anthropic")
        except Exception:
            pass

    if not api_key:
        print("\n[ERROR] No Anthropic API key found.")
        print("  Set env var : ANTHROPIC_API_KEY=sk-...")
        print("  Or via llm  : llm keys set anthropic")
        return

    client = _anthropic.Anthropic(api_key=api_key)
    model_id = CHAT_MODEL.split("/")[-1]

    log_files = discover_log_files(folders)

    diag_files = {}
    for folder in folders:
        diag_path = folder / "cli-diagnostics.txt"
        if not diag_path.exists():
            diag_path = folder / folder.name / "cli-diagnostics.txt"
        if diag_path.exists():
            diag_files[folder.name] = diag_path

    def _extract_command_section(text: str, command: str) -> str:
        lines = text.splitlines()
        command_lower = command.lower().strip()
        start = None
        for i, line in enumerate(lines):
            stripped = line.strip().lstrip("#").strip()
            if stripped.lower() == command_lower or command_lower in stripped.lower():
                start = i + 1
                break
        if start is None:
            return f"Command '{command}' not found in diagnostics."
        result = []
        for line in lines[start:]:
            stripped = line.strip()
            if stripped.startswith("#") or (len(stripped) > 4 and all(c in "=-" for c in stripped)):
                if result:
                    break
            result.append(line)
        while result and not result[0].strip():
            result.pop(0)
        while result and not result[-1].strip():
            result.pop()
        return "\n".join(result) if result else f"Command '{command}' found but output is empty."

    def search_diagnostics(command: str = "", pattern: str = "", folder: str = "", max_lines: int = 100) -> str:
        results = []
        for fname, path in diag_files.items():
            if folder and folder.lower() not in fname.lower():
                continue
            try:
                with open(path, "r", errors="replace") as f:
                    text = f.read()
            except Exception as e:
                results.append(f"[ERROR reading {fname}] {e}")
                continue
            content = _extract_command_section(text, command) if command else text
            if pattern:
                lines = [l for l in content.splitlines() if re.search(pattern, l, re.IGNORECASE)]
                content = "\n".join(lines[:max_lines])
            else:
                lines = content.splitlines()
                if len(lines) > max_lines:
                    content = "\n".join(lines[:max_lines]) + f"\n... ({len(lines) - max_lines} more lines truncated)"
            if content:
                results.append(f"[{fname}]\n{content}")
        return "\n\n".join(results) if results else "No results found."

    def search_logs(pattern: str, source: str = "", max_lines: int = 50) -> str:
        results = []
        for filename, path in log_files.items():
            if source and source.lower() not in filename.lower():
                continue
            try:
                with open(path, "r", errors="replace") as f:
                    for line in f:
                        if re.search(pattern, line, re.IGNORECASE):
                            results.append(f"[{filename}] {line.rstrip()}")
                            if len(results) >= max_lines:
                                break
            except Exception as e:
                results.append(f"[ERROR reading {filename}] {e}")
            if len(results) >= max_lines:
                break
        return "\n".join(results) if results else "No matches found."

    available_diags = ", ".join(diag_files.keys()) or "none discovered"
    available_logs = ", ".join(log_files.keys()) or "none discovered"
    tools = [
        {
            "name": "search_diagnostics",
            "description": (
                "Extract the output of a specific CLI command from cli-diagnostics.txt, "
                "optionally filtered by a regex pattern. Use this to look up show command "
                "output such as 'show redundancy', 'show hardware detail', 'show version', etc. "
                f"Available diagnostics files: {available_diags}"
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "CLI command name to extract e.g. 'show redundancy'. Leave empty to search all content.",
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Optional regex to filter lines within the extracted output.",
                    },
                    "folder": {
                        "type": "string",
                        "description": "Filter to a specific folder/router name. Leave empty for all.",
                    },
                    "max_lines": {
                        "type": "integer",
                        "description": "Maximum lines to return (default 100).",
                    },
                },
                "required": [],
            },
        },
        {
            "name": "search_logs",
            "description": (
                "Search log files for a regex pattern. Returns matching lines with "
                "their source filename and full line content. "
                f"Available logs: {available_logs}"
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern to search for (case-insensitive)",
                    },
                    "source": {
                        "type": "string",
                        "description": "Filter to a specific log filename e.g. 'event.log'. Leave empty to search all logs.",
                    },
                    "max_lines": {
                        "type": "integer",
                        "description": "Maximum matching lines to return (default 50)",
                    },
                },
                "required": ["pattern"],
            },
        }
    ]

    system_prompt = build_system_prompt(health_data, router_ctx, rules)
    diag_summary = f"{len(diag_files)} file(s)" if diag_files else "none discovered"
    log_summary = f"{len(log_files)} file(s)" if log_files else "none discovered"

    print("\n" + "=" * 50)
    print(f"Health Check Assistant  [{model_id}]")
    print(f"Diagnostics tool   : {diag_summary}")
    print(f"Log search tool    : {log_summary}")
    print("Type 'exit' or 'quit' to end.")
    print("=" * 50)

    messages = []
    while True:
        try:
            user_input = input("\n> ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            break

        messages.append({"role": "user", "content": user_input})
        try:
            while True:
                response = client.messages.create(
                    model=model_id,
                    max_tokens=4096,
                    system=system_prompt,
                    tools=tools,
                    messages=messages,
                )
                messages.append({"role": "assistant", "content": response.content})

                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            if block.name == "search_diagnostics":
                                label = block.input.get("command") or block.input.get("pattern") or "diagnostics"
                                print(f"\n[querying diagnostics: {label}]", flush=True)
                                result = search_diagnostics(**block.input)
                            elif block.name == "search_logs":
                                print(f"\n[searching logs: {block.input.get('pattern', '')}]", flush=True)
                                result = search_logs(**block.input)
                            else:
                                result = f"Unknown tool: {block.name}"
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            })
                    messages.append({"role": "user", "content": tool_results})
                else:
                    for block in response.content:
                        if hasattr(block, "text"):
                            print(f"\n{block.text}")
                    break
        except Exception as e:
            print(f"\n[ERROR] {e}")
            # Drop the failed user message to keep conversation state clean
            if messages and messages[-1]["role"] == "user" and messages[-1]["content"] == user_input:
                messages.pop()


def run_for_folder(folders: list[Path]):
    """Print troubleshoot report and launch chat session for the given folders."""
    if not os.path.exists(RESULTS_FILE):
        print(f"[ERROR] {RESULTS_FILE} not found. Run health_check.py first.")
        return

    with open(RESULTS_FILE) as f:
        health_data = json.load(f)

    print_report(health_data)

    fails_json = build_fails_json(health_data)
    with open(APPLIANCE_FAILS_FILE, "w") as f:
        json.dump(fails_json, f, indent=2)
    print(f"[INFO] Fails written to {APPLIANCE_FAILS_FILE}\n")

    router_ctx = None
    if os.path.exists(ROUTER_CONTEXT_FILE):
        with open(ROUTER_CONTEXT_FILE) as f:
            router_ctx = json.load(f)

    script_dir = Path(__file__).parent
    rules = {}
    for key, filename in [("healthcheck", "rules/healthcheck_rules.yaml"),
                           ("troubleshooting", "rules/further_troubleshooting_rules.yaml")]:
        p = script_dir / filename
        if p.exists():
            with open(p, "r", errors="replace") as f:
                rules[key] = f.read()

    run_chat(health_data, router_ctx, folders, rules)


def main():
    if not os.path.exists(RESULTS_FILE):
        print(f"[ERROR] {RESULTS_FILE} not found. Run health_check.py first.")
        sys.exit(1)

    folders = resolve_folders(sys.argv[1:])
    run_for_folder(folders)


if __name__ == "__main__":
    main()
