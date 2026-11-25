import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { parseConversationMetadata } from '../lib/actions.mjs';
import { buildDashboardSnapshot, getThreadDetail } from '../lib/aggregator.mjs';
import { computeNextRun, discoverCrons, parseCronSpec } from '../lib/cron.mjs';
import {
  approveDemo,
  createDemoThread,
  getDemoDashboard,
  getDemoThreadDetail,
  replyDemo,
  resetDemoState,
} from '../lib/demo.mjs';
import { discoverPlugins, discoverProjects } from '../lib/discovery.mjs';
import { clearGitCache, getGitDiff, getGitStatus, parseUnifiedDiff } from '../lib/git.mjs';
import { clearSeenCache, markThreadSeen } from '../lib/seen.mjs';
import { readSwarm } from '../lib/swarm.mjs';
import {
  describeToolCall,
  finalReply,
  replyQuestion,
  stepFailure,
  summarizeTranscript,
  thinkingHeading,
  turnEnded,
} from '../lib/transcript.mjs';

function runGit(repoDir, args) {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Runner',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test Runner',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mc-agg-test-'));
  t.after(() => {
    clearGitCache();
    clearSeenCache();
    rmSync(root, { recursive: true, force: true });
  });

  const homeDir = join(root, 'home');
  const configDir = join(homeDir, '.gemini', 'config');
  const projectsDir = join(configDir, 'projects');
  const pluginsDir = join(configDir, 'plugins');
  const sidecarsDir = join(configDir, 'sidecars');
  const appDataDir = join(homeDir, '.gemini', 'antigravity');
  const brainDir = join(appDataDir, 'brain');
  const reposDir = join(root, 'repos');

  const repoAlpha = join(reposDir, 'alpha-app');
  const repoAlphaWt = join(reposDir, 'alpha-app-wt');
  const repoBeta = join(reposDir, 'beta-notes');

  for (const d of [projectsDir, pluginsDir, sidecarsDir, brainDir, repoAlpha, repoBeta]) {
    mkdirSync(d, { recursive: true });
  }

  // Repo Alpha: initial commit, then dirty tracked modification + linked git worktree
  runGit(repoAlpha, ['init', '-b', 'main']);
  mkdirSync(join(repoAlpha, 'src'), { recursive: true });
  writeFileSync(
    join(repoAlpha, 'src', 'snooze.rs'),
    'pub fn snooze() -> bool {\n    false\n}\n',
  );
  writeFileSync(
    join(repoAlpha, 'src', 'calendar.rs'),
    'pub fn filter_all() -> usize {\n    0\n}\n',
  );
  runGit(repoAlpha, ['add', '.']);
  runGit(repoAlpha, ['commit', '-m', 'Initial commit']);

  // Dirty tracked diff (+3 -1)
  writeFileSync(
    join(repoAlpha, 'src', 'snooze.rs'),
    'pub fn snooze(multi: bool) -> bool {\n    let enabled = multi;\n    enabled\n}\n',
  );
  // Linked worktree
  runGit(repoAlpha, ['worktree', 'add', '-b', 'feat/worktree-test', repoAlphaWt]);

  // Repo Beta: clean commit on main
  runGit(repoBeta, ['init', '-b', 'main']);
  writeFileSync(join(repoBeta, 'README.md'), '# Beta Notes\n');
  runGit(repoBeta, ['add', '.']);
  runGit(repoBeta, ['commit', '-m', 'Initial beta commit']);

  // Projects JSON (plus a sidecar pseudo-project that must be ignored)
  writeFileSync(
    join(projectsDir, 'alpha-app.json'),
    JSON.stringify({
      id: 'alpha-app',
      name: 'alpha-app',
      projectResources: {
        resources: [{ gitFolder: { folderUri: pathToFileURL(repoAlpha).href, defaultBranch: 'main' } }],
      },
    }),
  );
  writeFileSync(
    join(projectsDir, 'beta-notes.json'),
    JSON.stringify({
      id: 'beta-notes',
      name: 'beta-notes',
      projectResources: {
        resources: [{ gitFolder: { folderUri: pathToFileURL(repoBeta).href, defaultBranch: 'main' } }],
      },
    }),
  );
  writeFileSync(
    join(projectsDir, 'ignored-sidecar.json'),
    JSON.stringify({
      id: 'ignored-sidecar',
      name: 'ignored-sidecar',
      sidecar: true,
      workspacePath: repoAlpha,
    }),
  );

  // Installed plugin fixture
  const samplePluginDir = join(pluginsDir, 'sample-plugin');
  mkdirSync(join(samplePluginDir, 'skills', 'demo-skill'), { recursive: true });
  writeFileSync(
    join(samplePluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'sample-plugin',
      displayName: 'Sample Plugin',
      description: 'Sample fixture plugin',
      version: '0.2.0',
    }),
  );
  writeFileSync(join(samplePluginDir, 'skills', 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\ndescription: demo\n---\n');

  // Conversation IDs (valid UUIDs matching ID_RE)
  const convSwarmId = '11111111-1111-4111-8111-111111111111';
  const convWorkerSnoozeId = '22222222-2222-4222-8222-222222222222';
  const convWorkerCalId = '33333333-3333-4333-8333-333333333333';
  const convQuestionId = '44444444-4444-4444-8444-444444444444';
  const convDoneId = '55555555-5555-4555-8555-555555555555';
  const convErrorId = '66666666-6666-4666-8666-666666666666';

  const writeConv = (convId, { title, repoPath, steps, swarm }) => {
    const cDir = join(brainDir, convId);
    const logsDir = join(cDir, '.system_generated', 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(cDir, 'metadata.json'),
      JSON.stringify({
        title,
        workspace_uris: [pathToFileURL(repoPath).href],
      }),
    );
    writeFileSync(
      join(logsDir, 'transcript.jsonl'),
      steps.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );
    if (swarm) {
      const sDir = join(cDir, '.system_generated', 'swarm');
      mkdirSync(sDir, { recursive: true });
      writeFileSync(join(sDir, 'members.json'), JSON.stringify(swarm.membersJson));
      writeFileSync(
        join(sDir, 'board.jsonl'),
        swarm.board.map((b) => JSON.stringify(b)).join('\n') + '\n',
      );
    }
  };

  const tBase = Date.now() - 15 * 60_000;
  const ts = (offsetSec) => new Date(tBase + offsetSec * 1000).toISOString();

  // 1. Swarm coordinator conversation + 2 workers
  writeConv(convSwarmId, {
    title: 'Multi-account & mail workflow plan',
    repoPath: repoAlpha,
    steps: [
      { step_index: 0, type: 'USER_INPUT', content: 'Implement snooze and calendar filter', created_at: ts(0) },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        model: 'orchestrator-neon',
        thinking: '**Coordinating swarm workers**\nWaiting for updates.',
        tool_calls: [{ name: 'swarm_wait', args: { since: '0' } }],
        created_at: ts(10),
      },
      { step_index: 2, type: 'GENERIC', status: 'DONE', content: 'Woke on message #2', created_at: ts(20) },
    ],
    swarm: {
      membersJson: {
        title: 'Multi-account & mail workflow plan',
        members: {
          coordinator: { role: 'coordinator', conversation_id: convSwarmId, wake_mode: 'mentions' },
          snooze: { role: 'worker', conversation_id: convWorkerSnoozeId, wake_mode: 'mentions' },
          'calendar-multi': { role: 'worker', conversation_id: convWorkerCalId },
        },
      },
      board: [
        { seq: 1, agent: 'coordinator', text: '@snooze Own Item 3: Add snooze in src/snooze.rs', time: '2026-11-23 21:42:00' },
        { seq: 2, agent: 'snooze', text: '@coordinator [done] Implemented snooze — cargo test passed (18/18)', time: '2026-11-23 21:46:00' },
        { seq: 3, agent: 'coordinator', text: '@calendar-multi Own Item 4a: Edit src/calendar.rs', time: '2026-11-23 21:49:00' },
      ],
    },
  });

  // Worker 1 (snooze) - finished & ready with cargo test passed (18/18)
  writeConv(convWorkerSnoozeId, {
    title: 'Worker snooze',
    repoPath: repoAlpha,
    steps: [
      { step_index: 0, type: 'USER_INPUT', content: '@snooze Own Item 3', created_at: ts(5) },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        tool_calls: [
          { name: 'edit_file', args: { Path: JSON.stringify(join(repoAlpha, 'src', 'snooze.rs')) } },
          { name: 'run_command', args: { CommandLine: '"cargo test"' } },
        ],
        created_at: ts(15),
      },
      { step_index: 2, type: 'GENERIC', status: 'DONE', content: 'cargo test passed (18/18)', created_at: ts(25) },
      {
        step_index: 3,
        type: 'PLANNER_RESPONSE',
        tool_calls: [{ name: 'swarm_wait', args: { since: '2' } }],
        created_at: ts(30),
      },
      { step_index: 4, type: 'GENERIC', status: 'DONE', content: 'Waiting', created_at: ts(31) },
    ],
  });

  // Worker 2 (calendar-multi) - actively editing
  writeConv(convWorkerCalId, {
    title: 'Worker calendar-multi',
    repoPath: repoAlpha,
    steps: [
      { step_index: 0, type: 'USER_INPUT', content: '@calendar-multi Own Item 4a', created_at: ts(40) },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        thinking: '**Editing calendar filter**\nWorking on scope match.',
        tool_calls: [
          { name: 'edit_file', args: { Path: JSON.stringify(join(repoAlpha, 'src', 'calendar.rs')) } },
        ],
        created_at: ts(50),
      },
    ],
  });

  // 2. Question thread (ask_question)
  writeConv(convQuestionId, {
    title: 'Create Draft PR and Continue CI',
    repoPath: repoBeta,
    steps: [
      { step_index: 0, type: 'USER_INPUT', content: 'Open a draft PR for CI', created_at: ts(60) },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        thinking: '**Confirming target branch**\nAsking user before pushing.',
        tool_calls: [
          { name: 'ask_question', args: { question: '"Target branch: main or release/0.4?"' } },
        ],
        created_at: ts(70),
      },
    ],
  });

  // 3. Completed thread with edited files & cargo test passed (18/18)
  writeConv(convDoneId, {
    title: 'SQLite V26 Snooze Migration',
    repoPath: repoAlpha,
    steps: [
      { step_index: 0, type: 'USER_INPUT', content: 'Add migration 026', created_at: ts(80) },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        tool_calls: [
          { name: 'write_file', args: { Path: JSON.stringify(join(repoAlpha, 'migrations', '026.sql')), Overwrite: 'false' } },
          { name: 'run_command', args: { CommandLine: '"cargo test"' } },
        ],
        created_at: ts(90),
      },
      {
        step_index: 2,
        type: 'GENERIC',
        status: 'DONE',
        content: 'test result: ok. 18 passed; 0 failed; 0 ignored',
        created_at: ts(95),
      },
      {
        step_index: 3,
        type: 'PLANNER_RESPONSE',
        tool_calls: [],
        content: 'Migration 026 applied and all 18 tests pass.',
        created_at: ts(100),
      },
    ],
  });

  // 4. Model error thread
  writeConv(convErrorId, {
    title: 'Kernel Config Audit',
    repoPath: repoBeta,
    steps: [
      { step_index: 0, type: 'USER_INPUT', content: 'Audit kernel flags', created_at: ts(110) },
      {
        step_index: 1,
        type: 'ERROR_MESSAGE',
        error: 'Model backend returned HTTP 500 error',
        created_at: ts(120),
      },
    ],
  });

  // Scheduled cron sidecar in Beta Notes
  const cronSidecarDir = join(sidecarsDir, 'daily-vault-sync');
  mkdirSync(cronSidecarDir, { recursive: true });
  writeFileSync(
    join(cronSidecarDir, 'sidecar.json'),
    JSON.stringify({
      builtin: 'schedule',
      args: ['CRON_TZ=America/Denver 0 9 * * *', '--', 'Sync vault tags and daily links'],
      display_name: 'Daily Vault Sync & Tagging',
      description: 'Runs every morning at 09:00 America/Denver',
      agent_permissions: {
        workspace_uris: [pathToFileURL(repoBeta).href],
      },
    }),
  );

  const options = {
    homeDir,
    configDir,
    projectsDir,
    appDataDirs: [appDataDir],
    pluginsDir: [pluginsDir],
    sidecarDirs: [sidecarsDir],
    seenStorePath: join(root, 'seen.json'),
    useAgentApi: false,
    includePr: false,
    gitCacheTtlMs: 0,
  };

  return {
    root,
    repoAlpha,
    repoAlphaWt,
    repoBeta,
    appDataDir,
    options,
    ids: {
      convSwarmId,
      convWorkerSnoozeId,
      convWorkerCalId,
      convQuestionId,
      convDoneId,
      convErrorId,
    },
  };
}

