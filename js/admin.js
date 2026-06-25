"use strict";

// 책임: 관리자 레이아웃, 사이드바 네비게이션, 대시보드 홈, 공통 차트/뱃지 헬퍼

function renderAdminDashboard() {
  clearTimer();
  removeExamGuards();
  const renderer = {
    dashboard: renderAdminHome,
    users:     renderUserManager,
    questions: renderQuestionManager,
    settings:  renderSettingsManager,
    results:   renderResultsManager,
    stats:     renderStatsManager,
    logs:      renderLogManager,
    affiliations: renderAffiliationManager
  }[state.adminSection];

  app.innerHTML = `
    ${buildHeader()}
    <div class="admin-layout">
      <aside class="sidebar">
        <span class="badge admin">관리자 모드</span>
        <nav aria-label="관리자 메뉴">
          ${adminNavButton("dashboard", "대시보드 홈")}
          ${adminNavButton("users",     "응시자 관리")}
          ${adminNavButton("affiliations", "소속 관리")}
          ${adminNavButton("questions", "문제은행 관리")}
          ${adminNavButton("settings",  "시험 설정")}
          ${adminNavButton("results",   "결과 관리")}
          ${adminNavButton("stats",     "통계 시각화")}
          ${adminNavButton("logs",      "응시 로그")}
        </nav>
      </aside>
      <main class="admin-main">${renderer()}</main>
    </div>
  `;
}

function adminNavButton(section, label) {
  return `<button class="btn nav-btn ${state.adminSection === section ? "active" : ""}" type="button"
    onclick="state.adminSection='${section}'; renderAdminDashboard();">${label}</button>`;
}

