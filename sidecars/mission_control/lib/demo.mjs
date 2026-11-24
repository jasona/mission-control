import { createHash } from 'node:crypto';
import { DEMO_ID_RE } from './discovery.mjs';

const INITIAL_DIFFS = [
  {
    path: 'overlook-core/src/snooze.rs',
    status: 'M',
    added: 148,
    removed: 12,
    patch: [
      'diff --git a/overlook-core/src/snooze.rs b/overlook-core/src/snooze.rs',
      'index 4a2c891..9f81b02 100644',
      '--- a/overlook-core/src/snooze.rs',
      '+++ b/overlook-core/src/snooze.rs',
      '@@ -14,18 +14,42 @@ use crate::store::{MailStore, StoreError};',
      ' use chrono::{DateTime, Duration, Utc};',
      '+use serde::{Deserialize, Serialize};',
      ' ',
      '+#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]',
      '+pub enum SnoozePreset {',
      '+    LaterToday,',
      '+    TomorrowMorning,',
      '+    NextWeek,',
      '+    Custom(DateTime<Utc>),',
      '+}',
      '+',
      ' pub struct SnoozeService {',
      '     store: MailStore,',
      ' }',
      ' ',
      ' impl SnoozeService {',
      '-    pub fn snooze_thread(&self, thread_id: &str, until: DateTime<Utc>) -> Result<(), StoreError> {',
      '-        self.store.mark_snoozed(thread_id, until)',
      '+    pub fn snooze_thread(&self, account_id: &str, thread_id: &str, preset: SnoozePreset) -> Result<DateTime<Utc>, StoreError> {',
      '+        let wake_at = resolve_preset(preset, Utc::now());',
      '+        self.store.mark_snoozed(account_id, thread_id, wake_at)?;',
      '+        Ok(wake_at)',
      '+    }',
      '+',
      '+    pub fn wake_due_threads(&self, now: DateTime<Utc>) -> Result<usize, StoreError> {',
      '+        let due = self.store.list_due_snoozes(now)?;',
      '+        for item in &due {',
      '+            self.store.restore_to_inbox(&item.account_id, &item.thread_id)?;',
      '+        }',
      '+        Ok(due.len())',
      '     }',
      ' }',
    ].join('\n'),
  },
  {
    path: 'overlook-core/src/store/sqlite.rs',
    status: 'M',
    added: 112,
    removed: 24,
    patch: [
      'diff --git a/overlook-core/src/store/sqlite.rs b/overlook-core/src/store/sqlite.rs',
      'index 8812d01..7c441e9 100644',
      '--- a/overlook-core/src/store/sqlite.rs',
      '+++ b/overlook-core/src/store/sqlite.rs',
      '@@ -102,10 +102,22 @@ impl MailStore {',
      '-    pub fn mark_snoozed(&self, thread_id: &str, wake_at: DateTime<Utc>) -> Result<(), StoreError> {',
      '-        self.conn.execute(',
      '-            "UPDATE threads SET snoozed_until = ?1 WHERE id = ?2",',
      '-            params![wake_at.timestamp(), thread_id],',
      '-        )?;',
      '+    pub fn mark_snoozed(&self, account_id: &str, thread_id: &str, wake_at: DateTime<Utc>) -> Result<(), StoreError> {',
      '+        self.conn.execute(',
      '+            "INSERT INTO thread_snoozes (account_id, thread_id, wake_at_ts, state) VALUES (?1, ?2, ?3, \'snoozed\')',
      '+             ON CONFLICT(account_id, thread_id) DO UPDATE SET wake_at_ts = excluded.wake_at_ts, state = \'snoozed\'",',
      '+            params![account_id, thread_id, wake_at.timestamp()],',
      '+        )?;',
      '         Ok(())',
      '     }',
      '+',
      '+    pub fn list_due_snoozes(&self, now: DateTime<Utc>) -> Result<Vec<SnoozeRecord>, StoreError> {',
      '+        let mut stmt = self.conn.prepare(',
      '+            "SELECT account_id, thread_id, wake_at_ts FROM thread_snoozes WHERE state = \'snoozed\' AND wake_at_ts <= ?1"',
      '+        )?;',
      '+        stmt.query_map(params![now.timestamp()], SnoozeRecord::from_row)?.collect()',
      '+    }',
      ' }',
    ].join('\n'),
  },
  {
    path: 'overlook-core/src/calendar/filter.rs',
    status: 'A',
    added: 84,
    removed: 0,
    patch: [
      'diff --git a/overlook-core/src/calendar/filter.rs b/overlook-core/src/calendar/filter.rs',
      'new file mode 100644',
      'index 0000000..c12a0f4',
      '--- /dev/null',
      '+++ b/overlook-core/src/calendar/filter.rs',
      '@@ -0,0 +1,24 @@',
      '+#[derive(Debug, Clone, PartialEq, Eq)]',
      '+pub enum CalendarScope {',
      '+    AllCalendars,',
      '+    Account(String),',
      '+    Calendar { account_id: String, calendar_id: String },',
      '+}',
      '+',
      '+pub fn matches_scope(scope: &CalendarScope, account_id: &str, calendar_id: &str) -> bool {',
      '+    match scope {',
      '+        CalendarScope::AllCalendars => true,',
      '+        CalendarScope::Account(id) => id == account_id,',
      '+        CalendarScope::Calendar { account_id: a, calendar_id: c } => a == account_id && c == calendar_id,',
      '+    }',
      '+}',
    ].join('\n'),
  },
  {
    path: 'overlook-core/src/mail/account.rs',
    status: 'M',
    added: 44,
    removed: 8,
    patch: [
      'diff --git a/overlook-core/src/mail/account.rs b/overlook-core/src/mail/account.rs',
      'index 212ef11..90bc120 100644',
      '--- a/overlook-core/src/mail/account.rs',
      '+++ b/overlook-core/src/mail/account.rs',
      '@@ -31,8 +31,14 @@ pub struct MailAccount {',
      '     pub id: String,',
      '     pub email: String,',
      '-    pub default_folder: String,',
      '+    pub label: String,',
      '+    pub sync_enabled: bool,',
      '+    pub priority_weight: u8,',
      ' }',
    ].join('\n'),
  },
  {
    path: 'overlook-core/tests/snooze_test.rs',
    status: 'A',
    added: 30,
    removed: 0,
    patch: [
      'diff --git a/overlook-core/tests/snooze_test.rs b/overlook-core/tests/snooze_test.rs',
      'new file mode 100644',
      'index 0000000..8b4c991',
      '--- /dev/null',
      '+++ b/overlook-core/tests/snooze_test.rs',
      '@@ -0,0 +1,14 @@',
      '+#[test]',
      '+fn snooze_roundtrip_multi_account() {',
      '+    let store = MailStore::in_memory().unwrap();',
      '+    let svc = SnoozeService::new(store);',
      '+    svc.snooze_thread("work", "thr-42", SnoozePreset::LaterToday).unwrap();',
      '+    assert_eq!(svc.wake_due_threads(Utc::now() + Duration::hours(5)).unwrap(), 1);',
      '+}',
    ].join('\n'),
  },
  {
    path: 'overlook-core/Cargo.toml',
    status: 'M',
    added: 0,
    removed: 4,
    patch: [
      'diff --git a/overlook-core/Cargo.toml b/overlook-core/Cargo.toml',
      'index 1122334..5566778 100644',
      '--- a/overlook-core/Cargo.toml',
      '+++ b/overlook-core/Cargo.toml',
      '@@ -18,6 +18,2 @@',
      '-legacy-imap = "0.2"',
      '-old-sync = "0.1"',
    ].join('\n'),
  },
];