test('discovery ignores sidecar pseudo-projects and loads real projects and plugins', (t) => {
  const fx = createFixture(t);
  const projects = discoverProjects(fx.options);
  assert.equal(projects.length, 2);
  assert.deepEqual(projects.map((p) => p.id), ['alpha-app', 'beta-notes']);
  assert.equal(projects[0].path, fx.repoAlpha);
  assert.equal(projects[1].path, fx.repoBeta);

  const plugins = discoverPlugins(fx.options);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].name, 'sample-plugin');
  assert.deepEqual(plugins[0].skills, ['demo-skill']);
});

test('git telemetry reads branch, numstat, worktree count, and capped unified diff', async (t) => {
  const fx = createFixture(t);
  const alphaGit = await getGitStatus(fx.repoAlpha, { includePr: false });
  assert.equal(alphaGit.isRepo, true);
  assert.equal(alphaGit.branch, 'main');
  assert.equal(alphaGit.diff.added, 3);
  assert.equal(alphaGit.diff.removed, 2);
  assert.equal(alphaGit.worktreeCount, 1);
  assert.equal(alphaGit.totalWorktrees, 2);
  assert.equal(alphaGit.clean, false);

  const betaGit = await getGitStatus(fx.repoBeta, { includePr: false });
  assert.equal(betaGit.isRepo, true);
  assert.equal(betaGit.branch, 'main');
  assert.equal(betaGit.diff.added, 0);
  assert.equal(betaGit.diff.removed, 0);
  assert.equal(betaGit.worktreeCount, 0);
  assert.equal(betaGit.clean, true);

  const diff = await getGitDiff(fx.repoAlpha);
  assert.equal(diff.truncated, false);
  assert.equal(diff.files.length, 1);
  assert.equal(diff.files[0].path, 'src/snooze.rs');
  assert.equal(diff.files[0].added, 3);
  assert.equal(diff.files[0].removed, 2);

  const truncatedDiff = parseUnifiedDiff(diff.files[0].patch, 40);
  assert.equal(truncatedDiff.truncated, true);
});

