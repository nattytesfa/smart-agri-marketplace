# Digital Debo stabilization

Apply `db/migrations/008_debo_stabilization.sql` after migrations 006 and 007,
inside a database transaction. It adds checkout/reconciliation metadata and an
unverified-notification audit table without repricing old financial records.

`PENDING_PAYMENT_TIMEOUT_SECONDS` controls new prototype checkout deadlines
(default 1800, valid 1–604800). HTTP creation is always prototype-only: it never
calls a payment gateway. Missing callbacks are NOT proof of external nonpayment.
External/legacy ambiguity retains stock in `reconciliation_required`.

Recovery runs on marketplace, Debo and transaction reads and from the server's
minute timer. For recovery while the server is stopped, schedule
`npm run checkouts:recover` every minute using cron/systemd, or schedule
`SELECT public.recover_expired_checkouts();` using an authorized database job.
The database function persists state, uses row locks and is safe for concurrent
workers. Configure one of these external schedules for unattended deployment;
the repository does not install an OS cron job or assume Supabase pg_cron access.

ETB policy `ETB_HALF_UP_LINE_V1`: retain exact asking prices; multiply each
contribution's exact decimal quantity and price, round half-up to two places,
then sum integer cents. Monetary API totals are decimal strings such as `10.08`.
Existing transaction amounts and historical pricing-policy values are untouched.

`POST /api/transactions/:id/cancel` cancels a buyer-owned unpaid prototype
checkout idempotently. Unverified callbacks are recorded/deduplicated and return
503; they cannot confirm payments, free ambiguous external stock, or resurrect
expired reservations. Provider verification, payouts and multi-payee escrow
remain intentionally unimplemented.

Optional real-auth connectivity check: `LIVE_AUTH_TEST=1 npm run test:connectivity:live`.
It uses configured Supabase admin/anon credentials, creates temporary farmer/buyer
Auth identities without sending email/OTP, exercises actual bearer verification,
rolls back all public-table fixtures and deletes those Auth identities in cleanup.
