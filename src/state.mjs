import { GEAR } from "./data.mjs";
export const LIMIT = 1e12;
export const OFFLINE_LIMIT = 7200;
const number = (v, max = LIMIT, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(0, v))
    : fallback;
const integer = (v, max) => Math.floor(number(v, max));
export function initial(now = Date.now()) {
  return {
    version: 4,
    loc: 0,
    unlocked: 0,
    wallets: [50, 0, 0, 0, 0],
    biz: Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({ level: 0, workers: 0, stock: 0 })),
    ),
    owned: [],
    equipped: [],
    reputation: [0, 0, 0, 0, 0],
    quests: [0, 0, 0, 0, 0],
    rank: 0,
    storySeen: [true, false, false, false, false],
    last: now,
    taps: 0,
    log: [],
  };
}
// Keep the v4 key and shape. Unknown future schemas must never be overwritten.
export function normalize(v, now = Date.now()) {
  if (
    !v ||
    typeof v !== "object" ||
    !Array.isArray(v.wallets) ||
    v.wallets.length !== 5 ||
    v.version !== 4
  )
    return null;
  const n = initial(now);
  n.loc = integer(v.loc, 4);
  n.unlocked = Math.max(n.loc, integer(v.unlocked, 4));
  for (let i = 0; i < 5; i++) {
    n.wallets[i] = number(v.wallets[i]);
    n.reputation[i] = integer(v.reputation?.[i], LIMIT);
    n.quests[i] = integer(v.quests?.[i], 1e6);
    for (let j = 0; j < 5; j++) {
      const b = v.biz?.[i]?.[j] || {},
        level = integer(b.level, 100);
      n.biz[i][j] = {
        level,
        workers: level ? integer(b.workers, 5) : 0,
        stock: number(b.stock),
      };
    }
  }
  n.owned = [
    ...new Set(
      Array.isArray(v.owned)
        ? v.owned.filter((id) => GEAR.some((g) => g.id === id))
        : [],
    ),
  ];
  n.equipped = [
    ...new Set(
      Array.isArray(v.equipped)
        ? v.equipped.filter((id) => n.owned.includes(id))
        : [],
    ),
  ];
  n.rank = integer(v.rank, 5);
  n.storySeen = Array.from(
    { length: 5 },
    (_, i) => i <= n.unlocked || !!v.storySeen?.[i],
  );
  n.last = number(v.last, now, now);
  n.taps = integer(v.taps, LIMIT);
  n.log = Array.isArray(v.log)
    ? v.log
        .slice(-30)
        .filter((x) => typeof x === "string")
        .map((x) => x.slice(0, 500))
    : [];
  return n;
}
// Calling twice at the same time produces no additional income. Backward clocks
// keep the previous checkpoint, so moving the clock back cannot earn twice.
export function advance(state, now, income, production) {
  if (!Number.isFinite(now) || now <= state.last) return 0;
  const seconds = Math.min(OFFLINE_LIMIT, (now - state.last) / 1000);
  for (let i = 0; i <= state.unlocked; i++) {
    state.wallets[i] = Math.min(LIMIT, state.wallets[i] + income(i) * seconds);
    for (let j = 0; j < 5; j++)
      state.biz[i][j].stock = Math.min(
        LIMIT,
        state.biz[i][j].stock + production(i, j) * seconds,
      );
  }
  state.last = now;
  return seconds;
}
