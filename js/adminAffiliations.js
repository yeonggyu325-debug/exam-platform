"use strict";

function renderAffiliationManager() {
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>소속 관리</h2>
        </div>
      </div>

      <form class="affiliation-add-form" onsubmit="addAffiliation(event)">
        <div class="field">
          <label for="newAffiliationName">새 소속명</label>
          <input id="newAffiliationName" name="affiliation" required>
        </div>
        <button class="btn primary" type="submit">소속 추가</button>
      </form>

      <div class="table-wrap" style="margin-top:16px">
        <table>
          <thead><tr><th>현재 선택 가능 소속</th><th>현재 응시자 수</th><th>관리</th></tr></thead>
          <tbody>
            ${managedAffiliations.map(dep => `
              <tr>
                <td>${escapeHtml(dep)}</td>
                <td>${getCandidateUsers().filter(user => user.department === dep).length}명</td>
                <td><button class="btn small danger" type="button" onclick="removeAffiliation('${escapeHtml(dep)}')">목록에서 제거</button></td>
              </tr>
            `).join("") || `<tr><td colspan="3" class="empty">등록된 소속이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function addAffiliation(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("affiliation") || "").trim();
  if (!name) return;
  if (managedAffiliations.includes(name)) {
    alert("이미 등록된 소속입니다.");
    return;
  }
  managedAffiliations.push(name);
  managedAffiliations.sort();
  savePersistentData();
  renderAdminDashboard();
}

function removeAffiliation(name) {
  if (!confirm(`${name} 소속을 선택 목록에서 제거할까요? 기존 응시자 기록의 소속 데이터는 유지됩니다.`)) return;
  managedAffiliations = managedAffiliations.filter(dep => dep !== name);
  savePersistentData();
  renderAdminDashboard();
}
