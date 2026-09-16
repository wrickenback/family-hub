import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import {
  SUITS,
  SUIT_SYMBOL,
  canAutoFinish,
  canDropOnFoundation,
  canDropOnTableau,
  canPickUp,
  dealSolitaire,
  drawFromStock,
  isRed,
  isStuck,
  isWon,
  moveToFoundation,
  moveToTableau,
  autoPlace,
  rankLabel,
  stepAutoFinish,
  type Card,
  type DrawCount,
  type Selection,
  type SolitaireState,
} from '../lib/solitaireEngine';
import { seedFromDateKey, todayKey } from '../lib/blocksEngine';
import { submitScore } from '../lib/firestoreScores';
import { playPour, playWin } from '../lib/sound';
import './SolitaireGame.css';

export type SolitaireMode = 'daily' | 'free';

/** Which day's deal this device has already scored, so the daily board
 * records a genuine first attempt rather than the best of ten retries.
 * Replaying the deal stays allowed — it just doesn't post another time. */
const SCORED_KEY = 'familyhub:solitaire:dailyScored';

function alreadyScoredToday(): boolean {
  try {
    return localStorage.getItem(SCORED_KEY) === todayKey();
  } catch {
    return false;
  }
}

function markScoredToday(): void {
  try {
    localStorage.setItem(SCORED_KEY, todayKey());
  } catch {
    // Storage unavailable — the worst case is a second time being posted.
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

interface SolitaireGameProps {
  mode: SolitaireMode;
  uid: string;
  displayName: string;
  onBack: () => void;
}

export function SolitaireGame({
  mode,
  uid,
  displayName,
  onBack,
}: SolitaireGameProps) {
  const [drawCount, setDrawCount] = useState<DrawCount>(1);
  const [state, setState] = useState<SolitaireState>(() =>
    dealSolitaire(1, mode === 'daily' ? seedFromDateKey(todayKey()) : undefined)
  );
  const [history, setHistory] = useState<SolitaireState[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [won, setWon] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Whether this win actually posted a time, as opposed to being a replay
  // of a deal already scored. Kept in state, not just the ref, because the
  // result card has to re-render to say which happened.
  const [dailyPosted, setDailyPosted] = useState(false);

  const startTime = useRef(Date.now());
  const scoreSaved = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const stuck = !won && isStuck(state);
  const locked = won || finishing;

  useEffect(() => {
    if (locked || stuck) return;
    const id = window.setInterval(
      () => setElapsedMs(Date.now() - startTime.current),
      250
    );
    return () => window.clearInterval(id);
  }, [locked, stuck]);

  const newGame = useCallback(
    (nextDraw: DrawCount = drawCount) => {
      setDrawCount(nextDraw);
      setState(
        dealSolitaire(
          nextDraw,
          mode === 'daily' ? seedFromDateKey(todayKey()) : undefined
        )
      );
      setHistory([]);
      setSelection(null);
      setElapsedMs(0);
      setWon(false);
      setFinishing(false);
      setDailyPosted(false);
      scoreSaved.current = false;
      startTime.current = Date.now();
    },
    [drawCount, mode]
  );

  /** Every state change funnels through here so undo, the win check and
   * the move sound can't be forgotten at one of the many call sites. */
  const apply = useCallback(
    (next: SolitaireState | null, quiet = false) => {
      if (!next) return false;
      setHistory((h) => [...h.slice(-199), state]);
      setState(next);
      setSelection(null);
      if (!quiet) playPour();
      return true;
    },
    [state]
  );

  useEffect(() => {
    if (won || !isWon(state)) return;
    setWon(true);
    setFinishing(false);
    playWin();
  }, [state, won]);

  // The daily deal is the only comparable board — everyone gets identical
  // cards, so times mean something. Free play deals differ every game, so a
  // time from one is worth nothing against a time from another and never
  // gets posted.
  useEffect(() => {
    if (!won || scoreSaved.current) return;
    if (mode !== 'daily') return;
    if (alreadyScoredToday()) return;
    scoreSaved.current = true;
    markScoredToday();
    setDailyPosted(true);
    submitScore({
      gameId: 'solitaire',
      mode: 'daily',
      dateKey: todayKey(),
      uid,
      name: displayName,
      value: Math.round(elapsedMs / 1000),
      extra: { moves: state.moves },
    }).catch(() => {
      scoreSaved.current = false;
      setDailyPosted(false);
    });
  }, [won, mode, uid, displayName, elapsedMs, state.moves]);

  // Auto-finish deals the remaining cards up a few per second rather than
  // instantly — watching the board empty is the reward for winning.
  useEffect(() => {
    if (!finishing) return;
    const id = window.setTimeout(() => {
      const next = stepAutoFinish(state);
      if (!next) {
        setFinishing(false);
        return;
      }
      setState(next);
      playPour();
    }, 90);
    return () => window.clearTimeout(id);
  }, [finishing, state]);

  useEffect(() => {
    if (won || stuck) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [won, stuck]);

  const undo = () => {
    if (history.length === 0 || locked) return;
    setState(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSelection(null);
  };

  const sameSelection = (a: Selection | null, b: Selection) =>
    !!a && a.from === b.from && a.col === b.col && a.index === b.index;

  /** Tapping a card either picks it up, or — if it was already picked up —
   * asks for it to be placed automatically. Tapping a different card
   * switches the selection rather than attempting a move, since a card is
   * never a valid destination on its own; destinations are piles. */
  const tapCard = (sel: Selection) => {
    if (locked) return;
    if (sameSelection(selection, sel)) {
      if (!apply(autoPlace(state, sel))) setSelection(null);
      return;
    }
    if (selection && sel.from === 'tableau') {
      // With a card in hand, a tap anywhere on a column that can receive it
      // is a drop — aiming at the exact bottom card of a tightly overlapped
      // column is too fiddly on a phone. The exception is a tap on another
      // card that could itself be picked up, which is far more likely to be
      // the player changing their mind about what to move.
      const isBottom = sel.index === state.tableau[sel.col].length - 1;
      if (
        (isBottom || !canPickUp(state, sel)) &&
        canDropOnTableau(state, selection, sel.col)
      ) {
        apply(moveToTableau(state, selection, sel.col));
        return;
      }
    }
    if (!canPickUp(state, sel)) {
      setSelection(null);
      return;
    }
    setSelection(sel);
  };

  const tapTableauPile = (col: number) => {
    if (locked) return;
    if (selection && canDropOnTableau(state, selection, col)) {
      apply(moveToTableau(state, selection, col));
      return;
    }
    setSelection(null);
  };

  const tapFoundation = (index: number) => {
    if (locked) return;
    if (selection && canDropOnFoundation(state, selection, index)) {
      apply(moveToFoundation(state, selection, index));
      return;
    }
    setSelection(null);
  };

  const tapStock = () => {
    if (locked) return;
    if (!apply(drawFromStock(state))) setSelection(null);
  };

  const isSelected = (sel: Selection) => {
    if (!selection) return false;
    if (selection.from !== sel.from) return false;
    // Only the playable top of the waste is ever the selection; the cards
    // fanned behind it are just there to be read.
    if (selection.from === 'waste') return sel.index === 0;
    return selection.col === sel.col && sel.index >= selection.index;
  };

  const renderCard = (card: Card, sel: Selection, extraClass = '') => (
    <button
      key={card.id}
      className={`sol-card ${card.faceUp ? 'face-up' : 'face-down'} ${
        isRed(card.suit) ? 'red' : 'black'
      } ${isSelected(sel) ? 'selected' : ''} ${extraClass}`}
      onClick={() => {
        // A face-down card can't be picked up, but with a card in hand a
        // tap on one still reads as "put it on this column" — the overlap
        // leaves very little bare column to aim at otherwise.
        if (card.faceUp) tapCard(sel);
        else if (sel.from === 'tableau') tapTableauPile(sel.col);
      }}
      disabled={locked}
      aria-label={
        card.faceUp
          ? `${rankLabel(card.rank)} of ${SUIT_SYMBOL[card.suit]}`
          : 'Face down card'
      }
    >
      {card.faceUp && (
        <span className="sol-card-corner">
          <span className="sol-card-rank">{rankLabel(card.rank)}</span>
          <span className="sol-card-suit">{SUIT_SYMBOL[card.suit]}</span>
        </span>
      )}
    </button>
  );

  const wasteTop = state.waste[state.waste.length - 1];
  // Draw-3 shows the last three turned cards fanned, the way the physical
  // game does — you can only play the top one, but seeing the two behind it
  // is how you plan the next pass through the stock.
  const wasteVisible = state.waste.slice(-Math.min(state.drawCount, 3));

  return (
    <Screen
      title={mode === 'daily' ? "Today's deal" : 'Solitaire'}
      onBack={onBack}
      className="sol-screen"
    >
      <div className="sol-statbar">
        <div className="sol-stat">
          <span className="sol-stat-value">{formatElapsed(elapsedMs)}</span>
          <span className="sol-stat-label">time</span>
        </div>
        <div className="sol-stat">
          <span className="sol-stat-value">{state.moves}</span>
          <span className="sol-stat-label">moves</span>
        </div>
        <button
          className="sol-stat sol-undo"
          onClick={undo}
          disabled={history.length === 0 || locked}
        >
          <span className="sol-stat-value">↶</span>
          <span className="sol-stat-label">undo</span>
        </button>
      </div>

      <div className="sol-top">
        <div className="sol-stock-area">
          <button
            className={`sol-pile sol-stock ${
              state.stock.length === 0 ? 'sol-recycle' : ''
            }`}
            onClick={tapStock}
            disabled={locked || (state.stock.length === 0 && state.waste.length === 0)}
            aria-label={
              state.stock.length > 0
                ? `Draw from stock, ${state.stock.length} left`
                : 'Turn the waste back over'
            }
          >
            {state.stock.length > 0 ? (
              <span className="sol-stock-count">{state.stock.length}</span>
            ) : (
              <span className="sol-recycle-mark">↻</span>
            )}
          </button>

          <div className="sol-waste">
            {wasteVisible.length === 0 && <div className="sol-pile sol-empty" />}
            {wasteVisible.map((card, i) => (
              <div
                key={card.id}
                className="sol-waste-slot"
                style={{ left: `${i * 16}px` }}
              >
                {card === wasteTop ? (
                  renderCard(card, { from: 'waste', col: 0, index: 0 })
                ) : (
                  // Only the top of the waste is playable, so the cards
                  // behind it aren't buttons at all — tapping one and having
                  // it move a different card would be baffling.
                  <div
                    className={`sol-card face-up sol-card-buried ${
                      isRed(card.suit) ? 'red' : 'black'
                    }`}
                    aria-hidden="true"
                  >
                    <span className="sol-card-corner">
                      <span className="sol-card-rank">{rankLabel(card.rank)}</span>
                      <span className="sol-card-suit">
                        {SUIT_SYMBOL[card.suit]}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sol-foundations">
          {SUITS.map((suit, i) => {
            const pile = state.foundations[i];
            const top = pile[pile.length - 1];
            const droppable =
              selection !== null && canDropOnFoundation(state, selection, i);
            return (
              <button
                key={suit}
                className={`sol-pile sol-foundation ${
                  droppable ? 'droppable' : ''
                } ${isRed(suit) ? 'red' : 'black'}`}
                onClick={() => tapFoundation(i)}
                disabled={locked}
                aria-label={`${SUIT_SYMBOL[suit]} foundation, ${pile.length} cards`}
              >
                {top ? (
                  <span className="sol-card-corner">
                    <span className="sol-card-rank">{rankLabel(top.rank)}</span>
                    <span className="sol-card-suit">{SUIT_SYMBOL[top.suit]}</span>
                  </span>
                ) : (
                  <span className="sol-foundation-ghost">
                    {SUIT_SYMBOL[suit]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sol-tableau">
        {state.tableau.map((pile, col) => {
          const droppable =
            selection !== null && canDropOnTableau(state, selection, col);
          return (
            <div
              key={col}
              className={`sol-column ${droppable ? 'droppable' : ''}`}
              onClick={(e) => {
                // Only a tap on the column's own empty space lands here;
                // taps on cards are handled by the card buttons themselves.
                if (e.target === e.currentTarget) tapTableauPile(col);
              }}
            >
              {pile.length === 0 ? (
                <button
                  className={`sol-pile sol-empty ${droppable ? 'droppable' : ''}`}
                  onClick={() => tapTableauPile(col)}
                  disabled={locked}
                  aria-label={`Empty column ${col + 1}`}
                />
              ) : (
                pile.map((card, index) =>
                  renderCard(card, { from: 'tableau', col, index })
                )
              )}
            </div>
          );
        })}
      </div>

      {canAutoFinish(state) && !finishing && !won && (
        <button
          className="btn btn-primary sol-finish"
          onClick={() => setFinishing(true)}
        >
          Finish it for me
        </button>
      )}

      <div className="sol-actions">
        <button className="btn btn-secondary" onClick={() => newGame()}>
          {mode === 'daily' ? 'Restart the deal' : 'New deal'}
        </button>
        {mode === 'free' && (
          <button
            className="btn btn-secondary"
            onClick={() => newGame(drawCount === 1 ? 3 : 1)}
          >
            Switch to draw {drawCount === 1 ? 3 : 1}
          </button>
        )}
      </div>

      <p className="sol-hint">
        Tap a card to pick it up, then tap where it goes. Tap it again to send
        it wherever it fits.
        {mode === 'daily' &&
          ' Everyone in the family gets these exact cards today.'}
      </p>

      {won && (
        <div className="card sol-result" ref={resultRef}>
          <h3>Solved!</h3>
          <p className="sol-result-detail">
            {formatElapsed(elapsedMs)} · {state.moves} moves
          </p>
          {mode === 'daily' && (
            <p className="sol-result-note">
              {dailyPosted
                ? "Posted to today's family board."
                : "Today's deal was already scored on this device — this run was just for fun."}
            </p>
          )}
          <button className="btn btn-primary" onClick={() => newGame()}>
            Play again
          </button>
        </div>
      )}

      {stuck && (
        <div className="card sol-result" ref={resultRef}>
          <h3>No moves left</h3>
          <p className="sol-result-detail">
            The stock is empty and nothing else will move. Not every deal can
            be won — that&rsquo;s Klondike.
          </p>
          <button className="btn btn-primary" onClick={() => newGame()}>
            {mode === 'daily' ? 'Try the deal again' : 'Deal another'}
          </button>
        </div>
      )}
    </Screen>
  );
}
