# 作品紹介動画の、作り方（再現用）

`crypta-intro.mp4`（約1分50秒）を作ったときの、スクリプトです。ゲームを変えたあとに、動画を、作り直したいときに使います。

## 必要なもの
Python 3（Playwright と Chromium）、ffmpeg。

## 手順
1. `_slides.html` と `_stage_titles.json` を、`crypta/` の直下（`index.html` と同じ場所）に、コピーする。
2. `crypta/` で、`python -m http.server 8765` を、起動したままにする。
3. 次の順に、実行する。
   - `python shot_slides.py`（スライド5枚の、静止画を、`/tmp/video` に作る）
   - `python rec_game.py`（ステージ5の、事件から、攻撃までを、字幕つきで録画）
   - `python rec_epi.py`（エピローグを録画）
   - `python compose.py`（録画の、早回しと、つなぎ。`crypta-intro.mp4` を作る）
4. 作り終わったら、1. でコピーした 2 つのファイルを、`crypta/` から、消す。

## 内容を変えたいとき
- 字幕の文: `rec_game.py` / `rec_epi.py` の `cap(...)` の文字。
- スライドの文: `_slides.html`。
- 早回しの倍率・各場面の長さ: `compose.py` の `segs`。
- 音は、入っていません（無音）。BGM や、ナレーションは、動画編集ソフトで、足してください。
