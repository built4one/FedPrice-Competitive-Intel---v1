import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

export interface Stored<T = any> { id: string; value: T; version: number; updatedAt: string }
export class ConflictError extends Error { constructor() { super('This record changed. Refresh before saving.'); } }
export class RecordStore {
  private pool?: Pool;
  private sqlite?: any;
  private ready?: Promise<void>;
  readonly durable: boolean;
  constructor(private options = { url: process.env.DATABASE_URL, file: process.env.STUDIO_DB_PATH || './data/market-intelligence.sqlite', hosted: process.env.VERCEL === '1' }) {
    this.durable = !options.hosted || Boolean(options.url);
  }
  private async init() {
    if (!this.ready) this.ready = (async () => {
      if (!this.durable) throw new Error('DATABASE_URL is required for durable hosted storage.');
      if (this.options.url) this.pool = new Pool({ connectionString: this.options.url, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
      else {
        await mkdir(path.dirname(path.resolve(this.options.file)), { recursive: true });
        const { DatabaseSync } = await import('node:sqlite');
        this.sqlite = new DatabaseSync(this.options.file);
        this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
      }
      await this.raw('CREATE TABLE IF NOT EXISTS fmp_records (workspace TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(workspace,kind,id))');
      await this.raw('CREATE INDEX IF NOT EXISTS fmp_records_list ON fmp_records(workspace,kind,updated_at)');
    })().catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }
  private async raw(sql: string, values: any[] = []): Promise<any[]> {
    if (this.pool) return (await this.pool.query(sql, values)).rows;
    const normalized = sql.replace(/\$\d+/g, '?');
    const statement = this.sqlite.prepare(normalized);
    return statement.all(...values);
  }
  private decode(row: any): Stored { return { id: row.id, value: JSON.parse(row.payload), version: row.version, updatedAt: row.updated_at }; }
  async get<T = any>(workspace: string, kind: string, id: string): Promise<Stored<T> | null> {
    await this.init(); const rows = await this.raw('SELECT * FROM fmp_records WHERE workspace=$1 AND kind=$2 AND id=$3', [workspace,kind,id]);
    return rows[0] ? this.decode(rows[0]) : null;
  }
  async list<T = any>(workspace: string, kind: string): Promise<Stored<T>[]> {
    await this.init(); return (await this.raw('SELECT * FROM fmp_records WHERE workspace=$1 AND kind=$2 ORDER BY updated_at DESC', [workspace,kind])).map(row => this.decode(row));
  }
  async put<T>(workspace: string, kind: string, id: string, value: T, expectedVersion = 0): Promise<Stored<T>> {
    await this.init(); const updatedAt = new Date().toISOString();
    const sql = expectedVersion === 0
      ? 'INSERT INTO fmp_records(workspace,kind,id,payload,version,updated_at) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT(workspace,kind,id) DO NOTHING RETURNING *'
      : 'UPDATE fmp_records SET payload=$1,version=version+1,updated_at=$2 WHERE workspace=$3 AND kind=$4 AND id=$5 AND version=$6 RETURNING *';
    const params = expectedVersion === 0 ? [workspace,kind,id,JSON.stringify(value),updatedAt] : [JSON.stringify(value),updatedAt,workspace,kind,id,expectedVersion];
    const rows = await this.raw(sql, params); if (!rows.length) throw new ConflictError(); return this.decode(rows[0]);
  }
  async remove(workspace: string, kind: string, id: string) { await this.init(); await this.raw('DELETE FROM fmp_records WHERE workspace=$1 AND kind=$2 AND id=$3 RETURNING id', [workspace,kind,id]); }
  async close() { await this.pool?.end(); this.sqlite?.close(); this.ready = undefined; this.sqlite = undefined; this.pool = undefined; }
}
