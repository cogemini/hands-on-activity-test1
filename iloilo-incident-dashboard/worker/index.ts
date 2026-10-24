import { ApiError, ensure, occurrence, onlyKeys, readJson, SEVERITIES, STATUSES, text, TRANSITIONS, type Status } from './validation/input';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  ENABLE_DEV_REVIEW?: string;
}

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export function success(data: unknown, status = 200) { return Response.json({ data, error: null }, { status, headers: PRIVATE_HEADERS }); }
function local(request: Request, env: Env) {
  return env.APP_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
function reviewAllowed(request: Request, env: Env) { return local(request, env) && env.ENABLE_DEV_REVIEW === 'true'; }
function safeOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  let url: URL;
  try { url = new URL(origin); } catch { throw new ApiError(403, 'FORBIDDEN', 'Request origin is not allowed.'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(403, 'FORBIDDEN', 'Request origin is not allowed.');
  }
}
type Incident = { id: string; public_reference: string; barangay_psgc: string; category_code: string; severity: string; occurred_at: string; description_private: string | null; status: Status; is_public: number; created_at: string; updated_at: string; submission_fingerprint?: string };
const safeState = (row: Incident) => ({ reference: row.public_reference, status: row.status, isPublic: Boolean(row.is_public), updatedAt: row.updated_at });

async function createIncident(request: Request, env: Env) {
  // Production anti-abuse is intentionally not implemented: fail closed there.
  if (!local(request, env)) throw new ApiError(403, 'LOCAL_ONLY', 'Submissions are enabled only in explicit local development.');
  safeOrigin(request);
  const body = await readJson(request);
  onlyKeys(body, ['barangayPsgc', 'categoryCode', 'severity', 'occurredAt', 'description']);
  const barangay = text(body.barangayPsgc, 'Barangay', 20);
  const category = text(body.categoryCode, 'Category', 50);
  const severity = text(body.severity, 'Severity', 12);
  ensure((SEVERITIES as readonly string[]).includes(severity), 'Choose an allowed severity.');
  const occurredAt = occurrence(body.occurredAt);
  ensure(body.description === undefined || typeof body.description === 'string', 'Description must be plain text.');
  ensure(body.description === undefined || (body.description as string).length <= 1000, 'Description must be at most 1000 characters.');
  const description = (body.description as string | undefined)?.trim() || null;
  ensure(!description || description.length <= 1000, 'Description must be at most 1000 characters.');
  const [b, c] = await env.DB.batch([
    env.DB.prepare('SELECT psgc FROM barangays WHERE psgc=? AND is_active=1').bind(barangay),
    env.DB.prepare('SELECT code FROM incident_categories WHERE code=? AND is_active=1').bind(category),
  ]);
  ensure(b.results.length === 1, 'Choose an active, valid barangay.');
  ensure(c.results.length === 1, 'Choose an active, valid category.');
  const key = request.headers.get('Idempotency-Key');
  ensure(!key || /^[a-f0-9-]{36}$/i.test(key), 'Invalid submission key.');
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([barangay, category, severity, occurredAt, description]))));
  const fingerprint = Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
  const prior = key ? await env.DB.prepare('SELECT * FROM incidents WHERE submission_key=?').bind(key).first<Incident>() : null;
  if (prior) {
    if (prior.submission_fingerprint !== fingerprint) throw new ApiError(409, 'DUPLICATE_KEY', 'This submission key was already used for a different report.');
    return success({ reference: prior.public_reference, status: 'submitted', createdAt: prior.created_at }, 201);
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const random = Array.from(crypto.getRandomValues(new Uint8Array(12)), (v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const localDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  const reference = `ILO-${localDate}-${random}`;
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO incidents(id,public_reference,barangay_psgc,category_code,severity,occurred_at,description_private,created_at,updated_at,submission_key,submission_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, reference, barangay, category, severity, occurredAt, description, now, now, key, fingerprint),
      env.DB.prepare("INSERT INTO incident_status_history(id,incident_id,from_status,to_status,changed_at,actor_type) VALUES(?,?,NULL,'submitted',?,'system')")
        .bind(crypto.randomUUID(), id, now),
    ]);
  } catch (error) {
    // Concurrent retries are protected by a UNIQUE key, not only the UI button.
    const existing = key ? await env.DB.prepare('SELECT * FROM incidents WHERE submission_key=?').bind(key).first<Incident>() : null;
    if (!existing || existing.submission_fingerprint !== fingerprint) throw error;
    return success({ reference: existing.public_reference, status: 'submitted', createdAt: existing.created_at }, 201);
  }
  return success({ reference, status: 'submitted', createdAt: now }, 201);
}