const DEMO_MODELS = [
  { id: 'orchestrator-neon', label: 'Orchestrator (Neon)' },
  { id: 'gemini-pro', label: 'Gemini Pro' },
  { id: 'gemini-flash', label: 'Gemini Flash' },
];

const DEMO_MODES = ['Auto', 'Plan', 'Fast'];

function createInitialState() {
  const now = Date.now();
  const minsAgo = (m) => new Date(now - m * 60_000).toISOString();
  const hoursAgo = (h) => new Date(now - h * 3_600_000).toISOString();
  const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();
  const hoursAhead = (h) => new Date(now + h * 3_600_000).toISOString();

  return {
    version: 1,
    nextSeq: 1,
    defaultThreadId: 'demo-thread-mail-workflow',
    needsAttention: [
      {
        id: 'demo-attn-approval-mail',
        kind: 'approval',
        badgeLabel: 'Approval',
        projectId: 'demo-proj-overlook',
        projectName: 'omarchy-overlook',
        threadId: 'demo-thread-mail-workflow',
        threadTitle: 'Multi-account & mail workflow plan',
        summary: 'Swarm @snooze ready · 4 files (+312 -48) · tests passed',
        actions: ['approve', 'diff'],
        timestamp: minsAgo(2),
        ageLabel: '2m',
      },
      {
        id: 'demo-attn-question-pr',
        kind: 'question',
        badgeLabel: 'Question',
        projectId: 'demo-proj-crowbaros',
        projectName: 'crowbaros',
        threadId: 'demo-thread-draft-pr',
        threadTitle: 'Create Draft PR and Continue CI',
        summary: 'Target branch: main or release/0.4?',
        actions: ['reply', 'open'],
        timestamp: hoursAgo(4),
        ageLabel: '4h',
      },
    ],
    projects: [
      {
        id: 'demo-proj-overlook',
        name: 'omarchy-overlook',
        path: '/home/jason/coding/omarchy-overlook',
        branch: 'main',
        diff: { added: 418, removed: 2 },
        badge: { label: '2 Live', tone: 'green' },
        footerParts: ['1 Automation', '2 Worktrees'],
        footerText: '1 Automation · 2 Worktrees',
        worktreeCount: 2,
        automationCount: 1,
        pr: null,
        threads: [
          {
            id: 'demo-thread-mail-workflow',
            title: 'Multi-account & mail workflow plan',
            status: 'live',
            dotTone: 'green',
            subtitle: 'Swarm · 4',
            subtitleTone: 'amber',
            rightLabel: 'Live',
            rightTone: 'amber',
            needsAttention: true,
            running: true,
            hasSwarm: true,
            swarmCount: 4,
            isCron: false,
            cronExpr: '',
            updatedAt: minsAgo(1),
            column: 'attention',
          },
          {
            id: 'demo-thread-project-review',
            title: 'Project Review and Analysis',
            status: 'running',
            dotTone: 'amber',
            subtitle: 'Drafted 2.2.0 release thread',
            subtitleTone: 'muted',
            rightLabel: '10m',
            rightTone: 'muted',
            needsAttention: false,
            running: true,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: minsAgo(10),
            column: 'running',
          },
          {
            id: 'demo-thread-sqlite-snooze',
            title: 'SQLite V26 Snooze Migration',
            status: 'done',
            dotTone: 'gray',
            subtitle: 'Done · 18/18 tests',
            subtitleTone: 'muted',
            rightLabel: '2h',
            rightTone: 'muted',
            needsAttention: false,
            running: false,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: hoursAgo(2),
            column: 'done',
          },
        ],
      },
      {
        id: 'demo-proj-crowbaros',
        name: 'crowbaros',
        path: '/home/jason/coding/crowbaros',
        branch: 'feat/ci-iso',
        diff: { added: 0, removed: 0 },
        badge: { label: '1 Waiting', tone: 'amber' },
        preferWaitingBadge: true,
        footerParts: ['PR #42 Draft', 'CI Running'],
        footerText: 'PR #42 Draft · CI Running',
        worktreeCount: 0,
        automationCount: 0,
        pr: {
          number: 42,
          title: 'feat: reproducible CI ISO build pipeline',
          isDraft: true,
          status: 'CI Running',
          url: 'https://github.com/example/crowbaros/pull/42',
        },
        threads: [
          {
            id: 'demo-thread-draft-pr',
            title: 'Create Draft PR and Continue CI',
            status: 'attention',
            dotTone: 'amber',
            subtitle: 'Needs reply',
            subtitleTone: 'muted',
            rightLabel: '4h',
            rightTone: 'muted',
            needsAttention: true,
            running: false,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: hoursAgo(4),
            column: 'attention',
          },
          {
            id: 'demo-thread-iso-build',
            title: 'ISO Build Pipeline Optimization',
            status: 'running',
            dotTone: 'green',
            subtitle: 'Running · 3/5',
            subtitleTone: 'muted',
            rightLabel: '2m',
            rightTone: 'muted',
            needsAttention: false,
            running: true,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: minsAgo(2),
            column: 'running',
          },
          {
            id: 'demo-thread-kernel-audit',
            title: 'Kernel Config Audit',
            status: 'idle',
            dotTone: 'gray',
            subtitle: 'Idle',
            subtitleTone: 'muted',
            rightLabel: '1d',
            rightTone: 'muted',
            needsAttention: false,
            running: false,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: daysAgo(1),
            column: 'done',
          },
        ],
      },
      {
        id: 'demo-proj-notes',
        name: 'omarchy-notes',
        path: '/home/jason/coding/omarchy-notes',
        branch: 'main',
        diff: { added: 0, removed: 0 },
        badge: { label: '1 Cron', tone: 'blue' },
        footerParts: ['Clean tree', '0 running'],
        footerText: 'Clean tree · 0 running',
        worktreeCount: 0,
        automationCount: 1,
        pr: null,
        threads: [
          {
            id: 'demo-thread-vault-sync',
            title: 'Daily Vault Sync & Tagging',
            status: 'cron',
            dotTone: 'blue',
            subtitle: 'Cron · 09:00',
            subtitleTone: 'muted',
            rightLabel: 'Next 10h',
            rightTone: 'muted',
            needsAttention: false,
            running: false,
            hasSwarm: false,
            swarmCount: 0,
            isCron: true,
            cronExpr: 'CRON_TZ=America/Denver 0 9 * * *',
            updatedAt: hoursAhead(10),
            column: 'scheduled',
          },
          {
            id: 'demo-thread-link-graph',
            title: 'Link Graph Refactor',
            status: 'idle',
            dotTone: 'gray',
            subtitle: 'Idle',
            subtitleTone: 'muted',
            rightLabel: '3d',
            rightTone: 'muted',
            needsAttention: false,
            running: false,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: daysAgo(3),
            column: 'done',
          },
        ],
      },
      {
        id: 'demo-proj-hooter',
        name: 'html-hooter',
        path: '/home/jason/coding/html-hooter',
        branch: 'dev',
        diff: { added: 0, removed: 0 },
        badge: { label: 'Idle', tone: 'idle' },
        footerParts: ['Clean tree', '0 running'],
        footerText: 'Clean tree · 0 running',
        worktreeCount: 0,
        automationCount: 0,
        pr: null,
        threads: [
          {
            id: 'demo-thread-dom-bench',
            title: 'DOM Snapshot Parser Bench',
            status: 'done',
            dotTone: 'gray',
            subtitle: 'Done',
            subtitleTone: 'muted',
            rightLabel: '5d',
            rightTone: 'muted',
            needsAttention: false,
            running: false,
            hasSwarm: false,
            swarmCount: 0,
            isCron: false,
            cronExpr: '',
            updatedAt: daysAgo(5),
            column: 'done',
          },
        ],
      },
    ],
    threadDetails: {
      'demo-thread-mail-workflow': {
        composerPlaceholder: 'Steer @coordinator or reply to thread...',
        defaultModel: 'orchestrator-neon',
        swarm: {
          exists: true,
          count: 4,
          roster: [
            { name: 'coordinator', handle: '@coordinator', role: 'coordinator', status: 'working', stateLabel: 'Active', tone: 'green', conversationId: 'demo-thread-mail-workflow' },
            { name: 'snooze', handle: '@snooze', role: 'worker', status: 'waiting', stateLabel: 'Ready', tone: 'amber', conversationId: 'demo-worker-snooze' },
            { name: 'calendar-multi', handle: '@calendar-multi', role: 'worker', status: 'working', stateLabel: 'Editing', tone: 'green', conversationId: 'demo-worker-calendar-multi' },
            { name: 'mail-sync', handle: '@mail-sync', role: 'worker', status: 'waiting', stateLabel: 'Waiting', tone: 'gray', conversationId: 'demo-worker-mail-sync' },
          ],
          messages: [
            { seq: 1, agent: '@coordinator', to: '@snooze', time: '9:42 PM', text: 'Own Item 3: Add email snooze to overlook-core & store', statusPill: 'cargo test passed (18/18)', filePill: null, stateText: '' },
            { seq: 2, agent: '@snooze', to: '@coordinator', time: '9:46 PM', text: '[done] Implemented SnoozeService, SQLite thread_snoozes table, and 18 unit tests.', statusPill: 'cargo test passed (18/18)', filePill: 'overlook-core/src/snooze.rs', stateText: '' },
            { seq: 3, agent: '@coordinator', to: '@calendar-multi', time: '9:49 PM', text: 'Own Item 4a: Calendar account filter & All Calendars', statusPill: null, filePill: 'calendar/filter.rs', stateText: 'Working...' },
            { seq: 4, agent: '@coordinator', to: '@mail-sync', time: '9:50 PM', text: 'Stand by for multi-account IMAP backoff pass once Item 4a lands.', statusPill: null, filePill: 'mail/account.rs', stateText: '' },
          ],
        },
        activity: [
          {
            id: 'act-mail-1',
            from: '@coordinator',
            to: '@snooze',
            time: '9:42 PM',
            timestamp: minsAgo(9),
            body: 'Own Item 3: Add email snooze to overlook-core & store',
            badge: { text: 'cargo test passed (18/18)', tone: 'green', icon: 'check' },
            filePill: null,
            stateText: '',
          },
          {
            id: 'act-mail-2',
            from: '@coordinator',
            to: '@calendar-multi',
            time: '9:49 PM',
            timestamp: minsAgo(2),
            body: 'Own Item 4a: Calendar account filter & All Calendars',
            badge: null,
            filePill: 'calendar/filter.rs',
            stateText: 'Working...',
          },
        ],
        files: INITIAL_DIFFS.map(({ path, status, added, removed }) => ({ path, status, added, removed })),
        diff: INITIAL_DIFFS,
      },
      'demo-thread-project-review': {
        composerPlaceholder: 'Reply to Project Review and Analysis...',
        defaultModel: 'orchestrator-neon',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-rev-1',
            from: '@agent',
            to: '',
            time: '9:39 PM',
            timestamp: minsAgo(12),
            body: 'Audited release notes and drafted 2.2.0 release thread checklist across overlook-core and overlook-ui.',
            badge: null,
            filePill: 'CHANGELOG.md',
            stateText: 'Working...',
          },
        ],
        files: [{ path: 'CHANGELOG.md', status: 'M', added: 42, removed: 6 }],
        diff: [
          {
            path: 'CHANGELOG.md',
            status: 'M',
            added: 42,
            removed: 6,
            patch: 'diff --git a/CHANGELOG.md b/CHANGELOG.md\n--- a/CHANGELOG.md\n+++ b/CHANGELOG.md\n@@ -1,3 +1,6 @@\n+## 2.2.0\n+- Multi-account mail workflow and snooze scheduling\n+- Unified calendar account filter\n',
          },
        ],
      },
      'demo-thread-sqlite-snooze': {
        composerPlaceholder: 'Reply to SQLite V26 Snooze Migration...',
        defaultModel: 'gemini-pro',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-sql-1',
            from: '@agent',
            to: '',
            time: '7:45 PM',
            timestamp: hoursAgo(2),
            body: 'Completed SQLite V26 migration adding indexed thread_snoozes table and verified rollback safety.',
            badge: { text: '18/18 tests passed', tone: 'green', icon: 'check' },
            filePill: 'migrations/026_snooze.sql',
            stateText: '',
          },
        ],
        files: [{ path: 'migrations/026_snooze.sql', status: 'A', added: 28, removed: 0 }],
        diff: [],
      },
      'demo-thread-draft-pr': {
        composerPlaceholder: 'Answer question: main or release/0.4...',
        defaultModel: 'orchestrator-neon',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-pr-1',
            from: '@agent',
            to: '',
            time: '5:51 PM',
            timestamp: hoursAgo(4),
            body: 'Prepared Draft PR #42 for reproducible CI ISO builds. Target branch: main or release/0.4?',
            badge: { text: 'Needs reply', tone: 'amber', icon: 'question' },
            filePill: '.github/workflows/iso.yml',
            stateText: '',
          },
        ],
        files: [{ path: '.github/workflows/iso.yml', status: 'M', added: 19, removed: 4 }],
        diff: [
          {
            path: '.github/workflows/iso.yml',
            status: 'M',
            added: 19,
            removed: 4,
            patch: 'diff --git a/.github/workflows/iso.yml b/.github/workflows/iso.yml\n--- a/.github/workflows/iso.yml\n+++ b/.github/workflows/iso.yml\n@@ -12,4 +12,8 @@ jobs:\n   build-iso:\n+    timeout-minutes: 25\n     steps:\n+      - name: Verify reproducible manifest\n+        run: ./scripts/verify-iso-manifest.sh\n',
          },
        ],
      },
      'demo-thread-iso-build': {
        composerPlaceholder: 'Steer ISO Build Pipeline Optimization...',
        defaultModel: 'gemini-flash',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-iso-1',
            from: '@agent',
            to: '',
            time: '9:48 PM',
            timestamp: minsAgo(2),
            body: 'Step 3/5: Caching squashfs layer layers and benchmarking zstd -T0 compression throughput.',
            badge: null,
            filePill: 'scripts/build-iso.sh',
            stateText: 'Working...',
          },
        ],
        files: [{ path: 'scripts/build-iso.sh', status: 'M', added: 34, removed: 11 }],
        diff: [],
      },
      'demo-thread-kernel-audit': {
        composerPlaceholder: 'Resume Kernel Config Audit...',
        defaultModel: 'gemini-pro',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-kern-1',
            from: '@agent',
            to: '',
            time: 'Yesterday',
            timestamp: daysAgo(1),
            body: 'Verified lockdown LSM, WireGuard module, and cgroup v2 flags in config-x86_64.',
            badge: null,
            filePill: 'kernel/config-x86_64',
            stateText: '',
          },
        ],
        files: [],
        diff: [],
      },
      'demo-thread-vault-sync': {
        composerPlaceholder: 'Run or edit Daily Vault Sync & Tagging...',
        defaultModel: 'gemini-flash',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-cron-1',
            from: '@schedule',
            to: '',
            time: '09:00',
            timestamp: hoursAhead(10),
            body: 'Scheduled automation (`CRON_TZ=America/Denver 0 9 * * *`): Sync vault backlinks, normalize frontmatter tags, and append daily digest.',
            badge: { text: 'Cron · 09:00', tone: 'blue', icon: 'clock' },
            filePill: 'sidecar.json',
            stateText: '',
          },
        ],
        files: [],
        diff: [],
      },
      'demo-thread-link-graph': {
        composerPlaceholder: 'Resume Link Graph Refactor...',
        defaultModel: 'gemini-pro',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-link-1',
            from: '@agent',
            to: '',
            time: '3d ago',
            timestamp: daysAgo(3),
            body: 'Extracted bidirectional wiki-link indexer into standalone module.',
            badge: null,
            filePill: 'src/graph.ts',
            stateText: '',
          },
        ],
        files: [],
        diff: [],
      },
      'demo-thread-dom-bench': {
        composerPlaceholder: 'Start follow-up in DOM Snapshot Parser Bench...',
        defaultModel: 'gemini-flash',
        swarm: { exists: false, count: 0, roster: [], messages: [] },
        activity: [
          {
            id: 'act-dom-1',
            from: '@agent',
            to: '',
            time: '5d ago',
            timestamp: daysAgo(5),
            body: 'Benchmarked zero-copy DOM snapshot tokenizer: 1.4ms median on 20k-node fixtures.',
            badge: { text: 'Done', tone: 'green', icon: 'check' },
            filePill: 'benches/snapshot.rs',
            stateText: '',
          },
        ],
        files: [],
        diff: [],
      },
    },
    plugins: [
      {
        id: 'mission-control',
        dir: 'mission-control',
        name: 'mission-control',
        displayName: 'Mission Control',
        description: 'Cross-project Mission Control dashboard for Antigravity.',
        version: '0.1.0',
        builtin: false,
        enabled: true,
        path: '/home/jason/.gemini/config/plugins/mission-control',
        sidecars: [{ id: 'mission_control', displayName: 'Mission Control', hasWebUi: true, builtin: '' }],
        skills: ['mission-control'],
      },
      {
        id: 'swarm',
        dir: 'swarm',
        name: 'swarm',
        displayName: 'Swarm',
        description: 'Unlock the power of agent swarms.',
        version: '1.0.0',
        builtin: true,
        enabled: true,
        path: '/home/jason/.gemini/antigravity/builtin/plugins/swarm',
        sidecars: [{ id: 'swarm_board', displayName: 'Swarm', hasWebUi: true, builtin: '' }],
        skills: ['swarm_monitor'],
      },
    ],
  };
}

