import { useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  COLORS,
  COLOR_HEX,
  COLOR_NAME,
  anyPlayable,
  cardColor,
  cardKind,
  cardLabel,
  cardName,
  deal,
  drawOne,
  isPlayable,
  isWild,
  playCard,
  type CardCode,
  type Color,
  type PlayEvent,
  type UnoState,
} from '../lib/unoEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './UnoGame.css';

const EVENT_TEXT: Record<Exclude<PlayEvent, null>, string> = {
  skip: 'Skip! Go again.',
  draw2: '+2! They drew two — go again.',
  wild4: '+4! They drew four — go again.',
  wild: 'Wild — new colour picked.',
};

export function UnoCard({ card }: { card: CardCode }) {
  if (isWild(card)) {
    return (
      <span className="uno-card uno-card-wild" title={cardName(card)}>
        <span>{cardLabel(card)}</span>
      </span>
    );
  }
  const color = cardColor(card) as Color;
  const kind = cardKind(card);
  // Skip/Reverse print as glyphs, which sit visually lighter than a numeral
  // at the same size — nudge them up so a hand reads evenly.
  const glyph = kind === 'skip' || kind === 'reverse';
  return (
    <span
      className={`uno-card ${glyph ? 'uno-card-glyph' : ''}`}
      style={{ background: COLOR_HEX[color] }}
      title={cardName(card)}
    >
      {cardLabel(card)}
    </span>
  );
}

export function UnoColorChip({ color }: { color: Color }) {
  return (
    <span
      className="uno-color-chip"
      style={{ background: COLOR_HEX[color] }}
      aria-label={COLOR_NAME[color]}
    />
  );
}

