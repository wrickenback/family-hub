import type { ComponentType, SVGProps } from 'react';

import BlocksIcon from '../assets/game-icons/blockpuzzle.svg?react';
import TicTacToeIcon from '../assets/game-icons/game.svg?react';
import ConnectFourIcon from '../assets/game-icons/connect-four.svg?react';
import HangmanIcon from '../assets/game-icons/hangman.svg?react';
import BattleshipIcon from '../assets/game-icons/battleship.svg?react';
import DotsAndBoxesIcon from '../assets/game-icons/dots-boxes.svg?react';
import WarIcon from '../assets/game-icons/war.svg?react';
import UnoIcon from '../assets/game-icons/uno.svg?react';
import WordSearchIcon from '../assets/game-icons/wordsearch.svg?react';
import WordleIcon from '../assets/game-icons/wordle.svg?react';
import ReactionIcon from '../assets/game-icons/reaction.svg?react';
import { Cat as CatQueensIcon } from 'lucide-react';

export type Route =
  | { screen: 'home' }
  | { screen: 'games' }
  | { screen: 'scores' }
  | { screen: 'calendar' }
  | { screen: 'countdowns' }
  | { screen: 'game'; gameId: string; modeId?: string }
  | { screen: 'play-blocks'; mode: 'free' | 'daily' }
  | { screen: 'play-wordsearch'; puzzleId: string }
  | { screen: 'play-tictactoe'; mode: 'pass' | 'online' }
  | { screen: 'play-connect4'; mode: 'pass' | 'online' }
  | { screen: 'play-dotsandboxes'; mode: 'pass' | 'online' }
  | { screen: 'play-war'; mode: 'pass' | 'online' }
  | { screen: 'play-uno'; mode: 'pass' | 'online' }
  | { screen: 'play-battleship' }
  | { screen: 'play-reaction' }
  | { screen: 'play-wordle'; mode: 'family' | 'free' }
  | { screen: 'play-hangman'; mode: 'solo' | 'family' }
  | { screen: 'play-catqueens'; size: 6 | 7 | 8 | 9 };

/** Mode string used for any game that doesn't partition its leaderboard by
 * mode (i.e. everything except Blocks' free/daily split and the online
 * board for Tic Tac Toe/Connect 4). One constant so the games, their score
 * submissions, and their leaderboard reads can't drift out of sync. */
export const DEFAULT_MODE = 'default';

export type Role = 'guest' | 'kid' | 'parent';
export type Visibility = 'all' | 'familyOnly' | 'parentOnly';
export type PlayerMode = 'solo' | 'multi' | 'both';
/** bestMs and bestDuration rank ascending — lower is better. */
export type Scoring = 'highScore' | 'wins' | 'bestMs' | 'bestDuration';

export interface GameMode {
  id: string;
  name: string;
  blurb: string;
  /** For a game listed under both Solo and Two players (PlayerMode 'both'),
   * tags which section this mode belongs to — lets the games list land on
   * the matching mode tab depending on which section was tapped. */
  players?: 'solo' | 'multi';
}

export interface GameApp {
  id: string;
  name: string;
  path: string;
  visibility: Visibility;
  players: PlayerMode;
  scoring: Scoring;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  blurb: string;
  modes?: GameMode[];
  /** Defaults to false — set true once a game has real gameplay, not just
   * the shell/leaderboard. Drives the "coming soon" treatment on the list. */
  built?: boolean;
}

