import { esc, icon } from './components/icons.js';
import {
  buildPaletteItems,
  renderCommandPalette,
  renderNewThreadModal,
  renderPluginsDrawer,
  renderSettingsPopover,
} from './components/modal.js';
import { renderBoard } from './views/board.js';
import { renderGraph } from './views/graph.js';
import { renderInspectorComposer, renderInspectorContent } from './views/inspector.js';
import { renderOverview } from './views/overview.js';
import { renderTimeline } from './views/timeline.js';

const params = new URLSearchParams(location.search);
const initialDemoParam = params.get('demo');

async function apiFetch(url, opts = {}) {
  const method = String(opts?.method || 'GET').toUpperCase();
  const nextOpts = { ...opts, method };
  if (typeof window.sidecar?.fetch === 'function') {
    const sidecarFetch = window.sidecar.fetch.bind(window.sidecar);
    if (method === 'GET') {
      try {
        return await sidecarFetch(url, nextOpts);
      } catch {
        return fetch(url, { method: 'GET' });
      }
    }
    return sidecarFetch(url, nextOpts);
  }
  return fetch(url, nextOpts);
}

const state = {
  demo: initialDemoParam === '1' ? true : initialDemoParam === '0' ? false : null,
  view: 'overview', // overview | board | timeline | graph
  filter: 'all', // all | attention | running
  search: '',
  etag: '',
  snap: null,
  selectedThreadId: '',
  detail: null,
  detailKey: '',
  composerKey: '',
  inspectorTab: 'activity', // activity | swarm | files | diff
  inspectorDiffFile: 'all',
  inspectorOpen: false, // mobile / <1100px slide-over drawer
  composerDraft: '',
  composerModel: '',
  composerMode: '',
  sendingReply: false,
  pollMs: 2000,
  pluginsOpen: false,
  settingsOpen: false,
  modal: null, // null | { type: 'new-thread', projectId } | { type: 'palette', query, index }
};

const $ = (id) => document.getElementById(id);

// ---------- Host Theme Sync ----------
function syncHostTheme() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;color:var(--background, #0d0e11)';
  document.documentElement.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();

  const nums = (color.match(/[\d.]+/g) || []).map(Number);
  if (nums.length < 3) {
    document.documentElement.dataset.theme = 'dark';
    return;
  }
  const scale = color.startsWith('color(') ? 1 : 255;
  const [r, g, b] = nums.slice(0, 3).map((n) => n / scale);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const next = lum < 0.5 ? 'dark' : 'light';
  if (document.documentElement.dataset.theme !== next) {
    document.documentElement.dataset.theme = next;
  }
}

syncHostTheme();
new MutationObserver(syncHostTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['style'],
});

// ---------- Utilities ----------
function demoQuery() {
  if (state.demo === true) return '1';
  if (state.demo === false) return '0';
  return '';
}

function withQuery(path, extra = {}) {
  const qs = new URLSearchParams();
  const d = demoQuery();
  if (d) qs.set('demo', d);
  const convId = window.sidecar?.conversationId || params.get('conversationId') || '';
  if (convId) qs.set('conversationId', convId);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const qStr = qs.toString();
  return qStr ? `${path}?${qStr}` : path;
}

function plural(n, word) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function findProjectForThread(threadId) {
  for (const p of state.snap?.projects || []) {
    if ((p.threads || []).some((t) => t.id === threadId)) return p;
  }
  return null;
}

