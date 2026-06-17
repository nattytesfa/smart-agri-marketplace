# Smart Agricultural Marketplace — Implementation Guide

This guide turns the SRS/design document into a concrete build plan: stack decisions, repo and folder structure for the mobile app, backend, and admin web, the database schema, environment variables, the API surface, and a recommended build order.

## 1. Stack decisions (what to actually install)

The document mentions both a custom Node.js backend and Supabase. To avoid building two backends, use them together this way:

- **Supabase** = your managed PostgreSQL (with PostGIS enabled), Auth, Storage, and Realtime. You get a database, login, file storage, and live updates without writing that infrastructure yourself.
- **Node.js (Express)** = a separate service for everything Supabase can't do out of the box: Telebirr/CBE Birr escrow logic, Fayda ID verification calls, NMIS/NMA data ingestion, the Digital Debo aggregation algorithm, QR token generation, SMS gateway delivery, and the recommendation engine. This service talks to the same Postgres database (via Supabase's connection string or service-role key) and to external APIs.
- **Flutter** mobile app talks to Supabase directly for simple CRUD/auth (via `supabase_flutter`), and to the Node.js API for everything listed above.
- **Next.js** admin web talks to Supabase directly for reads, and to the Node.js API for admin actions (verify user, resolve dispute, trigger reports).

| Layer | Technology | Why |
|---|---|---|
| Mobile app | Flutter 3.22.x, Dart 3.4.x | Cross-platform, matches the document's spec |
| Local offline storage | Hive 2.2.x | Lightweight, no native dependencies, works fully offline |
| State management | flutter_bloc | Enforced separation of UI and logic per the coding standard |
| Backend business logic | Node.js (LTS) + Express | Custom integrations, async job processing |
| Database | PostgreSQL + PostGIS, hosted on Supabase | Spatial queries for Digital Debo and proximity search |
| Auth | Supabase Auth (phone OTP) + JWT | Matches FR-01, RBAC requirement |
| Admin web | Next.js + Tailwind CSS | Responsive dashboard, fast to build |
| Maps | Google Maps Platform API (mobile), Leaflet or Google Maps JS (admin heatmap) | Matches document references |
| ML inference | TensorFlow Lite (on-device) | Sell/hold and recommendation models |
| Payments | Telebirr Merchant API, CBE Birr | Escrow lock/release |
| Identity | Fayda National ID API | KYC verification |
| External data | NMIS (prices), NMA (weather/OpenWeatherMap as fallback) | Advisory engine inputs |

## 2. Repository layout

A monorepo is easiest for a student/small team to manage and keep in sync; split into separate repos later if the team grows.

```
smart-agri-marketplace/
├── mobile/              # Flutter app (farmers + buyers)
├── backend/             # Node.js API + integrations + jobs
├── admin-web/           # Next.js admin dashboard
├── docs/                # SRS, diagrams, ERD exports, API docs
└── README.md            # Root setup instructions
```

## 3. Mobile app structure (`mobile/`)

