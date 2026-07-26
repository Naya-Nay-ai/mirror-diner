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

type SaveData = {
  tips: number;
  upgrades: Upgrades;
  difficulty: DifficultyId;
  supplies: StaffSupplies;
  selectedMission: MissionId;
  seenRecipes: MenuId[];
};
type StaffSupplyId = "timeCard" | "smile" | "serviceOvertime";
type StaffSupplies = Record<StaffSupplyId, number>;
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

const emptyStats: Stats = {
  servedOrders: 0,
  servedItems: 0,
  mistakes: 0,
  waste: 0,
  maxCombo: 0,
};

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
  const [workshop, setWorkshop] = useState(false);
  const [staffStore, setStaffStore] = useState(false);
  const [saveLoaded, setSaveLoaded] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyId>("easy");
  const [tips, setTips] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrades>(DEFAULT_UPGRADES);
  const [supplies, setSupplies] = useState<StaffSupplies>(DEFAULT_SUPPLIES);
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

  const difficultyData = DIFFICULTIES[difficulty];
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
      } satisfies SaveData),
    );
  }, [
    difficulty,
    saveLoaded,
    seenRecipes,
    selectedMission,
    supplies,
    tips,
    upgrades,
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
      const availableCustomers = CUSTOMERS.map((_, index) => index).filter(
        (index) => !usedCustomers.has(index),
      );
      const customerPool =
        availableCustomers.length > 0
          ? availableCustomers
          : CUSTOMERS.map((_, index) => index);
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
    recipePausedAtRef.current = 0;
    normalFeaturedIndexRef.current = 0;
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
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  useEffect(() => {
    if (badTicket === null) return;
    const timeout = window.setTimeout(() => setBadTicket(null), 420);
    return () => window.clearTimeout(timeout);
  }, [badTicket]);

  const startCooking = (source: CookableId) => {
    const data = COOKING[source];
    if (tasks[data.station].length >= stationSlots[data.station] || remaining <= 0) {
      return;
    }
    const time = now;
    const equipmentMultiplier = data.station === "drinks" ? drinkSpeed : 1;
    const cookMs = Math.round(
      data.cookMs * difficultyData.cookMultiplier * equipmentMultiplier,
    );
    const burnGrace = data.burnMs === null ? null : difficultyData.burnGraceMs;
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
  };

  const collectTask = (station: StationId, taskUid: number) => {
    const task = tasks[station].find((entry) => entry.uid === taskUid);
    if (!task || now < task.readyAt) return;
    if (stock.length >= stockLimit) {
      setFlash("bad");
      return;
    }
    const data = COOKING[task.source];
    const burnt = task.burnAt !== null && now >= task.burnAt;
    setStock((current) => [
      ...current,
      { uid: uidRef.current++, id: data.result, burnt },
    ]);
    setTasks((current) => ({
      ...current,
      [station]: current[station].filter((entry) => entry.uid !== taskUid),
    }));
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
    registerSelectedToOrder(selectedOrder);
  };

  const returnFromTray = (orderId: number, itemUid: number) => {
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
    nextOrderAtRef.current = Math.min(nextOrderAtRef.current, now + 900);
  };

  const finalScore = Math.max(
    0,
    score + stats.servedOrders * 100 + stats.maxCombo * 25 - stats.mistakes * 30,
  );

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
            <p className="difficulty-description">{difficultyData.description}</p>
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
              onClick={() => setWorkshop(true)}
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
            setWorkshop(true);
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
      </main>
    );
  }

  return (
    <main className={`game-screen ${flash ? `flash-${flash}` : ""}`}>
      <header className="game-header">
        <div className="mini-logo">
          <span>MIRROR</span>
          <strong>DINER</strong>
        </div>
        <div className="kitchen-clock">
          <span>TIME</span>
          <strong>{Math.ceil(remaining).toString().padStart(2, "0")}</strong>
        </div>
        <div className="register-score">
          <span>{difficultyData.en} / SCORE</span>
          <strong>{score.toString().padStart(5, "0")}</strong>
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
        {difficulty === "extra" ? (
          <span className="mission-live">
            <small>{missionData.en}</small>
            <strong>{missionProgress}/{missionData.target}</strong>
          </span>
        ) : difficulty === "hard" ? (
          <span className="special-live">
            <small>TODAY&apos;S SPECIAL</small>
            <strong>{MENU[tonightSpecial].ja}</strong>
          </span>
        ) : (
          <span className="shift-tools-label">STAFF KIT</span>
        )}
        {hasHardMenu(difficulty) && (
          <button
            className="recipe-tool"
            disabled={tutorial}
            onClick={openRecipeBook}
          >
            <i aria-hidden="true"><span className="recipe-book-icon" /></i>
            <span>レシピ</span>
            <b>OPEN</b>
          </button>
        )}
        <button
          className="time-card-tool"
          disabled={tutorial || supplies.timeCard <= 0}
          onClick={pauseShift}
        >
          <i aria-hidden="true"><span className="clock-face" /></i>
          <span>休憩</span>
          <b>×{supplies.timeCard}</b>
        </button>
        <button
          className="smile-tool"
          disabled={tutorial || supplies.smile <= 0 || orders.length === 0}
          onClick={() => setSmileMode((value) => !value)}
        >
          <i aria-hidden="true">☺</i>
          <span>{smileMode ? "お客さんを選ぶ" : "スマイル"}</span>
          <b>×{supplies.smile}</b>
        </button>
        {(difficulty === "hard" || difficulty === "extra") && (
          <button
            className={`overtime-tool ${usedServiceOvertime ? "is-used" : ""}`}
            disabled={
              tutorial ||
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
                } ${smileMode ? "is-smile-target" : ""}`}
                key={order.id}
                onClick={() => {
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
                        : `${selectedStockItems.length}品を登録`
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
                  <span>登録：</span>
                  <div>
                    {order.tray.length === 0 && <small>まだありません</small>}
                    {order.tray.map((item) => (
                      <button
                        key={item.uid}
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
                    ...(hasNormalMenu(difficulty)
                      ? (["sausage"] as CookableId[])
                      : []),
                    ...(hasHardMenu(difficulty)
                      ? (["omeletBase"] as CookableId[])
                      : []),
                  ]
                : [
                    "fries",
                    ...(hasNormalMenu(difficulty)
                      ? (["donut"] as CookableId[])
                      : []),
                    ...(hasHardMenu(difficulty)
                      ? (["onionFries"] as CookableId[])
                      : []),
                    ...(difficulty === "extra" ||
                    (difficulty === "hard" &&
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
                        className={`cook-surface state-${view.state}`}
                        key={`${station}-${index}`}
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
                      className="metal-switch"
                      key={source}
                      aria-label={COOKING[source].label}
                      title={COOKING[source].label}
                      disabled={tasks[station].length >= stationSlots[station]}
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
              {hasNormalMenu(difficulty)
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
                      className={`drink-slot state-${view.state}`}
                      key={`drink-${index}`}
                      disabled={!task}
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
                    ...(hasNormalMenu(difficulty)
                      ? (["bananaSplit"] as CookableId[])
                      : []),
                    ...(difficulty === "extra" ||
                    (difficulty === "hard" && tonightSpecial === "donutSundae")
                      ? (["sundaeScoop"] as CookableId[])
                      : []),
                  ] as CookableId[]
                ).map((id) => (
                  <button
                    key={id}
                    disabled={tasks.drinks.length >= stationSlots.drinks}
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
              {hasNormalMenu(difficulty) && (
                <>
                  　ソーセージ{" "}
                  <strong>×{stock.filter((item) => item.id === "sausage").length}</strong>
                </>
              )}
              {hasHardMenu(difficulty) && (
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
                onClick={() => assemble("hamburger")}
                disabled={!canAssemble("hamburger")}
              >
                <FoodIcon id="hamburger" small />
                <span>ハンバーガー</span>
              </button>
              <button
                onClick={() => assemble("cheeseburger")}
                disabled={!canAssemble("cheeseburger")}
              >
                <FoodIcon id="cheeseburger" small />
                <span>チーズバーガー</span>
              </button>
              {hasNormalMenu(difficulty) && (
                <button
                  onClick={() => assemble("hotdog")}
                  disabled={!canAssemble("hotdog")}
                >
                  <FoodIcon id="hotdog" small />
                  <span>ホットドッグ</span>
                </button>
              )}
              {hasHardMenu(difficulty) && (
                <button
                  onClick={() => assemble("denverOmelet")}
                  disabled={!canAssemble("denverOmelet")}
                >
                  <FoodIcon id="denverOmelet" small />
                  <span>デンバーオムレツ</span>
                </button>
              )}
              {(difficulty === "extra" ||
                (difficulty === "hard" &&
                  tonightSpecial === "mapleChickenPancakes")) && (
                <button
                  onClick={() => assemble("mapleChickenPancakes")}
                  disabled={!canAssemble("mapleChickenPancakes")}
                >
                  <FoodIcon id="mapleChickenPancakes" small />
                  <span>メイプルチキン</span>
                </button>
              )}
              {(difficulty === "extra" ||
                (difficulty === "hard" &&
                  tonightSpecial === "onionRingBurger")) && (
                <button
                  onClick={() => assemble("onionRingBurger")}
                  disabled={!canAssemble("onionRingBurger")}
                >
                  <FoodIcon id="onionRingBurger" small />
                  <span>オニオンリングバーガー</span>
                </button>
              )}
              {(difficulty === "extra" ||
                (difficulty === "hard" &&
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
                    }`}
                    key={item.uid}
                    aria-pressed={selectionIndex >= 0}
                    onClick={() =>
                      setSelectedStock((value) =>
                        value.includes(item.uid)
                          ? value.filter((uid) => uid !== item.uid)
                          : [...value, item.uid],
                      )
                    }
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
                onClick={registerSelected}
                disabled={
                  selectedStockItems.length === 0 ||
                  selectedStockItems.some((item) => isPrepIngredient(item.id)) ||
                  !selectedOrderData
                }
              >
                TABLE {selectedOrderData?.table.toString().padStart(2, "0") ?? "--"}へ
                {selectedOrderData && selectedBatchCompletes(selectedOrderData)
                  ? "まとめて提供"
                  : `${selectedStockItems.length}品登録`}
              </button>
              <button
                className="waste-button"
                onClick={wasteSelected}
                disabled={selectedStockItems.length === 0}
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
                <b>伝票へ登録して提供</b>
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
