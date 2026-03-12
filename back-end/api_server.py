#!/usr/bin/env python3
"""
FastAPI server to expose health check functionality to the React frontend.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import asyncio
import shutil
import json
import tempfile
import uuid
from typing import List, Optional
import sys
import tarfile
# Add compatibility imports before importing project modules
if sys.version_info < (3, 10):
    # Backport union types for Python 3.9
    import typing
    typing.UnionType = type(typing.Union[int, str])

import atexit

import establish_context as ec
import health_check as hc

app = FastAPI(title="Solace Health Check API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent / "uploads"
DATA_DIR = Path(__file__).parent / "data"
UPLOAD_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)


def cleanup_data_dir():
    """Delete all files in data/ — called on startup and shutdown."""
    for f in DATA_DIR.iterdir():
        if f.is_file():
            try:
                f.unlink()
            except Exception:
                pass


atexit.register(cleanup_data_dir)


def safe_extract_tar(tar_path: Path) -> Path:
    """
    Safely extract a tar or tar.gz file, handling permission errors gracefully.
    Returns the extracted folder path.
    """
    dest = tar_path.parent

    # Determine tar mode based on file extension
    name_lower = tar_path.name.lower()
    if '.tgz' in name_lower or '.tar.gz' in name_lower or '.gz' in name_lower:
        tar_mode = "r:gz"  # Gzip compressed
    elif '.tar' in name_lower:
        tar_mode = "r:"   # Uncompressed tar
    else:
        tar_mode = "r:*"  # Auto-detect

    # Get the folder name from the first member in the tar
    # This is more reliable than parsing the filename
    try:
        with tarfile.open(tar_path, tar_mode) as tar:
            members = tar.getmembers()
            if members:
                # Get the root folder from the first member
                first_path = members[0].name
                root_folder = first_path.split('/')[0] if '/' in first_path else first_path
                extracted_folder = dest / root_folder
            else:
                # Fallback to filename parsing
                folder_name = tar_path.stem
                if folder_name.endswith('.tar'):
                    folder_name = folder_name[:-4]
                extracted_folder = dest / folder_name
    except Exception as e:
        print(f"  Error reading tar members: {e}")
        # Fallback to filename parsing
        folder_name = tar_path.stem
        if folder_name.endswith('.tar'):
            folder_name = folder_name[:-4]
        extracted_folder = dest / folder_name

    # If folder already exists, just return it
    if extracted_folder.exists() and extracted_folder.is_dir():
        print(f"  ✓ Folder already exists, using: {extracted_folder.name}")
        return extracted_folder

    # Extract the tar file
    try:
        print(f"  📦 Extracting {tar_path.name} (mode: {tar_mode})...")
        extracted_count = 0
        skipped_count = 0

        with tarfile.open(tar_path, tar_mode) as tar:
            # Extract all members, ignoring permission errors
            for member in tar.getmembers():
                try:
                    tar.extract(member, dest, set_attrs=False)  # Don't set permissions
                    extracted_count += 1
                except (PermissionError, OSError, FileExistsError) as e:
                    # Skip files with errors (they may already exist)
                    skipped_count += 1
                    continue

        print(f"  ✓ Extracted {extracted_count} files to: {extracted_folder.name} (skipped {skipped_count})")
        return extracted_folder
    except Exception as e:
        print(f"  ⚠️ Extraction error: {e}")
        # Check if extraction partially succeeded
        if extracted_folder.exists() and extracted_folder.is_dir():
            print(f"  ✓ Using partially extracted folder: {extracted_folder.name}")
            return extracted_folder
        raise


@app.get("/")
def read_root():
    return {"message": "Solace Health Check API", "version": "1.0.0"}


@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """
    Upload gather-diagnostics files and extract them.
    Returns paths to extracted folders.
    """
    uploaded_paths = []

    for file in files:
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        uploaded_paths.append(str(file_path))

    return {"paths": uploaded_paths, "count": len(uploaded_paths)}


# In-memory store for decrypt subprocess sessions
decrypt_sessions: dict = {}


@app.post("/api/upload-folder")
async def upload_folder(
    files: List[UploadFile] = File(...),
    relativePaths: List[str] = Form(...)
):
    """
    Upload a pre-extracted GD folder preserving directory structure.
    Returns path to the reconstructed folder root.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    root_name = relativePaths[0].replace("\\", "/").lstrip("/").split("/")[0] if relativePaths else "uploaded_folder"

    for file, rel_path in zip(files, relativePaths):
        dest = UPLOAD_DIR / rel_path.replace("\\", "/").lstrip("/")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    folder_path = UPLOAD_DIR / root_name
    return {"paths": [str(folder_path)], "count": 1, "type": "folder"}


