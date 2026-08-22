/**
 * ISO 18245 merchant category code -> Budgety category.
 *
 * This is the cold-start prior. At judging time ctx.feedback is empty and the
 * embedding half of the engine has nothing to compare against, so this table is
 * what actually produces categories on stage. It costs one Map lookup.
 *
 * Strength is how much the code pins down a Budgety category, not how common
 * the code is. 5411 (supermarkets) is near-certain groceries; 5999 (misc
 * retail) is a shrug that leans shopping.
 *
 * Note what is missing: there is no MCC for a coffee shop. Costa and Starbucks
 * both bill as 5814 (fast food), which is why the brand rules in rules.mjs
 * outrank this table when they disagree — see classifier.mjs.
 *
 * @module engine/mcc
 */

/** @typedef {{category: string, strength: number}} MccPrior */

/** @type {Record<string, MccPrior>} */
const TABLE = {
  // --- Food and drink -------------------------------------------------------
  5811: { category: 'eating_out', strength: 0.82 }, // caterers
  5812: { category: 'eating_out', strength: 0.9 },  // restaurants
  5813: { category: 'nights_out', strength: 0.88 }, // bars, taverns, nightclubs
  5814: { category: 'eating_out', strength: 0.72 }, // fast food — also every coffee chain
  5462: { category: 'groceries', strength: 0.7 },   // bakeries
  5499: { category: 'groceries', strength: 0.78 },  // convenience / misc food
  5411: { category: 'groceries', strength: 0.93 },  // supermarkets
  5422: { category: 'groceries', strength: 0.85 },  // butchers
  5441: { category: 'groceries', strength: 0.7 },   // confectionery
  5451: { category: 'groceries', strength: 0.82 },  // dairy
  5921: { category: 'nights_out', strength: 0.72 }, // off-licence

  // --- Going out ------------------------------------------------------------
  7832: { category: 'nights_out', strength: 0.86 }, // cinemas
  7922: { category: 'nights_out', strength: 0.8 },  // theatrical producers
  7929: { category: 'nights_out', strength: 0.74 }, // bands, orchestras
  7911: { category: 'nights_out', strength: 0.8 },  // dance halls
  7993: { category: 'nights_out', strength: 0.6 },  // amusement machines
  7994: { category: 'nights_out', strength: 0.65 }, // arcades
  7996: { category: 'nights_out', strength: 0.66 }, // amusement parks
  7998: { category: 'nights_out', strength: 0.6 },  // aquariums, zoos
  7999: { category: 'nights_out', strength: 0.5 },  // recreation services NEC

  // --- Transport ------------------------------------------------------------
  4111: { category: 'transport', strength: 0.93 }, // commuter transport (TfL)
  4112: { category: 'transport', strength: 0.93 }, // passenger railways
  4121: { category: 'transport', strength: 0.9 },  // taxis and ride-hailing
  4131: { category: 'transport', strength: 0.9 },  // bus lines
  4457: { category: 'transport', strength: 0.55 }, // boat rentals
  4511: { category: 'transport', strength: 0.84 }, // airlines
  4582: { category: 'transport', strength: 0.7 },  // airports
  4784: { category: 'transport', strength: 0.8 },  // tolls and bridge fees
  4789: { category: 'transport', strength: 0.78 }, // transportation services NEC
  5541: { category: 'transport', strength: 0.85 }, // service stations
  5542: { category: 'transport', strength: 0.85 }, // automated fuel dispensers
  7523: { category: 'transport', strength: 0.84 }, // car parks
  7512: { category: 'transport', strength: 0.72 }, // car rental
  7538: { category: 'transport', strength: 0.6 },  // car servicing

  // --- Shopping -------------------------------------------------------------
  5311: { category: 'shopping', strength: 0.82 }, // department stores
  5399: { category: 'shopping', strength: 0.62 }, // misc general merchandise
  5611: { category: 'shopping', strength: 0.86 },
  5621: { category: 'shopping', strength: 0.86 },
  5631: { category: 'shopping', strength: 0.82 },
  5641: { category: 'shopping', strength: 0.82 },
  5651: { category: 'shopping', strength: 0.88 }, // family clothing
  5655: { category: 'shopping', strength: 0.82 },
  5661: { category: 'shopping', strength: 0.86 }, // shoes
  5691: { category: 'shopping', strength: 0.86 },
  5699: { category: 'shopping', strength: 0.8 },
  5712: { category: 'shopping', strength: 0.76 }, // furniture
  5722: { category: 'shopping', strength: 0.78 }, // household appliances
  5732: { category: 'shopping', strength: 0.8 },  // electronics
  5733: { category: 'shopping', strength: 0.7 },  // musical instruments
  5734: { category: 'shopping', strength: 0.6 },  // computer software
  5735: { category: 'shopping', strength: 0.7 },  // record stores
  5912: { category: 'health', strength: 0.85 },   // pharmacies
  5931: { category: 'shopping', strength: 0.7 },  // second-hand
  5941: { category: 'shopping', strength: 0.72 }, // sporting goods
  5944: { category: 'shopping', strength: 0.8 },  // jewellery
  5945: { category: 'shopping', strength: 0.76 }, // hobby, toy
  5947: { category: 'shopping', strength: 0.7 },  // gift shops
  5977: { category: 'shopping', strength: 0.76 }, // cosmetics
  5999: { category: 'shopping', strength: 0.55 }, // misc retail
  5964: { category: 'shopping', strength: 0.6 },
  5965: { category: 'shopping', strength: 0.6 },
  5969: { category: 'shopping', strength: 0.55 },
  7230: { category: 'shopping', strength: 0.6 },  // hairdressers
  7297: { category: 'health', strength: 0.6 },    // massage
  7298: { category: 'health', strength: 0.62 },   // health and beauty spas

  // --- Subscriptions and bills ---------------------------------------------
  4812: { category: 'subscriptions', strength: 0.72 }, // telecom equipment
  4814: { category: 'subscriptions', strength: 0.84 }, // telecom services
  4816: { category: 'subscriptions', strength: 0.8 },  // computer network services
  4899: { category: 'subscriptions', strength: 0.86 }, // cable, satellite, pay TV
  5815: { category: 'subscriptions', strength: 0.84 }, // digital goods: media
  5816: { category: 'subscriptions', strength: 0.78 }, // digital goods: games
  5817: { category: 'subscriptions', strength: 0.84 }, // digital goods: apps
  5818: { category: 'subscriptions', strength: 0.76 }, // digital goods: large merchant
  5968: { category: 'subscriptions', strength: 0.88 }, // continuity / subscription
  7841: { category: 'subscriptions', strength: 0.72 }, // video rental
  7372: { category: 'subscriptions', strength: 0.7 },  // computer programming services

  // --- Health ---------------------------------------------------------------
  5122: { category: 'health', strength: 0.8 },  // drugs and druggists' sundries
  5976: { category: 'health', strength: 0.7 },  // orthopaedic goods
  8011: { category: 'health', strength: 0.92 }, // doctors
  8021: { category: 'health', strength: 0.92 }, // dentists
  8031: { category: 'health', strength: 0.88 },
  8041: { category: 'health', strength: 0.88 },
  8042: { category: 'health', strength: 0.9 },  // optometrists
  8043: { category: 'health', strength: 0.9 },  // opticians
  8049: { category: 'health', strength: 0.86 },
  8050: { category: 'health', strength: 0.84 },
  8062: { category: 'health', strength: 0.9 },  // hospitals
  8071: { category: 'health', strength: 0.88 }, // medical labs
  8099: { category: 'health', strength: 0.84 }, // medical services NEC
  7941: { category: 'health', strength: 0.66 }, // sports clubs, gyms
  7997: { category: 'health', strength: 0.66 }, // membership clubs, gyms

  // --- Uni ------------------------------------------------------------------
  // This is a student budgeting app: books and stationery are coursework spend,
  // not general shopping. Worth revisiting if the audience ever widens.
  5111: { category: 'uni', strength: 0.72 }, // stationery, office supplies
  5192: { category: 'uni', strength: 0.7 },  // books, periodicals
  5942: { category: 'uni', strength: 0.72 }, // book stores
  5943: { category: 'uni', strength: 0.78 }, // stationery and school supplies
  8211: { category: 'uni', strength: 0.8 },  // schools
  8220: { category: 'uni', strength: 0.93 }, // colleges and universities
  8241: { category: 'uni', strength: 0.8 },
  8244: { category: 'uni', strength: 0.8 },
  8249: { category: 'uni', strength: 0.8 },
  8299: { category: 'uni', strength: 0.82 }, // educational services NEC
  8351: { category: 'uni', strength: 0.6 },  // childcare — weak, but school-adjacent
};

/**
 * Codes we deliberately refuse to guess on. Cash withdrawals, transfers and
 * card-to-card payments have no category — guessing "shopping" on an ATM
 * withdrawal is worse than admitting we do not know.
 */
const NO_OPINION = new Set([
  '6010', '6011', '6012', '6050', '6051', '6211', '6300', '6513', '6529',
  '6530', '6532', '6533', '6536', '6537', '6538', '6540', '4829', '9311',
  '9399', '9402',
]);

/**
 * @param {string|null|undefined} mcc
 * @returns {MccPrior|null} null when the code is unknown or explicitly
 *   no-opinion; the caller must not invent a category in that case.
 */
export function mccPrior(mcc) {
  if (typeof mcc !== 'string') return null;
  const code = mcc.trim().padStart(4, '0');
  if (!/^\d{4}$/.test(code) || NO_OPINION.has(code)) return null;
  return TABLE[code] ?? null;
}

export const _internals = { TABLE, NO_OPINION };
