/**
 * ToolApprovalCard — renders an inline approval card for exec.approval.requested events.
 * Appears in the message stream when permission mode requires user decision ('ask').
 * Shows command, category, countdown timer, and Allow Once / Allow Always / Deny buttons.
 * After decision or expiry: card locks, buttons disabled, shows outcome text.
 */
import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Check, X, Clock } from 'lucide-react';
import type { ApprovalDecision, ApprovalRecord, ApprovalStatus } from '@/types/permissions';

type ToolApprovalCardProps = {
  record: ApprovalRecord;
  onDecision: (id: string, decision: ApprovalDecision) => void;
};

function getStatusLabel(status: ApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'Allowed';
    case 'auto_approved':
      return 'Auto-allowed';
    case 'denied':
      return 'Denied';
    case 'auto_denied':
      return 'Auto-denied';
    case 'expired':
      return 'Expired';
    case 'resolving':
      return 'Resolving\u2026';
    default:
      return '';
  }
}

export function ToolApprovalCard({ record, onDecision }: ToolApprovalCardProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, record.expiresAtMs - Date.now()),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLocked = record.status !== 'pending';

  // Countdown timer — ticks every second while pending
  useEffect(() => {
    if (isLocked) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, record.expiresAtMs - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [record.expiresAtMs, isLocked]);

  const remainingSec = Math.ceil(remainingMs / 1000);

  const commandDisplay = record.commandArgv
    ? record.commandArgv.join(' ')
    : record.command;

  const statusLabel = getStatusLabel(record.status);

  return (
    <div
      className={`tool-block tool-block--approval${isLocked ? ' tool-block--approval-resolved' : ''}`}
    >
      {/* Header: icon + title + category badge + countdown */}
      <div className="tool-block-header tool-block-header--approval">
        <ShieldAlert size={14} className="tool-block-icon tool-block-icon--approval" />
        <span className="tool-block-name">Tool Approval Required</span>
        <span className="approval-category-badge">{record.category}</span>
        {!isLocked && (
          <span className="approval-countdown">
            <Clock size={12} />
            {remainingSec}s
          </span>
        )}
      </div>

      {/* Command details */}
      <div className="tool-block-detail tool-block-detail--approval">
        <div className="approval-command">{commandDisplay}</div>
        {record.cwd && (
          <div className="approval-cwd">cwd: {record.cwd}</div>
        )}
      </div>

      {/* Action buttons or resolved status */}
      <div className="approval-actions">
        {isLocked ? (
          <span className={`approval-status approval-status--${record.status}`}>
            {statusLabel}
          </span>
        ) : (
          <>
            <button
              className="approval-btn approval-btn--allow"
              onClick={() => onDecision(record.id, 'allow-once')}
              type="button"
            >
              <Check size={12} />
              Allow Once
            </button>
            <button
              className="approval-btn approval-btn--always"
              onClick={() => onDecision(record.id, 'allow-always')}
              type="button"
            >
              <Check size={12} />
              Allow Always
            </button>
            <button
              className="approval-btn approval-btn--deny"
              onClick={() => onDecision(record.id, 'deny')}
              type="button"
            >
              <X size={12} />
              Deny
            </button>
          </>
        )}
      </div>
    </div>
  );
}
