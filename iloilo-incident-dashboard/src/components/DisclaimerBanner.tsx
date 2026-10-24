import { APP } from '../config/app';
import { Icon } from './Icon';

export function DisclaimerBanner() {
  return <aside className="disclaimer-banner" aria-label="Emergency service disclaimer"><Icon name="shield" size={18} /><p>{APP.emergencyNotice}</p></aside>;
}
