import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  fallbackPuzzle,
  randomFallbackPuzzle,
  type BloomPuzzle,
  type PuzzleSource,
} from './bloomEngine';

function isUsable(data: { base?: unknown; words?: unknown }): boolean {
  return (
    typeof data.base === 'string' &&
    /^[A-Z]{6,7}$/.test(data.base) &&
    Array.isArray(data.words) &&
    data.words.length >= 8
  );
}

/** Today's shared letters, or a fresh set for free play.
 *
 * Never throws: a puzzle the model couldn't write is not something the
 * player did, and a bundled one plays exactly the same. */
export async function fetchBloomPuzzle(options: {
  dateKey?: string;
  avoid?: string[];
}): Promise<BloomPuzzle> {
  const offline = options.dateKey
    ? fallbackPuzzle(options.dateKey)
    : randomFallbackPuzzle();
  if (!functions) return offline;

  try {
    const call = httpsCallable(functions, 'getBloomPuzzle');
    const result = await call({
      dateKey: options.dateKey ?? '',
      avoid: options.avoid ?? [],
    });
    const data = result.data as {
      base?: unknown;
      words?: unknown;
      source?: unknown;
    };
    if (!isUsable(data)) return offline;

    const words = (data.words as unknown[]).filter(
      (w): w is string => typeof w === 'string'
    );
    return {
      base: data.base as string,
      words,
      source: (data.source as PuzzleSource) ?? 'fallback',
    };
  } catch {
    return offline;
  }
}
