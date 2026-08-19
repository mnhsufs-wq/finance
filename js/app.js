/**
 * FinanceBoard — TradingView Embed Widgets 串接
 * 文件：https://www.tradingview.com/widget-docs/
 */
(function () {
  "use strict";

  var STORAGE_KEY = "financeboard.state.v2";
  var LOCALE = "zh_TW";
  var TIMEZONE = "Asia/Taipei";

  // TWSE 原始代號受交易所授權限制，無法在免費內嵌圖表顯示，
  // 常見台股改以美國 ADR 對應
  var TW_ADR_MAP = {
    "2330": "NYSE:TSM",   // 台積電
    "2303": "NYSE:UMC",   // 聯電
    "3711": "NYSE:ASX",   // 日月光
    "2412": "NYSE:CHT",   // 中華電信
    "2317": "OTC:HNHPF"   // 鴻海（美國 OTC）
  };

  var DEFAULT_STATE = {
    symbol: "NYSE:TSM",
    theme: "dark",
    watchlist: [
      "NYSE:TSM",
      "NASDAQ:NVDA",
      "NASDAQ:AAPL",
      "BINANCE:BTCUSDT",
      "TVC:GOLD",
      "FX_IDC:USDTWD"
    ]
  };

  var state = loadState();
  // 記錄哪些分頁已載入過，切換主題時才需要重建
  var loadedTabs = { overview: false, heatmap: false, screener: false };
  var activeTab = "overview";

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.symbol && Array.isArray(saved.watchlist)) {
        return saved;
      }
    } catch (e) {
      /* 壞掉的資料直接用預設值 */
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * 將 TradingView 的 embed widget 注入容器。
   * TradingView 的嵌入腳本會讀取 <script> 標籤內文作為 JSON 設定。
   */
  function createWidget(containerId, widgetName, config) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";

    var inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    wrap.appendChild(inner);

    var script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-" +
      widgetName +
      ".js";
    script.text = JSON.stringify(config);
    wrap.appendChild(script);

    container.appendChild(wrap);
  }

  /**
   * 正規化使用者輸入的代號：
   * 純數字視為台股——有 ADR 的自動對應（TWSE 資料無法在內嵌圖表顯示），
   * 其餘轉大寫原樣交給 TradingView 解析。
   */
  function normalizeSymbol(input) {
    var s = input.trim().toUpperCase();
    if (!s) return null;
    if (/^\d{4,6}[A-Z]?$/.test(s)) {
      return TW_ADR_MAP[s] || "TWSE:" + s;
    }
    return TW_ADR_MAP[s.replace("TWSE:", "")] || s;
  }

  /* ── 各區塊 Widget ──────────────────────── */

  function renderTickerTape() {
    createWidget("ticker-tape", "ticker-tape", {
      symbols: [
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "FOREXCOM:NSXUSD", title: "NASDAQ 100" },
        { proName: "NYSE:TSM", title: "台積電 ADR" },
        { proName: "NASDAQ:NVDA", title: "NVIDIA" },
        { proName: "FX_IDC:USDTWD", title: "美元/台幣" },
        { proName: "BINANCE:BTCUSDT", title: "比特幣" },
        { proName: "TVC:GOLD", title: "黃金" }
      ],
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: state.theme,
      locale: LOCALE
    });
  }

  function renderChart() {
    createWidget("advanced-chart", "advanced-chart", {
      autosize: true,
      symbol: state.symbol,
      interval: "D",
      timezone: TIMEZONE,
      theme: state.theme,
      style: "1",
      locale: LOCALE,
      allow_symbol_change: true,
      withdateranges: true,
      details: false,
      calendar: false,
      support_host: "https://www.tradingview.com"
    });
  }

  function renderSymbolInfo() {
    createWidget("symbol-info", "symbol-info", {
      symbol: state.symbol,
      width: "100%",
      height: "100%",
      isTransparent: true,
      colorTheme: state.theme,
      locale: LOCALE
    });
  }

  function renderTechnicalAnalysis() {
    createWidget("technical-analysis", "technical-analysis", {
      symbol: state.symbol,
      interval: "1D",
      width: "100%",
      height: "100%",
      isTransparent: true,
      showIntervalTabs: true,
      displayMode: "single",
      colorTheme: state.theme,
      locale: LOCALE
    });
  }

  function renderOverviewTab() {
    createWidget("panel-overview", "market-overview", {
      colorTheme: state.theme,
      dateRange: "12M",
      showChart: true,
      width: "100%",
      height: "100%",
      isTransparent: true,
      showSymbolLogo: true,
      locale: LOCALE,
      tabs: [
        {
          title: "指數",
          symbols: [
            { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
            { s: "FOREXCOM:NSXUSD", d: "NASDAQ 100" },
            { s: "FOREXCOM:DJI", d: "道瓊工業" },
            { s: "INDEX:NKY", d: "日經 225" },
            { s: "INDEX:HSI", d: "恆生指數" }
          ]
        },
        {
          title: "台股 ADR",
          symbols: [
            { s: "NYSE:TSM", d: "台積電 ADR" },
            { s: "NYSE:UMC", d: "聯電 ADR" },
            { s: "NYSE:ASX", d: "日月光 ADR" },
            { s: "NYSE:CHT", d: "中華電信 ADR" },
            { s: "OTC:HNHPF", d: "鴻海（美國 OTC）" }
          ]
        },
        {
          title: "外匯",
          symbols: [
            { s: "FX_IDC:USDTWD", d: "美元/台幣" },
            { s: "FX:EURUSD", d: "歐元/美元" },
            { s: "FX:USDJPY", d: "美元/日圓" },
            { s: "FX:GBPUSD", d: "英鎊/美元" },
            { s: "FX:AUDUSD", d: "澳幣/美元" }
          ]
        },
        {
          title: "加密貨幣",
          symbols: [
            { s: "BINANCE:BTCUSDT", d: "比特幣" },
            { s: "BINANCE:ETHUSDT", d: "以太幣" },
            { s: "BINANCE:SOLUSDT", d: "Solana" },
            { s: "BINANCE:BNBUSDT", d: "BNB" },
            { s: "BINANCE:DOGEUSDT", d: "狗狗幣" }
          ]
        }
      ]
    });
  }

  function renderHeatmapTab() {
    createWidget("panel-heatmap", "stock-heatmap", {
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
      colorTheme: state.theme,
      locale: LOCALE
    });
  }

  function renderScreenerTab() {
    createWidget("panel-screener", "screener", {
      width: "100%",
      height: "100%",
      defaultColumn: "overview",
      defaultScreen: "most_capitalized",
      market: "taiwan",
      showToolbar: true,
      isTransparent: true,
      colorTheme: state.theme,
      locale: LOCALE
    });
  }

  var TAB_RENDERERS = {
    overview: renderOverviewTab,
    heatmap: renderHeatmapTab,
    screener: renderScreenerTab
  };

  /* ── 畫面邏輯 ───────────────────────────── */

  function renderSymbolWidgets() {
    renderChart();
    renderSymbolInfo();
    renderTechnicalAnalysis();
  }

  function renderAll() {
    renderTickerTape();
    renderSymbolWidgets();
    Object.keys(loadedTabs).forEach(function (tab) {
      if (loadedTabs[tab]) TAB_RENDERERS[tab]();
    });
  }

  function setSymbol(symbol) {
    state.symbol = symbol;
    saveState();
    renderSymbolWidgets();
    renderWatchlist();
  }

  function renderWatchlist() {
    var list = document.getElementById("watchlist");
    list.innerHTML = "";

    state.watchlist.forEach(function (symbol) {
      var li = document.createElement("li");
      if (symbol === state.symbol) li.classList.add("active");

      var label = document.createElement("span");
      label.textContent = symbol;
      li.appendChild(label);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "✕";
      remove.title = "移除";
      remove.addEventListener("click", function (e) {
        e.stopPropagation();
        state.watchlist = state.watchlist.filter(function (s) {
          return s !== symbol;
        });
        saveState();
        renderWatchlist();
      });
      li.appendChild(remove);

      li.addEventListener("click", function () {
        setSymbol(symbol);
      });

      list.appendChild(li);
    });
  }

  function switchTab(tab) {
    activeTab = tab;

    document.querySelectorAll(".tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "panel-" + tab);
    });

    // 分頁內容延遲載入，開過之後保留
    if (!loadedTabs[tab]) {
      TAB_RENDERERS[tab]();
      loadedTabs[tab] = true;
    }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    document.getElementById("theme-toggle").textContent =
      state.theme === "dark" ? "☀️" : "🌙";
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
    applyTheme();
    renderAll();
  }

  /* ── 事件綁定 ───────────────────────────── */

  document
    .getElementById("symbol-form")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("symbol-input");
      var symbol = normalizeSymbol(input.value);
      if (symbol) {
        setSymbol(symbol);
        input.value = "";
      }
    });

  document
    .getElementById("watchlist-form")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("watchlist-input");
      var symbol = normalizeSymbol(input.value);
      if (symbol && state.watchlist.indexOf(symbol) === -1) {
        state.watchlist.push(symbol);
        saveState();
        renderWatchlist();
      }
      input.value = "";
    });

  document
    .getElementById("theme-toggle")
    .addEventListener("click", toggleTheme);

  document.getElementById("tabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (btn) switchTab(btn.dataset.tab);
  });

  /* ── 啟動 ───────────────────────────────── */

  applyTheme();
  renderTickerTape();
  renderSymbolWidgets();
  renderWatchlist();
  switchTab("overview");
})();
