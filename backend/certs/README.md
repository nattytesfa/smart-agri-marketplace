# Public TLS trust material (not merchant signing keys)

These public certificates were retrieved over certificate-verified HTTPS. No
certificate copied from an unverified peer was promoted to a trusted CA.

## Supabase Root 2021 CA

- File: `supabase-root-2021.crt`
- Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- URL provenance: the `ssl:certificate_url` template in the official Supabase
  Studio source: https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
- Guidance: https://supabase.com/docs/guides/platform/ssl-enforcement
- DER certificate SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`
- PEM file SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`
- Expires: 2031-04-26.

Applied automatically **only** to Supabase pooler/direct-database hostname
patterns. Other databases use platform trust, or the explicitly configured
`DATABASE_CA_CERT_PATH`. CA validation and hostname verification remain enabled.

## GlobalSign GCC R3 EV TLS CA 2025

- File: `globalsign-gcc-r3-ev-tls-ca-2025.crt`
- Source: https://secure.globalsign.com/cacert/gsgccr3evtlsca2025.crt
- The provider leaf's Authority Information Access identifies this issuing CA.
  Its public HTTPS location was used, not the unencrypted AIA URL.
- DER certificate SHA-256: `1b2928021a4b89cf0f572a2436e914e25412ad58edee221e6c7c3c5437179a26`
- PEM file SHA-256: `5dc46e50471e5aef153ffa30bc8b3b9f7e99887a7085bcfea140d8c878868abc`
- Issuer: GlobalSign Root CA - R3 (verified against the platform trust store).
- Expires: 2027-07-16.

The UAT gateway currently serves its leaf without this intermediate. It is
included alongside Node's standard roots in the existing UAT HTTPS agent;
`rejectUnauthorized:true` and default hostname verification remain in effect.

Review/replace these certificates from their authenticated official sources
before expiry or an issuer rotation. Never fix a renewal failure by disabling
verification. These certificates cannot verify payment payload signatures:
Telebirr's separate, authenticated UAT SP signing public key is still required.
