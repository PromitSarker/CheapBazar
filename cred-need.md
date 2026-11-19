# Credentials needed: Google ads for Cheap-Bazar

Until these are filled in, the ads are **off** and nothing is shown to visitors. The code is finished and tested.
None of these IDs is a password. **Never send me your Google login, password or payment details.**
The IDs are safe to paste in chat; I put them in the server's `.env` (and the manifest for item 5).

## A. Website: Google AdSense (https://adsense.google.com)

Before the IDs work, add `cheapbazar.org` under AdSense > **Sites** and let Google review it. Review needs the
`/privacy` and `/about` pages (done) and `/ads.txt` (done, served once item 1 is set).

| # | What I need | Where to find it | Goes in | Example |
|---|-------------|------------------|---------|---------|
| 1 | **Publisher ID** | AdSense > Account > Settings > Account information | `ADSENSE_CLIENT` | `ca-pub-1234567890123456` (AdSense may show it as `pub-1234567890123456`; both work) |
| 2 | **Ad unit ID: Home** | AdSense > Ads > By ad unit > Display ads > create one named "home"; copy the number after `data-ad-slot=` | `ADSENSE_SLOT_HOME` | `1234567890` |
| 3 | **Ad unit ID: Marketplace top** | same, create one named "browse-top" | `ADSENSE_SLOT_BROWSE` | `1234567891` |
| 4 | **Ad unit ID: Marketplace sidebar** | same, create one named "browse-side" | `ADSENSE_SLOT_BROWSE_SIDE` | `1234567892` |
| 4b | **Ad unit ID: Storefront** | same, create one named "store" | `ADSENSE_SLOT_STORE` | `1234567893` |

Choose **Display ads, responsive** for each unit.
In AdSense > Ads > **Auto ads**, keep Auto ads **off** for this site. Otherwise Google may put ads on pages I deliberately keep ad-free (dashboard, checkout).

A placement whose unit ID is missing simply stays empty. You can send the Publisher ID first and the unit IDs later.

## B. App: Google AdMob (https://admob.google.com)

AdSense cannot serve ads inside a native app, so the app uses AdMob (same Google account is fine).
In AdMob: Apps > **Add app** > Android > "not published yet" (or publish later) > package name `com.cheapbazar.cheapbazar`.

| # | What I need | Where to find it | Goes in | Example |
|---|-------------|------------------|---------|---------|
| 5 | **AdMob App ID** | AdMob > Apps > your app > App settings | `mobile/android/app/src/main/AndroidManifest.xml` (**needs a new APK**) | `ca-app-pub-1234567890123456~1234567890` (note the `~`) |
| 6 | **Banner unit ID: Home** | AdMob > Apps > Ad units > Add ad unit > Banner | `ADMOB_BANNER_HOME` | `ca-app-pub-1234567890123456/1234567890` (note the `/`) |
| 7 | **Banner unit ID: Browse** | same | `ADMOB_BANNER_BROWSE` | `ca-app-pub-1234567890123456/1234567891` |
| 8 | **Banner unit ID: Product page** | same | `ADMOB_BANNER_PRODUCT` | `ca-app-pub-1234567890123456/1234567892` |

After I set the unit IDs I also set `ADMOB_ENABLED=true`. The app picks the change up on its next start, without a new APK.
Only the App ID (item 5) is baked into the APK, so it needs one rebuild and publish.

## C. Site contact

| # | What I need | Goes in | Currently |
|---|-------------|---------|-----------|
| 9 | **Support email** shown on `/privacy` and `/about` | `SUPPORT_EMAIL` | placeholder `support@cheapbazar.org`. Please confirm or give the real address |

## Checklist: what to send me

- [ ] 1. AdSense Publisher ID
- [ ] 2. AdSense unit: Home
- [ ] 3. AdSense unit: Marketplace top
- [ ] 4. AdSense unit: Marketplace sidebar
- [ ] 4b. AdSense unit: Storefront
- [ ] 5. AdMob App ID
- [ ] 6. AdMob banner: Home
- [ ] 7. AdMob banner: Browse
- [ ] 8. AdMob banner: Product page
- [ ] 9. Support email (confirm)

Minimum to start earning on the website: **1 + at least one of 2-4b**. Everything else can follow.

## Not credentials, but for your info

- The new Zen look uses open-licence assets only (Phosphor Icons MIT, Newsreader + Noto Serif Bengali OFL), so **nothing to buy or sign up for**.

## Other things on your side (no credentials, only your actions)

- Add the site in AdSense and wait for Google's approval (can take days).
- Fill in your payment details and tax information inside Google AdSense / AdMob. Only you can do this.
- Deploy: the code is committed on branch `feat/adsense-minimal-ui` but **not yet live**. It still needs the merge, build and restart described in my last message.
- If you serve visitors in the EU/UK, set up Google's consent message in AdSense > Privacy & messaging.
