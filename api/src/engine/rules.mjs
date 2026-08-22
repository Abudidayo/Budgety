/**
 * Brand rules: UK merchant name -> category.
 *
 * The second half of the cold start. The MCC table knows "this is fast food";
 * this knows "this is Costa, which is coffee". Where they disagree, a named
 * brand beats a generic code — that precedence lives in classifier.mjs.
 *
 * ORDER MATTERS. The first match wins, so narrow patterns must precede the
 * broad ones they overlap: "uber eats" before "uber", "amazon prime" before
 * "amazon", "tesco petrol" before "tesco".
 *
 * Patterns are matched against the normalised merchant and descriptor joined
 * together, so "SAINSBURYS SMKT" matches on either field.
 *
 * @module engine/rules
 */

import { normalise } from './tokenise.mjs';

/**
 * @typedef {object} Rule
 * @property {string[]} match      Normalised substrings; any one hitting is a match.
 * @property {string} category
 * @property {number} confidence   How sure the brand alone makes us.
 */

/** @type {Rule[]} */
const RULES = [
  // --- Disambiguators. These MUST stay above the broad brand rules below. ---
  { match: ['uber eats', 'ubereats'], category: 'eating_out', confidence: 0.92 },
  { match: ['amazon prime', 'prime video', 'amazon music', 'audible', 'kindle unltd', 'kindle unlimited'], category: 'subscriptions', confidence: 0.9 },
  { match: ['tesco petrol', 'tesco fuel', 'sainsburys petrol', 'morrisons petrol', 'asda petrol', 'asda fuel'], category: 'transport', confidence: 0.9 },
  { match: ['tesco cafe', 'ikea restaurant'], category: 'eating_out', confidence: 0.8 },
  { match: ['m s simply food', 'marks spencer food', 'm s food', 'waitrose partners'], category: 'groceries', confidence: 0.9 },
  { match: ['apple com bill', 'apple bill', 'itunes', 'apple music', 'apple tv', 'icloud'], category: 'subscriptions', confidence: 0.9 },
  { match: ['google storage', 'google one', 'youtube premium', 'google play'], category: 'subscriptions', confidence: 0.86 },
  { match: ['boots opticians', 'specsavers'], category: 'health', confidence: 0.92 },

  // --- Coffee ---------------------------------------------------------------
  { match: ['costa coffee', 'costa'], category: 'coffee', confidence: 0.95 },
  { match: ['starbucks'], category: 'coffee', confidence: 0.95 },
  { match: ['caffe nero', 'cafe nero'], category: 'coffee', confidence: 0.95 },
  { match: ['gails', 'gail s bakery'], category: 'coffee', confidence: 0.82 },
  { match: ['black sheep coffee', 'grind', 'harris hoole', 'coffee1', 'coffee 1', 'esquires'], category: 'coffee', confidence: 0.85 },
  { match: ['coffee', 'espresso', 'roastery', 'roasters', 'barista'], category: 'coffee', confidence: 0.78 },

  // --- Eating out -----------------------------------------------------------
  { match: ['pret a manger', 'pret'], category: 'eating_out', confidence: 0.72 },
  { match: ['greggs'], category: 'eating_out', confidence: 0.85 },
  { match: ['mcdonald', 'burger king', 'kfc', 'taco bell', 'subway', 'five guys', 'shake shack'], category: 'eating_out', confidence: 0.93 },
  { match: ['nando', 'wagamama', 'pizza express', 'pizzaexpress', 'pizza hut', 'domino', 'papa john', 'franco manca', 'zizzi', 'bella italia', 'ask italian', 'prezzo'], category: 'eating_out', confidence: 0.93 },
  { match: ['itsu', 'wasabi', 'yo sushi', 'itsu', 'tortilla', 'chipotle', 'leon', 'honest burger', 'byron', 'gbk', 'dishoom', 'bills restaurant', 'las iguanas', 'giggling squid'], category: 'eating_out', confidence: 0.9 },
  { match: ['deliveroo', 'just eat', 'justeat', 'hungryhouse'], category: 'eating_out', confidence: 0.92 },
  { match: ['restaurant', 'kitchen', 'diner', 'grill house', 'takeaway', 'kebab', 'noodle', 'sushi', 'burrito', 'canteen', 'bistro', 'cafe', 'deli'], category: 'eating_out', confidence: 0.7 },

  // --- Nights out -----------------------------------------------------------
  { match: ['wetherspoon', 'spoons', 'brewdog', 'revolution bar', 'be at one', 'slug lettuce', 'all bar one', 'tiger tiger', 'pryzm', 'popworld', 'walkabout', 'o neill', 'greene king'], category: 'nights_out', confidence: 0.92 },
  { match: ['odeon', 'cineworld', 'vue cinema', 'vue ', 'picturehouse', 'everyman cinema', 'showcase cinema'], category: 'nights_out', confidence: 0.9 },
  { match: ['ticketmaster', 'dice fm', 'dicefm', 'fatsoma', 'skiddle', 'eventbrite', 'see tickets', 'o2 academy', 'ministry of sound'], category: 'nights_out', confidence: 0.86 },
  { match: ['majestic wine', 'bottle shop', 'off licence', 'wine cellar'], category: 'nights_out', confidence: 0.78 },
  { match: [' bar ', 'bar ', 'tavern', 'nightclub', 'night club', 'brewery', 'taproom', 'pub ', ' pub', 'inn ', 'cocktail'], category: 'nights_out', confidence: 0.72 },

  // --- Transport ------------------------------------------------------------
  { match: ['tfl ', 'tfl', 'transport for london', 'oyster', 'cycle hire', 'santander cycles'], category: 'transport', confidence: 0.94 },
  { match: ['trainline', 'lner', 'gwr', 'avanti west', 'thameslink', 'southeastern', 'southern rail', 'crosscountry', 'scotrail', 'northern rail', 'greater anglia', 'transpennine', 'chiltern railway', 'west midlands rail', 'merseyrail', 'railway', 'rail '], category: 'transport', confidence: 0.9 },
  { match: ['uber', 'bolt eu', 'bolt ', 'free now', 'freenow', 'addison lee', 'gett '], category: 'transport', confidence: 0.88 },
  { match: ['national express', 'megabus', 'stagecoach', 'arriva', 'first bus', 'go ahead', 'coach station'], category: 'transport', confidence: 0.9 },
  { match: ['ryanair', 'easyjet', 'british airways', 'jet2', 'wizz air', 'eurostar', 'aer lingus'], category: 'transport', confidence: 0.86 },
  { match: ['shell ', 'bp ', 'esso', 'texaco', 'gulf oil', 'applegreen', 'petrol', 'fuel', 'ev charge', 'pod point', 'instavolt'], category: 'transport', confidence: 0.85 },
  { match: ['ncp ', 'ringgo', 'justpark', 'parkingeye', 'car park', 'parking'], category: 'transport', confidence: 0.85 },
  { match: ['lime', 'voi ', 'tier mobility', 'dott '], category: 'transport', confidence: 0.78 },

  // --- Groceries ------------------------------------------------------------
  { match: ['tesco', 'sainsbury', 'asda', 'morrisons', 'waitrose', 'aldi', 'lidl', 'iceland food', 'ocado', 'co op', 'coop food', 'the co operative', 'budgens', 'nisa', 'spar', 'costcutter', 'premier store', 'whole foods', 'booths'], category: 'groceries', confidence: 0.94 },
  { match: ['gorillas', 'getir', 'zapp', 'weezy', 'farmdrop', 'farm shop', 'greengrocer', 'butcher', 'bakery', 'supermarket', 'food store', 'convenience'], category: 'groceries', confidence: 0.78 },

  // --- Health ---------------------------------------------------------------
  { match: ['boots', 'superdrug', 'lloyds pharmacy', 'well pharmacy', 'pharmacy', 'chemist'], category: 'health', confidence: 0.86 },
  { match: ['puregym', 'pure gym', 'the gym group', 'gymbox', 'david lloyd', 'fitness first', 'anytime fitness', 'nuffield health', 'better gym', 'gym'], category: 'health', confidence: 0.86 },
  { match: ['nhs', 'bupa', 'axa health', 'dentist', 'dental', 'optician', 'vision express', 'physio', 'clinic', 'surgery', 'medical'], category: 'health', confidence: 0.86 },
  { match: ['holland barrett', 'myprotein', 'protein works', 'bulk powders'], category: 'health', confidence: 0.78 },

  // --- Subscriptions --------------------------------------------------------
  { match: ['netflix', 'spotify', 'disney plus', 'disneyplus', 'now tv', 'nowtv', 'dazn', 'paramount', 'hayu', 'britbox', 'mubi', 'crunchyroll', 'deezer', 'tidal', 'soundcloud go'], category: 'subscriptions', confidence: 0.95 },
  { match: ['duolingo', 'notion', 'github', 'openai', 'chatgpt', 'anthropic', 'claude ai', 'adobe', 'microsoft 365', 'office 365', 'dropbox', 'canva', 'figma', 'grammarly', 'evernote', 'todoist'], category: 'subscriptions', confidence: 0.9 },
  { match: ['patreon', 'substack', 'medium', 'strava', 'headspace', 'calm ', 'linkedin prem', 'nintendo', 'playstation', 'xbox', 'steam games', 'epic games'], category: 'subscriptions', confidence: 0.84 },
  { match: ['vodafone', 'giffgaff', 'lebara', 'lycamobile', 'three uk', 'ee ltd', 'o2 uk', 'sky uk', 'sky digital', 'virgin media', 'talktalk', 'plusnet', 'bt group', 'hyperoptic', 'community fibre'], category: 'subscriptions', confidence: 0.88 },
  { match: ['subscription', 'monthly plan', 'membership'], category: 'subscriptions', confidence: 0.7 },

  // --- Uni ------------------------------------------------------------------
  { match: ['university', 'uni of', 'students union', 'student union', 'unite students', 'student roost', 'iq student', 'sulets', 'campus'], category: 'uni', confidence: 0.9 },
  { match: ['blackwell', 'waterstones', 'foyles', 'wob', 'world of books', 'abebooks', 'jstor', 'overleaf', 'chegg', 'coursera', 'edx ', 'quizlet'], category: 'uni', confidence: 0.82 },
  { match: ['ryman', 'paperchase', 'staples', 'whsmith', 'wh smith', 'cass art', 'stationery', 'printing', 'print shop', 'library'], category: 'uni', confidence: 0.76 },
  { match: ['unidays', 'student beans', 'studentbeans', 'tuition', 'course fee', 'exam fee'], category: 'uni', confidence: 0.86 },

  // --- Shopping. Last, because it is the broadest. --------------------------
  { match: ['argos', 'john lewis', 'next retail', 'primark', 'h m ', 'hennes', 'zara', 'uniqlo', 'asos', 'boohoo', 'shein', 'tk maxx', 'tkmaxx', 'sports direct', 'jd sports', 'footasylum', 'schuh', 'matalan', 'new look', 'river island', 'urban outfitters', 'monki', 'weekday'], category: 'shopping', confidence: 0.9 },
  { match: ['ikea', 'b q ', 'wickes', 'homebase', 'wilko', 'the range', 'dunelm', 'currys', 'richer sounds', 'decathlon', 'go outdoors', 'halfords'], category: 'shopping', confidence: 0.88 },
  { match: ['depop', 'vinted', 'etsy', 'ebay', 'amazon', 'aliexpress', 'temu', 'wish com'], category: 'shopping', confidence: 0.74 },
  { match: ['apple store', 'samsung', 'lush', 'the body shop', 'sephora', 'space nk', 'zalando', 'asos design'], category: 'shopping', confidence: 0.82 },
];

/**
 * First matching rule, or null.
 *
 * @param {{merchant?: string, descriptor?: string}} t
 * @returns {{category: string, confidence: number, rule: string}|null}
 */
export function ruleMatch(t) {
  const haystack = ` ${normalise(`${t?.merchant ?? ''} ${t?.descriptor ?? ''}`)} `;
  if (haystack.trim() === '') return null;

  for (const rule of RULES) {
    for (const needle of rule.match) {
      if (haystack.includes(needle)) {
        return { category: rule.category, confidence: rule.confidence, rule: needle };
      }
    }
  }
  return null;
}

export const _internals = { RULES };
