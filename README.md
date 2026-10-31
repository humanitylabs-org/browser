# Browser

The core Wizard Browser: headful Chromium on Xvfb, stock CDP for agents, and an owner-private mobile takeover of the **same** session. Based on [Oscar's Browser PR #1](https://github.com/oscarhenrycollins/browser/pull/1), retaining its pinned noVNC 1.3.0 viewer and phone input fixes.

## Components

- `wizard.md`, `runtipi/`: app manifest and install recipe. The main port is loopback-only; the engine does not publish host ports.
- `mcp/front.py`, `mcp/tools.py`: local agent MCP and CDP front; regenerate the embedded compose source with `python3 mcp/inline.py`.
- `engine/`: native Debian Chromium, Xvfb, x11vnc and websockify. VNC starts only during a handoff; its internal WebSocket requires a separate per-session secret.
- `viewer/`: checksum-pinned noVNC **1.3.0**, versioned `client-1.3.0/`, native touch/RFB input, focus guard, Keyboard, masked Paste, Up/Down, remote Back and **Done, give it back**. WizardApp owns Back/Appearance; vendored kit tokens/UI provide standalone dark fallbacks. Floating text panels are opaque.
- `SKILL.md`: shipped agent workflow, local CDP configuration, privacy rules and owner completion signal.
- `ops/owner-route.py`: prints the portable owner gateway mapping; never changes a running install.
- `.github/workflows/publish.yml`: stdlib checks and **native** amd64/arm64 jobs. No QEMU Chromium. Only main promotes the stable tag and publishes to the app index; manual branch runs produce SHA candidate tags only.

## Owner route: installation contract

The viewer needs two independent gates: Wizard's existing **owner authentication** and a short-lived Browser session capability. Do not treat an unguessable URL, app port, Tailscale membership or a claimed identity header as owner authentication.

The installer must:

1. Install the Browser recipe and configure its assigned `APP_PORT` (default metadata port 8793). Do not publish the engine's 6080/6081/9222 ports or bind the main port to 0.0.0.0.
2. Mount `/browser/*` behind the installation's existing owner-only gateway policy, for **HTTP and WebSocket upgrades**. Strip `/browser` before proxying to `127.0.0.1:APP_PORT`; preserve `/handoff/...`, cookies and proxy headers. Owner auth must sanitize client-supplied identity headers and fail closed before proxying. Generate the mapping with:
   ```sh
   python3 ops/owner-route.py --port 8793
   ```
   Define the referenced `(browser_owner_auth)` snippet using the install's existing owner policy, validate the resulting gateway config, then activate on staging first. It deliberately has no hardcoded host, home path, tailnet, identity or auth-service port.
3. Register the owner view as `/browser/handoff/` in the platform route registry (`browser.view`). The manifest's direct view path is `/handoff/`; this is not the agent's CDP URL. The standard Wizard `/apps/<id>/` view proxy is not assumed to support VNC upgrades; use the explicit owner gateway mapping until that transport is proven.
4. The Browser defaults to owner-relative `/browser/handoff/#...` links. For chat channels requiring absolute links set `BROWSER_PUBLIC_URL=https://<owner-gateway>/browser` in the app environment or pass `start_handoff(base_url=...)`. Nonstandard prefixes can be printed with `--prefix /your-browser`; set the matching base URL.
5. Keep `/wizard-os-home/core/app-client.js` and the shared kit at their standard owner-origin paths so the framed viewer follows live Wizard skins and shared Back. Standalone has vendored dark kit fallback and works without the shared client; the supported install path is the owner gateway, not a standalone publicly exposed port.
6. Point stock Hermes `browser.cdp_url` / `BROWSER_CDP_URL` at the **direct local** Browser address. No Hermes core patch is needed.

Requests with proxy headers get 403 for DevTools and MCP, even if a broad owner-route prefix is accidentally configured. Only `/handoff/` serves remote content. The proxy forwards one HTTP request per socket (except deliberate WebSocket upgrades) so a kept-alive DevTools connection cannot smuggle a subsequent MCP call upstream.

## Handoff protocol

Local MCP `start_handoff(tab_id, purpose, note, ttl_s)` returns a fragment capability and session id. The viewer exchanges the capability for a scoped SameSite cookie; it never enters query parameters or referrers. `POST /handoff/done` requires that cookie, stops VNC, revokes the capability, and records `owner_done=true`, `completed_at` and `active=false` for local MCP `handoff_status`. The browser and its tabs stay alive. Expiry/revocation also kills existing VNC connections.

There is one shared browser and one active handoff. A trusted agent must pause CDP/page reads/screenshots while the owner controls it; CDP itself is not locked out (agents may retain their connection). The container is hardened read-only/non-root/cap-drop, but Chromium runs with `--no-sandbox` for compatibility. Treat untrusted pages as risky; the container boundary is not a complete browser security sandbox. Login cookies live on tmpfs and disappear on app restart/replacement.

## Build / QA

Native arm64 (Apple silicon, Colima; worktree must be under `$HOME`):

```sh
export PATH=/opt/homebrew/bin:$PATH DOCKER_CONTEXT=colima
colima ssh -- df -h /var/lib/docker   # need >=10 GB available
# Do not prune unrelated volumes; inspect old images if space is low.
docker buildx build --platform linux/arm64 --load -f engine/Dockerfile -t browser-handoff:arm64 .
APP_PORT=18793 docker compose -p browser-handoff-qa -f runtipi/docker-compose.yml -f tests/arm64.override.yml up -d
python3 mcp/inline.py --check
python3 -m unittest discover -s tests -p 'test_*.py' -v
npm install --no-save playwright-core
# Supply a native local Chromium path (do not run amd64 Chromium via QEMU).
BASE=http://127.0.0.1:18793 CHROME=/path/to/native/Chromium node tests/qa_handoff.mjs
# Fetch/copy the shared client outside app source (CI checks the pinned checksum).
# WIZARD_APP_CLIENT=/path/to/current/wizard-ux/web/core/app-client.js
BASE=http://127.0.0.1:18793 CHROME=/path/to/native/Chromium node tests/qa_owner_route.mjs
BASE=http://127.0.0.1:18793 SPIKE_CONFIG=default node tests/google_spike.mjs
APP_PORT=18793 docker compose -p browser-handoff-qa -f runtipi/docker-compose.yml -f tests/arm64.override.yml down
```

`qa_owner_route.mjs` uses a **mock owner-authenticated gateway and shell** with the genuine shared WizardApp facade, not a claimed production deployment. It tests unauthenticated/spoofed-identity refusal, proxy CDP/MCP isolation, touch typing, live Signal→Grove Appearance, Back and owner Done→same-tab agent resume. Its `qa_owner=yes` test cookie is **not** a production auth implementation.

Native Linux/amd64: stage the source plus shared client fixture on the authorized native x86 worker and submit `bash ops/native-amd64.sh` on the light lane. It builds and tests natively, then tears down its QA containers. Do not emulate amd64 on Thales. The multiarch release workflow likewise uses native `ubuntu-24.04` and `ubuntu-24.04-arm` runners.

## Google spike (31 October 2026)

Native arm64, Debian Chromium 156.0.8078.73, CDP attached throughout. No real credentials or accounts used. The fake email `wizard-spike-test@example.com` reached **“Couldn’t find this account”**, not “This browser or app may not be secure”, in both configurations:

- Default engine flags: no `--enable-automation`, `navigator.webdriver === false`.
- Default plus `--disable-blink-features=AutomationControlled`: same result.

`console.cloud.google.com` signed out redirected normally to Google sign-in with the Cloud Platform prompt. This only clears the **email-entry probe**. It does not establish that Google's real-account/password/2FA/device-policy checks or OAuth project creation will succeed. The owner must complete that acceptance through the private viewer.
