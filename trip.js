'use strict';
/* ================= 여행 계획 탭 =================
 * 뿐이 식단표(plan.js)대로 먹는다고 보고 계산합니다.
 * - 출발 전까지: 날짜별 식단의 큐브를 폐기일 빠른 묶음부터 사용
 * - 여행 중: 집에 있는 큐브는 먹지 않음
 * - 돌아온 뒤 보관기간(기본 14일) 동안: 남은 큐브를 쓰고, 모자라는 재료를 필요한 날짜순으로 추천
 */
function tripState() {
  if (!state.trip) state.trip = {};
  return state.trip;
}
const dLabel = (date) => `D+${dOf(date)}(${fmt(date)})`;

function planTrip(start, end, skipToday) {
  const today = todayStr();
  const keep = state.settings.keepDays;
  const pool = cubePool();
  const from = skipToday ? addDays(today, 1) : today;

  // 1) 출발 전
  const before = from < start ? simulate(pool, from, addDays(start, -1)) : { short: {}, blocked: {}, noPlan: 0 };
  const eatBefore = pool.filter((x) => x.used > 0).map((x) => ({ ...x, n: x.used }));
  // 2) 버리게 될 것 (돌아오는 날까지 폐기일이 오는 남은 큐브)
  const toss = pool.filter((x) => x.left > 0 && x.exp <= end);
  // 3) 돌아와서 남는 것
  const keepAfter = pool.filter((x) => x.left > 0 && x.exp > end).map((x) => ({ ...x, n: x.left }));
  pool.forEach((x) => { x.used = 0; });
  // 4) 돌아온 다음 날부터 보관기간 동안 식단대로 → 부족한 재료 = 만들 순서
  const afterFrom = addDays(end, 1), afterTo = addDays(end, keep);
  const after = simulate(pool, afterFrom, afterTo);
  const unused = pool.filter((x) => x.left > 0 && x.exp > end && x.exp <= afterTo); // 식단에 안 쓰여 폐기
  return { before, eatBefore, toss, keepAfter, after, unused, afterFrom, afterTo, from };
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
      <label class="row" style="gap:8px"><input type="checkbox" id="skipToday" ${t.skipToday === today ? 'checked' : ''}> 오늘 끼니는 이미 먹었어요 (오늘 제외)</label>
      <p class="note">뿐이 식단표(D+${PLAN_FIRST}~${PLAN_LAST})대로 먹고, 여행 중에는 집 큐브를 먹지 않는다고 계산해요. 보관 ${state.settings.keepDays}일 기준.</p>
    </div>
    <div id="tripResult"></div>`;

  const update = () => {
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
  if (!t.start || !t.end) { box.innerHTML = '<p class="note" style="text-align:center">출발일과 돌아오는 날을 선택하면 계획을 보여드려요.</p>'; return; }
  if (t.end < t.start) { box.innerHTML = '<p class="note" style="text-align:center;color:var(--bad)">돌아오는 날이 출발일보다 빨라요.</p>'; return; }
  if (t.end < today) { box.innerHTML = '<p class="note" style="text-align:center">이미 지난 여행이에요.</p>'; return; }

  const r = planTrip(t.start, t.end, t.skipToday === today);
  const nm = (ing) => `${ing.emoji ? escapeHtml(ing.emoji) + ' ' : ''}${escapeHtml(ing.name)}`;
  const nmByName = (name) => { const i = ingByName(name); return i ? nm(i) : escapeHtml(name); };
  const li = (left, right) => `<li><span>${left}</span><span class="meta">${right}</span></li>`;
  const sortShort = (o) => Object.values(o).sort((a, b) => a.first.localeCompare(b.first) || b.count - a.count);
  const days = diffDays(t.end, t.start) + 1;

  let html = `<div class="card trip-summary">
    📅 출발 <b>${dLabel(t.start)}</b> → 돌아옴 <b>${dLabel(t.end)}</b> · ${days}일<br>
    ${diffDays(t.start, today) > 0 ? `출발까지 <b>${diffDays(t.start, today)}일</b> 남았어요` : '오늘 출발이에요'}</div>`;

  // 1. 출발 전 먹을 것
  if (r.eatBefore.length) {
    html += `<div class="card eat"><h3>🍽 출발 전까지 식단대로 먹을 큐브</h3><ul class="plan-list">${
      r.eatBefore.map((x) => li(`${nm(x.ing)} <b>${x.n}개</b>`, `폐기일 ${fmt(x.exp)}`)).join('')}</ul></div>`;
  }
  // 2. 출발 전 부족
  const sb = sortShort(r.before.short);
  const safe = addDays(t.end, -state.settings.keepDays + 1); // 이 날 이후 만든 큐브는 돌아온 뒤에도 사용 가능
  if (sb.length) {
    html += `<div class="card make"><h3>🧑‍🍳 출발 전에 모자라는 것</h3><ul class="plan-list">${
      sb.map((s) => li(`${nmByName(s.name)} <b>${s.count}개</b>`, `${dLabel(s.first)}부터 필요`)).join('')}</ul>
      <p class="note">${safe <= today ? '지금 만들면 돌아와서도 남은 큐브를 쓸 수 있어요.' : `${fmt(safe)} 이후에 만든 큐브는 돌아와서도 쓸 수 있어요.`}
      출발 전에 넉넉히 만들면 아래 '돌아와서 만들 순서'에서 그만큼 줄어요.</p></div>`;
  }
  // 3. 버리게 될 것
  const toss = [...r.toss.map((x) => ({ x, why: x.exp <= t.start ? '출발 전 폐기일' : '여행 중 폐기일' })),
    ...r.unused.map((x) => ({ x, why: '돌아와서 폐기일 전까지 다 못 씀' }))];
  if (toss.length) {
    html += `<div class="card toss"><h3>🗑 다 못 먹고 버리게 될 것</h3><ul class="plan-list">${
      toss.map(({ x, why }) => li(`${nm(x.ing)} <b>${x.left}개</b>`, `${fmt(x.exp)} · ${why}`)).join('')}</ul>
      <p class="note">식단표 외에 더 먹이거나, 여행에 가져가면 줄일 수 있어요.</p></div>`;
  }
  // 4. 돌아와서 남는 것
  if (r.keepAfter.length) {
    html += `<div class="card keep"><h3>✅ 돌아와서도 남는 큐브</h3><ul class="plan-list">${
      r.keepAfter.map((x) => li(`${nm(x.ing)} <b>${x.n}개</b>`, `${fmt(x.exp)}까지`)).join('')}</ul></div>`;
  }
  // 5. 돌아와서 만들 순서
  const sa = sortShort(r.after.short);
  html += `<div class="card make"><h3>🧑‍🍳 돌아와서 만들 순서</h3>`;
  if (sa.length) {
    html += `<ul class="plan-list">${sa.map((s, k) =>
      li(`${k + 1}. ${nmByName(s.name)} <b>${s.count}개</b>`, `${dLabel(s.first)}까지`)).join('')}</ul>
      <p class="note">${fmt(r.afterFrom)}~${fmt(r.afterTo)}(돌아온 뒤 ${state.settings.keepDays}일) 식단에 필요한 개수예요. 날짜가 빠른 재료부터 만드세요.</p>`;
  } else {
    html += '<p class="advice">돌아온 뒤 2주 동안 남은 큐브로 충분해요.</p>';
  }
  html += '</div>';

  // 알림: 알레르기로 막힌 재료, 식단표 범위 밖
  const blocked = [...new Set([...Object.keys(r.before.blocked), ...Object.keys(r.after.blocked)])];
  if (blocked.length) {
    html += `<div class="card toss"><p class="advice">⚠️ 식단표에 알레르기 재료 <b>${blocked.map(escapeHtml).join(', ')}</b>이(가) 있어요. ⚙️ 설정 → 대체 재료에서 바꿀 재료를 정해 주세요.</p></div>`;
  }
  if (r.before.noPlan + r.after.noPlan > 0) {
    html += `<p class="note" style="text-align:center">식단표 범위(D+${PLAN_FIRST}~${PLAN_LAST}) 밖의 날짜 ${r.before.noPlan + r.after.noPlan}일은 계산에서 빠졌어요.</p>`;
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
