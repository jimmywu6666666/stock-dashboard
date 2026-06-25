import { createServer } from "node:http";
import https from "node:https";
import tls from "node:tls";
import { readFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "dashboard.sqlite");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_USERNAME = process.env.ACCESS_USERNAME || "admin";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "change-me";
const DSA_API_BASE_URL = cleanBaseUrl(process.env.DSA_API_BASE_URL || "");
const DSA_REPORT_LANGUAGE = clean(process.env.DSA_REPORT_LANGUAGE || "zh") || "zh";
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === "true" || Boolean(process.env.SIGNUP_CODE);
const SIGNUP_CODE = process.env.SIGNUP_CODE || "";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;
const DEFAULT_DSA_DAILY_LIMIT = Number(process.env.DEFAULT_DSA_DAILY_LIMIT || 3);
const PUBLIC_BASE_URL = cleanBaseUrl(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "");
const DAILY_REPORT_TIME = clean(process.env.DAILY_REPORT_TIME || "16:30") || "16:30";
const SMTP_HOST = clean(process.env.REPORT_SMTP_HOST || process.env.SMTP_HOST || "");
const SMTP_PORT = Number(process.env.REPORT_SMTP_PORT || process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.REPORT_SMTP_SECURE || process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
const SMTP_USER = clean(process.env.REPORT_SMTP_USER || process.env.SMTP_USER || process.env.EMAIL_SENDER || "");
const SMTP_PASS = String(process.env.REPORT_SMTP_PASS || process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || "");
const SMTP_FROM = clean(process.env.REPORT_EMAIL_FROM || SMTP_USER || "");
const execFileAsync = promisify(execFile);
const SECTOR_CATALOG_LIMIT = Number(process.env.SECTOR_CATALOG_LIMIT || 120);
const SECTOR_FLOW_LIMIT = Number(process.env.SECTOR_FLOW_LIMIT || 32);
const SECTOR_FEATURED_NAMES = [
  "光模块", "光通信", "CPO", "光纤", "PCB", "先进封装", "半导体", "AI芯片", "算力",
  "液冷", "人工智能", "机器人", "消费电子", "存储芯片", "通信服务", "商业航天",
  "高速连接", "铜缆", "玻璃基板", "固态电池", "创新药", "白酒", "券商", "证券"
];
const SECTOR_FEATURED_SEARCH_NAMES = [
  "商业航天", "卫星互联网", "光模块", "光通信模块", "CPO概念", "PCB", "先进封装",
  "半导体", "AI芯片", "算力概念", "液冷概念", "人形机器人", "消费电子概念",
  "存储芯片", "铜缆高速连接", "高速连接器", "玻璃基板", "固态电池", "创新药", "券商"
];
const SECTOR_PINNED_ROWS = [
  { code: "BK0711", name: "券商" },
  { code: "BK1136", name: "光通信模块" },
  { code: "BK1128", name: "CPO概念" },
  { code: "BK1036", name: "半导体" },
  { code: "BK1101", name: "先进封装" },
  { code: "BK1339", name: "被动元件" },
  { code: "BK1184", name: "人形机器人" }
];
const SIGNANA_BASE_URL = cleanBaseUrl(process.env.SIGNANA_BASE_URL || "https://www.signana.com");
const EASTMONEY_KLINE_FIELDS1 = "f1,f2,f3,f4,f5,f6";
const EASTMONEY_KLINE_FIELDS2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    displayName TEXT NOT NULL DEFAULT '',
    passwordHash TEXT NOT NULL,
    salt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT 'CN',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    costPrice REAL,
    position REAL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_snapshots (
    snapshotDate TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dsa_daily_usage (
    userId INTEGER NOT NULL,
    usageDate TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY(userId, usageDate),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS report_settings (
    userId INTEGER PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    emailEnabled INTEGER NOT NULL DEFAULT 0,
    email TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS watchlist_daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    reportDate TEXT NOT NULL,
    isTest INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    channels TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    errorMessage TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    sentAt TEXT,
    UNIQUE(userId, reportDate, isTest),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    userId INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '{}',
    updatedAt TEXT NOT NULL,
    PRIMARY KEY(userId, key),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sector_catalog (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'concept',
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sector_daily_bars (
    code TEXT NOT NULL,
    tradeDate TEXT NOT NULL,
    open REAL,
    close REAL,
    high REAL,
    low REAL,
    volume REAL,
    amount REAL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY(code, tradeDate)
  );

  CREATE TABLE IF NOT EXISTS sector_flow_minutes (
    code TEXT NOT NULL,
    tradeDate TEXT NOT NULL,
    minuteIndex INTEGER NOT NULL,
    time TEXT NOT NULL,
    mainFlow REAL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY(code, tradeDate, minuteIndex)
  );

`);

ensureUserDisplayNameColumn();
ensureUserAccountColumns();
migrateMultiUserSchema();
ensureWatchlistHoldingColumns();
ensureReportTables();
ensureDefaultUser();

const cache = new Map();
const staleCache = new Map();
let sectorHistoryDisabledUntil = 0;

function nowIso() {
  return new Date().toISOString();
}

function daysFromNowIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function migrateMultiUserSchema() {
  const columns = db.prepare("PRAGMA table_info(watchlist)").all();
  const hasUserId = columns.some((column) => column.name === "userId");
  if (hasUserId) {
    ensureWatchlistHoldingColumns();
    return;
  }
  const defaultUserId = ensureDefaultUser();
  const hasCostPrice = columns.some((column) => column.name === "costPrice");
  const hasPosition = columns.some((column) => column.name === "position");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      market TEXT NOT NULL DEFAULT 'CN',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      costPrice REAL,
      position REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(userId, symbol),
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.prepare(`
    INSERT OR IGNORE INTO watchlist_v2 (id, userId, symbol, name, market, sortOrder, costPrice, position, createdAt, updatedAt)
    SELECT id, ?, symbol, name, market, sortOrder, ${hasCostPrice ? "costPrice" : "NULL"}, ${hasPosition ? "position" : "NULL"}, createdAt, updatedAt FROM watchlist
  `).run(defaultUserId);
  db.exec(`
    DROP TABLE watchlist;
    ALTER TABLE watchlist_v2 RENAME TO watchlist;
    CREATE INDEX IF NOT EXISTS idx_watchlist_user_sort ON watchlist(userId, sortOrder, id);
  `);
}

function ensureWatchlistHoldingColumns() {
  const columns = db.prepare("PRAGMA table_info(watchlist)").all().map((column) => column.name);
  if (!columns.includes("costPrice")) db.exec("ALTER TABLE watchlist ADD COLUMN costPrice REAL;");
  if (!columns.includes("position")) db.exec("ALTER TABLE watchlist ADD COLUMN position REAL;");
}

function ensureReportTables() {
  const settingsColumns = db.prepare("PRAGMA table_info(report_settings)").all().map((column) => column.name);
  const settingDefaults = [
    ["enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["emailEnabled", "INTEGER NOT NULL DEFAULT 0"],
    ["email", "TEXT NOT NULL DEFAULT ''"],
    ["createdAt", "TEXT NOT NULL DEFAULT ''"],
    ["updatedAt", "TEXT NOT NULL DEFAULT ''"]
  ];
  for (const [name, definition] of settingDefaults) {
    if (!settingsColumns.includes(name)) db.exec(`ALTER TABLE report_settings ADD COLUMN ${name} ${definition};`);
  }
  const reportColumns = db.prepare("PRAGMA table_info(watchlist_daily_reports)").all().map((column) => column.name);
  const reportDefaults = [
    ["isTest", "INTEGER NOT NULL DEFAULT 0"],
    ["channels", "TEXT NOT NULL DEFAULT ''"],
    ["summary", "TEXT NOT NULL DEFAULT ''"],
    ["errorMessage", "TEXT NOT NULL DEFAULT ''"],
    ["sentAt", "TEXT"]
  ];
  for (const [name, definition] of reportDefaults) {
    if (!reportColumns.includes(name)) db.exec(`ALTER TABLE watchlist_daily_reports ADD COLUMN ${name} ${definition};`);
  }
}

function ensureUserDisplayNameColumn() {
  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("displayName")) db.exec("ALTER TABLE users ADD COLUMN displayName TEXT NOT NULL DEFAULT '';");
}

function ensureUserAccountColumns() {
  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("expiresAt")) db.exec("ALTER TABLE users ADD COLUMN expiresAt TEXT;");
  if (!columns.includes("lastActiveAt")) db.exec("ALTER TABLE users ADD COLUMN lastActiveAt TEXT;");
  if (!columns.includes("dsaDailyLimit")) db.exec(`ALTER TABLE users ADD COLUMN dsaDailyLimit INTEGER NOT NULL DEFAULT ${DEFAULT_DSA_DAILY_LIMIT};`);
  const defaultExpiry = daysFromNowIso(7);
  db.prepare("UPDATE users SET expiresAt = ? WHERE expiresAt IS NULL AND username <> ?")
    .run(defaultExpiry, cleanUsername(DEFAULT_USERNAME));
  db.prepare("UPDATE users SET dsaDailyLimit = ? WHERE dsaDailyLimit IS NULL OR dsaDailyLimit < 0")
    .run(DEFAULT_DSA_DAILY_LIMIT);
}

function ensureDefaultUser() {
  const username = cleanUsername(DEFAULT_USERNAME);
  const existing = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (existing) return existing.id;
  const password = hashPassword(ACCESS_PASSWORD);
  const result = db.prepare("INSERT INTO users (username, displayName, passwordHash, salt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(username, "", password.hash, password.salt, nowIso(), nowIso());
  return Number(result.lastInsertRowid);
}

function cleanUsername(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_.@-]/g, "").slice(0, 48);
}

function cleanDisplayName(value) {
  return clean(value).slice(0, 48);
}

function parseAccountExpiryDate(value, fallback = daysFromNowIso(7)) {
  const textValue = clean(value);
  if (!textValue) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
    return new Date(`${textValue}T23:59:59+08:00`).toISOString();
  }
  const date = new Date(textValue);
  if (Number.isNaN(date.getTime())) throw new Error("到期时间格式不正确");
  return date.toISOString();
}

function normalizeDsaDailyLimit(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return DEFAULT_DSA_DAILY_LIMIT;
  return Math.max(0, Math.floor(numberValue));
}

function parseDsaDailyLimit(value, fallback = DEFAULT_DSA_DAILY_LIMIT) {
  if (value == null || value === "") return normalizeDsaDailyLimit(fallback);
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error("每日 AI 次数必须是 0 或正整数");
  return Math.floor(numberValue);
}

function chinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, 120_000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, user) {
  if (!user) return false;
  const candidate = hashPassword(password, user.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, { "content-type": contentType, ...extraHeaders });
  res.end(body);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    })
  );
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSessionCookie(user) {
  const payload = JSON.stringify({
    uid: user.id,
    username: user.username,
    exp: Date.now() + SESSION_MAX_AGE_MS
  });
  const value = Buffer.from(payload).toString("base64url");
  return `${value}.${sign(value)}`;
}

function currentUser(req) {
  const token = parseCookies(req).session;
  if (!token || !token.includes(".")) return null;
  const [value, signature] = token.split(".");
  if (signature !== sign(value)) return null;
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (Number(payload.exp) <= Date.now() || !payload.uid) return null;
    const user = db.prepare("SELECT id, username, displayName, expiresAt, lastActiveAt, dsaDailyLimit FROM users WHERE id = ?").get(payload.uid);
    if (isUserExpired(user)) return null;
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || "",
    expiresAt: user.expiresAt || "",
    lastActiveAt: user.lastActiveAt || "",
    dsaDailyLimit: user.username === cleanUsername(DEFAULT_USERNAME) ? null : normalizeDsaDailyLimit(user.dsaDailyLimit),
    expired: isUserExpired(user),
    isAdmin: user.username === cleanUsername(DEFAULT_USERNAME)
  };
}

function isUserExpired(user) {
  if (!user || user.username === cleanUsername(DEFAULT_USERNAME)) return false;
  return Boolean(user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now());
}

function dsaQuotaForUser(user) {
  if (!user) return { unlimited: false, limit: DEFAULT_DSA_DAILY_LIMIT, used: 0, remaining: DEFAULT_DSA_DAILY_LIMIT, usageDate: chinaDateKey() };
  if (user.isAdmin || user.username === cleanUsername(DEFAULT_USERNAME)) {
    return { unlimited: true, limit: null, used: 0, remaining: null, usageDate: chinaDateKey() };
  }
  const usageDate = chinaDateKey();
  const row = db.prepare("SELECT count FROM dsa_daily_usage WHERE userId = ? AND usageDate = ?").get(user.id, usageDate);
  const limit = normalizeDsaDailyLimit(user.dsaDailyLimit);
  const used = Math.max(0, Number(row?.count || 0));
  return {
    unlimited: false,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    usageDate
  };
}

function ensureDsaQuotaAvailable(user) {
  const quota = dsaQuotaForUser(user);
  if (!quota.unlimited && quota.remaining <= 0) {
    const error = new Error(`今日 AI 分析次数已用完（${quota.used}/${quota.limit}），明天再试或联系管理员调整额度`);
    error.status = 429;
    error.quota = quota;
    throw error;
  }
  return quota;
}

function incrementDsaUsage(user) {
  if (!user || user.isAdmin || user.username === cleanUsername(DEFAULT_USERNAME)) return dsaQuotaForUser(user);
  const usageDate = chinaDateKey();
  const now = nowIso();
  db.prepare(`
    INSERT INTO dsa_daily_usage (userId, usageDate, count, createdAt, updatedAt)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(userId, usageDate)
    DO UPDATE SET count = count + 1, updatedAt = excluded.updatedAt
  `).run(user.id, usageDate, now, now);
  return dsaQuotaForUser(user);
}

function updateUserActivity(userId) {
  db.prepare("UPDATE users SET lastActiveAt = ? WHERE id = ?").run(nowIso(), userId);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("上传图片不能超过 8MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return { ...hit.value, stale: false };
  try {
    const data = await loader();
    const value = { data, updatedAt: nowIso(), stale: false };
    cache.set(key, { time: Date.now(), value });
    staleCache.set(key, value);
    return value;
  } catch (error) {
    const stale = staleCache.get(key);
    if (stale) return { ...stale, stale: true, errorMessage: readableError(error) };
    return {
      data: fallbackFor(key),
      updatedAt: nowIso(),
      stale: true,
      errorMessage: readableError(error)
    };
  }
}

function readableError(error) {
  return error?.message ? String(error.message).slice(0, 180) : "数据源暂时不可用";
}

function uniqBy(rows, keyFor) {
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

function fallbackFor(key) {
  if (key === "market") {
    return [
      quoteFallback("上证指数", "000001.SS", "CN"),
      quoteFallback("纳斯达克综合", "^IXIC", "US"),
      quoteFallback("国际现货金", "XAU/USD", "GLOBAL"),
      quoteFallback("布伦特原油", "BRENT", "GLOBAL"),
      quoteFallback("BTC/USDT", "BTCUSDT", "CRYPTO"),
      quoteFallback("美元/人民币", "USD/CNY", "FX")
    ];
  }
  if (key === "a-share-analysis") {
    return {
      amount: null,
      previousAmount: null,
      amountChange: null,
      upCount: null,
      downCount: null,
      flatCount: null,
      bins: defaultAShareDistributionBins(),
      updatedAt: nowIso()
    };
  }
  if (key.startsWith("jin10")) return [];
  if (key.startsWith("eastmoney-news")) return [];
  if (key.startsWith("stock-eastmoney-news")) return [];
  if (key.startsWith("stock-tags")) return [];
  if (key === "hot-stocks") return [];
  if (key === "hot-sectors") return [];
  if (key.startsWith("mainlines")) return [];
  if (key.startsWith("sector-stocks")) return [];
  if (key.startsWith("sector-flow")) return null;
  if (key.startsWith("sector-ranking")) return null;
  if (key.startsWith("sector-dates")) return { dates: [] };
  if (key.startsWith("announcements")) return [];
  return [];
}

function quoteFallback(name, symbol, market) {
  return { name, symbol, market, price: null, change: null, changePercent: null, updatedAt: nowIso() };
}

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      body: options.body,
      headers: {
        "user-agent": "Mozilla/5.0 personal-market-dashboard",
        "accept": "application/json,text/plain,*/*",
        ...options.headers
      },
      signal: AbortSignal.timeout(options.timeout || 8000)
    });
    if (!res.ok) {
      const textValue = await res.text().catch(() => "");
      let payload = null;
      try {
        payload = textValue ? JSON.parse(textValue) : null;
      } catch {
        payload = null;
      }
      const message = clean(payload?.message || payload?.detail?.message || payload?.detail || textValue) || `${res.status} ${res.statusText}`;
      const error = new Error(message);
      error.status = res.status;
      error.payload = payload;
      throw error;
    }
    return res.json();
  } catch (error) {
    if (!options.allowCurlFallback) throw error;
    const textValue = await fetchWithCurl(url, options).catch(() => fetchWithNodeHttps(url, options));
    return JSON.parse(textValue);
  }
}

async function fetchText(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 personal-market-dashboard",
        "accept": "text/html,application/xhtml+xml,*/*",
        ...options.headers
      },
      signal: AbortSignal.timeout(options.timeout || 8000)
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  } catch (error) {
    if (!options.allowCurlFallback) throw error;
    return fetchWithCurl(url, options).catch(() => fetchWithNodeHttps(url, options));
  }
}

async function fetchWithNodeHttps(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(target, {
      method: options.method || "GET",
      timeout: options.timeout || 8000,
      headers: {
        "user-agent": "Mozilla/5.0 personal-market-dashboard",
        "accept": "application/json,text/plain,*/*",
        ...options.headers
      }
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`${res.statusCode} ${res.statusMessage || ""}`.trim()));
      });
    });
    req.on("timeout", () => req.destroy(new Error("请求超时")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function fetchWithCurl(url, options = {}) {
  const args = ["--globoff", "-sL", "--max-time", String(Math.ceil((options.timeout || 8000) / 1000)), "-A", "Mozilla/5.0 personal-market-dashboard"];
  for (const [key, value] of Object.entries(options.headers || {})) {
    args.push("-H", `${key}: ${value}`);
  }
  if (options.method === "POST") {
    args.push("-X", "POST");
    if (options.body) args.push("-d", options.body);
  }
  args.push(url);
  let stdout;
  try {
    ({ stdout } = await execFileAsync("curl", args, { maxBuffer: 1024 * 1024 * 3 }));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("curl 不可用");
    throw new Error(clean(error?.stderr || error?.message || "curl 请求失败").replace(/^Command failed:\s*curl\b[\s\S]*?(?=curl:|\d+\s+\d+|$)/i, "").slice(0, 120) || "curl 请求失败");
  }
  if (!stdout) throw new Error("curl 返回空内容");
  return stdout;
}

async function loadMarketOverview() {
  const quotes = await Promise.allSettled([
    sinaQuote("s_sh000001", "上证指数", "000001.SS", "CN"),
    sinaQuote("gb_ixic", "纳斯达克综合", "^IXIC", "US"),
    sinaQuote("hf_XAU", "国际现货金", "XAU/USD", "GLOBAL"),
    sinaQuote("hf_OIL", "布伦特原油", "BRENT", "GLOBAL"),
    coingeckoBtcQuote().catch(() => sinaQuote("hf_BTC", "BTC/USDT", "BTCUSDT", "CRYPTO")),
    sinaFxQuote("fx_susdcny", "美元/人民币", "USD/CNY")
  ]);
  const data = quotes.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return { ...fallbackFor("market")[index], errorMessage: readableError(result.reason) };
  });
  return data;
}

async function loadAShareAnalysis() {
  const [distribution, turnover] = await Promise.all([
    loadAShareDistribution(),
    loadAShareTurnover()
  ]);
  return {
    ...distribution,
    ...turnover,
    updatedAt: nowIso()
  };
}

async function loadAShareDistribution() {
  const rows = await loadAShareQuoteRows();
  if (!rows.length) throw new Error("A股涨跌分布为空");

  const bins = defaultAShareDistributionBins();
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let totalCount = 0;

  for (const row of rows) {
    const percent = numberOrNull(row.f3);
    if (percent == null) continue;
    totalCount += 1;
    if (percent > 0) upCount += 1;
    else if (percent < 0) downCount += 1;
    else flatCount += 1;

    if (percent >= 9.8) bins[0].count += 1;
    else if (percent >= 7) bins[1].count += 1;
    else if (percent >= 5) bins[2].count += 1;
    else if (percent >= 2) bins[3].count += 1;
    else if (percent > 0) bins[4].count += 1;
    else if (Math.abs(percent) < 0.01) bins[5].count += 1;
    else if (percent > -2) bins[6].count += 1;
    else if (percent > -5) bins[7].count += 1;
    else if (percent > -7) bins[8].count += 1;
    else if (percent > -9.8) bins[9].count += 1;
    else bins[10].count += 1;
  }

  return { totalCount, upCount, downCount, flatCount, bins };
}

async function loadAShareQuoteRows() {
  const pageSize = 100;
  const first = await loadAShareQuotePage(1, pageSize);
  const rows = [...first.rows];
  const total = Number(first.total) || rows.length;
  const pageCount = Math.ceil(total / pageSize);
  if (pageCount <= 1) return rows;
  const pageIndexes = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  const chunks = [];
  for (let index = 0; index < pageIndexes.length; index += 6) {
    const group = pageIndexes.slice(index, index + 6);
    const results = await Promise.all(group.map((page) => loadAShareQuotePage(page, pageSize).catch(() => ({ rows: [] }))));
    chunks.push(...results.flatMap((result) => result.rows));
  }
  return rows.concat(chunks).slice(0, total);
}

async function loadAShareQuotePage(page, pageSize) {
  const raw = await fetchJson(`https://push2delay.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f13,f14,f2,f3,f6`, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  return {
    total: raw?.data?.total,
    rows: Array.isArray(raw?.data?.diff) ? raw.data.diff : []
  };
}

function defaultAShareDistributionBins() {
  return [
    { key: "limitUp", label: "涨停", side: "up", count: 0 },
    { key: "up7", label: ">7%", side: "up", count: 0 },
    { key: "up5", label: "7~5%", side: "up", count: 0 },
    { key: "up2", label: "5~2%", side: "up", count: 0 },
    { key: "up0", label: "2~0%", side: "up", count: 0 },
    { key: "flat", label: "平", side: "flat", count: 0 },
    { key: "down0", label: "0~2%", side: "down", count: 0 },
    { key: "down2", label: "2~5%", side: "down", count: 0 },
    { key: "down5", label: "5~7%", side: "down", count: 0 },
    { key: "down7", label: "7%<", side: "down", count: 0 },
    { key: "limitDown", label: "跌停", side: "down", count: 0 }
  ];
}

async function loadAShareTurnover() {
  const currentRaw = await fetchJson("https://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f5,f6&secids=1.000001,0.399001", {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const currentRows = Array.isArray(currentRaw?.data?.diff) ? currentRaw.data.diff : [];
  const realtimeAmount = currentRows.reduce((sum, row) => sum + (numberOrNull(row.f6) || 0), 0);
  const turnoverPairs = await Promise.all([
    loadIndexTurnoverPair("1.000001").catch(() => null),
    loadIndexTurnoverPair("0.399001").catch(() => null)
  ]);
  const dateParts = chinaDateParts();
  const sessionState = ashareSessionState();
  const latestSnapshot = sessionState === "before-open"
    ? loadLatestMarketSnapshotBefore(dateParts.full)
    : loadLatestMarketSnapshot();
  const snapshotPreviousAmount = loadPreviousMarketSnapshot(dateParts.full);
  const isOutsideSession = sessionState !== "trading";
  const historicalLatestAmount = turnoverPairs.reduce((sum, value) => sum + (value?.latestAmount || 0), 0);
  const historicalPreviousAmount = turnoverPairs.reduce((sum, value) => {
    const previous = isOutsideSession
      ? value?.previousAmount
      : (value?.latestDate === dateParts.full ? value?.previousAmount : value?.latestAmount);
    return sum + (previous || 0);
  }, 0);
  const amount = isOutsideSession && latestSnapshot?.amount
    ? latestSnapshot.amount
    : (isOutsideSession ? (historicalLatestAmount || realtimeAmount) : realtimeAmount);
  const previousAmount = isOutsideSession && latestSnapshot?.snapshotDate
    ? (loadPreviousMarketSnapshot(latestSnapshot.snapshotDate) || historicalPreviousAmount || null)
    : (historicalPreviousAmount || snapshotPreviousAmount || null);
  if (realtimeAmount && !isOutsideSession) saveMarketSnapshot(dateParts.full, realtimeAmount);
  return {
    amount: amount || null,
    previousAmount,
    amountChange: amount && previousAmount ? amount - previousAmount : null
  };
}

function saveMarketSnapshot(snapshotDate, amount) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO market_snapshots (snapshotDate, amount, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(snapshotDate) DO UPDATE SET amount = excluded.amount, updatedAt = excluded.updatedAt
  `).run(snapshotDate, amount, now, now);
}

function loadPreviousMarketSnapshot(today) {
  const row = db.prepare("SELECT amount FROM market_snapshots WHERE snapshotDate < ? ORDER BY snapshotDate DESC LIMIT 1").get(today);
  return numberOrNull(row?.amount);
}

function loadLatestMarketSnapshot(whereSql = "", value) {
  const row = value == null
    ? db.prepare(`SELECT snapshotDate, amount FROM market_snapshots ${whereSql} ORDER BY snapshotDate DESC LIMIT 1`).get()
    : db.prepare(`SELECT snapshotDate, amount FROM market_snapshots ${whereSql} ORDER BY snapshotDate DESC LIMIT 1`).get(value);
  const amount = numberOrNull(row?.amount);
  return row && amount ? { snapshotDate: row.snapshotDate, amount } : null;
}

function loadLatestMarketSnapshotBefore(snapshotDate) {
  return loadLatestMarketSnapshot("WHERE snapshotDate < ?", snapshotDate);
}

function isOutsideAshareTradingSession() {
  return ashareSessionState() !== "trading";
}

function ashareSessionState() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  if (minutes < 9 * 60 + 25) return "before-open";
  if (minutes > 15 * 60 + 10) return "after-close";
  return "trading";
}

function isChinaWeekend(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    weekday: "short"
  }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

async function isAshareTradingDayForDailyReport() {
  if (isChinaWeekend()) return { tradingDay: false, reason: "weekend" };
  const today = chinaDateParts().full;
  try {
    const pair = await loadIndexTurnoverPair("1.000001");
    const latestDate = clean(pair?.latestDate || "");
    return {
      tradingDay: latestDate === today,
      reason: latestDate === today ? "index-daily-match" : `latest-index-date-${latestDate || "empty"}`
    };
  } catch (error) {
    console.warn(`daily report trading-day check failed; fail open: ${readableError(error)}`);
    return { tradingDay: true, reason: "calendar-check-failed-open" };
  }
}

async function loadIndexPreviousTurnover(secid) {
  const pair = await loadIndexTurnoverPair(secid);
  const today = chinaDateParts().full;
  return pair.latestDate === today ? pair.previousAmount : pair.latestAmount;
}

async function loadIndexTurnoverPair(secid) {
  const end = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const begin = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
  const query = `/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=${begin}&end=${end}`;
  const raw = await fetchEastmoneyHistoryJson(query);
  const lines = raw?.data?.klines || [];
  if (!Array.isArray(lines) || !lines.length) return null;
  const latest = String(lines.at(-1)).split(",");
  const previous = lines.length > 1 ? String(lines.at(-2)).split(",") : null;
  return {
    latestDate: clean(latest[0]),
    latestAmount: numberOrNull(latest[6]),
    previousAmount: numberOrNull(previous?.[6])
  };
}

async function fetchEastmoneyHistoryJson(pathValue) {
  const hosts = ["push2delay.eastmoney.com", "28.push2his.eastmoney.com", "53.push2his.eastmoney.com", "push2his.eastmoney.com"];
  let lastError = null;
  for (const host of hosts) {
    try {
      const raw = await fetchJson(`https://${host}${pathValue}`, {
        allowCurlFallback: true,
        timeout: 6000,
        headers: { referer: "https://quote.eastmoney.com/" }
      });
      if (raw?.data?.klines?.length) return raw;
      lastError = new Error(`${host} 历史行情为空`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("历史行情不可用");
}

async function sinaQuote(code, name, symbol, market) {
  const raw = await fetchText(`http://hq.sinajs.cn/list=${code}`, {
    allowCurlFallback: true,
    headers: { referer: "https://finance.sina.com.cn/" }
  });
  const value = raw.match(/="([^"]*)"/)?.[1] || "";
  const parts = value.split(",");
  if (parts.length < 3) throw new Error(`${name} 无行情`);
  if (code.startsWith("s_")) {
    return {
      name,
      symbol,
      market,
      price: numberOrNull(parts[1]),
      change: numberOrNull(parts[2]),
      changePercent: numberOrNull(parts[3]),
      updatedAt: nowIso()
    };
  }
  if (code.startsWith("gb_")) {
    return {
      name,
      symbol,
      market,
      price: numberOrNull(parts[1]),
      change: numberOrNull(parts[4]),
      changePercent: numberOrNull(parts[2]),
      updatedAt: parts[3] ? new Date(parts[3].replace(" ", "T")).toISOString() : nowIso()
    };
  }
  const current = numberOrNull(parts[0]) ?? numberOrNull(parts[3]);
  const previous = numberOrNull(parts[7]) ?? numberOrNull(parts[8]);
  const change = current != null && previous != null ? current - previous : null;
  return {
    name,
    symbol,
    market,
    price: current,
    change,
    changePercent: change != null && previous ? (change / previous) * 100 : null,
    updatedAt: parts[12] && parts[6] ? new Date(`${parts[12]}T${parts[6]}+08:00`).toISOString() : nowIso()
  };
}

async function sinaFxQuote(code, name, symbol) {
  const raw = await fetchText(`http://hq.sinajs.cn/list=${code}`, {
    allowCurlFallback: true,
    headers: { referer: "https://finance.sina.com.cn/" }
  });
  const value = raw.match(/="([^"]*)"/)?.[1] || "";
  const parts = value.split(",");
  if (parts.length < 12) throw new Error(`${name} 无行情`);
  return {
    name,
    symbol,
    market: "FX",
    price: numberOrNull(parts[1]) ?? numberOrNull(parts[2]),
    change: numberOrNull(parts[11]),
    changePercent: numberOrNull(parts[10]),
    updatedAt: parts[17] && parts[0] ? new Date(`${parts[17]}T${parts[0]}+08:00`).toISOString() : nowIso()
  };
}

async function eastmoneyKlineQuote(secid, name, symbol, market) {
  const end = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=20250101&end=${end}`;
  const raw = await fetchJson(url, { allowCurlFallback: true });
  const lines = raw?.data?.klines || [];
  if (!lines.length) throw new Error(`${name} 无行情`);
  const latest = String(lines.at(-1)).split(",");
  const previous = lines.length > 1 ? String(lines.at(-2)).split(",") : null;
  const price = numberOrNull(latest[2]);
  const prevClose = numberOrNull(previous?.[2] ?? raw?.data?.preKPrice);
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePercent = change != null && prevClose ? (change / prevClose) * 100 : null;
  return { name, symbol, market, price, change, changePercent, updatedAt: `${latest[0]}T15:00:00+08:00` };
}

async function loadStockChart(symbolInput, periodInput) {
  const info = await lookupStock(symbolInput);
  const secid = eastmoneySecidFromSymbol(info.symbol, info.market);
  if (!secid) throw new Error("暂不支持该股票图表");
  const period = ["minute", "daily", "weekly", "monthly"].includes(periodInput) ? periodInput : "daily";
  if (period === "minute") return loadStockMinuteChart(secid, info);
  return loadStockKlineChart(secid, info, period);
}

async function loadStockMinuteChart(secid, info) {
  const raw = await fetchJson(`https://push2delay.eastmoney.com/api/qt/stock/trends2/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0&iscca=0&ndays=1`, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const rows = (raw?.data?.trends || []).map((line) => {
    const parts = String(line).split(",");
    return {
      time: clean(parts[0]),
      open: numberOrNull(parts[1]),
      close: numberOrNull(parts[2]),
      high: numberOrNull(parts[3]),
      low: numberOrNull(parts[4]),
      volume: numberOrNull(parts[5]),
      amount: numberOrNull(parts[6]),
      average: numberOrNull(parts[7])
    };
  }).filter((item) => item.time && item.close != null);
  if (!rows.length) throw new Error("分时数据为空");
  return {
    symbol: info.symbol,
    name: clean(raw?.data?.name || info.name),
    market: info.market,
    period: "minute",
    preClose: numberOrNull(raw?.data?.preClose),
    rows
  };
}

