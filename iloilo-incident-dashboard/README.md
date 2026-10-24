# iLONGGO

**Barangay Incident Reporting and Spatial Intelligence**

**Research Prototype · Local development only · Not deployed**

Full name: **Iloilo Localized Online Network for Gathering Geotagged Occurrences**.

iLONGGO is a barangay-level platform for reporting, monitoring, and spatial
analysis of incidents in Iloilo City. In this application, **“geotagged” means
tagged to a barangay administrative area**, not an exact GPS point, address,
household location, or live user location. No government adoption or endorsement
is implied. This is not an official government or emergency dispatch service.

> iLONGGO is a research prototype and is not an emergency service. For an
> immediate threat to life or safety, contact the appropriate emergency authority.

## Quick start on macOS

Use supported Node.js **22.22.2+ within v22, 24.15+ within v24, or v26+**, with npm.
Verification used Node v24.22.1 and npm 11.19.1. Homebrew is not required.

From the repository root:

```sh
cd iloilo-incident-dashboard
npm ci
```

For a new checkout only, copy the local environment template. Do not overwrite an
existing `.dev.vars` file:

```sh
cp -n .dev.vars.example .dev.vars
```

To enable **Local Demo Review**, explicitly edit the ignored `.dev.vars` file:

```dotenv
APP_ENV=development
ENABLE_DEV_REVIEW=true
```

The template defaults review to `false`. This working local environment has it
explicitly enabled. No passwords, real secrets, remote database IDs, account
login, or Cloudflare account are needed.

Apply versioned migrations **only locally**, then start the complete application:

```sh
npm run db:migrate:local
npm run start:local
```

`start:local` builds the frontend and starts Wrangler in local mode on loopback.
Keep that terminal running. In another terminal:

```sh
open http://127.0.0.1:8787
```

The approved Phase 2.5 dark/lime shell, original mark, floating panels, responsive
navigation, map canvas, keyboard dialogs, and interpretation notices are retained.
The internal folder/package/Worker name remains `iloilo-incident-dashboard`.

### Optional frontend hot reload

After an initial build, use two terminals from the app folder:

```sh
npm run dev:worker
```

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Worker at port 8787.
Do not start a second Worker on an already occupied port. `npm run preview` serves
frontend assets only and is not a full-stack preview.

## Demonstrate the working workflow

1. Open Overview or Public Map; actual Iloilo City barangay geography loads.
2. Choose **Report an Incident**. Select barangay, category, severity, occurrence
   date/time in **Asia/Manila**, and optionally a non-sensitive description.
3. Confirm the privacy/location acknowledgement and submit. Save the public
   reference (`ILO-YYYYMMDD-` plus 96 random bits). The report is **Submitted** and
   **private**, not public. Internal IDs are not returned to the reporting form.
4. Open **Local Demo Review** (marked local-only). Inspect the report and choose
   **Start review** → **Verify and publish**, confirming publication.
5. Return to Overview. Published totals and the barangay count/color update from
   D1. Category/severity filters affect all aggregate lists and map colors.
6. In review, move Verified → Responding → Resolved (confirm resolution).
7. Reject a different Submitted/Under Review report (confirm rejection). It stays
   private. Verified-but-private reports are also excluded from public summaries.

No incidents are seeded in the ordinary local database. Automated workflow
fixtures are clearly labeled and run in **separate local test databases**.
Do not report fictional events as real; use the isolated browser tests for a
repeatable synthetic demonstration. Any reports you create manually persist
locally until you explicitly reset that database.

## Architecture and folders

- React 19, Vite, TypeScript, responsive CSS tokens and system fonts.
- MapLibre displays the unchanged validated Phase 2 GeoJSON. No external
  basemap, API key, network fonts, tiles, glyph service, or road layer is used.
- TypeScript Worker serves Static Assets and JSON APIs; D1 provides local SQLite.
- Python/GeoPandas/Pyogrio/Shapely are used only for spatial preprocessing and
  reproducible reference SQL generation, not the running web application.

