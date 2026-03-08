// permissions.ts — Permission mode types and approval record definitions.
// These types mirror the OpenClaw exec-approval protocol exactly.

// ---------------------------------------------------------------------------
// Permission modes (frontend concept — maps to backend execAsk values)
// ---------------------------------------------------------------------------

export type PermissionMode = 'ask' | 'auto' | 'plan' | 'bypass';

/** Map frontend permission mode to backend execAsk value for sessions.patch. */
export const PERMISSION_MODE_TO_EXEC_ASK: Record<PermissionMode, 'off' | 'on-miss' | 'always'> = {
  ask: 'on-miss',
  auto: 'on-miss',
  plan: 'always',
  bypass: 'off',
};

// ---------------------------------------------------------------------------
// Approval decisions (EXACT backend values — do not invent new ones)
// ---------------------------------------------------------------------------

export type ApprovalDecision = 'allow-once' | 'allow-always' | 'deny';

// ---------------------------------------------------------------------------
// Approval status (frontend tracking)
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | 'pending'        // Waiting for user decision
  | 'resolving'      // RPC sent, awaiting ack
  | 'approved'       // User approved
  | 'auto_approved'  // Auto-resolved by frontend policy
  | 'denied'         // User denied
  | 'auto_denied'    // Auto-resolved by frontend policy (plan mode)
  | 'expired';       // Timed out (120s default)

// ---------------------------------------------------------------------------
// Normalized approval request (parsed from raw exec.approval.requested event)
// ---------------------------------------------------------------------------

export type ApprovalCategory = 'read' | 'write' | 'patch' | 'destructive' | 'exec' | 'unknown';

export type NormalizedApproval = {
  command: string;
  args: string[];
  host: string | null;
  security: string | null;
  cwd: string | null;
  category: ApprovalCategory;
};

// ---------------------------------------------------------------------------
// Approval record (stored in frontend state)
// ---------------------------------------------------------------------------

export type ApprovalRecord = {
  id: string;
  command: string;
  commandArgv?: string[];
  cwd?: string | null;
  host?: string | null;
  category: ApprovalCategory;
  status: ApprovalStatus;
  decisionSource: 'user' | 'auto';
  createdAtMs: number;
  expiresAtMs: number;
};
