#!/usr/bin/env python3
"""
poll_auth_url.py
Polls program_data/auth_url.txt every 2 seconds for up to 30 seconds.
Prints content and exits as soon as the file is non-empty.
If nothing appears after 30 seconds, exits silently (auth was cached).
"""
import sys
import time
from pathlib import Path

PROGRAM_DATA_DIR = Path(__file__).parent.parent / "program_data"
AUTH_URL_FILE = PROGRAM_DATA_DIR / "auth_url.txt"

for _ in range(15):
    time.sleep(2)
    if AUTH_URL_FILE.exists() and AUTH_URL_FILE.stat().st_size > 0:
        sys.stdout.write(AUTH_URL_FILE.read_text())
        sys.stdout.flush()
        break
