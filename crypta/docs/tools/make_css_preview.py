# css-preview.html（CSS を、その場で、書き換えて、見られる、1枚の HTML）を、作る。
#   材料: docs/tools/gallery.json（ゲームの画面から、取り出した部品。capture_gallery.py で作る）と、css/*.css
#   CSS を、変えたあとに、もう一度、実行すると、css-preview.html の、CSS が、最新になる。
#   実行: python docs/tools/make_css_preview.py
import json, os, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
g = json.load(open(os.path.join(HERE, 'gallery.json'), encoding='utf-8'))
css = {n: open(os.path.join(ROOT, 'css', n + '.css'), encoding='utf-8').read() for n in ['common', 'simulator', 'glossary', 'characters-check', 'characters-tool', 'theme']}

def add_class(h, *classes):
    return re.sub(r'class="([^"]*)"', lambda m: f'class="{m.group(1)} {" ".join(classes)}"', h, count=1)

def item(label, h, cls=''):
    return f'<div class="g-item {cls}"><div class="g-label">{html.escape(label)}</div>{h}</div>'

def section(title, note, inner):
    n = f'<p class="g-note">{note}</p>' if note else ''
    return f'<section class="g-section"><h2 class="g-title">{html.escape(title)}</h2>{n}{inner}</section>'

# ---------- 1. トップページ・共通 ----------
btns = ('<div class="g-row">'
  + item('button-primary', '<a class="button button-primary" href="#">つづきから</a>')
  + item('button-secondary', '<a class="button button-secondary" href="#">ステージを選ぶ</a>')
  + item('button-secondary button-quiet', '<button class="button button-secondary button-quiet">やり直す</button>')
  + item('無効（disabled）', '<button class="button button-primary" disabled>シミュレーション開始</button>')
  + item('バッジ（Eve / Mallory）', '<span class="badge badge-eve">Eve（盗聴）</span> <span class="badge badge-mallory">Mallory（改ざん）</span>')
  + '</div>')
top = (section('ボタンとバッジ', '共通のボタン。メインは黄色の塗り、サブは白＋藍の線。', btns)
       + section('トップページ（実物）', 'ヘッダー・ヒーロー・遊び方・ステージカード（クリア済み / いま遊べる / ロック中）。', g['index']['header'] + g['index']['main']))

# ---------- 2. ゲーム画面の部品 ----------
S = g['sim']
order = ['alice', 'bob', 'key', 'handkey', 'pubkey', 'privkey', 'encrypt', 'decrypt', 'hash', 'hashcheck', 'mac', 'maccheck', 'sign', 'verify', 'ca', 'certcheck', 'seqstamp', 'seqcheck', 'tls', 'tlsopen']
nodes = ''.join(item(t, S['nodes'][t]) for t in order if t in S['nodes'])
enc = S['nodes'].get('encrypt', '')
def public_zone(h): return h.replace('data-zone="alice"', 'data-zone="public"', 1)
states = ''.join([
  item('ふつう', enc), item('is-active（動いている）', add_class(enc, 'is-active')),
  item('is-received（届いた）', add_class(enc, 'is-received')), item('is-garbled（壊れた・書き換えられた）', add_class(enc, 'is-garbled')),
  item('is-blocked（止まった）', add_class(enc, 'is-blocked')), item('is-warn（注意）', add_class(enc, 'is-warn')),
  item('公開ゾーンに置いた', public_zone(enc)),
])
att = S.get('attackers', {})
attackers = ''.join(item(k, v) for k, v in att.items()) + (item('Bob の吹き出し', S['node_bubble']) if S.get('node_bubble') else '')
frames = (item('事件: 大きな見出し（はじまり）', S.get('banner_start', ''), 'g-static') + item('事件: 大きな見出し（結果）', S.get('banner_result', ''), 'g-static'))
sim = (
  section('操作パネル', '左上の条件パネル・ツールバー・パーツの置き場。', '<div class="g-row">' + item('条件パネル', S['brief']) + item('ツールバー', S['toolbar'], 'g-static') + '</div>' + item('パーツの置き場（凡例・タブ・パーツ）', S['palette'], 'g-static'))
  + section('ブロック（部品）', '実際に使われている、すべての種類。ペアになる鍵は、組の印が付きます。', '<div class="g-row">' + nodes + '</div>')
  + section('ブロックの状態', '動いている・届いた・書き換えられた・止まった・注意・公開ゾーン。', '<div class="g-row">' + states + '</div>')
  + section('攻撃者と吹き出し', 'Eve・Mallory の、考え中・やったこと・守られたとき。', '<div class="g-row g-tall">' + attackers + '</div>')
  + section('ボード全体（実物）', 'ゾーン・壁・通信口・線・ブロックが、組み合わさったところ。', f'<div class="g-board">{S["board"]}</div>')
  + section('事件の見出しと、説明', '', '<div class="g-row">' + frames + '</div>' + item('事件の説明（スライド）', S.get('demo_dialog', ''), 'g-static'))
  + section('結果', '成功と、失敗。', '<div class="g-row">' + item('結果（成功）', S['result_ok']) + item('結果（失敗）', S['result_ng']) + '</div>')
  + section('解説・通知・案内', '', '<div class="g-row">' + item('解説', S['guide'], 'g-static') + item('通知（トースト）', S['toast'], 'g-static') + item('チュートリアルの案内', S['coach'], 'g-static') + '</div>')
)