| Folder | Purpose |
| --- | --- |
| `src/components/` | Preserved shell/primitives, dashboard, notices, dialogs |
| `src/pages/` | Report form and Local Demo Review |
| `src/map/` | Actual barangay geography and published-count choropleth |
| `src/services/` | Typed API client, time handling, static geography loader |
| `src/config/` | iLONGGO identity and disclaimers |
| `worker/` | API routing, validation, parameterized D1 queries |
| `migrations/` | Schema and reproducible real reference-data migrations |
| `scripts/` | Spatial validation/export, reference generator, local reset/test runner |
| `public/data/` | Three validated GeoJSON files and spatial metadata |
| `tests/` | API/SQLite tests, frontend tests, Python spatial tests, Chromium workflow |
| `.wrangler/` | Ignored normal local storage, isolated test storage, build/review artifacts |

### Database

- `barangays`: **180** reference records; text PSGC primary key, name, reference
  display longitude/latitude, active flag and range constraints.
- `incident_categories`: exactly **nine** approved stable codes/labels/orders.
- `incidents`: server-generated UUID and unique random public reference, foreign
  keys, controlled severity/status, private description (≤1,000 characters),
  boolean publication flag, UTC timestamps. No identities, attachments, incident
  coordinates, addresses, or GPS fields. Optional unique submission key and
  fingerprint prevent repeated-click/retry duplicates.
- `incident_status_history`: initial Submitted record plus every transition,
  timestamp, `system`/`local_demo_reviewer` actor type and optional private note.

Migration files: `0001_initial_schema.sql`, `0002_reference_data.sql`. Reference
rows come from the validated existing Point-on-Surface geometry, never hand-typed
barangays or invented coordinates/population. Useful filter/history indexes, FKs,
CHECKs, active-reference checks, initial-state and transition triggers are present.
Creation/history use an atomic D1 batch. Status updates/history also use an atomic
batch with an optimistic concurrency condition, so competing updates cannot
silently overwrite a status or create an orphan transition.

Allowed transitions (enforced by API and a database trigger):

```text
Submitted → Under Review → Verified → Responding → Resolved
Submitted → Rejected
Under Review → Rejected
Verified → Resolved
```

Resolved and Rejected are terminal. Public aggregates require **both** explicit
publication and status Verified, Responding, or Resolved. Submitted, Under Review,
private, and Rejected reports are excluded. A database CHECK prevents publishing
ineligible statuses. Severity is reporter-provided, not a professional assessment.

## API

Responses consistently use `{ "data": ..., "error": null }` or
`{ "data": null, "error": { "code": "...", "message": "..." } }`.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | D1 reference readiness, local MVP status and safe review capability |
| `GET /api/reference/barangays` | 180 active names/text PSGCs, alphabetically ordered |
| `GET /api/reference/categories` | Nine active codes/labels in display order |
| `POST /api/incidents` | Validate and create a private Submitted report |
| `GET /api/public/summary` | Aggregate-only total/barangay/category/severity/status counts |
| `GET /api/dev/incidents?page=1&limit=25` | Local-only private review list and history; limit ≤100 |
| `PATCH /api/dev/incidents/:id/status` | Local-only validated transition/publication/history |

The barangay response's `representativePoint` is a **barangay display coordinate**,
not an event coordinate. It is never copied into an incident row.

Submission accepts **only** `barangayPsgc`, `categoryCode`, `severity`,
`occurredAt` (ISO 8601 with timezone), and optional `description`. Unknown fields,
identities, addresses, GPS/coordinates, client-assigned IDs/status/publication,
inactive references, bad severities, invalid dates and times >5 minutes in the
future are rejected. UTF-8 JSON bodies are limited to **8 KiB**. Description/note
limits are 1,000 characters. Text is rendered as plain React text, never HTML.
Optional `Idempotency-Key` retries reuse the same submission safely; conflicting
payload reuse returns HTTP 409.

Review accepts only `status`, explicit boolean `publish`, and optional `note`.
It records each change, rejects invalid/terminal jumps and requires confirmations
in the UI for publishing, resolving, and rejecting. Public endpoints never return
private descriptions, review notes, internal incident IDs, or individual reports.
Category/severity dashboard filters use `?category=...&severity=...`, validate
values server-side, and apply the same predicate to every aggregate group.
Errors are generic and never expose stack traces, SQL, database paths or secrets.
All APIs return `Cache-Control: no-store`.

### Local review protection and production limitations

Both `APP_ENV=development` **and** `ENABLE_DEV_REVIEW=true` are required for review,
and requests must target loopback. Review defaults to disabled. The UI derives
availability from the Worker, not a client-only authorization check. Foreign
browser origins are refused for mutations; no permissive CORS is enabled.