function showToast(message, tone = 'neutral') {
  const root = $('mc-toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `mc-toast tone-${tone}`;
  el.textContent = String(message || '');
  root.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

// ---------- Data Fetching & Polling ----------
let pollTimer = null;
let fetchInFlight = false;

async function fetchJson(url, opts) {
  const res = await apiFetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function loadThreadDetail(threadId, force = false) {
  if (!threadId) {
    state.detail = null;
    renderInspector();
    return;
  }
  try {
    const detail = await fetchJson(withQuery('/api/thread', { id: threadId }));
    if (state.selectedThreadId !== threadId) return;
    state.detail = detail;
    renderInspector(force);
  } catch (err) {
    if (!state.detail || state.detail.id !== threadId) {
      state.detail = null;
      renderInspector(true);
    }
    if (force) showToast(err.message, 'red');
  }
}

function renderFatalError(title, detail) {
  const subtitle = $('mc-subtitle');
  if (subtitle && (!state.snap || subtitle.textContent.startsWith('Loading'))) {
    subtitle.textContent = 'Unable to load workspaces';
  }
  const view = $('mc-view');
  if (view) {
    view.innerHTML = `
      <div class="mc-empty">
        <p class="mc-empty-title">${esc(title || 'Unable to load Mission Control')}</p>
        <p class="mc-empty-sub">${esc(detail || 'Unexpected error')}</p>
        <button type="button" class="mc-btn-subtle" data-action="retry-poll">Retry</button>
      </div>
    `;
  }
}

async function pollDashboard(force = false) {
  if (fetchInFlight) return;
  fetchInFlight = true;
  try {
    const url = withQuery('/api/dashboard', { etag: force ? '' : state.etag });
    const data = await fetchJson(url, { method: 'GET' });
    if (!data.unchanged) {
      state.snap = data;
      state.etag = data.etag || '';
      if (state.demo === null && data.mode) {
        state.demo = data.mode === 'demo';
      }
      if (!state.selectedThreadId || !findProjectForThread(state.selectedThreadId)) {
        state.selectedThreadId =
          data.defaultThreadId ||
          data.projects?.find((p) => p.threads?.length)?.threads?.[0]?.id ||
          '';
      }
      renderShell();
    }
    if (state.selectedThreadId) {
      await loadThreadDetail(state.selectedThreadId, force);
    }
  } catch (err) {
    if (!state.snap || $('mc-subtitle')?.textContent?.startsWith('Loading')) {
      renderFatalError('Unable to reach Mission Control API', err?.message || String(err));
    } else {
      showToast(err?.message || 'Dashboard refresh failed', 'red');
    }
  } finally {
    fetchInFlight = false;
  }
}

function resetPollTimer() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (state.pollMs > 0 && !document.hidden) {
    pollTimer = setInterval(() => {
      pollDashboard(false);
    }, state.pollMs);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  } else {
    pollDashboard(false);
    resetPollTimer();
  }
});

// ---------- Rendering ----------
function renderRail() {
  const rail = $('mc-rail');
  const overviewActive = state.view === 'overview' && !state.pluginsOpen && !state.settingsOpen;
  const timelineActive = state.view === 'timeline' && !state.pluginsOpen && !state.settingsOpen;

  rail.innerHTML = `
    <button type="button" class="mc-rail-btn${overviewActive ? ' active' : ''}" data-rail-view="overview" title="Mission Control Overview" aria-label="Mission Control Overview">
      ${icon('grid')}
    </button>
    <button type="button" class="mc-rail-btn" data-action="new-thread" title="New Thread" aria-label="New Thread">
      ${icon('plus')}
    </button>
    <button type="button" class="mc-rail-btn${timelineActive ? ' active' : ''}" data-rail-view="timeline" title="Timeline" aria-label="Timeline">
      ${icon('clock')}
    </button>
    <button type="button" class="mc-rail-btn${state.pluginsOpen ? ' active' : ''}" data-action="toggle-plugins" title="Plugins & Sidecars" aria-label="Plugins and Sidecars">
      ${icon('puzzle')}
    </button>
    <div class="mc-rail-spacer"></div>
    <button type="button" class="mc-rail-btn${state.settingsOpen ? ' active' : ''}" data-action="toggle-settings" title="Settings" aria-label="Settings">
      ${icon('gear')}
    </button>
  `;
}

function renderHeader() {
  const summary = state.snap?.summary || {};
  const pCount = summary.projectCount ?? (state.snap?.projects?.length || 0);
  const tCount = summary.threadCount ?? 0;
  const sCount = summary.liveSwarmCount ?? 0;
  const aCount = summary.needsAttentionCount ?? (state.snap?.needsAttention?.length || 0);
  const rCount = summary.runningCount ?? 0;

  $('mc-subtitle').textContent = `${plural(pCount, 'Project')} · ${plural(tCount, 'Thread')} · ${plural(sCount, 'Live Swarm')}`;
  $('mc-count-attention').textContent = String(aCount);
  $('mc-count-running').textContent = String(rCount);

  document.querySelectorAll('#mc-view-tabs .mc-seg-btn').forEach((btn) => {
    const active = btn.dataset.view === state.view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  document.querySelectorAll('#mc-filters .mc-filter-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.filter === state.filter);
  });
}

function renderActiveView() {
  const container = $('mc-view');
  if (!state.snap) {
    container.innerHTML = '<div class="mc-empty"><p class="mc-empty-sub">Scanning projects, Git worktrees, Swarms, and scheduled jobs…</p></div>';
    return;
  }

  if (state.view === 'board') {
    container.innerHTML = renderBoard(state.snap, state);
  } else if (state.view === 'timeline') {
    container.innerHTML = renderTimeline(state.snap, state);
  } else if (state.view === 'graph') {
    container.innerHTML = renderGraph(state.snap, state);
    wireGraphHover();
  } else {
    container.innerHTML = renderOverview(state.snap, state);
  }
}

function wireGraphHover() {
  const svg = document.querySelector('.mc-graph-svg');
  if (!svg) return;
  const edges = [...svg.querySelectorAll('.mc-graph-edge')];
  svg.addEventListener('mouseover', (e) => {
    const node = e.target.closest('[data-graph-node]');
    if (!node) return;
    const id = node.dataset.graphNode;
    for (const edge of edges) {
      const hit = edge.dataset.edgeFrom === id || edge.dataset.edgeTo === id;
      edge.classList.toggle('is-highlight', hit);
    }
  });
  svg.addEventListener('mouseout', (e) => {
    if (!e.target.closest('[data-graph-node]')) return;
    for (const edge of edges) edge.classList.remove('is-highlight');
  });
}

function ensureInspectorContainers() {
  const insp = $('mc-inspector');
  let main = $('mc-insp-main');
  let foot = $('mc-insp-foot');
  if (!main || !foot) {
    insp.innerHTML = '<div id="mc-insp-main" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:hidden;"></div><div id="mc-insp-foot"></div>';
    main = $('mc-insp-main');
    foot = $('mc-insp-foot');
  }
  return { insp, main, foot };
}

function renderInspector(force = false) {
  const { insp, main, foot } = ensureInspectorContainers();
  insp.classList.toggle('is-open', state.inspectorOpen);
  syncBackdrop();

  const project = state.detail ? findProjectForThread(state.detail.id) : null;
  const nextDetailKey = JSON.stringify({
    detail: state.detail,
    tab: state.inspectorTab,
    diffFile: state.inspectorDiffFile,
    projectPath: project?.path || '',
  });

  if (force || nextDetailKey !== state.detailKey) {
    const prevScroll = $('mc-insp-scroll')?.scrollTop || 0;
    main.innerHTML = renderInspectorContent(state.detail, state, project?.path || '');
    state.detailKey = nextDetailKey;
    const nextScroll = $('mc-insp-scroll');
    if (nextScroll && prevScroll > 0) nextScroll.scrollTop = prevScroll;
  }

  const nextComposerKey = JSON.stringify({
    id: state.detail?.id || '',
    models: state.detail?.models || null,
    modes: state.detail?.modes || null,
    placeholder: state.detail?.composerPlaceholder || '',
    sending: state.sendingReply,
  });

  if (force || nextComposerKey !== state.composerKey) {
    const activeEl = document.activeElement;
    const wasFocused = activeEl && activeEl.id === 'mc-composer-input';
    const selStart = wasFocused ? activeEl.selectionStart : null;
    const selEnd = wasFocused ? activeEl.selectionEnd : null;

    foot.innerHTML = renderInspectorComposer(state.detail, state);
    state.composerKey = nextComposerKey;

    const input = $('mc-composer-input');
    if (input) {
      autoResizeTextarea(input);
      if (wasFocused) {
        input.focus();
        if (selStart !== null && selEnd !== null) input.setSelectionRange(selStart, selEnd);
      }
    }
  }
}

function renderShell() {
  renderRail();
  renderHeader();
  renderActiveView();
  renderInspector(false);
  if (state.pluginsOpen) {
    $('mc-plugins-drawer').innerHTML = renderPluginsDrawer(state.snap);
  }
  if (state.settingsOpen) {
    $('mc-settings-popover').innerHTML = renderSettingsPopover(state);
  }
}

function syncBackdrop() {
  const show = state.pluginsOpen || (state.inspectorOpen && window.innerWidth < 1100);
  $('mc-backdrop').classList.toggle('hidden', !show);
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(120, Math.max(36, el.scrollHeight))}px`;
}

// ---------- Drawers, Popovers, Modals ----------
function openPluginsDrawer() {
  state.settingsOpen = false;
  $('mc-settings-popover').classList.add('hidden');
  state.pluginsOpen = true;
  const drawer = $('mc-plugins-drawer');
  drawer.innerHTML = renderPluginsDrawer(state.snap);
  drawer.classList.remove('hidden');
  syncBackdrop();
  renderRail();
}

function closePluginsDrawer() {
  state.pluginsOpen = false;
  $('mc-plugins-drawer').classList.add('hidden');
  syncBackdrop();
  renderRail();
}

function toggleSettingsPopover() {
  closePluginsDrawer();
  state.settingsOpen = !state.settingsOpen;
  const pop = $('mc-settings-popover');
  if (state.settingsOpen) {
    pop.innerHTML = renderSettingsPopover(state);
    pop.classList.remove('hidden');
  } else {
    pop.classList.add('hidden');
  }
  renderRail();
}

function closeSettingsPopover() {
  state.settingsOpen = false;
  $('mc-settings-popover').classList.add('hidden');
  renderRail();
}

function openNewThreadModal(projectId = '') {
  closeSettingsPopover();
  state.modal = { type: 'new-thread', projectId };
  const root = $('mc-modal-root');
  root.innerHTML = renderNewThreadModal(state.snap, { projectId });
  root.classList.remove('hidden');
  $('mc-nt-prompt')?.focus();
}

function openPaletteModal() {
  closeSettingsPopover();
  const query = '';
  const items = buildPaletteItems(state.snap, query, Boolean(state.demo));
  state.modal = { type: 'palette', query, index: 0, items };
  const root = $('mc-modal-root');
  root.innerHTML = renderCommandPalette(items, query, 0);
  root.classList.remove('hidden');
  $('mc-palette-input')?.focus();
}

function updatePalette(query) {
  if (state.modal?.type !== 'palette') return;
  const items = buildPaletteItems(state.snap, query, Boolean(state.demo));
  state.modal.query = query;
  state.modal.items = items;
  state.modal.index = Math.min(state.modal.index, Math.max(0, items.length - 1));
  const list = $('mc-palette-list');
  if (!list) return;
  const temp = document.createElement('div');
  temp.innerHTML = renderCommandPalette(items, query, state.modal.index);
  const nextList = temp.querySelector('#mc-palette-list');
  if (nextList) list.innerHTML = nextList.innerHTML;
}

function closeModal() {
  state.modal = null;
  $('mc-modal-root').classList.add('hidden');
  $('mc-modal-root').innerHTML = '';
}

function runPaletteItem(item) {
  if (!item?.action) return;
  closeModal();
  const act = item.action;
  if (act.type === 'new-thread') openNewThreadModal(act.projectId || '');
  else if (act.type === 'toggle-demo') setDemoMode(!state.demo);
  else if (act.type === 'open-plugins') openPluginsDrawer();
  else if (act.type === 'view') setView(act.view);
  else if (act.type === 'thread') selectThread(act.threadId);
}

// ---------- Actions & State Transitions ----------
function setView(view) {
  state.view = view;
  renderRail();
  renderHeader();
  renderActiveView();
}

function setFilter(filter) {
  state.filter = filter;
  renderHeader();
  renderActiveView();
}

function setDemoMode(enabled) {
  state.demo = Boolean(enabled);
  state.etag = '';
  state.selectedThreadId = '';
  state.detail = null;
  state.composerDraft = '';
  if (state.settingsOpen) {
    $('mc-settings-popover').innerHTML = renderSettingsPopover(state);
  }
  pollDashboard(true);
}

function isUnseenDoneThread(threadId) {
  if (!threadId) return false;
  if ((state.snap?.needsAttention || []).some((a) => a.threadId === threadId && a.kind === 'done')) {
    return true;
  }
  const proj = findProjectForThread(threadId);
  return Boolean(proj?.threads?.some((t) => t.id === threadId && t.unseen));
}

async function markThreadSeen(threadId, opts = {}) {
  if (!threadId) return;
  try {
    await fetchJson('/api/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        demo: state.demo === true,
      }),
    });
    if (opts.toast) showToast(opts.toast, 'green');
    state.etag = '';
    await pollDashboard(true);
  } catch (err) {
    if (opts.toast) showToast(err.message || 'Failed to mark thread seen', 'red');
  }
}

async function selectThread(threadId, opts = {}) {
  if (!threadId) return;
  const changed = state.selectedThreadId !== threadId;
  state.selectedThreadId = threadId;
  if (changed) {
    state.composerDraft = '';
    state.composerModel = '';
    state.composerMode = '';
    state.inspectorDiffFile = 'all';
  }
  if (opts.tab) state.inspectorTab = opts.tab;
  if (window.innerWidth < 1100) state.inspectorOpen = true;

  renderActiveView();
  await loadThreadDetail(threadId, true);
  if (opts.focusComposer) {
    setTimeout(() => $('mc-composer-input')?.focus(), 40);
  }
  if (!opts.skipMarkSeen && isUnseenDoneThread(threadId)) {
    markThreadSeen(threadId);
  }
}

async function handleApprove(attentionId, threadId, btn) {
  if (btn) btn.disabled = true;
  try {
    await fetchJson('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attentionId,
        threadId,
        demo: state.demo === true,
      }),
    });
    showToast('Approved and notified agent', 'green');
    state.etag = '';
    await pollDashboard(true);
  } catch (err) {
    showToast(err.message || 'Approval failed', 'red');
    if (btn) btn.disabled = false;
  }
}

async function handleSendReply() {
  if (state.sendingReply || !state.selectedThreadId) return;
  const input = $('mc-composer-input');
  const message = (input?.value ?? state.composerDraft).trim();
  if (!message) return;

  const model = $('mc-composer-model')?.value || state.composerModel || undefined;
  const mode = $('mc-composer-mode')?.value || state.composerMode || undefined;

  state.sendingReply = true;
  renderInspector(true);

  try {
    await fetchJson('/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: state.selectedThreadId,
        message,
        model,
        mode,
        demo: state.demo === true,
      }),
    });
    state.composerDraft = '';
    state.sendingReply = false;
    state.etag = '';
    showToast('Reply sent', 'green');
    await pollDashboard(true);
  } catch (err) {
    state.sendingReply = false;
    renderInspector(true);
    showToast(err.message || 'Failed to send reply', 'red');
  }
}

async function handleCreateThread(form) {
  const fd = new FormData(form);
  const projectId = String(fd.get('projectId') || '').trim();
  const title = String(fd.get('title') || '').trim();
  const prompt = String(fd.get('prompt') || '').trim();
  const model = String(fd.get('model') || '').trim();
  if (!projectId || !prompt) {
    showToast('Project and prompt are required', 'red');
    return;
  }

  const submitBtn = $('mc-nt-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetchJson('/api/threads/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        title: title || undefined,
        prompt,
        model: model || undefined,
        demo: state.demo === true,
      }),
    });
    closeModal();
    showToast('Thread launched', 'green');
    state.etag = '';
    if (res.threadId) {
      state.selectedThreadId = res.threadId;
      state.inspectorTab = 'activity';
      if (window.innerWidth < 1100) state.inspectorOpen = true;
    }
    await pollDashboard(true);
  } catch (err) {
    if (submitBtn) submitBtn.disabled = false;
    showToast(err.message || 'Failed to start thread', 'red');
  }
}

function handleOpenFull(threadId) {
  if (!threadId) return;
  if (window.sidecar?.ui?.toggleConversation && !String(threadId).startsWith('demo-')) {
    window.sidecar.ui.toggleConversation(threadId);
    return;
  }
  if (window.innerWidth < 1100) state.inspectorOpen = true;
  state.inspectorTab = 'activity';
  renderInspector(true);
  showToast('Opened full thread inspector');
}

function handleOpenFile(relPath) {
  const proj = state.detail ? findProjectForThread(state.detail.id) : null;
  if (window.sidecar?.ui?.toggleAuxPane && proj?.path && !String(state.detail?.id || '').startsWith('demo-')) {
    const cleanBase = proj.path.replace(/\/+$/, '');
    const cleanRel = String(relPath || '').replace(/^\/+/, '');
    window.sidecar.ui.toggleAuxPane({ tabType: 'fileView', uri: `file://${cleanBase}/${cleanRel}` });
    return;
  }
  state.inspectorTab = 'diff';
  state.inspectorDiffFile = relPath;
  renderInspector(true);
}

