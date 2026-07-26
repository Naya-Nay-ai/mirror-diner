export const GAME_SECONDS = 90;
export const MAX_ORDERS = 3;

export type DifficultyId = "easy" | "normal" | "hard" | "extra";

export const DIFFICULTIES = {
  easy: {
    label: "のんびり営業",
    en: "EASY",
    description: "焦げなし・注文1件ずつ。初めて遊ぶ人向け。",
    orderLimitMs: 44000,
    firstGapMs: 9200,
    minGapMs: 6500,
    cookMultiplier: 0.86,
    burnGraceMs: null,
    scoreMultiplier: 0.82,
  },
  normal: {
    label: "通常営業",
    en: "NORMAL",
    description: "注文を並行処理。基本のゲームモード。",
    orderLimitMs: 34000,
    firstGapMs: 7600,
    minGapMs: 5000,
    cookMultiplier: 0.94,
    burnGraceMs: 6200,
    scoreMultiplier: 1,
  },
  hard: {
    label: "深夜ラッシュ",
    en: "HARD",
    description: "定番の新メニューと、勤務ごとに変わるTODAY'S SPECIALへ挑戦。",
    orderLimitMs: 24000,
    firstGapMs: 6100,
    minGapMs: 3500,
    cookMultiplier: 1,
    burnGraceMs: 3500,
    scoreMultiplier: 1.3,
  },
  extra: {
    label: "特別営業",
    en: "EXTRA",
    description: "好きなミッションを選び、設備とスタッフ用品を使って達成を狙う挑戦枠。",
    orderLimitMs: 22000,
    firstGapMs: 5700,
    minGapMs: 3200,
    cookMultiplier: 1,
    burnGraceMs: 3200,
    scoreMultiplier: 1.4,
  },
} as const;

export type Upgrades = {
  griddle: 1 | 2 | 3;
  fryer: 1 | 2;
  drinks: 1 | 2 | 3;
  stock: 1 | 2 | 3;
};

export const DEFAULT_UPGRADES: Upgrades = {
  griddle: 1,
  fryer: 1,
  drinks: 1,
  stock: 1,
};

export const UPGRADE_DATA = {
  griddle: {
    label: "グリドル",
    description: "パティの同時調理枠",
    levels: [
      { slots: 1, cost: 0, display: "1枠" },
      { slots: 2, cost: 120, display: "2枠" },
      { slots: 3, cost: 280, display: "3枠" },
    ],
  },
  fryer: {
    label: "フライヤー",
    description: "揚げ物の同時調理枠",
    levels: [
      { slots: 1, cost: 0, display: "1槽" },
      { slots: 2, cost: 180, display: "2槽" },
    ],
  },
  drinks: {
    label: "ドリンクサーバー",
    description: "ドリンク・冷製デザートの速度と同時調理口",
    levels: [
      { speed: 1, slots: 1, cost: 0, display: "標準・1口" },
      { speed: 0.82, slots: 1, cost: 140, display: "高速・1口" },
      { speed: 0.68, slots: 2, cost: 300, display: "業務用・2口" },
    ],
  },
  stock: {
    label: "完成品棚",
    description: "料理を置ける数",
    levels: [
      { slots: 8, cost: 0, display: "8枠" },
      { slots: 12, cost: 100, display: "12枠" },
      { slots: 16, cost: 240, display: "16枠" },
    ],
  },
} as const;

export type MenuId =
  | "hamburger"
  | "cheeseburger"
  | "hotdog"
  | "fries"
  | "donut"
  | "pancakes"
  | "bananaSplit"
  | "onionFries"
  | "denverOmelet"
  | "mapleChickenPancakes"
  | "onionRingBurger"
  | "donutSundae"
  | "cola"
  | "coffee"
  | "shake"
  | "creamSoda";

export type CookableId =
  | "patty"
  | "sausage"
  | "fries"
  | "donut"
  | "pancakes"
  | "bananaSplit"
  | "onionFries"
  | "omeletBase"
  | "friedChicken"
  | "sundaeScoop"
  | "cola"
  | "coffee"
  | "shake"
  | "creamSoda";

export type StationId = "griddle" | "fryer" | "drinks";

export type PreparedIngredientId =
  | "patty"
  | "sausage"
  | "omeletBase"
  | "friedChicken"
  | "sundaeScoop";

export const MENU: Record<
  MenuId,
  { en: string; ja: string; score: number; kind: "food" | "drink" }
