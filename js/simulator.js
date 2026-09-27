/* ========================================
   CRYPTA - simulator.js
   通信設計エディタ
   ======================================== */

let currentStage = null;
let communicationBlocks = [];


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

    currentStage = stage;

    renderStage(stage);

    initializeCharacterIntro();

    initializeObjectivePanel();

    initializeCommunicationEditor();

    initializeSimulation();

    updateCommunicationView();
}


/* ========================================
   URLからステージIDを取得
   ======================================== */

function getStageId() {

    const params =
        new URLSearchParams(window.location.search);

    return params.get("stage");
}


/* ========================================
   ステージデータ読み込み
   ======================================== */

async function loadStage(stageId) {

    const path =
        `stages/${stageId}.json`;

    try {

        const response =
            await fetch(path);

        if (!response.ok) {
            return null;
        }

        return await response.json();

    } catch (error) {

        console.error(
            "Stage Load Error:",
            error
        );

        return null;
    }
}


/* ========================================
   ステージ表示
   ======================================== */

function renderStage(stage) {

    /* ---------- ステージタイトル ---------- */

    const stageTitle =
        document.getElementById("stageTitle");

    if (stageTitle) {

        stageTitle.textContent =
            stage.title ?? "Stage";
    }


    /* ---------- ステージ説明 ---------- */

    const stageDescription =
        document.getElementById("stageDescription");

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


    /* ---------- 初期通信 ---------- */

    if (
        stage.communication &&
        Array.isArray(stage.communication.blocks)
    ) {

        communicationBlocks =
            [...stage.communication.blocks];

    } else {

        communicationBlocks = [];
    }
}


/* ========================================
   攻撃者表示
   ======================================== */

function renderAttackers(attackers) {

    const attackerInfo =
        document.getElementById("attackerInfo");

    const container =
        document.getElementById("attackers");

    const eveNode =
        document.getElementById("eve");

    const malloryNode =
        document.getElementById("mallory");


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (attackerInfo) {

        attackerInfo.classList.add("hidden");
    }


    /* ---------- Eve ---------- */

    const eve =
        attackers?.eve;

    if (eve?.enabled) {

        renderAttackerCard(eve);

        if (eveNode) {
            eveNode.classList.remove("hidden");
        }

    } else {

        if (eveNode) {
            eveNode.classList.add("hidden");
        }
    }


    /* ---------- Mallory ---------- */

    const mallory =
        attackers?.mallory;

    if (mallory?.enabled) {

        renderAttackerCard(mallory);

        if (malloryNode) {
            malloryNode.classList.remove("hidden");
        }

    } else {

        if (malloryNode) {
            malloryNode.classList.add("hidden");
        }
    }
}


/* ========================================
   攻撃者カード生成
   ======================================== */

function renderAttackerCard(attacker) {

    const container =
        document.getElementById("attackers");

    const card =
        document.createElement("div");

    card.className =
        "attacker";

    const title =
        document.createElement("h3");

    title.textContent =
        attacker.name ?? "攻撃者";


    const description =
        document.createElement("p");

    description.textContent =
        attacker.description ?? "";


    card.appendChild(title);

    card.appendChild(description);

    container.appendChild(card);
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

        element.className =
            "component";

        element.dataset.componentId =
            component.id;

        element.draggable = true;


        const title =
            document.createElement("strong");

        title.textContent =
            component.name ?? component.id;


        const description =
            document.createElement("p");

        description.textContent =
            component.description ?? "";


        element.appendChild(title);

        element.appendChild(description);


        /* ---------- ドラッグ開始 ---------- */

        element.addEventListener(
            "dragstart",
            (event) => {

                event.dataTransfer.setData(
                    "text/plain",
                    component.id
                );

                event.dataTransfer.effectAllowed =
                    "copy";

                element.classList.add(
                    "dragging"
                );
            }
        );


        /* ---------- ドラッグ終了 ---------- */

        element.addEventListener(
            "dragend",
            () => {

                element.classList.remove(
                    "dragging"
                );
            }
        );


        container.appendChild(element);
    });
}


