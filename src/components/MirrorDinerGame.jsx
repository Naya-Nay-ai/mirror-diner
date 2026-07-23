import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COOKING,
  CUSTOMERS,
  DEFAULT_UPGRADES,
  DIFFICULTIES,
  GAME_SECONDS,
  MAX_ORDERS,
  MENU,
  MENU_IDS,
  maxOrdersFor,
  orderSizeFor,
  UPGRADE_DATA
} from "../gameData.js";
const SAVE_KEY = "mirror-diner-save-v2";
const emptyStats = {
  servedOrders: 0,
  servedItems: 0,
  mistakes: 0,
  waste: 0,
  maxCombo: 0
};
function FoodIcon({
  id,
  burnt = false,
  small = false
}) {
  return <span
    className={`food-icon food-${id}${burnt ? " is-burnt" : ""}${small ? " is-small" : ""}`}
    aria-hidden="true"
  >
      <i className="food-a" />
      <i className="food-b" />
      <i className="food-c" />
      <i className="food-d" />
    </span>;
}
function Customer({ index, active }) {
  const customer = CUSTOMERS[index % CUSTOMERS.length];
  return <div
    className={`customer customer-${customer.id} ${active ? "is-active" : ""}`}
    aria-label={active ? "\u6CE8\u6587\u4E2D\u306E\u304A\u5BA2\u3055\u307E" : "\u7A7A\u5E2D"}
  >
      {active && <>
          <span className="customer-hair" />
          <span className="customer-head">
            <i />
          </span>
          <span className="customer-body" />
          <span className="customer-arm" />
        </>}
      <span className="stool" />
    </div>;
}
function useDinerAudio(enabled) {
  const contextRef = useRef(null);
  return useCallback(
    (kind) => {
      if (!enabled || typeof window === "undefined") return;
      const AudioCtx = window.AudioContext;
      if (!AudioCtx) return;
      const ctx = contextRef.current ?? new AudioCtx();
      contextRef.current = ctx;
      const patterns = {
        ticket: [[660, 0.035, 0]],
        ready: [
          [520, 0.06, 0],
          [780, 0.07, 0.075]
        ],
        drink: [[920, 0.055, 0]],
        success: [
          [660, 0.06, 0],
          [880, 0.08, 0.07]
        ],
        mistake: [
          [190, 0.12, 0],
          [145, 0.16, 0.1]
        ],
        bell: [[1240, 0.13, 0]],
        end: [
          [420, 0.12, 0],
          [315, 0.16, 0.13],
          [210, 0.23, 0.3]
        ]
      };
      patterns[kind].forEach(([frequency, duration, delay]) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = kind === "mistake" ? "square" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(1e-4, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(
          1e-4,
          ctx.currentTime + delay + duration
        );
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + duration + 0.02);
      });
    },
    [enabled]
  );
}
function MirrorDinerGame() {
  const [screen, setScreen] = useState("title");
  const [sound, setSound] = useState(true);
  const [tutorial, setTutorial] = useState(false);
  const [workshop, setWorkshop] = useState(false);
  const [saveLoaded, setSaveLoaded] = useState(false);
  const [difficulty, setDifficulty] = useState("easy");
  const [tips, setTips] = useState(0);
  const [upgrades, setUpgrades] = useState(DEFAULT_UPGRADES);
  const [earnedTips, setEarnedTips] = useState(0);
  const [remaining, setRemaining] = useState(GAME_SECONDS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState(emptyStats);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [stock, setStock] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [tasks, setTasks] = useState({
    griddle: [],
    fryer: [],
    drinks: []
  });
  const [now, setNow] = useState(0);
  const [flash, setFlash] = useState(null);
  const startAtRef = useRef(0);
  const nextOrderAtRef = useRef(0);
  const uidRef = useRef(1);
  const ordersRef = useRef([]);
  const finishedRef = useRef(false);
  const playSound = useDinerAudio(sound);
  const difficultyData = DIFFICULTIES[difficulty];
  const stationSlots = {
    griddle: UPGRADE_DATA.griddle.levels[upgrades.griddle - 1].slots,
    fryer: UPGRADE_DATA.fryer.levels[upgrades.fryer - 1].slots,
    drinks: 1
  };
  const stockLimit = UPGRADE_DATA.stock.levels[upgrades.stock - 1].slots;
  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (typeof saved.tips === "number") setTips(Math.max(0, saved.tips));
          if (saved.difficulty && DIFFICULTIES[saved.difficulty]) {
            setDifficulty(saved.difficulty);
          }
          if (saved.upgrades) {
            setUpgrades({
              griddle: Math.min(3, Math.max(1, saved.upgrades.griddle ?? 1)),
              fryer: Math.min(2, Math.max(1, saved.upgrades.fryer ?? 1)),
              stock: Math.min(3, Math.max(1, saved.upgrades.stock ?? 1))
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
      JSON.stringify({ tips, upgrades, difficulty })
    );
  }, [difficulty, saveLoaded, tips, upgrades]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
  const makeOrder = useCallback(
    (time) => {
      const elapsed = Math.max(0, (time - startAtRef.current) / 1e3);
      const size = orderSizeFor(elapsed, difficulty);
      const shuffled = [...MENU_IDS].sort(() => Math.random() - 0.5);
      const items = {};
      shuffled.slice(0, size).forEach((id) => {
        const canDouble = elapsed > 42 && Math.random() < 0.22;
        items[id] = canDouble ? 2 : 1;
      });
      const usedTables = new Set(ordersRef.current.map((order2) => order2.table));
      const freeTables = [1, 2, 3].filter((table) => !usedTables.has(table));
      const order = {
        id: uidRef.current++,
        table: freeTables[0] ?? uidRef.current % 3 + 1,
        createdAt: time,
        expiresAt: time + DIFFICULTIES[difficulty].orderLimitMs,
        items,
        tray: [],
        customer: Math.floor(Math.random() * CUSTOMERS.length)
      };
      setOrders((current) => {
        if (current.length >= MAX_ORDERS) return current;
        const next = [...current, order];
        if (selectedOrder === null) setSelectedOrder(order.id);
        return next;
      });
      playSound("ticket");
    },
    [difficulty, playSound, selectedOrder]
  );
  const startGame = useCallback(() => {
    startAtRef.current = 0;
    nextOrderAtRef.current = 0;
    finishedRef.current = false;
    uidRef.current = 1;
    setRemaining(GAME_SECONDS);
    setScore(0);
    setCombo(0);
    setStats(emptyStats);
    setOrders([]);
    ordersRef.current = [];
    setSelectedOrder(null);
    setStock([]);
    setSelectedStock(null);
    setTasks({ griddle: [], fryer: [], drinks: [] });
    setNow(Date.now());
    setFlash(null);
    setEarnedTips(0);
    setTutorial(true);
    setScreen("game");
  }, []);
  const beginShift = () => {
    const start = Date.now();
    startAtRef.current = start;
    nextOrderAtRef.current = start;
    setNow(start);
    setTutorial(false);
  };
  const openDiner = () => {
    setScreen("opening");
    window.setTimeout(startGame, 780);
  };
  useEffect(() => {
    if (screen !== "game" || tutorial || startAtRef.current === 0) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      const left = Math.max(0, GAME_SECONDS - (time - startAtRef.current) / 1e3);
      setNow(time);
      setRemaining(left);
      setTasks((current) => {
        let changed = false;
        const next = {
          griddle: [...current.griddle],
          fryer: [...current.fryer],
          drinks: [...current.drinks]
        };
        Object.keys(next).forEach((station) => {
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
          if (order.tray.length) {
            setStock((items) => [...items, ...order.tray]);
          }
        });
        setSelectedOrder(
          (id) => id !== null && expiredIds.has(id) ? survivors[0]?.id ?? null : id
        );
        return survivors;
      });
      if (time >= nextOrderAtRef.current && ordersRef.current.length < maxOrdersFor(GAME_SECONDS - left, difficulty) && left > 5) {
        makeOrder(time);
        const elapsed = GAME_SECONDS - left;
        const config = DIFFICULTIES[difficulty];
        nextOrderAtRef.current = time + Math.max(config.minGapMs, config.firstGapMs - elapsed * 24) + Math.random() * 1200;
      }
      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true;
        const reward = Math.max(
          8,
          Math.round(
            stats.servedOrders * 9 + stats.servedItems * 2 + stats.maxCombo * 3 - stats.mistakes * 2
          )
        );
        setEarnedTips(reward);
        setTips((value) => value + reward);
        playSound("end");
        setScreen("result");
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [difficulty, makeOrder, playSound, screen, stats, tutorial]);
  useEffect(() => {
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(timeout);
  }, [flash]);
  const startCooking = (source) => {
    const data = COOKING[source];
    if (tasks[data.station].length >= stationSlots[data.station] || remaining <= 0) {
      return;
    }
    const time = now;
    const cookMs = Math.round(data.cookMs * difficultyData.cookMultiplier);
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
          chimed: false
        }
      ]
    }));
  };
  const collectTask = (station, taskUid) => {
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
      { uid: uidRef.current++, id: data.result, burnt }
    ]);
    setTasks((current) => ({
      ...current,
      [station]: current[station].filter((entry) => entry.uid !== taskUid)
    }));
  };
  const assemble = (id) => {
    const patty = stock.find((item) => item.id === "patty");
    if (!patty) return;
    setStock((current) => [
      ...current.filter((item) => item.uid !== patty.uid),
      { uid: uidRef.current++, id, burnt: patty.burnt }
    ]);
    setSelectedStock(null);
  };
  const registerSelected = () => {
    if (selectedStock === null || selectedOrder === null) return;
    const item = stock.find((entry) => entry.uid === selectedStock);
    if (!item || item.id === "patty") return;
    const order = orders.find((entry) => entry.id === selectedOrder);
    if (!order) return;
    const registered = order.tray.filter((entry) => entry.id === item.id).length;
    if (!order.items[item.id] || registered >= (order.items[item.id] ?? 0)) {
      setFlash("bad");
      return;
    }
    setStock((current) => current.filter((entry) => entry.uid !== item.uid));
    setOrders(
      (current) => current.map(
        (order2) => order2.id === selectedOrder ? { ...order2, tray: [...order2.tray, item] } : order2
      )
    );
    setSelectedStock(null);
  };
  const returnFromTray = (orderId, itemUid) => {
    const order = orders.find((entry) => entry.id === orderId);
    const item = order?.tray.find((entry) => entry.uid === itemUid);
    if (!item) return;
    setOrders(
      (current) => current.map(
        (entry) => entry.id === orderId ? { ...entry, tray: entry.tray.filter((trayItem) => trayItem.uid !== itemUid) } : entry
      )
    );
    setStock((current) => [...current, item]);
  };
  const wasteSelected = () => {
    if (selectedStock === null) return;
    if (!stock.some((item) => item.uid === selectedStock)) return;
    setStock((current) => current.filter((item) => item.uid !== selectedStock));
    setSelectedStock(null);
    setStats((current) => ({ ...current, waste: current.waste + 1 }));
    setScore((current) => Math.max(0, current - 20));
  };
  const serve = (orderId) => {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    const trayCounts = {};
    let hasBurnt = false;
    order.tray.forEach((item) => {
      if (item.id === "patty") return;
      trayCounts[item.id] = (trayCounts[item.id] ?? 0) + 1;
      hasBurnt ||= item.burnt;
    });
    const exact = !hasBurnt && MENU_IDS.every((id) => (trayCounts[id] ?? 0) === (order.items[id] ?? 0));
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
      0
    );
    const speedRatio = Math.max(
      0,
      (order.expiresAt - now) / difficultyData.orderLimitMs
    );
    const base = order.tray.reduce(
      (sum, item) => sum + (item.id === "patty" ? 0 : MENU[item.id].score),
      0
    );
    const nextCombo = combo + 1;
    const earned = Math.round(
      (base + Math.round(speedRatio * 90) + Math.min(150, nextCombo * 15)) * difficultyData.scoreMultiplier
    );
    setScore((current) => current + earned);
    setCombo(nextCombo);
    setStats((current) => ({
      ...current,
      servedOrders: current.servedOrders + 1,
      servedItems: current.servedItems + itemCount,
      maxCombo: Math.max(current.maxCombo, nextCombo)
    }));
    setOrders((current) => {
      const next = current.filter((entry) => entry.id !== orderId);
      setSelectedOrder((id) => id === orderId ? next[0]?.id ?? null : id);
      return next;
    });
    setFlash("good");
    playSound("bell");
    playSound("success");
    nextOrderAtRef.current = Math.min(nextOrderAtRef.current, now + 900);
  };
  const finalScore = Math.max(
    0,
    score + stats.servedOrders * 100 + stats.maxCombo * 25 - stats.mistakes * 30
  );
  const selectedOrderData = orders.find((order) => order.id === selectedOrder);
  const selectedStockData = stock.find((item) => item.uid === selectedStock);
  const stationView = (task) => {
    if (!task) return { state: "empty", progress: 0, text: "\u7A7A\u304D" };
    const cookMs = task.readyAt - task.startedAt;
    if (now < task.readyAt) {
      return {
        state: "cooking",
        progress: Math.min(1, (now - task.startedAt) / cookMs),
        text: "\u8ABF\u7406\u4E2D"
      };
    }
    if (task.burnAt && now >= task.burnAt) {
      return { state: "burnt", progress: 1, text: "\u7126\u3052\u305F\uFF01" };
    }
    const danger = task.burnAt && (task.burnAt - now) / (task.burnAt - task.readyAt) < 0.38;
    return {
      state: danger ? "danger" : "ready",
      progress: 1,
      text: danger ? "\u7126\u3052\u305D\u3046\uFF01" : "\u3067\u304D\u3042\u304C\u308A"
    };
  };
  const trayState = (order) => {
    const counts = {};
    let burnt = false;
    order.tray.forEach((item) => {
      if (item.id === "patty") return;
      counts[item.id] = (counts[item.id] ?? 0) + 1;
      burnt ||= item.burnt;
    });
    const missing = MENU_IDS.reduce(
      (sum, id) => sum + Math.max(0, (order.items[id] ?? 0) - (counts[id] ?? 0)),
      0
    );
    const extra = MENU_IDS.some((id) => (counts[id] ?? 0) > (order.items[id] ?? 0));
    return { counts, burnt, missing, exact: !burnt && !extra && missing === 0 };
  };
  const buyUpgrade = (key) => {
    const currentLevel = upgrades[key];
    const levels = UPGRADE_DATA[key].levels;
    if (currentLevel >= levels.length) return;
    const price = levels[currentLevel].cost;
    if (tips < price) return;
    setTips((value) => value - price);
    setUpgrades((current) => ({
      ...current,
      [key]: current[key] + 1
    }));
  };
  const resultRows = useMemo(
    () => [
      ["SERVED ORDERS", stats.servedOrders],
      ["SERVED ITEMS", stats.servedItems],
      ["MISTAKES", stats.mistakes],
      ["WASTE", stats.waste],
      ["MAX COMBO", stats.maxCombo],
      ["TOTAL SCORE", finalScore]
    ],
    [finalScore, stats]
  );
  if (screen === "title" || screen === "opening") {
    return <main className={`title-screen ${screen === "opening" ? "door-opening" : ""}`}>
        <button
      className="sound-toggle title-sound"
      onClick={() => setSound((value) => !value)}
      aria-label={sound ? "\u97F3\u3092\u6D88\u3059" : "\u97F3\u3092\u51FA\u3059"}
    >
          SOUND {sound ? "ON" : "OFF"}
        </button>
        <div className="night-sky">
          <i className="star star-one" />
          <i className="star star-two" />
          <i className="star star-three" />
        </div>
        <section className="diner-exterior" aria-label="夜の道路沿いのダイナー">
          <div className="road-sign">
            <span>MIRROR</span>
            <strong>DINER</strong>
            <small>OPEN ALL NIGHT</small>
          </div>
          <div className="diner-roof" />
          <div className="diner-building">
            <div className="window window-left">
              <i />
              <i />
              <i />
            </div>
            <div className="front-door">
              <span>OPEN</span>
              <i />
            </div>
            <div className="window window-right">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="parking-lines" />
        </section>
        <section className="title-lockup">
          <p className="mirror-word">MIRROR</p>
          <h1>DINER</h1>
          <p className="subtitle">LAST ORDER NEVER COMES</p>
          <div className="difficulty-selector" aria-label="難易度">
            {Object.keys(DIFFICULTIES).map((id) => <button
      className={difficulty === id ? "is-selected" : ""}
      key={id}
      onClick={() => setDifficulty(id)}
    >
                <strong>{DIFFICULTIES[id].en}</strong>
                <span>{DIFFICULTIES[id].label}</span>
              </button>)}
          </div>
          <p className="difficulty-description">{difficultyData.description}</p>
          <button className="start-button" onClick={openDiner}>
            <span>営業をはじめる</span>
            <small>START SHIFT</small>
          </button>
          <div className="title-utility">
            <button onClick={() => setWorkshop(true)}>厨房を改装する</button>
            <span>TIP {tips}</span>
          </div>
        </section>
        <p className="title-note">90 SEC. SCORE ATTACK / TAP OR CLICK</p>
        {workshop && <div className="workshop-overlay" role="dialog" aria-modal="true">
            <section className="workshop-board">
              <header>
                <div>
                  <small>KITCHEN WORKS</small>
                  <h2>厨房改装</h2>
                </div>
                <strong>TIP {tips}</strong>
              </header>
              {Object.keys(UPGRADE_DATA).map((key) => {
      const data = UPGRADE_DATA[key];
      const level = upgrades[key];
      const current = data.levels[level - 1];
      const next = data.levels[level];
      return <article key={key}>
                    <div>
                      <h3>{data.label}</h3>
                      <p>{data.description}</p>
                      <span>LEVEL {level} / {data.levels.length}</span>
                    </div>
                    <div className="upgrade-action">
                      <b>{current.slots}枠</b>
                      {next ? <button
        disabled={tips < next.cost}
        onClick={() => buyUpgrade(key)}
      >
                          {next.slots}枠へ　TIP {next.cost}
                        </button> : <span className="upgrade-max">MAX</span>}
                    </div>
                  </article>;
    })}
              <button className="workshop-close" onClick={() => setWorkshop(false)}>
                改装を終える
              </button>
            </section>
          </div>}
      </main>;
  }
  if (screen === "result") {
    return <main className="result-screen">
        <div className="receipt">
          <div className="receipt-logo">MIRROR DINER</div>
          <p>— SHIFT CLOSED —</p>
          <div className="receipt-rule" />
          {resultRows.map(([label, value], index) => <div
      className={`receipt-row ${index === resultRows.length - 1 ? "total" : ""}`}
      key={label}
    >
              <span>{label}</span>
              <strong>{String(value).padStart(4, "0")}</strong>
            </div>)}
          <div className="receipt-rule" />
          <div className="receipt-row tip-earned">
            <span>SHIFT TIPS</span>
            <strong>+{earnedTips}</strong>
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
          <button className="secondary" onClick={() => setScreen("title")}>
            タイトルへ戻る
          </button>
        </div>
      </main>;
  }
  return <main className={`game-screen ${flash ? `flash-${flash}` : ""}`}>
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
    aria-label={sound ? "\u97F3\u3092\u6D88\u3059" : "\u97F3\u3092\u51FA\u3059"}
  >
          {sound ? "SND" : "MUTE"}
        </button>
      </header>

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
    return <Customer
      key={table}
      index={order?.customer ?? table}
      active={Boolean(order)}
    />;
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
          {orders.map((order) => {
    const left = Math.max(
      0,
      (order.expiresAt - now) / difficultyData.orderLimitMs
    );
    const active = selectedOrder === order.id;
    const tray = trayState(order);
    return <article
      className={`order-ticket ${active ? "is-selected" : ""} ${left < 0.25 ? "is-late" : ""}`}
      key={order.id}
      onClick={() => setSelectedOrder(order.id)}
    >
                <div className="ticket-pin" />
                <header>
                  <strong>TABLE {order.table.toString().padStart(2, "0")}</strong>
                  <span>#{order.id.toString().padStart(3, "0")}</span>
                </header>
                <div className="ticket-items">
                  {MENU_IDS.filter((id) => order.items[id]).map((id) => <div
      className={(tray.counts[id] ?? 0) === order.items[id] ? "is-complete" : ""}
      key={id}
    >
                      <FoodIcon id={id} small />
                      <span>
                        <b>{MENU[id].en}</b>
                        <small>{MENU[id].ja}</small>
                      </span>
                      <strong>{tray.counts[id] ?? 0}/{order.items[id]}</strong>
                    </div>)}
                </div>
                <div className="tray-line">
                  <span>登録：</span>
                  <div>
                    {order.tray.length === 0 && <small>まだありません</small>}
                    {order.tray.map((item) => <button
      key={item.uid}
      onClick={(event) => {
        event.stopPropagation();
        returnFromTray(order.id, item.uid);
      }}
      aria-label={`${MENU[item.id]?.ja ?? "\u30D1\u30C6\u30A3"}\u3092\u623B\u3059`}
    >
                        <FoodIcon id={item.id} burnt={item.burnt} small />
                      </button>)}
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
                  {tray.burnt ? "\u7126\u3052\u3092\u623B\u3059" : tray.missing > 0 ? `\u3042\u3068${tray.missing}\u54C1` : "\u63D0\u4F9B"}
                </button>
              </article>;
  })}
          {Array.from({ length: MAX_ORDERS - orders.length }).map((_, index) => <div className="ticket-empty" key={`empty-${index}`}>
              <span>NO ORDER</span>
            </div>)}
        </div>
      </section>

      <section className="kitchen">
        <div className="equipment-row">
          {["griddle", "fryer"].map((station) => {
    const source = station === "griddle" ? "patty" : "fries";
    return <div className={`equipment ${station}`} key={station}>
                <div className="equipment-label">
                  {station === "griddle" ? "GRIDDLE / \u30B0\u30EA\u30C9\u30EB" : "FRYER / \u30D5\u30E9\u30A4\u30E4\u30FC"}　
                  {tasks[station].length}/{stationSlots[station]}
                </div>
                <div className={`station-slots slots-${stationSlots[station]}`}>
                  {Array.from({ length: stationSlots[station] }).map((_, index) => {
      const task = tasks[station][index];
      const view = stationView(task);
      return <button
        className={`cook-surface state-${view.state}`}
        key={`${station}-${index}`}
        onClick={() => task ? collectTask(station, task.uid) : startCooking(source)}
      >
                        {task ? <FoodIcon
        id={task.source === "patty" ? "patty" : "fries"}
        burnt={view.state === "burnt"}
      /> : <span className="equipment-empty">＋</span>}
                        <span className="equipment-status">{view.text}</span>
                        <i
        className="cook-progress"
        style={{ width: `${view.progress * 100}%` }}
      />
                      </button>;
    })}
                </div>
                <button
      className="metal-switch"
      disabled={tasks[station].length >= stationSlots[station]}
      onClick={() => startCooking(source)}
    >
                  {tasks[station].length >= stationSlots[station] ? "\u4F7F\u7528\u4E2D" : COOKING[source].label}
                </button>
              </div>;
  })}
          <div className={`equipment drinks state-${stationView(tasks.drinks[0]).state}`}>
            <div className="equipment-label">DRINKS / ドリンク台</div>
            <div className="drink-machine">
              {tasks.drinks[0] ? <button onClick={() => collectTask("drinks", tasks.drinks[0].uid)}>
                  <FoodIcon
    id={COOKING[tasks.drinks[0].source].result}
  />
                  <span>{stationView(tasks.drinks[0]).text}</span>
                  <i
    className="cook-progress"
    style={{ width: `${stationView(tasks.drinks[0]).progress * 100}%` }}
  />
                </button> : <div className="drink-buttons">
                  {["cola", "coffee", "shake"].map((id) => <button key={id} onClick={() => startCooking(id)}>
                      <FoodIcon id={id} small />
                      <span>{COOKING[id].label}</span>
                    </button>)}
                </div>}
            </div>
          </div>
        </div>

        <div className="prep-row">
          <section className="assembly-bench">
            <header>ASSEMBLY / 組み立て台</header>
            <p>
              パティ在庫 <strong>×{stock.filter((item) => item.id === "patty").length}</strong>
            </p>
            <div>
              <button
    onClick={() => assemble("hamburger")}
    disabled={!stock.some((item) => item.id === "patty")}
  >
                <FoodIcon id="hamburger" small />
                ハンバーガー
              </button>
              <button
    onClick={() => assemble("cheeseburger")}
    disabled={!stock.some((item) => item.id === "patty")}
  >
                <FoodIcon id="cheeseburger" small />
                チーズバーガー
              </button>
            </div>
          </section>

          <section className="stock-bin">
            <header>
              <span>READY STOCK / 完成品</span>
              <small>{stock.length}/{stockLimit}</small>
            </header>
            <div className="stock-items">
              {stock.length === 0 && <p>できあがった料理はここへ入ります</p>}
              {stock.map((item) => <button
    className={`${selectedStock === item.uid ? "is-selected" : ""} ${item.burnt ? "is-burnt" : ""}`}
    key={item.uid}
    onClick={() => setSelectedStock((value) => value === item.uid ? null : item.uid)}
  >
                  <FoodIcon id={item.id} burnt={item.burnt} />
                  <span>
                    {item.id === "patty" ? "\u713C\u304D\u30D1\u30C6\u30A3" : MENU[item.id].ja}
                  </span>
                </button>)}
            </div>
            <div className="stock-actions">
              <button
    onClick={registerSelected}
    disabled={!selectedStockData || selectedStockData.id === "patty" || !selectedOrderData}
  >
                TABLE {selectedOrderData?.table.toString().padStart(2, "0") ?? "--"}へ登録
              </button>
              <button
    className="waste-button"
    onClick={wasteSelected}
    disabled={!selectedStockData}
  >
                廃棄
              </button>
            </div>
          </section>
        </div>
      </section>

      {tutorial && <div className="tutorial-overlay" role="dialog" aria-modal="true">
          <section className="staff-memo">
            <div className="memo-tape" />
            <p className="memo-kicker">NIGHT SHIFT MEMO</p>
            <h2>深夜勤務の手順</h2>
            <ol>
              <li>
                <b>焼く・揚げる・注ぐ</b>
                設備は同時に動かせる。完成後は焦げる前に回収。
              </li>
              <li>
                <b>組み立てる</b>
                パティからバーガーかチーズバーガーを作り分ける。
              </li>
              <li>
                <b>伝票へ登録して提供</b>
                伝票を選ぶ→料理を選ぶ→登録。間違えた料理は伝票内をタップして戻す。
              </li>
            </ol>
            <p className="memo-difficulty">
              {difficultyData.en} — {difficultyData.label}
            </p>
            <button onClick={beginShift}>わかった、開店！</button>
          </section>
        </div>}
    </main>;
}
export {
  MirrorDinerGame as default
};
