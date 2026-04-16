'use client';

interface ScoreData {
  home_team: string;
  away_team: string;
  home_score: string;
  away_score: string;
  status: string;
  state: string;
  period: number;
  display_clock: string;
  status_detail: string;
  commence_time: string;
  balls?: number | null;
  strikes?: number | null;
  outs?: number | null;
  on_first?: boolean;
  on_second?: boolean;
  on_third?: boolean;
}

function periodLabel(sportKey: string, period: number) {
  if (period === 0) return '';
  if (sportKey === 'basketball_nba') return period <= 4 ? `Q${period}` : `OT${period - 4}`;
  if (sportKey === 'basketball_ncaab') return period <= 2 ? `H${period}` : `OT${period - 2}`;
  return `P${period}`;
}

function formatTipoff(timeStr: string) {
  if (!timeStr) return 'TBD';
  try {
    return new Date(timeStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
  } catch { return timeStr; }
}

function TeamBlock({ name, score, state, isWinning }: { name: string; score: string; state: string; isWinning: boolean }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 24px' }}>
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
        color: isWinning && state === 'post' ? 'var(--accent)' : 'var(--text-muted)',
        textTransform: 'uppercase', textAlign: 'center',
      }}>
        {name}
      </div>
      <div style={{
        fontSize: 52, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1,
        color: state === 'pre' ? 'var(--text-muted)' : isWinning && state === 'post' ? 'var(--text-primary)' : state === 'in' ? 'var(--text-primary)' : 'var(--text-secondary)',
        textShadow: isWinning && state === 'post' ? '0 0 40px rgba(0,229,196,0.2)' : 'none',
      }}>
        {state === 'pre' ? '—' : score}
      </div>
      {isWinning && state === 'post' && (
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.15em' }}>WIN</div>
      )}
    </div>
  );
}

function BaseDiamond({ onFirst, onSecond, onThird }: { onFirst: boolean; onSecond: boolean; onThird: boolean }) {
  const on = 'var(--accent)';
  const off = 'var(--border-bright)';
  const s = 10;
  return (
    <svg width={36} height={36} viewBox="0 0 36 36">
      {/* Second base (top) */}
      <rect x={14} y={2} width={s} height={s} transform="rotate(45 19 7)" fill={onSecond ? on : off} opacity={onSecond ? 1 : 0.3} />
      {/* Third base (left) */}
      <rect x={2} y={14} width={s} height={s} transform="rotate(45 7 19)" fill={onThird ? on : off} opacity={onThird ? 1 : 0.3} />
      {/* First base (right) */}
      <rect x={26} y={14} width={s} height={s} transform="rotate(45 31 19)" fill={onFirst ? on : off} opacity={onFirst ? 1 : 0.3} />
    </svg>
  );
}

export default function ScoreBoard({ score, sportKey, homeTeam, awayTeam, commenceTime }: { score?: ScoreData; sportKey: string; homeTeam?: string; awayTeam?: string; commenceTime?: string }) {
  if (!score) {
    const fallback: ScoreData = {
      home_team: homeTeam ?? '',
      away_team: awayTeam ?? '',
      home_score: '0',
      away_score: '0',
      status: 'pre',
      state: 'pre',
      period: 0,
      display_clock: '',
      status_detail: '',
      commence_time: commenceTime ?? '',
      balls: null,
      strikes: null,
      outs: null,
      on_first: false,
      on_second: false,
      on_third: false,
    };
    return <ScoreBoard score={fallback} sportKey={sportKey} homeTeam={homeTeam} awayTeam={awayTeam} commenceTime={commenceTime} />;
  }

  const { home_team, away_team, home_score, away_score, state, period, display_clock, status_detail, commence_time, balls, strikes, outs, on_first, on_second, on_third } = score;
  const isMlb = sportKey === 'baseball_mlb';

  const homeScoreNum = parseInt(home_score || '0');
  const awayScoreNum = parseInt(away_score || '0');
  const homeWinning = homeScoreNum >= awayScoreNum;

  let statusBar: React.ReactNode;
  if (state === 'in') {
    const p = isMlb ? (status_detail || `P${period}`) : periodLabel(sportKey, period);
    statusBar = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 8px var(--red)', animation: 'pulse 1s infinite', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
            LIVE{p ? ` · ${p}` : ''}{!isMlb && display_clock ? ` · ${display_clock}` : ''}
          </span>
        </div>
        {isMlb && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{balls ?? 0}-{strikes ?? 0} · {outs ?? 0} OUT{outs !== 1 ? 'S' : ''}</span>
            <BaseDiamond onFirst={!!on_first} onSecond={!!on_second} onThird={!!on_third} />
          </div>
        )}
      </div>
    );
  } else if (state === 'post') {
    const finalLabel = isMlb && status_detail && status_detail !== 'Final' ? status_detail : 'FINAL';
    statusBar = (
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.15em' }}>{finalLabel}</span>
    );
  } else {
    const preLabel = isMlb ? 'FIRST PITCH' : 'TIP-OFF';
    statusBar = (
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.1em' }}>
        {preLabel} {formatTipoff(commence_time)}
      </span>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0b1420 0%, #0d1828 100%)',
      border: `1px solid ${state === 'in' ? 'rgba(255,71,87,0.3)' : 'var(--border-bright)'}`,
      borderRadius: 14, marginBottom: 16, overflow: 'hidden',
      boxShadow: state === 'in' ? '0 0 30px rgba(255,71,87,0.08)' : '0 4px 20px rgba(0,0,0,0.3)',
    }}>
      {/* Status bar */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        background: state === 'in' ? 'rgba(255,71,87,0.05)' : 'rgba(255,255,255,0.02)',
      }}>
        {statusBar}
      </div>

      {/* Scores */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <TeamBlock name={away_team} score={away_score} state={state} isWinning={awayScoreNum > homeScoreNum} />

        {/* Divider */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px 0', gap: 4 }}>
          <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
          <span style={{ color: 'var(--border-bright)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: '4px 0' }}>VS</span>
          <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
        </div>

        <TeamBlock name={home_team} score={home_score} state={state} isWinning={homeScoreNum > awayScoreNum} />
      </div>

      {/* Bottom accent for live games */}
      {state === 'in' && (
        <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, var(--red), transparent)', animation: 'scanline 2s ease-in-out infinite' }} />
      )}

      <style>{`
        @keyframes scanline {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
