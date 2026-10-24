import { APP } from '../config/app';
import { Icon } from './Icon';
import { PrimaryAction } from './PrimaryAction';

export function TopBar({ onInformation, onReport }: { onInformation: () => void; onReport: () => void }) {
  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <div className="brand-title-line"><h1>{APP.name}</h1><span className="prototype-tag">{APP.designation}</span></div>
        <p className="brand-subtitle">{APP.subtitle}</p>
      </div>
      <div className="top-actions">
        <span className="location-label"><Icon name="pin" size={16} />Iloilo City, Philippines</span>
        <div className="desktop-primary"><PrimaryAction onClick={onReport} /></div>
        <button className="icon-button information-button" onClick={onInformation} aria-label="About iLONGGO and important disclaimers" aria-haspopup="dialog"><Icon name="info" /></button>
      </div>
    </header>
  );
}
