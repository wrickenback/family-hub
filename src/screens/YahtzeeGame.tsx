import { useState } from 'react';
import { Screen } from '../components/Screen';
import { TurnBanner } from '../components/TurnBanner';
import {
  CATEGORIES,
  DICE_COUNT,
  NO_DICE,
  NO_HOLDS,
  ROLLS_PER_TURN,
  UPPER_BONUS_TARGET,
  bonusFor,
  grandTotal,
  isSheetFull,
  parseDice,
  rollDice,
  scoreFor,
  toggleHold,
  upperSubtotal,
  type Sheet,
} from '../lib/yahtzeeEngine';
import { playClear, playGameOver, playPlace } from '../lib/sound';
import './YahtzeeGame.css';

type Seat = 'A' | 'B';

const SEAT_NAME: Record<Seat, string> = { A: 'Player 1', B: 'Player 2' };

/** Kept in step with the seat colours in the stylesheet. */
export const SEAT_HEX: Record<Seat, string> = { A: '#7A3FE0', B: '#FF8A3D' };

export function YahtzeeGame({ onBack }: { onBack: () => void }) {
  const [dice, setDice] = useState(NO_DICE);
  const [held, setHeld] = useState(NO_HOLDS);
  const [rollsLeft, setRollsLeft] = useState(ROLLS_PER_TURN);
  const [sheets, setSheets] = useState<Record<Seat, Sheet>>({ A: {}, B: {} });
  const [turn, setTurn] = useState<Seat>('A');
  const [done, setDone] = useState(false);

  const handleRoll = () => {
    if (rollsLeft <= 0 || done) return;
    const next = rollDice(dice, dice.length === DICE_COUNT ? held : NO_HOLDS);
    setDice(next);
    setRollsLeft(rollsLeft - 1);
    playPlace();
  };

  const handleHold = (index: number) => {
    if (dice.length !== DICE_COUNT || rollsLeft <= 0 || done) return;
    setHeld(toggleHold(held, index));
  };

  const handleScore = (categoryId: string) => {
    if (dice.length !== DICE_COUNT || done) return;
    if (sheets[turn][categoryId] !== undefined) return;

    const value = scoreFor(categoryId, dice);
    const nextSheet = { ...sheets[turn], [categoryId]: value };
    const nextSheets = { ...sheets, [turn]: nextSheet };
    setSheets(nextSheets);
    value > 0 ? playClear(value >= 30 ? 4 : 1) : playPlace();

    if (nextSheets.A && nextSheets.B && isSheetFull(nextSheets.A) && isSheetFull(nextSheets.B)) {
      setDone(true);
      setDice(NO_DICE);
      playGameOver();
      return;
    }

    // Skip a seat whose sheet is already full — with 13 boxes each, one
    // player finishes a turn before the other and plays out the rest alone.
    const other: Seat = turn === 'A' ? 'B' : 'A';
    setTurn(isSheetFull(nextSheets[other]) ? turn : other);
    setDice(NO_DICE);
    setHeld(NO_HOLDS);
    setRollsLeft(ROLLS_PER_TURN);
  };

  const handleNewGame = () => {
    setSheets({ A: {}, B: {} });
    setTurn('A');
    setDice(NO_DICE);
    setHeld(NO_HOLDS);
    setRollsLeft(ROLLS_PER_TURN);
    setDone(false);
  };

  const totals = { A: grandTotal(sheets.A), B: grandTotal(sheets.B) };
  const winner =
    totals.A === totals.B ? null : totals.A > totals.B ? 'A' : ('B' as Seat);

  return (
    <Screen title="Yahtzee" subtitle="Pass and play" onBack={onBack}>
      {done ? (
        <p className="yz-status settled" aria-live="polite">
          {winner
            ? `${SEAT_NAME[winner]} wins ${Math.max(
                totals.A,
                totals.B
              )}-${Math.min(totals.A, totals.B)}!`
            : `Draw — ${totals.A} each`}
        </p>
      ) : (
        <TurnBanner
          active
          label={`${SEAT_NAME[turn]}'s turn`}
          hint={
            rollsLeft === ROLLS_PER_TURN
              ? 'Three rolls. Tap dice to keep them.'
              : rollsLeft > 0
              ? `${rollsLeft} roll${rollsLeft === 1 ? '' : 's'} left`
              : 'Out of rolls — take a box.'
          }
          accent={SEAT_HEX[turn]}
        />
      )}

      <DiceTray
        dice={dice}
        held={held}
        rollsLeft={rollsLeft}
        canRoll={!done}
        onHold={handleHold}
        onRoll={handleRoll}
      />

      <ScoreSheet
        seats={[
          { id: 'A', name: SEAT_NAME.A, sheet: sheets.A },
          { id: 'B', name: SEAT_NAME.B, sheet: sheets.B },
        ]}
        activeSeat={done ? null : turn}
        dice={dice}
        onScore={handleScore}
      />

      {done && (
        <div className="yz-result card">
          <h3>{winner ? `${SEAT_NAME[winner]} wins` : 'Draw'}</h3>
          <button className="btn btn-primary" onClick={handleNewGame}>
            New game
          </button>
        </div>
      )}

      <p className="yz-note">
        Pass-and-play games stay on this device. Start an online game to put a
        win on the family board.
      </p>
    </Screen>
  );
}

