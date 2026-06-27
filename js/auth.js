"use strict";

// 책임: 헤더 빌드, 테마 전환, 로그인, 로그아웃

function buildHeader() {
  const isAdmin = state.currentUser?.role === "admin";
  if (!state.currentUser) return "";
  return `
    <header class="topbar">
      <div class="brand" aria-label="시스템 이름">
        <img class="brand-logo" src="https://hniruja.com/wp-content/uploads/2024/02/h-%EC%9D%B4%EB%A3%A8%EC%9E%90.png" alt="에이치앤이루자 로고" />
        <div>
          <h1>안전담당자 자격인증제</h1>
        </div>
      </div>
      <div class="top-actions">
        ${isAdmin ? `<span class="badge admin">관리자 모드</span>` : ""}
        <button class="btn small" type="button" onclick="logout()">로그아웃</button>
      </div>
    </header>
  `;
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  render();
}

function logout() {
  clearTimer();
  removeExamGuards();
  state.currentUser  = null;
  state.view         = "login";
  state.adminSection = "dashboard";
  state.currentExam  = null;
  state.lastResult   = null;
  state.loginError   = "";
  state.isSubmitting = false;
  render();
}

function renderLogin() {
  clearTimer();
  removeExamGuards();
  app.innerHTML = `
    ${buildHeader()}
    <main class="login-wrap">
      <div class="login-card v2">
        <div class="login-card-banner">
          <img class="login-banner-logo" src="https://hniruja.com/wp-content/uploads/2024/02/h-%EC%9D%B4%EB%A3%A8%EC%9E%90.png" alt="로고" />
          <h2 class="login-title">안전담당자 자격인증제</h2>
        </div>
        <div class="login-card-body">
          
          ${state.loginError ? `<div class="notice danger login-notice" role="alert">${escapeHtml(state.loginError)}</div>` : ""}
          <form onsubmit="handleLogin(event)" class="login-form">
            <div class="field">
              <label for="loginDepartment">소속</label>
              <select id="loginDepartment" name="department" autocomplete="organization">
                <option value="">소속을 선택하세요</option>
                ${affiliationOptions()}
              </select>
            </div>
            <div class="field">
              <label for="loginName">성명</label>
              <input id="loginName" name="name" autocomplete="name" placeholder="성명을 입력하세요" required />
            </div>
            <button class="btn primary login-submit-btn" type="submit">
              입장하기
            </button>
          </form>
        </div>
      </div>
    </main>
  `;
  setTimeout(() => document.getElementById("loginDepartment")?.focus(), 0);
}

function handleLogin(event) {
  event.preventDefault();
  const form       = new FormData(event.currentTarget);
  const department = String(form.get("department") || "").trim();
  const name       = String(form.get("name") || "").trim();

  if (name === "ehs1985") {
    const admin = users.find(user => user.role === "admin") || { employeeId: "ADM-0001", department: "환경안전", name: "ehs1985", role: "admin" };
    state.currentUser = admin;
    state.view        = "admin";
    state.loginError  = "";
    render();
    return;
  }

  if (!department) {
    state.loginError = "응시자는 소속을 선택해야 합니다.";
    renderLogin();
    return;
  }

  const candidate = users.find(user => user.role === "candidate" && user.department === department && user.name === name);
  if (candidate) {
    state.currentUser = candidate;
    state.loginError  = "";
    const currentQuarterResult = examResults
      .filter(result => result.employeeId === candidate.employeeId && result.quarter === getCurrentQuarter())
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    if (currentQuarterResult) {
      state.lastResult = currentQuarterResult;
      state.view = "result";
      render();
      return;
    }

    const activeRecord = getActiveExamRecord(candidate.employeeId);
    if (activeRecord?.exam) {
      state.currentExam = activeRecord.exam;
      // 재접속 시 이탈해 있던 시간만큼 차감
      const savedRemaining = Number(activeRecord.remainingSeconds || examSettings.timeLimitMinutes * 60);
      const savedAt = activeRecord.updatedAt ? new Date(activeRecord.updatedAt).getTime() : Date.now();
      const elapsedSecs = Math.floor((Date.now() - savedAt) / 1000);
      state.remainingSeconds = Math.max(1, savedRemaining - elapsedSecs);
      state.currentQuestionIndex = 0;
      state.lastResult = null;
      state.isSubmitting = false;
      state.view = "exam";
      if (state.currentExam.tabSwitchCount >= examSettings.tabSwitchLimit) {
        state.currentExam.disqualified = true;
        state.currentExam.disqualificationReason = `탭 전환 ${examSettings.tabSwitchLimit}회 이상`;
        submitExam(true, true, `재접속 전 이탈 누적 ${state.currentExam.tabSwitchCount}회로 자동 제출 및 실격`);
      } else {
        renderExamScreen();
        startTimer();
      }
      return;
    }

    state.lastResult = null;
    state.view = "candidate";
    render();
    return;
  }

  state.loginError = "등록된 응시자 정보와 일치하지 않습니다. 소속과 성명을 다시 확인하세요.";
  renderLogin();
}