/* ========================================
   通信エディタ初期化
   ======================================== */

function initializeCommunicationEditor() {

    const path =
        document.getElementById(
            "communicationPath"
        );

    if (!path) {
        return;
    }


    /* ---------- ドロップ ---------- */

    path.addEventListener(
        "dragover",
        (event) => {

            event.preventDefault();

            event.dataTransfer.dropEffect =
                "copy";

            path.classList.add(
                "drag-over"
            );
        }
    );


    path.addEventListener(
        "dragleave",
        (event) => {

            if (
                !path.contains(
                    event.relatedTarget
                )
            ) {

                path.classList.remove(
                    "drag-over"
                );
            }
        }
    );


    path.addEventListener(
        "drop",
        (event) => {

            event.preventDefault();

            path.classList.remove(
                "drag-over"
            );


            const componentId =
                event.dataTransfer.getData(
                    "text/plain"
                );


            if (!componentId) {
                return;
            }


            addCommunicationBlock(
                componentId
            );
        }
    );


    /* ---------- クリア ---------- */

    const clearButton =
        document.getElementById(
            "clearCommunicationButton"
        );


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            () => {

                communicationBlocks = [];

                updateCommunicationView();
            }
        );
    }


    /* ---------- リセット ---------- */

    const resetButton =
        document.getElementById(
            "resetCommunicationButton"
        );


    if (resetButton) {

        resetButton.addEventListener(
            "click",
            () => {

                resetCommunication();

            }
        );
    }
}


/* ========================================
   通信ブロック追加
   ======================================== */

function addCommunicationBlock(componentId) {

    if (!currentStage) {
        return;
    }


    const component =
        currentStage.components?.find(
            (item) =>
                item.id === componentId
        );


    if (!component) {
        return;
    }


    communicationBlocks.push({

        id:
            `${component.id}-${Date.now()}-${Math.random()}`,

        componentId:
            component.id,

        name:
            component.name ?? component.id,

        description:
            component.description ?? ""
    });


    updateCommunicationView();
}


/* ========================================
   通信表示更新
   ======================================== */

function updateCommunicationView() {

    const path =
        document.getElementById(
            "communicationPath"
        );

    if (!path) {
        return;
    }


    path.innerHTML = "";


    /* ---------- 空の場合 ---------- */

    if (communicationBlocks.length === 0) {

        const placeholder =
            document.createElement("div");

        placeholder.id =
            "communicationPlaceholder";

        placeholder.className =
            "communication-placeholder";

        placeholder.textContent =
            "ここに通信コンポーネントを配置";


        path.appendChild(
            placeholder
        );

        return;
    }


    /* ---------- ブロック生成 ---------- */

    communicationBlocks.forEach(
        (block, index) => {

            const element =
                createCommunicationElement(
                    block,
                    index
                );


            path.appendChild(
                element
            );
        }
    );
}


/* ========================================
   通信ブロック生成
   ======================================== */

function createCommunicationElement(
    block,
    index
) {

    const element =
        document.createElement("div");

    element.className =
        "communication-block";

    element.dataset.blockId =
        block.id;

    element.draggable = true;


    const title =
        document.createElement("strong");

    title.textContent =
        block.name;


    const description =
        document.createElement("p");

    description.textContent =
        block.description;


    element.appendChild(title);

    if (block.description) {

        element.appendChild(
            description
        );
    }


    /* ---------- ドラッグ開始 ---------- */

    element.addEventListener(
        "dragstart",
        (event) => {

            event.dataTransfer.setData(
                "text/plain",
                block.id
            );

            event.dataTransfer.effectAllowed =
                "move";

            element.classList.add(
                "dragging"
            );
        }
    );


    /* ---------- ドラッグ終了 ---------- */

    element.addEventListener(
        "dragend",
        () => {

            element.classList.remove(
                "dragging"
            );
        }
    );


    /* ---------- クリックで削除 ---------- */

    element.addEventListener(
        "dblclick",
        () => {

            removeCommunicationBlock(
                block.id
            );
        }
    );


    return element;
}


