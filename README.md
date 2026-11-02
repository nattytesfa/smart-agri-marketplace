# Smart Agricultural Marketplace

A digital marketplace connecting Ethiopian smallholder farmers directly with buyers, built as a senior project at Adama Science and Technology University.

The platform combines:
- An offline-first Flutter mobile app
- A Node.js business-logic backend integrated with Supabase
- A Next.js admin dashboard
- Geospatial produce aggregation (Digital Debo)
- Escrow-based payments and QR traceability

Full architecture, schema, and API reference:
[docs/implementation_guide.md](./docs/implementation_guide.md)

Official Telebirr InApp UAT setup, safety gates and actual verification results:
[docs/telebirr_uat_blocker_resolution.md](./docs/telebirr_uat_blocker_resolution.md).
SDK order mapping and verified TLS are implemented; authoritative payment
confirmation remains safety-gated. UAT records never credit the Demo Wallet.

## Repository Layout

```text
smart-agri-marketplace/
|- mobile/        # Flutter app (farmers + buyers)
|- backend/       # Node.js API + integrations + jobs
|- admin-web/     # Next.js admin dashboard
|- docs/          # SRS, diagrams, ERD, API docs
`- README.md
```

## Prerequisites

Install these before you start:

- Flutter SDK 3.22.x (`flutter doctor` should report no blocking issues)
- Android Studio (emulator + SDK tools)
- Node.js LTS (recommended via nvm)
- Git + GitHub access to this repository
- VS Code with Flutter, Dart, and ESLint extensions
- Shared Supabase project access (do not create your own Supabase project)

If nvm is not installed:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
```

## First-Time Setup

Run these steps in order.

1. Clone and enter the repository.

```bash
git clone https://github.com/nattytesfa/smart-agri-marketplace.git
cd smart-agri-marketplace
```

2. Set up mobile dependencies.

```bash
cd mobile
flutter pub get
cp .env.example .env
cd ..
```

3. Set up backend dependencies.

```bash
cd backend
npm install
cp .env.example .env
cd ..
```

4. Set up admin web dependencies.

```bash
cd admin-web
npm install
cp .env.example .env.local
cd ..
```

5. Request real environment keys from the backend lead and fill the env files.

You will need:
- Supabase URL + anon key + service role key
- Telebirr / CBE Birr sandbox keys
- NMA / OpenWeather API keys (if available)

Fayda national ID needs no external key: run the bundled mock provider in
`mock-fayda/` (`npm install && cp .env.example .env && npm run keys && npm start`).
See `mock-fayda/README.md`.

Never commit `.env`, `.env.local`, or any secret value.

6. Verify basic startup.

```bash
cd mobile
flutter run
```

If startup fails, check your environment keys first.

## Environment Variables

Each app has its own env file:
- `mobile/.env`
- `backend/.env`
- `admin-web/.env.local`

See section 7 in [docs/implementation_guide.md](./docs/implementation_guide.md) for the full key list.

## Run Locally

```bash
# Mobile
cd mobile && flutter run

# Backend
cd backend && npm run dev

# Admin web
cd admin-web && npm run dev
```

## Git Workflow

Use a feature-branch workflow with review required.

1. Update local `main` before starting.

```bash
git checkout main
git pull origin main
```

2. Create a branch:
- Feature: `feature/<module>-<short-description>`
- Fix: `fix/<short-description>`

3. Commit with `type: description` format, for example:
- `feat: add offline listing form`
- `fix: correct PostGIS radius query`
- `docs: update API table`

4. Open a PR to `main` only after local verification.
5. Require at least one teammate approval before merge.
6. Resolve conflicts on your branch before review.
7. Delete the branch after merge.

## Code Style

- Dart (mobile): follow official Dart style. Use BLoC for new features.
- JavaScript (backend/admin-web): ESLint + Prettier, camelCase naming, and async/await.
- Comments: explain why for non-trivial logic (especially PostGIS aggregation and Hive sync reconciliation).

## Before You Push (Checklist)

- [ ] Code runs locally without errors
- [ ] Lint passes (`flutter analyze`, `npm run lint`)
- [ ] No `.env` files or secrets are staged
- [ ] New endpoints/screens are reflected in [docs/implementation_guide.md](./docs/implementation_guide.md)
- [ ] Schema changes include migration files in `backend/db/migrations/`

Useful quick checks:

```bash
git status
git diff --staged
```

## Troubleshooting

- Read [docs/implementation_guide.md](./docs/implementation_guide.md) first.
- Ask in team chat if blocked for more than 30 minutes.
- For Supabase issues, check Supabase dashboard logs.
- For Flutter build issues:

```bash
flutter clean
flutter pub get
```

## Reference Links

- Architecture, DB schema, API table, build phases: [docs/implementation_guide.md](./docs/implementation_guide.md)
- Task board: [https://github.com/nattytesfa/smart-agri-marketplace](https://github.com/nattytesfa/smart-agri-marketplace)
- Team chat: [Telegram Group](https://t.me/c/3235985205/3)
## Demo Wallets (virtual funds only)

Buyer/farmer Wallet & Escrow setup, migration 011, API details, accounting rules,
verification results and the 501,000 ETB defense walkthrough are documented in
[`docs/demo_wallets.md`](docs/demo_wallets.md). Wallet funding requires both
`SIMULATED_PAYMENTS_ENABLED=true` and `DEMO_WALLETS_ENABLED=true` in an approved
development/demo environment. There are no real deposits, withdrawals or payouts.
