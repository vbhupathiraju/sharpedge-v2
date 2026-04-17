'use client';
import { useContext, useMemo } from 'react';
import { MARCH_MADNESS_2026 } from '@/lib/marchMadness2026';
import { motion } from 'framer-motion';
import GameCard from './GameCard';
import SummaryBars from './SummaryBars';
import { DataContext } from './Dashboard';
import { abbr } from '@/lib/teamAbbr';

interface SharpRow {
  home_team: string;
  away_team: string;
  sport_key: string;
  prob_movement: number;
  commence_time: string;
  movement_direction: string;
}

function sortGames(games: { key: string; rows: SharpRow[]; score?: any; away: string; home: string }[]) {
  return [...games].sort((a, b) => {
    const rank = (s: string) => s === 'in' ? 0 : s === 'pre' ? 1 : 2;
    const ar = rank(a.score?.state), br = rank(b.score?.state);
    if (ar !== br) return ar - br;
    if (ar === 1) return new Date(a.rows[0].commence_time).getTime() - new Date(b.rows[0].commence_time).getTime();
    return 0;
  });
}

export default function SharpMoneyTab({ date, sport }: { date: string; sport: string }) {
  const { sharp, scores, loading, error } = useContext(DataContext);

  const filtered = useMemo(() => sharp.filter((r: SharpRow) => {
    const sportMatch = sport === 'all' || r.sport_key === sport;
    const mmOnly = r.sport_key !== 'basketball_ncaab' ||
      (MARCH_MADNESS_2026.has(r.home_team) && MARCH_MADNESS_2026.has(r.away_team));
    return sportMatch && mmOnly;
  }), [sharp, date, sport]);

  if (loading) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '60px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
      <div style={{ marginBottom: 8 }}>⟳ Querying Athena...</div>
      <div style={{ fontSize: 10, opacity: 0.6 }}>Querying S3 via Athena...</div>
    </div>
  );
  if (error) return <div style={{ color: 'var(--red)', fontSize: 12, padding: 20, background: 'var(--red-dim)', borderRadius: 8, fontFamily: 'var(--font-mono)' }}>Error: {error}</div>;
  if (!filtered.length) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '60px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>No sharp money signals for selected filters.</div>;

  const gameMap: Record<string, SharpRow[]> = {};
  for (const row of filtered) {
    const key = `${row.away_team}|${row.home_team}`;
    if (!gameMap[key]) gameMap[key] = [];
    gameMap[key].push(row);
  }
  const games: { key: string; rows: any[]; score?: any; away: string; home: string }[] = Object.entries(gameMap).map(([key, rows]) => {
    const [away, home] = key.split('|');
    return { key, rows, score: scores[key], away, home };
  });

  const SPORT_EMOJI: Record<string, string> = {
    basketball_nba: '🏀', baseball_mlb: '⚾', icehockey_nhl: '🏒',
    basketball_ncaab: '🏀', american_football_nfl: '🏈',
  };

  const summaryItems = games.map(g => {
    const totalMove = Number(g.rows[0].prob_movement) * 100;
    const maxJump = Math.max(...g.rows.map((r: SharpRow) => Number(r.prob_movement) * 100));
    const emoji = SPORT_EMOJI[g.rows[0].sport_key] ?? '';
    return {
      label: `${emoji} ${g.away} @ ${g.home}`, shortLabel: `${emoji} ${abbr(g.away)} @ ${abbr(g.home)}`,
      value: totalMove,
      color: maxJump >= 10 ? 'var(--red)' : totalMove >= 5 ? 'var(--yellow)' : 'var(--blue)',
      gameKey: g.key,
    };
  }).sort((a, b) => b.value - a.value);

  const handleSelect = (gameKey: string) => {
    window.dispatchEvent(new CustomEvent('sharpedge:opencard', { detail: `gamecard-${gameKey}` }));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <SummaryBars items={summaryItems} title="PROBABILITY MOVEMENT BY GAME" onSelect={handleSelect} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortGames(games).map((g, i) => {
          const totalMove = Number(g.rows[0].prob_movement) * 100;
          const maxJump = Math.max(...g.rows.map((r: SharpRow) => Number(r.prob_movement) * 100));
          const badgeColor = maxJump >= 10 ? 'var(--red)' : totalMove >= 5 ? 'var(--yellow)' : 'var(--blue)';
          return (
            <motion.div key={g.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <GameCard id={`gamecard-${g.key}`} homeTeam={g.home} awayTeam={g.away} sportKey={g.rows[0].sport_key} commenceTime={g.rows[0].commence_time}
                badge={`${totalMove.toFixed(1)}% move${maxJump >= 10 ? ' ⚡' : ''}`}
                badgeColor={badgeColor} subtitle="" score={g.score} mode="sharp" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
