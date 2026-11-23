'use strict';
/* ================= 여행 계획 탭 =================
 * 가정: 큐브는 만든 날 + 보관기간(기본 14일)에 폐기, 여행 중에는 집 큐브를 먹지 않음.
 * 출발 전까지 하루 먹는 양만큼, 폐기일이 빠른 큐브부터 먹는다고 계산합니다.
 * (app.js의 state, 날짜 함수들을 그대로 사용)
 */
const CATS = [
  { key: 'base', label: '베이스죽', def: 2 },
  { key: 'topping', label: '토핑', def: 4 },
  { key: 'snack', label: '간식', def: 0 },
];

function tripState() {
  if (!state.trip) state.trip = {};
  const t = state.trip;
  if (!t.rate) t.rate = {};
  for (const c of CATS) if (t.rate[c.key] === undefined) t.rate[c.key] = c.def;
  return t;
}

/* ---- 계산 ---- */
function planTrip(start, end) {
  const today = todayStr();
  const keep = state.settings.keepDays;
  const t = tripState();
  const daysBefore = Math.max(0, diffDays(start, today)); // 오늘 ~ 출발 전날
  const result = { daysBefore, tripDays: diffDays(end, start) + 1, cats: {} };

  for (const c of CATS) {
    const rate = t.rate[c.key] || 0;
    const pool = state.batches
      .filter((b) => remaining(b) > 0)
      .map((b) => ({ b, ing: ingById(b.ingId), left: remaining(b), eat: 0, exp: expireDate(b) }))
      .filter((x) => x.ing && x.ing.type === c.key)
      .sort((x, y) => x.exp.localeCompare(y.exp));
    const edible = pool.filter((x) => !x.ing.allergy);

    // 출발 전까지 하루씩 먹기 (폐기일 전날까지 먹을 수 있음, 폐기일 빠른 순)
    let short = 0;
    for (let i = 0; i < daysBefore; i++) {
      const day = addDays(today, i);
      let need = rate;
      for (const x of edible) {
        if (!need) break;
        if (x.left > 0 && day < x.exp) { const n = Math.min(need, x.left); x.left -= n; x.eat += n; need -= n; }
      }
      short += need;
    }

    const eatBefore = edible.filter((x) => x.eat > 0);
    const toss = pool.filter((x) => x.left > 0 && x.exp <= end);    // 돌아오기 전 폐기일 도래
    const keepAfter = pool.filter((x) => x.left > 0 && x.exp > end); // 돌아와서도 사용 가능
    const leftAfter = keepAfter.filter((x) => !x.ing.allergy).reduce((s, x) => s + x.left, 0);

    // 돌아와서 만들 재료 추천: 예전에 만든 적 있고(알레르기 제외) 돌아왔을 때 남는 게 없는 재료, 최근에 만든 순
    const stillHave = new Set(keepAfter.map((x) => x.ing.id));
    const lastMade = {};
    for (const b of state.batches) {
      const ing = ingById(b.ingId);
      if (ing && ing.type === c.key && !ing.allergy && (!lastMade[ing.id] || b.made > lastMade[ing.id])) lastMade[ing.id] = b.made;
    }
    const remake = Object.keys(lastMade)
      .filter((id) => !stillHave.has(id))
      .sort((a, b) => lastMade[b].localeCompare(lastMade[a]))
      .map(ingById);

    result.cats[c.key] = { ...c, rate, eatBefore, toss, keepAfter, leftAfter, short, remake,
      safeMakeDate: addDays(end, -keep + 1), // 이 날 이후 만든 큐브는 돌아온 뒤에도 사용 가능
      coverDays: rate > 0 ? Math.floor(leftAfter / rate) : null };
  }
  return result;
}

/* ---- 화면 ---- */
function renderTrip() {
  const view = document.getElementById('viewTrip');
  const t = tripState();
  const today = todayStr();
  view.innerHTML = `
    <div class="card">
      <h3>✈️ 여행 일정</h3>
      <div class="row"><label>출발일</label><input type="date" id="tripStart" min="${today}" value="${t.start || ''}"></div>
      <div class="row"><label>돌아오는 날</label><input type="date" id="tripEnd" min="${today}" value="${t.end || ''}"></div>
      <h3 style="margin-top:14px">🥄 하루에 먹는 큐브 수</h3>
      ${CATS.map((c) => `<div class="row"><label>${c.label}</label>
        <input type="number" class="rate" data-cat="${c.key}" min="0" max="20" value="${t.rate[c.key]}" style="width:70px"> 개</div>`).join('')}
      <p class="note">보관 ${state.settings.keepDays}일 기준 · 여행 중에는 집에 있는 큐브를 먹지 않는다고 계산해요.</p>
    </div>
    <div id="tripResult"></div>`;

  const update = () => {
    t.start = document.getElementById('tripStart').value;
    t.end = document.getElementById('tripEnd').value;
    view.querySelectorAll('.rate').forEach((el) => {
      const v = parseInt(el.value, 10);
      t.rate[el.dataset.cat] = Number.isFinite(v) ? Math.min(20, Math.max(0, v)) : 0;
    });
    save();
    renderTripResult();
  };
  view.querySelectorAll('input').forEach((el) => el.addEventListener('change', update));
  renderTripResult();
}

