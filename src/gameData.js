const GAME_SECONDS = 90;
const MAX_ORDERS = 3;
const DIFFICULTIES = {
  easy: {
    label: "\u306F\u3058\u3081\u3066\u52E4\u52D9",
    en: "EASY",
    description: "\u3086\u3063\u304F\u308A\u899A\u3048\u308B\u3002\u7126\u3052\u306B\u304F\u304F\u3001\u5E8F\u76E4\u306F\u4F1D\u79681\u679A\u3002",
    orderLimitMs: 44e3,
    firstGapMs: 9200,
    minGapMs: 6500,
    cookMultiplier: 0.86,
    burnGraceMs: 9e3,
    scoreMultiplier: 0.82
  },
  normal: {
    label: "\u6DF1\u591C\u52E4\u52D9",
    en: "NORMAL",
    description: "\u8FF7\u3063\u305F\u3089\u3053\u308C\u3002\u5FD9\u3057\u3055\u304C\u5C11\u3057\u305A\u3064\u4E0A\u304C\u308B\u6A19\u6E96\u52E4\u52D9\u3002",
    orderLimitMs: 34e3,
    firstGapMs: 7600,
    minGapMs: 5e3,
    cookMultiplier: 0.94,
    burnGraceMs: 6200,
    scoreMultiplier: 1
  },
  hard: {
    label: "\u30E9\u30B9\u30C8\u30AA\u30FC\u30C0\u30FC",
    en: "HARD",
    description: "\u6700\u521D\u304B\u3089\u672C\u756A\u3002\u77ED\u3044\u7336\u4E88\u3067\u9AD8\u5F97\u70B9\u3092\u72D9\u3046\u3002",
    orderLimitMs: 24e3,
    firstGapMs: 6100,
    minGapMs: 3500,
    cookMultiplier: 1,
    burnGraceMs: 3500,
    scoreMultiplier: 1.3
  }
};
const DEFAULT_UPGRADES = {
  griddle: 1,
  fryer: 1,
  stock: 1
};
const UPGRADE_DATA = {
  griddle: {
    label: "\u30B0\u30EA\u30C9\u30EB",
    description: "\u30D1\u30C6\u30A3\u306E\u540C\u6642\u8ABF\u7406\u67A0",
    levels: [
      { slots: 1, cost: 0 },
      { slots: 2, cost: 120 },
      { slots: 3, cost: 280 }
    ]
  },
  fryer: {
    label: "\u30D5\u30E9\u30A4\u30E4\u30FC",
    description: "\u30DD\u30C6\u30C8\u306E\u540C\u6642\u8ABF\u7406\u67A0",
    levels: [
      { slots: 1, cost: 0 },
      { slots: 2, cost: 180 }
    ]
  },
  stock: {
    label: "\u5B8C\u6210\u54C1\u68DA",
    description: "\u6599\u7406\u3092\u7F6E\u3051\u308B\u6570",
    levels: [
      { slots: 8, cost: 0 },
      { slots: 12, cost: 100 },
      { slots: 16, cost: 240 }
    ]
  }
};
const MENU = {
  hamburger: { en: "HAMBURGER", ja: "\u30CF\u30F3\u30D0\u30FC\u30AC\u30FC", score: 110, kind: "food" },
  cheeseburger: {
    en: "CHEESEBURGER",
    ja: "\u30C1\u30FC\u30BA\u30D0\u30FC\u30AC\u30FC",
    score: 130,
    kind: "food"
  },
  fries: { en: "FRIES", ja: "\u30D5\u30E9\u30A4\u30C9\u30DD\u30C6\u30C8", score: 80, kind: "food" },
  cola: { en: "COLA", ja: "\u30B3\u30FC\u30E9", score: 60, kind: "drink" },
  coffee: { en: "COFFEE", ja: "\u30B3\u30FC\u30D2\u30FC", score: 65, kind: "drink" },
  shake: { en: "MILKSHAKE", ja: "\u30DF\u30EB\u30AF\u30B7\u30A7\u30A4\u30AF", score: 90, kind: "drink" }
};
const COOKING = {
  patty: {
    station: "griddle",
    label: "\u30D1\u30C6\u30A3\u3092\u713C\u304F",
    cookMs: 4700,
    burnMs: 3500,
    result: "patty"
  },
  fries: {
    station: "fryer",
    label: "\u30DD\u30C6\u30C8\u3092\u63DA\u3052\u308B",
    cookMs: 5600,
    burnMs: 3200,
    result: "fries"
  },
  cola: {
    station: "drinks",
    label: "\u30B3\u30FC\u30E9",
    cookMs: 1300,
    burnMs: null,
    result: "cola"
  },
  coffee: {
    station: "drinks",
    label: "\u30B3\u30FC\u30D2\u30FC",
    cookMs: 2100,
    burnMs: null,
    result: "coffee"
  },
  shake: {
    station: "drinks",
    label: "\u30B7\u30A7\u30A4\u30AF",
    cookMs: 2800,
    burnMs: null,
    result: "shake"
  }
};
const CUSTOMERS = [
  { id: "greaser", hair: "ducktail", outfit: "leather", pose: "lean" },
  { id: "waitress", hair: "bob", outfit: "mint", pose: "upright" },
  { id: "trucker", hair: "cap", outfit: "plaid", pose: "wide" },
  { id: "student", hair: "ponytail", outfit: "yellow", pose: "reading" },
  { id: "musician", hair: "wave", outfit: "red", pose: "slouch" }
];
const COLORS = {
  ivory: "#f4e8cc",
  cherry: "#8f2632",
  turquoise: "#3f817d",
  brown: "#38271f",
  navy: "#142535",
  butter: "#edc65d",
  mint: "#91c4a9",
  steel: "#b7b7aa"
};
const MENU_IDS = Object.keys(MENU);
function orderSizeFor(elapsedSeconds, difficulty) {
  const roll = Math.random();
  if (difficulty === "easy") {
    if (elapsedSeconds < 30) return 1;
    if (elapsedSeconds < 65) return roll < 0.72 ? 1 : 2;
    return roll < 0.38 ? 1 : roll < 0.9 ? 2 : 3;
  }
  if (difficulty === "normal") {
    if (elapsedSeconds < 22) return roll < 0.78 ? 1 : 2;
    if (elapsedSeconds < 58) return roll < 0.38 ? 1 : roll < 0.86 ? 2 : 3;
    return roll < 0.2 ? 1 : roll < 0.62 ? 2 : 3;
  }
  if (elapsedSeconds < 18) return roll < 0.48 ? 1 : 2;
  if (elapsedSeconds < 48) return roll < 0.2 ? 1 : roll < 0.64 ? 2 : 3;
  return roll < 0.08 ? 1 : roll < 0.4 ? 2 : 3;
}
function maxOrdersFor(elapsedSeconds, difficulty) {
  if (difficulty === "easy") {
    if (elapsedSeconds < 30) return 1;
    if (elapsedSeconds < 68) return 2;
    return 3;
  }
  if (difficulty === "normal") return elapsedSeconds < 24 ? 2 : 3;
  return 3;
}
export {
  COLORS,
  COOKING,
  CUSTOMERS,
  DEFAULT_UPGRADES,
  DIFFICULTIES,
  GAME_SECONDS,
  MAX_ORDERS,
  MENU,
  MENU_IDS,
  UPGRADE_DATA,
  maxOrdersFor,
  orderSizeFor
};
