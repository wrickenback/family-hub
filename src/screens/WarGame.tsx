import { useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  MAX_ROUNDS,
  deal,
  isRed,
  leader,
  playRound,
  rankLabel,
  suitSymbol,
  type CardCode,
} from '../lib/warEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './WarGame.css';

type Reveal = { a: CardCode; b: CardCode };

export function WarCard({
  card,
  flipping,
  winner,
}: {
  card: CardCode | null;
  flipping?: boolean;
  winner?: boolean;
}) {
  if (!card) {
    return <div className="war-card empty">Deck</div>;
  }
  return (
    <div
      className={`war-card ${isRed(card) ? 'red' : 'black'} ${
        flipping ? 'flipping' : ''
      } ${winner ? 'winner' : ''}`}
    >
      <span>{rankLabel(card)}</span>
      <span className="war-card-suit">{suitSymbol(card)}</span>
    </div>
  );
}

/** How close the flips are to running out — without it, a capped game just
 * stops dead with no warning that it was going to. */
export function WarProgress({ rounds }: { rounds: number }) {
  const pct = Math.min(100, (rounds / MAX_ROUNDS) * 100);
  return (
    <div
      className="war-progress"
      role="progressbar"
      aria-valuenow={rounds}
      aria-valuemin={0}
      aria-valuemax={MAX_ROUNDS}
      aria-label="Rounds played"
    >
      <span className="war-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function WarHistory({ reveals }: { reveals: Reveal[] }) {
  if (reveals.length <= 1) return <div className="war-history" />;
  return (
    <div className="war-history">
      {reveals.slice(0, -1).map((r, i) => (
        <span key={i} className="war-history-pair">
          War: {rankLabel(r.a)}
          {suitSymbol(r.a)} vs {rankLabel(r.b)}
          {suitSymbol(r.b)}
        </span>
      ))}
    </div>
  );
}

export function WarGame({ onBack }: { onBack: () => void }) {
  const [{ a: handA0, b: handB0 }] = useState(() => deal());
  const [handA, setHandA] = useState<CardCode[]>(handA0);
  const [handB, setHandB] = useState<CardCode[]>(handB0);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const [roundWinner, setRoundWinner] = useState<'A' | 'B' | null>(null);
  const [gameOver, setGameOver] = useState<'A' | 'B' | null>(null);
  const [rounds, setRounds] = useState(0);

  const flip = () => {
    if (gameOver) return;
    const result = playRound(handA, handB);
    if (!result) return;
    const nextRound = rounds + 1;
    setHandA(result.handA);
    setHandB(result.handB);
    setReveals(result.reveals);
    setRoundWinner(result.winner);
    setRounds(nextRound);

    if (result.reveals.length > 1) playClear(result.reveals.length);
    else playPlace();

    const cleanedOut = result.handA.length === 0 || result.handB.length === 0;
    const ahead = leader(result.handA.length, result.handB.length);
    // Level piles at the cap play on — the next flip always breaks the tie.
    if (cleanedOut) {
      setGameOver(result.handA.length > 0 ? 'A' : 'B');
      playGameOver();
    } else if (nextRound >= MAX_ROUNDS && ahead) {
      setGameOver(ahead);
      playGameOver();
    }
  };

  const newGame = () => {
    const { a, b } = deal();
    setHandA(a);
    setHandB(b);
    setReveals([]);
    setRoundWinner(null);
    setGameOver(null);
    setRounds(0);
  };

  const last = reveals[reveals.length - 1];

  return (
    <Screen title="War" subtitle="Pass and play" onBack={onBack}>
      <div className="war-scorebar">
        <div className="war-tally">
          <span className="war-tally-label">Player 1</span>
          <span className="war-tally-value">{handA.length}</span>
        </div>
        <div className="war-tally">
          <span className="war-tally-label">Player 2</span>
          <span className="war-tally-value">{handB.length}</span>
        </div>
      </div>

      {gameOver ? (
        <p className="war-status settled" aria-live="polite">
          Player {gameOver === 'A' ? '1' : '2'} wins!
        </p>
      ) : (
        <>
          <TurnBanner
            active
            label={
              rounds >= MAX_ROUNDS
                ? 'Sudden death'
                : `Round ${rounds + 1} of ${MAX_ROUNDS}`
            }
            hint={
              rounds >= MAX_ROUNDS
                ? 'Level on cards — next flip to lead takes it'
                : rounds === 0
                ? 'Tap flip to start'
                : reveals.length > 1
                ? "It's a war!"
                : `Player ${roundWinner === 'A' ? '1' : '2'} took that round`
            }
          />
          <WarProgress rounds={rounds} />
        </>
      )}

      <div className="war-table">
        <div className="war-side">
          <span className="war-side-label">Player 1</span>
          <WarCard
            card={last?.a ?? null}
            flipping={rounds > 0}
            winner={!!last && roundWinner === 'A'}
          />
          <span className="war-pile-count">{handA.length} cards</span>
        </div>
        <span className="war-vs">VS</span>
        <div className="war-side">
          <span className="war-side-label">Player 2</span>
          <WarCard
            card={last?.b ?? null}
            flipping={rounds > 0}
            winner={!!last && roundWinner === 'B'}
          />
          <span className="war-pile-count">{handB.length} cards</span>
        </div>
      </div>

      <WarHistory reveals={reveals} />

      {!gameOver && (
        <button className="btn btn-primary war-flip-btn" onClick={flip}>
          Flip
        </button>
      )}

      {gameOver && (
        <div className="war-result card">
          <h3>Player {gameOver === 'A' ? '1' : '2'} wins!</h3>
          <p className="war-note">
            {handA.length === 0 || handB.length === 0
              ? 'Took the whole deck.'
              : `Most cards after ${rounds} rounds: ${handA.length}–${handB.length}.`}
          </p>
          <button className="btn btn-primary" onClick={newGame}>
            New deck
          </button>
        </div>
      )}

      <p className="war-note">
        Pass-and-play stays on this device. Start an online game to put a win
        on the family board.
      </p>
    </Screen>
  );
}
