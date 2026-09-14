import {
  CONTENT_RATING,
  firstJson,
  generate,
  type ModelProvider,
} from './providers';

/** Every AI-written word in the app: the word search's topic list, Daily
 * Word's answers, and Hangman's words and clues.
 *
 * Each generator is the same three parts — build a prompt, parse and
 * validate what comes back, and hand both to generate() to run down the
 * provider chain. Validation is the important half: the prompts ask for
 * constraints the models mostly respect, and this is what makes "mostly"
 * safe to build a game on. */

// ---------------------------------------------------------------- fallbacks

/** Last-resort answers for Daily Word. A day must always have a word — if
 * every provider is down the family still gets a puzzle, and because the
 * pick is seeded by the date everyone gets the same one. */
const FALLBACK_DAILY = [
  'CRANE', 'PLANT', 'BRAVE', 'SHINE', 'TIGER', 'MONTH', 'QUILT', 'FROST',
  'SNACK', 'OCEAN', 'PIANO', 'BREAD', 'CLOUD', 'GRAPE', 'HONEY', 'JOLLY',
  'KNEEL', 'LEMON', 'MAPLE', 'NOBLE', 'OTTER', 'PORCH', 'QUIET', 'RIVER',
  'STORM', 'TRAIN', 'UNCLE', 'VOWEL', 'WAGON', 'YOUTH', 'ZEBRA', 'BEACH',
  'CHARM', 'DREAM', 'EAGLE', 'FLAME', 'GHOST', 'HEART', 'IVORY', 'JUICE',
  'KNIFE', 'LUCKY', 'MAGIC', 'NIGHT', 'OLIVE', 'PEARL', 'QUACK', 'ROBOT',
  'SHARK', 'TOWER', 'URBAN', 'VIVID', 'WHALE', 'YACHT', 'ZESTY', 'BLOOM',
  'CANDY', 'DANCE', 'EMBER', 'FROGS', 'GLOVE', 'HOTEL', 'INDEX', 'JEWEL',
];

/** Last-resort words for solo Hangman, by category id. Deliberately deep:
 * a thin list repeats within a single sitting, and unlike Daily Word — where
 * one word covers the whole day — a player can burn through ten of these in
 * ten minutes. This is also the only layer that survives with no signal at
 * all, which no second provider can help with. */
