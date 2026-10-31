# Project Context: Smart Agricultural Marketplace

## 1. TL;DR

- Monorepo for an Ethiopian agricultural marketplace connecting smallholder farmers and produce buyers.
- Main applications: Flutter mobile (`mobile/`), Express API (`backend/`), Next.js admin console (`admin-web/`).
- Supabase provides phone authentication and hosted PostgreSQL; backend services use `pg` and spatial SQL.
- Mobile features include registration/login, listings, advisory, Digital Debo aggregation, escrow/QR flows, and offline listing storage.
- Backend modules expose account, listing, subscription, aggregation, transaction, advisory, and admin routes.
- The admin console supports operational monitoring and moderation.
- The intended users are farmers, buyers, and administrators; supported production/deployment infrastructure is not evident from the code.

## 2. Tech Stack

| Area | Observed stack |
|---|---|
| Mobile | Flutter/Dart. `mobile/pubspec.yaml` requires Dart `>=3.0.0 <4.0.0`; root README recommends Flutter 3.22.x but `pubspec.yaml` does not pin a Flutter SDK version. |
| Mobile state/data packages | `flutter_bloc ^9.1.1`, `equatable ^2.0.8`, `get_it ^9.2.1`, `dio ^5.9.2`, Hive `^2.2.3` / `hive_flutter ^1.1.0`, `connectivity_plus ^7.1.1`, `supabase_flutter ^2.15.0`, `flutter_dotenv ^6.0.1`, secure storage, geolocation/maps, QR/scanner, localization, and background work packages. |
| Backend | JavaScript, Node.js (README recommends Node LTS; runtime version is not pinned), CommonJS modules, Express `^5.2.1`. |
| Backend data/auth | PostgreSQL via `pg ^8.22.0`; Supabase JS `^2.108.2` and Supabase Auth token verification; SQL uses PostGIS functions. |
| Backend supporting packages | `dotenv`, `express-validator`, `express-rate-limit`, `helmet`, `cors`, `axios`, `jose`, `jsonwebtoken`, `bcrypt`, `multer`, `qrcode`, `winston`, and `ws`. Some dependencies appear to be unused by the sampled backend code; check actual imports before adding more. |
| Admin | TypeScript, Next.js `14.2.0` App Router, React/React DOM `^18`, Supabase JS `^2.108.2`, Axios and Leaflet/React-Leaflet. CSS is in `src/styles`; Tailwind is not an admin-web dependency. |
| Package managers | npm for backend and admin-web; Flutter Pub for mobile. Root `package.json` has dependencies but no scripts or workspace declaration. |
| Tests / build | Flutter tests and analyzer; Jest and Supertest are backend dev dependencies, with a dedicated Fayda smoke-test script; Next scripts provide dev/build/start/lint. No deployment or CI tool is evident in the inspected files. |

## 3. Repository Map

Generated output, vendor dependencies, and platform scaffolding are omitted.

```text
.
├── README.md                         # Setup and contributor workflow
├── PROJECT_CONTEXT.md                # This repository guide
├── docs/                             # Architecture and implementation reference
│   └── implementation_guide.md       # Intended stack, schema, API and build plan
├── backend/                          # Express API, SQL, integrations, tests
│   ├── db/
│   │   ├── migrations/               # SQL schema evolution; baseline files need attention
│   │   └── seed/                     # Example seed SQL
│   ├── src/
│   │   ├── config/                   # Environment, database, Supabase, logger
│   │   ├── integrations/fayda/       # eSignet OIDC client and mock identity provider
│   │   ├── jobs/                     # Advisory, price and sync job modules
│   │   ├── middleware/               # Auth, role checks, validation, errors, rate limits
│   │   ├── modules/                  # Feature routers, controllers and services
│   │   ├── utils/                    # Shared API/geo helpers
│   │   ├── validators/               # Request validation rules
│   │   ├── app.js                    # Express middleware and mounted routes
│   │   └── server.js                 # HTTP listener
│   └── tests/                        # Jest-style feature tests and Fayda flow check
├── mobile/                           # Flutter application
│   ├── lib/
│   │   ├── core/                     # Network, config, routing, theme, shared widgets
│   │   ├── data/                     # Models, Hive local storage, APIs and repositories
│   │   ├── features/                 # Feature-specific UI and (partly scaffolded) BLoCs
│   │   ├── screens/                  # Currently active/legacy screen implementations
│   │   ├── services/                 # Auth, sync, location, QR, notifications
│   │   ├── widgets/                  # Shared screen-level widgets
│   │   └── main.dart                 # Actual app bootstrap and route table
│   └── test/                         # Flutter unit/widget tests
└── admin-web/                        # Next.js admin console
    ├── public/                       # Static assets
    └── src/
        ├── app/                      # App Router pages
        ├── components/               # Shared admin UI
        ├── hooks/                    # Auth guard and asynchronous data hook
        ├── lib/                      # API/Supabase clients and format helpers
        └── styles/                   # Global, layout, component and page CSS
```