async function summary(url: URL, env: Env) {
  ensure([...url.searchParams.keys()].every((key) => ['category', 'severity'].includes(key)), 'Unsupported dashboard filter.');
  const predicates = ["i.is_public=1 AND i.status IN ('verified','responding','resolved')"];
  const values: string[] = [];
  const category = url.searchParams.get('category');
  const severity = url.searchParams.get('severity');
  if (category !== null) {
    ensure(category.length > 0 && await env.DB.prepare('SELECT code FROM incident_categories WHERE code=? AND is_active=1').bind(category).first(), 'Invalid category filter.');
    predicates.push('i.category_code=?'); values.push(category);
  }
  if (severity !== null) {
    ensure((SEVERITIES as readonly string[]).includes(severity), 'Invalid severity filter.');
    predicates.push('i.severity=?'); values.push(severity);
  }
  const where = predicates.join(' AND ');
  const queries = [
    `SELECT COUNT(*) AS count FROM incidents i WHERE ${where}`,
    `SELECT i.barangay_psgc AS psgc,b.name,COUNT(*) AS count FROM incidents i JOIN barangays b ON b.psgc=i.barangay_psgc WHERE ${where} GROUP BY i.barangay_psgc ORDER BY count DESC,b.name`,
    `SELECT i.category_code AS code,c.label,COUNT(*) AS count FROM incidents i JOIN incident_categories c ON c.code=i.category_code WHERE ${where} GROUP BY i.category_code ORDER BY c.display_order`,
    `SELECT i.severity AS code,COUNT(*) AS count FROM incidents i WHERE ${where} GROUP BY i.severity`,
    `SELECT i.status AS code,COUNT(*) AS count FROM incidents i WHERE ${where} GROUP BY i.status`,
  ];
  const results = await env.DB.batch(queries.map((query) => env.DB.prepare(query).bind(...values)));
  return success({ total: Number((results[0].results[0] as { count: number }).count), barangays: results[1].results, categories: results[2].results, severities: results[3].results, statuses: results[4].results });
}

async function reviewList(url: URL, env: Env) {
  ensure([...url.searchParams.keys()].every((key) => ['page', 'limit'].includes(key)), 'Unsupported review filter.');
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 25);
  ensure(Number.isInteger(page) && page >= 1 && page <= 100000 && Number.isInteger(limit) && limit >= 1 && limit <= 100, 'Invalid pagination.');
  const rows = await env.DB.prepare('SELECT i.id,i.public_reference,i.barangay_psgc,b.name AS barangay_name,i.category_code,c.label AS category_label,i.severity,i.occurred_at,i.description_private,i.status,i.is_public,i.created_at,i.updated_at FROM incidents i JOIN barangays b ON b.psgc=i.barangay_psgc JOIN incident_categories c ON c.code=i.category_code ORDER BY i.created_at DESC,i.id LIMIT ? OFFSET ?').bind(limit, (page - 1) * limit).all<Incident>();
  const items = await Promise.all(rows.results.map(async (row) => ({ ...row, history: (await env.DB.prepare('SELECT from_status,to_status,changed_at,actor_type,note_private FROM incident_status_history WHERE incident_id=? ORDER BY changed_at,rowid').bind(row.id).all()).results })));
  const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM incidents').first<{ count: number }>();
  return success({ items, page, limit, total: total?.count ?? 0 });
}

