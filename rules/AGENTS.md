# Mission Control Plugin

The **Mission Control** plugin exposes a cross-project dashboard web UI sidecar (`sidecars/mission_control`) in Antigravity's auxiliary pane.

- When the user asks to open Mission Control, triage approvals or questions across projects, monitor running swarms or cron schedules, or inspect workspace git status in the dashboard, offer a single clickable pill link: `[Open Mission Control](sidecar://mission-control/mission_control/)`.
- Never use `plugin://` or `plugins://` links; only `sidecar://mission-control/mission_control/` opens the auxiliary pane view (and `customization://mission-control` links to the plugin's settings page).
- Do not fabricate workspace, thread, git, or swarm status — let the live Mission Control sidecar read Antigravity projects, transcripts, swarms, git repos, and scheduled crons directly.