// ---------- Event Listeners ----------
document.addEventListener('click', (e) => {
  const railView = e.target.closest('[data-rail-view]');
  if (railView) {
    closePluginsDrawer();
    closeSettingsPopover();
    setView(railView.dataset.railView);
    return;
  }

  const segBtn = e.target.closest('#mc-view-tabs .mc-seg-btn');
  if (segBtn) {
    setView(segBtn.dataset.view);
    return;
  }

  const filterPill = e.target.closest('#mc-filters .mc-filter-pill');
  if (filterPill) {
    setFilter(filterPill.dataset.filter);
    return;
  }

  const attAction = e.target.closest('[data-attention-action]');
  if (attAction) {
    e.stopPropagation();
    const act = attAction.dataset.attentionAction;
    const threadId = attAction.dataset.threadId;
    const attentionId = attAction.dataset.attentionId;
    if (act === 'approve') handleApprove(attentionId, threadId, attAction);
    else if (act === 'dismiss') markThreadSeen(threadId, { toast: 'Marked as seen' });
    else if (act === 'diff') selectThread(threadId, { tab: 'diff', openDrawer: true });
    else if (act === 'reply') selectThread(threadId, { tab: 'activity', openDrawer: true, focusComposer: true });
    else if (act === 'open') {
      selectThread(threadId, { tab: 'activity', openDrawer: true });
      handleOpenFull(threadId);
    } else selectThread(threadId, { tab: 'activity', openDrawer: true });
    return;
  }

  const openFileBtn = e.target.closest('[data-open-file]');
  if (openFileBtn) {
    e.stopPropagation();
    handleOpenFile(openFileBtn.dataset.openFile);
    return;
  }

  const jumpDiff = e.target.closest('[data-jump-diff]');
  if (jumpDiff) {
    state.inspectorTab = 'diff';
    state.inspectorDiffFile = jumpDiff.dataset.jumpDiff;
    renderInspector(true);
    return;
  }

  const diffChip = e.target.closest('[data-diff-file]');
  if (diffChip) {
    state.inspectorDiffFile = diffChip.dataset.diffFile;
    renderInspector(true);
    return;
  }

  const inspTab = e.target.closest('[data-insp-tab]');
  if (inspTab) {
    state.inspectorTab = inspTab.dataset.inspTab;
    renderInspector(true);
    return;
  }

  const openConv = e.target.closest('[data-open-conv]');
  if (openConv) {
    window.sidecar?.ui?.toggleConversation?.(openConv.dataset.openConv);
    return;
  }

  const newProjBtn = e.target.closest('[data-new-thread-project]');
  if (newProjBtn) {
    e.stopPropagation();
    openNewThreadModal(newProjBtn.dataset.newThreadProject);
    return;
  }

  const selThread = e.target.closest('[data-select-thread]');
  if (selThread) {
    selectThread(selThread.dataset.selectThread, { openDrawer: true });
    return;
  }

  const setDemoBtn = e.target.closest('[data-set-demo]');
  if (setDemoBtn) {
    setDemoMode(setDemoBtn.dataset.setDemo === '1');
    return;
  }

  const paletteBtn = e.target.closest('[data-palette-idx]');
  if (paletteBtn && state.modal?.type === 'palette') {
    const item = state.modal.items?.[Number(paletteBtn.dataset.paletteIdx)];
    runPaletteItem(item);
    return;
  }

  if (e.target.closest('[data-close-modal]') || e.target === $('mc-modal-root')) {
    closeModal();
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'new-thread') openNewThreadModal('');
    else if (action === 'toggle-plugins') (state.pluginsOpen ? closePluginsDrawer() : openPluginsDrawer());
    else if (action === 'close-plugins') closePluginsDrawer();
    else if (action === 'toggle-settings') toggleSettingsPopover();
    else if (action === 'close-settings') closeSettingsPopover();
    else if (action === 'load-demo') setDemoMode(true);
    else if (action === 'clear-filters') {
      state.filter = 'all';
      state.search = '';
      if ($('mc-search')) $('mc-search').value = '';
      renderHeader();
      renderActiveView();
    } else if (action === 'retry-poll') {
      pollDashboard(true);
    } else if (action === 'close-inspector') {
      state.inspectorOpen = false;
      renderInspector(false);
    } else if (action === 'open-full') {
      handleOpenFull(actionEl.dataset.threadId);
    }
    return;
  }

  if (e.target === $('mc-backdrop')) {
    closePluginsDrawer();
    state.inspectorOpen = false;
    renderInspector(false);
    return;
  }

  if (
    state.settingsOpen &&
    !e.target.closest('#mc-settings-popover') &&
    !e.target.closest('[data-action="toggle-settings"]')
  ) {
    closeSettingsPopover();
  }
});

