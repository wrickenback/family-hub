import { GameLeaderboard } from './GameLeaderboard';
import { DEFAULT_MODE } from '../lib/router';

export function WordSearchLeaderboard({ limit = 10 }: { limit?: number }) {
  return (
    <GameLeaderboard
      gameId="wordsearch"
      mode={DEFAULT_MODE}
      scoring="bestDuration"
      limit={limit}
    />
  );
}