`mobile/android/` and other platform directories contain Flutter platform configuration. `mobile/web/` and `mobile/linux/` are present in the current working tree but are untracked additions at exploration time; do not assume they are part of the committed baseline.

## 4. Architecture & Data Flow

```text
Flutter mobile ── Supabase phone OTP/session ──> Supabase Auth
      │                                            │
      ├── Dio + bearer token ──> Express API ──────┤ verifies token with auth.getUser()
      │                            │                │
      │                            └── pg Pool ───> Supabase PostgreSQL/PostGIS
      │
      └── Hive listing box (offline) ── reconnect ──> POST /api/listings/sync

Next.js admin ── Supabase JS ──> Auth + direct table reads
      └── Axios + session bearer ──> Express /api/admin/*
```

- **Mobile authentication:** `mobile/lib/main.dart` loads `.env`, initializes Supabase, restores a saved session, initializes Hive, and starts `MyApp`. Screens use Supabase phone OTP through `AuthService`; successful sessions are mirrored into secure storage as `supabase_token` for backend requests.
- **API request path:** `backend/src/server.js` imports the Express app and listens on configured `PORT` (default 4000). `backend/src/app.js` installs Helmet, CORS, JSON parsing (10 MB), and a global rate limiter, mounts health and feature routes, then the error handler.
- **Backend identity/data path:** `authMiddleware` validates bearer tokens with Supabase `auth.getUser()`. Controllers read the resulting `req.user`; services query PostgreSQL through the shared `pg` pool. A separate Supabase service-role client is also configured.
- **Offline listing path:** `ListingModel` serializes listing fields to the backend’s snake_case payload. `SyncService` selects Hive records marked `local`, sends them as a batch, and marks them `cloud` after HTTP 201. Connectivity changes trigger this service from `main.dart`.
- **Admin path:** App Router pages authenticate with the browser Supabase client, query some tables directly, and use `adminRequest` for API data. Backend admin routes additionally require `isAdmin`.
- **External integrations:** Fayda has a mock OIDC provider and a configurable eSignet client. Advisory modules integrate weather and market-price sources. Payment and SMS code exists, but sandbox/live behavior is not fully evidenced as enabled.

The docs describe a broader intended design than the active wiring. In particular, the mobile root uses a small inline `MaterialApp` route table, not `app_router.dart`; several expected architecture files are empty.

## 5. Key Modules

### Backend