const FALLBACK_HANGMAN: Record<string, { word: string; hint: string }[]> = {
  animals: [
    { word: 'PENGUIN', hint: 'Dresses for dinner, swims for lunch' },
    { word: 'GIRAFFE', hint: 'Tallest head in the room' },
    { word: 'DOLPHIN', hint: 'Clever swimmer that clicks' },
    { word: 'SQUIRREL', hint: 'Buries snacks and forgets where' },
    { word: 'FLAMINGO', hint: 'Pink, and stands on one leg' },
    { word: 'OCTOPUS', hint: 'Eight arms, three hearts' },
    { word: 'HEDGEHOG', hint: 'A pincushion that snuffles' },
    { word: 'CHEETAH', hint: 'Fastest sprinter on land' },
    { word: 'TORTOISE', hint: 'Carries its house, never hurries' },
    { word: 'RACCOON', hint: 'Masked raider of bins' },
    { word: 'PANTHER', hint: 'A big cat in the dark' },
    { word: 'WALRUS', hint: 'Tusks and a fine moustache' },
  ],
  food: [
    { word: 'PANCAKE', hint: 'Flipped for breakfast' },
    { word: 'SPAGHETTI', hint: 'Long and twirled on a fork' },
    { word: 'PINEAPPLE', hint: 'Spiky outside, sweet inside' },
    { word: 'POPCORN', hint: 'Bursts in the heat' },
    { word: 'MUSHROOM', hint: 'Grows in the dark, tops a pizza' },
    { word: 'CHOCOLATE', hint: 'Melts in a warm pocket' },
    { word: 'SANDWICH', hint: 'Named after an earl' },
    { word: 'PORRIDGE', hint: 'Too hot, too cold, just right' },
    { word: 'WAFFLE', hint: 'Full of little square pockets' },
    { word: 'AVOCADO', hint: 'Green, with a big stone inside' },
    { word: 'NOODLES', hint: 'Slurped from a bowl' },
    { word: 'PUMPKIN', hint: 'Pie in autumn, lantern at night' },
  ],
  sports: [
    { word: 'SOCCER', hint: 'Played with feet and a round ball' },
    { word: 'HOCKEY', hint: 'Sticks, skates and a puck' },
    { word: 'TENNIS', hint: 'Love means nothing here' },
    { word: 'CRICKET', hint: 'Bats, wickets, and very long days' },
    { word: 'CYCLING', hint: 'Two wheels and a lot of hills' },
    { word: 'ARCHERY', hint: 'Aim for the middle ring' },
    { word: 'SWIMMING', hint: 'Lengths up and down the lane' },
    { word: 'CLIMBING', hint: 'Up the wall, on purpose' },
    { word: 'ROWING', hint: 'Facing backwards, going forwards' },
    { word: 'SKATING', hint: 'Spins and figures on ice' },
    { word: 'MARATHON', hint: 'Twenty-six miles of regret' },
    { word: 'JUDO', hint: 'Throws, holds, and a coloured belt' },
  ],
  places: [
    { word: 'LIBRARY', hint: 'Quiet, full of stories' },
    { word: 'AIRPORT', hint: 'Where journeys take off' },
    { word: 'MOUNTAIN', hint: 'You climb it for the view' },
    { word: 'HARBOUR', hint: 'Where boats come home' },
    { word: 'CASTLE', hint: 'Moat optional, towers essential' },
    { word: 'DESERT', hint: 'Sand as far as you can see' },
    { word: 'VILLAGE', hint: 'Smaller than a town' },
    { word: 'MUSEUM', hint: 'Old things behind glass' },
    { word: 'JUNGLE', hint: 'Thick, green and loud' },
    { word: 'STADIUM', hint: 'Thousands of seats, one pitch' },
    { word: 'LIGHTHOUSE', hint: 'Warns ships off the rocks' },
    { word: 'MARKET', hint: 'Stalls, haggling and fresh bread' },
  ],
  household: [
    { word: 'TOASTER', hint: 'Pops up in the morning' },
    { word: 'BLANKET', hint: 'Keeps you warm on the sofa' },
    { word: 'UMBRELLA', hint: 'Only useful when it rains' },
    { word: 'KETTLE', hint: 'Whistles when it is ready' },
    { word: 'CUSHION', hint: 'Soft, and always on the floor' },
    { word: 'MIRROR', hint: 'Shows you back to yourself' },
    { word: 'DRAWER', hint: 'Where odd things go to hide' },
    { word: 'CURTAIN', hint: 'Drawn at bedtime' },
    { word: 'LADDER', hint: 'Rungs to the high shelf' },
    { word: 'HOOVER', hint: 'Loud, and eats the crumbs' },
    { word: 'TEAPOT', hint: 'Short and stout, so they say' },
    { word: 'DOORBELL', hint: 'Rings, and the dog goes mad' },
  ],
  space: [
    { word: 'COMET', hint: 'A snowball with a tail' },
    { word: 'GALAXY', hint: 'Billions of stars together' },
    { word: 'ROCKET', hint: 'Goes up with a roar' },
    { word: 'ECLIPSE', hint: 'When one hides the other' },
    { word: 'ASTEROID', hint: 'A rock with its own orbit' },
    { word: 'SATURN', hint: 'The one wearing rings' },
    { word: 'CRATER', hint: 'A dent from a big impact' },
    { word: 'ORBIT', hint: 'Going round and round' },
    { word: 'TELESCOPE', hint: 'Brings the far things near' },
    { word: 'METEOR', hint: 'A wish as it streaks past' },
    { word: 'GRAVITY', hint: 'What keeps you on the ground' },
    { word: 'ASTRONAUT', hint: 'Floats at work' },
  ],
  anything: [
    { word: 'PUZZLE', hint: 'Pieces that need a place' },
    { word: 'GUITAR', hint: 'Six strings and a song' },
    { word: 'RAINBOW', hint: 'Seven colours after the rain' },
    { word: 'COMPASS', hint: 'Always points one way' },
    { word: 'THUNDER', hint: 'Arrives just after the flash' },
    { word: 'BICYCLE', hint: 'You never forget how' },
    { word: 'LANTERN', hint: 'A light you carry' },
    { word: 'WHISPER', hint: 'Said, but only just' },
    { word: 'JOURNEY', hint: 'The bit before arriving' },
    { word: 'MAGNET', hint: 'Pulls without touching' },
    { word: 'SHADOW', hint: 'Follows you, never speaks' },
    { word: 'BALLOON', hint: 'Rises until it does not' },
  ],
};

