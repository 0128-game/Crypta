# 2_content-stages/crypta.json の「files」（ゲームの、すべてのファイルの一覧）を、作り直す。
#   管理者センターの、zip ダウンロードと、ファイルの点検が、使う。ファイルを、足したり、消したりしたあとに、実行する:
#   python 3_docs/tools/make_manifest.py
import os, json, datetime
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DATA = os.path.join(ROOT, '2_content-stages', 'crypta.json')
files = []
for top in ['1_gameapp', '2_content-stages', '3_docs']:
    for base, dirs, names in os.walk(os.path.join(ROOT, top)):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in ('__pycache__', 'node_modules'))
        for n in sorted(names):
            if n.startswith('.') or n.endswith('.pyc'): continue
            files.append(os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/'))
if os.path.exists(os.path.join(ROOT, 'index.html')): files.insert(0, 'index.html')
data = json.load(open(DATA, encoding='utf-8'))
data['files'] = {'_使い方': ['このゲームの、すべてのファイルの一覧です（リポジトリの中の場所）。管理者センターの、zip ダウンロードと、ファイルの点検が、使います。ファイルを、足したり、消したりしたら、3_docs/tools/make_manifest.py を、実行して、作り直してください。'],
                 'generated': datetime.date.today().isoformat(), 'files': files}
json.dump(data, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); open(DATA, 'a').write('\n')
print('ファイル数:', len(files))
