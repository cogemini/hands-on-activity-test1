import { Icon } from './Icon';

export function PrimaryAction({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="primary-action" onClick={onClick}>
      <Icon name="plus" size={18} /><span>Report an Incident</span><Icon name="arrow" size={16} />
    </button>
  );
}
