# ゲームで、実際に使われている、画面の部品（HTML）を、取り出して、docs/tools/gallery.json に保存する。
#   css-preview.html の、材料になる。ゲームの画面の作りを、変えたときに、実行する。
#   使い方: crypta フォルダで、python -m http.server 8765 を起動しておいて、  python docs/tools/capture_gallery.py
import json, os, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gallery.json')

def progress(upto, extra_seen=True):
    d = {'test': {'rating': 'S', 'objectives': ['A'], 'done': True}}
    for k in range(1, upto + 1): d[f'stage{k:02d}'] = {'rating': 'S', 'objectives': ['A'], 'done': True}
    return d

def init_script(prog, seen=True):
    seen_js = "for(let k=1;k<=12;k++) localStorage.setItem('crypta:intro:stage'+String(k).padStart(2,'0'),'1');" if seen else ''
    return f"localStorage.setItem('crypta:progress', {json.dumps(json.dumps(prog))}); {seen_js}"

GRAB = """(sel)=>{const e=document.querySelector(sel); if(!e) return null; const c=e.cloneNode(true); c.removeAttribute('hidden'); return c.outerHTML}"""
GRAB_ALL = """(sel)=>[...document.querySelectorAll(sel)].map(e=>{const c=e.cloneNode(true); c.removeAttribute('hidden'); return c.outerHTML})"""