async function loadStockKlineChart(secid, info, period) {
  const klt = period === "weekly" ? 102 : period === "monthly" ? 103 : 101;
  const end = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const begin = period === "monthly" ? "20180101" : "20250101";
  const query = `/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=${klt}&fqt=1&beg=${begin}&end=${end}`;
  let name = info.name;
  let lines = [];
  try {
    const raw = await fetchEastmoneyHistoryJson(query);
    name = clean(raw?.data?.name || info.name);
    lines = raw?.data?.klines || [];
  } catch {
    const sinaRows = await loadSinaKlineRows(info.symbol, info.market, period);
    return {
      symbol: info.symbol,
      name: info.name,
      market: info.market,
      period,
      rows: sinaRows.slice(-90)
    };
  }
  const rows = lines.slice(-90).map((line) => {
    const parts = String(line).split(",");
    return {
      time: clean(parts[0]),
      open: numberOrNull(parts[1]),
      close: numberOrNull(parts[2]),
      high: numberOrNull(parts[3]),
      low: numberOrNull(parts[4]),
      volume: numberOrNull(parts[5]),
      amount: numberOrNull(parts[6])
    };
  }).filter((item) => item.time && item.open != null && item.close != null && item.high != null && item.low != null);
  if (!rows.length) throw new Error("K 线数据为空");
  return {
    symbol: info.symbol,
    name,
    market: info.market,
    period,
    rows
  };
}

async function loadSinaKlineRows(symbol, market, period) {
  const sinaSymbol = `${market === "SH" ? "sh" : "sz"}${symbol}`;
  const textValue = await fetchText(`https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_data=/CN_MarketDataService.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=${period === "daily" ? 140 : 900}`, {
    allowCurlFallback: true,
    headers: { referer: "https://finance.sina.com.cn/" }
  });
  const rows = parseSinaJsonpArray(textValue).map((item) => ({
    time: clean(item.day),
    open: numberOrNull(item.open),
    close: numberOrNull(item.close),
    high: numberOrNull(item.high),
    low: numberOrNull(item.low),
    volume: numberOrNull(item.volume),
    amount: null
  })).filter((item) => item.time && item.open != null && item.close != null && item.high != null && item.low != null);
  if (!rows.length) throw new Error("K 线数据为空");
  if (period === "weekly") return aggregateKlineRows(rows, "week");
  if (period === "monthly") return aggregateKlineRows(rows, "month");
  return rows;
}

function parseSinaJsonpArray(textValue) {
  const source = String(textValue || "");
  const match = source.match(/=\s*\(?\s*(\[[\s\S]*?\])\s*\)?\s*;?\s*$/) || source.match(/(\[[\s\S]*\])/);
  if (!match) return [];
  try {
    const rows = JSON.parse(match[1]);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function aggregateKlineRows(rows, unit) {
  const groups = new Map();
  for (const row of rows) {
    const key = unit === "month" ? row.time.slice(0, 7) : weekKey(row.time);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...row, time: unit === "month" ? key : row.time });
      continue;
    }
    existing.close = row.close;
    existing.high = Math.max(existing.high, row.high);
    existing.low = Math.min(existing.low, row.low);
    existing.volume = (existing.volume || 0) + (row.volume || 0);
  }
  return [...groups.values()];
}

function weekKey(value) {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function yahooQuote(symbol, name, market) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const raw = await fetchJson(url);
  const item = raw?.quoteResponse?.result?.[0];
  if (!item) throw new Error(`${symbol} 无行情`);
  return {
    name,
    symbol,
    market,
    price: numberOrNull(item.regularMarketPrice),
    change: numberOrNull(item.regularMarketChange),
    changePercent: numberOrNull(item.regularMarketChangePercent),
    updatedAt: item.regularMarketTime ? new Date(item.regularMarketTime * 1000).toISOString() : nowIso()
  };
}

async function binanceQuote() {
  const raw = await fetchJson("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
  return {
    name: "BTC/USDT",
    symbol: "BTCUSDT",
    market: "CRYPTO",
    price: numberOrNull(raw.lastPrice),
    change: numberOrNull(raw.priceChange),
    changePercent: numberOrNull(raw.priceChangePercent),
    updatedAt: raw.closeTime ? new Date(raw.closeTime).toISOString() : nowIso()
  };
}

async function coingeckoBtcQuote() {
  const raw = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
  const price = numberOrNull(raw?.bitcoin?.usd);
  if (price == null) throw new Error("BTC 无行情");
  return {
    name: "BTC/USDT",
    symbol: "BTCUSDT",
    market: "CRYPTO",
    price,
    change: null,
    changePercent: numberOrNull(raw?.bitcoin?.usd_24h_change),
    updatedAt: nowIso()
  };
}

async function loadJin10(limit) {
  try {
    return await loadJin10TopList(limit);
  } catch {
    return loadJin10FlashFallback(limit);
  }
}

async function loadJin10FlashFallback(limit) {
  const raw = await fetchJson("https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1", {
    headers: {
      referer: "https://www.jin10.com/",
      "x-app-id": "SO1EJGmNgCtmpcPF",
      "x-version": "1.0.0"
    }
  });
  const list = raw?.data || [];
  if (!Array.isArray(list) || !list.length) throw new Error("金十快讯为空");
  const important = list.filter((item) => Number(item.important) > 0);
  const selected = important.length >= limit ? important : list;
  const deduped = uniqueBy(selected.map(normalizeJin10Flash), (item) => item.content || item.title);
  if (!deduped.length) throw new Error("金十公开页面暂未解析到内容");
  return deduped.slice(0, limit);
}

async function loadJin10TopList(limit) {
  if (typeof WebSocket !== "function") throw new Error("当前 Node 版本不支持 WebSocket");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://wss-flash-2.jin10.com/");
    const latestFlashMap = new Map();
    let secret = "";
    let settled = false;
    const timer = setTimeout(() => fail(new Error("金十重要事件 socket 超时")), 10_000);

    function finish(items) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve(items);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      reject(error);
    }

    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", async (event) => {
      try {
        const buffer = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
        if (!secret) {
          const reader = new Jin10BinaryReader(buffer);
          reader.readUint32();
          const first = reader.readUint32();
          const second = reader.readUint32();
          secret = `${second}.${first}`;
          ws.send(jin10Xor(jin10LoginPacket(), secret));
          ws.send(jin10Xor(jin10VoicePacket(), secret));
          return;
        }

        const reader = new Jin10BinaryReader(jin10Xor(buffer, secret));
        const type = reader.readInt16();
        if (type === 1200) {
          const count = reader.readInt32();
          for (let index = 0; index < count; index += 1) {
            const item = JSON.parse(reader.readString());
            latestFlashMap.set(String(item.id), item);
          }
          return;
        }
        if (type !== 1005) return;
        const topItems = JSON.parse(reader.readString());
        if (!Array.isArray(topItems) || !topItems.length) throw new Error("金十重要事件为空");
        finish(topItems.reverse().slice(0, limit).map((item, index) => normalizeJin10TopItem(item, latestFlashMap, index)));
      } catch (error) {
        fail(error);
      }
    });
    ws.addEventListener("error", () => fail(new Error("金十重要事件 socket 连接失败")));
  });
}

function normalizeJin10TopItem(item, latestFlashMap, index) {
  const flashId = String(item.flash_id || item.id || "");
  const flash = latestFlashMap.get(flashId);
  const normalizedFlash = flash ? normalizeJin10Flash(flash) : null;
  const title = cleanHtml(item.title || normalizedFlash?.title || `金十重要事件 ${index + 1}`);
  const time = item.display_time || normalizedFlash?.time || "";
  const content = normalizedFlash?.content && normalizedFlash.content !== normalizedFlash.title
    ? normalizedFlash.content
    : `${title}${time ? `\n\n时间：${time}` : ""}`;
  return {
    id: `jin10-top-${flashId || index}`,
    title,
    time,
    summary: "金十重要事件",
    url: flashId ? `https://flash.jin10.com/detail/${flashId}` : "",
    content,
    source: "金十"
  };
}

function normalizeJin10Flash(item) {
  const content = cleanHtml(item?.data?.content || item?.data?.title || "");
  const bracketTitle = content.match(/^【([^】]+)】/)?.[1] || "";
  const title = cleanHtml(item?.data?.title || bracketTitle || content.slice(0, 90) || "金十快讯");
  const source = cleanHtml(item?.data?.source || "金十");
  return {
    id: `jin10-${item.id}`,
    title,
    time: item.time || "",
    summary: source,
    url: item.id ? `https://flash.jin10.com/detail/${item.id}` : "",
    content: `${content}${source && source !== "金十" ? `\n\n来源：${source}` : ""}${item.time ? `\n时间：${item.time}` : ""}`,
    source: "金十"
  };
}

class Jin10BinaryReader {
  constructor(buffer) {
    this.buffer = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
    this.view = new DataView(this.buffer);
    this.pos = 0;
  }

  readInt16() {
    const value = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return value;
  }

  readUint16() {
    const value = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return value;
  }

  readInt32() {
    const value = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return value;
  }

  readUint32() {
    const value = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return value;
  }

  readString() {
    const length = this.readUint16();
    const value = new TextDecoder().decode(new Uint8Array(this.buffer, this.pos, length));
    this.pos += length;
    return value;
  }
}

class Jin10BinaryWriter {
  constructor(size = 2048) {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
    this.pos = 0;
  }

  writeInt16(value) {
    this.view.setInt16(this.pos, value, true);
    this.pos += 2;
  }

  writeInt32(value) {
    this.view.setInt32(this.pos, value, true);
    this.pos += 4;
  }

  writeString(value) {
    const encoded = new TextEncoder().encode(value || "");
    this.view.setUint16(this.pos, encoded.length, true);
    this.pos += 2;
    this.bytes.set(encoded, this.pos);
    this.pos += encoded.length;
  }

  toBuffer() {
    return this.buffer.slice(0, this.pos);
  }
}

function jin10LoginPacket() {
  const writer = new Jin10BinaryWriter();
  writer.writeInt16(4002);
  writer.writeInt32(0);
  writer.writeString("");
  writer.writeString("chrome");
  writer.writeInt32(0);
  writer.writeString("web");
  return writer.toBuffer();
}

function jin10VoicePacket() {
  const writer = new Jin10BinaryWriter();
  writer.writeInt16(4007);
  writer.writeString("xiaochen");
  return writer.toBuffer();
}