test('cron parsing handles CRON_TZ, HH:MM formatting, and project matching', (t) => {
  const fx = createFixture(t);
  const spec = parseCronSpec('CRON_TZ=America/Denver 0 9 * * *');
  assert.ok(spec);
  assert.equal(spec.tz, 'America/Denver');
  assert.equal(spec.expr, '0 9 * * *');

  const fixedNow = new Date('2026-11-23T15:00:00Z'); // 08:00 America/Denver (MST, UTC-7)
  const next = computeNextRun(spec, fixedNow);
  assert.ok(next);
  assert.equal(next.timeHHMM, '09:00');
  assert.equal(next.nextLabel, 'Next 1h');
  assert.equal(next.nextRunAt, '2026-11-23T16:00:00.000Z');

  const projects = discoverProjects(fx.options);
  const crons = discoverCrons(fx.options, projects, fixedNow);
  assert.equal(crons.length, 1);
  assert.equal(crons[0].sidecarId, 'daily-vault-sync');
  assert.equal(crons[0].projectId, 'beta-notes');
  assert.equal(crons[0].timeHHMM, '09:00');
  assert.equal(crons[0].nextLabel, 'Next 1h');
});

test('transcript parser handles turnEnded, replyQuestion, editedFiles, testResults, and stepFailure', (t) => {
  const fx = createFixture(t);
  const doneEntry = summarizeTranscript(fx.appDataDir, fx.ids.convDoneId);
  assert.equal(doneEntry.summary.idle, true);
  assert.equal(doneEntry.summary.replied, true);
  assert.equal(doneEntry.summary.editedFiles.length, 1);
  assert.equal(doneEntry.summary.editedFiles[0].status, 'A');
  assert.equal(doneEntry.summary.testResults.latest.label, 'cargo test passed (18/18)');
  assert.equal(doneEntry.summary.testResults.latest.ok, true);

  const qEntry = summarizeTranscript(fx.appDataDir, fx.ids.convQuestionId);
  assert.equal(qEntry.summary.askQuestion, 'Target branch: main or release/0.4?');

  const errEntry = summarizeTranscript(fx.appDataDir, fx.ids.convErrorId);
  const errFailure = stepFailure(errEntry.summary);
  assert.equal(errFailure.kind, 'error');

  const quotaFailure = stepFailure({
    last: { type: 'ERROR_MESSAGE', status: 'ERROR', error: '429 RESOURCE_EXHAUSTED quota exceeded' },
    mtime: Date.now(),
  });
  assert.equal(quotaFailure.kind, 'quota');

  assert.equal(replyQuestion('Done. Which branch should I merge into?'), 'Which branch should I merge into?');
  assert.equal(replyQuestion('See https://example.com/?q=1 for details.'), '');
  assert.equal(thinkingHeading('**Inspecting router**\nDetails here'), 'Inspecting router');
  assert.equal(describeToolCall({ name: 'run_command', args: { CommandLine: '"cargo test"' } }), 'Run cargo test');
  assert.equal(turnEnded([JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [], content: 'All set.' })]), true);
  assert.equal(finalReply([JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [], content: 'All set.' })]), 'All set.');
});

