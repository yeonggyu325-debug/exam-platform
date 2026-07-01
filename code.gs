// ═══════════════════════════════════════════════════════════════
// H&IRUJA 안전담당자 자격인증제 · Code.gs v5
// index.html 실제 호출 구조와 100% 호환 버전
//
// 수정된 문제:
// 1. adminLogin 함수 중복 정의 → 1개로 통합
// 2. getAppData 반환 형식: 객체 직접 반환 (index.html이 data.users 등 직접 참조)
// 3. saveAppData 반환 형식: { retry } 키 포함 (index.html: res.retry 체크)
// 4. adminLogin 반환 형식: { ok, token, ts, data } (index.html: result.ok 체크)
// 5. appendExamSubmission 반환: { ok } 형식
//
// 배포 방법:
//   1. Apps Script 에디터에 이 파일 전체 붙여넣기
//   2. GAS 에디터 상단 메뉴 → 실행 → setAdminPassword("원하는비밀번호") 실행
//   3. 배포 → 웹 앱 → 새 버전으로 배포
//   4. 액세스: 나(또는 조직 내 모든 사용자)
// ═══════════════════════════════════════════════════════════════

const SHEET_NAME     = "AppData";
const RESULTS_SHEET  = "응시결과";
const USERS_SHEET    = "응시자목록";
const SETTINGS_SHEET = "시험설정";

// ── 초기 비밀번호 설정 (GAS 에디터에서 직접 실행) ────────────────────────────
// 사용법: 에디터에서 setAdminPassword 함수 선택 후 ▶ 실행
function setAdminPassword(pw) {
  if (!pw) pw = "ehs1985"; // 기본값
  PropertiesService.getScriptProperties().setProperty("ADMIN_PW_HASH", _hashPw(pw));
  Logger.log("✅ 관리자 비밀번호 설정 완료");
  return { ok: true };
}

function _hashPw(pw) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pw),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

// ── 시트 생성 헬퍼 ────────────────────────────────────────────────────────────
function getOrCreateSheet_(ss, name, headers) {
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

// ── 전체 데이터 읽기 ──────────────────────────────────────────────────────────
// 반환값: 객체 직접 반환 { users, questionBank, examSettings, ... }
// index.html applyRemoteData()가 data.users 등 직접 참조하므로 래핑 금지
function getAppData() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreateSheet_(ss, SHEET_NAME, []);
    const raw   = sheet.getRange("B1").getValue();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    Logger.log("getAppData error: " + e.message);
    return {};
  }
}

