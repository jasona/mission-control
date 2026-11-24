import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isValidProjectId, isValidThreadId } from './discovery.mjs';

const execFileAsync = promisify(execFile);

const ACTION_TIMEOUT_MS = 10000;
const METADATA_TIMEOUT_MS = 1500;
const LS_BACKOFF_MS = 30000;
const METADATA_TTL_MS = 60000;

export class ActionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ActionError';
    this.status = status;
    this.code = code;
  }
}

const metadataCache = new Map();
const metadataInFlight = new Map();
let lsUnavailableUntil = 0;

function isLsUnavailableError(text, err) {
  if (err?.code === 'ENOENT' || err?.code === 'ETIMEDOUT' || err?.killed) return true;
  return /connection refused|Unavailable|connect:|dial tcp|no such file|ENOENT/i.test(String(text || ''));
}

async function runAgentApi(args, { projectId = '', timeout = ACTION_TIMEOUT_MS } = {}) {
  const exe = process.env.ANTIGRAVITY_AGENTAPI_EXE;
  const file = exe || 'agentapi';
  const execArgs = exe ? ['agentapi', ...args] : args;
  const env = { ...process.env };
  if (projectId) env.ANTIGRAVITY_PROJECT_ID = projectId;

  let stdout = '';
  let stderr = '';
  try {
    const res = await execFileAsync(file, execArgs, {
      encoding: 'utf-8',
      env,
      timeout,
      maxBuffer: 512 * 1024,
    });
    stdout = res.stdout || '';
    stderr = res.stderr || '';
  } catch (err) {
    const combined = `${err?.stdout || ''}\n${err?.stderr || ''}\n${err?.message || ''}`;
    if (isLsUnavailableError(combined, err)) {
      lsUnavailableUntil = Date.now() + LS_BACKOFF_MS;
      throw new ActionError(503, 'LS_UNAVAILABLE', 'Antigravity language server is unavailable');
    }
    throw new ActionError(502, 'AGENTAPI_FAILED', (err?.stderr || err?.message || 'agentapi command failed').trim());
  }

  let parsed = {};
  if (stdout.trim()) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { raw: stdout.trim() };
    }
  }

  if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
    if (isLsUnavailableError(parsed.error, null)) {
      lsUnavailableUntil = Date.now() + LS_BACKOFF_MS;
      throw new ActionError(503, 'LS_UNAVAILABLE', `Antigravity language server unavailable: ${parsed.error}`);
    }
    throw new ActionError(502, 'AGENTAPI_ERROR', parsed.error);
  }

  if (stderr && isLsUnavailableError(stderr, null) && !stdout.trim()) {
    lsUnavailableUntil = Date.now() + LS_BACKOFF_MS;
    throw new ActionError(503, 'LS_UNAVAILABLE', 'Antigravity language server is unavailable');
  }

  lsUnavailableUntil = 0;
  return parsed;
}

/**
 * Sends a message or steering reply to an existing Antigravity conversation.
 */
export async function sendMessage(threadId, message, { title = '', projectId = '' } = {}) {
  if (!isValidThreadId(threadId)) {
    throw new ActionError(400, 'INVALID_THREAD_ID', 'Invalid threadId');
  }
  if (typeof message !== 'string' || !message.trim()) {
    throw new ActionError(400, 'INVALID_MESSAGE', 'Message must be a non-empty string');
  }
  const args = ['send-message'];
  if (typeof title === 'string' && title.trim()) {
    args.push('--title', title.trim().slice(0, 120));
  }
  args.push(threadId, message);
  const result = await runAgentApi(args, { projectId });
  return {
    ok: true,
    threadId,
    sentAt: new Date().toISOString(),
    result,
  };
}

/**
 * Starts a new Antigravity conversation scoped to projectId when provided.
 */
export async function newConversation({ projectId = '', title = '', prompt = '', model = '' } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new ActionError(400, 'INVALID_PROMPT', 'Prompt must be a non-empty string');
  }
  if (projectId && !isValidProjectId(projectId)) {
    throw new ActionError(400, 'INVALID_PROJECT_ID', 'Invalid projectId');
  }
  const args = ['new-conversation'];
  if (typeof model === 'string' && model.trim() && /^[a-zA-Z0-9._-]{1,64}$/.test(model.trim())) {
    args.push('--model', model.trim());
  }
  if (typeof title === 'string' && title.trim()) {
    args.push('--title', title.trim().slice(0, 120));
  }
  args.push('--', prompt.trim());

  const result = await runAgentApi(args, { projectId });
  const convId = String(
    result?.conversationId ||
    result?.conversation_id ||
    result?.id ||
    result?.response?.conversationId ||
    result?.response?.conversation_id ||
    ''
  );
  return {
    ok: true,
    threadId: convId,
    projectId,
    title: title ? title.trim() : '',
    result,
  };
}

/**
 * Fetches cached conversation metadata from agentapi, backing off when LS is down.
 */
export async function getConversationMetadata(threadId) {
  if (!isValidThreadId(threadId)) return null;
  const hit = metadataCache.get(threadId);
  if (hit && Date.now() - hit.at < METADATA_TTL_MS) return hit.data;
  if (Date.now() < lsUnavailableUntil) return hit?.data || null;
  if (metadataInFlight.has(threadId)) return metadataInFlight.get(threadId);

  const p = (async () => {
    try {
      const md = await runAgentApi(['get-conversation-metadata', threadId], { timeout: METADATA_TIMEOUT_MS });
      const title = String(md?.title || md?.summary || md?.name || md?.metadata?.title || md?.conversation?.title || '').trim();
      const workspaceUris = []
        .concat(Array.isArray(md?.workspaceUris) ? md.workspaceUris : [])
        .concat(Array.isArray(md?.workspace_uris) ? md.workspace_uris : [])
        .concat(Array.isArray(md?.metadata?.workspaceUris) ? md.metadata.workspaceUris : []);
      const projectId = String(md?.projectId || md?.project_id || md?.metadata?.projectId || '').trim();
      const data = { title, workspaceUris, projectId, raw: md };
      metadataCache.set(threadId, { at: Date.now(), data });
      return data;
    } catch {
      return hit?.data || null;
    } finally {
      metadataInFlight.delete(threadId);
    }
  })();

  metadataInFlight.set(threadId, p);
  return p;
}

export function resetActionsState() {
  metadataCache.clear();
  lsUnavailableUntil = 0;
}
