/**
 * Text normalisation and feature extraction.
 *
 * Shared by the embedder (which hashes these features into a vector) and the
 * rules matcher (which substring-matches the normalised form). Kept in one
 * place so "what counts as the same merchant" has exactly one definition.
 *
 * @module engine/tokenise
 */

/** Tokens that appear in almost every UK card descriptor and carry no signal. */
const NOISE_TOKENS = new Set([
  'ltd', 'limited', 'plc', 'llp', 'inc', 'llc', 'co', 'uk', 'gb', 'gbr',
  'the', 'and', 'card', 'purchase', 'payment', 'pos', 'visa', 'mastercard',
  'contactless', 'debit', 'credit', 'ref', 'txn', 'trans', 'on', 'at', 'to',
]);

/** Place names that repeat across unrelated merchants and blur the space. */
const GEO_TOKENS = new Set([
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh',
  'bristol', 'liverpool', 'sheffield', 'nottingham', 'cardiff', 'belfast',
  'brighton', 'oxford', 'cambridge', 'york', 'newcastle', 'coventry', 'bath',
  'street', 'st', 'road', 'rd', 'high', 'branch', 'store', 'shop',
]);

/**
 * Lowercase, strip accents, reduce anything that is not a letter or digit to a
 * single space. Deliberately lossy and deliberately deterministic.
 *
 * @param {string} s
 * @returns {string}
 */
export function normalise(s) {
  if (typeof s !== 'string') return '';
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Aggressive identity key for a merchant. Two strings sharing a key are treated
 * as the same merchant for the purpose of replaying a user correction.
 *
 * Drops noise words, place names and bare numbers, so
 * "PRET A MANGER 421 LONDON GB" and "Pret A Manger" collapse to "pret a manger".
 *
 * @param {string} s
 * @returns {string} empty string when nothing survives
 */
export function merchantKey(s) {
  const kept = normalise(s)
    .split(' ')
    .filter((t) => t && !NOISE_TOKENS.has(t) && !GEO_TOKENS.has(t) && !/^\d+$/.test(t));
  return kept.join(' ');
}

/**
 * Weighted bag of features for one string.
 *
 * Four families, each earning its weight:
 *   - word unigrams: the merchant name itself
 *   - word bigrams: "pizza express" should not look like "pizza" + "express"
 *   - character 4-grams: survives truncation and abbreviation in descriptors
 *     ("PIZZAEXPRSS", "SAINSBURYS S/MKT")
 *   - the MCC, as an exact token and as its 2-digit group
 *
 * Bare numbers (terminal ids, branch numbers) are kept but heavily discounted:
 * they distinguish branches, which is occasionally useful and usually noise.
 *
 * @param {string} text
 * @returns {Map<string, number>} feature -> weight
 */
export function features(text) {
  /** @type {Map<string, number>} */
  const out = new Map();
  const add = (key, weight) => out.set(key, (out.get(key) ?? 0) + weight);

  const raw = typeof text === 'string' ? text : '';

  // The MCC arrives inside the canonical text as "mcc:5814". Pull it out before
  // normalisation flattens the colon, so we can weight it as its own feature.
  const mccMatch = raw.match(/\bmcc:(\d{3,4})\b/i);
  if (mccMatch) {
    const code = mccMatch[1].padStart(4, '0');
    add(`mcc=${code}`, 2.6);
    add(`mccgrp=${code.slice(0, 2)}`, 1.4);
  }

  const norm = normalise(raw.replace(/\bmcc:\d{3,4}\b/gi, ' '));
  if (!norm) return out;

  const tokens = norm.split(' ').filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    let w = 1;
    if (/^\d+$/.test(t)) w = 0.3;
    else if (NOISE_TOKENS.has(t)) w = 0.15;
    else if (GEO_TOKENS.has(t)) w = 0.25;
    else if (t.length <= 2) w = 0.5;
    add(`w=${t}`, w);

    if (i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const bigramWeight = /^\d+$/.test(t) || /^\d+$/.test(next) ? 0.2 : 0.8;
      add(`b=${t} ${next}`, bigramWeight);
    }
  }

  // Character n-grams over the letters only. Digits are excluded here because a
  // terminal id would otherwise generate a dozen near-random grams.
  const letters = `_${tokens.filter((t) => !/^\d+$/.test(t)).join('_')}_`;
  if (letters.length >= 4) {
    for (let i = 0; i + 4 <= letters.length; i += 1) {
      add(`c=${letters.slice(i, i + 4)}`, 0.45);
    }
  }

  return out;
}

export const _internals = { NOISE_TOKENS, GEO_TOKENS };