/* ─── 대시보드 홈 ──────────────────────────────── */
function renderAdminHome() {
  const metrics        = getDashboardMetrics();
  const recent         = [...examResults].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5);
  const categoryCounts = getCategoryCounts();
  const scoreDist      = getScoreDistribution(examResults);

  return `
    <section class="section-head">
      <div>
        <h2>관리자 대시보드</h2>
      </div>
      ${getQuotaWarnings().length ? `<span class="badge danger">문항 부족 경고</span>` : ""}
    </section>

    ${getQuotaWarnings().length ? `<div class="notice danger">${getQuotaWarnings().map(escapeHtml).join("<br>")}</div><br>` : ""}

    <div class="grid four">
      <div class="metric"><div class="label">총 응시자 수</div><div class="value">${metrics.totalCandidates}</div></div>
      <div class="metric"><div class="label">이번 분기 완료</div><div class="value">${metrics.completed}</div></div>
      <div class="metric"><div class="label">미응시 인원</div><div class="value">${metrics.pending}</div></div>
      <div class="metric"><div class="label">평균 점수</div><div class="value">${metrics.avgScore}점</div></div>
      <div class="metric"><div class="label">합격률</div><div class="value">${metrics.passRate}%</div></div>
      <div class="metric"><div class="label">실격자 수</div><div class="value">${metrics.disqualifiedCount}</div></div>
      <div class="metric"><div class="label">활성 문항</div><div class="value">${questionBank.filter(q => q.active).length}</div></div>
      <div class="metric"><div class="label">현재 분기</div><div class="value" style="font-size:24px">${getCurrentQuarter()}</div></div>
    </div>

    <div class="grid two" style="margin-top:16px">
      <section class="card">
        <div class="section-head"><h3>최근 응시 기록</h3></div>
        <div class="recent-list">
          ${recent.map(r => `
            <div class="recent-item">
              <div>
                <strong>${escapeHtml(r.name)}</strong>
                <span class="muted">${escapeHtml(r.department)} · ${escapeHtml(r.quarter)}</span>
              </div>
              <div class="recent-meta">
                <span>${formatDateOnly(r.submittedAt)}</span>
                <strong>${r.percentageScore}점</strong>
                ${renderResultBadge(r)}
              </div>
            </div>
          `).join("") || `<div class="empty">최근 응시 기록이 없습니다.</div>`}
        </div>
      </section>

      <section class="card">
        <div class="section-head"><h3>카테고리별 문항 수</h3></div>
        ${renderBarChart(categoryCounts.map(item => ({ label: item.category, value: item.count })))}
      </section>

      <section class="card">
        <div class="section-head"><h3>점수 분포 요약</h3></div>
        ${renderBarChart(scoreDist)}
      </section>

      <section class="card">
        <div class="section-head"><h3>시험 설정 요약</h3></div>
        <dl class="profile-list">
          <div><dt>출제 문항</dt><dd>${examSettings.totalQuestions}문항</dd></div>
          <div><dt>제한 시간</dt><dd>${examSettings.timeLimitMinutes}분</dd></div>
          <div><dt>합격 기준</dt><dd>${examSettings.passingScore}점</dd></div>
          <div><dt>탭 전환 제한</dt><dd>${examSettings.tabSwitchLimit}회</dd></div>
        </dl>
      </section>
      <section class="card" style="grid-column:1/-1">
        <div class="section-head"><h3>분기별 응시 현황</h3></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>분기</th><th>응시 인원</th><th>합격</th><th>불합격</th><th>실격</th><th>평균 점수</th><th>합격률</th></tr>
            </thead>
            <tbody>
              ${(() => {
                const quarters = [...new Set(examResults.map(r => r.quarter))].sort().reverse();
                if (!quarters.length) return `<tr><td colspan="7" class="empty">응시 기록이 없습니다.</td></tr>`;
                return quarters.map(q => {
                  const rows = examResults.filter(r => r.quarter === q);
                  const passed = rows.filter(r => r.passed && !r.disqualified).length;
                  const failed = rows.filter(r => !r.passed && !r.disqualified).length;
                  const disq   = rows.filter(r => r.disqualified).length;
                  const avg    = rows.length ? Math.round(rows.reduce((s,r)=>s+r.percentageScore,0)/rows.length) : 0;
                  const rate   = rows.length ? Math.round(passed/rows.length*100) : 0;
                  return `<tr>
                    <td><strong>${escapeHtml(q)}</strong></td>
                    <td>${rows.length}명</td>
                    <td><span class="badge success">${passed}</span></td>
                    <td><span class="badge danger">${failed}</span></td>
                    <td><span class="badge">${disq}</span></td>
                    <td>${avg}점</td>
                    <td>${rate}%</td>
                  </tr>`;
                }).join("");
              })()}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function getDashboardMetrics() {
  const quarter        = getCurrentQuarter();
  const totalCandidates = getCandidateUsers().length;
  const currentResults = examResults.filter(r => r.quarter === quarter);
  const completed      = new Set(currentResults.map(r => r.employeeId)).size;
  const pending        = totalCandidates - completed;
  const nonDisqualified = currentResults.filter(r => !r.disqualified);
  const avgScore       = currentResults.length
    ? Math.round(currentResults.reduce((sum, r) => sum + r.percentageScore, 0) / currentResults.length) : 0;
  const passRate       = nonDisqualified.length
    ? Math.round((nonDisqualified.filter(r => r.passed).length / nonDisqualified.length) * 100) : 0;
  const disqualifiedCount = currentResults.filter(r => r.disqualified).length;
  return { totalCandidates, completed, pending, avgScore, passRate, disqualifiedCount };
}

/* ─── 공통 차트/뱃지 헬퍼 ─────────────────────── */
function getCategoryCounts() {
  return getCategories().map(category => ({
    category,
    count: questionBank.filter(q => q.category === category && q.active).length
  }));
}

function getScoreDistribution(results) {
  const ranges = [
    { label: "0-59",   min: 0,  max: 59  },
    { label: "60-69",  min: 60, max: 69  },
    { label: "70-79",  min: 70, max: 79  },
    { label: "80-89",  min: 80, max: 89  },
    { label: "90-100", min: 90, max: 100 }
  ];
  return ranges.map(range => ({
    label: range.label,
    value: results.filter(r => r.percentageScore >= range.min && r.percentageScore <= range.max).length
  }));
}

function renderBarChart(items) {
  const max = Math.max(1, ...items.map(item => item.value));
  return `
    <div class="bar-chart">
      ${items.map(item => `
        <div class="bar-row">
          <strong>${escapeHtml(item.label)}</strong>
          <div class="bar-track" aria-label="${escapeHtml(item.label)} ${item.value}">
            <div class="bar-fill" style="width:${Math.round((item.value / max) * 100)}%"></div>
          </div>
          <span class="text-right">${item.value}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderResultBadge(result) {
  if (result.disqualified) return `<span class="badge danger">실격</span>`;
  return `<span class="badge ${result.passed ? "success" : "danger"}">${result.passed ? "합격" : "불합격"}</span>`;
}
