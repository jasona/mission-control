import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { resetActionsState } from '../lib/actions.mjs';
import { resetDemoState } from '../lib/demo.mjs';
import { clearGitCache } from '../lib/git.mjs';
import { clearSeenCache } from '../lib/seen.mjs';
import { clearUsageCache } from '../lib/usage.mjs';
import { startStandaloneServer } from '../main.mjs';
import { renderInspectorContent } from '../public/views/inspector.js';
import { renderOverview } from '../public/views/overview.js';

function createLiveServerFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mc-srv-live-'));
  t.after(() => {
    clearGitCache();
    clearSeenCache();
    resetActionsState();
    rmSync(root, { recursive: true, force: true });
  });

  const homeDir = join(root, 'home');
  const configDir = join(homeDir, '.gemini', 'config');
  const projectsDir = join(configDir, 'projects');
  const appDataDir = join(homeDir, '.gemini', 'antigravity');
  const brainDir = join(appDataDir, 'brain');
  const repoDir = join(root, 'repo-live');

  for (const d of [projectsDir, brainDir, repoDir]) {
    mkdirSync(d, { recursive: true });
  }

  execFileSync('git', ['-C', repoDir, 'init', '-b', 'main'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(repoDir, 'index.js'), 'export const ok = true;\n');
  execFileSync('git', ['-C', repoDir, 'add', '.'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('git', ['-C', repoDir, 'commit', '-m', 'init'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  writeFileSync(join(repoDir, 'index.js'), 'export const ok = false;\nexport const two = 2;\n');

  const convId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const convLogsDir = join(brainDir, convId, '.system_generated', 'logs');
  mkdirSync(convLogsDir, { recursive: true });
  writeFileSync(
    join(brainDir, convId, 'metadata.json'),
    JSON.stringify({
      title: 'Live Fixture <img src=x onerror=alert(1)>',
      workspace_uris: [pathToFileURL(repoDir).href],
    }),
  );
  writeFileSync(
    join(convLogsDir, 'transcript.jsonl'),
    [
      JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Check live repo' }),
      JSON.stringify({
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        tool_calls: [{ name: 'ask_question', args: { question: '"Proceed with <script>alert(1)</script>?"' } }],
      }),
    ].join('\n') + '\n',
  );

  const convDoneId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const convDoneLogsDir = join(brainDir, convDoneId, '.system_generated', 'logs');
  mkdirSync(convDoneLogsDir, { recursive: true });
  writeFileSync(
    join(brainDir, convDoneId, 'metadata.json'),
    JSON.stringify({
      title: 'Finished Background Job',
      workspace_uris: [pathToFileURL(repoDir).href],
    }),
  );
  writeFileSync(
    join(convDoneLogsDir, 'transcript.jsonl'),
    [
      JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Run tests' }),
      JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [], content: 'All checks completed cleanly.' }),
    ].join('\n') + '\n',
  );

  writeFileSync(
    join(projectsDir, 'live-repo.json'),
    JSON.stringify({
      id: 'live-repo',
      name: 'live-repo',
      projectResources: {
        resources: [{ gitFolder: { folderUri: pathToFileURL(repoDir).href, defaultBranch: 'main' } }],
      },
    }),
  );

  return {
    convId,
    convDoneId,
    serverOptions: {
      port: 0,
      demo: false,
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
    },
  };
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: JSON.parse(text), raw: text };
}

test('standalone demo server serves static assets, preload stub, dashboard etag, thread detail, and demo mutations', async (t) => {
  resetDemoState();
  const srv = await startStandaloneServer({ port: 0, demo: true });
  t.after(async () => {
    resetDemoState();
    await srv.close();
  });

  // Static routes
  const htmlRes = await fetch(`${srv.url}/`);
  assert.equal(htmlRes.status, 200);
  assert.match(htmlRes.headers.get('content-type') || '', /text\/html/);
  const htmlText = await htmlRes.text();
  assert.match(htmlText, /Mission Control/);
  assert.match(htmlText, /data-view="usage"/);
  assert.match(htmlText, /\/preload\.js/);
  assert.match(htmlText, /<script src="\/app\.js(?:\?v=[a-f0-9]+)?"><\/script>/);
  assert.equal(/type=["']module["']/.test(htmlText), false);

  const cssRes = await fetch(`${srv.url}/styles.css`);
  assert.equal(cssRes.status, 200);
  assert.match(cssRes.headers.get('content-type') || '', /text\/css/);
  const cssText = await cssRes.text();
  assert.match(cssText, /--background/);

  const appRes = await fetch(`${srv.url}/app.js`);
  assert.equal(appRes.status, 200);
  assert.match(appRes.headers.get('content-type') || '', /application\/javascript/);
  const appJsText = await appRes.text();
  assert.doesNotThrow(() => new Function(appJsText));

  for (const jsRoute of [
    '/views/overview.js',
    '/views/board.js',
    '/views/timeline.js',
    '/views/graph.js',
    '/views/inspector.js',
    '/views/usage.js',
    '/components/modal.js',
    '/components/icons.js',
  ]) {
    const modRes = await fetch(`${srv.url}${jsRoute}`);
    assert.equal(modRes.status, 200, `${jsRoute} should return 200`);
    assert.match(modRes.headers.get('content-type') || '', /application\/javascript/);
  }

  const preloadRes = await fetch(`${srv.url}/preload.js`);
  assert.equal(preloadRes.status, 200);
  assert.match(preloadRes.headers.get('content-type') || '', /application\/javascript/);
  const preloadText = await preloadRes.text();
  assert.match(preloadText, /window\.sidecar/);
  assert.match(preloadText, /#0d0e11/);

  // Demo usage endpoint
  const usageRes = await fetchJson(`${srv.url}/api/usage`);
  assert.equal(usageRes.status, 200);
  assert.equal(usageRes.json.mode, 'demo');
  assert.equal(usageRes.json.available, true);
  assert.equal(usageRes.json.summary.hasWeeklyData, true);
  assert.equal(usageRes.json.pools.length, 3);
  assert.equal(typeof usageRes.json.pools[0].weekly?.remainingPct, 'number');
  assert.equal(typeof usageRes.json.pools[0].weekly?.usedPct, 'number');
  assert.ok(usageRes.json.families.length >= 5);
  assert.ok(usageRes.json.models.length >= 20);
  assert.equal(usageRes.json.credits.length, 1);

  // Dashboard + etag unchanged check
  const dash1 = await fetchJson(`${srv.url}/api/dashboard`);
  assert.equal(dash1.status, 200);
  assert.equal(dash1.json.mode, 'demo');
  assert.equal(dash1.json.projects.length, 4);
  assert.equal(dash1.json.needsAttention.length, 2);

  const dashUnchanged = await fetchJson(`${srv.url}/api/dashboard?etag=${encodeURIComponent(dash1.json.etag)}`);
  assert.equal(dashUnchanged.status, 200);
  assert.deepEqual(dashUnchanged.json, {
    unchanged: true,
    etag: dash1.json.etag,
    mode: 'demo',
  });

  // Thread detail + invalid/missing checks
  const detailRes = await fetchJson(`${srv.url}/api/thread?id=demo-thread-mail-workflow`);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.json.swarm.roster.length, 4);
  assert.equal(detailRes.json.diff.length, 6);

  const invalidId = await fetchJson(`${srv.url}/api/thread?id=invalid`);
  assert.equal(invalidId.status, 400);
  assert.equal(invalidId.json.ok, false);

  const missingThread = await fetchJson(`${srv.url}/api/thread?id=demo-does-not-exist`);
  assert.equal(missingThread.status, 404);
  assert.equal(missingThread.json.ok, false);

  // POST /api/approve validation + demo mutation
  const badApprove = await fetchJson(`${srv.url}/api/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(badApprove.status, 400);

  const goodApprove = await fetchJson(`${srv.url}/api/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attentionId: 'demo-attn-approval-mail',
      threadId: 'demo-thread-mail-workflow',
      note: 'Approved in test',
    }),
  });
  assert.equal(goodApprove.status, 200);
  assert.equal(goodApprove.json.ok, true);
  assert.equal(goodApprove.json.mode, 'demo');

  // POST /api/reply validation + demo mutation
  const badReply = await fetchJson(`${srv.url}/api/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: 'demo-thread-draft-pr', message: '   ' }),
  });
  assert.equal(badReply.status, 400);

  const goodReply = await fetchJson(`${srv.url}/api/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId: 'demo-thread-draft-pr',
      message: 'Target release/0.4',
      mode: 'Auto',
    }),
  });
  assert.equal(goodReply.status, 200);
  assert.equal(goodReply.json.ok, true);

  // POST /api/threads/new validation + demo mutation + XSS escaping check
  const badNew = await fetchJson(`${srv.url}/api/threads/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'demo-proj-hooter' }),
  });
  assert.equal(badNew.status, 400);

  const xssTitle = '<script>alert("xss")</script> & "quoted"';
  const xssPrompt = '<img src=x onerror=alert(1)> investigate parser';
  const goodNew = await fetchJson(`${srv.url}/api/threads/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: 'demo-proj-hooter',
      title: xssTitle,
      prompt: xssPrompt,
    }),
  });
  assert.equal(goodNew.status, 200);
  assert.equal(goodNew.json.ok, true);

  const updatedDash = await fetchJson(`${srv.url}/api/dashboard`);
  assert.equal(updatedDash.json.needsAttention.length, 0);
  assert.equal(updatedDash.json.summary.threadCount, 10);

  const createdDetail = await fetchJson(`${srv.url}/api/thread?id=${encodeURIComponent(goodNew.json.threadId)}`);
  assert.equal(createdDetail.status, 200);

  const overviewHtml = renderOverview(updatedDash.json, {
    filter: 'all',
    searchQuery: '',
    selectedThreadId: goodNew.json.threadId,
  });
  assert.equal(overviewHtml.includes('<script>alert'), false);
  assert.ok(overviewHtml.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));

  const inspectorHtml = renderInspectorContent(createdDetail.json, { inspectorTab: 'activity' });
  assert.equal(inspectorHtml.includes('<img src=x onerror=alert(1)>'), false);
  assert.ok(inspectorHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('live workspace fixture server handles live telemetry, ?demo=1, invalid/weird inputs, and 503 LS unavailable', async (t) => {
  resetDemoState();
  const fx = createLiveServerFixture(t);
  const srv = await startStandaloneServer(fx.serverOptions);
  t.after(async () => {
    resetDemoState();
    await srv.close();
  });

  // Live dashboard (includes 1 question + 1 unseen done thread)
  const liveDash = await fetchJson(`${srv.url}/api/dashboard`);
  assert.equal(liveDash.status, 200);
  assert.equal(liveDash.json.mode, 'live');
  assert.equal(liveDash.json.projects.length, 1);
  assert.equal(liveDash.json.projects[0].id, 'live-repo');
  assert.deepEqual(liveDash.json.projects[0].diff, { added: 2, removed: 1 });
  assert.equal(liveDash.json.needsAttention.length, 2);
  assert.deepEqual(liveDash.json.needsAttention.map((a) => a.kind), ['question', 'done']);

  // Live etag unchanged check
  const liveUnchanged = await fetchJson(`${srv.url}/api/dashboard?etag=${encodeURIComponent(liveDash.json.etag)}`);
  assert.equal(liveUnchanged.status, 200);
  assert.deepEqual(liveUnchanged.json, {
    unchanged: true,
    etag: liveDash.json.etag,
    mode: 'live',
  });

  // POST /api/seen validation and clearing unseen done card
  const badSeen = await fetchJson(`${srv.url}/api/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: 'invalid' }),
  });
  assert.equal(badSeen.status, 400);

  const goodSeen = await fetchJson(`${srv.url}/api/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: fx.convDoneId, seenAtMs: Date.now() + 5000 }),
  });
  assert.equal(goodSeen.status, 200);
  assert.equal(goodSeen.json.ok, true);
  assert.equal(goodSeen.json.mode, 'live');

  const dashAfterSeen = await fetchJson(`${srv.url}/api/dashboard`);
  assert.equal(dashAfterSeen.json.needsAttention.length, 1);
  assert.equal(dashAfterSeen.json.needsAttention[0].kind, 'question');
  assert.notEqual(dashAfterSeen.json.etag, liveDash.json.etag);

  // ?demo=1 switches seamlessly on live server
  const demoOverride = await fetchJson(`${srv.url}/api/dashboard?demo=1`);
  assert.equal(demoOverride.status, 200);
  assert.equal(demoOverride.json.mode, 'demo');
  assert.equal(demoOverride.json.projects.length, 4);

  // Live thread detail + XSS escaping check on live transcript/title
  const liveDetail = await fetchJson(`${srv.url}/api/thread?id=${fx.convId}`);
  assert.equal(liveDetail.status, 200);
  assert.equal(liveDetail.json.diff.length, 1);
  assert.equal(liveDetail.json.diff[0].path, 'index.js');

  const liveOverviewHtml = renderOverview(liveDash.json, {
    filter: 'all',
    searchQuery: '',
    selectedThreadId: fx.convId,
  });
  assert.equal(liveOverviewHtml.includes('<img src=x onerror=alert(1)>'), false);
  assert.ok(liveOverviewHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));

  const liveInspectorHtml = renderInspectorContent(liveDetail.json, { inspectorTab: 'activity' });
  assert.equal(liveInspectorHtml.includes('<script>alert(1)</script>'), false);

  // Weird / malicious inputs never crash and return safe JSON error codes
  const weirdIdRes = await fetchJson(`${srv.url}/api/thread?id=${encodeURIComponent('../../etc/passwd<script>')}`);
  assert.equal(weirdIdRes.status, 400);
  assert.equal(weirdIdRes.json.ok, false);

  const notFoundLive = await fetchJson(`${srv.url}/api/thread?id=99999999-9999-4999-8999-999999999999`);
  assert.equal(notFoundLive.status, 404);

  const malformedJson = await fetch(`${srv.url}/api/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"broken":',
  });
  assert.equal(malformedJson.status, 400);

  const arrayBody = await fetchJson(`${srv.url}/api/threads/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '[]',
  });
  assert.equal(arrayBody.status, 400);

  // Validation errors on live server
  const missingLiveFields = await fetchJson(`${srv.url}/api/threads/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: '../bad', prompt: 'hello' }),
  });
  assert.equal(missingLiveFields.status, 400);

  // Unavailable agentapi returns 503 cleanly without touching host LS
  const prevExe = process.env.ANTIGRAVITY_AGENTAPI_EXE;
  process.env.ANTIGRAVITY_AGENTAPI_EXE = join(tmpdir(), 'nonexistent-agentapi-binary-for-test');
  t.after(() => {
    if (prevExe === undefined) delete process.env.ANTIGRAVITY_AGENTAPI_EXE;
    else process.env.ANTIGRAVITY_AGENTAPI_EXE = prevExe;
    resetActionsState();
  });

  const lsDownRes = await fetchJson(`${srv.url}/api/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: fx.convId, message: 'Proceed' }),
  });
  assert.equal(lsDownRes.status, 503);
  assert.equal(lsDownRes.json.ok, false);
  assert.equal(lsDownRes.json.code, 'LS_UNAVAILABLE');

  // Method check & graceful unavailable live /api/usage without LS config
  clearUsageCache();
  const postUsageRes = await fetchJson(`${srv.url}/api/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(postUsageRes.status, 405);

  const srvNoLs = await startStandaloneServer({
    ...fx.serverOptions,
    lsAddress: '',
    csrfToken: '',
  });
  t.after(async () => srvNoLs.close());
  const noLsUsage = await fetchJson(`${srvNoLs.url}/api/usage`);
  assert.equal(noLsUsage.status, 200);
  assert.equal(noLsUsage.json.available, false);
  assert.equal(noLsUsage.json.code, 'LS_NOT_CONFIGURED');

  // Live /api/usage with injected usageFetcher returns normalized pools without PII
  const srvMockLs = await startStandaloneServer({
    ...fx.serverOptions,
    usageFetcher: async () => ({
      userStatus: {
        name: 'Private Name',
        email: 'private@example.com',
        userTier: { id: 'pro', name: 'Google AI Pro' },
        cascadeModelConfigData: {
          clientModelConfigs: [
            {
              modelId: 'gemini-4-neon-high',
              label: 'Gemini 4 Neon (High)',
              quotaInfo: { remainingFraction: 0.72, resetTime: '2026-11-24T23:47:42Z' },
            },
          ],
        },
      },
    }),
  });
  t.after(async () => srvMockLs.close());
  const mockLiveUsage = await fetchJson(`${srvMockLs.url}/api/usage`);
  assert.equal(mockLiveUsage.status, 200);
  assert.equal(mockLiveUsage.json.available, true);
  assert.equal(mockLiveUsage.json.mode, 'live');
  assert.equal(mockLiveUsage.json.pools[0].name, 'Gemini Pool');
  assert.equal(mockLiveUsage.json.pools[0].remainingPct, 72);
  assert.equal(JSON.stringify(mockLiveUsage.json).includes('private@example.com'), false);
});
