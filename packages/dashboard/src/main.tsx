import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Leaderboard } from './components/Leaderboard.js';
import { WalletPanel } from './components/WalletPanel.js';
import { Rules } from './components/Rules.js';
import { api } from './api.js';
import type { Stats } from './api.js';

function App() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    const id = setInterval(() => api.stats().then(setStats).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>🥜 $PEANUTS</h1>
        <p style={styles.subtitle}>Longest-Holder Reward System</p>
        {stats && (
          <div style={styles.statBar}>
            <span>{stats.holderCount} holders</span>
            <span>·</span>
            <span>{stats.activeStreakCount} active streaks</span>
            {stats.lastSnapshot && (
              <>
                <span>·</span>
                <span>Last snapshot: {new Date(stats.lastSnapshot.taken_at * 1000).toLocaleString()}</span>
              </>
            )}
          </div>
        )}
      </header>

      <main style={styles.main}>
        <WalletPanel />
        <Rules />
        <Leaderboard />
      </main>

      <footer style={styles.footer}>
        <p>This dashboard is read-only. Streak data updates after each ingestion run.</p>
        <p style={{ color: '#555' }}>Not financial advice. $PEANUTS is a memecoin.</p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: '#111', borderBottom: '1px solid #222', padding: '2rem', textAlign: 'center' },
  title: { color: '#f5c542', fontSize: '2.5rem', marginBottom: '0.25rem' },
  subtitle: { color: '#888', marginBottom: '1rem' },
  statBar: { display: 'flex', justifyContent: 'center', gap: '1rem', color: '#aaa', fontSize: '0.85rem' },
  main: { flex: 1, maxWidth: 900, margin: '0 auto', padding: '2rem 1rem', width: '100%' },
  footer: { background: '#111', borderTop: '1px solid #222', padding: '1.5rem', textAlign: 'center', color: '#666', fontSize: '0.8rem', lineHeight: 2 },
};

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
