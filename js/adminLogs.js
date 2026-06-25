"use strict";

// 책임: 응시 로그 목록 (최신순 정렬, 관리자 전용)

function renderLogManager() {
  const logs = [...activityLogs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>응시 로그</h2>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>일시</th><th>부서</th><th>성명</th><th>유형</th><th>탭 전환 횟수</th><th>내용</th></tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td>${formatDateTime(log.createdAt)}</td>
                <td>${escapeHtml(log.department || "-")}</td>
                <td>${escapeHtml(log.name)}</td>
                <td>
                  <span class="badge ${
                    String(log.type).includes("DISQUALIFIED") ? "danger" :
                    String(log.type).includes("WARNING")      ? "warning" : "success"
                  }">${escapeHtml(log.type)}</span>
                </td>
                <td>${log.tabSwitchCount ?? 0}</td>
                <td>${escapeHtml(log.message)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