function jin10Xor(buffer, secret) {
  const source = new Uint8Array(buffer);
  const output = new Uint8Array(source.length);
  const offset = secret.charCodeAt(0);
  for (let index = 0; index < source.length; index += 1) {
    output[index] = source[index] ^ secret.charCodeAt((index + offset) % secret.length);
  }
  return output.buffer;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadEastmoneyHotStocks(limit) {
  const raw = await fetchJson("https://emappdata.eastmoney.com/stockrank/getAllCurrentList", {
    method: "POST",
    allowCurlFallback: true,
    body: JSON.stringify({
      appId: "appId01",
      globalId: "786e4c21-70dc-435a-93bb-38",
      marketType: "",
      pageNo: 1,
      pageSize: limit
    }),
    headers: { "content-type": "application/json" }
  });
  const list = raw?.data || [];
  if (!Array.isArray(list) || !list.length) throw new Error("热度榜为空");
  const rows = list.slice(0, limit).map((item, index) => ({
    rank: item.rk || index + 1,
    symbol: normalizeEastmoneyRankSymbol(item.sc),
    market: normalizeEastmoneyRankMarket(item.sc)
  }));
  const quoteMap = await loadSinaStockQuotes(rows).catch(() => new Map());
  return Promise.all(rows.map(async (row) => {
    const symbol = row.symbol;
    const info = await lookupStock(symbol).catch(() => ({ symbol, name: symbol, market: inferMarket(symbol) }));
    const quote = quoteMap.get(symbol) || {};
    const tags = await loadEastmoneyConceptTags(symbol, row.market).catch(() => []);
    return {
      rank: row.rank,
      name: info.name,
      symbol: info.symbol,
      market: row.market || info.market,
      price: quote.price ?? null,
      change: quote.change ?? null,
      changePercent: quote.changePercent ?? null,
      tags,
      source: "东财热股"
    };
  }));
}

async function loadSinaStockQuotes(rows) {
  const codes = rows.map((row) => `${row.market === "SH" ? "sh" : "sz"}${row.symbol}`);
  const textValue = await fetchText(`http://hq.sinajs.cn/list=${codes.join(",")}`, {
    allowCurlFallback: true,
    headers: { referer: "https://finance.sina.com.cn" }
  });
  const quoteMap = new Map();
  for (const row of rows) {
    const sinaCode = `${row.market === "SH" ? "sh" : "sz"}${row.symbol}`;
    const match = textValue.match(new RegExp(`var hq_str_${sinaCode}="([^"]*)"`));
    if (!match) continue;
    const parts = match[1].split(",");
    const previousClose = numberOrNull(parts[2]);
    const price = numberOrNull(parts[3]);
    const change = price != null && previousClose ? price - previousClose : null;
    const changePercent = change != null && previousClose ? (change / previousClose) * 100 : null;
    quoteMap.set(row.symbol, { price, change, changePercent });
  }
  return quoteMap;
}

async function loadStockRealtimeQuote(symbolInput) {
  const info = await lookupStock(symbolInput);
  if (!["SH", "SZ"].includes(info.market)) {
    throw new Error("暂只支持 A 股实时详情");
  }
  const secid = `${info.market === "SH" ? "1" : "0"}.${info.symbol}`;
  const raw = await fetchJson(`https://push2delay.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&secid=${encodeURIComponent(secid)}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f116,f117,f162,f168,f169,f170,f152`, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const data = raw?.data || {};
  const priceValue = (value) => {
    const number = numberOrNull(value);
    if (number == null || number < -100000) return null;
    return number;
  };
  const price = priceValue(data.f43);
  const previousClose = priceValue(data.f60);
  const change = priceValue(data.f169) ?? (price != null && previousClose != null ? price - previousClose : null);
  return {
    symbol: info.symbol,
    name: clean(data.f58 || info.name),
    market: info.market,
    price,
    change,
    changePercent: numberOrNull(data.f170),
    open: priceValue(data.f46),
    high: priceValue(data.f44),
    low: priceValue(data.f45),
    previousClose,
    volume: numberOrNull(data.f47),
    amount: numberOrNull(data.f48),
    turnoverRate: numberOrNull(data.f168),
    totalMarketValue: numberOrNull(data.f116),
    circulatingMarketValue: numberOrNull(data.f117),
    peDynamic: numberOrNull(data.f162),
    updatedAt: nowIso(),
    source: "东方财富实时行情"
  };
}

async function loadEastmoneyConceptTags(symbol, market) {
  const code = `${market}${symbol}`;
  const raw = await fetchJson(`https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax?code=${code}`, {
    headers: { referer: "https://emweb.securities.eastmoney.com/" }
  });
  const boards = Array.isArray(raw?.ssbk) ? raw.ssbk : [];
  const eventTags = boards
    .map((item) => clean(item.BOARD_NAME))
    .filter((name) => /今日|首板|连板|涨停/.test(name))
    .filter((name) => !/含一字/.test(name));
  const momentumTags = boards
    .map((item) => clean(item.BOARD_NAME))
    .filter((name) => /高振幅|新高/.test(name));
  const conceptTags = boards
    .filter((item) => String(item.IS_PRECISE) === "1")
    .map((item) => clean(item.BOARD_NAME));
  const fallbackTags = boards
    .map((item) => clean(item.BOARD_NAME))
    .filter((name) => name && !/东方财富热股|题材股|趋势股|大盘股|中盘股|小盘股/.test(name));
  return uniqueBy([...eventTags.slice(0, 2), ...conceptTags, ...momentumTags, ...fallbackTags], (name) => name)
    .filter(Boolean)
    .slice(0, 5);
}

async function loadEastmoneyHotSectors(limit) {
  const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3,f4,f8,f104,f105,f128,f140`;
  const raw = await fetchJson(url, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const list = raw?.data?.diff || [];
  if (!Array.isArray(list) || !list.length) throw new Error("热门板块为空");
  return list.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    code: clean(item.f12 || ""),
    name: clean(item.f14 || item.f12 || ""),
    price: numberOrNull(item.f2),
    changePercent: numberOrNull(item.f3),
    change: numberOrNull(item.f4),
    turnoverRate: numberOrNull(item.f8),
    upCount: numberOrNull(item.f104),
    downCount: numberOrNull(item.f105),
    leadStock: clean(item.f128 || ""),
    leadStockCode: clean(item.f140 || ""),
    source: "东财板块"
  }));
}

async function loadEastmoneyMainlines(limit = 30) {
  const pageSize = Math.max(30, Math.min(80, Number(limit) * 2 || 60));
  const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3,f4,f62,f104,f105,f128,f140`;
  const raw = await fetchJson(url, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const list = raw?.data?.diff || [];
  if (!Array.isArray(list) || !list.length) throw new Error("主线数据为空");
  const candidates = list
    .map((item) => ({
      code: clean(item.f12 || "").toUpperCase(),
      name: clean(item.f14 || item.f12 || ""),
      pct: numberOrNull(item.f3),
      change: numberOrNull(item.f4),
      mainFlow: numberOrNull(item.f62) == null ? null : numberOrNull(item.f62) / 100000000,
      upCount: numberOrNull(item.f104),
      downCount: numberOrNull(item.f105),
      leadStock: clean(item.f128 || ""),
      leadStockCode: clean(item.f140 || "")
    }))
    .filter((item) => /^BK\d{4}$/.test(item.code) && item.name);
  if (!candidates.length) throw new Error("主线数据为空");
  const flowValues = candidates.map((item) => item.mainFlow).filter((value) => value != null);
  const minFlow = Math.min(0, ...flowValues);
  const maxFlow = Math.max(0, ...flowValues);
  const flowRange = Math.max(1, maxFlow - minFlow);
  const scoreRows = candidates.map((item) => {
    const pctNorm = clampNumber(((numberOrNull(item.pct) ?? 0) + 5) / 15, 0, 1);
    const flowNorm = item.mainFlow == null ? 0.35 : clampNumber((item.mainFlow - minFlow) / flowRange, 0, 1);
    const total = (item.upCount || 0) + (item.downCount || 0);
    const breadthNorm = total > 0 ? clampNumber((item.upCount || 0) / total, 0, 1) : 0.5;
    const score = pctNorm * 45 + flowNorm * 35 + breadthNorm * 20;
    return {
      ...item,
      score: Number(score.toFixed(2)),
      source: "东方财富概念主线"
    };
  });
  return scoreRows
    .sort((a, b) => b.score - a.score || (numberOrNull(b.pct) ?? -Infinity) - (numberOrNull(a.pct) ?? -Infinity))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

async function loadEastmoneySectorStocks(code, limit) {
  const sectorCode = clean(code).toUpperCase();
  if (!/^BK\d{4}$/.test(sectorCode)) throw new Error("板块代码不正确");
  const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f12,f13,f14,f2,f3,f4,f5,f6`;
  const raw = await fetchJson(url, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const list = raw?.data?.diff || [];
  if (!Array.isArray(list) || !list.length) throw new Error("该板块暂无相关股票");
  return list.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    symbol: clean(item.f12 || ""),
    name: clean(item.f14 || item.f12 || ""),
    market: Number(item.f13) === 1 ? "SH" : "SZ",
    price: numberOrNull(item.f2),
    changePercent: numberOrNull(item.f3),
    change: numberOrNull(item.f4),
    volume: numberOrNull(item.f5),
    amount: numberOrNull(item.f6),
    source: "东财板块成分股"
  }));
}

async function loadSectorCatalog() {
  const cachedRows = db.prepare("SELECT code, name, category, updatedAt FROM sector_catalog ORDER BY code").all();
  const latest = cachedRows.reduce((max, row) => Math.max(max, Date.parse(row.updatedAt) || 0), 0);
  if (cachedRows.length >= 20 && Date.now() - latest < 24 * 60 * 60 * 1000) {
    return orderSectorCatalog(await mergeFeaturedSectors(cachedRows));
  }
  try {
    const pageSize = Math.max(30, Math.min(500, SECTOR_CATALOG_LIMIT));
    const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14`;
    const raw = JSON.parse(await fetchWithNodeHttps(url, {
      timeout: 8000,
      headers: { referer: "https://quote.eastmoney.com/" }
    }));
    const rows = uniqueBy([
      ...SECTOR_PINNED_ROWS.map((item) => ({ ...item, category: "concept", updatedAt: nowIso() })),
      ...(raw?.data?.diff || [])
      .map((item) => ({
        code: clean(item.f12 || "").toUpperCase(),
        name: clean(item.f14 || item.f12 || ""),
        category: "concept",
        updatedAt: nowIso()
      }))
    ], (item) => item.code).filter((item) => /^BK\d{4}$/.test(item.code) && item.name);
    if (!rows.length) throw new Error("板块目录为空");
    const stmt = db.prepare("INSERT OR REPLACE INTO sector_catalog (code, name, category, updatedAt) VALUES (?, ?, ?, ?)");
    for (const row of rows) stmt.run(row.code, row.name, row.category, row.updatedAt);
    return orderSectorCatalog(await mergeFeaturedSectors(rows));
  } catch (error) {
    if (cachedRows.length) return orderSectorCatalog(await mergeFeaturedSectors(cachedRows));
    throw error;
  }
}

async function mergeFeaturedSectors(rows) {
  const baseRows = uniqueBy([
    ...SECTOR_PINNED_ROWS.map((item) => ({ ...item, category: "concept", updatedAt: nowIso() })),
    ...(rows || [])
  ], (item) => item.code);
  const resolvedRows = await resolveFeaturedSectorRows(baseRows).catch(() => []);
  return uniqueBy([...resolvedRows, ...baseRows], (item) => item.code);
}

async function resolveFeaturedSectorRows(existingRows) {
  const existing = new Map((existingRows || []).map((row) => [clean(row.name), row]));
  const resolved = [];
  for (const name of SECTOR_FEATURED_SEARCH_NAMES) {
    const direct = existing.get(name) || (existingRows || []).find((row) => clean(row.name).includes(name) || name.includes(clean(row.name)));
    if (direct) {
      resolved.push({ ...direct, featured: 1 });
      continue;
    }
    const row = await searchEastmoneySector(name).catch(() => null);
    if (!row) continue;
    resolved.push(row);
    db.prepare("INSERT OR REPLACE INTO sector_catalog (code, name, category, updatedAt) VALUES (?, ?, ?, ?)")
      .run(row.code, row.name, row.category, row.updatedAt);
  }
  return resolved;
}

async function searchEastmoneySector(queryInput) {
  const query = clean(queryInput);
  if (!query) return null;
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}&type=14&token=44c9d251add88e27b65ed86506f6e5da`;
  const raw = await fetchJson(url, {
    allowCurlFallback: true,
    headers: { referer: "https://www.eastmoney.com/" }
  });
  const rows = raw?.QuotationCodeTable?.Data || [];
  const match = (Array.isArray(rows) ? rows : []).find((row) => /^BK\d{4}$/i.test(clean(row.Code || row.UnifiedCode || "")));
  if (!match) return null;
  return {
    code: clean(match.Code || match.UnifiedCode || "").toUpperCase(),
    name: clean(match.Name || query),
    category: "concept",
    featured: 1,
    updatedAt: nowIso()
  };
}

function orderSectorCatalog(rows) {
  return [...rows].sort((a, b) => sectorFeaturedScore(a) - sectorFeaturedScore(b) || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function sectorFeaturedScore(row) {
  if (Number(row?.featured || 0) > 0) return 0;
  const name = clean(row?.name);
  const searchIndex = SECTOR_FEATURED_SEARCH_NAMES.findIndex((word) => sectorNameMatches(name, word));
  if (searchIndex >= 0) return searchIndex;
  const keywordIndex = SECTOR_FEATURED_NAMES.findIndex((word) => sectorNameMatches(name, word));
  return keywordIndex < 0 ? 1000 : SECTOR_FEATURED_SEARCH_NAMES.length + keywordIndex;
}

function sectorNameMatches(nameInput, keywordInput) {
  const name = clean(nameInput).toUpperCase();
  const keyword = clean(keywordInput).toUpperCase();
  if (!name || !keyword) return false;
  return name.includes(keyword) || keyword.includes(name);
}

function sectorFlowUniverse(catalog) {
  const featured = catalog.filter((row) => sectorFeaturedScore(row) < 1000);
  const rows = uniqueBy([...featured, ...catalog], (row) => row.code);
  return rows.slice(0, Math.max(8, Math.min(80, SECTOR_FLOW_LIMIT)));
}

async function loadSectorDailyBars(codeInput, days = 180) {
  const code = clean(codeInput).toUpperCase();
  if (!/^BK\d{4}$/.test(code)) throw new Error("板块代码不正确");
  const cachedRows = db.prepare("SELECT * FROM sector_daily_bars WHERE code = ? ORDER BY tradeDate").all(code);
  const latest = cachedRows.at(-1);
  if (latest && Date.now() - (Date.parse(latest.updatedAt) || 0) < 10 * 60 * 1000 && cachedRows.length >= Math.min(days, 60)) {
    return cachedRows.slice(-days);
  }
  const end = chinaDateKey().replaceAll("-", "");
  const beginDate = new Date(Date.now() - Math.max(days + 40, 220) * 24 * 60 * 60 * 1000);
  const begin = chinaDateKey(beginDate).replaceAll("-", "");
  try {
    const raw = await fetchSectorHistoryJson(sectorDailyKlinePath(code, begin, end));
    const rows = (raw?.data?.klines || []).map((line) => parseSectorDailyBar(code, line)).filter(Boolean);
    if (!rows.length) throw new Error(`${code} 板块日 K 为空`);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sector_daily_bars (code, tradeDate, open, close, high, low, volume, amount, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) stmt.run(row.code, row.tradeDate, row.open, row.close, row.high, row.low, row.volume, row.amount, nowIso());
    return rows.slice(-days);
  } catch (error) {
    if (cachedRows.length) return cachedRows.slice(-days);
    throw error;
  }
}

function sectorDailyKlinePath(code, begin, end) {
  return sectorFullscreenKlinePath(code, 101, begin, end);
}

function sectorFullscreenKlinePath(code, klt, begin, end) {
  if (isBrokerSectorCode(code)) {
    return eastmoneyFullscreenKlinePath(`90.${code}`, klt, {
      beg: 0,
      end: 20500101,
      fqt: 1,
      smplmt: 1_000_000,
      lmt: 1_000_000
    });
  }
  return eastmoneyFullscreenKlinePath(`90.${code}`, klt, { beg: begin, end, fqt: 1 });
}

function isBrokerSectorCode(code) {
  return clean(code).toUpperCase() === "BK0711";
}

function eastmoneyFullscreenKlinePath(secid, klt = 101, options = {}) {
  const params = new URLSearchParams({
    secid,
    ut: "fa5fd1943c7b386f172d6893dbfba10b",
    fields1: EASTMONEY_KLINE_FIELDS1,
    fields2: EASTMONEY_KLINE_FIELDS2,
    klt: String(klt),
    fqt: String(options.fqt ?? 1),
    beg: String(options.beg ?? 0),
    end: String(options.end ?? 20500101)
  });
  if (options.smplmt != null) params.set("smplmt", String(options.smplmt));
  if (options.lmt != null) params.set("lmt", String(options.lmt));
  return `/api/qt/stock/kline/get?${params.toString()}`;
}

async function fetchSectorHistoryJson(pathValue) {
  if (pathValue.includes("secid=90.BK0711")) return fetchBrokerSectorHistoryJson();
  const hosts = ["push2his.eastmoney.com", "push2delay.eastmoney.com", "28.push2his.eastmoney.com", "53.push2his.eastmoney.com"];
  let lastError = null;
  for (const host of hosts) {
    try {
      const textValue = await fetchText(`https://${host}${pathValue}`, {
        timeout: 8000,
        allowCurlFallback: true,
        headers: { referer: "https://quote.eastmoney.com/bk/90.BK0711.html" }
      });
      const raw = parseMaybeJsonp(textValue);
      if (raw?.data?.klines?.length) return raw;
      lastError = new Error(`${host} 板块历史行情为空`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("板块历史行情不可用");
}

async function fetchBrokerSectorHistoryJson() {
  const candidates = brokerSectorKlineCandidates();
  const diagnostics = [];
  for (const candidate of candidates) {
    try {
      const textValue = await fetchText(candidate.url, {
        timeout: candidate.timeout || 8000,
        allowCurlFallback: true,
        headers: {
          referer: candidate.referer || "https://quote.eastmoney.com/basic/full.html?mcid=90.BK0711&type=r",
          accept: candidate.accept || "application/javascript,application/json,text/plain,*/*"
        }
      });
      const raw = parseMaybeJsonp(textValue);
      const klines = raw?.data?.klines || [];
      diagnostics.push({
        name: candidate.name,
        count: klines.length,
        first: klines[0] || "",
        last: klines.at(-1) || ""
      });
      if (klines.length >= 120) return raw;
    } catch (error) {
      diagnostics.push({ name: candidate.name, error: readableError(error) });
    }
  }
  const error = new Error(`BK0711 历史K线暂不可用：${diagnostics.map((item) => `${item.name}=${item.error || `${item.count}根`}`).join("；")}`);
  error.diagnostics = diagnostics;
  console.warn("BK0711 kline diagnostics:", JSON.stringify(diagnostics));
  throw error;
}

function brokerSectorKlineCandidates() {
  const baseParams = {
    secid: "90.BK0711",
    ut: "fa5fd1943c7b386f172d6893dbfba10b",
    fields1: EASTMONEY_KLINE_FIELDS1,
    fields2: EASTMONEY_KLINE_FIELDS2,
    klt: "101",
    beg: "0",
    end: "20500101",
    smplmt: "1000000",
    lmt: "1000000"
  };
  const hosts = ["push2his.eastmoney.com", "push2delay.eastmoney.com", "28.push2his.eastmoney.com", "53.push2his.eastmoney.com", "87.push2his.eastmoney.com"];
  const candidates = [];
  for (const host of hosts) {
    for (const fqt of ["0", "1"]) {
      candidates.push({
        name: `${host} fqt=${fqt}`,
        url: eastmoneyKlineCandidateUrl(host, { ...baseParams, fqt })
      });
    }
    candidates.push({
      name: `${host} lastcount`,
      url: eastmoneyKlineCandidateUrl(host, {
        secid: "90.BK0711",
        ut: baseParams.ut,
        fields1: baseParams.fields1,
        fields2: baseParams.fields2,
        klt: "101",
        fqt: "1",
        lmt: "260"
      })
    });
    candidates.push({
      name: `${host} jsonp`,
      url: eastmoneyKlineCandidateUrl(host, { cb: `jQuery${Date.now()}`, ...baseParams, fqt: "1" })
    });
  }
  candidates.push({
    name: "mobile quote kline",
    url: eastmoneyKlineCandidateUrl("push2.eastmoney.com", { ...baseParams, fqt: "1" }),
    referer: "https://wap.eastmoney.com/"
  });
  return candidates;
}

function eastmoneyKlineCandidateUrl(host, paramsObject) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(paramsObject)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  return `https://${host}/api/qt/stock/kline/get?${params.toString()}`;
}

function parseMaybeJsonp(textValue) {
  const text = String(textValue || "").trim();
  if (!text) throw new Error("接口返回空内容");
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("(");
    const end = text.lastIndexOf(")");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start + 1, end));
    throw error;
  }
}

function parseSectorDailyBar(code, line) {
  const parts = String(line || "").split(",");
  if (parts.length < 7) return null;
  return {
    code,
    tradeDate: parts[0],
    open: numberOrNull(parts[1]),
    close: numberOrNull(parts[2]),
    high: numberOrNull(parts[3]),
    low: numberOrNull(parts[4]),
    volume: numberOrNull(parts[5]),
    amount: numberOrNull(parts[6])
  };
}

async function loadSectorRankingDates() {
  try {
    return await loadSignanaSectorRankingDates();
  } catch (error) {
    console.warn("complete sector ranking dates unavailable, falling back to local source:", readableError(error));
  }
  try {
    const rows = await loadSectorDailyBars("BK1136", 60);
    return rows.map((row) => row.tradeDate).filter(Boolean).reverse().slice(0, 30);
  } catch (error) {
    sectorHistoryDisabledUntil = Date.now() + 10 * 60 * 1000;
    console.warn("sector daily history unavailable, falling back to latest flow date:", readableError(error));
    return [await loadLatestSectorFlowDate().catch(() => chinaDateKey())];
  }
}

async function loadSectorRanking(dateInput = "latest") {
  const dates = await loadSectorRankingDates();
  const targetDate = normalizeSectorDate(dateInput, dates);
  const signanaRanking = await loadSignanaSectorRanking(targetDate).catch((error) => {
    console.warn("complete sector ranking unavailable, falling back to local source:", readableError(error));
    return null;
  });
  if (signanaRanking) return signanaRanking;
  if (Date.now() < sectorHistoryDisabledUntil) {
    return loadSectorRealtimeRanking(targetDate);
  }
  const catalog = await loadSectorCatalog();
  const selectedCatalog = catalog.slice(0, Math.max(20, Math.min(SECTOR_CATALOG_LIMIT, 160)));
  const rows = await mapWithConcurrency(selectedCatalog, 8, async (sector, index) => {
    const bars = await loadSectorDailyBars(sector.code, 180);
    return buildSectorRankingRow(sector, bars, targetDate, index);
  });
  const validRows = rows.filter(Boolean);
  if (!validRows.length) return loadSectorRealtimeRanking(targetDate);
  return {
    date: targetDate,
    updated_at: chinaTimeLabel(),
    rows: validRows.sort((a, b) => (numberOrNull(b.pct_1d) ?? -Infinity) - (numberOrNull(a.pct_1d) ?? -Infinity))
  };
}

async function loadSignanaSectorRankingDates() {
  const raw = JSON.parse(await fetchWithNodeHttps(`${SIGNANA_BASE_URL}/api/sector-ranking/dates`, {
    timeout: 8000,
    headers: { referer: `${SIGNANA_BASE_URL}/sector-ranking` }
  }));
  const dates = Array.isArray(raw?.dates) ? raw.dates : [];
  if (!dates.length) throw new Error("完整板块涨跌幅日期为空");
  return dates.map(clean).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 30);
}

async function loadSignanaSectorRanking(dateInput = "latest") {
  const date = clean(dateInput || "latest");
  const raw = JSON.parse(await fetchWithNodeHttps(`${SIGNANA_BASE_URL}/api/sector-ranking?date=${encodeURIComponent(date || "latest")}`, {
    timeout: 10000,
    headers: { referer: `${SIGNANA_BASE_URL}/sector-ranking` }
  }));
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  if (!rows.length) throw new Error("完整板块涨跌幅为空");
  const normalizedRows = rows.map((row, index) => normalizeSectorRankingRow(row, index)).filter(Boolean);
  const mergedRows = await mergePinnedSectorRankingRows(normalizedRows, clean(raw.date || date));
  return {
    date: clean(raw.date || date),
    updated_at: clean(raw.updated_at || chinaTimeLabel()),
    source: "完整板块涨跌幅",
    rows: mergedRows
  };
}

async function mergePinnedSectorRankingRows(rows, targetDate) {
  const currentRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const existingCodes = new Set(currentRows.map((row) => clean(row.code).toUpperCase()));
  const missingPinned = SECTOR_PINNED_ROWS.filter((row) => !existingCodes.has(clean(row.code).toUpperCase()));
  if (!missingPinned.length) return currentRows;
  const additions = await mapWithConcurrency(missingPinned, 3, async (sector, index) => {
    const sourceRank = currentRows.length + index;
    try {
      const bars = await loadSectorDailyBars(sector.code, 180);
      return buildSectorRankingRow(sector, bars, targetDate, sourceRank);
    } catch (error) {
      return loadSectorRealtimeRankingRow(sector, sourceRank, error);
    }
  });
  return uniqueBy([...currentRows, ...additions.filter(Boolean)], (row) => row.code)
    .sort((a, b) => (numberOrNull(b.pct_1d) ?? -Infinity) - (numberOrNull(a.pct_1d) ?? -Infinity))
    .map((row, index) => ({ ...row, source_rank: index + 1 }));
}

async function loadSectorRealtimeRankingRow(sector, sourceRank = 0, historyError = null) {
  const code = clean(sector?.code).toUpperCase();
  if (!/^BK\d{4}$/.test(code)) return null;
  const historyErrorMessage = sectorHistoryErrorMessage(code, historyError);
  const fields = "f12,f14,f2,f3,f109,f160";
  const listRaw = await fetchJson(`https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=${fields}`, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  }).catch(() => null);
  const item = (listRaw?.data?.diff || []).find((row) => clean(row.f12).toUpperCase() === code);
  if (item) {
    return {
      code,
      name: clean(sector?.name || item.f14 || code),
      source_rank: sourceRank + 1,
      close: numberOrNull(item.f2),
      pct_1d: numberOrNull(item.f3),
      pct_5d: numberOrNull(item.f109),
      pct_10d: numberOrNull(item.f160),
      pct_20d: null,
      pct_60d: null,
      pct_120d: null,
      vs_ma5_pct: null,
      vs_ma10_pct: null,
      vs_ma20_pct: null,
      sharpe: null,
      is_partial: 1,
      history_error: historyErrorMessage,
      trend_30d: []
    };
  }
  const raw = await fetchJson(`https://push2delay.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&secid=90.${code}&fields=f43,f57,f58,f109,f160,f170`, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const data = raw?.data || {};
  return {
    code,
    name: clean(sector?.name || data.f58 || code),
    source_rank: sourceRank + 1,
    close: numberOrNull(data.f43),
    pct_1d: numberOrNull(data.f170),
    pct_5d: numberOrNull(data.f109),
    pct_10d: numberOrNull(data.f160),
    pct_20d: null,
    pct_60d: null,
    pct_120d: null,
    vs_ma5_pct: null,
    vs_ma10_pct: null,
    vs_ma20_pct: null,
    sharpe: null,
    is_partial: 1,
    history_error: historyErrorMessage,
    trend_30d: []
  };
}

function sectorHistoryErrorMessage(code, error = null) {
  if (!isBrokerSectorCode(code)) return "";
  if (!error) return "BK0711 历史K线暂不可用";
  return readableError(error);
}

function normalizeSectorRankingRow(row, index = 0) {
  const code = clean(row?.code || "");
  const name = clean(row?.name || code);
  if (!code || !name) return null;
  const trend = Array.isArray(row.trend_30d) ? row.trend_30d.map(numberOrNull).filter((value) => value != null) : [];
  return {
    code,
    name,
    source_rank: Number.isFinite(Number(row.source_rank)) ? Number(row.source_rank) : index + 1,
    close: numberOrNull(row.close),
    pct_1d: numberOrNull(row.pct_1d),
    pct_5d: numberOrNull(row.pct_5d),
    pct_10d: numberOrNull(row.pct_10d),
    pct_20d: numberOrNull(row.pct_20d),
    pct_60d: numberOrNull(row.pct_60d),
    pct_120d: numberOrNull(row.pct_120d),
    vs_ma5_pct: numberOrNull(row.vs_ma5_pct),
    vs_ma10_pct: numberOrNull(row.vs_ma10_pct),
    vs_ma20_pct: numberOrNull(row.vs_ma20_pct),
    sharpe: numberOrNull(row.sharpe),
    is_partial: Number(row.is_partial || 0),
    history_error: clean(row.history_error || ""),
    trend_30d: trend
  };
}

async function loadSectorRealtimeRanking(targetDate) {
  const pageSize = Math.max(30, Math.min(500, SECTOR_CATALOG_LIMIT));
  const raw = JSON.parse(await fetchWithNodeHttps(`https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3`, {
    timeout: 8000,
    headers: { referer: "https://quote.eastmoney.com/" }
  }));
  const rows = uniqueBy([
    ...SECTOR_PINNED_ROWS.map((item) => ({ f12: item.code, f14: item.name })),
    ...(raw?.data?.diff || [])
  ], (item) => item.f12)
    .map((item, index) => ({
      code: clean(item.f12 || "").toUpperCase(),
      name: clean(item.f14 || item.f12 || ""),
      source_rank: index + 1,
      close: numberOrNull(item.f2),
      pct_1d: numberOrNull(item.f3),
      pct_5d: null,
      pct_10d: null,
      pct_20d: null,
      pct_60d: null,
      pct_120d: null,
      vs_ma5_pct: null,
      vs_ma10_pct: null,
      vs_ma20_pct: null,
      sharpe: null,
      is_partial: 1,
      history_error: sectorHistoryErrorMessage(item.f12),
      trend_30d: numberOrNull(item.f2) == null ? [] : [numberOrNull(item.f2)]
    }))
    .filter((item) => /^BK\d{4}$/.test(item.code) && item.name);
  return {
    date: targetDate,
    updated_at: chinaTimeLabel(),
    rows: rows.sort((a, b) => (numberOrNull(b.pct_1d) ?? -Infinity) - (numberOrNull(a.pct_1d) ?? -Infinity))
  };
}

function normalizeSectorDate(dateInput, dates) {
  const value = clean(dateInput || "latest");
  if (!value || value === "latest") return dates[0] || chinaDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式不正确");
  return value;
}

function buildSectorRankingRow(sector, bars, targetDate, sourceRank = 0) {
  const index = bars.findIndex((row) => row.tradeDate === targetDate);
  if (index < 0) return null;
  const bar = bars[index];
  const close = numberOrNull(bar.close);
  if (close == null) return null;
  const pctFor = (days) => {
    const previous = bars[index - days]?.close;
    return previous ? ((close / previous) - 1) * 100 : null;
  };
  const maPct = (days) => {
    const slice = bars.slice(Math.max(0, index - days + 1), index + 1).map((row) => numberOrNull(row.close)).filter((value) => value != null);
    if (slice.length < days) return null;
    const ma = sumNumbers(slice) / slice.length;
    return ma ? ((close / ma) - 1) * 100 : null;
  };
  const trend = bars.slice(Math.max(0, index - 29), index + 1).map((row) => numberOrNull(row.close)).filter((value) => value != null);
  const historyError = isBrokerSectorCode(sector.code) && bars.length < 120 ? `BK0711 历史K线不足：仅 ${bars.length} 根` : "";
  return {
    code: sector.code,
    name: sector.name,
    source_rank: sourceRank + 1,
    close,
    pct_1d: pctFor(1),
    pct_5d: pctFor(5),
    pct_10d: pctFor(10),
    pct_20d: pctFor(20),
    pct_60d: pctFor(60),
    pct_120d: pctFor(120),
    vs_ma5_pct: maPct(5),
    vs_ma10_pct: maPct(10),
    vs_ma20_pct: maPct(20),
    sharpe: sectorSharpe(bars.slice(Math.max(0, index - 30), index + 1)),
    is_partial: 0,
    history_error: historyError,
    trend_30d: trend
  };
}

