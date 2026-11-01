# docs/tools（道具）

## css-preview.html（CSS のプレビュー）
`crypta/css-preview.html` を、ダブルクリックで、ブラウザに、開きます（サーバーは、いりません。1枚で、完結しています）。

- **左**: `css/theme.css` の内容。書き換えると、**右の部品に、すぐ、反映**されます。
- **右**: ゲームで、実際に使われている部品（ボタン・ブロック20種類・攻撃者と吹き出し・ボード・結果・事件の説明・用語集など）を、そのまま並べたもの。
- 右の部品を、**クリック**すると、その部品の、クラス名が出て、左の CSS の、その場所が、選ばれます。
- 上の「画面の幅」で、スマホ・タブレット・PC の幅を、切り替えられます（その幅で、ゲームと同じ、レイアウトの切り替えが、働きます）。
- 気に入ったら、「保存（theme.css）」または「コピー」で、`css/theme.css` を、置き換えます。「元に戻す」で、開いたときの状態に、戻ります。

### CSS を変えたあと（css-preview.html を、最新にする）
ゲームの `css/` を、直接、書き換えたときは、プレビューにも、反映させます。
1. `python docs/tools/make_css_preview.py`

### ゲームの画面の作り（HTML）を変えたあと
部品の、取り出し直しが、必要です。
1. `crypta` フォルダで、`python -m http.server 8765` を起動。
2. `python docs/tools/capture_gallery.py`（Playwright が必要）
3. `python docs/tools/make_css_preview.py`

## make_ui_texts.py
画面の文章を、すべて書き換えられる `content/ui-texts.json` を、作り直します（書き換え済みの文章は、残ります）。

## video/
作品紹介動画の、作り方。
