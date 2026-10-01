/* ========================================
   CRYPTA - simulator.js
   自由配置型通信設計エディタ
   ======================================== */

let currentStage = null;

/*
 * 通信に使用されているコンポーネント
 */
let communicationBlocks = [];

/*
 * キャンバス上に存在するオブジェクト
 *
 * {
 *   id,
 *   type,
 *   x,
 *   y,
 *   componentId
 * }
 */
let editorObjects = [];


/* ========================================
   初期化
   ======================================== */

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        await initializeSimulator();
    }
);


async function initializeSimulator() {

    const stageId =
        getStageId();

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


    currentStage =
        stage;


    renderStage(stage);

    loadInitialCommunication(stage);

    renderAttackers(stage.attacker);

    renderComponents(stage.components);

    initializeCharacterIntro();

    initializeEditor();

    initializeSimulation();

    updateCommunicationView();
}


/* ========================================
   ステージ
   ======================================== */

function getStageId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return params.get("stage");
}


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


function renderStage(stage) {

    const stageTitle =
        document.getElementById(
            "stageTitle"
        );

    if (stageTitle) {

        stageTitle.textContent =
            stage.title ??
            "Stage";
    }
}


/* ========================================
   初期通信
   ======================================== */

function loadInitialCommunication(stage) {

    communicationBlocks = [];


    if (
        !stage.communication ||
        !Array.isArray(
            stage.communication.blocks
        )
    ) {
        return;
    }


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
                        block.name ??
                        "",

                    description:
                        block.description ??
                        ""
                };
            }
        );
}


/* ========================================
   攻撃者
   ======================================== */

function renderAttackers(attackers) {

    const attackerContainer =
        document.getElementById(
            "attackers"
        );

    const eveNode =
        document.getElementById(
            "eve"
        );

    const malloryNode =
        document.getElementById(
            "mallory"
        );


    if (attackerContainer) {
        attackerContainer.innerHTML = "";
    }


    const eve =
        attackers?.eve;


    if (eve?.enabled) {

        if (eveNode) {

            eveNode.classList.remove(
                "hidden"
            );
        }

        renderAttackerCard(eve);

    } else {

        if (eveNode) {

            eveNode.classList.add(
                "hidden"
            );
        }
    }


    const mallory =
        attackers?.mallory;


    if (mallory?.enabled) {

        if (malloryNode) {

            malloryNode.classList.remove(
                "hidden"
            );
        }

        renderAttackerCard(
            mallory
        );

    } else {

        if (malloryNode) {

            malloryNode.classList.add(
                "hidden"
            );
        }
    }
}


function renderAttackerCard(
    attacker
) {

    const container =
        document.getElementById(
            "attackers"
        );

    if (!container) {
        return;
    }


    const card =
        document.createElement(
            "div"
        );

    card.className =
        "attacker";


    const title =
        document.createElement(
            "h3"
        );

    title.textContent =
        attacker.name ??
        "攻撃者";


    const description =
        document.createElement(
            "p"
        );

    description.textContent =
        attacker.description ??
        "";


    card.appendChild(title);

    card.appendChild(
        description
    );

    container.appendChild(
        card
    );
}


/* ========================================
   コンポーネント一覧
   ======================================== */

function renderComponents(
    components
) {

    const container =
        document.getElementById(
            "componentList"
        );

    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (!Array.isArray(
        components
    )) {
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


            /*
             * HTML5 Drag & Drop
             */

            element.draggable =
                true;


            const title =
                document.createElement(
                    "strong"
                );

            title.textContent =
                component.name ??
                component.id;


            element.appendChild(
                title
            );


            if (
                component.description
            ) {

                const description =
                    document.createElement(
                        "p"
                    );

                description.textContent =
                    component.description;

                element.appendChild(
                    description
                );
            }


            /*
             * ドラッグ開始
             */

            element.addEventListener(
                "dragstart",
                (event) => {

                    event.dataTransfer.effectAllowed =
                        "copy";

                    event.dataTransfer.setData(
                        "application/crypta-component",
                        component.id
                    );


                    /*
                     * Firefox等で
                     * ドラッグ対象を確実にする
                     */

                    event.dataTransfer.setData(
                        "text/plain",
                        component.id
                    );


                    element.classList.add(
                        "dragging"
                    );
                }
            );


            /*
             * ドラッグ終了
             */

            element.addEventListener(
                "dragend",
                () => {

                    element.classList.remove(
                        "dragging"
                    );
                }
            );


            container.appendChild(
                element
            );
        }
    );
}


/* ========================================
   エディタ初期化
   ======================================== */

