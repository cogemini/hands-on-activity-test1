import { useCallback, useEffect, useState } from 'react';
import { api, label, manilaTime, statusLabels, type ReviewIncident, type Status } from '../services/api';
import { ConfirmDialog } from '../components/ConfirmDialog';

const actions: Record<Status, { status: Status; label: string; publish?: boolean; confirm?: boolean }[]> = {
  submitted: [{ status: 'under_review', label: 'Start review' }, { status: 'rejected', label: 'Reject', publish: false, confirm: true }],
  under_review: [{ status: 'verified', label: 'Verify and publish', publish: true, confirm: true }, { status: 'verified', label: 'Verify privately', publish: false }, { status: 'rejected', label: 'Reject', publish: false, confirm: true }],
  verified: [{ status: 'responding', label: 'Mark Responding' }, { status: 'resolved', label: 'Resolve', confirm: true }],
  responding: [{ status: 'resolved', label: 'Resolve', confirm: true }], resolved: [], rejected: [],
};
type PendingAction = { incident: ReviewIncident; status: Status; publish: boolean; label: string; note: string };

export function ReviewPage({ onChanged }: { onChanged: () => void }) {
  const [queue, setQueue] = useState<{ items: ReviewIncident[]; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingAction | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refresh = useCallback(() => api<{ items: ReviewIncident[]; total: number }>(`/api/dev/incidents?page=${page}&limit=10`)
    .then((data) => { setQueue(data); setError(''); })
    .catch((e: Error) => setError(e.message)), [page]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function update(action: PendingAction) {
    if (pending) return;
    setPending(true); setError('');
    try {
      await api(`/api/dev/incidents/${action.incident.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: action.status, publish: action.publish, note: action.note }) });
      setConfirmation(null); onChanged(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Status update failed.'); setConfirmation(null); }
    finally { setPending(false); }
  }
  return <section className="content-page review-page" aria-labelledby="review-heading"><span className="eyebrow">Local development only · Not production authentication</span><h2 id="review-heading">Local Demo Review</h2><p className="page-intro">Review reports from this local D1 database. Private descriptions and notes must not be copied into public summaries. Resolved and Rejected are terminal.</p>
    <button className="secondary-button" disabled={pending} onClick={() => void refresh()}>Refresh queue</button>
    {error && <p role="alert" className="error-message">{error}</p>}{!queue && !error && <p role="status">Loading local review queue…</p>}{queue?.items.length === 0 && <p className="form-card">No local submissions are awaiting review.</p>}
    {queue?.items.map((incident) => <article className="form-card review-card" key={incident.id} aria-labelledby={`incident-${incident.id}`}><div className="review-card-heading"><h3 id={`incident-${incident.id}`} className="reference-code">{incident.public_reference}</h3><span className="status-badge">{statusLabels[incident.status]} · {incident.is_public ? 'Published' : 'Private'}</span></div><dl className="incident-details"><div><dt>Barangay</dt><dd>{incident.barangay_name}</dd></div><div><dt>Category</dt><dd>{incident.category_label}</dd></div><div><dt>Severity</dt><dd>{label(incident.severity)} (reporter-provided)</dd></div><div><dt>Occurred · Asia/Manila</dt><dd>{manilaTime(incident.occurred_at)}</dd></div><div><dt>Submitted · Asia/Manila</dt><dd>{manilaTime(incident.created_at)}</dd></div></dl><h4>Private description</h4><p className="private-description">{incident.description_private || 'No description supplied.'}</p>
      {actions[incident.status].length > 0 && <><label htmlFor={`note-${incident.id}`}>Private review note (optional)</label><textarea id={`note-${incident.id}`} rows={2} maxLength={1000} value={notes[incident.id] ?? ''} onChange={(e) => setNotes((current) => ({ ...current, [incident.id]: e.target.value }))} /><div className="review-actions">{actions[incident.status].map((action) => <button className="secondary-button" disabled={pending} key={action.label} onClick={() => {
        const change = { incident, status: action.status, publish: action.publish ?? Boolean(incident.is_public), label: action.label, note: notes[incident.id] ?? '' };
        if (action.confirm) setConfirmation(change); else void update(change);
      }}>{action.label}</button>)}</div></>}
      <details className="history"><summary>Status history ({incident.history.length})</summary><ol>{incident.history.map((entry, index) => <li key={index}><strong>{entry.from_status ? `${statusLabels[entry.from_status]} → ` : ''}{statusLabels[entry.to_status]}</strong><span>{manilaTime(entry.changed_at)} · {entry.actor_type === 'system' ? 'System' : 'Local demo reviewer'}</span>{entry.note_private && <p>{entry.note_private}</p>}</li>)}</ol></details>
    </article>)}
    {queue && <div className="review-actions"><button className="secondary-button" disabled={page === 1 || pending} onClick={() => setPage((p) => p - 1)}>Previous page</button><span>Page {page} · {queue.total} local reports</span><button className="secondary-button" disabled={page * 10 >= queue.total || pending} onClick={() => setPage((p) => p + 1)}>Next page</button></div>}
    <ConfirmDialog action={confirmation?.label ?? null} pending={pending} onCancel={() => setConfirmation(null)} onConfirm={() => { if (confirmation) void update(confirmation); }} />
  </section>;
}
