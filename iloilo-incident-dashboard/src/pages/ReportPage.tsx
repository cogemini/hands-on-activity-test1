import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, label, manilaToUtc, severityHelp, type Barangay, type Category, type Severity } from '../services/api';
import { APP } from '../config/app';
import { DisclaimerBanner } from '../components/DisclaimerBanner';

export function ReportPage({ onSubmitted, onReview, reviewEnabled }: { onSubmitted: () => void; onReview: () => void; reviewEnabled: boolean }) {
  const [references, setReferences] = useState<{ barangays: Barangay[]; categories: Category[] } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ reference: string; createdAt: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([api<Barangay[]>('/api/reference/barangays'), api<Category[]>('/api/reference/categories')])
      .then(([barangays, categories]) => { if (live) setReferences({ barangays: [...barangays].sort((a, b) => a.name.localeCompare(b.name)), categories }); })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [attempt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    lock.current = true; setPending(true); setError('');
    try {
      const values = new FormData(form);
      const body = { barangayPsgc: values.get('barangay'), categoryCode: values.get('category'), severity: values.get('severity'), occurredAt: manilaToUtc(String(values.get('date')), String(values.get('time'))), description: values.get('description') };
      const created = await api<{ reference: string; createdAt: string }>('/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current }, body: JSON.stringify(body) });
      setResult(created); onSubmitted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit the report.'); }
    finally { lock.current = false; setPending(false); }
  }
  return (
    <section className="content-page" aria-labelledby="report-heading">
      <span className="eyebrow">iLONGGO · Barangay-tagged reporting</span><h2 id="report-heading">Report an Incident</h2>
      <p className="page-intro">Report what occurred, not who was involved. Occurrence time is entered in Asia/Manila and is separate from submission time.</p>
      <DisclaimerBanner />
      {result ? <div className="form-card" role="status"><h3>Report submitted</h3><p className="reference-code">{result.reference}</p><p>Status: <strong>Submitted</strong></p><p>Your report was saved privately. Review and explicit publication are required before it appears in public summaries. Keep this reference number.</p>{reviewEnabled && <button className="secondary-button" onClick={onReview}>Open Local Demo Review</button>}<button className="secondary-button" onClick={() => { setResult(null); key.current = crypto.randomUUID(); }}>Report another incident</button></div> : <form className="form-card report-form" onSubmit={submit} aria-label="Incident report">
        {!references && !error && <p role="status">Loading iLONGGO barangays and categories…</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {!references && error && <button type="button" className="secondary-button" onClick={() => { setError(''); setAttempt((v) => v + 1); }}>Retry reference data</button>}
        <fieldset disabled={!references || pending}>
          <label htmlFor="report-barangay">Barangay</label><select id="report-barangay" name="barangay" required defaultValue="" aria-describedby="barangay-help"><option value="" disabled>Select a barangay</option>{references?.barangays.map((b) => <option value={b.psgc} key={b.psgc}>{b.name}</option>)}</select>
          <p id="barangay-help" className="field-help">Select the barangay where the incident occurred. iLONGGO geographically tags the report to the selected barangay. The map uses the barangay’s representative point and does not show the exact incident location.</p>
          <label htmlFor="report-category">Category</label><select id="report-category" name="category" required defaultValue=""><option value="" disabled>Select a category</option>{references?.categories.map((c) => <option value={c.code} key={c.code}>{c.label}</option>)}</select>
          <label htmlFor="report-severity">Severity</label><select id="report-severity" name="severity" required defaultValue="" aria-describedby="severity-help"><option value="" disabled>Select severity</option>{Object.keys(severityHelp).map((v) => <option value={v} key={v}>{label(v)} — {severityHelp[v as Severity]}</option>)}</select><p id="severity-help" className="field-help">Reporter-provided, not a verified professional assessment.</p>
          <div className="form-columns"><div><label htmlFor="report-date">Incident date</label><input id="report-date" name="date" type="date" required /></div><div><label htmlFor="report-time">Incident time</label><input id="report-time" name="time" type="time" required /><p className="field-help">Asia/Manila · UTC+08:00</p></div></div>
          <label htmlFor="report-description">Description <span className="field-help">(optional, up to 1,000 characters)</span></label><textarea id="report-description" name="description" maxLength={1000} rows={4} aria-describedby="description-help" /><p id="description-help" className="field-help">Do not include unnecessary personal, medical, household, or contact information. Do not identify minors or provide exact addresses.</p>
          <label className="acknowledgement"><input name="acknowledgement" type="checkbox" required /><span>I understand the barangay-level location and privacy limits, and confirm this report is accurate to the best of my knowledge.</span></label>
          <button className="primary-action" type="submit">{pending ? 'Submitting…' : 'Submit incident report'}</button>
        </fieldset>
      </form>}
      <p className="field-help">{APP.locationNotice} Personal identities and contact details are not collected. Retention and the official privacy policy will be finalized before production.</p>
    </section>
  );
}
