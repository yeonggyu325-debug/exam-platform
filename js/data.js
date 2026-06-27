"use strict";

// ※ 데모용 메모리 데이터입니다. 실제 운영에서는 서버 인증, DB 저장, 감사 로그 저장으로 교체해야 합니다.

let users = [
  { employeeId: "U-202606220001", department: "생산기술",     name: "김민준", role: "candidate" },
  { employeeId: "U-202606220002", department: "생산기술",     name: "이서연", role: "candidate" },
  { employeeId: "U-202606220003", department: "신기술개발",   name: "박도윤", role: "candidate" },
  { employeeId: "U-202606220004", department: "신기술개발",   name: "최지우", role: "candidate" },
  { employeeId: "U-202606220005", department: "연구소",       name: "정하준", role: "candidate" },
  { employeeId: "U-202606220006", department: "연구소",       name: "강서준", role: "candidate" },
  { employeeId: "U-202606220007", department: "공정기술",     name: "윤하린", role: "candidate" },
  { employeeId: "U-202606220008", department: "공정기술",     name: "장유진", role: "candidate" },
  { employeeId: "U-202606220009", department: "고객기술지원", name: "한지민", role: "candidate" },
  { employeeId: "U-202606220010", department: "고객기술지원", name: "오시우", role: "candidate" },
  { employeeId: "U-202606220011", department: "바른중량",     name: "임수아", role: "candidate" },
  { employeeId: "U-202606220012", department: "대한수출포장", name: "서도현", role: "candidate" },
  { employeeId: "ADM-0001",      department: "환경안전",     name: "ehs1985", role: "admin" }
];

let managedAffiliations = ["생산기술", "신기술개발", "연구소", "공정기술", "고객기술지원", "바른중량", "대한수출포장"];


