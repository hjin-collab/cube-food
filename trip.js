'use strict';
/* ================= 여행 계획 탭 =================
 * 뿐이 식단표(plan.js)대로 먹는다고 보고 계산합니다.
 * - 출발 전까지: 날짜별 식단의 큐브를 기한이 빠른 묶음부터 사용 (폐기일 = 만든 날 + 14일, 당일까지 먹음)
 * - 여행 중: 집에 있는 큐브는 먹지 않음
 * - 돌아온 뒤 보관기간(기본 14일) 동안: 남은 큐브를 쓰고, 모자라는 재료를 필요한 날짜순으로 추천
 */
function tripState() {
  if (!state.trip) state.trip = {};
  return state.trip;
}

// 만드는 날(make)에 만든 큐브는 (make ~ make+보관기간) 동안 먹을 수 있음 (폐기일 당일 포함).
// 만드는 날 전까지는 지금 있는 큐브로 식단대로 먹고, 그 뒤 모자라는 개수를 계산.
// 그 기간 중 여행 날짜를 빼고 식단대로 먹어 보고, 기존 큐브로 모자라는 개수 = 오늘 만들면 되는 개수
function planTrip(start, end, skipToday, make) {
  const today = todayStr();
  const from = skipToday ? addDays(today, 1) : today;
  const lastUse = addDays(make, state.settings.keepDays); // 만든 큐브의 폐기일 (당일까지 먹음)
  const pool = cubePool();
  const none = { short: {}, blocked: {} };
  const max = (a, b) => (a > b ? a : b), min = (a, b) => (a < b ? a : b);
  // 만드는 날 전까지: 지금 있는 큐브로 먹기 (여행 날짜는 빼고). 여기서 모자라는 건 새 큐브로 못 채움
  const gapEnd = min(addDays(make, -1), addDays(start, -1));
  const gap = from <= gapEnd ? simulate(pool, from, gapEnd) : none;
  const gap2From = max(from, addDays(end, 1)), gap2End = addDays(make, -1);
  const gap2 = gap2From <= gap2End ? simulate(pool, gap2From, gap2End) : none;
  // 만든 큐브로 먹는 기간: 여행 전 / 다녀와서
  const preFrom = max(from, make), preEnd = addDays(start, -1);
  const pre = preFrom <= preEnd ? simulate(pool, preFrom, preEnd) : none;
  const postFrom = max(max(from, make), addDays(end, 1));
  const post = postFrom <= lastUse ? simulate(pool, postFrom, lastUse) : none;
  const gapShort = [...new Set([...Object.keys(gap.short), ...Object.keys(gap2.short)])];
  const names = new Set([...Object.keys(pre.short), ...Object.keys(post.short)]);
  const items = [...names].map((name) => {
    const a = pre.short[name], b = post.short[name];
    return { name, pre: a ? a.count : 0, post: b ? b.count : 0, first: (a || b).first, base: (a || b).base };
  }).sort((x, y) => x.first.localeCompare(y.first) || y.pre + y.post - x.pre - x.post);
  return {
    lastUse, gapShort, noPost: postFrom > lastUse,
    beforeTrip: items.filter((x) => x.pre > 0),               // 1. 여행 전에 먹여야 해서 만들 것
    afterTrip: items.filter((x) => x.pre === 0 && x.post > 0), // 2. 다녀와서 바로 먹일 것, 미리 만들면 이득
    blocked: [...new Set([gap, gap2, pre, post].flatMap((x) => Object.keys(x.blocked)))],
  };
}

