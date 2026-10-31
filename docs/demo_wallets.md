# Demo Wallets — Virtual ETB, No Real Money

This is an additional graduation-prototype enhancement, not a real payment or payout system. There are no provider calls, real deposits, withdrawals, or arbitrary admin balance edits.

## Setup

Migrations 006–010 are prerequisites and are unchanged by this feature. Apply the additive migration to a development/demo database:

```bash
cd backend
NODE_ENV=demo npm run db:migrate:wallets
NODE_ENV=demo SIMULATED_PAYMENTS_ENABLED=true DEMO_WALLETS_ENABLED=true npm start
```

Both switches and an allowlisted environment (`development`, `test`, `demo`) are required for wallet funding. Production remains disabled even with both switches set. Configuration defaults:

| Variable | Default |
| --- | --- |
| `DEMO_WALLETS_ENABLED` | disabled unless exactly `true` |
| `DEMO_WALLET_MAX_TOP_UP` | `1000000.00` ETB |
| `DEMO_WALLET_MAX_BALANCE` | `5000000.00` ETB (top-up cap; legitimate refunds are not blocked) |
| `DEMO_WALLET_TOP_UPS_PER_HOUR` | `10` per buyer, persisted rolling one-hour count |

The custom amount supports the 501,000 ETB defense example in one top-up. Read-only access to historical wallet data remains possible while funding is disabled.

## Accounting and migration

`011_demo_wallets.sql` adds:

- `demo_wallet_accounts`: one immutable ETB account per application user, buyer/farmer role.
- `demo_wallet_entries`: append-only signed integer-cent wallet events; no independently mutable balance. Available funds are the exact sum of entries.
- Database guards: buyer-only top-ups, no negative balances, debit equals immutable checkout total and buyer, unique checkout debit, unique idempotency per wallet, unique credit per existing escrow release.
- An escrow-release trigger: an existing `settlement` event credits the allocation's farmer; an existing `refund` event credits the order's buyer **in the same PostgreSQL transaction**.
- Deferred wallet funding reconciliation: wallet-funded paid/refunded orders must have one exact debit and matching allocation holds before commit.
- RLS and revoked `anon`/`authenticated` table privileges; immutable entries and accounts.

The existing `simulated_escrow_ledger` remains the **only authoritative escrow ledger**. Wallet entries are its spendable-account extension, not an alternative escrow balance. Links use transaction ID and unique escrow event ID; allocation details remain in the existing ledger. A transaction ID connects the one buyer debit with all of its allocation holds. Existing immutable quantities/prices and `ETB_HALF_UP_LINE_V1` are retained. API money is a decimal string; backend calculations use `BigInt` and PostgreSQL exact numerics. Signed decimal formatting also handles sub-ETB debits correctly.

On installation, existing buyer/farmer accounts are initialized. Historical simulated settlements/refunds are imported once by their existing escrow event IDs and timestamps. No historical price or amount is rewritten. This intentionally makes previously released virtual earnings/refunds visible in wallets. No unfunded historical checkout is credited.

Provider checkout funding is still an explicitly simulated external source of virtual ETB. Its refunds go to the **buyer demo wallet**, not Telebirr/CBE Birr. Each such credit is backed by an eligible existing escrow refund event, so no unbacked refund credit is minted. System reconciliation compares:

```text
demo top-ups + simulated provider escrow funding
    = all wallet available balances + all remaining escrow holds
```

This is linked signed-ledger accounting, not a new double-entry account system. Individual ledger legs are not summed as separate balances: wallet debits and allocation holds describe the two sides of the same transfer.

## Preserved behavior

- Single-listing checkout and multi-farmer Digital Debo use the same checkout, reservation, immutable allocation and recovery services.
- Payment locks the checkout, then locks the buyer account and spends its authoritative balance. Debit, paid state, allocation holds and audit commit together. Failure rolls all of them back.
- A paid checkout cannot be funded again using a different method. Repeated payment of the same order returns its existing result without another debit, including after refund.
- Farmers see only their own allocations through existing escrow details; pending/disputed amounts never enter available earnings.
- QR remains expiring, single-use, hashed and allocation-aware. **Delivery verification and settlement remain two explicit actions**, preserving the existing workflow. Settlement of a verified, undisputed delivery now also credits the farmer wallet atomically.
- Partial refunds retain reservations until the existing rules permit release. Refunds do not restore already fulfilled inventory. Ordinary refunds cannot reverse settled funds.
- Cancellation, expiration and reconciliation-required protections remain in place.

## API

All routes require a verified Supabase bearer token mapped to the application account and database role checks. No route accepts a client balance.

