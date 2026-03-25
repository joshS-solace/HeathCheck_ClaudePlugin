#!/usr/bin/env python3
"""
handle_gather_diagnostics.py
Decrypts (.tgz.p7m) and/or extracts (.tgz) gather-diagnostics files.

Accepts bare folder names, .tgz, .tgz.p7m, or .tgz.p7m.tgz as input.
For each input, if the exact path doesn't exist the script tries all
permutations automatically.

Processing is two-phase:
  1. Decrypt  — all encrypted files (.tgz.p7m, or .tgz.p7m.tgz after unwrapping)
               run sequentially so the Microsoft auth prompt appears once and
               credentials are cached for subsequent files.
  2. Extract  — all unencrypted archives (.tgz / .tar.gz / .tar) are extracted.

Usage:
    python handle_gather_diagnostics.py <name> [name2] ...

Requires:
    - decrypt-cms.exe  (place in same directory as this script)
    - Vault/Microsoft SSO credentials (authenticated via device code flow on first use)
"""

import os
import subprocess
import sys
import tarfile
from pathlib import Path
from tkinter import Tk
from tkinter.filedialog import askopenfilenames

SCRIPT_DIR       = Path(__file__).parent
DECRYPT_CMS      = SCRIPT_DIR / "decrypt-cms.exe"
PROGRAM_DATA_DIR = SCRIPT_DIR.parent / "program_data"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def strip_extensions(p: Path) -> Path:
    """Return base path with any .p7m / .tgz / .tar.gz / .tar suffix stripped."""
    name = p.name
    if name.endswith(".p7m"):
        name = name[:-4]
    if ".tgz" in name or ".tar.gz" in name:
        name = name[: name.find(".t")]
    elif name.endswith(".tar"):
        name = name[:-4]
    return p.parent / name


def resolve(arg: str):
    """
    Given an input string, find what actually exists.
    Returns (path, kind) where kind is 'folder', 'tgz', or 'p7m'.
    Returns (None, None) if nothing is found.
    """
    p       = Path(arg)
    base    = strip_extensions(p)
    tgz     = Path(str(base) + ".tgz")
    tar_gz  = Path(str(base) + ".tar.gz")
    tar     = Path(str(base) + ".tar")
    p7m     = Path(str(base) + ".tgz.p7m")
    p7m_tgz = Path(str(base) + ".tgz.p7m.tgz")

    # Also try appending .p7m to the exact input — handles "file.tgz (1)" → "file.tgz (1).p7m"
    p_p7m = Path(str(p) + ".p7m")
    candidates = [p, p_p7m, base, tgz, tar_gz, tar, p7m, p7m_tgz]
    for candidate in candidates:
        if candidate.is_dir():
            return candidate, "folder"
        if candidate.exists():
            if candidate.name.endswith(".p7m"):
                return candidate, "p7m"
            if candidate.name.endswith(".tgz") or candidate.name.endswith(".tar.gz") or candidate.name.endswith(".tar"):
                return candidate, "tgz"

    return None, None


# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

