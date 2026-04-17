'use client';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SummaryItem {
  label: string;
  shortLabel?: string;
  value: number;
  color: string;
  gameKey?: string;
}

export default function SummaryBars({ items, title, onSelect }: { items: SummaryItem[]; title: string; onSelect?: (gameKey: string) => void }) {
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '20px 20px',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((d, i) => (
          <motion.div
            key={d.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => d.gameKey && onSelect?.(d.gameKey)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: d.gameKey ? 'pointer' : 'default',
            }}
          >
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              width: '35%',
              minWidth: 0,
              flexShrink: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {isMobile && d.shortLabel ? d.shortLabel : d.label}
            </div>
            <div style={{ flex: 1, height: 5, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden', minWidth: 0 }}>
              <div style={{
                height: '100%',
                width: mounted ? `${Math.min(d.value, 100)}%` : '0%',
                background: `linear-gradient(90deg, ${d.color}, ${d.color}77)`,
                borderRadius: 3,
                transition: `width 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${0.1 + i * 0.05}s`,
              }} />
            </div>
            <div style={{
              fontSize: 13,
              color: d.color,
              fontWeight: 700,
              width: 52,
              textAlign: 'right',
              flexShrink: 0,
              fontFamily: 'var(--font-mono)',
            }}>
              {d.value.toFixed(1)}%
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
