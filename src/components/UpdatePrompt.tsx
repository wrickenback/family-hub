import './UpdatePrompt.css';

export function UpdatePrompt({ onUpdate }: { onUpdate: () => void }) {
  return (
    <div className="update-prompt">
      <div className="update-content">
        <p>An update is available</p>
        <button onClick={onUpdate} className="btn btn-primary">
          Update now
        </button>
      </div>
    </div>
  );
}