function initializeEditor() {

    const canvas =
        document.getElementById(
            "communicationCanvas"
        );


    if (!canvas) {
        return;
    }


    /*
     * ======================================
     * キャンバスへのドラッグ
     * ======================================
     */

    canvas.addEventListener(
        "dragover",
        (event) => {

            /*
             * これがないとdropイベントが
             * 発生しない。
             */

            event.preventDefault();


            event.dataTransfer.dropEffect =
                "copy";


            canvas.classList.add(
                "canvas-drag-over"
            );
        }
    );


    canvas.addEventListener(
        "dragenter",
        (event) => {

            event.preventDefault();

            canvas.classList.add(
                "canvas-drag-over"
            );
        }
    );


    canvas.addEventListener(
        "dragleave",
        (event) => {

            /*
             * 子要素への移動では
             * dragleave扱いにしない。
             */

            if (
                event.relatedTarget &&
                canvas.contains(
                    event.relatedTarget
                )
            ) {
                return;
            }


            canvas.classList.remove(
                "canvas-drag-over"
            );
        }
    );


    /*
     * ======================================
     * ドロップ
     * ======================================
     */

    canvas.addEventListener(
        "drop",
        (event) => {

            event.preventDefault();

            event.stopPropagation();


            canvas.classList.remove(
                "canvas-drag-over"
            );


            /*
             * コンポーネント一覧から
             * ドロップされた場合
             */

            const componentId =
                event.dataTransfer.getData(
                    "application/crypta-component"
                );


            if (componentId) {

                const position =
                    getCanvasPosition(
                        event,
                        canvas
                    );


                addComponentToCanvas(
                    componentId,
                    position.x,
                    position.y
                );


                return;
            }


            /*
             * 既に置かれている
             * オブジェクトを移動した場合
             */

            const objectId =
                event.dataTransfer.getData(
                    "application/crypta-object"
                );


            if (objectId) {

                const position =
                    getCanvasPosition(
                        event,
                        canvas
                    );


                moveObjectToPosition(
                    objectId,
                    position.x,
                    position.y
                );
            }
        }
    );


    /*
     * ======================================
     * 通信クリア
     * ======================================
     */

    const clearButton =
        document.getElementById(
            "clearCommunicationButton"
        );


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            () => {

                communicationBlocks =
                    [];

                editorObjects =
                    editorObjects.filter(
                        (object) =>
                            object.type !==
                            "component"
                    );

                updateCommunicationView();
            }
        );
    }


    /*
     * ======================================
     * 初期状態に戻す
     * ======================================
     */

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

                resetEditorObjects();

                updateCommunicationView();
            }
        );
    }


    /*
     * キャラクターを
     * ドラッグ可能にする
     */

    initializeCharacterDragging();
}


/* ========================================
   キャンバス座標
   ======================================== */

function getCanvasPosition(
    event,
    canvas
) {

    const rect =
        canvas.getBoundingClientRect();


    return {

        x:
            event.clientX -
            rect.left,

        y:
            event.clientY -
            rect.top
    };
}


/* ========================================
   コンポーネントを配置
   ======================================== */

function addComponentToCanvas(
    componentId,
    x,
    y
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


    const block = {

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
    };


    /*
     * 通信構成に追加
     */

    communicationBlocks.push(
        block
    );


    /*
     * キャンバス上の位置を保存
     */

    editorObjects.push({

        id:
            block.id,

        type:
            "component",

        x:
            x,

        y:
            y,

        componentId:
            component.id
    });


    updateCommunicationView();
}


/* ========================================
   通信ビュー更新
   ======================================== */

function updateCommunicationView() {

    const canvas =
        document.getElementById(
            "communicationCanvas"
        );


    if (!canvas) {
        return;
    }


    /*
     * 古いコンポーネントを削除
     */

    canvas
        .querySelectorAll(
            ".communication-block"
        )
        .forEach(
            (element) => {
                element.remove();
            }
        );


    /*
     * JSONに初期通信がある場合、
     * キャンバス上のオブジェクトを作る。
     */

    communicationBlocks.forEach(
        (block, index) => {

            let object =
                editorObjects.find(
                    (item) =>
                        item.id === block.id
                );


            if (!object) {

                object = {

                    id:
                        block.id,

                    type:
                        "component",

                    x:
                        canvas.clientWidth *
                        0.5 +
                        index * 170,

                    y:
                        canvas.clientHeight *
                        0.5,

                    componentId:
                        block.componentId
                };


                editorObjects.push(
                    object
                );
            }
        }
    );


    /*
     * コンポーネントを描画
     */

    communicationBlocks.forEach(
        (block) => {

            const object =
                editorObjects.find(
                    (item) =>
                        item.id === block.id
                );


            if (!object) {
                return;
            }


            const element =
                createCommunicationElement(
                    block
                );


            element.style.left =
                `${object.x}px`;


            element.style.top =
                `${object.y}px`;


            canvas.appendChild(
                element
            );


            initializeObjectDragging(
                element,
                object
            );
        }
    );
}


/* ========================================
   コンポーネント要素
   ======================================== */

function createCommunicationElement(
    block
) {

    const element =
        document.createElement(
            "div"
        );


    element.className =
        "communication-block";


    element.dataset.blockId =
        block.id;


    const title =
        document.createElement(
            "strong"
        );


    title.textContent =
        block.name;


    element.appendChild(
        title
    );


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


    /*
     * ダブルクリックで削除
     */

    element.addEventListener(
        "dblclick",
        (event) => {

            event.preventDefault();

            removeCommunicationBlock(
                block.id
            );
        }
    );


    return element;
}


