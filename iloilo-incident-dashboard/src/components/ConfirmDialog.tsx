import { useEffect, useRef } from 'react';

export function ConfirmDialog({ action, pending, onCancel, onConfirm }: { action: string | null; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (action && !ref.current?.open) ref.current?.showModal(); else if (!action && ref.current?.open) ref.current.close(); }, [action]);
  return <dialog ref={ref} className="information-dialog" aria-labelledby="confirmation-heading" onCancel={(e) => { e.preventDefault(); if (!pending) onCancel(); }} onKeyDown={(e) => {
    if (e.key !== 'Tab') return;
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1]?.focus(); }
    else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0]?.focus(); }
  }}><span className="eyebrow">Local Demo Review · Confirmation</span><h2 id="confirmation-heading">Confirm {action ?? 'change'}</h2><p>This changes the local incident workflow. Publishing makes aggregate counts visible publicly; descriptions and private notes remain private.</p><div className="review-actions"><button className="secondary-button" autoFocus disabled={pending} onClick={onCancel}>Cancel</button><button className="primary-action" disabled={pending} onClick={onConfirm}>{pending ? 'Saving…' : 'Confirm change'}</button></div></dialog>;
}
