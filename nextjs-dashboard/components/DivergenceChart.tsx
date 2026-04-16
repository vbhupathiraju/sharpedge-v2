'use client';
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const KALSHI_COLOR = '#00e5c4';
const SPORTSBOOK_COLOR = '#ff6b9d';

const RANGES = [
  { label: '1H', hours: 1 },
  { label: '3H', hours: 3 },
  { label: '6H', hours: 6 },
  { label: 'All', hours: null },
];

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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0d1520', border: '1px solid #243548', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'Space Mono, monospace' }}>
      <div style={{ color: '#6e8caa', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 3 }}>
          {p.name}: <span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtPct(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function DivergenceChart({ data, commenceTime, gameState }: {
  data: DivRow[];
  commenceTime?: string;
  gameState?: string;
}) {
  const [range, setRange] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const timeWindow = useMemo(() => {
    if (!commenceTime) return null;
    return new Date(commenceTime).getTime() - 60 * 60 * 1000;
  }, [commenceTime]);

  const { tickerKeys, allLines } = useMemo(() => {
    const tickers = [...new Set(data.map(r => r.market_ticker))].sort();
    const tkeys = tickers.map(t => ({
      key: `kalshi_${t.split('-').pop()}`,
      label: `Kalshi ${t.split('-').pop()}`,
      ticker: t,
    }));
    const lines = [...tkeys, { key: 'sportsbook_avg', label: 'Sportsbook Avg', ticker: '' }];
    return { tickerKeys: tkeys, allLines: lines };
  }, [data]);

  const filtered = useMemo(() => {
    const windowed = timeWindow
      ? data.filter(r => parseTs(r.computed_at).getTime() >= timeWindow)
      : data;
    if (!range) return windowed;
    const cutoff = Date.now() - range * 60 * 60 * 1000;
    return windowed.filter(r => new Date(r.computed_at).getTime() >= cutoff);
  }, [data, range, timeWindow]);

  const chartData = useMemo(() => {
    const byTime: Record<string, any> = {};
    for (const r of filtered) {
      const t = fmtTime(r.computed_at);
      const ts = parseTs(r.computed_at).getTime();
      if (!byTime[t]) byTime[t] = { time: t, _ts: ts, sportsbook_avg: null };
      const short = r.market_ticker.split('-').pop() || r.market_ticker;
      byTime[t][`kalshi_${short}`] = Number(r.kalshi_implied_prob);
      byTime[t]['sportsbook_avg'] = Number(r.sportsbook_home_prob);
    }
    return Object.values(byTime).sort((a: any, b: any) => a._ts - b._ts);
  }, [filtered]);

  const toggleLine = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          KALSHI VS SPORTSBOOK IMPLIED PROBABILITY
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r.hours)} style={{
              background: range === r.hours ? 'var(--accent)' : 'var(--bg-secondary)',
              color: range === r.hours ? '#040d14' : 'var(--text-muted)',
              border: '1px solid var(--border-bright)', borderRadius: 5,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontWeight: range === r.hours ? 700 : 400,
              transition: 'all 0.15s',
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {allLines.map(l => {
          const color = l.key === 'sportsbook_avg' ? SPORTSBOOK_COLOR : KALSHI_COLOR;
          const isDashed = l.key === 'sportsbook_avg';
          const isHidden = hidden.has(l.key);
          return (
            <button key={l.key} onClick={() => toggleLine(l.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: isHidden ? 'transparent' : `${color}18`,
              border: `1px solid ${isHidden ? 'var(--border)' : color}`,
              borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
              opacity: isHidden ? 0.4 : 1, transition: 'all 0.15s',
            }}>
              <svg width={20} height={4}>
                {isDashed
                  ? <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
                  : <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2" />
                }
              </svg>
              <span style={{ fontSize: 10, color: isHidden ? 'var(--text-muted)' : color, fontFamily: 'var(--font-mono)' }}>{l.label}</span>
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>No data for this time range</div>
            <button onClick={() => setRange(null)} style={{
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
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0.5} stroke="#243548" strokeDasharray="4 4" label={{ value: '50%', fill: '#334a63', fontSize: 10, fontFamily: 'Space Mono' }} />
            {tickerKeys.map(l => (
              !hidden.has(l.key) && (
                <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
                  stroke={KALSHI_COLOR} strokeWidth={2}
                  dot={{ r: 3, fill: KALSHI_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  connectNulls isAnimationActive={false}
                />
              )
            ))}
            {!hidden.has('sportsbook_avg') && (
              <Line type="monotone" dataKey="sportsbook_avg" name="Sportsbook Avg"
                stroke={SPORTSBOOK_COLOR} strokeWidth={2} strokeDasharray="6 3"
                dot={{ r: 3, fill: SPORTSBOOK_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                connectNulls isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
