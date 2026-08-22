/**
 * Hand-labelled UK transactions used to measure the engine.
 *
 * These are also a ready-made shopping list for the Enable Banking Mock ASPSP
 * dataset — the adapter lane offered to write whatever merchants we need into
 * the mock institution, and these are the ones that exercise the interesting
 * paths: brand/MCC conflicts (Costa is 5814 fast food but is coffee), broad
 * merchants (Amazon), and merchants with no brand rule and no useful MCC.
 *
 * `expected` is the label a person would give. `hard: true` marks cases the
 * cold start is not expected to get right without a user correction — they are
 * measured separately rather than quietly excluded.
 */

/** @param {string} m @param {string} d @param {number} p @param {string|null} mcc @param {string} expected @param {boolean} [hard] */
const t = (m, d, p, mcc, expected, hard = false) => ({
  merchant: m,
  descriptor: d,
  amountPence: p,
  mcc,
  expected,
  hard,
});

export const LABELLED = [
  // --- coffee: the brand-vs-MCC conflict this engine exists to get right ----
  t('Costa Coffee', 'COSTA COFFEE 4412 LEEDS GB', -385, '5814', 'coffee'),
  t('Starbucks', 'STARBUCKS 1188 MANCHESTER GB', -450, '5814', 'coffee'),
  t('Caffe Nero', 'CAFFE NERO 0921 LONDON GB', -320, '5812', 'coffee'),
  t('Black Sheep Coffee', 'BLACK SHEEP COFFEE SHOREDITCH', -410, '5814', 'coffee'),
  t('Grind', 'GRIND COFFEE BAR LONDON GB', -395, '5814', 'coffee'),

  // --- eating out ----------------------------------------------------------
  t('Pret A Manger', 'PRET A MANGER 421 LONDON GB', -725, '5814', 'eating_out'),
  t('Greggs', 'GREGGS PLC 2210 NEWCASTLE', -290, '5814', 'eating_out'),
  t('Nandos', 'NANDOS CHICKENLAND 88 GB', -1450, '5812', 'eating_out'),
  t('Wagamama', 'WAGAMAMA LTD BRISTOL GB', -1680, '5812', 'eating_out'),
  t('Deliveroo', 'DELIVEROO LONDON GB', -2240, '5812', 'eating_out'),
  t('Uber Eats', 'UBER *EATS HELP.UBER.COM', -1830, '5812', 'eating_out'),
  t('McDonalds', 'MCDONALDS 4471 LEEDS GB', -680, '5814', 'eating_out'),
  t('Franco Manca', 'FRANCO MANCA 12 BRIXTON GB', -1290, '5812', 'eating_out'),
  t('Tortilla', 'TORTILLA 0043 LONDON GB', -890, '5814', 'eating_out'),

  // --- groceries -----------------------------------------------------------
  t('Tesco', 'TESCO STORES 3411 BRISTOL GB', -3245, '5411', 'groceries'),
  t('Sainsburys', 'SAINSBURYS S/MKT 0192 GB', -2870, '5411', 'groceries'),
  t('Aldi', 'ALDI 88 MANCHESTER GB', -1940, '5411', 'groceries'),
  t('Lidl', 'LIDL GB LONDON', -2210, '5411', 'groceries'),
  t('Co-op', 'CO OP GROUP 4412 LEEDS', -1120, '5411', 'groceries'),
  t('Waitrose', 'WAITROSE AND PARTNERS 421', -3680, '5411', 'groceries'),
  t('Sainsburys Local', 'SAINSBURYS LOCAL 2210 GB', -640, '5499', 'groceries'),

  // --- nights out ----------------------------------------------------------
  t('Wetherspoons', 'JD WETHERSPOON 8842 LEEDS', -1840, '5813', 'nights_out'),
  t('BrewDog', 'BREWDOG BARS LTD GB', -2260, '5813', 'nights_out'),
  t('Odeon', 'ODEON CINEMAS 0412 GB', -1290, '7832', 'nights_out'),
  t('Ticketmaster', 'TICKETMASTER UK LTD', -4850, '7922', 'nights_out'),
  t('Dice', 'DICE FM LONDON GB', -1750, '7929', 'nights_out'),
  t('The Crown', 'THE CROWN TAVERN LONDON', -1620, '5813', 'nights_out'),

  // --- transport -----------------------------------------------------------
  t('TfL', 'TFL TRAVEL CH TFL.GOV.UK/CP', -580, '4111', 'transport'),
  t('Trainline', 'TRAINLINE.COM LONDON GB', -3420, '4112', 'transport'),
  t('Uber', 'UBER *TRIP HELP.UBER.COM', -1140, '4121', 'transport'),
  t('LNER', 'LNER YORK GB', -5620, '4112', 'transport'),
  t('National Express', 'NATIONAL EXPRESS BIRMINGHAM', -1900, '4131', 'transport'),
  t('Shell', 'SHELL 4412 A1 SOUTHBOUND', -4820, '5541', 'transport'),
  t('Lime', 'LIME *RIDE LONDON GB', -420, '4789', 'transport'),

  // --- shopping ------------------------------------------------------------
  t('Amazon', 'AMZNMktplace AMAZON.CO.UK', -1899, '5999', 'shopping'),
  t('Argos', 'ARGOS LTD 4412 GB', -2499, '5311', 'shopping'),
  t('Primark', 'PRIMARK 0088 MANCHESTER', -1750, '5651', 'shopping'),
  t('ASOS', 'ASOS.COM LONDON GB', -4320, '5651', 'shopping'),
  t('IKEA', 'IKEA LTD WEMBLEY GB', -6740, '5712', 'shopping'),
  t('Vinted', 'VINTED LT VILNIUS', -1280, '5999', 'shopping'),
  t('Currys', 'CURRYS 4102 LEEDS GB', -8990, '5732', 'shopping'),

  // --- subscriptions -------------------------------------------------------
  t('Netflix', 'NETFLIX.COM AMSTERDAM', -1099, '5815', 'subscriptions'),
  t('Spotify', 'SPOTIFY P1A2B3C4 STOCKHOLM', -1199, '5815', 'subscriptions'),
  t('Amazon Prime', 'AMAZON PRIME*MK4TZ LUXEMBOURG', -899, '5968', 'subscriptions'),
  t('Giffgaff', 'GIFFGAFF LTD LONDON GB', -1000, '4814', 'subscriptions'),
  t('Adobe', 'ADOBE SYSTEMS DUBLIN IE', -1998, '5817', 'subscriptions'),
  t('Apple', 'APPLE.COM/BILL CORK IE', -299, '5818', 'subscriptions'),
  t('Disney Plus', 'DISNEY PLUS LONDON GB', -799, '5815', 'subscriptions'),

  // --- health --------------------------------------------------------------
  t('Boots', 'BOOTS 4412 LEEDS GB', -1240, '5912', 'health'),
  t('PureGym', 'PUREGYM LTD LEEDS GB', -2499, '7941', 'health'),
  t('Superdrug', 'SUPERDRUG STORES 0921', -890, '5912', 'health'),
  t('Specsavers', 'SPECSAVERS OPTICAL 8842', -4500, '8043', 'health'),
  t('Holland & Barrett', 'HOLLAND AND BARRETT 210', -1650, '5499', 'health', true),

  // --- uni -----------------------------------------------------------------
  t('University of Leeds', 'UNIVERSITY OF LEEDS GB', -14000, '8220', 'uni'),
  t('Blackwells', 'BLACKWELLS OXFORD GB', -3450, '5942', 'uni'),
  t('Leeds Students Union', 'LEEDS STUDENTS UNION GB', -890, '8220', 'uni'),
  t('Ryman', 'RYMAN STATIONERY 4412', -1240, '5943', 'uni'),
  t('Overleaf', 'OVERLEAF LONDON GB', -1400, '5817', 'uni', true),

  // --- no brand rule, MCC is the only signal -------------------------------
  t('Zorbix', 'ZORBIX LTD 8891 LONDON GB', -1420, '5411', 'groceries'),
  t('Harlow & Vine', 'HARLOW AND VINE 0021 GB', -2680, '5812', 'eating_out'),
  t('Kestrel Motors', 'KESTREL MOTORS 4412 GB', -3900, '5541', 'transport'),

  // --- genuinely unknowable at cold start ----------------------------------
  t('Riverside Studios', 'RIVERSIDE STUDIOS 88 GB', -2200, null, 'nights_out', true),
  t('J Whitfield', 'J WHITFIELD 0042 GB', -1500, null, 'shopping', true),
];

