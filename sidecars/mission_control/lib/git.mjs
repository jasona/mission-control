import { execFile } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DIFF_MAX_BYTES = 200 * 1024;
const GIT_TIMEOUT_MS = 4000;
const GH_TIMEOUT_MS = 1500;
const GH_CACHE_TTL_MS = 60 * 1000;

const statusCache = new Map();
const statusInFlight = new Map();
const prCache = new Map();
const prInFlight = new Map();

function canonicalRepoPath(repoPath) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) return null;
  try {
    const real = realpathSync(repoPath);
    if (!statSync(real).isDirectory()) return null;
    return real;
  } catch {
    return null;
  }
}

async function runGit(repoPath, args, { maxBuffer = 1024 * 1024, timeout = GIT_TIMEOUT_MS } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    encoding: 'utf-8',
    timeout,
    maxBuffer,
  });
  return stdout;
}

/**
 * Parses `git diff --numstat` output into per-file counts and totals.
 */
export function parseNumstat(text) {
  const files = new Map();
  let added = 0;
  let removed = 0;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const a = parts[0] === '-' ? 0 : (parseInt(parts[0], 10) || 0);
    const r = parts[1] === '-' ? 0 : (parseInt(parts[1], 10) || 0);
    const filePath = parts.slice(2).join('\t').trim();
    if (!filePath) continue;
    added += a;
    removed += r;
    const prev = files.get(filePath);
    files.set(filePath, {
      added: (prev?.added || 0) + a,
      removed: (prev?.removed || 0) + r,
    });
  }
  return { added, removed, files };
}

/**
 * Parses `git status --porcelain` lines without trimming significant leading spaces.
 */
export function parsePorcelainStatus(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    if (!line || line.length < 4) continue;
    const xy = line.slice(0, 2);
    let filePath = line.slice(3);
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop();
    }
    filePath = filePath.replace(/^"|"$/g, '').trim();
    if (!filePath) continue;
    let status = 'M';
    if (xy === '??' || xy.includes('A')) status = 'A';
    else if (xy.includes('D')) status = 'D';
    else if (xy.includes('R')) status = 'R';
    entries.push({ path: filePath, xy, status });
  }
  return entries;
}

/**
 * Parses `git worktree list --porcelain` stanzas.
 */
export function parseWorktreePorcelain(text) {
  const worktrees = [];
  let current = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) {
      if (current) {
        worktrees.push(current);
        current = null;
      }
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current);
      current = { path: line.slice(9).trim(), branch: '', bare: false };
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
    } else if (current && line === 'bare') {
      current.bare = true;
    }
  }
  if (current) worktrees.push(current);
  return worktrees;
}

/**
 * Parses unified diff text into per-file patches, capped at maxBytes.
 */
