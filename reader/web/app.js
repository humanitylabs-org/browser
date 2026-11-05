/* Domain-only Reader state; shared WizardApp owns skin, Back and update policy. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s), input=$('#url'), status=$('#status'), page=$('#page'), body=$('#article');
  let sequence=0, pending=null, current='', stack=[];
  window.WizardApp?.ready({name:'Browser',version:'1.0.0'});
  const when=s=>{const d=new Date(s);return s && !isNaN(d) && /\d{4}-\d{2}-\d{2}/.test(s)?d.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):(s||'');};
  function original(url) { $('#original').href=url; $('#source').textContent=url; }
  async function read(url,{remember=true}={}) {
    try {const u=new URL(url);if(!/^https?:$/.test(u.protocol)) throw Error(); url=u.href;} catch {status.textContent='Enter a full http or https web address.';return;}
    if(url===current && pending) return;
    const id=++sequence;
    if(remember && current && current!==url) stack.push(current);
    current=url; input.value=url;
    // Synchronous meaningful task feedback, before any network or bridge wait.
    status.textContent='Reading '+new URL(url).hostname+'…';status.hidden=false;page.hidden=false;
    $('#title').textContent='';$('#site').textContent=new URL(url).hostname;$('#byline').textContent='';$('#logo').hidden=true;body.replaceChildren();original(url);
    pending?.abort();const control=new AbortController();pending=control;
    try {
      const r=await fetch('api/reader?url='+encodeURIComponent(url),{signal:control.signal,cache:'no-store'});
      const data=await r.json();if(id!==sequence)return;
      if(!r.ok) throw new Error(data.error || 'Reader could not read this page.');
      $('#title').textContent=data.title;document.title=data.title+' · Browser';$('#site').textContent=data.siteName;
      $('#byline').textContent=[data.byline,when(data.publishedTime)].filter(Boolean).join(' · ');
      original(data.url);$('#logo').hidden=!data.favicon;$('#logo').src=data.favicon || '';
      body.innerHTML=data.html;status.hidden=true;
    } catch(e) {if(id!==sequence || e.name==='AbortError')return;status.hidden=false;status.textContent=e.message+' You can open the original in your browser.';}
    finally {if(id===sequence) pending=null;}
  }
  $('#logo').addEventListener('error',()=>{$('#logo').hidden=true;});
  $('#address').addEventListener('submit',e=>{e.preventDefault();read(input.value.trim());});
  // Article links already point to this Reader; not to the third-party origin.
  body.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');if(!a || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)return;
    const u=new URL(a.href);const next=u.searchParams.get('url');
    if(next){e.preventDefault();read(next);window.scrollTo(0,0);}
  });
  window.WizardApp?.back.register({canGoBack:()=>stack.length>0,back:()=>{if(!stack.length)return false;read(stack.pop(),{remember:false});return true;}});
  // A root Back is handled by the shell, never by a fake app history sentinel.
  const initial=new URLSearchParams(location.search).get('url');if(initial)read(initial);
})();