let questionBank = [
  { id: 1,  category: "안전보건",     difficulty: "기본", text: "작업 전 안전보건 점검의 가장 적절한 목적은 무엇인가?",         options: ["사고 위험요소를 사전에 확인한다","작업 시간을 단축한다","문서 보관량을 줄인다","근무표를 변경한다"],                                                  answerIndex: 0, active: true },
  { id: 2,  category: "안전보건",     difficulty: "기본", text: "보호구 착용에 대한 설명으로 옳은 것은?",                         options: ["작업 위험에 맞는 보호구를 올바르게 착용한다","익숙한 작업은 보호구를 생략할 수 있다","보호구는 공용으로만 사용한다","보호구 점검은 월 1회면 충분하다"],   answerIndex: 0, active: true },
  { id: 3,  category: "안전보건",     difficulty: "중급", text: "위험성평가에서 우선적으로 확인해야 할 항목은?",                   options: ["유해위험요인과 노출 가능성","휴게실 위치","사내 행사 일정","서류 양식 색상"],                                                                       answerIndex: 0, active: true },
  { id: 4,  category: "안전보건",     difficulty: "기본", text: "화재 대피 시 가장 바람직한 행동은?",                             options: ["지정 대피로를 따라 신속하고 침착하게 이동한다","엘리베이터를 이용한다","개인 물품을 모두 챙긴다","현장에 남아 원인을 조사한다"],                   answerIndex: 0, active: true },
  { id: 5,  category: "안전보건",     difficulty: "중급", text: "아차사고 보고의 의미로 가장 적절한 것은?",                       options: ["사고로 이어질 뻔한 상황을 공유해 재발을 막는다","처벌 대상을 찾는다","작업을 중단시키기 위한 절차다","관리자만 열람하는 비공개 기록이다"],        answerIndex: 0, active: true },
  { id: 6,  category: "안전보건",     difficulty: "고급", text: "밀폐공간 작업 전 필수 확인사항으로 가장 적절한 것은?",           options: ["산소 및 유해가스 농도 측정","작업복 색상 통일","작업자 휴대폰 모델","외부 방문객 수"],                                                              answerIndex: 0, active: true },
  { id: 7,  category: "화학물질관리", difficulty: "기본", text: "SDS의 주요 용도는 무엇인가?",                                     options: ["화학물질의 위험성과 취급 정보를 확인한다","출퇴근 기록을 확인한다","비품 구매 내역을 확인한다","교육 참석자 명단만 관리한다"],                      answerIndex: 0, active: true },
  { id: 8,  category: "화학물질관리", difficulty: "기본", text: "화학물질 용기 라벨에 포함되어야 할 정보로 적절한 것은?",         options: ["물질명과 위험표지","작업자 생년월일","사무실 전화 내선","구매 담당자 휴가 일정"],                                                                   answerIndex: 0, active: true },
  { id: 9,  category: "화학물질관리", difficulty: "중급", text: "화학물질 누출 시 첫 조치로 가장 적절한 것은?",                   options: ["주변에 알리고 안전거리 확보 후 보고한다","맨손으로 닦아낸다","환기를 막는다","사진 촬영 후 방치한다"],                                              answerIndex: 0, active: true },
  { id: 10, category: "화학물질관리", difficulty: "중급", text: "혼합 보관을 피해야 하는 이유는?",                                 options: ["반응으로 화재·폭발·유해가스 발생 가능성이 있기 때문이다","보관 공간을 넓게 쓰기 위해서다","관리대장 작성이 쉬워지기 때문이다","라벨 색상이 달라서다"], answerIndex: 0, active: true },
  { id: 11, category: "화학물질관리", difficulty: "고급", text: "국소배기장치 관리에서 중요한 점은?",                               options: ["후드 위치와 풍속이 적정한지 확인한다","장치 색상을 정기적으로 바꾼다","작업 후 전원을 항상 제거한다","사용 빈도가 낮으면 점검하지 않는다"],          answerIndex: 0, active: true },
  { id: 12, category: "화학물질관리", difficulty: "기본", text: "폐화학물질 처리 원칙으로 옳은 것은?",                             options: ["분류 기준에 따라 지정 용기에 보관하고 처리한다","일반쓰레기와 함께 배출한다","하수구에 희석 배출한다","임의 용기에 섞어 보관한다"],               answerIndex: 0, active: true },
  { id: 13, category: "법정교육",     difficulty: "기본", text: "정기 안전보건교육의 목적은?",                                     options: ["근로자의 안전의식과 사고 예방 역량을 높인다","급여 산정을 대체한다","인사평가 점수를 공개한다","설비 구매를 승인한다"],                              answerIndex: 0, active: true },
  { id: 14, category: "법정교육",     difficulty: "기본", text: "교육 이수 기록 관리가 필요한 이유는?",                             options: ["법적 요구와 교육 이력을 확인하기 위해서다","문제 난이도를 숨기기 위해서다","회의실 예약을 자동화하기 위해서다","휴가 계획을 승인하기 위해서다"],   answerIndex: 0, active: true },
  { id: 15, category: "법정교육",     difficulty: "중급", text: "신규 입사자 교육 시점으로 적절한 것은?",                           options: ["작업 투입 전 필요한 안전교육을 실시한다","입사 1년 후 실시한다","사고 발생 후에만 실시한다","본인이 요청할 때만 실시한다"],                        answerIndex: 0, active: true },
  { id: 16, category: "법정교육",     difficulty: "중급", text: "관리감독자 교육의 핵심 내용으로 적절한 것은?",                     options: ["현장 위험 관리와 작업자 지도","회계 결산 방식","사내 동호회 운영","고객 홍보 문구 작성"],                                                           answerIndex: 0, active: true },
  { id: 17, category: "법정교육",     difficulty: "고급", text: "교육 효과 확인을 위해 적절한 방법은?",                             options: ["평가와 피드백을 통해 이해도를 확인한다","참석자 서명만 받으면 충분하다","강의 시간을 줄인다","교육 자료를 배포하지 않는다"],                       answerIndex: 0, active: true },
  { id: 18, category: "법정교육",     difficulty: "기본", text: "교육 미이수자 관리로 적절한 것은?",                                 options: ["대상자를 파악해 보충교육을 안내한다","자동으로 합격 처리한다","명단을 삭제한다","다음 연도까지 방치한다"],                                         answerIndex: 0, active: true },
  { id: 19, category: "비상대응",     difficulty: "기본", text: "비상연락망의 가장 중요한 관리 기준은?",                             options: ["최신 연락처와 역할을 유지한다","문서 디자인을 화려하게 만든다","외부 공개용으로 게시한다","연 1회만 확인한다"],                                    answerIndex: 0, active: true },
  { id: 20, category: "비상대응",     difficulty: "중급", text: "응급상황 발생 시 우선순위로 적절한 것은?",                         options: ["자신과 주변의 안전 확보 후 구조 요청","원인 분석 보고서 작성","개인 장비 정리","현장 사진 공유"],                                                   answerIndex: 0, active: true },
  { id: 21, category: "비상대응",     difficulty: "기본", text: "비상대피훈련의 목적은?",                                           options: ["실제 상황에서 신속히 대피할 수 있도록 절차를 익힌다","근무 시간을 조정한다","부서별 순위를 정한다","시설 미관을 점검한다"],                       answerIndex: 0, active: true },
  { id: 22, category: "비상대응",     difficulty: "중급", text: "소화기 사용 전 확인사항으로 적절한 것은?",                         options: ["화재 종류와 대피로 확보 여부","소화기 제조사 로고","주변 조명 색상","근무복 사이즈"],                                                               answerIndex: 0, active: true }
];

