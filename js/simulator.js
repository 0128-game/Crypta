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
    const stageId = getStageId();

    if (!stageId) {
        handleStageError();
        return;
    }

    const stage = await loadStage(stageId);

    if (!stage) {
        handleStageError();
        return;
    }

    renderStage(stage);
    initializeSimulationButton();
}


/* ========================================
   URLからステージIDを取得
   ======================================== */

function getStageId() {
    const params = new URLSearchParams(window.location.search);

    return params.get("stage");
}


/* ========================================
   ステージデータ読み込み
   ======================================== */

async function loadStage(stageId) {
    const path = `stages/${stageId}.json`;

    try {
        const response = await fetch(path);

        if (!response.ok) {
            return null;
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
   ステージエラー
   ======================================== */

function handleStageError() {
    alert("そのステージは存在しません。");

    window.location.href = "index.html";
}
