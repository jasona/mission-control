const CACHE_TTL_MS = 15 * 1000;
const FAIL_BACKOFF_MS = 15 * 1000;
const FETCH_TIMEOUT_MS = 4000;

let cachedLive = null; // { at: number, snapshot: object }
let inFlightLive = null;

function finiteOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'model';
}

function detectProvider(id, label) {
  const hay = `${id || ''} ${label || ''}`;
  if (/claude/i.test(hay)) return { provider: 'claude', providerLabel: 'Claude' };
  if (/\bgpt\b|gpt-|openai/i.test(hay)) return { provider: 'gpt', providerLabel: 'GPT' };
  if (/gemini|orchestrator/i.test(hay)) return { provider: 'gemini', providerLabel: 'Gemini' };
  return { provider: 'other', providerLabel: 'Other' };
}

function classifyQuota(remainingFraction) {
  if (remainingFraction === null || remainingFraction === undefined) {
    return { remainingPct: null, usedPct: null, status: 'unknown', tone: 'muted' };
  }
  const clamped = Math.min(1, Math.max(0, Number(remainingFraction)));
  const remainingPct = Math.round(clamped * 100);
  const usedPct = Math.max(0, 100 - remainingPct);
  let status = 'healthy';
  let tone = 'green';
  if (remainingPct === 0) {
    status = 'exhausted';
    tone = 'red';
  } else if (remainingPct <= 15) {
    status = 'critical';
    tone = 'red';
  } else if (remainingPct <= 35) {
    status = 'low';
    tone = 'amber';
  }
  return { remainingPct, usedPct, status, tone };
}