/** Turn a fixture row into a CategorisationInput. */
export function toInput(row, i, { date = '2026-08-14', accountId = 'mock:acc-1' } = {}) {
  const parts = [row.merchant, row.descriptor];
  if (row.mcc) parts.push(`mcc:${row.mcc}`);
  return {
    id: `${accountId}:fx-${i}`,
    text: parts.join(' | '),
    merchant: row.merchant,
    descriptor: row.descriptor,
    amountPence: row.amountPence,
    currency: 'GBP',
    date,
    kind: 'spend',
    mcc: row.mcc,
    bankTransactionCode: null,
    accountId,
  };
}

/**
 * Held-out set for the embedding half of the engine.
 *
 * Every merchant here is invented, so no brand rule can fire, and the MCC is
 * either absent or deliberately unhelpful — so neither cold-start prior can
 * carry it. The only route to a correct answer is a past correction on a
 * *differently worded* descriptor for the same merchant, which is exactly the
 * kNN path. `train` and `test` never collapse to the same merchantKey, so the
 * exact-match shortcut cannot claim the credit.
 *
 * If accuracy here is at chance, the embedder is decoration.
 */
export const GENERALISATION = [
  {
    expected: 'groceries',
    train: { merchant: 'Marbury Food Market', descriptor: 'MARBURY FOOD MARKET 42 GB', mcc: '5411' },
    test: { merchant: 'Marbury Food Mkt', descriptor: 'MARBURY FOOD MKT LTD 9981 YORK', mcc: null },
  },
  {
    expected: 'coffee',
    train: { merchant: 'Thistle & Bean', descriptor: 'THISTLE AND BEAN 0021 GB', mcc: '5814' },
    test: { merchant: 'Thistle Bean Roasthouse', descriptor: 'THISTLE BEAN ROASTHOUSE 4471 EDIN', mcc: null },
  },
  {
    expected: 'nights_out',
    train: { merchant: 'The Copper Vault', descriptor: 'THE COPPER VAULT 88 GB', mcc: '5813' },
    test: { merchant: 'Copper Vault Rooms', descriptor: 'COPPER VAULT ROOMS 1204 LEEDS', mcc: null },
  },
  {
    expected: 'uni',
    train: { merchant: 'Penfold Academic', descriptor: 'PENFOLD ACADEMIC SUPPLIES GB', mcc: '5943' },
    test: { merchant: 'Penfold Academic Sup', descriptor: 'PENFOLD ACADEMIC SUP 0042', mcc: null },
  },
  {
    expected: 'transport',
    train: { merchant: 'Halden Coaches', descriptor: 'HALDEN COACHES 4412 GB', mcc: '4131' },
    test: { merchant: 'Halden Coach Co', descriptor: 'HALDEN COACH CO LTD 88 HULL', mcc: null },
  },
  {
    expected: 'health',
    train: { merchant: 'Ashgrove Wellbeing', descriptor: 'ASHGROVE WELLBEING 210 GB', mcc: '8011' },
    test: { merchant: 'Ashgrove Wellbeing C', descriptor: 'ASHGROVE WELLBEING C 0092 BATH', mcc: null },
  },
  {
    // Personal quirk: this user files their corner shop as uni supplies. No
    // rule or MCC could ever know that — only the correction can.
    expected: 'uni',
    train: { merchant: 'Kestrel Print Room', descriptor: 'KESTREL PRINT ROOM 42 GB', mcc: '5999' },
    test: { merchant: 'Kestrel Print Rm', descriptor: 'KESTREL PRINT RM 8891 GB', mcc: '5999' },
  },
  {
    expected: 'subscriptions',
    train: { merchant: 'Loomlight Media', descriptor: 'LOOMLIGHT MEDIA MONTHLY GB', mcc: '5968' },
    test: { merchant: 'Loomlight Media Grp', descriptor: 'LOOMLIGHT MEDIA GRP 0012', mcc: null },
  },
  {
    expected: 'shopping',
    train: { merchant: 'Verity Home Store', descriptor: 'VERITY HOME STORE 3311 GB', mcc: '5712' },
    test: { merchant: 'Verity Homeware', descriptor: 'VERITY HOMEWARE 4402 DERBY', mcc: null },
  },
  {
    expected: 'eating_out',
    train: { merchant: 'Ottermill Kitchen', descriptor: 'OTTERMILL KITCHEN 22 GB', mcc: '5812' },
    test: { merchant: 'Ottermill Ktchn', descriptor: 'OTTERMILL KTCHN 0088 EXETER', mcc: null },
  },
];
