import {JSDOM} from 'jsdom';
import createDOMPurify from 'dompurify';
import {Readability} from '@mozilla/readability';
import {webURL} from './network.mjs';

const tags = ['p','div','section','article','h1','h2','h3','h4','h5','h6','a','img','figure','figcaption','blockquote','ul','ol','li','strong','b','em','i','s','del','code','pre','kbd','br','hr','table','thead','tbody','tr','th','td','sup','sub','dl','dt','dd'];
export function cleanArticle(html, base) {
  const dom = new JSDOM('', {url:base}); // No runScripts, resources or browser APIs.
  try {
    const purify = createDOMPurify(dom.window);
    const node = purify.sanitize(html, {ALLOWED_TAGS:tags, ALLOWED_ATTR:['href','src','alt','title','data-src','data-original'], ALLOW_DATA_ATTR:false, RETURN_DOM:true});
    for (const a of node.querySelectorAll('a')) {
      const href=a.getAttribute('href'); a.removeAttribute('href');
      if (href?.startsWith('#') && /^#[\w-]+$/.test(href)) continue; // ids are deliberately not admitted.
      try { const target=webURL(href,base); const file=/\.(apk|aab|pdf|zip|7z|tar|t?gz|dmg|pkg|exe|msi|csv|xlsx?|docx?|pptx?|epub|mp3|m4a|aac|wav|flac|mp4|mov|mkv|webm)$/i.test(target.pathname); a.setAttribute('href',file?target.href:'?url='+encodeURIComponent(target.href)); } catch {}
    }
    for (const img of node.querySelectorAll('img')) {
      const source=img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
      img.removeAttribute('src'); img.removeAttribute('data-src'); img.removeAttribute('data-original');
      try { img.setAttribute('src','api/image?url='+encodeURIComponent(webURL(source,base).href)); img.setAttribute('loading','lazy'); img.setAttribute('referrerpolicy','no-referrer'); } catch { img.remove(); }
    }
    return node.innerHTML;
  } finally { dom.window.close(); }
}
export function extract(renderedHTML, finalURL) {
  const dom=new JSDOM(renderedHTML,{url:finalURL});
  try {
    const doc=dom.window.document;
    const icon=doc.querySelector('link[rel~="icon"]')?.getAttribute('href') || '/favicon.ico';
    const site=doc.querySelector('meta[property="og:site_name"]')?.content || new URL(finalURL).hostname;
    const canonical=doc.querySelector('link[rel="canonical"]')?.href;
    const date=doc.querySelector('meta[property="article:published_time"],meta[name="date"],meta[name="pubdate"]')?.content || doc.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    const article=new Readability(doc,{maxElemsToParse:50000,charThreshold:150}).parse();
    if (!article || !article.textContent || article.textContent.trim().length < 150) throw new Error('Reader could not find an article on this page. It may need a sign-in or a check in your browser.');
    let favicon=''; try { favicon='api/image?url='+encodeURIComponent(webURL(icon,finalURL).href); } catch {}
    let canonicalURL=finalURL; try { if(canonical) canonicalURL=webURL(canonical,finalURL).href; } catch {}
    return {title:article.title || site,siteName:article.siteName || site,url:finalURL,canonicalURL,byline:article.byline || '',publishedTime:article.publishedTime || date,favicon,html:cleanArticle(article.content,finalURL)};
  } finally { dom.window.close(); }
}
