import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { discoverPlugins, readCached, resolvePaths, safeReaddir, statOf, uriToPath } from './discovery.mjs';
import { oneLine } from './transcript.mjs';

const WEEKDAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MACROS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const dtfCache = new Map();
function getFormatter(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }));
  }
  return dtfCache.get(tz);
}

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    getFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

function getTzParts(ms, tz) {
  const parts = getFormatter(tz).formatToParts(new Date(ms));
  let year = 0;
  let month = 0;
  let day = 0;
  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'weekday') weekday = WEEKDAY_MAP[p.value.toLowerCase().slice(0, 3)] ?? 0;
    else if (p.type === 'hour') hour = Number(p.value) % 24;
    else if (p.type === 'minute') minute = Number(p.value);
  }
  return { year, month, day, weekday, hour, minute };
}

function parseValue(token, namesMap, isDow) {
  const lower = token.toLowerCase();
  if (namesMap && Object.hasOwn(namesMap, lower)) return namesMap[lower];
  if (!/^\d+$/.test(token)) return NaN;
  const n = Number(token);
  return isDow && n === 7 ? 0 : n;
}

function parseField(field, minVal, maxVal, { namesMap = null, isDow = false } = {}) {
  const set = new Set();
  const isWild = field === '*';
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart !== undefined ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) return null;

    let start;
    let end;
    if (rangePart === '*') {
      start = minVal;
      end = maxVal;
    } else if (rangePart.includes('-')) {
      const [aStr, bStr] = rangePart.split('-');
      start = parseValue(aStr, namesMap, isDow);
      end = parseValue(bStr, namesMap, isDow);
      if (isDow && end === 0 && start > 0) end = 7;
    } else {
      const v = parseValue(rangePart, namesMap, isDow);
      if (!Number.isInteger(v) || v < minVal || v > maxVal) return null;
      if (stepPart !== undefined) {
        start = v;
        end = maxVal;
      } else {
        set.add(isDow && v === 7 ? 0 : v);
        continue;
      }
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minVal || end > (isDow ? 7 : maxVal) || start > end) {
      return null;
    }
    for (let v = start; v <= end; v += step) {
      set.add(isDow && v === 7 ? 0 : v);
    }
  }
  return set.size > 0 ? { set, isWild } : null;
}

/**
 * Parses a cron schedule string (`CRON_TZ=<tz> m h dom mon dow` or 5-field cron).
 */
export function parseCronSpec(rawExpr) {
  if (typeof rawExpr !== 'string' || !rawExpr.trim()) return null;
  let tokens = rawExpr.trim().split(/\s+/);
  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  while (tokens.length > 0 && /^(?:CRON_TZ|TZ)=/.test(tokens[0])) {
    const candidateTz = tokens.shift().replace(/^(?:CRON_TZ|TZ)=/, '').trim();
    if (isValidTimeZone(candidateTz)) tz = candidateTz;
  }

  if (tokens.length === 1 && MACROS[tokens[0].toLowerCase()]) {
    tokens = MACROS[tokens[0].toLowerCase()].split(' ');
  }
  if (tokens.length !== 5) return null;

  const min = parseField(tokens[0], 0, 59);
  const hour = parseField(tokens[1], 0, 23);
  const dom = parseField(tokens[2], 1, 31);
  const mon = parseField(tokens[3], 1, 12, { namesMap: MONTH_MAP });
  const dow = parseField(tokens[4], 0, 6, { namesMap: WEEKDAY_MAP, isDow: true });
  if (!min || !hour || !dom || !mon || !dow) return null;

  return {
    raw: rawExpr.trim(),
    tz,
    expr: tokens.join(' '),
    min: min.set,
    hour: hour.set,
    dom: dom.set,
    mon: mon.set,
    dow: dow.set,
    domWild: dom.isWild,
    dowWild: dow.isWild,
  };
}

/**
 * Formats relative time until next run (`Next 45m`, `Next 10h`, `Next 3d`).
 */
export function formatNextLabel(nextRunMs, nowMs = Date.now()) {
  if (!Number.isFinite(nextRunMs)) return '';
  const diffMin = Math.max(1, Math.round((nextRunMs - nowMs) / 60000));
  if (diffMin < 60) return `Next ${diffMin}m`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 48) return `Next ${diffHours}h`;
  return `Next ${Math.round(diffHours / 24)}d`;
}

/**
 * Computes the next occurrence timestamp and formatted HH:MM / Next Nh label.
 */
export function computeNextRun(spec, now = new Date()) {
  if (!spec) return null;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const startMs = Math.floor(nowMs / 60000) * 60000 + 60000;
  const maxMs = startMs + 366 * 24 * 60 * 60 * 1000;
  let curMs = startMs;

  for (let iter = 0; iter < 5000 && curMs <= maxMs; iter++) {
    const p = getTzParts(curMs, spec.tz);
    const dayMatches = (!spec.domWild && !spec.dowWild)
      ? (spec.dom.has(p.day) || spec.dow.has(p.weekday))
      : (spec.dom.has(p.day) && spec.dow.has(p.weekday));

    if (!spec.mon.has(p.month) || !dayMatches) {
      const jumpMins = Math.max(1, (23 - p.hour) * 60 + (60 - p.minute));
      curMs += jumpMins * 60000;
      continue;
    }
    if (!spec.hour.has(p.hour)) {
      const jumpMins = Math.max(1, 60 - p.minute);
      curMs += jumpMins * 60000;
      continue;
    }
    if (!spec.min.has(p.minute)) {
      curMs += 60000;
      continue;
    }

    const hh = String(p.hour).padStart(2, '0');
    const mm = String(p.minute).padStart(2, '0');
    return {
      nextRunAt: new Date(curMs).toISOString(),
      nextRunMs: curMs,
      timeHHMM: `${hh}:${mm}`,
      nextLabel: formatNextLabel(curMs, nowMs),
    };
  }

  return null;
}

