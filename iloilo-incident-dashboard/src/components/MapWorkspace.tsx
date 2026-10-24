import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { APP } from '../config/app';
import { loadSpatialData, type SpatialData } from '../services/spatial';
import { DisclaimerBanner } from './DisclaimerBanner';
import { FloatingPanel } from './FloatingPanel';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';
import { api, type Category, type Summary } from '../services/api';
import { DashboardPanel } from './DashboardPanel';

const SpatialPreview = lazy(() => import('../map/SpatialPreview'));
type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: SpatialData };

export function MapWorkspace({ revision = 0 }: { revision?: number }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [showPolygons, setShowPolygons] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [showBoundary, setShowBoundary] = useState(true);
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [aggregate, setAggregate] = useState<{ key: string; summary: Summary | null; error: string } | null>(null);
  const queryKey = JSON.stringify([category, severity, refresh, revision]);
  useEffect(() => {
    const abort = new AbortController();
    const query = new URLSearchParams();
    if (category) query.set('category', category);
    if (severity) query.set('severity', severity);
    api<Summary>(`/api/public/summary?${query}`, { signal: abort.signal }).then((summary) => {
      if (!abort.signal.aborted) setAggregate({ key: queryKey, summary, error: '' });
    }).catch((e: Error) => { if (!abort.signal.aborted) setAggregate({ key: queryKey, summary: null, error: e.message }); });
    return () => abort.abort();
  }, [category, severity, queryKey]);
  useEffect(() => { api<Category[]>('/api/reference/categories').then(setCategories).catch(() => undefined); }, []);
  const summary = aggregate?.key === queryKey ? aggregate.summary : null;
  const summaryError = aggregate?.key === queryKey ? aggregate.error : '';
  const counts = useMemo(() => Object.fromEntries(summary?.barangays.map((v) => [v.psgc, v.count]) ?? []), [summary]);
  useEffect(() => {
    const abort = new AbortController();
    loadSpatialData(abort.signal).then((data) => {
      if (!abort.signal.aborted) setLoad({ status: 'ready', data });
    }).catch(() => { if (!abort.signal.aborted) setLoad({ status: 'error' }); });
    return () => abort.abort();
  }, [attempt]);
  const data = load.status === 'ready' ? load.data : null;
  const selected = data?.barangays.features.find((feature) => feature.properties.adm4_psgc === selectedId);
  const barangays = data ? [...data.barangays.features].sort((a, b) => a.properties.adm4_en.localeCompare(b.properties.adm4_en)) : [];

  return (
    <section id="map-workspace" className="map-workspace" tabIndex={-1} aria-labelledby="workspace-heading">
      <div className="map-stage">
        <div className="map-coordinate-grid" aria-hidden="true" />
        {data ? <Suspense fallback={<p className="map-render-status" role="status">Preparing spatial preview…</p>}><SpatialPreview data={data} counts={counts} selectedId={selectedId} onSelect={setSelectedId} showPoints={showPoints} showPolygons={showPolygons} showBoundary={showBoundary} /></Suspense> : <div className="map-render-status" role="status">{load.status === 'error' ? 'Spatial preview unavailable.' : 'Loading validated spatial layers…'}</div>}
        <div className="map-context"><span className="context-cross" aria-hidden="true">+</span><div><span className="eyebrow">Western Visayas · Philippines</span><strong>Iloilo City</strong></div><span className="map-mode-tag">GEOGRAPHIC PREVIEW</span></div>
      </div>

      <FloatingPanel className="overview-panel" labelledBy="workspace-heading">
        <span className="eyebrow">A local lens. A shared city.</span>
        <h2 id="workspace-heading">A clearer view.<br /><span>At barangay level.</span></h2>
        <p className="overview-description">{APP.description}</p>
        <div className="geography-summary">
          <div><span className="geography-number">{data ? data.barangays.features.length : '—'}</span><span>barangay boundaries</span></div>
          <span className="summary-icon"><Icon name="layers" size={24} /></span>
        </div>
        <p className="small-copy">{summary ? `${summary.total} verified and published incidents match the filters.` : summaryError ? 'Public summaries are unavailable. Retry using Refresh.' : 'Loading public summaries…'} This is a local research prototype, not an emergency dispatch feed.</p>
        <div className="map-legend" aria-label="Published incident count legend"><span>Published incidents by barangay</span><span>Unshaded: 0 · Dark blue: 1–2 · Blue: 3–9 · Light blue: 10+</span></div>
        <div className="overview-footer"><span className="mini-label">Local D1 aggregates</span><span className="phase-label">Local MVP</span></div>
      </FloatingPanel>

      <div className="workspace-side">
        <FloatingPanel className="layers-panel" labelledBy="layers-heading">
          <div className="panel-heading"><h3 id="layers-heading"><Icon name="layers" size={17} />Spatial layers</h3><span className="mini-label">WGS 84</span></div>
          <div className="layer-options">
            <label><input type="checkbox" checked={showBoundary} onChange={(event) => setShowBoundary(event.target.checked)} disabled={!data} /><span className="layer-symbol layer-symbol--boundary" aria-hidden="true" /><span>City boundary</span></label>
            <label><input type="checkbox" checked={showPolygons} onChange={(event) => setShowPolygons(event.target.checked)} disabled={!data} /><span className="layer-symbol layer-symbol--polygon" aria-hidden="true" /><span>Barangay polygons</span></label>
            <label><input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} disabled={!data} /><span className="layer-symbol layer-symbol--point" aria-hidden="true" /><span>Representative points</span></label>
          </div>
          <div className="layer-selector"><label htmlFor="barangay-preview">Explore a barangay</label><select id="barangay-preview" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={!data}><option value="">All barangays</option>{barangays.map((feature) => <option key={feature.properties.adm4_psgc} value={feature.properties.adm4_psgc}>{feature.properties.adm4_en}</option>)}</select></div>
          {selected && <div className="selected-barangay" aria-live="polite"><strong>{selected.properties.adm4_en}</strong><span>PSGC {selected.properties.adm4_psgc}</span><span>Published incidents: {summary ? counts[selected.properties.adm4_psgc] ?? 0 : '—'}</span><button onClick={() => setSelectedId('')}>Clear selection</button><p>Barangay preview only. This does not select an incident site.</p></div>}
          <div className="layer-status" role="status">{data ? <StatusBadge tone="success">Spatial layers loaded successfully</StatusBadge> : <StatusBadge>{load.status === 'error' ? 'Layers could not be loaded' : 'Loading spatial layers'}</StatusBadge>}</div>
          {load.status === 'error' && <button className="secondary-button" onClick={() => { setLoad({ status: 'loading' }); setAttempt((value) => value + 1); }}>Retry spatial layers</button>}
          <p className="small-copy basemap-note">Local geography on a neutral dark canvas. No external basemap or street detail.</p>
        </FloatingPanel>
        <DashboardPanel summary={summary} error={summaryError} categories={categories} category={category} severity={severity} onCategory={setCategory} onSeverity={setSeverity} onRefresh={() => setRefresh((v) => v + 1)} />
      </div>

      <div className="workspace-bottom">
        <div className="workspace-status"><span>ILOILO CITY SPATIAL PREVIEW</span><span><span className="status-dot" aria-hidden="true" />{data ? 'Validated reference geography · EPSG:4326' : load.status === 'error' ? 'Reference geography unavailable' : 'Loading reference geography'}</span></div>
        <aside className="location-notice" aria-label="Location interpretation"><Icon name="info" size={18} /><p>{APP.locationNotice}</p></aside>
        <DisclaimerBanner />
      </div>
    </section>
  );
}
