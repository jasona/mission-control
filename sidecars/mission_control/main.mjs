import { readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as defaultActions from './lib/actions.mjs';
import { buildDashboardSnapshot, getThreadDetail } from './lib/aggregator.mjs';
import { approveDemo, createDemoThread, markDemoSeen, replyDemo } from './lib/demo.mjs';
import { canonicalFile, isValidProjectId, isValidThreadId } from './lib/discovery.mjs';
import { markThreadSeen } from './lib/seen.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = join(__dirname, 'public');
const MAX_BODY_BYTES = 1024 * 1024;

export const STATIC_ROUTES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'application/javascript; charset=utf-8'],
  '/views/overview.js': ['views/overview.js', 'application/javascript; charset=utf-8'],
  '/views/board.js': ['views/board.js', 'application/javascript; charset=utf-8'],
  '/views/timeline.js': ['views/timeline.js', 'application/javascript; charset=utf-8'],
  '/views/graph.js': ['views/graph.js', 'application/javascript; charset=utf-8'],
  '/views/inspector.js': ['views/inspector.js', 'application/javascript; charset=utf-8'],
  '/components/modal.js': ['components/modal.js', 'application/javascript; charset=utf-8'],
  '/components/icons.js': ['components/icons.js', 'application/javascript; charset=utf-8'],
};

const STANDALONE_PRELOAD_JS = `(() => {
  const root = document.documentElement;
  const tokens = {
    '--background': '#0d0e11',
    '--foreground': '#f3f4f6',
    '--card': '#14161b',
    '--card-border': 'rgba(255, 255, 255, 0.08)',
    '--secondary': '#1a1d24',
    '--secondary-foreground': '#cbd5e1',
    '--muted': '#16181e',
    '--muted-foreground': '#8b919d',
    '--border': 'rgba(255, 255, 255, 0.08)',
    '--primary': '#ffffff',
    '--primary-foreground': '#0d0e11',
    '--error': '#ef4444',
    '--placeholder': '#6b7280'
  };
  for (const [k, v] of Object.entries(tokens)) {
    if (!root.style.getPropertyValue(k)) root.style.setProperty(k, v);
  }
  root.dataset.theme = 'dark';
  const params = new URLSearchParams(location.search);
  window.sidecar = {
    conversationId: params.get('conversationId') || '',
    fetch: (u, o) => fetch(u, o),
    ui: {},
    agent: {}
  };
})();
`;

function jsonReply(status, payload) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  };
}

function isDemoRequest(data, defaultDemo) {
  const raw = data?.demo;
  if (raw === true || raw === '1' || raw === 'true') return true;
  if (raw === false || raw === '0' || raw === 'false') return false;
  return Boolean(defaultDemo);
}

/**
 * Parses CLI flags (--standalone, --demo, --port) and environment fallbacks.
 */
export function parseCliArgs(argv = process.argv.slice(2), env = process.env) {
  let standalone = env.SIDECAR_STANDALONE === '1';
  let demo = env.SIDECAR_DEMO === '1';
  let port = env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 4321;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--standalone') standalone = true;
    else if (arg === '--demo') demo = true;
    else if (arg === '--port' && i + 1 < argv.length) {
      port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice(7));
    }
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) port = 4321;
  return { standalone, demo, port };
}

/**
 * Creates framework-agnostic route handlers shared by SidecarApp and standalone HTTP mode.
 */
