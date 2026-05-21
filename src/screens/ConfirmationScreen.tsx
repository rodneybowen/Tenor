import { Microphone, Plus, CalendarBlank, Clock, GridFour } from '@phosphor-icons/react';
import type { Detected } from '../lib/emotionDetect';
import { quadrantColor } from '../theme/emotions';

type Mode = 'speak' | 'select';

interface Props {
  chips: Detected[];
  time: string;
  mode: Mode;
  onAddAnother: () => void;
  onViewLogs: () => void;
}

const MODE_META: Record<Mode, { label: string; icon: typeof Microphone }> = {
  speak: { label: 'Voice note', icon: Microphone },
  select: { label: 'Emotion picker', icon: GridFour },
};

export default function ConfirmationScreen({
  chips,
  time,
  mode,
  onAddAnother,
  onViewLogs,
}: Props) {
  const ModeIcon = MODE_META[mode].icon;
  const modeLabel = MODE_META[mode].label;
  return (
    <div className="screen" id="confirmation">
      <div className="wordmark">Tenor</div>

      <div className="confirm-body">
        <div className="confirm-mic" aria-hidden="true">
          <ModeIcon size={26} weight="light" />
        </div>

        <h1 className="confirm-title">added to log</h1>

        <div className="confirm-meta">
          <Clock size={14} weight="regular" />
          <span>{time}</span>
          <span aria-hidden="true">·</span>
          <span>{modeLabel}</span>
        </div>

        <div className="chips chips--center">
          {chips.map((c, i) => (
            <span
              key={i}
              className="chip"
              style={
                c.quadrant
                  ? {
                      background: quadrantColor(c.quadrant, 0.26),
                      borderColor: quadrantColor(c.quadrant, 0.4),
                    }
                  : {
                      background: 'rgba(255,255,255,0.55)',
                      borderColor: 'rgba(34,34,34,0.14)',
                    }
              }
            >
              <span className="chip__text chip__text--static">{c.text}</span>
            </span>
          ))}
        </div>

        <div className="confirm-actions">
          <button type="button" className="btn-primary" onClick={onAddAnother}>
            <Plus size={16} weight="bold" />
            add to log
          </button>
          <button type="button" className="btn-secondary" onClick={onViewLogs}>
            <CalendarBlank size={16} weight="regular" />
            view logs
          </button>
        </div>
      </div>
    </div>
  );
}
