"use strict";

// 책임: 응시자 대시보드, 시험 진행 전 과정, 타이머, 탭 전환 감지, 채점, 결과 화면

/* ─── 응시자 대시보드 ─────────────────────────── */
function renderCandidateDashboard() {
  clearTimer();
  removeExamGuards();
  clearIntroCountdown();
  const user            = state.currentUser;
  const quarter         = getCurrentQuarter();
  const attemptedResult = examResults
    .filter(r => r.employeeId === user.employeeId && r.quarter === quarter)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
  if (attemptedResult) {
    state.lastResult = attemptedResult;
    state.view = "result";
    renderResultScreen();
    return;
  }
  const shortageWarnings = getQuotaWarnings();

  app.innerHTML = `
    ${buildHeader()}
    <div class="ready-layout">

      <div class="ready-body" id="readyBody">

        <div class="v2-profile-chips">
          <span class="v2-chip"><span class="v2-chip-label">분기</span>${escapeHtml(quarter)}</span>
          <span class="v2-chip"><span class="v2-chip-label">소속</span>${escapeHtml(user.department)}</span>
          <span class="v2-chip"><span class="v2-chip-label">성명</span>${escapeHtml(user.name)}</span>
        </div>

        <section class="ready-card" aria-labelledby="examReadyTitle">

          <div class="ready-card-header">
            <h2 id="examReadyTitle">응시 전 필수 안내</h2>
            <p>아래 안내사항을 확인한 후 시험을 시작해 주세요.</p>
          </div>

          <div class="exam-info-row">
            <div class="exam-info-item">
              <span class="exam-info-label">문항 수</span>
              <span class="exam-info-val">${examSettings.totalQuestions}<em>문항</em></span>
            </div>
            <div class="exam-info-item">
              <span class="exam-info-label">시험 시간</span>
              <span class="exam-info-val">${examSettings.timeLimitMinutes}<em>분</em></span>
            </div>
            <div class="exam-info-item">
              <span class="exam-info-label">합격 기준</span>
              <span class="exam-info-val">${examSettings.passingScore}<em>점</em></span>
            </div>
          </div>

          <ol class="ready-rules">
            <li>시험 시작 전 네트워크 연결 상태(Wi-Fi 또는 데이터)와 배터리 충전 상태를 반드시 확인하여 주십시오.</li>
            <li>응시 중 전화 수신, 알림, 앱 전환 등이 발생하지 않도록 방해 금지 모드 설정 후 응시하는 것을 권장드립니다.</li>
            <li>각 문항의 보기 중 가장 적절한 답안 1개를 선택한 후 다음 문항으로 진행하여 주십시오.</li>
            <li>모든 문항에 응답하여야 최종 제출이 가능하며, 제출 후에는 답안을 수정할 수 없으므로 제출 전 반드시 확인하여 주십시오.</li>
            <li>응시 시간이 초과될 경우 답안이 자동으로 제출되며, 응답이 완료된 문항까지만 채점됩니다. 시간 관리에 유의하여 주십시오.</li>
            <li class="rule-warn">응시 중 화면 전환은 자동으로 기록되며, 3회 이상 이탈 시 부정행위로 간주되어 실격 처리될 수 있습니다.</li>
          </ol>

          ${shortageWarnings.length ? `<div class="notice danger" style="margin:0 0 4px">${shortageWarnings.map(escapeHtml).join('<br>')}</div>` : ''}
        </section>
      </div>

      <div class="ready-footer">
        <label class="ready-agree" id="agreeLabel">
          <input type="checkbox" id="agreeCheck" onchange="onAgreeChange()" />
          <span class="ready-agree-box"></span>
          <span class="ready-agree-text">위 안내사항을 모두 확인하였으며, 시험에 응시하겠습니다.</span>
        </label>

        <div class="ready-gauge-wrap" id="countdownDots">
          <div class="ready-gauge-track">
            <div class="ready-gauge-fill" id="gaugeFill" style="width:0%"></div>
          </div>
        </div>

        <button
          id="startExamBtn"
          class="btn primary ready-start-btn"
          type="button"
          onclick="startExam()"
          disabled
        >시험 시작</button>
      </div>

    </div>
  `;

  if (!shortageWarnings.length) startIntroCountdown();
}

