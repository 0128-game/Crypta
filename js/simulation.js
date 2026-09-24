/* ========================================
   Crypta - simulation.js
   simulation.html 専用
   ======================================== */

(() => {
  "use strict";

  const state = {
    stage: null,
    stageId: null,
    construction: {
      alice: [],
      flow: [],
      bob: []
    }
  };

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    state.stageId =
      new URLSearchParams(location.search).get("stage") || "test";

    bindEvents();
    setStatus("読み込み中");

    try {
      state.stage = await loadStage(state.stageId);

      renderStage(state.stage);
      renderConstruction();

      addLog(
        `ステージ「${state.stage.title || state.stageId}」を読み込みました。`
      );

      setStatus("準備完了");
    } catch (error) {
      console.error(error);

      setStatus("読み込み失敗");

      addLog(
        `ステージデータを読み込めませんでした: ${error.message}`
      );

      showLoadError(error);
    }
  }

  /* ========================================
     Stage
     ======================================== */

  async function loadStage(stageId) {
    const response = await fetch(
      `stages/${encodeURIComponent(stageId)}.json`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  function renderStage(stage) {
    document.title =
      `Crypta - ${stage.title || "Simulation"}`;

    $("#unit-name").textContent =
      stage.unit?.name || "UNIT";

    $("#stage-title").textContent =
      stage.title || "シミュレーション";

    $("#stage-description").textContent =
      stage.description || "";

    $("#final-goal").textContent =
      stage.goals?.final || "---";

    $("#goal-a").textContent =
      stage.goals?.a?.description || "---";

    $("#goal-b").textContent =
      stage.goals?.b?.description || "---";

    renderEnvironment(
      "#eve-environment",
      stage.attackers?.eve?.environment || {}
    );

    renderEnvironment(
      "#mallory-environment",
      stage.attackers?.mallory?.environment || {}
    );

    renderTools(stage.tools || []);

    renderRequirements(stage.requirements || []);
  }

  /* ========================================
     Attacker Environment
     ======================================== */

  function renderEnvironment(selector, environment) {
    const root = $(selector);

    if (!root) return;

    $$("[data-environment]", root).forEach((element) => {
      const key = element.dataset.environment;

      element.textContent =
        formatValue(environment[key]);
    });
  }

  function formatValue(value) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return "---";
    }

    if (Array.isArray(value)) {
      return value.join("、");
    }

    if (typeof value === "object") {
      return value.label || JSON.stringify(value);
    }

    return String(value);
  }

  /* ========================================
     Events
     ======================================== */

  function bindEvents() {
    $("#reset-button")?.addEventListener(
      "click",
      resetConstruction
    );

    $("#test-button")?.addEventListener(
      "click",
      runSimulation
    );

    $("#retry-button")?.addEventListener(
      "click",
      resetSimulation
    );

    $("#next-stage-button")?.addEventListener(
      "click",
      goToNextStage
    );
  }

  /* ========================================
     Tools
     ======================================== */

  function renderTools(tools) {
    const root = $("#tool-list");

    if (!root) return;

    root.innerHTML = "";

    if (tools.length === 0) {
      root.innerHTML =
        '<span class="drop-placeholder">利用可能なツールはありません。</span>';

      return;
    }

    tools.forEach((tool) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className = "tool";

      button.dataset.toolId = tool.id;

      button.textContent = tool.name;

      button.title =
        tool.description || "";

      button.addEventListener(
        "click",
        () => {
          addToolToConstruction(tool);
        }
      );

      root.appendChild(button);
    });
  }

  function addToolToConstruction(tool) {
    const side =
      tool.default_side || "flow";

    if (!state.construction[side]) {
      state.construction[side] = [];
    }

    state.construction[side].push({
      id: tool.id,
      name: tool.name
    });

    renderConstruction();

    addLog(
      `「${tool.name}」を${sideLabel(side)}に追加しました。`
    );
  }

  function renderConstruction() {
    ["alice", "flow", "bob"].forEach(
      (side) => {
        const root =
          $(`#${side}-tools`);

        if (!root) return;

        root.innerHTML = "";

        if (
          state.construction[side].length === 0
        ) {
          root.innerHTML =
            '<span class="drop-placeholder">ここにツールを配置</span>';

          return;
        }

        state.construction[side].forEach(
          (tool, index) => {
            const item =
              document.createElement("div");

            item.className =
              "placed-tool";

            const name =
              document.createElement("span");

            name.textContent =
              tool.name;

            const remove =
              document.createElement("button");

            remove.type = "button";
            remove.className =
              "remove-tool";

            remove.textContent = "×";
            remove.title = "削除";

            remove.addEventListener(
              "click",
              () => {
                state.construction[side]
                  .splice(index, 1);

                renderConstruction();

                addLog(
                  `「${tool.name}」を構成から削除しました。`
                );
              }
            );

            item.append(name, remove);

            root.appendChild(item);
          }
        );
      }
    );
  }

  function sideLabel(side) {
    return {
      alice: "Alice側",
      flow: "通信フロー",
      bob: "Bob側"
    }[side] || side;
  }

  /* ========================================
     Requirements
     ======================================== */

  function renderRequirements(requirements) {
    const root =
      $("#requirement-list");

    if (!root) return;

    root.innerHTML = "";

    requirements.forEach(
      (requirement) => {
        const item =
          document.createElement("li");

        item.dataset.requirementId =
          requirement.id;

        item.textContent =
          requirement.description ||
          requirement.id;

        root.appendChild(item);
      }
    );
  }

  /* ========================================
     Reset
     ======================================== */

  function resetConstruction() {
    state.construction = {
      alice: [],
      flow: [],
      bob: []
    };

    renderConstruction();

    hideResults();

    addLog(
      "通信構成をリセットしました。"
    );

    setStatus("準備完了");
  }

  function resetSimulation() {
    resetConstruction();

    addLog(
      "シミュレーションを最初からやり直します。"
    );
  }

  /* ========================================
     Simulation
     ======================================== */

  function runSimulation() {
    if (!state.stage) {
      addLog(
        "ステージデータが読み込まれていません。"
      );

      return;
    }

    setStatus("シミュレーション中");

    addLog(
      "通信テストを開始しました。"
    );

    const result =
      evaluateConstruction();

    window.setTimeout(() => {
      showResult(result);

      setStatus(
        result.success
          ? "通信成功"
          : "突破された"
      );

      addLog(result.message);
    }, 350);
  }

  function evaluateConstruction() {
    const requirements =
      state.stage.requirements || [];

    const selected = [
      ...state.construction.alice,
      ...state.construction.flow,
      ...state.construction.bob
    ].map((tool) => tool.id);

    const checks =
      requirements.map((requirement) => {
        const requiredTools =
          requirement.required_tools || [];

        const met =
          requiredTools.every(
            (toolId) =>
              selected.includes(toolId)
          );

        return {
          id: requirement.id,
          description:
            requirement.description,
          met
        };
      });

    const allMet =
      checks.length > 0 &&
      checks.every(
        (check) => check.met
      );

    return {
      success: allMet,

      checks,

      message: allMet
        ? "テスト通信は成功しました。"
        : "通信の要件を満たせず、攻撃によって突破された可能性があります。",

      explanation: allMet
        ? "現在のテスト条件では、設定された要件を満たしています。"
        : (
            state.stage.result?.failure?.explanation ||
            "現在の構成では、攻撃者に利用される弱点が残っています。"
          ),

      weakness: allMet
        ? (
            state.stage.result?.success?.explanation ||
            "重大な未解決の弱点はありません。"
          )
        : (
            state.stage.result?.failure?.weakness ||
            "必要な防御機能が不足しています。"
          ),

      unresolved:
        checks
          .filter(
            (check) => !check.met
          )
          .map(
            (check) =>
              check.description
          )
    };
  }

  /* ========================================
     Result
     ======================================== */

  function showResult(result) {
    const panel =
      $("#result-panel");

    const evaluation =
      $("#evaluation-panel");

    panel?.classList.remove("hidden");

    evaluation?.classList.remove(
      "hidden"
    );

    $("#result-title").textContent =
      result.success
        ? "通信成功"
        : "突破された！";

    $("#result-explanation").textContent =
      result.explanation;

    $("#result-weakness").textContent =
      result.weakness;

    const unresolved =
      $("#result-unresolved");

    unresolved.innerHTML = "";

    if (
      result.unresolved.length === 0
    ) {
      const item =
        document.createElement("li");

      item.textContent =
        "未解決の要件はありません。";

      unresolved.appendChild(item);
    } else {
      result.unresolved.forEach(
        (text) => {
          const item =
            document.createElement("li");

          item.textContent = text;

          unresolved.appendChild(item);
        }
      );
    }

    renderEvaluation(result);
  }

  /* ========================================
     Evaluation
     ======================================== */

  function renderEvaluation(result) {
    const grade =
      calculateGrade(result);

    $("#evaluation-grade").textContent =
      grade;

    $$("#requirement-list li")
      .forEach((item) => {
        const check =
          result.checks.find(
            (requirement) =>
              requirement.id ===
              item.dataset.requirementId
          );

        item.classList.toggle(
          "requirement-met",
          Boolean(check?.met)
        );

        item.classList.toggle(
          "requirement-unmet",
          Boolean(
            check && !check.met
          )
        );

        if (check) {
          item.textContent =
            `${check.met ? "✓" : "✕"} ${check.description}`;
        }
      });

    $("#evaluation-summary")
      .textContent =
        grade === "S"
          ? "すべての要件を満たし、不要な構成もありません。"
          : grade === "A"
            ? "必要な要件を満たしていますが、不要な構成があります。"
            : grade === "B"
              ? "一部の要件を満たしています。"
              : "必要な要件を満たしていません。";
  }

  function calculateGrade(result) {
    const checks =
      result.checks;

    if (checks.length === 0) {
      return "C";
    }

    const metCount =
      checks.filter(
        (check) => check.met
      ).length;

    if (
      metCount === checks.length
    ) {
      const used =
        new Set([
          ...state.construction.alice,
          ...state.construction.flow,
          ...state.construction.bob
        ].map(
          (tool) => tool.id
        ));

      const required =
        new Set(
          checks.flatMap(
            (check) => {
              const requirement =
                (
                  state.stage.requirements ||
                  []
                ).find(
                  (item) =>
                    item.id ===
                    check.id
                );

              return (
                requirement
                  ?.required_tools ||
                []
              );
            }
          )
        );

      return used.size ===
        required.size
        ? "S"
        : "A";
    }

    return metCount > 0
      ? "B"
      : "C";
  }

  /* ========================================
     UI
     ======================================== */

  function hideResults() {
    $("#result-panel")
      ?.classList.add("hidden");

    $("#evaluation-panel")
      ?.classList.add("hidden");
  }

  function setStatus(text) {
    const element =
      $("#simulation-status");

    if (element) {
      element.textContent =
        text;
    }
  }

  function addLog(message) {
    const root =
      $("#simulation-log");

    if (!root) return;

    const entry =
      document.createElement("div");

    entry.className =
      "log-entry";

    const time =
      document.createElement("span");

    time.className =
      "log-time";

    time.textContent =
      new Date().toLocaleTimeString(
        "ja-JP"
      );

    const text =
      document.createElement("span");

    text.textContent =
      message;

    entry.append(
      time,
      text
    );

    root.appendChild(entry);

    root.scrollTop =
      root.scrollHeight;
  }

  function showLoadError(error) {
    $("#stage-description")
      .textContent =
        `ステージデータの読み込みに失敗しました。(${error.message})`;
  }

  /* ========================================
     Stage Transition
     ======================================== */

  function goToNextStage() {
    const current =
      state.stageId;

    const match =
      current.match(/(\d+)$/);

    if (!match) {
      addLog(
        "次のステージを特定できません。"
      );

      return;
    }

    const nextNumber =
      String(
        Number(match[1]) + 1
      ).padStart(2, "0");

    location.href =
      `simulation.html?stage=stage${nextNumber}`;
  }
})();