export interface HangmanWord {
  word: string;
  hint: string;
}

function pickSeeded<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** Deterministic per-day fallback, so every family member who loads the
 * day after an outage still lands on the same word. */
export function fallbackDailyWord(dateKey: string): string {
  let hash = 0;
  for (const char of dateKey) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return pickSeeded(FALLBACK_DAILY, hash);
}

export function fallbackHangmanWord(category: string): HangmanWord {
  const pool = FALLBACK_HANGMAN[category] ?? FALLBACK_HANGMAN.anything;
  return pickSeeded(pool, Math.floor(Math.random() * 1e6));
}

// ------------------------------------------------------- word search topics

/** How few words makes a topic not worth building a grid from. */
export const MIN_TOPIC_WORDS = 4;

/** Words for a word-search grid on a topic.
 *
 * This is the generator where a total failure is most visible: there's no
 * bundled fallback, because the whole point is the topic the player just
 * typed. Coming up empty means telling them to try a different topic — for
 * a topic that was fine. So it runs down the full provider chain. */
export async function generateTopicWords(
  providers: ModelProvider[],
  topic: string
): Promise<string[]> {
  // Ask for more than we need: some fraction always gets filtered out below
  // (too long once joined, duplicates, non-letter tokens), and topics whose
  // natural vocabulary skews toward long compound names (ride/place names,
  // character names) lose more than average.
  const prompt = `Give me 20 single words for a word-search puzzle about "${topic}".
Rules:
- If the topic itself is clearly inappropriate for a family app, do not generate any words. Instead respond with exactly: []
${CONTENT_RATING}
- Each word must be a single unbroken token of only letters A-Z (no spaces, hyphens, numbers, or punctuation) — join multi-word names/phrases into one word, e.g. "TAYLORSWIFT" not "Taylor Swift".
- Each word must be 3 to 10 letters long.
- Prefer common, recognizable words.
- Respond with ONLY a JSON array of the words as strings, nothing else. Example: ["EXAMPLE","WORDS","HERE"]`;

  return generate(
    'generateTopicWords',
    providers,
    prompt,
    (text) => parseWordList(text, /^[A-Z]{3,10}$/, 20),
    (words) => words.length < MIN_TOPIC_WORDS,
    []
  );
}

// ------------------------------------------------------------- daily word

/** Five-letter answers, avoiding any used recently. Returns every candidate
 * that survives validation — the daily word takes one, free play takes the
 * lot and plays through them, so a round of free play costs no request. */
export async function generateWordleWords(
  providers: ModelProvider[],
  recentWords: string[],
  count = 10
): Promise<string[]> {
  const avoid = recentWords.length
    ? `\n- Do NOT use any of these recently used words: ${recentWords.join(', ')}.`
    : '';

  const prompt = `Give me ${count} candidate answers for a Wordle-style puzzle played by a family.
Rules:
- Each must be exactly 5 letters, A-Z only, a single English word.
- No proper nouns, no plurals ending in S, no abbreviations, no slang.
- Vocabulary a 13-year-old would recognize — familiar words, nothing obscure or technical.
${CONTENT_RATING}${avoid}
- Respond with ONLY a JSON array of uppercase words, nothing else. Example: ["CRANE","PLANT"]`;

  const recent = new Set(recentWords.map((word) => word.toUpperCase()));
  return generate(
    'generateWordleWords',
    providers,
    prompt,
    (text) =>
      // The trailing-S check catches the plurals the prompt asks it to avoid
      // and that it produces anyway — a plural answer makes the last letter
      // a giveaway and sours the whole day for everyone.
      parseWordList(text, /^[A-Z]{5}$/, count).filter(
        (word) => !word.endsWith('S') && !recent.has(word)
      ),
    (words) => words.length === 0,
    [],
    // Three attempts per provider, not two: this is the one call whose
    // failure is felt by everyone at once.
    3
  );
}

