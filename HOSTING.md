# Free presentation hosting

Deployed on 4 September 2026 using the Free plans. No local database was uploaded.

- Citizen website: https://pritam710.github.io/Green-Pulse/
- HTTPS backend: https://greenpulse-api-o5a2.onrender.com
- Render Blueprint: GreenPulse SIH Pilot
- Render web service: greenpulse-api
- Render database: greenpulse-pilot-db (private network access configured)

Hosted checks passed: root health, citizen registration/login, own-report listing,
anonymous and admin-access rejection, logout revocation, and disabled Swagger docs.
One synthetic deployment-check citizen account exists, with no reports.
Real Administrator and Driver accounts still need trusted operator provisioning;
no default password or public administrator registration has been introduced.

The root render.yaml defines a free Python backend and a private PostgreSQL
database on Render. SQLite remains the local development default. No local
database, photos, accounts or secret environment files are uploaded by this plan.

Important limits from https://render.com/docs/free:
- Free web services sleep after 15 minutes without traffic; the first request
  after sleep takes longer. Open and test the app before presenting.
- Free PostgreSQL expires after 30 days. Export before expiry or arrange permanent
  hosting. This is not an indefinite free production deployment.
- No purchase or paid plan is authorized. Stop if billing details or an upgrade
  are required.

Deployment procedure (completed through frontend publication; staff provisioning remains):
1. Sign in to https://dashboard.render.com/ and authorize access only to the
   pritam710/greenpulse repository when requested.
2. Publish the reviewed source and create a Blueprint from render.yaml. Verify
   BOTH compute plans show Free before deployment.
3. Keep the database private. Provision real staff accounts through a trusted
   operator process; do not expose a bootstrap endpoint or default credentials.
   The free-service shell restrictions may require temporary operator-only DB
   access for running backend/manage_user.py, with that access removed afterward.
4. After backend health and authentication pass, build the frontend with
   VITE_API_URL set to the actual HTTPS service URL. Publish to the separate
   Green-Pulse Pages repository only after end-to-end verification.
5. Rehearse using separate Citizen/Admin/Driver accounts and record screenshots
   as a backup. Do not collect real citizen data for this presentation pilot.

To reproduce the frontend build, set VITE_API_URL to the HTTPS backend above before
running npm run build. Publish frontend/dist to the Green-Pulse Pages repository.

Reference: https://render.com/docs/blueprint-spec
Security controls and release limitations: SECURITY.md