export function parseUnifiedDiff(diffText, maxBytes = DIFF_MAX_BYTES) {
  let raw = String(diffText || '');
  let truncated = false;
  if (Buffer.byteLength(raw, 'utf-8') > maxBytes) {
    raw = Buffer.from(raw, 'utf-8').subarray(0, maxBytes).toString('utf-8');
    const lastNl = raw.lastIndexOf('\n');
    if (lastNl > 0) raw = raw.slice(0, lastNl);
    truncated = true;
  }

  const sections = raw.split(/^(?=diff --git )/m).filter((s) => s.trim());
  const files = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const patch of sections) {
    const lines = patch.split('\n');
    const header = lines[0] || '';
    let path = '';
    const m = header.match(/^diff --git "?[a-z]\/(.+?)"? "?[a-z]\/(.+?)"?$/);
    if (m) path = m[2].replace(/^"|"$/g, '');
    if (!path) {
      const plusLine = lines.find((l) => /^\+\+\+ [a-z]\//.test(l));
      if (plusLine) path = plusLine.slice(6).trim().replace(/^"|"$/g, '');
    }
    if (!path) continue;

    let status = 'M';
    if (patch.includes('\nnew file mode ')) status = 'A';
    else if (patch.includes('\ndeleted file mode ')) status = 'D';
    else if (patch.includes('\nrename from ')) status = 'R';

    let added = 0;
    let removed = 0;
    let inHunk = false;
    for (const line of lines) {
      if (line.startsWith('@@ ')) {
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;
      if (line.startsWith('+') && !line.startsWith('+++')) added++;
      else if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }

    totalAdded += added;
    totalRemoved += removed;
    files.push({ path, status, added, removed, patch });
  }

  return { files, totalAdded, totalRemoved, truncated };
}

/**
 * Queries GitHub CLI for an open PR on the current branch with short timeout and caching.
 */
export async function getGhPr(repoPath, branch = '') {
  const real = canonicalRepoPath(repoPath);
  if (!real) return null;
  const cacheKey = `${real}|${branch}`;
  const hit = prCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GH_CACHE_TTL_MS) return hit.pr;
  if (prInFlight.has(cacheKey)) return prInFlight.get(cacheKey);

  const p = (async () => {
    try {
      const remotes = await runGit(real, ['remote'], { timeout: 1000 });
      if (!remotes.trim()) {
        prCache.set(cacheKey, { at: Date.now(), pr: null });
        return null;
      }
      const args = ['pr', 'list', '--json', 'number,title,isDraft,statusCheckRollup,url,headRefName', '--limit', '5'];
      if (branch) args.push('--head', branch);
      const { stdout } = await execFileAsync('gh', args, {
        cwd: real,
        encoding: 'utf-8',
        timeout: GH_TIMEOUT_MS,
        maxBuffer: 256 * 1024,
      });
      const list = JSON.parse(stdout || '[]');
      const item = Array.isArray(list) && list.length ? list[0] : null;
      let pr = null;
      if (item) {
        const checks = Array.isArray(item.statusCheckRollup) ? item.statusCheckRollup : [];
        let ciStatus = '';
        if (checks.some((c) => c?.conclusion === 'FAILURE' || c?.state === 'FAILURE')) ciStatus = 'CI Failing';
        else if (checks.some((c) => c?.status === 'IN_PROGRESS' || c?.status === 'QUEUED' || c?.state === 'PENDING')) ciStatus = 'CI Running';
        else if (checks.length > 0) ciStatus = 'CI Passed';
        pr = {
          number: Number(item.number) || 0,
          title: String(item.title || ''),
          isDraft: Boolean(item.isDraft),
          status: ciStatus || (item.isDraft ? 'Draft' : 'Open'),
          url: String(item.url || ''),
        };
      }
      prCache.set(cacheKey, { at: Date.now(), pr });
      return pr;
    } catch {
      prCache.set(cacheKey, { at: Date.now(), pr: null });
      return null;
    } finally {
      prInFlight.delete(cacheKey);
    }
  })();

  prInFlight.set(cacheKey, p);
  return p;
}

/**
 * Computes git branch, diff numstat, porcelain status, worktree count, and optional PR info.
 */
