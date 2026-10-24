export type Barangay = { psgc: string; name: string; representativePoint: { longitude: number; latitude: number } };
export type Category = { code: string; label: string };
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type Status = 'submitted' | 'under_review' | 'verified' | 'responding' | 'resolved' | 'rejected';
export type Summary = {
  total: number;
  barangays: { psgc: string; name: string; count: number }[];
  categories: { code: string; label: string; count: number }[];
  severities: { code: Severity; count: number }[];
  statuses: { code: Status; count: number }[];
};
export type ReviewIncident = {
  id: string; public_reference: string; barangay_psgc: string; barangay_name: string;
  category_code: string; category_label: string; severity: Severity; occurred_at: string;
  description_private: string | null; status: Status; is_public: number;
  created_at: string; updated_at: string;
  history: { from_status: Status | null; to_status: Status; changed_at: string; actor_type: string; note_private: string | null }[];
};
export const severityHelp = {
  low: 'Limited impact and no immediate threat.', moderate: 'Requires attention but is currently contained.',
  high: 'Serious impact requiring prompt response.', critical: 'Immediate threat to life, safety, or major infrastructure.',
};
export const statusLabels: Record<Status, string> = { submitted: 'Submitted', under_review: 'Under Review', verified: 'Verified', responding: 'Responding', resolved: 'Resolved', rejected: 'Rejected' };
export const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const manilaTime = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function manilaToUtc(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Enter the incident date and time.');
  const ms = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(ms) || new Date(ms + 8 * 3600000).toISOString().slice(0, 16) !== `${date}T${time}`) throw new Error('Enter a valid date and time.');
  return new Date(ms).toISOString();
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && !navigator.onLine) throw new Error('You are offline. Keep this form open and resubmit when connectivity returns. Nothing is queued.');
  const response = await fetch(path, { ...init, cache: 'no-store' });
  let body;
  try { body = await response.json(); } catch { throw new Error('The local API is unavailable. Start the local Worker and try again.'); }
  if (!response.ok || body.error) throw new Error(body.error?.message ?? 'The local service could not complete this request.');
  return body.data as T;
}
