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

export type Route =
  | { screen: 'home' }
  | { screen: 'games' }
  | { screen: 'scores' }
  | { screen: 'calendar' }
  | { screen: 'countdowns' }
  | { screen: 'game'; gameId: string }
  | { screen: 'play-blocks'; mode: 'free' | 'daily' }
  | { screen: 'play-wordsearch'; puzzleId: string };

export type Role = 'guest' | 'kid' | 'parent';
export type Visibility = 'all' | 'familyOnly' | 'parentOnly';
export type PlayerMode = 'solo' | 'multi' | 'both';
/** bestMs and bestDuration rank ascending — lower is better. */
export type Scoring = 'highScore' | 'wins' | 'bestMs' | 'bestDuration';

export interface GameMode {
  id: string;
  name: string;
  blurb: string;
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
    id: 'wordle',
    name: 'Daily Word',
    path: '/wordle',
    visibility: 'familyOnly',
    players: 'solo',
    scoring: 'wins',
    icon: WordleIcon,
    blurb: 'Six guesses, five letters. Same word for the whole family.',
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
      return `/games/${route.gameId}`;
    case 'play-blocks':
      return `/play/blocks/${route.mode}`;
    case 'play-wordsearch':
      return `/play/wordsearch/${route.puzzleId}`;
  }
}

export function pathToRoute(pathname: string): Route | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return { screen: 'home' };

  const [first, second, third] = segments;
  switch (first) {
    case 'games':
      return second ? { screen: 'game', gameId: second } : { screen: 'games' };
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
    default:
      return [HOME, route];
  }
}
