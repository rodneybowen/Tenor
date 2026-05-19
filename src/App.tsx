import { useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import BlobField from './components/BlobField';
import GrainOverlay from './components/GrainOverlay';
import PillNav, { type NavTab } from './components/PillNav';
import HomeScreen from './screens/HomeScreen';

type Overlay = null | 'log' | 'logs' | 'chat' | 'account';

const OVERLAY_COPY: Record<
  Exclude<Overlay, null>,
  { title: string; body: string }
> = {
  log: {
    title: 'Log flow',
    body: "Speak and the emotion selector come next — the home screen is wired and ready to hand off to them.",
  },
  logs: {
    title: 'Logs',
    body: 'The log history screen (day / week / month / year views) is the next screen after the log flows.',
  },
  chat: {
    title: 'Chat',
    body: 'The communications tab with your therapist is out of scope for this prototype.',
  },
  account: {
    title: 'Account',
    body: 'The account tab is out of scope for this prototype.',
  },
};

export default function App() {
  const [tab, setTab] = useState<NavTab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);

  function openLog() {
    setOverlay('log');
  }

  function handleNav(next: NavTab) {
    setTab(next);
    setOverlay(next === 'home' ? null : next);
  }

  return (
    <div className="app-root">
      <BlobField />
      <GrainOverlay />

      <HomeScreen onLog={openLog} onViewLogs={() => handleNav('logs')} />

      {overlay && (
        <div className="placeholder" role="dialog" aria-modal="true">
          <h2>{OVERLAY_COPY[overlay].title}</h2>
          <p>{OVERLAY_COPY[overlay].body}</p>
          <button
            type="button"
            onClick={() => {
              setOverlay(null);
              setTab('home');
            }}
          >
            <ArrowLeft size={16} weight="bold" />
            back to home
          </button>
        </div>
      )}

      <PillNav active={tab} onSelect={handleNav} />
    </div>
  );
}
