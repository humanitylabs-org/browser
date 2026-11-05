---
wizard: 0.2
id: browser
name: Browser
type: view
category: system
tags: [research, automation]
version: 155.0.8059.41
summary: Read web pages inside Wizard, with a private Chrome for agent web tasks.
view:
  path: /
  port: 9222
icon: icon.png
license: WTFPL
source: https://github.com/humanitylabs-org/browser
runtime:
  kind: runtipi
  config: runtipi/config.json
  compose: runtipi/docker-compose.yml
mcp:
  path: /mcp
  port: 9222
  transport: streamable-http
skill: SKILL.md
provides:
- browser
---

# Browser

A shared headless Chrome for rendering and web tasks.
