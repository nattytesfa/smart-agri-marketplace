# Checkout authorization and simulated escrow visibility fix

## Diagnosis

The Flutter **Review authoritative checkout** button uses
`TransactionsApi.initiate()` → **POST `/api/transactions/initiate`**.
This is checkout initiation/review (including reservation creation), not the
payment-confirmation endpoint. Successful initiation returns 201 with payment
`pending`; authoritative details are fetched with GET `/api/transactions/:id`.
Payment is a separate POST `/api/transactions/:id/simulate-payment`.

The previous response was **403** with `Access denied. Insufficient permissions.`
That message came from `rbac(['buyer'])`, after Supabase token verification and
before transaction creation. It was **not a transaction RLS rejection**.

Development database inspection found an actual identity mismatch:

- Most recently signed-in buyer Auth subject: `70e45c91…`.
- Matching application buyer account: `be59a66c…`.
- Supabase phone verified; application role **buyer**, not farmer.
- No application row existed at the Auth subject UUID.
- `/api/auth/me` previously fell back to phone matching and returned the buyer,
  but RBAC/checkout queried `users.user_id = req.user.id` using the Auth UUID.
  Thus the app displayed buyer navigation while checkout saw no registered role.
- Flutter correctly reads the current Supabase in-memory session for its bearer
  token; it does not send a chosen farmer ID or client amount as authorization.

No existing device token, OTP, credentials or private identity fields were read.
The original device request was not captured, so its exact token cannot be
claimed as independently verified. The failing branch, development records,
and a real-Supabase reproduction with mismatched UUIDs establish the cause.

## Authorization changes

Additive migration **010_account_auth_mapping.sql** is installed in development.
It adds a unique, server-managed `users.auth_user_id` reference. It preserves
application IDs, roles, contribution ownership and all transaction foreign keys.

Existing exact UUID matches are linked first. Legacy buyer/farmer phone matches
are linked only when unambiguous, confirmed by Supabase, not already bound, and
not owned by another existing Auth identity. Admins are not auto-linked by phone.
There is **no runtime phone fallback** and no client-configurable identity link.

After real `supabase.auth.getUser(token)` verification, middleware resolves the
mapping once. `req.authUser` retains the original verified subject; existing
resource services receive the canonical application ID through `req.user.id`.
RBAC continues querying database roles; farmer/buyer/admin permissions are not
merged or inferred from token metadata. Unknown accounts fail closed, except
that the existing registration endpoint can register a new authenticated user.
An already linked identity cannot register another application role.

The same resolution is used for `/me`, ownership checks and RLS via
`marketplace_user_id()`. The existing users/listings/transactions read policies
retain their ownership/admin conditions. No permissive write policy is added;
no service-role credentials are sent to Flutter. The old phone-only `/me`
fallback (which also logged phone details) was removed.

Role errors now include safe structured codes and a useful explanation, e.g.
`ROLE_REQUIRED`, `current_role: farmer`, `required_roles: [buyer]`. Missing/invalid
tokens still return 401; missing application accounts return 403 on protected
resources and 404 from `/me`; another buyer's private checkout returns 404.

Optional `AUTH_DIAGNOSTICS=true` logs method, path without query strings, actual
response status, verified subject ID, application ID and database role. It logs
no token, phone, OTP, password, private key or request body. Diagnostics default
off in the configuration example.

## Checkout and UI changes

- Checkout rechecks `/api/auth/me` before initiating. A non-buyer sees a clear
  account-role explanation and **Sign in with another account / register**,
  using the existing logout/login/registration flow. It never changes the role.
- Role-based home fetches the current backend account instead of defaulting to
  buyer from an absent/stale stored role. Network failure offers retry/sign-in.
- Both role navigations expose an explicit **Escrow** tab, opening **Orders &
  Simulated Escrow**. The unused alternative `HomeScreen` delegates to the same
  guarded home rather than maintaining navigation without escrow.
- Opening an order shows the existing `EscrowStatusScreen`, now titled
  **Simulated Escrow · Order**. Server-returned `is_buyer` drives ownership-aware
  controls; comparing an application buyer ID to an Auth UUID no longer hides
  the mapped buyer's payment action.
- Unpaid orders show **Awaiting Simulated Payment**, `unfunded`, and explicitly
  state no demo funds are held. Allocation balances are not presented as funded
  escrow before payment.
- Funded orders show simulated escrow status, exact held/settled/refunded demo
  amounts, farmer quantity/unit-price allocations, delivery, refund and dispute
  state, and audit history. Monetary values remain authoritative decimal strings.