test('swarm reader populates roster, board cards, and worker conversationIds', (t) => {
  const fx = createFixture(t);
  const swarm = readSwarm(fx.appDataDir, fx.ids.convSwarmId);
  assert.ok(swarm);
  assert.equal(swarm.exists, true);
  assert.equal(swarm.count, 3);
  assert.equal(swarm.workerConvIds.has(fx.ids.convWorkerSnoozeId), true);
  assert.equal(swarm.workerConvIds.has(fx.ids.convWorkerCalId), true);

  const byName = new Map(swarm.roster.map((m) => [m.name, m]));
  assert.equal(byName.get('coordinator').role, 'coordinator');
  assert.equal(byName.get('snooze').stateLabel, 'Ready');
  assert.equal(byName.get('calendar-multi').stateLabel, 'Editing');

  assert.equal(swarm.messages.length, 3);
  assert.equal(swarm.messages[1].statusPill, 'cargo test passed (18/18)');
  assert.equal(swarm.messages[2].stateText, 'Working...');
});

test('buildDashboardSnapshot & getThreadDetail deduplicate swarm workers, prioritize triage, and maintain/invalidate etag', async (t) => {
  const fx = createFixture(t);
  const snap = await buildDashboardSnapshot(fx.options);

  assert.equal(snap.mode, 'live');
  assert.equal(snap.summary.projectCount, 2);
  // 4 top-level conversations + 1 cron = 5 threads (the 2 swarm worker convs must NOT be duplicated!)
  assert.equal(snap.summary.threadCount, 5);
  assert.equal(snap.summary.liveSwarmCount, 1);
  assert.equal(snap.summary.needsAttentionCount, 4);

  const allThreadIds = snap.projects.flatMap((p) => p.threads.map((th) => th.id));
  assert.equal(allThreadIds.includes(fx.ids.convWorkerSnoozeId), false);
  assert.equal(allThreadIds.includes(fx.ids.convWorkerCalId), false);
  assert.equal(allThreadIds.includes(fx.ids.convSwarmId), true);

  // Triage priority: approval < error < question < unseen done
  assert.deepEqual(
    snap.needsAttention.map((a) => a.kind),
    ['approval', 'error', 'question', 'done'],
  );
  assert.equal(snap.needsAttention[0].threadId, fx.ids.convSwarmId);
  assert.equal(snap.needsAttention[1].threadId, fx.ids.convErrorId);
  assert.equal(snap.needsAttention[2].threadId, fx.ids.convQuestionId);
  assert.equal(snap.needsAttention[3].threadId, fx.ids.convDoneId);
  assert.equal(snap.needsAttention[3].badgeLabel, 'Done');
  assert.deepEqual(snap.needsAttention[3].actions, ['open', 'dismiss']);

  const alpha = snap.projects.find((p) => p.id === 'alpha-app');
  const beta = snap.projects.find((p) => p.id === 'beta-notes');
  assert.equal(alpha.branch, 'main');
  assert.equal(alpha.worktreeCount, 1);
  assert.deepEqual(alpha.diff, { added: 3, removed: 2 });
  assert.equal(alpha.threads.find((th) => th.id === fx.ids.convDoneId)?.subtitle, 'Done · cargo test passed (18/18)');
  assert.equal(beta.automationCount, 1);
  assert.ok(beta.threads.some((th) => th.isCron && th.subtitle === 'Cron · 09:00'));

  // Detailed thread inspection for swarm + done + cron
  const swarmDetail = await getThreadDetail(fx.ids.convSwarmId, fx.options);
  assert.equal(swarmDetail.swarm.exists, true);
  assert.equal(swarmDetail.swarm.roster.length, 3);
  assert.equal(swarmDetail.diff.length, 1);
  assert.equal(swarmDetail.diff[0].path, 'src/snooze.rs');

  const doneDetail = await getThreadDetail(fx.ids.convDoneId, fx.options);
  assert.ok(doneDetail.files.some((f) => f.path.endsWith('026.sql')));

  const cronThread = beta.threads.find((th) => th.isCron);
  const cronDetail = await getThreadDetail(cronThread.id, fx.options);
  assert.equal(cronDetail.status, 'cron');
  assert.equal(cronDetail.activity[0].from, '@schedule');

  // ETag stability
  const snapAgain = await buildDashboardSnapshot(fx.options);
  assert.equal(snapAgain.etag, snap.etag);

  const unchanged = await buildDashboardSnapshot({ ...fx.options, etag: snap.etag });
  assert.deepEqual(unchanged, { unchanged: true, etag: snap.etag, mode: 'live' });

  // Mutating repo dirty state invalidates etag
  writeFileSync(
    join(fx.repoAlpha, 'src', 'snooze.rs'),
    'pub fn snooze() -> bool {\n    true\n}\n// modified line 1\n// modified line 2\n// modified line 3\n',
  );
  const updatedSnap = await buildDashboardSnapshot({ ...fx.options, etag: snap.etag });
  assert.equal(updatedSnap.unchanged, undefined);
  assert.notEqual(updatedSnap.etag, snap.etag);
  assert.equal(updatedSnap.projects.find((p) => p.id === 'alpha-app').diff.added, 4);
});

