import { test } from "node:test";
import assert from "node:assert/strict";
import { initial, normalize, advance, LIMIT } from "../src/state.mjs";

test("v4 save round-trip preserves legitimate progress and key schema", () => {
  const s = initial(1000);
  s.loc = 2;
  s.unlocked = 3;
  s.rank = 3;
  s.wallets[2] = 99.5;
  s.biz[2][1] = { level: 4, workers: 3, stock: 17.25 };
  s.owned = ["ring"];
  s.equipped = ["ring"];
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(s)), 1000), {
    ...s,
    storySeen: [true, true, true, true, false],
  });
});
test("rejects missing, malformed and future save schemas", () => {
  for (const v of [
    null,
    {},
    [],
    { version: 5, wallets: [1, 2, 3, 4, 5] },
    { ...initial(), wallets: [] },
  ])
    assert.equal(normalize(v), null);
});
test("sanitizes nonfinite, fractional, negative indices and resources", () => {
  const s = initial();
  Object.assign(s, { loc: 2.9, unlocked: Infinity, rank: 3.7, taps: -1 });
  s.wallets = [Infinity, -1, NaN, "5", 20];
  s.biz[0][0] = { level: 1000, workers: 90, stock: Infinity };
  const n = normalize(s);
  assert.equal(n.loc, 2);
  assert.equal(n.unlocked, 2);
  assert.equal(n.rank, 3);
  assert.deepEqual(n.wallets, [0, 0, 0, 0, 20]);
  assert.deepEqual(n.biz[0][0], { level: 100, workers: 5, stock: 0 });
});
test("deduplicates equipment and removes unowned/unknown items", () => {
  const s = initial();
  s.owned = ["ring", "ring", "bad"];
  s.equipped = ["ring", "ring", "crown"];
  const n = normalize(s);
  assert.deepEqual(n.owned, ["ring"]);
  assert.deepEqual(n.equipped, ["ring"]);
});
test("unbuilt businesses cannot retain workers", () => {
  const s = initial();
  s.biz[0][0].workers = 5;
  assert.equal(normalize(s).biz[0][0].workers, 0);
});
test("online and resumed income share one checkpoint", () => {
  const s = initial(1000);
  advance(
    s,
    11000,
    () => 2,
    () => 1,
  );
  advance(
    s,
    11000,
    () => 2,
    () => 1,
  );
  advance(
    s,
    21000,
    () => 2,
    () => 1,
  );
  assert.equal(s.wallets[0], 90);
  assert.equal(s.biz[0][0].stock, 20);
});
test("offline income capped at two hours, checkpoint consumes full absence", () => {
  const s = initial(1000);
  assert.equal(
    advance(
      s,
      86401000,
      () => 1,
      () => 1,
    ),
    7200,
  );
  assert.equal(s.wallets[0], 7250);
  assert.equal(
    advance(
      s,
      86401000,
      () => 1,
      () => 1,
    ),
    0,
  );
});
test("closed locations earn nothing", () => {
  const s = initial(1000);
  s.unlocked = 1;
  advance(
    s,
    2000,
    (i) => i + 1,
    () => 1,
  );
  assert.deepEqual(s.wallets, [51, 2, 0, 0, 0]);
});
test("backwards clock does not allow duplicate earnings", () => {
  const s = initial(10000);
  advance(
    s,
    5000,
    () => 1,
    () => 1,
  );
  assert.equal(s.last, 10000);
  advance(
    s,
    11000,
    () => 1,
    () => 1,
  );
  assert.equal(s.wallets[0], 51);
});
test("large balances remain finite and bounded", () => {
  const s = initial(1000);
  s.wallets[0] = LIMIT;
  advance(
    s,
    100000,
    () => LIMIT,
    () => LIMIT,
  );
  assert.equal(s.wallets[0], LIMIT);
  assert.equal(s.biz[0][0].stock, LIMIT);
});
