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
  /** Tabs to hide entirely. Used to remove Account in guest mode (no
   *  profile to manage). The remaining tabs stay evenly spaced. */
  hide?: NavTab[];
}

export default function PillNav({ active, onSelect, hide = [] }: Props) {
  const visible = ITEMS.filter((i) => !hide.includes(i.id));
  return (
    <nav className="pill-nav" aria-label="Primary">
      {visible.map(({ id, label, Icon }) => {
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
