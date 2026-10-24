import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleApiRequest, type Env } from '../worker/index';
import { occurrence } from '../worker/validation/input';

// In-memory SQLite exercises the same SQL, CHECKs, FKs, triggers, and atomic
// batches. Browser tests additionally use actual isolated local Wrangler D1.
class Statement {
  constructor(public db: DatabaseSync, public sql: string, public values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return this.execute(); }
  execute() {
    const results = this.db.prepare(this.sql).all(...this.values);
    return { results, success: true, meta: { changes: Number(this.db.prepare('SELECT changes() AS n').get()?.n ?? 0) } };
  }
}

let db: DatabaseSync;
let env: Env;
const psgc = JSON.parse(readFileSync('public/data/barangay_nodes.geojson', 'utf8')).features[0].properties.adm4_psgc;
const valid = () => ({ barangayPsgc: psgc, categoryCode: 'natural_hazards', severity: 'moderate', occurredAt: '2026-01-01T12:30:00+08:00', description: 'Automated test fixture; in-memory database only.' });
const request = (path: string, method = 'GET', body?: unknown, headers?: HeadersInit) => new Request(`http://localhost${path}`, { method, headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const send = (path: string, method = 'GET', body?: unknown, headers?: HeadersInit) => handleApiRequest(request(path, method, body, headers), env);

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0001_initial_schema.sql', 'utf8'));
  db.exec(readFileSync('migrations/0002_reference_data.sql', 'utf8'));
  env = {
    APP_ENV: 'development', ENABLE_DEV_REVIEW: 'true',
    DB: {
      prepare: (sql: string) => new Statement(db, sql),
      batch: async (statements: Statement[]) => {
        db.exec('BEGIN');
        try { const results = statements.map((s) => s.execute()); db.exec('COMMIT'); return results; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  } as unknown as Env;
});
afterEach(() => db.close());

describe('local MVP API and database privacy', () => {
  it('confirms health, exact active references, alphabetical names and string PSGCs', async () => {
    const health = await send('/api/health');
    expect(health.status).toBe(200);
    expect(health.headers.get('Cache-Control')).toBe('no-store');
    expect((await health.json()).data.database).toBe('ready');
    const barangays = (await (await send('/api/reference/barangays')).json()).data;
    expect(barangays).toHaveLength(180);
    expect(new Set(barangays.map((b: { psgc: string }) => b.psgc)).size).toBe(180);
    expect(barangays.every((b: { psgc: unknown; name: string }) => typeof b.psgc === 'string' && b.name.length > 0)).toBe(true);
    expect((await (await send('/api/reference/categories')).json()).data).toHaveLength(9);
  });

  it.each([
    { barangayPsgc: 'invalid' }, { barangayPsgc: "' OR 1=1 --" }, { categoryCode: 'invalid' },
    { severity: 'extreme' }, { severity: ' ' }, { occurredAt: '2099-01-01T00:00:00Z' },
    { occurredAt: '2026-02-30T00:00:00Z' }, { occurredAt: '2026-01-01T01:00' },
    { description: 'x'.repeat(1001) }, { latitude: 10 }, { longitude: 122 }, { gps: {} },
    { address: 'test' }, { status: 'verified' }, { isPublic: true }, { id: 'test' },
    { publicReference: 'test' }, { reporterName: 'test' }, { note: 'test' },
  ])('rejects invalid/unsupported submission fields %j', async (change) => {
    expect((await send('/api/incidents', 'POST', { ...valid(), ...change })).status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS n FROM incidents').get()?.n).toBe(0);
  });

  it('rejects missing fields, invalid JSON, wrong content type, excessive body and foreign origins', async () => {
    expect((await send('/api/incidents', 'POST', {})).status).toBe(400);
    expect((await handleApiRequest(new Request('http://localhost/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), env)).status).toBe(400);
    expect((await send('/api/incidents', 'POST', valid(), { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send('/api/incidents', 'POST', { ...valid(), description: 'x'.repeat(9000) })).status).toBe(413);
    expect((await send('/api/incidents', 'POST', valid(), { Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('submits privately with secure reference, UTC timestamp, no public ID and atomic initial history', async () => {
    const response = await send('/api/incidents', 'POST', valid());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.error).toBeNull();
    expect(Object.keys(body.data).sort()).toEqual(['createdAt', 'reference', 'status']);
    expect(body.data.reference).toMatch(/^ILO-\d{8}-[A-F0-9]{24}$/);
    const row = db.prepare('SELECT * FROM incidents').get();
    expect(row?.status).toBe('submitted'); expect(row?.is_public).toBe(0);
    expect(row?.occurred_at).toBe('2026-01-01T04:30:00.000Z');
    expect(db.prepare('SELECT * FROM incident_status_history').all()).toHaveLength(1);
    const summary = (await (await send('/api/public/summary')).json()).data;
    expect(summary).toEqual({ total: 0, barangays: [], categories: [], severities: [], statuses: [] });
  });

  it('reuses an idempotency key without creating another report and rejects conflicting reuse', async () => {
    const headers = { 'Idempotency-Key': crypto.randomUUID() };
    const first = await (await send('/api/incidents', 'POST', valid(), headers)).json();
    const repeated = await (await send('/api/incidents', 'POST', valid(), headers)).json();
    expect(repeated).toEqual(first);
    expect(db.prepare('SELECT COUNT(*) AS n FROM incidents').get()?.n).toBe(1);
    expect((await send('/api/incidents', 'POST', { ...valid(), severity: 'high' }, headers)).status).toBe(409);
  });

  it('rolls creation back if its initial history insert fails', async () => {
    db.exec("CREATE TRIGGER test_history_failure BEFORE INSERT ON incident_status_history BEGIN SELECT RAISE(ABORT,'fixture'); END;");
    expect((await send('/api/incidents', 'POST', valid())).status).toBe(503);
    expect(db.prepare('SELECT COUNT(*) AS n FROM incidents').get()?.n).toBe(0);
  });

  it('enforces review workflow, publication, privacy, filters and terminal states', async () => {
    await send('/api/incidents', 'POST', { ...valid(), description: '<script>private fixture</script>' });
    const id = db.prepare('SELECT id FROM incidents').get()?.id;
    const path = `/api/dev/incidents/${id}/status`;
    expect((await send(path, 'PATCH', { status: 'verified', publish: true })).status).toBe(409);
    expect((await send(path, 'PATCH', { status: 'under_review', publish: true })).status).toBe(400);
    expect((await send(path, 'PATCH', { status: 'under_review', publish: false, note: 'private note fixture' })).status).toBe(200);
    expect((await (await send('/api/public/summary')).json()).data.total).toBe(0);
    expect((await send(path, 'PATCH', { status: 'verified', publish: true })).status).toBe(200);
    const summaryResponse = await send('/api/public/summary');
    const publicText = await summaryResponse.text();
    expect(publicText).not.toMatch(/description|private fixture|private note|incident_id|public_reference/);
    expect(JSON.parse(publicText).data.total).toBe(1);
    expect((await (await send('/api/public/summary?category=other')).json()).data.total).toBe(0);
    expect((await (await send('/api/public/summary?severity=moderate')).json()).data.total).toBe(1);
    expect((await send('/api/public/summary?severity=bogus')).status).toBe(400);
    expect((await send('/api/public/summary?category=bogus')).status).toBe(400);
    expect((await send(path, 'PATCH', { status: 'responding', publish: true })).status).toBe(200);
    expect((await send(path, 'PATCH', { status: 'resolved', publish: true })).status).toBe(200);
    expect((await send(path, 'PATCH', { status: 'responding', publish: true })).status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS n FROM incident_status_history').get()?.n).toBe(5);
    const queue = (await (await send('/api/dev/incidents')).json()).data;
    expect(queue.items[0].history).toHaveLength(5);
    expect(queue.items[0].description_private).toContain('private fixture');
    expect((await send('/api/dev/incidents?limit=101')).status).toBe(400);
  });

  it('keeps rejected and verified-but-private reports out of public aggregates', async () => {
    for (const rejection of [true, false]) {
      await send('/api/incidents', 'POST', valid());
      const id = db.prepare("SELECT id FROM incidents WHERE status='submitted'").get()?.id;
      const path = `/api/dev/incidents/${id}/status`;
      if (!rejection) await send(path, 'PATCH', { status: 'under_review', publish: false });
      expect((await send(path, 'PATCH', { status: rejection ? 'rejected' : 'verified', publish: false })).status).toBe(200);
    }
    expect((await (await send('/api/public/summary')).json()).data.total).toBe(0);
  });

  it('denies dev routes without explicit configuration and outside loopback/development', async () => {
    for (const settings of [{ APP_ENV: 'production', ENABLE_DEV_REVIEW: 'true' }, { APP_ENV: 'development', ENABLE_DEV_REVIEW: undefined }, { APP_ENV: 'development', ENABLE_DEV_REVIEW: 'false' }]) {
      const denied = { ...env, ...settings };
      expect((await handleApiRequest(request('/api/dev/incidents'), denied)).status).toBe(403);
      expect((await handleApiRequest(request('/api/dev/incidents/abc/status', 'PATCH', {}), denied)).status).toBe(403);
    }
    expect((await handleApiRequest(new Request('https://public.example/api/dev/incidents'), env)).status).toBe(403);
    expect((await handleApiRequest(request('/api/incidents', 'POST', valid()), { ...env, APP_ENV: 'production' })).status).toBe(403);
  });

  it('does not store incident coordinates or identities and database checks reject bypasses', () => {
    const columns = db.prepare('PRAGMA table_info(incidents)').all().map((row) => row.name);
    expect(columns.join(' ')).not.toMatch(/latitude|longitude|gps|address|reporter|attachment/);
    expect(() => db.exec("INSERT INTO incidents(id,public_reference,barangay_psgc,category_code,severity,occurred_at,status,is_public,created_at,updated_at) VALUES('x','x','bad','other','low','x','verified',1,'x','x')")).toThrow();
    expect(occurrence('2026-01-01T12:30:00+08:00')).toBe('2026-01-01T04:30:00.000Z');
  });

  it('records only one winner for competing review transitions', async () => {
    await send('/api/incidents', 'POST', valid());
    const id = db.prepare('SELECT id FROM incidents').get()?.id;
    const results = await Promise.all([
      send(`/api/dev/incidents/${id}/status`, 'PATCH', { status: 'under_review', publish: false }),
      send(`/api/dev/incidents/${id}/status`, 'PATCH', { status: 'rejected', publish: false }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM incident_status_history').get()?.n).toBe(2);
  });

  it('local reset SQL restores a clean reference-only schema when reapplied in an isolated database', async () => {
    await send('/api/incidents', 'POST', valid());
    db.exec(readFileSync('scripts/reset-local-db.sql', 'utf8'));
    db.exec(readFileSync('migrations/0001_initial_schema.sql', 'utf8'));
    db.exec(readFileSync('migrations/0002_reference_data.sql', 'utf8'));
    expect(db.prepare('SELECT COUNT(*) AS n FROM incidents').get()?.n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM barangays').get()?.n).toBe(180);
    expect(db.prepare('SELECT COUNT(*) AS n FROM incident_categories').get()?.n).toBe(9);
  });
});
