# Telebirr Payment Simulation — implementation report

## Outcome and boundaries

Buyers can select **Wallet & Escrow → Add Funds → Telebirr Demo Payment**, enter
an ETB amount, review a durable authorization request, and explicitly approve,
decline, or cancel it. Approval credits the existing **virtual Demo Wallet**.
There is no separate balance system. Existing wallet checkout, escrow, refunds,
QR delivery, and farmer settlement continue to use their original accounting.

**No real money was transferred. No Telebirr provider API was called. No real
Telebirr PIN, password, payment OTP, or payment credential was requested.**

The UAT adapter, provider implementation, Android SDK/channel, Flutter UAT
screen/API, merchant credentials (including the existing DER PKCS8 key), and
migrations 012/013 were not edited. Both official UAT flags remain `false`.
Simulation results are not accepted as UAT proof. The simulation module imports
no provider, SDK, or merchant configuration.

## Configuration and database installation

The inspected development database had wallet/escrow migration 011 installed
but was missing UAT migration 012 and its 013 SDK context dependency. The
existing migration command installed **012 and 013 unchanged**, before 014.
No existing migrations or application financial records were rewritten.

Applied additive migration: `backend/db/migrations/014_telebirr_simulation.sql`.

- `telebirr_demo_payments`: buyer-owned intent, exact integer cents, immutable
  identity/amount/expiry/environment, state, and unique linked ledger reference.
- `telebirr_demo_audit`: append-only state-transition audit.
- Buyer history and pending expiry indexes; RLS and direct client revocations.
- Deferred credit reconciliation and immutable terminal-state guards.
- No schema changes to UAT, escrow, Debo reservations, or the existing ledger.

The migration runner checks 011/012/013 prerequisites, uses an advisory lock,
and refuses non-development/demo/test environments. Re-running it is safe:

```sh
cd backend
npm run db:migrate:telebirr-uat
npm run db:migrate:telebirr-demo
```

Local development controls were enabled without changing credentials:

```dotenv
NODE_ENV=development
SIMULATED_PAYMENTS_ENABLED=true
DEMO_WALLETS_ENABLED=true
TELEBIRR_SIMULATION_ENABLED=true
TELEBIRR_SIMULATION_EXPIRY_SECONDS=300
```

All three controls must be exactly `true`. Only development, demo, and test
environments are allowed. Production and unknown environments always fail
closed. Disabled simulation routes return **404**, and the service separately
rejects disabled/production calls **before acquiring a database connection**.
Active startup and each operation validate the timeout (integer, 1–900 seconds).
The example environment defaults simulation to disabled.

## Endpoints

All routes use the existing Supabase bearer authentication and application-account
mapping. Buyer IDs and balances are never accepted from the client.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/wallet/telebirr-demo/payments` | Create/recover an idempotent intent |
| GET | `/api/wallet/telebirr-demo/payments` | Owner-scoped history |
| GET | `/api/wallet/telebirr-demo/payments/:id` | Owner-scoped durable status |
| POST | `/api/wallet/telebirr-demo/payments/:id/approve` | Atomic simulated authorization/credit |
| POST | `/api/wallet/telebirr-demo/payments/:id/decline` | Decline without credit |
| POST | `/api/wallet/telebirr-demo/payments/:id/cancel` | Cancel without credit |
| GET | `/api/wallet/telebirr-demo/admin` | Admin-only monitoring with status/offset/limit filters |

Creation body: `{"amount":"5000.00","idempotency_key":"<uuid>","confirm_demo":true}`.
Approval body: `{"amount":"5000.00","confirm_demo":true}`. Payment identity is
the durable approval retry key; the client cannot choose a second ledger key.

Status includes demo reference, exact decimal ETB amount, currency, simulation
disclosure, status, creation/expiry/authorization times, environment, and linked
ledger reference when credited. It does not expose merchant credentials.

Existing wallet history also accepts
`funding_source=all|instant|telebirr-demo`. The wallet summary advertises whether
simulation is available. UAT remains unavailable in the funding picker while
its independent opt-in/readiness gates are unmet; existing UAT endpoints and
screen are preserved.

## State machine and accounting

```text
PENDING_AUTHORIZATION → AUTHORIZED → CREDITED
                     → DECLINED
                     → CANCELLED
                     → EXPIRED
                     → FAILED (reserved terminal state)
