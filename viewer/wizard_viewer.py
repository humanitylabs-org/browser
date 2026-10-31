"""Wizard platform integration layered after the pinned noVNC patches."""
from pathlib import Path


def integrate(root):
    root = Path(root)
    client = root / 'client-1.3.0'
    html = client / 'vnc.html'
    text = html.read_text()
    text = text.replace('</head>', '''<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../wizard-viewer.css">
<script defer src="/wizard-os-home/core/app-client.js"></script>
<script type="module" src="../wizard-viewer.js"></script>
</head>''')
    text = text.replace('<nav id="tailnet_mobile_bar"', '''<div id="wizard_handoff_actions"><button id="wizard_remote_back" type="button">Back</button><button id="wizard_done" type="button">Done, give it back</button></div><p id="wizard_done_status" role="status"></p>
    <nav id="tailnet_mobile_bar"''')
    html.write_text(text)
    source = Path(__file__).parent
    for name in ('tokens.css', 'wizard-viewer.css', 'wizard-viewer.js'):
        (root / name).write_bytes((source / name).read_bytes())
