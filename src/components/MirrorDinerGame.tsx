"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COOKING,
  CookableId,
  CUSTOMERS,
  DEFAULT_UPGRADES,
  DIFFICULTIES,
  DifficultyId,
  GAME_SECONDS,
  MAX_ORDERS,
  MENU,
  MENU_IDS,
  MenuId,
  maxOrdersFor,
  orderSizeFor,
  PreparedIngredientId,
  StationId,
  UPGRADE_DATA,
  Upgrades,
} from "../gameData";

type Screen = "title" | "opening" | "game" | "result";
type TrainingStep =
  | "welcomeShu"
  | "welcomeMiu"
  | "welcomeCalm"
  | "welcomeVisit"
  | "welcomeReady"
  | "coffeeStart"
  | "coffeeCollect"
  | "coffeeSelect"
  | "coffeeServe"
  | "coffeeDone"
  | "colaStart"
  | "colaCollect"
  | "colaSelect"
  | "colaServe"
  | "colaDone"
  | "friesStart"
  | "friesCollect"
  | "friesSelect"
  | "friesServe"
  | "friesDone"
  | "pattyStart"
  | "pattyCollect"
  | "burgerAssemble"
  | "burgerSelect"
  | "burgerServe"
  | "burgerDone"
  | "setIntro"
  | "setPattyStart"
  | "setFriesStart"
  | "setColaStart"
  | "setCollect"
  | "setAssemble"
  | "setSelect"
  | "setServe"
  | "completeMiu"
  | "completeShu"
  | "completeVisit"
  | "completeBye";
type PrepIngredientId = PreparedIngredientId;
type StockItem = {
  uid: number;
  id: MenuId | PrepIngredientId;
  burnt: boolean;
};
type Task = {
  uid: number;
  source: CookableId;
  startedAt: number;
  readyAt: number;
  burnAt: number | null;
  chimed: boolean;
};
type Order = {
  id: number;
  table: number;
  createdAt: number;
  expiresAt: number;
  items: Partial<Record<MenuId, number>>;
  tray: StockItem[];
  customer: number;
};
type CustomerMood = "normal" | "annoyed" | "sad" | "happy";
type CustomerReaction = {
  customer: number;
  mood: "sad" | "happy";
  until: number;
};
type Stats = {
  servedOrders: number;
  servedItems: number;
  mistakes: number;
  waste: number;
  maxCombo: number;
};
type TrophyId =
  | "promisingRookie"
  | "midnightAce"
  | "nightKnight"
  | "easySmile"
  | "peakTimeStar"
  | "lastOrderSurvivor";
type BestScores = Record<DifficultyId, number>;
type TrophyCondition =
  | { kind: "cumulative"; score: number }
  | { kind: "best"; difficulty: DifficultyId; score: number };
type TrophyData = {
  id: TrophyId;
  name: string;
  en: string;
  conditionLabel: string;
  condition: TrophyCondition;
};

type SaveData = {
  tips: number;
  upgrades: Upgrades;
  difficulty: DifficultyId;
  supplies: StaffSupplies;
  selectedMission: MissionId;
  seenRecipes: MenuId[];
  supplyGuidesSeen: Partial<Record<SupplyGuideDifficulty, boolean>>;
  workshopGuideSeen: boolean;
  normalWorkshopNoticeSeen: boolean;
  cumulativeScore: number;
  bestScores: BestScores;
  earnedTrophies: TrophyId[];
};
type StaffSupplyId = "timeCard" | "smile" | "serviceOvertime";
type StaffSupplies = Record<StaffSupplyId, number>;
type SupplyGuideDifficulty = Exclude<DifficultyId, "easy">;
type FirstTimeGuide =
  | {
      kind: "supplies";
      difficulty: SupplyGuideDifficulty;
      index: number;
    }
  | {
      kind: "workshop";
      index: number;
    }
  | {
      kind: "normalWorkshopNotice";
      index: number;
    };
type GuideCard = {
  speaker: "shu" | "miu";
  phase: string;
  text: string;
};
type MissionId = "happyGuests" | "perfectRun" | "comboRush" | "bigService";
type MissionData = {
  en: string;
  label: string;
  description: string;
  target: number;
  reward: number;
  recommended: string;
  progress: (stats: Stats) => number;
  complete: (stats: Stats) => boolean;
};

const SAVE_KEY = "mirror-diner-save-v2";
const DEFAULT_BEST_SCORES: BestScores = {
  easy: 0,
  normal: 0,
  hard: 0,
  extra: 0,
};
const TROPHIES: readonly TrophyData[] = [
  {
    id: "promisingRookie",
    name: "期待の新人",
    en: "PROMISING ROOKIE",
    conditionLabel: "累計スコア 5,000点",
    condition: { kind: "cumulative", score: 5000 },
  },
  {
    id: "midnightAce",
    name: "深夜シフトのエース",
    en: "MIDNIGHT SHIFT ACE",
    conditionLabel: "累計スコア 20,000点",
    condition: { kind: "cumulative", score: 20000 },
  },
  {
    id: "nightKnight",
    name: "NIGHT KNIGHT",
    en: "NIGHT KNIGHT",
    conditionLabel: "累計スコア 50,000点",
    condition: { kind: "cumulative", score: 50000 },
  },
  {
    id: "easySmile",
    name: "余裕のスマイル",
    en: "EASY SMILE",
    conditionLabel: "EASY 1営業 4,500点",
    condition: { kind: "best", difficulty: "easy", score: 4500 },
  },
  {
    id: "peakTimeStar",
    name: "ピークタイムの主役",
    en: "PEAK TIME STAR",
    conditionLabel: "NORMAL 1営業 5,000点",
    condition: { kind: "best", difficulty: "normal", score: 5000 },
  },
  {
    id: "lastOrderSurvivor",
    name: "LAST ORDER SURVIVOR",
    en: "LAST ORDER SURVIVOR",
    conditionLabel: "HARD 1営業 3,500点",
    condition: { kind: "best", difficulty: "hard", score: 3500 },
  },
] as const;
const TROPHY_IDS = new Set<TrophyId>(TROPHIES.map((trophy) => trophy.id));
const isTrophyId = (value: unknown): value is TrophyId =>
  typeof value === "string" && TROPHY_IDS.has(value as TrophyId);
const trophyIsUnlocked = (
  trophy: TrophyData,
  cumulativeScore: number,
  bestScores: BestScores,
) =>
  trophy.condition.kind === "cumulative"
    ? cumulativeScore >= trophy.condition.score
    : bestScores[trophy.condition.difficulty] >= trophy.condition.score;
const STAFF_SUPPLY_MAX = 10;
const SERVICE_OVERTIME_SECONDS = 30;
const STAFF_SUPPLY_DATA: Record<
  StaffSupplyId,
  { label: string; en: string; price: number; description: string }
> = {
  timeCard: {
    label: "タイムカード",
    en: "BREAK CARD",
    price: 40,
    description: "休憩に入ります（一旦停止）。一息ついたら勤務に戻ろう。",
  },
  smile: {
    label: "スマイル",
    en: "SMILE",
    price: 25,
    description: "選んだお客さんの待ち時間を8秒回復します。",
  },
  serviceOvertime: {
    label: "サービス残業",
    en: "OVERTIME",
    price: 80,
    description: "HARD・EXTRA専用。営業中に1回だけ、勤務時間を30秒延長します。",
  },
};
const DEFAULT_SUPPLIES: StaffSupplies = {
  timeCard: 0,
  smile: 0,
  serviceOvertime: 0,
};
const SUPPLY_GUIDES: Record<
  SupplyGuideDifficulty,
  {
    gift: Partial<StaffSupplies>;
    cards: readonly GuideCard[];
  }
> = {
  normal: {
    gift: { timeCard: 1, smile: 1 },
    cards: [
      {
        speaker: "shu",
        phase: "NORMAL SHIFT GIFT",
        text: "しゅとみうから さしいれだよ〜",
      },
      {
        speaker: "shu",
        phase: "BREAK CARD",
        text: "「きゅうけい」を おすと、とけいも おりょうりも いったん とまるよ",
      },
      {
        speaker: "miu",
        phase: "SMILE",
        text: "「すまいる」を おしたら、まってる おきゃくさまを えらんでねっ！",
      },
      {
        speaker: "shu",
        phase: "SMILE",
        text: "まちじかんが 8びょう もどるよ。あぶないときに つかってみよう",
      },
    ],
  },
  hard: {
    gift: { timeCard: 1, smile: 1 },
    cards: [
      {
        speaker: "miu",
        phase: "HARD SHIFT GIFT",
        text: "しんやらっしゅの さしいれだよ〜！",
      },
      {
        speaker: "shu",
        phase: "BREAK CARD",
        text: "きゅうけいは、とけいも おりょうりも いったん とめられるよ",
      },
      {
        speaker: "miu",
        phase: "SMILE",
        text: "すまいるは、おきゃくさまの まちじかんを 8びょう もどせるよっ",
      },
      {
        speaker: "shu",
        phase: "STAFF KIT",
        text: "ひとつずつ ほじゅうしたよ。いそがしいときに つかってね",
      },
    ],
  },
  extra: {
    gift: { serviceOvertime: 1 },
    cards: [
      {
        speaker: "miu",
        phase: "EXTRA SHIFT GIFT",
        text: "とくべつえいぎょうの さしいれだよ〜！",
      },
      {
        speaker: "miu",
        phase: "OVERTIME",
        text: "もうちょっとだけ がんばりたいときに つかってね!!",
      },
      {
        speaker: "shu",
        phase: "OVERTIME",
        text: "えいぎょうじかんが 30びょう のびるよ。ひとばんに 1かいだけ つかえるよ",
      },
    ],
  },
};
const WORKSHOP_GUIDE: readonly GuideCard[] = [
  {
    speaker: "shu",
    phase: "KITCHEN WORKS",
    text: "ここでは ためたTIPで、ちゅうぼうの せつびを つよくできるよ",
  },
  {
    speaker: "miu",
    phase: "KITCHEN WORKS",
    text: "いちどに やけるかずや、りょうりを おけるかずが ふえるよ〜！",
  },
  {
    speaker: "shu",
    phase: "KITCHEN WORKS",
    text: "どりんくを はやくしたり、ふらいやーを ふやすことも できるよ",
  },
  {
    speaker: "miu",
    phase: "KITCHEN WORKS",
    text: "こまったところから かいそうしてねっ。きょうは みるだけでも だいじょうぶ！",
  },
];
const NORMAL_WORKSHOP_NOTICE: readonly GuideCard[] = [
  {
    speaker: "shu",
    phase: "KITCHEN GRADE UP",
    text: "ちゅうぼうの ぐれーどあっぷも できるよ！",
  },
  {
    speaker: "miu",
    phase: "KITCHEN GRADE UP",
    text: "したの「ちゅうぼうを かいそうする」から、ぐりどるを ふやせるよ〜！",
  },
];
const SMILE_RECOVERY_MS = 8000;
const MISSIONS: Record<MissionId, MissionData> = {
  happyGuests: {
    en: "HAPPY GUESTS",
    label: "満足第一！",
    description: "12人以上のお客様を満足させて帰そう。",
    target: 12,
    reward: 90,
    recommended: "サービス残業・スマイル推奨",
    progress: (stats) => stats.servedOrders,
    complete: (stats) => stats.servedOrders >= 12,
  },
  perfectRun: {
    en: "PERFECT RUN",
    label: "ノーミス営業",
    description: "9人以上へ提供し、ミスと廃棄を0で終えよう。",
    target: 9,
    reward: 110,
    recommended: "タイムカード・完成品棚強化推奨",
    progress: (stats) => stats.servedOrders,
    complete: (stats) =>
      stats.servedOrders >= 9 && stats.mistakes === 0 && stats.waste === 0,
  },
  comboRush: {
    en: "COMBO RUSH",
    label: "止めない厨房",
    description: "最大コンボ10を達成しよう。",
    target: 10,
    reward: 95,
    recommended: "2口サーバー・2槽フライヤー推奨",
    progress: (stats) => stats.maxCombo,
    complete: (stats) => stats.maxCombo >= 10,
  },
  bigService: {
    en: "BIG SERVICE",
    label: "大皿ラッシュ",
    description: "料理を合計26品以上提供しよう。",
    target: 26,
    reward: 120,
    recommended: "サービス残業・設備強化推奨",
    progress: (stats) => stats.servedItems,
    complete: (stats) => stats.servedItems >= 26,
  },
};
const DEFAULT_MISSION: MissionId = "happyGuests";
const NORMAL_FEATURED_ITEMS = [
  "hotdog",
  "bananaSplit",
  "donut",
] as const satisfies readonly MenuId[];
const NORMAL_ONLY_ITEMS = new Set<MenuId>(NORMAL_FEATURED_ITEMS);
const HARD_CORE_ITEMS = [
  "onionFries",
  "denverOmelet",
] as const satisfies readonly MenuId[];
const HARD_SPECIALS = [
  "mapleChickenPancakes",
  "onionRingBurger",
  "donutSundae",
] as const satisfies readonly MenuId[];
type HardSpecialId = (typeof HARD_SPECIALS)[number];
const HARD_RECIPE_ITEMS = [
  ...HARD_CORE_ITEMS,
  ...HARD_SPECIALS,
] as const satisfies readonly MenuId[];
const HARD_ONLY_ITEMS = new Set<MenuId>(HARD_RECIPE_ITEMS);
const NORMAL_MENU_IDS = MENU_IDS.filter((id) => !HARD_ONLY_ITEMS.has(id));
const EASY_MENU_IDS = NORMAL_MENU_IDS.filter((id) => !NORMAL_ONLY_ITEMS.has(id));
const hasNormalMenu = (difficulty: DifficultyId) => difficulty !== "easy";
const hasHardMenu = (difficulty: DifficultyId) =>
  difficulty === "hard" || difficulty === "extra";
const activeMenuIds = (
  difficulty: DifficultyId,
  tonightSpecial: HardSpecialId,
) => {
  if (difficulty === "easy") return EASY_MENU_IDS;
  if (difficulty === "normal") return NORMAL_MENU_IDS;
  if (difficulty === "hard") {
    return [...NORMAL_MENU_IDS, ...HARD_CORE_ITEMS, tonightSpecial];
  }
  return MENU_IDS;
};

const RECIPES: Record<
  (typeof HARD_RECIPE_ITEMS)[number],
  { en: string; steps: Array<{ id: MenuId | PrepIngredientId; label: string }> }