function renderTripResult() {
  const box = document.getElementById('tripResult');
  const t = tripState();
  const today = todayStr();
  if (!t.start || !t.end) { box.innerHTML = '<p class="note" style="text-align:center">출발일과 돌아오는 날을 선택하면 계획을 보여드려요.</p>'; return; }
  if (t.end < t.start) { box.innerHTML = '<p class="note" style="text-align:center;color:var(--bad)">돌아오는 날이 출발일보다 빨라요.</p>'; return; }
  if (t.end < today) { box.innerHTML = '<p class="note" style="text-align:center">이미 지난 여행이에요.</p>'; return; }

  const r = planTrip(t.start, t.end);
  const cats = CATS.map((c) => r.cats[c.key]);
  const name = (x) => `${x.ing.emoji ? escapeHtml(x.ing.emoji) + ' ' : ''}${escapeHtml(x.ing.name)}`;
  const li = (left, right) => `<li><span>${left}</span><span class="meta">${right}</span></li>`;
  let html = `<div class="card trip-summary">
    📅 ${fmt(t.start)} ~ ${fmt(t.end)} · <b>${r.tripDays}일</b> 여행<br>
    ${r.daysBefore > 0 ? `출발까지 <b>${r.daysBefore}일</b> 남았어요` : '오늘 출발이에요'}</div>`;

  // 1. 출발 전에 먼저 먹을 것
  const eat = cats.flatMap((c) => c.eatBefore.map((x) => ({ ...x, cat: c.label })));
  if (eat.length) {
    html += `<div class="card eat"><h3>🍽 출발 전까지 먼저 먹을 것</h3><ul class="plan-list">${
      eat.sort((a, b) => a.exp.localeCompare(b.exp)).map((x) =>
        li(`${name(x)} <b>${x.eat}개</b><span class="pill">${x.cat}</span>`, `폐기일 ${fmt(x.exp)}`)).join('')
    }</ul><p class="note">폐기일이 빠른 순서예요. 이 순서대로 먹으면 버리는 양이 가장 적어요.</p></div>`;
  }

  // 2. 여행 중 폐기될 것
  const toss = cats.flatMap((c) => c.toss);
  if (toss.length) {
    html += `<div class="card toss"><h3>🗑 다 못 먹고 버리게 될 것</h3><ul class="plan-list">${
      toss.map((x) => li(`${name(x)} <b>${x.left}개</b>${x.ing.allergy ? '<span class="pill">알레르기·먹이지 않음</span>' : ''}`,
        x.exp <= t.start ? `${fmt(x.exp)} 폐기 (출발 전)` : `${fmt(x.exp)} 폐기 (여행 중)`)).join('')
    }</ul><p class="note">하루 먹는 양을 늘리거나, 여행에 가져가면 줄일 수 있어요.</p></div>`;
  }

  // 3. 돌아와서도 쓸 수 있는 것
  const keepAfter = cats.flatMap((c) => c.keepAfter);
  if (keepAfter.length) {
    html += `<div class="card keep"><h3>✅ 돌아와서도 먹을 수 있는 것</h3><ul class="plan-list">${
      keepAfter.map((x) => li(`${name(x)} <b>${x.left}개</b>${x.ing.allergy ? '<span class="pill">알레르기·먹이지 않음</span>' : ''}`,
        `${fmt(x.exp)}까지 (돌아와서 ${diffDays(x.exp, t.end)}일)`)).join('')
    }</ul></div>`;
  }

  if (!eat.length && !toss.length && !keepAfter.length) {
    html += '<div class="card"><p class="advice">지금 남아 있는 큐브가 없어요.</p></div>';
  }

  // 4. 만들기 추천
  let make = '';
  for (const c of cats) {
    if (!c.rate && !c.remake.length) continue;
    let s = '';
    if (c.short > 0) {
      s += `<p class="advice">• 출발 전까지 <b>${c.label} ${c.short}개</b>가 부족해요. `;
      s += c.safeMakeDate <= today
        ? '지금 만들어도 돌아온 뒤까지 쓸 수 있어요.</p>'
        : `<b>${fmt(c.safeMakeDate)} 이후</b>에 만들면 돌아와서도 쓸 수 있고, 그 전에 만들면 출발 전에 먹을 만큼만 만드세요.</p>`;
    }
    if (c.rate > 0) {
      if (c.leftAfter <= 0) s += `<p class="advice">• 돌아오면 ${c.label}이 없어요. <b>돌아온 날(${fmt(t.end)}) 바로</b> 만들어야 해요.</p>`;
      else s += `<p class="advice">• 돌아와서 ${c.label} ${c.leftAfter}개 → 약 ${c.coverDays}일분. <b>${fmt(addDays(t.end, c.coverDays))}까지</b> 새로 만드세요.</p>`;
    }
    if (c.remake.length) {
      s += `<p class="advice">• 다시 만들 ${c.label}: ${c.remake.slice(0, 6).map((i, n) => `${n + 1}. ${escapeHtml(i.name)}`).join(' · ')}</p>`;
    }
    if (s) make += `<h3 style="font-size:14px;margin:10px 0 2px">${c.label}</h3>${s}`;
  }
  if (make) {
    html += `<div class="card make"><h3>🧑‍🍳 만들기 추천</h3>${make}
      <p class="note">'다시 만들 재료'는 예전에 만든 적 있고 돌아왔을 때 남는 게 없는 재료예요. 최근에 만든 순서이고, 알레르기 재료는 빠져 있어요.</p></div>`;
  }
  box.innerHTML = html;
}

/* ---- 탭 전환 ---- */
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === tab));
  for (const id of ['viewCubes', 'viewTrip']) document.getElementById(id).hidden = id !== tab.dataset.view;
  if (tab.dataset.view === 'viewTrip') renderTrip(); else render();
  window.scrollTo(0, 0);
}));
