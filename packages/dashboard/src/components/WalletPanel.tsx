import { useState } from 'react';
import { api } from '../api.js';
import type { WalletInfo } from '../api.js';
import { LiveDuration } from './LiveDuration.js';

export function WalletPanel() {
  const [address, setAddress] = useState('');
  const [input, setInput] = useState('');
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    const addr = input.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.wallet(addr);
      setInfo(data);
      setAddress(addr);
    } catch {
      setError('Wallet not found or API error.');
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={styles.box}>
      <h2 style={styles.heading}>🔍 Check Your Streak</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          style={styles.input}
          placeholder="Paste your Solana wallet address…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <button style={styles.btn} onClick={lookup} disabled={loading}>
          {loading ? '…' : 'Lookup'}
        </button>
      </div>

      {error && <p style={{ color: '#e05' }}>{error}</p>}

      {info && (
        <div>
          <p style={{ marginBottom: '0.5rem', color: '#888', fontSize: '0.85rem' }}>
            {address.slice(0, 8)}…{address.slice(-6)}
          </p>
          {info.activeStreak ? (
            <div style={styles.streakBox}>
              <div style={{ color: '#4caf50', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                ✅ STREAK ALIVE — Rank #{info.rank ?? '—'}
              </div>
              <div>Start: {new Date(info.activeStreak.streakStart * 1000).toLocaleDateString()}</div>
              <div style={{ fontSize: '1.2rem', marginTop: '0.25rem' }}>
                <LiveDuration streakStart={info.activeStreak.streakStart} />
              </div>
            </div>
          ) : (
            <div style={{ ...styles.streakBox, borderColor: '#e05' }}>
              <div style={{ color: '#e05', fontWeight: 'bold' }}>❌ NO ACTIVE STREAK</div>
              <div style={{ color: '#888', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                Buy $PEANUTS to start a streak. Do not sell on a DEX.
              </div>
            </div>
          )}

          {info.history.length > 0 && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: '#888', fontSize: '0.85rem' }}>
                Streak history ({info.history.length} record{info.history.length !== 1 ? 's' : ''})
              </summary>
              <table style={{ ...styles.table, marginTop: '0.5rem', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    {['Start', 'End', 'Duration', 'Status', 'Break Reason'].map((h) => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {info.history.map((s, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{new Date(s.streak_start * 1000).toLocaleDateString()}</td>
                      <td style={styles.td}>{s.streak_end ? new Date(s.streak_end * 1000).toLocaleDateString() : '—'}</td>
                      <td style={styles.td}>{(s.streakDuration / 86400).toFixed(1)}d</td>
                      <td style={{ ...styles.td, color: s.status === 'ACTIVE' ? '#4caf50' : '#e05' }}>{s.status}</td>
                      <td style={styles.td}>{s.break_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '1.5rem', marginBottom: '2rem' },
  heading: { color: '#f5c542', marginBottom: '1rem', fontSize: '1.1rem' },
  input: { flex: 1, background: '#111', border: '1px solid #444', borderRadius: 4, padding: '0.5rem 0.75rem', color: '#e8e8e8', fontFamily: 'monospace', fontSize: '0.85rem' },
  btn: { background: '#f5c542', color: '#000', border: 'none', borderRadius: 4, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' },
  streakBox: { background: '#111', border: '1px solid #4caf50', borderRadius: 6, padding: '1rem', marginTop: '0.5rem' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '0.4rem 0.75rem', borderBottom: '1px solid #333', color: '#888' },
  td: { padding: '0.4rem 0.75rem', borderBottom: '1px solid #1e1e1e' },
};
