import type { ReactNode } from 'react';

export function FloatingPanel({ children, className = '', labelledBy }: { children: ReactNode; className?: string; labelledBy: string }) {
  return <section className={`floating-panel ${className}`} aria-labelledby={labelledBy}>{children}</section>;
}
