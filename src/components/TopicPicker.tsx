import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { pickRandomTopics, wordSearchTopics } from '../lib/wordSearchTopics';
import './TopicPicker.css';

interface TopicPickerProps {
  onSelect: (topic: string) => void;
  busy?: boolean;
}

export function TopicPicker({ onSelect, busy = false }: TopicPickerProps) {
  const [topics, setTopics] = useState(() => pickRandomTopics(8));
  const [custom, setCustom] = useState('');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = custom.trim();
    if (trimmed) onSelect(trimmed);
  };

  return (
    <div className="topic-picker card">
      <div className="topic-picker-head">
        <span className="section-title">Pick a topic</span>
        <button
          className="btn btn-text"
          onClick={() => setTopics(pickRandomTopics(8))}
          disabled={busy}
        >
          Shuffle
        </button>
      </div>

      <ul className="topic-chips">
        {topics.map((topic) => (
          <li key={topic}>
            <button
              className="topic-chip"
              onClick={() => onSelect(topic)}
              disabled={busy}
            >
              {topic}
            </button>
          </li>
        ))}
      </ul>

      <div className="topic-custom-panel">
        <span className="topic-custom-label">
          <Sparkles size={15} strokeWidth={2.25} />
          Create with your own topic
        </span>
        <form className="topic-custom" onSubmit={handleCustomSubmit}>
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Anything you like&hellip;"
            maxLength={60}
            disabled={busy}
          />
          <button
            type="submit"
            className="btn btn-primary topic-custom-submit"
            disabled={busy || !custom.trim()}
          >
            {busy ? 'Building puzzle…' : 'Build puzzle'}
          </button>
        </form>
      </div>
      <p className="topic-note">
        {wordSearchTopics.length} topics to shuffle through. Custom requests get
        checked before the puzzle is built.
      </p>
    </div>
  );
}
