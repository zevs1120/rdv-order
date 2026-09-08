# RDV Team publication gate

2026-09-08: the user authorized adding the native Team APK to the existing Team tab. Order metadata, APKs and tab stay unchanged. Team currently remains **unavailable**, because the corresponding Guest/Staff production database lacks required migrations and Firebase is not provisioned. Do not upload or advertise the candidate as ready yet.

The sibling `rdv-guest-staff-h5-2` repository produced a signed 1.2.0 (3) candidate of 2,556,913 bytes. Its delivery record contains the full signing/hash/build evidence and production gate. This site now supports a separate `/staff-release.json`; absent or invalid release metadata preserves Coming soon. Published metadata requires package `com.rdv.staff`, immutable `/releases/rdv-team-VERSION.apk`, exact bytes/SHA-256 and bilingual notes. Add `/rdv-team.apk` as a stable rewrite when publishing the real artifact. Do not edit `/release.json` or `/rdv-order.apk` for Team.

Focused checks already run: `node distribution/site/verify.mjs` with unavailable metadata and `node distribution/site/verify-staff-release-fixture.mjs /absolute/path/to/app-release.apk` against the genuine candidate in a disposable directory. A review corrected the metadata-loader assertion to read language.js rather than HTML. The fixture copies only public verification inputs, excluding local deployment credentials. No Order app build or full test suite was repeated.

Next action: clear the backend/notification release gates, then copy the final signed artifact, derive metadata, run the site verifier once and publish. This source preparation is not evidence of a public release.