**This is not production authentication.** Anyone with access to this enabled
local session can review local reports. Do not expose/proxy this local server.
Production authentication, anti-abuse/rate limiting and Turnstile remain future
work. Public submission is **disabled outside explicit local development**, so
an unconfigured production Worker cannot accept unprotected public reports.
No Cloudflare account, remote D1 database, deployment or GitHub push was performed.

## Location, privacy and time interpretation

> iLONGGO records incidents at the barangay level. Map points use established
> barangay representative points and do not indicate exact incident locations.

The established QGIS **Point-on-Surface** points are not centroids, GPS
observations, household addresses, barangay halls, population centers, or evidence
of where inside a barangay an incident occurred. All reports in one barangay
share that geographic tag. No geolocation permission is requested. No map click
places an incident. Optional reference-point visibility shows geography, not
individual incidents. Choropleth colors represent **actual filtered published
counts**, not risk, population-normalized rates, or exact-site density.

Users should not enter personal, medical, household, contact information or
information identifying minors in descriptions. Local reviewers can read private
submissions; the public receives aggregate counts only. Retention and an official
privacy policy require review before production. No legal compliance is claimed.

Date/time inputs are interpreted using the fixed Asia/Manila UTC+08:00 offset,
then normalized to ISO UTC on the server. Display uses `Intl.DateTimeFormat` with
`timeZone: 'Asia/Manila'`, independent of the browser's own timezone. Occurrence,
submission and status-history timestamps are distinct. Offline submission is not
queued; current form values remain in the open page after a failed request. Keep
the page open and resubmit when connected. No private API caching is implemented.

## Spatial preprocessing (Phase 2, unchanged)

Existing source relative to the app: `../data/iloilo_resilience.gpkg`. Leave it in
place; never move it into `public/` or copy it unnecessarily. A new installation
may place its source in `data/source/iloilo_resilience.gpkg` and use that explicit
`--source` path instead. No missing geography may be fabricated.

Source EPSG:32651 contains 180 barangay MultiPolygons, 180 Point-on-Surface nodes
and one city MultiPolygon. All 180 PSGCs and names match; all points are covered
by their corresponding polygons. City coverage is strict, outside area 0 m².
No null/empty/invalid geometries, repairs, simplification, or coordinate rounding.
An available 0.001 m coverage tolerance is documented for numerical noise but
was not needed. The city dissolve inherited one barangay name/ID; only existing
city-level `adm3_psgc` is retained in its export.

| File | Features | Properties | Size |
| --- | ---: | --- | ---: |
| `barangays.geojson` | 180 | `adm4_psgc`, `adm4_en` | 681,105 bytes |
| `barangay_nodes.geojson` | 180 | `adm4_psgc`, `adm4_en` | 29,601 bytes |
| `city_boundary.geojson` | 1 | `adm3_psgc` | 279,945 bytes |
| `spatial_metadata.json` | — | source hash, CRS, versions, fields, bounds, checks, disclaimer | 4,383 bytes |

All display GeoJSON is EPSG:4326 (WGS84), longitude then latitude, as needed by
browser maps. PSGCs are strings, preserving any existing text leading zeroes and
never guessing zeroes lost in integer source storage. Roads, adjacency,
population and resilience attributes are not exported or fabricated.

Verified source SHA-256, unchanged:

```text
a086787884ebcd8d11cee47b1627b35b4048dddede130479ebd919825201045e
```

The existing Python 3.9.6 environment uses pinned GeoPandas 1.0.1, Pyogrio 0.10.0,
Shapely 2.0.7 and PyProj 3.6.1. Python 3.9 is end-of-life: revalidate a supported
Python environment before production. No Homebrew or system Python modification
is required. From the app root:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --only-binary=:all: -r scripts/requirements-spatial.txt
python3 -m pip check
python3 scripts/export_spatial.py --source ../data/iloilo_resilience.gpkg --output public/data --validate-only
```

Only when intentionally regenerating spatial exports, omit `--validate-only`.
The script hashes the read-only source before/after, stages and validates the
complete export set, and replaces only its four generated files. For byte-identical
metadata, also use the same `--generated-at` timestamp on repeated runs.

Reproduce the real reference SQL without connecting to a database:

```sh
python3 scripts/generate_reference_seed.py
```

This revalidates public exports and deterministically generates the reference
migration; it does not apply it or generate incidents. Do not edit already-applied
migrations to evolve a populated schema; add a new migration for future changes.

## Tests and build

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run check:worker
```