function onAgreeChange() {
  // 체크 상태는 카운트다운 완료 후 버튼 활성화에 반영됨
  const btn = document.getElementById('startExamBtn');
  const done = state.examIntroReady;
  const checked = document.getElementById('agreeCheck')?.checked;
  if (btn) btn.disabled = !(done && checked);
}
function clearIntroCountdown() {
  if (state.introTimerId) {
    clearTimeout(state.introTimerId);
    state.introTimerId = null;
  }
}

function startIntroCountdown() {
  state.examIntroReady = false;
  const duration = 10000; // 10초
  const startTime = performance.now();

  const tick = (now) => {
    const elapsed = now - startTime;
    const pct = Math.min((elapsed / duration) * 100, 100);
    const fill = document.getElementById('gaugeFill');
    if (fill) fill.style.width = pct + '%';

    if (elapsed < duration) {
      state.introRaf = requestAnimationFrame(tick);
    } else {
      state.examIntroReady = true;
      const checked = document.getElementById('agreeCheck')?.checked;
      const btn = document.getElementById('startExamBtn');
      if (btn) btn.disabled = !checked;
    }
  };

  state.introRaf = requestAnimationFrame(tick);
}

/* ─── 시험 시작 ───────────────────────────────── */
function startExam() {
  if (!state.examIntroReady) {
    alert("안내문을 10초 이상 확인한 뒤 응시할 수 있습니다.");
    return;
  }
  clearIntroCountdown();
  const user = state.currentUser;
  if (hasAttemptedThisQuarter(user.employeeId)) {
    alert("이번 분기에는 이미 응시 완료했습니다.");
    renderCandidateDashboard();
    return;
  }
  if (getQuotaWarnings().length > 0) {
    alert("문제은행 수량이 부족하여 시험을 시작할 수 없습니다. 관리자에게 문의하세요.");
    return;
  }

  // 응시자와 분기 기준 시드를 먼저 설정한 뒤 문제를 생성합니다.
  // 진행 중 시험은 저장되어 새로고침 또는 재접속 시 이어서 복구됩니다.
  _examSeed = _strHash(user.employeeId + getCurrentQuarter());
  _examRng = _seededRng(_examSeed);
  const questions = generateExamQuestions();
  _examRng = null;

  state.currentExam = {
    employeeId: user.employeeId,
    quarter: getCurrentQuarter(),
    startedAt: new Date().toISOString(),
    questions,
    answers: Array(questions.length).fill(null),
    tabSwitchCount: 0,
    warningLogs: [],
    disqualified: false,
    disqualificationReason: "",
    lastViolationAt: 0
  };
  state.currentQuestionIndex = 0;
  state.remainingSeconds     = examSettings.timeLimitMinutes * 60;
  state.isSubmitting         = false;
  state.view                 = "exam";
  persistCurrentExam();
  renderExamScreen();
  startTimer();
}

function generateExamQuestions() {
  let selected = [];
  Object.entries(examSettings.categoryQuota).forEach(([category, count]) => {
    const pool   = questionBank.filter(q => q.active && q.category === category);
    const picked = (examSettings.randomizeQuestions ? shuffleArray(pool) : [...pool]).slice(0, Number(count));
    selected.push(...picked);
  });
  if (examSettings.randomizeQuestions) selected = shuffleArray(selected);

  return selected.map(question => {
    const indexedOptions     = question.options.map((text, originalIndex) => ({ text, originalIndex }));
    const displayOptions     = examSettings.randomizeOptions ? shuffleArray(indexedOptions) : indexedOptions;
    const correctDisplayIndex = displayOptions.findIndex(option => option.originalIndex === question.answerIndex);
    return {
      questionId: question.id,
      category: question.category,
      difficulty: question.difficulty,
      text: question.text,
      options: displayOptions.map(option => option.text),
      correctDisplayIndex
    };
  });
}