def decrypt(p7m_path: Path) -> Path:
    """Decrypt a .tgz.p7m file to .tgz using decrypt-cms.exe."""
    if not DECRYPT_CMS.exists():
        print(f"  [ERROR] decrypt-cms.exe not found at:\n         {DECRYPT_CMS}")
        sys.exit(1)

    tgz_path = p7m_path.parent / p7m_path.name[:-4]  # strip .p7m
    auth_url_file = PROGRAM_DATA_DIR / "auth_url.txt"
    PROGRAM_DATA_DIR.mkdir(exist_ok=True)

    proc = subprocess.Popen(
        [str(DECRYPT_CMS), str(p7m_path), str(tgz_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    with open(auth_url_file, "w") as auth_f:
        for line in proc.stdout:
            print(line, end="", flush=True)
            if "https://" in line or "enter the code" in line.lower():
                auth_f.write(line)
                auth_f.flush()

    proc.wait()

    if proc.returncode != 0:
        sys.exit(1)

    return tgz_path


def extract(tgz_path: Path) -> Path:
    """Extract a .tgz, .tar.gz, or .tar archive into its parent directory."""
    dest = tgz_path.parent

    try:
        with tarfile.open(tgz_path, "r:*") as tar:
            top_names = {m.name.split("/")[0] for m in tar.getmembers() if m.name and m.name != "."}
            tar.extractall(dest)
    except Exception as e:
        print(f"[ERROR] Extraction failed: {e}")
        sys.exit(1)

    # Prefer exact strip_extensions match (common case)
    expected = strip_extensions(tgz_path)
    if expected.exists():
        return expected

    # Fall back to inspecting what was actually at the top level of the archive
    top_items = [dest / name for name in top_names if (dest / name).exists()]
    if len(top_items) == 1:
        return top_items[0]

    # Multiple or unknown top-level items — return dest as container
    return dest


# ---------------------------------------------------------------------------
# Two-phase processing
# ---------------------------------------------------------------------------

def sort_inputs(args: list[str]):
    """
    Resolve each argument and sort into encrypted / unencrypted lists.

    encrypted   — list of (path, kind): items whose name contains '.p7m'
    unencrypted — list of (path, kind): folders or plain archives
    errors      — list of arg strings that could not be resolved
    """
    encrypted   = []
    unencrypted = []
    errors      = []

    for arg in args:
        path, kind = resolve(arg)
        if path is None:
            errors.append(arg)
            continue
        if kind == "folder":
            unencrypted.append((path, "folder"))
        elif ".p7m" in path.name:
            encrypted.append((path, kind))
        else:
            unencrypted.append((path, kind))

    return encrypted, unencrypted, errors


def decrypt_all(encrypted: list) -> list:
    """
    Phase 1: Decrypt every encrypted item, returning a list of .tgz Paths
    ready for extraction.

    For .tgz.p7m.tgz (kind='tgz'): unwrap the outer .tgz first to recover
    the .tgz.p7m, then decrypt.
    For .tgz.p7m (kind='p7m'): decrypt directly.

    All decryptions run in the same process so decrypt-cms.exe only asks for
    Microsoft authentication once; subsequent files use cached credentials.
    """
    tgz_paths    = []
    intermediates = set()  # temp files created here; removed after use

    for path, kind in encrypted:
        p7m_path = path

        if kind == "tgz":
            # Outer .tgz wraps a .tgz.p7m — unwrap it first (no auth needed)
            print(f"Unwrapping {path.name}...")
            inner = extract(path)
            if not inner.name.endswith(".p7m"):
                print(f"[ERROR] Expected .tgz.p7m after unwrapping {path.name}, got {inner.name}")
                continue
            p7m_path = inner
            intermediates.add(inner)

        # Decrypt .tgz.p7m → .tgz
        tgz_path = p7m_path.parent / p7m_path.name[:-4]  # strip .p7m
        if not tgz_path.exists():
            print(f"Decrypting {p7m_path.name}...")
            decrypt(p7m_path)

        # Clean up the intermediate .tgz.p7m if it was unwrapped from an outer .tgz
        if p7m_path in intermediates:
            p7m_path.unlink(missing_ok=True)
            intermediates.discard(p7m_path)

        tgz_paths.append(tgz_path)

    return tgz_paths


def extract_all(unencrypted: list) -> list[str]:
    """
    Phase 2: Extract every unencrypted item, returning a list of folder names.
    Skips items that are already extracted folders.
    """
    results = []

    for path, kind in unencrypted:
        if kind == "folder":
            results.append(path.name)
            continue

        # Check if already extracted
        expected = strip_extensions(path)
        if expected.is_dir():
            results.append(expected.name)
            continue

        extracted = extract(path)
        if extracted.is_dir():
            results.append(extracted.name)
        else:
            print(f"[WARNING] Could not determine extracted folder for {path.name}")

    return results


# ---------------------------------------------------------------------------
# Discovery / UI helpers
# ---------------------------------------------------------------------------

def auto_discover_gd(search_dir: Path) -> list[str]:
    """
    Auto-discover gather-diagnostics artifacts in a directory.
    Priority order: .tgz.p7m.tgz > .tgz.p7m > .tgz / .tar.gz / .tar > folder.
    Returns a deduplicated list (one entry per base name, most-raw form wins).
    """
    candidates = {}  # base_name -> (priority, path)
    for p in search_dir.glob("gather-diagnostics*.tgz.p7m.tgz"):
        base = strip_extensions(p).name
        candidates[base] = (0, str(p))
    for p in search_dir.glob("gather-diagnostics*.tgz.p7m"):
        base = strip_extensions(p).name
        if base not in candidates:
            candidates[base] = (1, str(p))
    for p in search_dir.glob("gather-diagnostics*.tgz"):
        base = strip_extensions(p).name
        if base not in candidates:
            candidates[base] = (2, str(p))
    for p in search_dir.glob("gather-diagnostics*.tar.gz"):
        base = strip_extensions(p).name
        if base not in candidates:
            candidates[base] = (2, str(p))
    for p in search_dir.glob("gather-diagnostics*.tar"):
        if not p.name.endswith(".tar.gz"):
            base = strip_extensions(p).name
            if base not in candidates:
                candidates[base] = (2, str(p))
    for p in search_dir.iterdir():
        if p.is_dir() and p.name.startswith("gather-diagnostics"):
            base = strip_extensions(p).name
            if base not in candidates:
                candidates[base] = (3, str(p))
    return [path for _, (_, path) in sorted(candidates.items())]


def pick_files() -> list[str]:
    """Open a file picker dialog and return selected file paths."""
    root = Tk()
    root.withdraw()
    files = askopenfilenames(
        title="Select gather-diagnostics files",
        initialdir=os.getcwd(),
        filetypes=[("All files", "*.*")]
    )
    root.destroy()
    return list(files)


def clear_data_dir():
    """Delete all files in the data/ directory next to this script."""
    data_dir = SCRIPT_DIR / "data"
    if data_dir.is_dir():
        for f in data_dir.iterdir():
            if f.is_file():
                f.unlink()


def recombine_args(raw: list[str]) -> list[str]:
    """
    Recombine filename parts that were split by the shell on spaces.
    e.g. ['file.tgz', '(1)', 'other.tgz', '(1)'] -> ['file.tgz (1)', 'other.tgz (1)']
    Handles bare '(N)' or '(N).p7m' suffixes appended by Windows when downloading
    duplicate files.
    """
    import re
    result = []
    for arg in raw:
        if re.match(r'^\(\d+\)(\.\w+)*$', arg) and result:
            result[-1] = result[-1] + ' ' + arg
        else:
            result.append(arg)
    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    clear_data_dir()

    if len(sys.argv) < 2:
        args = auto_discover_gd(Path.cwd())
        if not args:
            if os.environ.get("DISPLAY") or sys.platform == "win32":
                args = pick_files()
            if not args:
                print("[ERROR] No gather-diagnostics files found in current directory.")
                print("  Provide paths as arguments, or run from a directory containing gather-diagnostics files.")
                sys.exit(1)
    else:
        args = recombine_args(sys.argv[1:])

    # Sort inputs into encrypted and unencrypted
    encrypted, unencrypted, errors = sort_inputs(args)

    # Phase 1: Decrypt (sequential — auth prompt appears once, credentials cached after)
    if encrypted:
        tgz_paths = decrypt_all(encrypted)
        for tgz_path in tgz_paths:
            unencrypted.append((tgz_path, "tgz"))
    else:
        # No encrypted files — signal immediately so the polling loop exits early
        PROGRAM_DATA_DIR.mkdir(exist_ok=True)
        (PROGRAM_DATA_DIR / "auth_url.txt").write_text("NO_AUTH_NEEDED")

    # Phase 2: Extract
    processed = extract_all(unencrypted)

    # Output
    if processed:
        print("\nExtracted:")
        for name in processed:
            print(f"  {name}")

    for arg in errors:
        print(f"\n[ERROR] Not found: {arg}")


if __name__ == "__main__":
    main()
