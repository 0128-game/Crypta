/* ========================================
   CRYPTA - simulator.js
   通信設計エディタ
   ======================================== */

let currentStage = null;
let communicationBlocks = [];


/* ========================================
   初期化
   ======================================== */

document.addEventListener("DOMContentLoaded", async () => {
    await initializeSimulator();
});


async function initializeSimulator() {

    const stageId = getStageId();

    if (!stageId) {
        handleStageError();
        return;
    }


    const stage =
        await loadStage(stageId);


    if (!stage) {
        handleStageError();
        return;
    }


    currentStage = stage;


    /* ---------- ステージ表示 ---------- */

    renderStage(stage);


    /* ---------- 初期通信 ---------- */

    loadInitialCommunication(stage);


    /* ---------- 攻撃者表示 ---------- */

    renderAttackers(stage.attacker);


    /* ---------- コンポーネント ---------- */

    renderComponents(stage.components);


    /* ---------- 初回フローティング ---------- */

    initializeCharacterIntro();


    /* ---------- 通信エディタ ---------- */

    initializeCommunicationEditor();


    /* ---------- シミュレーション ---------- */

    initializeSimulation();


    /* ---------- 通信表示 ---------- */

    updateCommunicationView();
}


/* ========================================
   URLからステージID取得
   ======================================== */

function getStageId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return params.get("stage");
}


/* ========================================
   ステージ読み込み
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

    /* ---------- タイトル ---------- */

    const stageTitle =
        document.getElementById(
            "stageTitle"
        );


    if (stageTitle) {

        stageTitle.textContent =
            stage.title ?? "Stage";
    }


    /* ---------- 説明 ---------- */

    const stageDescription =
        document.getElementById(
            "stageDescription"
        );


    if (stageDescription) {

        stageDescription.textContent =
            stage.description ?? "";
    }
}


/* ========================================
   初期通信読み込み
   ======================================== */

function loadInitialCommunication(stage) {

    if (
        stage.communication &&
        Array.isArray(
            stage.communication.blocks
        )
    ) {

        communicationBlocks =
            stage.communication.blocks.map(
                (block, index) => {

                    return {
                        id:
                            block.id ??
                            `initial-${index}`,

                        componentId:
                            block.componentId ??
                            block.id,

                        name:
                            block.name ?? "",

                        description:
                            block.description ?? ""
                    };
                }
            );

    } else {

        communicationBlocks = [];
    }
}


/* ========================================
   攻撃者表示
   ======================================== */

function renderAttackers(attackers) {

    const attackerInfo =
        document.getElementById(
            "attackerInfo"
        );

    const attackerContainer =
        document.getElementById(
            "attackers"
        );

    const eveNode =
        document.getElementById("eve");

    const malloryNode =
        document.getElementById("mallory");

    const eveIntro =
        document.querySelector(
            '[data-character="eve"]'
        );

    const malloryIntro =
        document.querySelector(
            '[data-character="mallory"]'
        );


    /* ---------- 初期状態 ---------- */

    if (attackerContainer) {
        attackerContainer.innerHTML = "";
    }


    if (attackerInfo) {
        attackerInfo.classList.add("hidden");
    }


    if (eveNode) {
        eveNode.classList.add("hidden");
    }


    if (malloryNode) {
        malloryNode.classList.add("hidden");
    }


    /* ---------- Eve ---------- */

    const eve =
        attackers?.eve;


    if (eve?.enabled) {

        if (eveNode) {
            eveNode.classList.remove("hidden");
        }


        if (eveIntro) {
            eveIntro.classList.remove("hidden");
        }


        renderAttackerCard(eve);
    }


    /* ---------- Mallory ---------- */

    const mallory =
        attackers?.mallory;


    if (mallory?.enabled) {

        if (malloryNode) {
            malloryNode.classList.remove("hidden");
        }


        if (malloryIntro) {
            malloryIntro.classList.remove("hidden");
        }


        renderAttackerCard(mallory);
    }


    /* ---------- 詳細情報 ---------- */

    if (
        attackerContainer &&
        attackerContainer.children.length > 0 &&
        attackerInfo
    ) {

        attackerInfo.classList.remove(
            "hidden"
        );
    }
}


/* ========================================
   攻撃者カード
   ======================================== */

function renderAttackerCard(attacker) {

    const container =
        document.getElementById(
            "attackers"
        );


    if (!container) {
        return;
    }


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
        document.getElementById(
            "componentList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (!Array.isArray(components)) {
        return;
    }


    components.forEach(
        (component) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "component";


            element.dataset.componentId =
                component.id;


            element.draggable = true;


            const title =
                document.createElement(
                    "strong"
                );


            title.textContent =
                component.name ??
                component.id;


            const description =
                document.createElement(
                    "p"
                );


            description.textContent =
                component.description ??
                "";


            element.appendChild(title);

            if (component.description) {

                element.appendChild(
                    description
                );
            }


            /* ---------- ドラッグ開始 ---------- */

            element.addEventListener(
                "dragstart",
                (event) => {

                    event.dataTransfer.setData(
                        "application/crypta-component",
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
        }
    );
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


    /* ---------- コンポーネント追加 ---------- */

    path.addEventListener(
        "dragover",
        (event) => {

            event.preventDefault();


            const componentId =
                event.dataTransfer.getData(
                    "application/crypta-component"
                );


            if (componentId) {

                event.dataTransfer.dropEffect =
                    "copy";

                path.classList.add(
                    "drag-over"
                );

            } else {

                event.dataTransfer.dropEffect =
                    "move";
            }
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


            /* ---------- 新規コンポーネント ---------- */

            const componentId =
                event.dataTransfer.getData(
                    "application/crypta-component"
                );


            if (componentId) {

                addCommunicationBlock(
                    componentId
                );

                return;
            }


            /* ---------- 既存ブロックの並べ替え ---------- */

            const blockId =
                event.dataTransfer.getData(
                    "application/crypta-block"
                );


            if (blockId) {

                moveCommunicationBlock(
                    blockId,
                    event.clientX
                );
            }
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

                loadInitialCommunication(
                    currentStage
                );

                updateCommunicationView();
            }
        );
    }
}


/* ========================================
   通信ブロック追加
   ======================================== */

function addCommunicationBlock(
    componentId
) {

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
            createBlockId(),

        componentId:
            component.id,

        name:
            component.name ??
            component.id,

        description:
            component.description ??
            ""
    });


    updateCommunicationView();
}


