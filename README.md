# GreenPulse — Main Source Repository

GreenPulse is a mobile-first waste and sanitation reporting platform led by **Pritam Rathod** for SIH 2026 Problem Statement 26195.

## Repository role

This lowercase **`greenpulse` repository is the main development repository and source of truth**. It is connected to the Antigravity workspace and contains:

- `frontend/` — React, Vite, PWA, citizen reporting, status tracking, GIS administration and field-team workflow.
- `backend/` — FastAPI, SQLAlchemy and SQLite API implementation.
- Project documentation, dependencies and source history.

Make product and code changes here. Do not manually edit compiled files in the deployment repository.

## Public demo

The compiled GitHub Pages copy is published from [`pritam710/Green-Pulse`](https://github.com/pritam710/Green-Pulse) at:

**https://pritam710.github.io/Green-Pulse/**

## Current prototype capabilities

- Instant photo, GPS, category and priority-based issue reporting.
- Offline-safe local reports and installable PWA behavior.
- Citizen-visible acknowledgement, inspection, cleaning and verification stages.
- GIS operations queue, severity SLAs and accountability log.
- Municipal field workflow and verification-based Eco-Points.
- Four-stream waste-segregation guidance.

Production government deployment will additionally require shared hosted persistence, secure role-based authentication, encrypted evidence storage and audited municipal integrations.
