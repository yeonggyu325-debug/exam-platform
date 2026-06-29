"use strict";

// 앱 전역 상태 + 라우터
// 모든 상태 변경은 이 파일의 state 객체를 통해 이루어집니다.

const state = {
  currentUser: null,
  view: "login",            // "login" | "candidate" | "exam" | "result" | "admin"
  adminSection: "dashboard",
  theme: "light",
  loginError: "",
  currentExam: null,
  currentQuestionIndex: 0,
  timerId: null,
  remainingSeconds: 0,
  lastResult: null,
  isSubmitting: false,
  examIntroReady: false,
  examIntroRemaining: 10,
  introTimerId: null,
  introRaf: null,
  _tabHiddenAt: null,
  filters: {
    userSearch: "",
    userDepartment: "전체",
    userStatus: "전체",
    resultDepartment: "전체",
    resultQuarter: "전체",
    resultSort: "dateDesc",
    resultDisqualified: "전체"
  }
};

const app       = document.getElementById("app");
const modalRoot = document.getElementById("modalRoot");

function render() {
  document.documentElement.dataset.theme = state.theme;
  if (state.view === "login")     renderLogin();
  if (state.view === "candidate") renderCandidateDashboard();
  if (state.view === "exam")      renderExamScreen();
  if (state.view === "result")    renderResultScreen();
  if (state.view === "admin")     renderAdminDashboard();
}