@app.post("/api/decrypt")
async def start_decrypt(data: dict):
    """
    Start decrypt-cms.exe on a .tgz.p7m file.
    Returns a session_id used to stream output via /api/decrypt-stream/{session_id}.
    """
    p7m_path = Path(data["p7m_path"])
    if not p7m_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {p7m_path}")

    # Output will be the .tgz (strip the trailing .p7m)
    tgz_path = p7m_path.with_suffix("") if p7m_path.suffix == ".p7m" else Path(str(p7m_path).replace(".p7m", ""))

    session_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    decrypt_sessions[session_id] = {"queue": queue, "done": False, "tgz_path": None}

    async def run_decrypt():
        decrypt_exe = Path(__file__).parent / "decrypt-cms.exe"
        if not decrypt_exe.exists():
            await queue.put({"type": "error", "line": f"decrypt-cms.exe not found at: {decrypt_exe}"})
            await queue.put(None)
            decrypt_sessions[session_id]["done"] = True
            return

        try:
            proc = await asyncio.create_subprocess_exec(
                str(decrypt_exe), str(p7m_path), str(tgz_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            async def read_pipe(stream, pipe_type: str):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="replace").rstrip()
                    if text:
                        await queue.put({"type": pipe_type, "line": text})

            await asyncio.gather(
                read_pipe(proc.stdout, "stdout"),
                read_pipe(proc.stderr, "stderr"),
            )
            await proc.wait()

            if proc.returncode == 0 and tgz_path.exists():
                decrypt_sessions[session_id]["tgz_path"] = str(tgz_path)
                # Delete the encrypted file now that we have the .tgz
                try:
                    p7m_path.unlink()
                    print(f"  🗑️  Deleted encrypted file: {p7m_path.name}")
                except Exception as del_err:
                    print(f"  ⚠️  Could not delete encrypted file: {del_err}")
                await queue.put({"type": "done", "line": "Decryption complete.", "tgz_path": str(tgz_path)})
            else:
                await queue.put({"type": "error", "line": f"Decryption failed (exit code {proc.returncode})"})
        except Exception as exc:
            await queue.put({"type": "error", "line": f"Exception: {exc}"})
        finally:
            decrypt_sessions[session_id]["done"] = True
            await queue.put(None)  # sentinel

    asyncio.create_task(run_decrypt())
    return {"session_id": session_id}


@app.get("/api/decrypt-stream/{session_id}")
async def decrypt_stream_endpoint(session_id: str):
    """SSE endpoint that streams decrypt-cms.exe stdout/stderr in real time."""
    if session_id not in decrypt_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    queue = decrypt_sessions[session_id]["queue"]

    async def generate():
        while True:
            item = await queue.get()
            if item is None:
                yield f"data: {json.dumps({'type': 'end'})}\n\n"
                break
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/local-path")
async def add_local_path(data: dict):
    """
    Validate a local filesystem path without uploading any files.
    Returns the resolved path and basic metadata so the frontend can
    add it to the upload list and later pass it to /api/initialize.
    """
    path_str = (data.get("path") or "").strip()
    if not path_str:
        raise HTTPException(status_code=400, detail="Path is required")

    p = Path(path_str)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {p}")

    resolved = p.resolve()
    name = resolved.name

    if resolved.is_dir():
        try:
            size = sum(f.stat().st_size for f in resolved.rglob("*") if f.is_file())
        except Exception:
            size = 0
        file_type = "folder"
    else:
        size = resolved.stat().st_size
        file_type = "file"

    return {"path": str(resolved), "name": name, "size": size, "type": file_type}


@app.post("/api/initialize")
async def initialize_bundles(bundle_paths: List[str]):
    """
    Extract gather-diagnostics files and establish broker context.
    Does NOT run health checks — that happens later via /api/plugin/analyze.
    """
    try:
        print(f"\n=== Initializing {len(bundle_paths)} bundle(s) ===")

        extracted_folders = []
        for idx, bundle_path in enumerate(bundle_paths, 1):
            print(f"\n--- Processing file {idx}/{len(bundle_paths)}: {bundle_path} ---")
            try:
                bundle_p = Path(bundle_path)
                if not bundle_p.is_absolute():
                    bundle_p = (Path(__file__).parent / bundle_p).resolve()

                print(f"  Resolved path: {bundle_p}")

                if bundle_p.is_dir():
                    if bundle_p.resolve() not in extracted_folders:
                        extracted_folders.append(bundle_p.resolve())
                    continue

                if not bundle_p.exists():
                    print(f"  ❌ File not found: {bundle_p}")
                    continue

                if any(ext in bundle_p.name.lower() for ext in ['.tgz', '.tar.gz', '.tar']):
                    try:
                        extracted_folder = safe_extract_tar(bundle_p)
                        resolved_path = extracted_folder.resolve()
                        if resolved_path not in extracted_folders:
                            extracted_folders.append(resolved_path)
                    except Exception as e:
                        print(f"  ❌ Extraction failed: {e}")
                        base_name = bundle_p.stem
                        if base_name.endswith('.tar'):
                            base_name = base_name[:-4]
                        for potential in [bundle_p.parent / base_name]:
                            if potential.exists() and potential.is_dir():
                                resolved_path = potential.resolve()
                                if resolved_path not in extracted_folders:
                                    extracted_folders.append(resolved_path)
                                break
            except Exception as e:
                print(f"  ❌ Error processing {bundle_path}: {e}")
                continue

        if not extracted_folders:
            raise HTTPException(status_code=400, detail="Could not extract any gather-diagnostics files")

        contexts = []
        for folder in extracted_folders:
            try:
                ctx = ec.extract_context(folder)
                contexts.append(ctx)
            except Exception as e:
                print(f"Error extracting context from {folder}: {e}")
                continue

        if not contexts:
            raise HTTPException(status_code=400, detail="Could not establish context for any appliance")

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

        repl_pairs = ec.validate_replication_pairs(contexts)
        ha_pairs = ec.validate_ha_pairs(contexts)

        DATA_DIR.mkdir(exist_ok=True)
        with open(DATA_DIR / "router_context.json", "w") as f:
            json.dump(contexts, f, indent=2)
        if repl_pairs:
            with open(DATA_DIR / "replication_pair_validation.json", "w") as f:
                json.dump(repl_pairs, f, indent=2)
        if ha_pairs:
            with open(DATA_DIR / "HA_pair_validation.json", "w") as f:
                json.dump(ha_pairs, f, indent=2)

        print(f"\n=== Context established for {len(contexts)} broker(s) ===")
        for ctx in contexts:
            print(f"  - {ctx['router_name']}")

        return {
            "router_contexts": contexts,
            "ha_pairs": ha_pairs,
            "replication_pairs": repl_pairs,
            "router_names": [ctx["router_name"] for ctx in contexts],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze")
async def analyze_bundles(bundle_paths: List[str]):
    """
    Analyze gather-diagnostics bundles.
    Returns broker context, HA pairs, replication pairs, and health check results.
    """
    try:
        print(f"\n=== Analyzing {len(bundle_paths)} bundle(s) ===")
        print(f"Paths received: {bundle_paths}")

        # Extract/decrypt gather-diagnostics files first
        extracted_folders = []
        for idx, bundle_path in enumerate(bundle_paths, 1):
            print(f"\n--- Processing file {idx}/{len(bundle_paths)}: {bundle_path} ---")
            try:
                # Make path absolute relative to script directory
                bundle_p = Path(bundle_path)
                if not bundle_p.is_absolute():
                    bundle_p = (Path.cwd() / bundle_p).resolve()

                print(f"  Resolved path: {bundle_p}")
                print(f"  File exists: {bundle_p.exists()}")

                # Check if it's already a folder
                if bundle_p.is_dir():
                    if bundle_p.resolve() not in extracted_folders:
                        print(f"  ✓ Using existing directory")
                        extracted_folders.append(bundle_p.resolve())
                    else:
                        print(f"  ⚠️ Directory already in list, skipping duplicate")
                    continue

                # Check if file exists
                if not bundle_p.exists():
                    print(f"  ❌ File not found: {bundle_p}")
                    continue

                # Check if it's a tar/tgz file
                if any(ext in bundle_p.name.lower() for ext in ['.tgz', '.tar.gz', '.tar']):
                    try:
                        # Use safe extraction method
                        print(f"  Starting extraction...")
                        extracted_folder = safe_extract_tar(bundle_p)
                        resolved_path = extracted_folder.resolve()

                        if resolved_path not in extracted_folders:
                            print(f"  ✓ Added to extraction list")
                            extracted_folders.append(resolved_path)
                        else:
                            print(f"  ⚠️ Folder already in list, skipping duplicate")
                    except Exception as e:
                        print(f"  ❌ Extraction failed: {e}")
                        # Try to find existing folder anyway
                        print(f"  Looking for existing folder...")

                        # Try multiple folder name patterns
                        base_name = bundle_p.stem
                        if base_name.endswith('.tar'):
                            base_name = base_name[:-4]

                        # Pattern 1: Full name
                        potential1 = bundle_p.parent / base_name

                        # Pattern 2: Strip leading digits
                        clean_name = base_name
                        if base_name and base_name[0].isdigit():
                            parts = base_name.split('_', 1)
                            if len(parts) > 1:
                                clean_name = parts[1]
                        potential2 = bundle_p.parent / clean_name

                        for potential in [potential1, potential2]:
                            if potential.exists() and potential.is_dir():
                                resolved_path = potential.resolve()
                                if resolved_path not in extracted_folders:
                                    print(f"  ✓ Found existing folder: {potential.name}")
                                    extracted_folders.append(resolved_path)
                                break
                else:
                    print(f"  ⚠️ Unsupported file type: {bundle_p.suffix}")
            except Exception as e:
                print(f"  ❌ Error processing {bundle_path}: {e}")
                import traceback
                traceback.print_exc()
                continue

        if not extracted_folders:
            raise HTTPException(status_code=400, detail="Could not extract any gather-diagnostics files")

        print(f"\n=== Extracted {len(extracted_folders)} folder(s) ===")
        for folder in extracted_folders:
            print(f"  - {folder}")

        # Establish context for all brokers
        contexts = []
        for folder in extracted_folders:
            try:
                ctx = ec.extract_context(folder)
                contexts.append(ctx)
            except Exception as e:
                print(f"Error extracting context from {folder}: {e}")
                continue

        if not contexts:
            raise HTTPException(status_code=400, detail="Could not establish context for any appliance")

        print(f"\n=== Established context for {len(contexts)} broker(s) ===")
        for ctx in contexts:
            print(f"  - {ctx['router_name']}")

        # Resolve replication sites
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

        # Validate pairs
        repl_pairs = ec.validate_replication_pairs(contexts)
        ha_pairs = ec.validate_ha_pairs(contexts)

        # Save context files
        with open(DATA_DIR / "router_context.json", "w") as f:
            json.dump(contexts, f, indent=2)

        if repl_pairs:
            with open(DATA_DIR / "replication_pair_validation.json", "w") as f:
                json.dump(repl_pairs, f, indent=2)

        if ha_pairs:
            with open(DATA_DIR / "HA_pair_validation.json", "w") as f:
                json.dump(ha_pairs, f, indent=2)

        # Run health checks on all contexts
        health_results = {}
        for ctx in contexts:
            folder = Path(ctx["full_path"])
            router_name = ctx["router_name"]

            # Run health check and capture results
            try:
                # Health check writes to data/health_check_results_{router_name}.json
                hc.run(folder, router_name=router_name)

                # Read the results from DATA_DIR (health check writes there with router name suffix)
                results_file = DATA_DIR / f"health_check_results_{router_name}.json"
                if results_file.exists():
                    with open(results_file) as f:
                        health_results[router_name] = json.load(f)
            except Exception as e:
                print(f"Error running health check for {router_name}: {e}")
                health_results[router_name] = {"error": str(e)}

        return {
            "router_contexts": contexts,
            "ha_pairs": ha_pairs,
            "replication_pairs": repl_pairs,
            "health_results": health_results,
            "analysis_mode": "full"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# Plugin Execution Endpoints (Claude Code CLI integration)
# ═══════════════════════════════════════════════════════════════════════════

from plugin_executor import plugin_executor

@app.post("/api/plugin/initialize")
async def plugin_initialize(bundle_paths: List[str]):
    """
    Execute /support-health-check:initialize via Claude plugin

    This runs the Claude CLI in the background with the plugin loaded,
    extracts gather-diagnostics files, and establishes broker context.

    Args:
        bundle_paths: List of absolute paths to .tgz/.tar.gz files

    Returns:
        Plugin output with router names and context
    """
    try:
        print(f"\n[API] Plugin Initialize - Processing {len(bundle_paths)} file(s)")

        result = await plugin_executor.initialize(bundle_paths)

        if result["status"] == "error":
            raise HTTPException(
                status_code=500,
                detail=f"Plugin execution failed: {result.get('error', 'Unknown error')}"
            )

        # Check for auth prompts
        if result.get("auth_required"):
            auth_info = result["auth_required"]
            result["message"] = "Authentication required - see auth_required field"

        # Load additional context files if they exist
        if result.get("router_names"):
            # Load router contexts
            router_context_file = DATA_DIR / "router_context.json"
            if router_context_file.exists():
                with open(router_context_file, 'r') as f:
                    result["router_contexts"] = json.load(f)

            # Load HA pairs
            ha_file = DATA_DIR / "HA_pair_validation.json"
            if ha_file.exists():
                try:
                    with open(ha_file, 'r') as f:
                        result["ha_pairs"] = json.load(f)
                except:
                    result["ha_pairs"] = []

            # Load replication pairs
            repl_file = DATA_DIR / "replication_pair_validation.json"
            if repl_file.exists():
                try:
                    with open(repl_file, 'r') as f:
                        result["replication_pairs"] = json.load(f)
                except:
                    result["replication_pairs"] = []

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def parse_warnings_from_text(text_output: str, results: list) -> list:
    """Parse warnings from text output and add them to results"""
    import re

    # Find all WARNING lines with their section
    warning_pattern = r'\[Section ([^\]]+)\][^\n]*\n\s*\[WARNING\]\s*([^\n]+)'
    warnings = re.findall(warning_pattern, text_output)

    for section, message in warnings:
        section = section.strip()
        # Check if this section already exists in results
        existing = next((r for r in results if r.get('section') == section), None)
        if existing and existing.get('status') != 'FAIL':
            # Update to WARNING status
            existing['status'] = 'WARNING'
            if 'failures' not in existing:
                existing['failures'] = []
            existing['failures'].append({'message': message.strip(), 'matches': []})
        elif not existing:
            # Add new WARNING entry
            results.append({
                'section': section,
                'description': f'Warning in section {section}',
                'status': 'WARNING',
                'failures': [{'message': message.strip(), 'matches': []}]
            })

    return results

@app.post("/api/plugin/analyze")
async def plugin_analyze(router_names: List[str]):
    """
    Execute /support-health-check:analyze via Claude plugin

    Runs health checks on specified routers and searches Confluence for KBAs.

    Args:
        router_names: List of router names, or ["all"] for all routers

    Returns:
        Health check results and Confluence KBA links
    """
    try:
        print(f"\n[API] Plugin Analyze - Checking {len(router_names)} router(s)")

        result = await plugin_executor.analyze(router_names)

        if result["status"] == "error":
            raise HTTPException(
                status_code=500,
                detail=f"Plugin execution failed: {result.get('error', 'Unknown error')}"
            )

        # Parse warnings from text outputs and merge into JSON results
        if result.get('health_check_outputs') and result.get('plugin_health_results'):
            for router_name, text_output in result['health_check_outputs'].items():
                if router_name in result['plugin_health_results']:
                    health_data = result['plugin_health_results'][router_name]
                    if 'results' in health_data:
                        health_data['results'] = parse_warnings_from_text(text_output, health_data['results'])
                        warnings_count = len([r for r in health_data['results'] if r.get('status') == 'WARNING'])
                        print(f"[API] Added {warnings_count} warnings for {router_name}")

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class ChatbotRequest(BaseModel):
    question: str
    context: Optional[dict] = None

@app.post("/api/chatbot/query")
async def chatbot_query(request: ChatbotRequest):
    """
    Execute chatbot query via Claude with plugin context

    Uses Claude Code with MCP for Confluence search capabilities.

    Args:
        request: ChatbotRequest with question and optional context

    Returns:
        Claude's response and Confluence links
    """
    try:
        print(f"\n[API] Chatbot Query: {request.question[:100]}...")

        result = await plugin_executor.chatbot_query(request.question, request.context)

        if result["status"] == "error":
            # Don't fail completely - return partial response
            return {
                "status": "partial",
                "response": result.get("error", "Query failed"),
                "confluence_links": [],
                "error": result.get("error")
            }

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plugin/status")
async def plugin_status():
    """Check if Claude CLI and plugin are available"""
    try:
        # Try to execute a simple claude command
        stdout, stderr, returncode = await plugin_executor.execute_command(
            "claude --version",
            timeout=10
        )

        claude_available = returncode == 0

        # Check plugin directory
        plugin_dir = Path(__file__).parent / "plugin"
        plugin_exists = plugin_dir.exists()

        return {
            "claude_cli": {
                "available": claude_available,
                "version": stdout.strip() if claude_available else None,
                "error": stderr if not claude_available else None
            },
            "plugin": {
                "directory_exists": plugin_exists,
                "path": str(plugin_dir)
            },
            "status": "ready" if (claude_available and plugin_exists) else "not_ready"
        }

    except Exception as e:
        return {
            "claude_cli": {"available": False, "error": str(e)},
            "plugin": {"directory_exists": False},
            "status": "error"
        }


if __name__ == "__main__":
    import uvicorn
    print("Starting Solace Health Check API server...")
    print("Frontend should connect to: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
