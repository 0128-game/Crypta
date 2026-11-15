# content/files.json（ゲームの、すべてのファイルの一覧）を、作る。管理者センターの、zip ダウンロードと、ファイルの点検が、使う。
#   ファイルを、足したり、消したりしたあとに、実行する:  python docs/tools/make_manifest.py
import os, json, datetime
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
files = []
for base, dirs, names in os.walk(ROOT):
    dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d != '__pycache__' and d != 'node_modules')
    for n in sorted(names):
        if n.startswith('.') or n.endswith('.pyc'): continue
        rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')
        if rel == 'content/files.json': continue
        files.append(rel)
out = {'_使い方': ['このゲームの、すべてのファイルの一覧です。管理者センターの、zip ダウンロードと、ファイルの点検が、使います。ファイルを、足したり、消したりしたら、docs/tools/make_manifest.py を、実行して、作り直してください。'],
       'generated': datetime.date.today().isoformat(), 'files': files + ['content/files.json']}
json.dump(out, open(os.path.join(ROOT, 'content', 'files.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ファイル数:', len(out['files']))
