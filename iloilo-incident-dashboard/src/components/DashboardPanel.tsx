import { label, statusLabels, type Category, type Summary } from '../services/api';
import { FloatingPanel } from './FloatingPanel';

export function DashboardPanel({ summary, error, categories, category, severity, onCategory, onSeverity, onRefresh }: { summary: Summary | null; error: string; categories: Category[]; category: string; severity: string; onCategory: (v: string) => void; onSeverity: (v: string) => void; onRefresh: () => void }) {
  return <FloatingPanel className="empty-panel dashboard-panel" labelledBy="incident-heading"><div className="panel-heading"><h3 id="incident-heading">Published incidents</h3><button className="text-button" onClick={onRefresh}>Refresh</button></div>
    <div className="dashboard-filters"><label htmlFor="dashboard-category">Category filter</label><select id="dashboard-category" value={category} onChange={(e) => onCategory(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select><label htmlFor="dashboard-severity">Severity filter</label><select id="dashboard-severity" value={severity} onChange={(e) => onSeverity(e.target.value)}><option value="">All severities</option>{['low', 'moderate', 'high', 'critical'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select><button className="text-button" onClick={() => { onCategory(''); onSeverity(''); }}>Reset filters</button></div>
    {error ? <p role="alert" className="error-message">{error}</p> : !summary ? <p role="status">Loading iLONGGO public summaries…</p> : <>
      <div className="published-metric"><strong data-testid="published-total">{summary.total}</strong><span>verified and published incidents</span></div>
      {summary.total === 0 ? <p className="dashboard-empty">No verified and published incidents are available yet.</p> : <>
        <h4>By category</h4><ul className="aggregate-list">{summary.categories.map((v) => <li key={v.code}><span>{v.label}</span><strong>{v.count}</strong></li>)}</ul>
        <h4>By severity</h4><ul className="aggregate-list">{summary.severities.map((v) => <li key={v.code}><span>{label(v.code)}</span><strong>{v.count}</strong></li>)}</ul>
        <h4>By status</h4><ul className="aggregate-list">{summary.statuses.map((v) => <li key={v.code}><span>{statusLabels[v.code]}</span><strong>{v.count}</strong></li>)}</ul>
        <h4>By barangay</h4><ul className="aggregate-list">{summary.barangays.map((v) => <li key={v.psgc}><span>{v.name}</span><strong>{v.count}</strong></li>)}</ul>
      </>}
      <p className="empty-state-caption">Only explicitly published Verified, Responding, or Resolved reports are included. Descriptions and review notes are never public.</p>
    </>}
  </FloatingPanel>;
}