| Method / path | Purpose / authorization |
| --- | --- |
| `GET /api/wallet` | Own buyer/farmer summary: available, held, pending, disputed, cumulative refunds/settlements, unpaid pending checkout total |
| `GET /api/wallet/history?limit=25&offset=0` | Own paginated wallet activity, immutable references and decimal amounts |
| `POST /api/wallet/top-ups` | Buyer only; `{amount:"10000.00", idempotency_key:"UUID", confirm_demo:true}` |
| `GET /api/wallet/checkouts/:id` | Owning buyer only; exact checkout, available, projected remaining, additional required |
| `POST /api/transactions/initiate` | Existing checkout API now accepts `payment_method:"demo_wallet"`; does not fund |
| `POST /api/transactions/:id/simulate-payment` | Existing payment API accepts `{method:"demo_wallet", idempotency_key:"UUID", confirm_demo:true}`; server determines total |
| `GET /api/transactions` and `/:id` | Existing authorized escrow orders/details, allocation balances, dispute/delivery and audit history |
| `GET /api/wallet/admin?limit=25&offset=0` | Admin only; wallets, missing-credit/funding mismatch investigation, global conservation check |
| `GET /api/wallet/admin/:owner` | Admin-only wallet summary |
| `GET /api/wallet/admin/:owner/history` | Admin-only paginated wallet ledger |

History uses offset pagination (maximum 100 entries/request), stable timestamp/ID ordering. A failed top-up response should be retried with the same key and amount. Changed payloads conflict. The hourly count and limits are checked while holding the wallet row lock, including across server restarts/instances. Global HTTP rate limiting remains in place.

## Mobile and admin

- Buyer and farmer dashboard Wallet tabs open the shared role-aware `WalletScreen`.
- Buyer: available funds, top-up presets/custom amount, explicit two-step virtual-funds confirmation, held/disputed amounts, refunds, pending checkouts, paginated activity.
- Farmer: available earnings, pending/disputed separately, settlements, activity; no top-up action.
- Both: My Escrow Orders / Related Deliveries opens existing private allocation-aware order history, QR/delivery controls and dispute/settlement history.
- Checkout offers Pay With Demo Wallet, a server-provided balance/total/projected remainder, insufficient-funds shortfall and top-up navigation. Opening review never pays. Returning from top-up refreshes the quote; payment rechecks the balance atomically.
- Admin `/wallets`: read-only paginated buyer/farmer summaries, ledger references, linked order investigation and reconciliation. Existing `/transactions` remains the detailed escrow/dispute audit interface.

## Main files

### QR conflict troubleshooting

Delivery QR tokens expire after 15 minutes. A `409` on verification is an order/token-state conflict, not evidence of malformed HTTP syntax. The backend now returns an actionable `error` plus a stable `code` for expired, replaced, used or invalid QR tokens, unresolved disputes, already-confirmed deliveries and allocations that are not ready. Token expiry is checked against the database clock, and the final single-use conditional update is retained.

For `DELIVERY_QR_EXPIRED`, the farmer must open the same allocation and select **Regenerate QR**; the buyer then scans that new image. Restarting the scanner does not renew an old code. Raw Dio exceptions and the old bottom-overflow layout indicate an older mobile screen: stop the existing Flutter run and rebuild/relaunch the app, and restart/reload the backend to use the updated error responses. No token expiry or settlement authorization is bypassed.

### UI refinement

Wallet, checkout, escrow review and order history now share the marketplace's emerald palette, rounded Material surfaces, clear status badges and exact-decimal money formatting. The wallet uses a primary available-balance card and responsive, separate escrow metrics; activity has readable event labels and local timestamps. Top-up dialogs are scrollable and retain explicit confirmation. Error/retry and loading/empty states are provided, and narrow-screen/larger-text layouts are covered by widget tests.

Admin `/wallets` uses the existing PageHeader, DataTable, Icon and StatusBadge components with scoped responsive styling (`wallets.module.css`): reconciliation cards, account directory, owner selection, detailed metrics, skeleton loading, paginated activity and a read-only simulation notice. Financial backend behavior is unchanged by this visual refinement.

Admin dispute investigation in `/transactions` now has its own responsive case workspace (`disputes.module.css`): farmer-allocation navigation, separate order/allocation balances, evidence cards, resolution records, full/partial refund controls, per-dispute drafts, and collapsible ledger/audit records. A keyboard-accessible confirmation dialog replaces browser confirmation. Settlement remains disabled without verified delivery, and the existing backend rechecks all decisions. `npm run test:disputes` in `admin-web/` runs 14 exact-money and resolution-form helper checks; the production build passes.

New: `backend/db/migrations/011_demo_wallets.sql`, `backend/src/jobs/migrateWallets.js`, `backend/src/modules/transactionsEscrow/wallet.service.js`, `wallet.routes.js`, `backend/tests/wallet.test.js`, `mobile/lib/data/remote/wallet_api.dart`, `mobile/lib/features/transactions_escrow/presentation/screens/wallet_screen.dart`, `mobile/test/wallet_test.dart`, `admin-web/src/app/wallets/page.tsx`, this document.

Extended: backend `app.js`, simulation service and transaction routes, money utility, `.env.example`, npm scripts, real database/live Auth tests; mobile checkout/review/navigation and workflow regression test; admin sidebar. Existing user changes were retained.

## Verification commands

