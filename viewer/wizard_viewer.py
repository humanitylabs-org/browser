"""Wizard platform integration layered after the pinned noVNC patches."""
from pathlib import Path


def integrate(root):
    root = Path(root)
    client = root / 'client-1.3.0'
    html = client / 'vnc.html'
    text = html.read_text()
    text = text.replace('</head>', '''<link rel="stylesheet" href="../wizard-tokens.css">
<link rel="stylesheet" href="../wizard-ui.css">
<link rel="stylesheet" href="../wizard-viewer.css">
<script defer src="/wizard-os-home/core/app-client.js"></script>
<script type="module" src="../wizard-viewer.js"></script>
</head>''')
    text = text.replace('<nav id="tailnet_mobile_bar"', '''<div id="wizard_handoff_actions"><button class="wz-button secondary" id="wizard_remote_back" type="button">Back</button><button class="wz-button secondary" id="wizard_done" type="button">Done, give it back</button></div><p id="wizard_done_status" role="status"></p>
    <nav id="tailnet_mobile_bar"''')
    html.write_text(text)
    ui = client / 'app' / 'ui.js'
    ui_text = ui.read_text()
    # RFB's own encryption flag describes only the inner VNC hop, not the outer
    # owner-authenticated HTTPS/WSS route. Do not surface container hostnames.
    for label in ('Connected (encrypted) to ', 'Connected (unencrypted) to '):
        ui_text = ui_text.replace('_("' + label + '") + UI.desktopName', '_("Connected to your browser")')
    ui.write_text(ui_text)
    source = Path(__file__).parent
    for name in ('wizard-tokens.css', 'wizard-ui.css', 'wizard-viewer.css', 'wizard-viewer.js'):
        (root / name).write_bytes((source / name).read_bytes())