let state = createInitialState();

export function resetDemoState() {
  state = createInitialState();
}

function recomputeProjectAndSummary() {
  let threadCount = 0;
  let liveSwarmCount = 0;
  let runningCount = 0;

  for (const proj of state.projects) {
    let projLive = 0;
    let projWaiting = 0;
    let projCron = 0;

    for (const th of proj.threads) {
      threadCount++;
      if (th.hasSwarm && (th.running || th.status === 'live')) liveSwarmCount++;
      if (th.running) runningCount++;
      if (th.running) projLive++;
      else if (th.needsAttention) projWaiting++;
      else if (th.isCron) projCron++;
    }

    if (proj.preferWaitingBadge && projWaiting > 0) {
      proj.badge = { label: `${projWaiting} Waiting`, tone: 'amber' };
    } else {
      if (projWaiting === 0) proj.preferWaitingBadge = false;
      if (projLive > 0) {
        proj.badge = { label: `${projLive} Live`, tone: 'green' };
      } else if (projWaiting > 0) {
        proj.badge = { label: `${projWaiting} Waiting`, tone: 'amber' };
      } else if (projCron > 0) {
        proj.badge = { label: `${projCron} Cron`, tone: 'blue' };
      } else {
        proj.badge = { label: 'Idle', tone: 'idle' };
      }
    }

    if (proj.pr) {
      proj.footerParts = [`PR #${proj.pr.number}${proj.pr.isDraft ? ' Draft' : ''}`, proj.pr.status];
    } else if (proj.worktreeCount > 0) {
      const parts = [];
      if (proj.automationCount > 0) parts.push(`${proj.automationCount} Automation${proj.automationCount === 1 ? '' : 's'}`);
      parts.push(`${proj.worktreeCount} Worktree${proj.worktreeCount === 1 ? '' : 's'}`);
      proj.footerParts = parts;
    } else {
      proj.footerParts = ['Clean tree', `${projLive} running`];
    }
    proj.footerText = proj.footerParts.join(' · ');
  }

  return {
    projectCount: state.projects.length,
    threadCount,
    liveSwarmCount,
    needsAttentionCount: state.needsAttention.length,
    runningCount,
  };
}

