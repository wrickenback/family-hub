import type { ComponentType, SVGProps } from 'react';

import BlocksIcon from '../assets/game-icons/blockpuzzle.svg?react';
import TicTacToeIcon from '../assets/game-icons/game.svg?react';
import ConnectFourIcon from '../assets/game-icons/connect-four.svg?react';
import HangmanIcon from '../assets/game-icons/hangman.svg?react';
import BattleshipIcon from '../assets/game-icons/battleship.svg?react';
import DotsAndBoxesIcon from '../assets/game-icons/dots-boxes.svg?react';
import WarIcon from '../assets/game-icons/war.svg?react';
import UnoIcon from '../assets/game-icons/uno.svg?react';

export type Route =
  | { screen: 'home' }
  | { screen: 'games' }
  | { screen: 'scores' }
  | { screen: 'calendar' }
  | { screen: 'countdowns' }
  | { screen: 'game'; gameId: string };

export type Role = 'guest' | 'kid' | 'parent';
export type Visibility = 'all' | 'familyOnly' | 'parentOnly';
export type PlayerMode = 'solo' | 'multi' | 'both';
export type Scoring = 'highScore' | 'wins';

export interface GameApp {
  id: string;
  name: string;
  path: string;
  visibility: Visibility;
  players: PlayerMode;
  scoring: Scoring;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  blurb: string;
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