$('mc-new-thread-btn')?.addEventListener('click', () => openNewThreadModal(''));
$('mc-cmdk-trigger')?.addEventListener('click', openPaletteModal);

$('mc-search')?.addEventListener('input', (e) => {
  state.search = e.target.value;
  renderActiveView();
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'mc-composer-input') {
    state.composerDraft = e.target.value;
    autoResizeTextarea(e.target);
  } else if (e.target.id === 'mc-palette-input') {
    updatePalette(e.target.value);
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'mc-composer-model') {
    state.composerModel = e.target.value;
  } else if (e.target.id === 'mc-composer-mode') {
    state.composerMode = e.target.value;
  } else if (e.target.id === 'mc-poll-select') {
    state.pollMs = Number(e.target.value) || 0;
    resetPollTimer();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'mc-composer-form') {
    e.preventDefault();
    handleSendReply();
  } else if (e.target.id === 'mc-new-thread-form') {
    e.preventDefault();
    handleCreateThread(e.target);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (state.modal?.type === 'palette') closeModal();
    else openPaletteModal();
    return;
  }

  if (e.key === 'Escape') {
    if (state.modal) {
      e.preventDefault();
      closeModal();
    } else if (state.settingsOpen) {
      e.preventDefault();
      closeSettingsPopover();
    } else if (state.pluginsOpen) {
      e.preventDefault();
      closePluginsDrawer();
    } else if (state.inspectorOpen) {
      e.preventDefault();
      state.inspectorOpen = false;
      renderInspector(false);
    }
    return;
  }

  if (state.modal?.type === 'palette') {
    const items = state.modal.items || [];
    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      state.modal.index = (state.modal.index + 1) % items.length;
      updatePalette(state.modal.query);
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      state.modal.index = (state.modal.index - 1 + items.length) % items.length;
      updatePalette(state.modal.query);
    } else if (e.key === 'Enter' && items.length > 0) {
      e.preventDefault();
      runPaletteItem(items[state.modal.index]);
    }
    return;
  }

  if (e.target?.id === 'mc-composer-input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendReply();
    return;
  }

  if (e.key === 'Enter' && e.target?.matches('[data-select-thread], [data-jump-diff]')) {
    e.preventDefault();
    e.target.click();
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth >= 1100 && state.inspectorOpen) {
    state.inspectorOpen = false;
  }
  syncBackdrop();
});

// ---------- Global Error Guard & Boot ----------
window.addEventListener('error', (e) => {
  if (!state.snap || $('mc-subtitle')?.textContent?.startsWith('Loading')) {
    renderFatalError('Mission Control failed to initialize', e?.message || 'Script error');
  }
});

window.addEventListener('unhandledrejection', (e) => {
  if (!state.snap || $('mc-subtitle')?.textContent?.startsWith('Loading')) {
    const msg = e?.reason?.message || String(e?.reason || 'Unhandled promise rejection');
    renderFatalError('Mission Control failed to initialize', msg);
  }
});

try {
  renderRail();
  pollDashboard(true);
  resetPollTimer();
} catch (err) {
  renderFatalError('Mission Control failed to start', err?.message || String(err));
}