function sectorSharpe(bars) {
  const returns = [];
  for (let index = 1; index < bars.length; index += 1) {
    const previous = numberOrNull(bars[index - 1]?.close);
    const current = numberOrNull(bars[index]?.close);
    if (previous && current != null) returns.push((current / previous) - 1);
  }
  if (returns.length < 12) return null;
  const mean = sumNumbers(returns) / returns.length;
  const variance = sumNumbers(returns.map((value) => (value - mean) ** 2)) / Math.max(1, returns.length - 1);
  const stdev = Math.sqrt(variance);
  return stdev ? (mean / stdev) * Math.sqrt(252) : null;
}

async function loadSectorFlowDates() {
  const cachedDates = db.prepare("SELECT DISTINCT tradeDate FROM sector_flow_minutes ORDER BY tradeDate DESC LIMIT 20").all().map((row) => row.tradeDate);
  const latestFlowDate = await loadLatestSectorFlowDate().catch(() => "");
  const rankingDates = await loadSectorRankingDates().catch(() => []);
  return uniqueBy([latestFlowDate, rankingDates[0], ...cachedDates].filter(Boolean).map((date) => ({ date })), (row) => row.date)
    .map((row) => row.date)
    .sort((a, b) => b.localeCompare(a));
}

async function loadLatestSectorFlowDate() {
  const raw = JSON.parse(await fetchWithNodeHttps("https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=5&klt=1&secid=90.BK1136&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56", {
    timeout: 8000,
    headers: { referer: "https://quote.eastmoney.com/" }
  }));
  const latest = raw?.data?.klines?.at?.(-1);
  const date = clean(String(latest || "").split(/[ ,]/)[0]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("板块资金流日期不可用");
  return date;
}

async function loadSectorFlowSeries(dateInput = "latest") {
  const dates = await loadSectorFlowDates();
  const targetDate = normalizeSectorDate(dateInput, dates);
  const sectors = await loadSectorFlowRankingUniverse(targetDate);
  const rows = await mapWithConcurrency(sectors, 6, async (sector) => {
    const minutes = await loadSectorFlowMinutes(sector.code, targetDate);
    return buildSectorFlowSeries(sector, minutes);
  });
  const series = applySectorFlowColors(rows.filter(Boolean))
    .sort((a, b) => (numberOrNull(a.source_rank) ?? Infinity) - (numberOrNull(b.source_rank) ?? Infinity));
  const lastSessionMin = Math.max(0, ...series.flatMap((item) => item.data.map((value, index) => value == null ? -1 : index)));
  return {
    trade_date: targetDate,
    title: "资金实时分时流向",
    session_minutes: 240,
    last_session_min: Math.min(239, lastSessionMin),
    ticks: [
      { value: 0, label: "9:30" },
      { value: 60, label: "10:30" },
      { value: 119, label: "11:30" },
      { value: 180, label: "14:00" },
      { value: 239, label: "15:00" }
    ],
    series
  };
}

async function loadSectorFlowRankingUniverse(targetDate) {
  const ranking = await loadSignanaSectorRanking(targetDate).catch(async () => {
    const fallback = await loadSectorRanking(targetDate).catch(() => null);
    return fallback?.rows?.length ? fallback : null;
  });
  const rows = (ranking?.rows || []).filter((row) => /^BK\d{4}$/.test(clean(row.code)));
  if (rows.length) {
    const existingCodes = new Set(rows.map((row) => clean(row.code).toUpperCase()));
    const mergedRows = uniqueBy([
      ...rows,
      ...SECTOR_PINNED_ROWS
        .filter((row) => !existingCodes.has(clean(row.code).toUpperCase()))
        .map((row, index) => ({ ...row, source_rank: rows.length + index + 1, featured: 1 }))
    ], (row) => clean(row.code).toUpperCase());
    return mergedRows
      .map((row, index) => ({
        code: clean(row.code).toUpperCase(),
        name: clean(row.name || row.code),
        source_rank: numberOrNull(row.source_rank) ?? index + 1,
        featured: Number(row.featured || 0) > 0 || index < 10
      }))
      .sort((a, b) => a.source_rank - b.source_rank);
  }
  const catalog = await loadSectorCatalog();
  return sectorFlowUniverse(catalog).map((row, index) => ({ ...row, source_rank: index + 1 }));
}

async function loadSectorFlowMinutes(codeInput, tradeDate) {
  const code = clean(codeInput).toUpperCase();
  if (!/^BK\d{4}$/.test(code)) throw new Error("板块代码不正确");
  const cachedRows = db.prepare("SELECT * FROM sector_flow_minutes WHERE code = ? AND tradeDate = ? ORDER BY minuteIndex").all(code, tradeDate);
  const cachedComplete = cachedRows.length >= 240 || (numberOrNull(cachedRows.at(-1)?.minuteIndex) ?? -1) >= 239;
  const outsideSession = isOutsideAshareTradingSession();
  if (cachedRows.length && outsideSession && cachedComplete) return cachedRows;
  const latestCached = cachedRows.at(-1);
  if (latestCached && Date.now() - (Date.parse(latestCached.updatedAt) || 0) < 60 * 1000 && (!outsideSession || cachedComplete)) return cachedRows;
  try {
    const raw = JSON.parse(await fetchText(`https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=360&klt=1&secid=90.${code}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`, {
      timeout: 8000,
      allowCurlFallback: true,
      headers: { referer: "https://quote.eastmoney.com/" }
    }));
    const rows = (raw?.data?.klines || []).map((line) => parseSectorFlowMinute(code, line)).filter((row) => row?.tradeDate === tradeDate);
    if (!rows.length) {
      if (cachedRows.length) return cachedRows;
      return [];
    }
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sector_flow_minutes (code, tradeDate, minuteIndex, time, mainFlow, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) stmt.run(row.code, row.tradeDate, row.minuteIndex, row.time, row.mainFlow, nowIso());
    return rows;
  } catch (error) {
    if (cachedRows.length) return cachedRows;
    throw error;
  }
}

function parseSectorFlowMinute(code, line) {
  const parts = String(line || "").split(",");
  if (parts.length < 2) return null;
  const [datePart, timePart] = String(parts[0] || "").split(" ");
  const minuteIndex = sectorMinuteIndex(timePart);
  if (!datePart || minuteIndex == null) return null;
  return {
    code,
    tradeDate: datePart,
    minuteIndex,
    time: timePart,
    mainFlow: numberOrNull(parts[1]) == null ? null : numberOrNull(parts[1]) / 100000000
  };
}

function sectorMinuteIndex(timePart) {
  const match = String(timePart || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30) return Math.min(119, minutes - (9 * 60 + 30));
  if (minutes >= 13 * 60 && minutes <= 15 * 60) return Math.min(239, 120 + minutes - (13 * 60));
  return null;
}

function buildSectorFlowSeries(sector, minutes) {
  const data = Array(240).fill(null);
  for (const row of minutes) {
    if (row.minuteIndex >= 0 && row.minuteIndex < data.length) data[row.minuteIndex] = numberOrNull(row.mainFlow);
  }
  const firstIndex = data.findIndex((value) => value != null);
  const lastIndex = data.findLastIndex((value) => value != null);
  if (firstIndex >= 0 && lastIndex >= 0) {
    let last = data[firstIndex];
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      if (data[index] == null) data[index] = last;
      else last = data[index];
    }
  }
  return {
    name: sector.name,
    code: sector.code,
    source_rank: numberOrNull(sector.source_rank),
    latest_flow: lastNonNull(data),
    featured: Number(sector.featured || 0) > 0 || sectorFeaturedScore(sector) < 1000,
    data
  };
}

const SECTOR_FLOW_WARM_COLORS = [
  "#DC2626", "#e33737", "#ea4949", "#ee5c5c", "#f16e6e", "#F58787", "#f8a0a0",
  "#fdb06a", "#FCC99A"
];
const SECTOR_FLOW_COOL_COLORS = [
  "#A8C5E8", "#86afda", "#689acc", "#5186bf", "#3f74b0", "#2E62A0", "#245191"
];
const SECTOR_FLOW_WEAK_COLORS = [
  "#8cd0bc", "#90eeba", "#6EE7A3", "#4bdc8c", "#30cf77", "#23bf69", "#1bb05a", "#16A34A"
];

function applySectorFlowColors(series) {
  const ranked = [...series].sort((a, b) => {
    const av = flowNumberOrNull(a.latest_flow);
    const bv = flowNumberOrNull(b.latest_flow);
    if (av == null && bv == null) return (numberOrNull(a.source_rank) ?? Infinity) - (numberOrNull(b.source_rank) ?? Infinity);
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
  const positive = ranked.filter((item) => {
    const value = flowNumberOrNull(item.latest_flow);
    return value != null && value > 0;
  });
  const negative = ranked.filter((item) => {
    const value = flowNumberOrNull(item.latest_flow);
    return value != null && value <= 0;
  });
  const maxOutflow = Math.max(...negative.map((item) => Math.abs(flowNumberOrNull(item.latest_flow) || 0)), 0);
  const lightOutflow = [];
  const heavyOutflow = [];
  negative.forEach((item) => {
    const value = Math.abs(flowNumberOrNull(item.latest_flow) || 0);
    const ratio = maxOutflow > 0 ? value / maxOutflow : 0;
    if (ratio >= 0.38) heavyOutflow.push(item);
    else lightOutflow.push(item);
  });

  const colorByCode = new Map();
  positive.forEach((item, index) => {
    colorByCode.set(item.code, colorFromPalette(SECTOR_FLOW_WARM_COLORS, index, positive.length));
  });
  lightOutflow.forEach((item, index) => {
    colorByCode.set(item.code, colorFromPalette(SECTOR_FLOW_COOL_COLORS, index, lightOutflow.length));
  });
  heavyOutflow.forEach((item, index) => {
    colorByCode.set(item.code, colorFromPalette(SECTOR_FLOW_WEAK_COLORS, index, heavyOutflow.length));
  });

  return series.map((item) => ({
    ...item,
    color: colorByCode.get(item.code) || SECTOR_FLOW_WEAK_COLORS.at(-1)
  }));
}

function colorFromPalette(palette, index, count) {
  if (count <= 1) return palette[0];
  const colorIndex = Math.round((index / (count - 1)) * (palette.length - 1));
  return palette[Math.max(0, Math.min(palette.length - 1, colorIndex))];
}

function lastNonNull(values) {
  for (let index = (values || []).length - 1; index >= 0; index -= 1) {
    if (values[index] == null) continue;
    const value = numberOrNull(values[index]);
    if (value != null) return value;
  }
  return null;
}

function flowNumberOrNull(value) {
  return value == null ? null : numberOrNull(value);
}

function chinaTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        results[index] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function searchStocks(queryInput, limit) {
  const input = clean(queryInput).toUpperCase();
  if (!input) return [];
  const poolEnvelope = await cached("a-share-stock-pool", 600_000, loadAShareStockPool);
  const pool = Array.isArray(poolEnvelope.data) ? poolEnvelope.data : [];
  const query = normalizeSearchText(input);
  const directMatches = pool
    .map((item) => ({ ...item, score: stockSearchScore(item, query) }))
    .filter((item) => item.score < 999)
    .sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
  if (directMatches.length) return directMatches.map(({ score, searchName, searchSymbol, ...item }) => item);

  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(input)}&type=14&token=44c9d251add88e27b65ed86506f6e5da`;
  const raw = await fetchJson(url, { allowCurlFallback: true });
  const rows = raw?.QuotationCodeTable?.Data || [];
  return uniqueBy((Array.isArray(rows) ? rows : [])
    .map(searchStockRow)
    .filter((item) => item.symbol && item.name && ["SH", "SZ"].includes(item.market)), (item) => item.symbol)
    .slice(0, limit);
}

async function loadAShareStockPool() {
  const rows = await loadAShareQuoteRows();
  return uniqueBy(rows.map((row) => {
    const symbol = clean(row?.f12 || "");
    const market = Number(row?.f13) === 1 ? "SH" : Number(row?.f13) === 0 ? "SZ" : inferMarket(symbol);
    const name = clean(row?.f14 || symbol);
    return {
      symbol,
      name,
      market,
      quoteId: eastmoneySecidFromSymbol(symbol, market),
      type: "A股",
      searchName: normalizeSearchText(name),
      searchSymbol: normalizeSearchText(symbol)
    };
  }).filter((item) => /^[0368]\d{5}$/.test(item.symbol) && item.name), (item) => item.symbol);
}

function normalizeSearchText(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function stockSearchScore(item, query) {
  if (!query) return 999;
  const symbol = item.searchSymbol || normalizeSearchText(item.symbol);
  const name = item.searchName || normalizeSearchText(item.name);
  if (symbol === query) return 0;
  if (name === query) return 1;
  if (symbol.startsWith(query)) return 5;
  if (name.startsWith(query)) return 8;
  if (symbol.includes(query)) return 20;
  if (name.includes(query)) return 24;
  return 999;
}

function searchStockRow(row) {
  const symbol = clean(row?.Code || "").toUpperCase();
  const market = eastmoneyMarket(row);
  return {
    symbol,
    name: clean(row?.Name || symbol),
    market,
    quoteId: clean(row?.QuoteID || eastmoneySecidFromSymbol(symbol, market)),
    type: clean(row?.SecurityTypeName || row?.Classify || "")
  };
}

async function loadStockFundFlow(symbolInput) {
  const info = await lookupStock(symbolInput);
  const secid = eastmoneySecidFromSymbol(info.symbol, info.market);
  if (!secid) throw new Error("暂不支持该股票的资金流");
  const raw = await loadEastmoneyFundFlowRaw(secid);
  const data = raw?.data || {};
  const latest = String(data.klines?.[0] || "").split(",");
  if (latest.length < 6) throw new Error("资金流数据为空");
  const [, main, small, medium, big, superLarge] = latest;
  const periodFunds = await loadEastmoneyPeriodFundFlow(secid, data.tradePeriods).catch(() => ({
    preMarket: null,
    afterMarket: null
  }));
  return {
    symbol: info.symbol,
    name: clean(data.name || info.name),
    market: info.market,
    updatedAt: nowIso(),
    items: [
      fundFlowItem("盘后资金", periodFunds.afterMarket, null, { optional: true }),
      fundFlowItem("主力净流入", main),
      fundFlowItem("超大单净流入", superLarge),
      fundFlowItem("大单净流入", big),
      fundFlowItem("中单净流入", medium),
      fundFlowItem("小单净流入", small)
    ]
  };
}

async function loadEastmoneyPeriodFundFlow(secid, tradePeriods = {}) {
  const raw = await fetchJson(`https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=360&klt=1&secid=${encodeURIComponent(secid)}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`, {
    allowCurlFallback: true,
    headers: { referer: "https://quote.eastmoney.com/" }
  });
  const rows = (raw?.data?.klines || []).map(parseFundFlowMinuteRow).filter(Boolean);
  return {
    preMarket: periodMainFlow(rows, tradePeriods?.pre),
    afterMarket: periodMainFlow(rows, tradePeriods?.after)
  };
}

function parseFundFlowMinuteRow(value) {
  const parts = String(value || "").split(",");
  if (parts.length < 6) return null;
  return {
    time: parts[0],
    main: numberOrNull(parts[1])
  };
}

function periodMainFlow(rows, period) {
  if (!period?.b || !period?.e) return null;
  const start = String(period.b).slice(8, 12);
  const end = String(period.e).slice(8, 12);
  const matched = rows.filter((row) => {
    const time = row.time.match(/\s(\d{2}):(\d{2})$/);
    if (!time) return false;
    const hhmm = `${time[1]}${time[2]}`;
    return hhmm >= start && hhmm <= end && row.main != null;
  });
  if (!matched.length) return null;
  const value = matched.at(-1).main;
  return value && Math.abs(value) > 0 ? value : null;
}

async function loadEastmoneyFundFlowRaw(secid) {
  const encoded = encodeURIComponent(secid);
  const urls = [
    `https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=1&klt=101&secid=${encoded}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`,
    `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=1&secid=${encoded}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      const raw = await fetchJson(url, {
        allowCurlFallback: true,
        headers: { referer: "https://quote.eastmoney.com/" }
      });
      if (raw?.data?.klines?.length) return raw;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) console.warn("fund flow source failed:", readableError(lastError));
  throw new Error("资金流数据源暂不可用");
}

function fundFlowItem(label, amount, ratio = null, options = {}) {
  return {
    label,
    amount: numberOrNull(amount),
    ratio: numberOrNull(ratio),
    optional: Boolean(options.optional)
  };
}

function eastmoneySecidFromSymbol(symbol, market = inferMarket(symbol)) {
  if (!/^\d{6}$/.test(String(symbol || ""))) return "";
  if (market === "SH" || String(symbol).startsWith("6")) return `1.${symbol}`;
  if (market === "SZ" || /^[03]/.test(String(symbol))) return `0.${symbol}`;
  return "";
}

async function loadEastmoneyNewsHot(limit) {
  const url = `https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=345&order=1&needInteractData=0&page_index=1&page_size=${limit}&req_trace=${Date.now()}`;
  const raw = await fetchJson(url, {
    headers: { referer: "https://www.eastmoney.com/" }
  });
  const list = raw?.data?.list || [];
  if (!Array.isArray(list) || !list.length) throw new Error("东方财富资讯热榜为空");
  return list.slice(0, limit).map((item, index) => ({
    id: `eastmoney-news-${item.code || index}`,
    rank: index + 1,
    title: cleanHtml(item.title || ""),
    time: item.showTime || "",
    summary: cleanHtml(item.summary || item.mediaName || ""),
    url: item.uniqueUrl || item.url || "",
    content: cleanHtml(item.summary || item.title || ""),
    source: item.mediaName ? `东方财富 · ${cleanHtml(item.mediaName)}` : "东方财富"
  }));
}

function normalizeEastmoneyRankSymbol(value) {
  return String(value || "").replace(/^(SH|SZ|HK)/i, "").toUpperCase();
}

function normalizeEastmoneyRankMarket(value) {
  return /^SH/i.test(String(value || "")) ? "SH" : "SZ";
}

async function loadPosts(symbol, source, limit) {
  if (source === "guba") return loadGubaPosts(symbol, limit);
  throw new Error("仅支持股吧帖子");
}

async function loadStockAnnouncements(symbolInput, limit) {
  const info = await lookupStock(symbolInput);
  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=30&page_index=1&ann_type=A&client_source=web&stock_list=${encodeURIComponent(info.symbol)}`;
  const raw = await fetchJson(url, {
    allowCurlFallback: true,
    headers: { referer: "https://data.eastmoney.com/" }
  });
  const rows = Array.isArray(raw?.data?.list) ? raw.data.list : [];
  return rows
    .map((item) => stockAnnouncementItem(item, info.symbol))
    .filter((item) => item.title)
    .slice(0, limit);
}

function stockAnnouncementItem(item, symbol) {
  const dateValue = clean(item.notice_date || item.display_time || item.sort_date || "");
  const date = parseChinaDate(dateValue);
  const category = Array.isArray(item.columns) ? item.columns.map((column) => clean(column.column_name)).filter(Boolean).slice(0, 2).join(" / ") : "";
  const artCode = clean(item.art_code || "");
  return {
    id: artCode || `announcement-${symbol}-${dateValue}`,
    title: cleanHtml(item.title_ch || item.title || "公告"),
    time: date ? date.toISOString() : dateValue,
    dateText: date ? date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) : dateValue.slice(0, 10),
    timeMs: date ? date.getTime() : 0,
    category,
    url: artCode ? `https://data.eastmoney.com/notices/detail/${symbol}/${artCode}.html` : "",
    content: cleanHtml(item.title_ch || item.title || ""),
    source: "东方财富公告"
  };
}

async function loadEastmoneyStockNews(symbolInput, limit) {
  const info = await lookupStock(symbolInput);
  const quoteNews = await fetchEastmoneyQuoteStockNews(info, limit).catch(() => []);
  if (quoteNews.length) return quoteNews.slice(0, limit);
  const keywords = [info.name, info.symbol].filter(Boolean);
  const rows = [];
  for (const keyword of keywords) {
    const items = await fetchEastmoneyStockNewsByKeyword(keyword, info, limit).catch(() => []);
    rows.push(...items);
    if (uniqBy(rows, (item) => item.url || item.title).length >= limit) break;
  }
  const uniqueRows = uniqBy(rows, (item) => item.url || item.title)
    .filter((item) => item.title)
    .slice(0, limit);
  if (!uniqueRows.length) throw new Error("东方财富个股资讯为空");
  return uniqueRows;
}

async function fetchEastmoneyQuoteStockNews(info, limit) {
  const secid = eastmoneySecidFromSymbol(info.symbol, info.market);
  if (!secid) return [];
  const url = `https://np-listapi.eastmoney.com/comm/web/getListInfo?cfh=1&client=web&mTypeAndCode=${encodeURIComponent(secid)}&type=1&pageSize=${clampLimit(limit)}&traceId=${Date.now()}`;
  const raw = await fetchJson(url, {
    allowCurlFallback: true,
    headers: {
      referer: `https://quote.eastmoney.com/${secid.startsWith("1.") ? "sh" : "sz"}${info.symbol}.html`
    }
  });
  const list = Array.isArray(raw?.data?.list) ? raw.data.list : [];
  return list
    .map((item, index) => normalizeEastmoneyQuoteNewsItem(item, info, index))
    .filter((item) => item.title);
}

function normalizeEastmoneyQuoteNewsItem(item, info, index) {
  const timeText = clean(item.Art_ShowTime || item.showTime || "");
  const url = normalizeEastmoneyUrl(item.Art_Url || item.Art_OriginUrl || "");
  return {
    id: `eastmoney-quote-news-${clean(item.Art_Code) || info.symbol}-${index}`,
    title: cleanHtml(item.Art_Title || item.title || ""),
    time: parseChinaDate(timeText)?.toISOString() || timeText,
    dateText: timeText.slice(0, 10),
    summary: cleanHtml(item.Art_Title || item.title || ""),
    url,
    content: cleanHtml(item.Art_Title || item.title || ""),
    source: "东方财富资讯",
    type: "news"
  };
}

async function fetchEastmoneyStockNewsByKeyword(keyword, info, limit) {
  const searchUrl = eastmoneyStockNewsSearchUrl(keyword);
  const html = await fetchText(searchUrl, {
    allowCurlFallback: true,
    headers: { referer: "https://www.eastmoney.com/" }
  });
  const rows = parseEastmoneySearchNews(html, info, limit);
  if (rows.length) return rows;
  return fetchEastmoneyColumnNewsForStock(keyword, info, limit);
}

function eastmoneyStockNewsSearchUrl(keyword) {
  return `https://so.eastmoney.com/news/s?keyword=${encodeURIComponent(keyword)}&type=content`;
}

async function fetchEastmoneyColumnNewsForStock(keyword, info, limit) {
  const raw = await fetchJson(`https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=345&order=1&needInteractData=0&page_index=1&page_size=50&req_trace=${Date.now()}`, {
    headers: { referer: "https://www.eastmoney.com/" }
  });
  const list = Array.isArray(raw?.data?.list) ? raw.data.list : [];
  const needle = String(keyword || "").toLowerCase();
  return list
    .map((item, index) => normalizeEastmoneyNewsItem(item, info, index))
    .filter((item) => {
      const haystack = `${item.title} ${item.summary}`.toLowerCase();
      return needle && haystack.includes(needle);
    })
    .slice(0, limit);
}

function parseEastmoneySearchNews(html, info, limit) {
  const rows = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) && rows.length < limit * 3) {
    const url = normalizeEastmoneyUrl(match[1]);
    const title = cleanHtml(match[2]);
    if (!url || !title || seen.has(url) || !/eastmoney\.com/i.test(url)) continue;
    if (!looksLikeStockNews(title, info)) continue;
    seen.add(url);
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 700);
    const summary = cleanHtml((after.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "");
    const timeText = cleanHtml((after.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/) || [])[1] || "");
    rows.push({
      id: `eastmoney-stock-news-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}`,
      title,
      time: parseChinaDate(timeText)?.toISOString() || timeText,
      dateText: timeText.slice(0, 10),
      summary,
      url,
      content: summary || title,
      source: "东方财富资讯",
      type: "news"
    });
  }
  return rows.slice(0, limit);
}

function normalizeEastmoneyNewsItem(item, info, index) {
  const url = normalizeEastmoneyUrl(item.uniqueUrl || item.url || "");
  const timeText = clean(item.showTime || item.show_time || item.publishTime || "");
  return {
    id: `eastmoney-stock-news-${item.code || index}`,
    title: cleanHtml(item.title || ""),
    time: parseChinaDate(timeText)?.toISOString() || timeText,
    dateText: timeText.slice(0, 10),
    summary: cleanHtml(item.summary || item.digest || item.mediaName || ""),
    url,
    content: cleanHtml(item.summary || item.title || ""),
    source: item.mediaName ? `东方财富资讯 · ${cleanHtml(item.mediaName)}` : "东方财富资讯",
    type: "news"
  };
}

