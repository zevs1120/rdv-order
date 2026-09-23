# RDV Order 1.2.0 / code 14

Status: signed and staged locally; migration 026 applied (new task table empty). Production deployment pending.

Replaces the previous printing runtime with a single official XPYUN path: fixed two-copy order tickets, persisted per-request receipt intent, per-printer sending, short offline cloud buffering and durable Vercel Workflow recovery. Staff keep the same layout and see short printing feedback. The old dispatcher/fallback/runtime modules are removed; historical print_jobs are untouched.

## Artifact

- Production signed APK: `distribution/site/public/releases/rdv-order-1.2.0.apk`.
- Android 8.0+ / API26, original production signer, package `com.rdv.order`.
- Full: 1,625,433 bytes; SHA-256 `cf9628b0bf625578c7ebe4c32b622295eb7bafec1c8107a4dfaa0a1d72fa82bc`.
- Code13 delta: 1,282,709 bytes; `distribution/site/public/releases/rdv-order-1.2.0-from-13.rdvdelta`.
- Full download remains available. Staging checked identity, signature, alignment and exact delta reconstruction. Bilingual mandatory-update notes supplied.

## Proportional checks

Per the user's latest instruction, only focused checks were used: 6 queue tests, 3 transport tests, 6 order/print integration tests, 3 receipt-route tests, 14 client API tests, 16 repository JVM tests, TypeScript and production Next build, Android release build/lintVital and download metadata verification. Unchanged broad web/JVM/device suites were not rerun. New two-copy renderer was checked with a compact sample; ticket content does not truncate dishes to fit the cloud limit.

The source uses a Vercel Workflow before the business transaction commits and a best-effort after() fast wake. Cloud acceptance/completion is internal evidence, never independent paper proof. No test order was sent to the hotel, no historical queue was replayed/cleared, and no printer binding/node was changed. Actual on-site printing remains for the user's real-world trial.
