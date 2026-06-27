"use strict";

// 책임: 통계 시각화 (점수 분포, 부서별 평균, 합격 비율, 카테고리 문항 수)

function renderStatsManager() {
  const currentResults = examResults.filter(r => r.quarter === getCurrentQuarter());
  const scoreDist      = getScoreDistribution(examResults);
  const categoryCounts = getCategoryCounts().map(item => ({ label: item.category, value: item.count }));
  const statusRatio    = [
    { label: "합격",   value: examResults.filter(r =>  r.passed && !r.disqualified).length },
    { label: "불합격", value: examResults.filter(r => !r.passed && !r.disqualified).length },
    { label: "실격",   value: examResults.filter(r =>  r.disqualified).length }
  ];
  const deptAvg = getDepartments().map(dep => {
    const rows = examResults.filter(r => r.department === dep);
    const avg  = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.percentageScore, 0) / rows.length) : 0;
    return { label: dep, value: avg };
  });

  return `
    <section class="section-head">
      <div>
        <h2>통계 시각화</h2>
      </div>
    </section>

    <div class="grid two">
      <section class="card">
        <div class="section-head"><h3>점수 분포 바 차트</h3></div>
        ${renderBarChart(scoreDist)}
      </section>
      <section class="card">
        <div class="section-head"><h3>부서별 평균 점수</h3></div>
        ${renderBarChart(deptAvg)}
      </section>
      <section class="card">
        <div class="section-head"><h3>합격/불합격/실격 비율</h3></div>
        ${renderBarChart(statusRatio)}
      </section>
      <section class="card">
        <div class="section-head"><h3>카테고리별 문항 수</h3></div>
        ${renderBarChart(categoryCounts)}
      </section>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="section-head"><h3>이번 분기 요약</h3></div>
      <div class="grid three">
        <div class="metric"><div class="label">이번 분기 결과 수</div><div class="value">${currentResults.length}</div></div>
        <div class="metric"><div class="label">최고 점수</div><div class="value">${currentResults.length ? Math.max(...currentResults.map(r => r.percentageScore)) : 0}</div></div>
        <div class="metric"><div class="label">실격자</div><div class="value">${currentResults.filter(r => r.disqualified).length}</div></div>
      </div>
    </section>
  `;
}
