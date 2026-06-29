"use strict";

// 책임: 응시 결과 목록, 필터, 정렬

function renderResultsManager() {
  const rows     = filterResults();
  const quarters = [...new Set(examResults.map(r => r.quarter))].sort().reverse();
  const grouped = rows.reduce((acc, row) => {
    const key = row.quarter || "분기 미지정";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const visibleQuarters = Object.keys(grouped).sort().reverse();

  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>결과 관리</h2>
        </div>
      </div>

      <div class="filters">
        <div class="field">
          <label for="resultDepartment">소속</label>
          <select id="resultDepartment" onchange="state.filters.resultDepartment=this.value; renderAdminDashboard();">
            ${optionHtml("전체", state.filters.resultDepartment)}
            ${getDepartments().map(dep => optionHtml(dep, state.filters.resultDepartment)).join("")}
          </select>
        </div>
        <div class="field">
          <label for="resultQuarter">분기</label>
          <select id="resultQuarter" onchange="state.filters.resultQuarter=this.value; renderAdminDashboard();">
            ${optionHtml("전체", state.filters.resultQuarter)}
            ${quarters.map(q => optionHtml(q, state.filters.resultQuarter)).join("")}
          </select>
        </div>
        <div class="field">
          <label for="resultDisqualified">실격 여부</label>
          <select id="resultDisqualified" onchange="state.filters.resultDisqualified=this.value; renderAdminDashboard();">
            ${["전체", "실격", "정상"].map(v => optionHtml(v, state.filters.resultDisqualified)).join("")}
          </select>
        </div>
        <div class="field">
          <label for="resultSort">정렬</label>
          <select id="resultSort" onchange="state.filters.resultSort=this.value; renderAdminDashboard();">
            ${optionHtml("dateDesc",  state.filters.resultSort, "최신순")}
            ${optionHtml("scoreDesc", state.filters.resultSort, "점수 높은 순")}
            ${optionHtml("scoreAsc",  state.filters.resultSort, "점수 낮은 순")}
          </select>
        </div>
        <button class="btn" type="button" onclick="resetResultFilters()">초기화</button>
      </div>

      ${visibleQuarters.map(quarter => `
        <section class="quarter-result-block">
          <div class="quarter-title">
            <h3>${escapeHtml(quarter)}</h3>
            <span class="badge">${grouped[quarter].length}건</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>응시일시</th><th>제출일시</th><th>소요시간</th><th>소속</th><th>성명</th><th>정답</th><th>점수</th><th>최종 상태</th><th>자격 유효기간</th><th>탭 전환</th></tr>
              </thead>
              <tbody>
                ${grouped[quarter].map(r => `
                  <tr>
                    <td>${r.startedAt ? formatDateTime(r.startedAt) : "-"}</td>
                    <td>${formatDateTime(r.submittedAt)}</td>
                    <td>${(r.startedAt && r.submittedAt) ? (() => { const mins = Math.round((new Date(r.submittedAt) - new Date(r.startedAt)) / 60000); return mins + "분"; })() : "-"}</td>
                    <td>${escapeHtml(r.department)}</td>
                    <td>${escapeHtml(r.name)}</td>
                    <td>${r.correctCount}/${r.totalCount}</td>
                    <td>${r.percentageScore}점</td>
                    <td>${renderResultBadge(r)}${r.disqualificationReason ? `<br><span class="muted">${escapeHtml(r.disqualificationReason)}</span>` : ""}</td>
                    <td>${getCertificationValidity(r) ? `${formatDateOnly(getCertificationValidity(r).validFrom)} ~ ${formatDateOnly(getCertificationValidity(r).validUntil)}` : "-"}</td>
                    <td>${r.tabSwitchCount ?? 0}회</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      `).join("") || `<div class="empty">조건에 맞는 결과가 없습니다.</div>`}
    </section>
  `;
}

function filterResults() {
  let rows = examResults.filter(r => {
    const depOk  = state.filters.resultDepartment === "전체" || r.department === state.filters.resultDepartment;
    const qOk    = state.filters.resultQuarter    === "전체" || r.quarter    === state.filters.resultQuarter;
    const disqOk = state.filters.resultDisqualified === "전체" ||
      (state.filters.resultDisqualified === "실격" &&  r.disqualified) ||
      (state.filters.resultDisqualified === "정상" && !r.disqualified);
    return depOk && qOk && disqOk;
  });

  if      (state.filters.resultSort === "scoreDesc") rows.sort((a, b) => b.percentageScore - a.percentageScore);
  else if (state.filters.resultSort === "scoreAsc")  rows.sort((a, b) => a.percentageScore - b.percentageScore);
  else                                               rows.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return rows;
}

function resetResultFilters() {
  state.filters.resultDepartment   = "전체";
  state.filters.resultQuarter      = "전체";
  state.filters.resultSort         = "dateDesc";
  state.filters.resultDisqualified = "전체";
  renderAdminDashboard();
}
