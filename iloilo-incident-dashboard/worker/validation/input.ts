export const SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const;
export const STATUSES = ['submitted', 'under_review', 'verified', 'responding', 'resolved', 'rejected'] as const;
export type Status = typeof STATUSES[number];
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: ['under_review', 'rejected'], under_review: ['verified', 'rejected'],
  verified: ['responding', 'resolved'], responding: ['resolved'], resolved: [], rejected: [],
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new ApiError(400, 'VALIDATION_ERROR', message);
}
export function text(value: unknown, name: string, max: number): string {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name} is required and must be at most ${max} characters.`);
  return value.trim();
}
export function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  ensure(Object.keys(body).every((key) => allowed.includes(key)), 'Unsupported fields. Exact locations, identities, and administrative fields must not be submitted.');
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }
  const reader = request.body?.getReader();
  ensure(reader, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body must not exceed 8 KiB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'Enter a valid JSON object.'); }
  ensure(body && typeof body === 'object' && !Array.isArray(body), 'Enter a JSON object.');
  return body as Record<string, unknown>;
}
export function occurrence(value: unknown, now = Date.now()): string {
  const input = text(value, 'Occurrence date and time', 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(input);
  ensure(match, 'Occurrence time must be ISO 8601 with an explicit timezone.');
  const [, year, month, day, hour, minute, second = '00', , zone] = match;
  const hours = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const minutes = zone === 'Z' ? 0 : Number(zone.slice(4));
  ensure(hours <= 14 && minutes <= 59 && (hours !== 14 || minutes === 0), 'Invalid timezone offset.');
  const shift = (hours * 60 + minutes) * (zone.startsWith('-') ? -1 : 1);
  const ms = Date.parse(input);
  ensure(Number.isFinite(ms), 'Invalid occurrence date or time.');
  const local = new Date(ms + shift * 60000).toISOString();
  ensure(local.slice(0, 19) === `${year}-${month}-${day}T${hour}:${minute}:${second}`, 'Invalid calendar date or time.');
  ensure(ms <= now + 5 * 60000, 'Occurrence time cannot be more than five minutes in the future.');
  return new Date(ms).toISOString();
}