export function UnoColorPicker({
  onPick,
}: {
  onPick: (color: Color) => void;
}) {
  return (
    <div className="uno-color-picker">
      {COLORS.map((c) => (
        <button
          key={c}
          className="uno-color-btn"
          style={{ background: COLOR_HEX[c] }}
          aria-label={`Choose ${COLOR_NAME[c]}`}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

export function UnoHand({
  hand,
  topCard,
  color,
  disabled,
  onPlay,
}: {
  hand: CardCode[];
  topCard: CardCode;
  color: Color;
  disabled: boolean;
  onPlay: (card: CardCode) => void;
}) {
  const playableCount = disabled
    ? 0
    : hand.filter((c) => isPlayable(c, topCard, color)).length;
  return (
    <div className="uno-hand-wrap">
      <p className="uno-hand-label">
        Your hand · {hand.length} card{hand.length === 1 ? '' : 's'}
        {!disabled && ` · ${playableCount} playable`}
        {hand.length === 1 && <span className="uno-badge">UNO!</span>}
      </p>
      <div className="uno-hand">
        {hand.map((card, i) => {
          const playable = !disabled && isPlayable(card, topCard, color);
          return (
            <button
              key={`${card}-${i}`}
              className="uno-hand-card"
              disabled={!playable}
              onClick={() => onPlay(card)}
              aria-label={`Play ${cardName(card)}`}
            >
              <UnoCard card={card} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

type PendingWild = CardCode | null;

export function UnoGame({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<UnoState>(() => deal());
  const [turn, setTurn] = useState<'A' | 'B'>('A');
  const [starter, setStarter] = useState<'A' | 'B'>('A');
  const [revealed, setRevealed] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [event, setEvent] = useState<PlayEvent>(null);
  const [pendingWild, setPendingWild] = useState<PendingWild>(null);
  const [winner, setWinner] = useState<'A' | 'B' | null>(null);
  const [tallyTotal, setTallyTotal] = useState({ A: 0, B: 0 });

  const myHand = turn === 'A' ? state.handA : state.handB;

  const finishTurn = (nextState: UnoState, again: boolean, ev: PlayEvent) => {
    setState(nextState);
    setEvent(ev);
    if (again) {
      setHasDrawn(false);
    } else {
      setTurn((t) => (t === 'A' ? 'B' : 'A'));
      setRevealed(false);
      setHasDrawn(false);
    }
  };

  const handlePlay = (card: CardCode) => {
    if (winner) return;
    if (isWild(card)) {
      setPendingWild(card);
      return;
    }
    resolvePlay(card);
  };

  const resolvePlay = (card: CardCode, chosenColor?: Color) => {
    const result = playCard(state, turn, card, chosenColor);
    if (!result) return;
    setPendingWild(null);

    if (result.effect === 'winner') {
      setState(result.state);
      setEvent(result.event);
      setWinner(turn);
      setTallyTotal((t) => ({ ...t, [turn]: t[turn] + 1 }));
      playGameOver();
      return;
    }

    if (result.event) playClear(2);
    else playPlace();
    finishTurn(result.state, result.effect === 'again', result.event);
  };

  const handleDraw = () => {
    if (winner || hasDrawn) return;
    setState((s) => drawOne(s, turn));
    setHasDrawn(true);
    playPlace();
  };

  const handleEndTurn = () => {
    setTurn((t) => (t === 'A' ? 'B' : 'A'));
    setRevealed(false);
    setHasDrawn(false);
    setEvent(null);
  };

  const newGame = () => {
    const nextStarter = starter === 'A' ? 'B' : 'A';
    setStarter(nextStarter);
    setTurn(nextStarter);
    setState(deal());
    setRevealed(false);
    setHasDrawn(false);
    setEvent(null);
    setPendingWild(null);
    setWinner(null);
  };

  if (!revealed && !winner) {
    return (
      <Screen title="Uno" subtitle="Pass and play" onBack={onBack}>
        <div className="uno-pass-gate card">
          <h3>Pass the device to Player {turn === 'A' ? '1' : '2'}</h3>
          <button className="btn btn-primary" onClick={() => setRevealed(true)}>
            Show my cards
          </button>
        </div>
      </Screen>
    );
  }

  const canDrawPlay = hasDrawn && anyPlayable(myHand, state.topCard, state.color);

  return (
    <Screen title="Uno" subtitle="Pass and play" onBack={onBack}>
      <div className="uno-scorebar">
        <div className="uno-tally">
          <span className="uno-tally-label">Player 1</span>
          <span className="uno-tally-value">{tallyTotal.A}</span>
        </div>
        <div className="uno-tally">
          <span className="uno-tally-label">Player 2</span>
          <span className="uno-tally-value">{tallyTotal.B}</span>
        </div>
      </div>

      {winner ? (
        <p className="uno-status settled" aria-live="polite">
          Player {winner === 'A' ? '1' : '2'} wins!
        </p>
      ) : (
        <TurnBanner
          active
          label={`Player ${turn === 'A' ? '1' : '2'}'s turn`}
          hint={event ? EVENT_TEXT[event] : undefined}
          accent={COLOR_HEX[state.color]}
        />
      )}

      {!winner && (
        <div className="uno-table">
          <div className="uno-opponent">
            <span className="uno-opponent-backs">
              {Array.from({ length: (turn === 'A' ? state.handB : state.handA).length }).map(
                (_, i) => (
                  <span key={i} className="uno-card-back" />
                )
              )}
            </span>
            <span>Other player&rsquo;s cards</span>
          </div>
          <div className="uno-pile">
            <UnoCard card={state.topCard} />
            <UnoColorChip color={state.color} />
          </div>
          <button
            className="uno-draw-pile"
            onClick={handleDraw}
            disabled={hasDrawn}
            aria-label="Draw a card"
          >
            Draw
          </button>
        </div>
      )}

      {pendingWild && (
        <div className="card">
          <p className="uno-hand-label">Pick a colour</p>
          <UnoColorPicker onPick={(color) => resolvePlay(pendingWild, color)} />
        </div>
      )}

      {!winner && !pendingWild && (
        <UnoHand
          hand={myHand}
          topCard={state.topCard}
          color={state.color}
          disabled={false}
          onPlay={handlePlay}
        />
      )}

      {!winner && hasDrawn && !canDrawPlay && (
        <div className="uno-actions">
          <button className="btn btn-primary" onClick={handleEndTurn}>
            End turn
          </button>
        </div>
      )}

      {winner && (
        <div className="uno-result card">
          <h3>Player {winner === 'A' ? '1' : '2'} wins!</h3>
          <button className="btn btn-primary" onClick={newGame}>
            New game
          </button>
        </div>
      )}

      <p className="uno-note">
        Pass-and-play stays on this device. Start an online game to put a win
        on the family board.
      </p>
    </Screen>
  );
}
