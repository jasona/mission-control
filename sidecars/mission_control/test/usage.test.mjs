import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearUsageCache,
  getDemoUsageSnapshot,
  getUsageSnapshot,
  normalizeUserStatus,
} from '../lib/usage.mjs';
import { renderUsage } from '../public/views/usage.js';

function makeSampleRawStatus(nowMs = Date.UTC(2026, 10, 24, 18, 0, 0)) {
  const geminiReset = new Date(nowMs + 2 * 60 * 60 * 1000).toISOString();
  const partnerReset = new Date(nowMs + 5 * 60 * 60 * 1000).toISOString();

  return {
    userStatus: {
      name: 'Sensitive Real Name',
      email: 'secret-user@example.com',
      profilePictureUrl: 'data:image/jpeg;base64,SENSITIVE_AVATAR_BYTES',
      userTier: {
        id: 'g1-ultra-lite-tier',
        name: 'Google AI Ultra',
        description: 'Google AI Ultra',
        availableCredits: [
          { creditType: 'GOOGLE_ONE_AI', creditAmount: '125', minimumCreditAmountForUsage: '50' },
        ],
      },
      planStatus: {
        planInfo: {
          teamsTier: 'TEAMS_TIER_PRO',
          planName: 'Pro',
          monthlyPromptCredits: 50000,
          monthlyFlowCredits: 150000,
        },
        availablePromptCredits: 500,
        availableFlowCredits: 100,
      },
      cascadeModelConfigData: {
        defaultOverrideModelConfig: { modelOrAlias: { model: 'MODEL_PLACEHOLDER_DEFAULT' } },
        clientModelSorts: [
          {
            name: 'Recommended',
            groups: [
              {
                modelLabels: [
                  'Gemini 4 Neon (High)',
                  'Gemini 4 Neon (Low)',
                  'Orchestrator (Neon)',
                  'Claude Opus 5.5 (High)',
                  'GPT-OSS 120B (Medium)',
                ],
              },
            ],
          },
        ],
        groupedModels: {
          'gemini-4-neon': {
            displayName: 'Gemini 4 Neon',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
            ],
          },
        },
        clientModelConfigs: [
          {
            modelId: 'gpt-oss-120b-medium',
            label: 'GPT-OSS 120B (Medium)',
            modelOrAlias: { model: 'MODEL_GPT' },
            quotaInfo: { remainingFraction: 1, resetTime: partnerReset },
            tagTitle: 'Notice',
            tagDescription: 'Leaving Nov 30',
          },
          {
            modelId: 'claude-opus-5-5-high',
            label: 'Claude Opus 5.5 (High)',
            modelOrAlias: { model: 'MODEL_CLAUDE' },
            // Proto3 omits 0.0 remainingFraction while keeping resetTime
            quotaInfo: { resetTime: partnerReset },
          },
          {
            modelId: 'gemini-4-neon-low',
            label: 'Gemini 4 Neon (Low)',
            modelOrAlias: { model: 'MODEL_NEON_LOW' },
            quotaInfo: { remainingFraction: 0.87, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-neon-high',
            label: 'Gemini 4 Neon (High)',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_DEFAULT' },
            quotaInfo: { remainingFraction: 0.87, resetTime: geminiReset },
            tagTitle: 'New',
            tagDescription: 'Deep reasoning',
          },
          {
            modelId: 'gemini-pro-orchestrator-neon',
            label: 'Orchestrator (Neon)',
            modelOrAlias: { model: 'MODEL_ORCH' },
            quotaInfo: { remainingFraction: 0.87, resetTime: geminiReset },
          },
        ],
      },
    },
  };
}

