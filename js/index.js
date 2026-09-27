document.addEventListener("DOMContentLoaded", () => {
    const startButton = document.getElementById("startButton");
    const stageSelect = document.getElementById("stageSelect");
    const stageButtons = document.querySelectorAll("[data-stage]");

    // 「ゲームを開始」
    if (startButton && stageSelect) {
        startButton.addEventListener("click", () => {
            stageSelect.scrollIntoView({
                behavior: "smooth"
            });
        });
    }

    // ステージ選択
    stageButtons.forEach((button) => {
        button.addEventListener("click", () => {
            if (button.disabled) {
                return;
            }

            const stageNumber = button.dataset.stage;

            const stageId =
                String(stageNumber).padStart(2, "0");

            window.location.href =
                `simulator.html?stage=${stageId}`;
        });
    });
});
