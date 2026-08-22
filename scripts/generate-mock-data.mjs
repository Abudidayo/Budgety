/**
 * Generate a UK/GBP dataset for Enable Banking's Mock ASPSP.
 *
 * Enable Banking has no UK coverage, so the demo runs against Mock ASPSP with
 * data we supply. This produces the exact JSON their control panel's
 * "Upload accounts data" form accepts.
 *
 *   node scripts/generate-mock-data.mjs > mock-accounts.json
 *
 * Deterministic: seeded PRNG, so re-running produces the same file and the
 * demo does not change under you.
 */

const DAYS = 90;
const SEED = 20260822;

/** mulberry32 — small, fast, good enough, and reproducible. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);

/**
 * Merchants with their real ISO 18245 MCCs, so the categoriser has genuine
 * signal to work with rather than only merchant-name substrings.
 * [descriptor, mcc, minPounds, maxPounds, perWeek]
 */
const MERCHANTS = [
  ['TESCO STORES 3428 LONDON GB', '5411', 8, 46, 2.2],
  ['SAINSBURYS S/MKT 0142 GB', '5411', 6, 38, 1.1],
  ['LIDL GB LONDON', '5411', 9, 32, 0.7],
  ['PRET A MANGER 421 LONDON GB', '5814', 3.2, 9.4, 2.0],
  ['COSTA COFFEE 8871 GB', '5814', 2.6, 6.1, 1.6],
  ['STARBUCKS 1290 LONDON', '5814', 3.1, 6.8, 0.8],
  ['GREGGS PLC 1183 GB', '5814', 2.2, 7.5, 1.2],
  ['NANDOS LONDON BRIDGE', '5812', 12, 31, 0.5],
  ['DELIVEROO LONDON GB', '5812', 11, 38, 0.9],
  ['WAGAMAMA SOUTHBANK GB', '5812', 16, 42, 0.3],
  ['TFL TRAVEL CHARGE GB', '4111', 2.8, 13.4, 2.6],
  ['TRAINLINE.COM LONDON', '4112', 9, 68, 0.4],
  ['UBER *TRIP HELP.UBER.COM', '4121', 6.2, 27, 0.7],
  ['NETFLIX.COM AMSTERDAM', '4899', 10.99, 10.99, 0.23],
  ['SPOTIFY P1A2B3C4D5 GB', '4899', 11.99, 11.99, 0.23],
  ['PUREGYM LTD LEEDS GB', '7997', 24.99, 24.99, 0.23],
  ['BOOTS 1094 LONDON GB', '5912', 4.2, 26, 0.5],
  ['SUPERDRUG STORES GB', '5912', 3.5, 18, 0.3],
  ['WATERSTONES 0281 GB', '5942', 8.5, 34, 0.3],
  ['UNIV OF LONDON UNION', '8220', 4, 28, 0.4],
  ['AMAZON.CO.UK*2H8KL LUX', '5399', 6.5, 74, 1.3],
  ['ARGOS RETAIL LONDON GB', '5399', 12, 88, 0.25],
  ['PRIMARK STORES 559 GB', '5651', 9, 52, 0.3],
  ['ASOS.COM LONDON GB', '5651', 18, 96, 0.25],
  ['THE ROYAL OAK LONDON', '5813', 8.4, 46, 0.7],
  ['BREWDOG SHOREDITCH GB', '5813', 11, 39, 0.4],
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const today = new Date(Date.UTC(2026, 7, 22));
const transactions = [];
let ref = 100000;

for (let dayOffset = DAYS; dayOffset >= 0; dayOffset -= 1) {
  const day = new Date(today);
  day.setUTCDate(day.getUTCDate() - dayOffset);
  const dow = day.getUTCDay();

  for (const [descriptor, mcc, lo, hi, perWeek] of MERCHANTS) {
    // Weekend lift for anything social; weekday lift for commuting.
    let rate = perWeek / 7;
    const social = mcc === '5813' || mcc === '5812';
    if (social && (dow === 5 || dow === 6)) rate *= 2.6;
    if (mcc === '4111' && dow >= 1 && dow <= 5) rate *= 1.5;
    if (mcc === '4111' && (dow === 0 || dow === 6)) rate *= 0.3;

    if (rand() > rate) continue;

    const amount = lo === hi ? lo : between(lo, hi);
    transactions.push({
      entry_reference: String(ref++),
      merchant_category_code: mcc,
      transaction_amount: { currency: 'GBP', amount: amount.toFixed(2) },
      creditor: { name: descriptor },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: iso(day),
      value_date: iso(day),
      transaction_date: iso(day),
      remittance_information: [descriptor],
    });
  }

  // Monthly salary on the 28th, plus a smaller mid-month freelance payment.
  const dom = day.getUTCDate();
  if (dom === 28) {
    transactions.push({
      entry_reference: String(ref++),
      transaction_amount: { currency: 'GBP', amount: '1842.60' },
      debtor: { name: 'NEXTVERSE LTD PAYROLL' },
      credit_debit_indicator: 'CRDT',
      status: 'BOOK',
      booking_date: iso(day),
      value_date: iso(day),
      remittance_information: ['SALARY AUG'],
    });
  }
  if (dom === 14) {
    transactions.push({
      entry_reference: String(ref++),
      transaction_amount: { currency: 'GBP', amount: between(180, 420).toFixed(2) },
      debtor: { name: 'FREELANCE INVOICE' },
      credit_debit_indicator: 'CRDT',
      status: 'BOOK',
      booking_date: iso(day),
      value_date: iso(day),
      remittance_information: ['INVOICE PAYMENT'],
    });
  }
}

// One deliberately unrecognisable merchant so "Needs review" is demonstrable.
transactions.push({
  entry_reference: String(ref++),
  transaction_amount: { currency: 'GBP', amount: '43.20' },
  creditor: { name: 'SQ *KL TRADING 8842' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: iso(new Date(Date.UTC(2026, 7, 19))),
  value_date: iso(new Date(Date.UTC(2026, 7, 19))),
  remittance_information: ['SQ *KL TRADING 8842'],
});

const spent = transactions
  .filter((t) => t.credit_debit_indicator === 'DBIT')
  .reduce((s, t) => s + Number(t.transaction_amount.amount), 0);
const earned = transactions
  .filter((t) => t.credit_debit_indicator === 'CRDT')
  .reduce((s, t) => s + Number(t.transaction_amount.amount), 0);
const balance = (earned - spent + 1200).toFixed(2);

const payload = {
  accounts: [
    {
      info: {
        name: 'Budgety Current',
        details: 'Personal current account',
        currency: 'GBP',
        cash_account_type: 'CACC',
        usage: 'PRIV',
        product: 'Everyday Current',
        account_id: { iban: null, other: { identification: '20000012345678', scheme_name: 'BBAN', issuer: null } },
        all_account_ids: [{ identification: '20000012345678', scheme_name: 'BBAN', issuer: null }],
      },
      balances: [
        {
          name: 'Available balance',
          balance_amount: { currency: 'GBP', amount: balance },
          balance_type: 'ITAV',
          reference_date: iso(today),
        },
        {
          name: 'Closing accounting balance',
          balance_amount: { currency: 'GBP', amount: balance },
          balance_type: 'CLBD',
          reference_date: iso(today),
        },
      ],
      transactions: transactions.sort((a, b) => (a.booking_date < b.booking_date ? 1 : -1)),
    },
  ],
};

process.stdout.write(JSON.stringify(payload, null, 1));
console.error(
  `generated ${transactions.length} transactions over ${DAYS} days | spent £${spent.toFixed(0)} | income £${earned.toFixed(0)} | balance £${balance}`,
);