/**
 * Generates a deterministic UUID-shaped thread identifier for a scheduled automation.
 */
export function cronThreadId(sidecarId) {
  const hex = createHash('sha256').update(`cron:${sidecarId}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function extractScheduleAndPrompt(sidecar) {
  let rawSchedule = '';
  let prompt = '';
  if (Array.isArray(sidecar.args)) {
    rawSchedule = typeof sidecar.args[0] === 'string' ? sidecar.args[0] : '';
    const dashIdx = sidecar.args.indexOf('--');
    if (dashIdx >= 0 && dashIdx + 1 < sidecar.args.length) {
      prompt = sidecar.args.slice(dashIdx + 1).filter((x) => typeof x === 'string').join(' ');
    } else if (sidecar.args.length > 1) {
      const last = sidecar.args[sidecar.args.length - 1];
      if (typeof last === 'string' && !last.startsWith('-')) prompt = last;
    }
  } else if (sidecar.args && typeof sidecar.args === 'object') {
    rawSchedule = String(sidecar.args.schedule || '');
    prompt = String(sidecar.args.prompt || '');
  }
  return { rawSchedule, prompt: prompt.trim() };
}

function matchCronProject(cron, projects) {
  for (const uriPath of cron.workspacePaths) {
    let best = null;
    for (const p of projects) {
      for (const pPath of p.paths || (p.path ? [p.path] : [])) {
        const normP = resolve(pPath);
        const normU = resolve(uriPath);
        if (normU === normP || normU.startsWith(`${normP}/`)) {
          if (!best || normP.length > best.len) best = { id: p.id, len: normP.length };
        }
      }
    }
    if (best) return best.id;
  }

  const hay = `${cron.displayName}\n${cron.description}\n${cron.prompt}`.toLowerCase();
  for (const p of projects) {
    for (const pPath of p.paths || (p.path ? [p.path] : [])) {
      if (pPath && hay.includes(pPath.toLowerCase())) return p.id;
    }
  }
  for (const p of projects) {
    if (!p.name || p.name.length < 2) continue;
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|[^a-z0-9_-])${escaped}(?:$|[^a-z0-9_-])`, 'i').test(hay)) {
      return p.id;
    }
  }
  return null;
}

/**
 * Discovers scheduled cron automations across sidecar directories and plugins.
 */
export function discoverCrons(options = {}, projects = [], now = new Date()) {
  const { configDir, sidecarDirs } = resolvePaths(options);
  const plugins = discoverPlugins(options);

  let disabledMap = {};
  const cfgFile = readCached(join(configDir, 'config.json'), 128 * 1024);
  if (cfgFile.text) {
    try {
      const cfg = JSON.parse(cfgFile.text);
      if (cfg?.sidecars && typeof cfg.sidecars === 'object') disabledMap = cfg.sidecars;
    } catch {
      // Ignore invalid config.json.
    }
  }

  const scanDirs = [...sidecarDirs];
  for (const pl of plugins) {
    scanDirs.push(join(pl.path, 'sidecars'));
  }

  const candidateFiles = [];
  for (const dir of scanDirs) {
    if (statOf(join(dir, 'sidecar.json')).isFile) {
      candidateFiles.push({ slug: dir.split('/').pop() || 'cron', file: join(dir, 'sidecar.json') });
    }
    for (const sub of safeReaddir(dir).sort()) {
      const scPath = join(dir, sub, 'sidecar.json');
      if (statOf(scPath).isFile) {
        candidateFiles.push({ slug: sub, file: scPath });
      }
    }
  }

  const crons = [];
  const seenFiles = new Set();

  for (const { slug, file } of candidateFiles) {
    let real = file;
    try {
      real = realpathSync(file);
    } catch {
      // Keep original path.
    }
    if (seenFiles.has(real)) continue;
    seenFiles.add(real);

    const scFile = readCached(file, 64 * 1024);
    if (!scFile.text) continue;
    let sc;
    try {
      sc = JSON.parse(scFile.text);
    } catch {
      continue;
    }
    if (!sc || typeof sc !== 'object' || sc.builtin !== 'schedule') continue;

    const { rawSchedule, prompt } = extractScheduleAndPrompt(sc);
    const spec = parseCronSpec(rawSchedule);
    if (!spec) continue;

    const next = computeNextRun(spec, now);
    const workspaceUris = Array.isArray(sc.agent_permissions?.workspace_uris)
      ? sc.agent_permissions.workspace_uris.filter((u) => typeof u === 'string')
      : [];
    const workspacePaths = workspaceUris.map(uriToPath).filter(Boolean);
    const displayName = oneLine(sc.display_name || sc.ui_config?.display_name || slug, 80);
    const enabledPref = disabledMap[slug]?.enabled;
    const enabled = typeof enabledPref === 'boolean' ? enabledPref : !Boolean(sc.disabled);

    const cron = {
      id: cronThreadId(slug),
      sidecarId: slug,
      displayName,
      description: oneLine(sc.description || '', 200),
      prompt,
      rawSchedule,
      tz: spec.tz,
      expr: spec.expr,
      timeHHMM: next?.timeHHMM || '00:00',
      nextRunAt: next?.nextRunAt || '',
      nextRunMs: next?.nextRunMs || 0,
      nextLabel: next?.nextLabel || 'Scheduled',
      workspaceUris,
      workspacePaths,
      enabled,
      filePath: file,
    };
    cron.projectId = matchCronProject(cron, projects);
    crons.push(cron);
  }

  return crons;
}