function buildDemoTimeline() {
  const items = [];
  for (const proj of state.projects) {
    for (const th of proj.threads) {
      const bucket = th.isCron
        ? 'upcoming'
        : (th.rightLabel === 'Live' || th.rightLabel === 'Just now' || th.rightLabel.endsWith('m') || th.rightLabel.endsWith('h') ? 'today' : 'earlier');
      items.push({
        id: `tl-${th.id}`,
        bucket,
        kind: th.isCron ? 'cron' : (th.hasSwarm ? 'swarm' : (th.needsAttention ? 'question' : (th.running ? 'running' : 'activity'))),
        title: th.title,
        subtitle: th.subtitle,
        summary: th.subtitle,
        projectId: proj.id,
        projectName: proj.name,
        threadId: th.id,
        timeLabel: th.rightLabel,
        timestamp: th.updatedAt,
        tone: th.dotTone,
        statusLabel: th.status,
        needsAttention: Boolean(th.needsAttention),
        running: Boolean(th.running),
      });
    }
  }
  const order = { upcoming: 0, today: 1, earlier: 2 };
  items.sort((a, b) => order[a.bucket] - order[b.bucket] || b.timestamp.localeCompare(a.timestamp));
  return items;
}

function buildDemoGraph() {
  const nodes = [];
  const edges = [];

  for (const proj of state.projects) {
    nodes.push({
      id: proj.id,
      kind: 'project',
      label: proj.name,
      sublabel: `${proj.branch}${proj.diff.added || proj.diff.removed ? ` +${proj.diff.added} -${proj.diff.removed}` : ''}`,
      tone: proj.badge.tone,
      projectId: proj.id,
      threadId: proj.threads[0]?.id || '',
    });

    if (proj.worktreeCount > 0) {
      const wtId = `${proj.id}-worktrees`;
      nodes.push({
        id: wtId,
        kind: 'worktree',
        label: `${proj.worktreeCount} Worktrees`,
        sublabel: proj.branch,
        tone: 'blue',
        projectId: proj.id,
        threadId: '',
      });
      edges.push({ from: proj.id, to: wtId, label: 'worktrees', tone: 'muted' });
    }

    for (const th of proj.threads) {
      nodes.push({
        id: th.id,
        kind: th.isCron ? 'cron' : 'thread',
        label: th.title,
        sublabel: th.subtitle,
        tone: th.dotTone,
        projectId: proj.id,
        threadId: th.id,
      });
      edges.push({ from: proj.id, to: th.id, label: th.isCron ? 'cron' : 'thread', tone: th.dotTone });

      const detail = state.threadDetails[th.id];
      if (detail?.swarm?.exists) {
        for (const m of detail.swarm.roster) {
          const agentNodeId = `agent-${th.id}-${m.name}`;
          nodes.push({
            id: agentNodeId,
            kind: 'agent',
            label: m.handle,
            sublabel: m.stateLabel,
            tone: m.tone,
            projectId: proj.id,
            threadId: th.id,
          });
          edges.push({ from: th.id, to: agentNodeId, label: m.role, tone: m.tone });
        }
      }
    }
  }

  return { nodes, edges };
}

