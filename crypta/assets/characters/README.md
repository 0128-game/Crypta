# キャラクター画像を置く場所

ここに、キャラクターの画像を置くと、ゲームの中の、キャラクターの絵が、置き換わります。
画像がないキャラは、ゲームに入っている絵（SVG）が、表示されます。

## 置くファイル（10枚）

| ファイル名 | 中身 |
|---|---|
| `alice.png` / `alice_worried.png` | Alice（ふつうの顔 / あわてた顔） |
| `bob.png` / `bob_worried.png` | Bob（ふつうの顔 / あわてた顔） |
| `eve.png` / `eve_worried.png` | Eve（ふつうの顔 / あわてた顔） |
| `mallory.png` / `mallory_worried.png` | Mallory（ふつうの顔 / あわてた顔） |
| `ai.png` | 正体不明の攻撃者（エピローグ） |
| `robot.png` | 正体が分かったとき（AI） |

- 形式: PNG（背景が透明）。向き: 縦長（縦横比 4:5 〜 2:3）。大きさ: 横 512 〜 1024 ピクセル。重さ: 1枚 500KB 以下。
- ファイル名や形式を変えたいときは、`content/characters.json` を、書き換えます。
- ChatGPT の画像は、`characters-tool.html`（自動整形ツール）に入れると、背景を透明にして、大きさをそろえて、この名前で、zip に保存できます。
- 置いたあとは、`characters-check.html` を開くと、読み込めているか、背景が透明かを、確かめられます。
- くわしい手順は、`docs/2_your-steps.md`（②自分がやること）を、見てください。
