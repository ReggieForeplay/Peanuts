import { useState, useEffect } from 'react';

interface Props { streakStart: number; }

export function LiveDuration({ streakStart }: Props) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const secs = now - streakStart;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return <span>{d}d {h}h {m}m {s}s</span>;
}