/* ─── 타이머 + 감시 ───────────────────────────── */
function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  clearTimer();
  addExamGuards();
  state.timerId = setInterval(() => {
    state.remainingSeconds -= 1;
    if (state.remainingSeconds % 5 === 0) persistCurrentExam(false);
    const timer = document.getElementById("remainingTime");
    if (timer) timer.textContent = formatRemainingTime(state.remainingSeconds);
    if (state.remainingSeconds <= 0) {
      clearTimer();
      submitExam(true, false, "시간 종료로 자동 제출");
    }
  }, 1000);
}

function addExamGuards() {
  window.onbeforeunload = () => "시험이 진행 중입니다. 페이지를 이탈하면 응시 내용이 유실될 수 있습니다.";
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("pagehide", handlePageHide);
}

function removeExamGuards() {
  window.onbeforeunload = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("pagehide", handlePageHide);
}

function handlePageHide() {
  registerExamExitViolation("pagehide-exit");
}

function handleVisibilityChange() {
  if (document.hidden) {
    // 이탈 시각 기록
    state._tabHiddenAt = Date.now();
    handleTabSwitchViolation("visibilitychange");
  } else {
    // 복귀 시 이탈 동안 경과시간 차감
    if (state._tabHiddenAt && state.view === "exam" && state.currentExam && !state.isSubmitting) {
      const elapsed = Math.floor((Date.now() - state._tabHiddenAt) / 1000);
      state.remainingSeconds = Math.max(0, state.remainingSeconds - elapsed);
      const timer = document.getElementById("remainingTime");
      if (timer) timer.textContent = formatRemainingTime(state.remainingSeconds);
      if (state.remainingSeconds <= 0) {
        clearTimer();
        submitExam(true, false, "시간 종료로 자동 제출");
        return;
      }
      persistCurrentExam(false);
    }
    state._tabHiddenAt = null;
  }
}
function handleWindowBlur() {
  setTimeout(() => {
    if (document.hidden) handleTabSwitchViolation("blur-confirmed");
  }, 300);
}

function registerExamExitViolation(source = "exit") {
  if (state.view !== "exam" || !state.currentExam || state.isSubmitting) return;
  const now = Date.now();
  if (now - state.currentExam.lastViolationAt < 900) {
    persistCurrentExam(false);
    return;
  }
  state.currentExam.lastViolationAt = now;
  state.currentExam.tabSwitchCount += 1;
  const count = state.currentExam.tabSwitchCount;
  const createdAt = new Date().toISOString();
  const message = count >= examSettings.tabSwitchLimit
    ? `페이지 이탈 누적 ${count}회: 재접속 시 자동 제출 및 실격 처리됩니다.`
    : `페이지 이탈 ${count}회 감지: 재접속 후 누적됩니다.`;
  state.currentExam.warningLogs.push({ at: createdAt, source, message });
  activityLogs.push({
    logId: nextId(activityLogs, "logId"),
    employeeId: state.currentUser.employeeId,
    department: state.currentUser.department,
    name: state.currentUser.name,
    type: count >= examSettings.tabSwitchLimit ? "DISQUALIFIED" : "WARNING",
    message, tabSwitchCount: count, createdAt
  });
  if (count >= examSettings.tabSwitchLimit) {
    state.currentExam.disqualified = true;
    state.currentExam.disqualificationReason = `탭 전환 ${examSettings.tabSwitchLimit}회 이상`;
  }
  persistCurrentExam(false);
}