export async function getGitStatus(repoPath, options = {}) {
  const real = canonicalRepoPath(repoPath);
  const empty = {
    isRepo: false,
    branch: '',
    diff: { added: 0, removed: 0 },
    dirtyFiles: 0,
    clean: true,
    files: [],
    worktrees: [],
    worktreeCount: 0,
    totalWorktrees: 0,
    pr: null,
  };
  if (!real) return empty;

  const cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : 0;
  if (cacheTtlMs > 0) {
    const hit = statusCache.get(real);
    if (hit && Date.now() - hit.at < cacheTtlMs) return hit.data;
  }
  if (statusInFlight.has(real)) return statusInFlight.get(real);

  const task = (async () => {
    try {
      const inside = await runGit(real, ['rev-parse', '--is-inside-work-tree']).catch(() => '');
      if (inside.trim() !== 'true' && !existsSync(join(real, '.git'))) {
        return empty;
      }

      const [branchOut, unstagedOut, stagedOut, porcelainOut, wtOut] = await Promise.all([
        runGit(real, ['rev-parse', '--abbrev-ref', 'HEAD'])
          .catch(() => runGit(real, ['symbolic-ref', '--short', 'HEAD']))
          .catch(() => ''),
        runGit(real, ['diff', '--numstat']).catch(() => ''),
        runGit(real, ['diff', '--cached', '--numstat']).catch(() => ''),
        runGit(real, ['status', '--porcelain=v1', '-u']).catch(() => ''),
        runGit(real, ['worktree', 'list', '--porcelain']).catch(() => ''),
      ]);

      const branch = branchOut.trim() || 'HEAD';
      const unstaged = parseNumstat(unstagedOut);
      const staged = parseNumstat(stagedOut);
      const porcelain = parsePorcelainStatus(porcelainOut);
      const worktrees = parseWorktreePorcelain(wtOut);

      const fileMap = new Map();
      for (const [path, counts] of staged.files) {
        fileMap.set(path, { path, status: 'M', added: counts.added, removed: counts.removed });
      }
      for (const [path, counts] of unstaged.files) {
        const prev = fileMap.get(path);
        fileMap.set(path, {
          path,
          status: prev?.status || 'M',
          added: (prev?.added || 0) + counts.added,
          removed: (prev?.removed || 0) + counts.removed,
        });
      }
      for (const entry of porcelain) {
        const prev = fileMap.get(entry.path);
        fileMap.set(entry.path, {
          path: entry.path,
          status: entry.status,
          added: prev?.added || 0,
          removed: prev?.removed || 0,
        });
      }

      const files = [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path));
      const added = unstaged.added + staged.added;
      const removed = unstaged.removed + staged.removed;
      const totalWorktrees = worktrees.length;
      const worktreeCount = Math.max(0, totalWorktrees - 1);
      const pr = options.includePr === false ? null : await getGhPr(real, branch);

      const data = {
        isRepo: true,
        branch,
        diff: { added, removed },
        dirtyFiles: files.length,
        clean: files.length === 0,
        files,
        worktrees,
        worktreeCount,
        totalWorktrees,
        pr,
      };
      if (cacheTtlMs > 0) statusCache.set(real, { at: Date.now(), data });
      return data;
    } catch {
      return empty;
    } finally {
      statusInFlight.delete(real);
    }
  })();

  statusInFlight.set(real, task);
  return task;
}

/**
 * Fetches capped unified diff (up to 200KB) for a repository, handling unborn HEAD safely.
 */
export async function getGitDiff(repoPath, maxBytes = DIFF_MAX_BYTES) {
  const real = canonicalRepoPath(repoPath);
  if (!real) return { files: [], totalAdded: 0, totalRemoved: 0, truncated: false };

  try {
    const hasHead = await runGit(real, ['rev-parse', '--verify', 'HEAD']).then(() => true).catch(() => false);
    let rawDiff = '';
    if (hasHead) {
      rawDiff = await runGit(real, ['diff', 'HEAD', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'], { maxBuffer: 4 * 1024 * 1024 }).catch(() => '');
    } else {
      const staged = await runGit(real, ['diff', '--cached', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'], { maxBuffer: 2 * 1024 * 1024 }).catch(() => '');
      const unstaged = await runGit(real, ['diff', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'], { maxBuffer: 2 * 1024 * 1024 }).catch(() => '');
      rawDiff = [staged, unstaged].filter(Boolean).join('\n');
    }
    return parseUnifiedDiff(rawDiff, maxBytes);
  } catch {
    return { files: [], totalAdded: 0, totalRemoved: 0, truncated: false };
  }
}

export function clearGitCache() {
  statusCache.clear();
  prCache.clear();
}