> = {
  hamburger: { en: "HAMBURGER", ja: "ハンバーガー", score: 110, kind: "food" },
  cheeseburger: {
    en: "CHEESEBURGER",
    ja: "チーズバーガー",
    score: 130,
    kind: "food",
  },
  hotdog: { en: "HOT DOG", ja: "ホットドッグ", score: 120, kind: "food" },
  fries: { en: "FRIES", ja: "フライドポテト", score: 80, kind: "food" },
  donut: { en: "DONUT", ja: "ドーナツ", score: 85, kind: "food" },
  pancakes: { en: "PANCAKES", ja: "パンケーキ", score: 105, kind: "food" },
  bananaSplit: {
    en: "BANANA SPLIT",
    ja: "バナナスプリット",
    score: 125,
    kind: "food",
  },
  onionFries: {
    en: "ONION FRIES",
    ja: "オニオンフライ",
    score: 95,
    kind: "food",
  },
  denverOmelet: {
    en: "DENVER OMELET",
    ja: "デンバーオムレツ",
    score: 145,
    kind: "food",
  },
  mapleChickenPancakes: {
    en: "MAPLE CHICKEN",
    ja: "メイプルチキンパンケーキ",
    score: 245,
    kind: "food",
  },
  onionRingBurger: {
    en: "ONION RING BURGER",
    ja: "オニオンリングバーガー",
    score: 225,
    kind: "food",
  },
  donutSundae: {
    en: "DONUT SUNDAE",
    ja: "ドーナツサンデー",
    score: 205,
    kind: "food",
  },
  cola: { en: "COLA", ja: "コーラ", score: 60, kind: "drink" },
  coffee: { en: "COFFEE", ja: "コーヒー", score: 65, kind: "drink" },
  shake: { en: "MILKSHAKE", ja: "ミルクシェイク", score: 90, kind: "drink" },
  creamSoda: {
    en: "CREAM SODA",
    ja: "クリームソーダ",
    score: 100,
    kind: "drink",
  },
};

export const COOKING: Record<
  CookableId,
  {
    station: StationId;
    label: string;
    cookMs: number;
    burnMs: number | null;
    result: MenuId | PreparedIngredientId;
  }
> = {
  patty: {
    station: "griddle",
    label: "パティを焼く",
    cookMs: 4700,
    burnMs: 3500,
    result: "patty",
  },
  sausage: {
    station: "griddle",
    label: "ソーセージを焼く",
    cookMs: 3900,
    burnMs: 3000,
    result: "sausage",
  },
  fries: {
    station: "fryer",
    label: "ポテトを揚げる",
    cookMs: 5600,
    burnMs: 3200,
    result: "fries",
  },
  donut: {
    station: "fryer",
    label: "ドーナツを揚げる",
    cookMs: 4100,
    burnMs: 3000,
    result: "donut",
  },
  pancakes: {
    station: "griddle",
    label: "パンケーキを焼く",
    cookMs: 4300,
    burnMs: 3200,
    result: "pancakes",
  },
  bananaSplit: {
    station: "drinks",
    label: "バナナスプリット",
    cookMs: 3200,
    burnMs: null,
    result: "bananaSplit",
  },
  onionFries: {
    station: "fryer",
    label: "オニオンを揚げる",
    cookMs: 4300,
    burnMs: 2900,
    result: "onionFries",
  },
  omeletBase: {
    station: "griddle",
    label: "卵を焼く",
    cookMs: 3900,
    burnMs: 2700,
    result: "omeletBase",
  },
  friedChicken: {
    station: "fryer",
    label: "チキンを揚げる",
    cookMs: 5800,
    burnMs: 3000,
    result: "friedChicken",
  },
  sundaeScoop: {
    station: "drinks",
    label: "アイスを盛る",
    cookMs: 2600,
    burnMs: null,
    result: "sundaeScoop",
  },
  cola: {
    station: "drinks",
    label: "コーラ",
    cookMs: 1300,
    burnMs: null,
    result: "cola",
  },
  coffee: {
    station: "drinks",
    label: "コーヒー",
    cookMs: 2100,
    burnMs: null,
    result: "coffee",
  },
  shake: {
    station: "drinks",
    label: "シェイク",
    cookMs: 2800,
    burnMs: null,
    result: "shake",
  },
  creamSoda: {
    station: "drinks",
    label: "クリームソーダ",
    cookMs: 3400,
    burnMs: null,
    result: "creamSoda",
  },
};

