import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { getConversationMetadata } from './actions.mjs';
import { discoverCrons } from './cron.mjs';
import {
  discoverConversations,
  discoverPlugins,
  discoverProjects,
  isValidThreadId,
} from './discovery.mjs';
import { getDemoDashboard, getDemoThreadDetail } from './demo.mjs';
import { getGitDiff, getGitStatus } from './git.mjs';
import { getSeenMap, isThreadUnseen, markThreadSeen } from './seen.mjs';
import { readSwarm } from './swarm.mjs';
import { STUCK_MS, oneLine, stepFailure, summarizeTranscript } from './transcript.mjs';

const LIVE_MODELS = [
  { id: 'pro', label: 'Gemini Pro' },
  { id: 'flash', label: 'Gemini Flash' },
  { id: 'flash_lite', label: 'Gemini Flash Lite' },
];

const DEFAULT_MODES = ['Auto', 'Plan', 'Fast'];

const ATTENTION_PRIORITY = {
  approval: 0,
  error: 1,
  quota: 2,
  question: 3,
  stuck: 4,
  done: 5,
};

function formatAgeLabel(ms, now = Date.now()) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diffSec = Math.max(0, Math.floor((now - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function normalizePathSafe(p) {
  if (!p) return '';
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function decodeFileUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return '';
  try {
    return decodeURIComponent(new URL(uri).pathname);
  } catch {
    try {
      return decodeURIComponent(uri.slice(7));
    } catch {
      return '';
    }
  }
}

function isGlobalPluginOrBuiltinPath(rawPath) {
  const s = String(rawPath || '').replace(/\\/g, '/');
  return (
    s.includes('/.gemini/config/plugins/') ||
    s.endsWith('/.gemini/config/plugins') ||
    s.includes('/.gemini/antigravity/builtin/') ||
    s.endsWith('/.gemini/antigravity/builtin')
  );
}

function bestProjectForPath(rawCand, projectEntries) {
  const cand = normalizePathSafe(rawCand);
  if (!cand) return null;
  let best = null;
  for (const proj of projectEntries) {
    for (const projPath of proj.canonicalPaths) {
      if (!projPath) continue;
      const match = cand === projPath || cand.startsWith(projPath.endsWith(sep) ? projPath : projPath + sep);
      if (match && (!best || projPath.length > best.len)) {
        best = { id: proj.id, len: projPath.length };
      }
    }
  }
  return best;
}

function matchConversationToProject(conv, tr, swarm, agentMeta, projectEntries, activeConvId) {
  // Tier 1: Explicit project ID from agentapi or local metadata.
  const explicitProjectId = agentMeta?.projectId || conv.localMeta?.projectId ||
    (conv.id === activeConvId ? process.env.ANTIGRAVITY_PROJECT_ID : '');
  if (explicitProjectId) {
    const byId = projectEntries.find((p) => p.id === explicitProjectId);
    if (byId) return byId.id;
  }

  // Tier 2: Authoritative declared workspace paths.
  const authoritativePaths = [
    ...(conv.localMeta?.workspacePaths || []),
    ...(swarm?.workspaces || []),
  ];
  if (agentMeta?.workspaceUris?.length) {
    for (const u of agentMeta.workspaceUris) {
      const p = decodeFileUri(u);
      if (p) authoritativePaths.push(p);
    }
  }

  let bestAuth = null;
  for (const rawCand of authoritativePaths) {
    const hit = bestProjectForPath(rawCand, projectEntries);
    if (hit && (!bestAuth || hit.len > bestAuth.len)) {
      bestAuth = hit;
    }
  }
  if (bestAuth) return bestAuth.id;

  // Tier 3: Count-weighted fallback over transcript referencedPaths, ignoring symlinked plugin/builtin paths.
  const counts = new Map();
  const maxLenByProj = new Map();
  for (const rawCand of tr?.referencedPaths || []) {
    if (isGlobalPluginOrBuiltinPath(rawCand)) continue;
    const hit = bestProjectForPath(rawCand, projectEntries);
    if (!hit) continue;
    counts.set(hit.id, (counts.get(hit.id) || 0) + 1);
    maxLenByProj.set(hit.id, Math.max(maxLenByProj.get(hit.id) || 0, hit.len));
  }

  let bestId = null;
  let bestCount = 0;
  let bestLen = 0;
  for (const [id, count] of counts.entries()) {
    const len = maxLenByProj.get(id) || 0;
    if (count > bestCount || (count === bestCount && len > bestLen)) {
      bestId = id;
      bestCount = count;
      bestLen = len;
    }
  }
  return bestId;
}

function buildLiveThreadRecord(conv, project, trEntry, swarm, agentMeta, now, seenMap = {}) {
  const tr = trEntry?.summary || null;
  const updatedAtMs = tr?.updatedAtMs || conv.mtime || now;
  const ageLabel = formatAgeLabel(updatedAtMs, now) || 'Idle';
  const title = swarm?.title ||
    agentMeta?.title ||
    conv.localMeta?.title ||
    tr?.firstUserPrompt ||
    `Thread ${conv.id.slice(0, 8)}`;

  const attentionItems = [];
  const failure = stepFailure(tr, now);

  if (swarm) {
    for (const sys of swarm.systemAttention) {
      attentionItems.push({
        id: sys.id,
        kind: sys.kind,
        badgeLabel: sys.kind === 'quota' ? 'Quota' : sys.kind === 'stuck' ? 'Stuck' : 'Error',
        projectId: project.id,
        projectName: project.name,
        threadId: conv.id,
        threadTitle: title,
        summary: sys.summary,
        actions: ['reply', 'open'],
        timestamp: new Date(updatedAtMs).toISOString(),
        ageLabel,
      });
    }

    if (Array.isArray(swarm.viewJson?.attention)) {
      for (const item of swarm.viewJson.attention) {
        if (!item || typeof item !== 'object') continue;
        const kind = item.kind === 'decision' || item.kind === 'review' ? 'approval'
          : (item.kind === 'failure' ? 'error' : (['approval', 'question', 'error', 'quota', 'stuck'].includes(item.kind) ? item.kind : 'question'));
        attentionItems.push({
          id: `view-${conv.id}-${item.id || attentionItems.length}`,
          kind,
          badgeLabel: kind === 'approval' ? 'Approval' : kind.charAt(0).toUpperCase() + kind.slice(1),
          projectId: project.id,
          projectName: project.name,
          threadId: conv.id,
          threadTitle: title,
          summary: oneLine(item.title || item.why || 'Swarm item needs attention', 140),
          actions: kind === 'approval' ? ['approve', 'diff'] : ['reply', 'open'],
          timestamp: new Date(updatedAtMs).toISOString(),
          ageLabel,
        });
      }
    }

    if (swarm.readyWorkers.length > 0 && !attentionItems.some((a) => a.kind === 'approval')) {
      const rw = swarm.readyWorkers[0];
      const fileCount = swarm.editedFiles.length;
      const testLabel = rw.testResults?.latest?.ok ? 'tests passed' : (rw.testResults?.latest?.label || '');
      const parts = [`Swarm ${rw.handle} ready`];
      if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
      if (testLabel) parts.push(testLabel);
      attentionItems.push({
        id: `swarm-ready-${conv.id}-${rw.name}`,
        kind: 'approval',
        badgeLabel: 'Approval',
        projectId: project.id,
        projectName: project.name,
        threadId: conv.id,
        threadTitle: title,
        summary: parts.join(' · '),
        actions: ['approve', 'diff'],
        timestamp: new Date(updatedAtMs).toISOString(),
        ageLabel,
      });
    }
  }

  if (failure && !attentionItems.some((a) => a.kind === failure.kind)) {
    attentionItems.push({
      id: `tr-${conv.id}-${failure.kind}`,
      kind: failure.kind,
      badgeLabel: failure.kind === 'quota' ? 'Quota' : 'Error',
      projectId: project.id,
      projectName: project.name,
      threadId: conv.id,
      threadTitle: title,
      summary: oneLine(failure.text, 140),
      actions: ['reply', 'open'],
      timestamp: new Date(updatedAtMs).toISOString(),
      ageLabel,
    });
  }

  if (tr?.pendingApproval) {
    attentionItems.push({
      id: `tr-approve-${conv.id}`,
      kind: 'approval',
      badgeLabel: 'Approval',
      projectId: project.id,
      projectName: project.name,
      threadId: conv.id,
      threadTitle: title,
      summary: tr.pendingApproval,
      actions: ['approve', 'diff'],
      timestamp: new Date(updatedAtMs).toISOString(),
      ageLabel,
    });
  }

  const questionText = tr?.askQuestion || '';
  if (questionText) {
    attentionItems.push({
      id: `tr-question-${conv.id}`,
      kind: 'question',
      badgeLabel: 'Question',
      projectId: project.id,
      projectName: project.name,
      threadId: conv.id,
      threadTitle: title,
      summary: questionText,
      actions: ['reply', 'open'],
      timestamp: new Date(updatedAtMs).toISOString(),
      ageLabel,
    });
  }

  const hasSwarm = Boolean(swarm);
  const swarmCount = swarm?.count || 0;
  const needsAttention = attentionItems.length > 0;
  const trActive = Boolean(tr && !tr.idle && !failure && !questionText && !tr.pendingApproval);
  const running = Boolean(swarm ? (swarm.workingCount > 0 || trActive) : trActive);

  if (running && !swarm && tr?.mtime && now - tr.mtime > STUCK_MS && !needsAttention) {
    attentionItems.push({
      id: `tr-stuck-${conv.id}`,
      kind: 'stuck',
      badgeLabel: 'Stuck',
      projectId: project.id,
      projectName: project.name,
      threadId: conv.id,
      threadTitle: title,
      summary: `No progress for ${Math.round((now - tr.mtime) / 60000)}m`,
      actions: ['reply', 'open'],
      timestamp: new Date(updatedAtMs).toISOString(),
      ageLabel,
    });
  }

  const finalNeedsAttention = attentionItems.length > 0;
  let status = 'idle';
  let dotTone = 'gray';
  if (failure && !running) {
    status = 'error';
    dotTone = 'red';
  } else if (hasSwarm && (running || swarm.isLive)) {
    status = 'live';
    dotTone = 'green';
  } else if (finalNeedsAttention && !running) {
    status = 'attention';
    dotTone = 'amber';
  } else if (running) {
    status = 'running';
    dotTone = 'green';
  } else if (tr && tr.steps > 0) {
    status = 'done';
    dotTone = 'gray';
  }

  let unseen = false;
  if (status === 'done' && tr?.idle && tr?.steps > 0 && !running && attentionItems.length === 0 && isThreadUnseen(conv.id, updatedAtMs, seenMap)) {
    unseen = true;
    dotTone = 'green';
    const doneSummary = tr.testResults?.latest?.label
      ? tr.testResults.latest.label
      : tr.editedFiles?.length
        ? `${tr.editedFiles.length} file${tr.editedFiles.length === 1 ? '' : 's'} changed`
        : (tr.replyPreview || 'Completed — ready to review');
    attentionItems.push({
      id: `tr-done-${conv.id}`,
      kind: 'done',
      badgeLabel: 'Done',
      projectId: project.id,
      projectName: project.name,
      threadId: conv.id,
      threadTitle: title,
      summary: doneSummary,
      actions: ['open', 'dismiss'],
      timestamp: new Date(updatedAtMs).toISOString(),
      ageLabel,
    });
  }

  const anyNeedsAttention = attentionItems.length > 0;

  let subtitle = 'Idle';
  let subtitleTone = 'muted';
  if (hasSwarm) {
    subtitle = `Swarm · ${swarmCount}`;
    subtitleTone = running || swarm.isLive ? 'amber' : 'muted';
  } else if (failure) {
    subtitle = oneLine(failure.text, 52);
    subtitleTone = 'amber';
  } else if (questionText) {
    subtitle = 'Needs reply';
  } else if (tr?.pendingApproval) {
    subtitle = 'Needs approval';
    subtitleTone = 'amber';
  } else if (running) {
    subtitle = tr?.activity || 'Running';
  } else if (tr?.testResults?.latest) {
    subtitle = `Done · ${tr.testResults.latest.label}`;
  } else if (tr?.editedFiles?.length) {
    subtitle = `Done · ${tr.editedFiles.length} file${tr.editedFiles.length === 1 ? '' : 's'}`;
  } else if (tr?.replied || status === 'done') {
    subtitle = 'Done';
  }

  const rightLabel = (hasSwarm && (running || swarm.isLive)) ? 'Live' : ageLabel;
  const rightTone = (hasSwarm && (running || swarm.isLive)) ? 'amber' : 'muted';
  const column = anyNeedsAttention ? 'attention' : (running ? 'running' : 'done');

  return {
    thread: {
      id: conv.id,
      title,
      status,
      dotTone,
      subtitle,
      subtitleTone,
      rightLabel,
      rightTone,
      needsAttention: anyNeedsAttention,
      unseen,
      running,
      hasSwarm,
      swarmCount,
      isCron: false,
      cronExpr: '',
      updatedAt: new Date(updatedAtMs).toISOString(),
      column,
    },
    attentionItems,
    etagPiece: `${conv.id}:${trEntry?.key || '-'}:${swarm?.etagKey || '-'}:${status}:${anyNeedsAttention}:${unseen}`,
    updatedAtMs,
    conv,
    tr,
    swarm,
    agentMeta,
  };
}

function buildCronThreadRecord(cron) {
  return {
    thread: {
      id: cron.id,
      title: cron.displayName,
      status: 'cron',
      dotTone: 'blue',
      subtitle: `Cron · ${cron.timeHHMM}`,
      subtitleTone: 'muted',
      rightLabel: cron.nextLabel,
      rightTone: 'muted',
      needsAttention: false,
      running: false,
      hasSwarm: false,
      swarmCount: 0,
      isCron: true,
      cronExpr: cron.rawSchedule,
      updatedAt: cron.nextRunAt || new Date().toISOString(),
      column: 'scheduled',
    },
    attentionItems: [],
    etagPiece: `cron:${cron.id}:${cron.rawSchedule}:${cron.enabled}:${cron.timeHHMM}`,
    updatedAtMs: cron.nextRunMs || 0,
    cron,
  };
}

function buildLiveTimeline(threadRecords) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const items = [];
  for (const rec of threadRecords) {
    const th = rec.thread;
    let bucket = 'earlier';
    if (th.isCron) bucket = 'upcoming';
    else if (th.running || th.needsAttention || now - rec.updatedAtMs < dayMs) bucket = 'today';

    items.push({
      id: `tl-${th.id}`,
      bucket,
      kind: th.isCron ? 'cron' : (th.hasSwarm ? 'swarm' : (th.status === 'error' ? 'error' : (th.needsAttention ? 'question' : (th.running ? 'running' : 'activity')))),
      title: th.title,
      subtitle: th.subtitle,
      summary: th.subtitle,
      projectId: rec.projectId,
      projectName: rec.projectName,
      threadId: th.id,
      timeLabel: th.rightLabel,
      timestamp: th.updatedAt,
      tone: th.dotTone,
      statusLabel: th.status,
      needsAttention: Boolean(th.needsAttention),
      running: Boolean(th.running),
    });
  }
  const order = { upcoming: 0, today: 1, earlier: 2 };
  items.sort((a, b) => order[a.bucket] - order[b.bucket] || b.timestamp.localeCompare(a.timestamp));
  return items;
}

function buildLiveGraph(projects, detailsMap) {
  const nodes = [];
  const edges = [];

  for (const proj of projects) {
    nodes.push({
      id: proj.id,
      kind: 'project',
      label: proj.name,
      sublabel: proj.branch ? `${proj.branch}${proj.diff.added || proj.diff.removed ? ` +${proj.diff.added} -${proj.diff.removed}` : ''}` : 'Workspace',
      tone: proj.badge.tone,
      projectId: proj.id,
      threadId: proj.threads[0]?.id || '',
    });

    if (proj.worktreeCount > 0) {
      const wtId = `${proj.id}-worktrees`;
      nodes.push({
        id: wtId,
        kind: 'worktree',
        label: `${proj.worktreeCount} Worktree${proj.worktreeCount === 1 ? '' : 's'}`,
        sublabel: proj.branch || 'linked',
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

      const rec = detailsMap.get(th.id);
      if (rec?.swarm) {
        for (const m of rec.swarm.roster) {
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

async function assembleLiveState(options = {}) {
  const now = Date.now();
  const discoveredProjects = discoverProjects(options);
  const convs = discoverConversations(options);
  const plugins = discoverPlugins(options);

  const projectEntries = discoveredProjects.map((p) => ({
    ...p,
    canonicalPaths: (p.paths?.length ? p.paths : (p.path ? [p.path] : [])).map(normalizePathSafe).filter(Boolean),
    threads: [],
    etagPieces: [],
  }));

  // Read swarms first to identify worker conversations that must not appear as duplicate top-level threads.
  const swarmsByConvId = new Map();
  const workerConvIds = new Set();
  for (const conv of convs) {
    if (!conv.hasSwarm) continue;
    const swarm = readSwarm(conv.appData, conv.id, now);
    if (!swarm) continue;
    swarmsByConvId.set(conv.id, swarm);
    for (const wid of swarm.workerConvIds) workerConvIds.add(wid);
  }

  const topLevelConvs = convs.filter((c) => !workerConvIds.has(c.id));
  const useAgentApi = options.useAgentApi !== false;
  const loadAgentMeta = typeof options.getConversationMetadata === 'function'
    ? options.getConversationMetadata
    : getConversationMetadata;

  const convPrepared = await Promise.all(topLevelConvs.map(async (conv) => {
    const trEntry = conv.hasTranscript ? summarizeTranscript(conv.transcriptPath) : { key: '-', summary: null };
    const swarm = swarmsByConvId.get(conv.id) || null;
    const agentMeta = useAgentApi ? await loadAgentMeta(conv.id) : null;
    return { conv, trEntry, swarm, agentMeta };
  }));

  const visibleConvs = convPrepared.filter(({ conv, agentMeta }) => {
    if (!agentMeta) return true;
    if (agentMeta.isSubagent) return false;
    if (agentMeta.parentConversationId && agentMeta.parentConversationId !== conv.id) return false;
    return true;
  });

  let unassignedProject = null;
  const ensureUnassigned = () => {
    if (!unassignedProject) {
      unassignedProject = {
        id: 'unassigned',
        name: 'General',
        path: '',
        paths: [],
        canonicalPaths: [],
        defaultBranch: '',
        threads: [],
        etagPieces: [],
      };
      projectEntries.push(unassignedProject);
    }
    return unassignedProject;
  };

  const activeConvId = options.conversationId || process.env.ANTIGRAVITY_CONVERSATION_ID || '';
  if (activeConvId) {
    const activeConv = visibleConvs.find((entry) => entry.conv.id === activeConvId);
    if (activeConv) {
      const activeUpdatedAt = activeConv.trEntry?.summary?.updatedAtMs || activeConv.conv.mtime || now;
      markThreadSeen(activeConv.conv.id, Math.max(now, activeUpdatedAt), options);
    }
  }
  const seenMap = getSeenMap(options);

  const allThreadRecords = [];
  const recordsById = new Map();
  const needsAttention = [];

  for (const { conv, trEntry, swarm, agentMeta } of visibleConvs) {
    const matchedId = matchConversationToProject(conv, trEntry.summary, swarm, agentMeta, projectEntries, activeConvId);
    const project = matchedId
      ? projectEntries.find((p) => p.id === matchedId)
      : ensureUnassigned();

    const rec = buildLiveThreadRecord(conv, project, trEntry, swarm, agentMeta, now, seenMap);
    rec.projectId = project.id;
    rec.projectName = project.name;
    project.threads.push(rec);
    project.etagPieces.push(rec.etagPiece);
    allThreadRecords.push(rec);
    recordsById.set(conv.id, rec);
    needsAttention.push(...rec.attentionItems);
  }

  const crons = discoverCrons(options, discoveredProjects, new Date(now));
  for (const cron of crons) {
    const project = cron.projectId
      ? projectEntries.find((p) => p.id === cron.projectId)
      : ensureUnassigned();
    const rec = buildCronThreadRecord(cron);
    rec.projectId = project.id;
    rec.projectName = project.name;
    project.threads.push(rec);
    project.etagPieces.push(rec.etagPiece);
    allThreadRecords.push(rec);
    recordsById.set(cron.id, rec);
  }

  const gitResults = await Promise.all(
    projectEntries.map((p) => p.path
      ? getGitStatus(p.path, { cacheTtlMs: options.gitCacheTtlMs ?? 0, includePr: options.includePr })
      : Promise.resolve(null))
  );

  let totalThreads = 0;
  let liveSwarmCount = 0;
  let runningCount = 0;

  const projects = projectEntries.map((p, idx) => {
    const git = gitResults[idx];
    // Sort threads: blocking attention first, unseen done next, then active/running, cron, recency.
    p.threads.sort((a, b) => {
      const rank = (r) => {
        if (r.thread.needsAttention && !r.thread.unseen) return 0;
        if (r.thread.unseen) return 1;
        if (r.thread.running) return 2;
        if (r.thread.isCron) return 3;
        return 4;
      };
      return rank(a) - rank(b) || b.updatedAtMs - a.updatedAtMs;
    });

    const threads = p.threads.map((r) => r.thread);
    let projLive = 0;
    let projWaiting = 0;
    let projDoneUnseen = 0;
    let projCron = 0;
    let automationCount = 0;

    for (const th of threads) {
      totalThreads++;
      if (th.hasSwarm && (th.running || th.status === 'live')) liveSwarmCount++;
      if (th.running) {
        runningCount++;
        projLive++;
      } else if (th.unseen) {
        projDoneUnseen++;
      } else if (th.needsAttention) {
        projWaiting++;
      } else if (th.isCron) {
        projCron++;
        automationCount++;
      }
    }

    let badge = { label: 'Idle', tone: 'idle' };
    if (projLive > 0) badge = { label: `${projLive} Live`, tone: 'green' };
    else if (projWaiting > 0) badge = { label: `${projWaiting} Waiting`, tone: 'amber' };
    else if (projDoneUnseen > 0) badge = { label: `${projDoneUnseen} Done`, tone: 'green' };
    else if (projCron > 0) badge = { label: `${projCron} Cron`, tone: 'blue' };

    const worktreeCount = git?.worktreeCount || 0;
    const pr = git?.pr || null;
    const footerParts = [];
    if (pr) {
      footerParts.push(`PR #${pr.number}${pr.isDraft ? ' Draft' : ''}`, pr.status);
    } else if (automationCount > 0 || worktreeCount > 0) {
      if (automationCount > 0) footerParts.push(`${automationCount} Automation${automationCount === 1 ? '' : 's'}`);
      if (worktreeCount > 0) footerParts.push(`${worktreeCount} Worktree${worktreeCount === 1 ? '' : 's'}`);
    } else if (git?.isRepo && git.dirtyFiles > 0) {
      footerParts.push(`${git.dirtyFiles} dirty`, `${projLive} running`);
    } else {
      footerParts.push('Clean tree', `${projLive} running`);
    }

    const branch = git?.branch || p.defaultBranch || '';
    const diff = git?.diff || { added: 0, removed: 0 };

    return {
      id: p.id,
      name: p.name,
      path: p.path,
      branch,
      diff,
      badge,
      footerParts,
      footerText: footerParts.join(' · '),
      worktreeCount,
      automationCount,
      pr,
      threads,
      _gitKey: `${branch}:${diff.added}:${diff.removed}:${git?.dirtyFiles || 0}:${worktreeCount}:${pr?.number || ''}`,
      _etagPieces: p.etagPieces,
    };
  });

  needsAttention.sort((a, b) =>
    (ATTENTION_PRIORITY[a.kind] ?? 9) - (ATTENTION_PRIORITY[b.kind] ?? 9) ||
    b.timestamp.localeCompare(a.timestamp)
  );

  const summary = {
    projectCount: projects.length,
    threadCount: totalThreads,
    liveSwarmCount,
    needsAttentionCount: needsAttention.length,
    runningCount,
  };

  const etagPayload = {
    mode: 'live',
    summary,
    attention: needsAttention.map((a) => [a.id, a.kind, a.summary]),
    projects: projects.map((p) => [p.id, p._gitKey, p.badge.label, p._etagPieces]),
    plugins: plugins.map((pl) => [pl.dir, pl.enabled, pl.version]),
  };
  const etag = `live-${createHash('sha256').update(JSON.stringify(etagPayload)).digest('hex').slice(0, 16)}`;

  const cleanProjects = projects.map(({ _gitKey, _etagPieces, ...rest }) => rest);
  const defaultThreadId =
    needsAttention[0]?.threadId ||
    cleanProjects.flatMap((p) => p.threads).find((t) => t.running)?.id ||
    cleanProjects.flatMap((p) => p.threads)[0]?.id ||
    '';

  return {
    etag,
    summary,
    needsAttention,
    projects: cleanProjects,
    timeline: buildLiveTimeline(allThreadRecords),
    graph: buildLiveGraph(cleanProjects, recordsById),
    plugins,
    defaultThreadId,
    recordsById,
    projectEntries,
  };
}

/**
 * Builds the dashboard snapshot for either demo or live mode, honoring etag short-circuiting.
 */
export async function buildDashboardSnapshot(options = {}) {
  if (options.demo) {
    return getDemoDashboard(options);
  }

  const live = await assembleLiveState(options);
  if (options.etag && options.etag === live.etag) {
    return { unchanged: true, etag: live.etag, mode: 'live' };
  }

  return {
    mode: 'live',
    etag: live.etag,
    generatedAt: new Date().toISOString(),
    summary: live.summary,
    needsAttention: live.needsAttention,
    projects: live.projects,
    timeline: live.timeline,
    graph: live.graph,
    plugins: live.plugins,
    defaultThreadId: live.defaultThreadId,
  };
}

function mergeFilesForThread(projectPath, trFiles, swarmFiles, gitDiff) {
  const byPath = new Map();
  const relFromRepo = (absOrRel) => {
    if (!projectPath || !absOrRel.startsWith('/')) return absOrRel;
    const rel = relative(projectPath, absOrRel);
    return rel && !rel.startsWith('..') ? rel : absOrRel;
  };

  for (const df of gitDiff?.files || []) {
    byPath.set(df.path, {
      path: df.path,
      status: df.status,
      added: df.added,
      removed: df.removed,
    });
  }

  for (const tf of [...(trFiles || []), ...(swarmFiles || [])]) {
    const p = relFromRepo(tf.path);
    if (!byPath.has(p)) {
      byPath.set(p, {
        path: p,
        status: tf.status || 'M',
        added: 0,
        removed: 0,
      });
    }
  }

  return [...byPath.values()];
}

/**
 * Returns full detail for a single thread (activity, swarm, files, unified diff).
 */
export async function getThreadDetail(threadId, options = {}) {
  const isDemo = Boolean(options.demo);
  if (!isValidThreadId(threadId, { allowDemo: isDemo })) {
    return { errorStatus: 400, error: 'Invalid or missing thread id', code: 'INVALID_THREAD_ID' };
  }

  if (isDemo) {
    const detail = getDemoThreadDetail(threadId);
    if (!detail) return { errorStatus: 404, error: 'Thread not found', code: 'NOT_FOUND' };
    return detail;
  }

  const live = await assembleLiveState(options);
  const rec = live.recordsById.get(threadId);
  if (!rec) {
    return { errorStatus: 404, error: 'Thread not found', code: 'NOT_FOUND' };
  }

  const proj = live.projectEntries.find((p) => p.id === rec.projectId) || { id: rec.projectId, name: rec.projectName, path: '' };
  const th = rec.thread;
  const statusMap = {
    live: { label: 'Live', tone: 'green' },
    running: { label: 'Running', tone: 'green' },
    attention: { label: 'Waiting', tone: 'amber' },
    cron: { label: 'Scheduled', tone: 'blue' },
    done: { label: 'Done', tone: 'gray' },
    idle: { label: 'Idle', tone: 'gray' },
    error: { label: 'Error', tone: 'red' },
  };
  const st = statusMap[th.status] || { label: th.status, tone: th.dotTone };

  if (rec.cron) {
    const c = rec.cron;
    return {
      id: th.id,
      projectId: proj.id,
      projectName: proj.name,
      title: th.title,
      status: 'cron',
      statusLabel: st.label,
      statusTone: st.tone,
      composerPlaceholder: `Run or update ${th.title}...`,
      defaultModel: LIVE_MODELS[1].id,
      models: LIVE_MODELS,
      modes: DEFAULT_MODES,
      swarm: { exists: false, count: 0, roster: [], messages: [] },
      activity: [
        {
          id: `cron-${c.id}`,
          from: '@schedule',
          to: '',
          time: c.timeHHMM,
          timestamp: c.nextRunAt,
          body: c.prompt || c.description || `Scheduled job (${c.rawSchedule})`,
          badge: { text: `Cron · ${c.timeHHMM}`, tone: 'blue', icon: 'clock' },
          filePill: basename(c.filePath),
          stateText: c.nextLabel,
        },
      ],
      files: [],
      diff: [],
      diffTruncated: false,
    };
  }

  const gitDiff = proj.path ? await getGitDiff(proj.path) : { files: [], truncated: false };
  const files = mergeFilesForThread(proj.path, rec.tr?.editedFiles, rec.swarm?.editedFiles, gitDiff);

  const swarmPayload = rec.swarm
    ? {
        exists: true,
        count: rec.swarm.count,
        roster: rec.swarm.roster.map((m) => ({
          name: m.name,
          handle: m.handle,
          role: m.role,
          status: m.status,
          stateLabel: m.stateLabel,
          tone: m.tone,
          conversationId: m.conversationId,
        })),
        messages: rec.swarm.messages.map((m) => ({
          seq: m.seq,
          agent: m.agent,
          to: m.to,
          time: m.time,
          text: m.text,
          statusPill: m.statusPill,
        })),
      }
    : { exists: false, count: 0, roster: [], messages: [] };

  let activity = [];
  if (rec.swarm && rec.swarm.messages.length > 0) {
    activity = rec.swarm.messages.slice(-40).map((m) => ({
      id: `msg-${m.seq}`,
      from: m.agent,
      to: m.to,
      time: m.time,
      timestamp: m.timestamp,
      body: m.text,
      badge: m.statusPill
        ? { text: m.statusPill, tone: /fail/i.test(m.statusPill) ? 'red' : 'green', icon: /fail/i.test(m.statusPill) ? 'alert' : 'check' }
        : null,
      filePill: m.filePill,
      stateText: m.stateText,
    }));
  } else if (rec.tr?.activities?.length) {
    activity = [...rec.tr.activities];
  }

  if (rec.tr?.askQuestion) {
    const last = activity[activity.length - 1];
    const alreadyShown = last && last.badge?.text === 'Needs answer' && String(last.body || '').includes(rec.tr.askQuestion);
    if (!alreadyShown) {
      activity.push({
        id: 'pending-question',
        from: rec.swarm ? '@coordinator' : '@agent',
        to: 'You',
        time: formatAgeLabel(rec.updatedAtMs) || 'Now',
        timestamp: th.updatedAt,
        body: rec.tr.askQuestion,
        badge: { text: 'Needs answer', tone: 'amber', icon: 'alert' },
        filePill: null,
        stateText: 'Waiting for reply',
      });
    }
  }

  if (rec.tr?.pendingApproval) {
    const alreadyShown = activity.some((a) => a.id === 'pending-approval' || a.badge?.text === 'Approval required');
    if (!alreadyShown) {
      activity.push({
        id: 'pending-approval',
        from: rec.swarm ? '@coordinator' : '@agent',
        to: 'You',
        time: formatAgeLabel(rec.updatedAtMs) || 'Now',
        timestamp: th.updatedAt,
        body: rec.tr.pendingApproval,
        badge: { text: 'Approval required', tone: 'amber', icon: 'alert' },
        filePill: null,
        stateText: 'Waiting for approval',
      });
    }
  }

  const defaultModel = rec.tr?.model || rec.conv?.localMeta?.model || LIVE_MODELS[0].id;
  const models = LIVE_MODELS.some((m) => m.id === defaultModel || m.label === defaultModel)
    ? LIVE_MODELS
    : [{ id: defaultModel, label: defaultModel }, ...LIVE_MODELS];

  return {
    id: th.id,
    projectId: proj.id,
    projectName: proj.name,
    title: th.title,
    status: th.status,
    statusLabel: st.label,
    statusTone: st.tone,
    composerPlaceholder: rec.swarm
      ? 'Steer @coordinator or reply to thread...'
      : `Reply to ${th.title}...`,
    defaultModel,
    models,
    modes: DEFAULT_MODES,
    swarm: swarmPayload,
    activity,
    files,
    diff: gitDiff.files,
    diffTruncated: Boolean(gitDiff.truncated),
  };
}
