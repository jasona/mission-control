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

test('getUsageSnapshot caches live LS calls, supports force refresh, and falls back gracefully when LS unavailable', async (t) => {
  clearUsageCache();
  t.after(() => clearUsageCache());

  // 1. Missing LS config -> LS_NOT_CONFIGURED
  const unconfigured = await getUsageSnapshot({ demo: false, lsAddress: '', csrfToken: '' });
  assert.equal(unconfigured.available, false);
  assert.equal(unconfigured.ok, false);
  assert.equal(unconfigured.code, 'LS_NOT_CONFIGURED');

  // 2. Live HTTP fetch caching & force bypass
  const origFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async (url, init) => {
    callCount += 1;
    assert.match(String(url), /\/exa\.language_server_pb\.LanguageServerService\/GetUserStatus$/);
    assert.equal(init.headers['x-codeium-csrf-token'], 'csrf-test-token');
    return new Response(JSON.stringify(makeSampleRawStatus()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
  });

  const first = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token' });
  const second = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token' });
  assert.equal(first.available, true);
  assert.equal(second.available, true);
  assert.equal(callCount, 1);

  const forced = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token', force: true });
  assert.equal(forced.available, true);
  assert.equal(callCount, 2);

  // 3. Failure backoff + LS_UNAVAILABLE
  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  const failed = await getUsageSnapshot({ lsAddress: '127.0.0.1:9999', csrfToken: 'csrf-test-token', force: true });
  assert.equal(failed.available, false);
  assert.equal(failed.code, 'LS_UNAVAILABLE');
  assert.match(failed.error, /ECONNREFUSED/);
});

test('renderUsage renders pools, modes, provider/search filters, unavailable state, and escapes XSS', () => {
  const demo = getDemoUsageSnapshot();
  assert.equal(demo.pools.length, 3);
  assert.equal(demo.pools[0].name, 'Claude Pool');
  assert.equal(demo.pools[0].remainingPct, 28);
  assert.equal(demo.pools[0].tone, 'amber');

  const familiesHtml = renderUsage(demo, { usageFilter: 'all', usageMode: 'families', search: '' });
  assert.match(familiesHtml, /Claude Pool/);
  assert.match(familiesHtml, /Gemini Pool/);
  assert.match(familiesHtml, /GPT Pool/);
  assert.match(familiesHtml, /28%/);
  assert.match(familiesHtml, /64%/);
  assert.match(familiesHtml, /100%/);
  assert.match(familiesHtml, /Google AI Credits/);
  assert.match(familiesHtml, /Gemini 4 Neon/);
  assert.match(familiesHtml, /Extra High/);

  const variantsHtml = renderUsage(demo, { usageFilter: 'claude', usageMode: 'variants', search: 'opus' });
  assert.match(variantsHtml, /Claude Opus 5\.5 \(High\)/);
  assert.equal(variantsHtml.includes('Gemini 4 Neon'), false);

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
