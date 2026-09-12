import { useState } from 'react';
import { pickRandomTopics, wordSearchTopics } from '../lib/wordSearchTopics';
import './TopicPicker.css';

export function TopicPicker() {
  const [topics, setTopics] = useState(() => pickRandomTopics(8));
  const [custom, setCustom] = useState('');

  return (
    <div className="topic-picker card">
      <div className="topic-picker-head">
        <span className="section-title">Pick a topic</span>
        <button
          className="btn btn-text"
          onClick={() => setTopics(pickRandomTopics(8))}
        >
          Shuffle
        </button>
      </div>

      <ul className="topic-chips">
        {topics.map((topic) => (
          <li key={topic}>
            <button className="topic-chip">{topic}</button>
          </li>
        ))}
      </ul>

      <label className="topic-custom">
        <span>Or ask for your own</span>
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Anything you like&hellip;"
          maxLength={60}
        />
      </label>
      <p className="topic-note">
        {wordSearchTopics.length} topics to shuffle through. Custom requests get
        checked before the puzzle is built.
      </p>
    </div>
  );
}
