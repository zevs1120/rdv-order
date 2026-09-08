# RDV Team 1.2.1 publication

2026-09-08: user explicitly requested publishing all current changes for their own real testing. Production Guest/Staff database backup and migration have completed. The earlier hold is superseded; authenticated real-account smoke and Firebase push delivery remain unverified and are not represented as passed.

- Version 1.2.1 (4), package `com.rdv.staff`, Android 8.0+.
- Immutable file `/releases/rdv-team-1.2.1.apk`; stable alias `/rdv-team.apk`.
- 2,556,909 bytes; SHA-256 `fe1d0cc183fc2454aae0a3a95045b7164e35aec3255f2373288f137997d6b092`.
- Existing dedicated signing certificate SHA-256 `c65c6c501c5ca826a438d132557ef78d4e1f101d32500b2b18fa3ba288969830`; APK v2 signature verified.
- Includes all current Staff UI increments and the latest centered registration photo frame, Optional label and Register login action. R8/resource shrinking enabled. In-app updates currently download the full compact APK, not a delta patch.

Order metadata, APKs and tab remain unchanged. Concurrent Order source and delta-update changes are excluded. The static verification for this release uses an exported Git-index snapshot, so uncommitted Order verifier changes do not affect the check or deployment. No Order build or full test suite is included. The obsolete local 1.2.0 candidate is not published.