test('demo state matches reference dashboard and mutates/resets consistently', () => {
  resetDemoState();
  const snap = getDemoDashboard();
  assert.equal(snap.mode, 'demo');
  assert.deepEqual(snap.summary, {
    projectCount: 4,
    threadCount: 9,
    liveSwarmCount: 1,
    needsAttentionCount: 2,
    runningCount: 3,
  });
  assert.equal(snap.defaultThreadId, 'demo-thread-mail-workflow');
  assert.deepEqual(
    snap.projects.map((p) => p.name),
    ['omarchy-overlook', 'crowbaros', 'omarchy-notes', 'html-hooter'],
  );

  const detail = getDemoThreadDetail('demo-thread-mail-workflow');
  assert.equal(detail.swarm.count, 4);
  assert.equal(detail.files.length, 6);
  assert.equal(detail.diff.length, 6);

  const same = getDemoDashboard({ etag: snap.etag });
  assert.deepEqual(same, { unchanged: true, etag: snap.etag, mode: 'demo' });

  const approveRes = approveDemo({
    attentionId: 'demo-attn-approval-mail',
    threadId: 'demo-thread-mail-workflow',
    note: 'Ship it',
  });
  assert.equal(approveRes.ok, true);

  const replyRes = replyDemo({
    threadId: 'demo-thread-draft-pr',
    message: 'Target release/0.4 please',
    mode: 'Plan',
  });
  assert.equal(replyRes.ok, true);

  const newRes = createDemoThread({
    projectId: 'demo-proj-hooter',
    title: 'Parser Fuzzing',
    prompt: 'Add property tests for tokenizer',
  });
  assert.equal(newRes.ok, true);

  const after = getDemoDashboard();
  assert.notEqual(after.etag, snap.etag);
  assert.equal(after.summary.needsAttentionCount, 0);
  assert.equal(after.summary.threadCount, 10);

  resetDemoState();
  const resetSnap = getDemoDashboard();
  assert.equal(resetSnap.summary.needsAttentionCount, 2);
  assert.equal(resetSnap.summary.threadCount, 9);
});