```
mobile/
├── android/
├── assets/
│   ├── images/
│   │   ├── app_logo.png
│   │   ├── splash_illustration.png
│   │   └── onboarding_illustration_1.png … _3.png
│   ├── icons/                              # icon-driven UI assets (literacy-friendly)
│   │   ├── crop_maize.png
│   │   ├── crop_teff.png
│   │   ├── crop_wheat.png
│   │   ├── crop_coffee.png
│   │   ├── storage_gotera.png
│   │   └── storage_modern.png
│   └── lang/
│       ├── am.json                          # Amharic
│       ├── om.json                           # Afaan Oromoo
│       └── en.json
├── lib/
│   ├── main.dart
│   ├── app.dart                              # MaterialApp, routing, theme wiring
│   ├── core/
│   │   ├── config/
│   │   │   ├── app_constants.dart
│   │   │   ├── api_endpoints.dart
│   │   │   └── env_config.dart
│   │   ├── network/
│   │   │   ├── dio_client.dart
│   │   │   ├── api_interceptor.dart
│   │   │   ├── connectivity_service.dart
│   │   │   └── network_exceptions.dart
│   │   ├── localization/
│   │   │   └── localization_setup.dart
│   │   ├── routing/
│   │   │   ├── app_router.dart
│   │   │   └── route_names.dart
│   │   ├── theme/
│   │   │   ├── app_theme.dart
│   │   │   ├── app_colors.dart
│   │   │   └── app_text_styles.dart
│   │   └── widgets/
│   │       ├── primary_button.dart
│   │       ├── icon_nav_bar.dart
│   │       ├── status_chip.dart
│   │       ├── loading_indicator.dart
│   │       ├── language_selector.dart
│   │       └── app_text_field.dart
│   ├── data/
│   │   ├── local/
│   │   │   ├── hive_boxes.dart
│   │   │   ├── listing_hive_model.dart      # + listing_hive_model.g.dart (generated)
│   │   │   ├── user_hive_model.dart          # + user_hive_model.g.dart (generated)
│   │   │   └── sync_queue_box.dart
│   │   ├── remote/
│   │   │   ├── supabase_client.dart
│   │   │   ├── auth_api.dart
│   │   │   ├── listings_api.dart
│   │   │   ├── debo_api.dart
│   │   │   ├── transactions_api.dart
│   │   │   ├── advisory_api.dart
│   │   │   ├── traceability_api.dart
│   │   │   └── subscriptions_api.dart
│   │   ├── models/
│   │   │   ├── user_model.dart
│   │   │   ├── farmer_profile_model.dart
│   │   │   ├── buyer_profile_model.dart
│   │   │   ├── listing_model.dart
│   │   │   ├── debo_batch_model.dart
│   │   │   ├── transaction_model.dart
│   │   │   ├── advisory_model.dart
│   │   │   └── subscription_model.dart
│   │   └── repositories/
│   │       ├── auth_repository.dart
│   │       ├── listing_repository.dart
│   │       ├── debo_repository.dart
│   │       ├── transaction_repository.dart
│   │       ├── advisory_repository.dart
│   │       ├── traceability_repository.dart
│   │       └── subscription_repository.dart
│   ├── features/
│   │   ├── auth/
│   │   │   ├── bloc/
│   │   │   │   ├── auth_bloc.dart
│   │   │   │   ├── auth_event.dart
│   │   │   │   └── auth_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── splash_screen.dart
│   │   │       │   ├── language_select_screen.dart
│   │   │       │   ├── phone_register_screen.dart
│   │   │       │   ├── otp_verification_screen.dart
│   │   │       │   ├── fayda_verification_screen.dart
│   │   │       │   └── login_screen.dart
│   │   │       └── widgets/
│   │   │           ├── otp_input_field.dart
│   │   │           └── role_selector_card.dart
│   │   ├── listings/
│   │   │   ├── bloc/
│   │   │   │   ├── listing_bloc.dart
│   │   │   │   ├── listing_event.dart
│   │   │   │   └── listing_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── listing_list_screen.dart
│   │   │       │   ├── listing_create_screen.dart
│   │   │       │   ├── listing_detail_screen.dart
│   │   │       │   └── listing_edit_screen.dart
│   │   │       └── widgets/
│   │   │           ├── listing_card.dart
│   │   │           ├── crop_type_picker.dart
│   │   │           ├── quantity_price_input.dart
│   │   │           └── location_picker_map.dart
│   │   ├── digital_debo/
│   │   │   ├── bloc/
│   │   │   │   ├── debo_bloc.dart
│   │   │   │   ├── debo_event.dart
│   │   │   │   └── debo_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── debo_batch_list_screen.dart
│   │   │       │   ├── debo_batch_detail_screen.dart
│   │   │       │   └── debo_join_confirmation_screen.dart
│   │   │       └── widgets/
│   │   │           ├── batch_progress_bar.dart
│   │   │           └── batch_map_view.dart
│   │   ├── transactions_escrow/
│   │   │   ├── bloc/
│   │   │   │   ├── transaction_bloc.dart
│   │   │   │   ├── transaction_event.dart
│   │   │   │   └── transaction_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── payment_method_screen.dart
│   │   │       │   ├── escrow_status_screen.dart
│   │   │       │   └── transaction_history_screen.dart
│   │   │       └── widgets/
│   │   │           ├── escrow_status_badge.dart
│   │   │           └── payment_method_tile.dart
│   │   ├── traceability_qr/
│   │   │   ├── bloc/
│   │   │   │   ├── qr_bloc.dart
│   │   │   │   ├── qr_event.dart
│   │   │   │   └── qr_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── qr_generate_screen.dart
│   │   │       │   ├── qr_scan_screen.dart
│   │   │       │   └── traceability_result_screen.dart
│   │   │       └── widgets/
│   │   │           ├── qr_display_widget.dart
│   │   │           └── scanner_overlay.dart
│   │   ├── advisory/
│   │   │   ├── bloc/
│   │   │   │   ├── advisory_bloc.dart
│   │   │   │   ├── advisory_event.dart
│   │   │   │   └── advisory_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── weather_forecast_screen.dart
│   │   │       │   ├── sell_or_hold_screen.dart
│   │   │       │   └── price_trend_screen.dart
│   │   │       └── widgets/
│   │   │           ├── forecast_card.dart
│   │   │           ├── recommendation_banner.dart
│   │   │           └── price_chart.dart
│   │   ├── subscriptions/
│   │   │   ├── bloc/
│   │   │   │   ├── subscription_bloc.dart
│   │   │   │   ├── subscription_event.dart
│   │   │   │   └── subscription_state.dart
│   │   │   └── presentation/
│   │   │       ├── screens/
│   │   │       │   ├── plan_selection_screen.dart
│   │   │       │   └── subscription_status_screen.dart
│   │   │       └── widgets/
│   │   │           └── plan_card.dart
│   │   └── profile/
│   │       ├── bloc/
│   │       │   ├── profile_bloc.dart
│   │       │   ├── profile_event.dart
│   │       │   └── profile_state.dart
│   │       └── presentation/
│   │           ├── screens/
│   │           │   ├── profile_screen.dart
│   │           │   ├── edit_profile_screen.dart
│   │           │   └── trust_score_detail_screen.dart
│   │           └── widgets/
│   │               └── trust_score_gauge.dart
│   ├── services/
│   │   ├── sync_service.dart                # background Hive → Postgres reconciliation
│   │   ├── location_service.dart             # GPS capture for listings
│   │   ├── qr_service.dart                    # generate/scan QR tokens
│   │   ├── notification_service.dart           # push + offline SMS fallback awareness
│   │   └── recommendation_service.dart          # TFLite model inference wrapper
│   └── di/
│       └── service_locator.dart
├── test/
│   ├── features/
│   │   ├── auth_bloc_test.dart
│   │   └── listing_bloc_test.dart
│   └── data/
│       └── listing_repository_test.dart
├── pubspec.yaml
└── README.md
```

