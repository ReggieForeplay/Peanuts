import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { LeaderboardEntry } from '../api.js';
import { LiveDuration } from './LiveDuration.js';

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard(20).then(setEntries).finally(() => setLoading(false));
    const id = setInterval(() => api.leaderboard(20).then(setEntries), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <p style={{ color: '#888' }}>Loading leaderboard…</p>;

  return (
    <section>
      <h2 style={styles.heading}>🏆 Live Leaderboard</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            {['Rank', 'Wallet', 'Streak Duration', 'Days'].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.wallet} style={styles.tr}>
              <td style={styles.td}>#{e.rank}</td>
              <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {e.wallet.slice(0, 8)}…{e.wallet.slice(-4)}
              </td>
              <td style={styles.td}><LiveDuration streakStart={e.streakStart} /></td>
              <td style={styles.td}>{e.streakDays}d</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p style={{ color: '#888' }}>No active streaks yet.</p>}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heading: { color: '#f5c542', marginBottom: '1rem', fontSize: '1.1rem' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '0.5rem 1rem', borderBottom: '1px solid #333', color: '#888', fontSize: '0.85rem' },
  td: { padding: '0.6rem 1rem', borderBottom: '1px solid #1e1e1e', fontSize: '0.9rem' },
  tr: { transition: 'background 0.15s' },
};
