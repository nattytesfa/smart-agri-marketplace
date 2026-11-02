# Telebirr UAT blocker resolution

> Historical blocker-resolution pass. The uploaded-document review and current
> disabled query diagnostics, trust gates and regression results are maintained in
> [the current UAT report](telebirr_uat.md#current-outcome-uploaded-document-review-2026-11-01).
> No authoritative provider confirmation or financial finalization has been enabled.

## Current outcome

The existing integration was extended, not replaced. SDK receiveCode mapping
and verified client-side TLS connectivity are resolved locally. Production
payments, automatic credits and authoritative payment finalization remain
disabled. **No genuine UAT order/payment was created or independently verified.**

No merchant credentials, signing keys, callback URLs, enable flags or portal
registrations were generated or populated. Existing `.env` files were preserved.

## Official documentation and sample findings

The supplied direct [Start Pay Order URL](https://developer.ethiotelecom.et/docs/In%20App%20SDK%20Integration/%20CheckOut)
returns HTTP 404 on a direct server request. The official documentation is a
client-rendered Docusaurus site, available through its [documentation root](https://developer.ethiotelecom.et/docs/).
Its own `main.js` registry and publicly served content chunks contain the page
and adjacent InApp API documentation. Source maps were inspected as text, not
executed as code.

Reviewed official content assets (all under `https://developer.ethiotelecom.et/docs/`):

- `content---docs-in-app-sdk-integration-check-outbfe-02f.js`: Start Pay Order.
- `content---docs-in-app-sdk-integration-request-create-order-8-a-8-410.js`: SDK order API.
- `content---docs-in-app-sdk-integration-android-in-app-sdk-integration-1-bd-ba0.js`: native SDK and sample.
- `content---docs-in-app-sdk-integration-development-preparation-3-f-8-adb.js`: registration, key exchange, RSA-PSS signing.
- `content---docs-in-app-sdk-integration-query-order-6-aa-08e.js`: independent query API.
- `content---docs-in-app-sdk-integration-notifyfee-47f.js`: signed notification fields and whitelisting.

Also inspected the official [Android SDK demo ZIP](https://developer.ethiotelecom.et/developer_tools/static/download/AndroidSDK_demo.zip),
without running its code or reusing embedded configuration. Its UAT AAR hash
matches the existing supplied/copied AAR exactly:
`8def545406255861827160872e3cc58b0bb0e6cc95ad4db176444a37b5b4d486`.
The sample passes the server-returned `receiveCode` into the same three builder
methods already integrated. No native SDK bridge/Gradle configuration was replaced.

### Exact receiveCode serialization

```text
TELEBIRR$BUYGOODS$merch_code$total_amount$prepay_id$timeout_express
```

- Exactly six fields, five literal `$` delimiters; uppercase `TELEBIRR` and `BUYGOODS`.
- **No spaces, trimming, URL encoding, extra quotes, or trailing newline.**
- `merch_code`: the request-bound merchant short code, 2–16 digits, starting with 1–9.
- `total_amount`: exact positive ETB, formatted from integer cents with exactly two decimals. The API allows at most two decimals; its concrete response sample normalizes request `12` to receiveCode `12.00`.
- `prepay_id`: actual successful SDK preorder response ID, alphanumeric, 1–128 characters; never generated locally.
- `timeout_express`: request-bound `120m` in this implementation, lowercase `m`, not `120`, seconds, or `120M`. API documents 1–120 minutes; existing orders use 120 minutes.
- `appId`: merchant app ID, alphanumeric, 1–32 characters.

The parameter-description prose contains `total_amount $prepay_id` (a space).
The actual SDK createOrder response sample has **no space** and uses `$120m`.
The Android page also has an older inconsistent `$30` illustration and a `BUYGOOD`
placeholder typo. Implementation follows the concrete SDK createOrder response,
the parameter constraints and the Start Pay `BUYGOODS` contract, not those typos.

### Correct SDK order endpoint and mapping

Pinned UAT base remains:
`https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway`.

- Fabric token: `POST /payment/v1/token` (unchanged).
- SDK preorder: **`POST /payment/v1/inapp/createOrder`**, method `payment.preorder`.
- `trade_type=Cross-App` is documented for a standalone merchant app; `business_type=BuyGoods` is mandatory. Merchant product/scenario approval must still be confirmed with Telebirr.
- An HTTPS `notify_url` is now required by configuration, matching the SDK API's mandatory field. It must be merchant-controlled, authenticated and provider-whitelisted. No unsigned receiver was introduced.
- Removed old optional demo-only payee fields; no guessed `5000` payee type is sent.
- Require `result === "SUCCESS"`, `code === "0"`, matching `merch_order_id`, a valid actual `prepay_id`, and exact matching server `receiveCode`. Reject echoed identity/amount/currency/timeout conflicts.
- Build the expected receiveCode only from the signed authoritative request amount, merchant configuration, timeout and returned provider ID; compare it byte-for-byte with the actual response. Missing/invalid/conflicting fields produce an unresolved attempt, never launch data or a failed/successful payment claim.

This is **preorder response validation over verified TLS**, not cryptographic
verification of a paid transaction. The provider SP signing public key has not
been supplied, so no payment proof is inferred from the preorder response.

### Durable context and SDK gate

Added migration `013_telebirr_uat_sdk_context.sql`, retaining all migration 012
final-state/no-credit guards. Only new, validated SDK orders receive immutable
merchant app/short-code/timeout/contract context. Legacy H5 `merchant/preOrder`
records lack this marker and cannot be guessed into SDK orders.

`TELEBIRR_UAT_SDK_ENABLED=false` is the default. No deployment enable flag was set.
When explicitly opted in with valid merchant UAT configuration, SDK initialization
is returned only by create/idempotent-create for a still-awaiting, unexpired,
matching-context order. History, admin, details and verification responses do not
disclose launch payloads. Native duplicate-launch protection remains unchanged.

Review/apply the pending schema through the existing runner when ready:

```sh
cd backend
npm run db:migrate:telebirr-uat
```

The runner installs missing 012/013 migrations. This resolution pass tested them
in disposable schemas; it did not automatically migrate the application's public
schema or enable UAT payment initiation.

## Host application compatibility

A connected Huawei ELE-L29 device was available during this pass. Read-only
package/activity inspection found:

| Requirement | Installed result |
| --- | --- |
| SDK UAT package | `com.ethiotelecom.telebirr.customer.uat` — present |
| Minimum version code from actual AAR | `10100313` |
| Installed version | `10109046`, name `1.1.9.046` — meets minimum |
| Explicit SDK activity | `com.huawei.module_checkout.inapp.PaySdkEnterActivity` — resolves, exported=true |
| Host APK signature integrity | `apksigner verify` passed |
| Observed signer certificate SHA-256 | `ef933412294179f5b1cec957b925424aaf50942e83f657dd2da72a5f6f00abeb` |

The installed UAT host is **technically compatible with the inspected AAR**.
An installed `cn.tydic.ethiopay` application alone would not satisfy this AAR's
hard-coded UAT package check. A generic “SuperApp Testbed” filename is insufficient.

The installed base APK was copied read-only to ignored external temporary storage
for manifest/signature inspection. Nothing was installed/replaced on the phone,
no host payment activity was started and no credentials/payment authorization
were entered. APK signature integrity does not prove official publisher provenance:
confirm the observed signer against the portal-issued APK/Telebirr's authenticated
fingerprint before authorizing any payment. No guessed certificate pin was added.

## TLS diagnosis and completed fixes

### PostgreSQL — original reported failure

The new Telebirr database test failed during PostgreSQL TLS setup, **before any
provider call**, because Supabase Root 2021 CA was not trusted. The pooler serves
a Supabase leaf/intermediate/root chain; its self-signed private-CA root has a
public certificate, not a reason to disable verification.

Added the public root from the URL published by official Supabase Studio and a
shared verified-TLS configuration helper. Application pool and affected database
regressions now use `rejectUnauthorized:true`, correct server name, and the
approved CA. URL SSL parameters cannot override these settings. Removed the
pre-existing TLS bypasses from the application pool and the two affected database
test pools. Optional approved custom trust uses `DATABASE_CA_CERT_PATH`.

Authenticated live client inspection confirmed **encrypted=true, authorized=true,
TLSv1.3**, issued through Supabase Intermediate 2021 CA. A separate `pg_stat_ssl`
query reported ssl=false for the server-side backend connection; that describes
the pooler-to-database leg, not this verified client-to-pooler socket. Supabase's
internal SSL-enforcement settings were not changed; the project owner should
review them independently. Do not misreport client TLS as proof of every internal leg.

### Provider HTTPS — separate missing intermediate

The UAT gateway currently serves only its leaf certificate, issued by GlobalSign
GCC R3 EV TLS CA 2025. Default verification failed with an unavailable issuer.
Retrieved the intermediate from GlobalSign over verified HTTPS, validated its
chain against platform trust, and added it alongside standard Node roots in the
existing provider HTTPS agent. No leaf pin, peer-supplied trust, insecure agent,
or certificate-verification bypass was introduced.

A credential-free HEAD request confirmed **TLS authorized=true**, HTTP **405**
(method not supported). This proves TLS connectivity only, not Fabric credentials,
merchant authorization, preorder success or payment verification.

Certificate source URLs, SHA-256 hashes and expiration/rotation requirements:
[`backend/certs/README.md`](../backend/certs/README.md). These TLS CA certificates
are **not** Telebirr's payment-signature verification public key.

## Missing merchant configuration and registrations

Presence-only inspection of the current ignored backend environment found these
required values absent (no values displayed or copied):

- `TELEBIRR_MERCHANT_APP_ID`
- `TELEBIRR_FABRIC_APP_ID`
- `TELEBIRR_SHORT_CODE`
- `TELEBIRR_APP_SECRET`
- `TELEBIRR_PRIVATE_KEY_BASE64`
- `TELEBIRR_NOTIFY_URL`

`TELEBIRR_ENV`, `TELEBIRR_UAT_ENABLED`, and `TELEBIRR_UAT_SDK_ENABLED` are also
unset; UAT remains disabled. The authentic UAT SP signing key/certificate for
payment response/notification verification is absent; the reserved example
variable is `TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64`, not yet consumed by a finalizer.

Cannot establish from local files whether the merchant's corresponding **UAT
public signing key** is registered with Telebirr. No new signing keypair was
generated as a substitute. Merchant Cross-App/InApp product approval, notify URL
whitelisting, and package/signing registration for `com.astu.mobile` must also be
confirmed through the merchant portal/provider. Legacy/demo ZIP credentials are
not merchant-specific configuration and were not reused.

## Authoritative confirmation: documented, still gated

The official InApp documentation **does support** independent order queries:

```text
POST /payment/v1/merchant/queryOrder
method=payment.queryorder
biz_content: appid, merch_code, merch_order_id
headers: X-APP-Key and Fabric Authorization
```

The response documents `result`, `code`, an SP private-key signature and merchant
order ID, payment order ID, amount and currency. Signing preparation specifies
RSA-PSS/SHA-256 and ASCII field canonicalization. However, the query table defines
payment outcomes under **`trade_status`**, while its success sample places
`PAY_SUCCESS` under **`order_status`**; the table's `order_status` description
incorrectly describes a currency. An authenticated complete UAT response contract
and trusted SP verification key are needed before implementing a finalizer.
No endpoint or outcome was invented to work around this discrepancy.

Notifications are also documented, with `sign`, `sign_type`, merchant/order/
amount/currency fields and statuses such as `Completed`. They require a whitelisted
notify URL. The example is labeled an HTTP response despite showing an event
payload, and several timestamps/field lengths are inconsistent. The published
page does not fully establish acknowledgment/replay/key-distribution rules.
No unsigned notification receiver or guessed signature-verification scheme was
enabled. Whitelisting alone is not accepted as payment proof.

The existing verifier/reconciliation logic deliberately continues to return an
unverified/pending outcome. Its comments and readiness blocker now acknowledge
the located API rather than claiming no status API exists. Implementing final
verification awaits authenticated key/contract clarification; migration 012 still
rejects all final outcomes. SDK callback success/cancellation/error changes no
wallet or escrow balance. Demo conversion remains unavailable.

## Affected files

- Targeted updates: existing `telebirrUat/provider.js`, `service.js`, migration runner,
  backend `.env.example`, Flutter confirmation copy and affected tests.
- Added: migration 013, `src/config/databaseTls.js`, public `certs/*.crt` and source
  provenance README, `tests/databaseTls.test.js`, this report.
- Reused without replacement: AAR, Kotlin platform channel, Flutter SDK adapter/UI
  flow, funding ledger separation and reconciliation/final-state safety gates.

## Current-pass test results

Tests use synthetic fixtures unless explicitly labeled live TLS/package checks;
none performed a genuine provider payment. All commands below have completed.

| Check | Actual result |
| --- | --- |
| Backend Jest | Final expanded run: **224/224 passed**, 12 suites |
| PostgreSQL TLS | Verified encrypted/authorized TLSv1.3 client connection |
| Provider HTTPS | Verified TLS; credential-free HEAD returned 405 |
| New Telebirr DB regression | Final expanded run: **23/23 checks passed**, including 012/013 migrations, durable context, legacy promotion rejection and no finalization/credit |
| Full Flutter tests | 161/161 passed, including all four new SDK-completion/verification UI cases |
| Flutter analyzer | Passed, no issues |
| Android debug build | Passed; existing plugin KGP migration warnings only |
| Device host package/activity/APK integrity | Passed technical compatibility checks; official signer provenance still external |
| `npm run test:listings:db` | **37/37** PostgreSQL/API checks passed; fixtures rolled back |
| `npm run test:debo:db` | **83/83** PostgreSQL/PostGIS/API checks passed, including durable recovery |
| `npm run test:transactions:db` | **67/67** database checks passed, including QR/escrow/refunds/settlements |
| `npm run test:wallets:db` | **106/106** database checks passed, including conservation, concurrency and rollback |
| `npm run test:checkout:live` | **25/25** real Supabase checkout checks passed; public fixtures rolled back and temporary Auth identities removed |
| `git diff --check` | Passed |

All broad database/API regressions above were rerun with the verified-TLS pool
configuration. Expected rejection-path stack traces in their output did not
indicate failing assertions: all five commands exited 0. No payment provider was
contacted by the database/API regression fixtures.

## Safe next steps

1. Supply merchant-specific UAT values securely in ignored backend environment;
   confirm key/product/package registrations and notification whitelisting.
2. Review/apply 013 after 012. Keep both UAT enable flags off until the merchant
   test setup is approved. No automatic real-money or virtual-credit operation exists.
3. Obtain Telebirr's authentic UAT SP signing key and clarify query status fields,
   signature coverage, notification acknowledgments and replay/late-event rules.
4. Implement/review authoritative verification and its integrity tests before any
   new migration permits final statuses. Do not bypass the current database gate.
5. Confirm the host signer, then perform a genuine UAT-only SDK authorization and
   independently verify provider evidence. Until then, report the integration as
   locally tested and safety-gated, not end-to-end verified.