Key pubspec.yaml dependencies to add:
`flutter_bloc`, `hive`, `hive_flutter`, `path_provider`, `dio`, `connectivity_plus`, `geolocator`, `google_maps_flutter`, `qr_flutter`, `mobile_scanner`, `easy_localization`, `flutter_secure_storage`, `equatable`, `get_it`, `uuid`, `image_picker`, `flutter_image_compress`, `workmanager`, `supabase_flutter`, `tflite_flutter`.

## 4. Backend structure (`backend/`)

```
backend/
├── src/
│   ├── server.js
│   ├── app.js                                  # Express app, middleware wiring
│   ├── config/
│   │   ├── env.js
│   │   ├── db.js                                # pg pool for raw PostGIS queries
│   │   ├── supabaseClient.js                     # service-role client
│   │   └── logger.js                              # winston config
│   ├── middleware/
│   │   ├── auth.js                                 # JWT verification
│   │   ├── rbac.js                                  # role checks (Farmer/Buyer/DA/Admin)
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validateRequest.js
│   ├── modules/
│   │   ├── users/
│   │   │   ├── user.routes.js
│   │   │   ├── user.controller.js
│   │   │   └── user.service.js
│   │   ├── listings/
│   │   │   ├── listing.routes.js
│   │   │   ├── listing.controller.js
│   │   │   └── listing.service.js
│   │   ├── digitalDebo/
│   │   │   ├── debo.routes.js
│   │   │   ├── debo.controller.js
│   │   │   ├── debo.service.js
│   │   │   └── clustering.util.js                  # spatial clustering algorithm
│   │   ├── transactionsEscrow/
│   │   │   ├── transaction.routes.js
│   │   │   ├── transaction.controller.js
│   │   │   ├── transaction.service.js
│   │   │   ├── telebirr.integration.js
│   │   │   └── cbeBirr.integration.js
│   │   ├── traceabilityQr/
│   │   │   ├── traceability.routes.js
│   │   │   ├── traceability.controller.js
│   │   │   ├── traceability.service.js
│   │   │   └── qrToken.util.js
│   │   ├── advisory/
│   │   │   ├── advisory.routes.js
│   │   │   ├── advisory.controller.js
│   │   │   ├── advisory.service.js
│   │   │   ├── nma.integration.js
│   │   │   └── nmis.integration.js
│   │   ├── subscriptions/
│   │   │   ├── subscription.routes.js
│   │   │   ├── subscription.controller.js
│   │   │   ├── subscription.service.js
│   │   │   └── smsGateway.integration.js
│   │   ├── admin/
│   │   │   ├── admin.routes.js
│   │   │   ├── admin.controller.js
│   │   │   └── admin.service.js
│   │   └── sync/
│   │       ├── sync.routes.js
│   │       ├── sync.controller.js
│   │       └── sync.service.js
│   ├── integrations/
│   │   └── fayda/
│   │       ├── fayda.client.js
│   │       └── fayda.util.js
│   ├── jobs/
│   │   ├── priceIngestionJob.js                     # node-cron: pulls NMIS prices
│   │   ├── advisoryGenerationJob.js                  # node-cron: generates sell/hold advice
│   │   └── syncRetryJob.js                            # retries failed mobile sync batches
│   ├── utils/
│   │   ├── asyncHandler.js
│   │   ├── apiResponse.js
│   │   └── geoUtils.js
│   └── validators/
│       ├── user.validator.js
│       ├── listing.validator.js
│       ├── transaction.validator.js
│       └── subscription.validator.js
├── db/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   └── 002_row_level_security.sql
│   └── seed/
│       ├── seed_users.sql
│       └── seed_listings.sql
├── tests/
│   ├── user.test.js
│   ├── listing.test.js
│   ├── debo.test.js
│   └── transaction.test.js
├── .env.example
├── package.json
└── README.md
```

