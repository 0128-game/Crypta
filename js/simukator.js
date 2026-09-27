/* ========================================
   CRYPTA - simulator.js
   シミュレータ本体
   ======================================== */

document.addEventListener("DOMContentLoaded", async () => {
    await initializeSimulator();
});


/* ========================================
   初期化
   ======================================== */

async function initializeSimulator() {
    const stageNumber = getStageNumber();

    const stage = await loadStage(stageNumber);

    if (!stage) {
        showLoadError();
        return;
    }

    renderStage(stage);
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
   ステージデータ読み込み
   ======================================== */

async function loadStage(stageNumber) {
    /*
     * Stage 1のみ、現在は動作確認用のtest.jsonを使用。
     * 本番実装時にはstage01.jsonへ変更する。
     */

    const path =
        stageNumber === 1
            ? "stages/test.json"
            : `stages/stage${String(stageNumber).padStart(2, "0")}.json`;

    try {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(
                `ステージデータの読み込みに失敗しました: ${response.status}`
            );
        }

        return await response.json();

    } catch (error) {
        console.error("Stage Load Error:", error);
        return null;
    }
}


/* ========================================
   ステージ表示
   ======================================== */

function renderStage(stage) {

    /* ---------- ステージ情報 ---------- */

    const stageTitle =
        document.getElementById("stageTitle");

    const stageDescription =
        document.getElementById("stageDescription");

    if (stageTitle) {
        stageTitle.textContent =
            stage.title ?? "ステージ";
    }

    if (stageDescription) {
        stageDescription.textContent =
            stage.description ?? "";
    }


    /* ---------- 目標 ---------- */

    const finalObjectiveText =
        document.getElementById("finalObjectiveText");

    const objectiveAText =
        document.getElementById("objectiveAText");

    const objectiveBText =
        document.getElementById("objectiveBText");

    if (finalObjectiveText) {
        finalObjectiveText.textContent =
            stage.objective?.final ?? "";
    }

    if (objectiveAText) {
        objectiveAText.textContent =
            stage.objective?.A ?? "";
    }

    if (objectiveBText) {
        objectiveBText.textContent =
            stage.objective?.B ?? "";
    }


    /* ---------- 攻撃者 ---------- */

    renderAttackers(stage.attacker);


    /* ---------- コンポーネント ---------- */

    renderComponents(stage.components);
}


/* ========================================
   攻撃者表示
   ======================================== */

function renderAttackers(attackers) {
    const container =
        document.getElementById("attackers");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!attackers) {
        return;
    }

    const attackerList = [
        attackers.eve,
        attackers.mallory
    ];

    attackerList.forEach((attacker) => {

        if (!attacker || !attacker.enabled) {
            return;
        }

        const element =
            document.createElement("div");

        element.className = "attacker";

        const title =
            document.createElement("h3");

        title.textContent =
            attacker.name;

        const description =
            document.createElement("p");

        description.textContent =
            attacker.description ?? "";

        element.appendChild(title);
        element.appendChild(description);

        container.appendChild(element);
    });
}


/* ========================================
   コンポーネント表示
   ======================================== */

function renderComponents(components) {
    const container =
        document.getElementById("componentList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!Array.isArray(components)) {
        return;
    }

    components.forEach((component) => {

        const element =
            document.createElement("div");

        element.className = "component";

        element.dataset.componentId =
            component.id;

        const title =
            document.createElement("strong");

        title.textContent =
            component.name;

        const description =
            document.createElement("p");

        description.textContent =
            component.description ?? "";

        element.appendChild(title);
        element.appendChild(description);

        container.appendChild(element);
    });
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
            "シミュレーションを実行しました。";
    }

    if (result) {
        result.classList.remove("hidden");
    }

    if (resultMessage) {
        resultMessage.textContent =
            "これは動作確認用のシミュレーションです。";
    }
}


/* ========================================
   ステージ読み込みエラー
   ======================================== */

function showLoadError() {
    const stageTitle =
        document.getElementById("stageTitle");

    const stageDescription =
        document.getElementById("stageDescription");

    if (stageTitle) {
        stageTitle.textContent =
            "ステージを読み込めませんでした";
    }

    if (stageDescription) {
        stageDescription.textContent =
            "ステージデータの読み込みに失敗しました。";
    }
}