function normalizeEastmoneyUrl(value) {
  const textValue = clean(value);
  if (!textValue) return "";
  if (/^\/\//.test(textValue)) return `https:${textValue}`;
  if (/^\//.test(textValue)) return `https://www.eastmoney.com${textValue}`;
  return /^https?:\/\//i.test(textValue) ? textValue : "";
}

function looksLikeStockNews(title, info) {
  const text = clean(title).toLowerCase();
  if (!text) return false;
  const name = clean(info.name).toLowerCase();
  const symbol = clean(info.symbol).toLowerCase();
  return Boolean((name && text.includes(name)) || (symbol && text.includes(symbol)));
}

async function loadDsaNewsContext(symbolInput, options = {}) {
  const info = await lookupStock(symbolInput);
  const legacyLimit = typeof options === "number" ? options : null;
  const newsLimit = clampLimit(typeof options === "object" ? options.newsLimit || 8 : legacyLimit || 8);
  const announcementLimit = clampLimit(typeof options === "object" ? options.announcementLimit || 8 : legacyLimit || 8);
  const aiLimit = clampLimit(typeof options === "object" ? options.aiLimit || 12 : Math.min(12, (legacyLimit || 8) * 2));
  const [newsEnvelope, announcementsEnvelope] = await Promise.all([
    cached(`stock-eastmoney-news:${info.symbol}:${newsLimit}`, 300_000, () => loadEastmoneyStockNews(info.symbol, newsLimit)),
    cached(`announcements:${info.symbol}:${announcementLimit}`, 300_000, () => loadStockAnnouncements(info.symbol, announcementLimit))
  ]);
  const newsItems = Array.isArray(newsEnvelope.data) ? newsEnvelope.data : [];
  const announcementItems = Array.isArray(announcementsEnvelope.data) ? announcementsEnvelope.data : [];
  const fallbackNewsItem = !newsItems.length && info.name ? [{
    id: `eastmoney-stock-news-search-${info.symbol}`,
    title: `${info.name} 东方财富个股资讯`,
    time: nowIso(),
    dateText: "",
    summary: `东方财富个股资讯搜索结果：${info.name}`,
    url: eastmoneyStockNewsSearchUrl(info.name),
    content: `东方财富个股资讯搜索结果：${info.name}`,
    source: "东方财富资讯",
    type: "news"
  }] : [];
  const items = [...newsItems, ...fallbackNewsItem, ...announcementItems.map((item) => ({ ...item, type: "announcement" }))]
    .filter((item) => item.title);
  const aiItems = items.slice(0, aiLimit);
  const warningMessages = [];
  if (newsEnvelope.errorMessage && announcementItems.length) {
    warningMessages.push("东财个股新闻暂未取到，已使用东方财富公告补充 AI 上下文");
  } else if (newsEnvelope.errorMessage) {
    warningMessages.push(newsEnvelope.errorMessage);
  }
  if (announcementsEnvelope.errorMessage) warningMessages.push(announcementsEnvelope.errorMessage);
  return {
    stock: info,
    items,
    customNewsItems: aiItems.map((item) => ({
      title: item.title,
      summary: item.summary || item.content || item.title,
      source: item.source || (item.type === "announcement" ? "东方财富公告" : "东方财富资讯"),
      published_at: item.time || "",
      url: item.url || "",
      type: item.type || (item.source === "东方财富公告" ? "announcement" : "news")
    })),
    updatedAt: nowIso(),
    stale: Boolean(newsEnvelope.stale || announcementsEnvelope.stale),
    errorMessage: warningMessages.join("；")
  };
}

function requireDsaBaseUrl() {
  if (!DSA_API_BASE_URL) throw new Error("未配置 DSA_API_BASE_URL");
  return DSA_API_BASE_URL;
}

function dsaUrl(pathValue, params = null) {
  const url = new URL(`${requireDsaBaseUrl()}${pathValue}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url.href;
}

async function fetchDsaJson(pathValue, options = {}) {
  const headers = {
    "accept": "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {})
  };
  return fetchJson(dsaUrl(pathValue, options.params), {
    method: options.method || "GET",
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    timeout: options.timeout || 120_000
  });
}

async function triggerDsaAnalysis(body) {
  const context = await loadDsaNewsContext(body.stockCode || body.stock_code || body.symbol || body.query, {
    newsLimit: body.newsLimit || body.news_limit || 8,
    announcementLimit: body.announcementLimit || body.announcement_limit || 8,
    aiLimit: body.aiLimit || body.ai_limit || 12
  });
  const requestBody = {
    stock_code: context.stock.symbol,
    report_type: clean(body.reportType || body.report_type || "detailed") || "detailed",
    force_refresh: Boolean(body.forceRefresh || body.force_refresh),
    async_mode: body.asyncMode == null ? true : Boolean(body.asyncMode || body.async_mode),
    stock_name: context.stock.name,
    original_query: clean(body.originalQuery || body.original_query || body.query || context.stock.symbol),
    selection_source: clean(body.selectionSource || body.selection_source || "manual"),
    notify: Boolean(body.notify),
    report_language: DSA_REPORT_LANGUAGE,
    client_user_id: clean(body.clientUserId || body.client_user_id || ""),
    custom_news_items: context.customNewsItems
  };
  let data;
  let duplicateExistingTask = false;
  try {
    data = await fetchDsaJson("/api/v1/analysis/analyze", {
      method: "POST",
      body: requestBody,
      timeout: 180_000
    });
  } catch (error) {
    const duplicateTaskId = clean(error?.payload?.existing_task_id || error?.payload?.existingTaskId);
    if (error?.status !== 409 || !duplicateTaskId) throw error;
    duplicateExistingTask = true;
    data = {
      task_id: duplicateTaskId,
      trace_id: duplicateTaskId,
      stock_code: context.stock.symbol,
      status: "pending",
      message: "该股票已有分析任务正在进行，已继续跟踪原任务"
    };
  }
  return {
    data,
    stock: context.stock,
    news: context.items,
    customNewsItems: context.customNewsItems,
    duplicateExistingTask,
    updatedAt: nowIso(),
    stale: context.stale,
    errorMessage: context.errorMessage
  };
}

async function triggerAdminWatchlistAnalysis(user, body = {}) {
  requireAdmin(user);
  if (!DSA_API_BASE_URL) throw new Error("DSA 分析服务未配置");
  const items = listWatchlist(user.id);
  const forceRefresh = Boolean(body.forceRefresh || body.force_refresh);
  if (!items.length) {
    return {
      accepted: [],
      duplicates: [],
      failed: [],
      message: "管理员暂无自选股可分析",
      quota: dsaQuotaForUser(user),
      updatedAt: nowIso(),
      stale: false
    };
  }
  const accepted = [];
  const duplicates = [];
  const failed = [];
  for (const item of items) {
    try {
      const result = await triggerDsaAnalysis({
        stockCode: item.symbol,
        query: item.symbol,
        originalQuery: item.symbol,
        reportType: "detailed",
        asyncMode: true,
        forceRefresh,
        clientUserId: String(user.id),
        selectionSource: "manual"
      });
      const payload = result.data || {};
      const taskId = clean(payload.task_id || payload.taskId || payload.trace_id || payload.traceId);
      const task = {
        taskId,
        stockCode: result.stock?.symbol || item.symbol,
        stockName: result.stock?.name || item.name || item.symbol,
        status: payload.status || "pending",
        progress: payload.progress ?? 0,
        message: payload.message || "分析任务已提交",
        createdAt: result.updatedAt || nowIso()
      };
      if (result.duplicateExistingTask) duplicates.push({ ...task, duplicate: true });
      else accepted.push(task);
    } catch (error) {
      failed.push({
        symbol: item.symbol,
        name: item.name || item.symbol,
        reason: readableError(error)
      });
    }
  }
  return {
    accepted,
    duplicates,
    failed,
    message: `已提交 ${accepted.length} 只，重复 ${duplicates.length} 只，失败 ${failed.length} 只`,
    quota: dsaQuotaForUser(user),
    updatedAt: nowIso(),
    stale: false
  };
}

function reportSettingsForUser(userId) {
  const existing = db.prepare("SELECT * FROM report_settings WHERE userId = ?").get(userId);
  if (existing) return normalizeReportSettings(existing);
  const now = nowIso();
  db.prepare("INSERT INTO report_settings (userId, createdAt, updatedAt) VALUES (?, ?, ?)").run(userId, now, now);
  return normalizeReportSettings(db.prepare("SELECT * FROM report_settings WHERE userId = ?").get(userId));
}

function normalizeReportSettings(row = {}) {
  return {
    enabled: Boolean(row.enabled),
    emailEnabled: Boolean(row.emailEnabled),
    email: clean(row.email || ""),
    emailConfigured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM),
    updatedAt: row.updatedAt || ""
  };
}

function publicReportSettings(userId) {
  const settings = reportSettingsForUser(userId);
  return {
    ...settings,
    smtpConfigured: settings.emailConfigured,
    nextSendTime: DAILY_REPORT_TIME,
    lastReport: latestReportLog(userId)
  };
}

function saveReportSettings(userId, body = {}) {
  const email = clean(body.email || "");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("邮箱格式不正确");
  const enabled = body.enabled ? 1 : 0;
  const emailEnabled = body.emailEnabled ? 1 : 0;
  const now = nowIso();
  db.prepare(`
    INSERT INTO report_settings (userId, enabled, emailEnabled, email, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      enabled = excluded.enabled,
      emailEnabled = excluded.emailEnabled,
      email = excluded.email,
      updatedAt = excluded.updatedAt
  `).run(userId, enabled, emailEnabled, email, now, now);
  return publicReportSettings(userId);
}

function latestReportLog(userId) {
  const row = db.prepare(`
    SELECT reportDate, isTest, status, channels, summary, errorMessage, createdAt, sentAt
    FROM watchlist_daily_reports
    WHERE userId = ?
    ORDER BY createdAt DESC
    LIMIT 1
  `).get(userId);
  return row ? publicReportLog(row) : null;
}

function publicReportLog(row) {
  return {
    reportDate: row.reportDate,
    isTest: Boolean(row.isTest),
    status: row.status,
    channels: safeJsonArray(row.channels),
    summary: row.summary || "",
    errorMessage: row.errorMessage || "",
    createdAt: row.createdAt || "",
    sentAt: row.sentAt || ""
  };
}

function reportSendMessage(result = {}) {
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  const success = attempts.filter((item) => item.ok).map((item) => item.channel).join("、");
  const failed = attempts.filter((item) => !item.ok).map((item) => `${item.channel} 失败`).join("、");
  if (result.status === "success") return `日报已发送：${success || "全部渠道"}`;
  if (result.status === "partial") return `日报部分发送成功：${success || "无"}；${failed || ""}`;
  if (result.skipped) return result.message || "已跳过";
  return result.errorMessage || "日报发送失败";
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function listDailyReportUsers() {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.displayName, u.expiresAt, u.lastActiveAt, u.dsaDailyLimit,
           s.enabled, s.emailEnabled, s.email
    FROM users u
    JOIN report_settings s ON s.userId = u.id
    WHERE s.enabled = 1
    ORDER BY u.id ASC
  `).all();
  return rows
    .filter((row) => !isUserExpired(row))
    .map((row) => ({ ...publicUser(row), reportSettings: normalizeReportSettings(row) }));
}

async function generateWatchlistDailyReport(userId) {
  const items = await listWatchlistDetailed(userId);
  if (!items.length) throw new Error("暂无自选股可生成日报");
  const enriched = await Promise.all(items.map(async (item) => {
    const announcements = await cached(`announcements:${item.symbol}:8`, 300_000, () => loadStockAnnouncements(item.symbol, 8))
      .catch((error) => ({ data: [], stale: true, errorMessage: readableError(error) }));
    return {
      ...item,
      announcements: recentAnnouncementItems(announcements.data || [])
    };
  }));
  return renderWatchlistDailyReport(enriched);
}

function recentAnnouncementItems(items) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const text = item.time || item.updatedAtText || "";
    const parsed = parseChinaDate(text) || new Date(text);
    return !Number.isNaN(parsed?.getTime?.()) ? parsed.getTime() >= cutoff : true;
  }).slice(0, 2);
}

function renderWatchlistDailyReport(items) {
  const reportDate = chinaDateKey();
  const withPosition = items.filter((item) => numberOrNull(item.position) > 0);
  const totalMarketValue = sumNumbers(withPosition.map((item) => item.marketValue));
  const totalTodayProfit = sumNumbers(withPosition.map((item) => item.todayProfit));
  const totalCost = sumNumbers(withPosition.map((item) => numberOrNull(item.costPrice) != null ? numberOrNull(item.costPrice) * numberOrNull(item.position) : null));
  const totalProfit = sumNumbers(withPosition.map((item) => item.totalProfit));
  const todayBase = totalMarketValue != null && totalTodayProfit != null ? totalMarketValue - totalTodayProfit : null;
  const todayProfitPercent = todayBase ? totalTodayProfit / todayBase * 100 : null;
  const totalProfitPercent = totalCost ? totalProfit / totalCost * 100 : null;
  const sortedByChange = [...items].sort((a, b) => Number(b.changePercent ?? -9999) - Number(a.changePercent ?? -9999));
  const sortedByTodayProfit = [...withPosition].sort((a, b) => Number(b.todayProfit ?? -Infinity) - Number(a.todayProfit ?? -Infinity));
  const summary = {
    reportDate,
    itemCount: items.length,
    totalMarketValue,
    totalTodayProfit,
    todayProfitPercent,
    totalProfit,
    totalProfitPercent
  };
  const lines = [
    `自选股收盘日报 ${reportDate}`,
    "",
    `组合：${items.length} 只｜市值 ${formatReportMoney(totalMarketValue)}｜今日 ${formatReportSignedMoney(totalTodayProfit)} / ${formatReportPercent(todayProfitPercent)}｜总盈亏 ${formatReportSignedMoney(totalProfit)} / ${formatReportPercent(totalProfitPercent)}`,
    "",
    `涨幅靠前：${sortedByChange.slice(0, 3).map((item) => `${item.name || item.symbol} ${formatReportPercent(item.changePercent)}`).join("；") || "暂无"}`,
    `今日盈亏靠前：${sortedByTodayProfit.slice(0, 3).map((item) => `${item.name || item.symbol} ${formatReportSignedMoney(item.todayProfit)}`).join("；") || "暂无持仓"}`,
    "",
    "个股摘要："
  ];
  for (const item of items.slice(0, 20)) {
    const tags = (item.tags || []).slice(0, 3).join("/");
    const announcements = (item.announcements || []).map((row) => row.title).filter(Boolean).slice(0, 2).join("；");
    lines.push(`- ${item.name || item.symbol} ${item.symbol}：${formatReportPrice(item.price)}，${formatReportPercent(item.changePercent)}；今 ${formatReportSignedMoney(item.todayProfit)}，总 ${formatReportSignedMoney(item.totalProfit)}${tags ? `；${tags}` : ""}`);
    if (announcements) lines.push(`  公告：${announcements}`);
  }
  if (items.length > 20) lines.push(`还有 ${items.length - 20} 只自选股，请打开看板查看。`);
  const link = PUBLIC_BASE_URL || "";
  if (link) lines.push("", `看板：${link}`);
  const text = truncateReportText(lines.join("\n"));
  return {
    reportDate,
    text,
    html: renderWatchlistDailyReportHtml({ summary, items, sortedByChange, sortedByTodayProfit, link }),
    summary: lines[2],
    itemCount: items.length,
    updatedAt: nowIso()
  };
}

function renderWatchlistDailyReportHtml({ summary, items, sortedByChange, sortedByTodayProfit, link }) {
  const topChange = sortedByChange.slice(0, 5);
  const topProfit = sortedByTodayProfit.slice(0, 5);
  const visibleItems = items.slice(0, 20);
  const stat = (label, value, trend = "") => `
    <td style="padding:10px;border:1px solid #dbe5ea;border-radius:8px;background:#fbfdfe;">
      <div style="font-size:12px;color:#64748b;font-weight:700;">${escapeReportHtml(label)}</div>
      <div style="margin-top:4px;font-size:18px;line-height:1.25;font-weight:900;color:${reportTrendColor(trend)};">${escapeReportHtml(value)}</div>
    </td>`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f7f8;color:#14212b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;">
    <div style="max-width:760px;margin:0 auto;padding:18px;">
      <div style="background:#ffffff;border:1px solid #dbe5ea;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 20px;border-bottom:1px solid #dbe5ea;background:#f8fffd;">
          <div style="font-size:12px;color:#0f7f70;font-weight:900;letter-spacing:.04em;">股市信息综合看板</div>
          <h1 style="margin:6px 0 0;font-size:24px;line-height:1.25;color:#14212b;">自选股收盘日报</h1>
          <div style="margin-top:6px;font-size:13px;color:#64748b;">${escapeReportHtml(summary.reportDate)} · ${summary.itemCount} 只自选股</div>
        </div>
        <div style="padding:16px 20px;">
          <table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:8px;margin:-8px;">
            <tr>
              ${stat("组合市值", formatReportMoney(summary.totalMarketValue))}
              ${stat("今日盈亏", `${formatReportSignedMoney(summary.totalTodayProfit)} / ${formatReportPercent(summary.todayProfitPercent)}`, summary.totalTodayProfit)}
            </tr>
            <tr>
              ${stat("总盈亏", `${formatReportSignedMoney(summary.totalProfit)} / ${formatReportPercent(summary.totalProfitPercent)}`, summary.totalProfit)}
              ${stat("看板", link ? "打开查看详情" : "已生成")}
            </tr>
          </table>
          ${rankingBlock("涨幅靠前", topChange.map((item) => `${item.name || item.symbol} ${formatReportPercent(item.changePercent)}`))}
          ${rankingBlock("今日盈亏靠前", topProfit.map((item) => `${item.name || item.symbol} ${formatReportSignedMoney(item.todayProfit)}`))}
          <h2 style="margin:18px 0 10px;font-size:18px;color:#14212b;">个股摘要</h2>
          ${visibleItems.map(reportStockCardHtml).join("")}
          ${items.length > visibleItems.length ? `<p style="margin:12px 0 0;color:#64748b;">还有 ${items.length - visibleItems.length} 只自选股，请打开看板查看。</p>` : ""}
          ${link ? `<p style="margin:18px 0 0;"><a href="${escapeReportAttr(link)}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#0f7f70;color:#ffffff;text-decoration:none;font-weight:900;">打开看板</a></p>` : ""}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function rankingBlock(title, rows) {
  return `
    <div style="margin-top:16px;padding:12px;border:1px solid #dbe5ea;border-radius:10px;background:#fbfdfe;">
      <div style="font-size:15px;font-weight:900;color:#0f7f70;margin-bottom:8px;">${escapeReportHtml(title)}</div>
      ${(rows.length ? rows : ["暂无"]).map((row, index) => `
        <div style="padding:6px 0;border-top:${index ? "1px solid #edf2f5" : "0"};font-size:14px;color:#14212b;">
          <span style="color:#2563eb;font-weight:900;margin-right:8px;">${String(index + 1).padStart(2, "0")}</span>${escapeReportHtml(row)}
        </div>
      `).join("")}
    </div>`;
}

function reportStockCardHtml(item) {
  const tags = (item.tags || []).slice(0, 3);
  const announcements = (item.announcements || []).map((row) => row.title).filter(Boolean).slice(0, 2);
  return `
    <div style="margin:0 0 10px;padding:12px;border:1px solid #dbe5ea;border-radius:10px;background:#ffffff;">
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:17px;font-weight:900;color:#0f7f70;">${escapeReportHtml(item.name || item.symbol)}</div>
            <div style="margin-top:2px;font-size:13px;color:#64748b;">${escapeReportHtml(item.symbol)} · ${escapeReportHtml(item.market || "")}</div>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;">
            <div style="font-size:18px;font-weight:900;color:#14212b;">${escapeReportHtml(formatReportPrice(item.price))}</div>
            <div style="font-size:15px;font-weight:900;color:${reportTrendColor(item.changePercent)};">${escapeReportHtml(formatReportPercent(item.changePercent))}</div>
          </td>
        </tr>
      </table>
      <div style="margin-top:8px;font-size:14px;color:#14212b;">
        今日 <b style="color:${reportTrendColor(item.todayProfit)};">${escapeReportHtml(formatReportSignedMoney(item.todayProfit))} / ${escapeReportHtml(formatReportPercent(item.todayProfitPercent))}</b>
        <span style="color:#cbd5e1;">｜</span>
        总 <b style="color:${reportTrendColor(item.totalProfit)};">${escapeReportHtml(formatReportSignedMoney(item.totalProfit))} / ${escapeReportHtml(formatReportPercent(item.totalProfitPercent))}</b>
      </div>
      ${tags.length ? `<div style="margin-top:8px;">${tags.map((tag) => `<span style="display:inline-block;margin:0 5px 5px 0;padding:3px 7px;border:1px solid #fed7aa;border-radius:999px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800;">${escapeReportHtml(tag)}</span>`).join("")}</div>` : ""}
      ${reportInfoLines("公告", announcements)}
    </div>`;
}

function reportInfoLines(label, rows) {
  if (!rows.length) return "";
  return `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #edf2f5;">
      <div style="font-size:12px;font-weight:900;color:#64748b;">${escapeReportHtml(label)}</div>
      ${rows.map((row) => `<div style="margin-top:4px;font-size:13px;line-height:1.45;color:#334155;">${escapeReportHtml(row)}</div>`).join("")}
    </div>`;
}

function truncateReportText(textValue, maxLength = 3900) {
  const text = String(textValue || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 40).trim()}\n\n内容较长，已截断，请打开看板查看。`;
}

function sumNumbers(values) {
  let sum = 0;
  let hasValue = false;
  for (const value of values) {
    const number = numberOrNull(value);
    if (number == null) continue;
    sum += number;
    hasValue = true;
  }
  return hasValue ? sum : null;
}

function formatReportPrice(value) {
  const number = numberOrNull(value);
  return number == null ? "--" : number.toFixed(number >= 100 ? 2 : 3).replace(/\.?0+$/, "");
}

function formatReportPercent(value) {
  const number = numberOrNull(value);
  if (number == null) return "--";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatReportMoney(value) {
  const number = numberOrNull(value);
  if (number == null) return "--";
  const abs = Math.abs(number);
  if (abs >= 100000000) return `${(number / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return number.toFixed(2);
}

function formatReportSignedMoney(value) {
  const number = numberOrNull(value);
  if (number == null) return "--";
  return `${number > 0 ? "+" : ""}${formatReportMoney(number)}`;
}

function reportTrendColor(value) {
  const number = numberOrNull(value);
  if (number == null || number === 0) return "#64748b";
  return number > 0 ? "#c2410c" : "#047857";
}

function escapeReportHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeReportAttr(value) {
  return escapeReportHtml(value).replace(/`/g, "&#96;");
}

async function sendWatchlistDailyReport(user, options = {}) {
  const settings = options.settings || reportSettingsForUser(user.id);
  const isTest = Boolean(options.isTest);
  const reportDate = isTest ? `${chinaDateKey()}-${Date.now()}` : chinaDateKey();
  if (!isTest) {
    const existing = db.prepare("SELECT id, status FROM watchlist_daily_reports WHERE userId = ? AND reportDate = ? AND isTest = 0").get(user.id, reportDate);
    if (existing) return { skipped: true, message: "今日日报已发送或已记录" };
  }
  const channels = enabledReportChannels(settings);
  if (!channels.length) throw new Error("未配置可用发送渠道");
  const report = await generateWatchlistDailyReport(user.id);
  const attempts = [];
  for (const channel of channels) {
    try {
      if (channel === "email") await sendEmail(settings.email, `自选股收盘日报 ${report.reportDate}`, report.text, report.html);
      attempts.push({ channel, ok: true });
    } catch (error) {
      attempts.push({ channel, ok: false, error: readableError(error) });
    }
  }
  const failed = attempts.filter((item) => !item.ok);
  const status = failed.length === 0 ? "success" : failed.length === attempts.length ? "failed" : "partial";
  const errorMessage = failed.map((item) => `${item.channel}: ${item.error}`).join("；");
  saveDailyReportLog(user.id, isTest ? reportDate : report.reportDate, isTest, status, attempts, report.summary, errorMessage);
  return {
    status,
    attempts,
    summary: report.summary,
    errorMessage,
    updatedAt: nowIso()
  };
}

function enabledReportChannels(settings) {
  const channels = [];
  if (settings.emailEnabled && settings.email && settings.emailConfigured) channels.push("email");
  return channels;
}

function saveDailyReportLog(userId, reportDate, isTest, status, attempts, summary, errorMessage) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO watchlist_daily_reports (userId, reportDate, isTest, status, channels, summary, errorMessage, createdAt, sentAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, reportDate, isTest) DO UPDATE SET
      status = excluded.status,
      channels = excluded.channels,
      summary = excluded.summary,
      errorMessage = excluded.errorMessage,
      sentAt = excluded.sentAt
  `).run(userId, reportDate, isTest ? 1 : 0, status, JSON.stringify(attempts), summary || "", errorMessage || "", now, now);
}

async function sendEmail(to, subject, body, html = "") {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) throw new Error("邮件 SMTP 未配置");
  const socket = await createSmtpSocket();
  try {
    await smtpRead(socket);
    await smtpCommand(socket, `EHLO ${smtpHostname()}`);
    await smtpCommand(socket, "AUTH LOGIN");
    await smtpCommand(socket, Buffer.from(SMTP_USER).toString("base64"));
    await smtpCommand(socket, Buffer.from(SMTP_PASS).toString("base64"));
    await smtpCommand(socket, `MAIL FROM:<${SMTP_FROM}>`);
    await smtpCommand(socket, `RCPT TO:<${to}>`);
    await smtpCommand(socket, "DATA");
    socket.write(composeEmail(to, subject, body, html));
    await smtpRead(socket);
    await smtpCommand(socket, "QUIT").catch(() => {});
  } finally {
    socket.end();
  }
}

function createSmtpSocket() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST, rejectUnauthorized: SMTP_SECURE }, () => resolve(socket));
    socket.setTimeout(15_000, () => reject(new Error("SMTP 连接超时")));
    socket.once("error", reject);
  });
}

