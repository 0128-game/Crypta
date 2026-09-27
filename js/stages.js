/* ========================================
   CRYPTA - stages.js
   ステージデータ管理
   ======================================== */

const StageManager = (() => {

    /* ---------- ステージデータ ---------- */

    let currentStage = null;


    /* ---------- ステージ読み込み ---------- */

    async function loadStage(stageNumber) {
        const path = `stages/stage${String(stageNumber).padStart(2, "0")}.json`;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                throw new Error(
                    `ステージデータの読み込みに失敗しました: ${response.status}`
                );
            }

            const data = await response.json();

            currentStage = data;

            return data;

        } catch (error) {
            console.error(error);
            currentStage = null;

            return null;
        }
    }


    /* ---------- テスト用JSON読み込み ---------- */

    async function loadTestStage() {
        try {
            const response = await fetch("stages/test.json");

            if (!response.ok) {
                throw new Error(
                    `テストステージの読み込みに失敗しました: ${response.status}`
                );
            }

            const data = await response.json();

            currentStage = data;

            return data;

        } catch (error) {
            console.error(error);
            currentStage = null;

            return null;
        }
    }


    /* ---------- 現在のステージ取得 ---------- */

    function getCurrentStage() {
        return currentStage;
    }


    /* ---------- 公開 ---------- */

    return {
        loadStage,
        loadTestStage,
        getCurrentStage
    };

})();
