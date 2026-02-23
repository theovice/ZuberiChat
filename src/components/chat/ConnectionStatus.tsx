import { useEffect, useRef, useState } from 'react';

// ============================================
// Types
// ============================================
type ConnectionStatusProps = {
  status: 'connecting' | 'connected' | 'disconnected';
};

type AnimPhase =
  | 'idle'
  | 'textExpand'
  | 'textCollapse'
  | 'iconAppear'
  | 'iconFloat'
  | 'turnRed'
  | 'crack'
  | 'discTextExpand'
  | 'discIdle'
  | 'reconnectFade'
  | 'reconnectIcon';

// ============================================
// Timing constants (ms, already multiplied)
// ============================================
const TIMING = {
  textExpand: 420 * 0.85,        // ~357ms
  textCollapse: 380 * 1.0,       // 380ms
  iconAppear: 600 * 0.50,        // 300ms (CSS animation duration 600ms at mult)
  turnRed: 400 * 0.65,           // 260ms
  crack: 500 * 0.92,             // 460ms
  discTextExpand: 420 * 0.87,    // ~365ms
  iconSettleDuration: 1200,      // full settle animation
  reconnectFade: 300,
} as const;

// ============================================
// Keyframe styles (injected once)
// ============================================
const KEYFRAME_CSS = `
@keyframes zcs-iconSettle {
  0%   { transform: scale(0);     filter: drop-shadow(0 0 0px rgba(240,160,32,0)); }
  65%  { transform: scale(2.154); filter: drop-shadow(0 0 20px rgba(240,160,32,0.85)); }
  82%  { transform: scale(1.88);  filter: drop-shadow(0 0 12px rgba(240,160,32,0.5)); }
  100% { transform: scale(1.923); filter: drop-shadow(0 0 9px rgba(240,160,32,0.38)); }
}
@keyframes zcs-diamondFloat {
  0%,100% { transform: scale(1.923); filter: drop-shadow(0 0 9px rgba(240,160,32,0.38)); }
  50%     { transform: scale(1.923); filter: drop-shadow(0 0 18px rgba(240,160,32,0.68)); }
}
@keyframes zcs-crackLeft {
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateX(-18px) rotate(-12deg); opacity: 0; }
}
@keyframes zcs-crackRight {
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateX(18px) rotate(12deg); opacity: 0; }
}
`;

// ============================================
// Zuberi Diamond SVG (50×50, viewBox 0 0 120 120)
// ============================================
function DiamondSVG({ tint }: { tint?: string }) {
  const overlayOpacity = tint === 'red' ? 0.6 : 0;
  return (
    <svg width="50" height="50" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="zcs-topHighlight" x1="60" y1="8" x2="60" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id="zcs-bottomShadow" x1="60" y1="70" x2="60" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </linearGradient>
      </defs>
      {/* obsidian facets */}
      <polygon points="60,8 108,60 60,112 12,60" fill="#0a0908" />
      <polygon points="60,8 80,34 60,40 40,34"   fill="#38322a" />
      <polygon points="108,60 80,34 60,40 80,72"  fill="#242018" />
      <polygon points="12,60 40,34 60,40 40,72"   fill="#181614" />
      <polygon points="60,112 40,72 60,66 80,72"  fill="#0a0806" />
      <polygon points="12,60 40,72 60,66 60,112"  fill="#0e0c0a" />
      <polygon points="108,60 80,72 60,66 60,112" fill="#0c0a08" />
      {/* highlight overlay */}
      <polygon points="60,8 80,34 60,40 40,34" fill="url(#zcs-topHighlight)" />
      {/* shadow overlay */}
      <polygon points="60,112 40,72 60,66 80,72" fill="url(#zcs-bottomShadow)" />
      {/* interior lines */}
      <line x1="12" y1="60" x2="108" y2="60" stroke="rgba(190,182,165,0.35)" strokeWidth="0.8" />
      <line x1="60" y1="8"  x2="40"  y2="34" stroke="rgba(185,177,160,0.55)" strokeWidth="0.7" />
      <line x1="60" y1="8"  x2="80"  y2="34" stroke="rgba(170,162,146,0.50)" strokeWidth="0.7" />
      <line x1="40" y1="34" x2="60"  y2="40" stroke="rgba(150,142,126,0.40)" strokeWidth="0.6" />
      <line x1="80" y1="34" x2="60"  y2="40" stroke="rgba(140,132,116,0.38)" strokeWidth="0.6" />
      {/* red tint overlay */}
      <polygon
        points="60,8 108,60 60,112 12,60"
        fill="#c03030"
        opacity={overlayOpacity}
        style={{ transition: `opacity ${TIMING.turnRed}ms ease-in-out` }}
      />
    </svg>
  );
}

