'use client';
import { useState, useEffect, createContext, useContext } from 'react';
import { motion } from 'framer-motion';
import * as Tabs from '@radix-ui/react-tabs';
import DivergenceTab from './DivergenceTab';
import SharpMoneyTab from './SharpMoneyTab';
import Clock from './Clock';
import HowItWorks from './HowItWorks';
import { format, subDays } from 'date-fns';

const SPORTS = [
  { key: 'all', label: 'All Sports' },
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'icehockey_nhl', label: 'NHL' },
];

const TABS = [
  { value: 'divergence', label: 'Divergence Signals', icon: '⟆', color: 'var(--accent)' },
  { value: 'sharp', label: 'Sharp Money', icon: '◈', color: 'var(--blue)' },
];

const today = new Date();
const DATE_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const d = subDays(today, i);
  return {
    value: format(d, 'yyyy-MM-dd'),
    label: format(d, 'MMM d, yyyy') + (i === 0 ? ' (today)' : i === 1 ? ' (yesterday)' : ''),
  };
});

export interface AllData {
  divergence: any[];
  sharp: any[];
  scores: Record<string, any>;
  loading: boolean;
  error: string;
}

export const DataContext = createContext<AllData>({ divergence: [], sharp: [], scores: {}, loading: true, error: '' });
export const RefreshContext = createContext<{ refreshing: boolean }>({ refreshing: false });

