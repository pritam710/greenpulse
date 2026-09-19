# GreenPulse launch readiness

Review date: 19 September 2026  
Target submission: 27–28 September 2026  
Scope: SIH student demonstration for Problem Statement 26195

## Website launch checklist

| Item | Status | Evidence or decision |
| --- | --- | --- |
| Privacy policy | Ready for the student pilot | Names the owner, data collected, providers, AI processing, rights-request contact and real-deployment gaps. It is not a legal compliance certification. |
| Terms and conditions | Ready for the student pilot | Clearly says this is a demonstration, not an emergency or official municipal service. |
| Secrets kept off the frontend | Ready | Database and Gemini secrets are server-side environment variables. No secret is included in the built frontend. |
| HTTPS | Ready on the hosted demo | GitHub Pages and Render URLs use HTTPS. The API rejects a non-HTTPS production URL and sends HSTS. |
| Cookie consent | Not required for the current build | GreenPulse has no advertising or analytics cookies. It documents sessionStorage and the offline cache. Add opt-in consent before adding non-essential tracking. |
| Page titles and descriptions | Ready | Root and policy pages have descriptive titles. Open Graph and social-card metadata are present. |
| Social preview | Ready | A project-owned 1200 × 630 preview image is included. |
| Favicon and install metadata | Ready | SVG favicon and web app manifest are included. |
| Sitemap and robots.txt | Ready | Public root and policy URLs are listed. Private reports are never separate indexable URLs. |
| Image alternatives | Ready for current UI | Evidence images have contextual alternative text; decorative icons are hidden from assistive technology. |
| Image size | Ready for the demo | Photo inputs are validated and compressed in the browser. Classifier uploads are resized and bounded again by the API. |
| Initial load efficiency | Improved | Leaflet GIS code is loaded only when a map is opened. Main JavaScript decreased from 418.35 kB to 271.06 kB before compression. |
| Colour contrast | Improved | Action and status controls use darker green; muted card text no longer uses opacity that lowered contrast. |
| Mobile layout | Verified at 390 × 844 | No horizontal page overflow in the tested citizen screen. Responsive rules cover admin and field-worker layouts. |
| Custom 404 | Ready | The page explains that nothing was submitted and links safely back to GreenPulse. |
| Broken links | Checked in the local build | Policy, attribution, email and project navigation have real destinations. Recheck after every future URL change. |
| Form validation | Ready for the demo | Required fields, file types, sizes, text lengths, coordinates, consent and server-side schema validation are enforced. |
| Spam and abuse controls | Basic pilot protection | Per-IP and per-account throttles, role checks, request-size limits and duplicate transition checks exist. A public deployment still needs a shared rate limiter and abuse operations. |
| Analytics | Deliberately absent | No unsupported impact metrics or third-party analytics are collected. Add privacy-preserving measurement only with a documented purpose and consent decision. |
| Clear call to action | Ready | Citizen view opens first and presents “Report an issue” without making users browse a feature page. |

## Core demonstration workflows

- Citizen account, consent, geotagged report, optional photo and private status tracking.
- Optional AI-assisted segregation using up to three photos and a description. The assistant must abstain or request better evidence when confidence is insufficient. Its accuracy has not yet been measured on a representative local dataset.
- Administrator map and queue, assignment to registered field workers, evidence review and scale-based reward verification.
- Field-worker task list restricted to that worker, with inspection, cleaning, completion notes and proof photo.
- Owner-only staff creation and revocation. Revoking a field worker returns active tasks to Pending so the owner can reassign them while preserving the audit history.
- Citizen confirmation after administrator verification.

## Required limitations to say during judging

GreenPulse is ready for a controlled SIH demonstration, not a government production launch. Before public or municipal use it still needs an authorised operating organisation, ward or municipality data isolation, approved India-hosting and retention decisions, account recovery and verified contact channels, a shared rate limiter, independent security and WCAG accessibility testing, AI accuracy evaluation on local waste images, monitoring, backups, grievance handling and a measured field pilot.

Render's free web service can sleep after inactivity, so open the website and warm the API before the presentation. Free hosting is for demonstration only.

## Verification commands

```powershell
cd backend
.\.venv\Scripts\python.exe test_security.py -q

cd ..\frontend
npm run lint
npm run build
```

Current result: 25 backend tests passed; frontend lint and production build passed.