let examSettings = {
  totalQuestions: 7,
  timeLimitMinutes: 20,
<<<<<<< HEAD
  passingScore: 60,
=======
  passingScore: 70,
>>>>>>> 9c9a0d791fc8b399a76b2de0c1865a21c98ad972
  pointsPerQuestion: 1,
  randomizeQuestions: true,
  randomizeOptions: true,
  tabSwitchLimit: 3,
  categoryQuota: {
    "안전보건": 3,
    "화학물질관리": 2,
    "법정교육": 2
  }
};

// examResults / activityLogs 는 utils.js 의 헬퍼 함수가 초기화된 뒤 채워집니다.
let examResults = [];
let activityLogs = [];
let activeExams = [];

function _initSampleData() {
  examResults = [
    { resultId: 1, employeeId: "U-202606220001", department: "생산기술",     name: "김민준", quarter: getCurrentQuarter(), totalScore: 6, maxScore: 7, percentageScore: 86, score: 86, correctCount: 6, totalCount: 7, passed: true,  disqualified: false, disqualificationReason: "", tabSwitchCount: 0, submittedAt: daysAgo(2) },
    { resultId: 2, employeeId: "U-202606220004", department: "신기술개발",   name: "최지우", quarter: getCurrentQuarter(), totalScore: 5, maxScore: 7, percentageScore: 71, score: 71, correctCount: 5, totalCount: 7, passed: true,  disqualified: false, disqualificationReason: "", tabSwitchCount: 1, submittedAt: daysAgo(4) },
    { resultId: 3, employeeId: "U-202606220008", department: "공정기술",     name: "장유진", quarter: getCurrentQuarter(), totalScore: 4, maxScore: 7, percentageScore: 57, score: 57, correctCount: 4, totalCount: 7, passed: false, disqualified: true,  disqualificationReason: "탭 전환 3회 이상", tabSwitchCount: 3, submittedAt: daysAgo(7) },
    { resultId: 4, employeeId: "U-202606220010", department: "고객기술지원", name: "오시우", quarter: getCurrentQuarter(), totalScore: 7, maxScore: 7, percentageScore: 100, score: 100, correctCount: 7, totalCount: 7, passed: true, disqualified: false, disqualificationReason: "", tabSwitchCount: 0, submittedAt: daysAgo(9) },
    { resultId: 5, employeeId: "U-202606220006", department: "연구소",       name: "강서준", quarter: previousQuarter(), totalScore: 5, maxScore: 7, percentageScore: 68, score: 68, correctCount: 5, totalCount: 7, passed: false, disqualified: false, disqualificationReason: "", tabSwitchCount: 0, submittedAt: "2026-03-18T10:20:00" }
  ];
  activityLogs = [
    { logId: 1, employeeId: "U-202606220001", department: "생산기술",   name: "김민준", type: "SUBMIT",       message: "시험 제출 완료",                         tabSwitchCount: 0, createdAt: daysAgo(2) },
    { logId: 2, employeeId: "U-202606220004", department: "신기술개발", name: "최지우", type: "WARNING",      message: "응시 중 탭 전환 1회 감지",               tabSwitchCount: 1, createdAt: daysAgo(4) },
    { logId: 3, employeeId: "U-202606220008", department: "공정기술",   name: "장유진", type: "DISQUALIFIED", message: "탭 전환 3회 이상으로 자동 제출 및 실격 처리", tabSwitchCount: 3, createdAt: daysAgo(7) }
  ];
}