```

Authorization and credit are one transaction: lock the owner-scoped payment,
check buyer role, exact amount, state and server-time expiry, authorize, call
the shared authoritative wallet credit helper, link the immutable ledger event,
and commit `CREDITED`. The helper is extracted from the existing instant top-up
implementation; it retains account row locking, balance cap, hourly top-up
limit, maximum amount, integer-cent validation, and ledger insertion rules.

Simulation uses the existing `demo_top_up` ledger event type and a reserved
`telebirr-demo:<payment UUID>` key, rather than adding another source of money.
Instant top-up callers cannot use this reserved key. Database uniqueness gives
at most one credit per payment. Deferred triggers prevent committing an orphan
simulation credit, an `AUTHORIZED` state without credit, or a credited payment
without the matching owner/amount/type/key ledger entry. Errors roll back the
authorization, audit, ledger insertion, and final state together.

Matching repeated approval returns the same durable result. Conflicting terminal
actions return 409. Decline/cancel/expiry never credit a wallet. Pending expiry is
reconciled using database time on status/history reads and authorization; terminal
records are not expired or rewritten. No background worker is required for safety.

## Flutter and admin experience

- Funding picker retains Instant Demo Top-up and adds gated Telebirr Demo Payment.
- `TelebirrDemoScreen` has an always-visible disclosure outside the scrolling
  review content. It is explicitly an internal demo, not an endorsed provider UI.
- Review shows merchant, exact amount, demo reference, status, and expiry.
- Approve/decline/cancel, loading guards, expiry handling, and durable status refresh.
- No offline mutation queue or locally incremented balance. Status is queried
  before authorization and after an ambiguous authorization response.
- Ambiguous creation retries retain the original amount/idempotency key.
- Success requires server `CREDITED`; View Wallet reloads the authoritative APIs.
- Recent noncredited attempts can be reopened from Wallet activity. Credited
  attempts appear once as their labeled immutable ledger entry, not a second total.
- Admin financial monitoring separates instant top-ups, Telebirr simulation,
  and official UAT. The simulation monitor is read-only, paginated and filterable,
  and shows buyer, amount, state, reference, credit reference, timestamps and
  environment. There is no admin payment-success or wallet-edit action.

Security also retains existing request rate limiting, adds a durable ten-intent
per-buyer/hour limit, validates all monetary inputs with BigInt cents, enforces
buyer role in routes/service/database, and uses parameterized SQL. Authentication
is explicit bearer-token based, not ambient cookie authorization; cross-site
cookies cannot authorize these payment operations.

## Files added or changed for this task

Added:

- `backend/db/migrations/014_telebirr_simulation.sql`
- `backend/src/modules/telebirrSimulation/{config,service,routes}.js`
- `backend/src/jobs/migrateTelebirrSimulation.js`
- `backend/tests/telebirrSimulation.database.js`
- `backend/tests/telebirrSimulation.checks.js`
- `backend/tests/telebirrSimulation.routes.test.js`
- `mobile/lib/data/remote/telebirr_demo_api.dart`
- `mobile/lib/features/transactions_escrow/presentation/screens/telebirr_demo_screen.dart`
- `mobile/test/telebirr_demo_test.dart`
- `admin-web/src/app/wallets/TelebirrDemoMonitor.tsx`
- This report.

Modified (surgically preserving pre-existing local changes):

- `backend/src/modules/transactionsEscrow/wallet.service.js`: shared credit path,
  capabilities, simulation history labels, funding filters.
- `backend/src/app.js`: independent simulation route mount.
- `backend/src/server.js`: simulation timeout configuration validation.
- `backend/package.json`: simulation migration/database test commands.
- `backend/.env.example` and ignored local `.env`: demo-only controls; no credential edits.
- `backend/tests/simulation.database.js`: opt-in isolated-schema simulation checks.
- `mobile/lib/features/transactions_escrow/presentation/screens/wallet_screen.dart`:
  funding selection, attempt recovery/history and authoritative refresh.
- `mobile/test/wallet_test.dart`: retained instant top-up test through new picker.
- `admin-web/src/app/wallets/page.tsx`: source separation and funding filters.

The repository already contained unrelated/UAT local changes before this task;
those files should not be mistaken for new simulation implementation work.

## Executed validation

| Command/check | Actual result |
|---|---|
| Backend `npm test -- --silent` | 13 suites, 236 tests passed |
| `npm run test:telebirr-demo:db` | 153 real database checks passed, including existing wallet/escrow/QR/dispute regressions |
| `npm run test:telebirr:db` | 23 isolated UAT database checks passed; provider test doubles only |
| `npm run test:transactions:db` | 67 database checks passed |
| `npm run test:wallets:db` | 106 database checks passed |
| `npm run test:debo:db` | 83 PostgreSQL/PostGIS/API checks passed, including checkout recovery |
| `npm run test:listings:db` | 37 database/API/RLS checks passed, rolled back |
| `npm run test:checkout:live` | 25 real Supabase authentication/checkout/RLS checks passed; temporary Auth identities removed, public fixtures rolled back |
| Flutter `flutter test` | 172 tests passed |
| Flutter `flutter analyze` | No issues found |
| Flutter `flutter build apk --debug` | Passed; APK at `mobile/build/app/outputs/flutter-apk/app-debug.apk` |
| Admin `npm run build` | Production build, TypeScript and lint checks passed |
| Admin `npm run test:disputes` | 14 tests passed |

Simulation coverage includes invalid/zero/negative/over-limit amounts, explicit
demo confirmation, unauthorized/farmer/other-owner access, idempotent/concurrent
creation, wrong authorization amount, concurrent approval, restart and lost-response
recovery, terminal replay rejection, immutable audit, duplicate-ledger rejection,
deferred orphan-authorization prevention, transaction rollback, shared hourly
credit limits, history source filtering, decline/cancel, concurrent expiry,
all feature gates, production blocking, invalid timeout configuration, unchanged
UAT records, exact balance and conservation, and spending the actual simulation
credit through escrow → QR verification → farmer settlement.

Flutter tests cover funding navigation/selection, disclosure and absence of PIN
entry, amount validation, review, approval/decline, loading/double taps, offline
restriction, lost creation/approval responses, durable status recovery, expiry,
feature gating and authoritative wallet refresh.

Earlier runs found and fixed an early wallet-gate regression and updated the
existing wallet UI test for the new method picker. The first combined database
run exceeded a 120-second command timeout; complete background reruns passed.
The identified disposable schema left by the timed-out run was removed without
touching public application data. One initial UAT database run failed without a diagnostic detail under concurrent
load; an unchanged diagnostic rerun and the final normal command both passed.
The Android build reports existing plugin Kotlin Gradle migration warnings;
they do not prevent the debug build.

## Physical Android verification and demonstration

A connected Huawei ELE-L29 had an existing buyer session. A debug APK was
installed without clearing app data. No login OTP or payment credentials were
requested. Observed on-device:

1. Initial authoritative available wallet balance: **44,000.00 virtual ETB**.
2. Add Funds → Telebirr Demo Payment → default 5,000 ETB.
3. Explicit demo disclosure and pending review with `DEMO-TB-` reference.
4. Approve → backend-confirmed `CREDITED` / Demo Payment Successful.
5. Wallet after app force-stop/restart: **49,000.00 virtual ETB**.
6. Wallet history labels the single 5,000 ETB entry as Telebirr Demo Payment — Simulation.
7. Replaying that same physical-demo authorization through the backend service
   returned the same ledger reference and preserved 49,000.00 ETB.
8. A separate 5,000 ETB attempt was declined; the phone showed `DECLINED` and
   “No funds were added.”
9. Another attempt was left unapproved for the full five-minute timeout. Its
   Approve button was disabled, and a server status refresh showed `EXPIRED` /
   “No funds were added.”

The development database independently confirmed one linked 500,000-cent credit.
Its financial audit reconciled **55,000.00 sources = 53,000.00 wallets + 2,000.00
held escrow**, with zero mismatches. Official UAT funding records remained empty.

For a fresh demonstration:

```sh
cd backend
npm start
# In another terminal, with the phone connected:
adb reverse tcp:4000 tcp:4000
cd mobile
flutter run -d <device-id> --dart-define=BACKEND_TARGET=android-device
```

Use the existing Supabase phone login, then follow the funding flow above.
For expiry, create an attempt and leave it unapproved for five minutes (or use
an intentionally short development-only timeout and restart the backend).
Refresh its status; it must say EXPIRED and never add funds. For a decline,
choose Decline and confirm the balance is unchanged. To demonstrate marketplace
use, buy available produce with **Demo Wallet**, observe the escrow hold, have
the farmer mark delivery ready and present the allocation QR, confirm receipt
as the buyer, and settle through the existing farmer flow.

## Limitations / deliberately unclaimed checks

- The complete buyer/farmer purchase and QR handoff has passed real database
  integration tests, but was not performed end-to-end between two physical-phone
  user sessions during this task. No farmer session was substituted or bypassed.
- Fresh phone-OTP login was not exercised; the connected device had a valid buyer
  session. Existing authentication tests and live Supabase verification passed.
- Offline/lost-response behavior has automated backend/Flutter coverage, but a
  physical airplane-mode/lost-response test was not performed. Five-minute
  expiry was verified on the connected phone.
- Noncredited attempt previews in Flutter show the most recent API history page;
  full paginated attempt history remains available via API/admin monitoring.
- Expiry is safely reconciled on access, not by a dedicated simulation scheduler.
- Provider merchant onboarding, PKCS8 format support in the separate official
  adapter, and authoritative UAT verification remain outside this task.

**Safety conclusions:** no simulation endpoint can credit a wallet in production;
every approved simulation payment creates at most one virtual ledger credit;
no real Telebirr transaction or provider verification is represented by this flow.
