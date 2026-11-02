# Telebirr InApp UAT integration — current verification preparation

## Current outcome (uploaded-document review, 2026-11-01)

**Signed queryOrder transport and strict diagnostic validation are implemented;
authoritative payment confirmation is still blocked.** No genuine authenticated
UAT token, preorder, query, notification or payment was obtained in this pass.
No enable flags, merchant keys, registration or application wallet balances were
changed. Simulation, Demo Wallet, escrow and the official Android AAR/channel
remain unchanged. There is no production payment integration or UAT wallet credit.

The current sections below supersede historical implementation claims later in
this file and the older [blocker-resolution report](telebirr_uat_blocker_resolution.md).

### Evidence reviewed and confidence

- Uploaded [telebirrofficial](telebirrofficial), 719 lines; SHA-256
  `399d98e27ff5f6125b056316ac41e21af0e968a3847391eb621deb65cbae29e8`.
- Cross-checked the current official [Developer Portal documentation](https://developer.ethiotelecom.et/docs/)
  by reading its public content assets as text, not executing JavaScript:
  [preparation](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-development-preparation-3-f-8-adb.js),
  [create-order](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-request-create-order-8-a-8-410.js),
  [Android](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-android-in-app-sdk-integration-1-bd-ba0.js),
  [Notify](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-notifyfee-47f.js), and
  [queryOrder](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-query-order-6-aa-08e.js).
  They retain the discrepancies described below. No unofficial implementation was
  used as a provider specification.
- **Officially documented:** endpoint, request fields, PSS request signing,
  response field descriptions/examples, product registration and notify whitelist.
- **Locally tested only:** mocked Fabric/gateway transport, generated independent
  merchant/SP keys and signatures, strict candidate response profile, database
  safety/concurrency, UI/build regressions. These are not captured provider fixtures.
- **Authenticated provider evidence:** none. Previous device/TLS observations were
  not repeated; a build or TLS connection is not a successful payment.

### Query request contract and implementation

`provider.js` now reuses its existing secure Fabric-token helper for preorder and
query. It preserves the returned token verbatim (including any provider-issued
`Bearer ` prefix), never invents a prefix, and never exposes token/App Secret/key.

```text
POST https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway/payment/v1/merchant/queryOrder
X-APP-Key: configured Fabric App ID
Authorization: returned Fabric token
Content-Type: application/json

timestamp: UTC epoch seconds
nonce_str: 16 cryptographically random bytes encoded as 32 hex characters
method: payment.queryorder
version: 1.0
biz_content: appid, merch_code, merch_order_id
sign_type: SHA256WithRSA
sign: base64 RSA-PSS/SHA-256 signature
```

Request signing reuses the existing flattened, ASCII-sorted raw `key=value` /
`&` canonicalization and RSA-PSS/SHA-256/MGF1-SHA-256, salt length 32. The upload
specifies PSS; the precise salt/hash behavior was previously verified against the
official demo with synthetic keys. Existing base64 PEM/DER PKCS8 merchant-key
parsing is unchanged. No prepay-only lookup or alternative endpoint is guessed.

Queries use the same verified TLS CA chain, **default hostname verification**,
12-second per-request timeout, response/body limits and no redirects. Token and
query failures become fixed unconfirmed reason codes; no raw Axios error reaches
the client/audit. No insecure retry, certificate bypass or refund operation exists.

### Response authentication: candidate profile, NOT authority

The upload (lines 669–671) says query responses are signed by the **SP private
key**, but supplies neither its public key nor a complete response verification
vector. Preparation describes **request** canonicalization. Notify only labels its
signature. Neither proves that query and notify share a signing key/profile.

`evidence.js` implements a deliberately non-authoritative candidate profile for
controlled future diagnostics: strict base64, exact `SHA256WithRSA` label,
RSA-PSS/SHA-256 with 32-byte salt, flattened ASCII-sorted string fields, excluding
only signature/container fields and omitting empty/null values. It does not URL
decode, rename fields, coerce numbers/objects, overwrite duplicates, accept nested
signature fields, or try alternate padding/alias/encoding schemes. Query envelope
and business-field allowlists are strict; undocumented shapes remain unresolved.

Even a matching candidate signature returns **`authoritative: false`** and
`QUERY_RESPONSE_CONTRACT_UNCONFIRMED` or `NOTIFY_RESPONSE_CONTRACT_UNCONFIRMED`.
`candidate_signature_valid` means only that the chosen local mathematical profile
matched the supplied, locally pinned key. It is not authenticated provider-contract
confirmation, paid status, a stored verification timestamp or a wallet credit.
The service does not expose candidate details or raw response/payment references.

Query diagnostics require a backend-configured public PEM or DER SPKI RSA key
(>=2048 bits) plus independently approved SHA-256 of its **DER SPKI**, not its
certificate. The loader explicitly rejects the merchant's own public key and
never reads a key from the response. A matching fingerprint is only a local pin;
it cannot establish provider provenance unless obtained through an authenticated
provider channel. No authentic key/fingerprint was supplied or populated here.
Missing key/pin fails **before Fabric authentication or network I/O**.

Response assessment checks a stored buyer-owned UAT attempt in a non-final state,
merchant order, supplied merchant app/code, immutable SDK identity where present,
positive integer-cent amount, ETB, a nonempty provider payment reference,
and conflicts with any existing final/prepay reference. No missing amount,
currency or order ID is defaulted from the request. The payment reference is not
silently replaced by `prepay_id` or `trans_id`. Cross-attempt final-reference
uniqueness remains database-enforced. **No candidate reference is stored**, so
cross-attempt candidate matching/atomic authoritative evidence persistence remains
future finalizer work, not a completed verification claim.

### Status meanings and discrepancy

The upload's query schema (677–678) misdescribes `order_status` as a currency and
lists outcomes under `trade_status`; example (704) uses `order_status: PAY_SUCCESS`.
Current portal content has the same conflict. Both spellings can be inspected for
diagnostics, but conflicting values are rejected; neither is an authoritative
field until Telebirr confirms its contract and provides authentic signed fixtures.

| Documented state | Diagnostic interpretation only | Financial/internal finalization |
| --- | --- | --- |
| `PAY_SUCCESS` | success candidate | Not finalized |
| `PAY_FAILED` | unsuccessful candidate; combines failure and expiry | Not guessed as failed/expired |
| `WAIT_PAY`, `PAYING` | pending | Remains unresolved |
| `ORDER_CLOSED` | closed candidate, not proof of user cancellation | Not finalized |
| `ACCEPTED`, `REFUNDING`, `REFUND_SUCCESS`, `REFUND_FAILED` | refund-related observation | Reconciliation; no refund issued |
| Unknown/conflicting query statuses | invalid/unresolved | Reconciliation |
| Notify `Completed` | success candidate | Not finalized |
| Notify `Paying`, `Pending` | awaiting synchronization | Never credited |
| Notify `Expired` | meaning explicitly unclear in documentation | No invented expiry/failure |
| Notify `Failure` | unsuccessful candidate | Not finalized |

The only writable service states remain `verification_pending` and
`reconciliation_required` after checks. SDK launch, SDK authorization completion
and independently verified payment remain separate events.

### Notify review and intentional receiver gate

No trusted UAT notification receiver exists; `/telebirr-uat/notify` is **not**
registered as a provider endpoint. The older transaction webhook records unverified
claims and returns 503; it is not a UAT verifier and was not repurposed.

The new `assessNotification()` is an **offline, side-effect-free validator only**.
It checks candidate signatures and exact merchant/order/amount/currency/reference
identity for the documented flat notification shape. It does not accept unconfirmed
`data` envelopes or `transId` aliases. Duplicate and out-of-order assessments cannot
change funding or balances. This is not a durable webhook inbox, HTTP acknowledgment
implementation or an authenticated-success integration test.

Provider whitelisting is required (upload 490), but HTTPS/whitelisting alone does
not authenticate a payload. The example is labeled an HTTP response although it
shows an event body; retry, acknowledgment, key distribution, replay identity,
timestamp-unit and signature-coverage details are incomplete. Do not acknowledge
or finalize events under an invented contract. Implement an authenticated, bounded,
durable/idempotent inbox and acknowledgment only after those requirements are
confirmed. No successful acknowledgment or financial event is fabricated here.

### Preorder and SDK context decision

No parser or migration 013 relaxation was made. The table (252–254) describes
separate `merch_order_id`, `prepay_id`, `receiveCode`; the create-order example
(265–268) omits prepay ID, but the **Android example (578–581) includes all three**.
The separate prepay field is therefore supported by both the schema and an
official Android example. Its omission elsewhere remains a provider discrepancy,
not permission to derive IDs from arbitrary strings.

The adapter requires the separate actual prepay ID and an exact returned
`TELEBIRR$BUYGOODS$<shortCode>$<two-decimal amount>$<prepayId>$120m`. Missing prepay,
incorrect type/short code/amount, whitespace, forged context, expired attempts and
legacy context fail closed. The prose space before `$prepay_id`, old `InApp`/H5
sample code and extra `/merchant` in a snippet conflict with concrete API/Android
examples; no alternative successful response shape was invented. Existing launch
data validation over TLS is not paid-transaction signature verification.

Kotlin's fixed UAT AAR, FragmentActivity, three initialization fields, one pending
callback, persisted attempt IDs, absolute watchdog and callback cleanup remain.
The uploaded `setReturnApp` call does not establish that the existing UAT AAR
supports it; the prior inspected artifact did not. No reflective/third-party
replacement or speculative lifecycle timing change was introduced.

### Configuration and financial gates

Existing backend-only names remain: `TELEBIRR_ENV`, `TELEBIRR_UAT_ENABLED`,
`TELEBIRR_UAT_SDK_ENABLED`, `TELEBIRR_MERCHANT_APP_ID`, `TELEBIRR_FABRIC_APP_ID`,
`TELEBIRR_SHORT_CODE`, `TELEBIRR_APP_SECRET`, `TELEBIRR_PRIVATE_KEY_BASE64`,
`TELEBIRR_NOTIFY_URL`, `TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64`.

Added documented names:

- `TELEBIRR_UAT_QUERY_ENABLED=false`: independent diagnostic query opt-in; off by
  default. Existing master UAT/environment/config gates must also pass.
- `TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256`: independently confirmed DER-SPKI public-key
  fingerprint, 64 hexadecimal digits; no value supplied.

`.env.example` preserves master/SDK defaults `false`; ignored deployed `.env` files
were not edited. Do not enable any of these during implementation. A diagnostic
query opt-in never permits finalization/credit. The existing master gate is also
used by preorder, so changing it requires separate operator approval even for
future query testing. Capabilities deliberately retain `verification_enabled:false`
and `demo_conversion_enabled:false`. There is **no configurable finalizer/credit
bypass**: service rejects `authoritative:true`, and migration 012 forbids all final
outcomes and non-null `verified_at`. Migrations 012–014 were not changed/applied to
the application schema. Production configuration remains rejected.

### Reconciliation, audit and recovery

Stored intent, row locking, buyer ownership, idempotency and no automatic preorder
replay remain. Query transport exceptions now persist a fixed reason and next
check instead of discarding recovery progress. Only allowlisted reason codes reach
the existing immutable audit; raw statuses, bodies, signatures, customer data,
tokens and keys do not. Duplicate checks within the persisted backoff window make
no second provider call. Existing eight-check exponential schedule (60 seconds to
one hour) survives restarts, then stops with a durable unresolved record. Reaching
the limit does not enable an automatic reset/replay; operator-reviewed recovery is
still needed after configuration changes or exhausted attempts.

Elapsed authorization time remains unknown, not payment failure. Later pending or
failure observations cannot undo a finalized record because no finalization path
exists. Any future finalizer needs transactional evidence storage, final-reference
uniqueness, replay/late-event rules and a separately reviewed migration; this pass
deliberately does not remove the database safety gate.

### Exact external requirements before authoritative verification

1. Authenticated Telebirr **UAT SP verification key/certificate**, signer identity,
   DER-SPKI fingerprint, environment/merchant/product scope, validity and rotation/
   revocation. The available documentation does not say whether the key is per
   merchant/environment, where in the portal it is available, or whether query and
   notify use the same signer. Confirm these through authenticated portal/support.
   Merchant public key, TLS CA and callback-supplied key are not substitutes. No
   alternative documented response-authentication mechanism was established.
2. Full canonical bytes/signature vectors from genuine provider responses: included
   envelope fields, flattening, optional/empty values, encoding, PSS/MGF/hash/salt
   parameters; resolve status-field conflicts and final transaction-ID semantics.
3. Approved organization/product/scenario registration (Cross-App/BuyGoods and this
   wallet-funding-labelled use case), merchant-specific UAT IDs/App Secret and
   registration of the existing merchant UAT public request-signing key.
4. Approved notify URL/whitelist, receipt/ack/retry/replay/freshness/out-of-order and
   late-success rules; correct UAT test accounts, query permissions and authentic
   host APK signer. Confirm Android package/signing/return-activity registration
   requirements with the provider; the upload does not fully specify them.
5. Resolve the missing-prepay example with an actual response contract. No test
   should initiate a payment until a separately authorized controlled UAT plan is
   approved. Even that test must not credit Demo Wallet or escrow.

### Files changed in this pass

- `backend/src/modules/telebirrUat/provider.js`: shared Fabric helper and gated query.
- `backend/src/modules/telebirrUat/evidence.js`: non-authoritative candidate validators.
- `backend/src/modules/telebirrUat/service.js`: sanitized durable query-error recovery.
- `backend/.env.example`: query/fingerprint configuration documentation only.
- `backend/tests/telebirrUat.evidence.test.js`, `telebirrUat.test.js`,
  `telebirrUat.database.js`: synthetic transport/crypto/safety/recovery regressions.
- This file and `docs/telebirr_uat_blocker_resolution.md`: current evidence/results.

No database migration, simulation, wallet, escrow, Flutter/Kotlin/AAR/Gradle or
admin application source was changed in this pass. Pre-existing user changes were
preserved. No replacement package, server, keypair or merchant configuration was
installed/generated for deployment (only ephemeral synthetic test keys).

### Current-pass tests

All provider-facing tests use mock HTTP and generated keys. No real provider token,
preorder, status-query or authorized payment was sent. Database regressions use
disposable schemas or rollback-only fixtures, never application wallet balances.

| Command/check | Actual result |
| --- | --- |
| Backend `npm test -- --silent` | **321/321 passed, 14 suites** |
| `npm run test:telebirr:db` | **27/27 passed**, disposable schema |
| `npm run test:telebirr-demo:db` | **153/153 passed**, disposable schema |
| `npm run test:wallets:db` | **106/106 passed**, disposable schema |
| `npm run test:transactions:db` | **67/67 passed**, disposable schema |
| `npm run test:debo:db` | **83/83 passed** |
| `npm run test:listings:db` | **37/37 passed; rolled back** |
| Flutter `flutter test --concurrency=1` | **172/172 passed** |
| Flutter `flutter analyze` | Passed, no issues |
| Flutter `flutter build apk --debug` | Passed; existing plugin KGP migration warning |
| Admin `npm run build` | Passed, compile/lint/types/static generation |
| Admin `npm run test:disputes` | **14/14 passed** |
| `git diff --check` | Passed |

All commands completed successfully. Expected rejection-path stack traces in the
database/API harnesses were asserted negative cases, not test failures. No build
or database environment blocker remained. External provider trust/registration/
contract requirements, rather than a local test failure, still block authority.

Coverage includes signed query construction/Fabric errors/timeouts/TLS failures,
every listed query status, conflicting/missing fields, wrong keys/signatures,
merchant/amount/currency/reference mismatches, offline notification assessments,
duplicate/out-of-order/no-side-effect behavior, SDK context expiry/forgery/legacy
rejection, persisted throttling, restart and no-credit/finalization guards.
**Authenticated provider success and accepted HTTP notifications are not tested or
implemented as working contracts**: the required trusted key/profile/ack evidence
is missing. Native lifecycle timing was not exercised on a real phone this pass.

---

## Historical initial implementation report (not current readiness)

The remaining sections preserve the original implementation record. Their older
blocker descriptions/test totals are historical; use the current sections above
for verification behavior and the blocker-resolution report for earlier TLS/device
findings.

## Outcome / readiness

This is a **fail-closed, partially integrated UAT implementation**, not a verified end-to-end payment integration. No UAT payment was executed or verified. Existing Demo Wallet, simulated checkout/escrow, refunds, settlements, QR and Digital Debo logic was not replaced. There is **no sandbox-to-demo conversion and no real-money wallet**.

Implemented: official-demo-compatible Fabric authentication and signed preorder adapter; durable idempotent funding records; authenticated buyer APIs; separate funding UI/history; Android AAR bridge; bounded durable reconciliation scheduling; read-only admin monitoring; automated safety tests.

Blocked deliberately:

1. Supplied demo has **no independent payment-status query implementation or documented response contract**.
2. Its notification route simply echoes request bodies; **no notification authentication, signature verification, event identity, or acknowledgment contract** is supplied.
3. Android AAR names a `receiveCode`, while the Node demo produces an **H5 signed raw_request**. No resource establishes the mapping between them. The backend therefore returns `sdk_launch: null`, and the application does not guess a mapping or launch an unrelated interface.
4. Merchant-specific UAT credentials/signing key were not supplied through the current backend environment. Legacy `TELEBIRR_API_KEY`/`TELEBIRR_MERCHANT_ID` are not the required Fabric credentials. Demo-embedded credentials are never reused.
5. No SuperApp Testbed APK/documentation was found in the workspace, and `adb devices -l` found no device.

Do not describe preorder creation, SDK callbacks, a passing build, or mocked test responses as a verified provider payment.

## Resource inspection and SDK details

Located user-provided files, preserved in place:

- `mobile/lib/ET_DEMO_NODE.zip`
- `mobile/lib/SignTool.zip`
- `mobile/lib/EthiopiaPaySdkModule-uat-release.aar`

Archives are now ignored because the Node demo embeds credentials/private key. No demo configuration was extracted into application source. Only the actual AAR was copied to `mobile/android/app/libs/EthiopiaPaySdkModule-uat-release.aar`.

Inspected ZIP source, AAR XML, metadata, `classes.jar` signatures/bytecode via `javap`, external dependencies via `jdeps`, and SignTool JAR metadata. SignTool is a Java GUI (`com.huawei.mobilepayment.Tools`) with BouncyCastle, fastjson and commons dependencies; it is not a server dependency.

Verified Android signatures:

```text
com.huawei.ethiopia.pay.sdk.api.core.utils.PaymentManager.getInstance()
PaymentManager.setPayCallback(PayCallback)
PaymentManager.pay(androidx.fragment.app.FragmentActivity, PayInfo)
com.huawei.ethiopia.pay.sdk.api.core.data.PayInfo.Builder
  setAppId(String), setReceiveCode(String), setShortCode(String), build()
com.huawei.ethiopia.pay.sdk.api.core.listener.PayCallback
  onPayCallback(int, String)
```

- AAR SHA-256 (source and copied artifact match): `8def545406255861827160872e3cc58b0bb0e6cc95ad4db176444a37b5b4d486`.
- AAR minSdk 21, targetSdk 32; installed Flutter defaults to minSdk 24, which satisfies the SDK requirement. Current application ID, signing, compile/target SDK configuration and authentication links are preserved.
- Existing AGP 8.11.1, Kotlin 2.2.20, Java 17 configuration is retained. Added AndroidX Fragment 1.8.9 and changed the existing entry activity to `FlutterFragmentActivity`.
- SDK's external dependency is AndroidX `FragmentActivity`; no separate Kotlin/third-party payment library is inferred. AAR consumer ProGuard file is empty.
- UAT host package is exactly `com.ethiotelecom.telebirr.customer.uat`, minimum version code `10100313`. SDK explicitly launches `com.huawei.module_checkout.inapp.PaySdkEnterActivity`.
- Host checks mirror the evidenced package/version/activity requirements, not a guessed signing-certificate pin. The official testbed APK/certificate was not supplied, so install only the portal-issued APK and verify its provenance before device testing.
- AAR manifest supplies visibility queries for SIT, UAT and `cn.tydic.ethiopay`. No blanket `QUERY_ALL_PACKAGES` permission was added.
- AAR exports `com.huawei.ethiopia.pay.sdk.api.core.service.PayService` with **no caller permission**. Its callback is consequently untrusted; changing this to a guessed signature permission would break the official integration. Backend verification remains mandatory.
- Bytecode callback codes: `0` SDK completion, `-3` cancellation, `-2` invalid parameters, `-10` missing host, `-11` unsupported host. These describe interaction only, never payment evidence.
- Kotlin channel allows one outstanding result, stores attempted funding IDs without payment payloads to prevent repeat launches across process recreation, times out after three minutes, clears callbacks on disposal, and prevents another launch in the same Activity after timeout. SDK has no evidenced cancellation API. After interruption, recover through backend history rather than relaunching automatically.

## Provider contract implemented from actual demo

Pinned UAT gateway:

```text
https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway
POST /payment/v1/token
POST /payment/v1/merchant/preOrder
```

- Token body: `{appSecret}`; header: `X-APP-Key` = Fabric App ID.
- Preorder headers: JSON, `X-APP-Key`, `Authorization` = Fabric token exactly as demonstrated (no invented Bearer prefix).
- Request fields: timestamp in seconds, crypto-random 32-character nonce, `payment.preorder`, version `1.0`, `biz_content`, signature, `SHA256WithRSA` label.
- Business fields: `trade_type=InApp`, merchant app ID/code, unique random merchant order ID, authoritative decimal ETB amount, title, `timeout_express=120m`, payee identifier = merchant code, identifier type `04`, payee type `5000`.
- Canonicalization: flatten business fields, omit the exact demo exclusions, ASCII sort, join raw `key=value` pairs with `&`. Ambiguous delimiters/non-string/duplicate fields are rejected rather than signed.
- **Actual signing is RSA-PSS/SHA-256/MGF1 with 32-byte salt**, despite the wire label `SHA256WithRSA`. This was verified bidirectionally against the actual demo's signing library using generated temporary keys.
- Fixed 12-second HTTP timeouts, bounded response sizes, no redirects, explicit verified TLS HTTPS agent. No Axios error object, token, complete signature payload, key, SDK payload or raw provider response is logged or returned to Flutter.
- Prepay ID is validated and stored as a **preorder reference**, not assumed to be the final provider transaction ID or proof of payment. Any echoed merchant/amount/currency identity fields must match. Authoritative final transaction-reference mapping is still blocked on documentation.
- No automatic preorder replay: an ambiguous provider response may correspond to an existing provider order. A committed pending intent survives crashes/network errors; retries with the same key return the same record.
- No speculative status endpoint, callback signature algorithm, refund API or H5 JS bridge is implemented. Existing simulated payment stubs are not called by this UAT integration.

## Existing components reused

- Existing Express app and configured port (default 4000); **no additional server**.
- Supabase bearer verification and application-account mapping in `auth.js`, database-backed RBAC in `rbac.js`.
- Existing pg pool and transaction/advisory-lock patterns.
- `wallet.service.amount/key` validation and `money.formatMinor` exact integer accounting; no floating-point money math.
- Flutter authenticated `listingApi()` Dio transport/backend URL configuration and existing Wallet & Escrow entry point.
- Existing admin wallet audit layout, data hooks and paginated tables.
- Existing standalone cron/job pattern used by checkout recovery. No checkout-recovery behavior was modified.

## API endpoints

All below use the existing Express app. Buyer ownership is always the authenticated application account, never a caller-supplied ID.

| Method/path | Access | Purpose |
| --- | --- | --- |
| `GET /api/wallet/telebirr-uat/capabilities` | buyer | Sanitized configuration/SDK/verification readiness |
| `POST /api/wallet/telebirr-uat` | buyer | `{amount: "12.34", idempotency_key: "..."}`; durable intent and preorder |
| `GET /api/wallet/telebirr-uat` | buyer | Own history, limit/offset pagination |
| `GET /api/wallet/telebirr-uat/:id` | buyer | Own authoritative stored state |
| `POST /api/wallet/telebirr-uat/:id/sdk-complete` | buyer | Untrusted interaction-ended signal, then verification attempt |
| `POST /api/wallet/telebirr-uat/:id/verify` | buyer | Bounded reconciliation attempt |
| `GET /api/wallet/telebirr-uat/admin` | admin | Read-only cross-buyer UAT monitoring |

There is no notification receiver without a verified official authentication contract, no success override endpoint, and no credit/conversion/withdrawal endpoint. SDK-complete bodies/statuses/references are ignored. Polling never proves payment by itself.

## Database / state machine

`012_telebirr_uat_funding.sql` adds:

- `telebirr_uat_funding`: immutable identity/buyer/amount/currency/provider/environment/merchant reference/idempotency/creation/expiry; unique provider preorder reference plus a separate nullable final `provider_transaction_reference` (not populated without official verification); status, verification time and durable retry schedule.
- `telebirr_uat_audit`: immutable, deduplicated sanitized event history; no arbitrary provider/SDK bodies.
- Buyer guard, immutable identity/reference guard, unique buyer/key and reference constraints, RLS and client-role revocations.
- No Demo Wallet/escrow writes, triggers, balance changes or conversions.

Current reachable states:

```text
pending --validated preorder reference--> awaiting_authorization (SDK mapping blocked)
pending --ambiguous preorder/crash recovery--> reconciliation_required
awaiting_authorization --verification requested--> verification_pending
unresolved + elapsed window / exhausted checks --> reconciliation_required
```

All outcomes remain unverified. `verified_success`, `failed`, `cancelled`, `expired` are modeled for UI/future contracts but **database CHECK constraints forbid them in this phase**, and `verified_at` must remain NULL. SDK cancellation is not authoritative provider cancellation. Elapsed authorization window is not proof of failed payment. Removing these guards requires a reviewed verifier implementation and migration, not an environment flag or admin action.

Verification checks back off exponentially from 60 seconds to a one-hour cap, maximum eight checks. Unknown attempts remain durable and visible after retry exhaustion; they are not silently failed, refunded or credited. No provider-query requests can run until documentation exists.

## Configuration and deployment

Fill only ignored `backend/.env`, using **your merchant-specific UAT** values from secure storage:

```dotenv
NODE_ENV=development
TELEBIRR_UAT_ENABLED=false
TELEBIRR_ENV=uat
TELEBIRR_MERCHANT_APP_ID=
TELEBIRR_FABRIC_APP_ID=
TELEBIRR_SHORT_CODE=
TELEBIRR_APP_SECRET=
TELEBIRR_PRIVATE_KEY_BASE64=
TELEBIRR_NOTIFY_URL=
```

Key value is base64-encoded PEM RSA private key, at least 2048 bits; not JSON. Do not include any provider credential/key/token in Flutter's `.env`. Leave notify URL unused until its security contract is implemented. Configuration is validated at provider initialization. Production is rejected even if opt-in is true. No deployment `.env` was modified.

After prerequisites 001–011 exist, review/apply migration using the existing backend environment:

```sh
cd backend
npm run db:migrate:telebirr-uat
npm run telebirr:reconcile
```

Schedule reconciliation with the project's cron/systemd deployment pattern (e.g. once a minute), independently of checkout recovery. Migration runner checks whether the UAT table already exists; it does not rewrite existing records. This implementation did not automatically migrate the application's live schema.

**Existing database TLS debt:** `backend/src/config/db.js` and some pre-existing regression harnesses use `rejectUnauthorized:false`. This task did not add or copy that bypass into the provider or new DB test. The new DB integration test requires verified TLS and currently fails because the configured chain is not trusted. Supply the database CA through an approved trust store / `NODE_EXTRA_CA_CERTS`; do not disable certificate verification. Before any production work, separately correct the existing pool TLS setup with the proper CA.

## Files added / modified

Backend:

- Added `src/modules/telebirrUat/{provider,service,routes}.js`.
- Added `db/migrations/012_telebirr_uat_funding.sql`.
- Added `src/jobs/{migrateTelebirrUat,reconcileTelebirrUat}.js`.
- Added `tests/telebirrUat.test.js`, `tests/telebirrUat.routes.test.js`, `tests/telebirrUat.database.js`.
- Modified `src/app.js`, `src/server.js` (opt-in startup validation), `package.json`, `.env.example`.

Mobile:

- Added official `android/app/libs/EthiopiaPaySdkModule-uat-release.aar`.
- Modified `android/app/build.gradle.kts` and existing `MainActivity.kt`.
- Added `android/app/src/main/kotlin/com/astu/mobile/TelebirrChannel.kt`.
- Added `lib/core/platform/telebirr_sdk.dart`, `lib/data/remote/telebirr_api.dart`.
- Added `lib/features/transactions_escrow/presentation/screens/telebirr_funding_screen.dart`.
- Modified existing `wallet_screen.dart` to offer Telebirr UAT separately from Add Demo Funds.
- Added `test/telebirr_test.dart`.

Admin: added `src/app/wallets/TelebirrUatMonitor.tsx`, modified existing `src/app/wallets/page.tsx`.

Root: modified `.gitignore` to protect vendor archives/key files and linked this report from `README.md`. Original user-supplied resource files were not removed or overwritten.

## Tests and verification

Automated tests use synthetic payloads/test doubles, not real UAT payment results. Backend coverage includes exact positive amount validation, auth/RBAC, account ownership, canonicalization/RSA-PSS, auth/signing/transport errors, response mismatches, idempotency, restart-style recovery, duplicate/out-of-order interaction signals, retry bounds, safe expiry, and absence of wallet/escrow writes. Flutter covers platform/channel validation, unsupported platform, missing host/plugin, SDK error/cancellation/interruption signals, pending funding display and no credit/success claim.

Authoritative successful/failed payments, signed notification deduplication and merchant/amount/currency matching **cannot be integration-tested without the missing official contracts**. Tests of rejecting unverified signals are not substitutes for those provider integration tests.

| Command/check | Actual result |
| --- | --- |
| Backend `npm test -- --silent` | **184/184 passed**, 11 suites; initial two test-fixture bugs corrected before this passing rerun |
| Bidirectional check against actual official signing library | **Passed**, generated temporary RSA keys; never used merchant/demo private keys |
| `flutter analyze` | **Passed, no issues** after four new style warnings were corrected |
| Targeted Flutter Telebirr + Demo Wallet + transaction tests | **24/24 passed** after correcting a test-only platform-override cleanup |
| Full `flutter test --concurrency=1` | **157/157 passed**, including Produce Listing, Digital Debo, Demo Wallet, checkout and QR regressions |
| Existing offline listing form test in isolation | **Passed**; its first full-suite run timed out with an uninitialized Supabase assertion |
| Admin `npm run build` | **Passed**, compilation, lint/types and static generation |
| Admin `npm run test:disputes` | **14/14 passed** |
| `flutter build apk --debug` | **Passed**, `mobile/build/app/outputs/flutter-apk/app-debug.apk`; existing KGP plugin migration warnings, not compilation errors |
| Merged debug manifest inspection | **Passed**: minSdk 24 / targetSdk 36, UAT package visibility present, SDK service exported without permission as supplied, no `QUERY_ALL_PACKAGES` |
| APK security inventory | **Passed**: demo/SignTool archives absent; bundled Flutter environment contains no backend-only Telebirr configuration |
| New `npm run test:telebirr:db` | **Blocked/failed** before schema creation: `SELF_SIGNED_CERT_IN_CHAIN`; no TLS bypass added |
| `npm run test:listings:db` | **37 PostgreSQL/API checks passed**; fixtures rolled back |
| `npm run test:debo:db` | **83 PostgreSQL/PostGIS/API checks passed**, including durable checkout recovery and unresolved external payment safeguards |
| `npm run test:transactions:db` | **67 database checks passed**, including escrow/QR/refund/settlement and recovery regressions |
| `npm run test:wallets:db` | **106 real database checks passed** on the unrestricted rerun, including wallet conservation, atomic rollback, concurrent spending, refunds, settlements and read-only admin audit |
| `npm run test:checkout:live` | **25 real Supabase checkout checks passed**; temporary Auth identities removed, public fixtures rolled back, no payment provider contacted |
| `adb devices -l` | **No device connected** |
| Actual preorder / authorized and verified UAT payment | **Not executed**; missing merchant-specific credentials and official contracts |

The first parallel full Flutter run had 155 passes and two failures (the corrected Telebirr test-only override and the offline listing timing issue). The isolated listing rerun and complete serialized rerun both passed; no unrelated listing implementation was changed. Android debug build passed twice, including the final native source changes. The initial wallet DB regression invocation exceeded the runner's 240-second limit after many passing checks; the rerun without that artificial cutoff completed successfully with 106 passing checks.

## Safe graduation demonstration

1. Keep free Demo Funds and simulated checkout/QR/escrow demonstrations clearly labeled virtual.
2. Show the separate Telebirr Sandbox screen and admin monitoring; explain documentation/configuration blockers honestly. With current defaults, preorder creation is disabled.
3. Do not enable preorder access until merchant-specific UAT credentials and approved UAT access are configured. Creating a preorder does not itself complete payment.
4. Obtain official Android `receiveCode` creation/mapping documentation; supported independent query and/or signed notification specification; signature key/certificate chain, payload examples, status semantics, order expiry and late-confirmation rules. Do not send secrets in source control or chat.
5. Implement and review authoritative verification with merchant, order, final provider reference, exact amount, currency and status matching; add atomic final-state/evidence storage and integrity/replay/late-event tests. Only then replace the database final-state block in a new migration and enable SDK initialization responses.
6. Install the compatible official UAT host on a connected Android device and ensure the merchant's package/signing registration matches `com.astu.mobile`. Use only UAT accounts, never real-money credentials.
7. Execute an actual authenticated buyer UAT payment and independently verify it; confirm no virtual wallet credit/escrow change. Re-test cancellation, network interruption, duplicates and delayed confirmation. Record sanitized evidence.
8. Until step 7 succeeds, describe this as a locally implemented, safety-gated integration—not an end-to-end working Telebirr payment system.
