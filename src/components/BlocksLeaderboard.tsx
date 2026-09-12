import { GameLeaderboard } from './GameLeaderboard';
import { todayKey } from '../lib/blocksEngine';

/** Blocks' board, which is day-scoped in daily mode and all-time in free
 * play. Everything else is handled generically by GameLeaderboard. */
export function BlocksLeaderboard({
  mode = 'free',
  limit = 10,
}: {
  mode?: string;
  limit?: number;
}) {
  return (
    <GameLeaderboard
      gameId="blocks"
      mode={mode}
      scoring="highScore"
      dateKey={mode === 'daily' ? todayKey() : undefined}
      limit={limit}
    />
  );
}
