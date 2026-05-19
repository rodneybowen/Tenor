import { ArrowLeft } from '@phosphor-icons/react';

export default function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="back-btn"
      aria-label="Go back"
      onClick={onClick}
    >
      <ArrowLeft size={20} weight="regular" />
    </button>
  );
}
