# Executed verification — transaction simulation module

Run date: 2026-10-30. No real provider calls or fund movements were made.

| Command/check | Actual result |
|---|---|
| `backend: npm test` | PASS — 6 suites, 102 Jest tests, including existing money, listing, Debo and auth tests plus simulation tests |
| `backend: npm run test:transactions:db` | PASS — 67 real PostgreSQL/PostGIS/service/Express/RBAC checks in a disposable schema |
| `backend: npm run test:debo:db` | PASS — 83 real PostgreSQL/PostGIS/API regression checks, including historical trusted-provider fixtures and checkout recovery |
| `backend: npm run test:listings:db` | PASS — 37 real database/API/RLS checks; all public-schema fixtures rolled back |
| `mobile: flutter test` | PASS — 131 tests, including new QR codec, explicit demo-payment UI, short-phone checkout and existing regressions |
| `mobile: flutter analyze` | PASS — no issues found after fixing style diagnostics introduced during implementation |
| `admin-web: npm run build` | PASS — production compilation, lint/type checks and static-page generation |
| `backend: npm run db:migrate:simulation` | PASS — migration 009 installed atomically in the configured development database |
| Same migration command, repeated | PASS — detected existing installation, no records changed |
| Installed-schema monitoring smoke query | PASS — existing admin transaction/summary services execute, exact decimal-string summary amounts, all five new tables have RLS enabled |
| `backend: npm run checkouts:recover` | PASS — standalone command executed against development; 0 expired prototype checkouts recovered |
| `git diff --check` | PASS |

The three database suites were rerun successfully after installing migration 009
in development (67 transaction, 83 Debo, 37 listing checks). After the final UI
retry/loading and brace fixes, the analyzer again reported no issues and the
targeted transaction/QR/product-detail suite passed all 10 tests. The full Flutter
suite had already passed all 131 tests; the admin build also passed after its
final page changes.

The new database suite covers:

- 40/35/25 multi-farmer checkout, ETB 501000.00 authoritative total, no single
  parent payee, initial unfunded state, and concurrent duplicate simulated payment.
- Environment gating, unauthorized ownership/role actions and forged client
  payment/amount flags.
- Cryptographic token generation/hash storage, allocation binding, expiration,
  revocation, invalid/repeated token rejection, unauthorized scanner rejection,
  explicit buyer delivery confirmation and separation from settlement.
- A settled while B remains held and C disputed/refunded; unaffected reservations
  remain deducted; farmer views contain only their allocations/financial history.
- Single-farmer partial purchases and ETB 10.075 half-up rounding.
- Partial monetary refunds, full refunds, repeated admin decisions, overspend
  prevention and concurrent settlement/refund decisions.
- Physical fulfillment preserved after financial refund; shared-listing
  fulfillment does not mark stock sold while other reservations remain active.
- Immutable agreed terms/ledger, deferred allocation/checkout reconciliation,
  payment and settlement rollback under injected failures and safe retry.
- Expired unpaid checkout release, no resurrection, reconciliation-required
  protection, simulated failure, paid cancellation and concurrent purchase races.
- Real mounted Express routes, request validation, RBAC and PostgreSQL actions;
  API-only table permissions for all five new tables.

Earlier exploratory runs exposed genuine issues: repeated paid cancellation was
not idempotent, the initial admin UI edit left unreachable legacy controls, old
listing tests assumed a whole-listing status reservation, and Flutter tests
expected the previous purchase-button copy. These were corrected and rerun.
The final analyzer errors were style diagnostics, not suppressed warnings.
Expected negative HTTP cases log errors via the existing error middleware; those
logs do not indicate failing assertions.

## Not verified / limitations

- No live phone OTP, real-account multi-device camera scan, or interactive admin
  browser E2E was performed. HTTP integration tests replace remote token
  verification with fixture identities, retaining real middleware RBAC, route
  handlers and PostgreSQL. This is **not** a claim of live Supabase-authenticated E2E.
- No live/sandbox payment provider, real payout/refund, Fayda round trip, external
  evidence hosting or evidence upload was exercised by this module's tests.
- Amharic/Afaan Oromoo localization is incomplete: the existing locale assets
  and localization setup are empty, with no current language wiring. New UI is
  English-only; no translated-language verification is claimed.
- Existing Flutter Hive legacy-adapter tests print their adapter-override warning;
  they pass. Live storage image-upload tests were not enabled by this work.
- The standalone recovery command was run, and its underlying function was also
  exercised directly, through services and through concurrent database workers;
  no production scheduler was installed or tested.

For architecture, API/body contracts, changed-file inventory, safety boundaries,
setup and graduation-defense steps, see [transactions_simulation.md](transactions_simulation.md).