def run():
    g = {'index': {}, 'sim': {'nodes': {}}, 'glossary': {}, 'tools': {}}
    with sync_playwright() as p:
        br = p.chromium.launch()
        def newpage(prog, seen=True, w=1280, h=800):
            ctx = br.new_context(viewport={'width': w, 'height': h}); pg = ctx.new_page()
            pg.add_init_script(init_script(prog, seen)); pg.on('dialog', lambda x: x.accept()); return pg

        # ---- トップページ（クリア済み・いま遊べる・ロック中、の3つの状態が、そろうように） ----
        pg = newpage(progress(4)); pg.goto(BASE + '/index.html'); pg.wait_for_timeout(1500)
        g['index']['header'] = pg.evaluate(GRAB, 'header.site-header')
        g['index']['main'] = pg.evaluate(GRAB, 'main')

        # ---- ゲーム画面: ステージ6（想定解を置いたところ） ----
        pg = newpage(progress(7)); pg.goto(BASE + '/simulator.html?stage=stage06'); pg.wait_for_selector('.node-alice'); pg.wait_for_timeout(900)
        g['sim']['brief'] = pg.evaluate(GRAB, '#brief-panel')
        g['sim']['toolbar'] = pg.evaluate(GRAB, '#toolbar')
        g['sim']['palette'] = pg.evaluate(GRAB, '#palette-bar')
        pg.click('#guide-open'); pg.wait_for_timeout(300)
        g['sim']['guide'] = pg.evaluate(GRAB, '#guide .guide-card')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        if pg.locator('#guide-close').is_visible(): pg.click('#guide-close')
        pg.click('#solution-button'); pg.wait_for_timeout(250)
        g['sim']['toast'] = pg.evaluate(GRAB, '#toast')
        pg.wait_for_timeout(700)
        g['sim']['board'] = pg.evaluate(GRAB, '#board')
        # 実行中: 攻撃者の吹き出し（考え中・悪い結果・良い結果）、Bob の吹き出し
        pg.click('#brief-toggle'); pg.click('#run-button'); got = set()
        for i in range(500):
            pg.wait_for_timeout(120)
            if pg.locator('.attacker:not([hidden]) .attacker-bubble:not([hidden])').count():
                cls = pg.eval_on_selector('.attacker .attacker-bubble', 'e=>e.className')
                who = pg.eval_on_selector('.attacker', 'e=>e.dataset.who')
                key = None
                if 'is-think' in cls: key = f'think_{who}'
                elif 'tone-bad' in cls: key = f'bad_{who}'
                elif 'tone-good' in cls: key = f'good_{who}'
                if key and key not in got:
                    got.add(key); g['sim'].setdefault('attackers', {})[key] = pg.evaluate(GRAB, '.attacker')
            if 'node_bubble' not in g['sim'] and pg.locator('.node-bubble:not([hidden])').count():
                g['sim']['node_bubble'] = pg.eval_on_selector('.node-bubble:not([hidden])', 'e=>e.closest(".node").outerHTML')
            if pg.locator('#result:not([hidden])').count(): break
            if len(got) >= 4 and i > 30 and pg.locator('#run-button').inner_text().find('スキップ') >= 0: pg.click('#run-button')
        pg.wait_for_timeout(600)
        g['sim']['result_ok'] = pg.evaluate(GRAB, '#result')
        # 部品ごとに、1つずつ取り出す（ステージを替えて、足りない種類を集める）
        want = ['alice', 'bob', 'encrypt', 'decrypt', 'key', 'bobpub', 'bobpriv', 'alicepub', 'alicepriv', 'mac', 'maccheck', 'handkey', 'hash', 'hashcheck', 'sign', 'verify', 'ca', 'certcheck', 'seqstamp', 'seqcheck', 'tls', 'tlsopen']
        for st in ['stage06', 'stage02', 'stage05', 'stage08', 'stage09', 'stage11']:
            pg = newpage(progress(12)); pg.goto(BASE + f'/simulator.html?stage={st}'); pg.wait_for_selector('.node-alice'); pg.wait_for_timeout(500)
            pg.click('#solution-button'); pg.wait_for_timeout(500)
            for t in want:
                if t in g['sim']['nodes']: continue
                html = pg.evaluate("""(t)=>{const e=document.querySelector('.node-'+t); return e? e.outerHTML : null}""", t)
                if html: g['sim']['nodes'][t] = html

        # ---- 失敗した結果（ステージ7: 署名がないと、否認防止が満たせない） ----
        pg = newpage(progress(7)); pg.goto(BASE + '/simulator.html?stage=stage07'); pg.wait_for_selector('.node-alice'); pg.wait_for_timeout(600)
        pg.click('#brief-toggle'); pg.click('#run-button')
        for _ in range(500):
            pg.wait_for_timeout(150)
            if pg.locator('#result:not([hidden])').count(): break
            if pg.locator('#run-button').inner_text().find('スキップ') >= 0 and _ > 20: pg.click('#run-button')
        pg.wait_for_timeout(500)
        g['sim']['result_ng'] = pg.evaluate(GRAB, '#result')

        # ---- 事件（ステージの頭）: 大きな見出し・説明のダイアログ ----
        pg = newpage(progress(5), seen=False); pg.goto(BASE + '/simulator.html?stage=stage05'); pg.wait_for_selector('.node-alice')
        for i in range(600):
            pg.wait_for_timeout(100)
            if 'banner_start' not in g['sim'] and pg.locator('.demo-banner:not([hidden])').count(): g['sim']['banner_start'] = pg.evaluate(GRAB, '.demo-banner')
            if pg.locator('.demo-banner.is-bad:not([hidden]), .demo-banner.is-safe:not([hidden])').count() and 'banner_result' not in g['sim']:
                g['sim']['banner_result'] = pg.evaluate(GRAB, '.demo-banner')
            if pg.locator('.demo-dialog:not([hidden])').count(): break
            if i > 50 and pg.locator('#run-button').inner_text().find('スキップ') >= 0: pg.click('#run-button')
        pg.wait_for_timeout(400)
        g['sim']['demo_dialog'] = pg.evaluate(GRAB, '.demo-dialog .guide-card')

        # ---- チュートリアルの案内 ----
        pg = newpage({}, seen=False); pg.goto(BASE + '/simulator.html?stage=test'); pg.wait_for_selector('.node-alice'); pg.wait_for_timeout(1200)
        g['sim']['coach'] = pg.evaluate(GRAB, '#coach')

        # ---- 用語集 ----
        pg = newpage(progress(12)); pg.goto(BASE + '/glossary.html#aes'); pg.wait_for_timeout(1500)
        g['glossary']['main'] = pg.evaluate(GRAB, 'main')
        g['glossary']['header'] = pg.evaluate(GRAB, 'header.site-header')

        # ---- 画像のチェック・整形ツール ----
        pg = newpage(progress(12)); pg.goto(BASE + '/characters-check.html'); pg.wait_for_selector('.chars-card'); pg.wait_for_timeout(800)
        g['tools']['summary'] = pg.evaluate(GRAB, '.chars-summary')
        g['tools']['card'] = pg.evaluate(GRAB, '.chars-card')
        g['tools']['advice'] = pg.evaluate(GRAB, '.chars-advice')
        pg.goto(BASE + '/characters-tool.html'); pg.wait_for_timeout(500)
        g['tools']['drop'] = pg.evaluate(GRAB, '.tool-drop')
        g['tools']['settings'] = pg.evaluate(GRAB, '.tool-settings')
        br.close()
    json.dump(g, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    n = lambda o: sum(n(v) for v in o.values()) if isinstance(o, dict) else (1 if o else 0)
    print('取り出した部品:', n(g), '個 →', OUT)
    print('部品の種類（ブロック）:', sorted(g['sim']['nodes']))
    print('攻撃者の状態:', sorted(g['sim'].get('attackers', {})))
    missing = [k for k, v in g['sim'].items() if v in (None, '')]
    print('取り出せなかったもの:', missing)

if __name__ == '__main__': run()