export default function Dashboard() {
  const [date, setDate] = useState(DATE_OPTIONS[0].value);
  const [sport, setSport] = useState('all');
  const [activeTab, setActiveTab] = useState('divergence');
  const [refreshing, setRefreshing] = useState(false);
  const [allData, setAllData] = useState<AllData>({ divergence: [], sharp: [], scores: {}, loading: true, error: '' });

  const loadAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [divRes, sharpRes] = await Promise.all([
        fetch(`/api/divergence?date=${DATE_OPTIONS[0].value}`),
        fetch(`/api/sharp?date=${DATE_OPTIONS[0].value}`),
      ]);
      const [divRows, sharpRows] = await Promise.all([divRes.json(), sharpRes.json()]);

      const divArr = Array.isArray(divRows) ? divRows : [];
      const sharpArr = Array.isArray(sharpRows) ? sharpRows : [];

      const allSports = [...new Set([
        ...divArr.map((r: any) => r.sport_key),
        ...sharpArr.map((r: any) => r.sport_key),
      ])] as string[];

      const scoreResults = await Promise.all(
        allSports.map(s => fetch(`/api/scores?sport=${s}`).then(r => r.json()))
      );
      const merged: Record<string, any> = {};
      scoreResults.forEach(r => Object.assign(merged, r));

      setAllData({ divergence: divArr, sharp: sharpArr, scores: merged, loading: false, error: '' });
    } catch (e: any) {
      setAllData(prev => ({ ...prev, loading: false, error: e.message }));
    } finally {
      setRefreshing(false);
    }
  };

  const ACTIVE_SPORTS = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];

  const loadScores = async () => {
    const scoreResults = await Promise.all(
      ACTIVE_SPORTS.map(s => fetch(`/api/scores?sport=${s}`).then(r => r.json()).catch(() => ({})))
    );
    const merged: Record<string, any> = {};
    scoreResults.forEach(r => Object.assign(merged, r));
    setAllData(prev => ({ ...prev, scores: merged }));
  };

  useEffect(() => {
    loadAll(false);
    const athenaTimer = setInterval(() => loadAll(true), 60000);
    const scoresTimer = setInterval(() => loadScores(), 15000);
    return () => { clearInterval(athenaTimer); clearInterval(scoresTimer); };
  }, []);

  return (
    <DataContext.Provider value={allData}>
      <RefreshContext.Provider value={{ refreshing }}>
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              borderBottom: '1px solid var(--border)',
              background: 'rgba(6,10,16,0.96)',
              backdropFilter: 'blur(16px)',
              position: 'sticky', top: 0, zIndex: 50,
            }}
          >
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px', height: 66, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ position: 'relative', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'var(--accent-glow)', border: '1px solid rgba(0,229,196,0.3)' }} />
                  <span style={{ fontSize: 18, position: 'relative', zIndex: 1 }}>◈</span>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    <span style={{ color: 'var(--text-primary)' }}>SHARP</span>
                    <span style={{ color: 'var(--accent)' }}>EDGE</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.18em', lineHeight: 1.2 }}>BETTING INTELLIGENCE</div>
                </div>
              </div>

              {/* Center — syncing (desktop only) */}
              <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'var(--syncing-display, flex)' }}
                className="syncing-indicator">
                {refreshing && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'var(--accent-glow)', border: '1px solid rgba(0,229,196,0.3)',
                      borderRadius: 20, padding: '4px 14px',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>SYNCING</span>
                  </motion.div>
                )}
              </div>

              {/* Right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <Clock />
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--red-dim)', border: '1px solid rgba(255,71,87,0.4)',
                  borderRadius: 20, padding: '4px 12px',
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 6px var(--red)', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>LIVE</span>
                </div>
              </div>
            </div>
          </motion.header>

          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 28px' }}>
            {/* How it works button — right aligned below header */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <HowItWorks />
            </div>
            {/* Filters */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28, alignItems: 'center' }}
            >
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 10, letterSpacing: '0.15em' }}>DATE</span>
                <div style={{ width: 1, height: 14, background: 'var(--border-bright)' }} />
                <select value={date} onChange={e => setDate(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 500, colorScheme: 'dark', cursor: 'pointer', appearance: 'none', paddingRight: 20 }}>
                  {DATE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ background: '#0d1520' }}>{opt.label}</option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: -16, pointerEvents: 'none' }}>▾</span>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: 10, display: 'flex', padding: 4, gap: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                {SPORTS.map(s => {
                  const active = sport === s.key;
                  return (
                    <button key={s.key} onClick={() => setSport(s.key)} style={{
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? '#040d14' : 'var(--text-muted)',
                      border: 'none', borderRadius: 7, padding: '8px 18px',
                      fontSize: 12, fontWeight: active ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'var(--font-display)',
                      transition: 'all 0.18s',
                      boxShadow: active ? '0 0 16px var(--accent-glow-strong)' : 'none',
                    }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Tabs */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }}>
              <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                <Tabs.List style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
                  {TABS.map(tab => {
                    const active = activeTab === tab.value;
                    return (
                      <Tabs.Trigger key={tab.value} value={tab.value} style={{
                        background: active ? 'var(--bg-card)' : 'transparent',
                        border: active ? `1px solid ${tab.color}` : '1px solid var(--border)',
                        borderRadius: 10, cursor: 'pointer', padding: '10px 22px',
                        fontSize: 13, fontFamily: 'var(--font-display)',
                        fontWeight: active ? 600 : 400, transition: 'all 0.18s',
                        color: active ? tab.color : 'var(--text-muted)',
                        boxShadow: active ? `0 0 20px rgba(0,0,0,0.4), inset 0 0 20px ${tab.color}18` : 'none',
                      }}>
                        <span style={{ marginRight: 7, opacity: active ? 1 : 0.5 }}>{tab.icon}</span>
                        {tab.label}
                      </Tabs.Trigger>
                    );
                  })}
                </Tabs.List>
                <Tabs.Content value="divergence">
                  <DivergenceTab date={date} sport={sport} />
                </Tabs.Content>
                <Tabs.Content value="sharp">
                  <SharpMoneyTab date={date} sport={sport} />
                </Tabs.Content>
              </Tabs.Root>
            </motion.div>
          </div>

          <style>{`
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          `}</style>
        </div>
      </RefreshContext.Provider>
    </DataContext.Provider>
  );
}
