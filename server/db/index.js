import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { schema } from './schema.js';

export function openDatabase(config) {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const filename = path.join(config.dataDir, 'imageapi.sqlite3');
  const db = new DatabaseSync(filename);
  try {
    chmodSync(filename, 0o600);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=15000; PRAGMA journal_mode=WAL;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) throw new Error('Database schema is newer than this ImageAPI release');
    if (version === 1) {
      const folder = path.join(config.dataDir, 'backups');
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const prefix = path.join(
        folder,
        `before-node-${Date.now()}-${randomBytes(4).toString('hex')}`,
      );
      db.exec(`VACUUM INTO '${(prefix + '.sqlite3').replaceAll("'", "''")}'`);
      chmodSync(prefix + '.sqlite3', 0o600);
      const keyFile = path.join(config.dataDir, 'encryption.key');
      if (existsSync(keyFile)) {
        copyFileSync(keyFile, prefix + '.key');
        chmodSync(prefix + '.key', 0o600);
      }
    }
    transaction(db, () => {
      db.exec(schema);
      db.exec('PRAGMA user_version=2');
    });
    chmodSync(filename, 0o600);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// Never await inside a transaction: reservations and writes must remain atomic.
export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    if (result && typeof result.then === 'function')
      throw new Error('Database transactions must be synchronous');
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
