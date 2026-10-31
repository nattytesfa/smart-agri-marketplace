# Transactions, simulated escrow, delivery QR and disputes

## Scope and safety

This is **simulation-only accounting**, not payment custody. Telebirr and CBE
Birr are labels in a local simulator. No provider is contacted; no payment PIN,
actual refund, bank payout or account balance is used. Supabase authentication
and PostgreSQL are real integrations. The existing Fayda integration is unchanged
and is not part of payment or delivery authorization.

Inspected the mounted Express routes, live development schema, migrations
006–008, exact money utilities, recovery job, Debo/listing services, Flutter
screens/API clients, admin pages, and `docs/implementation_guide.md`. The separate
graduation project document was not present. The old guide's proposed live
payment integrations are superseded here by the requested simulation-only policy.

## Installation

With the backend's existing development database configuration:

```bash
cd backend
npm run db:migrate:simulation
```

Migration `009_simulated_transactions.sql` is additive and transactional. The
installation command serializes execution, skips a completed installation, and
does not reset application data. Do not rerun migrations 006–008 over the new
schema: they represent earlier contracts, not current downgrade operations.

Enable payment simulation explicitly when starting the API:

```bash
NODE_ENV=demo SIMULATED_PAYMENTS_ENABLED=true npm start
```

Only `development`, `demo`, and `test` environments are approved. The flag alone
cannot enable simulation in production/staging. Funding, delivery processing,
financial settlement and dispute resolution fail closed outside these modes.
Unpaid cancellation/recovery remain safe without simulation being enabled.
`backend/.env.example` defaults the flag to false. No existing secret files need
to be replaced. Continue running `npm run checkouts:recover` for durable unpaid
checkout expiration, with the existing deployment scheduling arrangement.

## Reused functionality and inventory design

- Existing Supabase access-token verification and database role checks.
- Existing `produce_listings`, Debo contributions, batch lifecycle and PostGIS.
- Existing transaction IDs, buyer/farmer/listing IDs, checkout deadlines and
  reconciliation-required behavior.
- Existing immutable agreed contribution prices and `ETB_HALF_UP_LINE_V1`.
- Existing integer-cent money utility, decimal-string API amounts, listing locks,
  recovery command, and migrations 006–008 (unchanged).
- Existing Flutter Dio/Supabase client, marketplace theme, payment/QR screens,
  `qr_flutter`, `mobile_scanner`, and the Next.js authenticated admin shell.

Each new transaction has one allocation per listing contribution. Multi-farmer
parents have **no single payee** (`farmer_id` is null). Farmer permissions and
order history are allocation-aware rather than based on the parent payee column.

A single-listing purchase creates an internal one-contribution Debo lot, recording
the original listing in `source_listing_id` and in its allocation. Both single
and batch purchases therefore use **one reservation/fulfillment ledger**.
`transactions.listing_id` is intentionally null for these new checkouts: setting
it too would make the historical whole-listing inventory guard double-reserve
the stock. This supports fractional purchases alongside other reservations
without changing or invalidating the 006 ledger functions/triggers.

Checkout initiation reserves stock but does not deduct fulfilled quantity or
fund escrow. Farmer-reported provenance is snapshotted with the agreed terms.
No listing images are required.

## Accounting model and invariants

New tables:

| Table | Purpose |
|---|---|
| `transaction_allocations` | Immutable quantity, unit price, farmer, source contribution, amount and provenance; independent delivery/dispute/settlement states |
| `simulated_escrow_ledger` | Append-only positive integer-cent `hold`, `settlement`, and `refund` events |
| `delivery_verifications` | SHA-256 token digests, expiry, revocation, consumption and verifier |
| `transaction_disputes` | Allocation-scoped buyer evidence, status and administrator decision |
| `transaction_audit` | Append-only actor/action/timestamp/metadata history |

New parent columns include `simulation_version`, `source_listing_id`,
`total_minor`, `request_id`, and a canonical request fingerprint. Legacy records
are not backfilled, repriced or inferred to have paid.

Amounts are computed as exact quantity × immutable price, half-up per line, then
summed as integer cents. ETB 10.075 becomes **10.08**. APIs return decimal strings;
PostgreSQL bigint values are also strings, never unsafe JavaScript numbers.