> = {
  onionFries: {
    en: "DINER SIDE",
    steps: [{ id: "onionFries", label: "フライヤーでオニオンを揚げる" }],
  },
  denverOmelet: {
    en: "GRIDDLE & FOLD",
    steps: [
      { id: "omeletBase", label: "グリドルで卵を焼く" },
      { id: "denverOmelet", label: "仕上げ台で具とチーズを包む" },
    ],
  },
  mapleChickenPancakes: {
    en: "TODAY'S SPECIAL",
    steps: [
      { id: "pancakes", label: "パンケーキを焼く" },
      { id: "friedChicken", label: "チキンを揚げる" },
      { id: "mapleChickenPancakes", label: "重ねてメイプルをかける" },
    ],
  },
  onionRingBurger: {
    en: "TODAY'S SPECIAL",
    steps: [
      { id: "patty", label: "パティを焼く" },
      { id: "onionFries", label: "オニオンを揚げる" },
      { id: "onionRingBurger", label: "バンズに一緒に挟む" },
    ],
  },
  donutSundae: {
    en: "TODAY'S SPECIAL",
    steps: [
      { id: "donut", label: "ドーナツを揚げる" },
      { id: "sundaeScoop", label: "冷製台でアイスを盛る" },
      { id: "donutSundae", label: "クリームとチェリーで仕上げる" },
    ],
  },
};

function isPrepIngredient(id: StockItem["id"]): id is PrepIngredientId {
  return (
    id === "patty" ||
    id === "sausage" ||
    id === "omeletBase" ||
    id === "friedChicken" ||
    id === "sundaeScoop"
  );
}

const SHIFT_MEMOS: Record<
  DifficultyId,
  { kicker: string; title: string; note: string }
> = {
  easy: {
    kicker: "EASY SHIFT MEMO",
    title: "のんびり営業の手順",
    note: "伝票は1件ずつ。料理は焦げないので、まずは厨房の動きをゆっくり覚えよう。",
  },
  normal: {
    kicker: "STANDARD SHIFT MEMO",
    title: "通常営業の手順",
    note: "複数の伝票を並行して、焼き時間と提供順を見ながら店を回そう。",
  },
  hard: {
    kicker: "LATE-NIGHT RUSH MEMO",
    title: "深夜ラッシュの手順",
    note: "オニオンフライとオムレツは常設。今夜のSPECIAL一品は、二つの設備を回して仕上げ台で合体させよう。",
  },
  extra: {
    kicker: "EXTRA MISSION MEMO",
    title: "特別営業の手順",
    note: "三つのSPECIALが全部登場。複雑料理同士のセット注文も、用品と改装を使って捌き切ろう。",
  },
};

const TRAINING_DIALOGUE: Record<
  TrainingStep,
  {
    speaker: "shu" | "miu";
    text: string;
    phase: string;
    next?: string;
  }
> = {
  welcomeShu: {
    speaker: "shu",
    text: "しゅだよー!! みらーだいなーへ ようこそ〜",
    phase: "WELCOME",
    next: "つぎへ",
  },
  welcomeMiu: {
    speaker: "miu",
    text: "みうだよー!! きょうは しんじんけんしゅう だよっ",
    phase: "WELCOME",
    next: "つぎへ",
  },
  welcomeCalm: {
    speaker: "shu",
    text: "ひとつずつ おぼえれば だいじょうぶ",
    phase: "WELCOME",
    next: "つぎへ",
  },
  welcomeVisit: {
    speaker: "miu",
    text: "しゅとみうも おきゃくさまとして くるからね〜！",
    phase: "WELCOME",
    next: "つぎへ",
  },
  welcomeReady: {
    speaker: "shu",
    text: "おいしく だしてもらえるの、たのしみにしてるよ",
    phase: "WELCOME",
    next: "けんしゅうを はじめる",
  },
  coffeeStart: {
    speaker: "shu",
    text: "まずは こーひーを つくってみよう",
    phase: "STEP 1 / 6　こーひー",
  },
  coffeeCollect: {
    speaker: "miu",
    text: "できたら かっぷを おして かいしゅうしてねっ",
    phase: "STEP 1 / 6　こーひー",
  },
  coffeeSelect: {
    speaker: "shu",
    text: "できた こーひーを えらんでみよう",
    phase: "STEP 1 / 6　こーひー",
  },
  coffeeServe: {
    speaker: "shu",
    text: "したの「TABLE 01へ提供」か、でんぴょうを おしてね",
    phase: "STEP 1 / 6　こーひー",
  },
  coffeeDone: {
    speaker: "shu",
    text: "できたね。つぎも ちゅうもんと おなじものを えらぼう",
    phase: "STEP 1 / 6　CLEAR",
    next: "つぎへ",
  },
  colaStart: {
    speaker: "miu",
    text: "こんどは こーら だよ〜！",
    phase: "STEP 2 / 6　こーら",
  },
  colaCollect: {
    speaker: "shu",
    text: "できあがったら かいしゅうしよう",
    phase: "STEP 2 / 6　こーら",
  },
  colaSelect: {
    speaker: "shu",
    text: "ちゅうもんひょうと おなじ こーらを えらんでね",
    phase: "STEP 2 / 6　こーら",
  },
  colaServe: {
    speaker: "miu",
    text: "そのまま TABLE 01へ ていきょうしてねっ",
    phase: "STEP 2 / 6　こーら",
  },
  colaDone: {
    speaker: "miu",
    text: "いいかんじ〜！",
    phase: "STEP 2 / 6　CLEAR",
    next: "つぎへ",
  },
  friesStart: {
    speaker: "shu",
    text: "ぽてとは ふらいやーで あげるよ",
    phase: "STEP 3 / 6　ぽてと",
  },
  friesCollect: {
    speaker: "miu",
    text: "できるまで ちょっと まってねっ",
    phase: "STEP 3 / 6　ぽてと",
  },
  friesSelect: {
    speaker: "shu",
    text: "あがったら ちゃんと かいしゅうして、ぽてとを えらぼう",
    phase: "STEP 3 / 6　ぽてと",
  },
  friesServe: {
    speaker: "miu",
    text: "TABLE 01へ ていきょう〜！",
    phase: "STEP 3 / 6　ぽてと",
  },
  friesDone: {
    speaker: "shu",
    text: "じょうずだよ。つぎは ぐりどるを つかおう",
    phase: "STEP 3 / 6　CLEAR",
    next: "つぎへ",
  },
  pattyStart: {
    speaker: "shu",
    text: "ぱてぃは ぐりどるで やくよ",
    phase: "STEP 4 / 6　ぱてぃ",
  },
  pattyCollect: {
    speaker: "miu",
    text: "やけたら わすれずに とってね〜！",
    phase: "STEP 4 / 6　ぱてぃ",
  },
  burgerAssemble: {
    speaker: "shu",
    text: "やけた ぱてぃで、ばーがーを くみたてよう",
    phase: "STEP 5 / 6　ばーがー",
  },
  burgerSelect: {
    speaker: "miu",
    text: "かんせいした ばーがーを えらんでねっ",
    phase: "STEP 5 / 6　ばーがー",
  },
  burgerServe: {
    speaker: "shu",
    text: "これも TABLE 01へ ていきょうしよう",
    phase: "STEP 5 / 6　ばーがー",
  },
  burgerDone: {
    speaker: "miu",
    text: "わ〜！ ばーがーも できた〜！",
    phase: "STEP 5 / 6　CLEAR",
    next: "さいごへ",
  },
  setIntro: {
    speaker: "miu",
    text: "さいごは せっとちゅうもん〜！",
    phase: "STEP 6 / 6　せっと",
    next: "ちゅうもんを うける",
  },
  setPattyStart: {
    speaker: "shu",
    text: "やく、あげる、そそぐ。まずは ぱてぃから",
    phase: "STEP 6 / 6　せっと",
  },
  setFriesStart: {
    speaker: "miu",
    text: "ぱてぃを まつあいだに、ぽてとも あげよう〜！",
    phase: "STEP 6 / 6　せっと",
  },
  setColaStart: {
    speaker: "shu",
    text: "つぎは こーら。べつの せつびも いっしょに うごかせるよ",
    phase: "STEP 6 / 6　せっと",
  },
  setCollect: {
    speaker: "miu",
    text: "できたものから ぜんぶ かいしゅうしてねっ",
    phase: "STEP 6 / 6　せっと",
  },
  setAssemble: {
    speaker: "shu",
    text: "ぱてぃを ばーがーに しあげよう",
    phase: "STEP 6 / 6　せっと",
  },
  setSelect: {
    speaker: "miu",
    text: "ばーがー、ぽてと、こーらを ぜんぶ えらんでね〜！",
    phase: "STEP 6 / 6　せっと",
  },
  setServe: {
    speaker: "shu",
    text: "みっつ そろったね。まとめて ていきょうしよう",
    phase: "STEP 6 / 6　せっと",
  },
  completeMiu: {
    speaker: "miu",
    text: "わ〜！ できた〜！ おつかれさま〜！",
    phase: "TRAINING COMPLETE",
    next: "つぎへ",
  },
  completeShu: {
    speaker: "shu",
    text: "これで きほんのえいぎょうは ばっちりだよ",
    phase: "TRAINING COMPLETE",
    next: "つぎへ",
  },
  completeVisit: {
    speaker: "shu",
    text: "しゅとみうも おみせに くるからね",
    phase: "TRAINING COMPLETE",
    next: "つぎへ",
  },
  completeBye: {
    speaker: "miu",
    text: "そのときは よろしくねっ",
    phase: "TRAINING COMPLETE",
    next: "けんしゅうを おわる",
  },
};

const emptyStats: Stats = {
  servedOrders: 0,
  servedItems: 0,
  mistakes: 0,
  waste: 0,
  maxCombo: 0,
};
const calculateFinalScore = (rawScore: number, stats: Stats) =>
  Math.max(
    0,
    rawScore +
      stats.servedOrders * 100 +
      stats.maxCombo * 25 -
      stats.mistakes * 30,
  );

function FoodIcon({
  id,
  burnt = false,
  small = false,
}: {
  id: MenuId | PrepIngredientId;
  burnt?: boolean;
  small?: boolean;
}) {
  return (
    <span
      className={`food-icon food-${id}${burnt ? " is-burnt" : ""}${
        small ? " is-small" : ""
      }`}
      aria-hidden="true"
    >
      <span className="food-art">
        <i className="food-a" />
        <i className="food-b" />
        <i className="food-c" />
        <i className="food-d" />
      </span>
    </span>
  );
}

function TrophyFigurine({
  id,
  small = false,
}: {
  id: TrophyId;
  small?: boolean;
}) {
  return (
    <span
      className={`trophy-figurine trophy-${id}${small ? " is-small" : ""}`}
      aria-hidden="true"
    />
  );
}