/* ========================================
   通信ブロック削除
   ======================================== */

function removeCommunicationBlock(
    blockId
) {

    communicationBlocks =
        communicationBlocks.filter(
            (block) =>
                block.id !== blockId
        );


    updateCommunicationView();
}


/* ========================================
   通信リセット
   ======================================== */

function resetCommunication() {

    if (
        currentStage?.communication &&
        Array.isArray(
            currentStage.communication.blocks
        )
    ) {

        communicationBlocks =
            [...currentStage.communication.blocks];

    } else {

        communicationBlocks = [];
    }


    updateCommunicationView();
}


/* ========================================
   初回キャラクター説明
   ======================================== */

function initializeCharacterIntro() {

    const intro =
        document.getElementById(
            "characterIntro"
        );

    const closeButton =
        document.getElementById(
            "closeCharacterIntro"
        );

    const startButton =
        document.getElementById(
            "closeCharacterIntroButton"
        );


    if (!intro) {
        return;
    }


    const hasShown =
        sessionStorage.getItem(
            "crypta-character-intro"
        );


    if (!hasShown) {

        intro.classList.remove(
            "hidden"
        );
    }


    const closeIntro = () => {

        intro.classList.add(
            "hidden"
        );

        sessionStorage.setItem(
            "crypta-character-intro",
            "shown"
        );
    };


    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeIntro
        );
    }


    if (startButton) {

        startButton.addEventListener(
            "click",
            closeIntro
        );
    }


    intro.addEventListener(
        "click",
        (event) => {

            if (
                event.target === intro
            ) {

                closeIntro();
            }
        }
    );
}


/* ========================================
   目標パネル
   ======================================== */

function initializeObjectivePanel() {

    const panel =
        document.getElementById(
            "objectivePanel"
        );

    const openButton =
        document.getElementById(
            "objectiveButton"
        );

    const closeButton =
        document.getElementById(
            "closeObjectiveButton"
        );


    if (!panel) {
        return;
    }


    if (openButton) {

        openButton.addEventListener(
            "click",
            () => {

                panel.classList.remove(
                    "hidden"
                );
            }
        );
    }


    if (closeButton) {

        closeButton.addEventListener(
            "click",
            () => {

                panel.classList.add(
                    "hidden"
                );
            }
        );
    }
}


/* ========================================
   シミュレーション
   ======================================== */

function initializeSimulation() {

    const button =
        document.getElementById(
            "simulateButton"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        () => {

            startSimulation();
        }
    );
}


/* ========================================
   シミュレーション開始
   ======================================== */

function startSimulation() {

    const simulation =
        document.getElementById(
            "simulation"
        );

    const simulationArea =
        document.getElementById(
            "simulationArea"
        );

    const result =
        document.getElementById(
            "result"
        );

    const resultMessage =
        document.getElementById(
            "resultMessage"
        );


    if (simulation) {

        simulation.classList.remove(
            "hidden"
        );
    }


    if (simulationArea) {

        simulationArea.textContent =
            "シミュレーションを実行しています……";
    }


    if (result) {

        result.classList.add(
            "hidden"
        );
    }


    /*
     * 現段階では通信設計エディタの動作確認。
     *
     * 今後ここに、
     * Eve / Mallory の攻撃処理、
     * 要求判定、
     * 突破演出、
     * S/A/B/C評価
     * を追加する。
     */

    setTimeout(() => {

        if (simulationArea) {

            simulationArea.textContent =
                "通信のシミュレーションが完了しました。";
        }


        if (result) {

            result.classList.remove(
                "hidden"
            );
        }


        if (resultMessage) {

            resultMessage.textContent =
                "現在は通信設計エディタの動作確認用です。";
        }

    }, 500);
}


/* ========================================
   ステージエラー
   ======================================== */

function handleStageError() {

    alert(
        "そのステージは存在しません。"
    );

    window.location.href =
        "index.html";
}