Key package.json dependencies: `express`, `@supabase/supabase-js`, `pg`, `jsonwebtoken`, `bcrypt`, `axios`, `node-cron`, `dotenv`, `multer`, `qrcode`, `winston`, `express-validator`, `helmet`, `cors`.

## 5. Admin web structure (`admin-web/`)

```
admin-web/
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── app/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── users/
│   │   │   ├── page.tsx                       # verification queue
│   │   │   └── [id]/
│   │   │       └── page.tsx                    # individual user detail/verify
│   │   ├── listings/
│   │   │   └── page.tsx
│   │   ├── transactions/
│   │   │   └── page.tsx                        # escrow monitoring
│   │   ├── analytics-heatmap/
│   │   │   └── page.tsx                         # PostGIS-driven regional map
│   │   └── subscriptions/
│   │       └── page.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── DataTable.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── MapHeatmap.tsx
│   │   └── ConfirmDialog.tsx
│   ├── lib/
│   │   ├── supabaseClient.ts
│   │   ├── apiClient.ts                          # talks to backend for admin actions
│   │   └── authHelpers.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useUsers.ts
│   │   ├── useListings.ts
│   │   └── useTransactions.ts
│   └── styles/
│       └── globals.css
├── package.json
└── README.md
```

## 6. Database schema (run against Supabase Postgres, with PostGIS enabled)

