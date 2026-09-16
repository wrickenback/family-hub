import { useState } from 'react';
import { Screen } from '../components/Screen';
import { Scoreboard } from '../components/Scoreboard';
import { TopicPicker } from '../components/TopicPicker';
import { ResumeBanner } from '../components/ResumeBanner';
import { GameLeaderboard } from '../components/GameLeaderboard';
import { WordSearchLibrary } from '../components/WordSearchLibrary';
import {
  IconAlert,
  IconClock,
  IconMulti,
  IconSolo,
  IconSpinner,
  IconTrophy,
} from '../components/icons';
import { DEFAULT_MODE, getGame } from '../lib/router';
import { todayKey } from '../lib/blocksEngine';
import { sampleScores } from '../lib/sampleData';
import { generatePuzzle, type WordSearchDifficulty } from '../lib/firestoreWordSearch';
import {
  OFFLINE_PUZZLE_COUNT,
  randomOfflinePuzzle,
} from '../lib/wordSearchOffline';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import './Games.css';

const scoringLabel: Record<string, string> = {
  wins: 'Tracks wins',
  highScore: 'Tracks high score',
  bestMs: 'Tracks reaction time',
  bestDuration: 'Tracks best time',
};

const scoreboardHeading: Record<string, string> = {
  wins: 'Most wins',
  highScore: 'Top scores',
  bestMs: 'Fastest reactions',
  bestDuration: 'Best times',
};

