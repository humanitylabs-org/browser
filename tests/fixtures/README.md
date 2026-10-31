# Shared WizardApp QA dependency

QA serves the **unmodified shared WizardApp client**, fetched outside the app source from `humanitylabs-org/wizard-ux` `web/core/app-client.js` at commit `d5f290f220674a862a0465f84a3997955fe51d3b`, SHA-256 `e7008f44ae81ab459233c055a46da65eb7ddd8305b04333eac838e7e51cd247a`.

The runtime always loads the platform's `/wizard-os-home/core/app-client.js`. It never bundles a copy. CI and `ops/native-amd64.sh` fetch/check the pinned public file for the mock QA shell; no cross-repository credential is needed. For a local run set `WIZARD_APP_CLIENT=/path/to/current/app-client.js`, or put that file at `../browser-handoff-shared-client.js` outside the source directory. Refresh the source commit/checksum when the shared contract changes. Do not vendor this implementation into the app, including a `.js` test fixture: the system-functions admission gate correctly rejects a second implementation.