test('normalizeUserStatus collapses families, handles proto3 0% exhausted, separates pools, and omits PII', () => {
  const nowMs = Date.UTC(2026, 10, 24, 18, 0, 0);
  const snap = normalizeUserStatus(makeSampleRawStatus(nowMs), { nowMs, mode: 'live' });

  assert.equal(snap.ok, true);
  assert.equal(snap.available, true);
  assert.equal(snap.plan.name, 'Google AI Ultra');
  assert.equal(snap.credits.length, 1);
  assert.equal(snap.credits[0].label, 'Google AI Credits');
  assert.equal(snap.credits[0].amount, 125);
  assert.equal(snap.planCredits.promptAvailable, 500);
  assert.equal(snap.planCredits.flowAvailable, 100);

  // Order follows clientModelSorts
  assert.equal(snap.models[0].label, 'Gemini 4 Neon (High)');
  assert.equal(snap.models[0].isDefault, true);
  assert.equal(snap.models[0].remainingPct, 87);

  // Claude omitted remainingFraction -> 0% exhausted
  const claude = snap.models.find((m) => m.id === 'claude-opus-5-5-high');
  assert.equal(claude.remainingFraction, 0);
  assert.equal(claude.remainingPct, 0);
  assert.equal(claude.status, 'exhausted');
  assert.equal(claude.tone, 'red');

  // Gemini 4 Neon collapsed to 1 family with Low/High thinking levels
  assert.equal(snap.families.length, 4);
  const neonFam = snap.families.find((f) => f.id === 'gemini-4-neon');
  assert.equal(neonFam.displayName, 'Gemini 4 Neon');
  assert.deepEqual(neonFam.thinkingLevels, ['Low', 'High']);
  assert.equal(neonFam.variantCount, 2);
  assert.equal(neonFam.isDefault, true);

  // Pools: Exhausted Claude (0%), Healthy Gemini (87%), Full GPT (100%)
  assert.equal(snap.pools.length, 3);
  assert.deepEqual(
    snap.pools.map((p) => [p.name, p.remainingPct, p.status]),
    [
      ['Claude Pool', 0, 'exhausted'],
      ['Gemini Pool', 87, 'healthy'],
      ['GPT Pool', 100, 'healthy'],
    ],
  );
  assert.equal(snap.summary.exhaustedPoolCount, 1);
  assert.equal(snap.summary.lowPoolCount, 1);
  assert.equal(snap.summary.lowestRemainingPct, 0);

  // Zero PII leakage
  const serialized = JSON.stringify(snap);
  assert.equal(serialized.includes('Sensitive Real Name'), false);
  assert.equal(serialized.includes('secret-user@example.com'), false);
  assert.equal(serialized.includes('SENSITIVE_AVATAR_BYTES'), false);
  assert.equal(serialized.includes('profilePictureUrl'), false);
});

test('normalizeUserStatus keeps Gemini separate from Claude & GPT even at identical 100% reset window', () => {
  const nowMs = Date.UTC(2026, 10, 24, 18, 0, 0);
  const sameReset = new Date(nowMs + 4 * 60 * 60 * 1000).toISOString();
  const snap = normalizeUserStatus(
    {
      userStatus: {
        cascadeModelConfigData: {
          clientModelConfigs: [
            { modelId: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)', quotaInfo: { remainingFraction: 1, resetTime: sameReset } },
            { modelId: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)', quotaInfo: { remainingFraction: 1, resetTime: sameReset } },
            { modelId: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)', quotaInfo: { remainingFraction: 1, resetTime: sameReset } },
          ],
        },
      },
    },
    { nowMs, mode: 'live' },
  );

  assert.equal(snap.pools.length, 2);
  assert.deepEqual(
    snap.pools.map((p) => p.name),
    ['Gemini Pool', 'Claude & GPT Pool'],
  );
});

