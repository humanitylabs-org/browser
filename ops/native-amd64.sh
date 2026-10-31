#!/usr/bin/env bash
# Native Linux/amd64 only; submit this on forum's light lane after staging source.
set -euo pipefail
[ "$(uname -m)" = x86_64 ] || { printf '%s\n' 'Refusing non-native amd64 build'; exit 1; }
: "${IMAGE_TAG:=browser-handoff:amd64}"
export APP_PORT=18793 BROWSER_PUBLIC_URL=http://127.0.0.1:18793
mkdir -p qa-out
python3 mcp/inline.py --check
python3 -m unittest discover -s tests -p 'test_*.py' -v
docker buildx build --platform linux/amd64 --load -f engine/Dockerfile -t "$IMAGE_TAG" .
python3 -c 'import json,os; open("qa-out/native.override.json","w").write(json.dumps({"services":{"browser-engine":{"image":os.environ.get("IMAGE_TAG","browser-handoff:amd64")}}}))'
compose=(docker compose -p browser-handoff-native-amd64 -f runtipi/docker-compose.yml -f qa-out/native.override.json)
trap '"${compose[@]}" down --remove-orphans' EXIT
"${compose[@]}" up -d
python3 -c 'import urllib.request,time
for i in range(60):
 try:
  print(urllib.request.urlopen("http://127.0.0.1:18793/handoff/health",timeout=2).read()); break
 except Exception:
  if i==59: raise
  time.sleep(1)'
# All Chrome processes here are amd64 on amd64, never QEMU. Use the matching
# Playwright package/browser cache and an isolated disposable QA container.
# Fetch the genuine shared client outside the app source, not a forked runtime copy.
SHARED_CLIENT="$PWD/../browser-handoff-shared-client.js"
curl -fLsS https://raw.githubusercontent.com/humanitylabs-org/wizard-ux/d5f290f220674a862a0465f84a3997955fe51d3b/web/core/app-client.js -o "$SHARED_CLIENT"
printf '%s  %s\n' e7008f44ae81ab459233c055a46da65eb7ddd8305b04333eac838e7e51cd247a "$SHARED_CLIENT" | sha256sum -c -
docker run --rm --network host --ipc=host -v "$PWD:/work" -v "$SHARED_CLIENT:/shared/app-client.js:ro" -w /work \
  -e WIZARD_APP_CLIENT=/shared/app-client.js \
  -e BASE=http://127.0.0.1:18793 -e OUT=qa-out \
  mcr.microsoft.com/playwright:v1.56.1-noble \
  bash -ec 'npm install --no-save playwright-core@1.56.1; node tests/qa_handoff.mjs; node tests/qa_owner_route.mjs' \
  | tee qa-out/native-amd64-qa.log
docker image inspect "$IMAGE_TAG" --format '{{.Id}} {{.Architecture}} {{json .RepoDigests}}' | tee qa-out/native-amd64-image.txt
# Keep the built image on forum until a registry push is authorized/configured.
# Valuable qa-out evidence must be copied to the parent's durable evidence bundle.