```bash
cd backend
npm test
npm run test:wallets:db
npm run test:transactions:db
npm run test:debo:db
npm run test:listings:db
LIVE_WALLET_TEST=1 npm run test:checkout:live
npm run checkouts:recover
cd ../mobile
flutter analyze
flutter test
cd ../admin-web
npm run build
```

Database wallet tests run in a disposable schema with actual PostgreSQL triggers, concurrency, rollback, real Express routes, role enforcement and RLS. Only token verification is fixture-based there. The separate opt-in live suite creates temporary Supabase email/password identities with genuine tokens, exercises mapped buyer/farmer roles, and rolls public fixtures back; it does not send phone OTPs or use existing users' credentials. It needs working development Supabase admin credentials and migration 011.

## Defense demonstration

1. Start the backend with both explicit demo switches. Sign in as buyer, open Wallet, custom top-up `501000`, confirm that no real money transfers. Verify available `501000.00`.
2. Create the existing 100-quintal Teff request. Have three farmers accept 40 at 5,000, 35 at 5,100 and 25 at 4,900 ETB/quintal. Filled Debo checkout is `501000.00` under the unchanged rounding policy.
3. Review checkout, choose Demo Wallet, inspect authoritative total and projected zero balance, explicitly confirm payment. Buyer available becomes zero; escrow holds `501000.00`.
4. Each farmer opens Wallet → escrow orders: A pending `200000.00`, B `178500.00`, C `122500.00`; available earnings remain unchanged.
5. A marks ready and issues QR. Buyer scans and explicitly verifies delivery. A or buyer explicitly selects authorized simulated settlement. A receives `200000.00` available; B remains pending.
6. Buyer disputes C. C's held amount displays separately as disputed and cannot settle. Admin resolves through the existing dispute interface; eligible refund credits the buyer's virtual wallet. Full C refund produces buyer available `122500.00`, A available `200000.00`, B held `178500.00`.
7. Admin opens Demo Wallet Audit: source `501000.00` equals wallet balances `322500.00` plus held escrow `178500.00`, with no mismatches.
8. Repeat top-up/payment keys and settlement requests; check unchanged balances. Exercise insufficient funds, failed payment, invalid QR, partial refund and role-restricted top-up/access. Use fresh fixtures for independent demonstrations, not arbitrary balance edits.

## Limits

- No real-money provider, withdrawal, payout, or correction endpoint is provided.
- Wallet balance calculation is ledger-derived (indexed per wallet), not a drifting cache. Very large production datasets would need further pagination/reporting optimization.
- Financial mutation is deliberately online through Express; wallet funds cannot be spent offline.
- UI top-up retry keys survive retries within the screen, not device/app restarts. Cross-restart investigation should use persisted server history before creating a new funding intent.
- Installation was tested against the current development database (no historical escrow releases); a nonempty historical-release import has not been separately rehearsed.
- Abruptly disconnected disposable-schema test runs may leave their isolated test schemas for investigation; application records are not used by those runs.
- No graduation-project PDF/Word document was found in this workspace; the implementation guide and existing source/schema informed this enhancement.
- See verification results below for actual runs and external limitations; automated database/Auth verification is not a claim of physical-phone/manual demonstration.

## Actual verification results

| Check | Actual result |
| --- | --- |
| Additive migration 011, development database | Installed successfully; rerun reports already installed with no changes |
| Backend Jest | 9 suites, 140 tests passed, including wallet and actionable QR-conflict response checks |
| Existing transaction/escrow PostgreSQL/API suite | 67 checks passed |
| Produce Listing PostgreSQL/API suite | 37 checks passed |
| Digital Debo PostgreSQL/API suite | 83 checks passed on retry; an earlier run had a remote query read timeout |
| Genuine Supabase-authenticated checkout + wallet suite | 37 checks passed; temporary Auth identities removed, public fixtures rolled back |
| Flutter full suite | 147 tests passed after UI and QR scan overflow fixes, including insufficient-wallet review, explicit top-up confirmation, exact display formatting, buyer/farmer responsive layouts, and scrollable QR failure states on short portrait/landscape screens with larger text |
| Flutter analyzer | No issues found |
| Admin production build | Passed, including `/wallets`, type checks and static generation |
| Checkout recovery | Completed; recovered 0 expired prototype checkouts |
| Development-database wallet reconciliation after live tests | No mismatches; virtual sources, wallets and escrow all `0.00`, balanced (test fixtures rolled back) |
| Wallet-enabled full database suite | 106 checks passed in the final expanded run, including concurrent double-spend prevention, wallet debit rollback, service reload persistence, settlement/refund race, RLS, immutable history and global virtual-fund conservation; earlier runs experienced remote connection termination |

The first Flutter run exposed an existing widget-test assumption that the review button was already built in a lazy list; adding the third payment method moved it below the viewport. The regression test now scrolls to it, and the full suite passed on rerun. The first admin build exposed a missing required `AppShell.title` on the new page; corrected and production build passed. These failed intermediate runs are not counted as final passes.