async function transition(request: Request, env: Env, id: string) {
  safeOrigin(request);
  ensure(/^[a-f0-9-]{36}$/i.test(id), 'Invalid review identifier.');
  const body = await readJson(request);
  onlyKeys(body, ['status', 'publish', 'note']);
  ensure(typeof body.status === 'string' && (STATUSES as readonly string[]).includes(body.status), 'Invalid status.');
  ensure(typeof body.publish === 'boolean', 'An explicit publication choice is required.');
  ensure(body.note === undefined || typeof body.note === 'string', 'Private note must be plain text.');
  ensure(body.note === undefined || (body.note as string).length <= 1000, 'Private note must be at most 1000 characters.');
  const note = (body.note as string | undefined)?.trim() || null;
  ensure(!note || note.length <= 1000, 'Private note must be at most 1000 characters.');
  const row = await env.DB.prepare('SELECT * FROM incidents WHERE id=?').bind(id).first<Incident>();
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Incident not found.');
  const status = body.status as Status;
  if (!TRANSITIONS[row.status].includes(status)) throw new ApiError(409, 'INVALID_TRANSITION', 'That status transition is not allowed.');
  ensure(!body.publish || ['verified', 'responding', 'resolved'].includes(status), 'Only reviewed, eligible incidents may be published.');
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE incidents SET status=?,is_public=?,updated_at=? WHERE id=? AND status=? AND updated_at=?')
      .bind(status, body.publish ? 1 : 0, now, id, row.status, row.updated_at),
    env.DB.prepare("INSERT INTO incident_status_history(id,incident_id,from_status,to_status,changed_at,actor_type,note_private) SELECT ?,?,?,?,?,'local_demo_reviewer',? WHERE changes()=1")
      .bind(crypto.randomUUID(), id, row.status, status, now, note),
  ]);
  if (results[0].meta.changes !== 1) throw new ApiError(409, 'CONFLICT', 'This incident changed. Refresh before reviewing it again.');
  return success(safeState({ ...row, status, is_public: body.publish ? 1 : 0, updated_at: now }));
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname.startsWith('/api/dev/') && !reviewAllowed(request, env)) throw new ApiError(403, 'DEV_REVIEW_DISABLED', 'Local Demo Review is unavailable.');
    if (pathname === '/api/health' && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM barangays WHERE is_active=1) AS barangays,(SELECT COUNT(*) FROM incident_categories WHERE is_active=1) AS categories').first<{ barangays: number; categories: number }>();
      if (result?.barangays !== 180 || result.categories !== 9) throw new ApiError(503, 'NOT_READY', 'Local reference data is not ready. Apply local migrations.');
      return success({ status: 'ok', database: 'ready', phase: 'local-mvp', features: { localDemoReview: reviewAllowed(request, env) } });
    }
    if (pathname === '/api/reference/barangays' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT psgc,name,representative_longitude,representative_latitude FROM barangays WHERE is_active=1 ORDER BY name COLLATE NOCASE,psgc').all<{ psgc: string; name: string; representative_longitude: number; representative_latitude: number }>();
      if (rows.results.length !== 180) throw new ApiError(503, 'NOT_READY', 'Barangay reference data is not ready.');
      return success(rows.results.map((row) => ({ psgc: row.psgc, name: row.name, representativePoint: { longitude: row.representative_longitude, latitude: row.representative_latitude } })));
    }
    if (pathname === '/api/reference/categories' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT code,label FROM incident_categories WHERE is_active=1 ORDER BY display_order').all();
      if (rows.results.length !== 9) throw new ApiError(503, 'NOT_READY', 'Category reference data is not ready.');
      return success(rows.results);
    }
    if (pathname === '/api/incidents' && request.method === 'POST') return await createIncident(request, env);
    if (pathname === '/api/public/summary' && request.method === 'GET') return await summary(url, env);
    if (pathname === '/api/dev/incidents' && request.method === 'GET') return await reviewList(url, env);
    const match = /^\/api\/dev\/incidents\/([^/]+)\/status$/.exec(pathname);
    if (match && request.method === 'PATCH') return await transition(request, env, match[1]);
    throw new ApiError(404, 'NOT_FOUND', 'API route not available.');
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError(503, 'SERVICE_UNAVAILABLE', 'The local service is unavailable. Check local setup and try again.');
    return Response.json({ data: null, error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: PRIVATE_HEADERS });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    return pathname === '/api' || pathname.startsWith('/api/') ? handleApiRequest(request, env) : env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
