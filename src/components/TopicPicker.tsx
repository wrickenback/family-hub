import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { pickRandomTopics, wordSearchTopics } from '../lib/wordSearchTopics';
import type { WordSearchDifficulty } from '../lib/firestoreWordSearch';
import './TopicPicker.css';

interface TopicPickerProps {
  onSelect: (topic: string, difficulty: WordSearchDifficulty) => void;
  busy?: boolean;
}

export function TopicPicker({ onSelect, busy = false }: TopicPickerProps) {
  const [topics, setTopics] = useState(() => pickRandomTopics(8));
  const [custom, setCustom] = useState('');
  const [difficulty, setDifficulty] = useState<WordSearchDifficulty>('hard');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = custom.trim();
    if (trimmed) onSelect(trimmed, difficulty);
  };

  const handleLoadMore = () => {
    setTopics((prev) => [...prev, ...pickRandomTopics(8)]);
  };

  return (
    <div className="topic-picker card">
      {/* The difficulty switch lives in the header row as a small segmented
          control, deliberately nothing like the topic chips below it — when
          it was chip-shaped and sat directly under "Pick a topic" it read as
          two more topics to choose from. */}
      <div className="topic-picker-head">
        <span className="section-title">Pick a topic</span>
        <div
          className="difficulty-toggle"
          role="radiogroup"
          aria-label="Difficulty"
        >
          <button
            type="button"
            role="radio"
            aria-checked={difficulty === 'easy'}
            className={`difficulty-btn ${difficulty === 'easy' ? 'active' : ''}`}
            onClick={() => setDifficulty('easy')}
            disabled={busy}
          >
            Easy
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={difficulty === 'hard'}
            className={`difficulty-btn ${difficulty === 'hard' ? 'active' : ''}`}
            onClick={() => setDifficulty('hard')}
            disabled={busy}
          >
            Classic
          </button>
        </div>
      </div>

      <p className="difficulty-note">
        {difficulty === 'easy'
          ? 'Words read across and down only.'
          : 'Words can also read backwards and upwards.'}
      </p>

      <ul className="topic-chips">
        {topics.map((topic) => (
          <li key={topic}>
            <button
              className="topic-chip"
              onClick={() => onSelect(topic, difficulty)}
              disabled={busy}
            >
              {topic}
            </button>
          </li>
        ))}
      </ul>

      <button
        className="btn btn-secondary topic-load-more"
        onClick={handleLoadMore}
        disabled={busy}
      >
        Load more topics
      </button>

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
          {custom.trim() && (
            <button
              type="submit"
              className="btn btn-primary topic-custom-submit"
              disabled={busy}
            >
              {busy ? 'Building puzzle…' : 'Build puzzle'}
            </button>
          )}
        </form>
      </div>
      <p className="topic-note">
        {wordSearchTopics.length} topics to shuffle through. Custom requests get
        checked before the puzzle is built.
      </p>
    </div>
  );
}
