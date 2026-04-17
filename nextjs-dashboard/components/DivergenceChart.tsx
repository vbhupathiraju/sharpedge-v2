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
  const kHome = payload.find((p: any) => p.dataKey === 'kalshi_home');
  const kAway = payload.find((p: any) => p.dataKey === 'kalshi_away');
  const bHome = payload.find((p: any) => p.dataKey === 'book_home');
  const bAway = payload.find((p: any) => p.dataKey === 'book_away');
  return (
    <div style={{ background: '#0d1520', border: '1px solid #243548', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'Space Mono, monospace', minWidth: 220 }}>
      <div style={{ color: '#6e8caa', marginBottom: 10 }}>{label}</div>

      {/* Home team */}
      <div style={{ color: '#8aa4bf', fontSize: 10, letterSpacing: '0.08em', marginBottom: 4 }}>{homeTeam ?? 'HOME'}</div>
      {kHome && <div style={{ color: KALSHI_COLOR, marginBottom: 2, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span>Kalshi</span><span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(kHome.value)}</span>
      </div>}
      {bHome && <div style={{ color: SPORTSBOOK_COLOR, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span>Sportsbook</span><span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(bHome.value)}</span>
      </div>}

      {/* Away team */}
      <div style={{ color: '#8aa4bf', fontSize: 10, letterSpacing: '0.08em', marginBottom: 4 }}>{awayTeam ?? 'AWAY'}</div>
      {kAway && <div style={{ color: KALSHI_COLOR, marginBottom: 2, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span>Kalshi</span><span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(kAway.value)}</span>
      </div>}
      {bAway && <div style={{ color: SPORTSBOOK_COLOR, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span>Sportsbook</span><span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(bAway.value)}</span>
      </div>}

      {/* Divergence */}
      {kHome && bHome && <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid #1a2535', color: '#6e8caa', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span>Divergence</span><span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(Math.abs(kHome.value - bHome.value))}</span>
      </div>}
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
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const gameStartMs = useMemo(() => commenceTime ? new Date(commenceTime).getTime() : null, [commenceTime]);
  const preGameStartMs = useMemo(() => gameStartMs ? gameStartMs - 60 * 60 * 1000 : null, [gameStartMs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let cutoff: number;
    if (rangeKey === 'all') cutoff = preGameStartMs ?? 0;
    else if (rangeKey === 'game') cutoff = gameStartMs ?? preGameStartMs ?? 0;
    else if (rangeKey === '1h') cutoff = Math.max(now - 60 * 60 * 1000, preGameStartMs ?? 0);
    else cutoff = Math.max(now - 30 * 60 * 1000, preGameStartMs ?? 0);
    return data.filter(r => parseTs(r.computed_at).getTime() >= cutoff);
  }, [data, rangeKey, gameStartMs, preGameStartMs]);

  const chartData = useMemo(() => {
    const byTime: Record<string, { time: string; _ts: number; kSum: number; bSum: number; count: number }> = {};
    for (const r of filtered) {
      const t = fmtTime(r.computed_at);
      const ts = parseTs(r.computed_at).getTime();
      if (!byTime[t]) byTime[t] = { time: t, _ts: ts, kSum: 0, bSum: 0, count: 0 };
      byTime[t].kSum += Number(r.kalshi_implied_prob);
      byTime[t].bSum += Number(r.sportsbook_home_prob);
      byTime[t].count += 1;
    }
    return Object.values(byTime)
      .sort((a, b) => a._ts - b._ts)
      .map(r => ({
        time: r.time,
        kalshi_home: r.kSum / r.count,
        kalshi_away: 1 - (r.kSum / r.count),
        book_home: r.bSum / r.count,
        book_away: 1 - (r.bSum / r.count),
      }));
  }, [filtered]);

  const toggle = (key: string) => setHidden(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const LegendBtn = ({ dataKey, color, dashed, label }: { dataKey: string; color: string; dashed: boolean; label: string }) => {
    const isHidden = hidden.has(dataKey);
    return (
      <button onClick={() => toggle(dataKey)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: isHidden ? 'transparent' : `${color}18`,
        border: `1px solid ${isHidden ? 'var(--border)' : color}`,
        borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
        opacity: isHidden ? 0.4 : 1, transition: 'all 0.15s',
      }}>
        <svg width={20} height={4}>
          {dashed
            ? <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
            : <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" />
          }
        </svg>
        <span style={{ fontSize: 10, color: isHidden ? 'var(--text-muted)' : color, fontFamily: 'var(--font-mono)' }}>{label}</span>
      </button>
    );
  };

  const homeLabel = homeTeam ?? 'Home';
  const awayLabel = awayTeam ?? 'Away';

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          KALSHI VS SPORTSBOOK IMPLIED PROBABILITY
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 60 }}>{homeLabel.split(' ').pop()?.toUpperCase()}</span>
          <LegendBtn dataKey="kalshi_home" color={KALSHI_COLOR} dashed={false} label="Kalshi" />
          <LegendBtn dataKey="book_home" color={SPORTSBOOK_COLOR} dashed={false} label="Sportsbook" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 60 }}>{awayLabel.split(' ').pop()?.toUpperCase()}</span>
          <LegendBtn dataKey="kalshi_away" color={KALSHI_COLOR} dashed={true} label="Kalshi" />
          <LegendBtn dataKey="book_away" color={SPORTSBOOK_COLOR} dashed={true} label="Sportsbook" />
        </div>
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
            {!hidden.has('kalshi_home') && <Line type="monotone" dataKey="kalshi_home" stroke={KALSHI_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5, fill: KALSHI_COLOR, strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
            {!hidden.has('kalshi_away') && <Line type="monotone" dataKey="kalshi_away" stroke={KALSHI_COLOR} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 5, fill: KALSHI_COLOR, strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
            {!hidden.has('book_home') && <Line type="monotone" dataKey="book_home" stroke={SPORTSBOOK_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5, fill: SPORTSBOOK_COLOR, strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
            {!hidden.has('book_away') && <Line type="monotone" dataKey="book_away" stroke={SPORTSBOOK_COLOR} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 5, fill: SPORTSBOOK_COLOR, strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