function computeDemoEtag(summary) {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      v: state.version,
      summary,
      needsAttention: state.needsAttention.map((a) => a.id),
      projects: state.projects.map((p) => ({
        id: p.id,
        badge: p.badge,
        threads: p.threads.map((t) => [t.id, t.status, t.subtitle, t.needsAttention, t.running]),
      })),
    }))
    .digest('hex')
    .slice(0, 16);
  return `demo-${state.version}-${digest}`;
}

export function getDemoDashboard(options = {}) {
  const summary = recomputeProjectAndSummary();
  const etag = computeDemoEtag(summary);
  if (options.etag && options.etag === etag) {
    return { unchanged: true, etag, mode: 'demo' };
  }
  return {
    mode: 'demo',
    etag,
    generatedAt: new Date().toISOString(),
    summary,
    needsAttention: structuredClone(state.needsAttention),
    projects: structuredClone(state.projects),
    timeline: buildDemoTimeline(),
    graph: buildDemoGraph(),
    plugins: structuredClone(state.plugins),
    defaultThreadId: state.defaultThreadId,
  };
}

function findDemoThread(threadId) {
  for (const proj of state.projects) {
    const th = proj.threads.find((t) => t.id === threadId);
    if (th) return { project: proj, thread: th };
  }
  return null;
}

