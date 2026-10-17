import { L, GEAR, RANKS, RECIPES } from "./data.mjs";
import { initial, normalize, advance } from "./state.mjs";
import { platform } from "./platform.mjs";

("use strict");
const KEY = "knyazi_rebuilt_v4";
const validIndex = (n) => Number.isInteger(n) && n >= 0 && n < 5;
let ownsSession = false;
let s = initial(),
  tab = "Главная",
  toastTimer = null,
  persistenceBlocked = false;
const $ = (id) => document.getElementById(id),
  fmt = (n) => Math.floor(n).toLocaleString("ru-RU");
function safe(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
// Every source of income uses this one persisted timestamp, including hidden tabs.
function settle(now = Date.now()) {
  return advance(s, now, income, production);
}
function save() {
  settle();
  if (persistenceBlocked) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    notice("Не удалось сохранить. Скачай резервную копию в настройках.");
  }
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const n = normalize(JSON.parse(raw));
      if (!n) throw Error("Неподдерживаемое сохранение");
      s = n;
      const elapsed = settle();
      save();
      if (elapsed > 60)
        setTimeout(
          () =>
            notice("Доход за время отсутствия начислен (не более 2 часов)."),
          500,
        );
      return;
    }
  } catch {
    persistenceBlocked = true;
    setTimeout(
      () =>
        notice(
          "Сохранение повреждено или создано в новой версии. Оно не перезаписано. Восстанови JSON или явно начни новую игру.",
        ),
      300,
    );
  }
  setTimeout(intro, 100);
}
function notice(t) {
  let el = $("toast");
  el.textContent = t;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = "none"), 3300);
}
function addLog(t) {
  s.log.push(new Date().toLocaleDateString("ru-RU") + " — " + t);
  s.log = s.log.slice(-30);
}
function tapBonus() {
  return (
    1 +
    GEAR.filter((g) => s.equipped.includes(g.id)).reduce((v, g) => v + g.tap, 0)
  );
}
function passBonus() {
  return (
    1 +
    GEAR.filter((g) => s.equipped.includes(g.id)).reduce(
      (v, g) => v + g.pass,
      0,
    )
  );
}
function income(i) {
  return (
    s.biz[i].reduce(
      (sum, b, j) =>
        sum +
        (b.level ? L[i].business[j][4] * b.level * (1 + b.workers * 0.35) : 0),
      0,
    ) * passBonus()
  );
}
function production(i, j) {
  let b = s.biz[i][j];
  return b.level ? (b.level * (1 + b.workers * 0.2)) / 18 : 0;
}
function buildCost(i, j) {
  let b = s.biz[i][j],
    base = L[i].business[j][3];
  return Math.floor(base * Math.pow(1.62, b.level));
}
function wageCost(i, j) {
  return Math.floor(
    30 * (j + 1) * (1 + s.biz[i][j].workers) * Math.pow(1.25, i),
  );
}
function doTap() {
  settle();
  let gain = (1 + s.rank) * tapBonus();
  s.wallets[s.loc] += gain;
  s.taps++;
  save();
  updateHead();
  notice("+" + fmt(gain) + " " + L[s.loc].short);
}
function buyBiz(j) {
  settle();
  if (!validIndex(j)) return;
  let i = s.loc,
    b = s.biz[i][j],
    c = buildCost(i, j);
  if (b.level >= 100) return notice("Достигнут максимальный уровень");
  if (s.wallets[i] < c) return notice("Не хватает местной валюты");
  s.wallets[i] -= c;
  b.level++;
  addLog((b.level === 1 ? "Построено: " : "Улучшено: ") + L[i].business[j][0]);
  save();
  render();
  notice("Предприятие " + (b.level === 1 ? "построено" : "улучшено"));
}
function worker(j) {
  settle();
  if (!validIndex(j)) return;
  let i = s.loc,
    b = s.biz[i][j],
    c = wageCost(i, j);
  if (!b.level) return notice("Сначала построй предприятие");
  if (b.workers >= 5) return notice("На предприятии уже 5 работников");
  if (s.wallets[i] < c) return notice("Недостаточно денег на найм");
  s.wallets[i] -= c;
  b.workers++;
  save();
  render();
  notice("Работник нанят! Доход предприятия увеличен на 35%");
}
function fire(j) {
  settle();
  if (!validIndex(j)) return;
  let b = s.biz[s.loc][j];
  if (b.workers > 0) b.workers--;
  save();
  render();
}
function sell(j, all = false) {
  settle();
  if (!validIndex(j)) return;
  let i = s.loc,
    b = s.biz[i][j],
    qty = Math.min(Math.floor(b.stock), all ? Math.floor(b.stock) : 10);
  if (qty <= 0) return notice("На складе нет товара");
  b.stock -= qty;
  let price = L[i].business[j][5];
  s.wallets[i] += qty * price;
  save();
  render();
  notice("Продано " + qty + " ед. за " + fmt(qty * price) + " " + L[i].short);
}
function sellGear(id) {
  settle();
  const g = GEAR.find((x) => x.id === id);
  if (!g || !s.owned.includes(id)) return;
  s.owned = s.owned.filter((x) => x !== id);
  s.equipped = s.equipped.filter((x) => x !== id);
  s.wallets[s.loc] += Math.floor(g.cost / 2);
  save();
  render();
  notice("Продано: " + g.name);
}
function craft() {
  settle();
  const i = s.loc,
    r = RECIPES[i];
  if (!s.biz[i][r.output[0]].level)
    return notice("Сначала построй предприятие для готового товара");
  if (!r.inputs.every(([j, n]) => s.biz[i][j].stock >= n))
    return notice("Недостаточно сырья для партии");
  for (const [j, n] of r.inputs) s.biz[i][j].stock -= n;
  s.biz[i][r.output[0]].stock += r.output[1];
  save();
  render();
  notice(
    "Готова партия: " + r.output[1] + " ед. " + L[i].business[r.output[0]][2],
  );
}
function recipePanel() {
  const i = s.loc,
    r = RECIPES[i],
    ready =
      s.biz[i][r.output[0]].level &&
      r.inputs.every(([j, n]) => s.biz[i][j].stock >= n);
  return `<div class="panel"><h3>Мастерская · ${r.name}</h3><p>${r.inputs.map(([j, n]) => n + " " + L[i].business[j][2]).join(" + ")} → ${r.output[1]} ${L[i].business[r.output[0]][2]}</p><p class="muted">Нужно предприятие «${L[i].business[r.output[0]][0]}». Сырьё расходуется только при изготовлении партии. Автоматическое производство продолжается отдельно.</p><button class="btn" id="craft" ${ready ? "" : "disabled"}>Изготовить партию</button></div>`;
}
function equip(id) {
  settle();
  if (!s.owned.includes(id)) return;
  let ix = s.equipped.indexOf(id);
  if (ix >= 0) s.equipped.splice(ix, 1);
  else s.equipped.push(id);
  save();
  render();
}
function buyGear(id) {
  settle();
  let g = GEAR.find((x) => x.id === id);
  if (!g) return;
  if (s.owned.includes(id)) return equip(id);
  if (s.wallets[s.loc] < g.cost) return notice("Недостаточно местной валюты");
  s.wallets[s.loc] -= g.cost;
  s.owned.push(id);
  s.equipped.push(id);
  save();
  render();
  notice("Куплено и надето: " + g.name);
}
function questData(i) {
  let step = s.quests[i];
  let j = step % 5;
  let count = 5 + Math.floor(step / 5) * 4;
  let b = L[i].business[j];
  return { j, count, b, reward: 80 + step * 35 + 20 * i };
}
function completeQuest() {
  settle();
  let i = s.loc,
    q = questData(i),
    b = s.biz[i][q.j];
  if (b.stock < q.count)
    return notice("Нужно собрать " + q.count + " ед. «" + q.b[2] + "»");
  b.stock -= q.count;
  s.wallets[i] += q.reward;
  s.reputation[i] += 2;
  s.quests[i]++;
  addLog("Выполнено поручение " + L[i].npc);
  save();
  render();
  notice("Поручение выполнено! +" + q.reward + " и +2 уважения");
}
function help() {
  settle();
  let i = s.loc,
    c = 75 + 25 * i;
  if (s.wallets[i] < c)
    return notice("Для помощи нужно " + c + " " + L[i].short);
  s.wallets[i] -= c;
  s.reputation[i] += 3;
  addLog("Помощь жителям " + L[i].name);
  save();
  render();
  notice("Поселение благодарит тебя! +3 уважения");
}
function exchange() {
  settle();
  let i = s.loc;
  if (i >= 4 || s.unlocked <= i)
    return notice("Сначала открой следующую локацию");
  let amt = Math.floor(s.wallets[i] / 10) * 10;
  if (amt < 10) return notice("Для обмена нужно хотя бы 10 " + L[i].short);
  let gain = Math.floor(amt * 0.9);
  s.wallets[i] -= amt;
  s.wallets[i + 1] += gain;
  save();
  render();
  notice("Обменено " + fmt(amt) + " → " + fmt(gain) + " " + L[i + 1].short);
}
function caravan(j) {
  settle();
  if (!validIndex(j)) return;
  let i = s.loc;
  if (i >= 4 || s.unlocked <= i) return notice("Следующая локация ещё закрыта");
  let b = s.biz[i][j],
    qty = Math.min(10, Math.floor(b.stock));
  if (qty < 10) return notice("Для каравана нужно 10 ед. товара");
  b.stock -= 10;
  let gain = L[i].business[j][5] * 15;
  s.wallets[i + 1] += gain;
  save();
  render();
  notice("Караван доставил товар: +" + gain + " " + L[i + 1].short);
}
function canUnlock() {
  let i = s.unlocked;
  if (i >= 4) return false;
  return (
    s.quests[i] >= 2 && s.reputation[i] >= 4 && s.wallets[i] >= L[i + 1].unlock
  );
}
function unlock() {
  settle();
  let i = s.unlocked;
  if (s.loc !== i || !canUnlock())
    return notice("Сначала выполни условия перехода");
  let c = L[i + 1].unlock;
  s.wallets[i] -= c;
  s.unlocked = i + 1;
  s.loc = i + 1;
  s.wallets[i + 1] += 80;
  s.storySeen[i + 1] = true;
  addLog("Открыта новая глава: " + L[i + 1].name);
  save();
  tab = "Главная";
  render();
  story(i + 1);
}
function go(i) {
  settle();
  if (!validIndex(i) || i > s.unlocked)
    return notice("Эта земля ещё не открыта");
  s.loc = i;
  tab = "Главная";
  save();
  render();
}
function rankUp() {
  settle();
  let next = s.rank + 1;
  if (next >= 6) return;
  let needed = next * 5;
  let total = s.reputation.reduce((a, b) => a + b, 0);
  let c = 150 * next;
  if (total < needed || s.wallets[s.loc] < c)
    return notice(
      "Для титула нужно " + needed + " уважения и " + c + " местной валюты",
    );
  s.wallets[s.loc] -= c;
  s.rank = next;
  addLog("Новый титул: " + RANKS[next]);
  save();
  render();
  notice("Поздравляем! " + RANKS[next]);
}
function updateHead() {
  $("wallet").textContent = fmt(s.wallets[s.loc]);
  $("curr").textContent = L[s.loc].money;
  $("rank").textContent = RANKS[s.rank];
  $("income").textContent = "Доход: " + fmt(income(s.loc)) + "/с";
  $("sub").textContent = L[s.loc].name + " · глава " + (s.loc + 1) + " из 5";
}
const TABS = [
  "Главная",
  "Владения",
  "Рынок",
  "Задания",
  "Герой",
  "Карта",
  "Летопись",
  "Настройки",
];
function render() {
  updateHead();
  $("nav").innerHTML = TABS.map(
    (x) =>
      `<button aria-current="${x === tab ? "page" : "false"}" class="${x === tab ? "active" : ""}" data-tab="${x}">${x}</button>`,
  ).join("");
  $("nav")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          tab = b.dataset.tab;
          render();
        }),
    );
  let html = "";
  if (tab === "Главная") html = home();
  if (tab === "Владения") html = holdings();
  if (tab === "Рынок") html = market();
  if (tab === "Задания") html = quests();
  if (tab === "Герой") html = heroPage();
  if (tab === "Карта") html = mapPage();
  if (tab === "Летопись") html = chronicle();
  if (tab === "Настройки") html = settings();
  $("content").innerHTML = html;
  bind();
}
function home() {
  let i = s.loc;
  let plots = s.biz[i]
    .map((b, j) => {
      let d = L[i].business[j];
      return `<button class="plot p${j} ${b.level ? "" : "empty"}" data-plot="${j}"><span class="building">${b.level ? buildingArt(j) : '<span class="empty-plot">＋</span>'}</span><span class="label">${b.level ? safe(d[0]) + " · " + (b.level >= 5 ? "III" : b.level >= 3 ? "II" : "I") : "Свободный участок"}</span></button>`;
    })
    .join("");
  return `<div class="panel"><h3>✥ ${L[i].name}</h3><p>${L[i].desc}</p></div><div class="world ${L[i].class}"><div class="hill"></div><div class="hill b"></div>${plots}<button class="hero" id="heroTap" aria-label="Заработать валюту">${heroArt()}</button><div class="tap">Нажми на героя, чтобы заработать · +${((1 + s.rank) * tapBonus()).toFixed(1)} за нажатие</div></div><div class="panel"><h3>🎯 Твоя ближайшая цель</h3>${goalText()}<button class="btn alt" data-tab="Задания">Открыть задания</button></div><div class="panel"><p class="muted">Коснись пустого участка, чтобы построить хозяйство. Улучшения меняют уровень здания и увеличивают доход.</p></div>`;
}
function holdings() {
  let i = s.loc;
  return `<div class="panel"><h3>🏘️ Предприятия и работники</h3><p class="muted">Найм оплачивается один раз. Каждый работник добавляет +35% к доходу предприятия и +20% к производству товаров. Не больше 5 работников на здание.</p>${s.biz[
    i
  ]
    .map((b, j) => {
      let d = L[i].business[j],
        c = buildCost(i, j);
      return `<div class="item"><div class="row"><b>${d[1]} ${d[0]}</b><span class="badge">Уровень ${b.level}</span></div><div class="muted">${b.level ? "Доход: " + fmt(d[4] * b.level * (1 + b.workers * 0.35) * passBonus()) + "/с · Склад: " + fmt(b.stock) + " " + d[2] : "Участок пуст"}</div><button class="btn" data-build="${j}" ${b.level >= 100 ? "disabled" : ""}>${b.level >= 100 ? "Максимум" : (b.level ? "Улучшить" : "Построить") + " · " + fmt(c)}</button>${b.level ? `<div class="small">👨‍🌾 Работники: <b>${b.workers}/5</b> · Найм: ${fmt(wageCost(i, j))}</div><button class="btn alt" data-worker="${j}" ${b.workers >= 5 ? "disabled" : ""}>Нанять работника</button><button class="btn alt" data-fire="${j}" ${!b.workers ? "disabled" : ""}>Уволить без возврата платы</button>` : ""}</div>`;
    })
    .join("")}</div>`;
}
function market() {
  let i = s.loc;
  return `${recipePanel()}<div class="panel"><h3>⚖️ Меняльная лавка</h3><p>Курс: <b>10 ${L[i].short} → 9 ${L[Math.min(4, i + 1)].short}</b>. Переводятся все полные десятки; комиссия 10%.</p><button class="btn" id="exchange" ${i >= 4 || s.unlocked <= i ? "disabled" : ""}>Обменять излишки в следующую землю</button></div><div class="panel"><h3>📦 Торговля и караваны</h3>${s.biz[
    i
  ]
    .map((b, j) => {
      let d = L[i].business[j];
      return `<div class="item"><b>${d[1]} ${d[2]}</b><div class="muted">На складе: ${fmt(b.stock)} · Цена: ${d[5]} ${L[i].short}/шт.</div><button class="btn alt" data-sell="${j}" ${b.stock < 1 ? "disabled" : ""}>Продать до 10</button><button class="btn alt" data-sellall="${j}" ${b.stock < 1 ? "disabled" : ""}>Продать всё</button>${i < 4 ? `<button class="btn" data-caravan="${j}" ${s.unlocked <= i || b.stock < 10 ? "disabled" : ""}>Караван: 10 шт. → ${d[5] * 15} ${L[i + 1].short}</button>` : ""}</div>`;
    })
    .join(
      "",
    )}</div><div class="panel"><h3>🛍️ Лавка снаряжения</h3><p class="muted">Здесь продаются только полезные предметы. Овощи, доски и другие товары нужны для поручений, продажи и караванов.</p>${GEAR.map((g) => `<div class="item"><b>${g.icon} ${g.name}</b><p class="small">${g.bonus}</p><button class="btn" data-gear="${g.id}">${s.owned.includes(g.id) ? (s.equipped.includes(g.id) ? "Снять" : "Надеть") : "Купить · " + g.cost}</button></div>`).join("")}</div>`;
}
function goalText() {
  let i = s.loc,
    q = questData(i);
  if (i === 4 && s.rank === 5)
    return '<p class="ok">🏆 Ты достиг вершины! Королевский вельможа — твоя история вошла в летопись.</p>';
  if (s.quests[i] < 2)
    return `<p>Выполни поручения ${L[i].npc}: <b>${s.quests[i]}/2</b>. Следующее — передать <b>${q.count} ${q.b[2]}</b> из предприятия «${q.b[0]}».</p>`;
  if (s.reputation[i] < 4)
    return "<p>Заслужи хотя бы <b>4 уважения</b> у местных жителей.</p>";
  if (i < s.unlocked)
    return '<p class="ok">Глава открыта. Следующая земля уже доступна на карте.</p>';
  if (i < 4)
    return `<p>Накопи <b>${fmt(L[i + 1].unlock)} ${L[i].short}</b> для открытия земли «${L[i + 1].name}». Сейчас: ${fmt(s.wallets[i])}.</p>`;
  return "<p>Ты достиг замка. Повышай титул до королевского вельможи, выполняя поручения и помогая жителям.</p>";
}
function quests() {
  let i = s.loc,
    q = questData(i),
    b = s.biz[i][q.j];
  return `<div class="panel"><h3>🎯 Главная цель</h3>${goalText()}</div><div class="panel"><h3>📜 Поручение: ${L[i].npc}</h3><p>«Нашим людям необходимы <b>${q.b[2]}</b>. Доставь <b>${q.count} шт.</b> из хозяйства «${q.b[0]}».»</p><p>Собрано: <b>${fmt(b.stock)} / ${q.count}</b> · Награда: ${q.reward} ${L[i].short} и 2 уважения.</p><button class="btn" id="questComplete" ${b.stock < q.count ? "disabled" : ""}>Передать товар и получить награду</button></div><div class="panel"><h3>🤝 Помочь поселению</h3><p>Пожертвуй <b>${75 + 25 * i} ${L[i].short}</b> на нужды жителей и получи <b>3 уважения</b>.</p><button class="btn" id="help" >Помочь поселению</button><p>Уважение жителей: <b>${fmt(s.reputation[i])}</b></p></div>${i < 4 ? `<div class="panel"><h3>🚪 Путь дальше: ${L[i + 1].name}</h3><p>Условия: 2 поручения, 4 уважения, ${L[i + 1].unlock} ${L[i].short}.</p><p>Поручения: ${Math.min(2, s.quests[i])}/2 · Уважение: ${fmt(s.reputation[i])}/4</p><button class="btn red" id="unlock" ${i !== s.unlocked || !canUnlock() ? "disabled" : ""}>Открыть следующую главу</button></div>` : ""}`;
}
function heroPage() {
  let rep = s.reputation.reduce((a, b) => a + b, 0),
    next = s.rank + 1;
  return `<div class="panel"><h3>👑 Герой и сословие</h3><div class="hero-portrait">${heroArt()}</div><p>Титул: <b>${RANKS[s.rank]}</b></p><p>Общее уважение: <b>${fmt(rep)}</b> · Нажатий: ${fmt(s.taps)}</p>${next < 6 ? `<p>Следующий титул: ${RANKS[next]} · Требуется ${next * 5} уважения и ${150 * next} местной валюты.</p><button class="btn" id="rankUp" ${rep < next * 5 || s.wallets[s.loc] < 150 * next ? "disabled" : ""}>Получить титул</button>` : '<p class="ok">Ты достиг высшего титула!</p>'}</div><div class="panel"><h3>🎒 Инвентарь и бонусы</h3>${GEAR.map((g) => `<div class="item"><b>${g.icon} ${g.name}</b><p class="small">${g.bonus}</p><span class="badge">${s.owned.includes(g.id) ? (s.equipped.includes(g.id) ? "Надето" : "В сумке") : "Не куплено"}</span> ${s.owned.includes(g.id) ? `<button class="btn alt" data-gear="${g.id}">${s.equipped.includes(g.id) ? "Снять" : "Надеть"}</button>` : ""}</div>`).join("")}<div class="line"></div>${s.owned
    .map((id) => {
      const g = GEAR.find((x) => x.id === id);
      return `<button class="btn alt" data-sellgear="${id}">Продать: ${g.name} · ${Math.floor(g.cost / 2)}</button>`;
    })
    .join(
      "",
    )}<p>Общий бонус к нажатию: <b>+${Math.round((tapBonus() - 1) * 100)}%</b></p><p>Общий бонус к пассивному доходу: <b>+${Math.round((passBonus() - 1) * 100)}%</b></p></div>`;
}
function mapPage() {
  return `<div class="panel"><h3>🗺️ Пять глав твоей судьбы</h3>${L.map((l, i) => `<div class="item"><div class="row"><b>${i + 1}. ${l.name}</b><span class="badge">${i === s.loc ? "Здесь" : i <= s.unlocked ? "Открыта" : "Закрыта"}</span></div><p class="small">${l.desc}</p><p class="muted">Валюта: ${l.money} · В кошельке: ${fmt(s.wallets[i])}</p><button class="btn alt" data-go="${i}" ${i > s.unlocked ? "disabled" : ""}>${i === s.loc ? "Текущая локация" : "Перейти"}</button></div>`).join("")}</div>`;
}
function chronicle() {
  return `<div class="panel"><h3>📖 Летопись возвышения</h3><p>Ты начал с пятидесяти деревянных дублонов и мечты добраться до королевского двора.</p>${L.slice(
    0,
    s.unlocked + 1,
  )
    .map(
      (l, i) =>
        `<div class="item"><b>Глава ${i + 1}. ${l.name}</b><p class="small">${l.desc}</p><button class="btn alt" data-story="${i}">Перечитать главу</button></div>`,
    )
    .join("")}</div><div class="panel"><h3>🖋️ Записи о твоих делах</h3>${
    s.log.length
      ? s.log
          .slice()
          .reverse()
          .map((x) => `<p class="small">✥ ${safe(x)}</p>`)
          .join("")
      : '<p class="muted">Первые свершения ещё впереди.</p>'
  }</div>`;
}
function settings() {
  return `<div class="panel"><h3>⚙️ Сохранения</h3><p>Прогресс автоматически сохраняется на этом устройстве. Для переноса между файлами и версиями используй резервную копию.</p><button class="btn" id="backup">Скачать сохранение JSON</button><p><label class="btn alt" style="display:inline-block">Восстановить из JSON<input id="restore" type="file" accept="application/json,.json" style="display:none"></label></p><button class="btn red" id="reset">Начать новую игру</button></div><div class="panel"><h3>ℹ️ Как играть</h3><p>Нажимай на героя, строй предприятия, нанимай работников, собирай товары, выполняй поручения и открывай новые земли. У каждой земли своя валюта; обменник и караваны помогают перевести заработанное дальше.</p><p>Работники увеличивают доход. Предметы дают бонусы, указанные в инвентаре. Для перехода нужны поручения, уважение и деньги.</p><button class="btn alt" id="introAgain">Прочитать вступление</button></div>`;
}
function bind() {
  let c = $("content");
  c.querySelectorAll("[data-sellgear]").forEach(
    (x) => (x.onclick = () => sellGear(x.dataset.sellgear)),
  );
  c.querySelectorAll("[data-tab]").forEach(
    (x) =>
      (x.onclick = () => {
        tab = x.dataset.tab;
        render();
      }),
  );
  c.querySelectorAll("[data-plot]").forEach(
    (x) =>
      (x.onclick = () => {
        tab = "Владения";
        render();
        notice("Выбери предприятие для этого участка");
      }),
  );
  c.querySelectorAll("[data-build]").forEach(
    (x) => (x.onclick = () => buyBiz(+x.dataset.build)),
  );
  c.querySelectorAll("[data-worker]").forEach(
    (x) => (x.onclick = () => worker(+x.dataset.worker)),
  );
  c.querySelectorAll("[data-fire]").forEach(
    (x) => (x.onclick = () => fire(+x.dataset.fire)),
  );
  c.querySelectorAll("[data-sell]").forEach(
    (x) => (x.onclick = () => sell(+x.dataset.sell)),
  );
  c.querySelectorAll("[data-sellall]").forEach(
    (x) => (x.onclick = () => sell(+x.dataset.sellall, true)),
  );
  c.querySelectorAll("[data-caravan]").forEach(
    (x) => (x.onclick = () => caravan(+x.dataset.caravan)),
  );
  c.querySelectorAll("[data-gear]").forEach(
    (x) => (x.onclick = () => buyGear(x.dataset.gear)),
  );
  c.querySelectorAll("[data-go]").forEach(
    (x) => (x.onclick = () => go(+x.dataset.go)),
  );
  c.querySelectorAll("[data-story]").forEach(
    (x) => (x.onclick = () => story(+x.dataset.story)),
  );
  let f = (id, fn) => {
    let e = $(id);
    if (e) e.onclick = fn;
  };
  f("craft", craft);
  f("heroTap", doTap);
  f("exchange", exchange);
  f("questComplete", completeQuest);
  f("help", help);
  f("unlock", unlock);
  f("rankUp", rankUp);
  f("backup", backup);
  f("reset", reset);
  f("introAgain", intro);
  let r = $("restore");
  if (r) r.onchange = restore;
}
function showModal(title, body, button = "Продолжить") {
  let h = $("modalHost");
  h.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="sheet" tabindex="-1"><h2 id="modalTitle">${title}</h2>${body}<button class="btn full" id="closeModal">${button}</button></div></div>`;
  const previous = document.activeElement;
  $("closeModal").onclick = () => {
    h.innerHTML = "";
    if (previous?.isConnected) previous.focus();
  };
  $("closeModal").focus();
  h.onkeydown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      $("closeModal").focus();
    }
  };
}
function intro() {
  showModal(
    "📖 Пролог. Из грязи в князи",
    `<p>Ты — бедный крестьянин без имени и титула. После долгих скитаний судьба привела тебя в <b>Далёкую деревню</b>. В кармане всего <b>50 деревянных дублонов</b>, а впереди — целое королевство.</p><p>Староста Мирон предлагает тебе честный путь: работай, обзаводись хозяйством, помогай жителям и завоёвывай уважение.</p><p><b>Твоя цель:</b> пройти пять земель, разбогатеть, стать известным купцом и добиться титула <b>королевского вельможи</b>.</p><p class="notice"><b>Начни с простого:</b> нажимай на героя, построй огород, собирай овощи и выполняй поручения. Затем открой Рыбацкую деревню.</p>`,
    "Начать мою историю",
  );
}
function story(i) {
  let l = L[i];
  showModal(
    "🎉 Новая глава: " + l.name,
    `<p><b>Поздравляем!</b> Ты стал ещё на шаг ближе к королевскому двору.</p><p>${l.desc}</p><p>Тебя встречает <b>${l.npc}</b> и предлагает новые хозяйства, товары и возможности.</p><p>Здесь расчёты идут в валюте <b>«${l.money}»</b>. Предыдущие земли продолжают приносить прибыль: возвращайся к ним, отправляй караваны и меняй излишки.</p><p><b>Новая цель:</b> построй первое предприятие, выполни поручения и заслужи уважение жителей.</p>`,
    "Продолжить путешествие",
  );
}
function backup() {
  settle();
  let blob = new Blob([JSON.stringify(s, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "iz_gryazi_v_knyazi_save.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function restore(e) {
  let file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) return notice("Файл сохранения слишком большой");
  let reader = new FileReader();
  reader.onload = () => {
    try {
      let n = normalize(JSON.parse(reader.result));
      if (!n) throw Error("Неверный формат");
      if (!confirm("Заменить текущий прогресс сохранением из файла?")) return;
      s = n;
      s.last = Date.now();
      persistenceBlocked = false;
      save();
      render();
      notice("Сохранение восстановлено");
    } catch (err) {
      notice("Не удалось прочитать сохранение: " + err.message);
    }
  };
  reader.readAsText(file);
}
function reset() {
  if (
    !confirm(
      "Начать новую игру? Текущий прогресс будет потерян. Сначала сделай резервную копию.",
    )
  )
    return;
  s = initial();
  persistenceBlocked = false;
  tab = "Главная";
  save();
  render();
  intro();
}
function heroArt() {
  return `<img class="hero-art" src="assets/characters/rank-${s.rank}.svg" alt="${RANKS[s.rank]}" width="120" height="160">`;
}
function buildingArt(j) {
  return `<img class="building-art" src="assets/buildings/business-${j}.svg" alt="" width="100" height="90">`;
}
// Update live values in place: do not replace a focused or pressed button every second.
function patch(current, next) {
  if (
    current.nodeType !== next.nodeType ||
    current.nodeName !== next.nodeName
  ) {
    current.replaceWith(next.cloneNode(true));
    return;
  }
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.textContent !== next.textContent)
      current.textContent = next.textContent;
    return;
  }
  if (current.nodeType !== Node.ELEMENT_NODE) return;
  for (const a of [...current.attributes])
    if (!next.hasAttribute(a.name)) current.removeAttribute(a.name);
  for (const a of next.attributes)
    if (current.getAttribute(a.name) !== a.value)
      current.setAttribute(a.name, a.value);
  const before = [...current.childNodes],
    after = [...next.childNodes];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (!after[i]) before[i].remove();
    else if (!before[i]) current.append(after[i].cloneNode(true));
    else patch(before[i], after[i]);
  }
}
function refresh() {
  updateHead();
  const views = {
    Главная: home,
    Владения: holdings,
    Рынок: market,
    Задания: quests,
    Герой: heroPage,
    Карта: mapPage,
  };
  if (!views[tab]) return;
  const next = document.createElement("main");
  next.innerHTML = views[tab]();
  const old = $("content");
  const a = [...old.childNodes],
    b = [...next.childNodes];
  for (let i = 0; i < b.length; i++)
    if (a[i]) patch(a[i], b[i]);
    else old.append(b[i]);
  bind();
}
function tick() {
  settle();
  if (!document.hidden) refresh();
}
function boot() {
  ownsSession = true;
  load();
  render();
  setInterval(tick, 1000);
  setInterval(save, 5000);
}
// One writer per origin prevents two open copies from earning/spending independently.
if (navigator.locks) {
  navigator.locks.request(KEY, { ifAvailable: true }, async (lock) => {
    if (!lock) {
      document.querySelector(".app").innerHTML =
        '<div class="panel"><h2>Летопись уже открыта</h2><p>Продолжи игру в первой вкладке. Чтобы играть здесь, закрой её и перезагрузи эту страницу.</p><button class="btn" id="retryGame">Открыть снова</button></div>';
      $("retryGame").onclick = () => location.reload();
      return;
    }
    boot();
    await new Promise(() => {});
  });
} else boot();
window.addEventListener("pagehide", () => {
  if (ownsSession) save();
});
document.addEventListener("visibilitychange", () => {
  if (!ownsSession) return;
  settle();
  save();
  if (!document.hidden) refresh();
});
// A second tab observes the latest committed progress instead of overwriting it.
window.addEventListener("storage", (event) => {
  if (!ownsSession || event.key !== KEY || !event.newValue) return;
  try {
    const n = normalize(JSON.parse(event.newValue));
    if (n && n.last >= s.last) {
      s = n;
      render();
    }
  } catch {}
});
// Test access is opt-in; normal players do not receive state mutation helpers.
if (new URLSearchParams(location.search).has("test"))
  window.__gameTest = {
    get: () => structuredClone(s),
    set: (x) => {
      const n = normalize(x);
      if (!n) throw Error("Invalid state");
      s = n;
      save();
      render();
    },
    initial,
    settle,
    tick,
    save,
    normalize,
    income,
    production,
    questData,
    doTap,
    buyBiz,
    worker,
    fire,
    sell,
    caravan,
    help,
    completeQuest,
    unlock,
    exchange,
    buyGear,
    sellGear,
    craft,
    go,
    rankUp,
  };

platform
  .init()
  .catch(() =>
    notice("Платформенные функции недоступны; игра работает локально."),
  );
