import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ID_RE = /^[0-9a-fA-F-]{8,64}$/;
export const DEMO_ID_RE = /^demo-[a-zA-Z0-9_-]{1,59}$/;
export const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const fileCache = new Map();

/**
 * Validates a conversation/thread identifier.
 */
export function isValidThreadId(id, { allowDemo = false } = {}) {
  if (typeof id !== 'string' || !id) return false;
  return ID_RE.test(id) || (allowDemo && DEMO_ID_RE.test(id));
}

/**
 * Validates a project identifier against safe characters (no path traversal).
 */
export function isValidProjectId(id) {
  return typeof id === 'string' && PROJECT_ID_RE.test(id);
}

/**
 * Lists directory entries without throwing if the directory does not exist.
 */
export function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Returns mtimeMs and size for a path, or size -1 when missing.
 */
export function statOf(filePath) {
  try {
    const s = statSync(filePath);
    return { mtime: s.mtimeMs, size: s.size, isDir: s.isDirectory(), isFile: s.isFile() };
  } catch {
    return { mtime: 0, size: -1, isDir: false, isFile: false };
  }
}

/**
 * Reads a UTF-8 file with mtime+size caching and an optional byte cap.
 */
export function readCached(filePath, maxBytes = Infinity) {
  const s = statOf(filePath);
  if (s.size < 0 || !s.isFile) return { text: null, mtime: 0, size: -1, tooLarge: false };
  if (s.size > maxBytes) return { text: null, tooLarge: true, mtime: s.mtime, size: s.size };
  const key = `${s.mtime}:${s.size}`;
  const hit = fileCache.get(filePath);
  if (hit && hit.key === key) return { text: hit.text, tooLarge: false, mtime: s.mtime, size: s.size };
  try {
    const text = readFileSync(filePath, 'utf-8');
    if (fileCache.size > 1000) fileCache.clear();
    fileCache.set(filePath, { key, text });
    return { text, tooLarge: false, mtime: s.mtime, size: s.size };
  } catch {
    return { text: null, tooLarge: false, mtime: 0, size: -1 };
  }
}

/**
 * Canonicalizes a target file path and verifies it is a regular file strictly inside root.
 */
export function canonicalFile(target, root) {
  if (typeof target !== 'string' || !target || target.length > 4096 || !isAbsolute(target)) return null;
  if (/[%\0\\]/.test(target)) return null;
  if (target.split('/').some((seg) => seg === '.' || seg === '..')) return null;
  try {
    const rootReal = realpathSync(root);
    const prefix = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
    const real = realpathSync(target);
    return (real === rootReal || real.startsWith(prefix)) && statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Parses JSONC (comments and trailing commas) safely without altering string literals.
 */
export function parseJsonc(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let stripped = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inStr) {
      stripped += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      stripped += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      stripped += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    stripped += ch;
  }
  const noTrailing = stripped.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(noTrailing);
  } catch {
    return null;
  }
}

/**
 * Converts a file:// URI or absolute path into a normalized filesystem path.
 */
export function uriToPath(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return '';
  const trimmed = uri.trim();
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return '';
    }
  }
  return isAbsolute(trimmed) ? resolve(trimmed) : '';
}

function dedupeDirs(dirs) {
  const out = [];
  const seen = new Set();
  for (const d of dirs) {
    if (typeof d !== 'string' || !d) continue;
    let canon = resolve(d);
    try {
      canon = realpathSync(canon);
    } catch {
      // Keep resolved path when dir does not exist yet.
    }
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(d);
  }
  return out;
}

function findSidecarExecutableAppData(execDataDir) {
  if (!execDataDir) return null;
  for (let d = execDataDir; d !== dirname(d); d = dirname(d)) {
    if (basename(d) !== 'sidecar_data') continue;
    const appData = dirname(d);
    return existsSync(join(appData, 'brain')) ? appData : null;
  }
  return null;
}

/**
 * Resolves Antigravity discovery directories with deterministic test overrides.
 */
