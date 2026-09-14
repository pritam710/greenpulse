# GreenPulse pilot hosting

Current live architecture (verified 14 September 2026):

- Citizen website: https://pritam710.github.io/Green-Pulse/
- HTTPS API: https://greenpulse-api-o5a2.onrender.com
- Frontend hosting: GitHub Pages
- Backend hosting: Render Free web service (`greenpulse-api`)
- Primary database: Neon Free PostgreSQL
- Deployment source: https://github.com/pritam710/greenpulse

The live API now uses the imported Neon database. Existing users, reports,
workflow history, consent records, sessions and audit events were migrated and
verified. The old Render database (`greenpulse-pilot-db`) is no longer the live
data source. It remains private and temporarily retained only as a rollback copy.

## Configuration rules

- `DATABASE_URL` is a private Render environment variable and must contain the
  pooled Neon PostgreSQL connection URL.
- Never commit, screenshot, paste into chat, or share a database connection URL,
  password, API key, or session token.
- `render.yaml` deliberately marks `DATABASE_URL` as `sync: false`. A trusted
  owner must enter it privately in Render; Blueprint sync must not replace it.
- `GEMINI_API_KEY` is also a private `sync: false` value. The AI assistant is not
  ready for a demo until this key is configured and one real classification has
  succeeded without exposing the key or test image.
- Production refuses to start with the local SQLite database. SQLite remains the
  default only for local development and automated tests.
- Keep the old Render database blocked from public network access. Do not reopen
  `0.0.0.0/0` except for a short, supervised migration, and remove it immediately
  afterward.
- Do not delete the old Render database until the Neon deployment has been
  tested for an agreed rollback period and a fresh backup exists.

## Verified cutover checks

- API root responds successfully over HTTPS.
- The production API starts against Neon without a database connection error.
- Authentication rejects invalid sessions correctly.
- GitHub Pages is allowed by CORS for `GET`, `POST`, `PATCH`, and `DELETE`.
- The citizen website, reporting entry point, legal links, and AI Segregation
  Assistant interface load from the public GitHub Pages URL. This does not by
  itself prove that the external Gemini classification call is configured.
- Migrated table counts were checked for users, reports, workflows, consent,
  audit events, sessions, bins, and work orders.

## Deploying an update

1. Review and test changes in the `pritam710/greenpulse` source repository.
2. Push the reviewed commit to `main`. Render deploys the Python backend from
   this repository using `backend/requirements-hosting.txt`.
3. If Render requests `DATABASE_URL`, copy the pooled Neon URL directly from the
   Neon Connect dialog and enter it privately. Do not use a masked or line-wrapped
   value.
4. Confirm that the private `GEMINI_API_KEY` still exists in Render. Never reveal
   it in logs or screenshots. Run one classification with a harmless demo image;
   if it fails, label AI classification unavailable rather than simulating a result.
5. Confirm the Render deployment says the service is live, then check the API
   root, sign-in, own-report listing, admin authorization, and CORS behavior.
6. Build the frontend with `VITE_API_URL=https://greenpulse-api-o5a2.onrender.com`
   and publish `frontend/dist` to the separate `pritam710/Green-Pulse` Pages
   repository only after the end-to-end checks pass.
7. Test with separate Citizen, Administrator, and Field Worker accounts. Use
   demonstration data only for presentations.

## Rollback plan

If Neon has a confirmed outage or migration defect:

1. Put the API into maintenance/read-only mode, or stop it, so no production
   writes can reach either database during the rollback.
2. Export the current Neon data and record the latest report, workflow, consent,
   and audit-event IDs and timestamps.
3. Confirm the old Render database is intact, then reconcile every record created
   or changed in Neon after the original cutover. Do not silently discard them.
4. A trusted owner may privately change Render's `DATABASE_URL` back to the old
   database's internal URL and redeploy the API.
5. Run the same authentication, report-count, authorization, and CORS checks
   before allowing writes again.
6. Document which database accepted the latest writes before attempting another
   cutover.

Never run both databases as independent writable production sources. Do not
delete either copy while a rollback or reconciliation is still possible.

## Free-plan limitations

- Render Free web services can sleep when idle, so the first request may be slow.
  Open the app and complete a test sign-in before a live demonstration.
- Neon Free has compute, storage, transfer, and history limits. Monitor usage and
  export backups before relying on the pilot for larger or real deployments.
- The old Render Free PostgreSQL database is scheduled to expire in October 2026.
  It is a temporary rollback copy, not permanent storage.
- Before intentionally deleting or allowing that old database to expire, remove
  its `databases:` resource from `render.yaml` and review the Blueprint change so
  future syncs cannot retain or recreate an obsolete managed database.
- No purchase or paid plan is authorized by this document.

## Production-readiness boundary

This deployment is a student pilot, not an official government service. Before
real municipal use it requires an approved data controller, operational support,
retention and deletion procedures, incident response, backups and restoration
drills, monitoring, a privacy/legal review, staff identity management, and a
formal security assessment.

Security controls and release limitations are documented in `SECURITY.md`.