// ── 전체 데이터 저장 ──────────────────────────────────────────────────────────
// 반환값: { ok, retry }
// index.html: res.retry === true 이면 _retryRemoteSave() 호출
function saveAppData(snapshot) {
  const lock    = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000);
  if (!gotLock) {
    return { ok: false, retry: true, message: "다른 사용자가 저장 중입니다. 잠시 후 재시도합니다." };
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let dataSheet = ss.getSheetByName(SHEET_NAME);
    if (!dataSheet) {
      dataSheet = ss.insertSheet(SHEET_NAME);
      dataSheet.getRange("A1").setValue("data");
    }

    // 기존 데이터와 병합 후 저장
    const rawExisting = dataSheet.getRange("B1").getValue();
    let existing = {};
    try { existing = rawExisting ? JSON.parse(rawExisting) : {}; } catch (e) { existing = {}; }

    const merged = mergeAppData_(existing, snapshot);
    dataSheet.getRange("B1").setValue(JSON.stringify(merged));

    // 30초 후 시트 동기화 (비동기, 타임아웃 방지)
    scheduleSyncTrigger_();

    return { ok: true, retry: false };
  } catch (e) {
    Logger.log("saveAppData error: " + e.message);
    return { ok: false, retry: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ── 관리자 로그인 ──────────────────────────────────────────────────────────────
// 반환값: { ok, token, ts, adminId, data }
// index.html: result.ok 체크 → result.token, result.ts 세션 저장 → applyRemoteData(result.data)
function adminLogin(payload) {
  try {
    if (!payload || !payload.password) {
      return { ok: false, message: "비밀번호를 입력하세요." };
    }

    const stored   = PropertiesService.getScriptProperties().getProperty("ADMIN_PW_HASH");
    const fallback = _hashPw("ehs1985"); // setAdminPassword 실행 전 기본값
    const hash     = stored || fallback;
    const input    = _hashPw(String(payload.password));

    if (input !== hash) {
      Utilities.sleep(500); // brute-force 방지
      return { ok: false, message: "비밀번호가 일치하지 않습니다." };
    }

    // 세션 토큰 발급
    const ts    = Date.now();
    const token = Utilities.base64Encode(
      Utilities.computeHmacSha256Signature(
        String(ts),
        (stored || fallback) + "HNIRUJA_SALT"
      )
    );

    // 로그인 성공 시 앱 데이터 함께 반환 (별도 getAppData 호출 불필요 → 속도 최적화)
    const data = getAppData();

    return { ok: true, token: token, ts: ts, adminId: "ADM-0001", data: data };
  } catch (e) {
    Logger.log("adminLogin error: " + e.message);
    return { ok: false, message: e.message };
  }
}

// ── 응시결과 단건 추가 ────────────────────────────────────────────────────────
// 반환값: { ok }
// index.html: appendResultToSheet()에서 호출
function appendExamSubmission(result, log) {
  const lock = LockService.getScriptLock();
  lock.tryLock(8000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const headers = [
      "결과ID","소속","성명","분기","점수","정답수","총문항",
      "합격여부","실격여부","실격사유","탭전환","응시시작","제출일시","소요(분)"
    ];
    const sheet = getOrCreateSheet_(ss, RESULTS_SHEET, headers);

    // 중복 제출 방지: 동일 resultId 존재 여부 확인
    if (result && result.resultId) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
        if (ids.includes(result.resultId)) {
          return { ok: true, duplicate: true, message: "이미 기록된 결과입니다." };
        }
      }
    }

    let dur = "";
    if (result.startedAt && result.submittedAt) {
      dur = Math.round((new Date(result.submittedAt) - new Date(result.startedAt)) / 60000) + "분";
    }

    const row = [
      result.resultId||"",      result.department||"",    result.name||"",
      result.quarter||"",       result.percentageScore??"", result.correctCount??"",
      result.totalCount??"",
      result.passed ? "합격" : "불합격",
      result.disqualified ? "실격" : "",
      result.disqualificationReason||"",
      result.tabSwitchCount??"", result.startedAt||"",    result.submittedAt||"", dur
    ];
    sheet.appendRow(row);

    const color = result.disqualified ? "#fff3e0" : result.passed ? "#e8f5e9" : "#ffebee";
    sheet.getRange(sheet.getLastRow(), 1, 1, headers.length).setBackground(color);

    // AppData JSON에도 반영
    const dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (dataSheet) {
      const rawMain = dataSheet.getRange("B1").getValue();
      if (rawMain) {
        try {
          const main = JSON.parse(rawMain);
          if (!Array.isArray(main.examResults)) main.examResults = [];
          if (!Array.isArray(main.activityLogs)) main.activityLogs = [];

          const alreadyInMain = main.examResults.some(
            r => r.resultId === result.resultId ||
                 (r.employeeId === result.employeeId && r.quarter === result.quarter)
          );
          if (!alreadyInMain) {
            main.examResults.push(result);
            if (log) main.activityLogs.push(log);
            const activeKey = result.employeeId + "__" + result.quarter;
            main.activeExams = (main.activeExams || []).filter(a => a.key !== activeKey);
            dataSheet.getRange("B1").setValue(JSON.stringify(main));
          }
        } catch (mergeErr) {
          Logger.log("appendExamSubmission merge error: " + mergeErr.message);
        }
      }
    }

    return { ok: true };
  } catch (e) {
    Logger.log("appendExamSubmission error: " + e.message);
    return { ok: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ── 데이터 병합 (동시 저장 충돌 방지) ───────────────────────────────────────
function mergeAppData_(existing, incoming) {
  const merged = Object.assign({}, existing, incoming);

  merged.examResults = mergeById_(
    existing.examResults || [],
    incoming.examResults || [],
    r => r.employeeId + "_" + r.quarter,
    r => new Date(r.submittedAt || 0).getTime()
  );

  merged.activityLogs = mergeById_(
    existing.activityLogs || [],
    incoming.activityLogs || [],
    l => l.logId,
    l => new Date(l.createdAt || 0).getTime()
  ).slice(-500);

  merged.activeExams = mergeById_(
    existing.activeExams || [],
    incoming.activeExams || [],
    e => (e.employeeId || e.key) + "_" + e.quarter,
    e => new Date(e.updatedAt || 0).getTime()
  );

  return merged;
}

function mergeById_(arrA, arrB, keyFn, scoreFn) {
  const map = new Map();
  arrA.forEach(item => map.set(keyFn(item), item));
  arrB.forEach(item => {
    const k    = keyFn(item);
    const prev = map.get(k);
    if (!prev || scoreFn(item) >= scoreFn(prev)) map.set(k, item);
  });
  return Array.from(map.values());
}

// ── 시트 동기화 트리거 ────────────────────────────────────────────────────────
function scheduleSyncTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  const already  = triggers.some(t => t.getHandlerFunction() === "runDeferredSheetSync");
  if (!already) {
    ScriptApp.newTrigger("runDeferredSheetSync").timeBased().after(30000).create();
  }
}

function runDeferredSheetSync() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runDeferredSheetSync")
    .forEach(t => ScriptApp.deleteTrigger(t));

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const raw = sheet.getRange("B1").getValue();
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return; }

  if (Array.isArray(data.users))              syncUsersSheet_(ss, data.users);
  if (data.examSettings)                       syncSettingsSheet_(ss, data.examSettings);
  if (Array.isArray(data.examResults))         syncResultsSheet_(ss, data.examResults);
  if (Array.isArray(data.questionBank))        syncQuestionBankSheet_(ss, data.questionBank);
  if (Array.isArray(data.managedAffiliations)) syncAffiliationsSheet_(ss, data.managedAffiliations);
}

