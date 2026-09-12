import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

// A stable alias (not a pinned version) so this doesn't silently 404 again
// the next time Google retires a dated model — it always resolves to
// whatever flash model is currently recommended.
const MODEL = 'gemini-flash-latest';

// Belt-and-suspenders for a kids' feature: an explicit instruction to refuse
// the TOPIC itself when it's unsuitable (not just filter individual words),
// backed by the API's own content-safety filters set to the strictest
// threshold — so a refusal doesn't depend on the model reliably following
// the prompt alone.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
}));

/** Asks Gemini for a word-search word list on a topic. Deliberately
 * tolerant of a bad response — this only ever costs the player a smaller
 * puzzle, never a broken one, so failures here degrade gracefully rather
 * than throwing. Returns [] on any failure, including a refused/blocked
 * topic — the caller treats "too few words" and "refused" identically. */
export async function generateTopicWords(
  apiKey: string,
  topic: string
): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Give me 14 single words for a word-search puzzle about "${topic}".
Rules:
- This is for a family app used by kids as young as 8. If the topic itself is not clearly suitable for children — anything violent, sexual, hateful, drug-related, or otherwise inappropriate — do not generate any words. Instead respond with exactly: []
- Otherwise, words must be appropriate for children aged 13 and under.
- Each word must be a single unbroken token of only letters A-Z (no spaces, hyphens, numbers, or punctuation) — join multi-word names/phrases into one word, e.g. "TAYLORSWIFT" not "Taylor Swift".
- Each word must be 3 to 9 letters long.
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
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const words: string[] = [];
    for (const raw of parsed) {
      if (typeof raw !== 'string') continue;
      const word = raw.trim().toUpperCase();
      if (!/^[A-Z]{3,9}$/.test(word)) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      words.push(word);
      if (words.length >= 14) break;
    }
    return words;
  } catch {
    return [];
  }
}
