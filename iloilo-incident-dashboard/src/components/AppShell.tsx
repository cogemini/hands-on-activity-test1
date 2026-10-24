import { useState, type ReactNode } from 'react';
import { InformationDialog, type DialogKind } from './InformationDialog';
import { MobileNavigation, NavigationRail } from './Navigation';
import { TopBar } from './TopBar';
import type { View } from '../types/navigation';

export function AppShell({ children, view, onReport, reviewEnabled }: { children: ReactNode; view: View; onReport: () => void; reviewEnabled: boolean }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const actions = { onInformation: () => setDialog('information'), onReport, view, reviewEnabled };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to spatial overview</a>
      <NavigationRail {...actions} />
      <div className="app-content">
        <TopBar {...actions} />
        <main id="main-content" tabIndex={-1} aria-label="iLONGGO spatial overview">{children}</main>
      </div>
      <MobileNavigation {...actions} />
      <InformationDialog kind={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