/* ---- 화면 ---- */
function renderTrip() {
  const view = document.getElementById('viewTrip');
  const t = tripState();
  const today = todayStr();
  view.innerHTML = `
    <div class="card">
      <h3>✈️ 여행 일정</h3>
      <div class="row"><label>만드는 날</label><input type="date" id="tripMake" min="${today}" value="${t.make && t.make >= today ? t.make : today}"></div>
      <div class="row"><label>출발일</label><input type="date" id="tripStart" min="${today}" value="${t.start || ''}"></div>
      <div class="row"><label>돌아오는 날</label><input type="date" id="tripEnd" min="${today}" value="${t.end || ''}"></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="skipToday" ${t.skipToday === today ? 'checked' : ''}> 오늘 끼니는 이미 먹었어요</label>
    </div>
    <div id="tripResult"></div>`;
  const update = () => {
    t.make = document.getElementById('tripMake').value || today;
    t.start = document.getElementById('tripStart').value;
    t.end = document.getElementById('tripEnd').value;
    t.skipToday = document.getElementById('skipToday').checked ? today : '';
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
  if (!t.start || !t.end) { box.innerHTML = '<p class="note" style="text-align:center">출발일과 돌아오는 날을 선택하세요.</p>'; return; }
  if (t.end < t.start) { box.innerHTML = '<p class="note" style="text-align:center;color:var(--bad)">돌아오는 날이 출발일보다 빨라요.</p>'; return; }
  if (t.end < today) { box.innerHTML = '<p class="note" style="text-align:center">이미 지난 여행이에요.</p>'; return; }

  const make = t.make && t.make >= today ? t.make : today;
  const r = planTrip(t.start, t.end, t.skipToday === today, make);
  const label = (name) => { const i = ingByName(name); return i ? `${i.emoji ? escapeHtml(i.emoji) + ' ' : ''}${escapeHtml(i.name)}` : escapeHtml(name); };
  const row = (x, detail) => `<li class="make-row"><span class="make-name">${label(x.name)}</span>
    <span class="make-count">${x.pre + x.post}개</span><span class="make-detail">${detail}</span></li>`;

  let html = `<p class="trip-line">출발 <b>D+${dOf(t.start)}</b> (${fmt(t.start)}) → 돌아옴 <b>D+${dOf(t.end)}</b> (${fmt(t.end)})<br>
    <b>${make === today ? '오늘' : fmt(make)}</b> 만든 큐브는 <b>${fmt(r.lastUse)}</b>까지 먹을 수 있어요</p>`;
  if (r.gapShort.length) {
    html += `<p class="note" style="color:var(--bad)">⚠️ 만드는 날 전에 이미 모자라는 재료: ${r.gapShort.map(escapeHtml).join(', ')}</p>`;
  }

  html += `<div class="card make-card"><h3>1️⃣ 여행 가기 전에 먹여야 해서 만들 것</h3>`;
  html += r.beforeTrip.length
    ? `<ul class="plan-list">${r.beforeTrip.map((x) => row(x,
        x.post ? `여행 전 ${x.pre} + 다녀와서 ${x.post}` : `여행 전 ${x.pre}`)).join('')}</ul>`
    : '<p class="advice">없어요. 지금 있는 큐브로 충분해요.</p>';
  html += '</div>';

  html += `<div class="card make-card"><h3>2️⃣ 다녀와서 바로 먹일 것 (미리 만들면 이득)</h3>`;
  if (r.noPost) {
    html += `<p class="advice">이 날 만들면 돌아오기 전에 보관기간이 끝나요. 다녀와서 만드세요.</p>`;
  } else {
    html += r.afterTrip.length
      ? `<ul class="plan-list">${r.afterTrip.map((x) => row(x, `D+${dOf(x.first)} (${fmt(x.first)})부터`)).join('')}</ul>`
      : '<p class="advice">없어요.</p>';
  }
  html += '</div>';

  if (r.blocked.length) {
    html += `<p class="note">⚠️ 식단표의 알레르기 재료(${r.blocked.map(escapeHtml).join(', ')})는 계산에서 뺐어요. ⚙️ 설정 → 대체 재료에서 바꿀 수 있어요.</p>`;
  }
  html += `<p class="note">뿐이 식단표대로, 지금 있는 큐브를 먼저 쓰고 모자라는 개수예요. 여행 중에는 먹지 않는다고 계산해요.</p>`;
  box.innerHTML = html;
}

/* ---- 탭 전환 ---- */
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === tab));
  for (const id of ['viewCubes', 'viewTrip']) document.getElementById(id).hidden = id !== tab.dataset.view;
  if (tab.dataset.view === 'viewTrip') renderTrip(); else render();
  window.scrollTo(0, 0);
}));