| Path | Purpose and connections |
|---|---|
| `backend/src/server.js` | Starts the HTTP listener using `config.port`. |
| `backend/src/app.js` | Builds Express middleware and mounts `users.routes`, subscriptions, listings, Digital Debo, transactions, advisory, and admin routes under `/api`. |
| `backend/src/config/env.js` | Loads `.env` with dotenv and exports port, Supabase, database, external API, and Fayda settings. |
| `backend/src/config/db.js` | Exports a PostgreSQL `Pool`; services use it for application queries. |
| `backend/src/config/supabaseClient.js` | Exports a Supabase service client configured with the service-role key and WebSocket transport for Realtime. |
| `backend/src/middleware/auth.js` | Requires `Authorization: Bearer …`, validates the token via Supabase Auth, and sets `req.user`. |
| `backend/src/middleware/rbac.js` | Reads the local `users.role` for role checks and admin checks. |
| `backend/src/modules/users/users.routes.js` | **Mounted auth router.** Routes check-registration, registration, `/me`, and Fayda login/callback/mock paths. |
| `backend/src/modules/users/users.controller.js` | Handles registration, profile retrieval, and phone registration lookup. The current Fayda check in this controller is a stub. |
| `backend/src/modules/users/user.routes.js` | Alternate/older auth router; it is not imported by `app.js`. Do not assume its route definitions are live. |
| `backend/src/modules/users/user.controller.js` | Older auth controller plus OIDC redirect/callback handling; relies on `req.session`. |
| `backend/src/modules/users/user.service.js` | Reads/writes `users`, `farmer_profiles`, and `buyer_profiles`; builds role-specific profile responses. |
| `backend/src/modules/listings/listing.routes.js` | Authenticated search, farmer listing retrieval, create, and bulk-sync endpoints. |
| `backend/src/modules/listings/listing.controller.js` | Validates and adapts HTTP payloads to the listing service; returns arrays or `{message, listing}` / `{message, synced}` responses. |
| `backend/src/modules/listings/listing.service.js` | Inserts and queries `produce_listings`, including spatial filters and PostGIS geometry. |
| `backend/src/modules/digitalDebo/clustering.util.js` | Finds nearby available listings and groups/summarizes clusters. |
| `backend/src/modules/digitalDebo/debo.service.js` | Creates batches and links listings in `digital_debo_batches` / `debo_batch_listings`. |
| `backend/src/modules/transactionsEscrow/transaction.routes.js` | Public payment webhooks followed by authenticated transaction, QR, and escrow routes. |
| `backend/src/modules/transactionsEscrow/transaction.service.js` | Inserts/loads transactions, updates escrow state, and generates QR tokens. |
| `backend/src/modules/transactionsEscrow/transaction.controller.js` | HTTP workflow for initiating payment, webhook, QR creation and escrow release. |
| `backend/src/modules/advisory/advisory.service.js` | Builds sell/hold decisions from price, forecast and storage data; stores/delivers advisory notices. |
| `backend/src/integrations/fayda/fayda.client.js` | Authorization Code + PKCE URL, code exchange and userinfo fetch. |
| `backend/src/integrations/fayda/fayda.util.js` | PKCE/state, endpoint resolution and `private_key_jwt` generation. |
| `backend/src/integrations/fayda/fayda.mock.js` | In-memory mock authorize/token/userinfo endpoints, mounted only in mock mode. |

### Mobile

| Path | Purpose and connections |
|---|---|
| `mobile/lib/main.dart` | Actual bootstrap, Supabase/Hive initialization, session token mirroring, connectivity listener, and route table. |
| `mobile/lib/services/auth_service.dart` | Phone registration lookup and Supabase OTP operations used by login/registration screens. |
| `mobile/lib/screens/login_screen.dart` | Validates/normalizes phone input, checks registration, sends OTP, navigates to OTP screen. |
| `mobile/lib/screens/register_screen.dart` | Collects user name/location and verifies phone by OTP before role selection. |
| `mobile/lib/screens/phone_validation.dart` | Normalizes supported Ethiopian mobile formats to `+2519XXXXXXXX`. |
| `mobile/lib/screens/role_selection_screen.dart` | Posts registration data to `/api/auth/register`; links to the optional Fayda screen. |
| `mobile/lib/features/auth/presentation/screens/fayda_verification_screen.dart` | Opens backend Fayda login URL in an external browser; displays launch state/error. |
| `mobile/lib/data/models/listing_model.dart` | Hive `ListingModel` (type ID 0) and snake_case API conversion. |
| `mobile/lib/services/sync_service.dart` | Uploads local Hive listings to backend and changes sync status on success. |

