'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ScoreBoard from './ScoreBoard';
import { abbr } from '@/lib/teamAbbr';
import OddsChart from './OddsChart';
import DivergenceChart from './DivergenceChart';

interface GameCardProps {
  homeTeam: string;
  awayTeam: string;
  sportKey: string;
  badge: string;
  badgeColor: string;
  subtitle: string;
  score?: any;
  mode: 'divergence' | 'sharp';
  commenceTime?: string;
}

export default function GameCard({ homeTeam, awayTeam, sportKey, badge, badgeColor, subtitle, score, mode, commenceTime }: GameCardProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [oddsData, setOddsData] = useState<any[]>([]);
  const [divData, setDivData] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingCharts, setLoadingCharts] = useState(false);

  const isLive = score?.state === 'in';
  const isFinal = score?.state === 'post';

  const fetchCharts = async () => {
    const [oddsRes, divRes] = await Promise.all([
      fetch(`/api/odds/history?home_team=${encodeURIComponent(homeTeam)}&away_team=${encodeURIComponent(awayTeam)}&commence_time=${encodeURIComponent(commenceTime ?? "")}`),
      fetch(`/api/divergence/history?home_team=${encodeURIComponent(homeTeam)}&away_team=${encodeURIComponent(awayTeam)}&commence_time=${encodeURIComponent(commenceTime ?? "")}`),
    ]);
    const [odds, div] = await Promise.all([oddsRes.json(), divRes.json()]);
    setOddsData(Array.isArray(odds) ? odds : []);
    setDivData(Array.isArray(div) ? div : []);
  };

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoadingCharts(true);
      await fetchCharts();
      setLoaded(true);
      setLoadingCharts(false);
    }
  };

  // Refresh chart data every 60s while card is open and game is live
  useEffect(() => {
    if (!open || !isLive) return;
    const t = setInterval(() => fetchCharts(), 60000);
    return () => clearInterval(t);
  }, [open, isLive]);

  const SPORT_LABELS: Record<string, { label: string; emoji: string }> = {
    basketball_nba:         { label: 'NBA',   emoji: '🏀' },
    basketball_ncaab:       { label: 'NCAAB', emoji: '🏀' },
    baseball_mlb:           { label: 'MLB',   emoji: '⚾' },
    icehockey_nhl:          { label: 'NHL',   emoji: '🏒' },
    american_football_nfl:  { label: 'NFL',   emoji: '🏈' },
  };
  const sportInfo = SPORT_LABELS[sportKey] ?? { label: sportKey, emoji: '' };
  const sportLabel = sportInfo.label;
  const sportEmoji = sportInfo.emoji;

  const resolvedCommenceTime = score?.commence_time || commenceTime;
  const startTime = resolvedCommenceTime
    ? (() => { try { return new Date(resolvedCommenceTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }); } catch { return ''; } })()
    : null;

  const minsUntilGame = commenceTime
    ? (new Date(commenceTime).getTime() - Date.now()) / 60000
    : null;
  const tooEarlyForCharts = minsUntilGame !== null && minsUntilGame > 60;
  const borderColor = isLive ? 'var(--red)' : open ? 'var(--border-bright)' : 'var(--border)';
  const badgeBg = badgeColor === 'var(--red)' ? 'var(--red-dim)' : badgeColor === 'var(--yellow)' ? 'var(--yellow-dim)' : badgeColor === 'var(--accent)' ? 'var(--accent-glow)' : 'var(--blue-dim)';

  return (
    <div style={{
      background: open ? 'var(--bg-card)' : 'var(--bg-secondary)',
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'all 0.2s',
      boxShadow: isLive ? '0 0 20px rgba(255,71,87,0.1)' : open ? '0 4px 24px rgba(0,0,0,0.3)' : 'none',
    }}>
      {/* Card header */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 20px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, textAlign: 'left',
        }}
      >
        {/* Left side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {isLive && (
            <span style={{
              background: 'var(--red)', color: '#fff',
              fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
              letterSpacing: '0.12em', flexShrink: 0, fontFamily: 'var(--font-mono)',
              boxShadow: '0 0 10px rgba(255,71,87,0.5)',
            }}>LIVE</span>
          )}
          {isFinal && (
            <span style={{
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border-bright)',
              fontSize: 9, fontWeight: 500, padding: '3px 7px', borderRadius: 4,
              letterSpacing: '0.1em', flexShrink: 0, fontFamily: 'var(--font-mono)',
            }}>FINAL</span>
          )}
          <span style={{
            color: 'var(--text-muted)', fontSize: 10, flexShrink: 0,
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.05em',
          }}>{sportEmoji} {sportLabel}</span>
          <div style={{ minWidth: 0 }}>
            <span style={{
              color: 'var(--text-primary)', fontSize: 14, fontWeight: 500,
              fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
            }}>
              {isMobile ? abbr(awayTeam) : awayTeam} <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>@</span> {isMobile ? abbr(homeTeam) : homeTeam}
            </span>
          </div>
          {startTime && !isLive && !isFinal && (
            <span style={{
              color: 'var(--text-muted)', fontSize: 10, flexShrink: 0,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
            }}>{startTime}</span>
          )}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
            color: badgeColor,
            background: badgeBg,
            border: `1px solid ${badgeColor}40`,
            borderRadius: 6, padding: '4px 10px',
          }}>{badge}</span>
          <span style={{
            color: 'var(--text-muted)', fontSize: 14,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block', lineHeight: 1,
          }}>▾</span>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 16 }}>
                <ScoreBoard score={score} sportKey={sportKey} homeTeam={homeTeam} awayTeam={awayTeam} commenceTime={score?.commence_time ?? commenceTime} />
                {tooEarlyForCharts ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '32px 0', textAlign: 'center', fontFamily: 'var(--font-mono)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 22, marginBottom: 10 }}>
                      {sportKey === 'baseball_mlb' ? '⚾' : sportKey === 'icehockey_nhl' ? '🏒' : '🏀'}
                    </div>
                    <div style={{ marginBottom: 4 }}>Charts begin loading 1 hour before</div>
                    <div style={{ color: 'var(--text-muted)' }}>{startTime}</div>
                  </div>
                ) : (
                  <>
                    {loadingCharts && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '24px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                        Loading chart data...
                      </div>
                    )}
                    {loaded && mode === 'divergence' && divData.length > 0 && (
                      <DivergenceChart data={divData} commenceTime={commenceTime} gameState={score?.state} />
                    )}
                    {loaded && oddsData.length > 0 && (
                      <OddsChart data={oddsData} title="American Odds Movement" homeTeam={homeTeam} commenceTime={commenceTime} gameState={score?.state} />
                    )}
                    {loaded && oddsData.length === 0 && divData.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '16px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                        No chart history yet — data accumulates as the pipeline runs.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