```sql
create extension if not exists postgis;

create type user_role as enum ('farmer', 'buyer', 'da', 'admin');
create type storage_type as enum ('gotera', 'modern', 'none');
create type sync_status as enum ('local', 'cloud');
create type listing_status as enum ('available', 'reserved', 'sold');
create type batch_status as enum ('pending', 'filled', 'fulfilled');
create type escrow_status as enum ('locked', 'released', 'refunded');
create type advisory_rec as enum ('sell', 'hold');
create type plan_type as enum ('free', 'premium');
create type notification_channel as enum ('push_only', 'sms_and_push');

create table users (
  user_id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  fayda_id text unique,
  role user_role not null,
  hashed_password text not null,
  language_pref text default 'am',
  created_at timestamptz default now()
);

create table farmer_profiles (
  farmer_id uuid primary key references users(user_id),
  location_gps geometry(Point, 4326),
  storage_type storage_type default 'none',
  social_trust_score float default 0.5 check (social_trust_score between 0 and 1),
  farm_size_hectares numeric,
  created_at timestamptz default now()
);

create table buyer_profiles (
  buyer_id uuid primary key references users(user_id),
  buyer_type text, -- wholesaler, retailer, institutional, consumer, exporter
  business_name text,
  location_gps geometry(Point, 4326)
);

create table produce_listings (
  listing_id uuid primary key default gen_random_uuid(),
  farmer_id uuid references users(user_id),
  crop_type text not null,
  variety text,
  quantity numeric check (quantity > 0),
  unit text default 'quintal',
  price_per_unit numeric check (price_per_unit > 0),
  location_gps geometry(Point, 4326),
  status listing_status default 'available',
  sync_status sync_status default 'cloud',
  harvest_date date,
  created_at timestamptz default now()
);
create index idx_listings_geo on produce_listings using gist (location_gps);

create table digital_debo_batches (
  batch_id uuid primary key default gen_random_uuid(),
  target_buyer_id uuid references users(user_id),
  status batch_status default 'pending',
  total_quantity numeric default 0,
  created_at timestamptz default now()
);

create table debo_batch_listings (
  batch_id uuid references digital_debo_batches(batch_id),
  listing_id uuid references produce_listings(listing_id),
  primary key (batch_id, listing_id)
);

create table transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  listing_id uuid references produce_listings(listing_id),
  batch_id uuid references digital_debo_batches(batch_id),
  buyer_id uuid references users(user_id),
  farmer_id uuid references users(user_id),
  amount numeric not null,
  escrow_status escrow_status default 'locked',
  payment_method text not null, -- telebirr, cbe_birr
  transaction_hash text unique,
  qr_token text unique,
  created_at timestamptz default now(),
  released_at timestamptz
);

create table advisory_notifications (
  advice_id uuid primary key default gen_random_uuid(),
  farmer_id uuid references users(user_id),
  crop_type text,
  rainfall_prob float check (rainfall_prob between 0 and 100),
  recommendation advisory_rec,
  message text,
  created_at timestamptz default now()
);

create table subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  plan_type plan_type default 'free',
  start_date timestamptz default now(),
  end_date timestamptz,
  is_active boolean default false,
  notification_channel notification_channel default 'push_only'
);

create table admin_analytics_reports (
  report_id uuid primary key default gen_random_uuid(),
  region_zone text not null,
  price_variance float,
  generated_at timestamptz default now()
);
```

Enable Row-Level Security in Supabase on every table and write policies so farmers can only modify their own listings, buyers can only read available listings plus their own transactions, and admins bypass via the service-role key used only in the Node.js backend (never shipped to the client).

## 7. Environment variables

**backend/.env**
```
PORT=4000
DATABASE_URL=postgresql://...
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
TELEBIRR_API_KEY=
TELEBIRR_MERCHANT_ID=
CBE_BIRR_API_KEY=
FAYDA_API_KEY=
NMIS_API_URL=
NMA_API_KEY=
OPENWEATHER_API_KEY=
SMS_GATEWAY_API_KEY=
GOOGLE_MAPS_SERVER_KEY=
```

