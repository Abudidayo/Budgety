/**
 * Privacy and terms.
 *
 * These are not decoration: Enable Banking's production application
 * registration requires both URLs, and they are registered against this app's
 * /privacy and /terms paths. If these routes stop resolving, the registration
 * points at nothing.
 */
const CONTACT = 'abdullahalshamam@gmail.com';

export function PrivacyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy</h1>
      <p>
        Budgety shows you where your money went. To do that it reads account and
        transaction information from a bank you explicitly connect.
      </p>
      <h2>What we access</h2>
      <ul>
        <li>Your account name, currency and balance.</li>
        <li>Up to 90 days of transactions: date, amount, and the merchant description.</li>
      </ul>
      <h2>What we never do</h2>
      <ul>
        <li>We never see or store your bank login details. Authentication happens with your bank.</li>
        <li>We cannot move money. Access is read-only.</li>
        <li>We do not sell your data or share it with advertisers.</li>
      </ul>
      <h2>What we store</h2>
      <p>
        A reference to your bank consent, and any category corrections you make so
        the app learns your spending. You can remove both at any time by
        disconnecting your bank in Settings.
      </p>
      <h2>Contact</h2>
      <p>Data protection enquiries: <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
    </main>
  );
}

export function TermsPage() {
  return (
    <main className="legal-page">
      <h1>Terms of service</h1>
      <p>
        Budgety is a personal budgeting tool. By connecting a bank account you
        allow Budgety to read account information in order to categorise and
        summarise your spending.
      </p>
      <h2>What Budgety is not</h2>
      <p>
        Budgety does not provide financial, investment or tax advice. Categories
        and summaries are automated estimates and may be wrong — always check
        your bank statement for anything that matters.
      </p>
      <h2>Access</h2>
      <p>
        Access is read-only and lasts until the consent you granted at your bank
        expires, or until you disconnect in Settings, whichever comes first.
      </p>
      <h2>Availability</h2>
      <p>
        Budgety depends on your bank's open banking interface. If your bank is
        unavailable, some data may be missing or out of date.
      </p>
      <h2>Contact</h2>
      <p><a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
    </main>
  );
}
