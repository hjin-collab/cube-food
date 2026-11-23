'use strict';
/* ================= 식단표 연동 =================
 * plan.js(PLAN, PLAN_DISHES)와 앱 재료를 연결합니다.
 * - D+ 날짜: 설정의 기준(예: 2026-11-23 = D+218)에서 하루씩 증가
 * - 식단표 이름 → 앱 재료: '쌀오트밀'→'오트밀', '달걀'→'달걀노른자' 등
 * - 대체 재료: 설정에서 '현미 → 보리'처럼 지정 (알레르기 등)
 */
const PLAN_ALIAS = { '달걀': '달걀노른자', '생선': '흰살생선', '새송이': '새송이버섯' };

function dOf(date) { const a = state.settings.dAnchor; return a.d + diffDays(date, a.date); }
function dateOfD(d) { const a = state.settings.dAnchor; return addDays(a.date, d - a.d); }
function planDay(d) { return PLAN.find((p) => p.d === d) || null; }
const PLAN_FIRST = PLAN[0].d, PLAN_LAST = PLAN[PLAN.length - 1].d;

function ingByName(name) { return state.ingredients.find((i) => i.name === name); }

// 식단표 이름 → 앱 재료 이름 (대체 전)
function planToName(raw, isBase) {
  const cands = [raw];
  if (PLAN_ALIAS[raw]) cands.push(PLAN_ALIAS[raw]);
  if (isBase && raw.startsWith('쌀') && raw.length > 1) cands.push(raw.slice(1));
  return cands.find(ingByName) || cands[cands.length - 1];
}

// 한 끼에 필요한 큐브 목록: [{ name(최종 재료), orig(대체 전), sub, dish, base }]
function mealCubes(meal) {
  const out = [];
  const add = (raw, isBase, dish) => {
    const orig = planToName(raw, isBase);
    const sub = (state.settings.subs || {})[orig];
    out.push({ name: sub || orig, orig, sub: !!sub, dish, base: isBase });
  };
  add(meal.b, true);
  for (const t of meal.t) {
    if (PLAN_DISHES[t]) PLAN_DISHES[t].forEach((x) => add(x, false, t));
    else add(t, false);
  }
  return out;
}

// 식단표에 나오는 모든 재료 이름 (대체 전) — 설정의 대체 목록용
function planNames() {
  const set = new Set();
  for (const p of PLAN) for (const m of p.m) for (const c of mealCubes({ b: m.b, t: m.t })) set.add(c.orig);
  return [...set];
}

/* ---- 큐브 소비 시뮬레이션 ---- */
// 남은 큐브 묶음 복사본
function cubePool() {
  return state.batches.filter((b) => remaining(b) > 0)
    .map((b) => ({ b, ing: ingById(b.ingId), left: remaining(b), exp: expireDate(b), used: 0 }))
    .filter((x) => x.ing)
    .sort((x, y) => x.exp.localeCompare(y.exp));
}
// day에 재료 1개 먹기 (폐기일 빠른 것부터, 폐기일 당일은 사용 안 함). 성공하면 true
function takeCube(pool, name, day) {
  const ing = ingByName(name);
  if (!ing) return false;
  const x = pool.find((p) => p.ing.id === ing.id && p.left > 0 && day < p.exp);
  if (!x) return false;
  x.left--; x.used++;
  return true;
}
// from~to(포함) 동안 식단표대로 먹기. 부족한 재료: { name: { first, count, days:Set } }
function simulate(pool, from, to) {
  const short = {}, blocked = {};
  let noPlan = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const p = planDay(dOf(day));
    if (!p) { noPlan++; continue; }
    for (const m of p.m) for (const c of mealCubes(m)) {
      const ing = ingByName(c.name);
      if (ing && ing.allergy) { blocked[c.name] = blocked[c.name] || day; continue; } // 대체 필요
      if (!takeCube(pool, c.name, day)) {
        const s = short[c.name] || (short[c.name] = { name: c.name, first: day, count: 0, base: c.base });
        s.count++;
      }
    }
  }
  return { short, blocked, noPlan };
}

/* ---- 메인 화면: 오늘 식단 카드 ---- */
function renderToday() {
  const box = document.getElementById('todayCard');
  const today = todayStr();
  const d = dOf(today);
  const p = planDay(d);
  let html = `<div class="today-head">📅 오늘 <b>D+${d}</b> <span class="sub-inline">${fmt(today)}</span></div>`;
  if (!p) {
    html += `<p class="note">식단표 범위(D+${PLAN_FIRST}~${PLAN_LAST})가 아니에요.</p>`;
  } else {
    const label = ['아침', '점심'];
    p.m.forEach((m, k) => {
      const chips = mealCubes(m).map((c) => {
        const ing = ingByName(c.name);
        const n = ing ? totalLeft(ing.id) : 0;
        const cls = ing && ing.allergy ? 'chip bad' : n === 0 ? 'chip empty' : 'chip';
        const title = c.sub ? `${escapeHtml(c.name)}<small>(${escapeHtml(c.orig)} 대체)</small>` : escapeHtml(c.name);
        return `<span class="${cls}">${title} <b>${ing ? n : '?'}</b></span>`;
      }).join('');
      html += `<div class="meal"><span class="meal-label">${label[k]}</span><div class="chips">${chips}</div></div>`;
    });
    if (p.s) html += `<div class="meal"><span class="meal-label">간식</span><div class="chips"><span class="chip plain">${escapeHtml(p.s)}</span></div></div>`;
    html += '<p class="note">숫자는 남은 큐브 수예요. 회색은 큐브가 없는 재료예요.</p>';
  }
  box.innerHTML = html;
}
