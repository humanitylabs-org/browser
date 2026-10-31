#!/usr/bin/env python3
"""Print, never install, an owner gateway route for this Browser on any Wizard box.
The installer imports its EXISTING owner-auth handler as `browser_owner_auth`.
It must reject non-owners and sanitize claimed owner headers before this proxy.
"""
import argparse
import re
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--port',type=int,required=True)
p.add_argument('--prefix',default='/browser')
a=p.parse_args()
if not 1024<=a.port<=65535 or not re.fullmatch(r'/[a-zA-Z0-9_-]+',a.prefix):
    p.error('need an unprivileged port and one safe route segment')
print(f'''# Import inside the Wizard owner gateway. Do not expose CDP or publish the app port.
# Define (browser_owner_auth) with the install's existing owner-auth policy first.
handle {a.prefix}/* {{
    route {{
        import browser_owner_auth
        uri strip_prefix {a.prefix}
        reverse_proxy 127.0.0.1:{a.port} {{
            flush_interval -1
        }}
    }}
}}
''')