export function createHandlers(options = {}) {
  const publicDir = resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const actions = options.actions || defaultActions;
  const defaultDemo = Boolean(options.demo);

  function discoveryOpts(data = {}) {
    return {
      appDataDirs: options.appDataDirs,
      configDir: options.configDir,
      projectsDir: options.projectsDir,
      sidecarDirs: options.sidecarDirs,
      pluginsDir: options.pluginsDir,
      builtinPluginsDir: options.builtinPluginsDir,
      homeDir: options.homeDir,
      gitCacheTtlMs: options.gitCacheTtlMs,
      includePr: options.includePr,
      useAgentApi: options.useAgentApi,
      seenStorePath: options.seenStorePath,
      demo: isDemoRequest(data, defaultDemo),
      etag: typeof data?.etag === 'string' ? data.etag : '',
      conversationId: typeof data?.conversationId === 'string' ? data.conversationId : '',
    };
  }

  function readStaticAsset(pathname) {
    const entry = STATIC_ROUTES[pathname];
    if (!entry) return null;
    const [relFile, contentType] = entry;
    const target = canonicalFile(join(publicDir, relFile), publicDir);
    if (!target) {
      return { status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' };
    }
    try {
      const isText = contentType.startsWith('text/') || contentType.includes('javascript') || contentType.includes('json');
      return { status: 200, contentType, body: isText ? readFileSync(target, 'utf-8') : readFileSync(target) };
    } catch {
      return { status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' };
    }
  }

  function getPreloadJs() {
    return {
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: STANDALONE_PRELOAD_JS,
    };
  }

  async function handleDashboard(data = {}) {
    const opts = discoveryOpts(data);
    const snap = await buildDashboardSnapshot(opts);
    return jsonReply(200, snap);
  }

  async function handleThread(data = {}) {
    const opts = discoveryOpts(data);
    const id = typeof data?.id === 'string' ? data.id.trim() : '';
    if (!id || !isValidThreadId(id, { allowDemo: opts.demo })) {
      return jsonReply(400, { ok: false, error: 'Invalid or missing thread id', code: 'INVALID_THREAD_ID' });
    }
    const detail = await getThreadDetail(id, opts);
    if (detail?.errorStatus) {
      return jsonReply(detail.errorStatus, {
        ok: false,
        error: detail.error || 'Request failed',
        code: detail.code || 'ERROR',
      });
    }
    return jsonReply(200, detail);
  }

  async function handleReply(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return jsonReply(400, { ok: false, error: 'Invalid request payload', code: 'INVALID_BODY' });
    }
    const demo = isDemoRequest(data, defaultDemo);
    const threadId = typeof data.threadId === 'string' ? data.threadId.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const model = typeof data.model === 'string' ? data.model.trim() : '';
    const mode = typeof data.mode === 'string' ? data.mode.trim() : '';

    if (!threadId || !isValidThreadId(threadId, { allowDemo: demo })) {
      return jsonReply(400, { ok: false, error: 'Invalid or missing threadId', code: 'INVALID_THREAD_ID' });
    }
    if (!message) {
      return jsonReply(400, { ok: false, error: 'Message is required', code: 'MISSING_MESSAGE' });
    }

    if (demo) {
      const res = replyDemo({ threadId, message, model, mode });
      if (!res) return jsonReply(404, { ok: false, error: 'Thread not found', code: 'NOT_FOUND' });
      return jsonReply(200, res);
    }

    try {
      const res = await actions.sendMessage(threadId, message);
      return jsonReply(200, { ok: true, threadId, sentAt: res.sentAt, mode: 'live' });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 502;
      return jsonReply(status, {
        ok: false,
        error: err?.message || 'Failed to send reply',
        code: err?.code || 'SEND_FAILED',
      });
    }
  }

  async function handleApprove(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return jsonReply(400, { ok: false, error: 'Invalid request payload', code: 'INVALID_BODY' });
    }
    const demo = isDemoRequest(data, defaultDemo);
    const threadId = typeof data.threadId === 'string' ? data.threadId.trim() : '';
    const attentionId = typeof data.attentionId === 'string' ? data.attentionId.trim().slice(0, 128) : '';
    const note = typeof data.note === 'string' ? data.note.trim() : '';

    if (!threadId || !isValidThreadId(threadId, { allowDemo: demo })) {
      return jsonReply(400, { ok: false, error: 'Invalid or missing threadId', code: 'INVALID_THREAD_ID' });
    }

    if (demo) {
      const res = approveDemo({ attentionId, threadId, note });
      if (!res) return jsonReply(404, { ok: false, error: 'Thread not found', code: 'NOT_FOUND' });
      return jsonReply(200, res);
    }

    const approvalMsg = note
      ? `Approved: ${note}`
      : 'Approved from Mission Control. Please proceed.';
    try {
      const res = await actions.sendMessage(threadId, approvalMsg, { title: 'Approval' });
      return jsonReply(200, {
        ok: true,
        attentionId: attentionId || null,
        threadId,
        approvedAt: res.sentAt,
        mode: 'live',
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 502;
      return jsonReply(status, {
        ok: false,
        error: err?.message || 'Failed to send approval',
        code: err?.code || 'APPROVE_FAILED',
      });
    }
  }

  async function handleNewThread(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return jsonReply(400, { ok: false, error: 'Invalid request payload', code: 'INVALID_BODY' });
    }
    const demo = isDemoRequest(data, defaultDemo);
    const projectId = typeof data.projectId === 'string' ? data.projectId.trim() : '';
    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const model = typeof data.model === 'string' ? data.model.trim() : '';

    if (!projectId || !isValidProjectId(projectId)) {
      return jsonReply(400, { ok: false, error: 'Invalid or missing projectId', code: 'INVALID_PROJECT_ID' });
    }
    if (!prompt) {
      return jsonReply(400, { ok: false, error: 'Prompt is required', code: 'MISSING_PROMPT' });
    }

    if (demo) {
      const res = createDemoThread({ projectId, title, prompt, model });
      if (!res) return jsonReply(404, { ok: false, error: 'Project not found', code: 'NOT_FOUND' });
      return jsonReply(200, res);
    }

    try {
      const res = await actions.newConversation({ projectId, title, prompt, model });
      return jsonReply(200, {
        ok: true,
        threadId: res.threadId,
        projectId,
        title: title || prompt.split('\n')[0].slice(0, 64),
        mode: 'live',
      });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 502;
      return jsonReply(status, {
        ok: false,
        error: err?.message || 'Failed to start thread',
        code: err?.code || 'NEW_THREAD_FAILED',
      });
    }
  }

  async function handleMarkSeen(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return jsonReply(400, { ok: false, error: 'Invalid request payload', code: 'INVALID_BODY' });
    }
    const demo = isDemoRequest(data, defaultDemo);
    const threadId = typeof data.threadId === 'string' ? data.threadId.trim() : '';
    if (!threadId || !isValidThreadId(threadId, { allowDemo: demo })) {
      return jsonReply(400, { ok: false, error: 'Invalid or missing threadId', code: 'INVALID_THREAD_ID' });
    }

    if (demo) {
      const res = markDemoSeen({ threadId });
      if (!res) return jsonReply(404, { ok: false, error: 'Thread not found', code: 'NOT_FOUND' });
      return jsonReply(200, res);
    }

    const opts = discoveryOpts(data);
    const seenAtMs = Number.isFinite(Number(data.seenAtMs)) && Number(data.seenAtMs) > 0
      ? Number(data.seenAtMs)
      : Date.now();
    const res = markThreadSeen(threadId, seenAtMs, opts);
    return jsonReply(200, {
      ok: true,
      threadId: res.threadId,
      seenAtMs: res.seenAtMs,
      mode: 'live',
    });
  }

  return {
    options,
    readStaticAsset,
    getPreloadJs,
    handleDashboard,
    handleThread,
    handleReply,
    handleApprove,
    handleNewThread,
    handleMarkSeen,
  };
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        req.pause();
        rejectBody(Object.assign(new Error('Request body exceeds 1MB limit'), { status: 413, code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) return resolveBody({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return rejectBody(Object.assign(new Error('JSON body must be an object'), { status: 400, code: 'INVALID_JSON' }));
        }
        resolveBody(parsed);
      } catch {
        rejectBody(Object.assign(new Error('Malformed JSON request body'), { status: 400, code: 'INVALID_JSON' }));
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      rejectBody(Object.assign(new Error(err?.message || 'Stream read error'), { status: 400, code: 'READ_ERROR' }));
    });
  });
}

