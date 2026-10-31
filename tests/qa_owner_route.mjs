// Integration: owner-authenticated prefixed gateway + genuine WizardApp client,
// noVNC touch input, Appearance messages, owner Done, agent CDP resume.
import {chromium} from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
const base=new URL(process.env.BASE||'http://127.0.0.1:18793');
const out=process.env.OUT||'qa-out'; fs.mkdirSync(out,{recursive:true});
const origin='http://127.0.0.1:18894';
const owner=req=>String(req.headers.cookie||'').split(';').some(c=>c.trim()==='qa_owner=yes');
const assets={
 '/wizard-os-home/core/app-client.js': [process.env.WIZARD_APP_CLIENT||'tests/fixtures/wizard-app-client.js','text/javascript'],
 '/wizard-os-home/kit/wizard-tokens.css': ['viewer/tokens.css','text/css'],
 '/wizard-os-home/kit/wizard-ui.css': ['viewer/wizard-ui.css','text/css'],
};
const shell=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/wizard-os-home/kit/wizard-tokens.css"><style>body{margin:0;background:var(--wz-base);color:var(--wz-text);font:16px system-ui}header{height:48px;padding:0 12px;display:flex;align-items:center}iframe{width:100%;height:calc(100dvh - 48px);border:0}</style></head><body><header>Wizard · Browser</header><iframe title="Browser"></iframe><script>
window.shellBacks=0;
window.WizAppServices={connect:(w,c)=>(window.hostBack=c.back, {ready:()=>({version:1,hosted:true}),nav:{back:()=>{window.shellBacks++}},theme:{current:()=>null,subscribe:()=>()=>{}}})};
window.setSkin=(skin)=>{document.documentElement.dataset.skin=skin;const cs=getComputedStyle(document.documentElement);let tokens={};for(const k of ['canvas','base','chrome','overlay','surface','surface-raised','text','text-secondary','text-muted','border','accent','accent-soft','on-accent','reader-surface']){let v=cs.getPropertyValue('--wz-'+k).trim();if(v==='transparent')v='rgba(0,0,0,0)';tokens[k]=v;}window.revision=(window.revision||0)+1;document.querySelector('iframe').contentWindow.postMessage({type:'wizard:appearance',appearance:{version:1,revision:window.revision,skin,presentation:'window',colorScheme:'dark',tokens}},location.origin)};
addEventListener('message',e=>{if(e.data?.type==='wizard:appearance:ready')setSkin(document.documentElement.dataset.skin||'signal')});
</script></body></html>`;
const server=http.createServer((req,res)=>{
 if(!owner(req)){res.writeHead(401);return res.end('Owner required');}
 if(req.url==='/shell'){res.setHeader('content-type','text/html');return res.end(shell);}
 if(assets[req.url]){const [p,t]=assets[req.url];res.setHeader('content-type',t);return res.end(fs.readFileSync(p));}
 if(!req.url.startsWith('/browser/')){res.writeHead(404);return res.end();}
 const headers={...req.headers,host:base.host,'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'http'};
 const up=http.request(new URL(req.url.slice('/browser'.length),base),{method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 up.on('error',e=>{res.writeHead(502);res.end(String(e));});req.pipe(up);
});
server.on('upgrade',(req,socket,head)=>{
 if(!owner(req)||!req.url.startsWith('/browser/')){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
 const up=http.request(new URL(req.url.slice('/browser'.length),base),{headers:{...req.headers,host:base.host,'x-forwarded-for':'127.0.0.1'}});
 up.on('upgrade',(r,remote,rest)=>{socket.write(`HTTP/1.1 ${r.statusCode} ${r.statusMessage}\r\n`+Object.entries(r.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(rest.length)socket.write(rest);if(head.length)remote.write(head);remote.pipe(socket);socket.pipe(remote);socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());});
 up.on('response',r=>{socket.end(`HTTP/1.1 ${r.statusCode} Denied\r\nConnection: close\r\n\r\n`);});up.on('error',()=>socket.destroy());up.end();
});
await new Promise(r=>server.listen(18894,'127.0.0.1',r));
const checks=[];function check(name,ok,detail){checks.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+' '+JSON.stringify(detail??''));if(!ok)throw Error(name);}
async function mcp(name,args={}){const r=await fetch(new URL('/mcp',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const d=await r.json();if(d.result?.isError)throw Error(JSON.stringify(d));return JSON.parse(d.result.content[0].text);}
let agent,phone;
try{
 check('unauthenticated owner route refused',(await fetch(origin+'/browser/handoff/')).status===401);
 check('spoofed owner header refused',(await fetch(origin+'/browser/handoff/',{headers:{'tailscale-user-login':'owner'}})).status===401);
 for(const path of ['/json/version','/mcp']){let r=await fetch(origin+'/browser'+path,{headers:{cookie:'qa_owner=yes'},method:path==='/mcp'?'POST':'GET'});check('proxy blocks '+path,r.status===403,r.status);}
 const ver=await(await fetch(new URL('/json/version',base))).json();agent=await chromium.connectOverCDP(ver.webSocketDebuggerUrl);const ctx=agent.contexts()[0];const remote=await ctx.newPage();await remote.setContent('<html><body style="background:#fff;font:24px system-ui;padding:35px"><h1>Sign-in fixture</h1><input id="email" type="email" style="height:60px;font:24px system-ui;width:320px"><p id="result"></p></body></html>');
 // Target ID comes from this exact page, not an ambiguous title match.
 // Match by unique content through CDP Target list if another untitled page exists.
 const session=await ctx.newCDPSession(remote);const target=(await session.send('Target.getTargetInfo')).targetInfo.targetId;
 const hand=await mcp('start_handoff',{tab_id:target,base_url:origin+'/browser',purpose:'login',replace:true,ttl_s:120});
 phone=await chromium.launch({headless:true,executablePath:process.env.CHROME});const mobile=await phone.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});await mobile.addCookies([{name:'qa_owner',value:'yes',url:origin}]);const page=await mobile.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+'/shell');await page.locator('iframe').evaluate((el,url)=>el.src=url,hand.handoff_url);
 let frame;for(let i=0;i<60;i++){frame=page.frames().find(f=>f.url().includes('client-1.3.0/vnc.html'));if(frame&&await frame.locator('#noVNC_container canvas').count())break;await page.waitForTimeout(200);}
 await frame.waitForFunction(()=>document.getElementById('tailnet_keyboard')?.disabled===false,{timeout:20000});
 await frame.waitForFunction(()=>document.documentElement.classList.contains('noVNC_connected'));
 await page.waitForTimeout(500);
 for(const skin of ['signal','grove']){await page.evaluate(s=>setSkin(s),skin);await frame.waitForFunction(s=>document.documentElement.dataset.skin===s,skin);const appearance=await frame.evaluate(()=>({skin:document.documentElement.dataset.skin,presentation:document.documentElement.dataset.presentation,background:getComputedStyle(document.getElementById('tailnet_mobile_bar')).backgroundColor,button:getComputedStyle(document.getElementById('wizard_done')).color}));check('Appearance live '+skin,appearance.skin===skin&&!appearance.background.includes('rgba'),appearance);await page.screenshot({path:`${out}/owner-route-${skin}.png`});}
 const field=await remote.locator('#email').boundingBox();const canvas=await frame.locator('#noVNC_container canvas').boundingBox();const vp=await remote.evaluate(()=>({w:innerWidth,h:innerHeight,oh:outerHeight}));const scale=canvas.width/500;await page.touchscreen.tap(canvas.x+(field.x+40)*scale,canvas.y+(vp.oh-vp.h+field.y+25)*scale);await page.waitForTimeout(350);if(await frame.locator('#tailnet_keyboard').getAttribute('aria-expanded')!=='true')await frame.locator('#tailnet_keyboard').tap();await page.keyboard.type('owner-phone@example.com');await page.waitForTimeout(350);check('touch handoff typing reached same CDP tab',await remote.locator('#email').inputValue()==='owner-phone@example.com');
 await frame.locator('#tailnet_paste').tap();check('paste opens',await frame.locator('#tailnet_paste_sheet').evaluate(e=>e.classList.contains('tailnet_open')));await page.evaluate(()=>hostBack());check('shared Back dismisses sheet',await frame.locator('#tailnet_paste_sheet').evaluate(e=>!e.classList.contains('tailnet_open')));check('shared Back at root delegates without history escape',await page.evaluate(()=>hostBack())===false);
 const before=frame.url();await frame.locator('#wizard_remote_back').tap();check('remote Back never navigates viewer',frame.url()===before&&page.url()===origin+'/shell');
 await frame.locator('#wizard_done').tap();await frame.waitForFunction(()=>document.getElementById('wizard_done_status').textContent.includes('agent has'));const state=await mcp('handoff_status');check('Done reported to agent',state.owner_done===true&&!state.active&&!state.engine_active,state);const r=await fetch(new URL('/handoff/websockify',base),{headers:{cookie:'browser_handoff='+hand.handoff_url.split('#')[1]}});check('Done revokes old stream',r.status===401,r.status);
 await remote.evaluate(()=>document.getElementById('result').textContent='Agent resumed');check('agent resumes same tab with owner input',await remote.locator('#email').inputValue()==='owner-phone@example.com'&&await remote.locator('#result').textContent()==='Agent resumed');
 check('no viewer JavaScript errors',errors.length===0,errors);await page.screenshot({path:`${out}/owner-route-done.png`}).catch(()=>{});await remote.close();console.log('ALL PASS');
}catch(e){console.error(e);process.exitCode=1;}finally{fs.writeFileSync(`${out}/owner-route-checks.json`,JSON.stringify(checks,null,2));if(phone)await phone.close();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
