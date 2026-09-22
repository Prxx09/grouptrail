# GroupTrail

Open-source Android group-travel project. No Google Maps SDK or billing account.

## Current milestone

Implemented: email sign-up/sign-in/sign-out, SecureStore sessions, MapLibre +
OpenFreeMap map, explicit foreground location permission, long-press destination,
walking/cycling/driving route preview, route distance/ETA and written instructions.
The route proxy verifies Supabase sessions, restricts access to approved tester UUIDs,
validates coordinates and applies atomic per-user/global quotas in Postgres.

Not implemented yet: groups, chat, shared live locations, moving-target navigation,
voice/live turn-by-turn guidance, background tracking, offline maps, password reset UI.
This is a **route-preview prototype, not a navigation-ready app**. Do not use it while driving.
Motorcycle-specific routing is not offered: a car profile must not be labelled motorcycle.

## Requirements

- Node.js 22.13+ (Node 24 recommended), Git, npm, Expo account, physical Android phone.
- Supabase Free project and an **openrouteservice** key, NOT an OpenRouter AI key.
- MapLibre requires a native development/preview build; **Expo Go and web are not supported**.
- No paid plan is required by the code. Stay on free plans; when quotas run out, stop/wait.
  Public services and build capacity are not guaranteed. Self-hosting uses your own infrastructure.

## Windows setup (Command Prompt; no PowerShell scripts)

```bat
git clone https://github.com/Prxx09/grouptrail.git
cd grouptrail
git switch feat/android-foundation
cd mobile
npm ci
copy .env.example .env
```

Edit `mobile/.env` locally using your project's URL and **publishable** key.
Never put an ORS key or Supabase service-role key in the mobile directory.
EXPO_PUBLIC variables are embedded in the APK; EAS secret visibility does not hide them.
The verified GroupTrail project URL is `https://utjnwxkwrqvuuxgisvgo.supabase.co`.

```bat
npm run typecheck
npm run lint
npm test
npx eas-cli@latest login
npx eas-cli@latest init
```

Choose your own Expo account and create/link **grouptrail**. This fills in the EAS
project ID. The proposed Android package is `com.prxx09.grouptrail`; confirm before release.
Use EAS environment variables for remote builds (development and preview):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MAP_STYLE_URL` (default: `https://tiles.openfreemap.org/styles/liberty`)

See https://docs.expo.dev/eas/environment-variables/ for dashboard configuration.
Do not rely on a gitignored local .env being uploaded to remote builds.

```bat
npx eas-cli@latest build --platform android --profile development
npm start
```

Install the development APK and connect it to Metro. For friends, build a standalone
APK that does not depend on your laptop:

```bat
npx eas-cli@latest build --platform android --profile preview
```

Builds have NOT been triggered by this implementation. Native Android compilation,
physical GPS behaviour and end-to-end authenticated routing still require testing.

## Backend activation (separate deployment step)

Source is provided but is not automatically deployed by this branch.
If Supabase's GitHub integration applies migrations on merge, use that single migration
workflow; do not also paste the same SQL into the dashboard.

1. Apply `supabase/migrations/*_routing_budget.sql` through your chosen migration workflow.
2. Deploy the `routes` function from the **repository root**, preserving the shared module.
   `supabase/config.toml` disables gateway JWT verification; the handler independently
   validates the bearer token through Supabase Auth. Missing/invalid tokens are rejected.
3. Set these in Supabase **Edge Functions → Secrets**, not GitHub or mobile:
   - `ORS_API_KEY`: key from openrouteservice.org (never OpenRouter).
   - `BETA_USER_IDS`: comma-separated Supabase Auth user UUIDs for approved testers.
   - `ROUTING_ENABLED`: `true` only after the migration and secrets are ready.
4. Standard Supabase runtime variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` are consumed server-side; never export them to the app.
5. Leave email confirmation on; configure a suitable SMTP provider for public signup.
   For an early beta you can provision confirmed testers through the Auth dashboard.

Budget defaults: 4 requests/user/minute, 100/user/day; global 20/minute, 500/day.
Failed provider attempts also count. Limits protect this deployment, not other apps
sharing the same ORS key. There are no automatic paid upgrades or fallback providers.
The budget function is SECURITY INVOKER, callable only by service_role, and the quota
table has RLS enabled with no client policies. It stores counters, not coordinates.

## Verification checklist

Local checks passed: lint, TypeScript, 16 automated tests (including mocked route-handler
authorization/quota tests), and an Android Metro bundle export. These do not replace
native compilation or a deployed database test. The migration has not been applied
or exercised against PostgreSQL yet.

Dependency audit currently reports 11 moderate findings in the Expo tooling chain,
rooted in `xcode` → `uuid`. No forced downgrade was applied; resolve or reassess this
before a public release. This is not a clean security-audit result.

- Missing token → 401; invalid/expired token → 401.
- User absent from BETA_USER_IDS → 403.
- ROUTING_ENABLED missing/false or key absent → 503, no ORS request.
- Invalid profile/coordinates → 400.
- Fifth valid request in one minute by the same user → 429.
- Anonymous/authenticated database roles cannot access routing_budget or its RPC.
- A permitted route shows geometry, distance, ETA and steps on a physical phone.
- Denied location, disabled GPS, stale fix, no internet and sign-out are handled.
- Check map attribution remains visible on device.

## Data handling and next milestones

Until a route is requested, location is only in app memory. Requesting a route sends
origin/destination to your Supabase endpoint and openrouteservice. OpenFreeMap sees
tile requests/IP addresses. Application code does not log coordinates or route history;
provider retention policies still apply. Auth sessions use device SecureStore.

Next: real-time group membership/chat with tested RLS; latest-location-only storage;
foreground guidance with progress matching and voice; field-tested off-route rerouting;
then consent-based background sharing and last-known-location handling.

MapLibre renders maps, it does not provide a complete navigation engine. These guidance
features must be implemented and tested, not assumed from a route polyline.

## License and attribution

Existing repository LICENSE is preserved. Third-party components retain their own
licenses. Keep OpenFreeMap/OpenMapTiles/OpenStreetMap attribution on the map and
openrouteservice attribution with routing results. See https://openfreemap.org/
and https://openrouteservice.org/terms-of-service/.
