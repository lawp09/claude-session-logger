import Database from 'better-sqlite3';
import type { IngestPayload } from '../parser/message-types.js';

export class LocalBuffer {
  private db!: Database.Database;

  constructor(private readonly dbPath: string) {}

  init(): void {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  add(payload: IngestPayload): void {
    this.db.prepare('INSERT INTO buffer (payload) VALUES (?)').run(JSON.stringify(payload));
  }

  getAll(): Array<{ id: number; payload: IngestPayload }> {
    const rows = this.db.prepare('SELECT id, payload FROM buffer ORDER BY id ASC').all() as Array<{ id: number; payload: string }>;
    return rows.map(row => ({
      id: row.id,
      payload: JSON.parse(row.payload) as IngestPayload,
    }));
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM buffer WHERE id = ?').run(id);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM buffer').get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }
}