function writeHttpResult(res, result, { closeSocket = false } = {}) {
  const status = result?.status || 200;
  const headers = { 'Content-Type': result?.contentType || 'application/json; charset=utf-8' };
  if (closeSocket) headers.Connection = 'close';
  res.writeHead(status, headers);
  res.end(result?.body ?? '', () => {
    if (closeSocket) res.socket?.destroy();
  });
}

/**
 * Starts the standalone HTTP server (loopback only) with /preload.js stub.
 */
export async function startStandaloneServer(options = {}) {
  const port = options.port ?? 4321;
  const host = options.host || '127.0.0.1';
  const handlers = createHandlers(options);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}`);
      const pathname = url.pathname;
      const method = (req.method || 'GET').toUpperCase();

      if (method === 'GET' && pathname === '/preload.js') {
        return writeHttpResult(res, handlers.getPreloadJs());
      }

      if (method === 'GET' && Object.hasOwn(STATIC_ROUTES, pathname)) {
        const asset = handlers.readStaticAsset(pathname);
        return writeHttpResult(res, asset || jsonReply(404, { ok: false, error: 'Not found' }));
      }

      const queryData = {};
      for (const [k, v] of url.searchParams.entries()) {
        queryData[k] = v;
      }

      if (pathname === '/api/dashboard') {
        if (method !== 'GET') return writeHttpResult(res, jsonReply(405, { ok: false, error: 'Method not allowed' }));
        return writeHttpResult(res, await handlers.handleDashboard(queryData));
      }

      if (pathname === '/api/thread') {
        if (method !== 'GET') return writeHttpResult(res, jsonReply(405, { ok: false, error: 'Method not allowed' }));
        return writeHttpResult(res, await handlers.handleThread(queryData));
      }

      if (pathname === '/api/reply' || pathname === '/api/approve' || pathname === '/api/threads/new' || pathname === '/api/seen') {
        if (method !== 'POST') return writeHttpResult(res, jsonReply(405, { ok: false, error: 'Method not allowed' }));
        let bodyData;
        try {
          bodyData = await readJsonBody(req);
        } catch (err) {
          return writeHttpResult(
            res,
            jsonReply(err.status || 400, { ok: false, error: err.message, code: err.code || 'INVALID_BODY' }),
            { closeSocket: err.status === 413 }
          );
        }
        const merged = { ...queryData, ...bodyData };
        if (pathname === '/api/reply') return writeHttpResult(res, await handlers.handleReply(merged));
        if (pathname === '/api/approve') return writeHttpResult(res, await handlers.handleApprove(merged));
        if (pathname === '/api/seen') return writeHttpResult(res, await handlers.handleMarkSeen(merged));
        return writeHttpResult(res, await handlers.handleNewThread(merged));
      }

      return writeHttpResult(res, jsonReply(404, { ok: false, error: 'Not found' }));
    } catch (err) {
      return writeHttpResult(res, jsonReply(500, { ok: false, error: err?.message || 'Internal server error' }));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const baseUrl = `http://${host}:${actualPort}`;
  const close = () => new Promise((resolveClose, rejectClose) => {
    server.close((err) => (err ? rejectClose(err) : resolveClose()));
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });

  return { server, port: actualPort, host, url: baseUrl, handlers, close };
}

