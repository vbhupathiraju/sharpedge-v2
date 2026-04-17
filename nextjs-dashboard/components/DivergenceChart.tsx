'use client';
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const KALSHI_COLOR = '#00e5c4';
const SPORTSBOOK_COLOR = '#ff6b9d';

const RANGES = [
  { key: 'all',  label: 'ALL' },
  { key: 'game', label: 'GAME' },
  { key: '1h',   label: '1H' },
  { key: '30m',  label: '30M' },
] as const;

interface DivRow {
  market_ticker: string;
  computed_at: string;
  kalshi_implied_prob: number;
  sportsbook_home_prob: number;
  divergence: number;
}

function parseTs(ts: string): Date {
  return new Date(ts.replace(' ', 'T').replace(/(\.\d+)?$/, '$1Z'));
}

function fmtTime(ts: string) {
  return parseTs(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtPct(v: number) {
  return `${(Number(v) * 100).toFixed(1)}%`;
}

const CustomTooltip = ({ active, payload, label, homeTeam, awayTeam }: any) => {
  if (!active || !payload?.length) return null;
  const kalshi = payload.find((p: any) => p.dataKey === 'kalshi');
  const book = payload.find((p: any) => p.dataKey === 'sportsbook');
  return (
    <div style={{ background: '#0d1520', border: '1px solid #243548', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'Space Mono, monospace', minWidth: 200 }}>
      <div style={{ color: '#6e8caa', marginBottom: 8 }}>{label}</div>
      {homeTeam && <div style={{ color: '#8aa4bf', fontSize: 10, marginBottom: 6, letterSpacing: '0.08em' }}>{homeTeam} WIN PROBABILITY</div>}
      {kalshi && (
        <div style={{ color: KALSHI_COLOR, marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>Kalshi</span>
          <span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(kalshi.value)}</span>
        </div>
      )}
      {book && (
        <div style={{ color: SPORTSBOOK_COLOR, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>Sportsbook Avg</span>
          <span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(book.value)}</span>
        </div>
      )}
      {kalshi && book && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1a2535', color: '#6e8caa', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>Divergence</span>
          <span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(Math.abs(kalshi.value - book.value))}</span>
        </div>
      )}
    </div>
  );
};

export default function DivergenceChart({ data, commenceTime, gameState, homeTeam, awayTeam }: {
  data: DivRow[];
  commenceTime?: string;
  gameState?: string;
  homeTeam?: string;
  awayTeam?: string;
}) {
  const [rangeKey, setRangeKey] = useState<'all' | 'game' | '1h' | '30m'>('all');
  const [hiddenKalshi, setHiddenKalshi] = useState(false);
  const [hiddenBook, setHiddenBook] = useState(false);

  const gameStartMs = useMemo(() => commenceTime ? new Date(commenceTime).getTime() : null, [commenceTime]);
  const preGameStartMs = useMemo(() => gameStartMs ? gameStartMs - 60 * 60 * 1000 : null, [gameStartMs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let cutoff: number;
    if (rangeKey === 'all') {
      cutoff = preGameStartMs ?? 0;
    } else if (rangeKey === 'game') {
      cutoff = gameStartMs ?? preGameStartMs ?? 0;
    } else if (rangeKey === '1h') {
      cutoff = Math.max(now - 60 * 60 * 1000, preGameStartMs ?? 0);
    } else {
      cutoff = Math.max(now - 30 * 60 * 1000, preGameStartMs ?? 0);
    }
    return data.filter(r => parseTs(r.computed_at).getTime() >= cutoff);
  }, [data, rangeKey, gameStartMs, preGameStartMs]);

  // Average across all market_tickers per timestamp
  const chartData = useMemo(() => {
    const byTime: Record<string, { time: string; _ts: number; kalshiSum: number; bookSum: number; count: number }> = {};
    for (const r of filtered) {
      const t = fmtTime(r.computed_at);
      const ts = parseTs(r.computed_at).getTime();
      if (!byTime[t]) byTime[t] = { time: t, _ts: ts, kalshiSum: 0, bookSum: 0, count: 0 };
      byTime[t].kalshiSum += Number(r.kalshi_implied_prob);
      byTime[t].bookSum += Number(r.sportsbook_home_prob);
      byTime[t].count += 1;
    }
    return Object.values(byTime)
      .sort((a, b) => a._ts - b._ts)
      .map(r => ({
        time: r.time,
        kalshi: r.kalshiSum / r.count,
        sportsbook: r.bookSum / r.count,
      }));
  }, [filtered]);

  const Legend = ({ color, dashed, label, hidden, onToggle }: any) => (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: hidden ? 'transparent' : `${color}18`,
      border: `1px solid ${hidden ? 'var(--border)' : color}`,
      borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
      opacity: hidden ? 0.4 : 1, transition: 'all 0.15s',
    }}>
      <svg width={20} height={4}>
        {dashed
          ? <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
          : <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" />
        }
      </svg>
      <span style={{ fontSize: 10, color: hidden ? 'var(--text-muted)' : color, fontFamily: 'var(--font-mono)' }}>{label}</span>
    </button>
  );

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          KALSHI VS SPORTSBOOK — {homeTeam ? `${homeTeam.toUpperCase()} WIN PROB` : 'HOME WIN PROBABILITY'}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRangeKey(r.key)} style={{
              background: rangeKey === r.key ? 'var(--accent)' : 'var(--bg-secondary)',
              color: rangeKey === r.key ? '#040d14' : 'var(--text-muted)',
              border: '1px solid var(--border-bright)', borderRadius: 5,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontWeight: rangeKey === r.key ? 700 : 400,
              transition: 'all 0.15s',
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Legend color={KALSHI_COLOR} dashed={false} label="Kalshi" hidden={hiddenKalshi} onToggle={() => setHiddenKalshi(p => !p)} />
        <Legend color={SPORTSBOOK_COLOR} dashed={true} label="Sportsbook Avg" hidden={hiddenBook} onToggle={() => setHiddenBook(p => !p)} />
      </div>

      {chartData.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>No data for this time range</div>
            <button onClick={() => setRangeKey('all')} style={{
              background: 'var(--accent)', color: '#040d14', border: 'none',
              borderRadius: 5, padding: '4px 12px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontWeight: 700,
            }}>Show All</button>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#4a6580', fontSize: 10, fontFamily: 'Space Mono, monospace' }} tickLine={false} axisLine={{ stroke: '#1a2535' }} interval="preserveStartEnd" />
            <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#4a6580', fontSize: 10, fontFamily: 'Space Mono, monospace' }} tickLine={false} axisLine={false} domain={[0, 1]} width={40} />
            <Tooltip content={<CustomTooltip homeTeam={homeTeam} awayTeam={awayTeam} />} />
            <ReferenceLine y={0.5} stroke="#243548" strokeDasharray="4 4" label={{ value: '50%', fill: '#334a63', fontSize: 10, fontFamily: 'Space Mono' }} />
            {!hiddenKalshi && (
              <Line type="monotone" dataKey="kalshi" name="Kalshi"
                stroke={KALSHI_COLOR} strokeWidth={2}
                dot={false} activeDot={{ r: 5, fill: KALSHI_COLOR, strokeWidth: 0 }}
                connectNulls isAnimationActive={false}
              />
            )}
            {!hiddenBook && (
              <Line type="monotone" dataKey="sportsbook" name="Sportsbook Avg"
                stroke={SPORTSBOOK_COLOR} strokeWidth={2} strokeDasharray="6 3"
                dot={false} activeDot={{ r: 5, fill: SPORTSBOOK_COLOR, strokeWidth: 0 }}
                connectNulls isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
