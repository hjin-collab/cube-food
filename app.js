'use strict';

/* ================= 기본 데이터 ================= */
const DEFAULT_INGREDIENTS = [
  // 베이스죽
  ['쌀죽', 'base', '🍚'], ['찹쌀', 'base', '🍙'], ['현미', 'base', '🌾'],
  ['오트밀', 'base', '🥣'], ['퀴노아', 'base', '🌱'],
  // 토핑
  ['소고기', 'topping', '🥩'], ['닭고기', 'topping', '🍗'], ['흰살생선', 'topping', '🐟'],
  ['두부', 'topping', ''], ['달걀노른자', 'topping', '🥚'], ['애호박', 'topping', '🥒'],
  ['브로콜리', 'topping', '🥦'], ['당근', 'topping', '🥕'], ['단호박', 'topping', '🎃'],
  ['고구마', 'topping', '🍠'], ['감자', 'topping', '🥔'], ['양배추', 'topping', '🥬'],
  ['시금치', 'topping', '🌿'], ['청경채', 'topping', '🥬'], ['비타민', 'topping', '🍃'],
  ['무', 'topping', ''], ['양파', 'topping', '🧅'], ['배', 'topping', '🍐'],
  ['사과', 'topping', '🍎'], ['바나나', 'topping', '🍌'],
];

const STORAGE_KEY = 'cube-baby-food-v1';

function defaultState() {
  return {
    settings: { keepDays: 14, alertDays: 3 },
    ingredients: DEFAULT_INGREDIENTS.map(([name, type, emoji], i) => ({ id: 'i' + i, name, type, emoji })),
    batches: [], // { id, ingId, made: 'YYYY-MM-DD', count, eaten }
  };
}

/* ================= 저장 ================= */
let state;
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : defaultState();
  } catch (e) {
    state = defaultState();
  }
  migrate();
}

// 기존 기록은 그대로 두고, 새 기능에 필요한 값만 보충합니다. (각 작업은 한 번만 실행)
function migrate() {
  state.done = state.done || {};
  let changed = false;
  // v2: 알레르기 기능 추가 — 현미를 알레르기로 표시
  if (!state.done.allergyV2) {
    const rice = state.ingredients.find((i) => i.name === '현미');
    if (rice) rice.allergy = true;
    state.done.allergyV2 = true;
    changed = true;
  }
  if (changed) save();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { alert('저장에 실패했어요.'); }
}