function handleTabSwitchViolation(source = "unknown") {
  if (state.view !== "exam" || !state.currentExam || state.isSubmitting) return;

  const now = Date.now();
  if (now - state.currentExam.lastViolationAt < 900) return;
  state.currentExam.lastViolationAt = now;

  state.currentExam.tabSwitchCount += 1;
  const count = state.currentExam.tabSwitchCount;
  let message = "";
  if      (count === 1) message = "탭 전환 또는 창 이탈 1회 감지: 경고입니다.";
  else if (count === 2) message = "탭 전환 또는 창 이탈 2회 감지: 마지막 경고입니다.";
  else                  message = `탭 전환 또는 창 이탈 ${count}회 감지: 자동 제출 및 실격 처리됩니다.`;

  const createdAt = new Date().toISOString();
  state.currentExam.warningLogs.push({ at: createdAt, source, message });
  activityLogs.push({
    logId: nextId(activityLogs, "logId"),
    employeeId: state.currentUser.employeeId,
    department: state.currentUser.department,
    name: state.currentUser.name,
    type: count >= examSettings.tabSwitchLimit ? "DISQUALIFIED" : "WARNING",
    message, tabSwitchCount: count, createdAt
  });

  persistCurrentExam();

  const warnBar = document.getElementById("examWarningBar");
  if (warnBar) {
    warnBar.innerHTML = `화면 전환 : <strong id="tabSwitchCount">${count}/${examSettings.tabSwitchLimit}</strong>`;
    warnBar.className = count >= examSettings.tabSwitchLimit ? "v2-exam-warn danger" : "v2-exam-warn";
  }

  if (count >= examSettings.tabSwitchLimit) {
    state.currentExam.disqualified            = true;
    state.currentExam.disqualificationReason  = `탭 전환 ${examSettings.tabSwitchLimit}회 이상`;
    submitExam(true, true, `탭 전환 ${examSettings.tabSwitchLimit}회 이상으로 자동 제출 및 실격`);
  }
}