**mobile/.env (or compile-time constants)**
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
BACKEND_API_BASE_URL=
GOOGLE_MAPS_API_KEY=
```

**admin-web/.env.local**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BACKEND_API_BASE_URL=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

## 8. API surface (Node.js backend)

| Method & path | Maps to | Notes |
|---|---|---|
| POST /api/auth/register | FR-01, FR-02 | Phone signup, triggers Fayda verification |
| POST /api/auth/login | FR-01 | Returns JWT |
| GET /api/users/:id | FR-04 | Profile incl. trust score |
| POST /api/sync/listings | FR-05, FR-07 | Bulk upload from Hive on reconnect |
| GET /api/listings | FR-08 | Filter by crop, radius, price |
| POST /api/listings | FR-05 | Create (also used by sync) |
| PUT /api/listings/:id | — | Update/delete own listing |
| POST /api/debo/aggregate | FR-09 | Run clustering, create/append batch |
| GET /api/debo/batches/:id | FR-09 | Batch detail |
| GET /api/advisory/weather/:farmerId | FR-10 | NMA 7-day forecast |
| GET /api/advisory/sell-or-hold/:farmerId | FR-11 | Decision engine output |
| GET /api/advisory/prices | FR-12 | NMIS price index |
| POST /api/transactions/initiate | FR-13, FR-14 | Locks escrow |
| POST /api/webhooks/telebirr | FR-13 | Payment provider callback |
| POST /api/transactions/:id/release | FR-15, FR-16 | Triggered by QR scan |
| GET /api/traceability/:qrToken | FR-16 | Origin + trust score lookup |
| GET /api/admin/heatmap | FR-18 | PostGIS aggregated regional data |
| GET/POST /api/admin/users | FR-17 | Verification queue |
| POST /api/subscriptions/upgrade | FR-19 | Plan change |
| POST /api/notifications/sms | FR-20 | SMS gateway fallback for offline premium users |

## 9. Offline sync strategy (mobile)

1. Every write (new listing, profile edit) is saved to a Hive box first, tagged `sync_status: local`, regardless of connectivity.
2. `connectivity_plus` listens for network changes; on reconnect, `sync_service.dart` pushes all `local` records to `POST /api/sync/listings` in a batch.
3. Backend upserts records, returns server-assigned IDs and timestamps; client marks them `sync_status: cloud` and reconciles any conflicts (server timestamp wins on conflict, per NFR-02's 30-second reconciliation target).
4. Use `workmanager` to retry sync in the background even if the app isn't in the foreground.

## 10. Recommended build order

This sequencing front-loads the riskiest/most foundational pieces (auth, data model, offline sync) before the more specialized integrations, so the team always has a working vertical slice to demo.

**Phase 1 — Foundations (weeks 1–2)**
Set up Supabase project, enable PostGIS, run the schema above. Scaffold the three repos. Build phone-based registration/login (Supabase Auth) with Fayda verification stubbed. Build the icon-driven UI shell with Amharic/Afaan Oromoo/English localization.

**Phase 2 — Offline-first listings (weeks 3–4)**
Implement Hive local storage and the produce listing CRUD flow entirely offline. Build the background sync manager and the `/api/sync/listings` endpoint. Start the admin web skeleton (auth-gated shell, users list).

**Phase 3 — Aggregation and payments (weeks 5–6)**
Implement the Digital Debo PostGIS clustering query and matching UI. Integrate Telebirr/CBE Birr sandbox APIs for escrow lock; build the transaction state machine.

**Phase 4 — Advisory, traceability, polish (weeks 7–8)**
Wire up NMIS/NMA ingestion jobs and the sell/hold advisory logic. Add QR token generation and scan-to-release. Build the admin heatmap. Add subscriptions and the SMS gateway fallback. Run end-to-end and offline-simulation tests.

## 11. Getting started commands

```bash
# Mobile
flutter create mobile --org com.yourorg
cd mobile && flutter pub add flutter_bloc hive hive_flutter dio connectivity_plus geolocator google_maps_flutter qr_flutter mobile_scanner easy_localization flutter_secure_storage equatable get_it uuid supabase_flutter

# Backend
mkdir backend && cd backend && npm init -y
npm install express @supabase/supabase-js pg jsonwebtoken bcrypt axios node-cron dotenv multer qrcode winston express-validator helmet cors
npm install -D nodemon jest supertest

# Admin web
npx create-next-app@latest admin-web --typescript --tailwind
cd admin-web && npm install @supabase/supabase-js
```

Start with the Supabase project (create it, enable PostGIS, run the schema), then build the mobile registration/login screen against it — that's your first working vertical slice.