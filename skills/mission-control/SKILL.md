---
name: mission-control
description: Open and use the Mission Control cross-project dashboard plugin in Antigravity's auxiliary pane to triage approvals and questions, inspect git/swarm/cron telemetry across workspaces, or preview in standalone mode.
---

# Mission Control

Mission Control provides a cross-project command center for Antigravity in the auxiliary (side) pane. It aggregates:

- **Needs Attention Triage Strip**: Blocked approvals, pending Swarm merges, agent questions, and errors across every workspace with direct **Approve**, **Diff**, **Reply**, and **Open** actions.
- **Multi-Project Matrix**: Live Git branch/diff stats (`+added -removed`), active worktree counts, Swarm counts, and scheduled cron jobs (`HH:MM`) across projects.
- **Thread Peek & Quick-Reply Inspector**: Live `Activity`, `Swarm`, `Files`, and `Diff` tabs alongside a docked bottom composer so you can reply or steer `@coordinator` without leaving the dashboard.
- **Views & Filtering**: Switch between `Overview`, `Board`, `Timeline`, and `Graph`, filter by `Needs Attention` or `Running`, and search via `Ctrl+K`.

## Opening the Auxiliary Pane

When the `mission-control` plugin is enabled and running, surface a clickable pill in chat so the user can toggle the panel in the auxiliary pane:

```markdown
[Open Mission Control](sidecar://mission-control/mission_control/)
```

Rules for navigation links:
- Always use `sidecar://mission-control/mission_control/` to open the Mission Control dashboard panel.
- Never emit `plugin://` or `plugins://` links (they are unhandled and render as dead text).
- Avoid emitting duplicate pills to the same view in a single turn.

## Standalone Preview (Outside Antigravity)

To preview or debug the dashboard locally in any browser using the deterministic demo dataset:

```bash
node ~/.gemini/config/plugins/mission-control/sidecars/mission_control/main.mjs --standalone --demo --port 4321
```

Or from the plugin source repository:

```bash
node sidecars/mission_control/main.mjs --standalone --demo --port 4321
```

Omit `--demo` to run standalone mode against live local Antigravity brain, project, and cron state.