/* ========================================
   配置済みオブジェクトの移動
   ======================================== */

function initializeObjectDragging(
    element,
    object
) {

    element.draggable =
        true;


    element.addEventListener(
        "dragstart",
        (event) => {

            event.dataTransfer.effectAllowed =
                "move";


            event.dataTransfer.setData(
                "application/crypta-object",
                object.id
            );


            event.dataTransfer.setData(
                "text/plain",
                object.id
            );


            element.classList.add(
                "dragging"
            );
        }
    );


    element.addEventListener(
        "dragend",
        () => {

            element.classList.remove(
                "dragging"
            );
        }
    );
}


/* ========================================
   オブジェクト移動
   ======================================== */

function moveObjectToPosition(
    objectId,
    x,
    y
) {

    const object =
        editorObjects.find(
            (item) =>
                item.id === objectId
        );


    if (!object) {
        return;
    }


    object.x =
        clamp(
            x,
            10,
            getCanvasWidth() - 10
        );


    object.y =
        clamp(
            y,
            10,
            getCanvasHeight() - 10
        );


    updateCommunicationView();
}


/* ========================================
   キャンバスサイズ
   ======================================== */

function getCanvasWidth() {

    const canvas =
        document.getElementById(
            "communicationCanvas"
        );


    if (!canvas) {
        return 0;
    }


    return canvas.clientWidth;
}


function getCanvasHeight() {

    const canvas =
        document.getElementById(
            "communicationCanvas"
        );


    if (!canvas) {
        return 0;
    }


    return canvas.clientHeight;
}


function clamp(
    value,
    min,
    max
) {

    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );
}


/* ========================================
   キャラクター移動
   ======================================== */

function initializeCharacterDragging() {

    const characters =
        document.querySelectorAll(
            ".character-node, .attacker-node"
        );


    characters.forEach(
        (character) => {

            character.draggable =
                true;


            character.addEventListener(
                "dragstart",
                (event) => {

                    event.dataTransfer.effectAllowed =
                        "move";


                    event.dataTransfer.setData(
                        "application/crypta-object",
                        character.id
                    );


                    event.dataTransfer.setData(
                        "text/plain",
                        character.id
                    );


                    character.classList.add(
                        "dragging"
                    );
                }
            );


            character.addEventListener(
                "dragend",
                () => {

                    character.classList.remove(
                        "dragging"
                    );
                }
            );
        }
    );
}


/* ========================================
   オブジェクト移動
   ======================================== */

function moveCharacter(
    id,
    x,
    y
) {

    const character =
        document.getElementById(id);


    if (!character) {
        return;
    }


    character.style.left =
        `${x}px`;


    character.style.top =
        `${y}px`;
}


/* ========================================
   オブジェクトID
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
   コンポーネント削除
   ======================================== */

function removeCommunicationBlock(
    blockId
) {

    communicationBlocks =
        communicationBlocks.filter(
            (block) =>
                block.id !== blockId
        );


    editorObjects =
        editorObjects.filter(
            (object) =>
                object.id !== blockId
        );


    updateCommunicationView();
}


/* ========================================
   初期状態へ戻す
   ======================================== */

function resetEditorObjects() {

    editorObjects =
        [];


    const canvas =
        document.getElementById(
            "communicationCanvas"
        );


    if (!canvas) {
        return;
    }


    const centerX =
        canvas.clientWidth / 2;


    const centerY =
        canvas.clientHeight / 2;


    communicationBlocks.forEach(
        (block, index) => {

            editorObjects.push({

                id:
                    block.id,

                type:
                    "component",

                x:
                    centerX +
                    (index -
                        (communicationBlocks.length - 1) /
                        2
                    ) *
                    180,

                y:
                    centerY,

                componentId:
                    block.componentId
            });
        }
    );


    updateCommunicationView();
}


/* ========================================
   キャラクター説明
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


    renderIntroObjectives();

    updateIntroAttackers();


    intro.classList.remove(
        "hidden"
    );


    const closeIntro =
        () => {

            intro.classList.add(
                "hidden"
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
   目標
   ======================================== */

function renderIntroObjectives() {

    const objective =
        currentStage?.objective;


    if (!objective) {
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
            objective.final ??
            "";
    }


    if (objectiveAText) {

        objectiveAText.textContent =
            objective.A ??
            "";
    }


    if (objectiveBText) {

        objectiveBText.textContent =
            objective.B ??
            "";
    }
}


/* ========================================
   攻撃者の説明表示
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

        eveIntro.classList.toggle(
            "hidden",
            !attackers?.eve?.enabled
        );
    }


    if (malloryIntro) {

        malloryIntro.classList.toggle(
            "hidden",
            !attackers?.mallory?.enabled
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


function startSimulation() {

    /*
     * 今後ここで
     *
     * Alice
     * ↓
     * 配置された通信構成
     * ↓
     * Eve / Mallory
     * ↓
     * Bob
     *
     * のアニメーションを行う。
     */
}


/* ========================================
   エラー
   ======================================== */

function handleStageError() {

    alert(
        "そのステージは存在しません。"
    );


    window.location.href =
        "index.html";
}
