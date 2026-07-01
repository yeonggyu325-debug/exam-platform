// ── 안전담당자 자격인증제 · Google Apps Script Backend v4 ──────────────────
const SHEET_NAME     = "AppData";
const RESULTS_SHEET  = "응시결과";
const USERS_SHEET    = "응시자목록";
const SETTINGS_SHEET = "시험설정";

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground("#1f5fbf").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}


// ── 관리자 인증 (서버 측 검증) ──────────────────────────────────────────────
function adminLogin(payload) {
  // 환경변수처럼 관리: PropertiesService (Script Properties에서 ADMIN_PW 설정)
  const props = PropertiesService.getScriptProperties();
  const adminPw = props.getProperty("ADMIN_PW") || "";
  const adminId = props.getProperty("ADMIN_ID") || "ADM-0001";

  if (!adminPw) {
    // Script Properties 미설정 시 fallback 거부
    return { ok: false, message: "서버 관리자 설정이 완료되지 않았습니다." };
  }
  if (payload.password !== adminPw) {
    Utilities.sleep(500); // brute-force 지연
    return { ok: false, message: "관리자 비밀번호가 올바르지 않습니다." };
  }
  // 세션 토큰 발급 (단순 HMAC 대용: 시간+비밀키)
  const ts = Date.now();
  const token = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(
      String(ts),
      adminPw + "HNIRUJA_SALT"
    )
  );
  return { ok: true, token, ts, adminId };
}

// ── 토큰 검증 유틸 ──────────────────────────────────────────────────────────
function verifyAdminToken_(token, ts) {
  const props = PropertiesService.getScriptProperties();
  const adminPw = props.getProperty("ADMIN_PW") || "";
  if (!adminPw || !token || !ts) return false;
  const now = Date.now();
  if (now - Number(ts) > 8 * 60 * 60 * 1000) return false; // 8시간 만료
  const expected = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(String(ts), adminPw + "HNIRUJA_SALT")
  );
  return token === expected;
}


// ── 관리자 로그인 서버 검증 ────────────────────────────────────────────────────
// 비밀번호는 GAS 스크립트 속성에 저장 (Properties Service)
// 최초 설정: GAS 편집기에서 setAdminPassword("원하는비밀번호") 실행
function setAdminPassword(pw) {
  PropertiesService.getScriptProperties().setProperty("ADMIN_PW_HASH", _hashPw(pw));
  return { ok: true };
}

