"use strict";

// 순수 유틸리티 함수 모음 – 어떤 모듈에서도 참조 가능

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(iso));
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function getCurrentQuarter(date = new Date()) {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function previousQuarter() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return q === 1 ? `${now.getFullYear() - 1}-Q4` : `${now.getFullYear()}-Q${q - 1}`;
}

// 시드 기반 유사 난수 생성기 (mulberry32)
function _seededRng(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// examSeed: 시험 시작 시 설정 (startExam에서 세팅)
let _examSeed = 0;
let _examRng = null;

function _strHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return h >>> 0;
}

function shuffleArray(array) {
  const copied = [...array];
  const rng = _examRng || (_examSeed ? _seededRng(_examSeed) : Math.random.bind(Math));
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function nextId(array, key) {
  return array.length ? Math.max(...array.map(item => Number(item[key]) || 0)) + 1 : 1;
}

function optionHtml(value, selected, label = value) {
  return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

// data.js 의 데이터에 의존하는 도우미 함수
function getCandidateUsers() {
  return users.filter(user => user.role === "candidate");
}

function getDepartments() {
  return [...new Set(getCandidateUsers().map(user => user.department))].sort();
}

function getCategories() {
  return [...new Set(questionBank.map(q => q.category))].sort();
}

function getLatestResult(employeeId) {
  return examResults
    .filter(result => result.employeeId === employeeId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
}

function hasAttemptedThisQuarter(employeeId, quarter = getCurrentQuarter()) {
  return examResults.some(result => result.employeeId === employeeId && result.quarter === quarter);
}

function getQuotaWarnings() {
  return Object.entries(examSettings.categoryQuota)
    .filter(([category, count]) => questionBank.filter(q => q.active && q.category === category).length < Number(count))
    .map(([category, count]) =>
      `${category} 필요 ${count}문항 / 보유 ${questionBank.filter(q => q.active && q.category === category).length}문항`
    );
}

function getActiveExamKey(employeeId, quarter = getCurrentQuarter()) {
  return `${employeeId}__${quarter}`;
}

function getActiveExamRecord(employeeId, quarter = getCurrentQuarter()) {
  const key = getActiveExamKey(employeeId, quarter);
  return activeExams.find(item => item.key === key && item.status === "in_progress");
}

function upsertActiveExamRecord(exam, extra = {}) {
  if (!exam) return;
  const key = getActiveExamKey(exam.employeeId, exam.quarter);
  const record = {
    key,
    status: "in_progress",
    updatedAt: new Date().toISOString(),
    remainingSeconds: state.remainingSeconds,
    exam: JSON.parse(JSON.stringify(exam)),
    ...extra
  };
  const index = activeExams.findIndex(item => item.key === key);
  if (index >= 0) activeExams[index] = { ...activeExams[index], ...record };
  else activeExams.push(record);
}

function clearActiveExamRecord(employeeId, quarter = getCurrentQuarter()) {
  const key = getActiveExamKey(employeeId, quarter);
  activeExams = activeExams.filter(item => item.key !== key);
}

function persistCurrentExam(saveRemote = true) {
  if (!state.currentExam) return;
  upsertActiveExamRecord(state.currentExam);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ users, questionBank, examSettings, examResults, activityLogs, activeExams, managedAffiliations }));
  } catch (error) {
    console.warn("진행 중 시험 저장에 실패했습니다.", error);
  }
  if (saveRemote) queueRemoteSave();
}

function mergeLocalActiveExams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const localData = JSON.parse(raw);
    if (!Array.isArray(localData.activeExams)) return;
    localData.activeExams.forEach(localRecord => {
      if (!localRecord?.key || localRecord.status !== "in_progress") return;
      const remoteIndex = activeExams.findIndex(item => item.key === localRecord.key);
      const remoteRecord = remoteIndex >= 0 ? activeExams[remoteIndex] : null;
      const localTime = new Date(localRecord.updatedAt || 0).getTime();
      const remoteTime = new Date(remoteRecord?.updatedAt || 0).getTime();
      if (!remoteRecord || localTime >= remoteTime) {
        if (remoteIndex >= 0) activeExams[remoteIndex] = localRecord;
        else activeExams.push(localRecord);
      }
    });
  } catch (error) {
    console.warn("진행 중 시험 로컬 병합에 실패했습니다.", error);
  }
}


const STORAGE_KEY = "hniruja_exam_platform_v2";

function isAppsScriptRuntime() {
  return typeof google !== "undefined" && google.script && google.script.run;
}

function getExternalApiBase() {
  if (isAppsScriptRuntime()) return "";
  if (window.HNIRUJA_API_BASE) return String(window.HNIRUJA_API_BASE);
  if (location.protocol === "http:" || location.protocol === "https:") return "/api/gas";
  return "";
}

function isExternalApiRuntime() {
  return Boolean(getExternalApiBase());
}