test('question triage ignores completed conversational replies and surfaces genuine pending ask_question prompts', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mc-question-reg-'));
  t.after(() => {
    clearGitCache();
    clearSeenCache();
    rmSync(root, { recursive: true, force: true });
  });

  const homeDir = join(root, 'home');
  const configDir = join(homeDir, '.gemini', 'config');
  const projectsDir = join(configDir, 'projects');
  const appDataDir = join(homeDir, '.gemini', 'antigravity');
  const brainDir = join(appDataDir, 'brain');
  const repoDir = join(root, 'repo-q');

  for (const d of [projectsDir, brainDir, repoDir]) {
    mkdirSync(d, { recursive: true });
  }
  runGit(repoDir, ['init', '-b', 'main']);
  writeFileSync(join(repoDir, 'README.md'), '# Question Regression\n');
  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '-m', 'init']);

  writeFileSync(
    join(projectsDir, 'repo-q.json'),
    JSON.stringify({
      id: 'repo-q',
      name: 'repo-q',
      projectResources: {
        resources: [{ gitFolder: { folderUri: pathToFileURL(repoDir).href, defaultBranch: 'main' } }],
      },
    }),
  );

  const convDoneReplyQ = '10101010-1111-4111-8111-111111111111';
  const convAnsweredAsk = '20202020-2222-4222-8222-222222222222';
  const convPendingSwarmAsk = '30303030-3333-4333-8333-333333333333';

  const writeTr = (convId, title, steps, swarm = null) => {
    const cDir = join(brainDir, convId);
    const logsDir = join(cDir, '.system_generated', 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(cDir, 'metadata.json'),
      JSON.stringify({ title, workspace_uris: [pathToFileURL(repoDir).href] }),
    );
    writeFileSync(
      join(logsDir, 'transcript.jsonl'),
      steps.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );
    if (swarm) {
      const sDir = join(cDir, '.system_generated', 'swarm');
      mkdirSync(sDir, { recursive: true });
      writeFileSync(join(sDir, 'members.json'), JSON.stringify(swarm.membersJson));
      writeFileSync(join(sDir, 'board.jsonl'), swarm.board.map((b) => JSON.stringify(b)).join('\n') + '\n');
    }
  };

  const baseMs = Date.now() + 1000;
  const isoAt = (offsetMs) => new Date(baseMs + offsetMs).toISOString();

  // 1. Completed turn whose reply ends with '?' must NOT trigger Question triage
  writeTr(convDoneReplyQ, 'Done conversational question', [
    { step_index: 0, type: 'USER_INPUT', content: 'Review themes', created_at: isoAt(500) },
    {
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [],
      content: 'Reviewed all theme tokens.\n\nWhat would you like to tackle first?',
      created_at: isoAt(1000),
    },
  ]);

  // 2. Already-answered ask_question (DONE result) must NOT trigger Question triage
  writeTr(convAnsweredAsk, 'Answered ask_question', [
    { step_index: 0, type: 'USER_INPUT', content: 'Deploy app', created_at: isoAt(0) },
    {
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      tool_calls: [{ name: 'ask_question', args: { question: '"Deploy to staging or prod?"' } }],
      created_at: isoAt(100),
    },
    { step_index: 2, type: 'GENERIC', status: 'DONE', content: 'User answered: staging', created_at: isoAt(200) },
    {
      step_index: 3,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [],
      content: 'Deployed cleanly to staging.',
      created_at: isoAt(300),
    },
  ]);

  // 3. Genuinely pending ask_question inside a Swarm coordinator thread MUST appear in triage & Inspector activity
  writeTr(
    convPendingSwarmAsk,
    'Pending swarm question',
    [
      { step_index: 0, type: 'USER_INPUT', content: 'Configure release target', created_at: isoAt(1200) },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        tool_calls: [
          {
            name: 'ask_question',
            args: {
              questions: JSON.stringify([
                {
                  question: 'Which release branch should we tag?',
                  options: ['main', 'release/0.4'],
                },
              ]),
            },
          },
        ],
        created_at: isoAt(1500),
      },
    ],
    {
      membersJson: {
        title: 'Pending swarm question',
        members: {
          coordinator: { role: 'coordinator', conversation_id: convPendingSwarmAsk, wake_mode: 'mentions' },
        },
      },
      board: [
        { seq: 1, agent: 'coordinator', text: 'Waiting on release branch selection', time: '2026-11-24 07:40:00' },
      ],
    },
  );

  const doneSummary = summarizeTranscript(appDataDir, convDoneReplyQ).summary;
  assert.equal(doneSummary.askQuestion, '');

  const answeredSummary = summarizeTranscript(appDataDir, convAnsweredAsk).summary;
  assert.equal(answeredSummary.askQuestion, '');

  const pendingSummary = summarizeTranscript(appDataDir, convPendingSwarmAsk).summary;
  assert.equal(pendingSummary.askQuestion, 'Which release branch should we tag?');

  const opts = {
    homeDir,
    configDir,
    projectsDir,
    appDataDirs: [appDataDir],
    pluginsDir: [join(configDir, 'plugins')],
    sidecarDirs: [join(configDir, 'sidecars')],
    seenStorePath: join(root, 'seen.json'),
    useAgentApi: false,
    includePr: false,
    gitCacheTtlMs: 0,
  };

  const snap = await buildDashboardSnapshot(opts);
  assert.deepEqual(snap.needsAttention.map((a) => [a.kind, a.threadId]), [
    ['question', convPendingSwarmAsk],
    ['done', convDoneReplyQ],
    ['done', convAnsweredAsk],
  ]);
  assert.equal(snap.needsAttention[0].summary, 'Which release branch should we tag?');

  const proj = snap.projects.find((p) => p.id === 'repo-q');
  assert.equal(proj.threads.find((th) => th.id === convDoneReplyQ)?.status, 'done');
  assert.equal(proj.threads.find((th) => th.id === convDoneReplyQ)?.unseen, true);
  assert.equal(proj.threads.find((th) => th.id === convAnsweredAsk)?.status, 'done');
  assert.equal(proj.threads.find((th) => th.id === convPendingSwarmAsk)?.needsAttention, true);

  // Marking convDoneReplyQ as seen persists to disk, invalidates etag, and removes Done card
  const seenRes = markThreadSeen(convDoneReplyQ, Date.now() + 4000, opts);
  assert.equal(seenRes.persisted, true);
  const afterSeen = await buildDashboardSnapshot({ ...opts, etag: snap.etag });
  assert.equal(afterSeen.unchanged, undefined);
  assert.notEqual(afterSeen.etag, snap.etag);
  assert.deepEqual(afterSeen.needsAttention.map((a) => [a.kind, a.threadId]), [
    ['question', convPendingSwarmAsk],
    ['done', convAnsweredAsk],
  ]);
  assert.equal(
    afterSeen.projects.find((p) => p.id === 'repo-q').threads.find((th) => th.id === convDoneReplyQ)?.unseen,
    false,
  );

  // Active open conversationId automatically marks convAnsweredAsk as seen
  const afterOpen = await buildDashboardSnapshot({ ...opts, conversationId: convAnsweredAsk });
  assert.deepEqual(afterOpen.needsAttention.map((a) => [a.kind, a.threadId]), [
    ['question', convPendingSwarmAsk],
  ]);

  // Appending a newer completed turn after seenAtMs bubbles convDoneReplyQ back into Needs Attention
  const newerIso = new Date(Date.now() + 10_000).toISOString();
  writeFileSync(
    join(brainDir, convDoneReplyQ, '.system_generated', 'logs', 'transcript.jsonl'),
    [
      JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Review themes', created_at: isoAt(2000) }),
      JSON.stringify({
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        tool_calls: [],
        content: 'Follow-up turn finished cleanly.',
        created_at: newerIso,
      }),
    ].join('\n') + '\n',
  );
  const afterNewTurn = await buildDashboardSnapshot(opts);
  assert.deepEqual(afterNewTurn.needsAttention.map((a) => [a.kind, a.threadId]), [
    ['question', convPendingSwarmAsk],
    ['done', convDoneReplyQ],
  ]);

  const detail = await getThreadDetail(convPendingSwarmAsk, opts);
  const qActivity = detail.activity.find((a) => a.badge?.text === 'Needs answer');
  assert.ok(qActivity, 'Expected pending question card in Inspector activity');
  assert.equal(qActivity.body, 'Which release branch should we tag?');
  assert.equal(qActivity.badge.tone, 'amber');
  assert.equal(qActivity.stateText, 'Waiting for reply');
});

