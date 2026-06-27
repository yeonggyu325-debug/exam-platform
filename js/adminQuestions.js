"use strict";

// 책임: 문제은행 목록, 추가/수정/비활성화 모달

function renderQuestionManager() {
  const categoryCounts = getCategoryCounts();
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>문제은행 관리</h2>
        </div>
        <button class="btn primary" type="button" onclick="openQuestionModal()">문제 추가</button>
      </div>

      ${getQuotaWarnings().length ? `<div class="notice danger">${getQuotaWarnings().map(escapeHtml).join("<br>")}</div><br>` : ""}

      <div class="grid three">
        ${categoryCounts.map(item => `
          <div class="metric">
            <div class="label">${escapeHtml(item.category)}</div>
            <div class="value">${item.count}</div>
            <div class="sub">활성 문항</div>
          </div>
        `).join("")}
      </div>

      <br>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>카테고리</th><th>문제 문장</th><th>정답</th><th>상태</th><th>관리</th></tr>
          </thead>
          <tbody>
            ${questionBank.map(q => `
              <tr>
                <td>${q.id}</td>
                <td>${escapeHtml(q.category)}</td>
                <td>${escapeHtml(q.text)}</td>
                <td>${Number(q.answerIndex) + 1}번</td>
                <td><span class="badge ${q.active ? "success" : "danger"}">${q.active ? "사용" : "비활성"}</span></td>
                <td>
                  <button class="btn small" type="button" onclick="openQuestionModal(${q.id})">수정</button>
                  <button class="btn small" type="button" onclick="toggleQuestionStatus(${q.id})">${q.active ? "비활성" : "활성"}</button>
                  <button class="btn small danger" type="button" onclick="deleteQuestion(${q.id})">삭제</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function openQuestionModal(questionId = null) {
  const q = questionBank.find(item => item.id === questionId) || {
    id: "", category: "안전보건",
    text: "", options: ["", "", "", "", ""], answerIndex: 0, active: true
  };

  modalRoot.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="questionModalTitle">
      <section class="modal">
        <h2 id="questionModalTitle">${questionId ? "문제 수정" : "문제 추가"}</h2>
        <form class="question-form" onsubmit="${questionId ? `updateQuestion(event, ${questionId})` : "addQuestion(event)"}">
          <div class="field">
            <label for="qCategory">카테고리</label>
            <input id="qCategory" name="category" required value="${escapeHtml(q.category)}">
          </div>
          <div class="field">
            <label for="qText">문제 문장</label>
            <textarea id="qText" name="text" required>${escapeHtml(q.text)}</textarea>
          </div>
          ${[0, 1, 2, 3, 4].map(i => `
            <div class="field option-field">
              <div class="option-answer-row">
                <label class="answer-choice" for="qAnswer${i}" aria-label="${i + 1}번을 정답으로 선택">
                  <input id="qAnswer${i}" name="answerIndex" type="radio" value="${i}" required ${Number(q.answerIndex) === i ? "checked" : ""}>
                  <span>${i + 1}</span>
                </label>
                <input id="qOption${i}" name="option${i}" required
                  value="${escapeHtml(q.options[i] || "")}">
              </div>
            </div>
          `).join("")}
          <div class="field">
            <label for="qActive">사용 여부</label>
            <select id="qActive" name="active">
              ${optionHtml("true",  String(q.active), "사용")}
              ${optionHtml("false", String(q.active), "비활성")}
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" onclick="closeModal()">취소</button>
            <button class="btn primary" type="submit">저장</button>
          </div>
        </form>
      </section>
    </div>
  `;
  setTimeout(() => document.getElementById("qCategory")?.focus(), 0);
}

function readQuestionForm(event) {
  const form = new FormData(event.currentTarget);
  const answerIndexRaw = form.get("answerIndex");
  if (answerIndexRaw === null) {
    alert("정답으로 사용할 번호를 1개 선택해 주세요.");
    return null;
  }
  return {
    category:    String(form.get("category")).trim(),
    difficulty:  "기본",
    text:        String(form.get("text")).trim(),
    options:     [0, 1, 2, 3, 4].map(i => String(form.get(`option${i}`)).trim()),
    answerIndex: Number(answerIndexRaw),
    active:      String(form.get("active")) === "true"
  };
}

function addQuestion(event) {
  event.preventDefault();
  const data = readQuestionForm(event);
  if (!data) return;
  questionBank.push({ id: nextId(questionBank, "id"), ...data });
  savePersistentData();
  closeModal();
  renderAdminDashboard();
}

function updateQuestion(event, id) {
  event.preventDefault();
  const data = readQuestionForm(event);
  if (!data) return;
  questionBank = questionBank.map(q => q.id === id ? { ...q, ...data } : q);
  savePersistentData();
  closeModal();
  renderAdminDashboard();
}

function toggleQuestionStatus(id) {
  questionBank = questionBank.map(q => q.id === id ? { ...q, active: !q.active } : q);
  savePersistentData();
  renderAdminDashboard();
}

function deleteQuestion(id) {
  const q = questionBank.find(item => item.id === id);
  if (!q) return;
  if (!confirm("선택한 문제를 삭제할까요?")) return;
  questionBank = questionBank.filter(item => item.id !== id);
  savePersistentData();
  renderAdminDashboard();
}
