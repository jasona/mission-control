/* Auto-generated classic non-module bundle by build_client.mjs. Do not edit directly; edit app-main.js, views/*, or components/* and re-run build_client.mjs. */
(function () {
  'use strict';
  const __MC = Object.create(null);

  // --- components/icons.js ---
  __MC["components/icons.js"] = (() => {
    /**
     * Shared SVG icons, HTML escaping, and safe formatting helpers.
     */

    const ESC_MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
    }

    const ALLOWED_TONES = new Set([
      'green',
      'amber',
      'blue',
      'gray',
      'red',
      'idle',
      'muted',
      'error',
      'success',
      'warning',
      'info',
    ]);
    function safeTone(tone, fallback = 'muted') {
      const t = String(tone ?? '').toLowerCase();
      return ALLOWED_TONES.has(t) ? t : fallback;
    }
    function highlightMentions(text) {
      return esc(text).replace(/(^|[\s(>])(@[a-zA-Z0-9][a-zA-Z0-9_-]*)/g, '$1<span class="mc-mention">$2</span>');
    }
    function formatShortTime(ts) {
      if (!ts) return '';
      if (typeof ts === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(ts) && !/^\d+$/.test(ts)) {
        return ts;
      }
      const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
      if (!Number.isFinite(ms)) return String(ts);
      const diffSec = Math.round((ms - Date.now()) / 1000);
      const abs = Math.abs(diffSec);
      if (abs < 60) return diffSec > 10 ? `in ${abs}s` : 'now';
      if (abs < 3600) {
        const m = Math.round(abs / 60);
        return diffSec > 0 ? `Next ${m}m` : `${m}m`;
      }
      if (abs < 86400) {
        const h = Math.round(abs / 3600);
        return diffSec > 0 ? `Next ${h}h` : `${h}h`;
      }
      const d = Math.round(abs / 86400);
      return diffSec > 0 ? `Next ${d}d` : `${d}d`;
    }
    function formatClock(ts) {
      if (!ts) return '';
      const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
      if (!Number.isFinite(ms)) return String(ts);
      return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
    }

    const ICONS = {
      grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
      plus: '<path d="M8 3.25v9.5M3.25 8h9.5"/>',
      clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 4.75V8l2.25 1.5"/>',
      puzzle: '<path d="M6.25 3a1.5 1.5 0 0 1 3 0v.75H11a1.25 1.25 0 0 1 1.25 1.25v1.75H13a1.5 1.5 0 0 1 0 3h-.75V11.5A1.25 1.25 0 0 1 11 12.75H5A1.25 1.25 0 0 1 3.75 11.5V9.75H4.5a1.5 1.5 0 0 0 0-3h-.75V5A1.25 1.25 0 0 1 5 3.75h1.25z"/>',
      gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 2.25v1.2M8 12.55v1.2M3.93 3.93l.85.85M11.22 11.22l.85.85M2.25 8h1.2M12.55 8h1.2M3.93 12.07l.85-.85M11.22 4.78l.85-.85"/>',
      folder: '<path d="M2.25 4.5a1.25 1.25 0 0 1 1.25-1.25h2.7l1.2 1.5h5.1a1.25 1.25 0 0 1 1.25 1.25v5.5a1.25 1.25 0 0 1-1.25 1.25h-9a1.25 1.25 0 0 1-1.25-1.25z"/>',
      branch: '<circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11.25" cy="6.25" r="1.5"/><path d="M5 5.5v5M5 10.5c0-2.25 6.25-1 6.25-2.75"/>',
      search: '<circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3.25 3.25"/>',
      arrowUpRight: '<path d="M5 11 11.5 4.5M6.25 4.5h5.25v5.25"/>',
      arrowLeft: '<path d="M12.5 8H3.5M7 4.5 3.5 8 7 11.5"/>',
      arrowRight: '<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5"/>',
      send: '<path d="M13.5 2.75 7.25 9M13.5 2.75l-4 10.75-2.25-4.5-4.5-2.25z"/>',
      sliders: '<path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h9"/><circle cx="6" cy="4.5" r="1.1" class="fill"/><circle cx="10.2" cy="8" r="1.1" class="fill"/><circle cx="7" cy="11.5" r="1.1" class="fill"/>',
      check: '<path d="m4.5 8.25 2.25 2.25L11.5 5.5"/>',
      checkCircle: '<circle cx="8" cy="8" r="5.5"/><path d="m5.5 8.2 1.7 1.7 3.4-3.6"/>',
      agent: '<circle cx="8" cy="8" r="5.25"/><path d="M5.75 9.25c.65.85 1.4 1.25 2.25 1.25s1.6-.4 2.25-1.25M6.25 6.75h.05M9.75 6.75h.05"/>',
      swarm: '<circle cx="8" cy="4.25" r="1.5"/><circle cx="4.25" cy="11.25" r="1.5"/><circle cx="11.75" cy="11.25" r="1.5"/><path d="M7.1 5.5 5.1 9.9M8.9 5.5l2 4.4M5.75 11.25h4.5"/>',
      chevronDown: '<path d="m4.5 6.25 3.5 3.5 3.5-3.5"/>',
      close: '<path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5"/>',
      file: '<path d="M4.25 2.5h4.75l3 3v8a1 1 0 0 1-1 1h-6.75a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M8.75 2.5v3.25H12"/>',
      code: '<path d="m5.75 5-3 3 3 3M10.25 5l3 3-3 3"/>',
      alert: '<path d="M8 2.75 13.75 13H2.25z"/><path d="M8 6.5v3M8 11.25h.02"/>',
    };
    function icon(name, className = '') {
      const body = ICONS[name] || ICONS.grid;
      const cls = className ? `mc-icon ${className}` : 'mc-icon';
      return `<svg class="${esc(cls)}" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
    }
    function dotHtml(tone, className = '') {
      const cls = className ? `mc-dot tone-${safeTone(tone)} ${esc(className)}` : `mc-dot tone-${safeTone(tone)}`;
      return `<span class="${cls}" aria-hidden="true"></span>`;
    }

    return { esc: esc, safeTone: safeTone, highlightMentions: highlightMentions, formatShortTime: formatShortTime, formatClock: formatClock, icon: icon, dotHtml: dotHtml };
  })();
  // --- components/modal.js ---
  __MC["components/modal.js"] = (() => {
    const { dotHtml, esc, icon, safeTone } = __MC["components/icons.js"];
    function renderNewThreadModal(snap, options = {}) {
      const projects = Array.isArray(snap?.projects) ? snap.projects : [];
      const selectedProjId = options.projectId || projects[0]?.id || '';
      const models = [
        { id: 'orchestrator-neon', label: 'Orchestrator (Neon)' },
        { id: 'planner-fast', label: 'Planner (Fast)' },
        { id: 'executor-deep', label: 'Executor (Deep)' },
      ];

      const projOptions = projects.length
        ? projects.map((p) => `<option value="${esc(p.id)}"${p.id === selectedProjId ? ' selected' : ''}>${esc(p.name)} (${esc(p.branch || 'main')})</option>`).join('')
        : '<option value="default">Current Workspace</option>';

      return `
        <div class="mc-modal" role="document">
          <header class="mc-modal-head">
            <h2 class="mc-modal-title">New Thread</h2>
            <button type="button" class="mc-icon-btn" data-close-modal aria-label="Close modal">${icon('close')}</button>
          </header>
          <form id="mc-new-thread-form">
            <div class="mc-modal-body">
              <div class="mc-field">
                <label class="mc-label" for="mc-nt-project">Project</label>
                <select id="mc-nt-project" name="projectId" class="mc-select">${projOptions}</select>
              </div>
              <div class="mc-field">
                <label class="mc-label" for="mc-nt-title">Title (optional)</label>
                <input id="mc-nt-title" name="title" type="text" class="mc-input" placeholder="e.g. Add webhook retry queue">
              </div>
              <div class="mc-field">
                <label class="mc-label" for="mc-nt-prompt">Prompt</label>
                <textarea id="mc-nt-prompt" name="prompt" class="mc-textarea" required placeholder="Describe what the agent or Swarm should build, fix, or investigate..."></textarea>
              </div>
              <div class="mc-field">
                <label class="mc-label" for="mc-nt-model">Model</label>
                <select id="mc-nt-model" name="model" class="mc-select">
                  ${models.map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('')}
                </select>
              </div>
            </div>
            <footer class="mc-modal-foot">
              <button type="button" class="mc-btn-subtle" data-close-modal>Cancel</button>
              <button type="submit" class="mc-btn-primary" id="mc-nt-submit">Start Thread</button>
            </footer>
          </form>
        </div>
      `;
    }
    function buildPaletteItems(snap, query, isDemo) {
      const q = String(query || '').trim().toLowerCase();
      const items = [
        { id: 'act-new', label: 'Start New Thread', meta: 'Action', action: { type: 'new-thread' } },
        { id: 'act-mode', label: isDemo ? 'Switch to Live Workspace' : 'Switch to Demo Preview', meta: 'Mode', action: { type: 'toggle-demo' } },
        { id: 'act-plugins', label: 'Open Plugins & Sidecars', meta: 'Drawer', action: { type: 'open-plugins' } },
        { id: 'view-overview', label: 'Go to Overview', meta: 'View', action: { type: 'view', view: 'overview' } },
        { id: 'view-board', label: 'Go to Board', meta: 'View', action: { type: 'view', view: 'board' } },
        { id: 'view-timeline', label: 'Go to Timeline', meta: 'View', action: { type: 'view', view: 'timeline' } },
        { id: 'view-graph', label: 'Go to Graph', meta: 'View', action: { type: 'view', view: 'graph' } },
      ];

      for (const att of snap?.needsAttention || []) {
        items.push({
          id: `att-${att.id}`,
          label: `${att.badgeLabel || 'Attention'}: ${att.threadTitle}`,
          meta: att.projectName || 'Triage',
          tone: 'amber',
          action: { type: 'thread', threadId: att.threadId },
        });
      }

      for (const p of snap?.projects || []) {
        items.push({
          id: `proj-${p.id}`,
          label: `New thread in ${p.name}`,
          meta: p.branch || 'Project',
          action: { type: 'new-thread', projectId: p.id },
        });
        for (const t of p.threads || []) {
          items.push({
            id: `thr-${t.id}`,
            label: t.title || 'Untitled thread',
            meta: `${p.name} · ${t.rightLabel || t.status || ''}`,
            tone: t.dotTone || 'gray',
            action: { type: 'thread', threadId: t.id },
          });
        }
      }

      if (!q) return items.slice(0, 14);
      return items
        .filter((it) => it.label.toLowerCase().includes(q) || it.meta.toLowerCase().includes(q))
        .slice(0, 18);
    }
    function renderCommandPalette(items, query, activeIndex = 0) {
      const rows = items.length
        ? items.map((it, idx) => `
            <button type="button" class="mc-palette-item${idx === activeIndex ? ' active' : ''}" data-palette-idx="${idx}">
              <span style="display:flex;align-items:center;gap:8px;min-width:0;">
                ${it.tone ? dotHtml(it.tone) : ''}
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(it.label)}</span>
              </span>
              <span class="mc-palette-kind">${esc(it.meta)}</span>
            </button>
          `).join('')
        : '<div class="mc-thread-sub" style="padding:14px;text-align:center;">No matching commands or threads</div>';

      return `
        <div class="mc-modal" role="document">
          <div class="mc-palette-input-wrap">
            ${icon('search')}
            <input id="mc-palette-input" type="search" class="mc-palette-input" value="${esc(query)}" placeholder="Jump to project, thread, view, or action…" autocomplete="off">
            <span class="mc-kbd">Esc</span>
          </div>
          <div class="mc-palette-list" id="mc-palette-list">${rows}</div>
        </div>
      `;
    }
    function renderPluginsDrawer(snap) {
      const plugins = Array.isArray(snap?.plugins) ? snap.plugins : [];

      const listHtml = plugins.length
        ? plugins.map((pl) => {
            const sidecars = Array.isArray(pl.sidecars) ? pl.sidecars : [];
            return `
              <article class="mc-activity-card">
                <div class="mc-activity-head">
                  <div class="mc-activity-actors">
                    ${dotHtml(pl.enabled !== false ? 'green' : 'gray')}
                    <strong>${esc(pl.displayName || pl.name || pl.id)}</strong>
                  </div>
                  <span class="mc-code-pill">${esc(pl.version || '0.1.0')}</span>
                </div>
                ${pl.description ? `<div class="mc-activity-text">${esc(pl.description)}</div>` : ''}
                <div class="mc-activity-foot">
                  <span class="mc-status-badge tone-${pl.builtin ? 'blue' : 'muted'}">${pl.builtin ? 'Built-in' : 'User Plugin'}</span>
                  ${sidecars.map((sc) => `<span class="mc-code-pill">${esc(sc.displayName || sc.id)}${sc.hasWebUi ? ' · Web UI' : ''}</span>`).join('')}
                </div>
              </article>
            `;
          }).join('')
        : '<div class="mc-empty"><p class="mc-empty-sub">No installed Antigravity plugins found.</p></div>';

      return `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <h2 class="mc-modal-title">Plugins &amp; Sidecars</h2>
            <div class="mc-thread-sub">${plugins.length} discovered</div>
          </div>
          <button type="button" class="mc-icon-btn" data-action="close-plugins" aria-label="Close drawer">${icon('close')}</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${listHtml}
        </div>
      `;
    }
    function renderSettingsPopover(state) {
      const theme = document.documentElement.dataset.theme === 'light' ? 'Light' : 'Dark Obsidian';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <strong style="font-size:13px;">Settings</strong>
          <button type="button" class="mc-icon-btn" data-action="close-settings" aria-label="Close settings">${icon('close')}</button>
        </div>

        <div class="mc-setting-row">
          <div>
            <div style="font-size:12.5px;font-weight:500;">Data Mode</div>
            <div style="font-size:11px;color:var(--mc-fg-muted);">Live workspace or screenshot demo</div>
          </div>
          <div class="mc-toggle-group" role="group" aria-label="Data mode">
            <button type="button" class="mc-toggle-btn${!state.demo ? ' active' : ''}" data-set-demo="0">Live</button>
            <button type="button" class="mc-toggle-btn${state.demo ? ' active' : ''}" data-set-demo="1">Demo</button>
          </div>
        </div>

        <div class="mc-setting-row">
          <label for="mc-poll-select" style="font-size:12.5px;font-weight:500;">Refresh Interval</label>
          <select id="mc-poll-select" class="mc-select" style="width:auto;padding:4px 8px;">
            <option value="1500"${state.pollMs === 1500 ? ' selected' : ''}>1.5s</option>
            <option value="2000"${state.pollMs === 2000 ? ' selected' : ''}>2s</option>
            <option value="5000"${state.pollMs === 5000 ? ' selected' : ''}>5s</option>
            <option value="0"${state.pollMs === 0 ? ' selected' : ''}>Paused</option>
          </select>
        </div>

        <div class="mc-setting-row">
          <span style="font-size:12px;color:var(--mc-fg-muted);">Host Theme</span>
          <span class="mc-code-pill">${esc(theme)}</span>
        </div>
      `;
    }

    return { renderNewThreadModal: renderNewThreadModal, buildPaletteItems: buildPaletteItems, renderCommandPalette: renderCommandPalette, renderPluginsDrawer: renderPluginsDrawer, renderSettingsPopover: renderSettingsPopover };
  })();
  // --- views/overview.js ---
  __MC["views/overview.js"] = (() => {
    const { dotHtml, esc, icon, safeTone } = __MC["components/icons.js"];
    function matchesQuery(q, ...fields) {
      if (!q) return true;
      return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
    }

    function threadMatchesFilter(thread, filter) {
      if (filter === 'attention') return Boolean(thread.needsAttention || thread.status === 'attention');
      if (filter === 'running') {
        return Boolean(thread.running || thread.status === 'live' || thread.status === 'running' || thread.hasSwarm);
      }
      return true;
    }

    function formatDiffCount(val, prefix) {
      const n = Math.max(0, Number(val) || 0);
      if (prefix === '-' && n > 0 && n < 10) return `-0${n}`;
      return `${prefix}${n}`;
    }

    function actionLabel(action) {
      switch (action) {
        case 'approve':
          return 'Approve';
        case 'diff':
          return 'Diff';
        case 'reply':
          return 'Reply';
        case 'open':
          return 'Open';
        case 'dismiss':
          return 'Dismiss';
        default:
          return action ? action.charAt(0).toUpperCase() + action.slice(1) : 'Open';
      }
    }

    function renderAttentionCard(item) {
      const kind = String(item.kind || 'question').toLowerCase();
      const safeKind = ['approval', 'question', 'error', 'quota', 'stuck', 'done'].includes(kind) ? kind : 'question';
      const actions = Array.isArray(item.actions) && item.actions.length
        ? item.actions
        : safeKind === 'approval'
          ? ['approve', 'diff']
          : ['reply', 'open'];
      const isStacked = actions.includes('approve');

      const buttonsHtml = actions
        .map((act, idx) => {
          const strong = idx === 0 && act === 'approve' ? ' is-strong' : '';
          return `<button type="button" class="mc-btn-subtle${strong}" data-attention-action="${esc(act)}" data-attention-id="${esc(item.id)}" data-thread-id="${esc(item.threadId)}">${esc(actionLabel(act))}</button>`;
        })
        .join('');

      return `
        <article class="mc-attention-card kind-${esc(safeKind)}" data-thread-id="${esc(item.threadId)}">
          <div class="mc-attention-main" data-select-thread="${esc(item.threadId)}" style="cursor:pointer;">
            <div class="mc-attention-meta">
              <span class="mc-attention-badge">${esc(item.badgeLabel || actionLabel(safeKind))}</span>
              <span class="mc-attention-project">${esc(item.projectName || '')}</span>
            </div>
            <div class="mc-attention-title" role="button" tabindex="0" data-select-thread="${esc(item.threadId)}">${esc(item.threadTitle || 'Untitled thread')}</div>
            <div class="mc-attention-summary">${esc(item.summary || '')}</div>
          </div>
          <div class="mc-attention-actions${isStacked ? '' : ' is-bottom-row'}">
            ${buttonsHtml}
          </div>
        </article>
      `;
    }

    function renderProjectCard(project, threads, selectedThreadId, showInlineLauncher) {
      const isActiveProject = threads.some((t) => t.id === selectedThreadId);
      const diff = project.diff || {};
      const added = Number(diff.added) || 0;
      const removed = Number(diff.removed) || 0;
      const hasDiff = added > 0 || removed > 0;
      const diffHtml = hasDiff
        ? `<span class="mc-diff-mini"><span class="mc-diff-add">${esc(formatDiffCount(added, '+'))}</span><span class="mc-diff-del">${esc(formatDiffCount(removed, '-'))}</span></span>`
        : '';

      const badge = project.badge || { label: 'Idle', tone: 'idle' };
      const badgeTone = safeTone(badge.tone, 'idle');
      const showBadgeDot = badgeTone === 'green';

      const threadsHtml = threads
        .map((t) => {
          const selected = t.id === selectedThreadId ? ' selected' : '';
          const subTone = safeTone(t.subtitleTone, 'muted');
          const rightTone = safeTone(t.rightTone, 'muted');
          const dotTone = safeTone(t.dotTone, 'gray');
          return `
            <button type="button" class="mc-thread-row${selected}" data-select-thread="${esc(t.id)}">
              ${dotHtml(dotTone)}
              <div class="mc-thread-main">
                <div class="mc-thread-title">${esc(t.title || 'Untitled thread')}</div>
                <div class="mc-thread-sub tone-${subTone}">${esc(t.subtitle || '')}</div>
              </div>
              <div class="mc-thread-right tone-${rightTone}">${esc(t.rightLabel || '')}</div>
            </button>
          `;
        })
        .join('');

      const launcherHtml = showInlineLauncher
        ? `<button type="button" class="mc-inline-launch" data-new-thread-project="${esc(project.id)}">
             <span>+ Start a new thread in ${esc(project.name)}…</span>
           </button>`
        : '';

      const footText = project.footerText || (Array.isArray(project.footerParts) ? project.footerParts.join(' · ') : '');

      return `
        <section class="mc-project-card${isActiveProject ? ' is-active' : ''}" data-project-id="${esc(project.id)}">
          <header class="mc-project-head">
            <div class="mc-project-ident">
              <span class="mc-project-folder">${icon('folder')}</span>
              <span class="mc-project-name" title="${esc(project.path || project.name)}">${esc(project.name)}</span>
            </div>
            ${project.branch ? `
              <span class="mc-branch-pill" title="Git branch">
                ${icon('branch')}
                <span>${esc(project.branch)}</span>
                ${diffHtml}
              </span>
            ` : ''}
            <span class="mc-head-spacer"></span>
            <span class="mc-status-badge tone-${badgeTone}">
              ${showBadgeDot ? dotHtml('green') : ''}
              <span>${esc(badge.label || 'Idle')}</span>
            </span>
            <button type="button" class="mc-icon-btn" data-new-thread-project="${esc(project.id)}" title="New thread in ${esc(project.name)}" aria-label="New thread in ${esc(project.name)}">
              ${icon('plus')}
            </button>
          </header>

          <div class="mc-project-body">
            ${threadsHtml || '<div class="mc-thread-sub" style="padding:6px 8px;">No matching threads.</div>'}
            ${launcherHtml}
          </div>

          <footer class="mc-project-foot">${esc(footText || 'Clean tree · 0 running')}</footer>
        </section>
      `;
    }
    function renderOverview(snap, state) {
      const projects = Array.isArray(snap?.projects) ? snap.projects : [];
      const attention = Array.isArray(snap?.needsAttention) ? snap.needsAttention : [];
      const q = String(state.search || '').trim().toLowerCase();
      const filter = state.filter || 'all';

      if (snap?.mode === 'live' && projects.length === 0) {
        const explicitNoDemo = new URLSearchParams(location.search).get('demo') === '0';
        return `
          <div class="mc-empty">
            <h2 class="mc-empty-title">No active Antigravity projects detected</h2>
            <p class="mc-empty-sub">
              Mission Control scans your Antigravity projects, transcripts, Git worktrees, Swarms, and cron schedules.
              Start a conversation or preview the full multi-project workspace in Demo mode.
            </p>
            <div class="mc-empty-actions">
              ${explicitNoDemo ? '' : '<button type="button" class="mc-btn-primary" data-action="load-demo">Load Creative Demo</button>'}
              <button type="button" class="mc-btn-subtle" data-action="new-thread">+ New Thread</button>
            </div>
          </div>
        `;
      }

      const visibleAttention = filter === 'running'
        ? []
        : attention.filter((item) => matchesQuery(q, item.projectName, item.threadTitle, item.summary, item.badgeLabel));

      const projectCards = [];
      for (const project of projects) {
        const projectMatches = matchesQuery(q, project.name, project.branch, project.footerText);
        const allThreads = Array.isArray(project.threads) ? project.threads : [];
        const matchingThreads = allThreads.filter((t) => {
          if (!threadMatchesFilter(t, filter)) return false;
          if (!q || projectMatches) return true;
          return matchesQuery(q, t.title, t.subtitle, t.status);
        });

        if ((q || filter !== 'all') && matchingThreads.length === 0 && !projectMatches) {
          continue;
        }
        if (filter !== 'all' && matchingThreads.length === 0) {
          continue;
        }

        const showLauncher = filter === 'all' && !q && allThreads.length <= 1;
        projectCards.push(renderProjectCard(project, matchingThreads, state.selectedThreadId, showLauncher));
      }

      const attentionSection = visibleAttention.length > 0
        ? `
          <section class="mc-section" aria-label="Needs Attention">
            <h2 class="mc-section-title">Needs Attention</h2>
            <div class="mc-attention-grid">
              ${visibleAttention.map(renderAttentionCard).join('')}
            </div>
          </section>
        `
        : '';

      const projectsSection = `
        <section class="mc-section" aria-label="Projects Grid">
          <h2 class="mc-section-title">Projects Grid</h2>
          ${projectCards.length > 0
            ? `<div class="mc-projects-grid">${projectCards.join('')}</div>`
            : `<div class="mc-empty">
                 <p class="mc-empty-title">No matching projects or threads</p>
                 <p class="mc-empty-sub">Clear your search query or switch filters to see all workspaces.</p>
                 <button type="button" class="mc-btn-subtle" data-action="clear-filters">Reset Filters</button>
               </div>`
          }
        </section>
      `;

      return `${attentionSection}${projectsSection}`;
    }

    return { renderOverview: renderOverview };
  })();
  // --- views/board.js ---
  __MC["views/board.js"] = (() => {
    const { dotHtml, esc, safeTone } = __MC["components/icons.js"];
    const COLUMNS = [
      { key: 'attention', label: 'Needs Attention', tone: 'amber' },
      { key: 'running', label: 'Running', tone: 'green' },
      { key: 'scheduled', label: 'Scheduled', tone: 'blue' },
      { key: 'done', label: 'Done & Idle', tone: 'gray' },
    ];

    function inferColumn(thread) {
      if (thread.column && COLUMNS.some((c) => c.key === thread.column)) return thread.column;
      if (thread.needsAttention || thread.status === 'attention' || thread.status === 'error') return 'attention';
      if (thread.running || thread.status === 'live' || thread.status === 'running') return 'running';
      if (thread.isCron || thread.status === 'cron') return 'scheduled';
      return 'done';
    }

    function matchesFilter(thread, project, filter, q) {
      if (filter === 'attention' && !thread.needsAttention && thread.status !== 'attention') return false;
      if (filter === 'running' && !thread.running && thread.status !== 'live' && thread.status !== 'running' && !thread.hasSwarm) {
        return false;
      }
      if (!q) return true;
      const fields = [project.name, project.branch, thread.title, thread.subtitle, thread.status];
      return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
    }
    function renderBoard(snap, state) {
      const projects = Array.isArray(snap?.projects) ? snap.projects : [];
      const attentionByThread = new Map();
      for (const item of snap?.needsAttention || []) {
        attentionByThread.set(item.threadId, item);
      }

      const q = String(state.search || '').trim().toLowerCase();
      const filter = state.filter || 'all';

      const buckets = new Map(COLUMNS.map((c) => [c.key, []]));
      for (const project of projects) {
        for (const thread of project.threads || []) {
          if (!matchesFilter(thread, project, filter, q)) continue;
          const col = inferColumn(thread);
          buckets.get(col).push({ project, thread, attention: attentionByThread.get(thread.id) });
        }
      }

      const colsHtml = COLUMNS.map((col) => {
        const entries = buckets.get(col.key) || [];
        const cardsHtml = entries.length
          ? entries
              .map(({ project, thread, attention }) => {
                const selected = thread.id === state.selectedThreadId ? ' selected' : '';
                const dotTone = safeTone(thread.dotTone, col.tone);
                const subTone = safeTone(thread.subtitleTone, 'muted');
                const rightTone = safeTone(thread.rightTone, 'muted');
                return `
                  <div class="mc-board-card${selected}" role="button" tabindex="0" data-select-thread="${esc(thread.id)}">
                    <div class="mc-board-card-top">
                      <span>${esc(project.name)}${project.branch ? ` · ${esc(project.branch)}` : ''}</span>
                      <span class="mc-thread-right tone-${rightTone}">${esc(thread.rightLabel || '')}</span>
                    </div>
                    <div style="display:flex;align-items:flex-start;gap:7px;">
                      ${dotHtml(dotTone)}
                      <div class="mc-thread-main">
                        <div class="mc-thread-title" style="white-space:normal;">${esc(thread.title || 'Untitled thread')}</div>
                        <div class="mc-thread-sub tone-${subTone}">${esc(thread.subtitle || '')}</div>
                      </div>
                    </div>
                    ${attention?.kind === 'approval' ? `
                      <div style="display:flex;gap:6px;margin-top:4px;justify-content:flex-end;">
                        <button type="button" class="mc-btn-subtle is-strong" data-attention-action="approve" data-attention-id="${esc(attention.id)}" data-thread-id="${esc(thread.id)}">Approve</button>
                        <button type="button" class="mc-btn-subtle" data-attention-action="diff" data-attention-id="${esc(attention.id)}" data-thread-id="${esc(thread.id)}">Diff</button>
                      </div>
                    ` : ''}
                  </div>
                `;
              })
              .join('')
          : '<div class="mc-thread-sub" style="padding:10px 4px;text-align:center;">No threads</div>';

        return `
          <section class="mc-board-col" aria-label="${esc(col.label)}">
            <header class="mc-board-col-head">
              <div class="mc-board-col-title">
                ${dotHtml(col.tone)}
                <span>${esc(col.label)}</span>
              </div>
              <span class="mc-tab-badge">${entries.length}</span>
            </header>
            ${cardsHtml}
          </section>
        `;
      }).join('');

      return `<div class="mc-board-grid">${colsHtml}</div>`;
    }

    return { renderBoard: renderBoard };
  })();
  // --- views/timeline.js ---
  __MC["views/timeline.js"] = (() => {
    const { esc, formatShortTime, safeTone } = __MC["components/icons.js"];
    const BUCKETS = [
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'today', label: 'Today' },
      { key: 'earlier', label: 'Earlier' },
    ];

    function normalizeBucket(raw) {
      const b = String(raw || '').toLowerCase();
      if (b.includes('upcom') || b.includes('sched') || b.includes('next')) return 'upcoming';
      if (b.includes('earl') || b.includes('past') || b.includes('older')) return 'earlier';
      return 'today';
    }

    function deriveFallbackTimeline(snap) {
      const items = [];
      for (const att of snap?.needsAttention || []) {
        items.push({
          id: `tl-${att.id}`,
          bucket: 'today',
          timeLabel: att.ageLabel || 'now',
          kind: att.badgeLabel || att.kind || 'Attention',
          tone: 'amber',
          projectName: att.projectName,
          threadId: att.threadId,
          title: att.threadTitle,
          summary: att.summary,
          needsAttention: true,
        });
      }
      for (const project of snap?.projects || []) {
        for (const thread of project.threads || []) {
          const isCron = Boolean(thread.isCron || thread.status === 'cron');
          const isRunning = Boolean(thread.running || thread.status === 'live' || thread.status === 'running');
          items.push({
            id: `tl-${thread.id}`,
            bucket: isCron ? 'upcoming' : isRunning || thread.needsAttention ? 'today' : 'earlier',
            timeLabel: thread.rightLabel || formatShortTime(thread.updatedAt),
            kind: isCron ? 'Cron' : thread.hasSwarm ? 'Swarm' : isRunning ? 'Running' : 'Thread',
            tone: isCron ? 'blue' : thread.hasSwarm || thread.needsAttention ? 'amber' : isRunning ? 'green' : 'muted',
            projectName: project.name,
            threadId: thread.id,
            title: thread.title,
            summary: thread.subtitle,
            needsAttention: thread.needsAttention,
            running: isRunning,
          });
        }
      }
      return items;
    }

    function kindTone(item) {
      if (item.tone) return safeTone(item.tone);
      const k = String(item.kind || '').toLowerCase();
      if (k.includes('cron') || k.includes('sched')) return 'blue';
      if (k.includes('approv') || k.includes('quest') || k.includes('swarm') || k.includes('wait')) return 'amber';
      if (k.includes('run') || k.includes('live') || k.includes('pass')) return 'green';
      return 'muted';
    }
    function renderTimeline(snap, state) {
      const rawEvents = Array.isArray(snap?.timeline) && snap.timeline.length > 0
        ? snap.timeline
        : deriveFallbackTimeline(snap);

      const q = String(state.search || '').trim().toLowerCase();
      const filter = state.filter || 'all';

      const grouped = new Map(BUCKETS.map((b) => [b.key, []]));

      for (const ev of rawEvents) {
        const kLower = String(ev.kind || '').toLowerCase();
        const isAtt = Boolean(ev.needsAttention || kLower.includes('approv') || kLower.includes('quest') || kLower.includes('error'));
        const isRun = Boolean(ev.running || kLower.includes('run') || kLower.includes('live') || kLower.includes('swarm'));

        if (filter === 'attention' && !isAtt) continue;
        if (filter === 'running' && !isRun) continue;
        if (q) {
          const hay = [ev.projectName, ev.title, ev.subtitle, ev.summary, ev.kind, ev.timeLabel, ev.statusLabel];
          if (!hay.some((v) => String(v ?? '').toLowerCase().includes(q))) continue;
        }

        const bucket = normalizeBucket(ev.bucket || ev.group);
        grouped.get(bucket).push(ev);
      }

      const sections = BUCKETS.map((bucket) => {
        const list = grouped.get(bucket.key) || [];
        if (list.length === 0) return '';

        const rowsHtml = list
          .map((ev) => {
            const selected = ev.threadId && ev.threadId === state.selectedThreadId ? ' selected' : '';
            const tone = kindTone(ev);
            const timeStr = ev.timeLabel || formatShortTime(ev.timestamp || ev.updatedAt);
            const subText = ev.subtitle || ev.summary || '';
            const attr = ev.threadId ? `data-select-thread="${esc(ev.threadId)}"` : '';
            return `
              <button type="button" class="mc-tl-row${selected}" ${attr}>
                <span class="mc-tl-time">${esc(timeStr || '—')}</span>
                <span class="mc-tl-kind tone-${tone}">${esc(ev.kind || 'Event')}</span>
                <span class="mc-tl-main">
                  <div class="mc-tl-title">${esc(ev.title || subText || 'Workspace event')}</div>
                  ${subText && subText !== ev.title ? `<div class="mc-tl-sub">${esc(subText)}</div>` : ''}
                </span>
                <span class="mc-tl-proj">${esc(ev.projectName || '')}${ev.statusLabel ? ` · ${esc(ev.statusLabel)}` : ''}</span>
              </button>
            `;
          })
          .join('');

        return `
          <section class="mc-tl-bucket" aria-label="${esc(bucket.label)}">
            <h3 class="mc-tl-bucket-title">${esc(bucket.label)}</h3>
            <div class="mc-tl-list">${rowsHtml}</div>
          </section>
        `;
      }).filter(Boolean);

      if (sections.length === 0) {
        return `
          <div class="mc-empty">
            <p class="mc-empty-title">No timeline events match</p>
            <p class="mc-empty-sub">Adjust your filter or search query to inspect scheduled jobs, swarm handoffs, and thread activity.</p>
          </div>
        `;
      }

      return `<div class="mc-timeline">${sections.join('')}</div>`;
    }

    return { renderTimeline: renderTimeline };
  })();
  // --- views/graph.js ---
  __MC["views/graph.js"] = (() => {
    const { esc, safeTone } = __MC["components/icons.js"];
    const LANES = [
      { key: 'project', label: 'Projects' },
      { key: 'infra', label: 'Worktrees & Crons' },
      { key: 'thread', label: 'Threads' },
      { key: 'agent', label: 'Swarm Agents' },
    ];

    const TONE_COLOR = {
      green: '#34d399',
      success: '#34d399',
      amber: '#e5a93c',
      warning: '#e5a93c',
      blue: '#38bdf8',
      info: '#38bdf8',
      red: '#ef4444',
      error: '#ef4444',
      gray: '#6b7280',
      idle: '#6b7280',
      muted: '#6b7280',
    };

    function laneForNode(node) {
      const k = String(node.kind || node.type || '').toLowerCase();
      if (k.includes('proj')) return 'project';
      if (k.includes('worktree') || k.includes('cron') || k.includes('sched') || k.includes('branch')) return 'infra';
      if (k.includes('agent') || k.includes('member') || k.includes('swarm')) return 'agent';
      return 'thread';
    }

    function deriveFallbackGraph(snap) {
      const nodes = [];
      const edges = [];
      for (const p of snap?.projects || []) {
        const pid = `proj:${p.id}`;
        nodes.push({
          id: pid,
          kind: 'project',
          label: p.name,
          sublabel: p.branch || '',
          tone: p.badge?.tone || 'idle',
          threadId: p.threads?.[0]?.id || '',
        });

        let parentForThreads = pid;
        if ((p.worktreeCount || 0) > 0 || (p.automationCount || 0) > 0) {
          const wid = `infra:${p.id}`;
          nodes.push({
            id: wid,
            kind: 'worktree',
            label: p.worktreeCount ? `${p.worktreeCount} Worktrees` : `${p.automationCount} Automation`,
            sublabel: p.branch || 'main',
            tone: p.automationCount ? 'blue' : 'green',
            threadId: p.threads?.[0]?.id || '',
          });
          edges.push({ from: pid, to: wid });
          parentForThreads = wid;
        }

        for (const t of p.threads || []) {
          const tid = `thread:${t.id}`;
          nodes.push({
            id: tid,
            kind: 'thread',
            label: t.title,
            sublabel: t.subtitle || t.status,
            tone: t.dotTone || 'gray',
            threadId: t.id,
          });
          edges.push({ from: t.isCron ? parentForThreads : pid, to: tid });

          if (t.hasSwarm && (t.swarmCount || 0) > 0) {
            const aid = `agent:${t.id}`;
            nodes.push({
              id: aid,
              kind: 'agent',
              label: `@coordinator +${Math.max(0, (t.swarmCount || 1) - 1)}`,
              sublabel: 'Swarm roster',
              tone: 'amber',
              threadId: t.id,
            });
            edges.push({ from: tid, to: aid });
          }
        }
      }
      return { nodes, edges };
    }

    function clip(text, max = 22) {
      const s = String(text ?? '');
      return s.length > max ? `${s.slice(0, max - 1)}…` : s;
    }
    function renderGraph(snap, state) {
      const rawGraph = snap?.graph && Array.isArray(snap.graph.nodes) && snap.graph.nodes.length > 0
        ? snap.graph
        : deriveFallbackGraph(snap);

      const q = String(state.search || '').trim().toLowerCase();
      const rawNodes = rawGraph.nodes || [];
      const rawEdges = rawGraph.edges || [];

      const visibleIds = new Set();
      const filteredNodes = rawNodes.filter((n) => {
        const match = !q || [n.label, n.sublabel, n.kind, n.type].some((v) => String(v ?? '').toLowerCase().includes(q));
        if (match) visibleIds.add(n.id);
        return match;
      });

      if (filteredNodes.length === 0) {
        return `
          <div class="mc-empty">
            <p class="mc-empty-title">No topology nodes match</p>
            <p class="mc-empty-sub">Clear your search query to visualize projects, worktrees, cron jobs, threads, and swarm agents.</p>
          </div>
        `;
      }

      const laneBuckets = new Map(LANES.map((l) => [l.key, []]));
      for (const n of filteredNodes) {
        laneBuckets.get(laneForNode(n)).push(n);
      }

      const activeLanes = LANES.filter((l) => laneBuckets.get(l.key).length > 0);
      const colW = 215;
      const nodeW = 166;
      const nodeH = 48;
      const rowGap = 14;
      const padX = 24;
      const topY = 44;

      const maxRows = Math.max(1, ...activeLanes.map((l) => laneBuckets.get(l.key).length));
      const width = Math.max(700, padX * 2 + activeLanes.length * colW - (colW - nodeW));
      const height = Math.max(300, topY + maxRows * (nodeH + rowGap) + 22);

      const posById = new Map();
      const headersSvg = [];
      const nodesSvg = [];

      const projectFirstThread = new Map();
      for (const p of snap?.projects || []) {
        if (p.threads?.[0]?.id) projectFirstThread.set(p.id, p.threads[0].id);
      }

      activeLanes.forEach((lane, colIdx) => {
        const x = padX + colIdx * colW;
        headersSvg.push(`<text class="mc-graph-col-label" x="${x + 4}" y="24">${esc(lane.label)}</text>`);
        const list = laneBuckets.get(lane.key);
        const totalH = list.length * nodeH + Math.max(0, list.length - 1) * rowGap;
        const availH = height - topY - 22;
        const startY = topY + Math.max(0, (availH - totalH) / 2);

        list.forEach((node, rowIdx) => {
          const y = startY + rowIdx * (nodeH + rowGap);
          posById.set(node.id, { x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 });

          const tone = safeTone(node.tone, 'gray');
          const dotColor = TONE_COLOR[tone] || TONE_COLOR.gray;
          const threadId =
            node.threadId ||
            (lane.key === 'thread' ? String(node.id).replace(/^thread:/, '') : '') ||
            (node.projectId ? projectFirstThread.get(node.projectId) || '' : '');
          const selected = threadId && threadId === state.selectedThreadId ? ' selected' : '';
          const threadAttr = threadId ? ` data-select-thread="${esc(threadId)}"` : '';

          nodesSvg.push(`
            <g class="mc-graph-node${selected}" data-graph-node="${esc(node.id)}"${threadAttr}>
              <rect class="mc-graph-node-rect" x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="8"></rect>
              <circle cx="${x + 14}" cy="${y + 18}" r="4" fill="${dotColor}"></circle>
              <text class="mc-graph-node-label" x="${x + 25}" y="${y + 21}">${esc(clip(node.label, 18))}</text>
              <text class="mc-graph-node-sub" x="${x + 12}" y="${y + 37}">${esc(clip(node.sublabel || '', 23))}</text>
            </g>
          `);
        });
      });

      const edgesSvg = [];
      for (const edge of rawEdges) {
        const fromId = edge.from ?? edge.source;
        const toId = edge.to ?? edge.target;
        if (!visibleIds.has(fromId) || !visibleIds.has(toId)) continue;
        const a = posById.get(fromId);
        const b = posById.get(toId);
        if (!a || !b) continue;
        const x1 = a.x + nodeW;
        const y1 = a.cy;
        const x2 = b.x;
        const y2 = b.cy;
        const dx = Math.max(28, Math.abs(x2 - x1) * 0.45);
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        edgesSvg.push(`<path class="mc-graph-edge" data-edge-from="${esc(fromId)}" data-edge-to="${esc(toId)}" d="${d}"></path>`);
      }

      return `
        <div class="mc-graph-wrap">
          <div class="mc-graph-legend">
            <span>Workspace Topology · Click any thread or agent node to inspect</span>
            <div class="mc-graph-legend-items">
              <span class="mc-graph-legend-item"><span class="mc-dot tone-green"></span>Live / Active</span>
              <span class="mc-graph-legend-item"><span class="mc-dot tone-amber"></span>Attention / Swarm</span>
              <span class="mc-graph-legend-item"><span class="mc-dot tone-blue"></span>Cron / Scheduled</span>
              <span class="mc-graph-legend-item"><span class="mc-dot tone-gray"></span>Done / Idle</span>
            </div>
          </div>
          <div class="mc-graph-scroll">
            <svg class="mc-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mission Control topology graph">
              <g class="mc-graph-headers">${headersSvg.join('')}</g>
              <g class="mc-graph-edges">${edgesSvg.join('')}</g>
              <g class="mc-graph-nodes">${nodesSvg.join('')}</g>
            </svg>
          </div>
        </div>
      `;
    }

    return { renderGraph: renderGraph };
  })();
  // --- views/inspector.js ---
  __MC["views/inspector.js"] = (() => {
    const { dotHtml, esc, highlightMentions, icon, safeTone } = __MC["components/icons.js"];
    function handleOf(name, handle) {
      if (handle) return handle.startsWith('@') ? handle : `@${handle}`;
      const raw = String(name || '').trim();
      if (!raw) return '';
      return raw.startsWith('@') ? raw : `@${raw}`;
    }

    function renderActivityTab(detail) {
      const roster = detail.swarm?.exists && Array.isArray(detail.swarm.roster) ? detail.swarm.roster : [];
      const rosterHtml = roster.length > 0
        ? `
          <div class="mc-roster-strip" role="list" aria-label="Swarm roster">
            ${roster.slice(0, 3).map((m) => `
              <div class="mc-roster-chip" role="listitem">
                <div class="mc-roster-name">
                  ${dotHtml(m.tone || 'gray')}
                  <span>${esc(handleOf(m.name, m.handle))}</span>
                </div>
                <div class="mc-roster-state">${esc(m.stateLabel || m.status || 'Active')}</div>
              </div>
            `).join('')}
          </div>
        `
        : '';

      const activities = Array.isArray(detail.activity) ? detail.activity : [];
      const cardsHtml = activities.length > 0
        ? activities.map((act) => {
            const fromStr = act.from ? handleOf(act.from) : '@agent';
            const toStr = act.to ? handleOf(act.to) : '';
            const badgeTone = safeTone(act.badge?.tone, 'green');
            const hasFoot = Boolean(act.badge || act.filePill || act.stateText);

            return `
              <article class="mc-activity-card">
                <div class="mc-activity-head">
                  <div class="mc-activity-actors">
                    <span class="mc-agent-avatar">${icon('swarm')}</span>
                    <span>${esc(fromStr)}</span>
                    ${toStr ? `<span class="mc-activity-arrow" aria-hidden="true">→</span><span>${esc(toStr)}</span>` : ''}
                  </div>
                  <span class="mc-activity-time">${esc(act.time || '')}</span>
                </div>
                <div class="mc-activity-text">${highlightMentions(act.body || '')}</div>
                ${hasFoot ? `
                  <div class="mc-activity-foot">
                    ${act.badge ? `
                      <span class="mc-check-pill tone-${badgeTone}">
                        ${icon(act.badge.icon === 'alert' ? 'alert' : 'checkCircle')}
                        <span>${esc(act.badge.text || '')}</span>
                      </span>
                    ` : ''}
                    ${act.filePill ? `<span class="mc-code-pill">${esc(act.filePill)}</span>` : ''}
                    ${act.stateText ? `<span class="mc-state-text">${esc(act.stateText)}</span>` : ''}
                  </div>
                ` : ''}
              </article>
            `;
          }).join('')
        : '<div class="mc-empty" style="padding:20px 14px;"><p class="mc-empty-sub">No activity entries recorded for this thread yet.</p></div>';

      return `${rosterHtml}${cardsHtml}`;
    }

    function renderSwarmTab(detail) {
      const swarm = detail.swarm || {};
      const roster = Array.isArray(swarm.roster) ? swarm.roster : [];
      const messages = Array.isArray(swarm.messages) ? swarm.messages : [];

      if (!swarm.exists && roster.length === 0 && messages.length === 0) {
        return `
          <div class="mc-empty" style="padding:22px 14px;">
            <p class="mc-empty-title">Single-agent thread</p>
            <p class="mc-empty-sub">This thread has not spawned a Swarm team. Use the composer below to steer or start a Swarm.</p>
          </div>
        `;
      }

      const canOpenConv = Boolean(window.sidecar?.ui?.toggleConversation) && !String(detail.id || '').startsWith('demo-');

      const rosterHtml = roster.length > 0
        ? `
          <div class="mc-swarm-list">
            ${roster.map((m) => `
              <div class="mc-swarm-member-row">
                <div class="mc-swarm-member-info">
                  ${dotHtml(m.tone || 'gray')}
                  <div>
                    <div style="font-size:12px;font-weight:500;">${esc(handleOf(m.name, m.handle))}</div>
                    ${m.role ? `<div class="mc-swarm-member-role">${esc(m.role)}</div>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span class="mc-status-badge tone-${safeTone(m.tone, 'muted')}">${esc(m.stateLabel || m.status || 'Waiting')}</span>
                  ${canOpenConv && m.conversationId ? `<button type="button" class="mc-btn-subtle" data-open-conv="${esc(m.conversationId)}" style="padding:2px 7px;font-size:11px;">Chat</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `
        : '';

      const messagesHtml = messages.length > 0
        ? messages.map((msg) => `
            <article class="mc-activity-card">
              <div class="mc-activity-head">
                <div class="mc-activity-actors">
                  <span class="mc-code-pill" style="padding:1px 5px;font-size:10px;">#${esc(msg.seq ?? '')}</span>
                  <span>${esc(handleOf(msg.agent))}</span>
                  ${msg.to ? `<span class="mc-activity-arrow">→</span><span>${esc(handleOf(msg.to))}</span>` : ''}
                </div>
                <span class="mc-activity-time">${esc(msg.time || '')}</span>
              </div>
              <div class="mc-activity-text">${highlightMentions(msg.text || '')}</div>
              ${msg.statusPill ? `
                <div class="mc-activity-foot">
                  <span class="mc-check-pill tone-green">${icon('checkCircle')}<span>${esc(msg.statusPill)}</span></span>
                </div>
              ` : ''}
            </article>
          `).join('')
        : '';

      return `${rosterHtml}${messagesHtml}`;
    }

    function renderFilesTab(detail, projectPath) {
      const files = Array.isArray(detail.files) ? detail.files : [];
      if (files.length === 0) {
        return `
          <div class="mc-empty" style="padding:22px 14px;">
            <p class="mc-empty-sub">No modified files detected for this thread.</p>
          </div>
        `;
      }

      const canOpenFile = Boolean(window.sidecar?.ui?.toggleAuxPane) && Boolean(projectPath) && !String(detail.id || '').startsWith('demo-');

      return `
        <div class="mc-files-list">
          ${files.map((f) => {
            const st = String(f.status || 'M').toUpperCase().slice(0, 1);
            const safeSt = ['A', 'D', 'M', 'R'].includes(st) ? st : 'M';
            return `
              <div class="mc-file-row" role="button" tabindex="0" data-jump-diff="${esc(f.path)}">
                <span class="mc-file-status status-${safeSt}">${esc(safeSt)}</span>
                <span class="mc-file-path" title="${esc(f.path)}">${esc(f.path)}</span>
                <span class="mc-file-stats">
                  <span class="mc-diff-add">+${Number(f.added) || 0}</span>
                  <span class="mc-diff-del">-${Number(f.removed) || 0}</span>
                </span>
                ${canOpenFile ? `
                  <button type="button" class="mc-icon-btn" data-open-file="${esc(f.path)}" title="Open in editor" aria-label="Open ${esc(f.path)} in editor">
                    ${icon('arrowUpRight')}
                  </button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function renderDiffTab(detail, state) {
      const diffs = Array.isArray(detail.diff) ? detail.diff : [];
      if (diffs.length === 0) {
        return `
          <div class="mc-empty" style="padding:22px 14px;">
            <p class="mc-empty-sub">No unified diff available for this thread.</p>
          </div>
        `;
      }

      const selectedFile = state.inspectorDiffFile || 'all';
      const chipsHtml = `
        <div class="mc-diff-chips">
          <button type="button" class="mc-diff-chip${selectedFile === 'all' ? ' active' : ''}" data-diff-file="all">All (${diffs.length})</button>
          ${diffs.map((d) => {
            const name = String(d.path || '').split('/').pop() || d.path;
            return `<button type="button" class="mc-diff-chip${selectedFile === d.path ? ' active' : ''}" data-diff-file="${esc(d.path)}" title="${esc(d.path)}">${esc(name)}</button>`;
          }).join('')}
        </div>
      `;

      const visibleDiffs = selectedFile === 'all' ? diffs : diffs.filter((d) => d.path === selectedFile);

      const blocksHtml = visibleDiffs.map((d) => {
        const lines = String(d.patch || '').split('\n');
        const linesHtml = lines.map((line) => {
          let cls = 'is-ctx';
          if (line.startsWith('@@')) cls = 'is-hunk';
          else if (line.startsWith('+') && !line.startsWith('+++')) cls = 'is-add';
          else if (line.startsWith('-') && !line.startsWith('---')) cls = 'is-del';
          return `<span class="mc-diff-line ${cls}">${esc(line || ' ')}</span>`;
        }).join('');

        return `
          <div class="mc-diff-block">
            <div class="mc-diff-file-head">
              <span>${esc(d.path || '')}</span>
              <span class="mc-file-stats">
                <span class="mc-diff-add">+${Number(d.added) || 0}</span>
                <span class="mc-diff-del">-${Number(d.removed) || 0}</span>
              </span>
            </div>
            <pre class="mc-diff-pre"><code>${linesHtml}</code></pre>
          </div>
        `;
      }).join('');

      return `${chipsHtml}${detail.diffTruncated ? '<div class="mc-thread-sub" style="padding:2px 2px 4px;">Diff output capped at 200 KB.</div>' : ''}${blocksHtml}`;
    }
    function renderInspectorContent(detail, state, projectPath) {
      if (!detail) {
        return `
          <div class="mc-empty" style="margin:24px 16px;">
            <p class="mc-empty-title">Select a thread</p>
            <p class="mc-empty-sub">Click any thread card or Needs Attention item to inspect its activity, Swarm roster, changed files, and unified diff.</p>
          </div>
        `;
      }

      const tab = state.inspectorTab || 'activity';
      const swarmCount = Number(detail.swarm?.count ?? detail.swarm?.roster?.length ?? 0) || 0;
      const filesCount = Array.isArray(detail.files) ? detail.files.length : 0;
      const statusTone = safeTone(detail.statusTone, detail.status === 'live' ? 'green' : 'muted');

      let bodyHtml = '';
      if (tab === 'swarm') bodyHtml = renderSwarmTab(detail);
      else if (tab === 'files') bodyHtml = renderFilesTab(detail, projectPath);
      else if (tab === 'diff') bodyHtml = renderDiffTab(detail, state);
      else bodyHtml = renderActivityTab(detail);

      return `
        <header class="mc-insp-head">
          <div class="mc-insp-top">
            <div class="mc-insp-crumb-wrap">
              <button type="button" class="mc-insp-back" data-action="close-inspector" aria-label="Back to overview">
                ${icon('arrowLeft')}
                <span>Back</span>
              </button>
              <span class="mc-insp-crumb">${esc(detail.projectName || 'workspace')} /</span>
            </div>
            <span class="mc-insp-status tone-${statusTone}">
              ${dotHtml(statusTone)}
              <span>${esc(detail.statusLabel || detail.status || 'Idle')}</span>
            </span>
          </div>

          <div class="mc-insp-title-row">
            <h2 class="mc-insp-title">${esc(detail.title || 'Untitled thread')}</h2>
            <button type="button" class="mc-btn-open-full" data-action="open-full" data-thread-id="${esc(detail.id)}">
              <span>Open Full</span>
              ${icon('arrowUpRight')}
            </button>
          </div>
        </header>

        <nav class="mc-insp-tabs" role="tablist" aria-label="Thread inspector sections">
          <button type="button" role="tab" class="mc-insp-tab${tab === 'activity' ? ' active' : ''}" data-insp-tab="activity" aria-selected="${tab === 'activity'}">
            <span>Activity</span>
          </button>
          <button type="button" role="tab" class="mc-insp-tab${tab === 'swarm' ? ' active' : ''}" data-insp-tab="swarm" aria-selected="${tab === 'swarm'}">
            <span>Swarm</span>
            ${swarmCount > 0 ? `<span class="mc-tab-badge">${swarmCount}</span>` : ''}
          </button>
          <button type="button" role="tab" class="mc-insp-tab${tab === 'files' ? ' active' : ''}" data-insp-tab="files" aria-selected="${tab === 'files'}">
            <span>Files</span>
            ${filesCount > 0 ? `<span class="mc-tab-badge">${filesCount}</span>` : ''}
          </button>
          <button type="button" role="tab" class="mc-insp-tab${tab === 'diff' ? ' active' : ''}" data-insp-tab="diff" aria-selected="${tab === 'diff'}">
            <span>Diff</span>
          </button>
        </nav>

        <div class="mc-insp-body" id="mc-insp-scroll">
          ${bodyHtml}
        </div>
      `;
    }

    function normalizeModelOption(m) {
      if (m && typeof m === 'object') {
        const id = String(m.id ?? m.label ?? '');
        const label = String(m.label ?? m.id ?? '');
        return { id, label };
      }
      const s = String(m ?? '');
      return { id: s, label: s };
    }
    function renderInspectorComposer(detail, state) {
      if (!detail) return '';
      const rawModels = Array.isArray(detail.models) && detail.models.length
        ? detail.models
        : [{ id: 'orchestrator-neon', label: 'Orchestrator (Neon)' }];
      const models = rawModels.map(normalizeModelOption);
      const modes = Array.isArray(detail.modes) && detail.modes.length
        ? detail.modes
        : ['Auto', 'Plan', 'Fast'];

      const modelIds = models.map((m) => m.id);
      const selectedModel = state.composerModel && modelIds.includes(state.composerModel)
        ? state.composerModel
        : (detail.defaultModel && modelIds.includes(detail.defaultModel) ? detail.defaultModel : models[0].id);
      const selectedMode = state.composerMode && modes.includes(state.composerMode)
        ? state.composerMode
        : modes[0];
      const placeholder = detail.composerPlaceholder || 'Steer @coordinator or reply to thread...';

      return `
        <div class="mc-composer-wrap">
          <form class="mc-composer" id="mc-composer-form">
            <textarea
              id="mc-composer-input"
              class="mc-composer-input"
              rows="2"
              placeholder="${esc(placeholder)}"
              aria-label="Reply or steer thread"
            >${esc(state.composerDraft || '')}</textarea>
            <div class="mc-composer-bar">
              <div class="mc-composer-left">
                <span style="color:var(--mc-fg-muted);display:inline-flex;">${icon('sliders')}</span>
                <select id="mc-composer-model" class="mc-select-inline" aria-label="Model">
                  ${models.map((m) => `<option value="${esc(m.id)}"${m.id === selectedModel ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}
                </select>
              </div>
              <div class="mc-composer-right">
                <select id="mc-composer-mode" class="mc-select-inline" aria-label="Execution mode">
                  ${modes.map((m) => `<option value="${esc(m)}"${m === selectedMode ? ' selected' : ''}>${esc(m)}</option>`).join('')}
                </select>
                <button type="submit" id="mc-composer-send" class="mc-send-btn" title="Send reply (Enter)" aria-label="Send reply"${state.sendingReply ? ' disabled' : ''}>
                  ${icon('send')}
                </button>
              </div>
            </div>
          </form>
        </div>
      `;
    }

    return { renderInspectorContent: renderInspectorContent, renderInspectorComposer: renderInspectorComposer };
  })();
  // --- app-main.js ---
  __MC["app-main.js"] = (() => {
    const { esc, icon } = __MC["components/icons.js"];
    const { buildPaletteItems, renderCommandPalette, renderNewThreadModal, renderPluginsDrawer, renderSettingsPopover } = __MC["components/modal.js"];
    const { renderBoard } = __MC["views/board.js"];
    const { renderGraph } = __MC["views/graph.js"];
    const { renderInspectorComposer, renderInspectorContent } = __MC["views/inspector.js"];
    const { renderOverview } = __MC["views/overview.js"];
    const { renderTimeline } = __MC["views/timeline.js"];
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

    return {  };
  })();
})();
