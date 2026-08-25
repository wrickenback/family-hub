export type Role = 'guest' | 'kid' | 'parent';
export type Visibility = 'all' | 'familyOnly' | 'parentOnly';

export interface App {
  id: string;
  name: string;
  path: string;
  visibility: Visibility;
  component: React.ComponentType;
}

export const apps: App[] = [
  {
    id: 'blocks',
    name: 'Blocks',
    path: '/blocks',
    visibility: 'familyOnly',
    component: () => <div>Blocks (coming soon)</div>,
  },
  {
    id: 'tictactoe',
    name: 'Tic Tac Toe',
    path: '/tictactoe',
    visibility: 'familyOnly',
    component: () => <div>Tic Tac Toe (coming soon)</div>,
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    path: '/connect4',
    visibility: 'familyOnly',
    component: () => <div>Connect 4 (coming soon)</div>,
  },
  {
    id: 'hangman',
    name: 'Hangman',
    path: '/hangman',
    visibility: 'familyOnly',
    component: () => <div>Hangman (coming soon)</div>,
  },
  {
    id: 'battleship',
    name: 'Battleship',
    path: '/battleship',
    visibility: 'familyOnly',
    component: () => <div>Battleship (coming soon)</div>,
  },
  {
    id: 'dotsandboxes',
    name: 'Dots and Boxes',
    path: '/dotsandboxes',
    visibility: 'familyOnly',
    component: () => <div>Dots and Boxes (coming soon)</div>,
  },
  {
    id: 'war',
    name: 'War',
    path: '/war',
    visibility: 'familyOnly',
    component: () => <div>War (coming soon)</div>,
  },
  {
    id: 'uno',
    name: 'Uno',
    path: '/uno',
    visibility: 'familyOnly',
    component: () => <div>Uno (coming soon)</div>,
  },
  {
    id: 'countdowns',
    name: 'Countdowns',
    path: '/countdowns',
    visibility: 'familyOnly',
    component: () => <div>Countdowns (coming soon)</div>,
  },
  {
    id: 'schedule',
    name: 'Schedule',
    path: '/schedule',
    visibility: 'familyOnly',
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
