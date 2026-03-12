#!/usr/bin/env python3
"""
Plugin Executor for Claude Code Health Check Plugin
Executes Claude CLI commands and captures output
"""

import asyncio
import re
import json
from pathlib import Path
from typing import List, Dict, Optional, Tuple

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PLUGIN_DIR = SCRIPT_DIR / "plugin"  # plugin lives inside back-end/


class PluginExecutor:
    """Execute Claude Code plugin commands and parse results"""

    def __init__(self):
        self.plugin_dir = str(PLUGIN_DIR)
        self.project_root = str(PROJECT_ROOT)

    async def execute_command(self, command: str, timeout: int = 300) -> Tuple[str, str, int]:
        """
        Execute a shell command and return stdout, stderr, and return code

        Args:
            command: Shell command to execute
            timeout: Command timeout in seconds (default 5 minutes)

        Returns:
            Tuple of (stdout, stderr, return_code)
        """
        try:
            # Unset CLAUDECODE environment variable to allow nested Claude sessions
            # Set Atlassian credentials for Confluence search
            import os
            env = os.environ.copy()
            env.pop('CLAUDECODE', None)

            # Add Atlassian credentials for MCP
            env['ATLASSIAN_SITE_URL'] = 'https://sol-jira.atlassian.net'
            env['ATLASSIAN_TOKEN'] = 'ATATT3xFfGF0ulsygVawCGIpvq_eEm5lHEuxSTyZmcJMsQxOEDj832MIV9HkBc03DJmcXQb26mgrri_cmYZ1a7Mvj_dR9xlQ9cXZZBW-oopL0nNyn1BNzulyVqQM4LulvXmqgui-CxSuNz3QFFgc78x96FVuNyQUiod9QhHWTjK-USS6rY8ONUE=DCD413FF'
            env['CONFLUENCE_SPACE'] = 'SS'

            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.project_root,
                env=env
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )

            return (
                stdout.decode('utf-8', errors='replace'),
                stderr.decode('utf-8', errors='replace'),
                process.returncode or 0
            )
        except asyncio.TimeoutError:
            return ("", f"Command timed out after {timeout} seconds", -1)
        except Exception as e:
            return ("", f"Error executing command: {str(e)}", -1)

    async def initialize(self, file_paths: List[str]) -> Dict:
        """
        Execute /support-health-check:initialize command

        Args:
            file_paths: List of absolute paths to gather-diagnostics files

        Returns:
            Dict with status, output, and router names
        """
        # Build the command
        # Use echo to pipe the command to claude CLI
        # Use --permission-mode bypassPermissions to auto-approve plugin actions
        paths_str = " ".join(f'"{p}"' for p in file_paths)
        prompt = f"/support-health-check:initialize {paths_str}"
        command = f'echo "{prompt}" | claude --plugin-dir "{self.plugin_dir}" --permission-mode bypassPermissions'

        print(f"[Plugin] Executing: {command}")

        # Execute
        stdout, stderr, returncode = await self.execute_command(command)

        # Log the actual output for debugging
        print(f"[Plugin] Return code: {returncode}")
        print(f"[Plugin] Stdout length: {len(stdout)} chars")
        print(f"[Plugin] Stdout preview: {stdout[:500] if stdout else 'EMPTY'}")
        if stderr:
            print(f"[Plugin] Stderr: {stderr[:200]}")

        # Parse router names from output
        router_names = self._parse_router_names(stdout)
        print(f"[Plugin] Parsed router names from output: {router_names}")

        # If no router names found in output, read from router_context.json (more reliable)
        if not router_names:
            context_file = SCRIPT_DIR / "data" / "router_context.json"
            if context_file.exists():
                try:
                    with open(context_file, 'r', encoding='utf-8') as f:
                        contexts = json.load(f)
                        router_names = [ctx.get('router_name') for ctx in contexts if ctx.get('router_name')]
                        print(f"[Plugin] Read {len(router_names)} router names from router_context.json: {router_names}")
                except Exception as e:
                    print(f"[Plugin] Failed to read router_context.json: {e}")

        # Check for authentication prompts
        auth_required = self._check_auth_prompt(stdout)

        # Read context_output.txt created by plugin (formatted text output)
        context_text = None
        context_file = SCRIPT_DIR / "data" / "context_output.txt"
        if context_file.exists():
            try:
                with open(context_file, 'r', encoding='utf-8') as f:
                    context_text = f.read()
                    print(f"[Plugin] Read context_output.txt ({len(context_text)} chars)")
            except Exception as e:
                print(f"[Plugin] Failed to read context_output.txt: {e}")

        result = {
            "status": "success" if returncode == 0 else "error",
            "command": command,
            "output": stdout,
            "error": stderr if stderr else None,
            "router_names": router_names,
            "context_output": context_text,  # Formatted text from plugin
            "auth_required": auth_required,
            "return_code": returncode
        }

        return result

    async def analyze(self, router_names: List[str]) -> Dict:
        """
        Execute /support-health-check:analyze command

        Args:
            router_names: List of router names to analyze, or ["all"]

        Returns:
            Dict with status, output, parsed results, and Confluence KBAs
        """
        # Build the command
        # Use echo to pipe the command to claude CLI
        # Use --permission-mode bypassPermissions to auto-approve plugin actions
        routers_str = " ".join(router_names)
        prompt = f"/support-health-check:analyze {routers_str}"
        command = f'echo "{prompt}" | claude --plugin-dir "{self.plugin_dir}" --permission-mode bypassPermissions'

        print(f"[Plugin] Executing: {command}")

        # Execute
        stdout, stderr, returncode = await self.execute_command(command, timeout=600)  # 10 min timeout

        # Parse results
        health_results = self._parse_health_check_output(stdout)
        confluence_kbas = self._extract_confluence_links(stdout)

        # Read actual health check result files created by plugin
        # Plugin creates: data/health_check_results_{router_name}.json
        plugin_health_results = {}
        data_dir = SCRIPT_DIR / "data"

        # Get all routers from router_context.json to ensure we read all results
        all_router_names = router_names.copy()
        context_file = data_dir / "router_context.json"
        if context_file.exists():
            try:
                with open(context_file, 'r', encoding='utf-8') as f:
                    contexts = json.load(f)
                    context_routers = [ctx.get('router_name') for ctx in contexts if ctx.get('router_name')]
                    # Merge with passed router names
                    all_router_names = list(set(all_router_names + context_routers))
                    print(f"[Plugin] Found {len(context_routers)} routers in context file")
            except Exception as e:
                print(f"[Plugin] Failed to read router_context.json: {e}")

        # Read health check results for ALL routers
        for router_name in all_router_names:
            result_file = data_dir / f"health_check_results_{router_name}.json"
            if result_file.exists():
                try:
                    with open(result_file, 'r', encoding='utf-8') as f:
                        plugin_health_results[router_name] = json.load(f)
                        print(f"[Plugin] Loaded health results for {router_name}")
                except Exception as e:
                    print(f"[Plugin] Failed to read {result_file}: {e}")
            else:
                print(f"[Plugin] Result file not found: {result_file}")

        print(f"[Plugin] Total health results loaded: {len(plugin_health_results)} routers")

        # Read health_check_output_{router_name}.txt files (formatted text from plugin)
        health_check_outputs = {}
        for router_name in all_router_names:
            output_file = data_dir / f"health_check_output_{router_name}.txt"
            if output_file.exists():
                try:
                    with open(output_file, 'r', encoding='utf-8') as f:
                        output_text = f.read()
                        health_check_outputs[router_name] = output_text
                        print(f"[Plugin] Read health_check_output_{router_name}.txt ({len(output_text)} chars)")
                except Exception as e:
                    print(f"[Plugin] Failed to read {output_file}: {e}")
            else:
                print(f"[Plugin] Output file not found: {output_file}")

        # Get final list of routers from context file for accuracy
        final_router_names = all_router_names if 'all_router_names' in locals() else router_names

        result = {
            "status": "success" if returncode == 0 else "error",
            "command": command,
            "output": stdout,
            "error": stderr if stderr else None,
            "health_results": health_results,
            "plugin_health_results": plugin_health_results,  # Actual JSON files
            "health_check_outputs": health_check_outputs,  # Text files
            "confluence_kbas": confluence_kbas,
            "router_names": final_router_names,  # All router names found
            "return_code": returncode
        }

        return result

    async def chatbot_query(self, question: str, context: Optional[Dict] = None) -> Dict:
        """
        Execute a chatbot query using Claude with plugin context

        Args:
            question: User's question
            context: Optional context (health check results, router info)

        Returns:
            Dict with response and Confluence links
        """
        import os

        # Build file references so Claude can read them directly
        data_dir = SCRIPT_DIR / "data"
        rules_file = SCRIPT_DIR / "rules" / "healthcheck_rules.yaml"

        broker = context.get('broker', '') if context else ''
        file_refs = []
        if broker:
            result_file = data_dir / f"health_check_results_{broker}.json"
            if result_file.exists():
                file_refs.append(f"- Health check results: {result_file}")
        context_file = data_dir / "router_context.json"
        if context_file.exists():
            file_refs.append(f"- Router context: {context_file}")
        if rules_file.exists():
            file_refs.append(f"- Health check rules (supported versions/chassis): {rules_file}")

        file_section = "\n".join(file_refs) if file_refs else "No data files available."

        prompt = f"""You are a Solace support engineer. Answer the following question using the available data files and Confluence KBAs.

Available data files (read them as needed using your file tools):
{file_section}

User question: {question}

INSTRUCTIONS:
1. Read the relevant data files listed above to answer accurately. For questions about supported chassis models, versions, or lifecycle dates, read the rules YAML.
2. Use mcp__atlassian__search to search https://sol-jira.atlassian.net space SS for relevant KBAs.
3. When providing Confluence links, use COMPLETE URLs: https://sol-jira.atlassian.net/wiki/spaces/SS/pages/...
4. Provide plain URLs (not markdown links).
5. Only return Confluence results from sol-jira.atlassian.net/wiki/spaces/SS/"""

        print(f"[Chatbot] Executing query")

        # Execute Claude directly with stdin — avoids shell/platform issues entirely
        env = os.environ.copy()
        env.pop('CLAUDECODE', None)
        env['ATLASSIAN_SITE_URL'] = 'https://sol-jira.atlassian.net'
        env['ATLASSIAN_TOKEN'] = 'ATATT3xFfGF0ulsygVawCGIpvq_eEm5lHEuxSTyZmcJMsQxOEDj832MIV9HkBc03DJmcXQb26mgrri_cmYZ1a7Mvj_dR9xlQ9cXZZBW-oopL0nNyn1BNzulyVqQM4LulvXmqgui-CxSuNz3QFFgc78x96FVuNyQUiod9QhHWTjK-USS6rY8ONUE=DCD413FF'
        env['CONFLUENCE_SPACE'] = 'SS'

        stdout = ""
        stderr = ""
        returncode = -1
        try:
            process = await asyncio.create_subprocess_exec(
                'claude', '--plugin-dir', self.plugin_dir, '--permission-mode', 'bypassPermissions',
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.project_root,
                env=env
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(input=prompt.encode('utf-8')),
                timeout=120
            )
            stdout = stdout_bytes.decode('utf-8', errors='replace')
            stderr = stderr_bytes.decode('utf-8', errors='replace')
            returncode = process.returncode or 0
        except asyncio.TimeoutError:
            stderr = "Command timed out after 120 seconds"
        except Exception as e:
            stderr = f"Error executing command: {str(e)}"

        # Log chatbot response for debugging
        print(f"[Chatbot] Return code: {returncode}")
        print(f"[Chatbot] Response length: {len(stdout)} chars")
        print(f"[Chatbot] Response preview: {stdout[:1000] if stdout else 'EMPTY'}")
        if stderr:
            print(f"[Chatbot] Stderr: {stderr[:500]}")

        # Parse Confluence links
        confluence_links = self._extract_confluence_links(stdout)
        print(f"[Chatbot] Found {len(confluence_links)} Confluence links")
        for link in confluence_links:
            print(f"[Chatbot]   - {link['title']}: {link['url']}")

        result = {
            "status": "success" if returncode == 0 else "error",
            "response": stdout,
            "error": stderr if stderr else None,
            "confluence_links": confluence_links,
            "return_code": returncode
        }

        return result

    def _parse_router_names(self, output: str) -> List[str]:
        """Extract router names from initialize output"""
        router_names = []

        # Look for patterns like "Router: ROUTERNAME" or "router_name: ROUTERNAME"
        patterns = [
            r'Router:\s+(\S+)',
            r'router_name["\']?\s*:\s*["\']?(\S+)',
            r'Router Name:\s+(\S+)',
            r'\*\*([A-Z0-9]+)\*\*',  # Markdown bold router names
        ]

        for pattern in patterns:
            matches = re.findall(pattern, output, re.IGNORECASE)
            router_names.extend(matches)

        # Remove duplicates while preserving order
        seen = set()
        unique_routers = []
        for name in router_names:
            if name not in seen and len(name) > 3:  # Filter out short matches
                seen.add(name)
                unique_routers.append(name)

        return unique_routers

    def _parse_health_check_output(self, output: str) -> List[Dict]:
        """Parse health check results from analyze output"""
        results = []

        # Split by router sections (markdown bold headers)
        router_sections = re.split(r'\*\*([A-Z0-9_]+)\*\*', output)

        for i in range(1, len(router_sections), 2):
            if i + 1 >= len(router_sections):
                break

            router_name = router_sections[i]
            section_content = router_sections[i + 1]

            # Parse INFO, WARNING, FAIL lines
            info_lines = re.findall(r'\[INFO\]\s*(.+)', section_content)
            warning_lines = re.findall(r'\[WARNING\]\s*(.+)', section_content)
            fail_lines = re.findall(r'\[FAIL\]\s*(.+)', section_content)

            results.append({
                "router_name": router_name,
                "status": "FAIL" if fail_lines else ("WARNING" if warning_lines else "HEALTHY"),
                "info": info_lines,
                "warnings": warning_lines,
                "failures": fail_lines,
                "raw_output": section_content.strip()
            })

        return results

    def _extract_confluence_links(self, output: str) -> List[Dict]:
        """Extract Confluence KBA links from output - specifically sol-jira.atlassian.net"""
        kbas = []

        # Look for sol-jira Confluence URLs - more permissive pattern
        # Match everything until whitespace, ), ], ", or <
        url_pattern = r'https?://sol-jira\.atlassian\.net/wiki/[^\s\)\]\"\<]+'
        urls = re.findall(url_pattern, output)

        # Look for markdown links [Title](URL) with sol-jira - more permissive
        markdown_pattern = r'\[([^\]]+)\]\((https?://sol-jira\.atlassian\.net/wiki/[^\)\s]+)\)'
        markdown_links = re.findall(markdown_pattern, output)

        # Catch malformed markdown where URL is in link text but href is incomplete
        # Pattern: [https://sol-jira.../pages/123/Title](https://sol-jira...)
        # Use the URL from the link text (complete) instead of truncated href
        malformed_pattern = r'\[(https://sol-jira\.atlassian\.net/wiki/spaces/SS/pages/[^\]]+)\]\(https?://sol-jira[^\)]*\)'
        malformed_links = re.findall(malformed_pattern, output)

        for url in malformed_links:
            # URL from link text is complete - use it!
            if not any(kba['url'] == url for kba in kbas):
                title_match = re.search(r'/pages/(\d+)/([^/\?\#]+)', url)
                if title_match:
                    page_title = title_match.group(2).replace('-', ' ').replace('+', ' ').replace('%20', ' ').title()
                else:
                    page_title = "Solace KBA"
                kbas.append({"title": page_title, "url": url})
                print(f"[Link Extraction] Recovered from malformed markdown: {url}")

        for title, url in markdown_links:
            kbas.append({
                "title": title.strip(),
                "url": url.strip()
            })

        # Add plain URLs not captured by markdown (only sol-jira)
        for url in urls:
            if not any(kba['url'] == url for kba in kbas):
                # Try to extract title from URL
                title_match = re.search(r'/pages/(\d+)/([^/\?]+)', url)
                if title_match:
                    page_title = title_match.group(2).replace('-', ' ').replace('+', ' ').title()
                else:
                    page_title = "Solace Support Wiki Page"

                kbas.append({
                    "title": page_title,
                    "url": url
                })

        # Also extract any "Sources:" section links
        sources_pattern = r'Sources?:\s*\n((?:\s*-\s*\[([^\]]+)\]\((https?://sol-jira[^\)]+)\)\s*\n?)+)'
        sources_matches = re.findall(sources_pattern, output, re.MULTILINE)

        for source_block, _, _ in sources_matches:
            source_links = re.findall(r'-\s*\[([^\]]+)\]\((https?://sol-jira[^\)]+)\)', source_block)
            for title, url in source_links:
                if not any(kba['url'] == url for kba in kbas):
                    kbas.append({
                        "title": title.strip(),
                        "url": url.strip()
                    })

        return kbas

    def _check_auth_prompt(self, output: str) -> Optional[Dict]:
        """Check if output contains authentication prompts"""
        # Look for authentication patterns
        url_pattern = r'Please visit the following URL to authenticate:\s+(https?://[^\s]+)'
        code_pattern = r'Enter the code:\s+([A-Z0-9-]+)'

        url_match = re.search(url_pattern, output)
        code_match = re.search(code_pattern, output)

        if url_match or code_match:
            return {
                "url": url_match.group(1) if url_match else None,
                "code": code_match.group(1) if code_match else None
            }

        return None


# Global instance
plugin_executor = PluginExecutor()