function formatCreditLabel(type) {
  if (type === 'GOOGLE_ONE_AI') return 'Google AI Credits';
  return String(type || 'Credits')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function derivePoolName(poolGroup, bucketModels) {
  const providers = new Set(bucketModels.map((m) => m.provider));
  if (poolGroup === 'gemini') {
    const allFlash = bucketModels.length > 0 && bucketModels.every((m) => /flash/i.test(`${m.id} ${m.label}`));
    return allFlash ? 'Gemini Flash Pool' : 'Gemini Pool';
  }
  const hasClaude = providers.has('claude');
  const hasGpt = providers.has('gpt');
  if (hasClaude && hasGpt) return 'Claude & GPT Pool';
  if (hasClaude) return 'Claude Pool';
  if (hasGpt) return 'GPT Pool';
  return 'Model Quota Pool';
}

function orderModelConfigs(configs, sorts) {
  const list = Array.isArray(configs) ? configs : [];
  const labelOrder = Array.isArray(sorts) ? sorts?.[0]?.groups?.[0]?.modelLabels : null;
  if (!Array.isArray(labelOrder) || labelOrder.length === 0) return list;

  const rank = new Map();
  labelOrder.forEach((lbl, idx) => {
    if (!rank.has(lbl)) rank.set(lbl, idx);
  });

  return list
    .map((cfg, origIdx) => ({
      cfg,
      origIdx,
      orderIdx: rank.has(cfg?.label) ? rank.get(cfg.label) : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => (a.orderIdx - b.orderIdx) || (a.origIdx - b.origIdx))
    .map((entry) => entry.cfg);
}

/**
 * Normalizes an Antigravity GetUserStatus payload into UI-safe quota meters (without PII).
 */
export function normalizeUserStatus(raw, { nowMs = Date.now(), mode = 'live' } = {}) {
  const userStatus = raw?.userStatus && typeof raw.userStatus === 'object'
    ? raw.userStatus
    : (raw && typeof raw === 'object' ? raw : {});

  const userTier = userStatus.userTier && typeof userStatus.userTier === 'object' ? userStatus.userTier : {};
  const planStatus = userStatus.planStatus && typeof userStatus.planStatus === 'object' ? userStatus.planStatus : {};
  const planInfo = planStatus.planInfo && typeof planStatus.planInfo === 'object' ? planStatus.planInfo : {};
  const modelData = userStatus.cascadeModelConfigData && typeof userStatus.cascadeModelConfigData === 'object'
    ? userStatus.cascadeModelConfigData
    : {};

  const plan = {
    name: String(userTier.name || planInfo.planName || 'Antigravity'),
    id: String(userTier.id || planInfo.teamsTier || ''),
    teamsTier: String(planInfo.teamsTier || ''),
    description: String(userTier.description || ''),
    upgradeUri: String(userTier.upgradeSubscriptionUri || ''),
    upgradeText: String(userTier.upgradeSubscriptionText || ''),
  };

  const rawCredits = Array.isArray(userTier.availableCredits) ? userTier.availableCredits : [];
  const credits = rawCredits.map((c) => ({
    type: String(c?.creditType || 'CREDITS'),
    label: formatCreditLabel(c?.creditType),
    amount: finiteOrNull(c?.creditAmount),
    minimumForUsage: Number(c?.minimumCreditAmountForUsage) || 0,
  }));

  const planCredits = {
    promptAvailable: finiteOrNull(planStatus.availablePromptCredits),
    flowAvailable: finiteOrNull(planStatus.availableFlowCredits),
    monthlyPrompt: finiteOrNull(planInfo.monthlyPromptCredits),
    monthlyFlow: finiteOrNull(planInfo.monthlyFlowCredits),
  };

  const defaultPlaceholder = String(modelData.defaultOverrideModelConfig?.modelOrAlias?.model || '');
  const orderedConfigs = orderModelConfigs(modelData.clientModelConfigs, modelData.clientModelSorts);

  const models = orderedConfigs.map((cfg) => {
    const label = String(cfg?.label || cfg?.modelId || cfg?.modelOrAlias?.model || 'Unknown Model');
    const id = String(cfg?.modelId || cfg?.modelOrAlias?.model || slugify(label));
    const { provider, providerLabel } = detectProvider(id, label);
    const quotaInfo = cfg?.quotaInfo && typeof cfg.quotaInfo === 'object' ? cfg.quotaInfo : null;
    const resetTime = typeof quotaInfo?.resetTime === 'string' ? quotaInfo.resetTime : '';
    const parsedResetMs = resetTime ? Date.parse(resetTime) : 0;
    const resetMs = Number.isFinite(parsedResetMs) && parsedResetMs > 0 ? parsedResetMs : 0;

    // Proto3 omits numeric 0.0 fields, so present quotaInfo with resetTime implies 0% remaining.
    let remainingFraction = null;
    if (quotaInfo) {
      if (typeof quotaInfo.remainingFraction === 'number' && Number.isFinite(quotaInfo.remainingFraction)) {
        remainingFraction = Math.min(1, Math.max(0, quotaInfo.remainingFraction));
      } else if (resetTime) {
        remainingFraction = 0;
      }
    }

    const q = classifyQuota(remainingFraction);
    return {
      id,
      label,
      provider,
      providerLabel,
      remainingFraction,
      remainingPct: q.remainingPct,
      usedPct: q.usedPct,
      resetTime,
      resetMs,
      status: q.status,
      tone: q.tone,
      tagTitle: String(cfg?.tagTitle || ''),
      tagDescription: String(cfg?.tagDescription || ''),
      isDefault: Boolean(defaultPlaceholder && cfg?.modelOrAlias?.model === defaultPlaceholder),
    };
  });

  // Group model variants by quota pool bucket first, keeping model->pool map.
  const bucketMap = new Map();
  const modelToPoolKey = new Map();
  for (const m of models) {
    const poolGroup = m.provider === 'gemini' ? 'gemini' : 'partner';
    const fracKey = m.remainingFraction === null ? 'unknown' : m.remainingFraction.toFixed(3);
    const key = `${poolGroup}::${m.resetTime || 'none'}::${fracKey}`;
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { key, poolGroup, models: [] });
    }
    bucketMap.get(key).models.push(m);
    modelToPoolKey.set(m.id, key);
  }

  // Collapse thinking-level variants using groupedModels when defined.
  const groupedModels = modelData.groupedModels && typeof modelData.groupedModels === 'object'
    ? modelData.groupedModels
    : {};
  const familyKeysSorted = Object.keys(groupedModels).sort((a, b) => b.length - a.length);

  const familyEntries = [];
  const familyIndexMap = new Map();

  for (const m of models) {
    let matchedFamilyId = '';
    for (const fk of familyKeysSorted) {
      if (m.id === fk || m.id.startsWith(`${fk}-`)) {
        matchedFamilyId = fk;
        break;
      }
    }

    if (matchedFamilyId) {
      let entry = familyIndexMap.get(matchedFamilyId);
      if (!entry) {
        const meta = groupedModels[matchedFamilyId] || {};
        const levels = Array.isArray(meta.supportedThinkingLevels)
          ? meta.supportedThinkingLevels.map((l) => String(l?.thinkingDisplayName || l?.thinkingSuffix || '')).filter(Boolean)
          : [];
        entry = {
          id: matchedFamilyId,
          displayName: String(meta.displayName || m.label),
          provider: m.provider,
          providerLabel: m.providerLabel,
          thinkingLevels: levels,
          models: [],
        };
        familyIndexMap.set(matchedFamilyId, entry);
        familyEntries.push(entry);
      }
      entry.models.push(m);
    } else {
      familyEntries.push({
        id: m.id,
        displayName: m.label,
        provider: m.provider,
        providerLabel: m.providerLabel,
        thinkingLevels: [],
        models: [m],
      });
    }
  }

  const families = familyEntries.map((entry) => {
    const fracs = entry.models.map((v) => v.remainingFraction).filter((v) => v !== null);
    const remainingFraction = fracs.length ? Math.min(...fracs) : null;
    const q = classifyQuota(remainingFraction);
    const resetCandidates = entry.models.filter((v) => v.resetMs > 0).sort((a, b) => a.resetMs - b.resetMs);
    const repReset = resetCandidates[0] || entry.models.find((v) => v.resetTime) || entry.models[0];
    const tagged = entry.models.find((v) => v.tagTitle || v.tagDescription) || entry.models[0];

    // Representative variant matching minimum fraction for pool association
    const repModel = entry.models.find((v) => v.remainingFraction === remainingFraction) || entry.models[0];

    return {
      id: entry.id,
      displayName: entry.displayName,
      provider: entry.provider,
      providerLabel: entry.providerLabel,
      thinkingLevels: entry.thinkingLevels,
      variantCount: entry.models.length,
      remainingFraction,
      remainingPct: q.remainingPct,
      usedPct: q.usedPct,
      resetTime: repReset?.resetTime || '',
      resetMs: repReset?.resetMs || 0,
      status: q.status,
      tone: q.tone,
      tagTitle: tagged?.tagTitle || '',
      tagDescription: tagged?.tagDescription || '',
      isDefault: entry.models.some((v) => v.isDefault),
      _poolKey: repModel ? modelToPoolKey.get(repModel.id) || '' : '',
      poolId: '',
    };
  });

  // Build final sorted pools and connect family -> poolId
  const rawPools = [];
  const usedPoolNames = new Map();
  let poolSeq = 0;

  for (const bucket of bucketMap.values()) {
    poolSeq += 1;
    const rep = bucket.models[0];
    const baseName = derivePoolName(bucket.poolGroup, bucket.models);
    const seenCount = (usedPoolNames.get(baseName) || 0) + 1;
    usedPoolNames.set(baseName, seenCount);

    const providers = [...new Set(bucket.models.map((m) => m.provider))];
    const providerLabels = [...new Set(bucket.models.map((m) => m.providerLabel))];
    const famNames = families
      .filter((f) => f._poolKey === bucket.key)
      .map((f) => f.displayName);

    const id = `pool-${slugify(baseName)}-${poolSeq}`;
    const q = classifyQuota(rep.remainingFraction);

    rawPools.push({
      _key: bucket.key,
      _baseName: baseName,
      id,
      name: seenCount > 1 ? `${baseName} (${seenCount})` : baseName,
      providers,
      providerLabels,
      remainingFraction: rep.remainingFraction,
      remainingPct: q.remainingPct,
      usedPct: q.usedPct,
      resetTime: rep.resetTime,
      resetMs: rep.resetMs,
      status: q.status,
      tone: q.tone,
      familyNames: famNames,
      familyCount: famNames.length,
      variantCount: bucket.models.length,
    });
  }

  rawPools.sort((a, b) => {
    const pa = a.remainingPct === null ? Number.MAX_SAFE_INTEGER : a.remainingPct;
    const pb = b.remainingPct === null ? Number.MAX_SAFE_INTEGER : b.remainingPct;
    if (pa !== pb) return pa - pb;
    const ga = a.providers.includes('gemini') ? 0 : 1;
    const gb = b.providers.includes('gemini') ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name);
  });

  const keyToPoolId = new Map(rawPools.map((p) => [p._key, p.id]));
  for (const fam of families) {
    fam.poolId = keyToPoolId.get(fam._poolKey) || '';
    delete fam._poolKey;
  }

  const pools = rawPools.map(({ _key, _baseName, ...rest }) => rest);

  const knownPools = pools.filter((p) => p.remainingPct !== null);
  const lowestPool = knownPools[0] || null;
  const futureResets = pools.filter((p) => p.resetMs > nowMs).sort((a, b) => a.resetMs - b.resetMs);
  const anyResets = futureResets.length ? futureResets : pools.filter((p) => p.resetMs > 0).sort((a, b) => a.resetMs - b.resetMs);
  const nextResetPool = anyResets[0] || null;

  return {
    ok: true,
    available: true,
    mode,
    fetchedAt: new Date(nowMs).toISOString(),
    plan,
    credits,
    planCredits,
    pools,
    families,
    models,
    summary: {
      poolCount: pools.length,
      familyCount: families.length,
      modelCount: models.length,
      lowestRemainingPct: lowestPool ? lowestPool.remainingPct : null,
      lowestPoolName: lowestPool ? lowestPool.name : '',
      nextResetTime: nextResetPool ? nextResetPool.resetTime : '',
      nextResetMs: nextResetPool ? nextResetPool.resetMs : 0,
      lowPoolCount: pools.filter((p) => p.status === 'low' || p.status === 'critical' || p.status === 'exhausted').length,
      exhaustedPoolCount: pools.filter((p) => p.status === 'exhausted').length,
    },
  };
}

