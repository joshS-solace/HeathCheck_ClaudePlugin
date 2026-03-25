---
description: Decrypt/extract gather-diagnostics files and establish broker context. Usage - /support-health-check:initialize [gd1] [gd2] ...
---
Process gather-diagnostics inputs and establish broker context.

IMPORTANT: Do NOT use Glob or Search to find scripts. All scripts are at a known, fixed path. Use this exact path for all script references below:
`${CLAUDE_SKILL_DIR}/scripts`

IMPORTANT: Do NOT read any script files. Just run them directly using Bash. Reading scripts wastes time and is not needed.

Steps:
1. Run `rm -rf "${CLAUDE_SKILL_DIR}/program_data" && mkdir "${CLAUDE_SKILL_DIR}/program_data"` to wipe any previous session data and create a clean output directory.
2. Tell the user: "Decrypting and extracting — if Microsoft authentication is required, a URL and code will appear below. Complete the sign-in and the process will continue automatically."
3. Run `python ${CLAUDE_SKILL_DIR}/scripts/handle_gather_diagnostics.py $ARGUMENTS` as a background Bash task. Note the task ID.
   - If `$ARGUMENTS` is empty, the script auto-discovers gather-diagnostics files in the current working directory.
   - If `$ARGUMENTS` contains paths, those are used directly.
4. Run this Bash command (foreground, timeout 35000) to poll for the Microsoft auth output:
   `for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do sleep 2; if [ -f "${CLAUDE_SKILL_DIR}/program_data/auth_url.txt" ] && [ -s "${CLAUDE_SKILL_DIR}/program_data/auth_url.txt" ]; then cat "${CLAUDE_SKILL_DIR}/program_data/auth_url.txt"; break; fi; done`
   - Read the output and look for a line starting with `https://` and a line containing `Enter the code:`. Display both to the user in a prominent block:
     ```
     ACTION REQUIRED — Microsoft authentication needed:
       URL:  [the https:// line]
       Code: [the code from the "Enter the code:" line]
     ```
     Tell the user: "Please open the URL above, enter the code, and sign in. I will continue automatically once authentication completes."
   - If no URL appears after 30 seconds, authentication was not required (credentials were cached) — continue to the next step.
5. Use TaskOutput (block=true, timeout=600000) on the background task ID to wait for handle_gather_diagnostics.py to finish.
6. Parse the `Extracted:` section from the TaskOutput output to get folder names. Each line under `Extracted:` is a bare folder name (e.g. `gather-diagnostics-ny4-wfs-1sol-wp01`). Resolve the full path for each folder using this exact rule — no thinking required:
   - If `$ARGUMENTS` was provided: the folder is in the same directory as the first argument. Use `dirname(<first_argument>)/<folder_name>` as the full path.
   - If `$ARGUMENTS` was empty (auto-discovery): the folder is in the current working directory. Use `<cwd>/<folder_name>` as the full path.
   - Do NOT use Glob, Bash, or any tool to find the folder — just construct the path directly from the rule above.
7. Run `python ${CLAUDE_SKILL_DIR}/scripts/establish_context.py [folder-path-1] [folder-path-2] ... --output-dir "${CLAUDE_SKILL_DIR}/program_data"` (writes all output files into the plugin's `program_data/` directory).
8. Read `${CLAUDE_SKILL_DIR}/program_data/context_output.txt` using the Read tool and paste its full contents verbatim as plain text in your response (do not summarize or restate it — paste it exactly as-is, inside a code block). Output nothing else.