test('normalizeUserStatus merges RetrieveUserQuotaSummary weekly & 5h limits and reconciles stale 5h reset', () => {
  const nowMs = Date.UTC(2026, 10, 25, 3, 41, 0);
  const stale5hReset = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
  const fresh5hReset = new Date(nowMs + 2 * 60 * 60 * 1000).toISOString();
  const futurePartner5hReset = new Date(nowMs + 4 * 60 * 60 * 1000).toISOString();
  const geminiWeeklyReset = new Date(nowMs + 5 * 24 * 60 * 60 * 1000).toISOString();
  const partnerWeeklyReset = new Date(nowMs + 6 * 24 * 60 * 60 * 1000).toISOString();

  const rawStatus = makeSampleRawStatus(nowMs);
  // Set Gemini in GetUserStatus to fresh future 5h window (75%) and Claude/GPT exhausted weekly via summary
  for (const m of rawStatus.userStatus.cascadeModelConfigData.clientModelConfigs) {
    if (m.modelId.startsWith('gemini-') || m.modelId.startsWith('orchestrator')) {
      m.quotaInfo = { remainingFraction: 0.75, resetTime: fresh5hReset };
    } else if (m.modelId.startsWith('claude') || m.modelId.startsWith('gpt')) {
      m.quotaInfo = { remainingFraction: 1, resetTime: futurePartner5hReset };
    }
  }

  const snap = normalizeUserStatus(rawStatus, {
    nowMs,
    mode: 'live',
    quotaSummary: {
      response: {
        description: 'Models share a 5-hour and weekly limit.',
        groups: [
          {
            displayName: 'Gemini Models',
            description: 'Models within this group: Gemini 4 Neon, Orchestrator (Neon)',
            buckets: [
              {
                bucketId: 'gemini-weekly',
                displayName: 'Weekly Limit Remaining',
                window: 'weekly',
                remainingFraction: 0.85,
                resetTime: geminiWeeklyReset,
              },
              {
                bucketId: 'gemini-5h',
                displayName: 'Five Hour Limit Remaining',
                window: '5h',
                remainingFraction: 0.94,
                resetTime: stale5hReset,
              },
            ],
          },
          {
            displayName: 'Claude and GPT models',
            description: 'Models within this group: Claude Opus 5.5, GPT-OSS 120B',
            buckets: [
              {
                bucketId: '3p-weekly',
                displayName: 'Weekly Limit Remaining',
                window: 'weekly',
                // Proto3 omitted 0.0 remainingFraction with resetTime -> exhausted
                resetTime: partnerWeeklyReset,
              },
              {
                bucketId: '3p-5h',
                displayName: 'Five Hour Limit Remaining',
                window: '5h',
                remainingFraction: 1,
                resetTime: futurePartner5hReset,
              },
            ],
          },
        ],
      },
    },
  });

  assert.equal(snap.summary.hasWeeklyData, true);
  assert.equal(snap.pools.length, 2);

  // Constrained weekly pool (0% left / 100% used) sorts first and marks pool exhausted even though 5h is 100%
  const partnerPool = snap.pools.find((p) => p.name === 'Claude and GPT models');
  assert.equal(partnerPool.fiveHour.remainingPct, 100);
  assert.equal(partnerPool.weekly.remainingPct, 0);
  assert.equal(partnerPool.weekly.usedPct, 100);
  assert.equal(partnerPool.weekly.status, 'exhausted');
  assert.equal(partnerPool.status, 'exhausted');
  assert.equal(partnerPool.tone, 'red');

  // Stale 5h resetTime reconciled against fresher GetUserStatus (75% left / 25% used, fresh5hReset)
  const geminiPool = snap.pools.find((p) => p.name === 'Gemini Models');
  assert.equal(geminiPool.fiveHour.remainingPct, 75);
  assert.equal(geminiPool.fiveHour.usedPct, 25);
  assert.equal(geminiPool.fiveHour.resetTime, fresh5hReset);
  assert.equal(geminiPool.weekly.remainingPct, 85);
  assert.equal(geminiPool.weekly.usedPct, 15);
  assert.equal(geminiPool.weekly.resetTime, geminiWeeklyReset);

  // Models & families inherit weekly metrics
  const neonFam = snap.families.find((f) => f.id === 'gemini-4-neon');
  assert.equal(neonFam.weeklyRemainingPct, 85);
  assert.equal(neonFam.weeklyUsedPct, 15);
  const gptModel = snap.models.find((m) => m.id === 'gpt-oss-120b-medium');
  assert.equal(gptModel.weeklyRemainingPct, 0);
  assert.equal(gptModel.weeklyUsedPct, 100);
  assert.equal(gptModel.weeklyStatus, 'exhausted');

  assert.equal(snap.summary.lowestWeeklyRemainingPct, 0);
  assert.equal(snap.summary.lowestWeeklyUsedPct, 100);
  assert.equal(snap.summary.lowestWeeklyPoolName, 'Claude and GPT models');
});

