# 1.3.2 / code 17 — LAN printing connection correction

## Scope and diagnosis

User authorized repair and in-app publication on 2026-11-13, explicitly prohibiting
historical order replay. Read-only evidence for November 12–13 found 11 queued,
attempt-zero deliveries (7 yesterday, 4 today). Table 01's PHP 330 kitchen and bill
at 18:41:23/18:41:31 match the screenshot; a later 19:21 bill has an accepted report.
The old client did not record discovery vs TCP failures. These facts locate the
failure before a claim but do not establish the cause of each historical failure.

## Delivered implementation

- Per-socket Wi-Fi routing for discovery and TCP; Ethernet supported when Wi-Fi is absent. Cloud API routing is untouched.
- Same official Xprinter discovery wire protocol and registered MAC, with fresh sockets, directed/limited broadcast, four safe probes per attempt and complete socket cleanup.
- TCP connect capped at 2.5 seconds. Existing two pre-send connection attempts retained. One bounded write after claim; uncertain/partial writes never retried.
- Bounded, allowlisted pre-send diagnostics stored only on the actor's queued attempt-zero delivery. No migrations, workers, order changes, history replay, layout or ticket-format changes.
- Original signer, Android 8+, mandatory in-app full/delta update; bilingual notes included.

## Acceptance evidence

Ignored evidence: `artifacts/print-connection-fix-2026-11-13/`; original production
read: `artifacts/print-incident-2026-11-13/jobs.json`.

- 150 web tests, TypeScript and Next production build passed. Print environment presence check passed.
- 8 focused JVM checks passed (protocol validation, dropped probe recovery, consecutive searches, connection recovery, claim/report loss, diagnostic failure, and no repeated sends).
- Release lint and signed release build passed.
- Isolated API 35: minified release discovery recovered a dropped probe and reused port 9000 across fresh sockets; actual Android Wi-Fi-bound discovery/TCP sent exactly two expected distinct fixture payloads; Compose ordering/unsent recovery/bill flow passed without duplicate orders or sends.
- Initial checks exposed an 11-byte protocol-header length mistake, corrected before packaging. Host fixture changed from a non-bindable macOS loopback alias to an ephemeral client. Release reflection harness adapted to R8 relocation/narrowed ArrayList signature. Network fixture initially had Wi-Fi disconnected; explicitly connected only the isolated emulator before rerunning that check. These failures were not hotel tests.
- Staging verified original certificate, alignment, identity/version, full APK and byte-exact code-16 delta reconstruction. Download site verification passed.

Signed APK: 1,674,585 bytes; SHA-256
`ce65f1087f62ac3253cd95b5bc3603a2b25f83181019cf335dae0232e07b47f8`.
Code-16 delta: 1,325,453 bytes.

## Publication

Backend diagnostic support must be READY before the new download manifest is
published. Publication IDs and final public readbacks are recorded below after
deployment. Hotel physical paper acceptance follows the normal upgraded workflow;
no live test tickets or historical resends are authorized by this release procedure.