/* ================= 날짜 유틸 ================= */
const pad = (n) => String(n).padStart(2, '0');
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) {
  const d = parseDate(s); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function diffDays(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
function fmt(s) { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; }

/* ================= 계산 ================= */
const remaining = (b) => b.count - b.eaten;
const expireDate = (b) => addDays(b.made, state.settings.keepDays);
const daysLeft = (b) => diffDays(expireDate(b), todayStr());

function statusOf(b) {
  const left = daysLeft(b);
  if (left < 0) return 'bad';
  if (left <= state.settings.alertDays) return 'warn';
  return 'ok';
}
function ddayText(left) {
  if (left < 0) return `폐기 ${-left}일 지남`;
  if (left === 0) return '오늘 폐기';
  return `D-${left}`;
}
function activeBatches(ingId) {
  return state.batches
    .filter((b) => b.ingId === ingId && remaining(b) > 0)
    .sort((a, b) => a.made.localeCompare(b.made));
}
function ingById(id) { return state.ingredients.find((i) => i.id === id); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function iconHtml(ing) {
  return ing.emoji ? escapeHtml(ing.emoji) : `<span class="initial">${escapeHtml(ing.name.slice(0, 1))}</span>`;
}

/* ================= 메인 화면 ================= */
function render() {
  renderAllergyBar();
  renderAlerts();
  for (const type of ['base', 'topping']) {
    const grid = document.getElementById(type === 'base' ? 'gridBase' : 'gridTopping');
    grid.innerHTML = '';
    for (const ing of state.ingredients.filter((i) => i.type === type)) {
      const bs = activeBatches(ing.id);
      const total = bs.reduce((s, b) => s + remaining(b), 0);
      let cls = 'none', dday = '';
      if (bs.length) {
        const oldest = bs[0]; // 가장 먼저 만든 묶음 = 가장 먼저 폐기
        const st = statusOf(oldest);
        cls = st === 'ok' ? 'has' : st;
        dday = ddayText(daysLeft(oldest));
      }
      const el = document.createElement('button');
      el.className = `ing ${cls}${ing.allergy ? ' allergy' : ''}`;
      el.innerHTML = `
        <div class="circle">${iconHtml(ing)}${total ? `<span class="badge">${total}</span>` : ''}${ing.allergy ? '<span class="allergy-mark" aria-label="알레르기">!</span>' : ''}</div>
        <div class="ing-name">${escapeHtml(ing.name)}</div>
        <div class="ing-dday">${dday}</div>`;
      el.addEventListener('click', () => openIngredient(ing.id));
      grid.appendChild(el);
    }
  }
}

// 알레르기 재료는 항상 화면 맨 위에 고정 표시
function renderAllergyBar() {
  const bar = document.getElementById('allergyBar');
  const list = state.ingredients.filter((i) => i.allergy);
  if (!list.length) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `⚠️ <b>알레르기 주의</b> · ${list.map((i) => escapeHtml(i.name)).join(', ')}`;
}

function renderAlerts() {
  const box = document.getElementById('alerts');
  const items = state.batches
    .filter((b) => remaining(b) > 0 && statusOf(b) !== 'ok' && ingById(b.ingId))
    .sort((a, b) => a.made.localeCompare(b.made));
  if (!items.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h3>⏰ 폐기 임박 큐브</h3><ul>${items.map((b) => {
    const left = daysLeft(b);
    const ing = ingById(b.ingId);
    const msg = left < 0 ? `폐기일(${fmt(expireDate(b))}) 지남` : left === 0 ? '오늘 폐기' : `${left}일 후(${fmt(expireDate(b))}) 폐기`;
    return `<li class="${left < 0 ? 'bad' : ''}">${escapeHtml(ing.name)} ${remaining(b)}개 — ${msg}</li>`;
  }).join('')}</ul>`;
}

/* ================= 바텀시트 ================= */
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('backdrop');
const sheetBody = document.getElementById('sheetBody');

function openSheet(html) {
  sheetBody.innerHTML = html;
  sheet.hidden = false; backdrop.hidden = false;
  sheet.scrollTop = 0;
}
function closeSheet() { sheet.hidden = true; backdrop.hidden = true; render(); }
backdrop.addEventListener('click', closeSheet);

/* ---- 재료 상세 ---- */
function openIngredient(ingId, showPicker) {
  const ing = ingById(ingId);
  const bs = activeBatches(ingId);
  const pick = showPicker || bs.length === 0;

  let html = `<h2>${ing.emoji ? escapeHtml(ing.emoji) : ''} ${escapeHtml(ing.name)}</h2>`;
  html += ing.allergy
    ? `<div class="allergy-box">⚠️ 알레르기 반응이 있었던 재료예요
         <button class="btn small" id="btnAllergy">알레르기 해제</button></div>`
    : `<button class="btn small allergy-set" id="btnAllergy">⚠️ 알레르기로 표시</button>`;
  if (bs.length) {
    const total = bs.reduce((s, b) => s + remaining(b), 0);
    html += `<p class="sub">남은 큐브 <b>${total}개</b> · 먹은 큐브를 눌러서 체크하세요</p>`;
    for (const b of bs) {
      const st = statusOf(b);
      const left = daysLeft(b);
      html += `
        <div class="batch ${st === 'ok' ? '' : st}">
          <div class="batch-head">
            <span><b>${fmt(b.made)} 만듦</b> · ${remaining(b)}/${b.count}개 남음</span>
            <span class="tag ${st}">${ddayText(left)}</span>
          </div>
          <div class="cubes">
            ${Array.from({ length: b.count }, (_, i) =>
              `<button class="cube ${i < b.eaten ? 'eaten' : ''}" data-batch="${b.id}" data-idx="${i}" aria-label="큐브 ${i + 1}"></button>`).join('')}
          </div>
          <p class="hint">폐기일 ${fmt(expireDate(b))}</p>
          <div class="batch-actions">
            <button class="btn small danger" data-del="${b.id}">${st === 'bad' ? '🗑 폐기' : '삭제'}</button>
          </div>
        </div>`;
    }
  }

  if (pick) {
    html += `
      <div id="picker">
        <p class="sub" style="margin-top:14px">${bs.length ? '새로 만든' : '오늘 만든'} 큐브 개수를 눌러주세요</p>
        <div class="row">만든 날짜 <input type="date" id="madeDate" value="${todayStr()}" max="${todayStr()}"></div>
        <div class="numgrid">
          ${Array.from({ length: 20 }, (_, i) => `<button data-num="${i + 1}">${i + 1}</button>`).join('')}
        </div>
      </div>`;
  } else {
    html += `<button class="btn primary block" id="btnNew">＋ 큐브 새로 만들기</button>`;
  }
  html += `<button class="btn block" id="btnClose">닫기</button>`;
  openSheet(html);

  document.getElementById('btnAllergy').addEventListener('click', () => {
    const msg = ing.allergy
      ? `'${ing.name}'의 알레르기 표시를 해제할까요?`
      : `'${ing.name}'을(를) 알레르기 재료로 표시할까요?\n화면 맨 위와 아이콘에 경고가 표시돼요.`;
    if (!confirm(msg)) return;
    ing.allergy = !ing.allergy;
    save(); render(); openIngredient(ingId);
  });
  sheetBody.querySelectorAll('.cube').forEach((el) =>
    el.addEventListener('click', () => toggleCube(el.dataset.batch, Number(el.dataset.idx), ingId)));
  sheetBody.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', () => {
      if (!confirm('이 묶음을 삭제할까요?')) return;
      state.batches = state.batches.filter((b) => b.id !== el.dataset.del);
      save(); openIngredient(ingId);
    }));
  sheetBody.querySelectorAll('[data-num]').forEach((el) =>
    el.addEventListener('click', () => {
      const made = document.getElementById('madeDate').value || todayStr();
      state.batches.push({ id: 'b' + Date.now(), ingId, made, count: Number(el.dataset.num), eaten: 0 });
      save(); openIngredient(ingId);
    }));
  const btnNew = document.getElementById('btnNew');
  if (btnNew) btnNew.addEventListener('click', () => {
    openIngredient(ingId, true);
    document.getElementById('picker').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btnClose').addEventListener('click', closeSheet);
}

// 큐브를 누르면: 안 먹은 큐브 → 거기까지 먹음 처리 / 먹은 큐브 → 거기부터 다시 안 먹음
function toggleCube(batchId, idx, ingId) {
  const b = state.batches.find((x) => x.id === batchId);
  if (!b) return;
  b.eaten = idx < b.eaten ? idx : idx + 1;
  save();
  if (remaining(b) === 0) {
    // 다 먹으면 목록에서 사라지므로 잠깐 보여준 뒤 갱신
    setTimeout(() => openIngredient(ingId), 250);
    sheetBody.querySelectorAll(`[data-batch="${batchId}"]`).forEach((c) => c.classList.add('eaten'));
  } else {
    openIngredient(ingId);
  }
}

/* ---- 설정 ---- */
function openSettings() {
  const s = state.settings;
  const list = (type) => state.ingredients.filter((i) => i.type === type).map((i) => `
    <div class="list-item">
      <span style="width:28px;text-align:center">${i.emoji ? escapeHtml(i.emoji) : '·'}</span>
      <span class="grow">${escapeHtml(i.name)}</span>
      <button class="btn small danger" data-rm="${i.id}">삭제</button>
    </div>`).join('');

  openSheet(`
    <div class="settings">
      <h2>⚙️ 설정</h2>
      <h3>보관 / 알림</h3>
      <div class="row">보관 기간 <input type="number" id="keepDays" min="1" max="60" value="${s.keepDays}" style="width:70px"> 일</div>
      <div class="row">폐기 <input type="number" id="alertDays" min="0" max="14" value="${s.alertDays}" style="width:70px"> 일 전부터 알림</div>

      <h3>재료 추가</h3>
      <div class="row">
        <input type="text" id="newEmoji" placeholder="🥑" style="width:56px;text-align:center">
        <input type="text" id="newName" placeholder="재료 이름" style="flex:1;min-width:0">
      </div>
      <div class="row">
        <select id="newType"><option value="topping">토핑</option><option value="base">베이스죽</option></select>
        <button class="btn primary small" id="btnAdd">추가</button>
      </div>

      <h3>베이스죽</h3>${list('base')}
      <h3>토핑</h3>${list('topping')}

      <h3>초기화</h3>
      <p class="note">큐브 기록과 재료 목록을 처음 상태로 되돌립니다.</p>
      <button class="btn danger block" id="btnReset">전체 초기화</button>
      <button class="btn block" id="btnClose">닫기</button>
    </div>`);

  const num = (id, min, max, fallback) => {
    const v = parseInt(document.getElementById(id).value, 10);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  };
  document.getElementById('keepDays').addEventListener('change', () => { s.keepDays = num('keepDays', 1, 60, 14); save(); });
  document.getElementById('alertDays').addEventListener('change', () => { s.alertDays = num('alertDays', 0, 14, 3); save(); });
  document.getElementById('btnAdd').addEventListener('click', () => {
    const name = document.getElementById('newName').value.trim();
    if (!name) return alert('재료 이름을 입력해주세요.');
    state.ingredients.push({
      id: 'i' + Date.now(), name,
      type: document.getElementById('newType').value,
      emoji: document.getElementById('newEmoji').value.trim(),
    });
    save(); openSettings();
  });
  sheetBody.querySelectorAll('[data-rm]').forEach((el) => el.addEventListener('click', () => {
    const ing = ingById(el.dataset.rm);
    const has = activeBatches(ing.id).length > 0;
    if (!confirm(`'${ing.name}'을(를) 삭제할까요?${has ? '\n남아있는 큐브 기록도 함께 삭제돼요.' : ''}`)) return;
    state.ingredients = state.ingredients.filter((i) => i.id !== ing.id);
    state.batches = state.batches.filter((b) => b.ingId !== ing.id);
    save(); openSettings();
  }));
  document.getElementById('btnReset').addEventListener('click', () => {
    if (!confirm('정말 모든 기록을 지우고 초기화할까요?')) return;
    state = defaultState(); save(); closeSheet();
  });
  document.getElementById('btnClose').addEventListener('click', closeSheet);
}
document.getElementById('btnSettings').addEventListener('click', openSettings);

/* ================= 시작 ================= */
load();
render();
// 앱을 다시 열었을 때(날짜가 바뀌었을 수 있으니) 화면 갱신
document.addEventListener('visibilitychange', () => { if (!document.hidden && sheet.hidden) render(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
