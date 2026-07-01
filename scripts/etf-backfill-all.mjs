import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.ETF_DB_PATH || "/app/data/dashboard.sqlite";
const csvPath = process.env.ETF_CATEGORY_CSV || "/app/ETF按行业板块分类.csv";
const days = Math.max(1, Math.min(90, Number(process.env.ETF_BACKFILL_DAYS || 30) || 30));
const concurrency = Math.max(1, Math.min(8, Number(process.env.ETF_BACKFILL_CONCURRENCY || 3) || 3));
const force = process.env.ETF_BACKFILL_FORCE === "true";
const endDate = clean(process.env.ETF_BACKFILL_END_DATE || "");
const hkdCnyRate = Number(process.env.ETF_HKD_CNY_RATE || 0.915);
const tushareToken = clean(process.env.TUSHARE_TOKEN || "");
const tushareApiUrl = cleanBaseUrl(process.env.TUSHARE_API_URL || "https://api.tushare.pro");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 30000");

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clean(value) {
  return String(value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function cleanHtml(value) {
  return clean(String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'"));
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvRows(content) {
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function chinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateFromChinaKey(dateKey) {
  const [year, month, day] = clean(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function isWeekendDateKey(dateKey) {
  const day = dateFromChinaKey(dateKey).getUTCDay();
  return day === 0 || day === 6;
}

function recentDateKeys(count, endDateKey = "") {
  const rows = [];
  const now = endDateKey ? dateFromChinaKey(endDateKey) : new Date();
  for (let offset = 0; offset < count; offset += 1) {
    rows.push(chinaDateKey(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)));
  }
  return rows;
}

function nowIso() {
  return new Date().toISOString();
}

function parsePercentNumber(value) {
  const num = Number(clean(value).replace("%", ""));
  return Number.isFinite(num) ? num : null;
}

function parseEastmoneyHoldings(textValue) {
  const html = String(textValue || "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\\\//g, "/");
  const rows = [];
  const seen = new Set();
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html))) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cleanHtml(cell[1]));
    const joined = cells.join(" ");
    const code = cells.find((cell) => /^\d{6}$/.test(cell)) || (joined.match(/\b\d{6}\b/) || [])[0];
    if (!code || cells.some((cell) => /股票代码|序号/.test(cell)) || seen.has(code)) continue;
    const weight = parsePercentNumber(cells.find((cell) => /%$/.test(cell)) || "");
    const name = cells.find((cell) => cell && !/^\d+$/.test(cell) && !/%$/.test(cell) && !/^\d+(?:\.\d+)?$/.test(cell)) || "";
    seen.add(code);
    rows.push({ stockCode: code, stockName: name, weight });
  }
  return rows;
}

function compactDateKey(date) {
  return clean(date).replace(/-/g, "");
}

function isLikelySzseEtf(code) {
  return /^15[89]\d{3}$/.test(clean(code));
}

function isLikelySseEtf(code) {
  return /^5\d{5}$/.test(clean(code));
}

function xmlText(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanHtml(match?.[1] || "");
}

function parseNumberValue(value) {
  const num = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseSzsePcf(xml, snapshotDate) {
  if (!/<PCFFile[\s>]/i.test(xml)) throw new Error("深交所 PCF 返回内容不是 XML");
  const tradingDay = xmlText(xml, "TradingDay");
  const compactDate = compactDateKey(snapshotDate);
  if (tradingDay && tradingDay !== compactDate) throw new Error(`深交所 PCF 交易日不匹配: ${tradingDay}`);
  const navPerCu = parseNumberValue(xmlText(xml, "NAVperCU"));
  const rows = [];
  const seen = new Set();
  for (const match of String(xml || "").matchAll(/<Component>([\s\S]*?)<\/Component>/gi)) {
    const stockCode = xmlText(match[1], "UnderlyingSecurityID");
    if (!stockCode || seen.has(stockCode)) continue;
    seen.add(stockCode);
    rows.push({
      stockCode,
      stockName: xmlText(match[1], "UnderlyingSymbol"),
      weight: null,
      shares: parseNumberValue(xmlText(match[1], "ComponentShare")),
      marketValue: null,
      stockMarket: pcfStockMarket(stockCode, xmlText(match[1], "UnderlyingSecurityIDSource")),
      source: "szse-official-pcf"
    });
  }
  return { holdings: rows.filter(isInvestablePcfHolding), meta: { navPerCu } };
}

function parseSsePcf(xml, snapshotDate) {
  if (!/<SSEPortfolioCompositionFile[\s>]/i.test(xml)) throw new Error("上交所 PCF 返回内容不是 XML");
  const tradingDay = xmlText(xml, "TradingDay");
  const compactDate = compactDateKey(snapshotDate);
  if (tradingDay !== compactDate) throw new Error(`上交所官方 PCF 仅返回最新交易日 ${tradingDay || "未知"}，无法回补 ${compactDate}`);
  const navPerCu = parseNumberValue(xmlText(xml, "NAVperCU"));
  const rows = [];
  const seen = new Set();
  for (const match of String(xml || "").matchAll(/<Component>([\s\S]*?)<\/Component>/gi)) {
    const stockCode = xmlText(match[1], "InstrumentID");
    if (!stockCode || seen.has(stockCode)) continue;
    seen.add(stockCode);
    rows.push({
      stockCode,
      stockName: xmlText(match[1], "InstrumentName"),
      weight: null,
      shares: parseNumberValue(xmlText(match[1], "Quantity")),
      marketValue: null,
      stockMarket: pcfStockMarket(stockCode, xmlText(match[1], "InstrumentIDSource")),
      source: "sse-official-pcf"
    });
  }
  return { holdings: rows.filter(isInvestablePcfHolding), meta: { navPerCu } };
}

function isInvestablePcfHolding(row) {
  if (!row.stockCode || !row.stockName) return false;
  if (Number(row.shares) <= 0) return false;
  if (/申赎现金|现金|Cash/i.test(row.stockName)) return false;
  return true;
}

function pcfStockMarket(stockCode, sourceCode = "") {
  const code = clean(stockCode);
  const source = clean(sourceCode);
  if (source === "103" || /^\d{5}$/.test(code)) return "HK";
  if (source === "102" || /^[03]\d{5}$/.test(code)) return "SZ";
  if (source === "101" || /^6\d{5}$/.test(code)) return "SH";
  if (/^6\d{5}$/.test(code)) return "SH";
  if (/^[03]\d{5}$/.test(code)) return "SZ";
  return "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3) || 3);
  const retryDelay = Math.max(100, Number(options.retryDelay || 600) || 600);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 personal-market-dashboard",
          accept: options.accept || "text/html,application/xhtml+xml,application/xml,text/xml,text/plain,*/*",
          ...options.headers
        },
        signal: AbortSignal.timeout(options.timeout || 15000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (/^404\b/.test(message) || /^403\b/.test(message)) break;
      if (attempt < attempts) await wait(retryDelay * attempt);
    }
  }
  throw lastError;
}

async function fetchJsonWithRetry(url, options = {}) {
  const text = await fetchTextWithRetry(url, {
    ...options,
    accept: options.accept || "application/json,text/plain,*/*"
  });
  return JSON.parse(text);
}

function eastmoneySecidFromCode(code, market) {
  const cleanCode = clean(code).padStart(6, "0");
  if (market === "SH" || cleanCode.startsWith("6")) return `1.${cleanCode}`;
  if (market === "SZ" || /^[03]/.test(cleanCode)) return `0.${cleanCode}`;
  return "";
}

const quoteCache = new Map();

async function enrichHoldingWeights(holdings, meta = {}, snapshotDate = today) {
  const navPerCu = numberOrNull(meta.navPerCu);
  const shouldUseMarketTotal = Boolean(meta.weightByTotalMarketValue);
  if ((!navPerCu || navPerCu <= 0) && !shouldUseMarketTotal) return holdings;
  const candidates = holdings.filter((row) => row.weight == null && row.shares != null && Number(row.shares) > 0);
  if (!candidates.length) return holdings;
  if (shouldUseMarketTotal) {
    await enrichLatestQuotesBatch(candidates);
  } else {
    await mapLimit(candidates, 8, async (row) => {
      try {
        const quote = await loadComponentQuote(row.stockCode, row.stockMarket, snapshotDate);
        applyQuoteToHolding(row, quote, navPerCu);
      } catch {
        // 成分行情失败时仍保留 PCF 成分，用于新进/剔除统计。
      }
    });
  }
  if ((!navPerCu || navPerCu <= 0) && shouldUseMarketTotal) {
    const totalMarketValue = holdings.reduce((sum, row) => sum + (numberOrNull(row.marketValue) || 0), 0);
    if (totalMarketValue > 0) {
      for (const row of holdings) {
        const marketValue = numberOrNull(row.marketValue);
        if (row.weight == null && marketValue != null && marketValue > 0) row.weight = marketValue / totalMarketValue * 100;
      }
    }
  }
  return holdings;
}

function applyQuoteToHolding(row, quote, navPerCu = null) {
  if (quote?.price == null) return;
  const fxRate = quote.currency === "HKD" ? hkdCnyRate : 1;
  const marketValue = Number(row.shares) * quote.price * fxRate;
  if (!Number.isFinite(marketValue) || marketValue <= 0) return;
  row.marketValue = marketValue;
  if (navPerCu && navPerCu > 0) row.weight = marketValue / navPerCu * 100;
  row.source = `${row.source || "pcf"}+eastmoney-quote`;
}

async function enrichLatestQuotesBatch(rows) {
  const requests = [];
  const rowMap = new Map();
  for (const row of rows) {
    const market = pcfStockMarket(row.stockCode, row.stockMarket);
    const code = clean(row.stockCode).padStart(market === "HK" ? 5 : 6, "0");
    const secid = market === "HK" ? `116.${code}` : eastmoneySecidFromCode(code, market);
    if (!secid) continue;
    requests.push({ secid, market });
    if (!rowMap.has(secid)) rowMap.set(secid, []);
    rowMap.get(secid).push(row);
  }
  const quotes = await fetchLatestQuotesBatch(requests);
  for (const [secid, quote] of quotes.entries()) {
    for (const row of rowMap.get(secid) || []) applyQuoteToHolding(row, quote);
  }
}

async function fetchLatestQuotesBatch(requests) {
  const unique = [];
  const seen = new Set();
  for (const request of requests) {
    if (seen.has(request.secid)) continue;
    seen.add(request.secid);
    unique.push(request);
  }
  const result = new Map();
  for (let index = 0; index < unique.length; index += 80) {
    const chunk = unique.slice(index, index + 80);
    const marketBySecid = new Map(chunk.map((item) => [item.secid, item.market]));
    try {
      const raw = await fetchJsonWithRetry(`https://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2&secids=${encodeURIComponent(chunk.map((item) => item.secid).join(","))}`, {
        timeout: 12000,
        headers: { referer: "https://quote.eastmoney.com/" }
      });
      for (const item of raw?.data?.diff || []) {
        const secid = `${item.f13}.${item.f12}`;
        const price = numberOrNull(item.f2);
        if (price == null) continue;
        result.set(secid, { price, currency: marketBySecid.get(secid) === "HK" ? "HKD" : "CNY" });
      }
    } catch {
      // 批量行情失败时留给单只 ETF 的其他数据源兜底，不阻断持仓入库。
    }
  }
  return result;
}

async function loadComponentQuote(stockCode, market, snapshotDate) {
  const normalizedMarket = pcfStockMarket(stockCode, market);
  const cacheKey = `${snapshotDate}:${normalizedMarket}:${clean(stockCode)}`;
  if (quoteCache.has(cacheKey)) return quoteCache.get(cacheKey);
  const promise = fetchComponentQuote(stockCode, normalizedMarket, snapshotDate);
  quoteCache.set(cacheKey, promise);
  return promise;
}

async function fetchComponentQuote(stockCode, market, snapshotDate) {
  const code = clean(stockCode).padStart(market === "HK" ? 5 : 6, "0");
  const secid = market === "HK" ? `116.${code}` : eastmoneySecidFromCode(code, market);
  if (!secid) throw new Error("无法识别成分股市场");
  const date = compactDateKey(snapshotDate);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=${date}&end=${date}`;
  let raw;
  try {
    raw = await fetchJsonWithRetry(url, {
      timeout: 10000,
      headers: { referer: "https://quote.eastmoney.com/" }
    });
  } catch {
    return fetchComponentLatestQuote(secid, market);
  }
  const line = raw?.data?.klines?.[0];
  if (!line) return fetchComponentLatestQuote(secid, market);
  const parts = String(line).split(",");
  const price = numberOrNull(parts[2]);
  if (price == null) return fetchComponentLatestQuote(secid, market);
  return { price, currency: market === "HK" ? "HKD" : "CNY" };
}

async function fetchComponentLatestQuote(secid, market) {
  const raw = await fetchJsonWithRetry(`https://push2delay.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&secid=${encodeURIComponent(secid)}&fields=f43,f57,f58,f60,f152`, {
    timeout: 10000,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const price = numberOrNull(raw?.data?.f43);
  if (price == null) throw new Error("成分股价格为空");
  return { price, currency: market === "HK" ? "HKD" : "CNY" };
}

function recordStatus(etfCode, snapshotDate, fetchType, status, errorMessage = "") {
  const now = nowIso();
  db.prepare(`
    INSERT INTO etf_holding_fetch_status (etfCode, snapshotDate, fetchType, status, errorMessage, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(etfCode, snapshotDate, fetchType)
    DO UPDATE SET status = excluded.status, errorMessage = excluded.errorMessage, updatedAt = excluded.updatedAt
  `).run(etfCode, snapshotDate, fetchType, status, errorMessage, now, now);
}

function existingSnapshotCount(etfCode, snapshotDate) {
  return db.prepare("SELECT COUNT(*) AS count FROM etf_holding_snapshots WHERE etfCode = ? AND snapshotDate = ?").get(etfCode, snapshotDate)?.count || 0;
}

async function loadSzseOfficialPcf(etf, snapshotDate) {
  const url = `https://www.szse.cn/reportdocs/files/text/ETFDown/pcf_${encodeURIComponent(etf.code)}_${compactDateKey(snapshotDate)}.xml`;
  const text = await fetchTextWithRetry(url, {
    timeout: 15000,
    headers: { referer: "https://www.szse.cn/disclosure/fund/currency/index.html" }
  });
  return parseSzsePcf(text, snapshotDate);
}

async function loadSseOfficialPcf(etf, snapshotDate) {
  if (snapshotDate !== today) throw new Error("上交所官方 PCF 当前公开接口不支持指定历史日期");
  const url = `https://query.sse.com.cn/etfDownload/downloadETF2Bulletin.do?fundCode=${encodeURIComponent(etf.code)}`;
  const text = await fetchTextWithRetry(url, {
    timeout: 15000,
    headers: { referer: `https://www.sse.com.cn/assortment/fund/list/etfinfo/basic/index.shtml?FUNDID=${encodeURIComponent(etf.code)}` }
  });
  return parseSsePcf(text, snapshotDate);
}

async function loadEastmoney(etf, snapshotDate) {
  if (snapshotDate !== today) throw new Error("东方财富 F10 不支持指定历史日期");
  const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${encodeURIComponent(etf.code)}&topline=200&year=`;
  const text = await fetchTextWithRetry(url, {
    timeout: 15000,
    headers: { referer: `https://fundf10.eastmoney.com/ccmx_${etf.code}.html` }
  });
  return parseEastmoneyHoldings(text).map((row) => ({
    ...row,
    shares: null,
    marketValue: null,
    source: "eastmoney-fund-archives"
  }));
}