Per allocation:

```
paid     = sum(hold)
settled  = sum(settlement)
refunded = sum(refund)
held     = paid - settled - refunded
```

Disputed and available-for-settlement amounts are derived from held funds and
delivery/dispute states. No mutable bank balances are stored. No platform fee
is configured or charged. All held funds reconcile to allocation totals.

Database checks protect line totals, deferred parent/allocation reconciliation,
immutable agreed terms, immutable ledger/audit entries, one funding event and
one settlement per allocation, one unresolved dispute, unique request retries,
and one simulation checkout per batch. A ledger trigger serializes on the
allocation and rejects overspending and unauthorized financial states. API
operations lock the parent before allocation/batch/listing updates and commit
all accounting and inventory consequences together.

All five tables have RLS enabled and access revoked from `anon`/`authenticated`.
Flutter/admin use authenticated API operations, not privileged SQL credentials.
Database-owner credentials are trusted and must stay server-side.

## Lifecycle, refunds and recovery

- Pending checkout allocations are `unfunded`, not held.
- Explicit buyer-owned demo payment changes payment to `simulated_paid`, creates
  allocation holds, and moves the checkout to `fulfilling`.
- Farmers mark only their allocations ready; the buyer confirms individual
  deliveries through a secure QR flow.
- Delivery verification moves the **corresponding existing reservation** to
  `fulfilled`, permanently excluding that physical quantity from available stock.
  It **does not settle funds**.
- Buyer or owning farmer can separately settle a delivered, undisputed allocation.
  This spends only its remaining simulated held funds, once.
- Parent state becomes `partially_completed` as allocations close, and `completed`
  only when all are financially closed. A mixed settled/refunded parent retains
  the exact breakdown in the ledger rather than pretending every farmer was paid.
- Buyer can dispute any still-held allocation before settlement, including after
  QR delivery confirmation. An unresolved dispute blocks ordinary settlement and
  QR issuance/verification; existing unconsumed tokens are revoked.
- Admin decisions: `review`, `reject`, `refund`, or `settle`, with a required note.
  Settlement still requires buyer-authorized delivery; admin cannot invent it.
- Refund amount omitted means full remaining balance. An exact-cent amount allows
  a partial monetary refund. Fully refunded undelivered allocations release only
  their own reservation. **Partial monetary refunds keep the physical reservation**
  until delivery/full financial closure; they do not invent a proportional return.
- A refund after verified physical delivery never restores fulfilled stock.
  Actual produce returns would require a separate returns workflow.
- Buyers may cancel unpaid checkouts or paid orders for which no delivery has
  started. Paid cancellation records simulated refunds. Orders already prepared,
  delivered, partially resolved or disputed require allocation dispute handling.
- Duplicate requests cannot double-fund, double-settle or double-refund. Reused
  request IDs with changed purchase data are rejected. Legacy callers without a
  request ID reuse an identical active single-listing checkout. Replayed scans
  are rejected safely; refresh the order after an interrupted response.
- Migration 008's recovery function is preserved verbatim. New paid checkouts
  leave the pending recovery set; unpaid expiration closes allocation states and
  writes a system audit through an additive trigger. Ambiguous external/legacy
  payments retain reservations and cannot be funded by the simulation endpoint.
- Settlement is synchronous in a PostgreSQL transaction: interruption rolls it
  back, so there is no externally sent payout to reconcile or partially committed
  settlement job. Safe retries use the persisted state and unique ledger event.

## API contracts

All routes except the existing untrusted notification collectors require a valid
Supabase bearer token. Roles are read from the application's `users` table.
Amounts, owners and financial statuses are never trusted from Flutter.