export const CUSTOMERS = [
  {
    id: "shu",
    name: "しゅ",
    image: "/customers/shu.svg",
    size: "small",
    specialGuest: true,
    weight: 0.65,
    expressions: {
      normal: "/customers/shu.svg",
      annoyed: "/customers/shu-annoyed-v2.svg",
      sad: "/customers/shu.svg",
      happy: "/customers/shu.svg",
    },
  },
  {
    id: "miu",
    name: "みう",
    image: "/customers/miu.svg",
    size: "small",
    specialGuest: true,
    weight: 0.65,
    expressions: {
      normal: "/customers/miu.svg",
      annoyed: "/customers/miu-annoyed-v2.svg",
      sad: "/customers/miu.svg",
      happy: "/customers/miu.svg",
    },
  },
  {
    id: "student",
    name: "学生",
    image: "/customers/student.svg",
    size: "regular",
    specialGuest: false,
    weight: 1,
    expressions: {
      normal: "/customers/student.svg",
      annoyed: "/customers/student-annoyed-v2.svg",
      sad: "/customers/student.svg",
      happy: "/customers/student.svg",
    },
  },
  {
    id: "office-worker",
    name: "会社帰り",
    image: "/customers/office-worker.svg",
    size: "regular",
    specialGuest: false,
    weight: 1,
    expressions: {
      normal: "/customers/office-worker.svg",
      annoyed: "/customers/office-worker-annoyed-v2.svg",
      sad: "/customers/office-worker.svg",
      happy: "/customers/office-worker.svg",
    },
  },
  {
    id: "lucky-grandma",
    name: "常連のおばあちゃん",
    image: "/customers/lucky-grandma.svg",
    size: "regular",
    specialGuest: false,
    weight: 1,
    expressions: {
      normal: "/customers/lucky-grandma.svg",
      annoyed: "/customers/lucky-grandma-annoyed-v2.svg",
      sad: "/customers/lucky-grandma.svg",
      happy: "/customers/lucky-grandma.svg",
    },
  },
  {
    id: "night-owl",
    name: "夜型の若者",
    image: "/customers/night-owl.svg",
    size: "regular",
    specialGuest: false,
    weight: 1,
    expressions: {
      normal: "/customers/night-owl.svg",
      annoyed: "/customers/night-owl-annoyed-v2.svg",
      sad: "/customers/night-owl.svg",
      happy: "/customers/night-owl.svg",
    },
  },
  {
    id: "naya",
    name: "なや",
    image: "/customers/naya.svg",
    size: "regular",
    specialGuest: false,
    weight: 1,
    expressions: {
      normal: "/customers/naya.svg",
      annoyed: "/customers/naya-annoyed-v2.svg",
      sad: "/customers/naya.svg",
      happy: "/customers/naya.svg",
    },
  },
  {
    id: "nay",
    name: "ネイ",
    image: "/customers/nay.svg",
    size: "regular",
    specialGuest: false,
    weight: 1,
    expressions: {
      normal: "/customers/nay.svg",
      annoyed: "/customers/nay-annoyed-v2.svg",
      sad: "/customers/nay.svg",
      happy: "/customers/nay.svg",
    },
  },
  {
    id: "mystery-woman",
    name: "謎の女性",
    image: "/customers/mystery-woman.svg",
    size: "regular",
    specialGuest: false,
    weight: 0.82,
    expressions: {
      normal: "/customers/mystery-woman.svg",
      annoyed: "/customers/mystery-woman-annoyed-v2.svg",
      sad: "/customers/mystery-woman.svg",
      happy: "/customers/mystery-woman.svg",
    },
  },
  {
    id: "mystery-man",
    name: "謎の男性",
    image: "/customers/mystery-man.svg",
    size: "regular",
    specialGuest: false,
    weight: 0.82,
    expressions: {
      normal: "/customers/mystery-man.svg",
      annoyed: "/customers/mystery-man-annoyed-v2.svg",
      sad: "/customers/mystery-man.svg",
      happy: "/customers/mystery-man.svg",
    },
  },
] as const;

export const COLORS = {
  ivory: "#f4e8cc",
  cherry: "#8f2632",
  turquoise: "#3f817d",
  brown: "#38271f",
  navy: "#142535",
  butter: "#edc65d",
  mint: "#91c4a9",
  steel: "#b7b7aa",
} as const;

export const MENU_IDS = Object.keys(MENU) as MenuId[];

export function orderSizeFor(elapsedSeconds: number, difficulty: DifficultyId) {
  const roll = Math.random();
  if (difficulty === "easy") {
    return 1;
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

export function maxOrdersFor(elapsedSeconds: number, difficulty: DifficultyId) {
  if (difficulty === "easy") {
    return 1;
  }
  if (difficulty === "normal") return elapsedSeconds < 24 ? 2 : 3;
  return 3;
}
