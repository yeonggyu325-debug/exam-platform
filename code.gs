ode_gs = r'''/**
 * ═══════════════════════════════════════════════════════════════════
 * Code.gs — H&IRUJA 안전담당자 자격인증제 GAS 백엔드
 * 버전: 2.0 (2026-07-01)
 *
 * 실제 index.html 데이터 구조와 100% 호환
 * saveAppData / getAppData / appendExamSubmission / adminLogin
 *
 * 핵심 개선사항:
 * - LockService로 동시 저장 충돌 방지 (30명 동시접속 대응)
 * - CacheService로 getAppData 조회 부하 완화
 * - 저장 실패 시 retry 신호 반환
 * - appendExamSubmission: 제출 중복 방지 (서버에서 이중 차단)
 * ═══════════════════════════════════════════════════════════════════
 *
 * ── 스프레드시트 시트 구성 ──
 * 시트명: AppData     ← 전체 앱 데이터 JSON 1셀 저장 방식
 * 시트명: ExamResults ← 응시 결과 행 단위 기록 (관리자 Excel 출력용)
 *
 * ── 배포 방법 ──
 * 1. Apps Script 에디터에 이 파일 전체 붙여넣기
 * 2. 상수 ADMIN_PASSWORD 변경 (현재: "admin1234")
 * 3. 배포 → 웹 앱 → 액세스: 나 (또는 조직 내 모든 사용자)
 * 4. 배포 URL을 index.html의 window.HNIRUJA_API_BASE 또는
 *    GAS 웹앱으로 직접 서빙
 * ═══════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────
// 상수 설정 (환경에 맞게 수정)
// ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD    = "admin1234";   // ← 운영 전 반드시 변경
const DATA_SHEET_NAME   = "AppData";
const RESULT_SHEET_NAME = "ExamResults";
const CACHE_KEY_APP     = "appdata_v2";
const CACHE_TTL_SEC     = 8;            // CacheService 캐시 유지 시간(초)
const DATA_CELL         = "A1";         // AppData 시트에서 JSON 저장 셀

// ────────────────────────────────────────────────────────────────
// 웹앱 진입점
// ────────────────────────────────────────────────────────────────
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("index")
    .setTitle("안전담당자 자격인증제")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ────────────────────────────────────────────────────────────────
// 공통 응답 헬퍼
// ────────────────────────────────────────────────────────────────
function _ok(data) {
  return { success: true, serverTime: new Date().toISOString(), ...data };
}
function _fail(message, error) {
  return {
    success: false,
    message: message,
    error: String(error || ""),
    serverTime: new Date().toISOString()
  };
}

// ────────────────────────────────────────────────────────────────
// 스프레드시트 헬퍼
// ────────────────────────────────────────────────────────────────
function _getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function _readAppData() {
  const sheet = _getOrCreateSheet(DATA_SHEET_NAME);
  const raw   = sheet.getRange(DATA_CELL).getValue();
  if (!raw) return _defaultAppData();
  try {
    return JSON.parse(raw);
  } catch (e) {
    return _defaultAppData();
  }
}

function _writeAppData(data) {
  const sheet = _getOrCreateSheet(DATA_SHEET_NAME);
  sheet.getRange(DATA_CELL).setValue(JSON.stringify(data));
  // 캐시 무효화
  CacheService.getScriptCache().remove(CACHE_KEY_APP);
}

function _defaultAppData() {
  return {
    users:               [],
    questionBank:        [],
    examSettings:        {
      totalQuestions:    20,
      timeLimitMinutes:  30,
      passingScore:      60,
      pointsPerQuestion: 1,
      randomizeQuestions: true,
      randomizeOptions:  true,
      tabSwitchLimit:    3,
      categoryQuota:     {}
    },
    examResults:         [],
    activityLogs:        [],
    activeExams:         [],
    managedAffiliations: []
  };
}

// ────────────────────────────────────────────────────────────────
// 1. getAppData — 전체 앱 데이터 조회 (CacheService 적용)
// ────────────────────────────────────────────────────────────────
function getAppData() {
  try {
    const cache = CacheService.getScriptCache();
    const hit   = cache.get(CACHE_KEY_APP);
    if (hit) {
      return _ok(JSON.parse(hit));
    }

    const data = _readAppData();
    // 캐시 저장 (최대 100KB 제한 주의 — 초과 시 캐시 건너뜀)
    try {
      const json = JSON.stringify(data);
      if (json.length < 90000) cache.put(CACHE_KEY_APP, json, CACHE_TTL_SEC);
    } catch (cacheErr) {
      // 캐시 실패는 무시하고 계속 진행
    }

    return _ok(data);
  } catch (error) {
    return _fail("데이터 조회 중 오류가 발생했습니다.", error);
  }
}

// ────────────────────────────────────────────────────────────────
// 2. saveAppData — 전체 앱 데이터 저장 (LockService 적용)
//    프론트에서 디바운스(400ms) 후 호출하므로 빈번한 요청은 이미 줄어든 상태
//    반환: { success, retry }
//      retry: true → 프론트가 재시도해야 하는 상황 (락 점유 등)
// ────────────────────────────────────────────────────────────────
function saveAppData(snapshot) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(8000); // 최대 8초 대기

  if (!acquired) {
    // 락 획득 실패 → 프론트에 재시도 신호 반환
    return { success: false, retry: true, message: "저장 대기 중입니다. 잠시 후 재시도합니다." };
  }

  try {
    // 기존 데이터와 병합 저장 (일부 필드만 업데이트하는 경우 대비)
    const existing = _readAppData();
    const merged   = {
      users:               snapshot.users               ?? existing.users,
      questionBank:        snapshot.questionBank        ?? existing.questionBank,
      examSettings:        snapshot.examSettings        ?? existing.examSettings,
      examResults:         snapshot.examResults         ?? existing.examResults,
      activityLogs:        snapshot.activityLogs        ?? existing.activityLogs,
      activeExams:         snapshot.activeExams         ?? existing.activeExams,
      managedAffiliations: snapshot.managedAffiliations ?? existing.managedAffiliations
    };
    _writeAppData(merged);
    return _ok({ retry: false });
  } catch (error) {
    return _fail("데이터 저장 중 오류가 발생했습니다.", error);
  } finally {
    lock.releaseLock();
  }
}

// ────────────────────────────────────────────────────────────────
// 3. appendExamSubmission — 응시 결과 기록
//    - 중복 제출 서버 차단: 같은 employeeId + quarter 가 이미 있으면 덮어쓰지 않음
//    - ExamResults 시트에 행 단위로 기록 (관리자 엑셀 출력용)
//    - AppData에도 반영 (LockService)
// ────────────────────────────────────────────────────────────────
function appendExamSubmission(result, log) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const data = _readAppData();

    // ── 중복 제출 방지: 동일 employeeId + quarter 결과 확인
    const existingIdx = data.examResults.findIndex(
      r => r.employeeId === result.employeeId && r.quarter === result.quarter
    );

    if (existingIdx >= 0) {
      // 이미 제출된 결과 존재 — 덮어쓰지 않고 기존 결과 반환
      return _ok({
        alreadySubmitted: true,
        message:          "이미 제출된 시험입니다.",
        score:            data.examResults[existingIdx].percentageScore,
        passed:           data.examResults[existingIdx].passed,
        disqualified:     data.examResults[existingIdx].disqualified
      });
    }

    // ── 신규 결과 추가
    data.examResults.push(result);
    if (log) data.activityLogs.push(log);

    // activeExams 에서 해당 응시자 기록 제거
    const activeKey = result.employeeId + "__" + result.quarter;
    data.activeExams = data.activeExams.filter(a => a.key !== activeKey);

    _writeAppData(data);

    // ── ExamResults 시트에도 행 기록
    _appendToResultSheet(result);

    return _ok({ alreadySubmitted: false });

  } catch (error) {
    return _fail("응시 결과 저장 중 오류가 발생했습니다.", error);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ExamResults 시트에 결과 한 행 추가
 * 컬럼: 제출일시 / 분기 / 소속 / 성명 / 직원ID / 점수 / 합격여부 / 실격여부 / 이탈횟수 / 실격사유 / 시작일시
 */
function _appendToResultSheet(result) {
  try {
    const sheet = _getOrCreateSheet(RESULT_SHEET_NAME);

    // 헤더가 없으면 추가
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "제출일시","분기","소속","성명","직원ID",
        "점수(%)","합격여부","실격여부","화면이탈횟수","실격사유","시작일시"
      ]);
    }

    sheet.appendRow([
      result.submittedAt       || "",
      result.quarter           || "",
      result.department        || "",
      result.name              || "",
      result.employeeId        || "",
      result.percentageScore   ?? "",
      result.passed ? "합격" : "불합격",
      result.disqualified ? "Y" : "N",
      result.tabSwitchCount    ?? 0,
      result.disqualificationReason || "",
      result.startedAt         || ""
    ]);
  } catch (e) {
    // 시트 기록 실패는 메인 저장에 영향 없음
    console.warn("ExamResults 시트 기록 실패:", e);
  }
}

// ────────────────────────────────────────────────────────────────
// 4. adminLogin — 관리자 비밀번호 검증
// ────────────────────────────────────────────────────────────────
function adminLogin(payload) {
  try {
    const { password } = payload || {};
    if (!password) return _fail("비밀번호를 입력해 주세요.");
    if (password !== ADMIN_PASSWORD) return _fail("비밀번호가 올바르지 않습니다.");
    return _ok({ authenticated: true, message: "관리자 로그인 성공" });
  } catch (error) {
    return _fail("로그인 처리 중 오류가 발생했습니다.", error);
  }
}

// ────────────────────────────────────────────────────────────────
// 5. 유틸 — 수동 데이터 초기화 (GAS 에디터에서 직접 실행용)
// ────────────────────────────────────────────────────────────────
function resetAllData() {
  // ※ 주의: 모든 응시 데이터가 삭제됩니다. 에디터에서만 직접 실행하세요.
  _writeAppData(_defaultAppData());
  const cache = CacheService.getScriptCache();
  cache.remove(CACHE_KEY_APP);
  Logger.log("전체 데이터 초기화 완료");
}

// ────────────────────────────────────────────────────────────────
// 6. 유틸 — 현재 저장된 데이터 요약 로그 (디버깅용)
// ────────────────────────────────────────────────────────────────
function logDataSummary() {
  const data = _readAppData();
  Logger.log("users: "         + data.users.length);
  Logger.log("questionBank: "  + data.questionBank.length);
  Logger.log("examResults: "   + data.examResults.length);
  Logger.log("activityLogs: "  + data.activityLogs.length);
  Logger.log("activeExams: "   + data.activeExams.length);
  Logger.log("affiliations: "  + data.managedAffiliations.length);
}

/*
 * ═══════════════════════════════════════════════════════════════════
 * 테스트 시나리오 (GAS 에디터에서 각 함수를 직접 실행해 검증)
 * ═══════════════════════════════════════════════════════════════════
 *
 * [1] 단일 사용자 테스트
 *   - getAppData()           → success:true, data에 전체 앱 데이터 반환 확인
 *   - saveAppData(snapshot)  → success:true, retry:false 반환 확인
 *   - adminLogin({password:"admin1234"}) → authenticated:true 확인
 *
 * [2] 중복 제출 방지 테스트
 *   - appendExamSubmission(result1, log1) 첫 번째 → alreadySubmitted:false
 *   - appendExamSubmission(result1, log1) 두 번째 → alreadySubmitted:true (덮어쓰기 안 됨)
 *
 * [3] 동시 저장 테스트 (30명 시뮬레이션)
 *   - Apps Script의 실행 한도: 동시 실행 최대 30개
 *   - LockService waitLock(8000) 으로 순차 처리
 *   - 락 대기 초과 시 retry:true 반환 → 프론트가 800ms 후 재시도
 *
 * [4] 관리자 화면 부하 완화 테스트
 *   - getAppData() 를 1초 안에 여러 번 호출
 *   - 첫 번째 이후는 CacheService에서 반환 (Sheets API 호출 없음)
 *   - 캐시 TTL: 8초
 *
 * [5] ExamResults 시트 확인
 *   - appendExamSubmission 실행 후 ExamResults 시트에 행이 추가됐는지 확인
 *   - 컬럼: 제출일시/분기/소속/성명/직원ID/점수/합격여부/실격여부/이탈횟수/실격사유/시작일시
 *
 * ═══════════════════════════════════════════════════════════════════
 */
'''

import os
os.makedirs('output', exist_ok=True)
with open('output/Code.gs', 'w', encoding='utf-8') as f:
    f.write(code_gs)

print(f"✅ Code.gs 저장 완료: {len(code_gs):,} chars")
