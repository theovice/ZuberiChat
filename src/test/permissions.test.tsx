// permissions.test.tsx — RTL-047 Phase 1 tests
// Covers: normalizeApprovalRequest, resolveApprovalDecision, ModeSelector component

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { normalizeApprovalRequest, resolveApprovalDecision } from '@/lib/permissionPolicy';
import type { NormalizedApproval, PermissionMode, ApprovalCategory } from '@/types/permissions';
import { PERMISSION_MODE_TO_EXEC_ASK } from '@/types/permissions';
import { ModeSelector } from '@/components/chat/ModeSelector';

// ---------------------------------------------------------------------------
// normalizeApprovalRequest
// ---------------------------------------------------------------------------

describe('normalizeApprovalRequest', () => {
  it('extracts command from commandArgv', () => {
    const result = normalizeApprovalRequest({
      commandArgv: ['cat', '/tmp/file.txt'],
    });
    expect(result.command).toBe('cat');
    expect(result.args).toEqual(['/tmp/file.txt']);
    expect(result.category).toBe('read');
  });

  it('extracts command from raw command string when commandArgv missing', () => {
    const result = normalizeApprovalRequest({
      command: 'rm -rf /tmp/junk',
    });
    expect(result.command).toBe('rm');
    expect(result.args).toEqual(['-rf', '/tmp/junk']);
    expect(result.category).toBe('destructive');
  });

  it('prefers commandArgv over command string', () => {
    const result = normalizeApprovalRequest({
      commandArgv: ['write', 'output.txt'],
      command: 'cat input.txt',
    });
    expect(result.command).toBe('write');
    expect(result.category).toBe('write');
  });

  it('extracts host, security, and cwd fields', () => {
    const result = normalizeApprovalRequest({
      commandArgv: ['ls'],
      host: 'localhost',
      security: 'sandboxed',
      cwd: '/home/user',
    });
    expect(result.host).toBe('localhost');
    expect(result.security).toBe('sandboxed');
    expect(result.cwd).toBe('/home/user');
  });

  it('returns null for missing string fields', () => {
    const result = normalizeApprovalRequest({
      commandArgv: ['ls'],
    });
    expect(result.host).toBeNull();
    expect(result.security).toBeNull();
    expect(result.cwd).toBeNull();
  });

  it('handles empty commandArgv', () => {
    const result = normalizeApprovalRequest({
      commandArgv: [],
      command: 'node index.js',
    });
    expect(result.command).toBe('node');
    expect(result.category).toBe('exec');
  });

  it('handles empty command string', () => {
    const result = normalizeApprovalRequest({
      command: '',
    });
    expect(result.command).toBe('');
    expect(result.category).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

describe('category classification', () => {
  const classify = (cmd: string): ApprovalCategory =>
    normalizeApprovalRequest({ commandArgv: [cmd] }).category;

  it.each([
    ['read', 'read'], ['cat', 'read'], ['ls', 'read'], ['head', 'read'],
    ['tail', 'read'], ['grep', 'read'], ['find', 'read'], ['type', 'read'],
    ['get-content', 'read'], ['dir', 'read'], ['rg', 'read'], ['fd', 'read'],
    ['wc', 'read'], ['stat', 'read'], ['file', 'read'], ['less', 'read'],
    ['more', 'read'],
  ] as [string, ApprovalCategory][])('classifies %s → %s', (cmd, expected) => {
    expect(classify(cmd)).toBe(expected);
  });

  it.each([
    ['write', 'write'], ['edit', 'write'], ['tee', 'write'],
    ['set-content', 'write'], ['out-file', 'write'], ['touch', 'write'],
    ['mkdir', 'write'], ['new-item', 'write'], ['add-content', 'write'],
  ] as [string, ApprovalCategory][])('classifies %s → %s', (cmd, expected) => {
    expect(classify(cmd)).toBe(expected);
  });

  it.each([
    ['apply_patch', 'patch'], ['patch', 'patch'], ['diff', 'patch'],
  ] as [string, ApprovalCategory][])('classifies %s → %s', (cmd, expected) => {
    expect(classify(cmd)).toBe(expected);
  });

  it.each([
    ['rm', 'destructive'], ['del', 'destructive'], ['rmdir', 'destructive'],
    ['mv', 'destructive'], ['move', 'destructive'], ['rename', 'destructive'],
    ['remove-item', 'destructive'], ['shred', 'destructive'], ['unlink', 'destructive'],
  ] as [string, ApprovalCategory][])('classifies %s → %s', (cmd, expected) => {
    expect(classify(cmd)).toBe(expected);
  });

  it.each([
    ['exec', 'exec'], ['bash', 'exec'], ['sh', 'exec'], ['cmd', 'exec'],
    ['powershell', 'exec'], ['pwsh', 'exec'], ['node', 'exec'],
    ['python', 'exec'], ['python3', 'exec'], ['npm', 'exec'],
    ['pnpm', 'exec'], ['yarn', 'exec'], ['pip', 'exec'], ['cargo', 'exec'],
    ['go', 'exec'], ['make', 'exec'], ['git', 'exec'], ['docker', 'exec'],
    ['curl', 'exec'], ['wget', 'exec'],
  ] as [string, ApprovalCategory][])('classifies %s → %s', (cmd, expected) => {
    expect(classify(cmd)).toBe(expected);
  });

  it('classifies unknown commands as unknown', () => {
    expect(classify('my-custom-tool')).toBe('unknown');
    expect(classify('zuberi-magic')).toBe('unknown');
  });

  it('classification is case-insensitive', () => {
    expect(classify('CAT')).toBe('read');
    expect(classify('RM')).toBe('destructive');
    expect(classify('Node')).toBe('exec');
  });
});

// ---------------------------------------------------------------------------
// resolveApprovalDecision
// ---------------------------------------------------------------------------

describe('resolveApprovalDecision', () => {
  const make = (category: ApprovalCategory): NormalizedApproval => ({
    command: 'test',
    args: [],
    host: null,
    security: null,
    cwd: null,
    category,
  });

  describe('ask mode', () => {
    const mode: PermissionMode = 'ask';

    // RTL-061: reads are auto-approved with allow-always in all modes except plan
    it('auto-approves read with allow-always', () => {
      expect(resolveApprovalDecision(mode, make('read'))).toBe('allow-always');
    });

    it.each<ApprovalCategory>(['write', 'patch', 'destructive', 'exec', 'unknown'])(
      'returns "ask" for %s category',
      (category) => {
        expect(resolveApprovalDecision(mode, make(category))).toBe('ask');
      },
    );
  });

  describe('auto mode', () => {
    const mode: PermissionMode = 'auto';

    // RTL-061: reads get allow-always (cached permanently by backend)
    it('auto-approves read with allow-always', () => {
      expect(resolveApprovalDecision(mode, make('read'))).toBe('allow-always');
    });

    it.each<ApprovalCategory>(['write', 'patch'])(
      'auto-approves %s category with allow-once',
      (category) => {
        expect(resolveApprovalDecision(mode, make(category))).toBe('allow-once');
      },
    );

    it.each<ApprovalCategory>(['destructive', 'exec', 'unknown'])(
      'asks for %s category',
      (category) => {
        expect(resolveApprovalDecision(mode, make(category))).toBe('ask');
      },
    );
  });

  describe('plan mode', () => {
    const mode: PermissionMode = 'plan';

    it.each<ApprovalCategory>(['read', 'write', 'patch', 'destructive', 'exec', 'unknown'])(
      'denies %s category',
      (category) => {
        expect(resolveApprovalDecision(mode, make(category))).toBe('deny');
      },
    );
  });

  describe('bypass mode', () => {
    const mode: PermissionMode = 'bypass';

    // RTL-061: reads get allow-always even in bypass (consistent with all non-plan modes)
    it('auto-approves read with allow-always', () => {
      expect(resolveApprovalDecision(mode, make('read'))).toBe('allow-always');
    });

    it.each<ApprovalCategory>(['write', 'patch', 'destructive', 'exec', 'unknown'])(
      'allows %s category with allow-once',
      (category) => {
        expect(resolveApprovalDecision(mode, make(category))).toBe('allow-once');
      },
    );
  });
});

// ---------------------------------------------------------------------------
// PERMISSION_MODE_TO_EXEC_ASK mapping
// ---------------------------------------------------------------------------

describe('PERMISSION_MODE_TO_EXEC_ASK', () => {
  it('maps ask → on-miss', () => {
    expect(PERMISSION_MODE_TO_EXEC_ASK.ask).toBe('on-miss');
  });

  it('maps auto → on-miss', () => {
    expect(PERMISSION_MODE_TO_EXEC_ASK.auto).toBe('on-miss');
  });

  it('maps plan → always', () => {
    expect(PERMISSION_MODE_TO_EXEC_ASK.plan).toBe('always');
  });

  it('maps bypass → off', () => {
    expect(PERMISSION_MODE_TO_EXEC_ASK.bypass).toBe('off');
  });
});

// ---------------------------------------------------------------------------
// ModeSelector component
// ---------------------------------------------------------------------------

describe('ModeSelector', () => {
  it('renders with selected mode label', () => {
    render(<ModeSelector mode="ask" onModeChange={() => {}} />);
    expect(screen.getByText('Ask permissions')).toBeInTheDocument();
  });

  it('shows all 4 modes when dropdown opens', () => {
    render(<ModeSelector mode="ask" onModeChange={() => {}} />);

    // Click button to open dropdown
    const button = screen.getByText('Ask permissions');
    fireEvent.click(button);

    // "Ask permissions" appears in both button and dropdown — use getAllByText
    expect(screen.getAllByText('Ask permissions').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Auto accept edits')).toBeInTheDocument();
    expect(screen.getByText('Plan mode')).toBeInTheDocument();
    expect(screen.getByText('Bypass permissions')).toBeInTheDocument();
  });

  it('shows descriptions for all modes', () => {
    render(<ModeSelector mode="ask" onModeChange={() => {}} />);
    fireEvent.click(screen.getByText('Ask permissions'));

    expect(screen.getByText('Ask before tool actions')).toBeInTheDocument();
    expect(screen.getByText('Auto-approve safe file operations')).toBeInTheDocument();
    expect(screen.getByText('Block all tool execution')).toBeInTheDocument();
    expect(screen.getByText('Skip all approval checks')).toBeInTheDocument();
  });

  it('fires onModeChange when a mode is selected', () => {
    const onChange = vi.fn();
    render(<ModeSelector mode="ask" onModeChange={onChange} />);

    // Open dropdown
    fireEvent.click(screen.getByText('Ask permissions'));

    // Click "Plan mode"
    fireEvent.click(screen.getByText('Plan mode'));

    expect(onChange).toHaveBeenCalledWith('plan');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows checkmark on selected mode', () => {
    render(<ModeSelector mode="auto" onModeChange={() => {}} />);
    fireEvent.click(screen.getByText('Auto accept edits'));

    // The checkmark ✓ should appear next to "Auto accept edits"
    // Check the parent element of "Auto accept edits" label contains the checkmark
    const checkmarks = document.querySelectorAll('.ctx-menu-item span');
    const checkmarkSpans = Array.from(checkmarks).filter(
      (el) => el.textContent === '\u2713',
    );
    expect(checkmarkSpans.length).toBe(1);
  });

  it('renders bypass description in danger color', () => {
    render(<ModeSelector mode="ask" onModeChange={() => {}} />);
    fireEvent.click(screen.getByText('Ask permissions'));

    const bypassDesc = screen.getByText('Skip all approval checks');
    expect(bypassDesc.style.color).toBe('var(--status-danger)');
  });

  it('closes dropdown on Escape', () => {
    render(<ModeSelector mode="ask" onModeChange={() => {}} />);
    fireEvent.click(screen.getByText('Ask permissions'));

    // Verify dropdown is open
    expect(screen.getByText('Plan mode')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    // "Plan mode" in dropdown should be gone (only button text remains)
    expect(screen.queryByText('Block all tool execution')).not.toBeInTheDocument();
  });

  it('renders the correct mode when initialized with different values', () => {
    const { rerender } = render(<ModeSelector mode="plan" onModeChange={() => {}} />);
    expect(screen.getByText('Plan mode')).toBeInTheDocument();

    rerender(<ModeSelector mode="bypass" onModeChange={() => {}} />);
    expect(screen.getByText('Bypass permissions')).toBeInTheDocument();
  });
});
