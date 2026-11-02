# Telebirr third-party integration review

Reviewed 2026-11-01. **Locally tested, safety-gated; not authenticated UAT-ready.**
No provider token/order/payment request was made. No merchant key or ignored
environment file was read, changed, converted or displayed. No replacement
library was installed. Existing user changes were preserved.

## Evidence and scope

Reviewed the unofficial [overview](https://telebirrdoc.vercel.app/in-app-sdk),
[Flutter integration](https://telebirrdoc.vercel.app/in-app-sdk/flutter-integration),
[create-order](https://telebirrdoc.vercel.app/in-app-sdk/request-create-order), and
[notify](https://telebirrdoc.vercel.app/in-app-sdk/notify) pages. Claims of successful
testbed/production payments on those pages or in source comments are the author's
claims, not tests of this merchant or independently authenticated provider evidence.

Inspected source without installing or executing either library:

- Node library v3.4.1 at commit
  [`2ed1fd221e59b347ba0ea7f150edc641f7d9a6aa`](https://github.com/MelakuDemeke/telebirr-js/tree/2ed1fd221e59b347ba0ea7f150edc641f7d9a6aa).
- Flutter plugin v0.1.0 at commit
  [`054cfa12fb77179ee18110063d051144aab03c28`](https://github.com/MelakuDemeke/telebirr_inapp/tree/054cfa12fb77179ee18110063d051144aab03c28).

The [official documentation root](https://developer.ethiotelecom.et/docs/) is a
client-rendered shell. Re-fetched these publicly served official content assets
as text; did not execute their JavaScript:

- [RequestCreateOrder](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-request-create-order-8-a-8-410.js)
- [DevelopmentPreparation](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-development-preparation-3-f-8-adb.js)
- [queryOrder](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-query-order-6-aa-08e.js)
- [Notify](https://developer.ethiotelecom.et/docs/content---docs-in-app-sdk-integration-notifyfee-47f.js)

These are provider-published documentation, **not authenticated transaction
fixtures or an authenticated SP-key distribution channel**. Older observations in
[the blocker-resolution report](telebirr_uat_blocker_resolution.md), including
device/TLS probes, were not repeated and are not new test results here.

## 1. Already implemented correctly

### Express preorder versus the guide

`backend/src/modules/telebirrUat/provider.js` already implements the intended
standalone-app contract, rather than the older H5 checkout flow:

| Item | Guide | Existing adapter / assessment |
| --- | --- | --- |
| Gateway | UAT gateway on port 38443 | Same pinned HTTPS origin/path |
| Token | `/payment/v1/token`, `X-APP-Key`, `{appSecret}` | Same; token kept backend-only |
| Preorder | `/payment/v1/inapp/createOrder` | Same; not `/merchant/preOrder` |
| Envelope | `payment.preorder`, `1.0`, seconds, nonce | Same; cryptographically random nonce |
| Scenario | `trade_type: Cross-App` | Already correct; official table defines standalone-app payments this way |
| Business type | Omitted in guide's raw request | Adapter sends `BuyGoods`; official table marks `business_type` mandatory. Do not remove it |
| Merchant/order | Merchant app ID, short code, merchant order ID | Backend-owned config; random alphanumeric order reference persisted before network I/O |
| Amount | Decimal ETB | Exact integer cents formatted to two decimals; no floating-point amount mapping |
| Timeout/notify | `120m`, notification URL | Same timeout; requires HTTPS notification destination |
| Signature | Wire label `SHA256WithRSA` | RSA-PSS/SHA-256 with 32-byte salt, not inferred PKCS#1 v1.5 |
| Result | `SUCCESS`, `0`, `biz_content.receiveCode` | Requires those values, order correlation, valid prepay ID and exact receiveCode |

Official request preparation supports PSS and flattened ASCII-sorted fields.
The existing adapter also rejects ambiguous delimiters, duplicate flattened
fields and non-string values. Its generated preorder has no empty optional fields;
do not blindly reuse this request canonicalizer for all inbound response shapes.
Official embedded examples themselves still mix obsolete `InApp`/H5 code with
the `Cross-App` table/example. Prefer the scenario definition and confirm merchant
product approval; neither library examples nor old snippets override that.

### Is receiveCode authoritative, and is the mapping correct?

- **Documented field: yes. Observed genuine response from this merchant: no.**
  The official SDK response table and example include `biz_content.receiveCode`.
  Current automated responses are mocks, not captured provider responses.
- The adapter requires the **actual returned value** to equal
  `TELEBIRR$BUYGOODS$<shortCode>$<two-decimal ETB>$<prepayId>$120m` byte-for-byte.
  Missing, altered, whitespace-padded or mismatched values fail closed.
- `preorder()` returns validated prepay/context, not the raw provider body.
  `service.js` reconstructs launch data from immutable context using the same
  serializer. Because the returned value was checked for exact equality first,
  the mobile value is equivalent, not an unchecked invented receiveCode.
  It is exposed only under the existing SDK gate and qualifying create/retry flow.
- This is authoritative **preorder launch data over verified TLS**, not a signed
  proof that the customer paid. No response signature is currently verified.
- **Compatibility caveat:** the official concrete success example includes
  `merch_order_id` and `receiveCode` but omits a separate `prepay_id`; the unofficial
  example includes all three. The adapter requires a separate `prepay_id` too.
  A legitimate receiveCode-only response would therefore remain unresolved and
  never launch. Confirm the actual merchant response before relaxing this guard
  or introducing a receiveCode parser; the unofficial sample cannot settle it.

### Existing safety boundaries

Verified TLS and default Node hostname verification remain enabled; the adapter
does not follow redirects, limits body sizes/timeouts and sanitizes transport
errors. The bundled CA intermediate is TLS trust, not a payment verification key.

The service persists idempotent intent before preorder and never automatically
replays an ambiguous preorder. SDK callbacks cannot finalize payments. Verification
remains explicitly non-authoritative; even accidental adapter success is rejected.
Migration 012 forbids final states and non-null verification timestamps, 013 binds
SDK context, and 014 keeps Telebirr Simulation separate. No UAT path credits Demo
Wallet or escrow. All three migrations and their runners were left unchanged.

## 2. Private-key compatibility: small, independently justified fix

Previously `crypto.createPrivateKey(Buffer.from(value, 'base64'))` defaulted to
PEM parsing. It accepted base64-of-PEM but rejected base64 DER PKCS8. A newly
generated synthetic RSA-2048 PKCS8 DER fixture reproduced this failure before
the fix; no actual merchant key was needed.

The parser now retains the PEM path and, on parse failure, explicitly attempts
`{ key: decoded, format: 'der', type: 'pkcs8' }`. Parsing is in memory only, with
the same RSA >=2048-bit checks and sanitized `UAT_PRIVATE_KEY_INVALID` failure.
The environment value is not rewritten, and no key is exported or logged by
application code. This does not add arbitrary encrypted-key, JSON/JWK, raw-PEM
environment or DER PKCS1 support. `.env.example` documents the accepted formats.

The third-party normalizer offers broader PEM/DER guessing, but is unnecessary
here. The provider's official preparation describes merchant-generated keys;
the library's claim that the provider issues bare DER is not established as a
universal requirement. Explicit DER parsing is justified by Node compatibility
and the synthetic regression, not that claim.

## 3. Flutter plugin versus existing Kotlin channel

Source: plugin `android/.../TelebirrInappPlugin.kt`, `lib/telebirr_inapp.dart`,
`lib/src/types.dart`, and `android/build.gradle.kts`. Existing code:
`mobile/android/app/src/main/kotlin/com/astu/mobile/TelebirrChannel.kt`,
`MainActivity.kt`, `mobile/lib/core/platform/telebirr_sdk.dart` and funding screen.

| Behavior | Third-party plugin | Existing implementation |
| --- | --- | --- |
| Native SDK | Same PaymentManager/PayInfo API; requires FragmentActivity | Already uses FragmentActivity and the supplied official UAT AAR |
| Completion/cancel | Maps `0`, `-3`, errors, missing/unsupported host | Same important interaction meanings; raw message intentionally withheld |
| Payment proof | Documentation tells server to verify | Callback status never finalizes/credits; backend verification requested for completion, cancellation and errors |
| No callback | After host pause/resume, 2.5-second grace then synthetic `-100/noResult` | Three-minute watchdog returns `interrupted`, clears callback, blocks further launches in that Activity |
| App resume | Native lifecycle observer completes pending future | Flutter reloads history on resume only when not busy; while awaiting SDK, verification waits for callback/watchdog |
| Process death | In-memory pending result lost; docs advise startup checks | Durable backend history plus persisted local launched IDs; no automatic relaunch; history shown on reopening |
| Concurrent calls | Supersedes previous result and starts another payment | Rejects busy/previously launched attempts; safer with singleton callback and no callback attempt ID |
| Teardown | Activity detach unregisters lifecycle but does not settle pending result; finish does not clear SDK callback | Activity destruction disposes channel, settles pending result and clears callback |
| Environment | Build-time `auto`: UAT debug, production otherwise, plus Dart mismatch check | Fixed UAT AAR/host, no automatic production switch |

The plugin improves return-without-result latency, but 2.5 seconds is its own
heuristic, not an official timeout or cancellation. Its supersession plus singleton
callback and lack of persistent attempt IDs can associate late callbacks with a
new call. No absolute watchdog exists when a pause/resume never occurs. Dart also
trims receiveCode despite documentation saying to pass it unchanged. Its reflective
`setReturnApp` call silently skips unavailable methods in the UAT SDK. Adding this
plugin alongside the AAR would also risk duplicate native classes/vendor binaries;
its bundled binaries have not been provenance/hash-validated in this review.

**Recommendation:** retain the channel. Consider a separately tested resume grace
timer only as an unknown/interrupted signal, preserving duplicate/late-callback
guards and the absolute watchdog. It is not needed for signature/status readiness.
Startup currently displays unresolved history; it does not automatically query
every unfinished order. Future provider-query recovery must be bounded and must
never automatically relaunch. No Kotlin, Flutter or Gradle behavior was changed.

## 4. Node status-query and notification security/compatibility

### Query implementation

`Telebirr.queryOrder()` signs `payment.queryorder`, sends merchant app/code and
merchant order ID and/or prepay ID to `/payment/v1/merchant/queryOrder` with Fabric
headers. The official InApp page supports that endpoint and specifically requires
merchant order ID; prepay-only lookup needs provider confirmation.

`getOrderStatus()` accepts `trade_status`, `tradeStatus`, `order_status`, then
`orderStatus`; accepts `trans_time` as an end-time alias; and uses a generic
case-insensitive success set including `PAY_SUCCESS`, `SUCCESS`, `PAID`, `COMPLETED`.
This is practical compatibility evidence, **not an authoritative status contract**.
Conflicting aliases are not rejected. Missing currency defaults to ETB, missing
merchant order ID falls back to the caller's ID, and values can be string-coerced.
Those defaults are unsuitable as evidence for exact merchant/order/currency binding.

The shared response pipeline checks HTTP/JSON and a business code when present,
but does not require a successful envelope or verify the query response signature.
It does not itself match expected merchant, exact amount, currency or final provider
reference. `paid: true` is therefore not sufficient for our finalizer. The official
query page explicitly describes a response signed by the **SP's private key**.

### Signed notification implementation

`NotificationHandler` parses JSON, optionally unwraps `data`, verifies via
`SignatureVerifier`, and interprets success. PSS/SHA-256 with a 32-byte salt agrees
with our request signing and is a credible candidate for provider verification.
But the following must not be copied into a trusted payment finalizer:

- **Trust fallback:** absent `telebirrPublicKey`, the verifier derives a public key
  from the configured merchant private key. Comments even suggest the provider
  commonly signs using the merchant's keypair. The official query contract names
  the SP signer. The merchant public key is not an acceptable substitute for the
  authenticated Telebirr SP key. No such fallback exists in our integration.
- Verification only requires a nonempty `sign_type`; it does not enforce the
  permitted label. It tries multiple signature decodings and a `transId` ->
  `trans_id` canonicalization alias based on the author's observed production
  payload. Both-key conflicts and provider coverage must be specified, not guessed.
- Shared canonicalization stringifies arbitrary values, overwrites duplicate
  flattened fields, and excludes several fields beyond `sign`/`sign_type`.
  A cryptographically valid signature does not establish coverage of every field
  that application code might consume. Require strict types, no conflicting aliases
  and a documented covered-field set before trusting normalized payment information.
- Helpers default absent currency to ETB, may substitute prepay ID for final payment
  ID, and accept generic success/status aliases. Verification/extraction helpers can
  be called independently; only `handle()` enforces verification first. None adds
  durable replay protection, merchant/amount matching or atomic ledger integrity.
- The guide's raw PHP notify example sorts then uses `http_build_query` (URL encoding)
  and default OpenSSL SHA-256 RSA verification (PKCS#1 v1.5). The inspected Node code
  instead hashes raw unescaped flattened pairs with RSA-PSS. This is a substantive
  inconsistency, not a resolved notification signature specification.
- Current Node transport verifies TLS/hostname by default and adds CAs, but offers
  `verifySsl:false` and even recommends it as a UAT last resort. **Never adopt that
  workaround.** Its body read is unbounded and its documented total timeout is
  implemented as header/body timeouts, not a full wall-clock deadline.
- Shared retries are opt-in and default off, but enabling them applies to mutation
  operations too; do not replay ambiguous preorder/refund operations without a
  provider-approved idempotency contract. Error paths can retain/interpolate raw
  response bodies; do not expose those exceptions to clients or general logs.

These are scoped source-review findings, not claims of an exploited vulnerability
or proof that the author never completed their own UAT tests.

## 5. Do the references resolve the old ambiguities?

**Partially explanatory, not sufficient to unlock finalization.** The official
query table still puts the payment vocabulary under `trade_status`, misdescribes
`order_status` as currency, and its example uses `order_status: PAY_SUCCESS`.
The official notification uses `trade_status: Completed`; `Paying`, `Pending`,
`Expired`, `Failure` are also described. `Pending` is not final success and elapsed
time is not authoritative failure. The Node library corroborates differing
query/notify vocabulary but cannot establish which field wins in a conflict.

Official preparation establishes PSS, ASCII ordering and flattening for request
signing. It does not supply an authenticated SP key, complete known-good response
verification vectors, or settle notification encoding/alias/envelope coverage.
The unofficial guide/library disagree about encoding and RSA padding. Neither
signature names alone nor a successful SDK callback resolves this. Keep `verify()`
non-authoritative; do not implement a permissive multi-format finalizer.

## 6. Official-provider requirements still missing

Obtain confirmation through the authenticated merchant portal or verified provider
support, without posting credentials or private keys in chat/source control:

1. **Exact verification key:** Telebirr's **UAT SP response/notification-signing RSA
   public key or certificate** for this gateway/product/merchant routing. No exact
   key bytes, fingerprint, key ID or certificate serial can be established from
   the available references. Obtain authenticated PEM/SPKI or certificate, SHA-256
   fingerprint, algorithm parameters, scope (query vs notify), validity, rotation/
   revocation rules and any key-ID selection mechanism. Confirm whether both
   channels use the same signer. Pin/approve it out of band; never trust a key
   supplied in a callback, merchant public-key file or TLS CA bundle.
2. Approved organization/merchant registration and subscription to the standalone
   **Cross-App/BuyGoods** payment product. Official preparation requires organization
   phone/name/contact/business scope/address and provider approval. Confirm that
   this exact wallet-funding-labelled use case is allowed, not merely goods checkout.
3. Merchant-specific UAT merchant app ID, short code, Fabric app ID, app secret,
   and registration of the **existing merchant UAT public signing key** with the
   provider. Merchant private key remains backend-only; test/production keypairs
   are separate. Presence/registration was not rechecked against ignored env here.
4. Exact approved HTTPS notify URL, provider-side whitelist/configuration, reachability
   and authenticated verification design. Current backend has no trusted notify
   receiver; setting a URL alone does not implement one. Clarify whether Android
   package `com.astu.mobile`, return activity, signing-certificate fingerprints and
   debug/release variants require registration; public pages reviewed do not settle it.
5. Authentic UAT host APK/source and signing fingerprint for the existing AAR,
   supported versions/accounts, test merchant permissions and allowed test amounts.
   Earlier package compatibility observations do not prove publisher provenance.
6. Sanitized, complete, genuinely signed preorder/query/notification fixtures for
   this product, including returned prepay/receiveCode fields; authoritative status
   field/vocabulary/conflict rules; final transaction-reference semantics; canonical
   bytes/encoding/empty-field/alias/envelope/signature coverage and PSS parameters.
7. Notification acknowledgement body/status, retry schedule, freshness/replay IDs,
   duplicates, out-of-order/late success, expiry/cancellation and reconciliation rules.
   The guide's 15-retry schedule/JSON acknowledgment was not established by the
   official InApp Notify asset and should not be treated as confirmed.

`TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64` remains a reserved trust dependency, not an
active verifier. Nothing in this review selects a key for it or enables a finalizer.

## 7. Smallest safe preparation and changes made

**Implemented only:** backend DER PKCS8 import fallback, matching `.env.example`
comment, synthetic-key regressions, a test locking in the absence of a hostname
verification override, and this report. Existing PEM configuration remains valid.

**Next, without enabling finalization or credit:** resolve the provider checklist;
confirm preorder response shape before any mapping relaxation; prepare strict
verification/evidence-only tests and controlled UAT test plan. Any future query or
notify implementation should initially record verified evidence without changing
balances or removing migration 012's final-state gate. Include bad signatures,
wrong key/merchant/order/amount/currency, missing fields, alias conflicts, replay,
late callbacks, app death, cancellation and timeout scenarios.

Only after explicit merchant/test approval should an operator perform a genuine
authenticated UAT authorization and independently verify provider evidence. That
test must not credit Demo Wallet or escrow. A local test suite, author's examples,
TLS handshake or successful preorder alone cannot establish official UAT readiness.

### Regression results from this review

| Check | Result |
| --- | --- |
| Pre-fix synthetic DER PKCS8 reproduction | Failed as expected: `UAT_PRIVATE_KEY_INVALID`; 76 other targeted checks passed |
| `cd backend && npm test -- --silent` | **240/240 passed, 13 suites** |
| `cd mobile && flutter test --concurrency=1 test/telebirr_test.dart test/telebirr_demo_test.dart test/wallet_test.dart` | **35/35 passed** |
| `git diff --check` | Passed |

No database migration/live database test, Android device authorization, provider
token/preorder/query call, or genuine authenticated UAT payment was executed.
Flutter tests cover Dart/UI behavior, not native lifecycle timing on a real device.
Telebirr Simulation, Demo Wallet, escrow, migrations 012–014 and Android SDK
integration remain unchanged; no enable flags or merchant registrations were set.
