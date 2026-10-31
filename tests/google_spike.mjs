// No credentials: only a nonexistent email, with CDP attached throughout.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const base=process.env.BASE||'http://127.0.0.1:18793';
const label=process.env.SPIKE_CONFIG||'default';
fs.mkdirSync('qa-out',{recursive:true});
const browser=await chromium.connectOverCDP(base);
const page=await browser.contexts()[0].newPage();
const report={config:label,cdp_attached:true};
try {
  await page.goto('https://accounts.google.com/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#identifierId').waitFor({timeout:30000});
  report.webdriver=await page.evaluate(()=>navigator.webdriver);
  await page.locator('#identifierId').fill('wizard-spike-test@example.com');
  await page.locator('#identifierNext').click();
  await page.waitForTimeout(6500);
  report.url=page.url();
  report.text=await page.locator('body').innerText();
  report.not_secure=/browser or app may not be secure|browser.*not.*secure/i.test(report.text);
  report.account_not_found=/couldn.t find your Google Account|couldn.t find.*account/i.test(report.text);
  await page.screenshot({path:`qa-out/google-${label}.png`});
} catch(error) {report.error=String(error); await page.screenshot({path:`qa-out/google-${label}.png`}).catch(()=>{});}
try {
  await page.goto('https://console.cloud.google.com/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(5000);
  report.console_url=page.url();
  report.console_text=await page.locator('body').innerText();
  await page.screenshot({path:`qa-out/cloud-console-${label}.png`});
} catch(error) {report.console_error=String(error);}
fs.writeFileSync(`qa-out/google-${label}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await page.close();
// Disconnect only; the engine owns Chromium.
process.exit(0);
