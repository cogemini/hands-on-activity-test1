import { useEffect, useRef } from 'react';
import { APP } from '../config/app';
import { DisclaimerBanner } from './DisclaimerBanner';
import { Icon } from './Icon';

export type DialogKind = 'information' | 'report' | null;

export function InformationDialog({ kind, onClose }: { kind: DialogKind; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (kind && !dialog.open) dialog.showModal();
    else if (!kind && dialog.open) dialog.close();
  }, [kind]);

  return (
    <dialog ref={ref} className="information-dialog" aria-labelledby="dialog-heading" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="dialog-header"><span className="eyebrow">{APP.designation}</span><button className="icon-button" onClick={onClose} aria-label="Close information dialog" autoFocus><Icon name="close" /></button></div>
      <h2 id="dialog-heading">{kind === 'report' ? 'Reporting is on the horizon.' : `A closer look at ${APP.name}.`}</h2>
      <p className="dialog-subtitle">{APP.subtitle}</p><p>{APP.fullName}</p><p>{APP.description}</p>
      <div className="dialog-note"><h3>Geotagged at barangay level. Never an exact site.</h3><p>{APP.locationNotice}</p><p>The established QGIS Point-on-Surface points represent barangays. They are not GPS observations, household addresses, barangay halls, or population centers.</p></div>
      <h3>What is available now</h3>
      <p>Local incident reporting, a development-only review workflow, and verified public aggregate summaries on actual barangay geography. “Geotagged” means tagged to a barangay administrative area—not an exact GPS point, address, household, or live location.</p>
      <h3>Independent research, not an official service</h3>
      <p>No government adoption or endorsement is implied. Do not enter personal information in descriptions. Public summaries are aggregated. Local Demo Review is development-only, not production authentication. Retention, the official privacy policy, production authentication, and anti-abuse protection remain future work. Production submissions are disabled.</p>
      <DisclaimerBanner />
      <button className="secondary-button dialog-done" onClick={onClose}>Understood · Close</button>
    </dialog>
  );
}
