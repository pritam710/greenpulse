# GreenPulse — Main Source Repository

GreenPulse is a mobile-first waste and sanitation reporting platform led by **Pritam Rathod** for SIH 2026 Problem Statement 26195.

## Repository role

This lowercase **`greenpulse` repository is the main development repository and source of truth**. It is connected to the Antigravity workspace and contains:

- `frontend/` — React, Vite, PWA, citizen reporting, status tracking, GIS administration and field-team workflow.
- `backend/` — FastAPI and SQLAlchemy API, using SQLite locally and PostgreSQL on the hosted pilot.
- Project documentation, dependencies and source history.

Make product and code changes here. Do not manually edit compiled files in the deployment repository.

## Public demo

The compiled GitHub Pages copy is published from [`pritam710/Green-Pulse`](https://github.com/pritam710/Green-Pulse) at:

**https://pritam710.github.io/Green-Pulse/**

## Current prototype capabilities

- Instant photo, GPS, category and priority-based issue reporting.
- Installable PWA shell; submitting reports and reading private status still require the secure API.
- Citizen-visible acknowledgement, inspection, cleaning and verification stages.
- GIS operations queue, clearly labelled pilot response targets and an accountability log.
- Municipal field workflow and verification-based Eco-Points.
- Four-stream guidance aligned to India's Solid Waste Management Rules, 2026.
- Optional AI-assisted identification from one to three photos, with uncertainty handling, citizen correction and safe-bin guidance.

The AI assistant is disabled unless the backend has a server-side `GEMINI_API_KEY`. Copy `backend/.env.example` to `backend/.env` for local development and set the key there; never place it in frontend code or commit it. The hosted service must receive the same secret through Render's Environment settings. `GEMINI_MODEL` defaults to `gemini-3.6-flash`.

Classifier photos are resized in the browser, stripped of metadata by the backend, processed only after explicit consent and are not intentionally persisted by GreenPulse. Use non-sensitive demonstration photos with an unpaid API tier. A real public pilot should use approved paid processing terms, documented retention controls and an institutional privacy review.

Production government deployment will additionally require authorised ownership, Indian public-sector hosting and procurement review, encrypted object storage, a shared rate limiter, independent security/accessibility testing, retention and grievance procedures, measurable model validation with human oversight, and audited municipal integrations.

The current launch checklist, verified demo scope and remaining public-sector blockers are documented in [`LAUNCH_READINESS.md`](LAUNCH_READINESS.md).

## Verification

```powershell
cd backend
.\.venv\Scripts\python.exe test_security.py -q

cd ..\frontend
npm run lint
npm run build
```
