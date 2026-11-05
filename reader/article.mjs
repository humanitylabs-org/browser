import {JSDOM} from 'jsdom';
import createDOMPurify from 'dompurify';
import {Readability} from '@mozilla/readability';
import {webURL} from './network.mjs';

const tags = ['picture','source','p','div','section','article','h1','h2','h3','h4','h5','h6','a','img','figure','figcaption','blockquote','ul','ol','li','strong','b','em','i','s','del','code','pre','kbd','br','hr','table','thead','tbody','tr','th','td','sup','sub','dl','dt','dd'];
export function cleanArticle(html, base) {
  const dom = new JSDOM('', {url:base}); // No runScripts, resources or browser APIs.
  try {
    const purify = createDOMPurify(dom.window);
    const node = purify.sanitize(html, {ALLOWED_TAGS:tags, ALLOWED_ATTR:['href','src','srcset','alt','title','data-src','data-original'], ALLOW_DATA_ATTR:false, RETURN_DOM:true});
    for (const a of node.querySelectorAll('a')) {
      const href=a.getAttribute('href'); a.removeAttribute('href');
      if (href?.startsWith('#') && /^#[\w-]+$/.test(href)) continue; // ids are deliberately not admitted.
      try { const target=webURL(href,base); const file=/\.(apk|aab|pdf|zip|7z|tar|t?gz|dmg|pkg|exe|msi|csv|xlsx?|docx?|pptx?|epub|mp3|m4a|aac|wav|flac|mp4|mov|mkv|webm)$/i.test(target.pathname); a.setAttribute('href',file?target.href:'?url='+encodeURIComponent(target.href)); } catch {}
    }
    // Responsive images often carry their only URL in srcset or a <picture><source>; take the first
    // candidate, then drop srcset/source so every image still goes through the single proxied src.
    const first = set => (set || '').split(',').map(s => s.trim().split(/\s+/)[0]).find(Boolean);
    for (const img of node.querySelectorAll('img')) {
      const source=img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') ||
        first(img.getAttribute('srcset')) || first(img.closest('picture')?.querySelector('source[srcset]')?.getAttribute('srcset'));
      img.removeAttribute('src'); img.removeAttribute('data-src'); img.removeAttribute('data-original'); img.removeAttribute('srcset');
      try { img.setAttribute('src','api/image?url='+encodeURIComponent(webURL(source,base).href)); img.setAttribute('loading','lazy'); img.setAttribute('referrerpolicy','no-referrer'); } catch { img.remove(); }
    }
    for (const s of node.querySelectorAll('source')) s.remove();
    for (const p of node.querySelectorAll('picture')) p.replaceWith(...p.childNodes);
    for (const el of node.querySelectorAll('[srcset]')) el.removeAttribute('srcset');
    return node.innerHTML;
  } finally { dom.window.close(); }
}
const suffix = title => { const parts=(title||'').split(/\s+[-|–—·]\s+/); const last=parts.length>1?parts.at(-1).trim():''; return last && last.length<=40 ? last : ''; };
export function extract(renderedHTML, finalURL) {
  const dom=new JSDOM(renderedHTML,{url:finalURL});
  try {
    const doc=dom.window.document;
    // The proxy serves bitmaps only, so prefer bitmap icons over SVG ones.
    const icons=[...doc.querySelectorAll('link[rel~="apple-touch-icon"],link[rel~="icon"]')].filter(l=>!/svg/i.test(l.getAttribute('type')||'') && !/\.svg(\?|$)/i.test(l.getAttribute('href')||''));
    const icon=icons[0]?.getAttribute('href') || '/favicon.ico';
    const named=doc.querySelector('meta[property="og:site_name"]')?.content || doc.querySelector('meta[name="application-name"]')?.content || suffix(doc.title);
    const site=named || new URL(finalURL).hostname;
    const canonical=doc.querySelector('link[rel="canonical"]')?.href;
    const date=doc.querySelector('meta[property="article:published_time"],meta[name="date"],meta[name="pubdate"]')?.content || doc.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    const article=new Readability(doc,{maxElemsToParse:50000,charThreshold:150}).parse();
    if (!article || !article.textContent || article.textContent.trim().length < 150) throw new Error('Reader could not find an article on this page. It may need a sign-in or a check in your browser.');
    let favicon=''; try { favicon='api/image?url='+encodeURIComponent(webURL(icon,finalURL).href); } catch {}
    let canonicalURL=finalURL; try { if(canonical) canonicalURL=webURL(canonical,finalURL).href; } catch {}
    return {title:article.title || site,siteName:named || article.siteName || site,url:finalURL,canonicalURL,byline:article.byline || '',publishedTime:article.publishedTime || date,favicon,html:cleanArticle(article.content,finalURL)};
  } finally { dom.window.close(); }
}
