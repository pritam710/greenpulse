import './legal.css';

const EFFECTIVE = '6 September 2026';

const pages = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'This policy explains how the GreenPulse student pilot handles information when you create an account, report a waste or sanitation issue, or use the map.',
    sections: [
      ['Who operates this pilot', <p key="operator">GreenPulse is a student project owned and led by <strong>Pritam Rathod</strong> in Maharashtra, India. It is not an official Government of India or municipal website. Contact the project owner at <a href="mailto:pritamratho710@gmail.com">pritamratho710@gmail.com</a>. Do not send passwords, identity documents, precise home locations, or other unnecessary sensitive information by email.</p>],
      ['Information we collect', <ul key="collect"><li>Account name, email address, password hash, role, and session records.</li><li>Report category, description, priority, coordinates, optional evidence photo, timestamps, status, and verification records.</li><li>Worker completion notes and required completion evidence when the staff workflow is used.</li><li>Technical security information that our hosting providers may log, such as IP address, request time, browser details, and error records.</li></ul>],
      ['Why we use it', <p key="why">We use this information to create and secure accounts, receive and display reports, assign and track work, verify outcomes, calculate pilot reward points, prevent abuse, diagnose failures, and demonstrate the prototype.</p>],
      ['Data minimisation', <p key="minimum">The report form asks only for information needed to locate and understand an issue. A photo is optional for citizen reports. Avoid names, faces, number plates, home interiors, identity documents, and unrelated people. Use demonstration data only during the student pilot.</p>],
      ['Location and camera', <p key="sensors">Your browser asks permission before sharing location or opening the camera. You may enter coordinates manually. GreenPulse does not continuously track your device. Location attached to a submitted report is intentionally retained with that report.</p>],
      ['Who receives information', <p key="share">Authorised administrators and assigned field workers may receive report details needed for the workflow. The frontend is hosted by GitHub Pages, the API and pilot database are hosted by Render, and maps use OpenStreetMap tiles. Those providers may process technical connection information under their own terms. We do not sell personal data.</p>],
      ['International hosting', <p key="hosting">The current pilot infrastructure may process or store information outside India, including in Render's Singapore region. Do not use this pilot for sensitive or official government data until an authorised organisation has completed a hosting, security, retention, and legal review.</p>],
      ['Retention and deletion', <p key="retention">The student pilot does not yet provide self-service account deletion or a formally approved retention schedule. This is a deployment blocker for real public use. For a test-data deletion request, email <a href="mailto:pritamratho710@gmail.com">pritamratho710@gmail.com</a> from the address connected to the test account. The project owner will verify the request privately before acting.</p>],
      ['Security', <p key="security">We use HTTPS, hashed passwords, expiring server-side sessions, role checks, input limits, and restricted report access. No internet service is risk free. This prototype has not received an independent penetration test or government security certification.</p>],
      ['Your choices', <p key="choices">You can refuse camera or location permission, omit an optional citizen photo, avoid creating an account, and stop using the pilot. Some core functions cannot work without an account and an accurate report location.</p>],
      ['Children', <p key="children">This pilot is not designed for independent use by children. A school or public rollout involving anyone under 18 requires an age-appropriate process and verifiable parental or lawful guardian consent where applicable.</p>],
      ['Legal readiness', <p key="law">The team is preparing for India's Digital Personal Data Protection framework as its provisions commence in phases. These statements do not claim compliance certification. A real deployment requires a named grievance contact, approved notices, rights-request procedures, retention controls, incident response, and legal review.</p>],
    ],
  },
  terms: {
    title: 'Terms and Conditions',
    intro: 'These terms apply to the GreenPulse student demonstration. By creating an account or submitting a report, you agree to use the pilot responsibly.',
    sections: [
      ['Pilot status', <p key="pilot">GreenPulse is an educational prototype, not an emergency service, official municipal complaint channel, government endorsement, or promise that waste will be collected. For urgent danger, contact the appropriate local emergency or municipal service.</p>],
      ['Permitted use', <p key="permitted">Submit accurate, relevant information about waste or sanitation issues. Use only content you created or have permission to share. Do not upload faces, number plates, identity documents, confidential information, unlawful material, malware, or content that infringes another person's rights.</p>],
      ['Prohibited conduct', <ul key="prohibited"><li>No false, abusive, duplicate, automated, or fraudulent reports.</li><li>No attempt to access another person's report or a staff account.</li><li>No interference with the service, security testing without written permission, or excessive automated requests.</li><li>No use of points or demonstration vouchers as money or proof of entitlement.</li></ul>],
      ['Reports and moderation', <p key="moderation">The team may restrict or remove test content that is unsafe, unlawful, irrelevant, duplicated, or inconsistent with the pilot. Status labels and response targets are demonstration workflow information, not guaranteed service levels.</p>],
      ['Intellectual property', <p key="ip">GreenPulse source code is offered under the licence published in its source repository. The GreenPulse name, original interface text, and project materials remain subject to their applicable rights. OpenStreetMap data and tiles are credited to OpenStreetMap contributors. User-submitted content remains the user's responsibility; the user grants the pilot a limited permission to process and display it for the report workflow.</p>],
      ['Availability and changes', <p key="availability">The free pilot may be unavailable, delayed, reset, or discontinued. Features, policies, reward rules, and test data may change. Material policy changes should be shown with a new effective date.</p>],
      ['No professional advice', <p key="advice">Segregation guidance is general educational information and must be adapted to local collection rules. It is not legal, medical, environmental, or safety advice.</p>],
      ['Liability boundary', <p key="liability">To the extent permitted by applicable law, the student team does not promise uninterrupted operation, municipal action, classification accuracy, route accuracy, or a particular environmental result. Nothing in these terms excludes rights or liabilities that cannot legally be excluded.</p>],
      ['Governing context', <p key="governing">This pilot is operated from Maharashtra, India. Any real institutional deployment needs organisation-specific terms, authorised contact details, grievance handling, and review by qualified Indian counsel.</p>],
    ],
  },
  cookies: {
    title: 'Cookie and Storage Policy',
    intro: 'GreenPulse does not currently set advertising, analytics, preference, or authentication cookies.',
    sections: [
      ['Cookie consent', <p key="consent">Because this version does not use non-essential cookies or tracking technologies, it does not show a cookie-consent banner. A banner would be required before any optional analytics, advertising, cross-site tracking, or similar storage is enabled where consent is the chosen lawful basis.</p>],
      ['Session handling', <p key="session">The sign-in token is held only in browser memory. It is not written to cookies, localStorage, or sessionStorage, and a page reload ends the browser session.</p>],
      ['Offline cache', <p key="cache">A service worker may store public application files in the browser Cache API so previously loaded screens can open more reliably. Private API responses, account data, submitted reports, and photos are not intentionally stored in that cache. You can clear site data through your browser settings.</p>],
      ['Third-party connections', <p key="third">OpenStreetMap tile servers receive requests needed to draw maps and may see technical data such as your IP address and requested map area. GitHub Pages and Render may keep their own operational and security logs. GreenPulse does not control those providers' cookies or logs.</p>],
      ['Future changes', <p key="future">Before adding analytics or any non-essential storage, the team must update this policy, document the provider and purpose, configure privacy-protective defaults, and add a genuine opt-in control where required. Refusing optional tracking must not block reporting.</p>],
    ],
  },
  refunds: {
    title: 'Refund Policy',
    intro: 'GreenPulse does not currently sell products, subscriptions, vouchers, or paid services through this website.',
    sections: [
      ['No payments accepted', <p key="payments">The website has no checkout, payment processor, subscription, or purchase flow. Eco-Points and displayed vouchers are pilot demonstrations and have no cash value. Therefore, no payment can presently be charged or refunded through GreenPulse.</p>],
      ['Unexpected payment request', <p key="unexpected">Do not pay anyone claiming to collect money through this pilot. If you encounter a payment request presented as GreenPulse, stop and report it through the project issue tracker without sharing financial information publicly.</p>],
      ['Future commercial service', <p key="commercial">If payments are introduced later, the responsible legal entity must publish price, cancellation, delivery, grievance, and refund terms before accepting payment and must comply with applicable consumer and payment rules.</p>],
    ],
  },
};

const policyLinks = [
  ['privacy', 'Privacy'],
  ['terms', 'Terms'],
  ['cookies', 'Cookies and storage'],
  ['refunds', 'Refunds'],
];

export function LegalFooter({ onOpen }) {
  return <footer className="legal-footer" aria-label="Legal and project information">
    <p><strong>GreenPulse student pilot</strong> · Led by Pritam Rathod · Maharashtra, India · Not an official government service</p>
    <nav aria-label="Legal policies">{policyLinks.map(([id, label]) => <button key={id} type="button" onClick={() => onOpen(id)}>{label}</button>)}</nav>
    <p>Maps © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
  </footer>;
}

export function LegalPage({ page, onBack }) {
  const content = pages[page] || pages.privacy;
  return <main className="legal-page" id="main-content">
    <a className="skip" href="#policy-content">Skip to policy</a>
    <header><button type="button" onClick={onBack}>Back to GreenPulse</button><p>GreenPulse student pilot</p></header>
    <article id="policy-content">
      <h1>{content.title}</h1>
      <p className="effective">Effective {EFFECTIVE}</p>
      <p className="policy-intro">{content.intro}</p>
      {content.sections.map(([heading, body]) => <section key={heading}><h2>{heading}</h2>{body}</section>)}
    </article>
    <LegalFooter onOpen={(id) => { window.history.replaceState({}, '', `?policy=${id}`); window.location.reload(); }} />
  </main>;
}