export function DiceTray({
  dice,
  held,
  rollsLeft,
  canRoll,
  onHold,
  onRoll,
}: {
  dice: string;
  held: string;
  rollsLeft: number;
  /** False on the online board when it isn't your turn. */
  canRoll: boolean;
  onHold: (index: number) => void;
  onRoll: () => void;
}) {
  const values = dice.length === DICE_COUNT ? parseDice(dice) : null;

  return (
    <div className="yz-tray">
      <div className="yz-dice" role="group" aria-label="Dice">
        {Array.from({ length: DICE_COUNT }).map((_, i) => {
          const value = values?.[i];
          const isHeld = held[i] === 'H';
          return (
            <button
              key={i}
              className={`yz-die ${isHeld ? 'held' : ''} ${
                value ? '' : 'empty'
              }`}
              disabled={!canRoll || !value || rollsLeft <= 0}
              onClick={() => onHold(i)}
              aria-pressed={isHeld}
              aria-label={
                value ? `Die ${i + 1}, ${value}${isHeld ? ', held' : ''}` : `Die ${i + 1}`
              }
            >
              {value ? <Pips value={value} /> : <span className="yz-die-blank" />}
              {isHeld && <span className="yz-die-keep">KEEP</span>}
            </button>
          );
        })}
      </div>
      <button
        className="btn btn-primary yz-roll"
        disabled={!canRoll || rollsLeft <= 0}
        onClick={onRoll}
      >
        {rollsLeft === ROLLS_PER_TURN
          ? 'Roll the dice'
          : rollsLeft > 0
          ? `Roll again (${rollsLeft} left)`
          : 'No rolls left'}
      </button>
    </div>
  );
}

/** Pip layout per face — the positions are grid cells 1-9, which is far
 * easier to read than five bespoke flex arrangements. */
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function Pips({ value }: { value: number }) {
  const cells = PIPS[value] ?? [];
  return (
    <span className="yz-pips" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={cells.includes(i + 1) ? 'yz-pip' : ''} />
      ))}
    </span>
  );
}

export interface SheetSeat {
  id: string;
  name: string;
  sheet: Sheet;
}

/** The scorecard, shared by both modes. `activeSeat` is whose column can be
 * written to right now — null once the game is over, or when the online
 * board is waiting on the other phone. */
export function ScoreSheet({
  seats,
  activeSeat,
  dice,
  onScore,
}: {
  seats: SheetSeat[];
  activeSeat: string | null;
  dice: string;
  onScore: (categoryId: string) => void;
}) {
  const rolled = dice.length === DICE_COUNT;
  const active = seats.find((s) => s.id === activeSeat) ?? null;

  const renderRow = (categoryId: string, label: string, hint: string) => {
    const open = active && active.sheet[categoryId] === undefined;
    const preview = open && rolled ? scoreFor(categoryId, dice) : null;

    return (
      <tr key={categoryId}>
        <th scope="row">
          <span className="yz-cat-label">{label}</span>
          <span className="yz-cat-hint">{hint}</span>
        </th>
        {seats.map((seat) => {
          const taken = seat.sheet[categoryId];
          const isActive = seat.id === activeSeat;
          if (taken !== undefined) {
            return (
              <td key={seat.id} className="yz-cell taken">
                {taken}
              </td>
            );
          }
          if (isActive && rolled) {
            return (
              <td key={seat.id} className="yz-cell">
                <button
                  className={`yz-take ${preview === 0 ? 'zero' : ''}`}
                  onClick={() => onScore(categoryId)}
                >
                  {preview}
                </button>
              </td>
            );
          }
          return <td key={seat.id} className="yz-cell empty" />;
        })}
      </tr>
    );
  };

  return (
    <div className="yz-sheet card">
      <table>
        <thead>
          <tr>
            <th scope="col">
              <span className="yz-cat-label">Upper</span>
            </th>
            {seats.map((seat) => (
              <th
                key={seat.id}
                scope="col"
                className={seat.id === activeSeat ? 'active' : ''}
              >
                {seat.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.filter((c) => c.section === 'upper').map((c) =>
            renderRow(c.id, c.label, c.hint)
          )}
          <tr className="yz-subtotal">
            <th scope="row">
              <span className="yz-cat-label">Bonus</span>
              <span className="yz-cat-hint">
                {UPPER_BONUS_TARGET}+ up top scores 35
              </span>
            </th>
            {seats.map((seat) => (
              <td key={seat.id} className="yz-cell">
                <span className="yz-progress">
                  {upperSubtotal(seat.sheet)}/{UPPER_BONUS_TARGET}
                </span>
                {bonusFor(seat.sheet) > 0 && (
                  <span className="yz-bonus-hit">+35</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
        <thead>
          <tr>
            <th scope="col">
              <span className="yz-cat-label">Lower</span>
            </th>
            {seats.map((seat) => (
              <th key={seat.id} scope="col" aria-hidden="true" />
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.filter((c) => c.section === 'lower').map((c) =>
            renderRow(c.id, c.label, c.hint)
          )}
          <tr className="yz-total">
            <th scope="row">
              <span className="yz-cat-label">Total</span>
            </th>
            {seats.map((seat) => (
              <td key={seat.id} className="yz-cell total">
                {grandTotal(seat.sheet)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