function RecipeGuide({
  recipeIds,
  tonightSpecial,
  extra,
}: {
  recipeIds: MenuId[];
  tonightSpecial: HardSpecialId;
  extra: boolean;
}) {
  return (
    <div className="recipe-guide">
      <div className="special-blackboard">
        <small>{extra ? "EXTRA • ALL SPECIALS" : "TODAY'S SPECIAL"}</small>
        <strong>
          {extra ? "SPECIAL MENU FULL COURSE" : MENU[tonightSpecial].ja}
        </strong>
      </div>
      <div className="recipe-cards">
        {recipeIds.map((id) => {
          const recipe = RECIPES[id as keyof typeof RECIPES];
          if (!recipe) return null;
          return (
            <article key={id}>
              <header>
                <FoodIcon id={id} />
                <span>
                  <small>{recipe.en}</small>
                  <b>{MENU[id].ja}</b>
                </span>
              </header>
              <ol>
                {recipe.steps.map((step, index) => (
                  <li key={`${id}-${step.id}-${index}`}>
                    <FoodIcon id={step.id} small />
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Customer({
  index,
  active,
  mood = "normal",
  selectable = false,
  onSelect,
}: {
  index: number;
  active: boolean;
  mood?: CustomerMood;
  selectable?: boolean;
  onSelect?: () => void;
}) {
  const customer = CUSTOMERS[index % CUSTOMERS.length];
  const image = customer.expressions[mood];
  const customerLabel =
    mood === "happy"
      ? `${customer.name}は満足そう`
      : mood === "sad"
        ? `${customer.name}はしょんぼりしている`
        : mood === "annoyed"
          ? `${customer.name}は少し待ちくたびれている`
          : `${customer.name}が注文中`;
  return (
    <div
      className={`customer customer-${customer.id} customer-${customer.size} customer-mood-${mood} ${
        customer.specialGuest ? "is-special-guest" : ""
      } ${active ? "is-active" : ""} ${selectable ? "is-smile-target" : ""}`}
      aria-label={active ? customerLabel : "空席"}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      {active && (
        <img
          className="customer-sprite"
          src={image}
          alt=""
          draggable={false}
        />
      )}
      <span className="stool" />
    </div>
  );
}

function useDinerAudio(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  return useCallback(
    (kind: "ticket" | "ready" | "drink" | "success" | "mistake" | "bell" | "end") => {
      if (!enabled || typeof window === "undefined") return;
      const AudioCtx = window.AudioContext;
      if (!AudioCtx) return;
      const ctx = contextRef.current ?? new AudioCtx();
      contextRef.current = ctx;
      const patterns: Record<typeof kind, Array<[number, number, number]>> = {
        ticket: [[660, 0.035, 0]],
        ready: [
          [520, 0.06, 0],
          [780, 0.07, 0.075],
        ],
        drink: [[920, 0.055, 0]],
        success: [
          [660, 0.06, 0],
          [880, 0.08, 0.07],
        ],
        mistake: [
          [190, 0.12, 0],
          [145, 0.16, 0.1],
        ],
        bell: [[1240, 0.13, 0]],
        end: [
          [420, 0.12, 0],
          [315, 0.16, 0.13],
          [210, 0.23, 0.3],
        ],
      };
      patterns[kind].forEach(([frequency, duration, delay]) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = kind === "mistake" ? "square" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          ctx.currentTime + delay + duration,
        );
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + duration + 0.02);
      });
    },
    [enabled],
  );
}

export default function MirrorDinerGame() {
  const [screen, setScreen] = useState<Screen>("title");
  const [sound, setSound] = useState(true);
  const [tutorial, setTutorial] = useState(false);
  const [trainingStep, setTrainingStep] = useState<TrainingStep | null>(null);
  const [workshop, setWorkshop] = useState(false);
  const [staffStore, setStaffStore] = useState(false);
  const [saveLoaded, setSaveLoaded] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyId>("easy");
  const [tips, setTips] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrades>(DEFAULT_UPGRADES);
  const [supplies, setSupplies] = useState<StaffSupplies>(DEFAULT_SUPPLIES);
  const [supplyGuidesSeen, setSupplyGuidesSeen] = useState<
    Partial<Record<SupplyGuideDifficulty, boolean>>
  >({});
  const [workshopGuideSeen, setWorkshopGuideSeen] = useState(false);
  const [normalWorkshopNoticeSeen, setNormalWorkshopNoticeSeen] =
    useState(false);
  const [cumulativeScore, setCumulativeScore] = useState(0);
  const [bestScores, setBestScores] =
    useState<BestScores>(DEFAULT_BEST_SCORES);
  const [earnedTrophies, setEarnedTrophies] = useState<TrophyId[]>([]);
  const [trophyQueue, setTrophyQueue] = useState<TrophyId[]>([]);
  const [trophyShelfOpen, setTrophyShelfOpen] = useState(false);
  const [firstTimeGuide, setFirstTimeGuide] =
    useState<FirstTimeGuide | null>(null);
  const [selectedMission, setSelectedMission] =
    useState<MissionId>(DEFAULT_MISSION);
  const [seenRecipes, setSeenRecipes] = useState<MenuId[]>([]);
  const [tonightSpecial, setTonightSpecial] =
    useState<HardSpecialId>("mapleChickenPancakes");
  const [shiftRecipeIds, setShiftRecipeIds] = useState<MenuId[]>([]);
  const [recipeBookOpen, setRecipeBookOpen] = useState(false);
  const [earnedTips, setEarnedTips] = useState(0);
  const [earnedMissionBonus, setEarnedMissionBonus] = useState(0);
  const [remaining, setRemaining] = useState(GAME_SECONDS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerReactions, setCustomerReactions] = useState<
    Partial<Record<number, CustomerReaction>>
  >({});
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [selectedStock, setSelectedStock] = useState<number[]>([]);
  const [tasks, setTasks] = useState<Record<StationId, Task[]>>({
    griddle: [],
    fryer: [],
    drinks: [],
  });
  const [now, setNow] = useState(0);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const [badTicket, setBadTicket] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [smileMode, setSmileMode] = useState(false);
  const [usedServiceOvertime, setUsedServiceOvertime] = useState(false);
  const supplyGuidesSeenRef = useRef<
    Partial<Record<SupplyGuideDifficulty, boolean>>
  >({});
  const normalWorkshopNoticeSeenRef = useRef(false);
  const cumulativeScoreRef = useRef(0);
  const bestScoresRef = useRef<BestScores>(DEFAULT_BEST_SCORES);
  const earnedTrophiesRef = useRef<TrophyId[]>([]);
  const trophiesEvaluatedRef = useRef(false);
  const startAtRef = useRef(0);
  const shiftDurationRef = useRef(GAME_SECONDS);
  const nextOrderAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const recipePausedAtRef = useRef(0);
  const uidRef = useRef(1);
  const ordersRef = useRef<Order[]>([]);
  const stockRef = useRef<StockItem[]>([]);
  const tasksRef = useRef<Record<StationId, Task[]>>({
    griddle: [],
    fryer: [],
    drinks: [],
  });
  const customerReactionsRef = useRef<
    Partial<Record<number, CustomerReaction>>
  >({});
  const finishedRef = useRef(false);
  const normalFeaturedIndexRef = useRef(0);
  const introOrderQueueRef = useRef<MenuId[]>([]);
  const playSound = useDinerAudio(sound);

  const trainingMode = trainingStep !== null;
  const trainingServeStep =
    trainingStep === "coffeeServe" ||
    trainingStep === "colaServe" ||
    trainingStep === "friesServe" ||
    trainingStep === "burgerServe" ||
    trainingStep === "setServe";
  const trainingDialogue = trainingStep
    ? TRAINING_DIALOGUE[trainingStep]
    : null;
  const activeDifficulty: DifficultyId = trainingMode ? "easy" : difficulty;
  const difficultyData = DIFFICULTIES[activeDifficulty];
  const shiftMemo = SHIFT_MEMOS[difficulty];
  const stationSlots: Record<StationId, number> = {
    griddle: UPGRADE_DATA.griddle.levels[upgrades.griddle - 1].slots,
    fryer: UPGRADE_DATA.fryer.levels[upgrades.fryer - 1].slots,
    drinks: UPGRADE_DATA.drinks.levels[upgrades.drinks - 1].slots,
  };
  const drinkSpeed =
    UPGRADE_DATA.drinks.levels[upgrades.drinks - 1].speed;
  const stockLimit = UPGRADE_DATA.stock.levels[upgrades.stock - 1].slots;

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<SaveData>;
          if (typeof saved.tips === "number") setTips(Math.max(0, saved.tips));
          if (saved.difficulty && DIFFICULTIES[saved.difficulty]) {
            setDifficulty(saved.difficulty);
          }
          if (saved.selectedMission && MISSIONS[saved.selectedMission]) {
            setSelectedMission(saved.selectedMission);
          }
          if (Array.isArray(saved.seenRecipes)) {
            setSeenRecipes(
              saved.seenRecipes.filter((id): id is MenuId =>
                HARD_RECIPE_ITEMS.includes(
                  id as (typeof HARD_RECIPE_ITEMS)[number],
                ),
              ),
            );
          }
          if (saved.upgrades) {
            setUpgrades({
              griddle: Math.min(3, Math.max(1, saved.upgrades.griddle ?? 1)) as 1 | 2 | 3,
              fryer: Math.min(2, Math.max(1, saved.upgrades.fryer ?? 1)) as 1 | 2,
              drinks: Math.min(3, Math.max(1, saved.upgrades.drinks ?? 1)) as 1 | 2 | 3,
              stock: Math.min(3, Math.max(1, saved.upgrades.stock ?? 1)) as 1 | 2 | 3,
            });
          }
          if (saved.supplies) {
            setSupplies({
              timeCard: Math.min(
                STAFF_SUPPLY_MAX,
                Math.max(0, saved.supplies.timeCard ?? 0),
              ),
              smile: Math.min(
                STAFF_SUPPLY_MAX,
                Math.max(0, saved.supplies.smile ?? 0),
              ),
              serviceOvertime: Math.min(
                STAFF_SUPPLY_MAX,
                Math.max(0, saved.supplies.serviceOvertime ?? 0),
              ),
            });
          }
          if (saved.supplyGuidesSeen) {
            const loadedSupplyGuides = {
              normal: Boolean(saved.supplyGuidesSeen.normal),
              hard: Boolean(saved.supplyGuidesSeen.hard),
              extra: Boolean(saved.supplyGuidesSeen.extra),
            };
            supplyGuidesSeenRef.current = loadedSupplyGuides;
            setSupplyGuidesSeen(loadedSupplyGuides);
          }
          setWorkshopGuideSeen(Boolean(saved.workshopGuideSeen));
          normalWorkshopNoticeSeenRef.current = Boolean(
            saved.normalWorkshopNoticeSeen,
          );
          setNormalWorkshopNoticeSeen(
            Boolean(saved.normalWorkshopNoticeSeen),
          );
          const loadedCumulativeScore =
            typeof saved.cumulativeScore === "number" &&
            Number.isFinite(saved.cumulativeScore)
              ? Math.max(0, Math.round(saved.cumulativeScore))
              : 0;
          const loadedBestScores = (
            Object.keys(DEFAULT_BEST_SCORES) as DifficultyId[]
          ).reduce<BestScores>(
            (scores, id) => {
              const savedScore = saved.bestScores?.[id];
              scores[id] =
                typeof savedScore === "number" && Number.isFinite(savedScore)
                  ? Math.max(0, Math.round(savedScore))
                  : 0;
              return scores;
            },
            { ...DEFAULT_BEST_SCORES },
          );
          const loadedTrophies = Array.isArray(saved.earnedTrophies)
            ? Array.from(new Set(saved.earnedTrophies.filter(isTrophyId)))
            : [];
          cumulativeScoreRef.current = loadedCumulativeScore;
          bestScoresRef.current = loadedBestScores;
          earnedTrophiesRef.current = loadedTrophies;
          setCumulativeScore(loadedCumulativeScore);
          setBestScores(loadedBestScores);
          setEarnedTrophies(loadedTrophies);
        }
      } catch {
        window.localStorage.removeItem(SAVE_KEY);
      } finally {
        setSaveLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    if (!saveLoaded) return;
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        tips,
        upgrades,
        difficulty,
        supplies,
        selectedMission,
        seenRecipes,
        supplyGuidesSeen,
        workshopGuideSeen,
        normalWorkshopNoticeSeen,
        cumulativeScore,
        bestScores,
        earnedTrophies,
      } satisfies SaveData),
    );
  }, [
    bestScores,
    cumulativeScore,
    difficulty,
    earnedTrophies,
    saveLoaded,
    seenRecipes,
    selectedMission,
    supplies,
    supplyGuidesSeen,
    tips,
    upgrades,
    workshopGuideSeen,
    normalWorkshopNoticeSeen,
  ]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    stockRef.current = stock;
  }, [stock]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    customerReactionsRef.current = customerReactions;
  }, [customerReactions]);

  const makeOrder = useCallback(
    (time: number) => {
      const elapsed = Math.max(0, (time - startAtRef.current) / 1000);
      const size = orderSizeFor(elapsed, difficulty);
      const items: Partial<Record<MenuId, number>> = {};
      const introRecipeId = introOrderQueueRef.current[0];
      const featuredId =
        introRecipeId ??
        (difficulty === "normal"
          ? NORMAL_FEATURED_ITEMS[normalFeaturedIndexRef.current]
          : undefined);
      if (featuredId) {
        items[featuredId] = 1;
      } else {
        const menuPool = activeMenuIds(difficulty, tonightSpecial);
        const shuffled = [...menuPool].sort(() => Math.random() - 0.5);
        const orderMenu = shuffled.slice(0, size);
        orderMenu.forEach((id) => {
          const canDouble =
            difficulty !== "easy" &&
            !HARD_RECIPE_ITEMS.includes(
              id as (typeof HARD_RECIPE_ITEMS)[number],
            ) &&
            elapsed > 42 &&
            Math.random() < 0.22;
          items[id] = canDouble ? 2 : 1;
        });
      }
      const usedTables = new Set(ordersRef.current.map((order) => order.table));
      Object.entries(customerReactionsRef.current).forEach(([table, reaction]) => {
        if (reaction && reaction.until > time) usedTables.add(Number(table));
      });
      const freeTables = [1, 2, 3].filter((table) => !usedTables.has(table));
      if (!freeTables.length) return;
      if (introRecipeId) {
        introOrderQueueRef.current.shift();
      } else if (featuredId && difficulty === "normal") {
        normalFeaturedIndexRef.current += 1;
      }
      const usedCustomers = new Set(
        ordersRef.current.map((order) => order.customer),
      );
      Object.values(customerReactionsRef.current).forEach((reaction) => {
        if (reaction && reaction.until > time) {
          usedCustomers.add(reaction.customer);
        }
      });
      const availableCustomers = CUSTOMERS.map((_, index) => index).filter(
        (index) => !usedCustomers.has(index),
      );
      if (availableCustomers.length === 0) return;
      const customerPool = availableCustomers;
      const totalWeight = customerPool.reduce(
        (sum, index) => sum + CUSTOMERS[index].weight,
        0,
      );
      let customerRoll = Math.random() * totalWeight;
      const chosenCustomer =
        customerPool.find((index) => {
          customerRoll -= CUSTOMERS[index].weight;
          return customerRoll <= 0;
        }) ?? customerPool[0] ?? 0;
      const order: Order = {
        id: uidRef.current++,
        table: freeTables[0] ?? ((uidRef.current % 3) + 1),
        createdAt: time,
        expiresAt: time + DIFFICULTIES[difficulty].orderLimitMs,
        items,
        tray: [],
        customer: chosenCustomer,
      };
      setOrders((current) => {
        if (current.length >= MAX_ORDERS) return current;
        const next = [...current, order];
        if (selectedOrder === null) setSelectedOrder(order.id);
        return next;
      });
      playSound("ticket");
    },
    [difficulty, playSound, selectedOrder, tonightSpecial],
  );

  const startGame = useCallback(() => {
    const nextSpecial =
      HARD_SPECIALS[Math.floor(Math.random() * HARD_SPECIALS.length)] ??
      "mapleChickenPancakes";
    const availableRecipes: MenuId[] =
      difficulty === "extra"
        ? [...HARD_RECIPE_ITEMS]
        : difficulty === "hard"
          ? [...HARD_CORE_ITEMS, nextSpecial]
          : [];
    const newRecipes = availableRecipes.filter(
      (id) => !seenRecipes.includes(id),
    );
    setTonightSpecial(nextSpecial);
    setShiftRecipeIds(newRecipes);
    introOrderQueueRef.current = [...newRecipes];
    startAtRef.current = 0;
    shiftDurationRef.current = GAME_SECONDS;
    nextOrderAtRef.current = 0;
    finishedRef.current = false;
    trophiesEvaluatedRef.current = false;
    uidRef.current = 1;
    setRemaining(GAME_SECONDS);
    setScore(0);
    setCombo(0);
    setStats(emptyStats);
    setOrders([]);
    ordersRef.current = [];
    setCustomerReactions({});
    customerReactionsRef.current = {};
    setSelectedOrder(null);
    setStock([]);
    stockRef.current = [];
    setSelectedStock([]);
    setTasks({ griddle: [], fryer: [], drinks: [] });
    tasksRef.current = { griddle: [], fryer: [], drinks: [] };
    setNow(Date.now());
    setFlash(null);
    setBadTicket(null);
    setPaused(false);
    setSmileMode(false);
    pausedAtRef.current = 0;
    setEarnedTips(0);
    setEarnedMissionBonus(0);
    setUsedServiceOvertime(false);
    setRecipeBookOpen(false);
    setTrainingStep(null);
    setTrophyQueue([]);
    recipePausedAtRef.current = 0;
    normalFeaturedIndexRef.current = 0;
    if (difficulty !== "easy" && !supplyGuidesSeenRef.current[difficulty]) {
      const guide = SUPPLY_GUIDES[difficulty];
      supplyGuidesSeenRef.current = {
        ...supplyGuidesSeenRef.current,
        [difficulty]: true,
      };
      setSupplies((current) => ({
        timeCard: Math.min(
          STAFF_SUPPLY_MAX,
          current.timeCard + (guide.gift.timeCard ?? 0),
        ),
        smile: Math.min(
          STAFF_SUPPLY_MAX,
          current.smile + (guide.gift.smile ?? 0),
        ),
        serviceOvertime: Math.min(
          STAFF_SUPPLY_MAX,
          current.serviceOvertime + (guide.gift.serviceOvertime ?? 0),
        ),
      }));
      setSupplyGuidesSeen((current) => ({
        ...current,
        [difficulty]: true,
      }));
      setFirstTimeGuide({ kind: "supplies", difficulty, index: 0 });
    } else {
      setFirstTimeGuide(null);
    }
    setTutorial(true);
    setScreen("game");
  }, [difficulty, seenRecipes]);

  const beginShift = () => {
    const start = Date.now();
    startAtRef.current = start;
    nextOrderAtRef.current = start;
    setNow(start);
    if (shiftRecipeIds.length > 0) {
      setSeenRecipes((current) =>
        Array.from(new Set([...current, ...shiftRecipeIds])),
      );
    }
    setTutorial(false);
  };

  const openDiner = () => {
    setScreen("opening");
    window.setTimeout(startGame, 1080);
  };

  useEffect(() => {
    if (
      screen !== "game" ||
      tutorial ||
      paused ||
      recipeBookOpen ||
      startAtRef.current === 0
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      const time = Date.now();
      const elapsed = Math.max(0, (time - startAtRef.current) / 1000);
      const left = Math.max(0, shiftDurationRef.current - elapsed);
      setNow(time);
      setRemaining(left);
      setCustomerReactions((current) => {
        const entries = Object.entries(current).filter(
          ([, reaction]) => reaction && reaction.until > time,
        );
        if (entries.length === Object.keys(current).length) return current;
        return Object.fromEntries(entries);
      });

      setTasks((current) => {
        let changed = false;
        const next: Record<StationId, Task[]> = {
          griddle: [...current.griddle],
          fryer: [...current.fryer],
          drinks: [...current.drinks],
        };
        (Object.keys(next) as StationId[]).forEach((station) => {
          next[station] = next[station].map((task) => {
            if (!task.chimed && time >= task.readyAt) {
              playSound(station === "drinks" ? "drink" : "ready");
              changed = true;
              return { ...task, chimed: true };
            }
            return task;
          });
        });
        return changed ? next : current;
      });

      setOrders((current) => {
        const expired = current.filter((order) => time >= order.expiresAt);
        if (!expired.length) return current;
        setStats((value) => ({ ...value, mistakes: value.mistakes + expired.length }));
        setCombo(0);
        setFlash("bad");
        playSound("mistake");
        const expiredIds = new Set(expired.map((order) => order.id));
        const survivors = current.filter((order) => !expiredIds.has(order.id));
        expired.forEach((order) => {
          setCustomerReactions((reactions) => ({
            ...reactions,
            [order.table]: {
              customer: order.customer,
              mood: "sad",
              until: time + 1150,
            },
          }));
          if (order.tray.length) {
            setStock((items) => [...items, ...order.tray]);
          }
        });
        setSelectedOrder((id) =>
          id !== null && expiredIds.has(id) ? (survivors[0]?.id ?? null) : id,
        );
        return survivors;
      });

      if (
        time >= nextOrderAtRef.current &&
        ordersRef.current.length <
          maxOrdersFor(elapsed, difficulty) &&
        left > 5
      ) {
        makeOrder(time);
        const config = DIFFICULTIES[difficulty];
        nextOrderAtRef.current =
          time +
          Math.max(config.minGapMs, config.firstGapMs - elapsed * 24) +
          Math.random() * 1200;
      }
      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true;
        const closingWaste =
          stockRef.current.length +
          ordersRef.current.reduce((sum, order) => sum + order.tray.length, 0) +
          Object.values(tasksRef.current).reduce(
            (sum, stationTasks) => sum + stationTasks.length,
            0,
          );
        const finalStats =
          closingWaste > 0
            ? { ...stats, waste: stats.waste + closingWaste }
            : stats;
        if (closingWaste > 0) {
          setStats(finalStats);
          setScore((current) => Math.max(0, current - closingWaste * 20));
        }
        const baseReward = Math.max(
          8,
          Math.round(
            finalStats.servedOrders * 9 +
              finalStats.servedItems * 2 +
              finalStats.maxCombo * 3 -
              finalStats.mistakes * 2,
          ),
        );
        const missionBonus =
          difficulty === "extra" && MISSIONS[selectedMission].complete(finalStats)
            ? MISSIONS[selectedMission].reward
            : 0;
        const reward = baseReward + missionBonus;
        setEarnedMissionBonus(missionBonus);
        setEarnedTips(reward);
        setTips((value) => value + reward);
        playSound("end");
        if (
          difficulty === "normal" &&
          !normalWorkshopNoticeSeenRef.current
        ) {
          normalWorkshopNoticeSeenRef.current = true;
          setNormalWorkshopNoticeSeen(true);
          setFirstTimeGuide({ kind: "normalWorkshopNotice", index: 0 });
        }
        setScreen("result");
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [
    difficulty,
    makeOrder,
    paused,
    playSound,
    recipeBookOpen,
    screen,
    selectedMission,
    stats,
    tutorial,
  ]);

  useEffect(() => {
    if (screen !== "game" || !trainingMode) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      setTasks((current) => {
        let changed = false;
        const next: Record<StationId, Task[]> = {
          griddle: [...current.griddle],
          fryer: [...current.fryer],
          drinks: [...current.drinks],
        };
        (Object.keys(next) as StationId[]).forEach((station) => {
          next[station] = next[station].map((task) => {
            if (!task.chimed && time >= task.readyAt) {
              playSound(station === "drinks" ? "drink" : "ready");
              changed = true;
              return { ...task, chimed: true };
            }
            return task;
          });
        });
        return changed ? next : current;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playSound, screen, trainingMode]);

  useEffect(() => {
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  useEffect(() => {
    if (badTicket === null) return;
    const timeout = window.setTimeout(() => setBadTicket(null), 420);
    return () => window.clearTimeout(timeout);
  }, [badTicket]);

  const clearTrainingKitchen = () => {
    setStock([]);
    stockRef.current = [];
    setSelectedStock([]);
    setTasks({ griddle: [], fryer: [], drinks: [] });
    tasksRef.current = { griddle: [], fryer: [], drinks: [] };
    setOrders([]);
    ordersRef.current = [];
    setSelectedOrder(null);
    setCustomerReactions({});
    customerReactionsRef.current = {};
  };

  const prepareTrainingOrder = (
    items: Partial<Record<MenuId, number>>,
    customer: 0 | 1,
  ) => {
    clearTrainingKitchen();
    const time = Date.now();
    const order: Order = {
      id: uidRef.current++,
      table: 1,
      createdAt: time,
      expiresAt: time + 60 * 60 * 1000,
      items,
      tray: [],
      customer,
    };
    setNow(time);
    setOrders([order]);
    ordersRef.current = [order];
    setSelectedOrder(order.id);
    playSound("ticket");
  };

  const startTraining = () => {
    startAtRef.current = 0;
    shiftDurationRef.current = GAME_SECONDS;
    nextOrderAtRef.current = 0;
    finishedRef.current = false;
    uidRef.current = 1;
    setRemaining(GAME_SECONDS);
    setScore(0);
    setCombo(0);
    setStats(emptyStats);
    clearTrainingKitchen();
    setNow(Date.now());
    setFlash(null);
    setBadTicket(null);
    setPaused(false);
    setSmileMode(false);
    setTutorial(false);
    setRecipeBookOpen(false);
    setTrainingStep("welcomeShu");
    setScreen("game");
  };

  const finishTraining = () => {
    clearTrainingKitchen();
    setTrainingStep(null);
    setFlash(null);
    setCombo(0);
    setScore(0);
    setScreen("title");
  };

  const advanceTrainingCard = () => {
    switch (trainingStep) {
      case "welcomeShu":
        setTrainingStep("welcomeMiu");
        break;
      case "welcomeMiu":
        setTrainingStep("welcomeCalm");
        break;
      case "welcomeCalm":
        setTrainingStep("welcomeVisit");
        break;
      case "welcomeVisit":
        setTrainingStep("welcomeReady");
        break;
      case "welcomeReady":
        prepareTrainingOrder({ coffee: 1 }, 0);
        setTrainingStep("coffeeStart");
        break;
      case "coffeeDone":
        prepareTrainingOrder({ cola: 1 }, 1);
        setTrainingStep("colaStart");
        break;
      case "colaDone":
        prepareTrainingOrder({ fries: 1 }, 0);
        setTrainingStep("friesStart");
        break;
      case "friesDone":
        prepareTrainingOrder({ hamburger: 1 }, 1);
        setTrainingStep("pattyStart");
        break;
      case "burgerDone":
        clearTrainingKitchen();
        setTrainingStep("setIntro");
        break;
      case "setIntro":
        prepareTrainingOrder({ hamburger: 1, fries: 1, cola: 1 }, 0);
        setTrainingStep("setPattyStart");
        break;
      case "completeMiu":
        setTrainingStep("completeShu");
        break;
      case "completeShu":
        setTrainingStep("completeVisit");
        break;
      case "completeVisit":
        setTrainingStep("completeBye");
        break;
      case "completeBye":
        finishTraining();
        break;
      default:
        break;
    }
  };

  const trainingCookTarget = (source: CookableId) => {
    if (!trainingStep) return true;
    return (
      (trainingStep === "coffeeStart" && source === "coffee") ||
      (trainingStep === "colaStart" && source === "cola") ||
      (trainingStep === "friesStart" && source === "fries") ||
      (trainingStep === "pattyStart" && source === "patty") ||
      (trainingStep === "setPattyStart" && source === "patty") ||
      (trainingStep === "setFriesStart" && source === "fries") ||
      (trainingStep === "setColaStart" && source === "cola")
    );
  };

  const trainingCollectTarget = (task?: Task) => {
    if (!trainingStep || !task) return !trainingStep;
    return (
      (trainingStep === "coffeeCollect" && task.source === "coffee") ||
      (trainingStep === "colaCollect" && task.source === "cola") ||
      (trainingStep === "friesCollect" && task.source === "fries") ||
      (trainingStep === "pattyCollect" && task.source === "patty") ||
      (trainingStep === "setCollect" &&
        (task.source === "patty" ||
          task.source === "fries" ||
          task.source === "cola"))
    );
  };

  const trainingStockTarget = (item: StockItem) => {
    if (!trainingStep) return true;
    if (trainingStep === "coffeeSelect") return item.id === "coffee";
    if (trainingStep === "colaSelect") return item.id === "cola";
    if (trainingStep === "friesSelect") return item.id === "fries";
    if (trainingStep === "burgerSelect") return item.id === "hamburger";
    if (trainingStep === "setSelect") {
      return (
        item.id === "hamburger" || item.id === "fries" || item.id === "cola"
      );
    }
    return false;
  };

  const startCooking = (source: CookableId) => {
    if (trainingMode && !trainingCookTarget(source)) return;
    const data = COOKING[source];
    if (tasks[data.station].length >= stationSlots[data.station] || remaining <= 0) {
      return;
    }
    const time = now;
    const equipmentMultiplier = data.station === "drinks" ? drinkSpeed : 1;
    const cookMs = trainingMode
      ? Math.min(1300, data.cookMs)
      : Math.round(
          data.cookMs * difficultyData.cookMultiplier * equipmentMultiplier,
        );
    const burnGrace = trainingMode
      ? null
      : data.burnMs === null
        ? null
        : difficultyData.burnGraceMs;
    setTasks((current) => ({
      ...current,
      [data.station]: [
        ...current[data.station],
        {
          uid: uidRef.current++,
          source,
          startedAt: time,
          readyAt: time + cookMs,
          burnAt: burnGrace ? time + cookMs + burnGrace : null,
          chimed: false,
        },
      ],
    }));
    if (trainingStep === "coffeeStart") setTrainingStep("coffeeCollect");
    if (trainingStep === "colaStart") setTrainingStep("colaCollect");
    if (trainingStep === "friesStart") setTrainingStep("friesCollect");
    if (trainingStep === "pattyStart") setTrainingStep("pattyCollect");
    if (trainingStep === "setPattyStart") setTrainingStep("setFriesStart");
    if (trainingStep === "setFriesStart") setTrainingStep("setColaStart");
    if (trainingStep === "setColaStart") setTrainingStep("setCollect");
  };

  const collectTask = (station: StationId, taskUid: number) => {
    const task = tasks[station].find((entry) => entry.uid === taskUid);
    if (
      !task ||
      now < task.readyAt ||
      (trainingMode && !trainingCollectTarget(task))
    ) {
      return;
    }
    if (stock.length >= stockLimit) {
      setFlash("bad");
      return;
    }
    const data = COOKING[task.source];
    const burnt = task.burnAt !== null && now >= task.burnAt;
    const collectedItem = { uid: uidRef.current++, id: data.result, burnt };
    setStock((current) => {
      const next = [...current, collectedItem];
      if (
        trainingStep === "setCollect" &&
        next.some((item) => item.id === "patty") &&
        next.some((item) => item.id === "fries") &&
        next.some((item) => item.id === "cola")
      ) {
        setTrainingStep("setAssemble");
      }
      return next;
    });
    setTasks((current) => ({
      ...current,
      [station]: current[station].filter((entry) => entry.uid !== taskUid),
    }));
    if (trainingStep === "coffeeCollect") setTrainingStep("coffeeSelect");
    if (trainingStep === "colaCollect") setTrainingStep("colaSelect");
    if (trainingStep === "friesCollect") setTrainingStep("friesSelect");
    if (trainingStep === "pattyCollect") setTrainingStep("burgerAssemble");
  };

  const assemblyRecipes: Partial<
    Record<MenuId, Array<MenuId | PrepIngredientId>>
  > = {
    hamburger: ["patty"],
    cheeseburger: ["patty"],
    hotdog: ["sausage"],
    denverOmelet: ["omeletBase"],
    mapleChickenPancakes: ["pancakes", "friedChicken"],
    onionRingBurger: ["patty", "onionFries"],
    donutSundae: ["donut", "sundaeScoop"],
  };

  const ingredientsFor = (id: MenuId) => {
    const recipe = assemblyRecipes[id] ?? [];
    const claimed = new Set<number>();
    return recipe.map((ingredientId) => {
      const ingredient = stock.find(
        (item) => item.id === ingredientId && !claimed.has(item.uid),
      );
      if (ingredient) claimed.add(ingredient.uid);
      return ingredient;
    });
  };

  const canAssemble = (id: MenuId) =>
    (assemblyRecipes[id]?.length ?? 0) > 0 &&
    ingredientsFor(id).every(Boolean);

  const assemble = (id: MenuId) => {
    if (
      trainingMode &&
      !(
        id === "hamburger" &&
        (trainingStep === "burgerAssemble" || trainingStep === "setAssemble")
      )
    ) {
      return;
    }
    const ingredients = ingredientsFor(id);
    if (!ingredients.length || ingredients.some((item) => !item)) return;
    const ingredientIds = new Set(
      ingredients
        .filter((item): item is StockItem => Boolean(item))
        .map((item) => item.uid),
    );
    const burnt = ingredients.some((item) => item?.burnt);
    setStock((current) => [
      ...current.filter((item) => !ingredientIds.has(item.uid)),
      { uid: uidRef.current++, id, burnt },
    ]);
    setSelectedStock([]);
    if (trainingStep === "burgerAssemble") setTrainingStep("burgerSelect");
    if (trainingStep === "setAssemble") setTrainingStep("setSelect");
  };

  const toggleStockSelection = (item: StockItem) => {
    if (trainingMode && !trainingStockTarget(item)) return;
    setSelectedStock((current) => {
      const next = current.includes(item.uid)
        ? current.filter((uid) => uid !== item.uid)
        : [...current, item.uid];
      if (trainingStep === "coffeeSelect" && item.id === "coffee") {
        setTrainingStep("coffeeServe");
      }
      if (trainingStep === "colaSelect" && item.id === "cola") {
        setTrainingStep("colaServe");
      }
      if (trainingStep === "friesSelect" && item.id === "fries") {
        setTrainingStep("friesServe");
      }
      if (trainingStep === "burgerSelect" && item.id === "hamburger") {
        setTrainingStep("burgerServe");
      }
      if (trainingStep === "setSelect") {
        const selectedItems = next
          .map((uid) =>
            uid === item.uid ? item : stock.find((entry) => entry.uid === uid),
          )
          .filter((entry): entry is StockItem => Boolean(entry));
        if (
          selectedItems.some((entry) => entry.id === "hamburger") &&
          selectedItems.some((entry) => entry.id === "fries") &&
          selectedItems.some((entry) => entry.id === "cola")
        ) {
          setTrainingStep("setServe");
        }
      }
      return next;
    });
  };

  const registerSelectedToOrder = (orderId: number) => {
    if (selectedStock.length === 0) return false;
    const selectedItems = selectedStock
      .map((uid) => stock.find((entry) => entry.uid === uid))
      .filter((item): item is StockItem => Boolean(item));
    if (
      selectedItems.length !== selectedStock.length ||
      selectedItems.some((item) => isPrepIngredient(item.id))
    ) {
      setBadTicket(orderId);
      setFlash("bad");
      return false;
    }
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return false;
    const selectedCounts: Partial<Record<MenuId, number>> = {};
    selectedItems.forEach((item) => {
      if (isPrepIngredient(item.id)) return;
      selectedCounts[item.id] = (selectedCounts[item.id] ?? 0) + 1;
    });
    const acceptsBatch = MENU_IDS.every((id) => {
      const registered = order.tray.filter((entry) => entry.id === id).length;
      return registered + (selectedCounts[id] ?? 0) <= (order.items[id] ?? 0);
    });
    if (!acceptsBatch) {
      setBadTicket(orderId);
      setFlash("bad");
      playSound("mistake");
      return false;
    }
    const selectedIds = new Set(selectedItems.map((item) => item.uid));
    const nextTray = [...order.tray, ...selectedItems];
    const nextTrayCounts: Partial<Record<MenuId, number>> = {};
    let hasBurnt = false;
    nextTray.forEach((item) => {
      if (isPrepIngredient(item.id)) return;
      nextTrayCounts[item.id] = (nextTrayCounts[item.id] ?? 0) + 1;
      hasBurnt ||= item.burnt;
    });
    const completesOrder =
      !hasBurnt &&
      MENU_IDS.every(
        (id) => (nextTrayCounts[id] ?? 0) === (order.items[id] ?? 0),
      );
    setStock((current) =>
      current.filter((entry) => !selectedIds.has(entry.uid)),
    );
    setSelectedOrder(orderId);
    setSelectedStock([]);
    if (completesOrder) {
      serve(orderId, nextTray);
    } else {
      setOrders((current) =>
        current.map((entry) =>
          entry.id === orderId ? { ...entry, tray: nextTray } : entry,
        ),
      );
    }
    return true;
  };

  const registerSelected = () => {
    if (selectedOrder === null) return;
    if (trainingMode && !trainingServeStep) return;
    registerSelectedToOrder(selectedOrder);
  };

  const returnFromTray = (orderId: number, itemUid: number) => {
    if (trainingMode) return;
    const order = orders.find((entry) => entry.id === orderId);
    const item = order?.tray.find((entry) => entry.uid === itemUid);
    if (!item) return;
    setOrders((current) =>
      current.map((entry) =>
        entry.id === orderId
          ? { ...entry, tray: entry.tray.filter((trayItem) => trayItem.uid !== itemUid) }
          : entry,
      ),
    );
    setStock((current) => [...current, item]);
  };

  const wasteSelected = () => {
    if (trainingMode) return;
    if (selectedStock.length === 0) return;
    const selectedIds = new Set(selectedStock);
    const wasteCount = stock.filter((item) => selectedIds.has(item.uid)).length;
    if (wasteCount === 0) return;
    setStock((current) =>
      current.filter((item) => !selectedIds.has(item.uid)),
    );
    setSelectedStock([]);
    setStats((current) => ({
      ...current,
      waste: current.waste + wasteCount,
    }));
    setScore((current) => Math.max(0, current - wasteCount * 20));
  };

  const serve = (orderId: number, trayOverride?: StockItem[]) => {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const servingTray = trayOverride ?? order.tray;
    const trayCounts: Partial<Record<MenuId, number>> = {};
    let hasBurnt = false;
    servingTray.forEach((item) => {
      if (isPrepIngredient(item.id)) return;
      trayCounts[item.id] = (trayCounts[item.id] ?? 0) + 1;
      hasBurnt ||= item.burnt;
    });
    const exact =
      !hasBurnt &&
      MENU_IDS.every((id) => (trayCounts[id] ?? 0) === (order.items[id] ?? 0));
    if (!exact) {
      setStats((current) => ({ ...current, mistakes: current.mistakes + 1 }));
      setCombo(0);
      setScore((current) => Math.max(0, current - 35));
      setFlash("bad");
      playSound("mistake");
      return;
    }
    const itemCount = Object.values(order.items).reduce(
      (sum, count) => sum + (count ?? 0),
      0,
    );
    const speedRatio = Math.max(
      0,
      (order.expiresAt - now) / difficultyData.orderLimitMs,
    );
    const base = servingTray.reduce(
      (sum, item) =>
        sum + (isPrepIngredient(item.id) ? 0 : MENU[item.id].score),
      0,
    );
    const nextCombo = combo + 1;
    const earned = Math.round(
      (base + Math.round(speedRatio * 90) + Math.min(150, nextCombo * 15)) *
        difficultyData.scoreMultiplier,
    );
    setScore((current) => current + earned);
    setCombo(nextCombo);
    setStats((current) => ({
      ...current,
      servedOrders: current.servedOrders + 1,
      servedItems: current.servedItems + itemCount,
      maxCombo: Math.max(current.maxCombo, nextCombo),
    }));
    setCustomerReactions((current) => ({
      ...current,
      [order.table]: {
        customer: order.customer,
        mood: "happy",
        until: now + 1050,
      },
    }));
    setOrders((current) => {
      const next = current.filter((entry) => entry.id !== orderId);
      setSelectedOrder((id) => (id === orderId ? (next[0]?.id ?? null) : id));
      return next;
    });
    setFlash("good");
    playSound("bell");
    playSound("success");
    if (trainingStep === "coffeeServe") setTrainingStep("coffeeDone");
    if (trainingStep === "colaServe") setTrainingStep("colaDone");
    if (trainingStep === "friesServe") setTrainingStep("friesDone");
    if (trainingStep === "burgerServe") setTrainingStep("burgerDone");
    if (trainingStep === "setServe") setTrainingStep("completeMiu");
    if (!trainingMode) {
      nextOrderAtRef.current = Math.min(nextOrderAtRef.current, now + 900);
    }
  };

  const finalScore = calculateFinalScore(score, stats);

  useEffect(() => {
    if (
      screen !== "result" ||
      !saveLoaded ||
      trophiesEvaluatedRef.current
    ) {
      return;
    }
    trophiesEvaluatedRef.current = true;

    const nextCumulativeScore = cumulativeScoreRef.current + finalScore;
    const nextBestScores: BestScores = {
      ...bestScoresRef.current,
      [difficulty]: Math.max(bestScoresRef.current[difficulty], finalScore),
    };
    const alreadyEarned = new Set(earnedTrophiesRef.current);
    const newlyEarned = TROPHIES.filter(
      (trophy) =>
        !alreadyEarned.has(trophy.id) &&
        trophyIsUnlocked(trophy, nextCumulativeScore, nextBestScores),
    ).map((trophy) => trophy.id);
    const nextEarnedSet = new Set([
      ...earnedTrophiesRef.current,
      ...newlyEarned,
    ]);
    const nextEarnedTrophies = TROPHIES.filter((trophy) =>
      nextEarnedSet.has(trophy.id),
    ).map((trophy) => trophy.id);

    cumulativeScoreRef.current = nextCumulativeScore;
    bestScoresRef.current = nextBestScores;
    earnedTrophiesRef.current = nextEarnedTrophies;
    setCumulativeScore(nextCumulativeScore);
    setBestScores(nextBestScores);
    setEarnedTrophies(nextEarnedTrophies);
    setTrophyQueue(newlyEarned);
  }, [difficulty, finalScore, saveLoaded, screen]);

  const dismissTrophy = () => {
    setTrophyQueue((current) => current.slice(1));
  };

  const selectedOrderData = orders.find((order) => order.id === selectedOrder);
  const selectedStockItems = selectedStock
    .map((uid) => stock.find((item) => item.uid === uid))
    .filter((item): item is StockItem => Boolean(item));

  const orderAcceptsSelected = (order: Order) => {
    if (
      selectedStockItems.length === 0 ||
      selectedStockItems.some((item) => isPrepIngredient(item.id))
    ) {
      return false;
    }
    const selectedCounts: Partial<Record<MenuId, number>> = {};
    selectedStockItems.forEach((item) => {
      if (isPrepIngredient(item.id)) return;
      selectedCounts[item.id] = (selectedCounts[item.id] ?? 0) + 1;
    });
    return MENU_IDS.every((id) => {
      const registered = order.tray.filter((item) => item.id === id).length;
      return registered + (selectedCounts[id] ?? 0) <= (order.items[id] ?? 0);
    });
  };

  const selectedBatchCompletes = (order: Order) => {
    if (!orderAcceptsSelected(order)) return false;
    const combined = [...order.tray, ...selectedStockItems];
    if (combined.some((item) => item.burnt)) return false;
    return MENU_IDS.every(
      (id) =>
        combined.filter((item) => item.id === id).length ===
        (order.items[id] ?? 0),
    );
  };

  const stationView = (task?: Task) => {
    if (!task) return { state: "empty", progress: 0, text: "空き" };
    const cookMs = task.readyAt - task.startedAt;
    if (now < task.readyAt) {
      return {
        state: "cooking",
        progress: Math.min(1, (now - task.startedAt) / cookMs),
        text: "調理中",
      };
    }
    if (task.burnAt && now >= task.burnAt) {
      return { state: "burnt", progress: 1, text: "焦げた！" };
    }
    const danger =
      task.burnAt &&
      (task.burnAt - now) / (task.burnAt - task.readyAt) < 0.38;
    return {
      state: danger ? "danger" : "ready",
      progress: 1,
      text: danger ? "焦げそう！" : "できあがり",
    };
  };

  const trayState = (order: Order) => {
    const counts: Partial<Record<MenuId, number>> = {};
    let burnt = false;
    order.tray.forEach((item) => {
      if (isPrepIngredient(item.id)) return;
      counts[item.id] = (counts[item.id] ?? 0) + 1;
      burnt ||= item.burnt;
    });
    const missing = MENU_IDS.reduce(
      (sum, id) => sum + Math.max(0, (order.items[id] ?? 0) - (counts[id] ?? 0)),
      0,
    );
    const extra = MENU_IDS.some((id) => (counts[id] ?? 0) > (order.items[id] ?? 0));
    return { counts, burnt, missing, exact: !burnt && !extra && missing === 0 };
  };

  const buyUpgrade = (key: keyof Upgrades) => {
    const currentLevel = upgrades[key];
    const levels = UPGRADE_DATA[key].levels as readonly {
      cost: number;
      display: string;
    }[];
    if (currentLevel >= levels.length) return;
    const price = levels[currentLevel].cost;
    if (tips < price) return;
    setTips((value) => value - price);
    setUpgrades((current) => ({
      ...current,
      [key]: (current[key] + 1) as never,
    }));
  };

  const buySupply = (key: StaffSupplyId) => {
    const data = STAFF_SUPPLY_DATA[key];
    if (tips < data.price || supplies[key] >= STAFF_SUPPLY_MAX) return;
    setTips((value) => value - data.price);
    setSupplies((current) => ({ ...current, [key]: current[key] + 1 }));
  };

  const openWorkshop = () => {
    setWorkshop(true);
    if (workshopGuideSeen) return;
    setWorkshopGuideSeen(true);
    setFirstTimeGuide({ kind: "workshop", index: 0 });
  };

  const advanceFirstTimeGuide = () => {
    if (!firstTimeGuide) return;
    const cards =
      firstTimeGuide.kind === "supplies"
        ? SUPPLY_GUIDES[firstTimeGuide.difficulty].cards
        : firstTimeGuide.kind === "workshop"
          ? WORKSHOP_GUIDE
          : NORMAL_WORKSHOP_NOTICE;
    if (firstTimeGuide.index >= cards.length - 1) {
      setFirstTimeGuide(null);
      return;
    }
    setFirstTimeGuide({
      ...firstTimeGuide,
      index: firstTimeGuide.index + 1,
    });
  };

  const useServiceOvertime = () => {
    if (
      (difficulty !== "hard" && difficulty !== "extra") ||
      tutorial ||
      paused ||
      startAtRef.current === 0 ||
      supplies.serviceOvertime <= 0 ||
      usedServiceOvertime ||
      remaining <= 0
    ) {
      return;
    }
    shiftDurationRef.current += SERVICE_OVERTIME_SECONDS;
    setRemaining((current) => current + SERVICE_OVERTIME_SECONDS);
    setSupplies((current) => ({
      ...current,
      serviceOvertime: Math.max(0, current.serviceOvertime - 1),
    }));
    setUsedServiceOvertime(true);
    setFlash("good");
    playSound("bell");
  };

  const shiftTimeline = (pauseMs: number) => {
    startAtRef.current += pauseMs;
    nextOrderAtRef.current += pauseMs;
    setOrders((current) =>
      current.map((order) => ({
        ...order,
        createdAt: order.createdAt + pauseMs,
        expiresAt: order.expiresAt + pauseMs,
      })),
    );
    setTasks((current) => {
      const shifted = Object.fromEntries(
        (Object.keys(current) as StationId[]).map((station) => [
          station,
          current[station].map((task) => ({
            ...task,
            startedAt: task.startedAt + pauseMs,
            readyAt: task.readyAt + pauseMs,
            burnAt: task.burnAt === null ? null : task.burnAt + pauseMs,
          })),
        ]),
      ) as Record<StationId, Task[]>;
      tasksRef.current = shifted;
      return shifted;
    });
    setCustomerReactions((current) =>
      Object.fromEntries(
        Object.entries(current).map(([table, reaction]) => [
          table,
          reaction ? { ...reaction, until: reaction.until + pauseMs } : reaction,
        ]),
      ),
    );
  };

  const pauseShift = () => {
    if (
      paused ||
      tutorial ||
      startAtRef.current === 0 ||
      supplies.timeCard <= 0 ||
      remaining <= 0
    ) {
      return;
    }
    const time = Date.now();
    pausedAtRef.current = time;
    setNow(time);
    setSupplies((current) => ({
      ...current,
      timeCard: Math.max(0, current.timeCard - 1),
    }));
    setSmileMode(false);
    setPaused(true);
  };

  const resumeShift = () => {
    if (!paused || pausedAtRef.current === 0) return;
    const resumedAt = Date.now();
    const pauseMs = resumedAt - pausedAtRef.current;
    shiftTimeline(pauseMs);
    pausedAtRef.current = 0;
    setNow(resumedAt);
    setPaused(false);
  };

  const openRecipeBook = () => {
    if (
      tutorial ||
      paused ||
      recipeBookOpen ||
      startAtRef.current === 0 ||
      remaining <= 0
    ) {
      return;
    }
    const time = Date.now();
    recipePausedAtRef.current = time;
    setNow(time);
    setSmileMode(false);
    setRecipeBookOpen(true);
  };

  const closeRecipeBook = () => {
    if (!recipeBookOpen || recipePausedAtRef.current === 0) return;
    const resumedAt = Date.now();
    shiftTimeline(resumedAt - recipePausedAtRef.current);
    recipePausedAtRef.current = 0;
    setNow(resumedAt);
    setRecipeBookOpen(false);
  };

  const applySmile = (orderId: number) => {
    if (!smileMode || supplies.smile <= 0) return;
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    setOrders((current) =>
      current.map((entry) =>
        entry.id === orderId
          ? {
              ...entry,
              expiresAt: Math.min(
                entry.expiresAt + SMILE_RECOVERY_MS,
                now + difficultyData.orderLimitMs,
              ),
            }
          : entry,
      ),
    );
    setSupplies((current) => ({
      ...current,
      smile: Math.max(0, current.smile - 1),
    }));
    setCustomerReactions((current) => ({
      ...current,
      [order.table]: {
        customer: order.customer,
        mood: "happy",
        until: now + 850,
      },
    }));
    setSmileMode(false);
    setFlash("good");
    playSound("success");
  };

  const missionData = MISSIONS[selectedMission];
  const activeRecipeIds: MenuId[] =
    difficulty === "extra"
      ? [...HARD_RECIPE_ITEMS]
      : difficulty === "hard"
        ? [...HARD_CORE_ITEMS, tonightSpecial]
        : [];
  const memoRecipeIds =
    shiftRecipeIds.length > 0 ? shiftRecipeIds : activeRecipeIds;
  const missionProgress = Math.min(
    missionData.target,
    missionData.progress(stats),
  );
  const missionComplete = missionData.complete(stats);

  const resultRows = useMemo(
    () => [
      ["SERVED ORDERS", stats.servedOrders],
      ["SERVED ITEMS", stats.servedItems],
      ["MISTAKES", stats.mistakes],
      ["WASTE", stats.waste],
      ["MAX COMBO", stats.maxCombo],
      ["TOTAL SCORE", finalScore],
    ],
    [finalScore, stats],
  );

  if (screen === "title" || screen === "opening") {
    return (
      <main
        className={`title-screen exterior-title-screen ${
          screen === "opening" ? "door-opening" : ""
        }`}
      >
        <button
          className="sound-toggle title-sound"
          onClick={() => setSound((value) => !value)}
          aria-label={sound ? "音を消す" : "音を出す"}
        >
          SOUND {sound ? "ON" : "OFF"}
        </button>
        <section className="exterior-stage" aria-label="夜のMIRROR DINER外観">
          <div className="css-night-sky" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="hybrid-diner-shell">
            <img
              className="hybrid-exterior-art"
              src="/mirror-diner-exterior.svg"
              alt=""
              draggable={false}
            />
            <button
              className="door-entry"
              onClick={openDiner}
              aria-label="中央のドアを開けてMIRROR DINERへ入る"
            >
              <span className="door-portal" aria-hidden="true" />
              <img
                className="door-leaf door-leaf-art"
                src="/mirror-diner-door.svg"
                alt=""
                draggable={false}
                aria-hidden="true"
              />
            </button>
          </div>
          <div className="css-parking-lot" aria-hidden="true" />
        </section>
        <section className="title-control-deck">
          <div className="title-difficulty-group">
            <div className="title-mode-copy">
              <strong>TONIGHT&apos;S SHIFT</strong>
              <span>
                {difficulty === "extra" ? "SELECT A MISSION" : "90 SEC. SCORE ATTACK"}
              </span>
            </div>
            <div className="difficulty-selector" aria-label="難易度">
              {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => (
                <button
                  className={difficulty === id ? "is-selected" : ""}
                  key={id}
                  onClick={() => setDifficulty(id)}
                >
                  <strong>{DIFFICULTIES[id].en}</strong>
                  <span>{DIFFICULTIES[id].label}</span>
                </button>
              ))}
            </div>
            <div className="title-support-row">
              <p className="difficulty-description">{difficultyData.description}</p>
              <button
                className="training-button"
                onClick={startTraining}
              >
                <span className="training-button-pair" aria-hidden="true">
                  <img src="/customers/shu.svg" alt="" />
                  <img src="/customers/miu.svg" alt="" />
                </span>
                <span>
                  <small>TRAINING</small>
                  新人研修
                </span>
              </button>
            </div>
            {difficulty === "extra" && (
              <div className="mission-selector" aria-label="EXTRAミッション">
                {(Object.keys(MISSIONS) as MissionId[]).map((id) => {
                  const mission = MISSIONS[id];
                  return (
                    <button
                      className={selectedMission === id ? "is-selected" : ""}
                      key={id}
                      onClick={() => setSelectedMission(id)}
                    >
                      <strong>{mission.label}</strong>
                      <span>{mission.description}</span>
                      <small>{mission.recommended}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="title-door-hint">
            <span>WHEN YOU&apos;RE READY</span>
            <strong>PUSH THE DOOR TO START</strong>
          </p>
          <div className="title-utility">
            <button
              className="workshop-button"
              onClick={openWorkshop}
            >
              <span className="power-tool-icon" aria-hidden="true">
                <i className="power-tool-bit" />
                <i className="power-tool-body" />
                <i className="power-tool-handle" />
              </span>
              <span className="workshop-button-label">厨房を改装する</span>
            </button>
            <button
              className="staff-store-button"
              onClick={() => setStaffStore(true)}
            >
              <span className="staff-bag-icon" aria-hidden="true">+</span>
              <span>スタッフ用品</span>
            </button>
            {earnedTrophies.length > 0 && (
              <button
                className="trophy-shelf-button"
                onClick={() => setTrophyShelfOpen(true)}
              >
                <span className="trophy-shelf-mini" aria-hidden="true">
                  {TROPHIES.map((trophy) => (
                    <i key={trophy.id}>
                      {earnedTrophies.includes(trophy.id) && (
                        <TrophyFigurine id={trophy.id} small />
                      )}
                    </i>
                  ))}
                </span>
                <span>
                  <small>TROPHY SHELF</small>
                  トロフィー {earnedTrophies.length} / {TROPHIES.length}
                </span>
              </button>
            )}
            <span>TIP {tips}</span>
          </div>
        </section>
        <footer className="title-footer">
          <strong>MIRROR ROOM</strong>
          <span>© 2026 MIRROR ROOM — BY NAY &amp; NAYA</span>
        </footer>
        {workshop && (
          <div className="workshop-overlay" role="dialog" aria-modal="true">
            <section className="workshop-board">
              <header>
                <div>
                  <small>KITCHEN WORKS</small>
                  <h2>厨房改装</h2>
                </div>
                <strong>TIP {tips}</strong>
              </header>
              <p className="workshop-note">
                設備本体は標準装備。フライヤーは2槽、業務用ドリンクサーバーは2口まで増設できます。
              </p>
              {(Object.keys(UPGRADE_DATA) as Array<keyof Upgrades>).map((key) => {
                const data = UPGRADE_DATA[key];
                const level = upgrades[key];
                const levels = data.levels as readonly {
                  cost: number;
                  display: string;
                }[];
                const current = levels[level - 1];
                const next = levels[level];
                return (
                  <article key={key}>
                    <div>
                      <h3>{data.label}</h3>
                      <p>{data.description}</p>
                      <span>LEVEL {level} / {data.levels.length}</span>
                    </div>
                    <div className="upgrade-action">
                      <b>{current.display}</b>
                      {next ? (
                        <button
                          disabled={tips < next.cost}
                          onClick={() => buyUpgrade(key)}
                        >
                          {next.display}へ　TIP {next.cost}
                        </button>
                      ) : (
                        <span className="upgrade-max">MAX</span>
                      )}
                    </div>
                  </article>
                );
              })}
              <button className="workshop-close" onClick={() => setWorkshop(false)}>
                改装を終える
              </button>
            </section>
          </div>
        )}
        {staffStore && (
          <div className="workshop-overlay" role="dialog" aria-modal="true">
            <section className="workshop-board supplies-board">
              <header>
                <div>
                  <small>STAFF SUPPLIES</small>
                  <h2>スタッフ用品</h2>
                </div>
                <strong>TIP {tips}</strong>
              </header>
              <p className="workshop-note">
                営業へ持ち込める使い切りアイテムです。各アイテム10個まで所持できます。
              </p>
              {(Object.keys(STAFF_SUPPLY_DATA) as StaffSupplyId[]).map((key) => {
                const data = STAFF_SUPPLY_DATA[key];
                const count = supplies[key];
                return (
                  <article className={`supply-card supply-${key}`} key={key}>
                    <span className="supply-pixel-icon" aria-hidden="true">
                      {key === "timeCard" ? (
                        <span className="clock-face" />
                      ) : key === "smile" ? (
                        "☺"
                      ) : (
                        <span className="overtime-icon">+30</span>
                      )}
                    </span>
                    <div>
                      <small>{data.en}</small>
                      <h3>{data.label}</h3>
                      <p>{data.description}</p>
                      <span>所持 {count} / {STAFF_SUPPLY_MAX}</span>
                    </div>
                    <div className="upgrade-action">
                      <b>TIP {data.price}</b>
                      <button
                        disabled={tips < data.price || count >= STAFF_SUPPLY_MAX}
                        onClick={() => buySupply(key)}
                      >
                        {count >= STAFF_SUPPLY_MAX ? "所持上限" : "1個買う"}
                      </button>
                    </div>
                  </article>
                );
              })}
              <button
                className="workshop-close"
                onClick={() => setStaffStore(false)}
              >
                買い物を終える
              </button>
            </section>
          </div>
        )}
        {trophyShelfOpen && (
          <div className="trophy-shelf-overlay" role="dialog" aria-modal="true">
            <section className="trophy-shelf-board">
              <header>
                <div>
                  <small>MIRROR DINER</small>
                  <h2>TROPHY SHELF</h2>
                  <p>獲得したフィギュアだけが、ここに飾られます。</p>
                </div>
                <strong>{earnedTrophies.length} / {TROPHIES.length}</strong>
              </header>
              <div className="trophy-shelf-grid">
                {TROPHIES.map((trophy, index) => {
                  const unlocked = earnedTrophies.includes(trophy.id);
                  return (
                    <article
                      className={unlocked ? "is-unlocked" : "is-empty"}
                      key={trophy.id}
                      aria-label={
                        unlocked ? trophy.name : `空いている飾り場所 ${index + 1}`
                      }
                    >
                      <div className="trophy-shelf-spot">
                        {unlocked && <TrophyFigurine id={trophy.id} />}
                      </div>
                      {unlocked && (
                        <div>
                          <small>{trophy.en}</small>
                          <strong>{trophy.name}</strong>
                          <span>{trophy.conditionLabel}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <dl className="trophy-score-ledger">
                <div>
                  <dt>累計</dt>
                  <dd>{cumulativeScore.toLocaleString()} SCORE</dd>
                </div>
                {(Object.keys(DEFAULT_BEST_SCORES) as DifficultyId[]).map((id) => (
                  <div key={id}>
                    <dt>{DIFFICULTIES[id].en}</dt>
                    <dd>{bestScores[id].toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <button
                className="trophy-shelf-close"
                onClick={() => setTrophyShelfOpen(false)}
              >
                棚を閉じる
              </button>
            </section>
          </div>
        )}
        {firstTimeGuide && firstTimeGuide.kind === "workshop" && (() => {
          const card = WORKSHOP_GUIDE[firstTimeGuide.index];
          const isLast = firstTimeGuide.index === WORKSHOP_GUIDE.length - 1;
          return (
            <div className="first-guide-overlay" role="dialog" aria-modal="true">
              <section className={`first-guide-card guide-${card.speaker}`}>
                <div className="first-guide-portrait" aria-hidden="true">
                  <img
                    src={`/customers/${card.speaker}.svg`}
                    alt=""
                    draggable={false}
                  />
                </div>
                <div className="first-guide-copy">
                  <small>{card.phase}</small>
                  <strong>{card.speaker === "shu" ? "しゅ" : "みう"}</strong>
                  <p>{card.text}</p>
                </div>
                <button onClick={advanceFirstTimeGuide}>
                  {isLast ? "わかった！ みてみる" : "つぎへ"}
                </button>
              </section>
            </div>
          );
        })()}
      </main>
    );
  }

  if (screen === "result") {
    return (
      <main className="result-screen">
        <div className="receipt">
          <div className="receipt-logo">MIRROR DINER</div>
          <p>— SHIFT CLOSED —</p>
          <div className="receipt-rule" />
          {resultRows.map(([label, value], index) => (
            <div
              className={`receipt-row ${index === resultRows.length - 1 ? "total" : ""}`}
              key={label}
            >
              <span>{label}</span>
              <strong>{String(value).padStart(4, "0")}</strong>
            </div>
          ))}
          {difficulty === "extra" && (
            <div
              className={`mission-result ${
                missionComplete ? "is-complete" : "is-failed"
              }`}
            >
              <small>{missionData.en}</small>
              <strong>{missionComplete ? "MISSION CLEAR" : "MISSION FAILED"}</strong>
              <span>
                {missionData.label}　{missionProgress}/{missionData.target}
              </span>
            </div>
          )}
          <div className="receipt-rule" />
          {earnedMissionBonus > 0 && (
            <div className="receipt-row mission-earned">
              <span>MISSION BONUS</span>
              <strong>+{earnedMissionBonus}</strong>
            </div>
          )}
          <div className="receipt-row tip-earned">
            <span>SHIFT TIPS</span>
            <strong>+{earnedTips - earnedMissionBonus}</strong>
          </div>
          <div className="receipt-row">
            <span>TIP BALANCE</span>
            <strong>{tips}</strong>
          </div>
          <div className="receipt-rule" />
          <p className="receipt-thanks">THANK YOU, NIGHT CREW.</p>
          <div className="barcode" aria-hidden="true" />
        </div>
        <div className="result-actions">
          <button onClick={startGame}>もう一度営業する</button>
          <button onClick={() => {
            setScreen("title");
            openWorkshop();
          }}>
            厨房を改装する
          </button>
          <button onClick={() => {
            setScreen("title");
            setStaffStore(true);
          }}>
            スタッフ用品を買う
          </button>
          <button className="secondary" onClick={() => setScreen("title")}>
            タイトルへ戻る
          </button>
        </div>
        {trophyQueue.length > 0 && (() => {
          const trophy = TROPHIES.find(
            (entry) => entry.id === trophyQueue[0],
          );
          if (!trophy) return null;
          return (
            <div className="trophy-unlock-overlay" role="dialog" aria-modal="true">
              <section className="trophy-polaroid">
                <div className="trophy-polaroid-topline">
                  <span>NEW TROPHY</span>
                  <b>★</b>
                </div>
                <div className="trophy-photo-window">
                  <TrophyFigurine id={trophy.id} />
                  <span className="trophy-photo-flash" aria-hidden="true">✦</span>
                </div>
                <div className="trophy-polaroid-copy">
                  <small>{trophy.en}</small>
                  <h2>{trophy.name}</h2>
                  <p>{trophy.conditionLabel} 達成！</p>
                </div>
                <div className="trophy-polaroid-stamp">
                  MIRROR DINER<br />NIGHT CREW
                </div>
                <button onClick={dismissTrophy}>
                  {trophyQueue.length > 1
                    ? "つぎのトロフィーを見る"
                    : "飾り棚へしまう"}
                </button>
              </section>
            </div>
          );
        })()}
        {firstTimeGuide &&
          trophyQueue.length === 0 &&
          firstTimeGuide.kind === "normalWorkshopNotice" &&
          (() => {
            const card = NORMAL_WORKSHOP_NOTICE[firstTimeGuide.index];
            const isLast =
              firstTimeGuide.index === NORMAL_WORKSHOP_NOTICE.length - 1;
            return (
              <div
                className="first-guide-overlay"
                role="dialog"
                aria-modal="true"
              >
                <section className={`first-guide-card guide-${card.speaker}`}>
                  <div className="first-guide-portrait" aria-hidden="true">
                    <img
                      src={`/customers/${card.speaker}.svg`}
                      alt=""
                      draggable={false}
                    />
                  </div>
                  <div className="first-guide-copy">
                    <small>{card.phase}</small>
                    <strong>{card.speaker === "shu" ? "しゅ" : "みう"}</strong>
                    <p>{card.text}</p>
                  </div>
                  <button onClick={advanceFirstTimeGuide}>
                    {isLast ? "わかった！" : "つぎへ"}
                  </button>
                </section>
              </div>
            );
          })()}
      </main>
    );
  }

  return (
    <main
      className={`game-screen ${trainingMode ? "is-training" : ""} ${
        flash ? `flash-${flash}` : ""
      }`}
    >
      <header className="game-header">
        <div className="mini-logo">
          <span>MIRROR</span>
          <strong>DINER</strong>
        </div>
        <div className="kitchen-clock">
          <span>TIME</span>
          <strong>
            {trainingMode
              ? "∞"
              : Math.ceil(remaining).toString().padStart(2, "0")}
          </strong>
        </div>
        <div className="register-score">
          <span>{trainingMode ? "NEW CREW / TRAINING" : `${difficultyData.en} / SCORE`}</span>
          <strong>{trainingMode ? "PRACTICE" : score.toString().padStart(5, "0")}</strong>
        </div>
        <div className={`combo-bell ${combo > 1 ? "is-hot" : ""}`}>
          <i />
          <strong>{combo}</strong>
          <span>COMBO</span>
        </div>
        <button
          className="sound-toggle"
          onClick={() => setSound((value) => !value)}
          aria-label={sound ? "音を消す" : "音を出す"}
        >
          {sound ? "SND" : "MUTE"}
        </button>
      </header>

      <aside className={`shift-tools ${smileMode ? "is-targeting" : ""}`}>
        {trainingMode ? (
          <span className="training-live">
            <small>SHU &amp; MIU</small>
            <strong>しんじんけんしゅう</strong>
          </span>
        ) : activeDifficulty === "extra" ? (
          <span className="mission-live">
            <small>{missionData.en}</small>
            <strong>{missionProgress}/{missionData.target}</strong>
          </span>
        ) : activeDifficulty === "hard" ? (
          <span className="special-live">
            <small>TODAY&apos;S SPECIAL</small>
            <strong>{MENU[tonightSpecial].ja}</strong>
          </span>
        ) : (
          <span className="shift-tools-label">STAFF KIT</span>
        )}
        {hasHardMenu(activeDifficulty) && (
          <button
            className="recipe-tool"
            disabled={tutorial || trainingMode}
            onClick={openRecipeBook}
          >
            <i aria-hidden="true"><span className="recipe-book-icon" /></i>
            <span>レシピ</span>
            <b>OPEN</b>
          </button>
        )}
        <button
          className="time-card-tool"
          disabled={tutorial || trainingMode || supplies.timeCard <= 0}
          onClick={pauseShift}
        >
          <i aria-hidden="true"><span className="clock-face" /></i>
          <span>休憩</span>
          <b>×{supplies.timeCard}</b>
        </button>
        <button
          className="smile-tool"
          disabled={
            tutorial || trainingMode || supplies.smile <= 0 || orders.length === 0
          }
          onClick={() => setSmileMode((value) => !value)}
        >
          <i aria-hidden="true">☺</i>
          <span>{smileMode ? "お客さんを選ぶ" : "スマイル"}</span>
          <b>×{supplies.smile}</b>
        </button>
        {(activeDifficulty === "hard" || activeDifficulty === "extra") && (
          <button
            className={`overtime-tool ${usedServiceOvertime ? "is-used" : ""}`}
            disabled={
              tutorial ||
              trainingMode ||
              supplies.serviceOvertime <= 0 ||
              usedServiceOvertime
            }
            onClick={useServiceOvertime}
          >
            <i aria-hidden="true">+30</i>
            <span>{usedServiceOvertime ? "延長済み" : "サービス残業"}</span>
            <b>×{supplies.serviceOvertime}</b>
          </button>
        )}
      </aside>

      <div className="game-workspace">
      <div className="service-panel">
      <section className="counter-scene">
        <div className="night-window">
          <i />
          <i />
          <i />
        </div>
        <div className="counter-lamps">
          <i />
          <i />
          <i />
        </div>
        <div className="customer-row">
          {[1, 2, 3].map((table) => {
            const order = orders.find((entry) => entry.table === table);
            const reaction = customerReactions[table];
            const customerIndex = order?.customer ?? reaction?.customer ?? table;
            const waitRatio = order
              ? Math.max(
                  0,
                  (order.expiresAt - now) / difficultyData.orderLimitMs,
                )
              : 1;
            const mood: CustomerMood = reaction?.mood
              ?? (order && waitRatio <= 0.3 ? "annoyed" : "normal");
            return (
              <Customer
                key={table}
                index={customerIndex}
                active={Boolean(order || reaction)}
                mood={mood}
                selectable={Boolean(smileMode && order)}
                onSelect={() => order && applySmile(order.id)}
              />
            );
          })}
        </div>
        <div className="counter-top" />
      </section>

      <section className="ticket-rail" aria-label="注文票">
        <div className="metal-rail">
          <i />
          <span>ORDER RAIL</span>
          <i />
        </div>
        <div className="tickets">
          {[1, 2, 3].map((table) => {
            const order = orders.find((entry) => entry.table === table);
            if (!order) {
              return (
                <div className="ticket-empty" key={`empty-table-${table}`}>
                  <span>NO ORDER</span>
                </div>
              );
            }
            const left = Math.max(
              0,
              (order.expiresAt - now) / difficultyData.orderLimitMs,
            );
            const active = selectedOrder === order.id;
            const tray = trayState(order);
            const canReceive = orderAcceptsSelected(order);
            const willComplete = selectedBatchCompletes(order);
            const choosingDestination =
              selectedStockItems.length > 0 &&
              selectedStockItems.every((item) => !isPrepIngredient(item.id));
            return (
              <article
                className={`order-ticket ${active ? "is-selected" : ""} ${
                  left < 0.25 ? "is-late" : ""
                } ${canReceive ? "can-receive" : ""} ${
                  willComplete ? "will-complete" : ""
                } ${
                  choosingDestination && !canReceive ? "cannot-receive" : ""
                } ${
                  badTicket === order.id ? "is-rejected" : ""
                } ${smileMode ? "is-smile-target" : ""} ${
                  trainingMode && trainingServeStep && canReceive
                    ? "training-target"
                    : ""
                }`}
                key={order.id}
                onClick={() => {
                  if (trainingMode) {
                    if (trainingServeStep && choosingDestination) {
                      registerSelectedToOrder(order.id);
                    }
                    return;
                  }
                  if (smileMode) {
                    applySmile(order.id);
                    return;
                  }
                  if (choosingDestination) {
                    registerSelectedToOrder(order.id);
                    return;
                  }
                  setSelectedOrder(order.id);
                }}
              >
                <div className="ticket-pin" />
                <header>
                  <strong>TABLE {order.table.toString().padStart(2, "0")}</strong>
                  <span>
                    {canReceive
                      ? willComplete
                        ? "まとめて提供"
                        : `${selectedStockItems.length}品を載せる`
                      : `#${order.id.toString().padStart(3, "0")}`}
                  </span>
                </header>
                <div className="ticket-items">
                  {MENU_IDS.filter((id) => order.items[id]).map((id) => (
                    <div
                      className={
                        (tray.counts[id] ?? 0) === order.items[id]
                          ? "is-complete"
                          : ""
                      }
                      key={id}
                    >
                      <FoodIcon id={id} small />
                      <span>
                        <b>{MENU[id].en}</b>
                        <small>{MENU[id].ja}</small>
                      </span>
                      <strong>{tray.counts[id] ?? 0}/{order.items[id]}</strong>
                    </div>
                  ))}
                </div>
                <div className="tray-line">
                  <span>トレー：</span>
                  <div>
                    {order.tray.length === 0 && <small>まだありません</small>}
                    {order.tray.map((item) => (
                      <button
                        key={item.uid}
                        disabled={trainingMode}
                        onClick={(event) => {
                          event.stopPropagation();
                          returnFromTray(order.id, item.uid);
                        }}
                        aria-label={`${MENU[item.id as MenuId]?.ja ?? "パティ"}を戻す`}
                      >
                        <FoodIcon id={item.id} burnt={item.burnt} small />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="wait-gauge">
                  <i style={{ width: `${left * 100}%` }} />
                </div>
                <button
                  className="serve-button"
                  disabled={!tray.exact}
                  onClick={(event) => {
                    event.stopPropagation();
                    serve(order.id);
                  }}
                >
                  {tray.burnt
                    ? "焦げを戻す"
                    : tray.missing > 0
                      ? `あと${tray.missing}品`
                      : "提供"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
      </div>

      <section className="kitchen">
        <div className="kitchen-pass" aria-hidden="true">
          <div className="heat-lamps">
            <i />
            <i />
            <i />
          </div>
          <div className="service-shelf">
            <span className="plate-stack" />
            <span className="syrup-bottles" />
            <span className="glass-rack" />
            <strong>ORDER UP</strong>
          </div>
          <div className="tile-sign">
            HOT • FRESH • ALL NIGHT
          </div>
        </div>
        <div className="equipment-row">
          {(["griddle", "fryer"] as StationId[]).map((station) => {
            const sources: CookableId[] =
              station === "griddle"
                ? [
                    "patty",
                    "pancakes",
                    ...(hasNormalMenu(activeDifficulty)
                      ? (["sausage"] as CookableId[])
                      : []),
                    ...(hasHardMenu(activeDifficulty)
                      ? (["omeletBase"] as CookableId[])
                      : []),
                  ]
                : [
                    "fries",
                    ...(hasNormalMenu(activeDifficulty)
                      ? (["donut"] as CookableId[])
                      : []),
                    ...(hasHardMenu(activeDifficulty)
                      ? (["onionFries"] as CookableId[])
                      : []),
                    ...(activeDifficulty === "extra" ||
                    (activeDifficulty === "hard" &&
                      tonightSpecial === "mapleChickenPancakes")
                      ? (["friedChicken"] as CookableId[])
                      : []),
                  ];
            return (
              <div className={`equipment ${station}`} key={station}>
                <div className="equipment-label">
                  {station === "griddle" ? "GRIDDLE / グリドル" : "FRYER / フライヤー"}　
                  {tasks[station].length}/{stationSlots[station]}
                </div>
                <div className={`station-slots slots-${stationSlots[station]}`}>
                  {Array.from({ length: stationSlots[station] }).map((_, index) => {
                    const task = tasks[station][index];
                    const view = stationView(task);
                    return (
                      <button
                        className={`cook-surface state-${view.state} ${
                          trainingMode && trainingCollectTarget(task)
                            ? "training-target"
                            : ""
                        }`}
                        key={`${station}-${index}`}
                        disabled={
                          trainingMode &&
                          (!task || !trainingCollectTarget(task))
                        }
                        onClick={() =>
                          task
                            ? collectTask(station, task.uid)
                            : startCooking(sources[0])
                        }
                      >
                        {task ? (
                          <FoodIcon
                            id={COOKING[task.source].result}
                            burnt={view.state === "burnt"}
                          />
                        ) : (
                          <span className="equipment-empty">＋</span>
                        )}
                        <span className="equipment-status">{view.text}</span>
                        <i
                          className="cook-progress"
                          style={{ width: `${view.progress * 100}%` }}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className={`station-controls controls-${sources.length}`}>
                  {sources.map((source) => (
                    <button
                      className={`metal-switch ${
                        trainingMode && trainingCookTarget(source)
                          ? "training-target"
                          : ""
                      }`}
                      key={source}
                      aria-label={COOKING[source].label}
                      title={COOKING[source].label}
                      disabled={
                        tasks[station].length >= stationSlots[station] ||
                        (trainingMode && !trainingCookTarget(source))
                      }
                      onClick={() => startCooking(source)}
                    >
                      <FoodIcon id={COOKING[source].result} small />
                      <span>
                        {tasks[station].length >= stationSlots[station]
                          ? "使用中"
                          : COOKING[source].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="equipment drinks">
            <div className="equipment-label">
              {hasNormalMenu(activeDifficulty)
                ? "SODA & DESSERT / ドリンクサーバー"
                : "DRINK SERVER / ドリンクサーバー"}　
              {tasks.drinks.length}/{stationSlots.drinks}
            </div>
            <div className="drink-machine">
              <div className={`drink-station-slots slots-${stationSlots.drinks}`}>
                {Array.from({ length: stationSlots.drinks }).map((_, index) => {
                  const task = tasks.drinks[index];
                  const view = stationView(task);
                  return (
                    <button
                      className={`drink-slot state-${view.state} ${
                        trainingMode && trainingCollectTarget(task)
                          ? "training-target"
                          : ""
                      }`}
                      key={`drink-${index}`}
                      disabled={
                        !task ||
                        (trainingMode && !trainingCollectTarget(task))
                      }
                      onClick={() => task && collectTask("drinks", task.uid)}
                    >
                      {task ? (
                        <>
                          <FoodIcon id={COOKING[task.source].result} />
                          <span>{view.text}</span>
                          <i
                            className="cook-progress"
                            style={{ width: `${view.progress * 100}%` }}
                          />
                        </>
                      ) : (
                        <>
                          <span className="equipment-empty">＋</span>
                          <span>空き</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="drink-buttons">
                {(
                  [
                    "cola",
                    "coffee",
                    "shake",
                    "creamSoda",
                    ...(hasNormalMenu(activeDifficulty)
                      ? (["bananaSplit"] as CookableId[])
                      : []),
                    ...(activeDifficulty === "extra" ||
                    (activeDifficulty === "hard" && tonightSpecial === "donutSundae")
                      ? (["sundaeScoop"] as CookableId[])
                      : []),
                  ] as CookableId[]
                ).map((id) => (
                  <button
                    className={
                      trainingMode && trainingCookTarget(id)
                        ? "training-target"
                        : ""
                    }
                    key={id}
                    disabled={
                      tasks.drinks.length >= stationSlots.drinks ||
                      (trainingMode && !trainingCookTarget(id))
                    }
                    onClick={() => startCooking(id)}
                  >
                    <FoodIcon id={COOKING[id].result} small />
                    <span>
                      {tasks.drinks.length >= stationSlots.drinks
                        ? "使用中"
                        : COOKING[id].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="prep-row">
          <section className="assembly-bench">
            <header>PREP COUNTER / 仕上げ台</header>
            <div className="ingredient-wells" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <p>
              パティ <strong>×{stock.filter((item) => item.id === "patty").length}</strong>
              {hasNormalMenu(activeDifficulty) && (
                <>
                  　ソーセージ{" "}
                  <strong>×{stock.filter((item) => item.id === "sausage").length}</strong>
                </>
              )}
              {hasHardMenu(activeDifficulty) && (
                <>
                  <br />
                  卵{" "}
                  <strong>×{stock.filter((item) => item.id === "omeletBase").length}</strong>
                  　チキン{" "}
                  <strong>×{stock.filter((item) => item.id === "friedChicken").length}</strong>
                  　アイス{" "}
                  <strong>×{stock.filter((item) => item.id === "sundaeScoop").length}</strong>
                </>
              )}
            </p>
            <div className="assembly-actions">
              <button
                className={
                  trainingMode &&
                  (trainingStep === "burgerAssemble" ||
                    trainingStep === "setAssemble")
                    ? "training-target"
                    : ""
                }
                onClick={() => assemble("hamburger")}
                disabled={
                  !canAssemble("hamburger") ||
                  (trainingMode &&
                    trainingStep !== "burgerAssemble" &&
                    trainingStep !== "setAssemble")
                }
              >
                <FoodIcon id="hamburger" small />
                <span>ハンバーガー</span>
              </button>
              <button
                onClick={() => assemble("cheeseburger")}
                disabled={trainingMode || !canAssemble("cheeseburger")}
              >
                <FoodIcon id="cheeseburger" small />
                <span>チーズバーガー</span>
              </button>
              {hasNormalMenu(activeDifficulty) && (
                <button
                  onClick={() => assemble("hotdog")}
                  disabled={!canAssemble("hotdog")}
                >
                  <FoodIcon id="hotdog" small />
                  <span>ホットドッグ</span>
                </button>
              )}
              {hasHardMenu(activeDifficulty) && (
                <button
                  onClick={() => assemble("denverOmelet")}
                  disabled={!canAssemble("denverOmelet")}
                >
                  <FoodIcon id="denverOmelet" small />
                  <span>デンバーオムレツ</span>
                </button>
              )}
              {(activeDifficulty === "extra" ||
                (activeDifficulty === "hard" &&
                  tonightSpecial === "mapleChickenPancakes")) && (
                <button
                  onClick={() => assemble("mapleChickenPancakes")}
                  disabled={!canAssemble("mapleChickenPancakes")}
                >
                  <FoodIcon id="mapleChickenPancakes" small />
                  <span>メイプルチキン</span>
                </button>
              )}
              {(activeDifficulty === "extra" ||
                (activeDifficulty === "hard" &&
                  tonightSpecial === "onionRingBurger")) && (
                <button
                  onClick={() => assemble("onionRingBurger")}
                  disabled={!canAssemble("onionRingBurger")}
                >
                  <FoodIcon id="onionRingBurger" small />
                  <span>オニオンリングバーガー</span>
                </button>
              )}
              {(activeDifficulty === "extra" ||
                (activeDifficulty === "hard" &&
                  tonightSpecial === "donutSundae")) && (
                <button
                  onClick={() => assemble("donutSundae")}
                  disabled={!canAssemble("donutSundae")}
                >
                  <FoodIcon id="donutSundae" small />
                  <span>ドーナツサンデー</span>
                </button>
              )}
            </div>
          </section>

          <section className="stock-bin">
            <header>
              <span>READY STOCK / 完成品</span>
              <small>{stock.length}/{stockLimit}</small>
            </header>
            {selectedStockItems.length > 0 &&
              selectedStockItems.every((item) => !isPrepIngredient(item.id)) && (
              <p className="delivery-guide">
                <span className="delivery-guide-icons" aria-hidden="true">
                  {selectedStockItems.slice(0, 3).map((item) => (
                    <FoodIcon
                      key={item.uid}
                      id={item.id}
                      burnt={item.burnt}
                      small
                    />
                  ))}
                </span>
                <span>
                  <b>{selectedStockItems.length}品を選択中</b>
                  まとめて渡したい伝票をタップ
                </span>
              </p>
            )}
            <div className="stock-items">
              {stock.length === 0 && <p>できあがった料理はここへ入ります</p>}
              {stock.map((item) => {
                const selectionIndex = selectedStock.indexOf(item.uid);
                return (
                  <button
                    className={`${selectionIndex >= 0 ? "is-selected" : ""} ${
                      item.burnt ? "is-burnt" : ""
                    } ${
                      trainingMode && trainingStockTarget(item)
                        ? "training-target"
                        : ""
                    }`}
                    key={item.uid}
                    aria-pressed={selectionIndex >= 0}
                    disabled={trainingMode && !trainingStockTarget(item)}
                    onClick={() => toggleStockSelection(item)}
                  >
                    {selectionIndex >= 0 && (
                      <i className="selection-order" aria-hidden="true">
                        {selectionIndex + 1}
                      </i>
                    )}
                    <FoodIcon id={item.id} burnt={item.burnt} />
                    <span>
                      {item.id === "patty"
                        ? "焼きパティ"
                        : item.id === "sausage"
                          ? "焼きソーセージ"
                          : item.id === "omeletBase"
                            ? "焼いた卵"
                            : item.id === "friedChicken"
                              ? "フライドチキン"
                              : item.id === "sundaeScoop"
                                ? "アイス"
                                : MENU[item.id].ja}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="stock-actions">
              <button
                className={
                  trainingMode && trainingServeStep
                    ? "training-target"
                    : ""
                }
                onClick={registerSelected}
                disabled={
                  selectedStockItems.length === 0 ||
                  selectedStockItems.some((item) => isPrepIngredient(item.id)) ||
                  !selectedOrderData ||
                  (trainingMode && !trainingServeStep)
                }
              >
                TABLE {selectedOrderData?.table.toString().padStart(2, "0") ?? "--"}へ
                {selectedOrderData && selectedBatchCompletes(selectedOrderData)
                  ? "提供"
                  : `${selectedStockItems.length}品載せる`}
              </button>
              <button
                className="waste-button"
                onClick={wasteSelected}
                disabled={trainingMode || selectedStockItems.length === 0}
                aria-label={
                  selectedStockItems.length > 1
                    ? `選択した${selectedStockItems.length}品を廃棄`
                    : "選択した料理を廃棄"
                }
                title="選択した料理を廃棄"
              >
                <span className="trash-can" aria-hidden="true">
                  <i />
                </span>
                {selectedStockItems.length > 1 && (
                  <span className="waste-count" aria-hidden="true">
                    ×{selectedStockItems.length}
                  </span>
                )}
              </button>
            </div>
          </section>
        </div>
      </section>
      </div>

      {trainingDialogue && (
        <aside
          className={`training-coach training-${trainingDialogue.speaker} ${
            trainingDialogue.next ? "is-message" : "is-guiding"
          }`}
          aria-live="polite"
        >
          <button
            className="training-exit"
            onClick={finishTraining}
            aria-label="新人研修を終了してタイトルへ戻る"
          >
            ×
          </button>
          <div className="training-portrait" aria-hidden="true">
            <img
              src={`/customers/${trainingDialogue.speaker}.svg`}
              alt=""
              draggable={false}
            />
          </div>
          <div className="training-copy">
            <small>{trainingDialogue.phase}</small>
            <strong>{trainingDialogue.speaker === "shu" ? "しゅ先輩" : "みう先輩"}</strong>
            <p>{trainingDialogue.text}</p>
          </div>
          {trainingDialogue.next && (
            <button className="training-next" onClick={advanceTrainingCard}>
              {trainingDialogue.next}
            </button>
          )}
        </aside>
      )}

      {tutorial && (
        <div className="tutorial-overlay" role="dialog" aria-modal="true">
          <section className="staff-memo">
            <div className="memo-tape" />
            <p className="memo-kicker">{shiftMemo.kicker}</p>
            <h2>{shiftMemo.title}</h2>
            <p className="memo-shift-note">{shiftMemo.note}</p>
            {hasHardMenu(difficulty) && (
              <>
                {shiftRecipeIds.length > 0 && (
                  <p className="new-recipe-note">
                    NEW RECIPE — 初登場の料理は、最初に単品伝票で入ります。
                  </p>
                )}
                <RecipeGuide
                  recipeIds={memoRecipeIds}
                  tonightSpecial={tonightSpecial}
                  extra={difficulty === "extra"}
                />
              </>
            )}
            <ol>
              <li>
                <b>焼く・揚げる・注ぐ</b>
                料理ごとにグリドル、フライヤー、冷製台を同時に動かす。
                完成後は焦げる前に回収する。
              </li>
              <li>
                <b>組み立てる</b>
                材料が揃ったら仕上げ台へ。複雑な料理は二つの完成品を合体させる。
              </li>
              <li>
                <b>トレーへ載せて提供</b>
                完成品は複数選べる。料理をまとめて選ぶ→渡したい伝票をタップ。
                注文が揃えばその場でまとめて提供できる。
                間違えた料理は伝票内をタップして戻す。
              </li>
            </ol>
            <p className="memo-waste">
              閉店時に設備・完成品棚・伝票へ残った料理は廃棄になります。
            </p>
            {difficulty === "extra" && (
              <div className="memo-mission">
                <small>{missionData.en}</small>
                <strong>{missionData.label}</strong>
                <span>{missionData.description}</span>
                <em>{missionData.recommended}</em>
              </div>
            )}
            <p className="memo-difficulty">
              {difficultyData.en} — {difficultyData.label}
            </p>
            <button onClick={beginShift}>勤務をはじめる</button>
          </section>
        </div>
      )}
      {firstTimeGuide && firstTimeGuide.kind === "supplies" && (() => {
        const guide = SUPPLY_GUIDES[firstTimeGuide.difficulty];
        const card = guide.cards[firstTimeGuide.index];
        const isLast = firstTimeGuide.index === guide.cards.length - 1;
        return (
          <div className="first-guide-overlay" role="dialog" aria-modal="true">
            <section className={`first-guide-card guide-${card.speaker}`}>
              <div className="first-guide-portrait" aria-hidden="true">
                <img
                  src={`/customers/${card.speaker}.svg`}
                  alt=""
                  draggable={false}
                />
              </div>
              <div className="first-guide-copy">
                <small>{card.phase}</small>
                <strong>{card.speaker === "shu" ? "しゅ" : "みう"}</strong>
                <p>{card.text}</p>
                {firstTimeGuide.index === 0 && (
                  <div className="guide-gifts" aria-label="もらったスタッフ用品">
                    {guide.gift.timeCard && (
                      <span><i className="clock-face" />タイムカード ×1</span>
                    )}
                    {guide.gift.smile && <span><i>☺</i>スマイル ×1</span>}
                    {guide.gift.serviceOvertime && (
                      <span><i>+30</i>サービス残業 ×1</span>
                    )}
                  </div>
                )}
              </div>
              <button onClick={advanceFirstTimeGuide}>
                {isLast ? "ありがとう！" : "つぎへ"}
              </button>
            </section>
          </div>
        );
      })()}
      {paused && (
        <div className="pause-overlay" role="dialog" aria-modal="true">
          <section className="pause-card">
            <small>TIME CARD PUNCHED</small>
            <div className="pause-clock" aria-hidden="true">
              <span className="clock-face" />
            </div>
            <h2>休憩中</h2>
            <p>時間も、待ち時間も、調理も止まっています。</p>
            <button onClick={resumeShift}>勤務に戻る</button>
          </section>
        </div>
      )}
      {recipeBookOpen && (
        <div className="tutorial-overlay recipe-overlay" role="dialog" aria-modal="true">
          <section className="staff-memo recipe-book">
            <div className="memo-tape" />
            <p className="memo-kicker">KITCHEN RECIPE FILE</p>
            <h2>今夜のレシピ</h2>
            <RecipeGuide
              recipeIds={activeRecipeIds}
              tonightSpecial={tonightSpecial}
              extra={difficulty === "extra"}
            />
            <p className="memo-waste">
              レシピを見ている間は、営業時間・待ち時間・調理時間も止まっています。
            </p>
            <button onClick={closeRecipeBook}>厨房へ戻る</button>
          </section>
        </div>
      )}
    </main>
  );
}
