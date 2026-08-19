/* ═══════════════════════════════════════════════════════
   AI 股票分析 — 研究 → 訊號 → 計畫 → 風險 → 結論
   純前端規則式引擎；資料來源：TWSE / Binance / Stooq，
   無法取得即時資料時自動退回示範資料（會清楚標示）。
   ═══════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ── 數字格式 ── */
  const fmt = (n) => {
    if (n == null || !isFinite(n)) return "—";
    const a = Math.abs(n);
    if (a >= 10000) return n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
    if (a >= 1000) return n.toLocaleString("zh-TW", { maximumFractionDigits: 1 });
    if (a >= 100) return n.toFixed(1);
    if (a >= 10) return n.toFixed(2);
    return n.toFixed(3);
  };
  const pct = (n, s = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(s)}%`;

  /* ── 指標 ── */
  const sma = (arr, n, i) => {
    if (i + 1 < n) return null;
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += arr[k];
    return s / n;
  };
  const highest = (arr, from, to) => Math.max(...arr.slice(Math.max(0, from), to + 1));
  const lowest = (arr, from, to) => Math.min(...arr.slice(Math.max(0, from), to + 1));

  function rsi14(closes) {
    const n = 14;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    g /= n; l /= n;
    for (let i = n + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
    }
    if (l === 0) return 100;
    return 100 - 100 / (1 + g / l);
  }

  function atr14(bars) {
    const n = 14;
    const trs = [];
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i], p = bars[i - 1];
      trs.push(Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c)));
    }
    let a = trs.slice(0, n).reduce((x, y) => x + y, 0) / n;
    for (let i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
    return a;
  }

  function macdHist(closes) {
    const ema = (n) => {
      const k = 2 / (n + 1);
      let e = closes[0];
      const out = [e];
      for (let i = 1; i < closes.length; i++) { e = closes[i] * k + e * (1 - k); out.push(e); }
      return out;
    };
    const e12 = ema(12), e26 = ema(26);
    const macd = e12.map((v, i) => v - e26[i]);
    const k = 2 / 10;
    let sig = macd[0];
    const hist = [0];
    for (let i = 1; i < macd.length; i++) { sig = macd[i] * k + sig * (1 - k); hist.push(macd[i] - sig); }
    return hist;
  }

  /* ── 資料來源 ── */
  function classify(raw) {
    const s = raw.trim().toUpperCase().replace(/^BINANCE:/, "");
    if (/^\d{4,6}[A-Z]?$/.test(s)) return { type: "tw", id: s, label: `台股 ${s}` };
    if (/^[A-Z0-9]{2,12}(USDT|USDC|FDUSD)$/.test(s)) return { type: "crypto", id: s, label: `加密貨幣 ${s}` };
    if (/^[A-Z.\-]{1,10}$/.test(s)) return { type: "us", id: s, label: `美股 ${s}` };
    return null;
  }

  async function fetchTW(id) {
    const bars = [];
    const now = new Date();
    for (let m = 8; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}01`;
      const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ym}&stockNo=${id}&response=json`;
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        if (j.stat !== "OK" || !Array.isArray(j.data)) continue;
        for (const row of j.data) {
          const num = (x) => parseFloat(String(x).replace(/,/g, ""));
          const [y, mo, dd] = row[0].split("/").map(Number);
          const o = num(row[3]), h = num(row[4]), l = num(row[5]), c = num(row[6]), v = num(row[1]);
          if (![o, h, l, c].every(isFinite)) continue;
          bars.push({ t: new Date(y + 1911, mo - 1, dd), o, h, l, c, v: isFinite(v) ? v : 0 });
        }
      } catch (e) { /* 單月失敗略過 */ }
    }
    if (bars.length < 60) throw new Error("TWSE 資料不足");
    bars.sort((a, b) => a.t - b.t);
    return bars;
  }

  async function fetchCrypto(id) {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${id}&interval=1d&limit=220`);
    if (!r.ok) throw new Error("Binance HTTP " + r.status);
    const j = await r.json();
    if (!Array.isArray(j) || j.length < 60) throw new Error("Binance 資料不足");
    return j.map((k) => ({ t: new Date(k[0]), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  }

  async function fetchUS(id) {
    const r = await fetch(`https://stooq.com/q/d/l/?s=${id.toLowerCase()}.us&i=d`);
    if (!r.ok) throw new Error("Stooq HTTP " + r.status);
    const text = await r.text();
    const lines = text.trim().split("\n").slice(1);
    if (lines.length < 60) throw new Error("Stooq 資料不足");
    return lines.slice(-220).map((ln) => {
      const [d, o, h, l, c, v] = ln.split(",");
      return { t: new Date(d), o: +o, h: +h, l: +l, c: +c, v: +v || 0 };
    }).filter((b) => [b.o, b.h, b.l, b.c].every(isFinite));
  }

  /* 示範資料：以代號種子產生可重現的隨機走勢 */
  function demoBars(id, type) {
    let seed = 0;
    for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let price = type === "crypto" ? 200 + rand() * 60000 : 40 + rand() * 800;
    const vol0 = 1e6 + rand() * 2e7;
    const bars = [];
    const day = 86400000;
    let t = Date.now() - (type === "crypto" ? 221 : 310) * day;
    const drift = (rand() - 0.35) * 0.003;
    let mood = 0;
    while (bars.length < 220) {
      t += day;
      const dt = new Date(t);
      if (type !== "crypto" && (dt.getDay() === 0 || dt.getDay() === 6)) continue;
      mood = mood * 0.92 + (rand() - 0.5) * 0.35;
      const chg = drift + mood * 0.012 + (rand() - 0.5) * 0.02;
      const o = price;
      const c = Math.max(price * (1 + chg), 0.5);
      const h = Math.max(o, c) * (1 + rand() * 0.012);
      const l = Math.min(o, c) * (1 - rand() * 0.012);
      const v = vol0 * (0.5 + rand() + Math.abs(mood));
      bars.push({ t: dt, o, h, l, c, v });
      price = c;
    }
    return bars;
  }

  async function loadBars(cls) {
    try {
      if (cls.type === "tw") return { bars: await fetchTW(cls.id), source: "real" };
      if (cls.type === "crypto") return { bars: await fetchCrypto(cls.id), source: "real" };
      return { bars: await fetchUS(cls.id), source: "real" };
    } catch (e) {
      return { bars: demoBars(cls.id, cls.type), source: "demo", error: String(e.message || e) };
    }
  }

  /* ── 分析引擎 ── */
  const SIGNAL_NAMES = {
    breakout: "突破", pullback: "拉回", momentum: "動能",
    continuation: "趨勢延續", reversal: "反轉",
  };

  function analyze(bars, cls, source) {
    const i = bars.length - 1;
    const closes = bars.map((b) => b.c);
    const highs = bars.map((b) => b.h);
    const lows = bars.map((b) => b.l);
    const vols = bars.map((b) => b.v);

    const c = closes[i];
    const s20 = sma(closes, 20, i), s60 = sma(closes, 60, i);
    const s20p = sma(closes, 20, i - 5);
    const hi20 = highest(highs, i - 20, i - 1);
    const lo20 = lowest(lows, i - 20, i - 1);
    const lo10 = lowest(lows, i - 10, i);
    const v20 = sma(vols, 20, i - 1) || 1;
    const vr = vols[i] / v20;
    const rsi = rsi14(closes.slice(-120));
    const atr = atr14(bars.slice(-120));
    const atrp = (atr / c) * 100;
    const hist = macdHist(closes.slice(-140));
    const mh = hist[hist.length - 1], mhPrev = hist[hist.length - 2];
    const roc10 = ((c - closes[i - 10]) / closes[i - 10]) * 100;
    const chg1 = ((c - closes[i - 1]) / closes[i - 1]) * 100;
    const uptrend = s60 != null && c > s60 && s20 > s60;

    /* 訊號評分 */
    const sigs = {};
    if (c > hi20) {
      let sc = 55;
      if (vr > 1.5) sc += 15;
      if (uptrend) sc += 10;
      if (rsi >= 55 && rsi <= 78) sc += 10;
      if (mh > 0) sc += 10;
      sigs.breakout = Math.min(sc, 100);
    }
    if (uptrend && c < s20 * 1.01 && c > s60) {
      let sc = 50;
      if (rsi >= 35 && rsi <= 55) sc += 15;
      if (s20p != null && s20 > s20p) sc += 10;
      if (lows[i] > s60) sc += 10;
      if (vr < 1) sc += 15;
      sigs.pullback = Math.min(sc, 100);
    }
    if (roc10 > (cls.type === "crypto" ? 8 : 5)) {
      let sc = 50;
      if (rsi >= 55 && rsi <= 75) sc += 15;
      if (mh > mhPrev) sc += 10;
      if (vr > 1.2) sc += 10;
      if (s20 != null && s60 != null && c > s20 && s20 > s60) sc += 15;
      sigs.momentum = Math.min(sc, 100);
    }
    if (s20 != null && s60 != null && c > s20 && s20 > s60 && s20p != null && s20 > s20p) {
      let sc = 45;
      if (mh > 0) sc += 15;
      if (rsi > 50) sc += 10;
      if (c > hi20 * 0.97) sc += 10;
      if (vr >= 0.8) sc += 10;
      sigs.continuation = Math.min(sc, 100);
    }
    if (!uptrend && rsi < 32 && c > bars[i].o) {
      let sc = 40;
      if (mh > mhPrev) sc += 10;
      if (vr > 1.3) sc += 10;
      sigs.reversal = Math.min(sc, 100);
    }

    let main = null, score = 0;
    for (const [k, v] of Object.entries(sigs)) if (v > score) { main = k; score = v; }

    /* 交易計畫 */
    let plan = null;
    if (main) {
      let eLow, eHigh;
      if (main === "breakout") { eLow = hi20 * 0.995; eHigh = Math.max(c * 1.002, hi20 * 1.01); }
      else if (main === "pullback") { eLow = s20 * 0.985; eHigh = s20 * 1.01; }
      else if (main === "reversal") { eLow = c * 0.98; eHigh = c * 1.005; }
      else { eLow = c * 0.99; eHigh = c * 1.01; }
      const entry = (eLow + eHigh) / 2;

      let stop = Math.max(lo10, entry - 1.6 * atr);
      if (stop >= entry * 0.995) stop = entry - 1.2 * atr;
      const riskAbs = entry - stop;

      let target = entry + Math.max(2 * riskAbs, (hi20 - lo20) * 0.8);
      if (main === "breakout") target = Math.max(target, hi20 + (hi20 - lo20) * 0.6);
      target = Math.min(target, entry * 1.4);

      const rr = (target - entry) / riskAbs;
      const holdLo = Math.max(3, Math.round((target - entry) / atr / 1.5));
      const holdHi = Math.min(holdLo * 3, 60);
      const conf = score >= 75 ? "高" : score >= 60 ? "中" : "低";

      const inv = {
        breakout: `收盤跌回突破區間（${fmt(hi20)}）以下，且量能未再放大——突破假設不成立。`,
        pullback: `收盤跌破 SMA60（${fmt(s60)}），或跌破前波低點 ${fmt(lo20)}——「趨勢中的拉回」不成立。`,
        momentum: `RSI 跌破 50 且 MACD 柱狀圖轉負——動能已經消失。`,
        continuation: `收盤跌破 SMA20（${fmt(s20)}）並連續三日無法收復——趨勢延續假設不成立。`,
        reversal: `再創新低（跌破 ${fmt(lo10)}）——止跌反轉假設失敗。`,
      }[main];

      plan = { entryLow: eLow, entryHigh: eHigh, entry, stop, target, rr, holdLo, holdHi, conf, invalidation: inv };
    }

    /* 風險檢查 */
    const checks = [];
    const put = (name, desc, state) => checks.push({ name, desc, state });
    if (plan) {
      const atrCap = cls.type === "crypto" ? 8 : 6;
      put("波動檢查", `目前日均波動 ${atrp.toFixed(2)}%，上限 ${atrCap}%`, atrp <= atrCap ? "pass" : "fail");
      put("風險報酬比", `目標／停損比 ${plan.rr.toFixed(2)}，要求 ≥ 1.5`, plan.rr >= 1.5 ? "pass" : "fail");
      const riskPct = ((plan.entry - plan.stop) / plan.entry) * 100;
      const riskCap = cls.type === "crypto" ? 10 : 8;
      put("停損距離", `進場到停損 ${riskPct.toFixed(1)}%，上限 ${riskCap}%`, riskPct <= riskCap ? "pass" : "fail");
      put("趨勢一致性", main === "reversal" ? "反轉訊號屬於逆勢操作" : uptrend ? "訊號方向與中期趨勢一致" : "中期趨勢尚未翻多", main === "reversal" ? "warn" : uptrend ? "pass" : "warn");
    } else {
      put("波動檢查", "無訊號，未評估", "skip");
      put("風險報酬比", "無訊號，未評估", "skip");
      put("停損距離", "無訊號，未評估", "skip");
      put("趨勢一致性", "無訊號，未評估", "skip");
    }
    put(
      "資料品質",
      source === "demo" ? "示範資料——僅展示流程，不作為依據"
        : bars.length < 90 ? `僅 ${bars.length} 根日 K，樣本偏少`
        : `即時資料 ${bars.length} 根日 K，樣本充足`,
      source === "demo" ? "warn" : bars.length < 90 ? "warn" : "pass"
    );

    return { i, c, chg1, s20, s60, hi20, lo20, lo10, vr, rsi, atr, atrp, roc10, uptrend, sigs, main, score, plan, checks };
  }

  /* ── 結論 ── */
  function verdictOf(a, source, barsLen) {
    const fails = a.checks.filter((c) => c.state === "fail").length;
    const warns = a.checks.filter((c) => c.state === "warn").length;
    const reasons = [];
    let v;
    if (!a.main) {
      v = "reject";
      reasons.push("目前沒有符合條件的訊號——「沒有適合的機會」也是有效結果");
    } else if (fails === 0 && a.score >= 65) {
      v = "approve";
      reasons.push(`${SIGNAL_NAMES[a.main]}訊號成立（${a.score} 分）`);
      reasons.push(warns ? `風險檢查未擋下（${warns} 項注意，執行前再確認）` : "風險檢查全數通過");
    } else if (fails <= 1 && a.score >= 50) {
      v = "watch";
      if (fails) reasons.push(`有 ${fails} 項風險檢查未通過`);
      if (a.score < 65) reasons.push(`訊號強度 ${a.score} 分，條件尚未完全成立`);
      reasons.push("持續監控，等待條件補齊");
    } else {
      v = "reject";
      if (fails) reasons.push(`${fails} 項風險檢查未通過`);
      if (a.score < 50) reasons.push(`訊號強度不足（${a.score} 分）`);
    }
    if (source === "demo") reasons.push("目前為示範資料，僅展示流程");
    if (barsLen < 90) reasons.push("歷史資料偏少，統計可信度較低");
    return { v, reasons };
  }

  /* ── 圖表（SVG）── */
  function drawChart(bars, a) {
    const el = $("chart");
    const N = Math.min(120, bars.length);
    const seg = bars.slice(-N);
    const W = 860, H = 380, padL = 10, padR = 74, padT = 16, padB = 44;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const volH = 54;

    let lo = Math.min(...seg.map((b) => b.l));
    let hi = Math.max(...seg.map((b) => b.h));
    if (a.plan) { lo = Math.min(lo, a.plan.stop); hi = Math.max(hi, a.plan.target); }
    const span = (hi - lo) || 1;
    lo -= span * 0.04; hi += span * 0.04;

    const x = (idx) => padL + (idx / (N - 1)) * plotW;
    const y = (p) => padT + (1 - (p - lo) / (hi - lo)) * plotH;

    const closesPath = seg.map((b, idx) => `${idx ? "L" : "M"}${x(idx).toFixed(1)},${y(b.c).toFixed(1)}`).join("");

    const smaPath = (n) => {
      const cs = bars.map((b) => b.c);
      let d = "", started = false;
      for (let idx = 0; idx < N; idx++) {
        const gi = bars.length - N + idx;
        const v = sma(cs, n, gi);
        if (v == null) continue;
        d += `${started ? "L" : "M"}${x(idx).toFixed(1)},${y(v).toFixed(1)}`;
        started = true;
      }
      return d;
    };

    const maxV = Math.max(...seg.map((b) => b.v)) || 1;
    let volRects = "";
    const bw = Math.max(plotW / N - 1.2, 0.8);
    for (let idx = 0; idx < N; idx++) {
      const b = seg[idx];
      const vh = (b.v / maxV) * volH;
      volRects += `<rect x="${(x(idx) - bw / 2).toFixed(1)}" y="${(H - padB - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}"/>`;
    }

    let grid = "", gridLabels = "";
    for (let g = 0; g <= 4; g++) {
      const p = lo + ((hi - lo) * g) / 4;
      const yy = y(p);
      grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>`;
      gridLabels += `<text x="${W - padR + 8}" y="${(yy + 4).toFixed(1)}">${fmt(p)}</text>`;
    }

    const dateLabel = (idx) => {
      const d = seg[idx].t;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    let xLabels = "";
    for (const idx of [0, Math.floor(N / 2), N - 1]) {
      const anchor = idx === 0 ? "start" : idx === N - 1 ? "end" : "middle";
      xLabels += `<text x="${x(idx).toFixed(1)}" y="${H - padB + 20}" text-anchor="${anchor}">${dateLabel(idx)}</text>`;
    }

    let levels = "";
    if (a.plan) {
      const lv = (p, cls, label) => {
        const yy = y(p);
        return `<line class="${cls}" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>` +
               `<text class="lvl-label ${cls}-t" x="${W - padR + 8}" y="${(yy + 4).toFixed(1)}">${label} ${fmt(p)}</text>`;
      };
      levels = lv(a.plan.target, "lvl-target", "目標") + lv(a.plan.entry, "lvl-entry", "進場") + lv(a.plan.stop, "lvl-stop", "停損");
    }

    const last = seg[N - 1];
    el.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="價格走勢圖">
        <g class="c-grid">${grid}</g>
        <g class="c-grid-label">${gridLabels}</g>
        <g class="c-vol">${volRects}</g>
        <path class="c-sma60" d="${smaPath(60)}"/>
        <path class="c-sma20" d="${smaPath(20)}"/>
        <path class="c-close" d="${closesPath}"/>
        ${levels}
        <circle class="c-last" cx="${x(N - 1).toFixed(1)}" cy="${y(last.c).toFixed(1)}" r="3.4"/>
        <g class="c-xlabel">${xLabels}</g>
      </svg>`;
  }

  /* ── 畫面渲染 ── */
  function render(cls, bars, source, a) {
    const last = bars[a.i];

    /* 研究 */
    $("r-symbol").textContent = cls.id;
    $("r-name").textContent = cls.label;
    $("r-price").textContent = fmt(a.c);
    const chgEl = $("r-chg");
    chgEl.textContent = pct(a.chg1);
    chgEl.className = "r-chg " + (a.chg1 >= 0 ? "up" : "down");
    const badge = $("src-badge");
    badge.textContent = source === "real" ? "即時資料" : "示範資料";
    badge.className = "tag " + (source === "real" ? "" : "tag-ink");
    $("r-date").textContent = `資料至 ${last.t.getFullYear()}/${last.t.getMonth() + 1}/${last.t.getDate()}・共 ${bars.length} 根日 K`;

    $("st-hi20").textContent = fmt(a.hi20);
    $("st-lo20").textContent = fmt(a.lo20);
    $("st-sma20").textContent = fmt(a.s20);
    $("st-sma60").textContent = fmt(a.s60);
    $("st-rsi").textContent = a.rsi.toFixed(1);
    $("st-atr").textContent = a.atrp.toFixed(2) + "%";
    $("st-vr").textContent = a.vr.toFixed(2) + "×";
    $("st-dhi").textContent = pct(((a.c - a.hi20) / a.hi20) * 100);

    drawChart(bars, a);

    /* 訊號 */
    document.querySelectorAll("#type-row li").forEach((li) => {
      const k = li.dataset.type;
      li.classList.toggle("on", k in a.sigs);
      li.classList.toggle("off", !(k in a.sigs));
      li.classList.toggle("main", k === a.main);
    });
    $("sig-main").textContent = a.main ? `主訊號：${SIGNAL_NAMES[a.main]}` : "無成立訊號";
    $("sig-score").textContent = `${a.score} / 100`;
    $("score-fill").style.width = a.score + "%";

    const trig = Object.keys(a.sigs).map((k) => SIGNAL_NAMES[k]);
    $("q1").textContent = a.main
      ? `${trig.join("、")} 條件觸發；10 日漲跌 ${pct(a.roc10)}，今日量比 ${a.vr.toFixed(2)}×。`
      : `近期無突破、拉回、動能等預設型態成立（10 日漲跌 ${pct(a.roc10)}）。`;
    const met = [];
    if (a.uptrend) met.push("中期趨勢向上（價 > SMA60、SMA20 > SMA60）");
    if (a.c > a.s20) met.push("價格站上 SMA20");
    if (a.vr > 1.2) met.push("量能放大");
    if (a.rsi >= 50 && a.rsi <= 75) met.push(`RSI ${a.rsi.toFixed(0)} 位於多方區`);
    $("q2").textContent = met.length ? met.join("；") + "。" : "目前沒有明確成立的多方條件。";
    const un = [];
    if (!a.uptrend) un.push("中期趨勢尚未翻多");
    if (a.vr <= 1.2) un.push("量能尚未明顯放大");
    if (a.c <= a.hi20) un.push("尚未突破 20 日高點");
    if (a.rsi > 75) un.push("RSI 過熱，須留意回檔");
    $("q3").textContent = un.length ? un.join("；") + "。" : "主要條件皆已確認。";
    $("q4").textContent = a.main
      ? `${a.score} / 100（${a.score >= 75 ? "強" : a.score >= 60 ? "中等" : "偏弱"}）——依條件完整度、資料一致性給分。`
      : "0 / 100——無訊號即不評分。";
    $("q5").textContent = a.plan ? a.plan.invalidation : "無進行中的判斷。";

    /* 計畫 */
    if (a.plan) {
      $("p-entry").textContent = `${fmt(a.plan.entryLow)} – ${fmt(a.plan.entryHigh)}`;
      $("p-target").textContent = `${fmt(a.plan.target)}（${pct(((a.plan.target - a.plan.entry) / a.plan.entry) * 100, 1)}）`;
      $("p-stop").textContent = `${fmt(a.plan.stop)}（${pct(((a.plan.stop - a.plan.entry) / a.plan.entry) * 100, 1)}）`;
      $("p-rr").textContent = a.plan.rr.toFixed(2);
      $("p-hold").textContent = `約 ${a.plan.holdLo}–${a.plan.holdHi} 個交易日`;
      $("p-conf").textContent = `${a.plan.conf}（${a.score} 分）`;
      $("p-invalid").textContent = a.plan.invalidation;
    } else {
      ["p-entry", "p-target", "p-stop", "p-rr", "p-hold", "p-conf"].forEach((id) => ($(id).textContent = "—"));
      $("p-invalid").textContent = "無成立訊號，不建立交易計畫——「沒有適合的機會」本身也是有效結果。";
    }

    /* 風險 */
    const rows = $("risk-rows");
    rows.innerHTML = "";
    const stampText = { pass: "通過", fail: "未通過", warn: "注意", skip: "未評估" };
    a.checks.forEach((ck, idx) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="rk-num">0${idx + 1}</span>` +
        `<div class="rk-body"><b>${ck.name}</b><span>${ck.desc}</span></div>` +
        `<span class="stamp st-${ck.state}">${stampText[ck.state]}</span>`;
      rows.appendChild(li);
    });

    const pos = $("pos-strip");
    if (a.plan) {
      const riskBudget = 10000; // 本金 100 萬、單筆風險 1%
      const qty = Math.max(Math.floor(riskBudget / (a.plan.entry - a.plan.stop)), 0);
      const cost = qty * a.plan.entry;
      const unit = cls.type === "tw" ? `約 ${fmt(qty)} 股（${(qty / 1000).toFixed(1)} 張）` :
                   cls.type === "crypto" ? `約 ${(riskBudget / (a.plan.entry - a.plan.stop)).toFixed(4)} 單位` :
                   `約 ${fmt(qty)} 股`;
      pos.innerHTML = `部位試算（本金 100 萬・單筆風險 1% = 1 萬）：<b>${unit}</b>，投入約 <b>${fmt(cost)}</b> 元——重點不是多看好，而是錯的時候最多賠多少。`;
    } else {
      pos.innerHTML = `無交易計畫，<b>不進行部位試算</b>。`;
    }

    /* 結論 */
    const { v, reasons } = verdictOf(a, source, bars.length);
    const stamp = $("verdict-stamp");
    stamp.className = "verdict-stamp v-" + v;
    $("verdict-word").textContent = v === "approve" ? "核准" : v === "watch" ? "觀察" : "拒絕";
    $("verdict-icon").innerHTML = `<use href="#i-${v === "approve" ? "check" : v === "watch" ? "eye" : "x"}"/>`;
    const ul = $("verdict-reasons");
    ul.innerHTML = "";
    reasons.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r;
      ul.appendChild(li);
    });

    const memo = [
      `標的 ${cls.label}`,
      `收盤 ${fmt(a.c)}（${pct(a.chg1)}）`,
      a.main ? `訊號 ${SIGNAL_NAMES[a.main]} ${a.score} 分` : "無訊號",
      a.plan ? `進場 ${fmt(a.plan.entry)}・停損 ${fmt(a.plan.stop)}・目標 ${fmt(a.plan.target)}・風報比 ${a.plan.rr.toFixed(2)}` : "無交易計畫",
      a.plan
        ? `風險檢查 ${a.checks.filter((c) => c.state === "pass").length}/${a.checks.length} 通過`
        : "風險檢查未評估",
      `建議狀態：${v === "approve" ? "核准" : v === "watch" ? "觀察" : "拒絕"}`,
    ];
    $("memo-line").textContent = memo.join("　・　");
  }

  /* ── 流程 ── */
  let busy = false;
  async function run(raw) {
    if (busy) return;
    const cls = classify(raw);
    const status = $("fetch-status");
    if (!cls) {
      status.textContent = "看不懂這個代號——試試 2330、AAPL 或 BTCUSDT。";
      return;
    }
    busy = true;
    const btn = $("go-btn");
    btn.disabled = true;
    btn.textContent = "分析中…";
    status.textContent = `正在取得 ${cls.label} 的日 K 資料…`;
    try {
      const { bars, source, error } = await loadBars(cls);
      const a = analyze(bars, cls, source);
      render(cls, bars, source, a);
      status.textContent = source === "real"
        ? `已取得即時資料（${bars.length} 根日 K）。`
        : `即時資料無法取得（${error || "來源不可用"}），已改用示範資料展示流程。`;
      document.getElementById("s-research").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      status.textContent = "分析失敗：" + (e.message || e);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = "開始分析";
    }
  }

  $("analyze-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = $("symbol-input").value.trim();
    if (v) run(v);
  });
  document.querySelectorAll(".quick button").forEach((b) => {
    b.addEventListener("click", () => {
      $("symbol-input").value = b.dataset.sym;
      run(b.dataset.sym);
    });
  });

  /* 預設載入：台積電（失敗時自動退回示範資料） */
  $("symbol-input").value = "2330";
  loadBars(classify("2330")).then(({ bars, source }) => {
    const cls = classify("2330");
    render(cls, bars, source, analyze(bars, cls, source));
    $("fetch-status").textContent = source === "real"
      ? `已載入 2330 即時資料，也可以輸入其他代號。`
      : `示範模式：即時資料需在可連外的環境載入，目前以示範資料展示流程。`;
  });
})();
