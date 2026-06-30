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
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // AppData 시트: JSON 원본 백업
    let dataSheet = ss.getSheetByName(SHEET_NAME);
    if (!dataSheet) {
      dataSheet = ss.insertSheet(SHEET_NAME);
      dataSheet.getRange("A1").setValue("data");
    }
    dataSheet.getRange("B1").setValue(JSON.stringify(snapshot));

    if (Array.isArray(snapshot.users))               syncUsersSheet(ss, snapshot.users);
    if (snapshot.examSettings)                        syncSettingsSheet(ss, snapshot.examSettings);
    if (Array.isArray(snapshot.examResults))          syncResultsSheet(ss, snapshot.examResults);
    if (Array.isArray(snapshot.questionBank))         syncQuestionBankSheet(ss, snapshot.questionBank);
    if (Array.isArray(snapshot.managedAffiliations))  syncAffiliationsSheet(ss, snapshot.managedAffiliations);

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
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
    return { ok: false, message: e.message };
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

    if      (action === "getAppData")          result = getAppData();
    else if (action === "saveAppData")          result = saveAppData(payload);
    else if (action === "appendExamSubmission") result = appendExamSubmission(payload.result || payload, payload.log);
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
