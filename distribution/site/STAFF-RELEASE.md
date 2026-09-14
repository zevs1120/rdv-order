# RDV Team 1.2.2 download-site publication

The user explicitly requested replacing the download-site Team entry with the complete 1.2.2 APK after clarification that installed 1.2.1 cannot auto-check or change its compiled server origin. This supersedes the immediately preceding instruction to leave the download site at 1.2.1.

- Version 1.2.2 (5), package com.rdv.staff, Android 8.0+.
- Existing verified signed artifact reused, no rebuild: 2,573,293 bytes, SHA-256 `72e6cb32ed96765130eed6c7a9f88198a38ddc1beea1b048cff90e2172d886b6`.
- Signer unchanged: `c65c6c501c5ca826a438d132557ef78d4e1f101d32500b2b18fa3ba288969830`.
- Immutable `/releases/rdv-team-1.2.2.apk`; stable `/rdv-team.apk` now targets this release. Old APKs remain immutable.
- Native API is https://team.resortdejavu.cn. Password minimum is 6 characters with no character-class requirement. New native baseline checks updates on launch/resume and exposes updates before login.
- This is the complete APK. Install over the existing app, preserving data. The current 1.2.1 installation cannot be made to update itself remotely without its missing check/origin changes.

Only Team metadata, Team alias, Team APK and this record are included. Pending Order 1.1.0, menu, connectivity and delta work remains uncommitted and unpublished by this task. Static verification uses the exact exported index snapshot. Previously passed Staff hotfix checks/build/signature verification are reused.

## Release dates (2026-09-14)

For every future Order or Team download upload, after staging the APK and metadata,
run `node distribution/site/stamp-release-dates.mjs` before committing the release.
It automatically records the Asia/Manila date for a new APK hash and preserves the
date for unchanged APKs. Commit the generated metadata with the APK. Order's
`android:stage-release` invokes it automatically. Team's release upload procedure
must include this command. The download build rejects missing or stale date/hash
bindings, so a new package cannot silently retain an old release date.
The page reads each app's metadata and displays Release date / 发布日期 below
its version information. Initial dates follow the existing release records:
Order 1.1.2 on 2026-09-09; Team 2.1.0 on 2026-09-14.