async function loadFundCompanyPcf() {
  throw new Error("基金公司 PCF/公告源暂未接入");
}

async function loadTushare(etf, snapshotDate) {
  if (!tushareToken) throw new Error("未配置 TUSHARE_TOKEN");
  const tsCode = tushareEtfTsCode(etf.code);
  const apiName = tsCode.endsWith(".SH") ? "etf_sh_cons" : "etf_sz_cons";
  const rows = await fetchTushareApi(apiName, {
    trade_date: compactDateKey(snapshotDate),
    ts_code: tsCode
  }, "trade_date,ts_code,con_code,con_name,qty,sub_flag,cpr,rdr,sca,exchange");
  const holdings = rows.map((row) => {
    const security = parseTushareSecurityCode(row.con_code, row.exchange);
    return {
      stockCode: security.code,
      stockName: clean(row.con_name),
      weight: null,
      shares: numberOrNull(row.qty),
      marketValue: null,
      stockMarket: security.market,
      source: "tushare-etf-cons"
    };
  }).filter(isInvestableTushareHolding);
  return { holdings: uniqRows(holdings, (row) => `${row.stockMarket}:${row.stockCode}`), meta: { weightByTotalMarketValue: true } };
}

async function fetchTushareApi(apiName, params = {}, fields = "") {
  const response = await fetch(tushareApiEndpoint(apiName), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 personal-market-dashboard"
    },
    body: JSON.stringify({
      api_name: apiName,
      token: tushareToken,
      params,
      fields
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Tushare ${apiName} HTTP ${response.status}`);
  const raw = await response.json();
  if (raw?.code !== 0) throw new Error(`Tushare ${apiName} 返回异常: ${clean(raw?.msg || raw?.message || raw?.code)}`);
  const fieldNames = Array.isArray(raw?.data?.fields) ? raw.data.fields : [];
  const items = Array.isArray(raw?.data?.items) ? raw.data.items : [];
  if (!items.length) throw new Error(`Tushare ${apiName} 无数据`);
  return items.map((values) => Object.fromEntries(fieldNames.map((field, index) => [field, values[index]])));
}

function tushareApiEndpoint(apiName) {
  if (/api\.tushare\.pro\/?$/i.test(tushareApiUrl)) return tushareApiUrl;
  return `${tushareApiUrl}/${encodeURIComponent(apiName)}`;
}

function tushareEtfTsCode(code) {
  const cleanCode = clean(code).padStart(6, "0");
  return `${cleanCode}.${isLikelySseEtf(cleanCode) ? "SH" : "SZ"}`;
}

function parseTushareSecurityCode(value, exchange = "") {
  const textValue = clean(value);
  const match = textValue.match(/^(\d{5,6})(?:\.(SH|SZ|HK))?$/i);
  const code = match?.[1] || textValue.replace(/\D/g, "");
  const suffix = (match?.[2] || clean(exchange)).toUpperCase();
  let market = suffix === "HK" ? "HK" : suffix === "SH" ? "SH" : suffix === "SZ" ? "SZ" : pcfStockMarket(code, suffix);
  if (!market && /^\d{5}$/.test(code)) market = "HK";
  return { code, market };
}

function isInvestableTushareHolding(row) {
  if (!row.stockCode || !row.stockName) return false;
  if (Number(row.shares) <= 0) return false;
  if (/现金|Cash/i.test(row.stockName)) return false;
  return true;
}

function uniqRows(rows, keyFor) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const key = clean(keyFor(row));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

async function loadHoldingByPriority(etf, snapshotDate) {
  const sources = [];
  sources.push(["tushare-etf-cons", () => loadTushare(etf, snapshotDate)]);
  if (isLikelySzseEtf(etf.code)) {
    sources.push(["szse-official-pcf", () => loadSzseOfficialPcf(etf, snapshotDate)]);
  } else if (isLikelySseEtf(etf.code)) {
    sources.push(["sse-official-pcf", () => loadSseOfficialPcf(etf, snapshotDate)]);
  } else {
    sources.push(["szse-official-pcf", () => loadSzseOfficialPcf(etf, snapshotDate)]);
    sources.push(["sse-official-pcf", () => loadSseOfficialPcf(etf, snapshotDate)]);
  }
  sources.push(["eastmoney-fund-archives", () => loadEastmoney(etf, snapshotDate)]);
  sources.push(["fund-company-pcf", () => loadFundCompanyPcf(etf, snapshotDate)]);

  const attempts = [];
  for (const [source, loader] of sources) {
    try {
      const loaded = normalizeHoldingLoad(await loader());
      const holdings = await enrichHoldingWeights(loaded.holdings, loaded.meta, snapshotDate);
      if (holdings.length) return { source, holdings };
      attempts.push(`${source}: 未获取到持仓明细`);
    } catch (error) {
      attempts.push(`${source}: ${String(error?.message || error).slice(0, 120)}`);
    }
  }
  throw new Error(`未获取到 ETF 持仓明细；${attempts.join("；")}`);
}

function normalizeHoldingLoad(value) {
  if (Array.isArray(value)) return { holdings: value, meta: {} };
  return {
    holdings: Array.isArray(value?.holdings) ? value.holdings : [],
    meta: value?.meta || {}
  };
}

async function fetchHolding(etf, snapshotDate) {
  try {
    if (!force) {
      const existingCount = existingSnapshotCount(etf.code, snapshotDate);
      if (existingCount > 0) {
        recordStatus(etf.code, snapshotDate, "backfill", "success", "");
        return { ok: true, code: etf.code, count: existingCount, source: "existing-snapshot", skipped: true };
      }
    }
    const loaded = await loadHoldingByPriority(etf, snapshotDate);
    const holdings = loaded.holdings;
    if (!holdings.length) throw new Error("未获取到 ETF 持仓明细");
    const now = nowIso();
    db.prepare("DELETE FROM etf_holding_snapshots WHERE etfCode = ? AND snapshotDate = ?").run(etf.code, snapshotDate);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO etf_holding_snapshots
        (etfCode, snapshotDate, stockCode, stockName, weight, shares, marketValue, source, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.exec("BEGIN");
    try {
      for (const row of holdings) {
        stmt.run(etf.code, snapshotDate, row.stockCode, row.stockName, row.weight, row.shares, row.marketValue, row.source || loaded.source, now);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    recordStatus(etf.code, snapshotDate, "backfill", "success", "");
    return { ok: true, code: etf.code, count: holdings.length, source: loaded.source };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 180);
    recordStatus(etf.code, snapshotDate, "backfill", "failed", message);
    return { ok: false, code: etf.code, errorMessage: message };
  }
}

async function mapLimit(items, limit, mapper) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      result[index] = await mapper(items[index], index);
    }
  }));
  return result;
}

const etfs = parseCsvRows(readFileSync(csvPath, "utf8"))
  .filter((row) => /^\d{6}$/.test(clean(row.code)))
  .map((row) => ({ code: clean(row.code), name: clean(row.name) }));
const dates = recentDateKeys(days, endDate);
const today = chinaDateKey();

console.log(`[start] etfs=${etfs.length} dates=${dates.length} today=${today} end=${dates[0] || ""} concurrency=${concurrency}`);
for (const date of dates) {
  if (isWeekendDateKey(date)) {
    for (const etf of etfs) {
      if (!force && existingSnapshotCount(etf.code, date) > 0) {
        recordStatus(etf.code, date, "backfill", "success", "");
      } else {
        recordStatus(etf.code, date, "backfill", "failed", "非交易日无 ETF PCF");
      }
    }
    console.log(`[summary] ${date} success=0 failed=${etfs.length} sources={} skipped=weekend`);
    continue;
  }
  let done = 0;
  const results = await mapLimit(etfs, concurrency, async (etf) => {
    const row = await fetchHolding(etf, date);
    done += 1;
    if (done % 25 === 0 || done === etfs.length) console.log(`[${date}] ${done}/${etfs.length}`);
    return row;
  });
  const sourceCounts = results.filter((row) => row.ok).reduce((acc, row) => {
    acc[row.source || "unknown"] = (acc[row.source || "unknown"] || 0) + 1;
    return acc;
  }, {});
  console.log(`[summary] ${date} success=${results.filter((row) => row.ok).length} failed=${results.filter((row) => !row.ok).length} sources=${JSON.stringify(sourceCounts)}`);
}
console.log("[done]");