export function getDemoThreadDetail(threadId) {
  if (typeof threadId !== 'string' || !DEMO_ID_RE.test(threadId)) return null;
  const hit = findDemoThread(threadId);
  if (!hit) return null;
  const { project, thread } = hit;
  const detail = state.threadDetails[threadId] || {
    composerPlaceholder: `Reply to ${thread.title}...`,
    defaultModel: 'orchestrator-neon',
    swarm: { exists: false, count: 0, roster: [], messages: [] },
    activity: [],
    files: [],
    diff: [],
  };

  const statusMap = {
    live: { label: 'Live', tone: 'green' },
    running: { label: 'Running', tone: 'green' },
    attention: { label: 'Waiting', tone: 'amber' },
    cron: { label: 'Scheduled', tone: 'blue' },
    done: { label: 'Done', tone: 'gray' },
    idle: { label: 'Idle', tone: 'gray' },
    error: { label: 'Error', tone: 'red' },
  };
  const st = statusMap[thread.status] || { label: thread.status, tone: thread.dotTone };

  return {
    id: thread.id,
    projectId: project.id,
    projectName: project.name,
    title: thread.title,
    status: thread.status,
    statusLabel: st.label,
    statusTone: st.tone,
    composerPlaceholder: detail.composerPlaceholder,
    defaultModel: detail.defaultModel,
    models: DEMO_MODELS,
    modes: DEMO_MODES,
    swarm: structuredClone(detail.swarm),
    activity: structuredClone(detail.activity),
    files: structuredClone(detail.files),
    diff: structuredClone(detail.diff),
    diffTruncated: false,
  };
}

