import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { MapWorkspace } from './components/MapWorkspace';
import { ReportPage } from './pages/ReportPage';
import { ReviewPage } from './pages/ReviewPage';
import { api } from './services/api';
import type { View } from './types/navigation';

function currentView(): View { const hash = window.location.hash.slice(1); return ['map', 'report', 'review'].includes(hash) ? hash as View : 'overview'; }

export default function App() {
  const [view, setView] = useState<View>(currentView);
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const change = () => { setView(currentView()); document.getElementById('main-content')?.focus(); };
    window.addEventListener('hashchange', change);
    api<{ features: { localDemoReview: boolean } }>('/api/health').then((health) => setReviewEnabled(health.features.localDemoReview)).catch(() => setReviewEnabled(false));
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const changed = () => setRevision((v) => v + 1);
  return <AppShell view={view} reviewEnabled={reviewEnabled} onReport={() => { window.location.hash = 'report'; }}>
    {view === 'report' ? <ReportPage onSubmitted={changed} reviewEnabled={reviewEnabled} onReview={() => { window.location.hash = 'review'; }} /> : view === 'review' ? reviewEnabled ? <ReviewPage onChanged={changed} /> : <section className="content-page"><h2>Local Demo Review unavailable</h2><p>This development-only queue requires explicit local configuration. This is not production authentication.</p></section> : <MapWorkspace revision={revision} />}
  </AppShell>;
}
