import {chromium} from 'playwright-core';
import dns from 'node:dns/promises';
import {safeFetch,destination,UnsafeURL} from './network.mjs';
import {extract} from './article.mjs';
import {ReadFailure,documentVerdict} from './handoff.mjs';

let connection;
export async function chrome() {
  if (!connection) connection=(async()=>{
    const host=process.env.UPSTREAM_HOST || 'browser-engine';
    const {address}=await dns.lookup(host);
    // Browser-engine is configuration, never taken from an owner-supplied URL.
    return chromium.connectOverCDP(`http://${address}:${process.env.UPSTREAM_PORT || 9222}`,{timeout:10000});
  })().then(b=>{b.on('disconnected',()=>{connection=null;});return b;}).catch(e=>{connection=null;throw e;});
  return connection;
}
let active=0;
export async function readArticle(input) {
  await destination(input);
  if(active>=2) throw new ReadFailure('Reader is busy. Please try again in a moment.','busy');
  active++;
  let context;
  const abort=new AbortController(); const timer=setTimeout(()=>abort.abort(),25000);
  try {
    const browser=await chrome();
    // Never use browser.contexts()[0], which belongs to the agent. The deny proxy
    // is defense in depth: only intercepted, validated, byte-bounded GETs work.
    context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,viewport:{width:1280,height:900},
      proxy:{server:process.env.READER_DENY_PROXY || 'http://browser-reader:8081',bypass:'<-loopback>'}});
    if(abort.signal.aborted) throw new Error('The page took too long to respond.');
    await context.addInitScript(() => {
      // A render needs scripts, not raw peer sockets or workers. Keep those APIs
      // unavailable in every document before any source script is evaluated.
      for (const name of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport','Worker','SharedWorker']) {
        try { Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false}); } catch {}
      }
    });
    const expire=()=>{void context.close().catch(()=>{});}; abort.signal.addEventListener('abort',expire,{once:true});
    await context.routeWebSocket('**/*',route=>route.close());
    let requests=0, bytes=0, reserved=0, running=0, blocked=null, verdict=null;
    const waiting=[];
    const acquire=async()=>{if(running<4) {running++;return;} await new Promise(resolve=>waiting.push(resolve));};
    const release=()=>{const next=waiting.shift();if(next)next();else running--;};
    await context.route('**/*',async route=>{
      const req=route.request(); let reservation=0, acquired=false;
      try {
        if(abort.signal.aborted || ++requests>120 || req.method()!=='GET' || ['media','font'].includes(req.resourceType())) return await route.abort();
        await acquire(); acquired=true;
        if(abort.signal.aborted) return await route.abort();
        reservation=Math.min(8*1024*1024,32*1024*1024-bytes-reserved);
        if(reservation<=0) return await route.abort();
        reserved+=reservation;
        const res=await safeFetch(req.url(),{maxBytes:reservation,signal:abort.signal,follow:false});
        bytes+=res.body.length;
        // A bot wall, sign-in redirect or failed main document stops the read now (~1 s), before
        // Chrome renders a challenge page or waits out the timeouts. Its bytes never reach Chrome.
        if(req.isNavigationRequest() && req.frame()===req.frame().page()?.mainFrame() && (verdict=documentVerdict(res))) return await route.abort('blockedbyclient');
        // Do not pass Set-Cookie, refresh, reporting, origin trials or other
        // active headers. Location has already crossed the destination guard.
        const type=res.headers['content-type'] || 'application/octet-stream';
        const headers={'content-type':type,'x-content-type-options':'nosniff'};
        if(res.headers.location) headers.location=res.headers.location;
        for(const h of ['access-control-allow-origin','access-control-allow-credentials']) if(res.headers[h]) headers[h]=res.headers[h];
        await route.fulfill({status:res.status,headers,body:res.body});
      } catch(e) {
        // A main-document redirect into a private address is a refusal, not a read failure.
        if(e instanceof UnsafeURL && req.isNavigationRequest() && req.frame()===req.frame().page()?.mainFrame()) blocked=e;
        try{await route.abort();}catch{}
      }
      finally {reserved-=reservation;if(acquired) release();}
    });
    const page=await context.newPage(); page.setDefaultTimeout(20000);
    page.on('popup',p=>void p.close());
    // Commit the public URL before source JS can initiate client-side navigation.
    let response;
    try { response=await page.goto(input,{waitUntil:'domcontentloaded',timeout:20000}); }
    catch(e) { if(blocked) throw blocked; if(verdict) throw verdict; throw e; }
    if(blocked) throw blocked;
    if(verdict) throw verdict;
    if (!response || response.status()>=400) throw new ReadFailure('This page is not available right now.','unavailable');
    await page.waitForTimeout(1200);
    await destination(page.url());
    const html=await page.content();
    if(Buffer.byteLength(html)>8*1024*1024) throw new Error('This page is too large for Reader.');
    return extract(html,page.url());
  } finally { clearTimeout(timer); abort.abort(); if(context) await context.close().catch(()=>{}); active--; }
}
