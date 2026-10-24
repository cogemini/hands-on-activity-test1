import type { ReactNode } from 'react';

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' }) {
  return <span className={`status-badge status-badge--${tone}`}><span className="status-dot" aria-hidden="true" />{children}</span>;
}
