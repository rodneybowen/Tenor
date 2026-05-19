import { House, CalendarBlank, ChatCircle, User } from '@phosphor-icons/react';

export type NavTab = 'home' | 'logs' | 'chat' | 'account';

const ITEMS: { id: NavTab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'HOME', Icon: House },
  { id: 'logs', label: 'LOGS', Icon: CalendarBlank },
  { id: 'chat', label: 'CHAT', Icon: ChatCircle },
  { id: 'account', label: 'ACCOUNT', Icon: User },
];

interface Props {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
}

export default function PillNav({ active, onSelect }: Props) {
  return (
    <nav className="pill-nav" aria-label="Primary">
      {ITEMS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            className={`nav-btn${isActive ? ' nav-btn--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label.toLowerCase()}
            onClick={() => onSelect(id)}
          >
            <Icon size={22} weight={isActive ? 'fill' : 'light'} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
