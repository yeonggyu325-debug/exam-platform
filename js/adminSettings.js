"use strict";

// 책임: 시험 설정 폼 렌더 및 즉시 반영

function renderSettingsManager() {
  const allCategories = getCategories();
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>시험 설정</h2>
        </div>
      </div>

      ${getQuotaWarnings().length ? `<div class="notice danger">${getQuotaWarnings().map(escapeHtml).join("<br>")}</div><br>` : ""}

      <form onchange="updateExamSettings(event)">
        <div class="grid three">
          <div class="field">
            <label for="settingTotal">분기별 출제 문항 수</label>
            <input id="settingTotal" name="totalQuestions" type="number" min="1" value="${examSettings.totalQuestions}" readonly>
          </div>
          <div class="field">
            <label for="settingTime">제한 시간(분)</label>
            <input id="settingTime" name="timeLimitMinutes" type="number" min="1" value="${examSettings.timeLimitMinutes}">
          </div>
          <div class="field">
            <label for="settingPass">합격 기준 점수</label>
            <input id="settingPass" name="passingScore" type="number" min="0" max="100" value="${examSettings.passingScore}">
          </div>
          <div class="field">
            <label for="settingTabLimit">탭 전환 허용 횟수</label>
            <input id="settingTabLimit" name="tabSwitchLimit" type="number" min="1" value="${examSettings.tabSwitchLimit}">
          </div>
          <div class="field">
            <label for="settingQuestionRandom">문제 랜덤 여부</label>
            <select id="settingQuestionRandom" name="randomizeQuestions">
              ${optionHtml("true",  String(examSettings.randomizeQuestions), "ON")}
              ${optionHtml("false", String(examSettings.randomizeQuestions), "OFF")}
            </select>
          </div>
          <div class="field">
            <label for="settingOptionRandom">보기 랜덤 여부</label>
            <select id="settingOptionRandom" name="randomizeOptions">
              ${optionHtml("true",  String(examSettings.randomizeOptions), "ON")}
              ${optionHtml("false", String(examSettings.randomizeOptions), "OFF")}
            </select>
          </div>
        </div>

        <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">

        <h3>카테고리별 출제 수</h3>
        <div class="grid three">
          ${allCategories.map(category => `
            <div class="field">
              <label for="quota_${escapeHtml(category)}">${escapeHtml(category)}</label>
              <input id="quota_${escapeHtml(category)}" name="quota:${escapeHtml(category)}"
                type="number" min="0" value="${examSettings.categoryQuota[category] ?? 0}">
            </div>
          `).join("")}
        </div>
      </form>

      <div class="notice" style="margin-top:14px">
        현재 카테고리별 출제 수 합계는
        <strong>${Object.values(examSettings.categoryQuota).reduce((a, b) => a + Number(b), 0)}</strong>문항입니다.
        분기별 출제 문항 수는 카테고리별 출제 수 합계로 자동 계산됩니다.
      </div>
    </section>
  `;
}

function updateExamSettings(event) {
  const target = event.target;
  if (!target.name) return;

  if (target.name.startsWith("quota:")) {
    const category = target.name.replace("quota:", "");
    examSettings.categoryQuota[category] = Math.max(0, Number(target.value || 0));
  } else if (target.name === "randomizeQuestions" || target.name === "randomizeOptions") {
    examSettings[target.name] = target.value === "true";
  } else if (target.name !== "totalQuestions") {
    examSettings[target.name] = Math.max(1, Number(target.value || 1));
  }

  examSettings.totalQuestions = Object.values(examSettings.categoryQuota).reduce((a, b) => a + Number(b), 0);
  savePersistentData();
  renderAdminDashboard();
}