| Method/path | Actor and body |
|---|---|
| `POST /api/transactions/initiate` | Buyer: `{listing_id, quantity?, request_id?, payment_method}` **or** `{batch_id, request_id?, payment_method}`; methods `telebirr`/`cbe_birr` are simulated labels |
| `GET /api/transactions` | Participant's recent orders, allocation-aware; currently capped at 100 |
| `GET /api/transactions/:id` | Buyer/participating farmer; farmers see only their allocations/financial history |
| `POST /api/transactions/:id/simulate-payment` | Owning buyer: `{method:'telebirr'|'cbe_birr', outcome?:'success'|'failure'}`; default success |
| `POST /api/transactions/:id/cancel` | Owning buyer; eligible cancellation only |
| `POST /api/transactions/:id/allocations/:aid/ready` | Owning farmer |
| `POST /api/transactions/:id/allocations/:aid/qr` | Owning farmer; returns token once and expiry |
| `POST /api/transactions/:id/allocations/:aid/verify-delivery` | Owning buyer: `{qr_token, confirm_delivery:true}` |
| `POST /api/transactions/:id/allocations/:aid/settle` | Buyer or allocation farmer; simulation only |
| `POST /api/transactions/:id/allocations/:aid/disputes` | Owning buyer: `{reason, description, evidence?:[https_url]}` |
| `GET /api/admin/transactions` | Existing monitoring list, now includes multi-farmer parents and delivery/dispute filter metadata |
| `GET /api/admin/transactions/summary` | Exact simulated held totals and unresolved dispute count |
| `GET /api/admin/transactions/simulations` | Admin detailed recent order list |
| `GET /api/admin/transactions/:id` | Admin investigation: allocations, verification records, ledger and audit |
| `POST /api/admin/disputes/:did/resolve` | Admin: `{decision, note, amount?}`; amount only for partial simulated refund |

Dispute reasons: `not_delivered`, `incorrect_quantity`, `poor_quality`,
`wrong_product`, `other`. Descriptions/decision notes are bounded; evidence
supports up to five HTTPS references. The backend does not fetch evidence URLs.

Old `generate-qr` and `release` routes return **410**. Predictable reusable legacy
QR credentials must not be reused. The old admin whole-transaction settlement
service rejects simulation-version checkouts; use allocation dispute decisions.
Unsigned provider notifications are retained/deduplicated as unverified evidence
and return 503; they never fund or resurrect a checkout.

## QR security and traceability

Tokens use 32 cryptographically random bytes, base64url encoded. They expire in
15 minutes; issuing a replacement revokes earlier unconsumed tokens. Only a
SHA-256 digest is persisted. The QR JSON contains version, transaction ID,
allocation ID and the opaque token—no phone, Fayda ID or financial details.

The scanner checks its expected allocation, asks for explicit quantity/quality
confirmation, and submits to the backend. Parent/allocation ownership, paid state,
delivery state, dispute state, expiry, revocation and single-use consumption are
checked atomically. Buyer and farmer screens show listing, crop, variety, origin,
quantity, harvest date and **farmer-reported** quality, including image-free produce.
The backend, not client QR parsing, is the authority.

## Flutter and administration

Existing `PaymentScreen`: editable listing quantity, simulated methods, clearly
marked estimate, idempotent checkout creation, then authoritative summary.

`EscrowStatusScreen`: exact server total, explicit demo payment confirmation,
allocation progress, simulated balances/refunds/settlements, cancellation,
farmer readiness, QR entry points, disputes and audit history. Separate delivery
and settlement actions preserve the pre-settlement dispute opportunity.

`TransactionHistoryScreen`: buyer history and farmer incoming orders, reachable
through Orders in both role home navigations; refresh/reopen resumes backend state.
The existing QR generation/scanner screens are extended rather than duplicated.

Next.js `/transactions`: search/payment/checkout/delivery/dispute filters and
allocation investigation panel; exact simulated balances, delivery verifiers,
evidence links, ledger and audit, decision notes and partial-refund input.
No service-role key is introduced into client code.

## Graduation defense demonstration

1. Start the API with the demo flag above; run mobile and the existing admin app.
   Use three farmer accounts, one buyer and one admin with existing Supabase auth.
2. Create matching nearby Teff listings: 40 @ 5000, 35 @ 5100, 25 @ 4900
   ETB/quintal. All may omit images. Use the existing buyer Debo 100-quintal
   request and farmer confirmations. Confirm the batch becomes filled.
3. Review checkout: three allocations, total **ETB 501000.00**, payment pending,
   held **0.00**. Confirm simulated Telebirr or CBE Birr. Held becomes **501000.00**.
