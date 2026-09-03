# GreenPulse security hardening

## Status

Implemented and tested in the local `greenpulse` source repository. This does not
update the separate `Green-Pulse` GitHub Pages deployment automatically. No live
citizen data was used in the regression tests. This is a hardened pilot, not a
government security certification or an independent penetration test.

## Implemented controls

- Public registration creates Citizen accounts only. Staff are created from a
  trusted local operator console, not from a browser role selector.
- Salted scrypt passwords; random 256-bit bearer sessions stored as hashes in
  the database, expiring in eight hours by default; server-side logout revocation.
- Browser session tokens stay in memory, not localStorage or cookies. Reloading
  requires signing in again. Bearer-only authentication avoids cookie-based CSRF.
- Citizens can access only their own reports; field workers only assigned reports;
  administrators can review the operations queue. No client-supplied citizen ID.
- Validated state transitions, required completion photo and notes, authority
  verification, owner-only citizen confirmation, server-written audit history.
- Server-calculated scale rewards (0/10/20/30); transactional status checks prevent
  double-crediting. No balance/role/status supplied by the browser is trusted.
- Photos: JPEG/PNG/WebP, 2 MB input and stored limit, 16 megapixel limit, actual
  image decoding and re-encoding to remove metadata. Whole requests capped at 3 MB.
- Login, registration, submission, workflow and general request throttles.
- Explicit CORS origins, generic non-echoing validation/errors, no-store API
  responses, nosniff/frame protection, production HSTS and disabled API docs.
- Production frontend CSP, safe text map popups, public-shell-only offline cache.
- No new persistent local storage of photos, report status or rewards; no false
  offline-submission confirmation. Offline shells/guides remain available, but
  report submission and workflow actions require the server.
- Legacy database records are preserved. New account IDs skip orphan report
  citizen IDs so a signup cannot accidentally inherit historical reports.

## Local setup

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# Create your own backend/.env from .env.example; never commit .env.
.\.venv\Scripts\python.exe manage_user.py --role Admin
.\.venv\Scripts\python.exe manage_user.py --role Driver
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The operator commands prompt privately for passwords. No real staff account was
created by this patch. Existing unsafely hashed legacy accounts cannot sign in
through the new scrypt verifier; review/migrate them deliberately, not by bypass.
Citizens can create accounts using the UI. Email addresses are not verified yet;
do not describe the account as an identity-verified citizen.

From `frontend`, run `npm run dev`. Local default API: `http://127.0.0.1:8000`.
Use one Admin, one Driver and two Citizen accounts to rehearse access boundaries.

## Deployment gate

1. Choose and provision a persistent HTTPS backend, database, backups and private
   operator credentials. Do not expose the development server or SQLite file.
2. Set `ENVIRONMENT=production` and `ALLOWED_ORIGINS` to exact frontend origins,
   e.g. `https://pritam710.github.io` (origins do not include `/Green-Pulse/`).
3. Set `VITE_API_URL` to the HTTPS backend URL BEFORE `npm run build`. It is public
   configuration, not a secret. A hosted build without this setting fails closed.
4. Deploy frontend and backend together, test all three roles, and confirm the new
   service worker replaces the older version. Verify the hosting layer also sets
   frontend CSP/frame-ancestors, HSTS and nosniff HTTP headers. Meta CSP cannot
   enforce frame-ancestors; GitHub Pages has limited custom response headers.
5. Use a gateway/body timeout and a shared Redis/gateway rate limiter before using
   multiple workers. The included bounded limiter is per-process and resets on
   restart; configure trusted proxy IP handling explicitly (never trust arbitrary
   forwarded headers). Add monitoring and backup/restore drills.
6. Before collecting real citizen data: implement a retention/deletion process,
   privacy notice, email verification/recovery, staff MFA/SSO, jurisdiction scoping,
   encrypted storage, secure media storage and an independent security review.

The old browser demo's local records are not imported as trusted reports. Existing
browser storage is left untouched to avoid deleting user data. Users can clear
old site data through browser settings after saving any demo evidence they need.
Old GreenPulse response caches are replaced when the new service worker activates.
Map tiles are fetched from OpenStreetMap: the tile provider receives the browser's
IP address and requested map area. Do not claim entirely private or offline maps.

No TEE/private-inference claim is made. No historical-secret scan or dependency
vulnerability audit is claimed; these remain separate release checks. Rotate any
previously exposed credentials rather than merely removing them from source.

## Verification

```powershell
# backend (isolated temporary SQLite database, not data/greenpulse.db)
.\.venv\Scripts\python.exe -m pip install httpx
.\.venv\Scripts\python.exe -m unittest test_security -v
# frontend
npm run lint
npm run build
```

Coverage includes anonymous access, ownership, role injection, assigned-worker
access, workflow ordering, mandatory proof, fixed reward calculation, replay,
zero reward for no waste, session expiry/logout, login rate limits, invalid photos,
request limits, response redaction, CORS and legacy orphan ownership.

Browser smoke testing used a separate QA database: sign-in and authenticated
report submission were verified without changing the real project database.
