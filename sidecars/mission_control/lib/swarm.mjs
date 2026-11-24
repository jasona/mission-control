import { join } from 'node:path';
import { ID_RE, readCached } from './discovery.mjs';
import { STUCK_MS, oneLine, parseTestOutput, stepFailure, summarizeTranscript } from './transcript.mjs';

export const VIEW_MAX_BYTES = 64 * 1024;
const ROLE_WORKER_RE = /^(?:narrator|monitor)(?:-\d+)?$/;
const NAME_CHAR_RE = /[a-z0-9_-]/i;
const FILE_REF_RE = /\b([a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+\.(?:rs|mjs|js|ts|py|go|json|toml|md|css|html|sh|sql|yaml|yml))\b/;

const viewJsonCache = new Map();
const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export function swarmDirOf(appData, convId) {
  return join(appData, 'brain', convId, '.system_generated', 'swarm');
}

function roleOf(name, m) {
  const r = typeof m?.role === 'string' ? m.role : '';
  if (r && r !== 'worker') return r;
  const match = /^(narrator|monitor)(?:-\d+)?$/.exec(String(name ?? ''));
  return match ? match[1] : r;
}

export function isRoleWorker(name, m) {
  const r = roleOf(name, m);
  return Boolean((r && r !== 'worker' && r !== 'coordinator') || ROLE_WORKER_RE.test(String(name ?? '')));
}

/**
 * Parses members.json text into normalized { title, members }.
 */
export function parseRoster(text) {
  if (!text) return null;
  try {
    const r = JSON.parse(text);
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    return {
      title: typeof r.title === 'string' ? r.title : '',
      members: r.members && typeof r.members === 'object' && !Array.isArray(r.members) ? r.members : {},
    };
  } catch {
    return null;
  }
}

/**
 * Parses board.jsonl lines, tolerating blank or torn final lines.
 */
export function parseBoard(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m && typeof m === 'object') out.push(m);
    } catch {
      // Torn line will settle on next poll.
    }
  }
  return out;
}

/**
 * Extracts @mentions and @all from board message text using word-start boundaries.
 */
export function mentionsOf(text, names = []) {
  const lowerMap = new Map(names.map((n) => [String(n).toLowerCase(), n]));
  const mentions = [];
  const seen = new Set();
  let all = false;
  const src = String(text || '');

  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '@') continue;
    if (i > 0 && NAME_CHAR_RE.test(src[i - 1])) continue;
    let end = i + 1;
    while (end < src.length && NAME_CHAR_RE.test(src[end])) end++;
    if (end === i + 1) continue;
    const token = src.slice(i + 1, end).toLowerCase();
    if (token === 'all') {
      all = true;
    } else if (lowerMap.has(token)) {
      const canonical = lowerMap.get(token);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        mentions.push(canonical);
      }
    } else if (!names.length && !seen.has(token)) {
      seen.add(token);
      mentions.push(src.slice(i + 1, end));
    }
  }
  return { mentions, all };
}