async function callExternalApi(action, payload = {}) {
  const base = getExternalApiBase();
  if (!base) throw new Error("외부 API 주소가 설정되지 않았습니다.");
  const response = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload })
  });
  if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
  const data = await response.json();
  if (data && data.ok === false) throw new Error(data.message || "API 처리 실패");
  return data && Object.prototype.hasOwnProperty.call(data, "data") ? data.data : data;
}

function applyRemoteData(data) {
  if (data && Array.isArray(data.users)) users = data.users;
  if (data && Array.isArray(data.questionBank)) questionBank = data.questionBank;
  if (data && data.examSettings) examSettings = { ...examSettings, ...data.examSettings };
  if (data && Array.isArray(data.examResults)) examResults = data.examResults;
  if (data && Array.isArray(data.activityLogs)) activityLogs = data.activityLogs;
  if (data && Array.isArray(data.activeExams)) activeExams = data.activeExams;
  if (data && Array.isArray(data.managedAffiliations)) managedAffiliations = data.managedAffiliations;
  mergeLocalActiveExams();
}

function loadRemoteData(done) {
  if (isAppsScriptRuntime()) {
    google.script.run
      .withSuccessHandler(data => {
        try { applyRemoteData(data); done(true); }
        catch (error) { console.warn("스프레드시트 데이터 복원에 실패했습니다.", error); done(false); }
      })
      .withFailureHandler(error => {
        console.warn("스프레드시트 연결에 실패했습니다. 브라우저 저장소로 전환합니다.", error);
        loadPersistentData();
        done(false);
      })
      .getAppData();
    return;
  }

  if (isExternalApiRuntime()) {
    callExternalApi("getAppData")
      .then(data => { applyRemoteData(data); done(true); })
      .catch(error => {
        console.warn("외부 API 연결에 실패했습니다. 브라우저 저장소로 전환합니다.", error);
        loadPersistentData();
        done(false);
      });
    return;
  }

  done(false);
}

function queueRemoteSave() {
  const snapshot = { users, questionBank, examSettings, examResults, activityLogs, activeExams, managedAffiliations };
  if (isAppsScriptRuntime()) {
    google.script.run
      .withFailureHandler(error => console.warn("스프레드시트 저장에 실패했습니다.", error))
      .saveAppData(snapshot);
    return;
  }
  if (isExternalApiRuntime()) {
    callExternalApi("saveAppData", snapshot)
      .catch(error => console.warn("외부 API 저장에 실패했습니다.", error));
  }
}

function appendResultToSheet(result, log) {
  if (isAppsScriptRuntime()) {
    google.script.run
      .withFailureHandler(error => console.warn("응시 결과 스프레드시트 기록에 실패했습니다.", error))
      .appendExamSubmission(result, log);
    return;
  }
  if (isExternalApiRuntime()) {
    callExternalApi("appendExamSubmission", { result, log })
      .catch(error => console.warn("응시 결과 외부 API 기록에 실패했습니다.", error));
  }
}

function affiliationOptions(selected = "") {
  return managedAffiliations.map(dep => optionHtml(dep, selected)).join("");
}

function savePersistentData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ users, questionBank, examSettings, examResults, activityLogs, activeExams, managedAffiliations }));
  } catch (error) {
    console.warn("저장소 기록에 실패했습니다.", error);
  }
  queueRemoteSave();
}

function loadPersistentData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (Array.isArray(data.users)) users = data.users;
    if (Array.isArray(data.questionBank)) questionBank = data.questionBank;
    if (data.examSettings) examSettings = { ...examSettings, ...data.examSettings };
    if (Array.isArray(data.examResults)) examResults = data.examResults;
    if (Array.isArray(data.activityLogs)) activityLogs = data.activityLogs;
    if (Array.isArray(data.activeExams)) activeExams = data.activeExams;
    if (Array.isArray(data.managedAffiliations)) managedAffiliations = data.managedAffiliations;
    return true;
  } catch (error) {
    console.warn("저장소 복원에 실패했습니다.", error);
    return false;
  }
}

function formatDateOnly(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getCertificationValidity(result) {
  if (!result || !result.passed || result.disqualified) return null;
  const validFrom = result.validFrom || addDays(new Date(result.submittedAt), 1).toISOString();
  const until = result.validUntil ? new Date(result.validUntil) : addDays(new Date(validFrom), 365);
  if (!result.validUntil) until.setDate(until.getDate() - 1);
  return { validFrom, validUntil: result.validUntil || until.toISOString() };
}

function getResultComment(result) {
  if (result.disqualified) return "응시하느라 고생 많으셨습니다. 실격 처리되어 다음 분기 안전담당자 시험에 다시 응시바랍니다.";
  if (result.passed) return "응시하느라 고생 많으셨습니다. 앞으로 현장안전을 위해 힘써주시기 바랍니다.";
  return "응시하느라 고생 많으셨습니다. 다음 분기 안전담당자 시험에 다시 응시바랍니다.";
}
