# content/ui-texts.json を、作り直す（コードや HTML に、新しい文章を足したときに、実行する）
#   ・js/*.js と、各ページの HTML に直接書かれている、日本語の文章を、すべて取り出す。
#   ・すでに、書き換えた文章（右側）は、残す。新しい文章だけが、足される。使われなくなった文章は、消える。
#   実行: crypta フォルダの、1つ上（または crypta の中）から  python docs/tools/make_ui_texts.py
import re, json, os, sys
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')) + os.sep
jp = re.compile(r'[\u3040-\u30ff\u4e00-\u9fff]')
jpcount = lambda s: len(jp.findall(s))

def split_template(s):
    out, exprs, cur, i = [], [], '', 0
    while i < len(s):
        if s[i] == '$' and i + 1 < len(s) and s[i + 1] == '{':
            out.append(cur); cur = ''; depth = 1; i += 2; start = i
            while i < len(s) and depth:
                depth += (s[i] == '{') - (s[i] == '}'); i += 1
            exprs.append(s[start:i - 1]); continue
        cur += s[i]; i += 1
    out.append(cur); return out, exprs

def literals(src):
    src = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), src, flags=re.S)
    res = []
    for ln in src.split('\n'):
        t = ln.strip()
        if t.startswith('//') or 'console.' in t: continue
        if not re.search(r"['\"`][^'\"`]*//", ln): ln = re.sub(r'\s//[^\n]*$', '', ln)
        for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`", ln):
            q = m.group(0)[0]; s = m.group(1) if q == "'" else m.group(2) if q == '"' else m.group(3)
            if s is None or not jp.search(s): continue
            if q == '`':
                parts, exprs = split_template(s)
                for ex in exprs: res.extend(literals(ex))
            else:
                parts = [s]
            is_tpl = q == '`' and len(parts) > 1
            for p in parts:
                p = p.replace("\\'", "'").replace('\\"', '"').replace('\\\\', '\\')
                for q2 in p.split('\\n'):
                    q2 = re.sub(r'\s+', ' ', q2).strip()
                    if jpcount(q2) >= 1 and len(q2) >= 2 and not (is_tpl and jpcount(q2) < 2 and len(q2) < 3): res.append((q2, is_tpl))
    return res

groups, seen = {}, set()
def add(group, items):
    for it in items:
        s, tpl = it if isinstance(it, tuple) else (it, False)
        if (s, tpl) in seen: continue
        seen.add((s, tpl))
        g = group[:-1] + '・文の一部）' if tpl else group
        groups.setdefault(g, {})[s] = s

for f in ['index.js', 'glossary-page.js', 'characters-check.js', 'characters-tool.js', 'simulator.js', 'engine.js', 'progress.js', 'stages.js', 'dialogue.js']:
    add('画面の文章（js/' + f + '）', literals(open(ROOT + 'js/' + f, encoding='utf-8').read()))
for f in ['index.html', 'simulator.html', 'glossary.html', 'characters-check.html', 'characters-tool.html']:
    t = open(ROOT + f, encoding='utf-8').read()
    t = re.sub(r'<script.*?</script>', '', t, flags=re.S); t = re.sub(r'<style.*?</style>', '', t, flags=re.S); t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    items = [re.sub(r'\s+', ' ', x).strip() for x in re.findall(r'>([^<>]+)<', t)]
    items += [re.sub(r'\s+', ' ', x).strip() for x in re.findall(r'(?:title|aria-label|placeholder|alt)="([^"]*)"', t)]
    add('ページの文章（' + f + '）', [x for x in items if jpcount(x) >= 1 and len(x) >= 2])
groups.setdefault('画面の文章（1文字の言葉。前後が、漢字・カタカナでないときだけ）', {}).update({'鍵': '鍵', '組': '組'})

path = ROOT + 'content/ui-texts.json'
old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
oldmap = {k: v for g, m in old.items() if not g.startswith('_') and isinstance(m, dict) for k, v in m.items()}
kept = 0
for g, m in groups.items():
    for k in m:
        if k in oldmap and oldmap[k] != k: m[k] = oldmap[k]; kept += 1
out = {'_使い方': old.get('_使い方', [])}
out.update(groups)
json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(path, 'a').write('\n')
print('項目数', sum(len(m) for m in groups.values()), '| 書き換え済みを残した数', kept)