export function resolvePaths(options = {}) {
  const homeDir = options.homeDir || homedir();
  const hasConfigOverride = Boolean(options.configDir);
  const configDir = options.configDir || join(homeDir, '.gemini', 'config');
  const projectsDir = options.projectsDir || join(configDir, 'projects');

  let appDataDirs;
  if (options.appDataDirs !== undefined) {
    const arr = Array.isArray(options.appDataDirs) ? options.appDataDirs : [options.appDataDirs];
    appDataDirs = dedupeDirs(arr.filter(Boolean));
  } else {
    const execAppData = findSidecarExecutableAppData(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR);
    if (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR) {
      appDataDirs = execAppData ? [execAppData] : [];
    } else {
      const candidates = [];
      if (process.env.ANTIGRAVITY_APP_DATA_DIR && existsSync(join(process.env.ANTIGRAVITY_APP_DATA_DIR, 'brain'))) {
        candidates.push(process.env.ANTIGRAVITY_APP_DATA_DIR);
      }
      const geminiRoot = join(homeDir, '.gemini');
      for (const name of safeReaddir(geminiRoot).sort()) {
        const dir = join(geminiRoot, name);
        if (existsSync(join(dir, 'brain'))) candidates.push(dir);
      }
      appDataDirs = dedupeDirs(candidates);
    }
  }

  let pluginsDirs;
  if (options.pluginsDir !== undefined) {
    const arr = Array.isArray(options.pluginsDir) ? options.pluginsDir : [options.pluginsDir];
    pluginsDirs = [...arr];
    if (options.builtinPluginsDir) pluginsDirs.push(options.builtinPluginsDir);
  } else if (hasConfigOverride) {
    pluginsDirs = [join(configDir, 'plugins')];
    if (options.builtinPluginsDir) pluginsDirs.push(options.builtinPluginsDir);
  } else {
    pluginsDirs = [
      join(configDir, 'plugins'),
      options.builtinPluginsDir || join(homeDir, '.gemini', 'antigravity', 'builtin', 'plugins'),
    ];
  }
  pluginsDirs = dedupeDirs(pluginsDirs);

  let sidecarDirs;
  if (options.sidecarDirs !== undefined) {
    const arr = Array.isArray(options.sidecarDirs) ? options.sidecarDirs : [options.sidecarDirs];
    sidecarDirs = dedupeDirs(arr);
  } else if (hasConfigOverride) {
    sidecarDirs = dedupeDirs([join(configDir, 'sidecars')]);
  } else {
    sidecarDirs = dedupeDirs([
      join(configDir, 'sidecars'),
      join(homeDir, '.gemini', 'jetski', 'sidecars'),
    ]);
  }

  return { homeDir, configDir, projectsDir, appDataDirs, pluginsDirs, sidecarDirs };
}

function extractProjectPaths(raw) {
  const paths = [];
  const resources = Array.isArray(raw?.projectResources?.resources) ? raw.projectResources.resources : [];
  let defaultBranch = '';
  for (const r of resources) {
    if (!r || typeof r !== 'object') continue;
    const uri = r.gitFolder?.folderUri || r.folderUri || r.uri || '';
    if (r.gitFolder?.defaultBranch && !defaultBranch) {
      defaultBranch = String(r.gitFolder.defaultBranch);
    }
    const p = uriToPath(uri);
    if (p) paths.push(p);
  }
  for (const fallback of [raw?.workspacePath, raw?.path, raw?.folderPath]) {
    if (typeof fallback === 'string' && isAbsolute(fallback)) {
      paths.push(resolve(fallback));
    }
  }
  return { paths: [...new Set(paths)], defaultBranch };
}

/**
 * Discovers workspace projects from ~/.gemini/config/projects/*.json, skipping sidecar pseudo-projects.
 */
export function discoverProjects(options = {}) {
  const { projectsDir } = resolvePaths(options);
  const files = safeReaddir(projectsDir).filter((f) => f.endsWith('.json')).sort();
  const projects = [];
  const seen = new Set();

  for (const file of files) {
    const fullPath = join(projectsDir, file);
    const { text } = readCached(fullPath, 256 * 1024);
    if (!text) continue;
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    if (!raw || typeof raw !== 'object' || Boolean(raw.sidecar)) continue;
    const { paths, defaultBranch } = extractProjectPaths(raw);
    const primaryPath = paths[0] || '';
    const fallbackId = file.replace(/\.json$/i, '');
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId;
    if (!isValidProjectId(id) || seen.has(id)) continue;
    seen.add(id);
    const name = typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : (primaryPath ? basename(primaryPath) : id);
    projects.push({
      id,
      name,
      path: primaryPath,
      paths,
      defaultBranch,
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
      configFile: fullPath,
    });
  }

  return projects;
}

/**
 * Reads optional local metadata or heading title inside a brain conversation directory.
 */
