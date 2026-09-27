/* ========================================
   CRYPTA - simulator.js
   シミュレータ本体
   ======================================== */

document.addEventListener("DOMContentLoaded", () => {
    initializeSimulator();
});


/* ========================================
   初期化
   ======================================== */

function initializeSimulator() {
    const stageNumber = getStageNumber();

    initializeStageDisplay(stageNumber);
    initializeSimulationButton();
}


/* ========================================
   URLからステージ番号を取得
   ======================================== */

function getStageNumber() {
    const params = new URLSearchParams(window.location.search);
    const stage = params.get("stage");

    if (!stage) {
        return 1;
    }

    const stageNumber = Number(stage);

    if (!Number.isInteger(stageNumber) || stageNumber < 1) {
        return 1;
    }

    return stageNumber;
}


/* ========================================
   ステージ表示
   ======================================== */

function initializeStageDisplay(stageNumber) {
    const stageTitle = document.getElementById("stageTitle");
    const stageDescription =
        document.getElementById("stageDescription");

    if (stageTitle) {
        stageTitle.textContent = `Stage ${stageNumber}`;
    }

    if (stageDescription) {
        stageDescription.textContent =
            "ステージ情報を読み込んでいます。";
    }
}


/* ========================================
   シミュレーションボタン
   ======================================== */

function initializeSimulationButton() {
    const simulateButton =
        document.getElementById("simulateButton");

    if (!simulateButton) {
        return;
    }

    simulateButton.addEventListener("click", () => {
        startSimulation();
    });
}


/* ========================================
   シミュレーション開始
   ======================================== */

function startSimulation() {
    const simulationArea =
        document.getElementById("simulationArea");

    const result =
        document.getElementById("result");

    const resultMessage =
        document.getElementById("resultMessage");

    if (simulationArea) {
        simulationArea.textContent =
            "シミュレーションを実行しています……";
    }

    if (result) {
        result.classList.remove("hidden");
    }

    if (resultMessage) {
        resultMessage.textContent =
            "現在は動作確認用のシミュレーションです。";
    }
}
