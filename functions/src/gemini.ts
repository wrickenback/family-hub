import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

// A stable alias (not a pinned version) so this doesn't silently 404 again
// the next time Google retires a dated model — it always resolves to
// whatever flash model is currently recommended.
const MODEL = 'gemini-flash-latest';

// Belt-and-suspenders for a kids' feature: an explicit instruction to refuse
// the TOPIC itself when it's unsuitable (not just filter individual words),
// backed by the API's own content-safety filters — so a refusal doesn't
// depend on the model reliably following the prompt alone.
//
// This started at BLOCK_LOW_AND_ABOVE, then BLOCK_MEDIUM_AND_ABOVE, and both
// still over-blocked completely benign kid topics: "Disney Parks" (probably
// "haunted" from the Haunted Mansion) and "Disney Princesses" (probably
// "poison" from Snow White, or "curse"/"spell") got silently zeroed out
// because ONE flagged word anywhere in the response kills the whole
// response, not just that word. The prompt already carries an explicit
// instruction to refuse an unsuitable TOPIC outright (responding `[]`), so
// this only needs to catch what the model itself didn't already refuse —
// BLOCK_ONLY_HIGH catches clearly inappropriate content without punishing
// classic-fairy-tale vocabulary for sharing a word with something scarier.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
}));

const MIN_WORDS = 4;

/** One request to Gemini for a word-search word list. Never throws —
 * returns [] on any failure, including a refused/blocked topic or a
 * malformed response, and logs why so a failure is diagnosable after the
 * fact instead of just showing up as "too few words" with no context. */
async function requestTopicWords(
  ai: InstanceType<typeof GoogleGenAI>,
  topic: string,
  attempt: number
): Promise<string[]> {
  // Ask for more than we need: some fraction always gets filtered out below
  // (too long once joined, duplicates, non-letter tokens), and topics whose
  // natural vocabulary skews toward long compound names (ride/place names,
  // character names) lose more than average.
  const prompt = `Give me 20 single words for a word-search puzzle about "${topic}".
Rules:
- This is for a family app used by kids as young as 8. If the topic itself is not clearly suitable for children — anything violent, sexual, hateful, drug-related, or otherwise inappropriate — do not generate any words. Instead respond with exactly: []
- Otherwise, words must be appropriate for children aged 13 and under.
- Each word must be a single unbroken token of only letters A-Z (no spaces, hyphens, numbers, or punctuation) — join multi-word names/phrases into one word, e.g. "TAYLORSWIFT" not "Taylor Swift".
- Each word must be 3 to 10 letters long.
- Prefer common, recognizable words a kid would know.
- Respond with ONLY a JSON array of the words as strings, nothing else. Example: ["EXAMPLE","WORDS","HERE"]`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { safetySettings: SAFETY_SETTINGS },
    });
    const text = response.text ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      const finishReason = response.candidates?.[0]?.finishReason;
      console.warn('generateTopicWords: no JSON array in response', {
        topic,
        attempt,
        finishReason,
        textPreview: text.slice(0, 200),
      });
      return [];
    }

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const words: string[] = [];
    for (const raw of parsed) {
      if (typeof raw !== 'string') continue;
      const word = raw.trim().toUpperCase();
      if (!/^[A-Z]{3,10}$/.test(word)) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      words.push(word);
      if (words.length >= 20) break;
    }
    if (words.length < MIN_WORDS) {
      console.warn('generateTopicWords: too few usable words after filtering', {
        topic,
        attempt,
        rawCount: parsed.length,
        usableCount: words.length,
      });
    }
    return words;
  } catch (err) {
    console.error('generateTopicWords: request failed', {
      topic,
      attempt,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Asks Gemini for a word-search word list on a topic. A single request's
 * result is stochastic — a topic that comes up short (blocked response,
 * a bad JSON parse, an unlucky word mix) often succeeds on a second try —
 * so this retries once before giving up, rather than failing the player's
 * first attempt on what may just be noise. */
export async function generateTopicWords(
  apiKey: string,
  topic: string
): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey });

  const first = await requestTopicWords(ai, topic, 1);
  if (first.length >= MIN_WORDS) return first;

  const second = await requestTopicWords(ai, topic, 2);
  return second.length > first.length ? second : first;
}
