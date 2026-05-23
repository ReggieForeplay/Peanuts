import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'migrations');

export function runMigrations(db: Database.Database): void {
  // Bootstrap the migrations table itself first
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[]).map(
      (r) => r.filename,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // numeric prefix ensures order: 001_, 002_, ...

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').run(
        file,
        Math.floor(Date.now() / 1000),
      );
    })();
  }
}
