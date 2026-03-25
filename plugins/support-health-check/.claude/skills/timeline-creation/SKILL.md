---
name: timeline-creation
description: Use this skill when the user asks for a timeline of events for a broker — e.g. why it restarted, why it went standby, what happened during an outage, or any question about broker uptime or restart history.
invocable: auto
keywords: [timeline, restart, standby, outage, uptime, reboot]
---

# Purpose

Produce an event timeline for a broker based on what the user has asked.
Identify the relevant router name from context (e.g. the router just analyzed, or
one the user has named). If ambiguous, ask the user to confirm.

The router context must already be established (`router_context.json` must exist in the working directory).

# Parameters

- router_name: The name of the router to investigate (from context or user input)

# Instructions

## Step 1 — Derive file paths from context. Do NOT use Glob.

Read `./router_context.json` and find the entry for the router. Note `full_path` and
`platform_type`, then derive paths directly:

| platform_type  | event.log | shutdownMessage |
|----------------|-----------|-----------------|
| `software`     | `{full_path}/container_solace/usr/sw/jail/logs/event.log` | `{full_path}/container_solace/var/lib/solace/diags/shutdownMessage` |
| `appliance`    | `{full_path}/usr/sw/jail/logs/event.log` | `{full_path}/var/lib/solace/diags/shutdownMessage` |

## Step 2 — Run both calls in parallel:

- Read `shutdownMessage` — records the last broker-initiated graceful reboot
  (written by `vmr-shutdown`; absent if the last shutdown was external/ungraceful)
- Grep `event.log` using this pattern — **grep by event type, not by time window**:

  ```
  SYSTEM_LINK_ADB|SYSTEM_HA_VR_STATE|SYSTEM_AD_MSG_SPOOL_CHG|SYSTEM_STARTUP_COMPLETE|SYSTEM_SHUTDOWN_INITIATED|SYSTEM_REDUNDANCY
  ```

  Grepping by time window returns thousands of lines of client/SSL/JNDI noise.
  Grepping by event type returns only the signal.

## Step 3 — Build a chronological timeline.

For each event include timestamp (UTC), event type, and a plain-English description.
Key interpretations:

| Event | Meaning |
|-------|---------|
| `SYSTEM_LINK_ADB_HELLO_PROTOCOL_DOWN` | Broker stopped receiving heartbeats from mate |
| `SYSTEM_LINK_ADB_LINK_DOWN` | ADB mate link declared down — note the reason (e.g. "Mate Link Journal Write Timeout") |
| `SYSTEM_AD_MSG_SPOOL_CHG … AD-Active to AD-Standby` | This broker lost active message routing |
| `SYSTEM_HA_VR_STATE_STANDBY` | Virtual Router went standby |
| `SYSTEM_SHUTDOWN_INITIATED` | Note the reason: "Did not receive confirmation that mate took over" = broker self-rebooted; "terminated" = killed externally (e.g. Kubernetes) |
| `SYSTEM_STARTUP_COMPLETE` | Broker came back up — this timestamp is the true restart time |
| `SYSTEM_HA_VR_STATE_ACTIVE` | Broker became active again |

## Step 4 — Summarise:

- **Root cause** — what triggered the cascade
- **Restart type** — broker-initiated vs external kill:
  - `shutdownMessage` timestamp matches a `SHUTDOWN_INITIATED` event → graceful broker reboot
  - Gap between shutdown and next `STARTUP_COMPLETE` with no matching `shutdownMessage` → external kill (Kubernetes OOMKill, pod eviction, etc.) — Last Restart Reason will show "Unknown"
- **Downtime** per restart (last event before shutdown → `STARTUP_COMPLETE`)
- **Time to become active** (`STARTUP_COMPLETE` → `SYSTEM_HA_VR_STATE_ACTIVE`)
- **Repeated restarts** — multiple `STARTUP_COMPLETE` events indicate instability

# Edge Cases

- If `router_context.json` does not exist, tell the user to run `/support-health-check:initialize` first
- If the router name is ambiguous, ask the user to confirm before proceeding
