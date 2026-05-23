export function Rules() {
  return (
    <section style={styles.box}>
      <h2 style={styles.heading}>📋 How It Works</h2>
      <ul style={styles.list}>
        <li><strong>Selling $PEANUTS on a DEX resets your streak to zero.</strong></li>
        <li>Wallet-to-wallet transfers are <strong>safe</strong> — your streak survives.</li>
        <li>Streak starts the moment your wallet first acquires $PEANUTS above the minimum balance.</li>
        <li>Rewards go to the <strong>longest-surviving holders</strong>, not the biggest bags.</li>
        <li>Distribution is weighted by time held — hold 3× longer, get ~3× the reward.</li>
        <li>A minimum hold time is required to qualify (anti-sybil).</li>
      </ul>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '1.5rem', marginBottom: '2rem' },
  heading: { color: '#f5c542', marginBottom: '1rem', fontSize: '1.1rem' },
  list: { paddingLeft: '1.5rem', lineHeight: 2, color: '#ccc' },
};
