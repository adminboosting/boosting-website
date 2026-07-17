/**
 * Deterministic FAQ answer suggestions — AI feature "faq_suggestions"
 * (lib/ai/features.ts). Pure keyword-overlap scoring, no env, fast-suite
 * tested. Wired into the /contact "Common answers" section.
 */

export interface FaqEntry {
  question: string;
  answer: string;
}

/** Filler words that carry no signal for matching. */
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "can",
  "does",
  "will",
  "are",
  "was",
  "you",
  "your",
  "our",
  "get",
  "have",
  "about",
  "this",
  "that",
  "not",
  "but",
]);

/**
 * Lowercase word tokens, 3+ chars, stopwords dropped, naive singularization
 * (trailing "s" stripped from 4+-char words so "refunds" matches "refund").
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/**
 * Rank `faqs` against a free-text query by keyword overlap: a query token in
 * the question scores 2, in the answer scores 1. Only positive scores are
 * returned (top `limit`), ties broken by original order. Empty or all-stopword
 * queries return [] — callers show their own default set.
 */
export function suggestFaqs<T extends FaqEntry>(query: string, faqs: readonly T[], limit = 3): T[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  return faqs
    .map((faq, index) => {
      const questionTokens = new Set(tokenize(faq.question));
      const answerTokens = new Set(tokenize(faq.answer));
      let score = 0;
      for (const token of queryTokens) {
        if (questionTokens.has(token)) score += 2;
        else if (answerTokens.has(token)) score += 1;
      }
      return { faq, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.faq);
}