// ── 각 시트 동기화 ───────────────────────────────────────────────────────────
function syncUsersSheet_(ss, users) {
  const sheet = getOrCreateSheet_(ss, USERS_SHEET, ["사번(ID)","소속","성명","역할"]);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  const rows = (users || []).filter(u => u.role === "candidate")
    .map(u => [u.employeeId||"", u.department||"", u.name||"", "응시자"]);
  if (rows.length) sheet.getRange(2, 1, rows.length, 4).setValues(rows);
}

function syncSettingsSheet_(ss, s) {
  const sheet = getOrCreateSheet_(ss, SETTINGS_SHEET, ["항목","값"]);
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
}

function syncResultsSheet_(ss, results) {
  const headers = [
    "결과ID","소속","성명","분기","점수","정답수","총문항",
    "합격여부","실격여부","실격사유","탭전환","응시시작","제출일시","소요(분)"
  ];
  const sheet = getOrCreateSheet_(ss, RESULTS_SHEET, headers);
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
}

function syncQuestionBankSheet_(ss, questions) {
  const headers = [
    "문제ID","카테고리","활성화","문제",
    "보기1","보기2","보기3","보기4","보기5","정답번호(1~5)"
  ];
  let sheet = ss.getSheetByName("문제은행");
  if (!sheet) sheet = ss.insertSheet("문제은행");
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#1f5fbf").setFontColor("#ffffff").setFontWeight("bold");
  sheet.setFrozenRows(1);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!questions || !questions.length) return;
  const rows = questions.map(q => [
    q.id||"", q.category||"",
    q.active ? "활성" : "비활성", q.text||"",
    (q.options||[])[0]||"", (q.options||[])[1]||"",
    (q.options||[])[2]||"", (q.options||[])[3]||"",
    (q.options||[])[4]||"",
    (q.answerIndex !== undefined && q.answerIndex !== null) ? q.answerIndex + 1 : ""
  ]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  rows.forEach((r, i) => {
    const bg = r[2]==="비활성" ? "#f1f5f9" : (i%2===0 ? "#ffffff" : "#f0f7ff");
    sheet.getRange(i+2, 1, 1, headers.length).setBackground(bg);
  });
  // 열 너비
  sheet.setColumnWidth(1, 70);   // 문제ID
  sheet.setColumnWidth(2, 120);  // 카테고리
  sheet.setColumnWidth(3, 70);   // 활성화
  sheet.setColumnWidth(4, 350);  // 문제
  [5,6,7,8,9].forEach(c => sheet.setColumnWidth(c, 150)); // 보기1~5
  sheet.setColumnWidth(10, 90);  // 정답번호
}

function syncAffiliationsSheet_(ss, affiliations) {
  const sheet = getOrCreateSheet_(ss, "소속관리", ["소속명","구분"]);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  if (!affiliations || !affiliations.length) return;
  const rows = affiliations.map(a =>
    typeof a === "string" ? [a, "이루자"] : [a.name||"", a.type||"이루자"]
  );
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

// ── 웹앱 진입점 ───────────────────────────────────────────────────────────────
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("index")
    .setTitle("안전담당자 자격인증제")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── 디버깅용 (GAS 에디터에서 직접 실행) ──────────────────────────────────────
function logDataSummary() {
  const data = getAppData();
  Logger.log("users: "        + (data.users||[]).length);
  Logger.log("questionBank: " + (data.questionBank||[]).length);
  Logger.log("examResults: "  + (data.examResults||[]).length);
  Logger.log("activityLogs: " + (data.activityLogs||[]).length);
  Logger.log("activeExams: "  + (data.activeExams||[]).length);
  Logger.log("affiliations: " + (data.managedAffiliations||[]).length);
}

function resetAllData() {
  // ⚠️ 주의: 모든 데이터 삭제. 에디터에서만 직접 실행할 것.
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet_(ss, SHEET_NAME, []);
  sheet.getRange("A1").setValue("data");
  sheet.getRange("B1").setValue("");
  Logger.log("✅ 전체 데이터 초기화 완료");
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};

    let result;
    switch (action) {
      case "getAppData":
        result = getAppData();
        break;
      case "saveAppData":
        result = saveAppData(payload);
        break;
      case "appendExamSubmission":
        result = appendExamSubmission(payload.result, payload.log);
        break;
      case "adminLogin":
        result = adminLogin(payload);
        break;
      default:
        return ContentService.createTextOutput(
          JSON.stringify({ ok: false, message: "알 수 없는 action: " + action })
        ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, data: result })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("doPost error: " + err.message);
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