test('parseConversationMetadata & project matching unwrap agentapi metadata, ignore symlinked plugins, and hide subagents', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mc-proj-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const homeDir = join(root, 'home');
  const configDir = join(homeDir, '.gemini', 'config');
  const projectsDir = join(configDir, 'projects');
  const pluginsDir = join(configDir, 'plugins');
  const appDataDir = join(homeDir, '.gemini', 'antigravity');
  const brainDir = join(appDataDir, 'brain');

  // Deliberately make mission-control repo path longer than crowbaros path.
  const crowbarDir = join(root, 'coding', 'crowbaros');
  const mcRepoDir = join(root, 'coding', 'mission-control-plugin-repo');

  for (const d of [projectsDir, pluginsDir, brainDir, crowbarDir, mcRepoDir]) {
    mkdirSync(d, { recursive: true });
  }
  // Global plugin symlink pointing to the longer-named plugin repo.
  symlinkSync(mcRepoDir, join(pluginsDir, 'mission-control'));

  const projCrowbarId = 'ee81dc3e-2b8b-4b34-a750-097d5c67175b';
  const projMcId = '95a00b3a-f35c-41ef-b232-1cf7601c330e';

  writeFileSync(
    join(projectsDir, 'crowbaros.json'),
    JSON.stringify({
      id: projCrowbarId,
      name: 'crowbaros',
      projectResources: { resources: [{ gitFolder: { folderUri: pathToFileURL(crowbarDir).href } }] },
    }),
  );
  writeFileSync(
    join(projectsDir, 'mission-control.json'),
    JSON.stringify({
      id: projMcId,
      name: 'mission-control',
      projectResources: { resources: [{ gitFolder: { folderUri: pathToFileURL(mcRepoDir).href } }] },
    }),
  );

  // Verify real agentapi nested envelope unwrapping.
  const convCrowbar = '7a151314-2099-453d-bc6b-6ae832c1212d';
  const convSubagent = 'd67d19a9-3aeb-4e5c-af3f-f96cddc16ab1';

  const parsedTop = parseConversationMetadata({
    response: {
      conversationMetadata: {
        metadata: {
          projectId: projCrowbarId,
          parentConversationId: '',
          rootConversationId: convCrowbar,
          nestingDepth: 0,
          workspaceUris: [pathToFileURL(crowbarDir).href],
          workspaces: [{ workspaceFolderAbsoluteUri: pathToFileURL(crowbarDir).href }],
          subagentSpec: null,
        },
      },
    },
  });
  assert.equal(parsedTop.projectId, projCrowbarId);
  assert.deepEqual(parsedTop.workspaceUris, [pathToFileURL(crowbarDir).href]);
  assert.equal(parsedTop.isSubagent, false);

  const parsedSub = parseConversationMetadata({
    response: {
      conversationMetadata: {
        metadata: {
          projectId: projMcId,
          parentConversationId: convCrowbar,
          rootConversationId: convCrowbar,
          nestingDepth: 1,
          subagentSpec: { typeName: 'browser', role: 'Visual QA' },
        },
      },
    },
  });
  assert.equal(parsedSub.parentConversationId, convCrowbar);
  assert.equal(parsedSub.isSubagent, true);

  // Write transcript for convCrowbar that reads files in crowbarDir AND via the symlinked plugin.
  mkdirSync(join(brainDir, convCrowbar, '.system_generated', 'logs'), { recursive: true });
  writeFileSync(
    join(brainDir, convCrowbar, '.system_generated', 'logs', 'transcript.jsonl'),
    [
      JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Theme studio work' }),
      JSON.stringify({
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        status: 'RUNNING',
        tool_calls: [
          { name: 'read_file', args: { Path: `"${join(pluginsDir, 'mission-control', 'SKILL.md')}"` } },
          { name: 'read_file', args: { Path: `"${join(crowbarDir, 'README.md')}"` } },
          { name: 'read_file', args: { Path: `"${join(crowbarDir, 'theme.rs')}"` } },
        ],
      }),
    ].join('\n') + '\n',
  );

  // Also add an isolated child subagent transcript that would otherwise land in General or a project.
  mkdirSync(join(brainDir, convSubagent, '.system_generated', 'logs'), { recursive: true });
  writeFileSync(
    join(brainDir, convSubagent, '.system_generated', 'logs', 'transcript.jsonl'),
    [JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Subagent task' })].join('\n') + '\n',
  );

  const baseOpts = {
    homeDir,
    configDir,
    projectsDir,
    appDataDirs: [appDataDir],
    pluginsDir: [pluginsDir],
    sidecarDirs: [join(configDir, 'sidecars')],
    seenStorePath: join(root, 'seen.json'),
    includePr: false,
    gitCacheTtlMs: 0,
  };

  // 1) With agentapi metadata: routes convCrowbar -> crowbaros and excludes child subagent.
  const snapWithMeta = await buildDashboardSnapshot({
    ...baseOpts,
    useAgentApi: true,
    getConversationMetadata: async (id) => (id === convCrowbar ? parsedTop : parsedSub),
  });
  const crowbarProj = snapWithMeta.projects.find((p) => p.id === projCrowbarId);
  const mcProj = snapWithMeta.projects.find((p) => p.id === projMcId);
  assert.equal(crowbarProj.threads.length, 1);
  assert.equal(crowbarProj.threads[0].id, convCrowbar);
  assert.equal(mcProj.threads.length, 0);
  assert.equal(snapWithMeta.projects.find((p) => p.id === 'unassigned'), undefined);

  // 2) Even with useAgentApi: false, fallback ignores /.gemini/config/plugins/ symlink & picks crowbaros by count.
  const snapFallback = await buildDashboardSnapshot({
    ...baseOpts,
    useAgentApi: false,
  });
  const crowbarFallback = snapFallback.projects.find((p) => p.id === projCrowbarId);
  const mcFallback = snapFallback.projects.find((p) => p.id === projMcId);
  assert.equal(crowbarFallback.threads.some((th) => th.id === convCrowbar), true);
  assert.equal(mcFallback.threads.length, 0);
});
