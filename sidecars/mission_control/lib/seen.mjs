import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { statOf } from './discovery.mjs';

const MEMORY_KEY = '__memory__';
const storeCache = new Map(); // storeKey -> { mtime, size, map }

export function resolveSeenStorePath(options = {}) {
  if (Object.hasOwn(options, 'seenStorePath')) {
    return options.seenStorePath || null;
  }
  const execDataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (execDataDir) {
    return join(execDataDir, 'seen_threads.json');
  }
  return null;
}

function loadStore(storePath) {
  const key = storePath || MEMORY_KEY;
  if (!storePath) {
    let entry = storeCache.get(key);
    if (!entry) {
      entry = { mtime: 0, size: 0, map: {} };
      storeCache.set(key, entry);
    }
    return entry.map;
  }

  const st = statOf(storePath);
  const hit = storeCache.get(key);
  if (st.size < 0 || !st.isFile) {
    if (hit && hit.mtime === 0 && hit.size === -1) return hit.map;
    const empty = { mtime: 0, size: -1, map: {} };
    storeCache.set(key, empty);
    return empty.map;
  }

  if (hit && hit.mtime === st.mtime && hit.size === st.size) {
    return hit.map;
  }

  let parsed = {};
  try {
    const raw = JSON.parse(readFileSync(storePath, 'utf-8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) {
        const ts = Number(v);
        if (typeof k === 'string' && k && Number.isFinite(ts) && ts > 0) {
          parsed[k] = ts;
        }
      }
    }
  } catch {
    parsed = {};
  }

  storeCache.set(key, { mtime: st.mtime, size: st.size, map: parsed });
  return parsed;
}

function persistStore(storePath, map) {
  if (!storePath) return false;
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    const tmpPath = `${storePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify(map, null, 2), 'utf-8');
    renameSync(tmpPath, storePath);
    const st = statOf(storePath);
    storeCache.set(storePath, { mtime: st.mtime, size: st.size, map });
    return true;
  } catch {
    return false;
  }
}

export function getSeenMap(options = {}) {
  const storePath = resolveSeenStorePath(options);
  return { ...loadStore(storePath) };
}

export function markThreadSeen(threadId, seenAtMs = Date.now(), options = {}) {
  const id = typeof threadId === 'string' ? threadId.trim() : '';
  const ts = Number.isFinite(Number(seenAtMs)) && Number(seenAtMs) > 0 ? Number(seenAtMs) : Date.now();
  const storePath = resolveSeenStorePath(options);
  const key = storePath || MEMORY_KEY;
  const current = { ...loadStore(storePath) };
  const prev = Number(current[id]) || 0;
  const nextTs = Math.max(prev, ts);

  if (id) current[id] = nextTs;
  storeCache.set(key, { mtime: storeCache.get(key)?.mtime || 0, size: storeCache.get(key)?.size || 0, map: current });

  const persisted = id && nextTs !== prev ? persistStore(storePath, current) : Boolean(storePath);
  return { threadId: id, seenAtMs: nextTs, persisted };
}

export function isThreadUnseen(threadId, updatedAtMs, seenMap = {}) {
  const ts = Number(updatedAtMs) || 0;
  if (ts <= 0) return false;
  const seenAt = Number(seenMap?.[threadId]) || 0;
  return ts > seenAt;
}

export function clearSeenCache() {
  storeCache.clear();
}