export function GameDetail({
  gameId,
  initialModeId,
  uid,
  onBack,
  onModeChange,
  onPlayBlocks,
  onPlayWordSearch,
  onPlayTicTacToe,
  onPlayConnectFour,
  onPlayDotsAndBoxes,
  onPlayWar,
  onPlayUno,
  onPlayBattleship,
  onPlayReaction,
  onPlayCatQueens,
  onPlayWordle,
  onPlayHangman,
  onPlaySolitaire,
  onPlaySimon,
  onPlayWaterSort,
}: {
  gameId: string;
  /** Mode tab to land on, e.g. from a deep link — falls back to the game's
   * first mode when absent or unrecognized. */
  initialModeId?: string;
  uid: string;
  onBack: () => void;
  onModeChange?: (modeId: string) => void;
  onPlayBlocks: (mode: 'free' | 'daily') => void;
  onPlayWordSearch: (puzzleId: string) => void;
  onPlayTicTacToe: (mode: 'pass' | 'online') => void;
  onPlayConnectFour: (mode: 'pass' | 'online') => void;
  onPlayDotsAndBoxes: (mode: 'pass' | 'online') => void;
  onPlayWar: (mode: 'pass' | 'online') => void;
  onPlayUno: (mode: 'pass' | 'online') => void;
  onPlayBattleship: () => void;
  onPlayReaction: () => void;
  onPlayCatQueens: (size: 6 | 7 | 8 | 9) => void;
  onPlayWordle: (mode: 'family' | 'free') => void;
  onPlayHangman: (mode: 'solo' | 'family') => void;
  onPlaySolitaire: (mode: 'daily' | 'free') => void;
  onPlaySimon: (mode: 'solo' | 'pass') => void;
  onPlayWaterSort: () => void;
}) {
  const game = getGame(gameId);
  const [modeId, setModeId] = useState(
    game?.modes?.find((m) => m.id === initialModeId)?.id ??
      game?.modes?.[0]?.id ??
      ''
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const online = useOnlineStatus();

  const selectMode = (id: string) => {
    setModeId(id);
    onModeChange?.(id);
  };

  if (!game) {
    return (
      <Screen title="Not found" onBack={onBack}>
        <div className="card empty-state">That game doesn&rsquo;t exist.</div>
      </Screen>
    );
  }

  const playerLabel =
    game.players === 'solo'
      ? '1 player'
      : game.players === 'multi'
      ? '2 players'
      : '1–2 players';

  const mode = game.modes?.find((m) => m.id === modeId) ?? game.modes?.[0];
  const isBlocks = game.id === 'blocks';
  const isWordSearch = game.id === 'wordsearch';
  const isTicTacToe = game.id === 'tictactoe';
  const isReaction = game.id === 'reaction';
  const isConnectFour = game.id === 'connect4';
  const isDotsAndBoxes = game.id === 'dotsandboxes';
  const isWar = game.id === 'war';
  const isUno = game.id === 'uno';
  const isBattleship = game.id === 'battleship';
  const isCatQueens = game.id === 'catqueens';
  const isWordle = game.id === 'wordle';
  const isHangman = game.id === 'hangman';
  const isSolitaire = game.id === 'solitaire';
  const isSimon = game.id === 'simon';
  const isWaterSort = game.id === 'watersort';
  const catQueensSizes: Record<string, 6 | 7 | 8 | 9> = {
    kitten: 6,
    cat: 7,
    bigcat: 8,
    lion: 9,
  };
  // Which slice of the scores collection this game's board reads. Only
  // Blocks partitions its board by the selected mode; Tic Tac Toe always
  // shows the online board, since pass-and-play wins are never submitted
  // (the second player isn't signed in on that device to attribute them to).
  // Hangman keeps two boards, one per tab: solo rounds and family rounds
  // are different games and shouldn't share a ranking. Daily Word shows the
  // family board on both tabs — free play is unlimited, so it never scores
  // and has no board of its own to show. Solitaire works the same way: only
  // the daily deal is comparable, since free play deals differ every game.
  const leaderboardMode = isBlocks
    ? mode?.id ?? 'free'
    : isTicTacToe ||
      isConnectFour ||
      isBattleship ||
      isDotsAndBoxes ||
      isWar ||
      isUno
    ? 'online'
    : isWordle
    ? 'family'
    : isHangman
    ? mode?.id === 'family'
      ? 'online'
      : 'solo'
    : isSolitaire
    ? 'daily'
    : DEFAULT_MODE;
  // Scores for a daily-seeded mode aren't comparable to free play, so they get
  // their own scoreboard entry (see sampleData: 'blocks:daily' vs 'blocks').
  const scoreKey =
    game.id === 'blocks' && mode?.id === 'daily' ? 'blocks:daily' : game.id;

  const playOfflinePuzzle = () => {
    onPlayWordSearch(randomOfflinePuzzle().id);
  };

  const handleGenerateTopic = async (
    topic: string,
    difficulty: WordSearchDifficulty
  ) => {
    setGenerating(true);
    setGenError(null);
    try {
      const puzzle = await generatePuzzle(topic, difficulty);
      onPlayWordSearch(puzzle.id);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : 'Something went wrong.'
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Screen title={game.name} onBack={onBack}>
      <div className="card game-detail-hero">
        <span className="game-detail-icon">
          <game.icon aria-hidden="true" />
        </span>
        <div className="game-detail-content">
          <h3>{game.name}</h3>
          <p className="game-detail-blurb">{game.blurb}</p>
          <div className="game-detail-tags">
            <span
              className={`pill ${
                game.players === 'multi' ? 'pill-multi' : 'pill-solo'
              }`}
            >
              {game.players === 'multi' ? (
                <IconMulti aria-hidden="true" />
              ) : (
                <IconSolo aria-hidden="true" />
              )}
              {playerLabel}
            </span>
            <span className="pill pill-solo">
              <IconTrophy aria-hidden="true" />
              {scoringLabel[game.scoring]}
            </span>
          </div>
        </div>
      </div>

      {game.modes && (
        <div className="mode-tabs" role="tablist" aria-label="Mode">
          {game.modes.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === mode?.id}
              className={`mode-tab ${m.id === mode?.id ? 'active' : ''}`}
              onClick={() => selectMode(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      {mode && <p className="mode-blurb">{mode.blurb}</p>}

      {isBlocks && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlayBlocks(mode?.id === 'daily' ? 'daily' : 'free')}
        >
          Play {mode?.id === 'daily' ? "today's challenge" : 'now'}
        </button>
      )}

      {isTicTacToe && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() =>
            onPlayTicTacToe(mode?.id === 'online' ? 'online' : 'pass')
          }
        >
          {mode?.id === 'online' ? 'Find a family member' : 'Start on this phone'}
        </button>
      )}

      {isConnectFour && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() =>
            onPlayConnectFour(mode?.id === 'online' ? 'online' : 'pass')
          }
        >
          {mode?.id === 'online' ? 'Find a family member' : 'Start on this phone'}
        </button>
      )}

      {isDotsAndBoxes && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() =>
            onPlayDotsAndBoxes(mode?.id === 'online' ? 'online' : 'pass')
          }
        >
          {mode?.id === 'online' ? 'Find a family member' : 'Start on this phone'}
        </button>
      )}

      {isWar && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlayWar(mode?.id === 'online' ? 'online' : 'pass')}
        >
          {mode?.id === 'online' ? 'Find a family member' : 'Start on this phone'}
        </button>
      )}

      {isUno && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlayUno(mode?.id === 'online' ? 'online' : 'pass')}
        >
          {mode?.id === 'online' ? 'Find a family member' : 'Start on this phone'}
        </button>
      )}

      {isBattleship && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={onPlayBattleship}
        >
          Find a family member
        </button>
      )}

      {isCatQueens && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlayCatQueens(catQueensSizes[mode?.id ?? 'cat'] ?? 7)}
        >
          Play {mode?.name ?? 'now'}
        </button>
      )}

      {isWordle && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlayWordle(mode?.id === 'free' ? 'free' : 'family')}
        >
          {mode?.id === 'free' ? 'Play a random word' : "Play today's word"}
        </button>
      )}

      {isHangman && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlayHangman(mode?.id === 'family' ? 'family' : 'solo')}
        >
          {mode?.id === 'family' ? 'Find a family member' : 'Play now'}
        </button>
      )}

      {isSolitaire && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlaySolitaire(mode?.id === 'free' ? 'free' : 'daily')}
        >
          {mode?.id === 'free' ? 'Deal a new game' : "Play today's deal"}
        </button>
      )}

      {isSimon && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={() => onPlaySimon(mode?.id === 'pass' ? 'pass' : 'solo')}
        >
          {mode?.id === 'pass' ? 'Start on this phone' : 'Play now'}
        </button>
      )}

      {isWaterSort && (
        <button className="btn btn-primary blocks-play-btn" onClick={onPlayWaterSort}>
          Play now
        </button>
      )}

      {isReaction && (
        <button
          className="btn btn-primary blocks-play-btn"
          onClick={onPlayReaction}
        >
          Play now
        </button>
      )}

      {isWordSearch && mode?.id === 'create' && (
        <>
          {!generating && !genError && (
            <ResumeBanner uid={uid} onResume={onPlayWordSearch} />
          )}
          {/* Offline is a different problem from "the AI couldn't do it",
              and needs a different offer. With no connection there is no
              point showing a topic box that cannot work — so the bundled
              puzzles are offered instead. When the models fail while
              online, the topic picker stays put, because trying another
              topic is the thing that actually helps. */}
          {!online && !generating && (
            <div className="card offline-offer">
              <p className="offline-offer-title">You&rsquo;re offline</p>
              <p className="offline-offer-detail">
                New puzzles need a connection to build. There are{' '}
                {OFFLINE_PUZZLE_COUNT} ready-made ones saved on this device —
                want to play one?
              </p>
              <button
                className="btn btn-primary offline-offer-btn"
                onClick={playOfflinePuzzle}
              >
                Play a ready-made puzzle
              </button>
            </div>
          )}
          {generating && (
            <div className="card generating-card">
              <IconSpinner className="generating-spinner" aria-hidden="true" />
              <p>Building your puzzle&hellip;</p>
            </div>
          )}
          {!generating && genError && (
            <div className="card generating-error">
              <IconAlert aria-hidden="true" />
              <div>
                <p className="generating-error-title">
                  Couldn&rsquo;t build that puzzle
                </p>
                <p className="generating-error-detail">{genError}</p>
              </div>
            </div>
          )}
          {!generating && online && (
            <TopicPicker onSelect={handleGenerateTopic} busy={generating} />
          )}
        </>
      )}

      {isWordSearch && mode?.id === 'library' && (
        <WordSearchLibrary onOpen={onPlayWordSearch} />
      )}

      {!game.built && (
        <div className="game-detail-status">
          <IconClock aria-hidden="true" />
          Not built yet — this is the shell. Gameplay is coming.
        </div>
      )}

      <div className="section-head">
        <span className="section-title">
          <IconTrophy aria-hidden="true" />
          {scoreboardHeading[game.scoring]}
        </span>
      </div>
      {game.built ? (
        <GameLeaderboard
          gameId={game.id}
          mode={leaderboardMode}
          scoring={game.scoring}
          dateKey={
            (isBlocks && mode?.id === 'daily') || isSolitaire
              ? todayKey()
              : undefined
          }
          limit={5}
        />
      ) : (
        <Scoreboard
          entries={sampleScores[scoreKey] ?? []}
          scoring={game.scoring}
          limit={5}
        />
      )}
    </Screen>
  );
}