test('getUsageSnapshot caches dual live LS calls, supports force refresh, and degrades gracefully if summary RPC fails', async (t) => {
  clearUsageCache();
  t.after(() => clearUsageCache());

  // 1. Missing LS config -> LS_NOT_CONFIGURED
  const unconfigured = await getUsageSnapshot({ demo: false, lsAddress: '', csrfToken: '' });
  assert.equal(unconfigured.available, false);
  assert.equal(unconfigured.ok, false);
  assert.equal(unconfigured.code, 'LS_NOT_CONFIGURED');

  // 2. Live HTTP fetch caching & force bypass across GetUserStatus + RetrieveUserQuotaSummary
  const origFetch = globalThis.fetch;
  let statusCalls = 0;
  let summaryCalls = 0;
  let summaryShouldFail = false;

  globalThis.fetch = async (url, init) => {
    const u = String(url);
    assert.equal(init.headers['x-codeium-csrf-token'], 'csrf-test-token');
    if (u.endsWith('/GetUserStatus')) {
      statusCalls += 1;
      return new Response(JSON.stringify(makeSampleRawStatus()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.endsWith('/RetrieveUserQuotaSummary')) {
      summaryCalls += 1;
      if (summaryShouldFail) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          response: {
            groups: [
              {
                displayName: 'Gemini Models',
                description: 'Models within this group: Gemini 4 Neon, Orchestrator (Neon)',
                buckets: [
                  {
                    bucketId: 'gemini-weekly',
                    window: 'weekly',
                    remainingFraction: 0.72,
                    resetTime: new Date(Date.now() + 4 * 86400_000).toISOString(),
                  },
                  {
                    bucketId: 'gemini-5h',
                    window: '5h',
                    remainingFraction: 0.87,
                    resetTime: new Date(Date.now() + 3600_000).toISOString(),
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected URL ${u}`);
  };
  t.after(() => {
    globalThis.fetch = origFetch;
  });

  const first = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token' });
  const second = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token' });
  assert.equal(first.available, true);
  assert.equal(first.summary.hasWeeklyData, true);
  assert.equal(first.pools.find((p) => p.name === 'Gemini Models')?.weekly.usedPct, 28);
  assert.equal(second.available, true);
  assert.equal(statusCalls, 1);
  assert.equal(summaryCalls, 1);

  const forced = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token', force: true });
  assert.equal(forced.available, true);
  assert.equal(statusCalls, 2);
  assert.equal(summaryCalls, 2);

  // Graceful fallback when RetrieveUserQuotaSummary fails while GetUserStatus succeeds
  summaryShouldFail = true;
  const fallbackOnly = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token', force: true });
  assert.equal(fallbackOnly.available, true);
  assert.equal(fallbackOnly.summary.hasWeeklyData, false);
  assert.ok(fallbackOnly.pools.length >= 1);

  // 3. Total failure backoff + LS_UNAVAILABLE
  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  const failed = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token', force: true });
  assert.equal(failed.available, false);
  assert.equal(failed.code, 'LS_UNAVAILABLE');
  assert.match(failed.error, /ECONNREFUSED/);
});

test('renderUsage renders 5-hour + weekly limit meters, modes, filters, unavailable state, and escapes XSS', () => {
  const demo = getDemoUsageSnapshot();
  assert.equal(demo.pools.length, 3);
  assert.equal(demo.pools[0].name, 'Claude Pool');
  assert.equal(demo.pools[0].remainingPct, 28);
  assert.equal(demo.pools[0].weekly.remainingPct, 42);
  assert.equal(demo.pools[0].weekly.usedPct, 58);
  assert.equal(demo.pools[0].tone, 'amber');
  assert.equal(demo.summary.hasWeeklyData, true);

  const familiesHtml = renderUsage(demo, { usageFilter: 'all', usageMode: 'families', search: '' });
  assert.match(familiesHtml, /Claude Pool/);
  assert.match(familiesHtml, /Gemini Pool/);
  assert.match(familiesHtml, /GPT Pool/);
  assert.match(familiesHtml, /5-Hour Limit/);
  assert.match(familiesHtml, /Weekly Limit/);
  assert.match(familiesHtml, /58% used/);
  assert.match(familiesHtml, /22% used/);
  assert.match(familiesHtml, /Wk 22% used/);
  assert.match(familiesHtml, /28%/);
  assert.match(familiesHtml, /64%/);
  assert.match(familiesHtml, /100%/);
  assert.match(familiesHtml, /Google AI Credits/);
  assert.match(familiesHtml, /Gemini 4 Neon/);
  assert.match(familiesHtml, /Extra High/);

  const variantsHtml = renderUsage(demo, { usageFilter: 'claude', usageMode: 'variants', search: 'opus' });
  assert.match(variantsHtml, /Claude Opus 5\.5 \(High\)/);
  assert.match(variantsHtml, /Wk 58% used/);
  assert.equal(variantsHtml.includes('Gemini 4 Neon'), false);

  // Escapes quotaDescription & pool names
  const xssSnap = {
    ...demo,
    quotaDescription: '<img src=x onerror=alert(1)> weekly policy',
    pools: demo.pools.map((p, i) => (i === 0 ? { ...p, name: '<script>alert(2)</script>' } : p)),
  };
  const xssHtml = renderUsage(xssSnap, {});
  assert.equal(xssHtml.includes('<img src=x onerror=alert(1)>'), false);
  assert.equal(xssHtml.includes('<script>alert(2)</script>'), false);

  // Unavailable + XSS escape test
  const unavailHtml = renderUsage(
    {
      available: false,
      error: '<script>alert(1)</script> offline',
    },
    {},
  );
  assert.match(unavailHtml, /Live usage meters unavailable/);
  assert.equal(unavailHtml.includes('<script>alert(1)</script>'), false);
  assert.ok(unavailHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