function toSdkResponse(sdk, result) {
  if (sdk?.Response) {
    return new sdk.Response(result.body, {
      status: result.status || 200,
      contentType: result.contentType || 'application/json',
    });
  }
  return result;
}

async function main() {
  const cli = parseCliArgs();

  if (!cli.standalone) {
    let sdk = null;
    try {
      sdk = await import('sidecar_sdk');
    } catch {
      sdk = null;
    }

    if (sdk?.SidecarApp) {
      let app = null;
      try {
        app = new sdk.SidecarApp();
      } catch {
        app = null;
      }

      if (app) {
        const handlers = createHandlers({
          demo: cli.demo,
          conversationId: app.config?.conversationId || '',
        });

        app.page('/', () => {
          const res = handlers.readStaticAsset('/');
          return res ? res.body.toString('utf-8') : '';
        });

        for (const route of Object.keys(STATIC_ROUTES)) {
          if (route === '/') continue;
          app.api(route, () => {
            const res = handlers.readStaticAsset(route);
            return toSdkResponse(sdk, res || { status: 404, contentType: 'text/plain', body: 'Not found' });
          }, 'GET');
        }

        app.api('/api/dashboard', async (data) => {
          const conv = data?.conversationId || app.config?.conversationId || '';
          return toSdkResponse(sdk, await handlers.handleDashboard({ ...data, conversationId: conv }));
        }, 'GET');
        app.api('/api/thread', async (data) => toSdkResponse(sdk, await handlers.handleThread(data)), 'GET');
        app.api('/api/reply', async (data) => toSdkResponse(sdk, await handlers.handleReply(data)), 'POST');
        app.api('/api/approve', async (data) => toSdkResponse(sdk, await handlers.handleApprove(data)), 'POST');
        app.api('/api/threads/new', async (data) => toSdkResponse(sdk, await handlers.handleNewThread(data)), 'POST');
        app.api('/api/seen', async (data) => toSdkResponse(sdk, await handlers.handleMarkSeen(data)), 'POST');

        app.run();
        return;
      }
    }
  }

  const srv = await startStandaloneServer({ port: cli.port, demo: cli.demo });
  console.log(`[mission_control] standalone server listening at ${srv.url} (mode=${cli.demo ? 'demo' : 'live'})`);
}

const isEntrypoint = Boolean(process.argv[1]) && (
  import.meta.url === pathToFileURL(process.argv[1]).href ||
  (() => {
    try {
      return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
      return false;
    }
  })()
);

if (isEntrypoint) {
  main().catch((err) => {
    console.error('[mission_control] fatal error:', err);
    process.exitCode = 1;
  });
}