export const games: GameApp[] = [
  {
    id: 'blocks',
    name: 'Blocks',
    path: '/blocks',
    visibility: 'familyOnly',
    players: 'solo',
    scoring: 'highScore',
    icon: BlocksIcon,
    blurb: 'Fit the pieces, clear the lines, chase the family high score.',
    built: true,
    modes: [
      {
        id: 'free',
        name: 'Free play',
        blurb: 'Endless. Play until you run out of room.',
      },
      {
        id: 'daily',
        name: 'Daily challenge',
        blurb: 'Everyone gets the same pieces in the same order today.',
      },
    ],
  },
  {
    id: 'wordsearch',
    name: 'Word Search',
    path: '/wordsearch',
    visibility: 'familyOnly',
    players: 'solo',
    scoring: 'bestDuration',
    icon: WordSearchIcon,
    blurb: 'Pick any topic and hunt down the hidden words.',
    built: true,
    modes: [
      {
        id: 'create',
        name: 'Create',
        blurb: 'Name a topic and get a fresh grid built for it.',
      },
      {
        id: 'library',
        name: 'Library',
        blurb: 'Play the puzzles the rest of the family has made.',
      },
    ],
  },
  {
    id: 'catqueens',
    name: 'Cat Queens',
    path: '/catqueens',
    visibility: 'familyOnly',
    players: 'solo',
    scoring: 'bestDuration',
    icon: CatQueensIcon,
    blurb: 'One cat per row, column and color — and no two may touch.',
    built: true,
    modes: [
      { id: 'kitten', name: 'Kitten', blurb: 'A gentle 6x6 board to learn the rules.' },
      { id: 'cat', name: 'Cat', blurb: 'A 7x7 board with a bit more bite.' },
      { id: 'bigcat', name: 'Big Cat', blurb: 'An 8x8 board for confident solvers.' },
      { id: 'lion', name: 'Lion', blurb: 'A 9x9 board — the toughest hunt.' },
    ],
  },
  {
    id: 'wordle',
    name: 'Daily Word',
    path: '/wordle',
    visibility: 'familyOnly',
    players: 'solo',
    scoring: 'wins',
    icon: WordleIcon,
    blurb: 'Six guesses, five letters. Same word for the whole family.',
    built: true,
    modes: [
      {
        id: 'family',
        name: 'Family word',
        blurb:
          "One word a day for everyone. Whoever opens it first gets it picked for the family — you get one go at it.",
      },
      {
        id: 'free',
        name: 'Free play',
        blurb: 'A fresh word whenever you want one. Play as many as you like.',
      },
    ],
  },
  {
    id: 'reaction',
    name: 'Reaction Time',
    path: '/reaction',
    visibility: 'familyOnly',
    players: 'solo',
    scoring: 'bestMs',
    icon: ReactionIcon,
    blurb: 'Tap the moment it changes. Fastest thumb in the family wins.',
    built: true,
  },
  {
    id: 'hangman',
    name: 'Hangman',
    path: '/hangman',
    visibility: 'familyOnly',
    players: 'both',
    scoring: 'wins',
    icon: HangmanIcon,
    blurb: 'Guess the word letter by letter. Play solo or pick an opponent.',
    built: true,
    modes: [
      {
        id: 'solo',
        name: 'Solo',
        blurb: 'Pick a category and a word gets chosen for you, clue included.',
        players: 'solo',
      },
      {
        id: 'family',
        name: 'Family game',
        blurb: 'One of you sets the word, the other guesses. Swap every round.',
        players: 'multi',
      },
    ],
  },
  {
    id: 'tictactoe',
    name: 'Tic Tac Toe',
    path: '/tictactoe',
    visibility: 'familyOnly',
    players: 'multi',
    scoring: 'wins',
    icon: TicTacToeIcon,
    blurb: 'Three in a row. Quick games, long-running rivalry.',
    built: true,
    modes: [
      {
        id: 'pass',
        name: 'Pass and play',
        blurb: 'Two of you, one phone. Stays on this device.',
      },
      {
        id: 'online',
        name: 'Play a family member',
        blurb: 'Two devices, live. Wins count on the family board.',
      },
    ],
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    path: '/connect4',
    visibility: 'familyOnly',
    players: 'multi',
    scoring: 'wins',
    icon: ConnectFourIcon,
    blurb: 'Drop discs and line up four before the other player does.',
    built: true,
    modes: [
      {
        id: 'pass',
        name: 'Pass and play',
        blurb: 'Two of you, one phone. Stays on this device.',
      },
      {
        id: 'online',
        name: 'Play a family member',
        blurb: 'Two devices, live. Wins count on the family board.',
      },
    ],
  },
  {
    id: 'dotsandboxes',
    name: 'Dots and Boxes',
    path: '/dotsandboxes',
    visibility: 'familyOnly',
    players: 'multi',
    scoring: 'wins',
    icon: DotsAndBoxesIcon,
    blurb: 'Draw lines, close boxes, claim the most squares.',
    built: true,
    modes: [
      {
        id: 'pass',
        name: 'Pass and play',
        blurb: 'Two of you, one phone. Stays on this device.',
      },
      {
        id: 'online',
        name: 'Play a family member',
        blurb: 'Two devices, live. Wins count on the family board.',
      },
    ],
  },
  {
    id: 'battleship',
    name: 'Battleship',
    path: '/battleship',
    visibility: 'familyOnly',
    players: 'multi',
    scoring: 'wins',
    icon: BattleshipIcon,
    blurb: 'Hide your fleet and hunt down theirs.',
    built: true,
    modes: [
      {
        id: 'online',
        name: 'Play a family member',
        blurb: 'Two phones, hidden fleets. Wins count on the family board.',
      },
    ],
  },
  {
    id: 'war',
    name: 'War',
    path: '/war',
    visibility: 'familyOnly',
    players: 'multi',
    scoring: 'wins',
    icon: WarIcon,
    blurb: 'Highest card takes the pile. Pure luck, pure chaos.',
    built: true,
    modes: [
      {
        id: 'pass',
        name: 'Pass and play',
        blurb: 'Two of you, one phone. Stays on this device.',
      },
      {
        id: 'online',
        name: 'Play a family member',
        blurb: 'Two devices, live. Wins count on the family board.',
      },
    ],
  },
  {
    id: 'uno',
    name: 'Uno',
    path: '/uno',
    visibility: 'familyOnly',
    players: 'multi',
    scoring: 'wins',
    icon: UnoIcon,
    blurb: 'Match colours and numbers, and never forget to call it.',
    built: true,
    modes: [
      {
        id: 'pass',
        name: 'Pass and play',
        blurb: 'Two of you, one phone. Stays on this device.',
      },
      {
        id: 'online',
        name: 'Play a family member',
        blurb: 'Two devices, live. Wins count on the family board.',
      },
    ],
  },
];

