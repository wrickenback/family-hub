import type { ComponentType, SVGProps } from 'react';

import BlocksIcon from '../assets/game-icons/blockpuzzle.svg?react';
import TicTacToeIcon from '../assets/game-icons/game.svg?react';
import ConnectFourIcon from '../assets/game-icons/connect-four.svg?react';
import HangmanIcon from '../assets/game-icons/hangman.svg?react';
import BattleshipIcon from '../assets/game-icons/battleship.svg?react';
import DotsAndBoxesIcon from '../assets/game-icons/dots-boxes.svg?react';
import WarIcon from '../assets/game-icons/war.svg?react';
import UnoIcon from '../assets/game-icons/uno.svg?react';
// TODO: no source icon was provided for Countdowns/Schedule — swap this placeholder out
import PlaceholderIcon from '../assets/game-icons/placeholder.svg?react';

export type Role = 'guest' | 'kid' | 'parent';
export type Visibility = 'all' | 'familyOnly' | 'parentOnly';

export interface App {
  id: string;
  name: string;
  path: string;
  visibility: Visibility;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  component: ComponentType;
}

export const apps: App[] = [
  {
    id: 'blocks',
    name: 'Blocks',
    path: '/blocks',
    visibility: 'familyOnly',
    icon: BlocksIcon,
    component: () => <div>Blocks (coming soon)</div>,
  },
  {
    id: 'tictactoe',
    name: 'Tic Tac Toe',
    path: '/tictactoe',
    visibility: 'familyOnly',
    icon: TicTacToeIcon,
    component: () => <div>Tic Tac Toe (coming soon)</div>,
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    path: '/connect4',
    visibility: 'familyOnly',
    icon: ConnectFourIcon,
    component: () => <div>Connect 4 (coming soon)</div>,
  },
  {
    id: 'hangman',
    name: 'Hangman',
    path: '/hangman',
    visibility: 'familyOnly',
    icon: HangmanIcon,
    component: () => <div>Hangman (coming soon)</div>,
  },
  {
    id: 'battleship',
    name: 'Battleship',
    path: '/battleship',
    visibility: 'familyOnly',
    icon: BattleshipIcon,
    component: () => <div>Battleship (coming soon)</div>,
  },
  {
    id: 'dotsandboxes',
    name: 'Dots and Boxes',
    path: '/dotsandboxes',
    visibility: 'familyOnly',
    icon: DotsAndBoxesIcon,
    component: () => <div>Dots and Boxes (coming soon)</div>,
  },
  {
    id: 'war',
    name: 'War',
    path: '/war',
    visibility: 'familyOnly',
    icon: WarIcon,
    component: () => <div>War (coming soon)</div>,
  },
  {
    id: 'uno',
    name: 'Uno',
    path: '/uno',
    visibility: 'familyOnly',
    icon: UnoIcon,
    component: () => <div>Uno (coming soon)</div>,
  },
  {
    id: 'countdowns',
    name: 'Countdowns',
    path: '/countdowns',
    visibility: 'familyOnly',
    icon: PlaceholderIcon,
    component: () => <div>Countdowns (coming soon)</div>,
  },
  {
    id: 'schedule',
    name: 'Schedule',
    path: '/schedule',
    visibility: 'familyOnly',
    icon: PlaceholderIcon,
    component: () => <div>Schedule (coming soon)</div>,
  },
];

export function canAccessApp(app: App, role: Role | null): boolean {
  if (app.visibility === 'all') return true;
  if (app.visibility === 'familyOnly') return role === 'kid' || role === 'parent';
  if (app.visibility === 'parentOnly') return role === 'parent';
  return false;
}

export function getVisibleApps(role: Role | null): App[] {
  return apps.filter((app) => canAccessApp(app, role));
}
