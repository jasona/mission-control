import { readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { ID_RE, statOf } from './discovery.mjs';

export const STEP_ERROR_SETTLE_MS = 60 * 1000;
export const STUCK_MS = 10 * 60 * 1000;
export const QUOTA_RE = /RESOURCE_EXHAUSTED|quota|\b429\b|exhausted your capacity|rate.?limit/i;

const BOARD_ACTIVITY = {
  swarm_wait: 'Waiting for posts',
  read_board: 'Reading the board',
  post_message: 'Posting to the board',
};

const EDIT_TOOLS = new Set([
  'write_file',
  'edit_file',
  'write_to_file',
  'replace_file_content',
  'multi_replace_file_content',
]);

const FILE_TOOLS = new Set([
  'read_file',
  'view_file',
  ...EDIT_TOOLS,
]);

const transcriptCache = new Map();
const NO_TRANSCRIPT = { key: '-', summary: null };

export function transcriptPathOf(appData, conv) {
  return join(appData, 'brain', conv, '.system_generated', 'logs', 'transcript.jsonl');
}

/**
 * Unwraps JSON-quoted string tool arguments used in Antigravity transcripts.
 */
export function unquote(v) {
  if (typeof v !== 'string') return v == null ? '' : String(v);
  const s = v.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return String(JSON.parse(s));
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * Unwraps JSON-encoded objects/arrays inside tool_call args when serialized as strings.
 */
function parseMaybeJson(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || (s[0] !== '{' && s[0] !== '[' && s[0] !== '"')) return null;
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === 'string') return parseMaybeJson(parsed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Flattens markdown/whitespace into a concise single line.
 */
export function oneLine(s, maxLen = 96) {
  const out = String(s || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length > maxLen ? `${out.slice(0, maxLen - 1).trimEnd()}…` : out;
}

/**
 * Produces a concise human label for a single tool call.
 */
export function describeToolCall(tc) {
  const name = tc?.name || '';
  if (!name) return '';
  if (BOARD_ACTIVITY[name]) return BOARD_ACTIVITY[name];
  const args = tc.args && typeof tc.args === 'object' ? tc.args : {};
  const summary = unquote(args.toolSummary) || unquote(args.toolAction);
  if (summary) return oneLine(summary);
  const filePath = unquote(args.Path || args.AbsolutePath || args.TargetFile || args.path);
  if (filePath) {
    const verb = {
      read_file: 'Read',
      view_file: 'Read',
      write_file: 'Write',
      write_to_file: 'Write',
      edit_file: 'Edit',
      replace_file_content: 'Edit',
      multi_replace_file_content: 'Edit',
    }[name];
    if (verb) return `${verb} ${basename(filePath)}`;
  }
  if (name === 'run_command' && args.CommandLine) {
    return oneLine(`Run ${unquote(args.CommandLine)}`, 64);
  }
  if ((name === 'code_search' || name === 'grep_search') && args.Query) {
    return oneLine(`Search ${unquote(args.Query)}`);
  }
  if (name === 'ask_question') return 'Waiting for user answer';
  if (name === 'swarm' && args.action) return oneLine(`swarm ${unquote(args.action)} ${unquote(args.name)}`);
  return name;
}

/**
 * Extracts the last bold "**Heading**" line from a thinking block.
 */
export function thinkingHeading(thinking) {
  if (typeof thinking !== 'string') return '';
  const hs = [...thinking.matchAll(/(?:^|\n)\s*\*\*([^*\n]{3,96})\*\*\s*(?=\n|$)/g)];
  return hs.length ? oneLine(hs[hs.length - 1][1]) : '';
}

function parseStep(item) {
  if (!item) return null;
  if (typeof item === 'object') return item;
  if (typeof item !== 'string' || !item.trim()) return null;
  try {
    const obj = JSON.parse(item);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Determines whether the newest transcript step represents a completed turn.
 */
export function turnEnded(lines) {
  const results = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const step = parseStep(lines[i]);
    if (!step) return false;
    if (step.type === 'GENERIC') {
      results.unshift(step);
      continue;
    }
    if (step.type !== 'PLANNER_RESPONSE') return false;
    const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    if (calls.length === 0) return results.length === 0;
    const wait = calls.findIndex((c) => c?.name === 'swarm_wait');
    return wait >= 0 && results.length >= calls.length && results[wait].status === 'DONE';
  }
  return false;
}

/**
 * Returns the text of the newest step when it is a final reply with no tool calls, else null.
 */
export function finalReply(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const step = parseStep(lines[i]);
    if (!step) return null;
    const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    return step.type === 'PLANNER_RESPONSE' && calls.length === 0 ? String(step.content || '') : null;
  }
  return null;
}

/**
 * Extracts the trailing user-directed question from a final reply, or ''.
 */
export function replyQuestion(text) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]*)`/g, (_, s) => s.replace(/\?/g, ''))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/"[^"\n]*"|“[^”\n]*”/g, ' ')
    .replace(/\*\*|__/g, '');
  const qs = plain
    .split(/\n+|(?<=[.!?])\s+/)
    .map((x) => x.replace(/^[\s>*-]+/, '').trim())
    .filter((x) => /\?$/.test(x) && x.length > 3);
  return qs.length ? oneLine(qs[qs.length - 1], 200) : '';
}

/**
 * Evaluates whether a transcript summary stopped on a model or settled tool error.
 */
export function stepFailure(tr, now = Date.now()) {
  const last = tr?.last;
  if (!last) return null;
  const modelError = last.type === 'ERROR_MESSAGE';
  const settledToolError = last.status === 'ERROR' && now - (tr.mtime || 0) >= STEP_ERROR_SETTLE_MS;
  if (!modelError && !settledToolError) return null;
  const text = last.error || (modelError ? 'model error' : 'step failed');
  return { kind: QUOTA_RE.test(text) ? 'quota' : 'error', text };
}

/**
 * Extracts deduplicated edited files from write_file / edit_file tool calls.
 */
export function extractEditedFiles(steps) {
  const byPath = new Map();
  for (let idx = 0; idx < steps.length; idx++) {
    const step = steps[idx];
    if (step.type !== 'PLANNER_RESPONSE') continue;
    const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    for (const tc of calls) {
      if (!EDIT_TOOLS.has(tc?.name)) continue;
      const args = tc.args && typeof tc.args === 'object' ? tc.args : {};
      const filePath = unquote(args.Path || args.TargetFile || args.AbsolutePath || args.path);
      if (!filePath) continue;
      const isCreate = (tc.name === 'write_file' || tc.name === 'write_to_file') &&
        unquote(args.Overwrite) !== 'true' && args.Overwrite !== true;
      const prev = byPath.get(filePath);
      byPath.set(filePath, {
        path: filePath,
        status: prev ? prev.status : (isCreate ? 'A' : 'M'),
        edits: (prev?.edits || 0) + 1,
        lastStepIndex: Number.isFinite(step.step_index) ? step.step_index : idx,
      });
    }
  }
  return [...byPath.values()];
}

/**
 * Parses a single text block for test runner summaries (cargo, node --test, pytest, jest/vitest, go test).
 */
export function parseTestOutput(text) {
  if (typeof text !== 'string' || !text) return null;

  // Explicit "cargo test passed (18/18)" or "tests passed (N/N)"
  let m = text.match(/\b(cargo test|pytest|node test|npm test|go test)\s+(passed|failed)\s*\((\d+)\s*\/\s*(\d+)\)/i);
  if (m) {
    const ok = m[2].toLowerCase() === 'passed';
    const passed = Number(m[3]);
    const total = Number(m[4]);
    return {
      runner: m[1].toLowerCase(),
      ok,
      passed,
      failed: Math.max(0, total - passed),
      total,
      label: `${m[1]} ${m[2].toLowerCase()} (${passed}/${total})`,
    };
  }

  // Rust cargo test: "test result: ok. 18 passed; 0 failed;"
  m = text.match(/test result:\s*(ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed/i);
  if (m) {
    const ok = m[1].toLowerCase() === 'ok';
    const passed = Number(m[2]);
    const failed = Number(m[3]);
    const total = passed + failed;
    return {
      runner: 'cargo',
      ok,
      passed,
      failed,
      total,
      label: ok ? `cargo test passed (${passed}/${total})` : `cargo test failed (${failed} failed)`,
    };
  }

  // Node native test runner: "ℹ tests 12\nℹ pass 12\nℹ fail 0" or "# tests 12\n# pass 12\n# fail 0"
  const testsM = text.match(/^[ℹ#]\s*tests\s+(\d+)/m);
  const passM = text.match(/^[ℹ#]\s*pass\s+(\d+)/m);
  const failM = text.match(/^[ℹ#]\s*fail\s+(\d+)/m);
  if (testsM && passM && failM) {
    const total = Number(testsM[1]);
    const passed = Number(passM[1]);
    const failed = Number(failM[1]);
    const ok = failed === 0 && passed > 0;
    return {
      runner: 'node',
      ok,
      passed,
      failed,
      total,
      label: ok ? `node test passed (${passed}/${total})` : `node test failed (${failed}/${total})`,
    };
  }

  // Pytest: "12 passed" / "2 failed, 10 passed"
  m = text.match(/(?:(\d+)\s+failed,\s*)?(\d+)\s+passed(?:\s+in\s+[\d.]+s|\s*=|$)/im);
  if (m && /pytest|===.*passed/i.test(text)) {
    const failed = Number(m[1] || 0);
    const passed = Number(m[2]);
    const total = passed + failed;
    const ok = failed === 0;
    return {
      runner: 'pytest',
      ok,
      passed,
      failed,
      total,
      label: ok ? `pytest passed (${passed}/${total})` : `pytest failed (${failed}/${total})`,
    };
  }

  // Jest / Vitest: "Tests: 10 passed, 10 total" or "Tests  10 passed (10)"
  m = text.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed,\s*(\d+)\s+total/i);
  if (m) {
    const failed = Number(m[1] || 0);
    const passed = Number(m[2]);
    const total = Number(m[3]);
    const ok = failed === 0;
    return {
      runner: 'jest',
      ok,
      passed,
      failed,
      total,
      label: ok ? `tests passed (${passed}/${total})` : `tests failed (${failed}/${total})`,
    };
  }

  // Go test: "ok  example.com/pkg  0.123s" or "FAIL  example.com/pkg  0.123s"
  m = text.match(/^(ok|FAIL)\s+\S+\s+[\d.]+s/m);
  if (m) {
    const ok = m[1] === 'ok';
    return {
      runner: 'go',
      ok,
      passed: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      total: 1,
      label: ok ? 'go test passed' : 'go test failed',
    };
  }

  return null;
}

/**
 * Extracts all test results detected across transcript tool outputs.
 */
export function extractTestResults(steps) {
  const results = [];
  for (let idx = 0; idx < steps.length; idx++) {
    const step = steps[idx];
    if (step.type !== 'GENERIC' && step.type !== 'PLANNER_RESPONSE') continue;
    const parsed = parseTestOutput(String(step.content || ''));
    if (parsed) {
      results.push({
        ...parsed,
        stepIndex: Number.isFinite(step.step_index) ? step.step_index : idx,
      });
    }
  }
  return {
    latest: results.length ? results[results.length - 1] : null,
    all: results,
  };
}

function extractAskQuestionDetails(tc) {
  const args = tc?.args && typeof tc.args === 'object' ? tc.args : {};
  const direct = unquote(args.question || args.Prompt || args.prompt);
  if (direct) return { question: oneLine(direct, 200), options: [] };
  const qs = parseMaybeJson(args.questions);
  if (Array.isArray(qs) && qs.length > 0) {
    const qTexts = qs
      .map((item) => (typeof item === 'string' ? item : item?.question))
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => oneLine(s, 180));
    const opts = Array.isArray(qs[0]?.options)
      ? qs[0].options
          .map((o) => (typeof o === 'string' ? o : o?.label || o?.text || ''))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    if (qTexts.length > 0) {
      return {
        question: qTexts.length === 1 ? qTexts[0] : oneLine(qTexts.join(' · '), 200),
        options: opts,
      };
    }
  }
  return { question: '', options: [] };
}

function extractAskQuestionText(tc) {
  return extractAskQuestionDetails(tc).question;
}

function extractPendingPromptState(steps) {
  let askQuestion = '';
  let pendingApproval = '';

  // Inspect the newest PLANNER_RESPONSE and any trailing GENERIC results.
  const trailingResults = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type === 'GENERIC') {
      trailingResults.unshift(step);
      continue;
    }
    if (step.type === 'USER_INPUT') break;
    if (step.type !== 'PLANNER_RESPONSE') break;

    const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    for (let c = 0; c < calls.length; c++) {
      const tc = calls[c];
      const res = trailingResults[c];
      const waiting = !res || res.status === 'RUNNING' || res.status === 'WAITING' || res.status === 'PENDING';
      if (tc?.name === 'ask_question' && waiting) {
        askQuestion = extractAskQuestionText(tc) || 'Waiting for your answer';
      }
      if ((step.status === 'WAITING' || res?.status === 'WAITING' || res?.status === 'PENDING') && tc?.name !== 'ask_question') {
        pendingApproval = describeToolCall(tc) || `Approval required: ${tc?.name || 'tool'}`;
      }
    }
    break;
  }

  return { askQuestion, pendingApproval };
}

function extractReferencedPaths(steps) {
  const paths = new Set();
  for (const step of steps) {
    if (step.type === 'PLANNER_RESPONSE') {
      const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
      for (const tc of calls) {
        const args = tc?.args && typeof tc.args === 'object' ? tc.args : {};
        for (const key of ['Path', 'AbsolutePath', 'TargetFile', 'SearchDirectory', 'Cwd', 'path']) {
          const val = unquote(args[key]);
          if (val && isAbsolute(val)) paths.add(val);
        }
        const cmd = unquote(args.CommandLine);
        if (cmd) {
          for (const m of cmd.matchAll(/(?:^|[\s"'=])(\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+)/g)) {
            paths.add(m[1]);
          }
        }
      }
    }
    if (step.type === 'SYSTEM_MESSAGE' || step.type === 'USER_INPUT') {
      const text = String(step.content || '');
      for (const m of text.matchAll(/(?:^|\s|file:\/\/)(\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)+)/gm)) {
        paths.add(m[1]);
      }
    }
  }
  return [...paths];
}

function extractFirstUserTitle(steps) {
  for (const step of steps) {
    if (step.type !== 'USER_INPUT') continue;
    let text = String(step.content || '')
      .replace(/<\/?USER_REQUEST>/gi, '')
      .replace(/<SYSTEM_MESSAGE>[\s\S]*?<\/SYSTEM_MESSAGE>/gi, '')
      .trim();
    if (!text) continue;
    const firstLine = text.split('\n').find((l) => l.trim()) || '';
    if (firstLine) return oneLine(firstLine, 72);
  }
  return '';
}

const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function fmtTimeLabel(isoOrMs) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(String(isoOrMs || ''));
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return clockFmt.format(new Date(ms));
}

function buildActivityEntries(steps, idle) {
  const entries = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const tsMs = Date.parse(String(step.created_at || ''));
    const time = fmtTimeLabel(tsMs);
    const timestamp = Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : '';

    if (step.type === 'USER_INPUT') {
      const clean = String(step.content || '').replace(/<\/?USER_REQUEST>/gi, '').trim();
      if (!clean) continue;
      entries.push({
        id: `step-${step.step_index ?? i}`,
        from: 'You',
        to: '@agent',
        time,
        timestamp,
        body: oneLine(clean, 240),
        badge: null,
        filePill: null,
        stateText: '',
      });
      continue;
    }

    if (step.type === 'ERROR_MESSAGE') {
      entries.push({
        id: `step-${step.step_index ?? i}`,
        from: '@agent',
        to: '',
        time,
        timestamp,
        body: oneLine(step.error || step.content || 'Model execution error', 240),
        badge: { text: QUOTA_RE.test(String(step.error || '')) ? 'Quota exceeded' : 'Error', tone: 'red', icon: 'alert' },
        filePill: null,
        stateText: '',
      });
      continue;
    }

    if (step.type === 'PLANNER_RESPONSE') {
      const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
      const heading = thinkingHeading(step.thinking);
      const replyText = calls.length === 0 ? String(step.content || '').trim() : '';

      let filePill = null;
      let badge = null;
      const labels = [];

      for (const tc of calls) {
        const lbl = describeToolCall(tc);
        if (lbl) labels.push(lbl);
        if (!filePill && FILE_TOOLS.has(tc?.name)) {
          const p = unquote(tc.args?.Path || tc.args?.TargetFile || tc.args?.AbsolutePath || tc.args?.path);
          if (p) filePill = basename(p);
        }
      }

      // Check immediate following GENERIC steps for test results or ask_question completion.
      const followingResults = [];
      for (let j = i + 1; j < steps.length && steps[j].type === 'GENERIC'; j++) {
        const res = steps[j];
        followingResults.push(res);
        const tr = parseTestOutput(String(res.content || ''));
        if (tr) {
          badge = { text: tr.label, tone: tr.ok ? 'green' : 'red', icon: tr.ok ? 'check' : 'alert' };
        }
      }

      const askIdx = calls.findIndex((tc) => tc?.name === 'ask_question');
      let body = replyText
        ? oneLine(replyText, 240)
        : (heading || (labels.length ? labels.join(' · ') : ''));
      const isLatestPlanner = i >= steps.length - 1 - followingResults.length;
      let stateText = isLatestPlanner && !idle && calls.length > 0 ? 'Working...' : '';

      if (askIdx >= 0) {
        const { question, options } = extractAskQuestionDetails(calls[askIdx]);
        const askRes = followingResults[askIdx];
        const askWaiting = !askRes || askRes.status === 'RUNNING' || askRes.status === 'WAITING' || askRes.status === 'PENDING';
        if (question) {
          body = options.length > 0 ? `${question} (${options.join(' / ')})` : question;
        } else if (!body) {
          body = 'Waiting for user answer';
        }
        if (askWaiting) {
          badge = { text: 'Needs answer', tone: 'amber', icon: 'alert' };
          stateText = 'Waiting for reply';
        }
      }

      if (!body && !badge && !filePill) continue;

      entries.push({
        id: `step-${step.step_index ?? i}`,
        from: '@agent',
        to: '',
        time,
        timestamp,
        body,
        badge,
        filePill,
        stateText,
      });
    }
  }
  return entries.slice(-40);
}

/**
 * Parses and caches a conversation's transcript.jsonl summary.
 * Accepts either (appData, convId) or a direct transcript file path.
 */
export function summarizeTranscript(appDataOrPath, convId) {
  let filePath;
  if (convId !== undefined) {
    if (!appDataOrPath || !convId || !ID_RE.test(convId)) return NO_TRANSCRIPT;
    filePath = transcriptPathOf(appDataOrPath, convId);
  } else {
    if (!appDataOrPath || typeof appDataOrPath !== 'string') return NO_TRANSCRIPT;
    filePath = appDataOrPath;
  }

  const s = statOf(filePath);
  if (s.size < 0 || !s.isFile) return NO_TRANSCRIPT;
  const key = `${s.mtime}:${s.size}`;
  const hit = transcriptCache.get(filePath);
  if (hit && hit.key === key) return hit;

  let text;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch {
    return NO_TRANSCRIPT;
  }

  const lines = text.split('\n').filter((l) => l.trim());
  const steps = [];
  for (const line of lines) {
    const parsed = parseStep(line);
    if (parsed) steps.push(parsed);
  }

  let totalSteps = lines.length;
  let activity = '';
  let activityKind = '';
  let last = null;
  let model = '';
  let updatedAtMs = s.mtime;

  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (i === steps.length - 1 && Number.isFinite(step.step_index)) {
      totalSteps = Math.max(totalSteps, step.step_index + 1);
    }
    if (!model && typeof step.model === 'string' && step.model.trim()) {
      model = step.model.trim();
    }
    if (i === steps.length - 1 && step.created_at) {
      const parsedMs = Date.parse(String(step.created_at));
      if (Number.isFinite(parsedMs)) updatedAtMs = Math.max(updatedAtMs, parsedMs);
    }
    if (!last) {
      last = {
        type: String(step.type || ''),
        status: String(step.status || ''),
        error: typeof step.error === 'string' ? oneLine(step.error, 240) : '',
      };
    }
    if (step.type === 'USER_INPUT') break;
    if (step.type !== 'PLANNER_RESPONSE') continue;
    const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    if (calls.some((tc) => tc?.name === 'swarm_wait')) break;
    const labeled = calls.filter((tc) => describeToolCall(tc)).pop();
    const label = labeled ? describeToolCall(labeled) : '';
    const heading = thinkingHeading(step.thinking);
    if (label && !activity) {
      activity = label;
      activityKind = 'tool';
      break;
    } else if (heading && !activity) {
      activity = heading;
      activityKind = 'thinking';
      break;
    }
  }

  if (!model) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (typeof steps[i].model === 'string' && steps[i].model.trim()) {
        model = steps[i].model.trim();
        break;
      }
    }
  }

  const idle = turnEnded(lines);
  const reply = finalReply(lines);
  const replied = reply !== null;
  const replyAsk = replied ? replyQuestion(reply) : '';
  const replyPreview = replied ? oneLine(reply, 140) : '';
  const { askQuestion, pendingApproval } = extractPendingPromptState(steps);
  const editedFiles = extractEditedFiles(steps);
  const testResults = extractTestResults(steps);
  const referencedPaths = extractReferencedPaths(steps);
  const firstUserPrompt = extractFirstUserTitle(steps);
  const activities = buildActivityEntries(steps, idle);

  const summary = {
    steps: totalSteps,
    activity,
    activityKind,
    last,
    idle,
    replied,
    replyAsk,
    replyPreview,
    askQuestion,
    pendingApproval,
    editedFiles,
    testResults,
    referencedPaths,
    firstUserPrompt,
    model,
    activities,
    mtime: s.mtime,
    updatedAtMs,
    updatedAt: new Date(updatedAtMs || Date.now()).toISOString(),
  };

  const entry = { key, summary };
  if (transcriptCache.size > 500) transcriptCache.clear();
  transcriptCache.set(filePath, entry);
  return entry;
}
