<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CRYPTA | シミュレータ</title>
  <link rel="stylesheet" href="css/common.css">
  <link rel="stylesheet" href="css/simulator.css">
</head>
<body class="page-simulator">

  <a class="skip-link" href="#workspace">通信を設計する場所へ移動</a>

  <header class="site-header">
    <a class="site-logo" href="index.html" aria-label="CRYPTA トップへ">CRYPTA</a>
    <a class="header-link" href="index.html#stage-section">ステージ一覧</a>
  </header>

  <main class="sim">

    <p class="sim-status" id="sim-status" role="status">ステージを読み込み中…</p>

    <!-- ステージが読み込めたら simulator.js が hidden を外す -->
    <div id="sim-root" hidden>

      <section class="sim-intro" aria-labelledby="stage-title">
        <h1 id="stage-title"></h1>
        <p id="stage-goal"></p>
      </section>

      <!-- ステージの条件 -->
      <section class="brief" aria-label="ステージの条件">
        <div class="brief-card">
          <h2>攻撃者</h2>
          <div class="brief-badges" id="attacker-badges"></div>
          <dl class="caps" id="attacker-caps"></dl>
        </div>
        <div class="brief-card">
          <h2>クリア条件</h2>
          <ol class="objectives" id="objective-list"></ol>
        </div>
      </section>

      <!-- 通信を設計するキャンバス -->
      <section class="workspace" id="workspace" aria-labelledby="workspace-title">
        <div class="workspace-head">
          <h2 id="workspace-title">通信を設計する</h2>
          <div class="workspace-actions">
            <button type="button" class="button button-secondary" id="reset-button">やり直す</button>
            <button type="button" class="button button-primary" id="run-button">シミュレーション開始</button>
          </div>
        </div>
        <p class="workspace-hint">
          下の部品をドラッグして置き、丸いポートどうしを線でつなぎます（ポートをタップ → 別のポートをタップ でもつながります）。
          線をクリックすると消せます。
        </p>
        <div class="canvas-scroll">
          <div class="board" id="board">
            <svg class="edges" id="edges" aria-hidden="true"></svg>
          </div>
        </div>
      </section>

      <!-- コンポーネント一覧（下部） -->
      <section class="palette-section" aria-labelledby="palette-title">
        <h2 id="palette-title">コンポーネント</h2>
        <div class="palette" id="palette"></div>
      </section>

      <!-- シミュレーション結果 -->
      <section class="result" id="result" hidden aria-live="polite" tabindex="-1"></section>

    </div>
  </main>

  <footer class="site-footer">
    <p>CRYPTA は暗号と情報セキュリティを学ぶための教材ゲームです。</p>
  </footer>

  <!-- 読み込み失敗の診断用: スクリプトが動かないとき、画面にエラーを出す -->
  <script>
    (function () {
      function show(msg) {
        var s = document.getElementById('sim-status');
        if (!s) return;
        s.hidden = false;
        s.classList.add('is-error');
        s.textContent = msg;
      }
      window.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.tagName === 'SCRIPT') {
          show('スクリプトを読み込めませんでした: ' + t.src + '（パスと、ファイル名の大文字小文字を確認してください）');
        } else {
          show('エラーが起きました: ' + e.message + '（F12 でコンソールを開くと詳細が見られます）');
        }
      }, true);
    })();
  </script>
  <script type="module" src="js/simulator.js"></script>
</body>
</html>
