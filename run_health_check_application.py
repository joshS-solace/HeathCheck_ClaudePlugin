#!/usr/bin/env python3
"""
run_health_check_application.py
Main entry point for the Solace Appliance Health Check workflow.

Flow:
  1. Select and extract gather-diagnostics files (file picker or CLI args)
  2. Establish broker context for all appliances
  3. User selects which appliances to health-check  [manual step]
  4. Run health checks on selected appliances
  5. Automatically troubleshoot any that failed

Usage:
    python run_health_check_application.py                          # file picker
    python run_health_check_application.py <gd-folder> [gd2 ...]   # CLI args
"""

import json
import sys
from pathlib import Path

import establish_context as ec
import handle_gather_diagnostics as hgd
import health_check as hc
import troubleshoot_failures as tf

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"


# ---------------------------------------------------------------------------
# Step 1 — Extract / decrypt gather-diagnostics files
# ---------------------------------------------------------------------------

def step1_extract(args: list[str]) -> list[Path]:
    """
    Decrypt/extract gather-diagnostics files.
    Uses a file picker when no args are given.
    Returns a list of resolved folder Paths.
    """
    if not args:
        args = hgd.pick_files()
        if not args:
            return []

    folders = []
    for arg in args:
        folder_name = hgd.handle(arg)
        if folder_name is None:
            print(f"[ERROR] Could not process: {arg}")
            continue
        # Extracted folder lives next to the input file (or is the input itself)
        for candidate in [Path(arg).parent / folder_name, Path(folder_name)]:
            if candidate.exists() and candidate.is_dir():
                folders.append(candidate.resolve())
                break
        else:
            print(f"[WARNING] Could not locate extracted folder: {folder_name}")
    return folders


# ---------------------------------------------------------------------------
# Step 2 — Establish context
# ---------------------------------------------------------------------------

def step2_establish_context(folders: list[Path]) -> list[dict]:
    """
    Run establish_context across all folders, print broker summaries,
    and write router_context.json (and pair validation files).
    Returns the list of context dicts.
    """
    print("=" * 50)
    print("Solace Broker Context")
    print("=" * 50)

    contexts = []
    for folder in folders:
        try:
            ctx = ec.extract_context(folder)
        except FileNotFoundError as e:
            print(f"[ERROR] {e}")
            continue
        contexts.append(ctx)

    if not contexts:
        return []

    # Resolve _down replication sites now that all contexts are built
    for ctx in contexts:
        if ctx.get("replication_site") == "_down":
            mate_name = ctx.get("replication_mate", "")
            mate_ctx = next((c for c in contexts if c["router_name"] == mate_name), None)
            mate_site = mate_ctx.get("replication_site", "") if mate_ctx else ""
            if mate_site.startswith("Active"):
                ctx["replication_site"] = "Standby (Down)"
            elif mate_site in ("Backup", "Standby (Down)") or mate_site.startswith("Backup"):
                ctx["replication_site"] = "Active (Down)"
            else:
                ctx["replication_site"] = "Down"

    for i, ctx in enumerate(contexts, 1):
        label = f"Broker {i}" if len(contexts) > 1 else ""
        ec.print_context(ctx, label)

    repl_pairs = ec.validate_replication_pairs(contexts)
    ha_pairs = ec.validate_ha_pairs(contexts)

    DATA_DIR.mkdir(exist_ok=True)

    ctx_path = DATA_DIR / "router_context.json"
    with open(ctx_path, "w") as f:
        json.dump(contexts, f, indent=2)
    print(f"\nContext written to {ctx_path}")

    if repl_pairs:
        p = DATA_DIR / "replication_pair_validation.json"
        with open(p, "w") as f:
            json.dump(repl_pairs, f, indent=2)
        print(f"Replication pairs written to {p}")

    if ha_pairs:
        p = DATA_DIR / "HA_pair_validation.json"
        with open(p, "w") as f:
            json.dump(ha_pairs, f, indent=2)
        print(f"HA pairs written to {p}")

    return contexts


# ---------------------------------------------------------------------------
# Step 3 — Appliance selection  (manual step)
# ---------------------------------------------------------------------------

def step3_select_appliances(contexts: list[dict]) -> list[dict]:
    """
    Print the broker list and prompt the user to choose which appliances
    to run health checks on. Returns the selected context dicts.
    """
    print("\n" + "=" * 50)
    print("Select Appliances for Health Check")
    print("=" * 50)

    for i, ctx in enumerate(contexts, 1):
        standalone = " (standalone)" if ctx.get("standalone") else ""
        print(f"  {i}. {ctx['router_name']}{standalone}  [{ctx['folder']}]")

    print("\nEnter numbers (e.g. 1,2) or 'all':")

    while True:
        try:
            raw = input("> ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            return []

        if not raw:
            continue
        if raw.lower() == "all":
            return list(contexts)
        try:
            indices = [int(x.strip()) for x in raw.split(",")]
            selected = [contexts[i - 1] for i in indices if 1 <= i <= len(contexts)]
            if selected:
                return selected
            print(f"  Enter numbers between 1 and {len(contexts)}.")
        except ValueError:
            print("  Invalid input — enter numbers like 1,2 or 'all'.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]

    # ── Step 1: Extract ──────────────────────────────────────────────────────
    print("=" * 50)
    print("Gather Diagnostics")
    print("=" * 50)
    folders = step1_extract(args)
    if not folders:
        print("[ERROR] No gather-diagnostics folders to process.")
        sys.exit(1)
    print(f"\n{len(folders)} folder(s) ready.")

    # ── Step 2: Establish context ────────────────────────────────────────────
    print()
    contexts = step2_establish_context(folders)
    if not contexts:
        print("[ERROR] Could not establish context for any appliance.")
        sys.exit(1)

    # ── Step 3: Select appliances ────────────────────────────────────────────
    selected = step3_select_appliances(contexts)
    if not selected:
        print("No appliances selected.")
        sys.exit(0)

    # ── Steps 4 + 5: Health check then troubleshoot each appliance ───────────
    for ctx in selected:
        folder = Path(ctx["full_path"])
        router_name = ctx["router_name"]

        print(f"\n{'=' * 50}")
        print(f"Health Check — {router_name}")
        print("=" * 50)
        had_failures = hc.run(folder)

        if had_failures:
            print(f"\n{'=' * 50}")
            print(f"Troubleshooting — {router_name}")
            print("=" * 50)
            tf.run_for_folder([folder])


if __name__ == "__main__":
    main()