export function canAccess(
  item: { visibility: Visibility },
  role: Role | null
): boolean {
  if (item.visibility === 'all') return true;
  if (item.visibility === 'familyOnly')
    return role === 'kid' || role === 'parent';
  if (item.visibility === 'parentOnly') return role === 'parent';
  return false;
}

export function getVisibleGames(role: Role | null): GameApp[] {
  return games.filter((game) => canAccess(game, role));
}

export function getGame(id: string): GameApp | undefined {
  return games.find((game) => game.id === id);
}

export function routeToPath(route: Route): string {
  switch (route.screen) {
    case 'home':
      return '/';
    case 'games':
      return '/games';
    case 'scores':
      return '/scores';
    case 'calendar':
      return '/calendar';
    case 'countdowns':
      return '/countdowns';
    case 'game':
      return route.modeId
        ? `/games/${route.gameId}/${route.modeId}`
        : `/games/${route.gameId}`;
    case 'play-blocks':
      return `/play/blocks/${route.mode}`;
    case 'play-wordsearch':
      return `/play/wordsearch/${route.puzzleId}`;
    case 'play-tictactoe':
      return `/play/tictactoe/${route.mode}`;
    case 'play-connect4':
      return `/play/connect4/${route.mode}`;
    case 'play-dotsandboxes':
      return `/play/dotsandboxes/${route.mode}`;
    case 'play-war':
      return `/play/war/${route.mode}`;
    case 'play-uno':
      return `/play/uno/${route.mode}`;
    case 'play-battleship':
      return '/play/battleship';
    case 'play-reaction':
      return '/play/reaction';
    case 'play-wordle':
      return `/play/wordle/${route.mode}`;
    case 'play-hangman':
      return `/play/hangman/${route.mode}`;
    case 'play-catqueens':
      return `/play/catqueens/${route.size}`;
  }
}

