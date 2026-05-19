import { Microphone, PencilSimple, Camera, CaretDown } from '@phosphor-icons/react';
import BackButton from '../components/BackButton';

interface Props {
  onBack: () => void;
  onSpeak: () => void;
  onPickEmotions: () => void;
}

export default function LogMethodScreen({
  onBack,
  onSpeak,
  onPickEmotions,
}: Props) {
  return (
    <div className="screen" id="log-method">
      <div className="wordmark">Tenor</div>
      <div className="top-bar">
        <BackButton onClick={onBack} />
      </div>

      <div className="lm-body">
        <h1 className="lm-title">
          How do you want
          <br />
          to log today?
        </h1>

        <div className="bubble-row">
          <button type="button" className="input-bubble" onClick={onSpeak}>
            <span className="i-bubble">
              <Microphone size={28} weight="light" />
            </span>
            <span className="i-label">Speak</span>
          </button>

          <div className="input-bubble input-bubble--off" aria-disabled="true">
            <span className="i-bubble">
              <PencilSimple size={28} weight="light" />
            </span>
            <span className="i-label">Type</span>
          </div>

          <div className="input-bubble input-bubble--off" aria-disabled="true">
            <span className="i-bubble">
              <Camera size={28} weight="light" />
            </span>
            <span className="i-label">Scan</span>
          </div>
        </div>

        <button
          type="button"
          className="lm-help"
          onClick={onPickEmotions}
        >
          <span>
            Need help naming your feelings?
            <br />
            Select from below.
          </span>
          <CaretDown size={20} weight="regular" />
        </button>
      </div>
    </div>
  );
}
