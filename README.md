# FinanceBoard｜TradingView 金融儀表板

以 [TradingView Embed Widgets](https://www.tradingview.com/widget-docs/) 串接的金融行情儀表板。純靜態網頁（HTML / CSS / 原生 JavaScript），不需要 API key、不需要後端、不需要建置工具，開啟即可使用。

## 功能

- **進階即時圖表**（Advanced Chart）：K 線圖，內建指標、繪圖工具與商品搜尋，時區為 `Asia/Taipei`
- **行情跑馬燈**（Ticker Tape）：加權指數、S&P 500、台積電、美元/台幣、比特幣、黃金等
- **商品資訊**（Symbol Info）：目前商品的即時報價摘要
- **技術分析評級**（Technical Analysis）：多週期的買賣訊號儀表
- **市場總覽**（Market Overview）：指數／台股／外匯／加密貨幣四個分頁
- **熱力圖**（Stock Heatmap）：S&P 500 依產業分群的漲跌熱力圖
- **選股器**（Screener）：台股市場篩選
- **自選清單**：新增／移除／點擊切換商品，儲存在 `localStorage`
- **深淺色主題**：一鍵切換，所有 widget 同步換色
- **台股快捷輸入**：直接輸入 `2330` 會自動視為 `TWSE:2330`

## 使用方式

任何靜態伺服器皆可，例如：

```bash
# Python
python3 -m http.server 8000

# 或 Node.js
npx serve .
```

開啟 `http://localhost:8000` 即可。

> 注意：TradingView widget 以 iframe 載入，直接以 `file://` 開啟檔案在部分瀏覽器可能受限，建議透過 HTTP 伺服器開啟。

## 代號格式

| 輸入範例 | 說明 |
| --- | --- |
| `2330` | 常見台股自動對應美國 ADR → `NYSE:TSM`（見下方授權限制） |
| `AAPL` / `NASDAQ:AAPL` | 美股 |
| `BINANCE:BTCUSDT` | 加密貨幣 |
| `FX_IDC:USDTWD` | 外匯 |
| `TVC:GOLD` | 黃金 |

> **台股授權限制**：台灣證交所（TWSE）行情資料受交易所授權限制，無法在 TradingView 免費內嵌圖表顯示（會出現「此商品僅在 TradingView 上可用」）。因此常見台股（2330／2303／3711／2412／2317）會自動改用美國 ADR 報價；其他台股代號請直接到 TradingView 網站查看。

圖表本身也內建 TradingView 的商品搜尋，點圖表左上角的代號即可搜尋全球商品。

## 專案結構

```
finance/
├── index.html      # 頁面結構
├── css/style.css   # 版面與深淺色主題
└── js/app.js       # widget 建立、狀態管理（自選清單／主題／目前商品）
```

所有 widget 都由 `js/app.js` 的 `createWidget(containerId, widgetName, config)` 動態注入，設定即 TradingView 官方文件上的 JSON 參數，要調整商品、預設清單或外觀直接改該檔即可。

## 進階整合方向

目前使用的是 TradingView 免費 Embed Widgets（資料由 TradingView 提供並顯示其標示）。若需要更深度的整合，可考慮：

- **Charting Library / Advanced Charts**（需向 TradingView 申請授權）：自帶資料來源（Datafeed API），可完全客製圖表與資料
- **Webhook 警報**：TradingView 付費方案可將警報以 webhook POST 到自己的後端，實現訊號通知或自動下單
- **Broker API**：讓 TradingView 圖表直接連你的交易系統下單
