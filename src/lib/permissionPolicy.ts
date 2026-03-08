// permissionPolicy.ts — Normalize approval requests and resolve decisions
// based on the active permission mode.

import type { ApprovalCategory, ApprovalDecision, NormalizedApproval, PermissionMode } from '@/types/permissions';

// ---------------------------------------------------------------------------
// Command → Category classification
// ---------------------------------------------------------------------------

const READ_COMMANDS = new Set([
  'read', 'cat', 'ls', 'head', 'tail', 'grep', 'find', 'type', 'get-content',
  'dir', 'rg', 'fd', 'wc', 'stat', 'file', 'less', 'more',
]);

const WRITE_COMMANDS = new Set([
  'write', 'edit', 'tee', 'set-content', 'out-file', 'touch', 'mkdir',
  'new-item', 'add-content',
]);

const PATCH_COMMANDS = new Set([
  'apply_patch', 'patch', 'diff',
]);

const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'del', 'rmdir', 'mv', 'move', 'rename', 'remove-item',
  'shred', 'unlink',
]);

const EXEC_COMMANDS = new Set([
  'exec', 'bash', 'sh', 'cmd', 'powershell', 'pwsh',
  'system.run', 'node', 'python', 'python3', 'npm', 'pnpm', 'yarn',
  'pip', 'cargo', 'go', 'make', 'git', 'docker', 'curl', 'wget',
]);

function classifyCommand(primary: string): ApprovalCategory {
  const lower = primary.toLowerCase();
  if (READ_COMMANDS.has(lower)) return 'read';
  if (WRITE_COMMANDS.has(lower)) return 'write';
  if (PATCH_COMMANDS.has(lower)) return 'patch';
  if (DESTRUCTIVE_COMMANDS.has(lower)) return 'destructive';
  if (EXEC_COMMANDS.has(lower)) return 'exec';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// normalizeApprovalRequest
// ---------------------------------------------------------------------------

/**
 * Parse the raw `request` payload from an `exec.approval.requested` event
 * into a normalized shape with a classified category.
 */
export function normalizeApprovalRequest(request: Record<string, unknown>): NormalizedApproval {
  const commandArgv = Array.isArray(request.commandArgv)
    ? (request.commandArgv as string[])
    : undefined;

  const rawCommand = typeof request.command === 'string' ? request.command : '';

  let primary: string;
  let args: string[];

  if (commandArgv && commandArgv.length > 0) {
    primary = commandArgv[0];
    args = commandArgv.slice(1);
  } else {
    const parts = rawCommand.trim().split(/\s+/);
    primary = parts[0] ?? '';
    args = parts.slice(1);
  }

  return {
    command: primary,
    args,
    host: typeof request.host === 'string' ? request.host : null,
    security: typeof request.security === 'string' ? request.security : null,
    cwd: typeof request.cwd === 'string' ? request.cwd : null,
    category: classifyCommand(primary),
  };
}

// ---------------------------------------------------------------------------
// resolveApprovalDecision
// ---------------------------------------------------------------------------

/**
 * Given the active permission mode and a normalized approval request,
 * return the automatic decision or `'ask'` if the user must decide.
 */
export function resolveApprovalDecision(
  mode: PermissionMode,
  normalized: NormalizedApproval,
): ApprovalDecision | 'ask' {
  switch (mode) {
    case 'ask':
      return 'ask';

    case 'auto':
      // Auto-approve safe operations; ask for destructive/exec/unknown
      if (
        normalized.category === 'read' ||
        normalized.category === 'write' ||
        normalized.category === 'patch'
      ) {
        return 'allow-once';
      }
      return 'ask';

    case 'plan':
      // Block all tool execution
      return 'deny';

    case 'bypass':
      // Safety fallback — backend shouldn't send approvals when execAsk is "off",
      // but handle gracefully if it does.
      return 'allow-once';
  }
}
