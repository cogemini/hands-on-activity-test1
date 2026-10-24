import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import type { View } from '../types/navigation';

type NavigationProps = { onInformation: () => void; onReport: () => void; view: View; reviewEnabled: boolean };

export function NavigationRail({ onInformation, onReport, view, reviewEnabled }: NavigationProps) {
  return (
    <aside className="navigation-rail">
      <a href="#overview" className="rail-brand" aria-label="iLONGGO overview"><BrandMark /></a>
      <nav aria-label="Main navigation" className="rail-links">
        <a href="#overview" className={`nav-item ${view === 'overview' ? 'is-current' : ''}`} aria-current={view === 'overview' ? 'page' : undefined}><Icon name="overview" /><span>Overview</span></a>
        <a href="#map" className={`nav-item ${view === 'map' ? 'is-current' : ''}`} aria-current={view === 'map' ? 'page' : undefined}><Icon name="map" /><span>Public Map</span></a>
        <button className={`nav-item ${view === 'report' ? 'is-current' : ''}`} onClick={onReport} aria-current={view === 'report' ? 'page' : undefined}><Icon name="plus" /><span>Report Incident</span></button>
        {reviewEnabled && <a href="#review" className={`nav-item ${view === 'review' ? 'is-current' : ''}`} aria-current={view === 'review' ? 'page' : undefined}><Icon name="shield" /><span>Local Demo Review</span><span className="nav-soon">Local only</span></a>}
      </nav>
      <button className="nav-item rail-information" onClick={onInformation} aria-haspopup="dialog"><Icon name="info" /><span>Information</span></button>
      <span className="rail-version" aria-label="Local research build">LOCAL<br />BUILD</span>
    </aside>
  );
}

export function MobileNavigation({ onInformation, onReport, view, reviewEnabled }: NavigationProps) {
  return (
    <nav className={`mobile-navigation ${reviewEnabled ? 'has-review' : ''}`} aria-label="Mobile navigation">
      <a href="#overview" aria-current={view === 'overview' ? 'page' : undefined}><Icon name="overview" /><span>Overview</span></a>
      <a href="#map" aria-current={view === 'map' ? 'page' : undefined}><Icon name="map" /><span>Public Map</span></a>
      <button className="mobile-report" onClick={onReport} aria-label="Report an Incident"><Icon name="plus" /><span>Report an Incident</span></button>
      {reviewEnabled && <a href="#review" aria-current={view === 'review' ? 'page' : undefined}><Icon name="shield" /><span>Local Demo Review</span></a>}
      <button onClick={onInformation} aria-haspopup="dialog"><Icon name="info" /><span>Information</span></button>
    </nav>
  );
}
