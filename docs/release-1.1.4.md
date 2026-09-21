# RDV Order 1.1.4 / code 13

User explicitly authorized the APP update with unchanged layout. Order submission restores kitchen + priced front-desk copies in one XPYUN job. Provider deduplication no longer creates a false device failure. Web/native resolve an ambiguous initial order response through the original request-status key without a second POST; a bill refresh error after a saved order is identified separately.

## Verification

- TypeScript, 195 distinct Web tests and production build passed. After 194 passing tests, corrected a default-GET fixture assertion and reran only its 13 client-api tests.
- 65 JVM tests, release lint/build and resource parity passed.
- Isolated API35 emulator-5580: normal order/print/checkout, automatic lost-response recovery with exactly one order, and saved-order bill timeout with retained success and no resubmission: three flows passed.
- Two signed-package API35 installation/update checks passed. Staging verified original certificate, alignment, package identity and exact reconstruction from the code12 delta. No Android full-suite repetition.
- Print environment check passed. No live paper tests, business writes, historical replay, queue clearing or schema change.

## Artifacts

- Production signed APK: `distribution/site/public/releases/rdv-order-1.1.4.apk`, 1,625,429 bytes.
- SHA-256: `4de7203b3819764ef2c8ea46b439045658685ee65e4db4cf2ab4d97c714a62ab`.
- Code12 delta: `distribution/site/public/releases/rdv-order-1.1.4-from-12.rdvdelta`, 1,283,513 bytes. Full APK fallback retained.
- Android 8.0+ / API26, package `com.rdv.order`, original release signer. Bilingual mandatory update notes included.

## Delivery boundary

Deployment and public-download evidence will be appended locally after publication. Exclude unrelated pending Staff download changes. Hotel physical two-copy acceptance is still outstanding. Background queryOrderState reports are stored as manufacturer confirmation, never described as independent physical verification; missing remote IDs remain unconfirmed.