4. Farmer A opens Orders, marks ready and displays the QR. Buyer opens the A
   allocation, scans it and explicitly confirms quantity/quality. Confirm that
   delivery is recorded but funds remain held. Settle A in simulation.
5. Show A settled **200000.00**; B remains unfulfilled and held **178500.00**.
6. Buyer disputes C's **122500.00** allocation for quality. Admin investigates,
   marks under review and records a full simulated refund with a decision note.
   C's undelivered reservation is released; B's remains reserved. Parent remains
   partially completed; all events have actor/timestamp history.
7. To demonstrate a partial refund instead, enter e.g. `22500.00` for C. Its
   remaining `100000.00` stays held with its reservation. After dispute resolution,
   C can deliver and settle the remainder independently.
8. Complete B delivery/settlement to show final parent completion. A mixed
   settlement/refund transaction is fully reconciled without paying C twice.
9. Demonstrate a single listing purchase using editable quantity, then ordinary
   demo payment → ready → QR confirmation → simulated settlement.
10. Show invalid/repeated QR rejection, duplicate demo-payment safety, buyer
    cancellation and an unpaid expiration (`PENDING_PAYMENT_TIMEOUT_SECONDS=60`
    before creating a new checkout, then `npm run checkouts:recover`). Never
    alter a paid checkout's deadline/status to fake expiration.

The automated database suite creates disposable fixtures for these cases and
concurrent purchase/settlement/refund attempts, then removes its own schema:

```bash
cd backend
npm test
npm run test:transactions:db
npm run test:debo:db
npm run test:listings:db
cd ../mobile
flutter test
flutter analyze
cd ../admin-web
npm run build
```

## Files and limitations

Backend: migration 009; `simulation.service.js` / `simulation.controller.js` in
`backend/src/modules/transactionsEscrow/`; existing transaction service/controller/
routes; `backend/src/modules/traceabilityQr/qrToken.util.js`; admin service/routes;
`backend/src/jobs/migrateSimulation.js`; package scripts and `.env.example`.
Tests: `backend/tests/simulation.test.js`, `simulation.database.js`, and updated
Debo/listing database regressions.

Flutter: `mobile/lib/data/remote/transactions_api.dart`; existing transaction/QR
screens; `mobile/lib/features/traceability_qr/delivery_qr.dart`; role navigation;
listing and batch checkout entry points. Tests: delivery QR codec, transaction
workflow/short-phone layout and updated product-detail button expectations.
Admin: existing transactions page and new `SimulationDetails.tsx` investigation panel.

Known limitations/security boundaries:

- No production payment readiness, external escrow, provider verification or
  actual payouts/refunds; no claim of financial custody.
- Live OTP-authenticated, multi-device camera/admin-browser E2E requires user
  accounts/devices. Automated HTTP tests substitute token verification with
  fixture identities while retaining real RBAC, routes and PostgreSQL. Existing
  Supabase-auth middleware unit tests are rerun; they are not live OTP tests.
- New UI copy is English. Existing locale JSON/setup files are empty and there
  is no active localization/language-selection wiring in this checkout; reviewed
  Amharic/Afaan Oromoo translations and application-level wiring remain work.
- Evidence links are supported, not a new file-upload/storage moderation system.
  Admins should treat external links as untrusted. No remote evidence is fetched
  by the server (avoids introducing an SSRF path).
- QR is a short-lived bearer secret: protect screens/transport, use HTTPS, and
  regenerate after suspected exposure. No offline QR redemption or background
  payment queuing is allowed.
- Financial actions use server state; listing offline synchronization remains
  unchanged. Refresh after ambiguous client network failures before retrying.
- Historical transactions are preserved, not automatically converted to funded
  simulated allocations. Their unresolved external outcomes still require review.
- No produce-returns workflow, per-allocation split physical delivery, fee policy,
  automatic settlement schedule or real-provider reconciliation is implemented.
- Order lists are capped at 100 and use straightforward relational reads; large
  production-scale pagination/performance work is outside this prototype.
- The original graduation document was unavailable; this module was checked
  against the workspace implementation guide and the supplied task requirements.

See `transactions_verification.md` for the actual executed verification results.
