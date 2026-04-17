'use client';
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

const BOOK_COLORS: Record<string, string> = {
  draftkings: '#00e5c4',
  fanduel:    '#4dabf7',
  betmgm:     '#ffa502',
  betrivers:  '#ff4757',
  caesars:    '#ff6b9d',
  pointsbet:  '#55efc4',
  bet365:     '#fd79a8',
};
const FALLBACK_COLORS = ['#74b9ff', '#fd79a8', '#badc58', '#f9ca24'];

function bookColor(book: string, idx: number): string {
  return BOOK_COLORS[book.toLowerCase()] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

interface OddsRow {
  team: string;
  bookmaker_key: string;
  computed_at: string;
  american_odds: number;
}

function fmtOdds(v: number) {
  const n = Math.round(Number(v));
  return n > 0 ? `+${n}` : `${n}`;
}

function parseTs(ts: string): Date {
  return new Date(ts.replace(' ', 'T').replace(/(\.\d+)?$/, '$1Z'));
}

function fmtTime(ts: string) {
  return parseTs(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

const CustomTooltip = ({ active, payload, label, homeTeam, colorMap, seriesKeys }: any) => {
  if (!active || !payload?.length) return null;
  const byTeam: Record<string, any[]> = {};
  for (const p of payload) {
    const [team, book] = p.dataKey.split('__');
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push({ book, color: p.color, value: p.value });
  }
  return (
    <div style={{ background: '#0d1520', border: '1px solid #243548', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'Space Mono, monospace', minWidth: 180 }}>
      <div style={{ color: '#6e8caa', marginBottom: 8 }}>{label}</div>
      {Object.entries(byTeam).map(([team, books]) => {
        const isHome = homeTeam && team === homeTeam;
        return (
          <div key={team} style={{ marginBottom: 8 }}>
            <div style={{ color: '#8aa4bf', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={16} height={4}>
                {isHome
                  ? <line x1="0" y1="2" x2="16" y2="2" stroke="#8aa4bf" strokeWidth="1.5" />
                  : <line x1="0" y1="2" x2="16" y2="2" stroke="#8aa4bf" strokeWidth="1.5" strokeDasharray="4 2" />
                }
              </svg>
              {team}
            </div>
            {books.map(({ book, color, value }) => (
              <div key={book} style={{ color, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width={14} height={4}>
                    {isHome
                      ? <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="1.5" />
                      : <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="1.5" strokeDasharray="4 2" />
                    }
                  </svg>
                  <span>{book}</span>
                </div>
                <span style={{ color: '#eaf2ff', fontWeight: 700 }}>{fmtOdds(value)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default function OddsChart({ data, title, homeTeam, commenceTime, gameState }: {
  data: OddsRow[];
  title: string;
  homeTeam?: string;
  commenceTime?: string;
  gameState?: string;
}) {
  const [rangeKey, setRangeKey] = useState<'all' | 'game' | '1h' | '30m'>('all');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const gameStartMs = useMemo(() => {
    if (!commenceTime) return null;
    return new Date(commenceTime).getTime();
  }, [commenceTime]);

  const preGameStartMs = useMemo(() => {
    if (!gameStartMs) return null;
    return gameStartMs - 60 * 60 * 1000;
  }, [gameStartMs]);

  const RANGES = [
    { key: 'all',  label: 'ALL' },
    { key: 'game', label: 'GAME' },
    { key: '1h',   label: '1H' },
    { key: '30m',  label: '30M' },
  ] as const;

  const { seriesKeys, colorMap, teamGroups } = useMemo(() => {
    const valid = data.filter(r => {
      const v = Number(r.american_odds);
      return !isNaN(v) && v >= -2500 && v <= 2500;
    });
    const books = [...new Set(valid.map(r => r.bookmaker_key))].sort();
    const teams = [...new Set(valid.map(r => r.team))].sort((a, b) => {
      if (homeTeam) {
        if (a === homeTeam) return -1;
        if (b === homeTeam) return 1;
      }
      return a.localeCompare(b);
    });
    const keys: string[] = [];
    for (const team of teams) {
      for (const book of books) {
        const exists = valid.some(r => r.team === team && r.bookmaker_key === book);
        if (exists) keys.push(`${team}__${book}`);
      }
    }
    const bookIdx: Record<string, number> = {};
    let idx = 0;
    books.forEach(b => { bookIdx[b] = idx++; });
    const cmap: Record<string, string> = {};
    keys.forEach(k => {
      const book = k.split('__')[1];
      cmap[k] = bookColor(book, bookIdx[book]);
    });
    const groups: Record<string, string[]> = {};
    for (const key of keys) {
      const team = key.split('__')[0];
      if (!groups[team]) groups[team] = [];
      groups[team].push(key);
    }
    return { seriesKeys: keys, colorMap: cmap, teamGroups: groups };
  }, [data, homeTeam]);

  const clean = useMemo(() => {
    const valid = data.filter(r => {
      const v = Number(r.american_odds);
      return !isNaN(v) && v >= -2500 && v <= 2500;
    });
    const now = Date.now();
    // ALL: 1hr before game start → now
    // GAME: game start → now
    // 1H: max(1hr ago, 1hr before game start) → now
    // 30M: max(30min ago, 1hr before game start) → now
    let cutoff: number;
    if (rangeKey === 'all') {
      cutoff = preGameStartMs ?? 0;
    } else if (rangeKey === 'game') {
      cutoff = gameStartMs ?? preGameStartMs ?? 0;
    } else if (rangeKey === '1h') {
      const oneHrAgo = now - 60 * 60 * 1000;
      cutoff = Math.max(oneHrAgo, preGameStartMs ?? 0);
    } else {
      const thirtyAgo = now - 30 * 60 * 1000;
      cutoff = Math.max(thirtyAgo, preGameStartMs ?? 0);
    }
    return valid.filter(r => parseTs(r.computed_at).getTime() >= cutoff);
  }, [data, rangeKey, gameStartMs, preGameStartMs]);

  const chartData = useMemo(() => {
    const byTime: Record<string, any> = {};
    for (const r of clean) {
      const t = fmtTime(r.computed_at);
      const ts = parseTs(r.computed_at).getTime();
      if (!byTime[t]) byTime[t] = { time: t, _ts: ts };
      byTime[t][`${r.team}__${r.bookmaker_key}`] = Number(r.american_odds);
    }
    return Object.values(byTime).sort((a: any, b: any) => a._ts - b._ts);
  }, [clean]);

  const toggleLine = (key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleTeam = (team: string) => {
    const keys = teamGroups[team] || [];
    const allHidden = keys.every(k => hidden.has(k));
    setHidden(prev => {
      const next = new Set(prev);
      if (allHidden) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const isHome = (team: string) => !!(homeTeam && team === homeTeam);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
          {title.toUpperCase()}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {Object.entries(teamGroups).map(([team, keys]) => {
          const allHidden = keys.every(k => hidden.has(k));
          const solid = isHome(team);
          return (
            <div key={team}>
              <button onClick={() => toggleTeam(team)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, width: '100%',
                opacity: allHidden ? 0.4 : 1, transition: 'opacity 0.15s',
              }}>
                <svg width={16} height={4}>
                  {solid
                    ? <line x1="0" y1="2" x2="16" y2="2" stroke="var(--border-bright)" strokeWidth="2" />
                    : <line x1="0" y1="2" x2="16" y2="2" stroke="var(--border-bright)" strokeWidth="2" strokeDasharray="4 2" />
                  }
                </svg>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {team}{solid ? ' (home)' : ' (away)'}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{allHidden ? 'show' : 'hide'}</span>
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 8 }}>
                {keys.map(key => {
                  const book = key.split('__')[1];
                  const color = colorMap[key];
                  const isHidden = hidden.has(key);
                  return (
                    <button key={key} onClick={() => toggleLine(key)} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: isHidden ? 'transparent' : `${color}18`,
                      border: `1px solid ${isHidden ? 'var(--border)' : color}`,
                      borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
                      opacity: isHidden ? 0.35 : 1, transition: 'all 0.15s',
                    }}>
                      <svg width={14} height={4}>
                        {solid
                          ? <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2" />
                          : <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
                        }
                      </svg>
                      <span style={{ fontSize: 10, color: isHidden ? 'var(--text-muted)' : color, fontFamily: 'var(--font-mono)' }}>{book}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
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
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#4a6580', fontSize: 10, fontFamily: 'Space Mono, monospace' }} tickLine={false} axisLine={{ stroke: '#1a2535' }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtOdds} tick={{ fill: '#4a6580', fontSize: 10, fontFamily: 'Space Mono, monospace' }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<CustomTooltip homeTeam={homeTeam} colorMap={colorMap} seriesKeys={seriesKeys} />} />
            <ReferenceLine y={0} stroke="#243548" strokeDasharray="4 4" />
            {seriesKeys.map(key => {
              const team = key.split('__')[0];
              const solid = isHome(team);
              return !hidden.has(key) && (
                <Line key={key} type="monotone" dataKey={key}
                  name={key.split('__')[1]}
                  stroke={colorMap[key]} strokeWidth={2}
                  strokeDasharray={solid ? undefined : '6 3'}
                  dot={false}
                  activeDot={{ r: 5, fill: colorMap[key], strokeWidth: 0 }}
                  connectNulls isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
