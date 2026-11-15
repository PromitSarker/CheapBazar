# Cheap-Bazar mobile app (Flutter, Android + iOS)

The buyer-side app: browse the marketplace (retail + wholesale with Buyer Pro), open shops, add to bag,
Cash-on-Delivery checkout, my orders / order tracking, notifications, Buyer Pro, Bangla + English.
Shop owners and admins keep using the website back-office.

The app talks only to the mobile API `https://<server>/api/m/v1/*` (code: `src/lib/mobile/` in the web app).
It never touches the internal services. The session token is kept in the Keychain / Android Keystore.

## Layout
- `lib/api/` API client, `lib/models/` data classes, `lib/state/` session, bag, language (provider)
- `lib/ui/` screens (`home`, `browse`, `store_page`, `product_page`, `cart`, `checkout`, `orders`, `order_detail`,
  `notifications`, `account`, `auth`, `pro`) and widgets
- `test/` unit + widget tests (`flutter test`), `tool/live_check.dart` contract check against a real server

## Run / test
```
flutter pub get
flutter analyze && flutter test
flutter run --dart-define=API_BASE_URL=https://cheapbazar.org
dart run tool/live_check.dart https://cheapbazar.org      # needs a reachable server; creates and deletes a throwaway buyer
```
`API_BASE_URL` defaults to `https://cheapbazar.org` (see `lib/config.dart`).

## Android release (signed APK)
The signing key lives OUTSIDE the repo: `~/dev/keys/cheapbazar-release.jks` + `key.properties` on the build server.
**Back that folder up.** Every future update must be signed with the same key, or phones refuse to update the app.
```
cp ~/dev/keys/key.properties android/key.properties
flutter build apk --release --target-platform android-arm,android-arm64 --dart-define=API_BASE_URL=<server>
```
`deploy/publish-apk.sh` copies the APK to `downloads/` so the website serves it at `/app` (download page) and `/downloads/<file>`.

Memory-safe on a shared server: `android/gradle.properties` caps Gradle; wrap builds with `~/dev/capped.sh` (systemd cgroup limits).

## iOS (needs a Mac with Xcode, and an Apple Developer account to publish)
```
flutter pub get
flutter build ios --release --dart-define=API_BASE_URL=<server>     # or: open ios/Runner.xcworkspace
```
Then in Xcode: select your Team, set the bundle id if you want a different one (`com.cheapbazar.cheapbazar`), Product > Archive,
upload to TestFlight / the App Store. `.github/workflows/mobile.yml` builds an unsigned iOS bundle on a GitHub macOS runner as a check.
iOS blocks plain-http by default; `Info.plist` has an App Transport Security exception because the server has no HTTPS yet.
**Switch the server to HTTPS and remove that exception before an App Store submission.**

## Before publishing to the stores
- HTTPS + a domain (then build with `--dart-define=API_BASE_URL=https://...`, remove `usesCleartextTraffic` and the ATS exception).
- Account deletion is built in (Account > Delete my account), as both stores require.
- Add a privacy-policy URL in the store listing (the app collects name, email, phone and delivery address for orders).