### Admin web

| Path | Purpose and connections |
|---|---|
| `admin-web/src/app/` | Next App Router pages for login, dashboard, users, listings, transactions, subscriptions, analytics heatmap, agents, and settings. |
| `admin-web/src/lib/supabaseClient.ts` | Browser Supabase client using public environment variables. |
| `admin-web/src/lib/apiClient.ts` | Axios client with the current Supabase access token and backend base URL. |
| `admin-web/src/hooks/useAdminData.ts` | `useAuthGuard`, `useAsyncData`, and `adminRequest`; used by admin pages. |
| `admin-web/src/app/page.tsx` | Checks session and profile role, then redirects to dashboard or login. |
| `admin-web/src/app/dashboard/page.tsx` | Combines direct Supabase table counts and backend admin endpoint data. |
| `admin-web/src/components/` | Shared shell, navigation, data table, toast, status and dialog components. |
| `admin-web/src/styles/` | CSS tokens and global/component/layout/page styles. |

## 6. Entry Points & How to Run

Commands below follow the manifests and READMEs inspected. Run each app from its own directory unless noted.

### Install and run

```bash
# Mobile (from repository root)
cd mobile
flutter pub get
flutter run

# Backend
cd backend
npm install
npm run dev
# Production-style listener:
npm start

# Admin web
cd admin-web
npm install
npm run dev
```

### Build, test and lint

```bash
# Admin scripts from admin-web/package.json
npm run build
npm run lint
npm start

# Mobile CLI commands noted by the root README
cd mobile
flutter test
flutter analyze

# Backend manifest script
cd backend
npm run test:fayda
```

- `backend/package.json` includes Jest and Supertest and `backend/tests/*.test.js`, but defines no `test` or build script. `npm test` is therefore not defined in this manifest.
- `admin-web/package.json` defines `dev`, `build`, `start`, and `lint` (`next lint`).
- The root `package.json` defines no scripts. It is not an npm workspace manifest.
- `mobile/pubspec.yaml` defines dependencies, not command scripts. Flutter CLI commands are run directly.

### Environment variables

Create the ignored local files from examples:

```bash
cp backend/.env.example backend/.env
cp mobile/.env.example mobile/.env
cp admin-web/.env.example admin-web/.env.local
```

The mobile app requires `.env` at startup. Backend API defaults to port `4000`; the Android emulator example for mobile uses `http://10.0.2.2:4000/api`. Admin’s backend origin is `http://localhost:4000` and must not include `/api`, because paths already include `/api/...`.

## 7. Configuration & Environment