/**
 * Generates a realistic stateful demo usage snapshot showcasing healthy, low, and full pools.
 */
export function getDemoUsageSnapshot({ nowMs = Date.now() } = {}) {
  const geminiReset = new Date(nowMs + (2 * 60 + 15) * 60 * 1000).toISOString();
  const claudeReset = new Date(nowMs + 48 * 60 * 1000).toISOString();
  const gptReset = new Date(nowMs + (4 * 60 + 50) * 60 * 1000).toISOString();

  const demoRaw = {
    userStatus: {
      name: 'Demo User',
      email: 'demo@example.invalid',
      userTier: {
        id: 'g1-ultra-lite-tier',
        name: 'Google AI Ultra',
        description: 'Google AI Ultra',
        upgradeSubscriptionUri: 'https://antigravity.google/g1-upgrade',
        upgradeSubscriptionText: 'You can upgrade to a higher Google AI Ultra plan to receive the highest rate limits.',
        availableCredits: [
          {
            creditType: 'GOOGLE_ONE_AI',
            creditAmount: '250',
            minimumCreditAmountForUsage: '50',
          },
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
        defaultOverrideModelConfig: { modelOrAlias: { model: 'MODEL_PLACEHOLDER_M532' } },
        groupedModels: {
          'gemini-4-neon': {
            displayName: 'Gemini 4 Neon',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
              { thinkingSuffix: 'xhigh', thinkingDisplayName: 'Extra High' },
            ],
          },
          'gemini-4-carbon': {
            displayName: 'Gemini 4 Carbon',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
            ],
          },
          'gemini-4-argon': {
            displayName: 'Gemini 4 Argon',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
            ],
          },
          'gemini-4-hydrogen': {
            displayName: 'Gemini 4 Hydrogen',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
              { thinkingSuffix: 'xhigh', thinkingDisplayName: 'Extra High' },
            ],
          },
          'gemini-3.8-flash': {
            displayName: 'Gemini 3.8 Flash',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
            ],
          },
          'claude-opus-5-5': {
            displayName: 'Claude Opus 5.5',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
            ],
          },
          'claude-sonnet-5-5': {
            displayName: 'Claude Sonnet 5.5',
            supportedThinkingLevels: [
              { thinkingSuffix: 'low', thinkingDisplayName: 'Low' },
              { thinkingSuffix: 'medium', thinkingDisplayName: 'Medium' },
              { thinkingSuffix: 'high', thinkingDisplayName: 'High' },
            ],
          },
        },
        clientModelConfigs: [
          {
            modelId: 'gemini-4-neon-high',
            label: 'Gemini 4 Neon (High)',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M532' },
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
            tagTitle: 'New',
            tagDescription: 'For most deep reasoning and complex problems',
          },
          {
            modelId: 'gemini-4-neon-xhigh',
            label: 'Gemini 4 Neon (XHigh)',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M535' },
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-neon-medium',
            label: 'Gemini 4 Neon (Medium)',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M531' },
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-neon-low',
            label: 'Gemini 4 Neon (Low)',
            modelOrAlias: { model: 'MODEL_PLACEHOLDER_M530' },
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-carbon-high',
            label: 'Gemini 4 Carbon (High)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-carbon-medium',
            label: 'Gemini 4 Carbon (Medium)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-carbon-low',
            label: 'Gemini 4 Carbon (Low)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-argon-high',
            label: 'Gemini 4 Argon (High)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-argon-medium',
            label: 'Gemini 4 Argon (Medium)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-argon-low',
            label: 'Gemini 4 Argon (Low)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-hydrogen-high',
            label: 'Gemini 4 Hydrogen (High)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
            tagDescription: 'For speed and efficiency in execution tasks',
          },
          {
            modelId: 'gemini-4-hydrogen-xhigh',
            label: 'Gemini 4 Hydrogen (XHigh)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-hydrogen-medium',
            label: 'Gemini 4 Hydrogen (Medium)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-4-hydrogen-low',
            label: 'Gemini 4 Hydrogen (Low)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-pro-orchestrator-neon',
            label: 'Orchestrator (Neon)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
            tagTitle: 'New',
            tagDescription: 'Neon that may offload routine steps to Hydrogen',
          },
          {
            modelId: 'gemini-pro-orchestrator',
            label: 'Orchestrator (Carbon)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-pro-orchestrator-argon',
            label: 'Orchestrator (Argon)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-3.8-flash-high',
            label: 'Gemini 3.8 Flash (High)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
            tagTitle: 'Leaving Soon',
            tagDescription: 'Use Hydrogen for better quality with lower quota usage',
          },
          {
            modelId: 'gemini-3.8-flash-medium',
            label: 'Gemini 3.8 Flash (Medium)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'gemini-3.8-flash-low',
            label: 'Gemini 3.8 Flash (Low)',
            quotaInfo: { remainingFraction: 0.64, resetTime: geminiReset },
          },
          {
            modelId: 'claude-opus-5-5-high',
            label: 'Claude Opus 5.5 (High)',
            quotaInfo: { remainingFraction: 0.28, resetTime: claudeReset },
            tagTitle: 'New',
          },
          {
            modelId: 'claude-opus-5-5-medium',
            label: 'Claude Opus 5.5 (Medium)',
            quotaInfo: { remainingFraction: 0.28, resetTime: claudeReset },
          },
          {
            modelId: 'claude-opus-5-5-low',
            label: 'Claude Opus 5.5 (Low)',
            quotaInfo: { remainingFraction: 0.28, resetTime: claudeReset },
          },
          {
            modelId: 'claude-sonnet-5-5-high',
            label: 'Claude Sonnet 5.5 (High)',
            quotaInfo: { remainingFraction: 0.28, resetTime: claudeReset },
            tagTitle: 'New',
          },
          {
            modelId: 'claude-sonnet-5-5-medium',
            label: 'Claude Sonnet 5.5 (Medium)',
            quotaInfo: { remainingFraction: 0.28, resetTime: claudeReset },
          },
          {
            modelId: 'claude-sonnet-5-5-low',
            label: 'Claude Sonnet 5.5 (Low)',
            quotaInfo: { remainingFraction: 0.28, resetTime: claudeReset },
          },
          {
            modelId: 'gpt-oss-120b-medium',
            label: 'GPT-OSS 120B (Medium)',
            quotaInfo: { remainingFraction: 1, resetTime: gptReset },
            tagTitle: 'Notice',
            tagDescription: 'GPT-OSS will be removed from Antigravity on November 30, 2026.',
          },
        ],
      },
    },
  };

  return normalizeUserStatus(demoRaw, { nowMs, mode: 'demo' });
}