// ---------------------------------------------------------------- hangman

/** One hangman word plus a clue. The clue is what makes a solo round
 * winnable — without it a 9-letter word off a category as broad as
 * "anything" is close to unguessable in six wrong letters. */
export async function generateHangmanWord(
  providers: ModelProvider[],
  categoryLabel: string
): Promise<HangmanWord | null> {
  const prompt = `Pick one word for a hangman game about "${categoryLabel}", for a family app.
Rules:
- If the category itself is clearly inappropriate, respond with exactly: {}
- The word must be a single word, letters A-Z only, between 5 and 10 letters.
- Common enough that a 13-year-old would know it, but not the most obvious choice.
${CONTENT_RATING}
- Also give a short playful clue of at most 8 words that does NOT contain the word itself or any part of it.
- Respond with ONLY JSON: {"word":"EXAMPLE","hint":"a short clue"}`;

  return generate<HangmanWord | null>(
    'generateHangmanWord',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { word?: unknown; hint?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }
      const word = String(parsed.word ?? '').trim().toUpperCase();
      if (!/^[A-Z]{5,10}$/.test(word)) return null;
      const hint = String(parsed.hint ?? '').trim().slice(0, 80);
      // A clue containing the answer gives the round away; drop the clue
      // rather than the word, which is still perfectly good.
      return { word, hint: hintGivesItAway(hint, word) ? '' : hint };
    },
    (picked) => picked === null,
    null
  );
}

/** A clue for a word someone else chose — the family game's "suggest a
 * clue" button. Unlike the solo generator this doesn't get to pick the
 * word, so it has to work with whatever it's handed, including a made-up
 * family in-joke it can make nothing of. */
export async function generateHangmanHint(
  providers: ModelProvider[],
  word: string
): Promise<string | null> {
  const prompt = `Write a single short clue for a game of hangman. The answer is "${word}".
Rules:
- At most 8 words, playful, the kind of clue you'd give a family member.
- The clue must NOT contain the answer, any word of the answer, or any part of it spelled out.
- If the answer is not a real word or phrase you recognize (it may be a name or an in-joke), respond with exactly: {}
${CONTENT_RATING}
- Respond with ONLY JSON: {"hint":"your clue"}`;

  return generate<string | null>(
    'generateHangmanHint',
    providers,
    prompt,
    (text) => {
      const json = firstJson(text, '{');
      if (!json) return null;
      let parsed: { hint?: unknown };
      try {
        parsed = JSON.parse(json);
      } catch {
        return null;
      }
      const hint = String(parsed.hint ?? '').trim().slice(0, 80);
      if (!hint || hintGivesItAway(hint, word)) return null;
      return hint;
    },
    (hint) => hint === null,
    null
  );
}

// ---------------------------------------------------------------- parsing

/** A clue must not contain the answer. Checked word by word, because the
 * answer may be a phrase and "ICE" leaking is as fatal as "ICE CREAM". Very
 * short words are skipped — a two-letter fragment matches far too much
 * ordinary English to be a useful signal. */
function hintGivesItAway(hint: string, word: string): boolean {
  const upper = hint.toUpperCase();
  return word
    .split(' ')
    .some((part) => part.length > 2 && upper.includes(part));
}

/** Shared parser for the two "give me a list of words" prompts: pull the
 * array out, keep the strings matching `shape`, drop duplicates. */
function parseWordList(text: string, shape: RegExp, limit: number): string[] {
  const json = firstJson(text, '[');
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of parsed) {
    if (typeof raw !== 'string') continue;
    const word = raw.trim().toUpperCase();
    if (!shape.test(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= limit) break;
  }
  return words;
}
