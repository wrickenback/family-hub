import './UpdatePrompt.css';

export function UpdatePrompt({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <div className="update-content">
        <p>An update is available</p>
        <button onClick={onUpdate} className="btn btn-primary">
          Update now
        </button>
      </div>
    </div>
  );
}