function formatRemainingTime(seconds) {
  const safe = Math.max(0, seconds);
  const m    = Math.floor(safe / 60);
  const s    = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ─── 시험 화면 렌더 ─────────────────────────── */
function renderExamScreen() {
  const exam = state.currentExam;
  if (!exam) { state.view = "candidate"; renderCandidateDashboard(); return; }

  const answeredCount   = exam.answers.filter(a => a !== null).length;
  const progressPercent = Math.round((answeredCount / exam.questions.length) * 100);
  const unanswered      = exam.questions.length - answeredCount;

  const questionsHtml = exam.questions.map((question, index) => {
    const answered = exam.answers[index] !== null;
    return `
    <section class="v2-question-card ${answered ? "v2-question-answered" : ""}" id="q${index}" aria-labelledby="qt${index}">
      <h3 id="qt${index}" class="v2-question-text"><span class="v2-question-num">${index + 1}.</span> ${escapeHtml(question.text)}</h3>
      <fieldset style="border:0;padding:0;margin:0">
        <legend class="sr-only">문항 ${index + 1} 답안 선택</legend>
        ${question.options.map((option, optionIndex) => {
          const selected = exam.answers[index] === optionIndex;
          return `
          <label class="v2-option ${selected ? "v2-option-selected" : ""}">
            <input
              type="radio" name="answer_${index}" value="${optionIndex}"
              ${selected ? "checked" : ""}
              onclick="selectAnswerLock(${index}, ${optionIndex})"
            />
            <span class="v2-option-no">${optionIndex + 1}</span>
            <span class="v2-option-text">${escapeHtml(option)}</span>
          </label>`;
        }).join("")}
      </fieldset>
    </section>`;
  }).join("");

  app.innerHTML = `
    ${buildHeader()}
    <div class="v2-exam-bar" id="examStickyBar">
      <div class="v2-exam-bar-inner">
        <div class="v2-exam-bar-left">
          <span id="examWarningBar" class="v2-exam-warn">화면 전환 : <strong id="tabSwitchCount">${exam.tabSwitchCount}/${examSettings.tabSwitchLimit}</strong></span>
        </div>
        <div class="v2-exam-bar-center">
          <span class="v2-exam-timer" id="remainingTime">${formatRemainingTime(state.remainingSeconds)}</span>
        </div>
        <div class="v2-exam-bar-right">
          <span class="v2-exam-progress-text">${answeredCount}/${exam.questions.length}</span>
          <button class="btn primary small v2-submit-btn" id="topSubmitBtn" type="button" onclick="openSubmitConfirm()" ${answeredCount < exam.questions.length ? "disabled" : ""}>제출</button>
        </div>
      </div>
      <div class="v2-exam-progress-track">
        <div class="v2-exam-progress-fill" style="width:${progressPercent}%"></div>
      </div>
    </div>

    <main class="container v2-exam-container">
      ${questionsHtml}
      <div class="v2-submit-bottom">
        <button class="btn primary v2-submit-final-btn" id="bottomSubmitBtn" type="button" onclick="openSubmitConfirm()" ${unanswered > 0 ? "disabled" : ""}>${unanswered > 0 ? `미응답 ${unanswered}문항 남음 · 최종 제출` : "최종 제출"}</button>
      </div>
    </main>
  `;
}


function selectAnswerLock(questionIndex, optionIndex) {
  if (!state.currentExam) return;
  // 이미 같은 답이 선택된 경우 → 선택 해제(토글)
  if (state.currentExam.answers[questionIndex] === optionIndex) {
    state.currentExam.answers[questionIndex] = null;
    persistCurrentExam();
    const qSection = document.getElementById(`q${questionIndex}`);
    if (qSection) {
      qSection.querySelectorAll('.v2-option').forEach(opt => {
        opt.classList.remove('v2-option-selected');
        opt.setAttribute('aria-checked', 'false');
      });
      // 답변완료 클래스 제거
      qSection.classList.remove('v2-question-answered');
    }
    updateSubmitButtonState();
    return;
  }
  selectAnswerAll(questionIndex, optionIndex);
}
function selectAnswerAll(questionIndex, optionIndex) {
  if (!state.currentExam) return;
  state.currentExam.answers[questionIndex] = optionIndex;
  persistCurrentExam();

  const qSection = document.getElementById(`q${questionIndex}`);
  if (qSection) {
    qSection.querySelectorAll('.v2-option').forEach(opt => opt.classList.remove('v2-option-selected'));
    const labels = qSection.querySelectorAll('.v2-option');
    if (labels[optionIndex]) labels[optionIndex].classList.add('v2-option-selected');
    qSection.classList.add('v2-question-answered');
  }

  const total = state.currentExam.questions.length;
  const answeredCount = state.currentExam.answers.filter(a => a !== null).length;
  const unanswered = total - answeredCount;
  const progressPercent = Math.round((answeredCount / total) * 100);

  const fill = document.querySelector('.v2-exam-progress-fill');
  if (fill) fill.style.width = progressPercent + '%';

  const statEl = document.querySelector('.v2-exam-progress-text');
  if (statEl) statEl.textContent = answeredCount + '/' + total;

  const finalBtn = document.getElementById('bottomSubmitBtn');
  if (finalBtn) finalBtn.textContent = unanswered > 0 ? `미응답 ${unanswered}문항 남음 · 최종 제출` : '최종 제출';

  const allAnswered = state.currentExam.answers.every(a => a !== null);
  const topBtn = document.getElementById('topSubmitBtn');
  if (topBtn) topBtn.disabled = !allAnswered;
  if (finalBtn) finalBtn.disabled = !allAnswered;
}

/* ─── 제출 확인 모달 ─────────────────────────── */
function openSubmitConfirm() {
  if (!state.currentExam) return;
  const unanswered = state.currentExam.answers.filter(a => a === null).length;
  if (unanswered > 0) return;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submitModalTitle">
      <section class="modal sm">
        <h2 id="submitModalTitle">시험을 제출하시겠습니까?</h2>
        <div class="notice warning">제출 후 문제와 정답, 해설은 응시자에게 공개되지 않으며 재응시는 제한됩니다.</div>
        <div class="modal-actions">
          <button class="btn" type="button" onclick="closeModal()">계속 응시</button>
          <button class="btn primary" type="button" onclick="submitExam(false, false, '시험 제출 완료')">제출</button>
        </div>
      </section>
    </div>
  `;
}

function closeModal() { modalRoot.innerHTML = ""; }

/* ─── 채점 & 제출 ─────────────────────────────── */
function calculateScore(exam) {
  const total        = exam.questions.length;
  const correctCount = exam.questions.reduce((sum, question, index) =>
    sum + (exam.answers[index] === question.correctDisplayIndex ? 1 : 0), 0);
  const totalScore       = correctCount * examSettings.pointsPerQuestion;
  const maxScore         = total * examSettings.pointsPerQuestion;
  const percentageScore  = Math.round((totalScore / maxScore) * 100);
  const disqualified     = Boolean(exam.disqualified);
  return {
    correctCount, totalCount: total, totalScore, maxScore, percentageScore,
    score: percentageScore,
    passed: !disqualified && percentageScore >= examSettings.passingScore,
    disqualified
  };

  // 합격 시 폭죽 애니메이션
  if (passed) {
    requestAnimationFrame(() => launchConfetti());
  }
}

function submitExam(isAutoSubmit = false, forceDisqualified = false, submitMessage = "시험 제출 완료") {
  if (!state.currentExam || state.isSubmitting) return;
  state.isSubmitting = true;

  closeModal();
  clearTimer();
  removeExamGuards();

  if (hasAttemptedThisQuarter(state.currentUser.employeeId, state.currentExam.quarter)) {
    alert("이미 제출된 응시 기록이 있습니다.");
    clearActiveExamRecord(state.currentUser.employeeId, state.currentExam.quarter);
    state.currentExam = null;
    state.view        = "candidate";
    state.isSubmitting = false;
    renderCandidateDashboard();
    return;
  }

  if (forceDisqualified) {
    state.currentExam.disqualified           = true;
    state.currentExam.disqualificationReason = state.currentExam.disqualificationReason || `탭 전환 ${examSettings.tabSwitchLimit}회 이상`;
  }

  const scoring = calculateScore(state.currentExam);
  const result  = {
    resultId: nextId(examResults, "resultId"),
    employeeId: state.currentUser.employeeId,
    department: state.currentUser.department,
    name: state.currentUser.name,
    quarter: state.currentExam.quarter,
    totalScore: scoring.totalScore,
    maxScore: scoring.maxScore,
    percentageScore: scoring.percentageScore,
    score: scoring.score,
    correctCount: scoring.correctCount,
    totalCount: scoring.totalCount,
    passed: scoring.passed,
    disqualified: scoring.disqualified,
    disqualificationReason: scoring.disqualified
      ? (state.currentExam.disqualificationReason || "운영 정책 위반") : "",
    tabSwitchCount: state.currentExam.tabSwitchCount,
    startedAt: state.currentExam.startedAt || null,
    submittedAt: new Date().toISOString()
  };

  if (result.passed && !result.disqualified) {
    const valid = getCertificationValidity(result);
    result.validFrom = valid.validFrom;
    result.validUntil = valid.validUntil;
  }

  const submitLog = {
    logId: nextId(activityLogs, "logId"),
    employeeId: state.currentUser.employeeId,
    department: state.currentUser.department,
    name: state.currentUser.name,
    type: result.disqualified ? "DISQUALIFIED_SUBMIT" : (isAutoSubmit ? "AUTO_SUBMIT" : "SUBMIT"),
    message: submitMessage,
    tabSwitchCount: result.tabSwitchCount,
    createdAt: result.submittedAt
  };

  examResults.push(result);
  activityLogs.push(submitLog);
  clearActiveExamRecord(state.currentUser.employeeId, state.currentExam.quarter);

  savePersistentData();
  appendResultToSheet(result, submitLog);

  state.lastResult   = result;
  state.currentExam  = null;
  state.view         = "result";
  state.isSubmitting = false;
  renderResultScreen();
}

/* ─── 결과 화면 ───────────────────────────────── */
function renderResultScreen() {
  clearTimer();
  removeExamGuards();
  clearIntroCountdown();
  const result = state.lastResult || getLatestResult(state.currentUser.employeeId);
  if (!result) {
    state.view = "candidate";
    renderCandidateDashboard();
    return;
  }
  const passed   = result.passed && !result.disqualified;
  const label    = result.disqualified ? "실격" : (passed ? "합격" : "불합격");
  const cls      = passed ? "success" : "danger";
  const emoji    = passed ? "🎉" : (result.disqualified ? "🚫" : "😔");
  const scoreBar = Math.min(100, result.percentageScore);
  const wrong    = result.totalCount - result.correctCount;

  app.innerHTML = `
    ${buildHeader()}
    <main class="container v2-container">
      <section class="v2-result-card ${cls}" aria-labelledby="resultTitle">

        <div class="v2-result-top">
          <div class="v2-result-emoji" aria-hidden="true">${emoji}</div>
          <h2 id="resultTitle" class="v2-result-label ${cls}">${label}</h2>
          <p class="v2-result-sub">응시하느라 고생하셨습니다. 감사합니다.</p>
          ${result.disqualified ? `<p class="v2-result-disq">실격 사유: ${escapeHtml(result.disqualificationReason)}</p>` : ""}
        </div>

        <!-- 점수 게이지 -->
        <div class="v2-score-gauge-wrap" aria-label="점수 ${result.percentageScore}점">
          <div class="v2-score-num ${cls}">${result.percentageScore}<span class="v2-score-unit">점</span></div>
          <div class="v2-score-gauge-outer">
            <div class="v2-score-gauge-track">
              <div class="v2-score-gauge-fill ${cls}" style="width:${scoreBar}%"></div>
            </div>

          </div>
        </div>

        <!-- 상세 스탯: 총문항(좌) / 정답(중) / 오답(우) -->
        <div class="v2-result-stats">
          <div class="v2-result-stat">
            <span class="v2-result-stat-key">총 문항</span>
            <span class="v2-result-stat-val neutral">${result.totalCount}</span>
          </div>
          <div class="v2-result-stat-div"></div>
          <div class="v2-result-stat">
            <span class="v2-result-stat-key">정답</span>
            <span class="v2-result-stat-val correct">${result.correctCount}</span>
          </div>
          <div class="v2-result-stat-div"></div>
          <div class="v2-result-stat">
            <span class="v2-result-stat-key">오답</span>
            <span class="v2-result-stat-val wrong">${wrong}</span>
          </div>
        </div>

      </section>
    </main>
  `;
}

function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.id = 'confettiCanvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#4f8ef7','#f7c948','#f74f4f','#4ff7a1','#c44ff7','#f7924f'];
  const particles = Array.from({length: 120}, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 60,
    r: 4 + Math.random() * 6,
    d: 2 + Math.random() * 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    tilt: Math.random() * 10 - 5,
    tiltAngle: 0,
    tiltAngleInc: 0.05 + Math.random() * 0.07,
    alpha: 1
  }));

  let frame = 0;
  const maxFrames = 180;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
      ctx.stroke();
      p.tiltAngle += p.tiltAngleInc;
      p.y += (Math.cos(p.d) + p.r / 10) * 1.4;
      p.x += Math.sin(frame / 20) * 1.2;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      if (frame > 80) p.alpha = Math.max(0, p.alpha - 0.012);
    });
    ctx.globalAlpha = 1;
    frame++;
    if (frame < maxFrames) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  draw();
}