function nowClock() {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

export function approveDemo({ attentionId = '', threadId, note = '' }) {
  const hit = findDemoThread(threadId);
  if (!hit) return null;
  const { thread } = hit;
  const detail = state.threadDetails[threadId];

  state.needsAttention = state.needsAttention.filter((a) => {
    if (attentionId && a.id === attentionId) return false;
    if (!attentionId && a.threadId === threadId && a.kind === 'approval') return false;
    return true;
  });

  const stillNeeds = state.needsAttention.some((a) => a.threadId === threadId);
  thread.needsAttention = stillNeeds;
  if (!stillNeeds) {
    thread.column = thread.running ? 'running' : 'done';
    if (!thread.hasSwarm && thread.status === 'attention') {
      thread.status = 'running';
      thread.dotTone = 'green';
    }
  }

  if (detail) {
    detail.activity.push({
      id: `act-approve-${Date.now()}-${state.nextSeq++}`,
      from: 'You',
      to: detail.swarm?.exists ? '@coordinator' : '@agent',
      time: nowClock(),
      timestamp: new Date().toISOString(),
      body: note ? `Approved: ${note}` : 'Approved ready changes and cleared triage gate.',
      badge: { text: 'Approved', tone: 'green', icon: 'check' },
      filePill: null,
      stateText: '',
    });
  }

  state.version++;
  return {
    ok: true,
    attentionId: attentionId || null,
    threadId,
    approvedAt: new Date().toISOString(),
    mode: 'demo',
  };
}

export function replyDemo({ threadId, message, model = '', mode = '' }) {
  const hit = findDemoThread(threadId);
  if (!hit) return null;
  const { thread } = hit;
  const detail = state.threadDetails[threadId];

  state.needsAttention = state.needsAttention.filter(
    (a) => !(a.threadId === threadId && (a.kind === 'question' || a.kind === 'error' || a.kind === 'quota' || a.kind === 'stuck'))
  );

  const stillNeeds = state.needsAttention.some((a) => a.threadId === threadId);
  thread.needsAttention = stillNeeds;
  thread.running = true;
  thread.status = thread.hasSwarm ? 'live' : 'running';
  thread.dotTone = 'green';
  thread.rightLabel = thread.hasSwarm ? 'Live' : 'Just now';
  thread.subtitle = thread.hasSwarm ? `Swarm · ${thread.swarmCount}` : 'Running · reply sent';
  thread.column = stillNeeds ? 'attention' : 'running';
  thread.updatedAt = new Date().toISOString();

  if (detail) {
    if (model) detail.defaultModel = model;
    detail.activity.push({
      id: `act-reply-${Date.now()}-${state.nextSeq++}`,
      from: 'You',
      to: detail.swarm?.exists ? '@coordinator' : '@agent',
      time: nowClock(),
      timestamp: new Date().toISOString(),
      body: message,
      badge: mode ? { text: `${mode}`, tone: 'blue', icon: 'send' } : null,
      filePill: null,
      stateText: 'Working...',
    });
    if (detail.swarm?.exists) {
      const nextSeq = (detail.swarm.messages[detail.swarm.messages.length - 1]?.seq || 0) + 1;
      detail.swarm.messages.push({
        seq: nextSeq,
        agent: '@user',
        to: '@coordinator',
        time: nowClock(),
        text: message,
        statusPill: null,
        filePill: null,
        stateText: 'Working...',
      });
    }
  }

  state.version++;
  return {
    ok: true,
    threadId,
    sentAt: new Date().toISOString(),
    mode: 'demo',
  };
}

export function createDemoThread({ projectId, title = '', prompt, model = '' }) {
  const project = state.projects.find((p) => p.id === projectId || p.name === projectId);
  if (!project) return null;

  const seq = state.nextSeq++;
  const threadId = `demo-thread-new-${seq}`;
  const cleanTitle = (title && title.trim()) || prompt.trim().split('\n')[0].slice(0, 64) || 'New Thread';
  const nowIso = new Date().toISOString();

  const newThread = {
    id: threadId,
    title: cleanTitle,
    status: 'running',
    dotTone: 'green',
    subtitle: 'Running · just started',
    subtitleTone: 'muted',
    rightLabel: 'Just now',
    rightTone: 'muted',
    needsAttention: false,
    running: true,
    hasSwarm: false,
    swarmCount: 0,
    isCron: false,
    cronExpr: '',
    updatedAt: nowIso,
    column: 'running',
  };

  project.threads.unshift(newThread);
  state.threadDetails[threadId] = {
    composerPlaceholder: `Reply to ${cleanTitle}...`,
    defaultModel: model || 'orchestrator-neon',
    swarm: { exists: false, count: 0, roster: [], messages: [] },
    activity: [
      {
        id: `act-new-${seq}`,
        from: 'You',
        to: '@agent',
        time: nowClock(),
        timestamp: nowIso,
        body: prompt.trim(),
        badge: null,
        filePill: null,
        stateText: 'Working...',
      },
    ],
    files: [],
    diff: [],
  };

  state.version++;
  return {
    ok: true,
    threadId,
    projectId: project.id,
    title: cleanTitle,
    mode: 'demo',
    thread: structuredClone(newThread),
  };
}

export function markDemoSeen({ threadId }) {
  const hit = findDemoThread(threadId);
  if (!hit) return null;
  const { thread } = hit;

  const beforeLen = state.needsAttention.length;
  state.needsAttention = state.needsAttention.filter(
    (a) => !(a.threadId === threadId && a.kind === 'done')
  );
  const stillNeeds = state.needsAttention.some((a) => a.threadId === threadId);
  thread.unseen = false;
  thread.needsAttention = stillNeeds;
  if (!stillNeeds && thread.status === 'done') {
    thread.dotTone = 'gray';
    thread.column = 'done';
  }
  if (state.needsAttention.length !== beforeLen) {
    state.version++;
  }
  return {
    ok: true,
    threadId,
    seenAtMs: Date.now(),
    mode: 'demo',
  };
}