| File / variable | Read by | Notes |
|---|---|---|
| `backend/.env` | `backend/src/config/env.js` | Loaded by dotenv. `PORT` defaults to 4000. `FAYDA_MODE` defaults to `mock`; Fayda client ID, callback URL, scope, mock base URL, and endpoints also have defaults. |
| Backend DB/Auth | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` | `db.js` uses `DATABASE_URL`; Supabase client uses URL/service key; `JWT_SECRET` is exported but not used by the sampled Supabase-token auth middleware. |
| Backend integrations | `TELEBIRR_API_KEY`, `TELEBIRR_MERCHANT_ID`, `CBE_BIRR_API_KEY`, `NMIS_API_URL`, `NMA_API_KEY`, `OPENWEATHER_API_KEY`, `SMS_GATEWAY_API_KEY`, `GOOGLE_MAPS_SERVER_KEY` | Present in the example/config. Do not assume every variable is used or a live integration is enabled. |
| Fayda | `FAYDA_MODE`, `FAYDA_CLIENT_ID`, `FAYDA_REDIRECT_URI`, `FAYDA_SCOPE`, `FAYDA_PRIVATE_KEY_BASE64`, `FAYDA_MOCK_BASE_URL`, `FAYDA_AUTHORIZATION_ENDPOINT`, `FAYDA_TOKEN_ENDPOINT`, `FAYDA_USERINFO_ENDPOINT`, `FAYDA_ACR_VALUES`, `FAYDA_CLAIMS_LOCALES` | Non-mock mode requires the RSA JWK base64 and endpoint values; `fayda.util.js` errors if the private key is absent at token exchange. |
| `mobile/.env` | `mobile/lib/main.dart`, `AuthService` and request screens | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKEND_API_BASE_URL`; map key is included in example. `.env` is declared as a Flutter asset. |
| `admin-web/.env.local` | `src/lib/supabaseClient.ts`, `src/lib/apiClient.ts`, settings page | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_BACKEND_API_BASE_URL`. Values prefixed `NEXT_PUBLIC_` are client-visible; never put server secrets there. |
| `.gitignore` | Git | Ignores `.env*` variants, dependency/build output and secrets such as Android signing config. Example env files are explicitly kept. |

The backend pool config sets `ssl: { rejectUnauthorized: false }`. No environment schema/validation step was found in `config/env.js`; missing required values can fail later during client or DB use.

## 8. Data Models / API Contracts

### Persistence

`docs/implementation_guide.md` describes intended PostgreSQL/PostGIS tables and enum values. However, `backend/db/migrations/001_initial_schema.sql` and `002_row_level_security.sql` are empty files in the inspected tree. Migrations `003_user_identity_and_location.sql` and `004_add_fayda_verified.sql` only add user identity/location and verification fields. Treat the guide schema as design documentation, not proof that a fresh database can be created from the tracked migrations.

The guide’s intended model includes:

- `users`: UUID, phone, Fayda ID, role, password marker/hash, language preference, name and location fields; migration 004 adds `fayda_verified` and `fayda_verified_at`.
- `farmer_profiles`: farmer FK, PostGIS location, storage type, farm size and trust score.
- `buyer_profiles`: buyer FK, buyer type/business name/location.
- `produce_listings`: farmer, crop/variety, positive quantity and price, unit, location, listing status, sync status, harvest date.
- `digital_debo_batches` and `debo_batch_listings`: buyer-targeted aggregation and listing links.
- `transactions`: listing or batch, buyer/farmer, amount, escrow state, payment method, transaction hash, QR token and timestamps.
- `advisory_notifications`, `subscriptions`, and `admin_analytics_reports`: advice, plan state, and generated regional metrics.

The guide lists intended enum values such as roles `farmer`, `buyer`, `da`, `admin`; listing states `available`, `reserved`, `sold`; escrow states `locked`, `released`, `refunded`; and advice `sell` / `hold`.

### Mounted API routes

Routes below are based on `backend/src/app.js` and its imported routers, not the planned API table in the guide.

| Prefix | Active paths / behavior |
|---|---|
| `/health` | Public health response `{status, timestamp}`. |
| `/api/auth` | From `users.routes.js`: `GET /check-registration?phone_number=…` (public), `POST /register` (Supabase bearer required), `GET /me` (bearer required), `GET /fayda/login`, `GET /fayda/callback`; mock IDP subroutes are added only in mock mode. |
| `/api/listings` | Auth required: `GET /`, `GET /me`, `POST /`, `POST /sync`. Filters include `crop_type`, `min_price`, `max_price`, `radius`, `lat`, `lng`. Create returns `{message, listing}`; sync returns `{message, synced}`. |
| `/api/debo` | Auth required: `POST /aggregate`, `POST /batches`, `GET /batches/:id`. |
| `/api/transactions` | `POST /webhooks/telebirr` and `/webhooks/cbe` are public; remaining routes require auth: initiate, list, get by ID, generate QR, and release escrow. |
| `/api/advisory` | Auth required: `GET /weather/:farmerId`, `GET /sell-or-hold/:farmerId`, `GET /prices`. |
| `/api/subscriptions` | Auth required: status, upgrade, cancel. Upgrade validation is applied. |
| `/api/admin` | Auth plus admin role: users/verify, listings/delete, transactions/resolve, and heatmap. |

The active registration body in `users.controller.js` expects `phone_number`, `fayda_id`, `role`, and profile details such as `storage_type`, `farm_size_hectares`, `full_name`, `region`, `zone`, and `kebele`; the client obtains a Supabase session first. Request validation is routed through express-validator middleware.

The `sync` and `traceabilityQr` backend module directories exist, but their routers are not mounted in `app.js`. The guide’s `/api/sync/listings`, `/api/traceability/...`, and some other proposed paths should not be treated as current contracts. Actual listing sync is `/api/listings/sync`.

## 9. Conventions & Patterns

- Backend uses CommonJS `require`/`module.exports`, feature directories with router/controller/service separation, PostgreSQL snake_case table/column names, and async controller handlers.
- Backend SQL parameterizes most user-supplied values through `$1`, `$2`, etc.; spatial operations use PostGIS. Existing batch-link SQL should be reviewed before copying its pattern.
- Authenticated API clients send a Supabase access token as a bearer token. The backend verifies it through Supabase rather than signing a separate JWT in the sampled auth middleware.
- Flutter screen code is a mix of `mobile/lib/screens/` and feature-oriented `mobile/lib/features/`. Keep a new change consistent with the specific feature’s actual wiring; the documented BLoC convention is not implemented uniformly.
- Hive models use generated adapters (`part '*.g.dart'`) and stable numeric type/field IDs. Change IDs only with a deliberate local-data migration plan.
- Mobile API payloads often use backend snake_case while Dart fields are camelCase; `toJson()` is the translation boundary for listings.
- Admin is a Next App Router app; client pages use Supabase JS for reads and `adminRequest` for backend actions. Shared asynchronous UI state is handled with `useAsyncData`.
- Flutter tests use `flutter_test`; backend test files are Jest style; admin has no test script or test directory in the sampled manifest/tree.
- Secrets belong in ignored local env files. Do not commit `.env`, service-role keys, or signing material.

## 10. Gotchas & Non-Obvious Behavior

- **Two user router/controller paths:** `app.js` mounts `users.routes.js`, while `user.routes.js` is not mounted. Similar filenames represent different implementations and contracts.
- **Fayda callback session assumption:** `user.controller.js` reads/writes `req.session` for state and PKCE verifier, but `app.js` does not install session middleware. Do not assume the current callback round-trip has durable session state.
- **Fayda screen is not an in-app callback flow:** the mobile screen opens the browser URL and tells the user to return manually. `RoleSelectionScreen` separately sends a generated placeholder `fayda_id`; no callback/deep-link wiring from browser back to that form was found.
- **Fayda has multiple behaviors:** active `users.routes.js` imports the mock provider at `/api/auth/fayda/mock`; `users.controller.js` registration still has a Fayda verification stub. The older user controller contains the OIDC callback path.
- **Offline sync is not reconciliation:** client uploads all Hive records marked `local`, then marks them `cloud` on status 201 without saving the returned server IDs. Server batch insertion is sequential and not visibly idempotent. A retry or partial failure deserves careful review.
- **Design guide vs actual route:** guide says `POST /api/sync/listings`; active route and mobile client use `/api/listings/sync`.
- **Empty architecture placeholders:** `mobile/lib/app.dart`, `core/routing/app_router.dart`, `di/service_locator.dart`, `core/config/env_config.dart`, `core/network/api_interceptor.dart`, `data/remote/auth_api.dart`, `data/local/hive_boxes.dart`, `core/config/api_endpoints.dart`, and `admin-web/src/lib/authHelpers.ts` were empty when checked. `main.dart` currently owns app wiring.
- **Schema setup is incomplete:** baseline migrations 001/002 are empty. A database created solely from the tracked migration directory will not get the schema shown in the implementation guide.
- **Coordinate labeling:** listing and cluster SQL label `ST_X(location_gps)` as `lat` and `ST_Y(...)` as `lng`; conventional PostGIS point coordinates are X=longitude, Y=latitude. Check consumers before changing this contract.
- **Spatial units:** guide schema uses `geometry(Point, 4326)` while listing/cluster code comments and API names describe radius in meters. PostGIS geometry distance in SRID 4326 is in coordinate units, not meters; validate the actual database type and desired radius semantics.
- **Root README references `mock-fayda/`, while the mock provider inspected is `backend/src/integrations/fayda/fayda.mock.js`.**
- **Dependency files are not a single monorepo setup:** root `package.json` has dependencies but no scripts/workspaces; backend and admin have their own package manifests and lockfiles.
- **Global rate limit:** Express applies the same 100 requests / 15 minutes limiter to health and all mounted routes.

## 11. Known Issues / TODOs / Tech Debt

Visible TODOs in sampled source:

- `mobile/lib/features/listings/presentation/screens/listing_list_screen.dart`: implement listing detail screen.
- `mobile/lib/features/advisory/presentation/screens/sell_or_hold_screen.dart`: update listing status to `urgent`.
- `mobile/android/app/build.gradle.kts`: replace placeholder Android application ID and add release signing configuration.

Other visible gaps from inspected code:

- Baseline database/RLS migrations are empty despite guide instructions to create the schema and policies.
- Fayda login depends on session middleware absent from `app.js`; mobile browser return handling is not wired to registration.
- Mobile sync does not reconcile server IDs or support idempotent server inserts in the observed code.
- `findOrCreateFromFayda` in `user.service.js` catches database errors and returns a mock-shaped user object, which can mask persistence failure.
- Payment webhook comments say signature verification is a stub; payment integrations should not be treated as production-ready.
- Backend test files exist, but the package manifest exposes only `test:fayda`; no general test/build script is declared.
- The implementation guide’s planned API list and module layout are not fully aligned with mounted routes and source.

The tracked-source TODO scan found no additional TODO/FIXME markers in the sampled backend/admin source. This is not a complete audit of every file or runtime behavior.

## 12. Glossary

- **Digital Debo:** Produce aggregation flow that groups nearby farmer listings into a batch large enough for a buyer.
- **Fayda / VeriFayda / eSignet:** Ethiopian national identity verification integration, implemented here as a configurable OIDC flow with a development mock.
- **FIN:** Fayda identity number, used in code as `fin` and persisted as `fayda_id`.
- **PostGIS:** PostgreSQL spatial extension used by listing radius filters and Digital Debo clustering.
- **Escrow:** Transaction state intended to hold buyer payment until delivery confirmation; current code tracks status and QR tokens.
- **Hive:** On-device Flutter key-value storage used for cached/local listings.
- **Sync status:** Listing marker used by mobile (`local` before upload, `cloud` after success).
- **NMIS / NMA:** Market-price and meteorological data sources referenced by advisory integrations and environment settings.
- **Kebele / Woreda / Zone / Region:** Ethiopian administrative geography fields captured during registration.

## 13. AI Onboarding Notes

- Read `README.md`, then `docs/implementation_guide.md`, but treat the latter as intended design and verify current behavior in code.
- Start backend tracing at `backend/src/app.js`; confirm a route is mounted there before describing or modifying it.
- For account flows, compare `backend/src/modules/users/users.routes.js` with the similarly named `user.routes.js`; only the former is mounted.
- Start mobile execution tracing at `mobile/lib/main.dart`, not `app.dart` or the empty `app_router.dart`.
- Follow mobile registration through `register_screen.dart`, `otp_screen.dart`, and `role_selection_screen.dart`; Fayda currently does not complete registration through a deep link.
- Before database changes, inspect every SQL migration and reconcile it with service queries. The guide’s schema is not a complete migration baseline.
- For local listing behavior, inspect `ListingModel`, `SyncService`, listing routes and service together; the client’s sync state is weaker than server-ID reconciliation.
- Keep `.env` values, Supabase service-role credentials, and Fayda private keys out of source and `NEXT_PUBLIC_` variables.
- Do not rename Hive type/field IDs casually; existing installations may have persisted data using them.
- The exploration sampled entry points, configurations, representative core services and tests, but did not read every mobile feature screen/BLoC, backend job/module, admin page/component, or test. Verify those areas before changing their behavior.
