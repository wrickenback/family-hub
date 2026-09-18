import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { Confetti } from '../components/Confetti';
import { GameLeaderboard } from '../components/GameLeaderboard';
import { ProviderBadge } from '../components/ProviderBadge';
import { IconChevronLeft, IconChevronRight } from '../components/icons';
import {
  SIZE,
  cellsOf,
  emptyBoard,
  isBlock,
  isSolved,
  setCell,
  wrongCells,
  type CrosswordEntry,
  type MiniCrossword,
} from '../lib/miniCrosswordEngine';
import { fetchMiniCrossword } from '../lib/firestoreCrossword';
import { todayKey } from '../lib/blocksEngine';
import { submitScore } from '../lib/firestoreScores';
import { playClear, playPlace, playWin } from '../lib/sound';
import './MiniCrosswordGame.css';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/** How long the wait has to run before the message changes. Generating a
 * grid is genuinely slow on the day's first open — the model has to solve a
 * constraint problem, not write a sentence — so the wait says what's
 * actually happening instead of spinning silently for two minutes. */
const WAIT_STAGES: { after: number; text: string }[] = [
  { after: 0, text: "Building today's crossword…" },
  { after: 6, text: 'Fitting the words together…' },
  { after: 18, text: 'This one is being stubborn — trying a smarter model…' },
  { after: 45, text: 'Still going. A tricky grid can take a minute.' },
  { after: 90, text: 'Nearly there — hang on.' },
];

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function MiniCrosswordGame({
  uid,
  displayName,
  onBack,
}: {
  uid: string;
  displayName: string;
  onBack: () => void;
}) {
  const [puzzle, setPuzzle] = useState<MiniCrossword | null>(null);
  const [loading, setLoading] = useState(true);
  const [waited, setWaited] = useState(0);
  const [board, setBoard] = useState<string[]>(emptyBoard);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [direction, setDirection] = useState<'across' | 'down'>('across');
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const submitted = useRef(false);
  const dateKey = todayKey();

  useEffect(() => {
    let live = true;
    fetchMiniCrossword(dateKey).then((next) => {
      if (!live) return;
      setPuzzle(next);
      setLoading(false);
      startedAt.current = Date.now();
    });
    return () => {
      live = false;
    };
  }, [dateKey]);

  // Ticks the wait message along while the grid is being built.
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setWaited((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (loading || solved || !startedAt.current) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 500);
    return () => clearInterval(timer);
  }, [loading, solved]);

  const activeEntry: CrosswordEntry | null = useMemo(() => {
    if (!puzzle) return null;
    return (
      puzzle.entries.find(
        (entry) =>
          entry.direction === direction &&
          cellsOf(entry).some(([r, c]) => r === cursor.row && c === cursor.col)
      ) ?? null
    );
  }, [puzzle, direction, cursor]);

  const entryIndex = puzzle && activeEntry ? puzzle.entries.indexOf(activeEntry) : -1;

  const moveToEntry = useCallback(
    (step: number) => {
      if (!puzzle || entryIndex < 0) return;
      const next =
        puzzle.entries[
          (entryIndex + step + puzzle.entries.length) % puzzle.entries.length
        ];
      setDirection(next.direction);
      setCursor({ row: next.row, col: next.col });
    },
    [puzzle, entryIndex]
  );

  const typeLetter = useCallback(
    (letter: string) => {
      if (!puzzle || solved || !activeEntry) return;
      setBoard((current) => {
        const next = setCell(current, cursor.row, cursor.col, letter);
        // Step to the next open square in this entry, so a word can be
        // typed straight through without tapping each square.
        const cells = cellsOf(activeEntry);
        const at = cells.findIndex(
          ([r, c]) => r === cursor.row && c === cursor.col
        );
        const ahead = cells[at + 1];
        if (ahead) setCursor({ row: ahead[0], col: ahead[1] });
        return next;
      });
      setWrong(new Set());
      playPlace();
    },
    [puzzle, solved, activeEntry, cursor]
  );

  const backspace = useCallback(() => {
    if (!puzzle || solved || !activeEntry) return;
    const cells = cellsOf(activeEntry);
    const at = cells.findIndex(([r, c]) => r === cursor.row && c === cursor.col);
    const hasLetter = board[cursor.row][cursor.col] !== ' ';

    if (hasLetter) {
      setBoard((current) => setCell(current, cursor.row, cursor.col, ' '));
      return;
    }
    const back = cells[at - 1];
    if (back) {
      setCursor({ row: back[0], col: back[1] });
      setBoard((current) => setCell(current, back[0], back[1], ' '));
    }
  }, [puzzle, solved, activeEntry, cursor, board]);

  // Physical keyboard too — this gets played on a laptop as well as a phone.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[a-zA-Z]$/.test(event.key)) {
        typeLetter(event.key.toUpperCase());
      } else if (event.key === 'Backspace') {
        backspace();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        moveToEntry(event.shiftKey ? -1 : 1);
      } else if (event.key === ' ') {
        event.preventDefault();
        setDirection((d) => (d === 'across' ? 'down' : 'across'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [typeLetter, backspace, moveToEntry]);

  useEffect(() => {
    if (!puzzle || solved) return;
    if (!isSolved(board, puzzle)) return;
    setSolved(true);
    playWin();
    if (startedAt.current) setElapsed(Date.now() - startedAt.current);
  }, [board, puzzle, solved]);

  useEffect(() => {
    if (!solved || submitted.current || !startedAt.current) return;
    submitted.current = true;
    submitScore({
      gameId: 'crossword',
      mode: 'daily',
      dateKey,
      uid,
      name: displayName,
      value: elapsed,
    }).catch(() => {
      submitted.current = false;
    });
  }, [solved, elapsed, dateKey, uid, displayName]);

  const tapCell = (row: number, col: number) => {
    if (isBlock(row, col)) return;
    if (cursor.row === row && cursor.col === col) {
      setDirection((d) => (d === 'across' ? 'down' : 'across'));
      return;
    }
    setCursor({ row, col });
  };

  const check = () => {
    if (!puzzle) return;
    const bad = wrongCells(board, puzzle);
    setWrong(bad);
    bad.size === 0 ? playClear(1) : playPlace();
  };

  if (loading) {
    const stage =
      [...WAIT_STAGES].reverse().find((s) => waited >= s.after) ?? WAIT_STAGES[0];
    return (
      <Screen title="Mini Crossword" subtitle="Today's puzzle" onBack={onBack}>
        <div className="card mc-waiting">
          <div className="mc-wait-grid" aria-hidden="true">
            {Array.from({ length: SIZE * SIZE }).map((_, i) => (
              <span
                key={i}
                className="mc-wait-cell"
                style={{ animationDelay: `${(i % SIZE) * 0.1 + Math.floor(i / SIZE) * 0.1}s` }}
              />
            ))}
          </div>
          <p className="mc-wait-text" aria-live="polite">
            {stage.text}
          </p>
          <p className="mc-wait-elapsed">{waited}s</p>
        </div>
      </Screen>
    );
  }

  if (!puzzle) {
    return (
      <Screen title="Mini Crossword" onBack={onBack}>
        <div className="card empty-state">
          Couldn&rsquo;t build today&rsquo;s crossword. Try again in a bit.
        </div>
      </Screen>
    );
  }

  const activeCells = activeEntry ? cellsOf(activeEntry) : [];

  return (
    <Screen
      title="Mini Crossword"
      subtitle={solved ? `Solved in ${formatElapsed(elapsed)}` : "Today's puzzle"}
      onBack={onBack}
    >
      {solved && <Confetti />}

      <div className="mc-timer">{formatElapsed(elapsed)}</div>

      <div className="mc-board-wrap">
        <div className="mc-board" role="grid" aria-label="Crossword grid">
          {Array.from({ length: SIZE }).map((_, row) =>
            Array.from({ length: SIZE }).map((__, col) => {
              const block = isBlock(row, col);
              const key = `${row},${col}`;
              const number = puzzle.entries.find(
                (e) => e.row === row && e.col === col
              )?.number;
              const inWord = activeCells.some(([r, c]) => r === row && c === col);
              const isCursor = cursor.row === row && cursor.col === col;
              return (
                <button
                  key={key}
                  className={`mc-cell ${block ? 'block' : ''} ${
                    inWord ? 'in-word' : ''
                  } ${isCursor ? 'cursor' : ''} ${wrong.has(key) ? 'wrong' : ''}`}
                  disabled={block || solved}
                  onClick={() => tapCell(row, col)}
                  aria-label={`Row ${row + 1} column ${col + 1}`}
                >
                  {!block && number && <span className="mc-number">{number}</span>}
                  {!block && <span className="mc-letter">{board[row][col].trim()}</span>}
                </button>
              );
            })
          )}
        </div>
      </div>

      {activeEntry && !solved && (
        <div className="mc-clue">
          <button
            className="mc-clue-nav"
            onClick={() => moveToEntry(-1)}
            aria-label="Previous clue"
          >
            <IconChevronLeft aria-hidden="true" />
          </button>
          <div className="mc-clue-text">
            <span className="mc-clue-label">
              {activeEntry.number} {activeEntry.direction}
            </span>
            {activeEntry.clue}
          </div>
          <button
            className="mc-clue-nav"
            onClick={() => moveToEntry(1)}
            aria-label="Next clue"
          >
            <IconChevronRight aria-hidden="true" />
          </button>
        </div>
      )}

      {solved ? (
        <div className="mc-result card">
          <h3>Solved!</h3>
          <p className="mc-result-time">{formatElapsed(elapsed)}</p>
        </div>
      ) : (
        <>
          <div className="mc-keyboard">
            {KEY_ROWS.map((row) => (
              <div key={row} className="mc-key-row">
                {row.split('').map((letter) => (
                  <button
                    key={letter}
                    className="mc-key"
                    onClick={() => typeLetter(letter)}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            ))}
            <div className="mc-key-row">
              <button className="mc-key mc-key-wide" onClick={check}>
                Check
              </button>
              <button className="mc-key mc-key-wide" onClick={backspace}>
                Delete
              </button>
            </div>
          </div>
          {wrong.size > 0 && (
            <p className="mc-check-note" aria-live="polite">
              {wrong.size} square{wrong.size === 1 ? '' : 's'} need another look.
            </p>
          )}
        </>
      )}

      <ProviderBadge source={puzzle.source} />

      <div className="section-head">
        <span className="section-title">Today&rsquo;s fastest</span>
      </div>
      <GameLeaderboard
        gameId="crossword"
        mode="daily"
        scoring="bestDuration"
        dateKey={dateKey}
        limit={5}
      />
    </Screen>
  );
}