Spatial tests, with `.venv` activated:

```sh
python3 -m unittest discover -s tests -p 'test_spatial.py' -v
```

API tests use in-memory SQLite with the same migrations, constraints, triggers
and transaction semantics. Browser tests also exercise **actual Wrangler local
D1** on port **8790** with a fresh isolated `.wrangler/mvp-test-*` database for
each run. They never seed incidents in normal `.wrangler/state`. Test descriptions
are explicitly labeled as automated fixtures. Do not point these workflow tests
at a real/ordinary database. The test server stops automatically after the suite.

Browser checks cover 1440×900, 1280×800, 390×844, 430×932, and 720×450 CSS pixels
as a 200%-zoom reflow equivalent. They check map height/rendering, no horizontal
overflow, dialog keyboard behavior, public map/form axe A/AA findings, zero console
errors and zero external HTTP requests. The full submission/review/publication/
resolution/rejection workflow runs against isolated D1. Physical iOS/Android
testing and comprehensive accessibility certification remain future work.

Current local MVP verification: **37 API/component tests**, **18 spatial tests**,
and **7 Chromium scenarios** passed, including complete desktop and mobile
submission-to-publication/responding/resolution workflows and rejection exclusion.
TypeScript, lint, production frontend build and Worker dry-run passed. The normal
local database was checked afterward: **180 unique barangays, nine categories,
zero automated-test incidents and zero history records**. The source GeoPackage
and all four Phase 2 public spatial files retained their original SHA-256 hashes.

`check:worker` runs `wrangler deploy --dry-run` to bundle/validate **without
deployment**. MapLibre is lazy-loaded but still triggers Vite's large-chunk
warning. The existing Wrangler → Miniflare → Undici audit warning (two moderate,
one high) remains; no forced audit fixes or dependency overrides were used.
Screenshots/build artifacts and isolated test databases are ignored under
`.wrangler/`; browser reports are ignored under `test-results/`.

## Reset only the normal local D1 database

**Destructive to local incident/history records. Not run automatically.** Stop
the local Worker, back up anything you want to retain, then run interactively:

```sh
npm run db:reset:local
```

You must type **RESET LOCAL D1**. The script uses only `wrangler ... --local`;
it drops the four application tables and local migration tracking, then reapplies
migrations to restore exactly 180 barangays and nine categories. No filesystem
recursive deletion, GeoPackage edits, remote database, or isolated test DB reset
is involved. Restart using `npm run start:local`. Cancelling the prompt changes
nothing. Do not reset while the local Worker is serving requests.

## Troubleshooting and postponed features

- **API unavailable / health 503:** apply local migrations, start Wrangler, and
  verify `/api/health`. Vite alone cannot supply a database/API.
- **Review missing or refused:** check both local variables, loopback URL, and
  restart the Worker after changing `.dev.vars`. Do not treat the flag as a login.
- **Report not on dashboard:** confirm it is Verified/Responding/Resolved **and**
  explicitly published; reset filters or Refresh. Rejected/private reports must
  remain absent. Zero published counts is a valid empty state, not an error.
- **Missing `dist/`:** run `npm run build`; `start:local` does this automatically.
- **Port busy:** use the existing server or stop that specific server, not unrelated
  processes. Normal Worker: 8787; Vite: 5173; isolated browser-test Worker: 8790.
- **Browser tests unavailable:** run `npx playwright install chromium` once.
- **Map unavailable:** WebGL is needed; textual barangay selection/status still
  works. No external basemap or street details are expected.
- **Reference mismatch:** stop; re-run spatial validation. Do not substitute data.

Postponed optional features: date trends/ranges, advanced filters, proportional
published-incident markers, downloads, additional animations, PWA/offline caching,
and production authentication/anti-abuse. No uploads, R2, notifications, road
routing, resilience simulations, exact-location inputs or population estimates.
Source publication rights, privacy/retention, authentication, abuse controls and
deployment require separate review and explicit approval. Nothing is deployed or
pushed to GitHub by this local MVP workflow.