function adminLogin(payload) {
  try {
    const stored = PropertiesService.getScriptProperties().getProperty("ADMIN_PW_HASH");
    // 아직 setAdminPassword 실행 전이면 기본값(ehs1985) 허용
    const fallback = _hashPw("ehs1985");
    const hash = stored || fallback;
    if (!payload || !payload.password) return { ok: false, message: "비밀번호를 입력하세요." };
    const input = _hashPw(String(payload.password));
    if (input !== hash) return { ok: false, message: "비밀번호가 일치하지 않습니다." };
    // 로그인 성공 시 현재 앱 데이터도 함께 반환 (추가 loadRemoteData 호출 불필요 → 속도 최적화)
    const data = getAppData();
    return { ok: true, data };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// 단방향 해시 (Apps Script에서 SHA-256)
function _hashPw(pw) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pw,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ── 전체 데이터 읽기 ──────────────────────────────────────────────────────────
function getAppData() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreateSheet(ss, SHEET_NAME, []);
    const raw   = sheet.getRange("B1").getValue();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// ── 전체 데이터 저장 + 각 시트 동기화 ───────────────────────────────────────
function saveAppData(snapshot) {
  const lock = LockService.getScriptLock();
  try {
    // 동시 쓰기 충돌 방지: 최대 10초 대기 후 락 획득
    const gotLock = lock.tryLock(10000);
    if (!gotLock) {
      return { ok: false, message: "다른 사용자가 저장 중입니다. 잠시 후 재시도합니다.", retry: true };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 서버에 저장된 최신 데이터를 먼저 읽어 병합 (Last-Write-Wins 방지)
    let dataSheet = ss.getSheetByName(SHEET_NAME);
    if (!dataSheet) {
      dataSheet = ss.insertSheet(SHEET_NAME);
      dataSheet.getRange("A1").setValue("data");
    }
    const rawExisting = dataSheet.getRange("B1").getValue();
    let existing = {};
    try { existing = rawExisting ? JSON.parse(rawExisting) : {}; } catch (e) { existing = {}; }

    const merged = mergeAppData(existing, snapshot);

    dataSheet.getRange("B1").setValue(JSON.stringify(merged));

    // 무거운 시트 sync는 1분 내 트리거로 비동기 실행 (타임아웃 방지)
    scheduleSyncTrigger_();

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function resetCandidateRecordsBackend(payload) {
  const employeeId = payload && payload.employeeId;
  if (!employeeId) {
    return { ok: false, message: "employeeId가 없습니다." };
  }

  const lock = LockService.getScriptLock();

  try {
    const gotLock = lock.tryLock(10000);
    if (!gotLock) {
      return {
        ok: false,
        retry: true,
        message: "다른 사용자가 저장 중입니다. 잠시 후 다시 시도하세요."
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dataSheet = getOrCreateSheet(ss, SHEET_NAME, []);
    const raw = dataSheet.getRange("B1").getValue();

    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      data = {};
    }

    data.examResults = Array.isArray(data.examResults)
      ? data.examResults.filter(r => r.employeeId !== employeeId)
      : [];

    data.activityLogs = Array.isArray(data.activityLogs)
      ? data.activityLogs.filter(l => l.employeeId !== employeeId)
      : [];

    data.activeExams = Array.isArray(data.activeExams)
      ? data.activeExams.filter(a => {
          const key = a.key || "";
          const examEmployeeId = a.employeeId || a.exam?.employeeId || "";
          return examEmployeeId !== employeeId && !key.startsWith(employeeId + "__");
        })
      : [];

    dataSheet.getRange("B1").setValue(JSON.stringify(data));

    // 응시결과/로그 시트 반영은 지연 동기화
    scheduleSyncTrigger_();

    return {
      ok: true,
      data
    };

  } catch (e) {
    return {
      ok: false,
      message: e.message
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

// ── 시트 동기화 트리거 등록 (1분 내 1회, 중복 방지) ──────────────────────────
function scheduleSyncTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  const already = triggers.some(t => t.getHandlerFunction() === "runDeferredSheetSync");
  if (!already) {
    ScriptApp.newTrigger("runDeferredSheetSync")
      .timeBased().after(30000).create();
  }
}

function runDeferredSheetSync() {
  // 기존 이 트리거 삭제
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runDeferredSheetSync")
    .forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const raw = sheet.getRange("B1").getValue();
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch(e) { return; }

  if (Array.isArray(data.users))               syncUsersSheet(ss, data.users);
  if (data.examSettings)                        syncSettingsSheet(ss, data.examSettings);
  if (Array.isArray(data.examResults))          syncResultsSheet(ss, data.examResults);
  if (Array.isArray(data.questionBank))         syncQuestionBankSheet(ss, data.questionBank);
  if (Array.isArray(data.managedAffiliations))  syncAffiliationsSheet(ss, data.managedAffiliations);
}

// 동시 저장 시 데이터 손실 방지를 위한 병합 로직
// - 배열(id 기반 목록)은 id별로 최신 항목을 합침
// - examResults, activeExams, activityLogs는 누적/병합
// - questionBank, users, examSettings, managedAffiliations는 보낸 쪽이 최신 전체 목록이라고 가정(관리자 화면에서만 변경)
function mergeAppData(existing, incoming) {
  const merged = Object.assign({}, existing, incoming);

  // 응시 결과: employeeId+quarter 기준 최신 1건만 유지, 누적 병합
  merged.examResults = mergeById(
    existing.examResults || [],
    incoming.examResults || [],
    r => r.employeeId + "_" + r.quarter,
    r => new Date(r.submittedAt || 0).getTime()
  );

  // 활동 로그: logId 기준 합치고 최신 500개만 유지
  merged.activityLogs = mergeById(
    existing.activityLogs || [],
    incoming.activityLogs || [],
    l => l.logId,
    l => new Date(l.createdAt || 0).getTime()
  ).slice(-500);

  // 진행 중 시험: employeeId+quarter 기준 최신 updatedAt만 유지
merged.activeExams = mergeById(
  existing.activeExams || [],
  incoming.activeExams || [],
  e => e.key || ((e.employeeId || e.exam?.employeeId || "") + "__" + (e.quarter || e.exam?.quarter || "")),
  e => new Date(e.updatedAt || 0).getTime()
);

  return merged;
}

// key 함수로 두 배열을 합치고, 동일 key는 score가 더 큰(최신) 항목을 채택
function mergeById(arrA, arrB, keyFn, scoreFn) {
  const map = new Map();
  arrA.forEach(item => map.set(keyFn(item), item));
  arrB.forEach(item => {
    const k = keyFn(item);
    const prev = map.get(k);
    if (!prev || scoreFn(item) >= scoreFn(prev)) {
      map.set(k, item);
    }
  });
  return Array.from(map.values());
}

// ── 응시자목록 ────────────────────────────────────────────────────────────────
function syncUsersSheet(ss, users) {
  const sheet = getOrCreateSheet(ss, USERS_SHEET, ["사번(ID)", "소속", "성명", "역할"]);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();

  const candidates = users.filter(u => u.role === "candidate");
  if (!candidates.length) return;

  const rows = candidates.map(u => [u.employeeId||"", u.department||"", u.name||"", "응시자"]);
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  sheet.autoResizeColumns(1, 4);
}

// ── 시험설정 ──────────────────────────────────────────────────────────────────
function syncSettingsSheet(ss, s) {
  const sheet = getOrCreateSheet(ss, SETTINGS_SHEET, ["항목", "값"]);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();

  const rows = [
    ["총 문항 수",      s.totalQuestions],
    ["제한 시간(분)",   s.timeLimitMinutes],
    ["합격 기준(점)",   s.passingScore],
    ["문항당 배점",     s.pointsPerQuestion],
    ["문제 랜덤",       s.randomizeQuestions ? "예" : "아니오"],
    ["보기 랜덤",       s.randomizeOptions   ? "예" : "아니오"],
    ["탭전환 제한(회)", s.tabSwitchLimit],
  ];
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.autoResizeColumns(1, 2);
}

// ── 응시결과 (전체 재작성) ────────────────────────────────────────────────────
function syncResultsSheet(ss, results) {
  const headers = [
    "결과ID","소속","성명","분기","점수","정답수","총문항",
    "합격여부","실격여부","실격사유","탭전환","응시시작","제출일시","소요(분)"
  ];
  const sheet = getOrCreateSheet(ss, RESULTS_SHEET, headers);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!results.length) return;

  const rows = results.map(r => {
    let dur = "";
    if (r.startedAt && r.submittedAt)
      dur = Math.round((new Date(r.submittedAt) - new Date(r.startedAt)) / 60000) + "분";
    return [
      r.resultId||"", r.department||"", r.name||"", r.quarter||"",
      r.percentageScore??"", r.correctCount??"", r.totalCount??"",
      r.passed ? "합격" : "불합격",
      r.disqualified ? "실격" : "",
      r.disqualificationReason||"",
      r.tabSwitchCount??"", r.startedAt||"", r.submittedAt||"", dur
    ];
  });

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  rows.forEach((r, i) => {
    const color = r[8]==="실격" ? "#fff3e0" : r[7]==="합격" ? "#e8f5e9" : "#ffebee";
    sheet.getRange(i+2, 1, 1, headers.length).setBackground(color);
  });
  sheet.autoResizeColumns(1, headers.length);
}

// ── 문제은행 ──────────────────────────────────────────────────────────────────
function syncQuestionBankSheet(ss, questions) {
  const headers = [
    "문제ID","카테고리","난이도","활성화","문제",
    "보기1","보기2","보기3","보기4","정답번호(1~4)"
  ];
  let sheet = ss.getSheetByName("문제은행");
  if (!sheet) {
    sheet = ss.insertSheet("문제은행");
  }
  // 헤더 항상 재적용
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#1f5fbf").setFontColor("#ffffff").setFontWeight("bold");
  sheet.setFrozenRows(1);

  // 기존 데이터 삭제
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!questions || !questions.length) return;

  const rows = questions.map(q => [
    q.id||"", q.category||"", q.difficulty||"",
    q.active ? "활성" : "비활성",
    q.text||"",
    (q.options||[])[0]||"", (q.options||[])[1]||"",
    (q.options||[])[2]||"", (q.options||[])[3]||"",
    (q.answerIndex !== undefined && q.answerIndex !== null) ? q.answerIndex + 1 : ""
  ]);

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // 줄무늬 + 활성/비활성 색상
  rows.forEach((r, i) => {
    const isInactive = r[3] === "비활성";
    const bg = isInactive ? "#f1f5f9" : (i % 2 === 0 ? "#ffffff" : "#f0f7ff");
    sheet.getRange(i+2, 1, 1, headers.length)
      .setBackground(bg)
      .setFontColor(isInactive ? "#94a3b8" : "#111827");
  });

  // 정답번호 열 중앙정렬 + 굵게
  sheet.getRange(2, 10, rows.length, 1)
    .setHorizontalAlignment("center").setFontWeight("bold").setFontColor("#059669");

  // 활성화 열 중앙정렬
  sheet.getRange(2, 4, rows.length, 1).setHorizontalAlignment("center");

  // 열 너비 고정
  sheet.setColumnWidth(1, 70);   // 문제ID
  sheet.setColumnWidth(2, 120);  // 카테고리
  sheet.setColumnWidth(3, 70);   // 난이도
  sheet.setColumnWidth(4, 70);   // 활성화
  sheet.setColumnWidth(5, 350);  // 문제
  sheet.setColumnWidth(6, 150);  // 보기1
  sheet.setColumnWidth(7, 150);  // 보기2
  sheet.setColumnWidth(8, 150);  // 보기3
  sheet.setColumnWidth(9, 150);  // 보기4
  sheet.setColumnWidth(10, 80);  // 정답번호
}

// ── 소속관리 (이루자/협력사 구분 포함) ────────────────────────────────────────
function syncAffiliationsSheet(ss, affiliations) {
  const headers = ["소속명", "구분"];
  const sheet = getOrCreateSheet(ss, "소속관리", headers);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  if (!affiliations || !affiliations.length) return;

  const rows = affiliations.map(a =>
    typeof a === "string" ? [a, "이루자"] : [a.name||"", a.type||"이루자"]
  );
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.autoResizeColumns(1, 2);
}

// ── 응시결과 단건 추가 ────────────────────────────────────────────────────────
function appendExamSubmission(result, log) {
  const lock = LockService.getScriptLock();
  lock.tryLock(8000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const headers = [
      "결과ID","소속","성명","분기","점수","정답수","총문항",
      "합격여부","실격여부","실격사유","탭전환","응시시작","제출일시","소요(분)"
    ];
    const sheet = getOrCreateSheet(ss, RESULTS_SHEET, headers);

    let dur = "";
    if (result.startedAt && result.submittedAt)
      dur = Math.round((new Date(result.submittedAt) - new Date(result.startedAt)) / 60000) + "분";

    const row = [
      result.resultId||"", result.department||"", result.name||"", result.quarter||"",
      result.percentageScore??"", result.correctCount??"", result.totalCount??"",
      result.passed ? "합격" : "불합격",
      result.disqualified ? "실격" : "",
      result.disqualificationReason||"",
      result.tabSwitchCount??"", result.startedAt||"", result.submittedAt||"", dur
    ];
    sheet.appendRow(row);

    const color = result.disqualified ? "#fff3e0" : result.passed ? "#e8f5e9" : "#ffebee";
    sheet.getRange(sheet.getLastRow(), 1, 1, headers.length).setBackground(color);
    sheet.autoResizeColumns(1, headers.length);

    return { ok: true };
  } catch (e) {
    console.error("appendExamSubmission error:", e);
    return { ok: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ── HTTP 처리 ─────────────────────────────────────────────────────────────────
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    // 앱은 { action, payload } 형태로 전송
    const payload = body.payload || body.data || body;
    let result;

if      (action === "getAppData")               result = getAppData();
else if (action === "saveAppData")              result = saveAppData(payload);
else if (action === "appendExamSubmission")     result = appendExamSubmission(payload.result || payload, payload.log);
else if (action === "resetCandidateRecords")    result = resetCandidateRecordsBackend(payload);
else if (action === "adminLogin")               result = adminLogin(payload);
else result = { ok: false, message: "Unknown action: " + action };

    output.setContent(JSON.stringify({ ok: true, data: result }));
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, message: err.message }));
  }
  return output;
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "안전담당자 자격인증제 API v4" }))
    .setMimeType(ContentService.MimeType.JSON);
}
