import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

export function openDatabase(path = ':memory:') {
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  const migrations = new URL('./migrations/', import.meta.url);
  database.exec('BEGIN IMMEDIATE');
  try {
    let version = database.prepare('PRAGMA user_version').get().user_version;
    if (!version && database.prepare("SELECT 1 FROM sqlite_master WHERE name='buys'").get()) version = 1;
    for (const file of readdirSync(migrations).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      const next = Number(file.split('_')[0]);
      if (next <= version) continue;
      database.exec(readFileSync(new URL(file, migrations), 'utf8'));
      version = next;
    }
    database.exec(`PRAGMA user_version=${version}; COMMIT`);
  } catch (error) {
    database.exec('ROLLBACK');
    database.close();
    throw error;
  }
  return {
    close: () => database.close(),
    prepare(sql) {
      const statement = database.prepare(sql);
      function bind(...values) {
        return {
          first: async () => statement.get(...values) ?? null,
          all: async () => ({ results: statement.all(...values) }),
          run: async () => ({ meta: statement.run(...values) }),
        };
      }
      return { ...bind(), bind };
    },
  };
}
