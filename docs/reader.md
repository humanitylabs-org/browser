# Browser Reader (Phase 1)

## Reuse decisions

- **REUSE** `WizardApp` v1 for hosted appearance, live skin changes and Back. The vendored Wizard UI kit and dark tokens are the standalone fallback; they are not a new theme engine.
- **EXTEND** `WizLinks` for outside-link admission to the installed Browser app. Chats and Search use this same implementation. Existing internal routes, file downloads, media handling and explicit system-browser actions remain shared.
- **REUSE / EXTEND** the Browser MCP front and stock Chromium engine. The front retains private `/mcp` and CDP interfaces and adds an explicit public Reader route allowlist. Its single-response relay is shared infrastructure needed for the later front/engine Live implementation, not a Live viewer.
- **NEW** `reader/`: rendering/extraction and proxy policy are Browser app domain code. There is no Search reader and no third-party page iframe inside the Wizard shell.

## Trust boundary

The owner document receives only a JSON article made by Mozilla Readability (Apache-2.0) and DOMPurify (Apache-2.0/MPL-2.0), parsed in jsdom without resource loading or script evaluation. Every article text field is rendered as text. Body HTML has a strict element/attribute allowlist. No scripts, handlers, forms, styles, SVG, frames, source CSP/reporting or arbitrary attributes survive. Source pages run only in a disposable remote Chrome context. Source peer sockets, workers, service workers and WebSockets are disabled. A deny-all HTTP proxy is a second fence for any request not explicitly fulfilled through the public-network fetcher.

Each network request resolves all DNS answers, rejects special-use and box-private addresses, pins a checked IP for the connection and rechecks every redirect. Both IPv4 and IPv6 are covered. All single-label service names, localhost variants, local/internal names and Tailscale DNS are blocked. Operators can add public aliases for this box with `READER_DENY_HOSTS` (comma-separated). No request inherits agent or owner cookies, authentication, proxy settings or request headers. Reader never takes the default agent browser context. Reader contexts are closed on completion, error and timeout.

Article requests are limited to two concurrent renders, 25 seconds, 120 resource requests, 8 MiB per resource / rendered DOM and 32 MiB of total response bytes per render. Only GET resources are fulfilled; media/fonts and source WebSockets are refused. Image proxy requests are limited to eight concurrent responses, 15 seconds and 5 MiB, accepting bitmap formats with matching signatures only. SVG/HTML images are not proxied. No pages or cookies are persisted.

The Reader CSP permits only app/Wizard scripts, app styles, same-origin bitmap proxies and same-origin API calls. Its headers include nosniff, same-origin resource policy and no-referrer. Public proxy requests to DevTools or MCP are refused, even while Reader is available. The private network interface remains compatible for existing agent clients.

## Packaging and delivery

The installed core recipe is from `humanitylabs-org/wizard-app-store`, not the `source:` value in the old Browser manifest. Therefore the core recipe must be updated by its own PR as well as the Browser source and Wizard UX. Browser remains id `browser` and provides `browser`; its app revision is `155.0.8059.41`, while Chromium remains **155.0.8059.40** (no Chromium version claim or update).

The candidate image tag in Compose must be replaced with a verified multiarchitecture digest before release. Do not publish the App Index before both amd64 and arm64 manifests are present. Run `python3 mcp/inline.py` after changing the front. Run `wam check`, Reader tests, front lifecycle tests and core recipe schema tests. Verify the final composed app in the live shell on two skins, including a live change and desktop/phone layouts; standalone screenshots are not that gate.

The later Live implementation can replace only the `browser-engine` service and add its narrowly public viewer routes. Keep the Reader service, isolation policy and explicit original-site escape. No Live tab or noVNC code is included here; the existing handoff PRs and staging containers are untouched.
