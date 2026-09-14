#!/usr/bin/env python3
"""Verify the generated plugin site locally. Never publishes or edits content."""
import argparse
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
from pathlib import Path
import re
import threading
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

@contextmanager
def server():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        yield f'http://127.0.0.1:{srv.server_port}'
    finally:
        srv.shutdown()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    products = json.loads((ROOT/'catalog/plugins.json').read_text())['products']
    paths = ['/plugins/'] + [f'/plugins/{p["slug"]}/' for p in products]
    results, failures = [], []
    for path in paths:
        file = ROOT/path.strip('/')/'index.html'
        text = file.read_text()
        prose = re.sub(r'<(?:pre|code)\b[^>]*>[\s\S]*?</(?:pre|code)>', '', text)
        bad = re.findall(r'omnicontrol:|/Users/|ghp_[A-Za-z0-9]+', text) + re.findall(r'\[\[|file://', prose)
        if bad:
            failures.append({'path': path, 'privacy': bad})
    with server() as base, sync_playwright() as p:
        browser = p.chromium.launch()
        for path in paths:
            for width in (400, 1440):
                for lang in ('ko', 'en'):
                    for theme in ('light', 'dark'):
                        ctx = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=theme)
                        page = ctx.new_page()
                        errors = []
                        page.on('pageerror', lambda e: errors.append(str(e)))
                        response = page.goto(f'{base}{path}?lang={lang}', wait_until='networkidle')
                        page.evaluate('document.fonts.ready')
                        result = {'path':path, 'width':width, 'lang':lang, 'theme':theme, 'http':response.status}
                        result['page_overflow'] = page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
                        result['language'] = page.locator('html').get_attribute('lang')
                        result['duplicate_ids'] = page.evaluate('''() => { const a=[...document.querySelectorAll('[id]')].map(e=>e.id);return a.filter((x,i)=>a.indexOf(x)!==i); }''')
                        result['broken_anchors'] = page.evaluate('''() => [...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a=>a.getAttribute('href'))''')
                        result['broken_local'] = []
                        links = page.locator('a[href],img[src],link[href],script[src]').evaluate_all('(els)=>els.map(e=>e.href||e.src).filter(Boolean)')
                        for url in sorted(set(links)):
                            u = urlparse(url)
                            if u.netloc != urlparse(base).netloc:
                                continue
                            rel = unquote(u.path).lstrip('/')
                            candidate = ROOT/rel
                            if not candidate.exists() and not candidate.with_suffix('.html').exists():
                                result['broken_local'].append(u.path)
                        if path != '/plugins/':
                            toc = page.locator(f'[data-lang="{lang}"] .toc nav a').first
                            if toc.count():
                                target = toc.get_attribute('href')
                                toc.click()
                                result['toc_click'] = unquote(page.evaluate('location.hash')) == target
                            else:
                                result['toc_click'] = False
                            gloss = page.locator(f'[data-lang="{lang}"] .gloss').first
                            result['gloss_count'] = page.locator(f'[data-lang="{lang}"] .gloss').count()
                            if gloss.count():
                                gloss.focus()
                                page.wait_for_timeout(150)
                                result['gloss_keyboard'] = page.locator('#glossTip').is_visible()
                                page.keyboard.press('Escape')
                                result['gloss_escape'] = not page.locator('#glossTip').is_visible()
                            else:
                                result['gloss_keyboard'] = False
                        page.evaluate('scrollTo({top:0,behavior:"instant"})')
                        page.screenshot(path=str(args.out/f'{path.strip("/").replace("/","-")}-{width}-{lang}-{theme}.png'), full_page=False)
                        page.locator('#language').click()
                        result['language_toggle'] = page.locator('html').get_attribute('lang') != lang
                        page.locator('#theme').click()
                        result['theme_toggle'] = page.locator('html').get_attribute('data-theme') != theme
                        result['errors'] = errors
                        passed = response.status==200 and not result['page_overflow'] and result['language']==lang and not result['duplicate_ids'] and not result['broken_anchors'] and not result['broken_local'] and not errors and result['language_toggle'] and result['theme_toggle'] and result.get('toc_click', True) and result.get('gloss_keyboard', True) and result.get('gloss_escape', True)
                        result['passed']=passed
                        if not passed: failures.append(result)
                        results.append(result)
                        ctx.close()
        # Basic reading must not depend on a JavaScript renderer or browser storage.
        for enabled, storage in [(False, True), (True, False)]:
            ctx=browser.new_context(java_script_enabled=enabled)
            if not storage:
                ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('storage blocked')}})")
            page=ctx.new_page()
            response=page.goto(base+'/plugins/cmds-share/',wait_until='networkidle')
            readable=page.locator('[data-lang="ko"] .prose h2').count()>5
            row={'javascript':enabled,'storage':storage,'readable':readable,'passed':response.status==200 and readable}
            results.append(row)
            if not row['passed']: failures.append(row)
            ctx.close()
        # A direct English heading link must retain its anchor and language.
        ctx=browser.new_context();page=ctx.new_page();page.goto(base+'/plugins/cmds-eagle/')
        anchor=page.locator('[data-lang="en"] .toc a').first.get_attribute('href')
        page.goto(base+'/plugins/cmds-eagle/'+anchor,wait_until='networkidle')
        row={'deep_link':anchor,'passed':page.locator('html').get_attribute('lang')=='en' and page.evaluate('location.hash')==anchor}
        results.append(row)
        if not row['passed']: failures.append(row)
        ctx.close();browser.close()
    hashes={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in (ROOT/'plugins').rglob('*') if f.is_file()}
    report={'results':results,'failures':failures,'hashes':hashes,'scope':'local generated website; no live plugin actions, deployment or remote link validation'}
    (args.out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'cases':len(results),'failures':len(failures),'report':str(args.out/'report.json')},ensure_ascii=False))
    raise SystemExit(1 if failures else 0)

if __name__=='__main__': main()
