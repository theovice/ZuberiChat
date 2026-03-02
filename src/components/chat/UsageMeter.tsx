import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getStats5h,
  getStatsWeek,
  getLimits,
  type UsageStats,
  type UsageLimits,
} from '../../services/usageTracker';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
function usageColor(percent: number): string {
  if (percent < 50) return '#22c55e';
  if (percent <= 80) return '#f59e0b';
  return '#ef4444';
}

// ---------------------------------------------------------------------------
// ArcGauge — 270-degree SVG speedometer arc
// ---------------------------------------------------------------------------
interface ArcGaugeProps {
  label: string;
  value: string;        // e.g. "$0.10"
  subtitle: string;     // e.g. "7 calls"
  percent: number;      // 0-100
  size?: number;
}

function ArcGauge({ label, value, subtitle, percent, size = 100 }: ArcGaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;

  // 270-degree arc: starts at 135deg, ends at 405deg (135 + 270)
  const startAngle = 135;
  const totalArc = 270;
  const endAngleFull = startAngle + totalArc;
  const endAngleFilled = startAngle + (totalArc * Math.min(percent, 100)) / 100;

  const polarToXY = (angle: number, r: number) => ({
    x: cx + r * Math.cos((angle * Math.PI) / 180),
    y: cy + r * Math.sin((angle * Math.PI) / 180),
  });

  const arcPath = (startDeg: number, endDeg: number, r: number) => {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const sweep = endDeg - startDeg;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const color = usageColor(percent);

  return (
    <div className="usage-arc-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={arcPath(startAngle, endAngleFull, radius)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {percent > 0 && (
          <path
            d={arcPath(startAngle, endAngleFilled, radius)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Center value */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontWeight="bold"
          fontSize="18"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {value}
        </text>
      </svg>
      <div className="usage-arc-subtitle">{subtitle}</div>
      <div className="usage-arc-label">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RefreshIcon — tiny inline SVG
// ---------------------------------------------------------------------------
function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? 'usage-spin' : ''}
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MeterIcon — speedometer SVG for the titlebar
// ---------------------------------------------------------------------------
function MeterIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      {/* Gauge arc */}
      <path
        d="M4.93 4.93A10 10 0 0 1 12 2c5.52 0 10 4.48 10 10 0 2.76-1.12 5.26-2.93 7.07"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M4.93 4.93A10 10 0 0 0 2 12c0 2.76 1.12 5.26 2.93 7.07"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Needle */}
      <line x1="12" y1="12" x2="16" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx="12" cy="12" r="2" fill={color} />
      {/* Base line */}
      <line x1="4" y1="19" x2="20" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// UsageMeter — main export: icon button + dropdown panel
// ---------------------------------------------------------------------------
export function UsageMeter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats5h, setStats5h] = useState<UsageStats | null>(null);
  const [statsWeek, setStatsWeek] = useState<UsageStats | null>(null);
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s5, sw, lm] = await Promise.all([getStats5h(), getStatsWeek(), getLimits()]);
      setStats5h(s5);
      setStatsWeek(sw);
      setLimits(lm);
    } catch (err) {
      console.error('[UsageMeter] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on first open
  useEffect(() => {
    if (open && !stats5h) {
      fetchData();
    }
  }, [open, stats5h, fetchData]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Determine icon color from monthly percent
  const pct = limits?.percent_used ?? 0;
  const iconColor = usageColor(pct);
  const barColor = limits ? usageColor(limits.percent_used) : '#22c55e';

  // 5h gauge percent: use cost relative to $2/day soft cap (scaled to 5h)
  const pct5h = stats5h ? Math.min((stats5h.total_cost_usd / 0.42) * 100, 100) : 0;
  // week gauge percent: use cost relative to $5 weekly soft estimate
  const pctWeek = statsWeek ? Math.min((statsWeek.total_cost_usd / 5) * 100, 100) : 0;

  return (
    <>
      {/* Titlebar icon button */}
      <button
        ref={buttonRef}
        className="titlebar-button usage-meter-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="API Usage"
        title="API Usage"
      >
        <MeterIcon color={iconColor} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div ref={panelRef} className="usage-panel">
          {/* Header */}
          <div className="usage-panel-header">
            <span className="usage-panel-title">API Usage</span>
            <button
              className="usage-refresh-btn"
              onClick={fetchData}
              disabled={loading}
              aria-label="Refresh usage"
            >
              <RefreshIcon spinning={loading} />
            </button>
          </div>

          {/* Gauges row */}
          <div className="usage-gauges-row">
            <ArcGauge
              label="5h Rolling"
              value={stats5h ? `$${stats5h.total_cost_usd.toFixed(2)}` : '...'}
              subtitle={stats5h ? `${stats5h.total_events} calls` : ''}
              percent={pct5h}
            />
            <ArcGauge
              label="This Week"
              value={statsWeek ? `$${statsWeek.total_cost_usd.toFixed(2)}` : '...'}
              subtitle={statsWeek ? `${statsWeek.total_events} calls` : ''}
              percent={pctWeek}
            />
          </div>

          {/* Monthly budget bar */}
          <div className="usage-budget-section">
            <div className="usage-budget-label-row">
              <span>Monthly Budget</span>
              <span>{limits ? `${limits.percent_used}% used` : ''}</span>
            </div>
            <div className="usage-budget-bar-bg">
              <div
                className="usage-budget-bar-fill"
                style={{
                  width: `${Math.min(limits?.percent_used ?? 0, 100)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
            <div className="usage-budget-amount">
              {limits
                ? `$${limits.monthly_spent_usd.toFixed(2)} / $${limits.monthly_limit_usd.toFixed(2)}`
                : '...'}
            </div>
          </div>

          {/* Last dispatch info */}
          <div className="usage-last-dispatch">
            {stats5h && stats5h.total_events > 0
              ? `Last: 2m ago \u2014 ${((stats5h.total_input_tokens + stats5h.total_output_tokens) / 1000).toFixed(1)}K tok \u2014 $${(stats5h.total_cost_usd / stats5h.total_events).toFixed(2)}`
              : 'No dispatches yet'}
          </div>
        </div>
      )}
    </>
  );
}
