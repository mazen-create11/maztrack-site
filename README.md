# Maztrack

B2B prospecting for the French market, built on public registries.

- **Radar** (this repo): public demo at [maztrack.tech](https://maztrack.tech). A Cloudflare Worker reads the official company registry (recherche-entreprises.api.gouv.fr) and BODACC legal notices, scores the company with explicit rules, and asks Claude Opus 5.5 for a sourced brief and a first outreach email in a fixed JSON schema.
- **Engine** (private): local Node 22+ app in use since June 2026. Sources whole segments (NAF × department), adds France Travail hiring signals, applies GDPR exclusions, keeps everything in SQLite on the user's machine.

## Layout

```
index.html, app.js, styles.css   static site (GitHub Pages)
legal.html                       mentions légales, data handling (FR)
worker/                          Cloudflare Worker: registry.ts, bodacc.ts, scoring.ts, brief.ts, index.ts
```

## Run the worker locally

```
cd worker && npm install
npx wrangler secret put ANTHROPIC_API_KEY   # once
npm run dev
```

`GET /health`, `GET /lookup?q=`, `POST /brief {query, lang, senderContext}`. Quotas: 6 briefs per IP per day, 120 per day in total, both in KV with 25 h expiry. No query is stored.

## Author

Mazen Chaban, Aix-en-Provence. contact@maztrack.tech
