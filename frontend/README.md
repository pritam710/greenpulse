# GreenPulse frontend

The GreenPulse citizen, administrator and field-worker interface uses React and Vite. The published student demonstration is built from this folder and copied to the separate `pritam710/Green-Pulse` GitHub Pages repository.

## Local development

```powershell
npm install
npm run dev
```

The local frontend expects the API at `http://127.0.0.1:8000`. Set `VITE_API_URL` only when testing another approved HTTPS API. Never put database credentials or AI keys in a `VITE_` variable because those values become public frontend code.

## Quality checks

```powershell
npm run lint
npm run build
```

The production build includes a restrictive browser security policy, offline public shell, project metadata, legal links and a custom 404 page. Private API responses are never added to the service-worker cache.

See the repository's `LAUNCH_READINESS.md`, `SECURITY.md` and `HOSTING.md` before deployment.
