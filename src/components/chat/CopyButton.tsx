import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  /** The raw text to copy to clipboard. */
  text: string;
}

/**
 * A small copy-to-clipboard button that appears on hover (controlled via CSS
 * on the parent `.msg-bubble` container).
 *
 * - Shows Copy icon by default
 * - On click: copies `text`, shows Check icon for 1.5 s, then resets
 */
export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch((err) => {
      console.error('[Zuberi] Clipboard write failed:', err);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="msg-copy-btn"
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied
        ? <Check size={14} style={{ color: 'var(--status-success)' }} />
        : <Copy size={14} />
      }
    </button>
  );
}
