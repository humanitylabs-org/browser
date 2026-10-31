import UI from './client-1.3.0/app/ui.js';
const app = window.WizardApp;
if (app) {
  app.ready({name: 'Browser', version: '2.0.0'});
  app.back.register({
    canGoBack: () => document.getElementById('tailnet_paste_sheet').classList.contains('tailnet_open'),
    back: () => { UI.closeTailnetPasteSheet(); return true; },
  });
}
const root = location.pathname.replace(/client-1\.3\.0\/[^/]*$/, '');
const note = document.getElementById('wizard_done_status');
document.addEventListener('pointerdown', (event) => {
  const sheet = document.getElementById('tailnet_paste_sheet');
  if (sheet.classList.contains('tailnet_open') && !event.target.closest('#tailnet_paste_sheet, #tailnet_paste')) {
    UI.closeTailnetPasteSheet();
  }
});
document.getElementById('wizard_remote_back').onclick = async () => {
  // Remote browser history, never the phone's/Wizard's location or history.
  const response = await fetch(root + 'control/back', {method: 'POST', credentials: 'same-origin'});
  if (!response.ok) note.textContent = 'Could not go back. Your browser is still here.';
};
document.getElementById('wizard_done').onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch(root + 'done', {method: 'POST', credentials: 'same-origin'});
    if (!response.ok) throw new Error('not completed');
    UI.closeTailnetPasteSheet();
    if (UI.rfb) UI.rfb.disconnect();
    document.cookie = 'browser_handoff=; Max-Age=0; path=' + root + '; SameSite=Strict';
    note.textContent = 'Your agent has the browser back.';
    if (app && app.hosted) app.nav.back();
  } catch (_) {
    note.textContent = 'Could not return the browser. Try again.';
    button.disabled = false;
  }
};