function smtpCommand(socket, command) {
  socket.write(`${command}\r\n`);
  return smtpRead(socket);
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        socket.off("data", onData);
        const code = Number(last.slice(0, 3));
        if (code >= 400) reject(new Error(last));
        else resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

function smtpHostname() {
  return (PUBLIC_BASE_URL ? new URL(PUBLIC_BASE_URL).hostname : "stock-dashboard.local");
}

function composeEmail(to, subject, body, html = "") {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const boundary = `----stock-dashboard-${crypto.randomBytes(8).toString("hex")}`;
  const safeText = dotStuffEmailBody(body);
  const safeHtml = dotStuffEmailBody(html);
  const contentLines = html ? [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    safeText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    safeHtml,
    `--${boundary}--`
  ] : [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    safeText
  ];
  return [
    `From: ${SMTP_FROM}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    ...contentLines,
    ".",
    ""
  ].join("\r\n");
}

function dotStuffEmailBody(value) {
  return String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => line.startsWith(".") ? `.${line}` : line)
    .join("\r\n");
}

async function runScheduledDailyReports() {
  const tradingDay = await isAshareTradingDayForDailyReport();
  if (!tradingDay.tradingDay) {
    console.log(`skip watchlist daily report: A-share market closed (${tradingDay.reason})`);
    return [{ skipped: true, status: "skipped", reason: tradingDay.reason, message: "A 股休市日不发送收盘日报" }];
  }
  const users = listDailyReportUsers();
  const results = [];
  for (const user of users) {
    try {
      results.push({ userId: user.id, ...(await sendWatchlistDailyReport(user, { settings: user.reportSettings })) });
    } catch (error) {
      saveDailyReportLog(user.id, chinaDateKey(), false, "failed", [], "", readableError(error));
      results.push({ userId: user.id, status: "failed", errorMessage: readableError(error) });
    }
  }
  return results;
}

function scheduleDailyReportTimer() {
  const delay = nextDailyReportDelayMs();
  setTimeout(async () => {
    await runScheduledDailyReports().catch((error) => console.error("daily report failed", error));
    scheduleDailyReportTimer();
  }, delay);
}

function nextDailyReportDelayMs() {
  const [hour, minute] = DAILY_REPORT_TIME.split(":").map((part) => Number(part));
  const now = new Date();
  const chinaNowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  let target = new Date(`${chinaNowParts}T${String(hour || 16).padStart(2, "0")}:${String(minute || 30).padStart(2, "0")}:00+08:00`);
  if (target.getTime() <= now.getTime()) target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  return Math.max(1000, target.getTime() - now.getTime());
}

function parseChinaDate(value) {
  const text = clean(value).replace(/:(\d{3})$/, ".$1");
  if (!text) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(`${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadGubaPosts(symbol, limit) {
  const normalized = normalizeGubaSymbol(symbol);
  const url = `https://guba.eastmoney.com/list,${normalized},f.html`;
  const html = await fetchText(url, { allowCurlFallback: true });
  const today = chinaDateParts();
  const todayItems = [];
  const fallbackItems = [];
  const rows = html.match(/<tr class="listitem"[\s\S]*?<\/tr>/g) || [];
  for (const row of rows) {
    const titleMatch = row.match(/<div class="title"><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const text = cleanHtml(titleMatch[2]);
    const rowText = clean(row.replace(/<[^>]+>/g, " "));
    const read = cleanHtml(row.match(/<div class="read">([\s\S]*?)<\/div>/)?.[1] || "");
    const reply = cleanHtml(row.match(/<div class="reply">([\s\S]*?)<\/div>/)?.[1] || "");
    const author = cleanHtml(row.match(/<div class="author"><a[^>]*>([\s\S]*?)<\/a><\/div>/)?.[1] || "");
    const time = cleanHtml(row.match(/<div class="update">([\s\S]*?)<\/div>/)?.[1] || today.short);
    const postUrl = new URL(titleMatch[1], "https://guba.eastmoney.com").href;
    const item = {
      id: `guba-${fallbackItems.length}`,
      title: text,
      author,
      time,
      readCount: read,
      replyCount: reply,
      readCountValue: parseGubaMetric(read),
      replyCountValue: parseGubaMetric(reply),
      updatedAtText: time,
      summary: `阅读 ${read || "-"} / 评论 ${reply || "-"}`,
      url: postUrl,
      content: text,
      source: "股吧"
    };
    fallbackItems.push(item);
    if (rowText.includes(today.short)) todayItems.push(item);
    if (fallbackItems.length >= limit * 2 && todayItems.length >= limit) break;
  }
  const items = fillGubaPosts(todayItems, fallbackItems, limit);
  if (!items.length) {
    return [{
      id: "guba-link",
      title: `${symbol} 股吧热门帖入口`,
      time: "",
      summary: "公开页面暂未解析到当天热门帖。",
      url,
      content: "股吧公开页面暂未解析到当天热门帖，可以稍后刷新。",
      source: "股吧"
    }];
  }
  return items;
}

function fillGubaPosts(todayItems, fallbackItems, limit) {
  const selected = [];
  const seen = new Set();
  for (const item of sortGubaPostsByHeat(todayItems)) {
    if (seen.has(item.url)) continue;
    selected.push(item);
    seen.add(item.url);
    if (selected.length >= limit) return selected;
  }
  for (const item of sortGubaPostsByHeat(fallbackItems)) {
    if (seen.has(item.url)) continue;
    selected.push(item);
    seen.add(item.url);
    if (selected.length >= limit) break;
  }
  return selected;
}

function sortGubaPostsByHeat(items) {
  return [...items].sort((left, right) => {
    const leftScore = gubaPostHeatScore(left);
    const rightScore = gubaPostHeatScore(right);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return (right.readCountValue || 0) - (left.readCountValue || 0);
  }).map(({ readCountValue, replyCountValue, ...item }, index) => ({
    ...item,
    id: item.id || `guba-${index}`
  }));
}

function gubaPostHeatScore(item) {
  const replies = item.replyCountValue || 0;
  const reads = item.readCountValue || 0;
  return replies * 1000 + reads;
}

function parseGubaMetric(value) {
  const textValue = clean(value);
  if (!textValue || textValue === "-") return 0;
  const match = textValue.match(/([\d.]+)\s*([万亿]?)/);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  if (match[2] === "亿") return number * 100000000;
  if (match[2] === "万") return number * 10000;
  return number;
}

function normalizeGubaSymbol(symbol) {
  const upper = symbol.toUpperCase();
  const match = upper.match(/(\d{6})/);
  return match ? match[1] : upper;
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clean(value) {
  return String(value || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function cleanHtml(value) {
  return clean(String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'"));
}

function cleanArticleHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<center[\s\S]*?<\/center>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/(?:div|section|article|h[1-6]|li)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function sectionBetween(textValue, start, end) {
  const startIndex = textValue.indexOf(start);
  const endIndex = textValue.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return textValue.slice(startIndex, endIndex);
}

function chinaDateParts() {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit"
  });
  const [month, day] = formatter.format(new Date()).split("/");
  const full = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  return { full, short: `${month}-${day}` };
}

function interactionSummary(textValue) {
  const numbers = textValue.match(/\d+/g) || [];
  if (numbers.length >= 2) return `阅读 ${numbers[0]} / 评论 ${numbers[1]}`;
  return "平台热门排序";
}

function listWatchlist(userId) {
  return db.prepare("SELECT * FROM watchlist WHERE userId = ? ORDER BY sortOrder ASC, id ASC").all(userId);
}

async function listWatchlistDetailed(userId) {
  const items = listWatchlist(userId);
  const cnRows = items
    .filter((item) => ["SH", "SZ"].includes(item.market) && /^\d{6}$/.test(item.symbol))
    .map((item) => ({ symbol: item.symbol, market: item.market }));
  const quoteMap = cnRows.length ? await loadSinaStockQuotes(cnRows).catch(() => new Map()) : new Map();
  return Promise.all(items.map(async (item) => {
    const quote = quoteMap.get(item.symbol) || {};
    const tags = ["SH", "SZ"].includes(item.market)
      ? await loadEastmoneyConceptTags(item.symbol, item.market).catch(() => [])
      : [];
    return {
      ...item,
      price: quote.price ?? null,
      change: quote.change ?? null,
      changePercent: quote.changePercent ?? null,
      ...holdingMetrics(item, quote),
      tags
    };
  }));
}

function holdingMetrics(item, quote = {}) {
  const price = numberOrNull(quote.price);
  const change = numberOrNull(quote.change);
  const changePercent = numberOrNull(quote.changePercent);
  const costPrice = numberOrNull(item.costPrice);
  const position = numberOrNull(item.position);
  const hasPosition = position != null && position > 0;
  const marketValue = price != null && hasPosition ? price * position : null;
  const previousClose = price != null && change != null ? price - change : null;
  const defaultTodayProfit = change != null && hasPosition ? change * position : null;
  const costBasedTodayProfit = price != null && costPrice != null && hasPosition ? (price - costPrice) * position : null;
  const totalProfit = costBasedTodayProfit;
  const costBetweenPreviousCloseAndPrice = price != null
    && previousClose != null
    && costPrice != null
    && costPrice > 0
    && costPrice >= Math.min(price, previousClose)
    && costPrice <= Math.max(price, previousClose);
  const costSuggestsIntradayLoss = defaultTodayProfit != null
    && costBasedTodayProfit != null
    && defaultTodayProfit > 0
    && costBasedTodayProfit < 0;
  const useCostForToday = costBetweenPreviousCloseAndPrice || costSuggestsIntradayLoss;
  const todayProfit = price != null && hasPosition
    ? useCostForToday
      ? costBasedTodayProfit
      : defaultTodayProfit
    : null;
  const previousValue = marketValue != null && todayProfit != null ? marketValue - todayProfit : null;
  const todayProfitPercent = useCostForToday
    ? ((price - costPrice) / costPrice) * 100
    : previousValue && previousValue !== 0
      ? (todayProfit / previousValue) * 100
      : changePercent;
  const totalCost = costPrice != null && hasPosition ? costPrice * position : null;
  const totalProfitPercent = totalProfit != null && totalCost ? (totalProfit / totalCost) * 100 : null;
  return {
    costPrice,
    position,
    marketValue,
    todayProfit,
    todayProfitPercent,
    totalProfit,
    totalProfitPercent
  };
}

function listAdminUsers() {
  const users = db.prepare("SELECT id, username, displayName, expiresAt, lastActiveAt, dsaDailyLimit, createdAt, updatedAt FROM users ORDER BY id ASC").all();
  return users.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName || "",
    isAdmin: row.username === cleanUsername(DEFAULT_USERNAME),
    dsaDailyLimit: row.username === cleanUsername(DEFAULT_USERNAME) ? null : normalizeDsaDailyLimit(row.dsaDailyLimit),
    expiresAt: row.expiresAt || "",
    lastActiveAt: row.lastActiveAt || "",
    expired: isUserExpired(row),
    dailyReport: adminReportStatus(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function adminReportStatus(userId) {
  const settings = reportSettingsForUser(userId);
  return {
    enabled: settings.enabled,
    emailEnabled: settings.emailEnabled,
    emailConfigured: Boolean(settings.email),
    lastReport: latestReportLog(userId)
  };
}

function requireAdmin(user) {
  if (!user?.isAdmin) throw new Error("需要管理员权限");
}

function targetUserIdForRequest(user, url, body = {}) {
  const requested = Number(body.userId || url.searchParams.get("userId") || user.id);
  if (!Number.isFinite(requested) || requested <= 0) return user.id;
  if (requested === user.id) return user.id;
  requireAdmin(user);
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(requested);
  if (!target) throw new Error("目标用户不存在");
  return Number(target.id);
}

function normalizeSectorFlowPreference(value = {}) {
  const selectedCodes = Array.isArray(value.selectedCodes)
    ? [...new Set(value.selectedCodes
      .map((code) => clean(code).toUpperCase())
      .filter((code) => /^BK\d{4}$/.test(code)))]
    : [];
  return { selectedCodes };
}

function readUserPreference(userId, key) {
  const row = db.prepare("SELECT value, updatedAt FROM user_preferences WHERE userId = ? AND key = ?").get(userId, key);
  if (!row) return { exists: false, value: null, updatedAt: "" };
  try {
    return { exists: true, value: JSON.parse(row.value || "{}"), updatedAt: row.updatedAt || "" };
  } catch {
    return { exists: true, value: {}, updatedAt: row.updatedAt || "" };
  }
}

function publicSectorFlowPreference(userId) {
  const preference = readUserPreference(userId, "sector-flow");
  return {
    exists: preference.exists,
    ...normalizeSectorFlowPreference(preference.value || {})
  };
}

function saveSectorFlowPreference(userId, body = {}) {
  const value = normalizeSectorFlowPreference(body);
  const now = nowIso();
  db.prepare(`
    INSERT INTO user_preferences (userId, key, value, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(userId, key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
  `).run(userId, "sector-flow", JSON.stringify(value), now);
  return value;
}

function dsaClientUserId(user, url, body = {}) {
  return String(targetUserIdForRequest(user, url, body));
}

async function prepareWatchlistImport(req, userId) {
  const upload = await parseMultipartImage(req);
  const textValue = await recognizeImageText(upload);
  const candidates = extractImportItemsFromText(textValue);
  if (!candidates.length) {
    return {
      candidates: [],
      recognizedText: textValue.slice(0, 3000),
      message: "未识别到股票代码"
    };
  }
  const existingMap = new Map(listWatchlist(userId).map((item) => [item.symbol, item]));
  const prepared = [];
  for (const candidate of candidates) {
    try {
      const info = await lookupStock(candidate.symbol);
      const existing = existingMap.get(info.symbol);
      const costPrice = candidate.costPrice;
      const position = candidate.position;
      const costChanged = existing && costPrice != null && numberOrNull(existing.costPrice) !== costPrice;
      const positionChanged = existing && position != null && numberOrNull(existing.position) !== position;
      prepared.push({
        symbol: info.symbol,
        name: info.name,
        market: info.market,
        costPrice,
        position,
        exists: Boolean(existing),
        existingId: existing?.id || null,
        existingCostPrice: existing ? numberOrNull(existing.costPrice) : null,
        existingPosition: existing ? numberOrNull(existing.position) : null,
        holdingChanged: Boolean(costChanged || positionChanged)
      });
    } catch (error) {
      prepared.push({
        symbol: candidate.symbol,
        name: candidate.name || "",
        market: candidate.market || inferMarket(candidate.symbol),
        costPrice: candidate.costPrice,
        position: candidate.position,
        exists: false,
        errorMessage: readableError(error)
      });
    }
  }
  return {
    candidates: uniqueBy(prepared, (item) => item.symbol).slice(0, 80),
    recognizedText: textValue.slice(0, 3000),
    message: `识别到 ${prepared.length} 条候选，请确认后导入`
  };
}

async function confirmWatchlistImport(userId, itemsInput = []) {
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  const existingMap = new Map(listWatchlist(userId).map((item) => [item.symbol, item]));
  const added = [];
  const updated = [];
  const skipped = [];
  const failed = [];
  const seen = new Set();
  for (const rawItem of items) {
    const symbolValue = clean(rawItem?.symbol).toUpperCase().replace(/[^\dA-Z.]/g, "");
    const candidate = {
      symbol: symbolValue.replace(/[^\d]/g, "").slice(0, 6) || symbolValue,
      costPrice: nullableNumber(rawItem?.costPrice),
      position: nullableNumber(rawItem?.position)
    };
    if (!/^[0368]\d{5}$/.test(candidate.symbol)) {
      failed.push({ symbol: symbolValue || "-", reason: "代码格式不正确" });
      continue;
    }
    if (seen.has(candidate.symbol)) {
      skipped.push({ symbol: candidate.symbol, reason: "本次重复" });
      continue;
    }
    seen.add(candidate.symbol);
    try {
      const info = await lookupStock(candidate.symbol);
      const existing = existingMap.get(info.symbol);
      if (existing) {
        const nextCostPrice = candidate.costPrice ?? existing.costPrice;
        const nextPosition = candidate.position ?? existing.position;
        const changed = numberOrNull(existing.costPrice) !== numberOrNull(nextCostPrice)
          || numberOrNull(existing.position) !== numberOrNull(nextPosition);
        if (changed) {
          db.prepare("UPDATE watchlist SET costPrice = ?, position = ?, updatedAt = ? WHERE id = ? AND userId = ?")
            .run(nextCostPrice, nextPosition, nowIso(), existing.id, userId);
          updated.push({ symbol: info.symbol, name: info.name, market: info.market });
        } else {
          skipped.push({ symbol: info.symbol, name: info.name, reason: "已存在且持仓未变化" });
        }
        continue;
      }
      db.prepare("INSERT INTO watchlist (userId, symbol, name, market, sortOrder, costPrice, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(userId, info.symbol, info.name, info.market, Date.now() + added.length, candidate.costPrice, candidate.position, nowIso(), nowIso());
      existingMap.set(info.symbol, info);
      added.push({ symbol: info.symbol, name: info.name, market: info.market });
    } catch (error) {
      failed.push({ symbol: candidate.symbol, reason: readableError(error) });
    }
  }
  return {
    data: await listWatchlistDetailed(userId),
    added,
    updated,
    skipped,
    failed,
    message: `新增 ${added.length} 个，更新 ${updated.length} 个，跳过 ${skipped.length} 个`
  };
}

async function parseMultipartImage(req) {
  const contentTypeValue = req.headers["content-type"] || "";
  const boundaryMatch = contentTypeValue.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("请上传截图文件");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readRawBody(req);
  const parts = splitBuffer(body, boundary);
  for (const part of parts) {
    const separator = Buffer.from("\r\n\r\n");
    const separatorIndex = part.indexOf(separator);
    if (separatorIndex < 0) continue;
    const headerText = part.slice(0, separatorIndex).toString("utf8");
    if (!/name="screenshot"/i.test(headerText) || !/filename="/i.test(headerText)) continue;
    const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    if (!/^image\/(?:png|jpe?g|webp|gif|bmp|tiff?)$/i.test(mimeType)) throw new Error("只支持图片截图文件");
    let buffer = part.slice(separatorIndex + separator.length);
    if (buffer.subarray(0, 2).toString() === "\r\n") buffer = buffer.subarray(2);
    if (buffer.subarray(-2).toString() === "\r\n") buffer = buffer.subarray(0, -2);
    if (!buffer.length) throw new Error("上传图片为空");
    return { buffer, mimeType };
  }
  throw new Error("没有找到截图文件");
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = buffer.indexOf(separator);
  while (start >= 0) {
    start += separator.length;
    if (buffer.subarray(start, start + 2).toString() === "--") break;
    if (buffer.subarray(start, start + 2).toString() === "\r\n") start += 2;
    const end = buffer.indexOf(separator, start);
    if (end < 0) break;
    parts.push(buffer.subarray(start, end));
    start = end;
  }
  return parts;
}

async function recognizeImageText(upload) {
  if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) return recognizeWithTencentOcr(upload);
  if (process.env.OCR_API_URL) return recognizeWithCustomOcr(upload);
  if (process.env.OPENAI_API_KEY) return recognizeWithOpenAi(upload);
  throw new Error("未配置 OCR 服务：请设置 TENCENT_SECRET_ID/TENCENT_SECRET_KEY、OPENAI_API_KEY，或设置 OCR_API_URL");
}

async function recognizeWithTencentOcr(upload) {
  const action = process.env.TENCENT_OCR_ACTION || "GeneralAccurateOCR";
  const body = JSON.stringify({
    ImageBase64: upload.buffer.toString("base64"),
    ConfigID: "OCR",
    EnableDetectText: true,
    WordsType: "0"
  });
  const raw = await fetchJson("https://ocr.tencentcloudapi.com", {
    method: "POST",
    timeout: 45_000,
    body,
    headers: tencentCloudHeaders({
      action,
      body,
      region: process.env.TENCENT_REGION || "ap-guangzhou",
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
      service: "ocr",
      version: "2018-11-19"
    })
  });
  const response = raw?.Response || {};
  if (response.Error) throw new Error(response.Error.Message || response.Error.Code || "腾讯云 OCR 识别失败");
  const rows = Array.isArray(response.TextDetections) ? response.TextDetections : [];
  const textValue = rows
    .filter((row) => row?.DetectedText)
    .sort((left, right) => {
      const leftBox = left.ItemPolygon || {};
      const rightBox = right.ItemPolygon || {};
      const yDiff = Number(leftBox.Y || 0) - Number(rightBox.Y || 0);
      if (Math.abs(yDiff) > 8) return yDiff;
      return Number(leftBox.X || 0) - Number(rightBox.X || 0);
    })
    .map((row) => String(row.DetectedText || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!textValue) throw new Error("腾讯云 OCR 未返回文字");
  return textValue.trim();
}

function tencentCloudHeaders({ action, body, region, secretId, secretKey, service, version }) {
  const host = `${service}.tencentcloudapi.com`;
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8\n",
    `host:${host}\n`,
    `x-tc-action:${action.toLowerCase()}\n`
  ].join("");
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedRequestPayload = sha256Hex(body);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join("\n");
  const algorithm = "TC3-HMAC-SHA256";
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256Hex(secretSigning, stringToSign);
  return {
    "content-type": "application/json; charset=utf-8",
    "host": host,
    "x-tc-action": action,
    "x-tc-version": version,
    "x-tc-timestamp": String(timestamp),
    "x-tc-region": region,
    "authorization": `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hmacSha256Hex(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

async function recognizeWithCustomOcr(upload) {
  const raw = await fetchJson(process.env.OCR_API_URL, {
    method: "POST",
    timeout: 30_000,
    body: JSON.stringify({
      imageBase64: upload.buffer.toString("base64"),
      mimeType: upload.mimeType
    }),
    headers: {
      "content-type": "application/json",
      ...(process.env.OCR_API_KEY ? { authorization: `Bearer ${process.env.OCR_API_KEY}` } : {})
    }
  });
  const textValue = raw?.text || raw?.data?.text || raw?.result?.text || raw?.choices?.[0]?.message?.content || "";
  if (!textValue) throw new Error("OCR 服务未返回文字");
  return clean(String(textValue));
}

async function recognizeWithOpenAi(upload) {
  const model = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";
  const raw = await fetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    timeout: 45_000,
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: "请从这张股票自选/持仓截图中识别所有股票。只输出 JSON，不要解释。格式为 {\"items\":[{\"symbol\":\"600000\",\"name\":\"股票名\",\"costPrice\":12.34,\"position\":1000}]}。如果没有成本或持仓，字段填 null。position 是持仓股数/数量，不要填市值。"
          },
          {
            type: "input_image",
            image_url: `data:${upload.mimeType};base64,${upload.buffer.toString("base64")}`
          }
        ]
      }]
    }),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  });
  const textValue = raw?.output_text || (raw?.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => item.text || "")
    .join("\n");
  if (!textValue) throw new Error("OCR 服务未返回文字");
  return clean(String(textValue));
}

function extractStockSymbolsFromText(textValue) {
  const normalized = String(textValue || "")
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
    .replace(/O/g, "0");
  const matches = normalized.match(/\b(?:SH|SZ|沪|深)?\s*([0368]\d{5})\b/gi) || [];
  return uniqueBy(matches
    .map((value) => value.replace(/[^\d]/g, ""))
    .filter((symbol) => /^[0368]\d{5}$/.test(symbol)), (symbol) => symbol)
    .slice(0, 80);
}

function extractImportItemsFromText(textValue) {
  const jsonItems = extractImportItemsFromJson(textValue);
  if (jsonItems.length) return jsonItems;
  const normalized = String(textValue || "")
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
    .replace(/O/g, "0");
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const holdingRows = extractHoldingCardItems(lines);
  if (holdingRows.length) return uniqueBy(holdingRows, (item) => item.symbol).slice(0, 80);
  const rows = [];
  for (const line of lines) {
    const symbols = extractStockSymbolsFromText(line);
    for (const symbol of symbols) {
      const numbers = line.match(/(?:\d+\.\d+|\d+)/g)?.map(Number).filter(Number.isFinite) || [];
      const rest = numbers.filter((value) => value !== Number(symbol));
      const costPrice = rest.find((value) => value > 0 && value < 10000 && !Number.isInteger(value)) ?? null;
      const position = rest.findLast?.((value) => Number.isInteger(value) && value > 0 && value <= 100_000_000) ?? null;
      rows.push({ symbol, name: "", costPrice, position });
    }
  }
  if (rows.length) return uniqueBy(rows, (item) => item.symbol).slice(0, 80);
  return extractStockSymbolsFromText(normalized).map((symbol) => ({ symbol, name: "", costPrice: null, position: null }));
}

function extractHoldingCardItems(lines) {
  const symbolAnchors = [];
  lines.forEach((line, index) => {
    for (const symbol of extractStockSymbolsFromText(line)) {
      symbolAnchors.push({ symbol, line, index });
    }
  });
  if (!symbolAnchors.length) return [];
  return symbolAnchors.map((anchor, index) => {
    const next = symbolAnchors[index + 1]?.index ?? lines.length;
    const blockLines = lines.slice(anchor.index, next);
    const blockText = blockLines.join("\n");
    return {
      symbol: anchor.symbol,
      name: extractNameNearSymbol(anchor.line, anchor.symbol),
      costPrice: labelNumber(blockText, /成本(?!价|集中度)\s*([0-9][\d,]*(?:\.\d+)?)/),
      position: labelNumber(blockText, /持仓(?!集中度)\s*([0-9][\d,]*(?:\.\d+)?)/)
    };
  }).filter((item) => item.costPrice != null || item.position != null);
}

function extractNameNearSymbol(line, symbol) {
  const before = String(line || "").split(symbol)[0] || "";
  return clean(before
    .replace(/\b(?:SH|SZ|沪|深)\b/gi, "")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9*（）()· -]/g, " ")
    .replace(/\s+/g, " "))
    .slice(0, 24);
}

function labelNumber(textValue, regex) {
  const match = String(textValue || "").match(regex);
  return match ? nullableNumber(match[1]) : null;
}

function extractImportItemsFromJson(textValue) {
  const raw = String(textValue || "").trim();
  const candidates = [raw];
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(raw.slice(objectStart, objectEnd + 1));
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(raw.slice(arrayStart, arrayEnd + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
      const items = rows.map((item) => ({
        symbol: clean(item.symbol || item.code || "").replace(/[^\d]/g, "").slice(0, 6),
        name: clean(item.name || ""),
        costPrice: nullableNumber(item.costPrice ?? item.cost ?? item.avgCost),
        position: nullableNumber(item.position ?? item.quantity ?? item.shares ?? item.amount)
      })).filter((item) => /^[0368]\d{5}$/.test(item.symbol));
      if (items.length) return uniqueBy(items, (item) => item.symbol).slice(0, 80);
    } catch {
      continue;
    }
  }
  return [];
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

async function lookupStock(symbolInput) {
  const input = clean(symbolInput).toUpperCase();
  if (!input) throw new Error("股票关键词不能为空");
  const localMatches = await searchStocks(input, 5).catch(() => []);
  const exactLocal = localMatches.find((item) => normalizeSearchText(item.symbol) === normalizeSearchText(input))
    || localMatches.find((item) => normalizeSearchText(item.name) === normalizeSearchText(input))
    || (/^\d{6}$/.test(input) ? localMatches.find((item) => item.symbol === input) : null);
  if (exactLocal) {
    return {
      symbol: exactLocal.symbol,
      name: exactLocal.name,
      market: exactLocal.market || inferMarket(exactLocal.symbol),
      quoteId: exactLocal.quoteId || eastmoneySecidFromSymbol(exactLocal.symbol, exactLocal.market)
    };
  }
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(input)}&type=14&token=44c9d251add88e27b65ed86506f6e5da`;
  const raw = await fetchJson(url, { allowCurlFallback: true });
  const rows = raw?.QuotationCodeTable?.Data || [];
  const row = rows.find((item) => String(item.Code).toUpperCase() === input) || rows[0];
  if (!row) throw new Error(`未识别股票代码 ${input}`);
  return {
    symbol: String(row.Code || input).toUpperCase(),
    name: clean(row.Name) || input,
    market: eastmoneyMarket(row),
    quoteId: row.QuoteID || ""
  };
}

function eastmoneyMarket(row) {
  const type = String(row.SecurityTypeName || row.Classify || row.JYS || "").toUpperCase();
  if (type.includes("沪") || String(row.QuoteID || "").startsWith("1.")) return "SH";
  if (type.includes("深") || String(row.QuoteID || "").startsWith("0.")) return "SZ";
  if (type.includes("港") || type.includes("HK")) return "HK";
  if (type.includes("US") || type.includes("NASDAQ") || type.includes("NYSE") || type.includes("美")) return "US";
  return inferMarket(String(row.Code || ""));
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/app-version" && req.method === "GET") {
    return json(res, 200, { data: await appVersionInfo() });
  }

  if (url.pathname === "/api/dev-config" && req.method === "GET") {
    return json(res, 200, {
      data: {
        defaultUsername: "",
        defaultPassword: ACCESS_PASSWORD === "change-me" ? "change-me" : "",
        allowSignup: ALLOW_SIGNUP,
        signupCodeRequired: Boolean(SIGNUP_CODE)
      }
    });
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const username = cleanUsername(body.username || DEFAULT_USERNAME);
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!verifyPassword(body.password, user)) return json(res, 401, { ok: false, message: "用户名或密码不正确" });
    if (isUserExpired(user)) return json(res, 403, { ok: false, message: "账号已到期，请联系管理员" });
    updateUserActivity(user.id);
    const activeUser = db.prepare("SELECT id, username, displayName, expiresAt, lastActiveAt, dsaDailyLimit FROM users WHERE id = ?").get(user.id);
    return json(res, 200, { ok: true, user: publicUser(activeUser) }, {
      "set-cookie": `session=${createSessionCookie(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`
    });
  }

  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    if (!ALLOW_SIGNUP) return json(res, 403, { ok: false, message: "当前未开放注册" });
    const body = await readBody(req);
    if (SIGNUP_CODE && body.signupCode !== SIGNUP_CODE) return json(res, 403, { ok: false, message: "注册码不正确" });
    const username = cleanUsername(body.username);
    const displayName = cleanDisplayName(body.displayName || "");
    const passwordValue = String(body.password || "");
    if (username.length < 2) return json(res, 400, { ok: false, message: "用户名至少 2 个字符" });
    if (passwordValue.length < 6) return json(res, 400, { ok: false, message: "密码至少 6 位" });
    const password = hashPassword(passwordValue);
    const expiresAt = parseAccountExpiryDate(body.expiresAt);
    try {
      const result = db.prepare("INSERT INTO users (username, displayName, passwordHash, salt, expiresAt, lastActiveAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(username, displayName, password.hash, password.salt, expiresAt, nowIso(), nowIso(), nowIso());
      const newUser = { id: Number(result.lastInsertRowid), username, displayName, expiresAt, lastActiveAt: nowIso(), dsaDailyLimit: DEFAULT_DSA_DAILY_LIMIT };
      return json(res, 201, { ok: true, user: publicUser(newUser) }, {
        "set-cookie": `session=${createSessionCookie(newUser)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`
      });
    } catch {
      return json(res, 409, { ok: false, message: "用户名已存在" });
    }
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    return json(res, 200, { ok: true }, { "set-cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  const user = currentUser(req);
  if (!user) return json(res, 401, { ok: false, message: "请先登录或账号已到期" });
  updateUserActivity(user.id);

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    return json(res, 200, { data: user });
  }

  if (url.pathname === "/api/auth/password" && req.method === "PATCH") {
    const body = await readBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (newPassword.length < 6) return json(res, 400, { message: "新密码至少 6 位" });
    if (newPassword !== confirmPassword) return json(res, 400, { message: "两次输入的新密码不一致" });
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    if (!verifyPassword(currentPassword, row)) return json(res, 403, { message: "当前密码不正确" });
    const password = hashPassword(newPassword);
    db.prepare("UPDATE users SET passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?")
      .run(password.hash, password.salt, nowIso(), user.id);
    return json(res, 200, { ok: true, message: "密码已修改" });
  }

  if (url.pathname === "/api/report-settings" && req.method === "GET") {
    return json(res, 200, { data: publicReportSettings(user.id), updatedAt: nowIso(), stale: false });
  }

  if (url.pathname === "/api/report-settings" && req.method === "PATCH") {
    try {
      const body = await readBody(req);
      return json(res, 200, { data: saveReportSettings(user.id, body), updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/preferences/sector-flow" && req.method === "GET") {
    try {
      const targetUserId = targetUserIdForRequest(user, url);
      return json(res, 200, { data: publicSectorFlowPreference(targetUserId), userId: targetUserId, updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 403, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/preferences/sector-flow" && req.method === "PATCH") {
    try {
      const body = await readBody(req);
      const targetUserId = targetUserIdForRequest(user, url, body);
      return json(res, 200, { data: { exists: true, ...saveSectorFlowPreference(targetUserId, body) }, userId: targetUserId, updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/reports/watchlist-daily/test" && req.method === "POST") {
    try {
      const result = await sendWatchlistDailyReport(user, { isTest: true });
      return json(res, 200, { data: result, message: reportSendMessage(result), updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/admin/users" && req.method === "GET") {
    try {
      requireAdmin(user);
      return json(res, 200, { data: await listAdminUsers(), updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 403, { message: readableError(error) });
    }
  }

  if (url.pathname === "/api/admin/reports/watchlist-daily/logs" && req.method === "GET") {
    try {
      requireAdmin(user);
      const rows = db.prepare(`
        SELECT r.reportDate, r.isTest, r.status, r.channels, r.summary, r.errorMessage, r.createdAt, r.sentAt,
               u.id AS userId, u.username, u.displayName
        FROM watchlist_daily_reports r
        JOIN users u ON u.id = r.userId
        ORDER BY r.createdAt DESC
        LIMIT 80
      `).all();
      return json(res, 200, {
        data: rows.map((row) => ({ ...publicReportLog(row), userId: row.userId, username: row.username, displayName: row.displayName || "" })),
        updatedAt: nowIso(),
        stale: false
      });
    } catch (error) {
      return json(res, 403, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/admin/users" && req.method === "POST") {
    try {
      requireAdmin(user);
      const body = await readBody(req);
      const username = cleanUsername(body.username);
      const displayName = cleanDisplayName(body.displayName || "");
      const passwordValue = String(body.password || "");
      if (username.length < 2) return json(res, 400, { message: "用户名至少 2 个字符" });
      if (!displayName) return json(res, 400, { message: "名称不能为空" });
      if (passwordValue.length < 6) return json(res, 400, { message: "密码至少 6 位" });
      const password = hashPassword(passwordValue);
      const expiresAt = parseAccountExpiryDate(body.expiresAt);
      const dsaDailyLimit = parseDsaDailyLimit(body.dsaDailyLimit);
      db.prepare("INSERT INTO users (username, displayName, passwordHash, salt, expiresAt, dsaDailyLimit, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(username, displayName, password.hash, password.salt, expiresAt, dsaDailyLimit, nowIso(), nowIso());
      return json(res, 201, { data: await listAdminUsers() });
    } catch (error) {
      return json(res, /UNIQUE/i.test(String(error.message)) ? 409 : 400, { message: /UNIQUE/i.test(String(error.message)) ? "用户名已存在" : readableError(error) });
    }
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch && req.method === "PATCH") {
    try {
      requireAdmin(user);
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(adminUserMatch[1]);
      if (!target) return json(res, 404, { message: "用户不存在" });
      if (target.username === cleanUsername(DEFAULT_USERNAME)) return json(res, 400, { message: "管理员账号不设置到期时间" });
      const body = await readBody(req);
      const expiresAt = parseAccountExpiryDate(body.expiresAt);
      const dsaDailyLimit = parseDsaDailyLimit(body.dsaDailyLimit, target.dsaDailyLimit);
      db.prepare("UPDATE users SET expiresAt = ?, dsaDailyLimit = ?, updatedAt = ? WHERE id = ?")
        .run(expiresAt, dsaDailyLimit, nowIso(), adminUserMatch[1]);
      return json(res, 200, { data: await listAdminUsers() });
    } catch (error) {
      return json(res, 400, { message: readableError(error) });
    }
  }

  const resetPasswordMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/password$/);
  if (resetPasswordMatch && req.method === "PATCH") {
    try {
      requireAdmin(user);
      const body = await readBody(req);
      const passwordValue = String(body.password || "");
      if (passwordValue.length < 6) return json(res, 400, { message: "密码至少 6 位" });
      const target = db.prepare("SELECT id FROM users WHERE id = ?").get(resetPasswordMatch[1]);
      if (!target) return json(res, 404, { message: "用户不存在" });
      const password = hashPassword(passwordValue);
      db.prepare("UPDATE users SET passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?")
        .run(password.hash, password.salt, nowIso(), resetPasswordMatch[1]);
      return json(res, 200, { data: await listAdminUsers() });
    } catch (error) {
      return json(res, 403, { message: readableError(error) });
    }
  }

  if (url.pathname === "/api/admin/dsa/watchlist-analysis" && req.method === "POST") {
    try {
      requireAdmin(user);
      const body = await readBody(req);
      return json(res, 200, await triggerAdminWatchlistAnalysis(user, body));
    } catch (error) {
      const status = error.message === "需要管理员权限" ? 403 : (DSA_API_BASE_URL ? 502 : 400);
      return json(res, status, { message: readableError(error), errorMessage: readableError(error), quota: dsaQuotaForUser(user) });
    }
  }

  if (url.pathname === "/api/market/overview" && req.method === "GET") {
    return json(res, 200, await cached("market", 15_000, loadMarketOverview));
  }

  if (/^\/api\/market\/(?:a-share-analysis|ashare-analysis|a-share|breadth)\/?$/.test(url.pathname) && req.method === "GET") {
    return json(res, 200, await cached("a-share-analysis", 30_000, loadAShareAnalysis));
  }

  if (url.pathname === "/api/news/jin10" && req.method === "GET") {
    const limit = clampLimit(url.searchParams.get("limit"));
    return json(res, 200, await cached(`jin10:${limit}`, 60_000, () => loadJin10(limit)));
  }

  if (url.pathname === "/api/news/eastmoney-hot" && req.method === "GET") {
    const limit = clampLimit(url.searchParams.get("limit"));
    return json(res, 200, await cached(`eastmoney-news:${limit}`, 120_000, () => loadEastmoneyNewsHot(limit)));
  }

  if (url.pathname === "/api/dsa/config" && req.method === "GET") {
    return json(res, 200, {
      data: {
        configured: Boolean(DSA_API_BASE_URL),
        baseUrl: DSA_API_BASE_URL,
        quota: dsaQuotaForUser(user)
      },
      updatedAt: nowIso(),
      stale: false
    });
  }

  if (url.pathname === "/api/dsa/analysis" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const clientUserId = dsaClientUserId(user, url, body);
      ensureDsaQuotaAvailable(user);
      const result = await triggerDsaAnalysis({ ...body, clientUserId });
      const quota = result.duplicateExistingTask ? dsaQuotaForUser(user) : incrementDsaUsage(user);
      return json(res, 200, { ...result, quota });
    } catch (error) {
      const status = error.status || (DSA_API_BASE_URL ? 502 : 400);
      return json(res, status, { message: readableError(error), errorMessage: readableError(error), quota: error.quota });
    }
  }

  const dsaTaskMatch = url.pathname.match(/^\/api\/dsa\/tasks\/([^/]+)$/);
  if (dsaTaskMatch && req.method === "GET") {
    try {
      const taskId = decodeURIComponent(dsaTaskMatch[1]);
      const clientUserId = dsaClientUserId(user, url);
      return json(res, 200, { data: await fetchDsaJson(`/api/v1/analysis/status/${encodeURIComponent(taskId)}`, { params: { client_user_id: clientUserId } }), updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, DSA_API_BASE_URL ? 502 : 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/dsa/history" && req.method === "GET") {
    try {
      const clientUserId = dsaClientUserId(user, url);
      const params = {
        stock_code: url.searchParams.get("stockCode") || url.searchParams.get("stock_code") || "",
        page: url.searchParams.get("page") || 1,
        limit: url.searchParams.get("limit") || 20,
        client_user_id: clientUserId
      };
      return json(res, 200, { data: await fetchDsaJson("/api/v1/history", { params }), updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, DSA_API_BASE_URL ? 502 : 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/dsa/history" && req.method === "DELETE") {
    try {
      const body = await readBody(req);
      const clientUserId = dsaClientUserId(user, url, body);
      const recordIds = Array.isArray(body.recordIds) ? body.recordIds : Array.isArray(body.record_ids) ? body.record_ids : [];
      return json(res, 200, {
        data: await fetchDsaJson("/api/v1/history", {
          params: { client_user_id: clientUserId },
          method: "DELETE",
          body: { record_ids: recordIds }
        }),
        updatedAt: nowIso(),
        stale: false
      });
    } catch (error) {
      return json(res, DSA_API_BASE_URL ? 502 : 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  const dsaHistoryMatch = url.pathname.match(/^\/api\/dsa\/history\/([^/]+)$/);
  if (dsaHistoryMatch && req.method === "GET") {
    try {
      const recordId = decodeURIComponent(dsaHistoryMatch[1]);
      const clientUserId = dsaClientUserId(user, url);
      return json(res, 200, { data: await fetchDsaJson(`/api/v1/history/${encodeURIComponent(recordId)}`, { params: { client_user_id: clientUserId } }), updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, DSA_API_BASE_URL ? 502 : 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/hot-stocks" && req.method === "GET") {
    const limit = clampLimit(url.searchParams.get("limit"));
    return json(res, 200, await cached(`hot-stocks:${limit}`, 180_000, () => loadEastmoneyHotStocks(limit)));
  }

  if (url.pathname === "/api/hot-sectors" && req.method === "GET") {
    const limit = clampLimit(url.searchParams.get("limit"));
    return json(res, 200, await cached(`hot-sectors:${limit}`, 180_000, () => loadEastmoneyHotSectors(limit)));
  }

  if (url.pathname === "/api/mainlines" && req.method === "GET") {
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 30) || 30));
    return json(res, 200, await cached(`mainlines:${limit}`, 180_000, () => loadEastmoneyMainlines(limit)));
  }

  if (url.pathname === "/api/sectors/flow/dates" && req.method === "GET") {
    return json(res, 200, await cached("sector-dates:flow", 60_000, async () => ({ dates: await loadSectorFlowDates() })));
  }

  if (url.pathname === "/api/sectors/flow/series" && req.method === "GET") {
    const date = clean(url.searchParams.get("date") || "latest");
    const ttl = date === "latest" ? 60_000 : 10 * 60_000;
    return json(res, 200, await cached(`sector-flow:${date}`, ttl, () => loadSectorFlowSeries(date)));
  }

  if (url.pathname === "/api/sectors/ranking/dates" && req.method === "GET") {
    return json(res, 200, await cached("sector-dates:ranking", 10 * 60_000, async () => ({ dates: await loadSectorRankingDates() })));
  }

  if (url.pathname === "/api/sectors/ranking" && req.method === "GET") {
    const date = clean(url.searchParams.get("date") || "latest");
    const ttl = date === "latest" ? 10 * 60_000 : 60 * 60_000;
    return json(res, 200, await cached(`sector-ranking:${date}`, ttl, () => loadSectorRanking(date)));
  }

  const sectorStocksMatch = url.pathname.match(/^\/api\/sectors\/([^/]+)\/stocks$/);
  if (sectorStocksMatch && req.method === "GET") {
    const code = decodeURIComponent(sectorStocksMatch[1]);
    const limit = clampLimit(url.searchParams.get("limit") || 20);
    return json(res, 200, await cached(`sector-stocks:${code}:${limit}`, 180_000, () => loadEastmoneySectorStocks(code, limit)));
  }

  if (url.pathname === "/api/stocks/lookup" && req.method === "GET") {
    return json(res, 200, { data: await lookupStock(url.searchParams.get("symbol")) });
  }

  if (url.pathname === "/api/stocks/search" && req.method === "GET") {
    const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
    const limit = clampLimit(url.searchParams.get("limit") || 8);
    return json(res, 200, await cached(`stock-search:${query}:${limit}`, 120_000, () => searchStocks(query, limit)));
  }

  const stockQuoteMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/quote$/);
  if (stockQuoteMatch && req.method === "GET") {
    const symbol = decodeURIComponent(stockQuoteMatch[1]);
    return json(res, 200, await cached(`stock-quote:${symbol}`, 15_000, () => loadStockRealtimeQuote(symbol)));
  }

  const stockFundsMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/funds$/);
  if (stockFundsMatch && req.method === "GET") {
    const symbol = decodeURIComponent(stockFundsMatch[1]);
    return json(res, 200, await cached(`stock-funds:${symbol}`, 30_000, () => loadStockFundFlow(symbol)));
  }

  const stockChartMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/chart$/);
  if (stockChartMatch && req.method === "GET") {
    const symbol = decodeURIComponent(stockChartMatch[1]);
    const period = clean(url.searchParams.get("period") || "daily");
    return json(res, 200, await cached(`stock-chart:${symbol}:${period}`, period === "minute" ? 15_000 : 180_000, () => loadStockChart(symbol, period)));
  }

  const stockTagsMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/tags$/);
  if (stockTagsMatch && req.method === "GET") {
    try {
      const symbol = decodeURIComponent(stockTagsMatch[1]);
      const limit = clampLimit(url.searchParams.get("limit") || 8);
      const info = await lookupStock(symbol);
      const tags = ["SH", "SZ"].includes(info.market)
        ? await cached(`stock-tags:${info.symbol}:${limit}`, 300_000, () => loadEastmoneyConceptTags(info.symbol, info.market).then((rows) => rows.slice(0, limit)))
        : [];
      return json(res, 200, { data: tags, stock: info, updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/content/detail" && req.method === "GET") {
    const detailUrl = url.searchParams.get("url") || "";
    const title = clean(url.searchParams.get("title") || "");
    const source = clean(url.searchParams.get("source") || "");
    return json(res, 200, await cached(`detail:${detailUrl || title}`, 300_000, () => loadContentDetail(detailUrl, title, source)));
  }

  if (url.pathname === "/api/watchlist" && req.method === "GET") {
    try {
      const targetUserId = targetUserIdForRequest(user, url);
      return json(res, 200, { data: await listWatchlistDetailed(targetUserId), userId: targetUserId, updatedAt: nowIso(), stale: false });
    } catch (error) {
      return json(res, 403, { message: readableError(error) });
    }
  }

  if (url.pathname === "/api/watchlist/import-image" && req.method === "POST") {
    try {
      const targetUserId = targetUserIdForRequest(user, url);
      return json(res, 200, { ...(await prepareWatchlistImport(req, targetUserId)), userId: targetUserId });
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/watchlist/import-confirm" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const targetUserId = targetUserIdForRequest(user, url, body);
      return json(res, 200, { ...(await confirmWatchlistImport(targetUserId, body.items)), userId: targetUserId });
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  if (url.pathname === "/api/watchlist" && req.method === "POST") {
    const body = await readBody(req);
    let targetUserId;
    try {
      targetUserId = targetUserIdForRequest(user, url, body);
    } catch (error) {
      return json(res, 403, { message: readableError(error) });
    }
    let info;
    try {
      info = await lookupStock(body.symbol);
    } catch (error) {
      return json(res, 400, { message: readableError(error) });
    }
    const symbol = info.symbol;
    const name = info.name;
    const market = info.market;
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : Date.now();
    const costPrice = nullableNumber(body.costPrice);
    const position = nullableNumber(body.position);
    try {
      const stmt = db.prepare("INSERT INTO watchlist (userId, symbol, name, market, sortOrder, costPrice, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      stmt.run(targetUserId, symbol, name, market, sortOrder, costPrice, position, nowIso(), nowIso());
      return json(res, 201, { data: await listWatchlistDetailed(targetUserId), userId: targetUserId });
    } catch (error) {
      return json(res, 409, { message: "自选股已存在", errorMessage: readableError(error) });
    }
  }

  const watchMatch = url.pathname.match(/^\/api\/watchlist\/(\d+)$/);
  if (watchMatch && req.method === "PATCH") {
    const body = await readBody(req);
    let targetUserId;
    try {
      targetUserId = targetUserIdForRequest(user, url, body);
    } catch (error) {
      return json(res, 403, { message: readableError(error) });
    }
    const existing = db.prepare("SELECT * FROM watchlist WHERE id = ? AND userId = ?").get(watchMatch[1], targetUserId);
    if (!existing) return json(res, 404, { message: "自选股不存在" });
    db.prepare("UPDATE watchlist SET symbol = ?, name = ?, market = ?, sortOrder = ?, costPrice = ?, position = ?, updatedAt = ? WHERE id = ? AND userId = ?").run(
      clean(body.symbol || existing.symbol).toUpperCase(),
      clean(body.name || existing.name),
      clean(body.market || existing.market).toUpperCase(),
      Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : existing.sortOrder,
      "costPrice" in body ? nullableNumber(body.costPrice) : existing.costPrice,
      "position" in body ? nullableNumber(body.position) : existing.position,
      nowIso(),
      watchMatch[1],
      targetUserId
    );
    return json(res, 200, { data: await listWatchlistDetailed(targetUserId), userId: targetUserId });
  }

  if (watchMatch && req.method === "DELETE") {
    try {
      const targetUserId = targetUserIdForRequest(user, url);
      db.prepare("DELETE FROM watchlist WHERE id = ? AND userId = ?").run(watchMatch[1], targetUserId);
      return json(res, 200, { data: await listWatchlistDetailed(targetUserId), userId: targetUserId });
    } catch (error) {
      return json(res, 403, { message: readableError(error) });
    }
  }

  const announcementsMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/announcements$/);
  if (announcementsMatch && req.method === "GET") {
    const symbol = decodeURIComponent(announcementsMatch[1]);
    const limit = clampLimit(url.searchParams.get("limit") || 8);
    return json(res, 200, await cached(`announcements:${symbol}:${limit}`, 300_000, () => loadStockAnnouncements(symbol, limit)));
  }

  const stockEastmoneyNewsMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/eastmoney-news$/);
  if (stockEastmoneyNewsMatch && req.method === "GET") {
    const symbol = decodeURIComponent(stockEastmoneyNewsMatch[1]);
    const limit = clampLimit(url.searchParams.get("limit") || 8);
    return json(res, 200, await cached(`stock-eastmoney-news:${symbol}:${limit}`, 300_000, () => loadEastmoneyStockNews(symbol, limit)));
  }

  const dsaNewsContextMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/dsa-news-context$/);
  if (dsaNewsContextMatch && req.method === "GET") {
    try {
      const symbol = decodeURIComponent(dsaNewsContextMatch[1]);
      const legacyLimit = url.searchParams.get("limit");
      const newsLimit = url.searchParams.get("newsLimit") || legacyLimit || 8;
      const announcementLimit = url.searchParams.get("announcementLimit") || legacyLimit || 8;
      const aiLimit = url.searchParams.get("aiLimit") || 12;
      return json(res, 200, await loadDsaNewsContext(symbol, { newsLimit, announcementLimit, aiLimit }));
    } catch (error) {
      return json(res, 400, { message: readableError(error), errorMessage: readableError(error) });
    }
  }

  const postsMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/posts$/);
  if (postsMatch && req.method === "GET") {
    const symbol = decodeURIComponent(postsMatch[1]);
    const source = "guba";
    const limit = clampLimit(url.searchParams.get("limit"));
    const key = `posts:${source}:${symbol}:${limit}`;
    return json(res, 200, await cached(key, 180_000, () => loadPosts(symbol, source, limit)));
  }

  return json(res, 404, { message: "接口不存在" });
}

async function appVersionInfo() {
  const files = ["index.html", "app.js", "styles.css", "manifest.webmanifest", "service-worker.js", "icon.svg", "apple-touch-icon.svg"];
  const parts = await Promise.all(files.map(async (file) => {
    const info = await stat(path.join(publicDir, file));
    return `${file}:${Math.floor(info.mtimeMs)}:${info.size}`;
  }));
  const version = crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
  return { version, updatedAt: nowIso() };
}

async function loadContentDetail(detailUrl, title, source) {
  if (!detailUrl || !/^https?:\/\//.test(detailUrl)) {
    return { title, source, content: title || "暂无正文", url: "" };
  }
  const normalizedUrl = normalizeArticleUrl(detailUrl);
  if (source === "东方财富公告" || /\/notices\/detail\//i.test(normalizedUrl)) {
    return loadAnnouncementDetail(normalizedUrl, title, source);
  }
  const html = await fetchText(normalizedUrl, {
    allowCurlFallback: true,
    headers: {
      referer: articleReferer(normalizedUrl)
    }
  });
  if (/\/\/guba\.eastmoney\.com\/news,/i.test(normalizedUrl)) {
    const article = await extractGubaArticle(html, normalizedUrl, title);
    return {
      title: article.title || title || extractTitle(html) || detailUrl,
      source: source || "股吧",
      content: article.content || title || "该页面未解析到正文。",
      blocks: article.blocks?.length ? article.blocks : textToBlocks(article.content || title || "该页面未解析到正文。"),
      url: normalizedUrl
    };
  }
  const article = extractReadableArticle(html, normalizedUrl);
  const rawContent = article.content || extractReadableText(html);
  const content = /\/\/flash\.jin10\.com\/detail\//.test(normalizedUrl)
    ? cleanJin10FlashDetailText(rawContent, title)
    : rawContent;
  return {
    title: title || extractTitle(html) || detailUrl,
    source,
    content: content || title || "该页面未解析到正文。",
    blocks: article.blocks?.length ? article.blocks : textToBlocks(content || title || "该页面未解析到正文。"),
    url: normalizedUrl
  };
}

async function loadAnnouncementDetail(detailUrl, title, source) {
  const artCode = clean(detailUrl.match(/(AN\d{18,})/i)?.[1] || "");
  if (!artCode) {
    return {
      title,
      source,
      content: "公告正文暂未取得，请打开原文查看。",
      blocks: announcementFallbackBlocks(detailUrl),
      url: detailUrl
    };
  }
  const raw = await fetchJson(`https://np-cnotice-stock.eastmoney.com/api/content/ann?art_code=${encodeURIComponent(artCode)}&client_source=web&page_index=1`, {
    allowCurlFallback: true,
    headers: { referer: "https://data.eastmoney.com/" }
  });
  const data = raw?.data || {};
  const content = cleanAnnouncementContent(data.notice_content || "");
  const pdfUrl = clean(data.attach_url_web || data.attach_url || data.attach_list?.[0]?.attach_url || "");
  const blocks = content
    ? announcementTextToBlocks(content)
    : [{ type: "paragraph", text: "公告正文暂未取得，请打开原文查看。" }];
  const replies = await loadAnnouncementReplies(artCode, detailUrl).catch(() => []);
  if (replies.length) {
    blocks.push({ type: "reply-heading", text: `公告评论（${replies.length}）` });
    blocks.push(...replies);
  }
  if (pdfUrl) blocks.push({ type: "meta", text: `原文PDF：${pdfUrl}` });
  return {
    title: title || cleanHtml(data.notice_title || data.title || "公告详情"),
    source: source || "东方财富公告",
    content: content || "公告正文暂未取得，请打开原文查看。",
    blocks,
    url: pdfUrl || detailUrl
  };
}

function cleanAnnouncementContent(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/东方财富网\s*>\s*数据中心\s*>\s*公告大全[\s\S]*?(?=\n|$)/g, "")
    .replace(/东方财富网\s*>[\s\S]*?公告正文/g, "")
    .replace(/(重要内容提示|特别提示|风险提示|释义)[:：]/g, "\n$&\n")
    .replace(/([。；;])\s*((?:一|二|三|四|五|六|七|八|九|十)[、.．])/g, "$1\n\n$2")
    .replace(/([。；;])\s*(\d+[、.．])/g, "$1\n$2")
    .replace(/\s+(特此公告[。!！]?)/g, "\n\n$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function announcementTextToBlocks(content) {
  const lines = String(content || "")
    .replace(/\r/g, "\n")
    .replace(/\u3000/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const blocks = [];
  for (const line of lines) {
    const text = line.replace(/^公告正文\s*/g, "").trim();
    if (!text) continue;
    if (isAnnouncementTableLine(text)) {
      blocks.push({ type: "announcement-table", text });
      continue;
    }
    if (isAnnouncementSectionLine(text)) {
      blocks.push({ type: "announcement-section", text });
      continue;
    }
    if (/^(重要内容提示|特别提示|风险提示|释义)[:：]/.test(text) || /^特此公告[。!！]?$/.test(text)) {
      blocks.push({ type: "announcement-important", text });
      continue;
    }
    blocks.push({ type: "announcement-paragraph", text });
  }
  return blocks.length ? mergeAnnouncementTableBlocks(blocks) : textToBlocks(content);
}

function isAnnouncementSectionLine(text) {
  return /^(一|二|三|四|五|六|七|八|九|十)[、.．]/.test(text)
    || /^（[一二三四五六七八九十]+）/.test(text)
    || /^\d+[、.．]/.test(text);
}

function isAnnouncementTableLine(text) {
  const numericTokens = text.match(/(?:\d[\d,]*(?:\.\d+)?%?|\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/g) || [];
  const columnWords = ["股东", "名称", "持股", "股份", "比例", "数量", "日期", "质押", "解除", "本次", "合计", "证券"];
  const columnHits = columnWords.filter((word) => text.includes(word)).length;
  return text.length >= 28 && (numericTokens.length >= 5 || (numericTokens.length >= 3 && columnHits >= 3));
}

function mergeAnnouncementTableBlocks(blocks) {
  const merged = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (block.type === "announcement-table" && previous?.type === "announcement-table") {
      previous.text += `\n${block.text}`;
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

function announcementFallbackBlocks(detailUrl) {
  return [
    { type: "paragraph", text: "公告正文暂未取得，请打开原文查看。" },
    ...(detailUrl ? [{ type: "meta", text: `原文链接：${detailUrl}` }] : [])
  ];
}

async function loadAnnouncementReplies(artCode, pageUrl) {
  if (!artCode) return [];
  const raw = await fetchAnnouncementReplyData(artCode, pageUrl);
  return replyRowsToBlocks(raw, pageUrl).slice(0, 10);
}

async function fetchAnnouncementReplyData(artCode, pageUrl) {
  const param = new URLSearchParams({
    postid: artCode,
    type: "3",
    sort: "1",
    sorttype: "1",
    p: "1",
    ps: "10"
  }).toString();
  const attempts = [
    () => fetchJson(`https://gbapi.eastmoney.com/reply/api/Reply/ArticleNewReplyList?postid=${encodeURIComponent(artCode)}&type=3&sort=1&sorttype=1&p=1&ps=10&plat=Web&version=2022&product=Guba`, {
      allowCurlFallback: true,
      headers: { origin: "https://guba.eastmoney.com", referer: pageUrl }
    }),
    () => fetchJson("https://guba.eastmoney.com/api/getData?path=reply%2Fapi%2FReply%2FArticleNewReplyList", {
      method: "POST",
      body: new URLSearchParams({
        param,
        plat: "Web",
        path: "reply/api/Reply/ArticleNewReplyList",
        env: "2",
        origin: "",
        version: "2022",
        product: "Guba"
      }).toString(),
      allowCurlFallback: true,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: pageUrl
      }
    }),
    () => fetchJson(`https://gbapi.eastmoney.com/newsreply/api/Reply/ArticleNewReplyList?postid=${encodeURIComponent(artCode)}&type=3&sort=1&sorttype=1&p=1&ps=10&plat=Web&version=2022&product=EastMoney`, {
      allowCurlFallback: true,
      headers: { origin: "https://data.eastmoney.com", referer: pageUrl }
    })
  ];
  for (const attempt of attempts) {
    const raw = await attempt().catch(() => null);
    if (raw && replyRows(raw).length) return raw;
  }
  return {};
}

function replyRows(raw) {
  return [
    ...(Array.isArray(raw?.re) ? raw.re : []),
    ...(Array.isArray(raw?.result) ? raw.result : []),
    ...(Array.isArray(raw?.reply_list) ? raw.reply_list : []),
    ...(Array.isArray(raw?.fake_reply_list) ? raw.fake_reply_list : []),
    ...(Array.isArray(raw?.data?.list) ? raw.data.list : []),
    ...(Array.isArray(raw?.data?.reply_list) ? raw.data.reply_list : [])
  ];
}

function replyRowsToBlocks(raw, pageUrl) {
  return replyRows(raw).map((row) => {
    const textValue = cleanArticleHtml(row.reply_text || row.content || row.post_content || row.reply_content || row.short_reply || "");
    const images = [
      row.reply_picture,
      ...(Array.isArray(row.reply_pic_url) ? row.reply_pic_url : []),
      ...(Array.isArray(row.reply_pic_url2) ? row.reply_pic_url2 : [])
    ].map((item) => normalizeImageUrl(typeof item === "string" ? item : item?.url || item?.src || "", pageUrl)).filter(Boolean);
    const childText = Array.isArray(row.child_replys)
      ? row.child_replys.slice(0, 3).map((child) => {
        const author = clean(child.reply_user?.user_nickname || child.user_nickname || "股友");
        const text = cleanArticleHtml(child.reply_text || child.content || "");
        return text ? `${author}：${text}` : "";
      }).filter(Boolean).join("\n")
      : "";
    return {
      type: "reply",
      author: clean(row.reply_user?.user_nickname || row.user_nickname || row.user?.user_nickname || row.replyer || "股友"),
      time: clean(row.reply_time || row.reply_publish_time || row.post_publish_time || row.reply_date || ""),
      text: [textValue, childText].filter(Boolean).join("\n"),
      images: uniqueBy(images, (src) => src).slice(0, 6)
    };
  }).filter((reply) => reply.text || reply.images.length);
}

async function extractGubaArticle(html, pageUrl, fallbackTitle) {
  const post = extractJsVariableObject(html, "post_article") || {};
  const title = cleanHtml(post.post_title || fallbackTitle || extractTitle(html));
  const meta = [
    post.post_user?.user_nickname ? `作者：${clean(post.post_user.user_nickname)}` : "",
    post.post_publish_time ? `时间：${clean(post.post_publish_time)}` : "",
    post.post_click_count != null || post.post_comment_count != null
      ? `阅读：${post.post_click_count ?? "-"} / 回复：${post.post_comment_count ?? "-"}`
      : ""
  ].filter(Boolean);
  const blocks = meta.map((textValue) => ({ type: "meta", text: textValue }));
  const contentBlocks = extractArticleBlocks(post.post_content || "", pageUrl);
  blocks.push(...contentBlocks);
  const inlineImageUrls = new Set(contentBlocks.filter((block) => block.type === "image").map((block) => block.src));
  for (const src of gubaPostImageUrls(post, pageUrl)) {
    if (!inlineImageUrls.has(src)) {
      blocks.push({ type: "image", src, alt: title });
      inlineImageUrls.add(src);
    }
  }
  const replies = await loadGubaReplies(post, pageUrl).catch(() => []);
  if (replies.length) {
    blocks.push({ type: "meta", text: `回复（${replies.length}）` });
    blocks.push(...replies);
  } else if (Number(post.post_comment_count) > 0) {
    blocks.push({ type: "meta", text: `回复：${post.post_comment_count} 条，公开接口本次暂未返回回复内容。` });
  }
  const textContent = blocks
    .filter((block) => ["paragraph", "meta", "reply"].includes(block.type))
    .map((block) => block.type === "reply" ? `${block.author || "股友"}：${block.text || ""}` : block.text)
    .filter(Boolean)
    .join("\n\n");
  return {
    title,
    content: textContent.slice(0, 20_000),
    blocks: dedupeArticleBlocks(blocks).slice(0, 220)
  };
}

function extractJsVariableObject(html, variableName) {
  const source = String(html || "");
  const declaration = source.match(new RegExp(`\\bvar\\s+${variableName}\\s*=`, "i"));
  const start = declaration ? declaration.index : source.indexOf(`${variableName}=`);
  if (start < 0) return null;
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return null;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const raw = source.slice(braceStart, index + 1);
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function gubaPostImageUrls(post, pageUrl) {
  const values = [
    ...(Array.isArray(post.post_pic_url) ? post.post_pic_url : []),
    ...(Array.isArray(post.post_pic_url2) ? post.post_pic_url2 : [])
  ];
  return uniqueBy(values
    .map((item) => normalizeImageUrl(typeof item === "string" ? item : item?.url || item?.src || "", pageUrl))
    .filter((src) => src && !isNoiseImageUrl(src)), (src) => src);
}

async function loadGubaReplies(post, pageUrl) {
  if (!post?.post_id) return [];
  const raw = await fetchGubaReplyData(post, pageUrl);
  return replyRowsToBlocks(raw, pageUrl).slice(0, 10);
}

async function fetchGubaReplyData(post, pageUrl) {
  const param = new URLSearchParams({
    postid: String(post.post_id),
    sort: "1",
    sorttype: "1",
    p: "1",
    ps: "10"
  }).toString();
  const body = new URLSearchParams({
    param,
    plat: "Web",
    path: "reply/api/Reply/ArticleNewReplyList",
    env: "2",
    origin: "",
    version: "2022",
    product: "Guba"
  }).toString();
  const code = post.post_guba?.stockbar_code || "";
  const pathValue = "reply/api/Reply/ArticleNewReplyList";
  const url = `https://guba.eastmoney.com/api/getData?${code ? `code=${encodeURIComponent(code)}&` : ""}path=${encodeURIComponent(pathValue)}`;
  const proxy = await fetchJson(url, {
    method: "POST",
    body,
    allowCurlFallback: true,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: pageUrl
    }
  }).catch(() => null);
  if (proxy && hasGubaReplyRows(proxy)) return proxy;
  return fetchJson(`https://gbapi.eastmoney.com/reply/api/Reply/ArticleNewReplyList?postid=${encodeURIComponent(post.post_id)}&sort=1&sorttype=1&p=1&ps=10&plat=Web&version=2022&product=Guba`, {
    allowCurlFallback: true,
    headers: {
      origin: "https://guba.eastmoney.com",
      referer: pageUrl
    }
  });
}

function hasGubaReplyRows(raw) {
  return replyRows(raw).some((row) => row.reply_text || row.reply_content || row.reply_user || row.child_replys);
}

function normalizeArticleUrl(detailUrl) {
  if (/^http:\/\/finance\.eastmoney\.com\//i.test(detailUrl)) return detailUrl.replace(/^http:/i, "https:");
  return detailUrl;
}

function articleReferer(detailUrl) {
  if (/eastmoney\.com/i.test(detailUrl)) return "https://finance.eastmoney.com/";
  if (/jin10\.com/i.test(detailUrl)) return "https://www.jin10.com/";
  return detailUrl;
}

function cleanJin10FlashDetailText(content, title) {
  const lines = String(content || "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !["首页", "快讯详情", "书签", "分享：", "微信扫码分享"].includes(line));
  const titleIndex = lines.findIndex((line) => line === title || line.includes(title));
  if (titleIndex === -1) return lines.join("\n\n");
  const time = titleIndex > 0 && /^\d{4}-\d{2}-\d{2}/.test(lines[titleIndex - 1]) ? lines[titleIndex - 1] : "";
  const body = lines.slice(titleIndex + 1).join("\n\n");
  return `${lines[titleIndex]}${body ? `\n\n${body}` : ""}${time ? `\n\n时间：${time}` : ""}`;
}

function extractTitle(html) {
  return cleanHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function extractReadableArticle(html, pageUrl) {
  const body = extractArticleHtml(html);
  if (!body) return { content: "", blocks: [] };
  const blocks = extractArticleBlocks(body, pageUrl);
  const textContent = blocks
    .filter((block) => block.type === "paragraph" || block.type === "meta")
    .map((block) => block.text)
    .join("\n\n");
  return {
    content: textContent.slice(0, 20_000),
    blocks: blocks.slice(0, 180)
  };
}

function extractArticleHtml(html) {
  const candidates = [
    /<div[^>]+id="ContentBody"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class="[^"]*res-edit[^"]*"/i,
    /<div[^>]+id="ContentBody"[^>]*>([\s\S]*?)<\/div>\s*<!-- 文尾部其它信息 -->/i,
    /<div[^>]+id="ContentBody"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id="zwconbody"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*(?:article[-_]?content|article[-_]?body|detail[-_]?body|txtinfos|newstext)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i
  ];
  for (const regex of candidates) {
    const match = html.match(regex);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractArticleBlocks(html, pageUrl) {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<p[^>]*display\s*:\s*none[\s\S]*?<\/p>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const blocks = [];
  const tokenRegex = /<(p|h[1-6]|center|figure|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  while ((match = tokenRegex.exec(cleaned))) {
    const token = match[0];
    const imageBlocks = extractImageBlocks(token, pageUrl);
    const text = cleanArticleHtml(token)
      .replace(/分享到微信朋友圈.*$/g, "")
      .replace(/打开微信，.*$/g, "")
      .replace(/责任编辑：.*$/g, "")
      .replace(/原标题：.*$/g, "")
      .replace(/郑重声明：.*$/g, "")
      .replace(/举报.*$/g, "")
      .trim();
    if (text && !isNoiseArticleText(text)) {
      blocks.push({
        type: /^（?文章来源：/.test(text) || /^来源：|^时间：/.test(text) ? "meta" : "paragraph",
        text
      });
    }
    blocks.push(...imageBlocks);
  }
  return dedupeArticleBlocks(blocks);
}

function extractImageBlocks(html, pageUrl) {
  const blocks = [];
  const imageRegex = /<img\b([^>]*)>/gi;
  let match;
  while ((match = imageRegex.exec(html))) {
    const attrs = match[1] || "";
    if (/display\s*:\s*none|em_handle_adv_close|metadata|qrcode|二维码/i.test(attrs)) continue;
    const src = attrValue(attrs, "orginial_src") || attrValue(attrs, "data-original") || attrValue(attrs, "src");
    const imageUrl = normalizeImageUrl(src, pageUrl);
    if (!imageUrl || isNoiseImageUrl(imageUrl)) continue;
    blocks.push({
      type: "image",
      src: imageUrl,
      alt: cleanHtml(attrValue(attrs, "alt") || "")
    });
  }
  return blocks;
}

function attrValue(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? match[1].replace(/&amp;/g, "&") : "";
}

function normalizeImageUrl(src, pageUrl) {
  if (!src || /^data:/i.test(src)) return "";
  try {
    return new URL(src.replace(/^\/\//, "https://"), pageUrl).href;
  } catch {
    return "";
  }
}

function isNoiseImageUrl(src) {
  return /metadata|weixin-share|qrcode|acttg|g1\.dfcfw\.com\/g[34]\/201|_w145h95/i.test(src);
}

function isNoiseArticleText(text) {
  const value = clean(text);
  if (/^(首页|快讯详情|书签|分享：|微信扫码分享|方便，快捷|专业，丰富|提示：|分享到您的|朋友圈)$/.test(value)) return true;
  return isEastmoneyNavigationText(value);
}

function isEastmoneyNavigationText(text) {
  const value = clean(text).replace(/[>›»]+$/g, "");
  const navItems = new Set([
    "财经",
    "焦点",
    "股票",
    "新股",
    "期指",
    "期权",
    "行情",
    "数据",
    "全球",
    "美股",
    "港股",
    "期货",
    "外汇",
    "债券",
    "基金",
    "银行",
    "保险",
    "信托",
    "黄金",
    "博客",
    "股吧"
  ]);
  if (navItems.has(value)) return true;
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length >= 4 && parts.every((part) => navItems.has(part));
}

function dedupeArticleBlocks(blocks) {
  const seenImages = new Set();
  return blocks.filter((block) => {
    if (block.type !== "image") return true;
    if (seenImages.has(block.src)) return false;
    seenImages.add(block.src);
    return true;
  });
}

function textToBlocks(content) {
  return String(content || "暂无正文")
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      type: /^来源：|^时间：|^现价：|^涨跌幅：|^热门标签：/.test(text) ? "meta" : "paragraph",
      text
    }));
}

function extractReadableText(html) {
  const candidates = [
    /<div[^>]+id="ContentBody"[^>]*>([\s\S]*?)<\/div>\s*<!-- 文尾部其它信息 -->/i,
    /<div[^>]+id="ContentBody"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id="zwconbody"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*(?:newstext|article|content|txt|detail)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<body[^>]*>([\s\S]*?)<\/body>/i
  ];
  for (const regex of candidates) {
    const match = html.match(regex);
    if (!match) continue;
    const textValue = cleanArticleHtml(match[1])
      .replace(/分享到微信朋友圈.*$/g, "")
      .replace(/打开微信，.*$/g, "")
      .replace(/（文章来源：.*?）/g, "\n\n$&")
      .replace(/文章来源：.*$/g, "")
      .replace(/责任编辑：.*$/g, "")
      .replace(/原标题：.*$/g, "")
      .replace(/郑重声明：.*$/g, "")
      .replace(/举报.*$/g, "");
    const cleanedText = removeNavigationLines(textValue);
    if (cleanedText.length > 20) return cleanedText.slice(0, 5000);
  }
  return "";
}

function removeNavigationLines(textValue) {
  return String(textValue || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isEastmoneyNavigationText(line))
    .join("\n\n")
    .trim();
}

function clampLimit(value) {
  const limit = Number(value || 10);
  if (!Number.isFinite(limit)) return 10;
  return Math.max(1, Math.min(20, limit));
}

function inferMarket(symbol) {
  if (/^\d{6}$/.test(symbol)) return symbol.startsWith("6") ? "SH" : "SZ";
  if (/^\d{6}\.SS$/i.test(symbol)) return "SH";
  if (/^\d{6}\.SZ$/i.test(symbol)) return "SZ";
  return "US";
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return text(res, 403, "Forbidden");
  try {
    const body = await readFile(filePath);
    text(res, 200, body, contentType(filePath), { "cache-control": "no-store" });
  } catch {
    const body = await readFile(path.join(publicDir, "index.html"));
    text(res, 200, body, "text/html; charset=utf-8", { "cache-control": "no-store" });
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    return json(res, 500, { message: "服务异常", errorMessage: readableError(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
  if (!existsSync(dbPath)) console.log(`SQLite database will be created at ${dbPath}`);
  scheduleDailyReportTimer();
});