- The prior screen was implemented, but was labelled merely **Orders**, was
  reached after the failing checkout action, and had no funded order to display.
  In addition, development simulation was disabled because its opt-in variable
  was absent. The local `backend/.env` now explicitly enables simulation while
  keeping `NODE_ENV=development`. Production gating is unchanged and tested.

## Running the fix

Migration 010 was validated inside a rollback transaction (including RLS for the
actual mapped development buyer), then installed using:

```bash
cd backend
npm run db:migrate:account-mapping
```

Restart the backend to load the development simulation flag and new middleware.
Hot-restart/rebuild Flutter to load navigation and ownership UI changes. Existing
accounts do not need their roles changed or transactions deleted.

1. Sign in with the existing buyer account.
2. Browse → listing → choose quantity → simulated method → Review authoritative checkout.
3. Confirm the server quantity, immutable unit prices, allocations and exact total.
   The screen must say Awaiting Simulated Payment, with no demo funds held.
4. Confirm demo payment as a separate action.
5. Open Escrow → order at any time to view held demo funds and progress.
6. If registered as farmer, use the offered account-switch/login flow; do not
   attempt to change the stored role or database identity in Flutter.

## Changed files

Backend:
- `backend/db/migrations/010_account_auth_mapping.sql`
- `backend/src/jobs/migrateAccountMapping.js`
- `backend/src/middleware/accountIdentity.js`, `auth.js`, `rbac.js`
- `backend/src/modules/users/user.service.js`, `users.controller.js`
- `backend/src/modules/transactionsEscrow/simulation.service.js` (`is_buyer`)
- `backend/tests/checkout.live.js`, `accountIdentity.test.js`, `user.test.js`
- `backend/package.json`, `.env.example`; local ignored `.env` simulation flag

Flutter:
- `mobile/lib/data/remote/transactions_api.dart`
- Transaction payment, escrow-detail and history screens
- `mobile/lib/screens/role_based_home_screen.dart`, `home_screen.dart`
- `mobile/test/transactions_workflow_test.dart`

## Verification scope

The new opt-in `npm run test:checkout:live` creates temporary farmer and buyer
Supabase Auth users and signs in through the real Auth provider. One buyer has
a deliberately different application UUID. It calls the mounted Express app
with real bearer tokens and real token verification/RBAC/PostgreSQL; **auth is
not mocked**. Public fixtures roll back, and temporary Auth users are deleted.
No SMS/OTP is sent; temporary email/password sign-in is used solely to obtain
genuine development access tokens. Existing users' sessions are never accessed.

The first live run passed **19 checks**: mapped `/me`, old lookup reproducer,
farmer listing and buyer-only rejection, exact unpaid review, quantity/price,
ownership isolation, demo payment, duplicate-payment safety, escrow/history
visibility, production rejection, missing/invalid/expired-untrusted JWT rejection,
and mapped RLS ownership/private-read protection. Migration rollback validation
also confirmed the actual existing buyer's direct own-account RLS read.

The invalid/expired JWT test is an expired, untrusted token rejected by real
Supabase verification; it does not simulate waiting for a valid provider-signed
token to expire. The physical phone's OTP login and tap-through workflow still
need confirmation after restarting the backend and rebuilding the app.

Current completed verification:

| Check | Result |
|---|---|
| Backend Jest | 107 tests passed in 7 suites |
| Flutter full suite | 133 tests passed |
| Flutter analyzer | No issues on the completed rerun |
| Next.js production build | Passed compilation, type/lint checks and page generation |
| Produce Listing database regression | 37 checks passed on retry |
| Migration 010 | Rollback validation passed; installed; repeat command safely skipped |
| Live Supabase checkout | Final expanded run: 25 checks passed, covering individual and filled Debo checkouts; preceding 19-check runs also passed, including sanitized diagnostics |

Initial database regressions encountered `ENOTFOUND` for the pooler hostname.
Retries reached the database, but separate disposable-schema pools also hit
connection timeouts/disconnections. The full transaction and Debo database suites
remain **blocked/not passed in this task**, despite the successful real-auth
checkout integration and listing regression. One interrupted run left its
isolated fixture schema; its exact test-only account/listing markers were
verified before removing that schema. Public data was not deleted. No RLS or
role check was weakened to work around connectivity failures.

This remains demo accounting: **no real payment, escrow custody, refund or payout**.