// ============================================
// Animated text helper: chars expand/collapse from center
// ============================================
function AnimatedText({
  text,
  color,
  phase,
  duration,
}: {
  text: string;
  color: string;
  phase: 'expand' | 'collapse' | 'visible' | 'hidden';
  duration: number;
}) {
  const chars = text.split('');
  const mid = chars.length / 2;

  return (
    <span
      style={{
        display: 'inline-flex',
        fontSize: '0.78rem',
        letterSpacing: '0.06em',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 500,
        whiteSpace: 'pre',
      }}
      aria-label={text}
    >
      {chars.map((char, i) => {
        const distFromCenter = Math.abs(i - mid);
        // Inner chars animate first for expand, outer first for collapse
        const delayExpand = distFromCenter * 18;
        const delayCollapse = (mid - distFromCenter) * 18;

        let opacity = 0;
        let transform = 'translateY(6px) scale(0.7)';
        let transition = `opacity ${duration * 0.6}ms ease-out, transform ${duration * 0.6}ms ease-out`;

        if (phase === 'expand') {
          opacity = 1;
          transform = 'translateY(0) scale(1)';
          transition = `opacity ${duration * 0.6}ms ease-out ${delayExpand}ms, transform ${duration * 0.6}ms ease-out ${delayExpand}ms`;
        } else if (phase === 'collapse') {
          opacity = 0;
          transform = 'translateY(-4px) scale(0.8)';
          transition = `opacity ${duration * 0.5}ms ease-in ${delayCollapse}ms, transform ${duration * 0.5}ms ease-in ${delayCollapse}ms`;
        } else if (phase === 'visible') {
          opacity = 1;
          transform = 'translateY(0) scale(1)';
        }
        // 'hidden' keeps defaults (opacity 0)

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              color,
              opacity,
              transform,
              transition,
              minWidth: char === ' ' ? '0.25em' : undefined,
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

// ============================================
// Main Component
// ============================================
export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const [phase, setPhase] = useState<AnimPhase>('idle');
  const prevStatusRef = useRef<string>(status);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Inject keyframes once
  useEffect(() => {
    const id = 'zcs-keyframes';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = KEYFRAME_CSS;
      document.head.appendChild(style);
    }
  }, []);

  // Clear all pending timers
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  };

  // ── Animation sequences ──
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    clearTimers();

    if (status === 'connecting' || status === 'connected') {
      if (prev === 'disconnected' && phase === 'discIdle') {
        // ── Reconnect sequence: fade "Connection lost" → icon springs in
        setPhase('reconnectFade');
        schedule(() => setPhase('reconnectIcon'), TIMING.reconnectFade);
        schedule(() => setPhase('iconFloat'), TIMING.reconnectFade + TIMING.iconSettleDuration);
      } else if (prev === 'disconnected' || prev === status) {
        // ── Fresh connect / mount: text expand → collapse → icon
        setPhase('textExpand');
        schedule(() => setPhase('textCollapse'), TIMING.textExpand + 200);
        schedule(() => setPhase('iconAppear'), TIMING.textExpand + 200 + TIMING.textCollapse);
        schedule(
          () => setPhase('iconFloat'),
          TIMING.textExpand + 200 + TIMING.textCollapse + TIMING.iconSettleDuration,
        );
      }
    } else if (status === 'disconnected') {
      // ── Disconnect sequence: turn red → crack → "Connection lost"
      setPhase('turnRed');
      schedule(() => setPhase('crack'), TIMING.turnRed + 100);
      schedule(() => setPhase('discTextExpand'), TIMING.turnRed + 100 + TIMING.crack);
      schedule(
        () => setPhase('discIdle'),
        TIMING.turnRed + 100 + TIMING.crack + TIMING.discTextExpand + 200,
      );
    }

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Kick off the startup animation on mount ──
  useEffect(() => {
    setPhase('textExpand');
    const t1 = setTimeout(() => setPhase('textCollapse'), TIMING.textExpand + 200);
    const t2 = setTimeout(
      () => setPhase('iconAppear'),
      TIMING.textExpand + 200 + TIMING.textCollapse,
    );
    const t3 = setTimeout(
      () => setPhase('iconFloat'),
      TIMING.textExpand + 200 + TIMING.textCollapse + TIMING.iconSettleDuration,
    );
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // ── Render ──
  const showConnectText =
    phase === 'textExpand' || phase === 'textCollapse';
  const showIcon =
    phase === 'iconAppear' ||
    phase === 'iconFloat' ||
    phase === 'turnRed' ||
    phase === 'crack' ||
    phase === 'reconnectIcon';
  const showDiscText =
    phase === 'discTextExpand' || phase === 'discIdle';
  const showReconnectFade = phase === 'reconnectFade';

  const isRedTint = phase === 'turnRed' || phase === 'crack';
  const isCracking = phase === 'crack';
  const isSettling = phase === 'iconAppear' || phase === 'reconnectIcon';
  const isFloating = phase === 'iconFloat';

  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* ── "Connected to OpenClaw" text ── */}
      {showConnectText && (
        <AnimatedText
          text="Connected to OpenClaw"
          color="#f0a020"
          phase={phase === 'textExpand' ? 'expand' : 'collapse'}
          duration={phase === 'textExpand' ? TIMING.textExpand : TIMING.textCollapse}
        />
      )}

      {/* ── Diamond icon ── */}
      {showIcon && !isCracking && (
        <div
          style={{
            animation: isSettling
              ? `zcs-iconSettle ${TIMING.iconSettleDuration}ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards`
              : isFloating
                ? 'zcs-diamondFloat 3s ease-in-out infinite'
                : 'none',
            transform: isFloating ? 'scale(1.923)' : undefined,
            filter: isFloating
              ? 'drop-shadow(0 0 9px rgba(240,160,32,0.38))'
              : undefined,
          }}
        >
          <DiamondSVG tint={isRedTint ? 'red' : undefined} />
        </div>
      )}

      {/* ── Crack animation: two halves split apart ── */}
      {isCracking && (
        <div style={{ position: 'relative', width: 50, height: 50 }}>
          {/* Left half */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
              animation: `zcs-crackLeft ${TIMING.crack}ms ease-in forwards`,
              transform: 'scale(1.923)',
              filter: 'drop-shadow(0 0 9px rgba(240,160,32,0.38))',
            }}
          >
            <DiamondSVG tint="red" />
          </div>
          {/* Right half */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)',
              animation: `zcs-crackRight ${TIMING.crack}ms ease-in forwards`,
              transform: 'scale(1.923)',
              filter: 'drop-shadow(0 0 9px rgba(240,160,32,0.38))',
            }}
          >
            <DiamondSVG tint="red" />
          </div>
        </div>
      )}

      {/* ── "Connection lost" text ── */}
      {(showDiscText || showReconnectFade) && (
        <div
          style={{
            opacity: showReconnectFade ? 0 : 1,
            transition: showReconnectFade
              ? `opacity ${TIMING.reconnectFade}ms ease-out`
              : undefined,
          }}
        >
          <AnimatedText
            text="Connection lost"
            color="#c03030"
            phase={
              phase === 'discTextExpand'
                ? 'expand'
                : phase === 'discIdle' || phase === 'reconnectFade'
                  ? 'visible'
                  : 'hidden'
            }
            duration={TIMING.discTextExpand}
          />
        </div>
      )}
    </div>
  );
}