export function readConversationLocalMetadata(brainDir) {
  const result = { title: '', projectId: '', workspaceUris: [], workspacePaths: [], model: '' };
  for (const rel of ['metadata.json', join('.system_generated', 'metadata.json')]) {
    const f = readCached(join(brainDir, rel), 64 * 1024);
    if (!f.text) continue;
    try {
      const md = JSON.parse(f.text);
      if (!md || typeof md !== 'object') continue;
      if (!result.title) {
        result.title = String(md.title || md.summary || md.name || md.conversation?.title || '').trim();
      }
      if (!result.projectId && typeof md.projectId === 'string') {
        result.projectId = md.projectId.trim();
      }
      if (!result.model && typeof md.model === 'string') {
        result.model = md.model.trim();
      }
      const uris = []
        .concat(Array.isArray(md.workspace_uris) ? md.workspace_uris : [])
        .concat(Array.isArray(md.workspaceUris) ? md.workspaceUris : [])
        .concat(typeof md.workspaceUri === 'string' ? [md.workspaceUri] : [])
        .concat(typeof md.workspacePath === 'string' ? [md.workspacePath] : []);
      for (const u of uris) {
        if (typeof u !== 'string') continue;
        result.workspaceUris.push(u);
        const p = uriToPath(u);
        if (p) result.workspacePaths.push(p);
      }
    } catch {
      // Ignore invalid optional metadata files.
    }
  }

  if (!result.title) {
    for (const mdName of ['task.md', 'implementation_plan.md']) {
      const f = readCached(join(brainDir, mdName), 32 * 1024);
      if (!f.text) continue;
      const m = f.text.match(/^\s*#\s+(.+?)\s*$/m);
      if (m && m[1]) {
        result.title = m[1].trim().slice(0, 96);
        break;
      }
    }
  }
  return result;
}

/**
 * Discovers brain conversations across all configured appData directories.
 */
export function discoverConversations(options = {}) {
  const { appDataDirs } = resolvePaths(options);
  const convs = [];
  const seen = new Set();

  for (const appData of appDataDirs) {
    const brainRoot = join(appData, 'brain');
    for (const id of safeReaddir(brainRoot)) {
      if (!ID_RE.test(id) || seen.has(id)) continue;
      const brainDir = join(brainRoot, id);
      const dirStat = statOf(brainDir);
      if (!dirStat.isDir) continue;
      seen.add(id);

      const transcriptPath = join(brainDir, '.system_generated', 'logs', 'transcript.jsonl');
      const swarmDir = join(brainDir, '.system_generated', 'swarm');
      const hasTranscript = statOf(transcriptPath).isFile;
      const hasSwarm = statOf(join(swarmDir, 'members.json')).isFile;
      const localMeta = readConversationLocalMetadata(brainDir);

      convs.push({
        id,
        appData,
        brainDir,
        transcriptPath,
        swarmDir,
        hasTranscript,
        hasSwarm,
        mtime: dirStat.mtime,
        localMeta,
      });
    }
  }

  convs.sort((a, b) => b.mtime - a.mtime);
  return convs;
}

/**
 * Discovers installed user and built-in plugins and their sidecars/skills.
 */
export function discoverPlugins(options = {}) {
  const { configDir, pluginsDirs } = resolvePaths(options);
  let userPluginPrefs = {};
  const cfgFile = readCached(join(configDir, 'config.json'), 128 * 1024);
  if (cfgFile.text) {
    try {
      const cfg = JSON.parse(cfgFile.text);
      if (cfg?.plugins && typeof cfg.plugins === 'object') userPluginPrefs = cfg.plugins;
    } catch {
      // Ignore malformed config.json.
    }
  }

  const plugins = [];
  const seenNames = new Set();

  for (const rootDir of pluginsDirs) {
    const isBuiltinRoot = rootDir.includes(`${sep}builtin${sep}`) || rootDir.endsWith(`${sep}builtin`);
    for (const dir of safeReaddir(rootDir).sort()) {
      const pluginPath = join(rootDir, dir);
      const manifestFile = readCached(join(pluginPath, 'plugin.json'), 64 * 1024);
      if (!manifestFile.text) continue;
      const manifest = parseJsonc(manifestFile.text);
      if (!manifest || typeof manifest !== 'object') continue;

      const name = typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : dir;
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      const pref = userPluginPrefs[dir];
      const enabled = typeof pref?.enabled === 'boolean' ? pref.enabled : !Boolean(manifest.disabled);

      const skills = [];
      for (const skillDir of safeReaddir(join(pluginPath, 'skills')).sort()) {
        if (statOf(join(pluginPath, 'skills', skillDir, 'SKILL.md')).isFile) {
          skills.push(skillDir);
        }
      }

      const sidecars = [];
      for (const scDir of safeReaddir(join(pluginPath, 'sidecars')).sort()) {
        const scFile = readCached(join(pluginPath, 'sidecars', scDir, 'sidecar.json'), 64 * 1024);
        if (!scFile.text) continue;
        try {
          const sc = JSON.parse(scFile.text);
          sidecars.push({
            id: scDir,
            displayName: String(sc.display_name || sc.ui_config?.display_name || scDir),
            hasWebUi: Boolean(sc.has_web_ui),
            builtin: String(sc.builtin || ''),
            path: join(pluginPath, 'sidecars', scDir),
          });
        } catch {
          // Ignore malformed sidecar.json.
        }
      }

      plugins.push({
        id: dir,
        dir,
        name,
        displayName: String(manifest.displayName || name),
        description: String(manifest.description || ''),
        version: String(manifest.version || ''),
        builtin: isBuiltinRoot,
        enabled,
        path: pluginPath,
        sidecars,
        skills,
      });
    }
  }

  return plugins;
}
