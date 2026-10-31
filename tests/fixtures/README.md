# Shared WizardApp test fixture

`wizard-app-client.js` is an unmodified snapshot of `humanitylabs-org/wizard-ux` `web/core/app-client.js` at `d5f290f220674a862a0465f84a3997955fe51d3b` (clean file at extraction).

It is served **only by the mock QA shell**, never by the Browser runtime. The installed viewer loads the platform's shared `/wizard-os-home/core/app-client.js`. Keeping the fixture here lets native CI test the actual client protocol, not a hand-written imitation, without a cross-repository credential. Refresh it from the shared source when that contract changes, and record the source commit. Set `WIZARD_APP_CLIENT=/path/to/current/app-client.js` to run against an installed/source client instead.