function unavailableUsage({ code, error, nowMs = Date.now() }) {
  return {
    ok: false,
    available: false,
    mode: 'live',
    code,
    error,
    fetchedAt: new Date(nowMs).toISOString(),
    plan: null,
    credits: [],
    planCredits: null,
    pools: [],
    families: [],
    models: [],
    summary: {
      poolCount: 0,
      familyCount: 0,
      modelCount: 0,
      lowestRemainingPct: null,
      lowestPoolName: '',
      nextResetTime: '',
      nextResetMs: 0,
      lowPoolCount: 0,
      exhaustedPoolCount: 0,
    },
  };
}

/**
 * Fetches live usage & quota pools from the Antigravity Language Server, or returns demo data.
 */
export async function getUsageSnapshot(options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (options.demo) {
    return getDemoUsageSnapshot({ nowMs });
  }

  const lsAddress = options.lsAddress !== undefined ? String(options.lsAddress || '') : String(process.env.ANTIGRAVITY_LS_ADDRESS || '');
  const csrfToken = options.csrfToken !== undefined ? String(options.csrfToken || '') : String(process.env.ANTIGRAVITY_CSRF_TOKEN || '');
  const fetcher = typeof options.fetcher === 'function' ? options.fetcher : null;
  const force = Boolean(options.force);
  const useCache = !fetcher;

  if (!fetcher && (!lsAddress || !csrfToken)) {
    return unavailableUsage({
      code: 'LS_NOT_CONFIGURED',
      error: 'Antigravity language server environment variables (ANTIGRAVITY_LS_ADDRESS / ANTIGRAVITY_CSRF_TOKEN) are not present in standalone mode.',
      nowMs,
    });
  }

  if (useCache && !force && cachedLive) {
    const ttl = cachedLive.snapshot.available ? CACHE_TTL_MS : FAIL_BACKOFF_MS;
    if (nowMs - cachedLive.at < ttl) {
      return cachedLive.snapshot;
    }
  }

  if (useCache && inFlightLive) {
    return inFlightLive;
  }

  const runFetch = async () => {
    try {
      let data;
      if (fetcher) {
        data = await fetcher({ lsAddress, csrfToken });
      } else {
        const res = await fetch(
          `http://${lsAddress}/exa.language_server_pb.LanguageServerService/GetUserStatus`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-codeium-csrf-token': csrfToken,
            },
            body: '{}',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          },
        );
        if (!res.ok) {
          throw new Error(`Language server returned HTTP ${res.status}`);
        }
        data = await res.json();
      }

      const snap = normalizeUserStatus(data, { nowMs: Date.now(), mode: 'live' });
      if (useCache) cachedLive = { at: Date.now(), snapshot: snap };
      return snap;
    } catch (err) {
      const failSnap = unavailableUsage({
        code: 'LS_UNAVAILABLE',
        error: err?.message || 'Unable to query Antigravity language server',
        nowMs: Date.now(),
      });
      if (useCache) cachedLive = { at: Date.now(), snapshot: failSnap };
      return failSnap;
    } finally {
      if (useCache) inFlightLive = null;
    }
  };

  const promise = runFetch();
  if (useCache) inFlightLive = promise;
  return promise;
}

/**
 * Clears cached live usage data and any in-flight request pointer.
 */
export function clearUsageCache() {
  cachedLive = null;
  inFlightLive = null;
}
