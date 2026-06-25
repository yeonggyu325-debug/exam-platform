"use strict";

// 책임: 응시자 목록 조회, 필터, 응시자 추가 모달

function renderUserManager() {
  const rows = filterUsers();
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>응시자 관리</h2>
        </div>
        <button class="btn primary" type="button" onclick="openUserModal()">응시자 추가</button>
      </div>

      <div class="filters" style="grid-template-columns:1.4fr 1fr 1fr auto">
        <div class="field">
          <label for="userSearch">검색</label>
          <input id="userSearch" value="${escapeHtml(state.filters.userSearch)}"
            oninput="state.filters.userSearch=this.value; renderAdminDashboard();">
        </div>
        <div class="field">
          <label for="userDepartment">소속</label>
          <select id="userDepartment" onchange="state.filters.userDepartment=this.value; renderAdminDashboard();">
            ${optionHtml("전체", state.filters.userDepartment)}
            ${getDepartments().map(dep => optionHtml(dep, state.filters.userDepartment)).join("")}
          </select>
        </div>
        <div class="field">
          <label for="userStatus">응시 상태</label>
          <select id="userStatus" onchange="state.filters.userStatus=this.value; renderAdminDashboard();">
            ${["전체", "응시 완료", "미응시"].map(v => optionHtml(v, state.filters.userStatus)).join("")}
          </select>
        </div>
        <button class="btn" type="button" onclick="resetUserFilters()">초기화</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>소속</th><th>성명</th><th>이번 분기 응시 여부</th><th>최근 점수</th><th>최근 응시일</th><th>최근 상태</th><th>자격 유효기간</th><th>관리</th></tr>
          </thead>
          <tbody>
            ${rows.map(user => {
              const attempted = hasAttemptedThisQuarter(user.employeeId);
              const latest    = getLatestResult(user.employeeId);
              return `
                <tr>
                  <td>${escapeHtml(user.department)}</td>
                  <td>${escapeHtml(user.name)}</td>
                  <td><span class="badge ${attempted ? "success" : "warning"}">${attempted ? "응시 완료" : "미응시"}</span></td>
                  <td>${latest ? `${latest.percentageScore}점` : "-"}</td>
                  <td>${latest ? formatDateTime(latest.submittedAt) : "-"}</td>
                  <td>${latest ? renderResultBadge(latest) : "-"}</td>
                  <td>${latest && getCertificationValidity(latest) ? `${formatDateOnly(getCertificationValidity(latest).validFrom)} ~ ${formatDateOnly(getCertificationValidity(latest).validUntil)}` : "-"}</td>
                  <td>
                    <button class="btn small" type="button" onclick="resetCandidateRecords('${user.employeeId}')">기록 초기화</button>
                    <button class="btn small danger" type="button" onclick="deleteCandidate('${user.employeeId}')">삭제</button>
                  </td>
                </tr>
              `;
            }).join("") || `<tr><td colspan="8" class="empty">조건에 맞는 응시자가 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function filterUsers() {
  return getCandidateUsers().filter(user => {
    const keyword         = state.filters.userSearch.trim().toLowerCase();
    const attempted       = hasAttemptedThisQuarter(user.employeeId);
    const matchesKeyword  = !keyword || [user.department, user.name].some(v => v.toLowerCase().includes(keyword));
    const matchesDept     = state.filters.userDepartment === "전체" || user.department === state.filters.userDepartment;
    const matchesStatus   = state.filters.userStatus === "전체" ||
      (state.filters.userStatus === "응시 완료" && attempted) ||
      (state.filters.userStatus === "미응시"    && !attempted);
    return matchesKeyword && matchesDept && matchesStatus;
  });
}

function resetUserFilters() {
  state.filters.userSearch     = "";
  state.filters.userDepartment = "전체";
  state.filters.userStatus     = "전체";
  renderAdminDashboard();
}

function openUserModal() {
  const affiliations = getAffiliations ? getAffiliations() : [];
  modalRoot.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="userModalTitle">
      <section class="modal sm">
        <h2 id="userModalTitle">응시자 추가</h2>
        <form onsubmit="addUser(event)">
          <div class="field">
            <label for="newUserDepartment">부서</label>
            <select id="newUserDepartment" name="department" required>
              <option value="">부서를 선택하세요</option>
              ${affiliations.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="newUserName">성명</label>
            <input id="newUserName" name="name" required>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" onclick="closeModal()">취소</button>
            <button class="btn primary" type="submit">추가</button>
          </div>
        </form>
      </section>
    </div>
  `;
  setTimeout(() => document.getElementById("newUserDepartment")?.focus(), 0);
}

function generateEmployeeId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `U-${y}${m}${d}`;
  let seq = users
    .filter(user => String(user.employeeId || "").startsWith(prefix))
    .map(user => Number(String(user.employeeId).split("-").pop()) || 0)
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  let employeeId = `${prefix}-${String(seq).padStart(4, "0")}`;
  while (users.some(user => user.employeeId === employeeId)) {
    seq += 1;
    employeeId = `${prefix}-${String(seq).padStart(4, "0")}`;
  }
  return employeeId;
}

function addUser(event) {
  event.preventDefault();
  const form       = new FormData(event.currentTarget);
  const department = String(form.get("department")).trim();
  const name       = String(form.get("name")).trim();
  const employeeId = generateEmployeeId();

  if (users.some(user => user.role === "candidate" && user.department === department && user.name === name)) {
    alert("같은 부서와 성명의 응시자가 이미 있습니다. 로그인 혼동 방지를 위해 이름 표기를 구분해 주세요.");
    return;
  }
  users.push({ employeeId, department, name, role: "candidate" });
  savePersistentData();
  closeModal();
  renderAdminDashboard();
}

function resetCandidateRecords(employeeId) {
  const user = users.find(item => item.employeeId === employeeId);
  if (!user) return;
  if (!confirm(`${user.department} ${user.name} 응시자의 시험 기록과 로그를 초기화할까요?`)) return;
  examResults = examResults.filter(result => result.employeeId !== employeeId);
  activityLogs = activityLogs.filter(log => log.employeeId !== employeeId);
  savePersistentData();
  renderAdminDashboard();
}

function deleteCandidate(employeeId) {
  const user = users.find(item => item.employeeId === employeeId);
  if (!user) return;
  if (!confirm(`${user.department} ${user.name} 응시자를 삭제할까요? 해당 응시자의 시험 결과와 로그도 함께 삭제됩니다.`)) return;
  users = users.filter(item => item.employeeId !== employeeId);
  examResults = examResults.filter(result => result.employeeId !== employeeId);
  activityLogs = activityLogs.filter(log => log.employeeId !== employeeId);
  if (state.currentUser?.employeeId === employeeId) logout();
  savePersistentData();
  renderAdminDashboard();
}