# ---------- 3. 用語集 / 4. 画像の道具 ----------
glo = section('用語集（実物）', '', g['glossary']['header'] + g['glossary']['main'])
T = g['tools']
tools = section('画像のチェック・整形ツール', '', '<div class="g-row">' + item('まとめ', T['summary'], 'g-static') + item('助言', T['advice'], 'g-static') + '</div>' + '<div class="g-row">' + item('カード（画像1枚）', T['card']) + item('ドロップ枠', T['drop'], 'g-static') + item('設定', T['settings'], 'g-static') + '</div>')

PAGES = [
  {'id': 'top', 'title': 'トップページ・共通', 'css': ['common'], 'body': 'page-index', 'html': top},
  {'id': 'sim', 'title': 'ゲーム画面の部品', 'css': ['common', 'simulator'], 'body': 'page-simulator', 'html': sim},
  {'id': 'glo', 'title': '用語集', 'css': ['common', 'glossary'], 'body': 'page-glossary', 'html': glo},
  {'id': 'tool', 'title': '画像のチェック・整形ツール', 'css': ['common', 'characters-check', 'characters-tool'], 'body': 'page-chars', 'html': tools},
]

# プレビュー用の、並べ方（部品が、画面の、決まった場所に、貼りつかないように）。ここは、テーマの CSS とは、別。
GALLERY_CSS = '''
html, body { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; display: block !important; position: static !important; }
.page-simulator .site-header { position: static !important; }
body { padding: 20px 24px 40px !important; }
.g-section { margin: 0 0 40px; }
.g-title { margin: 0 0 6px; padding-bottom: 4px; font: 800 18px/1.4 sans-serif; border-bottom: 2px solid #263650; color: #263650; background: none; }
.g-note { margin: 0 0 14px; font: 500 12px/1.6 sans-serif; color: #657085; }
.g-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin-bottom: 18px; }
.g-item { position: relative; display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
.g-label { font: 700 11px/1.4 ui-monospace, Consolas, monospace; color: #657085; }
.g-tall { gap: 20px 30px; }
.g-tall .g-item { width: 330px; height: 300px; align-items: center; justify-content: flex-end; overflow: visible; }
.g-tall .g-label { order: 2; margin-top: 8px; }
.g-tall .g-item .node { margin-bottom: 8px; }
.g-board { position: relative; height: 760px; overflow: auto; border: 2px solid #263650; background: #f2eee4; }
.g-board > #board, .g-board > .board { position: relative !important; inset: auto !important; width: 1280px !important; height: 740px !important; overflow: hidden; }
/* 画面の、決まった場所に、貼りつく部品を、並べて、見られるようにする */
.g-item .node, .g-row .node { position: relative !important; left: auto !important; top: auto !important; transform: none; }
.g-item .attacker { position: relative !important; left: auto !important; top: auto !important; width: 112px; transform: none !important; }
.g-item .attacker .attacker-bubble { left: 50%; transform: translateX(-50%); }
.g-item .brief-panel, .g-item .palette-bar, .g-item .result, .g-item .toast, .g-item .coach, .g-item .demo-banner,
.g-item .toolbar, .g-item #toolbar, .g-item .guide, .g-item .demo-dialog, .g-item .guide-card, .g-item .zone-log {
  position: static !important; inset: auto !important; transform: none !important; display: block;
  width: auto !important; max-width: 640px; height: auto !important; max-height: none !important; opacity: 1 !important; margin: 0 !important;
}
.g-item .toolbar, .g-item #toolbar { display: flex !important; flex-wrap: wrap; gap: 8px; }
.g-item .guide, .g-item .demo-dialog { background: none !important; }
.g-item .toast { opacity: 1 !important; pointer-events: auto; }
.g-item .next-step, .g-item .epilogue-start { position: static !important; transform: none !important; }
body { cursor: default; }
a { pointer-events: auto; }
'''

def esc_ta(s): return s.replace('</script', '<\\/script')

tpl = open(os.path.join(HERE, 'css-preview.template.html'), encoding='utf-8').read()
parts = []
for n, c in css.items():
    if n != 'theme': parts.append(f'<script type="text/plain" id="css-{n}">{esc_ta(c)}</script>')
for p in PAGES:
    parts.append(f'<script type="text/plain" id="page-{p["id"]}">{esc_ta(p["html"])}</script>')
out = (tpl.replace('/*__THEME_CSS__*/', esc_ta(css['theme']).replace('&', '&amp;').replace('<', '&lt;'))
          .replace('<!--__DATA__-->', '\n'.join(parts))
          .replace('/*__GALLERY_CSS__*/', GALLERY_CSS)
          .replace('/*__PAGES__*/', json.dumps([{k: v for k, v in p.items() if k != 'html'} for p in PAGES], ensure_ascii=False)))
dst = os.path.join(ROOT, 'css-preview.html')
open(dst, 'w', encoding='utf-8').write(out)
print('作りました:', dst, '| 大きさ', round(len(out.encode('utf-8')) / 1024), 'KB')
