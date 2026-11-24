import {
  dotHtml,
  esc,
  formatClock,
  formatCountdown,
  formatResetClock,
  icon,
  safeTone,
} from '../components/icons.js';

const STATUS_LABELS = {
  healthy: 'Healthy',
  low: 'Low',
  critical: 'Critical',
  exhausted: 'Exhausted',
  unknown: 'Unknown',
};

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'claude', label: 'Claude' },
  { id: 'gpt', label: 'GPT' },
  { id: 'low', label: 'Low Quota' },
];

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat().format(num);
}

function matchesUsageItem(item, filter, query) {
  if (filter === 'low') {
    if (!['low', 'critical', 'exhausted'].includes(item.status)) return false;
  } else if (filter !== 'all') {
    if (item.provider !== filter) return false;
  }
  if (!query) return true;
  const hay = [
    item.displayName,
    item.label,
    item.id,
    item.providerLabel,
    item.tagTitle,
    item.tagDescription,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

function renderPoolCard(pool, nowMs) {
  const tone = safeTone(pool.tone, 'muted');
  const hasPct = typeof pool.remainingPct === 'number';
  const pct = hasPct ? Math.min(100, Math.max(0, pool.remainingPct)) : null;
  const widthPct = pct === null ? 0 : pct;
  const statusLabel = STATUS_LABELS[pool.status] || 'Unknown';
  const cd = formatCountdown(pool.resetTime || pool.resetMs, nowMs);
  const clk = formatResetClock(pool.resetTime || pool.resetMs, nowMs);
  const resetText = cd
    ? (cd === 'Resetting' ? 'Resetting shortly' : `Resets in ${cd}${clk ? ` · ${clk}` : ''}`)
    : 'No active reset window';

  const providersHtml = (pool.providerLabels || [])
    .map((p) => `<span class="mc-code-pill">${esc(p)}</span>`)
    .join('');

  const familiesHtml = (pool.familyNames || [])
    .map((name) => `<span class="mc-pool-family-chip">${esc(name)}</span>`)
    .join('');

  return `
    <article class="mc-pool-card tone-${esc(tone)}" data-pool-id="${esc(pool.id)}">
      <div class="mc-pool-head">
        <div class="mc-pool-title-wrap">
          <h3 class="mc-pool-name">${esc(pool.name || 'Quota Pool')}</h3>
          <div class="mc-pool-providers">${providersHtml}</div>
        </div>
        <span class="mc-status-badge tone-${esc(tone)}">${dotHtml(tone)} ${esc(statusLabel)}</span>
      </div>

      <div class="mc-pool-metrics">
        <div class="mc-pool-pct-group">
          <span class="mc-pool-pct">${pct === null ? '—' : `${pct}%`}</span>
          <span class="mc-pool-pct-label">remaining</span>
          ${typeof pool.usedPct === 'number' ? `<span class="mc-pool-used">${pool.usedPct}% used</span>` : ''}
        </div>
        <div class="mc-pool-reset">${icon('clock')}<span>${esc(resetText)}</span></div>
      </div>

      <div class="mc-meter-track" role="progressbar" aria-label="${esc(pool.name || 'Quota pool')} remaining quota" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct === null ? 0 : pct}">
        <div class="mc-meter-fill tone-${esc(tone)}" style="width: ${widthPct}%;"></div>
      </div>

      ${familiesHtml ? `<div class="mc-pool-families">${familiesHtml}</div>` : ''}
    </article>
  `;
}

function renderCreditsStrip(usage) {
  const cards = [];
  for (const c of usage.credits || []) {
    const val = c.amount !== null && c.amount !== undefined ? formatNumber(c.amount) : '0';
    const note = c.minimumForUsage > 0
      ? `Min ${formatNumber(c.minimumForUsage)} required for overage usage`
      : 'Available for overage runs';
    cards.push(`
      <article class="mc-credit-card">
        <div class="mc-credit-label">${esc(c.label || 'AI Credits')}</div>
        <div class="mc-credit-value">${esc(val)}</div>
        <div class="mc-credit-sub">${esc(note)}</div>
      </article>
    `);
  }

  const pc = usage.planCredits || {};
  if (pc.promptAvailable !== null && pc.promptAvailable !== undefined) {
    cards.push(`
      <article class="mc-credit-card">
        <div class="mc-credit-label">Prompt Credits</div>
        <div class="mc-credit-value">${esc(formatNumber(pc.promptAvailable))}</div>
        <div class="mc-credit-sub">Available plan prompt balance</div>
      </article>
    `);
  }
  if (pc.flowAvailable !== null && pc.flowAvailable !== undefined) {
    cards.push(`
      <article class="mc-credit-card">
        <div class="mc-credit-label">Flow Credits</div>
        <div class="mc-credit-value">${esc(formatNumber(pc.flowAvailable))}</div>
        <div class="mc-credit-sub">Available agent flow balance</div>
      </article>
    `);
  }

  if (!cards.length) return '';
  return `
    <section class="mc-section">
      <div class="mc-section-head">
        <span class="mc-section-label">Credits &amp; Plan Allocation</span>
      </div>
      <div class="mc-usage-credits-grid">${cards.join('')}</div>
    </section>
  `;
}

function renderModelRow(item, mode, nowMs) {
  const isFamily = mode !== 'variants';
  const title = isFamily ? (item.displayName || item.id) : (item.label || item.id);
  const tone = safeTone(item.tone, 'muted');
  const hasPct = typeof item.remainingPct === 'number';
  const pct = hasPct ? Math.min(100, Math.max(0, item.remainingPct)) : null;
  const cd = formatCountdown(item.resetTime || item.resetMs, nowMs);
  const tagText = String(item.tagTitle || '').trim();
  const tagTone = /leaving|notice/i.test(tagText) ? 'amber' : 'blue';

  const subPills = isFamily && Array.isArray(item.thinkingLevels) && item.thinkingLevels.length
    ? item.thinkingLevels.map((lvl) => `<span class="mc-thinking-pill">${esc(lvl)}</span>`).join('')
    : `<span class="mc-code-pill">${esc(item.id)}</span>`;

  return `
    <div class="mc-model-meter-row">
      <div class="mc-model-meter-main">
        <div class="mc-model-meter-title-row">
          ${dotHtml(tone)}
          <span class="mc-model-meter-name">${esc(title)}</span>
          <span class="mc-code-pill">${esc(item.providerLabel || 'Model')}</span>
          ${item.isDefault ? '<span class="mc-status-badge tone-blue">Default</span>' : ''}
          ${tagText ? `<span class="mc-status-badge tone-${tagTone}">${esc(tagText)}</span>` : ''}
        </div>
        <div class="mc-model-meter-meta">
          <div class="mc-model-thinking-list">${subPills}</div>
          ${item.tagDescription ? `<span class="mc-model-desc">${esc(item.tagDescription)}</span>` : ''}
        </div>
      </div>

      <div class="mc-model-meter-right">
        <div class="mc-meter-track is-compact" role="progressbar" aria-label="${esc(title)} remaining quota" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct === null ? 0 : pct}">
          <div class="mc-meter-fill tone-${esc(tone)}" style="width: ${pct === null ? 0 : pct}%;"></div>
        </div>
        <span class="mc-model-pct tone-${esc(tone)}">${pct === null ? '—' : `${pct}%`}</span>
        <span class="mc-model-reset">${esc(cd || '—')}</span>
      </div>
    </div>
  `;
}

export function renderUsage(usage, state = {}) {
  const nowMs = Date.now();
  const loading = Boolean(state.usageLoading);

  if (!usage) {
    return `
      <div class="mc-usage-view">
        <div class="mc-empty">
          <p class="mc-empty-title">Loading quota meters…</p>
          <p class="mc-empty-sub">Querying Antigravity language server quota status and model pools.</p>
        </div>
      </div>
    `;
  }

  if (usage.available === false) {
    return `
      <div class="mc-usage-view">
        <div class="mc-usage-unavailable">
          <div class="mc-usage-unavail-icon">${icon('gauge')}</div>
          <h2 class="mc-empty-title">Live usage meters unavailable</h2>
          <p class="mc-empty-sub">${esc(usage.error || 'An active Antigravity language server connection is required to inspect live account quotas.')}</p>
          <div class="mc-usage-unavail-actions">
            <button type="button" class="mc-btn-subtle is-strong" data-action="refresh-usage"${loading ? ' disabled' : ''}>
              ${icon('refresh', loading ? 'is-spinning' : '')}
              <span>${loading ? 'Refreshing…' : 'Retry'}</span>
            </button>
            <button type="button" class="mc-btn-primary" data-action="load-demo">Preview Demo Meters</button>
          </div>
        </div>
      </div>
    `;
  }

  const summary = usage.summary || {};
  const plan = usage.plan || {};
  const pools = Array.isArray(usage.pools) ? usage.pools : [];
  const families = Array.isArray(usage.families) ? usage.families : [];
  const models = Array.isArray(usage.models) ? usage.models : [];

  const q = String(state.search || '').trim().toLowerCase();
  const usageFilter = state.usageFilter || 'all';
  const usageMode = state.usageMode === 'variants' ? 'variants' : 'families';

  const nextResetCd = formatCountdown(summary.nextResetTime || summary.nextResetMs, nowMs);
  const updatedClock = usage.fetchedAt ? formatClock(usage.fetchedAt) : '';

  const filteredPools = q
    ? pools.filter((p) => {
        const hay = `${p.name} ${(p.providerLabels || []).join(' ')} ${(p.familyNames || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
    : pools;

  const sourceItems = usageMode === 'variants' ? models : families;
  const filteredItems = sourceItems.filter((item) => matchesUsageItem(item, usageFilter, q));

  const filterCounts = {
    all: sourceItems.length,
    gemini: sourceItems.filter((i) => i.provider === 'gemini').length,
    claude: sourceItems.filter((i) => i.provider === 'claude').length,
    gpt: sourceItems.filter((i) => i.provider === 'gpt').length,
    low: sourceItems.filter((i) => ['low', 'critical', 'exhausted'].includes(i.status)).length,
  };

  const heroStats = [
    `${summary.poolCount ?? pools.length} ${(summary.poolCount ?? pools.length) === 1 ? 'Shared Pool' : 'Shared Pools'}`,
    `${summary.familyCount ?? families.length} Model ${(summary.familyCount ?? families.length) === 1 ? 'Family' : 'Families'}`,
    nextResetCd ? `Next reset ${nextResetCd === 'Resetting' ? 'soon' : `in ${nextResetCd}`}` : '',
  ].filter(Boolean).join(' · ');

  const poolsHtml = filteredPools.length
    ? filteredPools.map((p) => renderPoolCard(p, nowMs)).join('')
    : '<div class="mc-empty"><p class="mc-empty-sub">No quota pools match the current search.</p></div>';

  const rowsHtml = filteredItems.length
    ? filteredItems.map((item) => renderModelRow(item, usageMode, nowMs)).join('')
    : '<div class="mc-empty" style="padding: 20px;"><p class="mc-empty-sub">No models match this filter or search query.</p></div>';

  return `
    <div class="mc-usage-view">
      <div class="mc-usage-hero-bar">
        <div class="mc-usage-hero-left">
          <span class="mc-status-badge tone-blue">${esc(plan.name || 'Antigravity')}</span>
          ${usage.mode === 'demo' ? '<span class="mc-mode-chip">Demo Meters</span>' : ''}
          <span class="mc-usage-hero-stats">${esc(heroStats)}</span>
        </div>
        <div class="mc-usage-hero-right">
          ${updatedClock ? `<span class="mc-usage-updated">Updated ${esc(updatedClock)}</span>` : ''}
          <button type="button" class="mc-btn-subtle" data-action="refresh-usage"${loading ? ' disabled' : ''}>
            ${icon('refresh', loading ? 'is-spinning' : '')}
            <span>${loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <section class="mc-section">
        <div class="mc-section-head">
          <span class="mc-section-label">Shared Quota Pools</span>
          ${summary.lowPoolCount > 0 ? `<span class="mc-section-count tone-amber">${summary.lowPoolCount} low quota</span>` : ''}
        </div>
        <div class="mc-usage-pools-grid">${poolsHtml}</div>
      </section>

      ${renderCreditsStrip(usage)}

      <section class="mc-section mc-usage-models-section">
        <div class="mc-usage-models-bar">
          <div class="mc-usage-models-head-left">
            <span class="mc-section-label">Model Quota Breakdown</span>
            <div class="mc-filter-group" role="group" aria-label="Filter models by provider or status">
              ${FILTER_OPTIONS.map((opt) => {
                const count = filterCounts[opt.id] ?? 0;
                if (opt.id !== 'all' && opt.id !== 'low' && count === 0) return '';
                const active = usageFilter === opt.id ? ' active' : '';
                return `<button type="button" class="mc-filter-pill${active}" data-usage-filter="${esc(opt.id)}"><span>${esc(opt.label)}</span><span class="mc-pill-count">${count}</span></button>`;
              }).join('')}
            </div>
          </div>

          <div class="mc-toggle-group" role="group" aria-label="Model grouping mode">
            <button type="button" class="mc-toggle-btn${usageMode === 'families' ? ' active' : ''}" data-usage-mode="families">Families (${families.length})</button>
            <button type="button" class="mc-toggle-btn${usageMode === 'variants' ? ' active' : ''}" data-usage-mode="variants">All Variants (${models.length})</button>
          </div>
        </div>

        <div class="mc-model-meter-list">${rowsHtml}</div>
      </section>
    </div>
  `;
}