/* ========================================
   通信ブロックID
   ======================================== */

function createBlockId() {

    return (
        "block-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .slice(2)
    );
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


    /* ---------- 空 ---------- */

    if (
        communicationBlocks.length === 0
    ) {

        const placeholder =
            document.createElement(
                "div"
            );


        placeholder.id =
            "communicationPlaceholder";


        placeholder.className =
            "communication-placeholder";


        placeholder.textContent =
            "コンポーネントをここに配置";


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


            path.appendChild(element);
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
        document.createElement(
            "div"
        );


    element.className =
        "communication-block";


    element.dataset.blockId =
        block.id;


    element.draggable = true;


    const title =
        document.createElement(
            "strong"
        );


    title.textContent =
        block.name;


    element.appendChild(title);


    if (block.description) {

        const description =
            document.createElement(
                "p"
            );


        description.textContent =
            block.description;


        element.appendChild(
            description
        );
    }


    /* ---------- ドラッグ開始 ---------- */

    element.addEventListener(
        "dragstart",
        (event) => {

            event.dataTransfer.setData(
                "application/crypta-block",
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


    /* ---------- ダブルクリック削除 ---------- */

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
   通信ブロック並べ替え
   ======================================== */

function moveCommunicationBlock(
    blockId,
    mouseX
) {

    const path =
        document.getElementById(
            "communicationPath"
        );


    if (!path) {
        return;
    }


    const draggedIndex =
        communicationBlocks.findIndex(
            (block) =>
                block.id === blockId
        );


    if (draggedIndex === -1) {
        return;
    }


    const draggedBlock =
        communicationBlocks[
            draggedIndex
        ];


    communicationBlocks.splice(
        draggedIndex,
        1
    );


    const elements =
        Array.from(
            path.querySelectorAll(
                ".communication-block"
            )
        );


    let newIndex =
        communicationBlocks.length;


    for (
        let index = 0;
        index < elements.length;
        index++
    ) {

        const element =
            elements[index];


        const rect =
            element.getBoundingClientRect();


        if (
            mouseX <
            rect.left +
            rect.width / 2
        ) {

            const targetId =
                element.dataset.blockId;


            newIndex =
                communicationBlocks.findIndex(
                    (block) =>
                        block.id === targetId
                );


            break;
        }
    }


    communicationBlocks.splice(
        newIndex,
        0,
        draggedBlock
    );


    updateCommunicationView();
}


/* ========================================
   初回フローティング
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


    /* ---------- 目標をフローティングへ ---------- */

    renderIntroObjectives();


    /* ---------- 不要な攻撃者を非表示 ---------- */

    updateIntroAttackers();


    /* ---------- 初回表示 ---------- */

    const hasShown =
        sessionStorage.getItem(
            "crypta-character-intro"
        );


    if (!hasShown) {

        intro.classList.remove(
            "hidden"
        );
    }


    /* ---------- 閉じる ---------- */

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
   フローティング目標表示
   ======================================== */

function renderIntroObjectives() {

    if (!currentStage) {
        return;
    }


    const finalText =
        document.getElementById(
            "introFinalObjectiveText"
        );


    const objectiveAText =
        document.getElementById(
            "introObjectiveAText"
        );


    const objectiveBText =
        document.getElementById(
            "introObjectiveBText"
        );


    if (finalText) {

        finalText.textContent =
            currentStage.objective?.final ??
            "";
    }


    if (objectiveAText) {

        objectiveAText.textContent =
            currentStage.objective?.A ??
            "";
    }


    if (objectiveBText) {

        objectiveBText.textContent =
            currentStage.objective?.B ??
            "";
    }
}


/* ========================================
   フローティングの攻撃者表示
   ======================================== */

function updateIntroAttackers() {

    const attackers =
        currentStage?.attacker;


    const eveIntro =
        document.querySelector(
            '.intro-character-card[data-character="eve"]'
        );


    const malloryIntro =
        document.querySelector(
            '.intro-character-card[data-character="mallory"]'
        );


    if (eveIntro) {

        if (attackers?.eve?.enabled) {

            eveIntro.classList.remove(
                "hidden"
            );

        } else {

            eveIntro.classList.add(
                "hidden"
            );
        }
    }


    if (malloryIntro) {

        if (
            attackers?.mallory?.enabled
        ) {

            malloryIntro.classList.remove(
                "hidden"
            );

        } else {

            malloryIntro.classList.add(
                "hidden"
            );
        }
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
     * 現段階ではエディタ動作確認用。
     *
     * 今後ここに、
     * Eve / Mallory の攻撃処理、
     * 通信要件の判定、
     * 突破演出、
     * S / A / B / C 評価
     * を実装する。
     */

    setTimeout(
        () => {

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

        },
        500
    );
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