export function pathToRoute(pathname: string): Route | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return { screen: 'home' };

  const [first, second, third] = segments;
  switch (first) {
    case 'games':
      return second
        ? { screen: 'game', gameId: second, modeId: third }
        : { screen: 'games' };
    case 'scores':
      return { screen: 'scores' };
    case 'calendar':
      return { screen: 'calendar' };
    case 'countdowns':
      return { screen: 'countdowns' };
    case 'play': {
      if (second === 'blocks' && (third === 'free' || third === 'daily')) {
        return { screen: 'play-blocks', mode: third };
      }
      if (second === 'wordsearch' && third) {
        return { screen: 'play-wordsearch', puzzleId: third };
      }
      if (second === 'tictactoe' && (third === 'pass' || third === 'online')) {
        return { screen: 'play-tictactoe', mode: third };
      }
      if (second === 'connect4' && (third === 'pass' || third === 'online')) {
        return { screen: 'play-connect4', mode: third };
      }
      if (
        second === 'dotsandboxes' &&
        (third === 'pass' || third === 'online')
      ) {
        return { screen: 'play-dotsandboxes', mode: third };
      }
      if (second === 'war' && (third === 'pass' || third === 'online')) {
        return { screen: 'play-war', mode: third };
      }
      if (second === 'uno' && (third === 'pass' || third === 'online')) {
        return { screen: 'play-uno', mode: third };
      }
      if (second === 'battleship') {
        return { screen: 'play-battleship' };
      }
      if (second === 'reaction') {
        return { screen: 'play-reaction' };
      }
      if (second === 'wordle' && (third === 'family' || third === 'free')) {
        return { screen: 'play-wordle', mode: third };
      }
      if (second === 'hangman' && (third === 'solo' || third === 'family')) {
        return { screen: 'play-hangman', mode: third };
      }
      if (second === 'catqueens' && third) {
        const size = Number(third);
        if (size === 6 || size === 7 || size === 8 || size === 9) {
          return { screen: 'play-catqueens', size };
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/** Synthesizes the logical parent chain for a route so a deep link (or a
 * page reload) lands with a sensible back-navigation history instead of
 * one bare screen the hardware back button can only exit from. */
export function parentChainFor(route: Route): Route[] {
  const HOME: Route = { screen: 'home' };
  switch (route.screen) {
    case 'home':
      return [HOME];
    case 'game':
      return [HOME, { screen: 'games' }, route];
    case 'play-blocks':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'blocks' },
        route,
      ];
    case 'play-wordsearch':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'wordsearch' },
        route,
      ];
    case 'play-tictactoe':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'tictactoe' },
        route,
      ];
    case 'play-connect4':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'connect4' },
        route,
      ];
    case 'play-dotsandboxes':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'dotsandboxes' },
        route,
      ];
    case 'play-war':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'war' },
        route,
      ];
    case 'play-uno':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'uno' },
        route,
      ];
    case 'play-battleship':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'battleship' },
        route,
      ];
    case 'play-reaction':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'reaction' },
        route,
      ];
    case 'play-catqueens':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'catqueens' },
        route,
      ];
    case 'play-wordle':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'wordle' },
        route,
      ];
    case 'play-hangman':
      return [
        HOME,
        { screen: 'games' },
        { screen: 'game', gameId: 'hangman' },
        route,
      ];
    default:
      return [HOME, route];
  }
}
