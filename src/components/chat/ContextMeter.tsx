/**
 * ContextMeter — inline progress bar showing token usage in the 131K context window.
 * Lives in the input toolbar between ModeSelector and ModelSelector.
 * Fill color shifts by threshold: muted → ember → ember-deep → send-bg.
 * Hover tooltip shows exact token counts formatted with commas.
 */
import { useState } from 'react';

type ContextMeterProps = {
  tokenCount: number | null;
  tokenLimit?: number;
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function getFillColor(pct: number): string {
  if (pct >= 0.9) return 'var(--send-bg)';
  if (pct >= 0.7) return 'var(--ember-deep)';
  if (pct >= 0.5) return 'var(--ember)';
  return 'var(--text-muted)';
}

export function ContextMeter({ tokenCount, tokenLimit = 131072 }: ContextMeterProps) {
  const [hovered, setHovered] = useState(false);

  const pct = tokenCount !== null ? Math.min(tokenCount / tokenLimit, 1) : 0;
  const widthPct = `${(pct * 100).toFixed(1)}%`;
  const fillColor = tokenCount !== null ? getFillColor(pct) : 'transparent';

  const tooltipText =
    tokenCount !== null
      ? `${formatNumber(tokenCount)} / ${formatNumber(tokenLimit)} tokens`
      : '\u2014';

  return (
    <div
      className="context-meter"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="context-meter-track">
        {tokenCount !== null && (
          <div
            className="context-meter-fill"
            style={{ width: widthPct, backgroundColor: fillColor }}
          />
        )}
      </div>
      {hovered && (
        <div className="context-meter-tooltip" style={{ opacity: 1 }}>
          {tooltipText}
        </div>
      )}
    </div>
  );
}