function boardTimeMs(t) {
  const ms = t ? Date.parse(String(t).replace(' ', 'T')) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function formatBoardClock(timeStr) {
  const ms = boardTimeMs(timeStr);
  return ms ? clockFmt.format(new Date(ms)) : String(timeStr || '');
}

function parseViewJson(id, dir) {
  const f = readCached(join(dir, 'view.json'), VIEW_MAX_BYTES);
  if (f.size < 0) {
    viewJsonCache.delete(id);
    return { json: null, mtime: 0, error: '' };
  }
  const key = `${f.mtime}:${f.size}`;
  let c = viewJsonCache.get(id);
  if (!c || c.key !== key) {
    let parsed = null;
    let error = '';
    if (f.tooLarge) {
      error = 'too_large';
    } else {
      try {
        const v = JSON.parse(f.text ?? '');
        if (v && typeof v === 'object' && !Array.isArray(v)) parsed = v;
        else error = 'invalid';
      } catch {
        error = 'invalid';
      }
    }
    c = { key, error, good: parsed ? { json: parsed, mtime: f.mtime } : c?.good || null };
    viewJsonCache.set(id, c);
  }
  return { json: c.good?.json || null, mtime: c.good?.mtime || 0, error: c.error };
}

function rawStatusOf(m, tr) {
  if (m.killed) return 'killed';
  if (typeof tr?.idle === 'boolean') return tr.idle ? 'waiting' : 'working';
  if (m.wake_mode === 'mentions' || m.wake_mode === 'anything') return 'waiting';
  return 'working';
}

function displayStateOf(rawStatus, tr, lastPostText = '') {
  if (rawStatus === 'killed') return { stateLabel: 'Killed', tone: 'gray' };
  if (rawStatus === 'working') {
    const act = tr?.activity || '';
    if (/^(Edit|Write)\b/.test(act)) return { stateLabel: 'Editing', tone: 'green' };
    return { stateLabel: 'Active', tone: 'green' };
  }
  if (/\[done\]|\bready\b/i.test(lastPostText) || tr?.replied) {
    return { stateLabel: 'Ready', tone: 'amber' };
  }
  return { stateLabel: 'Waiting', tone: 'amber' };
}

/**
 * Reads a full swarm snapshot for a coordinator conversation directory.
 */
export function readSwarm(appData, convId, now = Date.now()) {
  if (!appData || !convId || !ID_RE.test(convId)) return null;
  const dir = swarmDirOf(appData, convId);
  const membersFile = readCached(join(dir, 'members.json'), 256 * 1024);
  if (membersFile.size < 0 || !membersFile.text) return null;

  const roster = parseRoster(membersFile.text);
  if (!roster) return null;

  const boardFile = readCached(join(dir, 'board.jsonl'), 2 * 1024 * 1024);
  const rawMsgs = parseBoard(boardFile.text);
  const view = parseViewJson(convId, dir);

  const names = Object.keys(roster.members).filter((n) => roster.members[n] && typeof roster.members[n] === 'object');
  const transcripts = new Map();
  const lastPostByAgent = new Map();

  for (const msg of rawMsgs) {
    const agent = String(msg.agent || '');
    if (agent) lastPostByAgent.set(agent, msg);
  }

  const workerConvIds = new Set();
  const workspaces = new Set();
  const editedFiles = [];
  const seenEdited = new Set();

  for (const name of names) {
    const m = roster.members[name];
    const cid = typeof m.conversation_id === 'string' ? m.conversation_id : '';
    if (cid && cid !== convId && ID_RE.test(cid)) {
      workerConvIds.add(cid);
    }
    if (typeof m.workspace === 'string' && m.workspace.trim()) {
      workspaces.add(m.workspace.trim());
    }
    const trEntry = summarizeTranscript(appData, cid);
    transcripts.set(name, trEntry);
    for (const ef of trEntry.summary?.editedFiles || []) {
      if (!seenEdited.has(ef.path)) {
        seenEdited.add(ef.path);
        editedFiles.push(ef);
      }
    }
  }

  const memberObjs = names.map((name) => {
    const m = roster.members[name];
    const tr = transcripts.get(name)?.summary;
    const rawStatus = rawStatusOf(m, tr);
    const lastPost = lastPostByAgent.get(name);
    const { stateLabel, tone } = displayStateOf(rawStatus, tr, String(lastPost?.text || ''));
    const role = roleOf(name, m);
    const failure = stepFailure(tr, now);
    const roleWorker = isRoleWorker(name, m);

    return {
      name,
      handle: `@${name}`,
      role,
      roleWorker,
      status: rawStatus,
      stateLabel,
      tone,
      conversationId: String(m.conversation_id || ''),
      model: String(m.model || tr?.model || ''),
      activity: tr?.activity || '',
      failure,
      transcriptMtime: tr?.mtime || 0,
      testResults: tr?.testResults || { latest: null, all: [] },
      killed: Boolean(m.killed),
    };
  });

  memberObjs.sort((a, b) =>
    (a.role === 'coordinator' ? 0 : 1) - (b.role === 'coordinator' ? 0 : 1) || a.name.localeCompare(b.name));

  const memberByName = new Map(memberObjs.map((m) => [m.name, m]));

  // Find latest message seq directed at each member so active tasks show Working...
  const latestAssignmentSeq = new Map();
  const parsedMsgs = rawMsgs.map((m) => {
    const seq = Number(m.seq) || 0;
    const agent = String(m.agent || '');
    const text = String(m.text || '');
    const { mentions, all } = mentionsOf(text, names);
    const to = mentions[0] ? `@${mentions[0]}` : (all ? '@all' : '');
    if (mentions[0]) latestAssignmentSeq.set(mentions[0], seq);
    return { seq, agent, to, primaryMention: mentions[0] || '', mentions, all, rawTime: String(m.time || ''), text };
  });

  const messages = parsedMsgs.map((m) => {
    const tsMs = boardTimeMs(m.rawTime);
    const timestamp = tsMs ? new Date(tsMs).toISOString() : '';
    const time = formatBoardClock(m.rawTime);
    const testParsed = parseTestOutput(m.text);
    const targetMember = m.primaryMention ? memberByName.get(m.primaryMention) : null;
    const posterMember = memberByName.get(m.agent);

    let statusPill = testParsed ? testParsed.label : null;
    if (!statusPill && m.text.includes('[done]') && posterMember?.testResults?.latest?.label) {
      statusPill = posterMember.testResults.latest.label;
    }

    const fileMatch = m.text.match(FILE_REF_RE);
    const filePill = fileMatch ? fileMatch[1] : null;
    const isLatestForWorkingTarget = Boolean(
      targetMember &&
      targetMember.status === 'working' &&
      !targetMember.killed &&
      latestAssignmentSeq.get(targetMember.name) === m.seq
    );

    return {
      seq: m.seq,
      agent: m.agent.startsWith('@') ? m.agent : `@${m.agent}`,
      to: m.to,
      time,
      timestamp,
      text: oneLine(m.text, 280),
      rawText: m.text,
      statusPill,
      filePill,
      stateText: isLatestForWorkingTarget ? 'Working...' : '',
    };
  });

  const systemAttention = [];
  for (const m of memberObjs) {
    if (m.killed || m.roleWorker) continue;
    if (m.failure) {
      systemAttention.push({
        id: `swarm-${convId}-${m.name}-${m.failure.kind}`,
        kind: m.failure.kind,
        member: m.name,
        conversationId: m.conversationId,
        summary: `${m.handle}: ${m.failure.text}`,
      });
    } else if (m.status === 'working' && m.transcriptMtime && now - m.transcriptMtime > STUCK_MS) {
      systemAttention.push({
        id: `swarm-${convId}-${m.name}-stuck`,
        kind: 'stuck',
        member: m.name,
        conversationId: m.conversationId,
        summary: `${m.handle}: no progress for ${Math.round((now - m.transcriptMtime) / 60000)}m`,
      });
    }
  }

  const activeMembers = memberObjs.filter((m) => !m.killed);
  const workingCount = activeMembers.filter((m) => m.status === 'working').length;
  const readyWorkers = activeMembers.filter((m) => m.role !== 'coordinator' && !m.roleWorker && m.stateLabel === 'Ready');
  const taskWorkers = activeMembers.filter((m) => !m.roleWorker);

  const etagKey = [
    `${membersFile.mtime}:${membersFile.size}`,
    `${boardFile.mtime}:${boardFile.size}`,
    `${view.mtime}`,
    ...names.map((n) => `${n}:${transcripts.get(n)?.key || '-'}`),
  ].join('|');

  return {
    id: convId,
    title: roster.title,
    exists: true,
    count: activeMembers.length || memberObjs.length,
    taskMemberCount: taskWorkers.length,
    workingCount,
    isLive: workingCount > 0 || readyWorkers.length > 0,
    roster: memberObjs,
    messages,
    workerConvIds,
    workspaces: [...workspaces],
    editedFiles,
    viewJson: view.json,
    systemAttention,
    readyWorkers,
    etagKey,
  };
}
