/**
 * Cold-start categoriser: MCC prior + merchant keyword rules.
 *
 * OWNERSHIP: the embedding-engine lane owns this file's internals. Keep the
 * exported `categoriser` shape (see contracts.mjs Categoriser) and replace
 * everything else freely.
 *
 * This exists so the app is useful with zero training data, and so there is a
 * baseline to measure the model against.
 */
import { CONFIDENCE_THRESHOLD } from './contracts.mjs';

/**
 * ISO 18245 merchant category codes -> our categories.
 * Ranges are inclusive. First match wins, so put specifics before ranges.
 */
const MCC_RULES = [
  // 5813 (drinking places) MUST precede the 5811-5814 range: first match wins,
  // and a pub is nights_out, not eating_out.
  { from: 5813, to: 5813, category: 'nights_out', confidence: 0.8 },
  { from: 5811, to: 5814, category: 'eating_out', confidence: 0.8 },
  { from: 5411, to: 5411, category: 'groceries', confidence: 0.85 },
  { from: 5422, to: 5499, category: 'groceries', confidence: 0.7 },
  { from: 4111, to: 4131, category: 'transport', confidence: 0.8 },
  { from: 4121, to: 4121, category: 'transport', confidence: 0.85 },
  { from: 5541, to: 5542, category: 'transport', confidence: 0.75 },
  { from: 5912, to: 5912, category: 'health', confidence: 0.85 },
  { from: 8011, to: 8099, category: 'health', confidence: 0.75 },
  { from: 5942, to: 5943, category: 'uni', confidence: 0.7 },
  { from: 8220, to: 8299, category: 'uni', confidence: 0.8 },
  { from: 4899, to: 4899, category: 'subscriptions', confidence: 0.7 },
  { from: 7841, to: 7841, category: 'subscriptions', confidence: 0.7 },
  { from: 5311, to: 5399, category: 'shopping', confidence: 0.65 },
  { from: 5611, to: 5699, category: 'shopping', confidence: 0.7 },
];

/**
 * Merchant keyword rules. Lower confidence than MCC because substring matching
 * is genuinely unreliable ("Costa" matches "Costa Coffee" and "Costa Rica Ltd").
 */
const KEYWORD_RULES = [
  // Above the 5814 MCC prior on purpose: 'coffee' is the more specific answer
  // than 'eating_out' for a coffee shop, and both share MCC 5812/5814.
  [/\b(costa|starbucks|pret|caffe nero|coffee|espresso)\b/i, 'coffee', 0.82],
  [/\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-?op|iceland)\b/i, 'groceries', 0.75],
  [/\b(mcdonald|kfc|nando|greggs|subway|burger|pizza|deliveroo|just ?eat|uber ?eats|wagamama)\b/i, 'eating_out', 0.72],
  [/\b(tfl|oyster|trainline|uber|bolt|lner|northern rail|national rail|citymapper)\b/i, 'transport', 0.75],
  [/\b(netflix|spotify|disney|prime video|apple\.?com|icloud|youtube|patreon|gym|puregym)\b/i, 'subscriptions', 0.72],
  [/\b(boots|superdrug|pharmacy|nhs|dentist|optician)\b/i, 'health', 0.72],
  [/\b(waterstones|blackwell|whsmith|stationery|university|student union|library)\b/i, 'uni', 0.7],
  [/\b(pub|bar|brewdog|wetherspoon|nightclub|tequila|vodka)\b/i, 'nights_out', 0.68],
  [/\b(amazon|argos|primark|h&m|zara|asos|next retail|john lewis|ikea)\b/i, 'shopping', 0.68],
];

function fromMcc(mcc) {
  if (!mcc) return null;
  const n = Number.parseInt(mcc, 10);
  if (!Number.isFinite(n)) return null;
  for (const rule of MCC_RULES) {
    if (n >= rule.from && n <= rule.to) return rule;
  }
  return null;
}

function fromKeywords(text) {
  for (const [pattern, category, confidence] of KEYWORD_RULES) {
    if (pattern.test(text)) return { category, confidence };
  }
  return null;
}

/**
 * An exact past correction for the same merchant always wins, at full
 * confidence. This is the cheap half of "learning from the user" and it works
 * from the very first correction, which matters on a demo timeline.
 */
function fromFeedback(input, feedbackByMerchant) {
  const hit = feedbackByMerchant.get(input.merchant.toLowerCase());
  return hit ? { category: hit, confidence: 1, source: 'user' } : null;
}

/** @type {import('./contracts.mjs').Categoriser} */
export const categoriser = {
  async categorise(inputs, ctx) {
    // Newest-first feedback: the first entry per merchant is the latest word.
    const feedbackByMerchant = new Map();
    for (const f of ctx?.feedback ?? []) {
      const key = String(f.merchant ?? '').toLowerCase();
      if (key && !feedbackByMerchant.has(key)) feedbackByMerchant.set(key, f.category);
    }

    return inputs.map((input) => {
      if (input.kind === 'income') {
        return { id: input.id, category: null, confidence: 1, source: 'rules' };
      }

      const user = fromFeedback(input, feedbackByMerchant);
      if (user) return { id: input.id, ...user };

      const mcc = fromMcc(input.mcc);
      const keyword = fromKeywords(input.text);

      // Agreement between two independent signals is worth more than either.
      if (mcc && keyword && mcc.category === keyword.category) {
        return { id: input.id, category: mcc.category, confidence: 0.95, source: 'rules' };
      }
      const best = (mcc?.confidence ?? 0) >= (keyword?.confidence ?? 0) ? mcc : keyword;
      if (!best) return { id: input.id, category: null, confidence: 0, source: 'none' };

      return { id: input.id, category: best.category, confidence: best.confidence, source: 'rules' };
    });
  },
};

export { CONFIDENCE_THRESHOLD };
