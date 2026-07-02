const state = {
  authed: false,
  activeTab: "行情",
  market: emptyEnvelope([]),
  aShareAnalysis: emptyEnvelope(null),
  jin10: emptyEnvelope([]),
  eastmoneyNews: emptyEnvelope([]),
  dsaConfig: emptyEnvelope({ configured: false, baseUrl: "" }),
  dsaHistory: emptyEnvelope({ items: [], total: 0 }),
  dsaNews: emptyEnvelope([]),
  dsaNewsFilter: "news",
  dsaStockTags: emptyEnvelope([]),
  dsaQuery: "",
  dsaSearch: { query: "", results: emptyEnvelope([]) },
  dsaNotify: false,
  dsaBatchForceRefresh: false,
  dsaTask: null,
  dsaPendingTasks: [],
  dsaHistorySelection: new Set(),
  dsaSelectedReport: null,
  dsaSelectedRecordId: null,
  dsaMessage: "",
  mainlines: emptyEnvelope([]),
  mainlinesExpanded: false,
  hotStocks: emptyEnvelope([]),
  sectorMode: "overview",
  sectorFlowDates: emptyEnvelope({ dates: [] }),
  sectorFlow: emptyEnvelope(null),
  sectorFlowPreference: emptyEnvelope({ exists: false, selectedCodes: [] }),
  sectorFlowDate: "latest",
  sectorFlowSelected: new Set(),
  sectorFlowPlaying: false,
  sectorFlowSpeed: 12,
  sectorFlowCursor: null,
  sectorOverviewLoadRequested: false,
  sectorRankingDates: emptyEnvelope({ dates: [] }),
  sectorRanking: emptyEnvelope(null),
  sectorRankingDate: "latest",
  sectorRankingSort: { key: "source_rank", direction: "asc" },
  etfCategories: emptyEnvelope({ categories: [], total: 0 }),
  etfDailyStatus: emptyEnvelope(null),
  etfSelectedPrimary: "",
  etfSelectedSecondary: "",
  etfPeriod: 15,
  etfChanges: emptyEnvelope(null),
  etfStockQuery: "",
  etfStockSelected: null,
  etfStockHoldings: emptyEnvelope(null),
  etfWatchHoldings: emptyEnvelope(null),
  etfStockSuggestions: { query: "", results: emptyEnvelope([]) },
  etfExpandedStocks: new Set(),
  etfChangeSort: {},
  ntOverview: emptyEnvelope(null),
  ntPositions: emptyEnvelope({ rows: [], filters: {} }),
  ntGroup: "",
  ntHolder: "",
  ntStatus: "",
  ntEndDate: "",
  ntQuery: "",
  ntHasQueried: false,
  ntSelectedSymbol: "",
  ntStockDetail: emptyEnvelope(null),
  ntExpandedSymbol: "",
  watchlist: [],
  adminUsers: emptyEnvelope([]),
  tushareStatus: emptyEnvelope(null),
  reportSettings: emptyEnvelope(null),
  reportSettingsOpen: false,
  reportMessage: "",
  user: null,
  viewUserId: null,
  selectedSymbol: "",
  posts: { guba: emptyEnvelope([]) },
  stockDetailNews: emptyEnvelope([]),
  stockDetailInfoFilter: "announcement",
  stockAnnouncements: emptyEnvelope([]),
  stockFunds: emptyEnvelope(null),
  stockChart: emptyEnvelope(null),
  stockQuote: emptyEnvelope(null),
  stockChartPeriod: "daily",
  stockChartSelectedIndex: null,
  activeSearchInput: "",
  activeSearchInputAt: 0,
  stockSearch: { query: "", results: emptyEnvelope([]) },
  detail: null,
  stockDetail: null,
  sectorDetail: null,
  stockDetailScrollTop: 0,
  pageScrollTop: 0,
  watchPanelScrollTop: 0,
  dsaHistoryScrollTop: 0,
  sectorFlowPickerScrollTop: 0,
  bigScreenPaused: false,
  bigScreenQuoteCache: new Map(),
  bigScreenValueCache: new Map(),
  bigScreenNewsFeed: [],
  lockedWatchPanelScrollTop: null,
  lockedPageScrollTop: null,
  lastUserScrollAt: 0,
  stockDetailPostAnchor: null,
  importPreview: null,
  openHoldingId: null,
  showWatchAdd: false,
  changePasswordOpen: false,
  installGuideOpen: false,
  adminUsersExpanded: false,
  newAccountInfo: null,
  authMode: "login",
  allowSignup: false,
  signupCodeRequired: false,
  defaultUsername: "",
  defaultPassword: "",
  loading: new Set(),
  authChecking: true,
  booting: false,
  bootTasks: {},
  appVersion: "",
  latestAppVersion: "",
  updateAvailable: false,
  message: ""
};

const baseTabs = ["行情", "AI分析", "资讯", "热度", "板块", "自选股", "使用手册"];
const desktopOnlyTabs = new Set(["国家队", "ETF持仓变化"]);
const bootTaskDefinitions = [
  ["market", "核心行情"],
  ["aShareAnalysis", "A 股大盘"],
  ["jin10", "金十资讯"],
  ["eastmoneyNews", "东财资讯"],
  ["hotTopics", "热股/主线"],
  ["sectorSummary", "板块摘要"],
  ["nationalTeam", "国家队"],
  ["etfCategories", "ETF 分类"],
  ["etfDailyStatus", "ETF 入库率"],
  ["watchlist", "自选股"],
  ["posts", "股吧帖子"],
  ["reportSettings", "收盘日报"],
  ["adminUsers", "管理员数据"],
  ["tushareStatus", "Tushare状态"],
  ["dsaHistory", "AI 分析历史"]
];

function visibleBootTaskDefinitions() {
  return bootTaskDefinitions.filter(([key]) => {
    if (key === "adminUsers" || key === "tushareStatus") return Boolean(state.user?.isAdmin);
    if (key === "nationalTeam" || key === "etfCategories" || key === "etfDailyStatus") return hasVipFeature();
    return true;
  });
}

function hasVipFeature() {
  return Boolean(state.user?.isAdmin || state.user?.isVip);
}

function dashboardTabs() {
  const tabs = [...baseTabs];
  if (hasVipFeature()) tabs.splice(tabs.indexOf("自选股"), 0, "国家队");
  if (hasVipFeature()) tabs.push("ETF持仓变化");
  if (state.user?.isAdmin) tabs.push("管理");
  return tabs;
}

const app = document.querySelector("#app");
let stockSearchTimer = null;
let stockSearchComposing = false;
let etfStockSuggestTimer = null;
let etfStockSuggestComposing = false;
let dsaSearchTimer = null;
let dsaSearchComposing = false;
let dsaPollTimer = null;
let dsaPollInFlight = false;
let sectorReplayTimer = null;
let sectorReplayToken = 0;
let redirectingSearchFocus = false;

window.addEventListener("scroll", () => {
  if (state.lockedPageScrollTop != null) {
    state.pageScrollTop = state.lockedPageScrollTop;
    return;
  }
  state.pageScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  state.lastUserScrollAt = Date.now();
}, { passive: true });

app.addEventListener("click", (event) => {
  const postButton = event.target.closest("[data-post-source]");
  if (!postButton || !app.contains(postButton)) return;
  rememberStockDetailScroll();
  const source = postButton.dataset.postSource;
  const index = Number(postButton.dataset.postIndex);
  state.stockDetailPostAnchor = `${source}-${index}`;
  const item = state.posts[source]?.data?.[index];
  if (item) openDetail(item);
});

function emptyEnvelope(data) {
  return { data, stale: false, updatedAt: "", errorMessage: "" };
}

async function api(path, options = {}) {
  const { timeoutMs = 0, ...fetchOptions } = options;
  let timeoutId = null;
  if (timeoutMs > 0 && !fetchOptions.signal) {
    const controller = new AbortController();
    fetchOptions.signal = controller.signal;
    timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  }
  let res;
  try {
    res = await fetch(path, {
      credentials: "include",
      headers: { "content-type": "application/json", ...(fetchOptions.headers || {}) },
      ...fetchOptions
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("请求超时");
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    state.authed = false;
    state.authChecking = false;
    render();
  }
  if (!res.ok) throw new Error(body.message || body.errorMessage || "请求失败");
  return body;
}

function setLoading(key, value) {
  if (value) state.loading.add(key);
  else state.loading.delete(key);
  render();
}

function resetBootTasks() {
  state.bootTasks = Object.fromEntries(visibleBootTaskDefinitions().map(([key]) => [key, { status: "pending", message: "" }]));
}

function updateBootTask(key, status, message = "") {
  state.bootTasks = {
    ...state.bootTasks,
    [key]: { status, message }
  };
  if (state.booting) render();
}

async function runBootTask(key, task) {
  updateBootTask(key, "loading");
  try {
    await task();
    updateBootTask(key, bootTaskHasDegraded(key) ? "degraded" : "done");
  } catch (error) {
    updateBootTask(key, "degraded", error.message || "加载降级");
  }
}

function bootTaskHasDegraded(key) {
  const hasError = (envelope) => Boolean(envelope?.stale && envelope?.errorMessage);
  const taskErrors = {
    market: () => hasError(state.market),
    aShareAnalysis: () => hasError(state.aShareAnalysis),
    jin10: () => hasError(state.jin10),
    eastmoneyNews: () => hasError(state.eastmoneyNews),
    hotTopics: () => hasError(state.mainlines) || hasError(state.hotStocks),
    sectorSummary: () => hasError(state.sectorFlowDates) || hasError(state.sectorRankingDates) || hasError(state.sectorFlowPreference),
    nationalTeam: () => hasError(state.ntOverview) || hasError(state.ntPositions),
    watchlist: () => Boolean(state.message),
    posts: () => hasError(state.posts.guba),
    reportSettings: () => hasError(state.reportSettings),
    adminUsers: () => state.user?.isAdmin && hasError(state.adminUsers),
    tushareStatus: () => state.user?.isAdmin && hasError(state.tushareStatus),
    dsaHistory: () => state.dsaConfig.data?.configured && hasError(state.dsaHistory)
  };
  return taskErrors[key]?.() || false;
}

function startBootscreen() {
  state.booting = shouldShowBootscreen();
  if (state.booting) resetBootTasks();
}

async function login(event) {
  event.preventDefault();
  const username = new FormData(event.target).get("username");
  const password = new FormData(event.target).get("password");
  try {
    const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    state.user = result.user || null;
    state.authed = true;
    state.authChecking = false;
    startBootscreen();
    state.message = "";
    render();
    try {
      await refreshAll({ priorityMarket: true });
    } finally {
      state.booting = false;
      render();
      warmSectorsAfterBoot();
    }
  } catch (error) {
    state.message = error.message;
    render();
  }
}

async function register(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api("/api/auth/register", { method: "POST", body: JSON.stringify(data) });
    state.user = result.user || null;
    state.authed = true;
    state.authChecking = false;
    startBootscreen();
    state.message = "";
    render();
    try {
      await refreshAll({ priorityMarket: true });
    } finally {
      state.booting = false;
      render();
      warmSectorsAfterBoot();
    }
  } catch (error) {
    state.message = error.message;
    render();
  }
}

async function loadDevConfig() {
  try {
    const result = await api("/api/dev-config");
    state.defaultUsername = result.data?.defaultUsername || "";
    state.defaultPassword = result.data?.defaultPassword || "";
    state.allowSignup = Boolean(result.data?.allowSignup);
    state.signupCodeRequired = Boolean(result.data?.signupCodeRequired);
  } catch {
    state.defaultUsername = "";
    state.defaultPassword = "";
    state.allowSignup = false;
    state.signupCodeRequired = false;
  }
}

async function checkAppVersion(initial = false) {
  try {
    const result = await api(`/api/app-version?t=${Date.now()}`);
    const version = result.data?.version || "";
    if (initial || !state.appVersion) {
      state.appVersion = version;
      state.latestAppVersion = version;
      return;
    }
    state.latestAppVersion = version;
    state.updateAvailable = Boolean(version && state.appVersion && version !== state.appVersion);
    if (state.updateAvailable) render();
  } catch {
    // 更新检测失败不影响看板使用。
  }
}

function reloadToLatest() {
  window.location.reload();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.authed = false;
  state.authChecking = false;
  state.user = null;
  state.booting = false;
  state.bootTasks = {};
  render();
}

async function loadEnvelope(key, path) {
  return loadEnvelopeWithOptions(key, path);
}

async function loadEnvelopeWithOptions(key, path, options = {}) {
  const shouldShowLoading = !options.silent || options.showLoading;
  if (shouldShowLoading) setLoading(key, true);
  try {
    state[key] = await api(path, options.timeoutMs ? { timeoutMs: options.timeoutMs } : {});
  } catch (error) {
    state[key] = { ...state[key], stale: true, errorMessage: `${error.message}：${path}` };
    if (options.retryOnce) {
      setTimeout(() => {
        if (!state.authed || state[key]?.data?.length) return;
        loadEnvelopeWithOptions(key, path, { ...options, retryOnce: false, silent: true });
      }, options.retryDelay || 1200);
    }
  } finally {
    if (shouldShowLoading) setLoading(key, false);
    else if (options.forceRender) render();
    else renderAfterAutoRefresh();
  }
}

async function loadWatchlist(options = {}) {
  if (!options.silent) setLoading("watchlist", true);
  try {
    const result = await api(watchlistPath());
    state.watchlist = result.data || [];
    if (result.userId) state.viewUserId = result.userId;
    if (state.selectedSymbol && !state.watchlist.some((item) => item.symbol === state.selectedSymbol)) state.selectedSymbol = "";
    if (!state.selectedSymbol && state.watchlist.length) state.selectedSymbol = state.watchlist[0].symbol;
    if (state.selectedSymbol && !options.skipPosts) await loadPosts(state.selectedSymbol, options);
  } catch (error) {
    state.message = error.message;
  } finally {
    if (!options.silent) setLoading("watchlist", false);
    else renderAfterAutoRefresh();
  }
}

async function loadMe() {
  try {
    const result = await api("/api/auth/me");
    state.user = result.data || null;
    if (!state.viewUserId && state.user?.id) state.viewUserId = state.user.id;
    return Boolean(state.user);
  } catch {
    state.user = null;
    return false;
  }
}

async function loadAdminUsers() {
  if (!state.user?.isAdmin) return;
  setLoading("adminUsers", true);
  try {
    state.adminUsers = await api("/api/admin/users");
    if (!state.viewUserId && state.user?.id) state.viewUserId = state.user.id;
  } catch (error) {
    state.adminUsers = { ...state.adminUsers, stale: true, errorMessage: error.message };
  } finally {
    setLoading("adminUsers", false);
  }
}

async function loadTushareStatus() {
  if (!state.user?.isAdmin) return;
  setLoading("tushareStatus", true);
  try {
    state.tushareStatus = await api("/api/admin/data-sources/tushare/status");
  } catch (error) {
    state.tushareStatus = { ...state.tushareStatus, stale: true, errorMessage: error.message };
  } finally {
    setLoading("tushareStatus", false);
  }
}

async function loadDsaConfig() {
  try {
    state.dsaConfig = await api("/api/dsa/config");
  } catch (error) {
    state.dsaConfig = { data: { configured: false, baseUrl: "" }, stale: true, updatedAt: "", errorMessage: error.message };
  }
}

async function loadReportSettings() {
  try {
    state.reportSettings = await api("/api/report-settings");
  } catch (error) {
    state.reportSettings = { data: null, stale: true, updatedAt: "", errorMessage: error.message };
  }
}

async function loadDsaHistory(options = {}) {
  if (!options.silent) setLoading("dsaHistory", true);
  try {
    state.dsaHistory = await api(dsaPath("/api/dsa/history?limit=20"));
    pruneDsaHistorySelection();
    const items = dsaHistoryItems();
    if (!state.dsaSelectedReport && items.length) {
      await selectDsaHistory(recordIdForDsaHistory(items[0]), { silent: true });
    }
  } catch (error) {
    state.dsaHistory = { ...state.dsaHistory, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("dsaHistory", false);
    else renderAfterAutoRefresh();
  }
}

function pruneDsaHistorySelection() {
  const ids = new Set(dsaHistoryItems().map(dsaSelectionIdForHistoryItem).filter(Boolean));
  state.dsaHistorySelection = new Set([...state.dsaHistorySelection].filter((id) => ids.has(String(id))));
}

async function submitDsaAnalysis(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const query = String(data.stock || "").trim();
  if (!query) return;
  markSearchInput("dsa");
  if (dsaSearchTimer) {
    clearTimeout(dsaSearchTimer);
    dsaSearchTimer = null;
  }
  state.dsaQuery = query;
  state.dsaSearch = { query: "", results: emptyEnvelope([]) };
  state.dsaMessage = "";
  state.dsaStockTags = emptyEnvelope([]);
  setLoading("dsaAnalysis", true);
  try {
    const result = await api("/api/dsa/analysis", {
      method: "POST",
      body: JSON.stringify({
        query,
        userId: activeViewUserId(),
        notify: state.dsaNotify,
        reportType: "detailed",
        asyncMode: true,
        forceRefresh: true,
        newsLimit: 8,
        announcementLimit: 8,
        aiLimit: 12
      })
    });
    if (result.quota) {
      state.dsaConfig = {
        ...state.dsaConfig,
        data: { ...(state.dsaConfig.data || {}), quota: result.quota }
      };
    }
    state.dsaNews = { data: result.news || [], stale: Boolean(result.stale), updatedAt: result.updatedAt || "", errorMessage: result.errorMessage || "" };
    state.dsaNewsFilter = "news";
    const payload = result.data || {};
    const stockForTags = payload.stock_code || payload.stockCode || result.stock?.symbol || query;
    loadDsaStockTags(stockForTags, { silent: true });
    const taskId = payload.task_id || payload.taskId || payload.accepted?.[0]?.task_id || payload.accepted?.[0]?.taskId;
    if (taskId) {
      const pendingTask = {
        taskId,
        stockCode: payload.stock_code || payload.stockCode || result.stock?.symbol || query,
        stockName: payload.stock_name || payload.stockName || result.stock?.name || query,
        status: payload.status || "pending",
        progress: 0,
        message: payload.message || "分析任务已提交",
        createdAt: result.updatedAt || new Date().toISOString()
      };
      state.dsaTask = pendingTask;
      state.dsaSelectedRecordId = taskId;
      upsertDsaPendingTask(pendingTask);
      render();
      pollDsaTask(taskId);
    } else if (payload.report) {
      state.dsaTask = null;
      state.dsaSelectedReport = payload;
      state.dsaSelectedRecordId = dsaReportMeta(payload).id || null;
      await loadDsaStockTags(dsaReportMeta(payload).stockCode || stockForTags, { silent: true });
      await loadDsaHistory({ silent: true });
      render();
    } else {
      state.dsaMessage = payload.message || "分析请求已提交";
      render();
    }
  } catch (error) {
    state.dsaMessage = error.message;
    render();
  } finally {
    setLoading("dsaAnalysis", false);
  }
}

async function submitDsaWatchlistBatch(event) {
  event.preventDefault();
  if (!isViewingAdminOwnData()) return;
  state.dsaMessage = "";
  setLoading("dsaBatch", true);
  try {
    const result = await api("/api/admin/dsa/watchlist-analysis", {
      method: "POST",
      body: JSON.stringify({ forceRefresh: state.dsaBatchForceRefresh })
    });
    const accepted = Array.isArray(result.accepted) ? result.accepted : [];
    const duplicates = Array.isArray(result.duplicates) ? result.duplicates : [];
    const failed = Array.isArray(result.failed) ? result.failed : [];
    for (const task of [...accepted, ...duplicates]) {
      if (!task?.taskId) continue;
      upsertDsaPendingTask({
        taskId: task.taskId,
        stockCode: task.stockCode || task.symbol || "",
        stockName: task.stockName || task.name || task.stockCode || "",
        status: task.status || "pending",
        progress: task.progress ?? 0,
        message: task.message || (task.duplicate ? "该股票已有分析任务，继续跟踪原任务" : "分析任务已提交"),
        createdAt: task.createdAt || result.updatedAt || new Date().toISOString(),
        duplicate: Boolean(task.duplicate)
      });
    }
    const firstTask = [...accepted, ...duplicates].find((task) => task?.taskId);
    if (firstTask) {
      state.dsaTask = state.dsaPendingTasks.find((item) => String(item.taskId) === String(firstTask.taskId)) || null;
      state.dsaSelectedRecordId = firstTask.taskId;
      startDsaPolling();
    }
    if (result.quota) {
      state.dsaConfig = {
        ...state.dsaConfig,
        data: { ...(state.dsaConfig.data || {}), quota: result.quota }
      };
    }
    state.dsaMessage = result.message || `已提交 ${accepted.length} 只，重复 ${duplicates.length} 只，失败 ${failed.length} 只`;
    if (failed.length) {
      state.dsaMessage += `；失败：${failed.slice(0, 3).map((item) => `${item.name || item.symbol || "-"} ${item.reason || ""}`).join("；")}`;
    }
    await loadDsaHistory({ silent: true });
  } catch (error) {
    state.dsaMessage = error.message;
    render();
  } finally {
    setLoading("dsaBatch", false);
  }
}

async function saveReportSettings(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.reportMessage = "";
  setLoading("reportSettings", true);
  try {
    state.reportSettings = await api("/api/report-settings", {
      method: "PATCH",
      body: JSON.stringify({
        enabled: Boolean(data.enabled),
        emailEnabled: Boolean(data.emailEnabled),
        email: data.email || ""
      })
    });
    state.reportMessage = "收盘日报设置已保存";
  } catch (error) {
    state.reportMessage = error.message;
  } finally {
    setLoading("reportSettings", false);
  }
}

async function sendDailyReportTest() {
  state.reportMessage = "";
  setLoading("reportTest", true);
  try {
    const result = await api("/api/reports/watchlist-daily/test", { method: "POST", body: JSON.stringify({}) });
    state.reportMessage = result.message || "测试日报已发送";
    await loadReportSettings();
  } catch (error) {
    state.reportMessage = error.message;
  } finally {
    setLoading("reportTest", false);
  }
}

function upsertDsaPendingTask(task) {
  const taskId = String(task.taskId || "");
  if (!taskId) return;
  const existingIndex = state.dsaPendingTasks.findIndex((item) => String(item.taskId) === taskId);
  const nextTask = { ...(existingIndex >= 0 ? state.dsaPendingTasks[existingIndex] : {}), ...task, taskId };
  if (existingIndex >= 0) {
    state.dsaPendingTasks.splice(existingIndex, 1);
  }
  state.dsaPendingTasks.unshift(nextTask);
}

function updateDsaPendingTask(taskId, patch) {
  const task = state.dsaPendingTasks.find((item) => String(item.taskId) === String(taskId));
  if (task) Object.assign(task, patch);
}

function removeDsaPendingTask(taskId) {
  state.dsaPendingTasks = state.dsaPendingTasks.filter((item) => String(item.taskId) !== String(taskId));
}

function selectDsaPendingTask(taskId) {
  rememberDsaHistoryScroll();
  const task = state.dsaPendingTasks.find((item) => String(item.taskId) === String(taskId));
  if (!task) return;
  state.dsaTask = task;
  state.dsaSelectedRecordId = taskId;
  render();
  if (!["completed", "failed"].includes(task.status)) pollDsaTask(taskId);
}

function pollDsaTask(taskId) {
  const task = state.dsaPendingTasks.find((item) => String(item.taskId) === String(taskId));
  if (!task || ["completed", "failed"].includes(task.status)) return;
  startDsaPolling();
}

function startDsaPolling() {
  if (dsaPollTimer) return;
  pollDsaPendingTasks();
  dsaPollTimer = window.setInterval(pollDsaPendingTasks, 2500);
}

async function pollDsaPendingTasks() {
  if (dsaPollInFlight) return;
  const activeTasks = state.dsaPendingTasks.filter((item) => item.taskId && !["completed", "failed"].includes(item.status));
  if (!activeTasks.length) {
    if (dsaPollTimer) window.clearInterval(dsaPollTimer);
    dsaPollTimer = null;
    return;
  }
  dsaPollInFlight = true;
  let shouldRefreshHistory = false;
  try {
    for (const item of activeTasks) {
      const taskId = item.taskId;
      item.pollAttempts = Number(item.pollAttempts || 0) + 1;
      if (item.pollAttempts > 120) {
        const failedTask = { ...item, status: "failed", progress: 0, message: "分析等待超时" };
        updateDsaPendingTask(taskId, failedTask);
        if (String(taskId) === String(state.dsaSelectedRecordId)) state.dsaTask = failedTask;
        continue;
      }
      try {
        const result = await api(dsaPath(`/api/dsa/tasks/${encodeURIComponent(taskId)}`));
        const payload = result.data || {};
        const nextTask = {
          ...item,
          status: payload.status || "processing",
          progress: payload.progress ?? item.progress ?? null,
          message: payload.error || payload.message || item.message || ""
        };
        updateDsaPendingTask(taskId, nextTask);
        if (String(taskId) === String(state.dsaSelectedRecordId)) state.dsaTask = nextTask;
        if (payload.status === "completed") {
          removeDsaPendingTask(taskId);
          shouldRefreshHistory = true;
          if (payload.result && String(taskId) === String(state.dsaSelectedRecordId)) {
            state.dsaSelectedReport = payload.result;
            state.dsaSelectedRecordId = dsaReportMeta(payload.result).id || taskId;
            await loadDsaStockTags(dsaReportMeta(payload.result).stockCode, { silent: true });
          }
        } else if (payload.status === "failed") {
          updateDsaPendingTask(taskId, { ...nextTask, status: "failed", progress: payload.progress || 0, message: payload.error || payload.message || "分析失败" });
        }
      } catch (error) {
        if (item.pollAttempts > 2) {
          const failedTask = { ...item, status: "failed", progress: 0, message: error.message };
          updateDsaPendingTask(taskId, failedTask);
          if (String(taskId) === String(state.dsaSelectedRecordId)) state.dsaTask = failedTask;
        }
      }
    }
    if (shouldRefreshHistory) await loadDsaHistory({ silent: true });
  } finally {
    dsaPollInFlight = false;
    render();
    if (!state.dsaPendingTasks.some((item) => item.taskId && !["completed", "failed"].includes(item.status)) && dsaPollTimer) {
      window.clearInterval(dsaPollTimer);
      dsaPollTimer = null;
    }
  }
}

async function selectDsaHistory(recordId, options = {}) {
  if (!recordId) return;
  rememberDsaHistoryScroll();
  if (!options.silent) setLoading("dsaReport", true);
  try {
    const result = await api(dsaPath(`/api/dsa/history/${encodeURIComponent(recordId)}`));
    state.dsaSelectedReport = result.data || null;
    state.dsaSelectedRecordId = recordId;
    const meta = dsaReportMeta(state.dsaSelectedReport);
    if (meta.stockCode) {
      const [news, tags] = await Promise.all([
        api(`/api/stocks/${encodeURIComponent(meta.stockCode)}/dsa-news-context?newsLimit=8&announcementLimit=8&aiLimit=12`),
        api(`/api/stocks/${encodeURIComponent(meta.stockCode)}/tags?limit=8`).catch((error) => ({ data: [], stale: true, errorMessage: error.message }))
      ]);
      state.dsaNews = { data: news.items || [], stale: Boolean(news.stale), updatedAt: news.updatedAt || "", errorMessage: news.errorMessage || "" };
      state.dsaNewsFilter = "news";
      state.dsaStockTags = { data: tags.data || [], stale: Boolean(tags.stale), updatedAt: tags.updatedAt || "", errorMessage: tags.errorMessage || "" };
    } else {
      state.dsaStockTags = emptyEnvelope([]);
    }
  } catch (error) {
    state.dsaMessage = error.message;
    state.dsaStockTags = emptyEnvelope([]);
  } finally {
    if (!options.silent) setLoading("dsaReport", false);
    render();
  }
}

async function loadDsaStockTags(symbol, options = {}) {
  if (!symbol) return;
  if (!options.silent) setLoading("dsaStockTags", true);
  try {
    state.dsaStockTags = await api(`/api/stocks/${encodeURIComponent(symbol)}/tags?limit=8`);
  } catch (error) {
    state.dsaStockTags = { data: [], updatedAt: new Date().toISOString(), stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) {
      setLoading("dsaStockTags", false);
    } else {
      renderAfterAutoRefresh();
    }
  }
}

function toggleDsaHistorySelection(recordId, checked) {
  const id = String(recordId || "");
  if (!id) return;
  if (checked) state.dsaHistorySelection.add(id);
  else state.dsaHistorySelection.delete(id);
  render();
}

function toggleAllDsaHistorySelection(checked) {
  if (checked) {
    for (const item of dsaHistoryItems()) {
      const id = dsaSelectionIdForHistoryItem(item);
      if (id) state.dsaHistorySelection.add(String(id));
    }
  } else {
    state.dsaHistorySelection.clear();
  }
  render();
}

async function deleteSelectedDsaHistory() {
  const selectedIds = [...state.dsaHistorySelection].map((id) => String(id)).filter(Boolean);
  const pendingTaskIds = selectedIds.filter((id) => id.startsWith("task:")).map((id) => id.slice(5)).filter(Boolean);
  const recordIds = selectedIds
    .filter((id) => !id.startsWith("task:"))
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!recordIds.length && !pendingTaskIds.length) {
    state.dsaMessage = "请选择要删除的历史记录";
    render();
    return;
  }
  if (!window.confirm(`确定删除选中的 ${selectedIds.length} 条 AI 分析历史吗？`)) return;
  setLoading("dsaHistoryDelete", true);
  try {
    if (recordIds.length) {
      await api("/api/dsa/history", {
        method: "DELETE",
        body: JSON.stringify({ recordIds, userId: activeViewUserId() })
      });
    }
    for (const taskId of pendingTaskIds) removeDsaPendingTask(taskId);
    const selectedWasDeleted = state.dsaSelectedRecordId && (
      recordIds.map(String).includes(String(state.dsaSelectedRecordId)) ||
      pendingTaskIds.map(String).includes(String(state.dsaSelectedRecordId))
    );
    state.dsaHistorySelection.clear();
    if (selectedWasDeleted) {
      state.dsaTask = null;
      state.dsaSelectedReport = null;
      state.dsaSelectedRecordId = null;
    }
    if (recordIds.length) await loadDsaHistory({ silent: true });
    state.dsaMessage = "";
    render();
  } catch (error) {
    state.dsaMessage = error.message;
    render();
  } finally {
    setLoading("dsaHistoryDelete", false);
  }
}

async function loadPosts(symbol, options = {}) {
  if (!symbol) return;
  state.selectedSymbol = symbol;
  if (!options.silent) setLoading("posts", true);
  try {
    const guba = await api(`/api/stocks/${encodeURIComponent(symbol)}/posts?source=guba&limit=10`);
    state.posts = { guba };
  } catch (error) {
    state.posts = {
      guba: { ...state.posts.guba, stale: true, errorMessage: error.message }
    };
  } finally {
    if (!options.silent) setLoading("posts", false);
    else renderAfterAutoRefresh();
  }
}

async function loadStockAnnouncements(symbol, options = {}) {
  if (!symbol) return;
  if (!options.silent) setLoading("stockAnnouncements", true);
  try {
    state.stockAnnouncements = await api(`/api/stocks/${encodeURIComponent(symbol)}/announcements?limit=8`);
  } catch (error) {
    state.stockAnnouncements = { data: [], updatedAt: new Date().toISOString(), stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("stockAnnouncements", false);
    else renderAfterAutoRefresh();
  }
}

async function loadStockDetailNews(symbol, options = {}) {
  if (!symbol) return;
  if (!options.silent) setLoading("stockDetailNews", true);
  try {
    state.stockDetailNews = await api(`/api/stocks/${encodeURIComponent(symbol)}/eastmoney-news?limit=8`);
  } catch (error) {
    state.stockDetailNews = { data: [], updatedAt: new Date().toISOString(), stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("stockDetailNews", false);
    else renderAfterAutoRefresh();
  }
}

async function loadStockFunds(symbol, options = {}) {
  if (!symbol) return;
  if (!options.silent) setLoading("stockFunds", true);
  try {
    state.stockFunds = await api(`/api/stocks/${encodeURIComponent(symbol)}/funds`);
  } catch (error) {
    state.stockFunds = {
      data: null,
      updatedAt: new Date().toISOString(),
      stale: true,
      errorMessage: error.message
    };
  } finally {
    if (!options.silent) setLoading("stockFunds", false);
    else renderAfterAutoRefresh();
  }
}

async function loadStockChart(symbol, options = {}) {
  if (!symbol) return;
  const period = options.period || state.stockChartPeriod || "daily";
  state.stockChartPeriod = period;
  if (!options.silent) setLoading("stockChart", true);
  try {
    state.stockChart = await api(`/api/stocks/${encodeURIComponent(symbol)}/chart?period=${encodeURIComponent(period)}`);
  } catch (error) {
    state.stockChart = {
      data: null,
      updatedAt: new Date().toISOString(),
      stale: true,
      errorMessage: error.message
    };
  } finally {
    if (!options.silent) setLoading("stockChart", false);
    else renderAfterAutoRefresh();
  }
}

async function loadStockQuote(symbol, options = {}) {
  if (!symbol) return;
  if (!options.silent) setLoading("stockQuote", true);
  try {
    state.stockQuote = await api(`/api/stocks/${encodeURIComponent(symbol)}/quote`);
    if (state.stockDetail && state.stockQuote.data) {
      state.stockDetail = { ...state.stockDetail, ...state.stockQuote.data };
    }
  } catch (error) {
    state.stockQuote = {
      data: null,
      updatedAt: new Date().toISOString(),
      stale: true,
      errorMessage: error.message
    };
  } finally {
    if (!options.silent) setLoading("stockQuote", false);
    else renderAfterAutoRefresh();
  }
}

async function openStockDetail(symbol, stock = null) {
  rememberWatchPanelScroll();
  state.lockedWatchPanelScrollTop = state.watchPanelScrollTop;
  state.lockedPageScrollTop = window.scrollY || document.documentElement.scrollTop || state.pageScrollTop || 0;
  state.pageScrollTop = state.lockedPageScrollTop;
  lockBodyScroll();
  state.selectedSymbol = symbol;
  state.stockDetail = stock || findStockForDetail(symbol);
  state.stockFunds = emptyEnvelope(null);
  state.stockChart = emptyEnvelope(null);
  state.stockQuote = emptyEnvelope(null);
  state.stockDetailNews = emptyEnvelope([]);
  state.stockDetailInfoFilter = "announcement";
  state.stockAnnouncements = emptyEnvelope([]);
  state.stockChartPeriod = "daily";
  state.stockChartSelectedIndex = null;
  state.stockDetailScrollTop = 0;
  render();
  await Promise.all([loadStockQuote(symbol), loadStockChart(symbol), loadStockFunds(symbol), loadStockAnnouncements(symbol), loadStockDetailNews(symbol), loadPosts(symbol)]);
}

function closeStockDetail() {
  const scrollTop = state.lockedPageScrollTop ?? state.pageScrollTop;
  const watchScrollTop = state.lockedWatchPanelScrollTop ?? state.watchPanelScrollTop;
  state.stockDetail = null;
  state.stockFunds = emptyEnvelope(null);
  state.stockChart = emptyEnvelope(null);
  state.stockQuote = emptyEnvelope(null);
  state.stockDetailNews = emptyEnvelope([]);
  state.stockDetailInfoFilter = "announcement";
  state.stockAnnouncements = emptyEnvelope([]);
  state.stockChartSelectedIndex = null;
  state.stockDetailScrollTop = 0;
  state.stockDetailPostAnchor = null;
  state.lockedPageScrollTop = null;
  state.pageScrollTop = scrollTop || 0;
  state.watchPanelScrollTop = watchScrollTop || 0;
  render();
  unlockBodyScroll(scrollTop || 0);
  restoreWatchPanelScroll();
  setTimeout(() => {
    if (state.stockDetail) return;
    state.lockedWatchPanelScrollTop = null;
    state.watchPanelScrollTop = watchScrollTop || 0;
    restoreWatchPanelScroll();
  }, 320);
}

function switchStockChartPeriod(period) {
  if (!state.stockDetail || state.stockChartPeriod === period) return;
  rememberStockDetailScroll();
  state.stockDetailPostAnchor = null;
  state.stockChartSelectedIndex = null;
  loadStockChart(state.selectedSymbol, { period });
}

function selectChartPoint(event) {
  const svg = event.currentTarget;
  const rows = state.stockChart?.data?.rows || [];
  if (!rows.length) return;
  const rect = svg.getBoundingClientRect();
  const left = Number(svg.dataset.chartLeft || 48);
  const right = Number(svg.dataset.chartRight || 12);
  const width = Number(svg.dataset.chartWidth || 760);
  const visibleCount = Number(svg.dataset.chartRows || Math.min(rows.length, 90));
  const chartWidth = Math.max(1, width - left - right);
  const localX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
  const ratio = Math.max(0, Math.min(1, (localX - left) / chartWidth));
  state.stockChartSelectedIndex = Math.round(ratio * (visibleCount - 1));
  rememberStockDetailScroll();
  state.stockDetailPostAnchor = null;
  render();
}

async function searchStocks(event) {
  event.preventDefault();
  const query = String(new FormData(event.target).get("query") || "").trim();
  await runStockSearch(query, { emptyMessage: true });
}

async function runStockSearch(queryInput, options = {}) {
  const query = String(queryInput || "").trim();
  if (!query) {
    state.stockSearch = { query: "", results: emptyEnvelope([]) };
    render();
    return;
  }
  state.stockSearch.query = query;
  if (options.quiet) state.loading.add("stockSearch");
  else setLoading("stockSearch", true);
  const requestQuery = query;
  try {
    const result = await api(`/api/stocks/search?q=${encodeURIComponent(query)}&limit=10`);
    if (state.stockSearch.query !== requestQuery) return;
    state.stockSearch.results = result;
    if (options.emptyMessage && !state.stockSearch.results.data.length) {
      state.message = "没有匹配到股票";
    }
  } catch (error) {
    state.stockSearch.results = { data: [], updatedAt: new Date().toISOString(), stale: true, errorMessage: error.message };
    if (options.emptyMessage) state.message = error.message;
  } finally {
    if (options.quiet) {
      state.loading.delete("stockSearch");
      if (state.stockSearch.query === requestQuery && !stockSearchComposing) renderPreservingStockSearchInput();
    } else {
      setLoading("stockSearch", false);
    }
  }
}

function markSearchInput(kind) {
  state.activeSearchInput = kind;
  state.activeSearchInputAt = Date.now();
}

function redirectUnexpectedSearchFocus(event) {
  if (redirectingSearchFocus) return;
  const target = event.target;
  if (!target?.matches?.("[data-stock-search-input]")) return;
  if (state.activeSearchInput !== "dsa" || Date.now() - state.activeSearchInputAt > 15000) return;
  const dsaInput = document.querySelector("[data-dsa-search-input]");
  if (!dsaInput) return;
  redirectingSearchFocus = true;
  requestAnimationFrame(() => {
    dsaInput.focus();
    dsaInput.setSelectionRange(dsaInput.value.length, dsaInput.value.length);
    redirectingSearchFocus = false;
  });
}

function scheduleStockSearch(event) {
  const query = String(event.target.value || "").trim();
  markSearchInput("stock");
  state.stockSearch.query = query;
  state.stockSearch.results = query ? state.stockSearch.results : emptyEnvelope([]);
  state.message = "";
  if (stockSearchTimer) clearTimeout(stockSearchTimer);
  if (stockSearchComposing || event.isComposing) return;
  if (!query) {
    render();
    return;
  }
  stockSearchTimer = setTimeout(() => runStockSearch(query, { quiet: true }), 280);
}

function startStockSearchComposition() {
  stockSearchComposing = true;
  if (stockSearchTimer) clearTimeout(stockSearchTimer);
}

function endStockSearchComposition(event) {
  stockSearchComposing = false;
  scheduleStockSearch(event);
}

async function runDsaStockSearch(queryInput, options = {}) {
  const query = String(queryInput || "").trim();
  if (!query) {
    state.dsaQuery = "";
    state.dsaSearch = { query: "", results: emptyEnvelope([]) };
    render();
    return;
  }
  state.dsaQuery = query;
  state.dsaSearch.query = query;
  if (options.quiet) state.loading.add("dsaSearch");
  else setLoading("dsaSearch", true);
  const requestQuery = query;
  try {
    const result = await api(`/api/stocks/search?q=${encodeURIComponent(query)}&limit=8`);
    if (state.dsaSearch.query !== requestQuery) return;
    state.dsaSearch.results = result;
  } catch (error) {
    state.dsaSearch.results = { data: [], updatedAt: new Date().toISOString(), stale: true, errorMessage: error.message };
  } finally {
    if (options.quiet) {
      state.loading.delete("dsaSearch");
      if (state.dsaSearch.query === requestQuery && !dsaSearchComposing) renderPreservingDsaSearchInput();
    } else {
      setLoading("dsaSearch", false);
    }
  }
}

function scheduleDsaStockSearch(event) {
  const query = String(event.target.value || "").trim();
  markSearchInput("dsa");
  state.dsaQuery = query;
  state.dsaSearch.query = query;
  state.dsaSearch.results = query ? state.dsaSearch.results : emptyEnvelope([]);
  state.dsaMessage = "";
  if (dsaSearchTimer) clearTimeout(dsaSearchTimer);
  if (dsaSearchComposing || event.isComposing) return;
  if (!query) {
    render();
    return;
  }
  dsaSearchTimer = setTimeout(() => runDsaStockSearch(query, { quiet: true }), 260);
}

function startDsaSearchComposition() {
  dsaSearchComposing = true;
  if (dsaSearchTimer) clearTimeout(dsaSearchTimer);
}

function endDsaSearchComposition(event) {
  dsaSearchComposing = false;
  scheduleDsaStockSearch(event);
}

function renderPreservingStockSearchInput() {
  const active = document.activeElement;
  const shouldRestore = state.activeSearchInput === "stock" && active?.matches?.("[data-stock-search-input]");
  const selectionStart = shouldRestore ? active.selectionStart : null;
  const selectionEnd = shouldRestore ? active.selectionEnd : null;
  render();
  if (!shouldRestore) return;
  const input = document.querySelector("[data-stock-search-input]");
  if (!input) return;
  input.focus();
  if (selectionStart != null && selectionEnd != null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

function renderPreservingDsaSearchInput() {
  const active = document.activeElement;
  const shouldRestore = state.activeSearchInput === "dsa" && active?.matches?.("[data-dsa-search-input]");
  const selectionStart = shouldRestore ? active.selectionStart : null;
  const selectionEnd = shouldRestore ? active.selectionEnd : null;
  render();
  if (!shouldRestore) return;
  const input = document.querySelector("[data-dsa-search-input]");
  if (!input) return;
  input.focus();
  if (selectionStart != null && selectionEnd != null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

function openSearchedStock(index) {
  const stock = state.stockSearch.results.data[Number(index)];
  if (!stock) return;
  state.stockSearch.results = emptyEnvelope([]);
  openStockDetail(stock.symbol, stock);
}

function chooseDsaStock(index) {
  const stock = state.dsaSearch.results.data[Number(index)];
  if (!stock) return;
  state.dsaQuery = stock.symbol;
  state.dsaSearch = { query: "", results: emptyEnvelope([]) };
  render();
  const input = document.querySelector("[data-dsa-search-input]");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

async function openSectorDetail(code) {
  const sector = state.mainlines.data.find((item) => item.code === code)
    || state.sectorRanking.data?.rows?.find((item) => item.code === code)
    || state.sectorFlow.data?.series?.find((item) => item.code === code)
    || { code, name: code };
  state.sectorDetail = {
    sector,
    stocks: emptyEnvelope([]),
    loading: true
  };
  render();
  try {
    const stocks = await api(`/api/sectors/${encodeURIComponent(code)}/stocks?limit=20`);
    state.sectorDetail = { sector, stocks, loading: false };
  } catch (error) {
    state.sectorDetail = {
      sector,
      stocks: { data: [], stale: true, errorMessage: error.message },
      loading: false
    };
  }
  render();
}

function closeSectorDetail() {
  state.sectorDetail = null;
  render();
}

function openSectorStock(symbol) {
  const stock = state.sectorDetail?.stocks?.data?.find((item) => item.symbol === symbol);
  if (stock) openStockDetail(stock.symbol, stock);
}

function findStockForDetail(symbol) {
  return state.watchlist.find((item) => item.symbol === symbol)
    || state.hotStocks.data.find((item) => item.symbol === symbol)
    || { symbol, name: symbol, market: inferMarket(symbol) };
}

async function loadSectorDates(options = {}) {
  await Promise.all([
    loadEnvelopeWithOptions("sectorFlowDates", "/api/sectors/flow/dates", { timeoutMs: 6000, ...options }),
    loadEnvelopeWithOptions("sectorRankingDates", "/api/sectors/ranking/dates", { timeoutMs: 6000, ...options })
  ]);
  const flowDates = state.sectorFlowDates.data?.dates || [];
  const rankingDates = state.sectorRankingDates.data?.dates || [];
  if (state.sectorFlowDate === "latest" && flowDates[0]) state.sectorFlowDate = flowDates[0];
  if (state.sectorRankingDate === "latest" && rankingDates[0]) state.sectorRankingDate = rankingDates[0];
}

async function loadSectorFlow(options = {}) {
  const date = state.sectorFlowDate || "latest";
  if (!state.sectorFlowPreference.data?.exists && !state.sectorFlowPreference.updatedAt) {
    await loadSectorFlowPreference({ silent: true });
  }
  await loadEnvelopeWithOptions("sectorFlow", `/api/sectors/flow/series?date=${encodeURIComponent(date)}`, { timeoutMs: 12000, ...options });
  seedSectorFlowSelection();
  const data = state.sectorFlow.data;
  if (data?.last_session_min != null && state.sectorFlowCursor == null) {
    state.sectorFlowCursor = data.last_session_min;
  }
}

async function loadSectorRanking(options = {}) {
  const date = state.sectorRankingDate || "latest";
  await loadEnvelopeWithOptions("sectorRanking", `/api/sectors/ranking?date=${encodeURIComponent(date)}`, { timeoutMs: 15000, ...options });
}

async function loadSectorSummary(options = {}) {
  await Promise.all([
    loadSectorDates(options),
    loadSectorFlowPreference(options)
  ]);
}

async function loadSectors(options = {}) {
  await loadSectorSummary(options);
  await loadSectorRanking(options);
  if (options.includeFlow || state.sectorMode === "flow") await loadSectorFlow(options);
}

function warmSectorsAfterBoot() {
  if (!state.authed) return;
  state.sectorOverviewLoadRequested = false;
  loadSectors({ silent: true, includeFlow: true, showLoading: true, forceRender: true }).catch(() => {});
}

function ensureSectorOverviewLoaded(options = {}) {
  if (!state.authed) return;
  if (options.once && state.sectorOverviewLoadRequested) return;
  if (options.once) state.sectorOverviewLoadRequested = true;
  if (!state.sectorRanking.data && !state.loading.has("sectorRanking") && !state.loading.has("sectorRankingDates")) {
    loadSectorRankingOnly({ ...options, silent: true, showLoading: true, forceRender: true }).catch(() => {});
  }
  if (!state.sectorFlow.data && !state.loading.has("sectorFlow") && !state.loading.has("sectorFlowDates")) {
    ensureSectorFlowLoaded({ ...options, silent: true, showLoading: true, forceRender: true }).catch(() => {});
  }
}

async function loadEtfCategories(options = {}) {
  if (!hasVipFeature()) return;
  if (!options.silent) setLoading("etfCategories", true);
  try {
    state.etfCategories = await api("/api/etf-categories");
    seedEtfSelection();
    await Promise.all([
      loadEtfChanges({ silent: true }),
      loadEtfDailyStatus({ silent: true })
    ]);
  } catch (error) {
    state.etfCategories = { ...state.etfCategories, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("etfCategories", false);
    else renderAfterAutoRefresh();
  }
}

function seedEtfSelection() {
  const categories = state.etfCategories.data?.categories || [];
  if (!categories.length) return;
  const primary = categories.find((item) => item.name === state.etfSelectedPrimary);
  if (!primary) {
    state.etfSelectedPrimary = "";
    state.etfSelectedSecondary = "";
    return;
  }
  const secondaries = primary.secondaries || [];
  if (!secondaries.some((item) => item.name === state.etfSelectedSecondary)) state.etfSelectedSecondary = "";
}

async function loadEtfDailyStatus(options = {}) {
  if (!hasVipFeature()) return;
  if (!options.silent) setLoading("etfDailyStatus", true);
  try {
    state.etfDailyStatus = await api("/api/etf-holdings/daily-status");
  } catch (error) {
    state.etfDailyStatus = { ...state.etfDailyStatus, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("etfDailyStatus", false);
    else renderAfterAutoRefresh();
  }
}

async function loadEtfChanges(options = {}) {
  if (!hasVipFeature()) return;
  if (!state.etfSelectedPrimary || !state.etfSelectedSecondary) return;
  if (!options.silent) setLoading("etfChanges", true);
  try {
    const params = new URLSearchParams({
      primary: state.etfSelectedPrimary,
      secondary: state.etfSelectedSecondary,
      period: String(state.etfPeriod)
    });
    state.etfChanges = await api(`/api/etf-holdings/changes?${params.toString()}`);
  } catch (error) {
    state.etfChanges = { ...state.etfChanges, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("etfChanges", false);
    else renderAfterAutoRefresh();
  }
}

async function loadEtfStockHoldings(options = {}) {
  if (!hasVipFeature()) return;
  const query = String(state.etfStockSelected?.stockCode || state.etfStockQuery || "").trim();
  if (!query) {
    state.etfStockHoldings = emptyEnvelope(null);
    state.etfStockSuggestions = { query: "", results: emptyEnvelope([]) };
    render();
    return;
  }
  if (!state.etfStockSelected) {
    state.etfStockHoldings = { data: null, updatedAt: new Date().toISOString(), stale: true, errorMessage: "请先从输入框候选中选择股票，再查询。" };
    render();
    return;
  }
  if (!options.silent) setLoading("etfStockHoldings", true);
  try {
    const params = new URLSearchParams({
      stock: query
    });
    state.etfStockHoldings = await api(`/api/etf-holdings/stock?${params.toString()}`);
  } catch (error) {
    state.etfStockHoldings = { ...state.etfStockHoldings, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("etfStockHoldings", false);
    else renderAfterAutoRefresh();
  }
}

async function loadEtfWatchHoldings(options = {}) {
  if (!hasVipFeature()) return;
  if (!options.silent) setLoading("etfWatchHoldings", true);
  try {
    state.etfWatchHoldings = await api(watchlistPath("/api/etf-holdings/watchlist"));
  } catch (error) {
    state.etfWatchHoldings = { ...state.etfWatchHoldings, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("etfWatchHoldings", false);
    else renderAfterAutoRefresh();
  }
}

async function loadNationalTeam(options = {}) {
  if (!hasVipFeature()) return;
  await loadNationalTeamOverview(options);
  if (state.ntHasQueried) await loadNationalTeamPositions(options);
}

async function loadNationalTeamOverview(options = {}) {
  if (!hasVipFeature()) return;
  if (!options.silent) setLoading("nationalTeam", true);
  try {
    state.ntOverview = await api("/api/national-team/overview");
  } catch (error) {
    state.ntOverview = { ...state.ntOverview, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("nationalTeam", false);
    else renderAfterAutoRefresh();
  }
}

async function loadNationalTeamPositions(options = {}) {
  if (!hasVipFeature()) return;
  const params = new URLSearchParams();
  if (state.ntGroup) params.set("group", state.ntGroup);
  if (state.ntHolder) params.set("holder", state.ntHolder);
  if (state.ntStatus) params.set("status", state.ntStatus);
  if (state.ntEndDate) params.set("endDate", state.ntEndDate);
  if (state.ntQuery) params.set("query", state.ntQuery);
  if (!options.silent) setLoading("ntPositions", true);
  try {
    state.ntPositions = await api(`/api/national-team/positions?${params.toString()}`);
  } catch (error) {
    state.ntPositions = { ...state.ntPositions, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("ntPositions", false);
    else renderAfterAutoRefresh();
  }
}

function changeNationalTeamFilter(key, value) {
  state[key] = value || "";
  if (key === "ntGroup") state.ntHolder = "";
  state.ntExpandedSymbol = "";
  render();
  if (state.ntHasQueried) loadNationalTeamPositions();
}

function submitNationalTeamSearch(event) {
  event.preventDefault();
  state.ntQuery = String(new FormData(event.target).get("query") || "").trim();
  state.ntHasQueried = true;
  state.ntExpandedSymbol = "";
  loadNationalTeamPositions();
}

async function openNationalTeamStock(symbol) {
  const cleanSymbol = String(symbol || "").trim();
  if (!cleanSymbol) return;
  state.ntHasQueried = true;
  state.ntSelectedSymbol = cleanSymbol;
  state.ntExpandedSymbol = state.ntExpandedSymbol === cleanSymbol ? "" : cleanSymbol;
  render();
  if (state.ntExpandedSymbol) {
    if (!state.ntPositions.data?.rows?.some((row) => row.symbol === cleanSymbol)) {
      await loadNationalTeamPositions({ silent: true });
    }
    await loadNationalTeamStock(cleanSymbol);
  }
}

async function loadNationalTeamStock(symbol, options = {}) {
  if (!hasVipFeature()) return;
  if (!options.silent) setLoading("ntStockDetail", true);
  try {
    state.ntStockDetail = await api(`/api/national-team/stock?symbol=${encodeURIComponent(symbol)}`);
  } catch (error) {
    state.ntStockDetail = { ...state.ntStockDetail, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("ntStockDetail", false);
    else renderAfterAutoRefresh();
  }
}

function clearNationalTeamFilters() {
  state.ntGroup = "";
  state.ntHolder = "";
  state.ntStatus = "";
  state.ntEndDate = "";
  state.ntQuery = "";
  state.ntHasQueried = false;
  state.ntExpandedSymbol = "";
  state.ntSelectedSymbol = "";
  state.ntStockDetail = emptyEnvelope(null);
  state.ntPositions = emptyEnvelope({ rows: [], filters: {} });
  render();
}

function submitEtfStockQuery(event) {
  event.preventDefault();
  state.etfStockQuery = String(new FormData(event.target).get("stock") || "").trim();
  loadEtfStockHoldings();
}

async function loadEtfStockSuggestions(queryInput, options = {}) {
  if (!hasVipFeature()) return;
  const query = String(queryInput || "").trim();
  if (query.length < 2) {
    state.etfStockSuggestions = { query, results: emptyEnvelope([]) };
    renderPreservingEtfStockInput();
    return;
  }
  state.etfStockSuggestions.query = query;
  if (options.quiet) state.loading.add("etfStockSuggestions");
  else setLoading("etfStockSuggestions", true);
  const requestQuery = query;
  try {
    const result = await api(`/api/etf-holdings/stock-suggestions?query=${encodeURIComponent(query)}&limit=10`);
    if (state.etfStockSuggestions.query !== requestQuery) return;
    state.etfStockSuggestions.results = result;
  } catch (error) {
    state.etfStockSuggestions.results = { data: [], updatedAt: new Date().toISOString(), stale: true, errorMessage: error.message };
  } finally {
    if (options.quiet) {
      state.loading.delete("etfStockSuggestions");
      if (state.etfStockSuggestions.query === requestQuery && !etfStockSuggestComposing) renderPreservingEtfStockInput();
    } else {
      setLoading("etfStockSuggestions", false);
    }
  }
}

function scheduleEtfStockSuggestions(event) {
  const query = String(event.target.value || "").trim();
  markSearchInput("etfStock");
  state.etfStockQuery = query;
  if (!state.etfStockSelected || query !== state.etfStockSelected.stockCode) state.etfStockSelected = null;
  state.etfStockSuggestions.query = query;
  state.etfStockSuggestions.results = query ? state.etfStockSuggestions.results : emptyEnvelope([]);
  if (etfStockSuggestTimer) clearTimeout(etfStockSuggestTimer);
  if (etfStockSuggestComposing || event.isComposing) return;
  if (query.length < 2) {
    state.etfStockSuggestions.results = emptyEnvelope([]);
    renderPreservingEtfStockInput();
    return;
  }
  etfStockSuggestTimer = setTimeout(() => loadEtfStockSuggestions(query, { quiet: true }), 220);
}

function startEtfStockSuggestComposition() {
  etfStockSuggestComposing = true;
  if (etfStockSuggestTimer) clearTimeout(etfStockSuggestTimer);
}

function endEtfStockSuggestComposition(event) {
  etfStockSuggestComposing = false;
  scheduleEtfStockSuggestions(event);
}

function chooseEtfStockSuggestion(index) {
  const stock = state.etfStockSuggestions.results.data?.[Number(index)];
  if (!stock) return;
  state.etfStockQuery = stock.stockCode;
  state.etfStockSelected = stock;
  state.etfStockSuggestions = { query: "", results: emptyEnvelope([]) };
  loadEtfStockHoldings();
}

function clearEtfStockLookup() {
  state.etfStockQuery = "";
  state.etfStockSelected = null;
  state.etfStockSuggestions = { query: "", results: emptyEnvelope([]) };
  state.etfStockHoldings = emptyEnvelope(null);
  state.loading.delete("etfStockSuggestions");
  state.loading.delete("etfStockHoldings");
  render();
}

function clearEtfWatchHoldings() {
  state.etfWatchHoldings = emptyEnvelope(null);
  state.loading.delete("etfWatchHoldings");
  render();
}

function renderPreservingEtfStockInput() {
  const active = document.activeElement;
  const shouldRestore = state.activeSearchInput === "etfStock" && active?.matches?.("[data-etf-stock-input]");
  const selectionStart = shouldRestore ? active.selectionStart : null;
  const selectionEnd = shouldRestore ? active.selectionEnd : null;
  render();
  if (!shouldRestore) return;
  const input = document.querySelector("[data-etf-stock-input]");
  if (!input) return;
  input.focus();
  if (selectionStart != null && selectionEnd != null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

function changeEtfPrimary(value) {
  state.etfSelectedPrimary = value || "";
  state.etfSelectedSecondary = "";
  state.etfExpandedStocks = new Set();
  seedEtfSelection();
  state.etfChanges = emptyEnvelope(null);
  render();
  loadEtfChanges();
}

function changeEtfSecondary(value) {
  state.etfSelectedSecondary = value || "";
  state.etfExpandedStocks = new Set();
  state.etfChanges = emptyEnvelope(null);
  render();
  loadEtfChanges();
}

function changeEtfPeriod(value) {
  state.etfPeriod = [5, 10, 15, 30].includes(Number(value)) ? Number(value) : 15;
  state.etfExpandedStocks = new Set();
  render();
  loadEtfChanges();
}

function changeEtfBlockSort(kind, value) {
  state.etfChangeSort = { ...state.etfChangeSort, [kind]: value || "default" };
  render();
}

function clearEtfCategorySelection() {
  state.etfSelectedPrimary = "";
  state.etfSelectedSecondary = "";
  state.etfExpandedStocks = new Set();
  state.etfChanges = emptyEnvelope(null);
  state.loading.delete("etfChanges");
  render();
}

async function refreshEtfHoldings() {
  if (!state.etfSelectedPrimary || !state.etfSelectedSecondary) return;
  setLoading("etfRefresh", true);
  try {
    await api("/api/etf-holdings/refresh", {
      method: "POST",
      body: JSON.stringify({ primary: state.etfSelectedPrimary, secondary: state.etfSelectedSecondary })
    });
    await Promise.all([
      loadEtfChanges({ silent: true }),
      loadEtfDailyStatus({ silent: true })
    ]);
  } catch (error) {
    state.etfChanges = { ...state.etfChanges, stale: true, errorMessage: error.message };
  } finally {
    setLoading("etfRefresh", false);
  }
}

async function backfillEtfHoldings() {
  if (!state.etfSelectedPrimary || !state.etfSelectedSecondary) return;
  setLoading("etfBackfill", true);
  try {
    await api("/api/etf-holdings/backfill?days=30", {
      method: "POST",
      body: JSON.stringify({ primary: state.etfSelectedPrimary, secondary: state.etfSelectedSecondary, days: 30 })
    });
    await Promise.all([
      loadEtfChanges({ silent: true }),
      loadEtfDailyStatus({ silent: true })
    ]);
  } catch (error) {
    state.etfChanges = { ...state.etfChanges, stale: true, errorMessage: error.message };
  } finally {
    setLoading("etfBackfill", false);
  }
}

function toggleEtfStock(rowKey) {
  if (state.etfExpandedStocks.has(rowKey)) state.etfExpandedStocks.delete(rowKey);
  else state.etfExpandedStocks.add(rowKey);
  render();
}

async function loadSectorFlowPreference(options = {}) {
  if (!options.silent) setLoading("sectorFlowPreference", true);
  try {
    state.sectorFlowPreference = await api(preferencePath(), { timeoutMs: 5000 });
  } catch (error) {
    state.sectorFlowPreference = { ...state.sectorFlowPreference, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("sectorFlowPreference", false);
    else renderAfterAutoRefresh();
  }
}

async function loadSectorRankingOnly(options = {}) {
  await loadEnvelopeWithOptions("sectorRankingDates", "/api/sectors/ranking/dates", { timeoutMs: 6000, ...options });
  const rankingDates = state.sectorRankingDates.data?.dates || [];
  if (state.sectorRankingDate === "latest" && rankingDates[0]) state.sectorRankingDate = rankingDates[0];
  await loadSectorRanking(options);
}

async function ensureSectorFlowLoaded(options = {}) {
  if (!state.authed || state.sectorFlow.data || state.loading.has("sectorFlow")) return;
  await loadSectorFlow(options);
}

function seedSectorFlowSelection() {
  const series = state.sectorFlow.data?.series || [];
  if (!series.length) return;
  const preference = state.sectorFlowPreference.data || {};
  if (preference.exists) {
    const available = new Set(series.map((item) => item.code));
    state.sectorFlowSelected = new Set((preference.selectedCodes || []).filter((code) => available.has(code)));
    if (state.sectorFlowSelected.size || (preference.selectedCodes || []).length === 0) return;
  }
  if (state.sectorFlowSelected.size) return;
  const ordered = [...series].sort((a, b) => (numberOrNull(a.source_rank) ?? Infinity) - (numberOrNull(b.source_rank) ?? Infinity));
  const featured = ordered.filter((item) => item.featured).slice(0, 10);
  const fallback = ordered.slice(0, 10);
  state.sectorFlowSelected = new Set((featured.length ? featured : fallback).map((item) => item.code));
}

function switchSectorMode(mode) {
  state.sectorMode = ["flow", "ranking"].includes(mode) ? mode : "overview";
  stopSectorReplay();
  render();
  if (state.sectorMode === "flow") ensureSectorFlowLoaded();
  if (state.sectorMode === "ranking" && !state.sectorRanking.data && !state.loading.has("sectorRanking")) loadSectorRankingOnly();
  if (state.sectorMode === "overview") ensureSectorOverviewLoaded();
}

function changeSectorFlowDate(value) {
  state.sectorFlowDate = value || "latest";
  state.sectorFlowCursor = null;
  stopSectorReplay();
  loadSectorFlow();
}

function changeSectorRankingDate(value) {
  state.sectorRankingDate = value || "latest";
  state.sectorRankingSort = { key: "source_rank", direction: "asc" };
  loadSectorRanking();
}

function toggleSectorFlowCode(code, checked) {
  if (checked) state.sectorFlowSelected.add(code);
  else state.sectorFlowSelected.delete(code);
  saveSectorFlowPreference();
  render();
}

function selectSectorFlowPreset(preset) {
  const series = state.sectorFlow.data?.series || [];
  const ordered = [...series].sort((a, b) => (numberOrNull(a.source_rank) ?? Infinity) - (numberOrNull(b.source_rank) ?? Infinity));
  if (preset === "all") state.sectorFlowSelected = new Set(series.map((item) => item.code));
  else if (preset === "clear") state.sectorFlowSelected = new Set();
  else state.sectorFlowSelected = new Set(ordered.filter((item) => item.featured).slice(0, 10).map((item) => item.code));
  saveSectorFlowPreference();
  render();
}

async function saveSectorFlowPreference() {
  const selectedCodes = [...state.sectorFlowSelected];
  state.sectorFlowPreference = {
    ...state.sectorFlowPreference,
    data: { exists: true, selectedCodes }
  };
  try {
    const result = await api(preferencePath(), {
      method: "PATCH",
      body: JSON.stringify({ selectedCodes, userId: activeViewUserId() })
    });
    state.sectorFlowPreference = result;
  } catch (error) {
    console.warn("保存板块流向选择失败", error);
    state.sectorFlowPreference = { ...state.sectorFlowPreference, stale: true, errorMessage: error.message };
  }
}

function toggleSectorReplay() {
  if (state.sectorFlowPlaying) stopSectorReplay();
  else startSectorReplay();
  render();
}

function startSectorReplay(options = {}) {
  const data = state.sectorFlow.data;
  if (!data) return;
  const max = Math.max(1, data.last_session_min ?? 239);
  state.sectorFlowPlaying = true;
  if (options.restart || state.sectorFlowCursor == null || state.sectorFlowCursor >= max) {
    state.sectorFlowCursor = 1;
  }
  clearInterval(sectorReplayTimer);
  const token = ++sectorReplayToken;
  sectorReplayTimer = setInterval(() => {
    if (!state.sectorFlowPlaying || token !== sectorReplayToken) {
      clearInterval(sectorReplayTimer);
      return;
    }
    state.sectorFlowCursor = Math.min(max, (state.sectorFlowCursor ?? 1) + 1);
    if (state.sectorFlowCursor >= max) stopSectorReplay();
    render();
  }, Math.max(120, 1000 / Math.max(1, Number(state.sectorFlowSpeed) || 12)));
}

function stopSectorReplay() {
  state.sectorFlowPlaying = false;
  sectorReplayToken += 1;
  clearInterval(sectorReplayTimer);
  sectorReplayTimer = null;
}

function changeSectorReplaySpeed(value) {
  state.sectorFlowSpeed = Math.max(1, Math.min(30, Number(value) || 12));
  if (state.sectorFlowPlaying) startSectorReplay({ restart: false });
  else render();
}

function sortSectorRanking(key) {
  const current = state.sectorRankingSort;
  state.sectorRankingSort = {
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
  };
  render();
}

function downloadSectorRankingCsv() {
  const rows = sortedSectorRankingRows();
  const columns = sectorRankingColumns();
  const lines = [["排名", "代码", "名称", ...columns.map((column) => column.label)].join(",")];
  rows.forEach((row, index) => {
    lines.push([index + 1, row.code, row.name, ...columns.map((column) => row[column.key] == null ? "" : Number(row[column.key]).toFixed(4))]
      .map(csvCell)
      .join(","));
  });
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `sector-ranking-${state.sectorRanking.data?.date || state.sectorRankingDate || "latest"}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function refreshAll(options = {}) {
  if (!options.skipMe) await loadMe();
  await loadDsaConfig();
  if (state.booting) {
    await refreshAllWithBootProgress(options);
    return;
  }
  if (options.priorityMarket) {
    await loadEnvelopeWithOptions("market", "/api/market/overview", { retryOnce: true });
  }
  await Promise.all([
    options.priorityMarket ? Promise.resolve() : loadEnvelopeWithOptions("market", "/api/market/overview", { retryOnce: true }),
    loadEnvelope("aShareAnalysis", "/api/market/a-share-analysis"),
    loadEnvelope("jin10", "/api/news/jin10?limit=10"),
    loadEnvelope("eastmoneyNews", "/api/news/eastmoney-hot?limit=10"),
    loadEnvelope("mainlines", "/api/mainlines?limit=30"),
    loadEnvelope("hotStocks", "/api/hot-stocks?limit=10"),
    loadSectorSummary({ silent: true }),
    hasVipFeature() ? loadNationalTeam({ silent: true }) : Promise.resolve(),
    hasVipFeature() ? loadEtfCategories({ silent: true }) : Promise.resolve(),
    hasVipFeature() ? loadEtfDailyStatus({ silent: true }) : Promise.resolve(),
    loadWatchlist(),
    loadReportSettings(),
    loadAdminUsers(),
    state.user?.isAdmin ? loadTushareStatus() : Promise.resolve(),
    state.dsaConfig.data?.configured ? loadDsaHistory({ silent: true }) : Promise.resolve()
  ]);
}

async function refreshAllWithBootProgress(options = {}) {
  if (!Object.keys(state.bootTasks).length) resetBootTasks();
  if (options.priorityMarket) {
    await runBootTask("market", () => loadEnvelopeWithOptions("market", "/api/market/overview", { retryOnce: true }));
  }
  await runBootTask("watchlist", () => loadWatchlist({ skipPosts: true }));
  await Promise.all([
    options.priorityMarket
      ? Promise.resolve()
      : runBootTask("market", () => loadEnvelopeWithOptions("market", "/api/market/overview", { retryOnce: true })),
    runBootTask("aShareAnalysis", () => loadEnvelope("aShareAnalysis", "/api/market/a-share-analysis")),
    runBootTask("jin10", () => loadEnvelope("jin10", "/api/news/jin10?limit=10")),
    runBootTask("eastmoneyNews", () => loadEnvelope("eastmoneyNews", "/api/news/eastmoney-hot?limit=10")),
    runBootTask("hotTopics", async () => {
      await Promise.all([
        loadEnvelope("mainlines", "/api/mainlines?limit=30"),
        loadEnvelope("hotStocks", "/api/hot-stocks?limit=10")
      ]);
    }),
    runBootTask("sectorSummary", () => loadSectorSummary({ silent: true })),
    hasVipFeature() ? runBootTask("nationalTeam", () => loadNationalTeam({ silent: true })) : Promise.resolve(),
    hasVipFeature() ? runBootTask("etfCategories", () => loadEtfCategories({ silent: true })) : Promise.resolve(),
    hasVipFeature() ? runBootTask("etfDailyStatus", () => loadEtfDailyStatus({ silent: true })) : Promise.resolve(),
    runBootTask("posts", () => state.selectedSymbol ? loadPosts(state.selectedSymbol) : Promise.resolve()),
    runBootTask("reportSettings", () => loadReportSettings()),
    state.user?.isAdmin ? runBootTask("adminUsers", () => loadAdminUsers()) : Promise.resolve(),
    state.user?.isAdmin ? runBootTask("tushareStatus", () => loadTushareStatus()) : Promise.resolve(),
    runBootTask("dsaHistory", () => state.dsaConfig.data?.configured ? loadDsaHistory({ silent: true }) : Promise.resolve())
  ]);
}

async function refreshDashboard() {
  try {
    await refreshAll();
  } finally {
    warmSectorsAfterBoot();
  }
}

function isUserReadingOrEditing() {
  const active = document.activeElement;
  const inputFocused = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  const recentlyScrolled = Date.now() - state.lastUserScrollAt < 2500;
  return Boolean(
    state.detail
    || state.stockDetail
    || state.sectorDetail
    || state.importPreview
    || state.changePasswordOpen
    || state.installGuideOpen
    || state.reportSettingsOpen
    || state.showWatchAdd
    || state.stockSearch.results.data.length
    || state.openHoldingId
    || state.activeTab === "AI分析"
    || state.activeTab === "板块"
    || state.activeTab === "国家队"
    || state.activeTab === "ETF持仓变化"
    || state.activeTab === "使用手册"
    || state.activeTab === "管理"
    || recentlyScrolled
    || inputFocused
  );
}

function runAutoRefresh(task) {
  if (!state.authed || isUserReadingOrEditing()) return;
  task();
}

function renderAfterAutoRefresh() {
  if (!isUserReadingOrEditing()) render();
}

async function addWatch(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    const lookup = await api(`/api/stocks/lookup?symbol=${encodeURIComponent(data.symbol || "")}`);
    const stock = lookup.data || {};
    const costText = data.costPrice || "-";
    const positionText = data.position || "-";
    const confirmed = window.confirm([
      "确认添加自选股吗？",
      `代码：${stock.symbol || data.symbol}`,
      `名称：${stock.name || "-"}`,
      `市场：${stock.market || "-"}`,
      `成本：${costText}`,
      `持仓：${positionText}`
    ].join("\n"));
    if (!confirmed) return;
    await api("/api/watchlist", { method: "POST", body: JSON.stringify({ ...data, symbol: stock.symbol || data.symbol, userId: activeViewUserId() }) });
    form.reset();
    state.showWatchAdd = false;
    await loadWatchlist();
  } catch (error) {
    state.message = error.message;
    render();
  }
}

async function createAdminUser(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const accountInfo = {
    url: window.location.origin,
    displayName: String(data.displayName || "").trim(),
    username: String(data.username || "").trim(),
    password: String(data.password || "")
  };
  setLoading("adminUsers", true);
  try {
    const result = await api("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
    state.adminUsers = { data: result.data || [], updatedAt: new Date().toISOString(), stale: false };
    state.newAccountInfo = accountInfo;
    state.adminUsersExpanded = true;
    state.message = `已创建用户 ${data.displayName || data.username}`;
    form.reset();
  } catch (error) {
    state.message = error.message;
  } finally {
    setLoading("adminUsers", false);
  }
}

async function resetAdminPassword(event) {
  event.preventDefault();
  const form = event.target;
  const userId = form.dataset.userId;
  const data = Object.fromEntries(new FormData(form));
  setLoading("adminUsers", true);
  try {
    const result = await api(`/api/admin/users/${userId}/password`, { method: "PATCH", body: JSON.stringify(data) });
    state.adminUsers = { data: result.data || [], updatedAt: new Date().toISOString(), stale: false };
    state.message = "密码已重置";
    form.reset();
  } catch (error) {
    state.message = error.message;
  } finally {
    setLoading("adminUsers", false);
  }
}

async function updateAccountExpiry(event) {
  event.preventDefault();
  const form = event.target;
  const userId = form.dataset.userId;
  const data = Object.fromEntries(new FormData(form));
  setLoading("adminUsers", true);
  try {
    const result = await api(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(data) });
    state.adminUsers = { data: result.data || [], updatedAt: new Date().toISOString(), stale: false };
    state.message = "账号设置已更新";
  } catch (error) {
    state.message = error.message;
  } finally {
    setLoading("adminUsers", false);
  }
}

async function changeOwnPassword(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  setLoading("changePassword", true);
  try {
    await api("/api/auth/password", { method: "PATCH", body: JSON.stringify(data) });
    state.message = "密码已修改";
    state.changePasswordOpen = false;
    form.reset();
  } catch (error) {
    state.message = error.message;
  } finally {
    setLoading("changePassword", false);
  }
}

async function importWatchScreenshot(form) {
  const file = new FormData(form).get("screenshot");
  if (!file || !file.size) {
    state.message = "请选择一张自选股截图";
    render();
    return;
  }
  setLoading("watchImport", true);
  try {
    const res = await fetch(watchlistPath("/api/watchlist/import-image"), {
      method: "POST",
      credentials: "include",
      body: new FormData(form)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.message || result.errorMessage || "截图识别失败");
    state.importPreview = result;
    state.message = result.message || "";
    form.reset();
  } catch (error) {
    state.message = error.message;
  } finally {
    setLoading("watchImport", false);
  }
}

async function confirmWatchImport(event) {
  event.preventDefault();
  const form = event.target;
  const items = [...form.querySelectorAll("[data-import-row]")]
    .filter((row) => row.querySelector('input[name="enabled"]')?.checked)
    .map((row) => ({
      symbol: row.dataset.symbol,
      costPrice: row.querySelector('input[name="costPrice"]')?.value || "",
      position: row.querySelector('input[name="position"]')?.value || ""
    }));
  if (!items.length) {
    state.message = "请选择至少一只股票";
    render();
    return;
  }
  setLoading("watchImportConfirm", true);
  try {
    const result = await api("/api/watchlist/import-confirm", { method: "POST", body: JSON.stringify({ items, userId: activeViewUserId() }) });
    state.watchlist = result.data || [];
    state.importPreview = null;
    const added = result.added || [];
    const updated = result.updated || [];
    const skipped = result.skipped || [];
    const failed = result.failed || [];
    state.message = [
      result.message || "",
      added.length ? `新增：${added.map((item) => item.name || item.symbol).join("、")}` : "",
      updated.length ? `更新持仓：${updated.map((item) => item.name || item.symbol).join("、")}` : "",
      skipped.length ? `跳过：${skipped.map((item) => `${item.name || item.symbol}(${item.reason})`).join("、")}` : "",
      failed.length ? `未加入：${failed.map((item) => `${item.symbol}(${item.reason})`).join("、")}` : ""
    ].filter(Boolean).join("；");
    render();
  } catch (error) {
    state.message = error.message;
    render();
  } finally {
    setLoading("watchImportConfirm", false);
  }
}

function closeImportPreview() {
  state.importPreview = null;
  if (/识别到\s*\d+\s*条候选/.test(state.message || "")) {
    state.message = "";
  }
  render();
}

async function openDetail(item) {
  state.detail = {
    title: item.title,
    source: item.source || "",
    content: item.content || item.summary || item.title || "暂无正文",
    blocks: item.blocks || [],
    loading: true
  };
  render();
  const normalizedDetailContent = String(item.content || "")
    .replace(/时间：.*$/gm, "")
    .replace(/^【([^】]+)】/, "$1")
    .trim();
  const hasDistinctContent = normalizedDetailContent && normalizedDetailContent !== item.title.trim();
  if (!item.url || (item.source === "金十" && hasDistinctContent)) {
    state.detail.loading = false;
    render();
    return;
  }
  try {
    const result = await api(`/api/content/detail?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.title)}&source=${encodeURIComponent(item.source || "")}`);
    const detail = result.data || {};
    const parsedContent = detail.content || "";
    const usefulContent = parsedContent && !/未解析到正文|暂无正文/.test(parsedContent);
    state.detail = {
      ...detail,
      content: usefulContent ? parsedContent : (item.content || item.summary || item.title || parsedContent),
      blocks: detail.blocks?.length ? detail.blocks : (item.blocks || []),
      loading: false
    };
  } catch (error) {
    state.detail = {
      title: item.title,
      source: item.source || "",
      content: item.content || item.summary || error.message,
      blocks: item.blocks || [],
      loading: false
    };
  }
  render();
}

function closeDetail() {
  state.detail = null;
  render();
}

async function deleteWatch(id) {
  const item = state.watchlist.find((row) => row.id === id);
  if (!item) return;
  const label = item.name ? `${item.name}（${item.symbol}）` : item.symbol;
  if (!window.confirm(`确认删除自选股 ${label} 吗？`)) return;
  await api(watchlistPath(`/api/watchlist/${id}`), { method: "DELETE" });
  if (item.symbol === state.selectedSymbol) state.selectedSymbol = "";
  await loadWatchlist();
}

async function moveWatch(item, direction) {
  const current = [...state.watchlist];
  const index = current.findIndex((row) => row.id === item.id);
  const target = index + direction;
  if (target < 0 || target >= current.length) return;
  const other = current[target];
  await Promise.all([
    api(`/api/watchlist/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...item, sortOrder: other.sortOrder, userId: activeViewUserId() }) }),
    api(`/api/watchlist/${other.id}`, { method: "PATCH", body: JSON.stringify({ ...other, sortOrder: item.sortOrder, userId: activeViewUserId() }) })
  ]);
  await loadWatchlist();
}

async function updateHolding(event) {
  event.preventDefault();
  const form = event.target;
  const id = Number(form.dataset.holdingForm);
  const item = state.watchlist.find((row) => row.id === id);
  if (!item) return;
  const data = Object.fromEntries(new FormData(form));
  const currentCost = formatInputValue(item.costPrice);
  const currentPosition = formatInputValue(item.position);
  const nextCost = data.costPrice || "-";
  const nextPosition = data.position || "-";
  const label = item.name ? `${item.name}（${item.symbol}）` : item.symbol;
  if (!window.confirm(`确认修改 ${label} 的成本/持仓吗？\n成本：${currentCost} -> ${nextCost}\n持仓：${currentPosition} -> ${nextPosition}`)) return;
  try {
    const result = await api(`/api/watchlist/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...item, costPrice: data.costPrice, position: data.position, userId: activeViewUserId() })
    });
    state.watchlist = result.data || [];
    state.openHoldingId = null;
    state.message = "成本和持仓已保存";
    render();
  } catch (error) {
    state.message = error.message;
    render();
  }
}

function activeViewUserId() {
  return state.user?.isAdmin ? (Number(state.viewUserId) || state.user.id) : state.user?.id;
}

function isViewingAdminOwnData() {
  return Boolean(state.user?.isAdmin && Number(activeViewUserId()) === Number(state.user.id));
}

function watchlistPath(base = "/api/watchlist") {
  const userId = activeViewUserId();
  if (!state.user?.isAdmin || !userId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}userId=${encodeURIComponent(userId)}`;
}

function preferencePath(base = "/api/preferences/sector-flow") {
  const userId = activeViewUserId();
  if (!state.user?.isAdmin || !userId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}userId=${encodeURIComponent(userId)}`;
}

function dsaPath(base) {
  const userId = activeViewUserId();
  if (!state.user?.isAdmin || !userId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}userId=${encodeURIComponent(userId)}`;
}

async function switchViewUser(event) {
  state.viewUserId = Number(event.target.value) || state.user?.id || null;
  state.selectedSymbol = "";
  state.stockDetail = null;
  state.posts = { guba: emptyEnvelope([]) };
  state.dsaHistory = emptyEnvelope({ items: [], total: 0 });
  state.dsaNews = emptyEnvelope([]);
  state.dsaTask = null;
  state.dsaPendingTasks = [];
  state.dsaHistorySelection = new Set();
  state.dsaSelectedReport = null;
  state.dsaSelectedRecordId = null;
  state.dsaMessage = "";
  state.dsaHistoryScrollTop = 0;
  state.sectorFlowSelected = new Set();
  state.sectorFlowPreference = emptyEnvelope({ exists: false, selectedCodes: [] });
  await loadWatchlist();
  await loadSectorFlowPreference({ silent: true });
  if (state.sectorFlow.data) seedSectorFlowSelection();
  if (state.dsaConfig.data?.configured) await loadDsaHistory();
  render();
}

function render() {
  const focusedInput = captureFocusedSearchInput();
  rememberStockDetailScroll();
  rememberWatchPanelScroll();
  rememberDsaHistoryScroll();
  rememberSectorFlowPickerScroll();
  rememberPageScroll();
  updateBodyMode();
  app.innerHTML = state.authChecking ? bootTemplate() : (state.authed ? (state.booting ? bootTemplate() : appTemplate()) : loginTemplate());
  bindEvents();
  restoreFocusedSearchInput(focusedInput);
  restoreWatchPanelScroll();
  restoreDsaHistoryScroll();
  restoreStockDetailScroll();
  restorePageScroll();
  syncSectorFlowPickerHeight();
  restoreSectorFlowPickerScroll();
  if (state.authed && !state.booting && state.sectorMode === "overview") {
    ensureSectorOverviewLoaded({ once: true });
  }
}

function appTemplate() {
  return isBigScreenRoute() ? bigScreenTemplate() : dashboardTemplate();
}

function isBigScreenRoute() {
  return window.location.pathname === "/screen" || new URLSearchParams(window.location.search).get("screen") === "1";
}

function navigateApp(path) {
  const target = path || "/";
  if (window.location.pathname !== target || window.location.search) {
    window.history.pushState({}, "", target);
  }
  state.message = "";
  render();
  if (isBigScreenRoute()) ensureSectorFlowLoaded({ silent: true });
}

function isSmallScreenViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function effectiveActiveTab() {
  const tabs = dashboardTabs();
  if (!tabs.includes(state.activeTab)) return "行情";
  return isSmallScreenViewport() && desktopOnlyTabs.has(state.activeTab) ? "行情" : state.activeTab;
}

function updateBodyMode() {
  document.body.classList.toggle("big-screen-body", Boolean(state.authed && !state.booting && isBigScreenRoute()));
}

function captureFocusedSearchInput() {
  const active = document.activeElement;
  if (!active?.matches?.("[data-dsa-search-input], [data-stock-search-input]")) {
    if (Date.now() - state.activeSearchInputAt > 5000) return null;
    if (state.activeSearchInput === "dsa") {
      return {
        selector: "[data-dsa-search-input]",
        kind: "dsa",
        value: state.dsaQuery || state.dsaSearch.query || "",
        selectionStart: null,
        selectionEnd: null
      };
    }
    if (state.activeSearchInput === "stock") {
      return {
        selector: "[data-stock-search-input]",
        kind: "stock",
        value: state.stockSearch.query || "",
        selectionStart: null,
        selectionEnd: null
      };
    }
    return null;
  }
  const value = String(active.value || "");
  const snapshot = {
    selector: active.matches("[data-dsa-search-input]") ? "[data-dsa-search-input]" : "[data-stock-search-input]",
    kind: active.matches("[data-dsa-search-input]") ? "dsa" : "stock",
    value,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd
  };
  if (snapshot.selector === "[data-dsa-search-input]") {
    state.dsaQuery = value;
    state.dsaSearch.query = value;
  } else {
    state.stockSearch.query = value;
  }
  return snapshot;
}

function restoreFocusedSearchInput(snapshot) {
  if (!snapshot) return;
  if (state.activeSearchInput && snapshot.kind && state.activeSearchInput !== snapshot.kind) return;
  const input = document.querySelector(snapshot.selector);
  if (!input) return;
  input.value = snapshot.value;
  input.focus();
  if (snapshot.selectionStart != null && snapshot.selectionEnd != null) {
    input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  } else {
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function shouldShowBootscreen() {
  return true;
}

function bootTemplate() {
  const tasks = visibleBootTaskDefinitions().map(([key, label]) => ({ key, label, ...(state.bootTasks[key] || { status: "pending", message: "" }) }));
  const finished = tasks.filter((task) => task.status === "done" || task.status === "degraded").length;
  const degraded = tasks.filter((task) => task.status === "degraded").length;
  const active = tasks.find((task) => task.status === "loading");
  const progress = tasks.length ? Math.round((finished / tasks.length) * 100) : 0;
  return `
    <main class="boot-shell">
      <section class="boot-card">
        <p class="eyebrow">Asia/Shanghai</p>
        <h1>股市信息综合看板</h1>
        <div class="boot-loader" aria-hidden="true"></div>
        <p class="boot-text">${active ? `正在加载：${escapeHtml(active.label)}` : "正在准备首轮数据"}</p>
        <div class="boot-progress" aria-label="启动加载进度">
          <span style="width:${progress}%"></span>
        </div>
        <p class="boot-count">${finished}/${tasks.length} 已完成${degraded ? ` · ${degraded} 项已降级` : ""}</p>
        <div class="boot-steps">
          ${tasks.map((task) => `
            <span class="${escapeAttr(`boot-step ${task.status}`)}">
              <b>${escapeHtml(task.label)}</b>
              <em>${escapeHtml(bootStatusText(task.status))}</em>
            </span>
          `).join("")}
        </div>
      </section>
    </main>
  `;
}

function bootStatusText(status) {
  return {
    pending: "等待中",
    loading: "加载中",
    done: "已完成",
    degraded: "已降级"
  }[status] || "等待中";
}

function bindEvents() {
  const loginForm = document.querySelector("#login-form");
  if (loginForm) loginForm.addEventListener("submit", login);
  const registerForm = document.querySelector("#register-form");
  if (registerForm) registerForm.addEventListener("submit", register);
  document.querySelectorAll("[data-auth-mode]").forEach((el) => el.addEventListener("click", () => {
    state.authMode = el.dataset.authMode;
    state.message = "";
    render();
  }));
  document.querySelectorAll("[data-big-screen-pause]").forEach((el) => el.addEventListener("click", () => {
    state.bigScreenPaused = !state.bigScreenPaused;
    render();
  }));
  document.querySelectorAll("[data-screen-entry]").forEach((el) => el.addEventListener("click", (event) => {
    event.preventDefault();
    navigateApp("/screen");
  }));
  document.querySelectorAll("[data-big-screen-exit]").forEach((el) => el.addEventListener("click", () => {
    navigateApp("/");
  }));
  const addForm = document.querySelector("#watch-form");
  if (addForm) addForm.addEventListener("submit", addWatch);
  const stockSearchForm = document.querySelector("#stock-search-form");
  if (stockSearchForm) stockSearchForm.addEventListener("submit", searchStocks);
  const dsaForm = document.querySelector("#dsa-analysis-form");
  if (dsaForm) dsaForm.addEventListener("submit", submitDsaAnalysis);
  const dsaBatchForm = document.querySelector("#dsa-batch-form");
  if (dsaBatchForm) dsaBatchForm.addEventListener("submit", submitDsaWatchlistBatch);
  const reportSettingsForm = document.querySelector("#report-settings-form");
  if (reportSettingsForm) reportSettingsForm.addEventListener("submit", saveReportSettings);
  const dsaBatchForce = document.querySelector("[data-dsa-batch-force]");
  if (dsaBatchForce) {
    dsaBatchForce.addEventListener("change", () => {
      state.dsaBatchForceRefresh = dsaBatchForce.checked;
    });
  }
  const dsaSearchInput = document.querySelector("[data-dsa-search-input]");
  if (dsaSearchInput) {
    dsaSearchInput.addEventListener("pointerdown", () => {
      markSearchInput("dsa");
    });
    dsaSearchInput.addEventListener("keydown", () => {
      markSearchInput("dsa");
    });
    dsaSearchInput.addEventListener("compositionstart", startDsaSearchComposition);
    dsaSearchInput.addEventListener("compositionend", endDsaSearchComposition);
    dsaSearchInput.addEventListener("input", scheduleDsaStockSearch);
  }
  document.querySelectorAll("[data-dsa-search-stock]").forEach((el) => el.addEventListener("click", () => chooseDsaStock(el.dataset.dsaSearchStock)));
  document.querySelectorAll("[data-dsa-history-check]").forEach((el) => el.addEventListener("change", () => toggleDsaHistorySelection(el.dataset.dsaHistoryCheck, el.checked)));
  document.querySelectorAll("[data-dsa-history-select-all]").forEach((el) => el.addEventListener("change", () => toggleAllDsaHistorySelection(el.checked)));
  document.querySelectorAll("[data-dsa-delete-selected]").forEach((el) => el.addEventListener("click", deleteSelectedDsaHistory));
  document.querySelectorAll("[data-dsa-task-id]").forEach((el) => el.addEventListener("click", () => selectDsaPendingTask(el.dataset.dsaTaskId)));
  document.querySelectorAll("[data-dsa-history-id]").forEach((el) => el.addEventListener("click", () => selectDsaHistory(el.dataset.dsaHistoryId)));
  const dsaHistoryList = document.querySelector(".dsa-history-list");
  if (dsaHistoryList) {
    dsaHistoryList.addEventListener("scroll", () => {
      state.dsaHistoryScrollTop = dsaHistoryList.scrollTop;
    }, { passive: true });
  }
  document.querySelectorAll("[data-dsa-news-filter]").forEach((el) => el.addEventListener("click", () => {
    state.dsaNewsFilter = el.dataset.dsaNewsFilter === "announcement" ? "announcement" : "news";
    render();
  }));
  document.querySelectorAll("[data-dsa-news-index]").forEach((el) => el.addEventListener("click", () => {
    const item = state.dsaNews.data[Number(el.dataset.dsaNewsIndex)];
    if (item) openDetail(item);
  }));
  document.querySelectorAll("[data-dsa-refresh-history]").forEach((el) => el.addEventListener("click", () => loadDsaHistory()));
  const stockSearchInput = document.querySelector("[data-stock-search-input]");
  if (stockSearchInput) {
    stockSearchInput.addEventListener("focusin", redirectUnexpectedSearchFocus);
    stockSearchInput.addEventListener("pointerdown", () => {
      markSearchInput("stock");
    });
    stockSearchInput.addEventListener("keydown", () => {
      markSearchInput("stock");
    });
    stockSearchInput.addEventListener("compositionstart", startStockSearchComposition);
    stockSearchInput.addEventListener("compositionend", endStockSearchComposition);
    stockSearchInput.addEventListener("input", scheduleStockSearch);
  }
  document.querySelectorAll("[data-search-stock]").forEach((el) => el.addEventListener("click", () => openSearchedStock(el.dataset.searchStock)));
  document.querySelectorAll("[data-toggle-watch-add]").forEach((el) => el.addEventListener("click", () => {
    state.showWatchAdd = !state.showWatchAdd;
    render();
  }));
  document.querySelectorAll("[data-holding-form]").forEach((form) => form.addEventListener("submit", updateHolding));
  const adminCreateForm = document.querySelector("#admin-create-form");
  if (adminCreateForm) adminCreateForm.addEventListener("submit", createAdminUser);
  document.querySelectorAll("[data-toggle-admin-users]").forEach((el) => el.addEventListener("click", () => {
    state.adminUsersExpanded = !state.adminUsersExpanded;
    render();
  }));
  document.querySelectorAll("[data-reset-password]").forEach((form) => form.addEventListener("submit", resetAdminPassword));
  document.querySelectorAll("[data-account-expiry]").forEach((form) => form.addEventListener("submit", updateAccountExpiry));
  const changePasswordForm = document.querySelector("#change-password-form");
  if (changePasswordForm) changePasswordForm.addEventListener("submit", changeOwnPassword);
  const importForm = document.querySelector("#watch-image-form");
  if (importForm) {
    importForm.addEventListener("submit", (event) => event.preventDefault());
    importForm.querySelector("input")?.addEventListener("change", () => importWatchScreenshot(importForm));
  }
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => switchTab(el.dataset.tab)));
  document.querySelectorAll("[data-refresh]").forEach((el) => el.addEventListener("click", refreshDashboard));
  document.querySelectorAll("[data-logout]").forEach((el) => el.addEventListener("click", logout));
  document.querySelectorAll("[data-open-stock]").forEach((el) => el.addEventListener("click", (event) => {
    event.preventDefault();
    openStockDetail(el.dataset.openStock);
  }));
  document.querySelectorAll("[data-stock-chip]").forEach((el) => el.addEventListener("click", () => {
    const item = state.watchlist.find((row) => row.symbol === el.dataset.stockChip);
    openStockDetail(el.dataset.stockChip, item);
  }));
  document.querySelectorAll("[data-delete]").forEach((el) => el.addEventListener("click", () => deleteWatch(Number(el.dataset.delete))));
  document.querySelectorAll("[data-up]").forEach((el) => el.addEventListener("click", () => {
    const item = state.watchlist.find((row) => row.id === Number(el.dataset.up));
    if (item) moveWatch(item, -1);
  }));
  document.querySelectorAll("[data-down]").forEach((el) => el.addEventListener("click", () => {
    const item = state.watchlist.find((row) => row.id === Number(el.dataset.down));
    if (item) moveWatch(item, 1);
  }));
  document.querySelectorAll("[data-toggle-holding]").forEach((el) => el.addEventListener("click", () => {
    const id = Number(el.dataset.toggleHolding);
    state.openHoldingId = state.openHoldingId === id ? null : id;
    render();
  }));
  document.querySelectorAll("[data-news-index]").forEach((el) => el.addEventListener("click", () => {
    const item = state.jin10.data[Number(el.dataset.newsIndex)];
    if (item) openDetail(item);
  }));
  document.querySelectorAll("[data-eastmoney-news-index]").forEach((el) => el.addEventListener("click", () => {
    const item = state.eastmoneyNews.data[Number(el.dataset.eastmoneyNewsIndex)];
    if (item) openDetail(item);
  }));
  document.querySelectorAll("[data-stock-detail-info-filter]").forEach((el) => el.addEventListener("click", () => {
    state.stockDetailInfoFilter = el.dataset.stockDetailInfoFilter === "news" ? "news" : "announcement";
    render();
  }));
  document.querySelectorAll("[data-stock-detail-news-index]").forEach((el) => el.addEventListener("click", () => {
    const item = state.stockDetailNews.data[Number(el.dataset.stockDetailNewsIndex)];
    if (item) openDetail(item);
  }));
  document.querySelectorAll("[data-announcement-index]").forEach((el) => el.addEventListener("click", () => {
    const item = state.stockAnnouncements.data[Number(el.dataset.announcementIndex)];
    if (item) openDetail(item);
  }));
  document.querySelectorAll("[data-hot-index]").forEach((el) => el.addEventListener("click", () => {
    const item = state.hotStocks.data[Number(el.dataset.hotIndex)];
    if (item?.symbol) openStockDetail(item.symbol, item);
  }));
  document.querySelectorAll("[data-mainlines-toggle]").forEach((el) => el.addEventListener("click", () => {
    state.mainlinesExpanded = !state.mainlinesExpanded;
    render();
  }));
  document.querySelectorAll("[data-mainline-sector]").forEach((el) => el.addEventListener("click", () => openSectorDetail(el.dataset.mainlineSector)));
  document.querySelectorAll("[data-sector-detail]").forEach((el) => el.addEventListener("click", () => openSectorDetail(el.dataset.sectorDetail)));
  document.querySelectorAll("[data-sector-stock-open]").forEach((el) => el.addEventListener("click", () => openSectorStock(el.dataset.sectorStockOpen)));
  document.querySelectorAll("[data-close-sector-detail]").forEach((el) => el.addEventListener("click", closeSectorDetail));
  document.querySelectorAll("[data-close-stock-detail]").forEach((el) => el.addEventListener("click", closeStockDetail));
  document.querySelectorAll("[data-chart-period]").forEach((el) => el.addEventListener("click", () => switchStockChartPeriod(el.dataset.chartPeriod)));
  document.querySelectorAll("[data-chart-interactive]").forEach((el) => el.addEventListener("pointerdown", selectChartPoint));
  document.querySelectorAll("[data-sector-mode]").forEach((el) => el.addEventListener("click", () => switchSectorMode(el.dataset.sectorMode)));
  document.querySelectorAll("[data-sector-flow-date]").forEach((el) => el.addEventListener("change", () => changeSectorFlowDate(el.value)));
  document.querySelectorAll("[data-sector-ranking-date]").forEach((el) => el.addEventListener("change", () => changeSectorRankingDate(el.value)));
  document.querySelectorAll("[data-sector-flow-code]").forEach((el) => el.addEventListener("change", () => toggleSectorFlowCode(el.dataset.sectorFlowCode, el.checked)));
  document.querySelectorAll("[data-sector-flow-preset]").forEach((el) => el.addEventListener("click", () => selectSectorFlowPreset(el.dataset.sectorFlowPreset)));
  document.querySelectorAll("[data-sector-flow-chart]").forEach((el) => {
    el.addEventListener("pointermove", updateSectorFlowHover);
    el.addEventListener("pointerleave", clearSectorFlowHover);
  });
  document.querySelectorAll("[data-sector-replay]").forEach((el) => {
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      el.textContent = state.sectorFlowPlaying ? "回放" : "暂停";
      toggleSectorReplay();
    });
    el.addEventListener("click", (event) => event.preventDefault());
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSectorReplay();
    });
  });
  document.querySelectorAll("[data-sector-speed]").forEach((el) => el.addEventListener("input", () => changeSectorReplaySpeed(el.value)));
  document.querySelectorAll("[data-sector-sort]").forEach((el) => el.addEventListener("click", () => sortSectorRanking(el.dataset.sectorSort)));
  document.querySelectorAll("[data-sector-export]").forEach((el) => el.addEventListener("click", downloadSectorRankingCsv));
  document.querySelectorAll("[data-etf-primary]").forEach((el) => el.addEventListener("change", () => changeEtfPrimary(el.value)));
  document.querySelectorAll("[data-etf-secondary]").forEach((el) => el.addEventListener("change", () => changeEtfSecondary(el.value)));
  document.querySelectorAll("[data-etf-period]").forEach((el) => el.addEventListener("change", () => changeEtfPeriod(el.value)));
  document.querySelectorAll("[data-etf-category-clear]").forEach((el) => el.addEventListener("click", clearEtfCategorySelection));
  document.querySelectorAll("[data-etf-block-sort]").forEach((el) => el.addEventListener("change", () => changeEtfBlockSort(el.dataset.etfBlockSort, el.value)));
  document.querySelectorAll("[data-etf-stock-query-form]").forEach((el) => el.addEventListener("submit", submitEtfStockQuery));
  document.querySelectorAll("[data-etf-stock-input]").forEach((el) => {
    el.addEventListener("input", scheduleEtfStockSuggestions);
    el.addEventListener("compositionstart", startEtfStockSuggestComposition);
    el.addEventListener("compositionend", endEtfStockSuggestComposition);
    el.addEventListener("focus", () => {
      markSearchInput("etfStock");
      const query = String(el.value || "").trim();
      if (query.length >= 2 && state.etfStockSuggestions.query !== query) {
        state.etfStockQuery = query;
        loadEtfStockSuggestions(query, { quiet: true });
      }
    });
  });
  document.querySelectorAll("[data-etf-stock-suggest]").forEach((el) => el.addEventListener("click", () => chooseEtfStockSuggestion(el.dataset.etfStockSuggest)));
  document.querySelectorAll("[data-etf-stock-clear]").forEach((el) => el.addEventListener("click", clearEtfStockLookup));
  document.querySelectorAll("[data-etf-watch-holdings]").forEach((el) => el.addEventListener("click", () => loadEtfWatchHoldings()));
  document.querySelectorAll("[data-etf-watch-clear]").forEach((el) => el.addEventListener("click", clearEtfWatchHoldings));
  document.querySelectorAll("[data-etf-stock-toggle]").forEach((el) => el.addEventListener("click", () => toggleEtfStock(el.dataset.etfStockToggle)));
  document.querySelectorAll("[data-nt-filter]").forEach((el) => el.addEventListener("change", () => changeNationalTeamFilter(el.dataset.ntFilter, el.value)));
  document.querySelectorAll("[data-nt-search-form]").forEach((el) => el.addEventListener("submit", submitNationalTeamSearch));
  document.querySelectorAll("[data-nt-clear]").forEach((el) => el.addEventListener("click", clearNationalTeamFilters));
  document.querySelectorAll("[data-nt-stock]").forEach((el) => el.addEventListener("click", () => openNationalTeamStock(el.dataset.ntStock)));
  document.querySelectorAll("[data-close-detail]").forEach((el) => el.addEventListener("click", closeDetail));
  const stockDetailContent = document.querySelector(".stock-detail-content");
  if (stockDetailContent) {
    stockDetailContent.addEventListener("scroll", () => {
      state.stockDetailScrollTop = stockDetailContent.scrollTop;
    }, { passive: true });
  }
  const watchPanel = document.querySelector(".watch-panel");
  if (watchPanel) {
    watchPanel.addEventListener("scroll", () => {
      if (state.lockedWatchPanelScrollTop != null) {
        const targetTop = Math.min(state.lockedWatchPanelScrollTop, Math.max(0, watchPanel.scrollHeight - watchPanel.clientHeight));
        if (Math.abs(watchPanel.scrollTop - targetTop) > 1) {
          requestAnimationFrame(() => {
            watchPanel.scrollTop = targetTop;
          });
        }
        return;
      }
      state.watchPanelScrollTop = watchPanel.scrollTop;
      state.lastUserScrollAt = Date.now();
    }, { passive: true });
  }
  const importConfirmForm = document.querySelector("#import-confirm-form");
  if (importConfirmForm) importConfirmForm.addEventListener("submit", confirmWatchImport);
  document.querySelectorAll("[data-close-import-preview]").forEach((el) => el.addEventListener("click", closeImportPreview));
  const viewUserSelect = document.querySelector("#view-user-select");
  if (viewUserSelect) viewUserSelect.addEventListener("change", switchViewUser);
  document.querySelectorAll("[data-reload-app]").forEach((el) => el.addEventListener("click", reloadToLatest));
  document.querySelectorAll("[data-open-install-guide]").forEach((el) => el.addEventListener("click", () => {
    state.installGuideOpen = true;
    render();
  }));
  document.querySelectorAll("[data-open-change-password]").forEach((el) => el.addEventListener("click", () => {
    state.changePasswordOpen = true;
    render();
  }));
  document.querySelectorAll("[data-open-report-settings]").forEach((el) => el.addEventListener("click", () => {
    state.reportSettingsOpen = true;
    state.reportMessage = "";
    loadReportSettings().finally(render);
  }));
  document.querySelectorAll("[data-close-report-settings]").forEach((el) => el.addEventListener("click", () => {
    state.reportSettingsOpen = false;
    render();
  }));
  document.querySelectorAll("[data-report-test]").forEach((el) => el.addEventListener("click", sendDailyReportTest));
  document.querySelectorAll("[data-close-change-password]").forEach((el) => el.addEventListener("click", () => {
    state.changePasswordOpen = false;
    render();
  }));
  document.querySelectorAll("[data-close-account-info]").forEach((el) => el.addEventListener("click", () => {
    state.newAccountInfo = null;
    render();
  }));
  document.querySelectorAll("[data-copy-account-info]").forEach((el) => el.addEventListener("click", copyNewAccountInfo));
  document.querySelectorAll("[data-close-install-guide]").forEach((el) => el.addEventListener("click", () => {
    state.installGuideOpen = false;
    render();
  }));
}

function rememberStockDetailScroll() {
  const content = document.querySelector(".stock-detail-content");
  if (content) state.stockDetailScrollTop = content.scrollTop;
}

function restoreStockDetailScroll() {
  if (!state.stockDetail) return;
  const restore = () => {
    const content = document.querySelector(".stock-detail-content");
    if (!content) return;
    if (state.stockDetailScrollTop) content.scrollTop = state.stockDetailScrollTop;
    const anchor = state.stockDetailPostAnchor
      ? document.querySelector(`[data-post-anchor="${cssEscape(state.stockDetailPostAnchor)}"]`)
      : null;
    if (anchor && content.contains(anchor)) {
      const targetTop = Math.max(0, anchor.offsetTop - Math.round(content.clientHeight * 0.45));
      content.scrollTop = Math.max(content.scrollTop, targetTop);
      state.stockDetailScrollTop = content.scrollTop;
    }
  };
  requestAnimationFrame(restore);
  setTimeout(restore, 80);
  setTimeout(restore, 260);
}

function rememberWatchPanelScroll() {
  if (state.lockedWatchPanelScrollTop != null) {
    state.watchPanelScrollTop = state.lockedWatchPanelScrollTop;
    return;
  }
  if (state.lockedPageScrollTop != null) return;
  const panel = document.querySelector(".watch-panel");
  if (panel) state.watchPanelScrollTop = panel.scrollTop;
}

function restoreWatchPanelScroll() {
  const targetTop = state.lockedWatchPanelScrollTop ?? state.watchPanelScrollTop;
  if (!targetTop) return;
  const restore = () => {
    const panel = document.querySelector(".watch-panel");
    if (!panel) return;
    const maxTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
    panel.scrollTop = Math.min(targetTop, maxTop);
  };
  requestAnimationFrame(restore);
  setTimeout(restore, 80);
  setTimeout(restore, 220);
}

function rememberDsaHistoryScroll() {
  const list = document.querySelector(".dsa-history-list");
  if (list) state.dsaHistoryScrollTop = list.scrollTop;
}

function restoreDsaHistoryScroll() {
  if (!state.dsaHistoryScrollTop) return;
  const targetTop = state.dsaHistoryScrollTop;
  const restore = () => {
    const list = document.querySelector(".dsa-history-list");
    if (!list) return;
    const maxTop = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTop = Math.min(targetTop, maxTop);
  };
  requestAnimationFrame(restore);
  setTimeout(restore, 80);
  setTimeout(restore, 220);
}

function rememberSectorFlowPickerScroll() {
  const list = document.querySelector(".sector-flow-checks");
  if (list) state.sectorFlowPickerScrollTop = list.scrollTop;
}

function restoreSectorFlowPickerScroll() {
  if (!state.sectorFlowPickerScrollTop) return;
  const targetTop = state.sectorFlowPickerScrollTop;
  const restore = () => {
    const list = document.querySelector(".sector-flow-checks");
    if (!list) return;
    const maxTop = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTop = Math.min(targetTop, maxTop);
  };
  restore();
  requestAnimationFrame(restore);
  setTimeout(restore, 80);
  setTimeout(restore, 220);
}

function rememberPageScroll() {
  if (state.lockedPageScrollTop != null) {
    state.pageScrollTop = state.lockedPageScrollTop;
    return;
  }
  state.pageScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
}

function restorePageScroll() {
  if (!state.authed || state.booting || !state.pageScrollTop) return;
  const top = state.pageScrollTop;
  if (document.body.classList.contains("scroll-locked")) return;
  const restore = () => window.scrollTo({ top, left: 0, behavior: "auto" });
  requestAnimationFrame(restore);
  setTimeout(restore, 80);
  setTimeout(restore, 220);
}

function lockBodyScroll() {
  const top = state.lockedPageScrollTop ?? (window.scrollY || document.documentElement.scrollTop || 0);
  document.body.classList.add("scroll-locked");
  document.body.style.top = `-${top}px`;
}

function unlockBodyScroll(top = state.pageScrollTop || 0) {
  document.body.classList.remove("scroll-locked");
  document.body.style.top = "";
  window.scrollTo({ top, left: 0, behavior: "auto" });
}

function switchTab(tab) {
  if (!tab || state.activeTab === tab) return;
  if ((tab === "ETF持仓变化" || tab === "国家队") && !hasVipFeature()) return;
  if (tab === "管理" && !state.user?.isAdmin) return;
  if (isSmallScreenViewport() && desktopOnlyTabs.has(tab)) return;
  if (state.activeTab === "板块") stopSectorReplay();
  state.activeTab = tab;
  if (tab === "板块") state.sectorOverviewLoadRequested = false;
  state.lockedPageScrollTop = 0;
  state.pageScrollTop = 0;
  state.watchPanelScrollTop = 0;
  state.lockedWatchPanelScrollTop = null;
  state.lastUserScrollAt = Date.now();
  render();
  if (tab === "板块" && state.sectorMode === "overview") ensureSectorOverviewLoaded();
  if (tab === "板块" && state.sectorMode === "ranking" && !state.sectorRanking.data && !state.loading.has("sectorRanking")) loadSectorRankingOnly();
  if (tab === "板块" && state.sectorMode === "flow" && !state.sectorFlow.data && !state.loading.has("sectorFlow")) ensureSectorFlowLoaded();
  if (tab === "国家队" && !state.ntOverview.data && !state.loading.has("nationalTeam")) loadNationalTeam();
  if (tab === "ETF持仓变化") {
    if (!state.etfCategories.data?.categories?.length && !state.loading.has("etfCategories")) loadEtfCategories();
    if (!state.etfDailyStatus.data && !state.loading.has("etfDailyStatus")) loadEtfDailyStatus();
  }
  state.lockedPageScrollTop = null;
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

function loginTemplate() {
  const isRegister = state.authMode === "register" && state.allowSignup;
  return `
    <main class="login-shell">
      <section class="login-panel">
        <p class="eyebrow">Personal Market Dashboard</p>
        <h1>${isRegister ? "创建用户" : "股市信息综合看板"}</h1>
        ${isRegister ? registerTemplate() : loginFormTemplate()}
        ${state.allowSignup ? `
          <button class="plain-button auth-switch" type="button" data-auth-mode="${isRegister ? "login" : "register"}">
            ${isRegister ? "返回登录" : "创建新用户"}
          </button>
        ` : ""}
        ${state.message ? `<p class="error">${escapeHtml(state.message)}</p>` : ""}
      </section>
    </main>
  `;
}

function loginFormTemplate() {
  return `
    <form id="login-form" class="login-form">
      <label>
        用户名
        <input name="username" autocomplete="username" placeholder="请输入用户名" autofocus />
      </label>
      <label>
        访问密码
        <input name="password" type="password" autocomplete="current-password" placeholder="请输入访问密码" />
      </label>
      <button type="submit">进入看板</button>
    </form>
  `;
}

function registerTemplate() {
  return `
    <form id="register-form" class="login-form">
      <label>
        用户名
        <input name="username" autocomplete="username" placeholder="设置用户名" autofocus required />
      </label>
      <label>
        密码
        <input name="password" type="password" autocomplete="new-password" placeholder="至少 6 位" required />
      </label>
      ${state.signupCodeRequired ? `
        <label>
          注册码
          <input name="signupCode" placeholder="请输入注册码" required />
        </label>
      ` : ""}
      <button type="submit">创建并进入</button>
    </form>
  `;
}

function dashboardTemplate() {
  const tabs = dashboardTabs();
  const mobileTabs = tabs.filter((tab) => !desktopOnlyTabs.has(tab));
  const activeTab = effectiveActiveTab();
  return `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Asia/Shanghai</p>
          <h1>股市信息综合看板</h1>
        </div>
        <div class="top-actions">
          ${adminViewSwitcherTemplate()}
          <a class="plain-button compact-button screen-entry-button" href="/screen" data-screen-entry>大屏模式</a>
          <button class="plain-button compact-button" type="button" data-open-install-guide>快捷入口</button>
          <button class="plain-button compact-button" type="button" data-open-report-settings>收盘日报</button>
          <button class="plain-button compact-button" type="button" data-open-change-password>改密码</button>
          <button class="icon-button" title="刷新" data-refresh>⟳</button>
          <button class="text-button" data-logout>退出</button>
        </div>
      </header>

      ${appUpdateTemplate()}

      <nav class="mobile-tabs">
        ${mobileTabs.map((tab) => `<button class="${activeTab === tab ? "active" : ""}" data-tab="${tab}">${tab}</button>`).join("")}
      </nav>

      ${state.message ? `<p class="banner">${escapeHtml(state.message)}</p>` : ""}

      <main class="dashboard-grid">
        <section class="panel stock-search-panel mobile-section ${mobileVisible("行情")}">
          ${stockSearchTemplate()}
        </section>

        <section class="panel market-panel mobile-section ${mobileVisible("行情")}">
          ${sectionTitle("核心行情", state.market, "market")}
          ${marketQuotesTemplate()}
          ${aShareAnalysisTemplate()}
        </section>

        <section class="panel dsa-panel mobile-section ${mobileVisible("AI分析")}">
          ${sectionTitle("AI 分析", state.dsaConfig, "dsa")}
          ${dsaAnalysisTemplate()}
        </section>

        <section class="panel watch-panel mobile-section ${mobileVisible("自选股")}">
          ${sectionTitle("我的自选股", { updatedAt: "", stale: false }, "watchlist")}
          ${watchActionsTemplate()}
          ${watchForm()}
          ${watchSummaryTemplate()}
          <div class="watch-list">${state.watchlist.map(watchItem).join("") || emptyState("还没有自选股")}</div>
        </section>

        <section class="panel news-panel mobile-section ${mobileVisible("资讯")}">
          ${sectionTitle("金十重要事件", state.jin10, "jin10")}
          <ol class="news-list">${state.jin10.data.map(newsItem).join("") || emptyState("暂未取得金十事件")}</ol>
        </section>

        <section class="panel eastmoney-news-panel mobile-section ${mobileVisible("资讯")}">
          ${sectionTitle("东方财富资讯热榜", state.eastmoneyNews, "eastmoneyNews")}
          <ol class="news-list">${state.eastmoneyNews.data.map(eastmoneyNewsItem).join("") || emptyState("暂未取得资讯热榜")}</ol>
        </section>

        <div class="heat-row mobile-section ${mobileVisible("热度")}">
          <section class="panel mainline-panel">
            ${sectionTitle("主线跟踪", state.mainlines, "mainlines")}
            ${mainlineListToolbar()}
            <ol class="mainline-list">${visibleMainlines().map(mainlineItem).join("") || emptyState("暂未取得主线数据")}</ol>
          </section>

          <section class="panel hot-panel">
            ${sectionTitle("东财热股", state.hotStocks, "hotStocks")}
            <ol class="hot-list">${state.hotStocks.data.map(hotStockItem).join("") || emptyState("暂未取得热门股票")}</ol>
          </section>
        </div>

        <section class="panel sector-feature-panel mobile-section ${mobileVisible("板块")}">
          ${sectionTitle("板块", state.sectorMode === "flow" ? state.sectorFlow : state.sectorRanking, state.sectorMode === "flow" ? "sectorFlow" : "sectorRanking")}
          ${sectorFeatureTemplate()}
        </section>

        ${hasVipFeature() ? `
          <section class="panel national-team-panel mobile-section ${mobileVisible("国家队")}">
            ${sectionTitle("国家队持仓透视", state.ntOverview.data ? state.ntOverview : state.ntPositions, "nationalTeam")}
            ${nationalTeamTemplate()}
          </section>
        ` : ""}

        ${hasVipFeature() ? `
          <section class="panel etf-holdings-panel mobile-section ${mobileVisible("ETF持仓变化")}">
            ${sectionTitle("ETF持仓变化", state.etfChanges.data ? state.etfChanges : state.etfCategories, "etfHoldings")}
            ${etfHoldingsTemplate()}
          </section>
        ` : ""}

        ${state.user?.isAdmin ? `
          <section class="panel admin-panel mobile-section ${mobileVisible("管理")}">
            ${sectionTitle("用户管理", state.adminUsers, "adminUsers")}
            ${adminPanelTemplate()}
          </section>
        ` : ""}

        <section class="panel guide-panel mobile-section ${mobileVisible("使用手册")}">
          ${sectionTitle("使用手册", { updatedAt: "", stale: false }, "guide")}
          ${userManualTemplate()}
        </section>

      </main>
      ${importPreviewTemplate()}
      ${reportSettingsTemplate()}
      ${changePasswordTemplate()}
      ${sectorDetailTemplate()}
      ${installGuideTemplate()}
      ${newAccountInfoTemplate()}
      ${stockDetailTemplate()}
      ${detailTemplate()}
    </div>
  `;
}

function bigScreenTemplate() {
  if (isSmallScreenViewport()) {
    return `
      <main class="big-screen-mobile-note">
        <section>
          <p class="eyebrow">Large Screen Mode</p>
          <h1>请使用 PC 端查看大屏</h1>
          <p>实时大屏按宽屏投屏设计，手机端不提供适配版本。</p>
          <button type="button" data-big-screen-exit>返回普通看板</button>
        </section>
      </main>
    `;
  }
  const screenClass = state.bigScreenPaused ? "paused" : "running";
  const tickerHtml = bigScreenTickerRows().map(bigScreenTickerItem).join("");
  const marqueeText = bigScreenMarqueeText();
  return `
    <main class="big-screen ${escapeAttr(screenClass)}">
      <div class="big-screen-bg" aria-hidden="true"></div>
      <header class="big-screen-header">
        <div>
          <p>Exchange Command Center · Asia/Shanghai</p>
          <h1>股市信息综合实时大屏</h1>
        </div>
        <section class="big-screen-status">
          <span>Live</span>
          <strong>${escapeHtml(formatTime(new Date().toISOString()))}</strong>
          <em>${escapeHtml(bigScreenLatestUpdate())}</em>
        </section>
      </header>
      <section class="big-screen-ticker" aria-label="核心行情">
        <div style="${bigScreenAnimationDelayStyle(30_000)}">
          ${tickerHtml || `<span>核心行情等待刷新</span>`}
          ${tickerHtml}
        </div>
      </section>
      <section class="big-screen-grid">
        <aside class="big-screen-column left">
          ${bigScreenNewsPanel()}
          ${bigScreenWatchPanel()}
        </aside>
        <section class="big-screen-center">
          ${bigScreenMarketPanel()}
          ${bigScreenSectorFlowPanel()}
          ${bigScreenMainlinePanel()}
        </section>
        <aside class="big-screen-column right">
          ${bigScreenRankingPanel()}
          ${bigScreenHeatPanel()}
        </aside>
      </section>
      <footer class="big-screen-footer">
        <div class="big-screen-marquee" style="${bigScreenAnimationDelayStyle(54_000)}">
          <span>${marqueeText}</span>
          <span>${marqueeText}</span>
        </div>
      </footer>
      <nav class="big-screen-controls" aria-label="大屏控制">
        <button type="button" data-big-screen-pause>${state.bigScreenPaused ? "继续滚动" : "暂停滚动"}</button>
        <button type="button" data-big-screen-exit>返回看板</button>
      </nav>
    </main>
  `;
}

function bigScreenLatestUpdate() {
  const times = [
    state.market.updatedAt,
    state.aShareAnalysis.updatedAt,
    state.sectorFlow.updatedAt,
    state.sectorRanking.updatedAt,
    state.jin10.updatedAt,
    state.eastmoneyNews.updatedAt,
    state.hotStocks.updatedAt
  ].filter(Boolean);
  if (!times.length) return "等待首轮数据";
  return `最新同步 ${formatTime(times.sort().at(-1))}`;
}

function bigScreenTickerRows() {
  return (state.market.data || []).slice(0, 8);
}

function bigScreenTickerItem(item) {
  const trend = trendClass(item.changePercent);
  const key = String(item.symbol || item.name || "");
  const valueKey = `${formatNumber(item.price)}|${formatPercent(item.changePercent)}`;
  const previous = state.bigScreenQuoteCache.get(key);
  const changed = Boolean(previous && previous !== valueKey);
  if (key) state.bigScreenQuoteCache.set(key, valueKey);
  return `
    <span class="${escapeAttr(`${trend}${changed ? " value-changed" : ""}`)}">
      <i>${escapeHtml(item.name)}</i>
      <b>${escapeHtml(formatNumber(item.price))}</b>
      <em>${escapeHtml(formatPercent(item.changePercent))}</em>
    </span>
  `;
}

function bigScreenNewsPanel() {
  const rows = bigScreenStableNewsRows(bigScreenNewsRows());
  const rowHtml = rows.map((item, index) => `
    <p>
      <i>${String(index + 1).padStart(2, "0")}</i>
      <span>${escapeHtml(item.title)}</span>
      <em>${escapeHtml(item.source)}</em>
    </p>
  `).join("");
  return `
    <article class="big-screen-card news">
      <header>
        <span>资讯快讯</span>
        <b>${rows.length} 条</b>
      </header>
      <div class="big-screen-scroll-viewport">
        <div class="big-screen-scroll-list" style="${bigScreenAnimationDelayStyle(bigScreenNewsDuration(rows.length))}">
          ${rowHtml || `<p><span>资讯等待刷新</span></p>`}
          ${rowHtml}
        </div>
      </div>
    </article>
  `;
}

function bigScreenNewsRows() {
  const jin10Rows = (state.jin10.data || []).slice(0, 8).map((item) => ({ title: item.title, source: "金十" }));
  const eastRows = (state.eastmoneyNews.data || []).slice(0, 8).map((item) => ({ title: item.title, source: "东财" }));
  return [...jin10Rows, ...eastRows].filter((item) => item.title);
}

function bigScreenStableNewsRows(incomingRows) {
  const incomingMap = new Map(incomingRows.map((item) => [`${item.source}:${item.title}`, item]));
  if (!state.bigScreenNewsFeed.length) {
    state.bigScreenNewsFeed = incomingRows.slice(0, 24);
    return state.bigScreenNewsFeed;
  }
  const existingKeys = new Set(state.bigScreenNewsFeed.map((item) => `${item.source}:${item.title}`));
  const nextRows = incomingRows.filter((item) => !existingKeys.has(`${item.source}:${item.title}`));
  const activeRows = state.bigScreenNewsFeed.filter((item) => incomingMap.has(`${item.source}:${item.title}`));
  state.bigScreenNewsFeed = [...activeRows, ...nextRows].slice(-24);
  return state.bigScreenNewsFeed.length ? state.bigScreenNewsFeed : incomingRows;
}

function bigScreenNewsDuration(count) {
  return Math.max(32_000, Math.min(68_000, (Number(count) || 1) * 3200));
}

function bigScreenWatchPanel() {
  const summary = bigScreenWatchSummary();
  const rows = bigScreenWatchRows();
  return `
    <article class="big-screen-card watch">
      <header>
        <span>自选股组合</span>
        <b>${escapeHtml(summary.positionCount || 0)} 持仓</b>
      </header>
      <div class="big-screen-kpi-row">
        ${bigScreenKpi("总市值", formatMoney(summary.marketValue))}
        ${bigScreenKpi("今日盈亏", `${formatSignedMoney(summary.todayProfit)} / ${formatPercent(summary.todayProfitPercent)}`, trendClass(summary.todayProfit))}
        ${bigScreenKpi("总盈亏", `${formatSignedMoney(summary.totalProfit)} / ${formatPercent(summary.totalProfitPercent)}`, trendClass(summary.totalProfit))}
      </div>
      <ol class="big-screen-mini-rank">
        ${rows.map(bigScreenWatchItem).join("") || `<li><span>暂无自选股</span></li>`}
      </ol>
    </article>
  `;
}

function bigScreenWatchItem(item, index) {
  const profit = numberOrNull(item.todayProfit);
  const percent = numberOrNull(item.todayProfitPercent);
  const changedClass = bigScreenValueChanged(`watch:${item.symbol}:today`, profit);
  return `
    <li>
      <i>${index + 1}</i>
      <span>${escapeHtml(item.name || item.symbol)}<em>${escapeHtml(item.symbol)}</em></span>
      <b class="${escapeAttr(`big-screen-watch-profit ${trendClass(profit)} ${changedClass}`)}">
        <small>今</small>
        ${escapeHtml(formatSignedMoney(profit))}
        <em>${escapeHtml(formatPercent(percent))}</em>
      </b>
    </li>
  `;
}

function bigScreenWatchSummary() {
  return watchSummary();
}

function bigScreenWatchRows() {
  return [...(state.watchlist || [])]
    .filter((item) => numberOrNull(item.todayProfit) != null)
    .sort((a, b) => (numberOrNull(b.todayProfit) ?? -Infinity) - (numberOrNull(a.todayProfit) ?? -Infinity))
    .slice(0, 8);
}

function bigScreenMarketPanel() {
  const data = state.aShareAnalysis.data || {};
  const bins = data.bins || defaultBreadthBins();
  const maxCount = Math.max(1, ...bins.map((item) => Number(item.count) || 0));
  return `
    <article class="big-screen-card market-core">
      <header>
        <span>A 股市场温度</span>
        <b>成交额 ${escapeHtml(formatChineseAmount(data.amount))}</b>
      </header>
      <div class="big-screen-breadth">
        ${bins.map((item) => {
          const count = Number(item.count) || 0;
          const height = Math.max(8, Math.round((count / maxCount) * 130));
          return `
            <span class="${escapeAttr(item.side)}">
              <b class="${escapeAttr(bigScreenValueChanged(`breadth:${item.label}`, count))}">${escapeHtml(formatCount(count))}</b>
              <i style="height:${height}px"></i>
              <em>${escapeHtml(item.label)}</em>
            </span>
          `;
        }).join("")}
      </div>
      <footer>
        <strong class="up-text">涨 ${escapeHtml(formatCount(data.upCount))} 家</strong>
        <div style="--up-ratio:${breadthUpRatio(data)}%"><span></span></div>
        <strong class="down-text">跌 ${escapeHtml(formatCount(data.downCount))} 家</strong>
      </footer>
    </article>
  `;
}

function bigScreenSectorFlowPanel() {
  const data = state.sectorFlow.data;
  return `
    <article class="big-screen-card sector-flow">
      <header>
        <span>板块资金流向</span>
        <b>${escapeHtml(data?.trade_date || state.sectorFlowDate || "")}</b>
      </header>
      ${data ? bigScreenSectorFlowSvg(data) : `<div class="big-screen-empty">资金流向等待刷新</div>`}
    </article>
  `;
}

function bigScreenSectorFlowSvg(data) {
  const rows = (data.series || [])
    .map((item) => ({ ...item, latest: lastNonNullNumber(item.data || []) }))
    .filter((item) => item.latest != null)
    .sort((a, b) => Math.abs(Number(b.latest || 0)) - Math.abs(Number(a.latest || 0)))
    .slice(0, 9);
  if (!rows.length) return `<div class="big-screen-empty">暂无资金流数据</div>`;
  const width = 780;
  const height = 310;
  const left = 44;
  const right = 104;
  const top = 18;
  const bottom = 34;
  const sessionMinutes = Math.max(1, data.session_minutes || 240);
  const values = rows.flatMap((row) => (row.data || []).map(numberOrNull)).filter((value) => value != null);
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const pad = Math.max((maxRaw - minRaw) * 0.1, 1);
  const minValue = minRaw - pad;
  const maxValue = maxRaw + pad;
  const xFor = (index) => left + (index / Math.max(1, sessionMinutes - 1)) * (width - left - right);
  const yFor = (value) => top + ((maxValue - Number(value || 0)) / Math.max(1, maxValue - minValue)) * (height - top - bottom);
  return `
    <svg class="big-screen-flow-svg" viewBox="0 0 ${width} ${height}" aria-label="板块资金流向">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18"></rect>
      ${[maxValue, 0, minValue].map((value) => `<line x1="${left}" y1="${yFor(value).toFixed(1)}" x2="${width - right}" y2="${yFor(value).toFixed(1)}"></line>`).join("")}
      ${rows.map((row) => {
        const points = (row.data || [])
          .map((value, index) => ({ value: numberOrNull(value), index }))
          .filter((point) => point.value != null)
          .map((point) => `${xFor(point.index).toFixed(1)},${yFor(point.value).toFixed(1)}`)
          .join(" ");
        const end = lastNonNullNumber(row.data || []);
        return points ? `<polyline points="${points}" stroke="${escapeAttr(row.color || "#ef4444")}"></polyline><text x="${width - right + 10}" y="${yFor(end).toFixed(1)}">${escapeHtml(row.name)} ${escapeHtml(formatSignedFixed(end, 1))}</text>` : "";
      }).join("")}
      <text x="${left}" y="${height - 8}">09:30</text>
      <text x="${width / 2 - 18}" y="${height - 8}">11:30</text>
      <text x="${width - right - 4}" y="${height - 8}">15:00</text>
    </svg>
  `;
}

function bigScreenMainlinePanel() {
  const rows = bigScreenMainlineRows();
  return `
    <article class="big-screen-card mainline-signal">
      <header>
        <span>主线异动</span>
        <b>概念 / 领涨 / 强度</b>
      </header>
      <ol class="big-screen-mainline-list">
        ${rows.map((item, index) => `
          <li>
            <i>${index + 1}</i>
            <span>
              ${escapeHtml(item.name || "未知主线")}
              <em>${escapeHtml(item.leader ? `领涨 ${item.leader}` : "领涨股待更新")}</em>
            </span>
            <strong class="${escapeAttr(`${trendClass(item.pct)} ${bigScreenValueChanged(`mainline:${item.code || item.name}:pct`, item.pct)}`)}">${escapeHtml(formatPercent(item.pct))}</strong>
            <b>${escapeHtml(bigScreenMainlineBreadth(item))}</b>
          </li>
        `).join("") || `<li><span>主线异动等待刷新</span></li>`}
      </ol>
    </article>
  `;
}

function bigScreenMainlineRows() {
  return [...(state.mainlines.data || [])]
    .filter((item) => item?.name)
    .sort((a, b) => (numberOrNull(b.pct) ?? -Infinity) - (numberOrNull(a.pct) ?? -Infinity))
    .slice(0, 6)
    .map((item) => ({
      ...item,
      leader: item.leadStock
        ? `${item.leadStock}${item.leadStockCode ? ` · ${item.leadStockCode}` : ""}`
        : item.leaderName || item.leader || item.leadingStock || item.stockName || item.stock || ""
    }));
}

function bigScreenMainlineBreadth(item) {
  const up = numberOrNull(item.upCount ?? item.riseCount ?? item.up);
  const down = numberOrNull(item.downCount ?? item.fallCount ?? item.down);
  if (up != null || down != null) return `涨 ${up ?? "--"} / 跌 ${down ?? "--"}`;
  const hotMatch = (state.hotStocks.data || []).find((stock) => (stock.tags || []).includes(item.name));
  return hotMatch ? `热股 ${hotMatch.name}` : "热度跟踪";
}

function bigScreenRankingPanel() {
  const rows = bigScreenRankingRows();
  return `
    <article class="big-screen-card ranking">
      <header>
        <span>板块涨幅榜</span>
        <b>${escapeHtml(state.sectorRanking.data?.date || "")}</b>
      </header>
      <ol class="big-screen-rank-list">
        ${rows.map((row, index) => `
          <li>
            <i>${index + 1}</i>
            <span>${escapeHtml(row.name)}<em>${escapeHtml(row.code || "")}</em></span>
            <b class="${escapeAttr(`${trendClass(row.pct_1d)} ${bigScreenValueChanged(`sector:${row.code || row.name}:pct`, row.pct_1d)}`)}">${escapeHtml(formatPercent(row.pct_1d))}</b>
          </li>
        `).join("") || `<li><span>板块涨幅等待刷新</span></li>`}
      </ol>
    </article>
  `;
}

function bigScreenRankingRows() {
  return [...(state.sectorRanking.data?.rows || [])]
    .filter((row) => numberOrNull(row.pct_1d) != null)
    .sort((a, b) => Number(b.pct_1d) - Number(a.pct_1d))
    .slice(0, 10);
}

function bigScreenHeatPanel() {
  const hotRows = (state.hotStocks.data || []).slice(0, 8);
  const mainRows = (state.mainlines.data || []).slice(0, 8);
  return `
    <article class="big-screen-card heat">
      <header>
        <span>热度雷达</span>
        <b>东财热股 / 市场主线</b>
      </header>
      <div class="big-screen-heat-grid">
        <ol class="big-screen-mini-rank">
          ${hotRows.map((item, index) => `
            <li>
              <i>${index + 1}</i>
              <span>${escapeHtml(item.name)}<em>${escapeHtml(item.symbol || "")}</em></span>
              <b class="${escapeAttr(`${trendClass(item.changePercent)} ${bigScreenValueChanged(`hot:${item.symbol || item.name}:pct`, item.changePercent)}`)}">${escapeHtml(formatPercent(item.changePercent))}</b>
            </li>
          `).join("") || `<li><span>热股等待刷新</span></li>`}
        </ol>
        <div class="big-screen-tags">
          ${mainRows.map((item) => `<span>${escapeHtml(item.name)} <b>${escapeHtml(formatPercent(item.pct))}</b></span>`).join("") || `<span>主线等待刷新</span>`}
        </div>
      </div>
    </article>
  `;
}

function bigScreenKpi(label, value, cls = "") {
  return `<span><i>${escapeHtml(label)}</i><strong class="${escapeAttr(`${cls} ${bigScreenValueChanged(`kpi:${label}`, value)}`)}">${escapeHtml(value)}</strong></span>`;
}

function bigScreenMarqueeText() {
  const sourceRows = state.bigScreenNewsFeed.length ? state.bigScreenNewsFeed : bigScreenNewsRows();
  const rows = sourceRows.slice(0, 12).map((item) => `${item.source}：${item.title}`);
  return rows.length ? rows.join("　|　") : "实时资讯等待刷新　|　板块资金流向等待同步　|　核心行情自动刷新";
}

function bigScreenAnimationDelayStyle(durationMs) {
  const duration = Math.max(1000, Number(durationMs) || 1000);
  const phase = (Date.now() % duration) / 1000;
  return `animation-duration:${(duration / 1000).toFixed(2)}s;animation-delay:-${phase.toFixed(2)}s`;
}

function bigScreenValueChanged(key, value) {
  const normalized = value == null ? "" : String(value);
  const previous = state.bigScreenValueCache.get(key);
  const changed = Boolean(previous && previous !== normalized);
  state.bigScreenValueCache.set(key, normalized);
  return changed ? "value-changed" : "";
}

function adminViewSwitcherTemplate() {
  if (!state.user?.isAdmin) return "";
  const users = state.adminUsers.data?.length ? state.adminUsers.data : [state.user];
  const currentId = activeViewUserId();
  return `
    <label class="view-switcher" title="切换查看账号">
      <span>查看</span>
      <select id="view-user-select">
        ${users.map((user) => `<option value="${user.id}" ${user.id === currentId ? "selected" : ""}>${escapeHtml(userDisplayLabel(user))}${user.isAdmin ? "（管理员）" : ""}</option>`).join("")}
      </select>
    </label>
  `;
}

function appUpdateTemplate() {
  if (!state.updateAvailable) return "";
  return `
    <div class="app-update-banner">
      <div>
        <strong>系统已更新</strong>
        <span>刷新页面即可使用最新版本。</span>
      </div>
      <button type="button" data-reload-app>立即刷新</button>
    </div>
  `;
}

function changePasswordTemplate() {
  if (!state.changePasswordOpen) return "";
  return `
    <div class="detail-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel password-panel">
        <header>
          <div>
            <p class="eyebrow">账户</p>
            <h2>修改密码</h2>
          </div>
          <button class="icon-button" title="关闭" data-close-change-password>×</button>
        </header>
        <form id="change-password-form" class="password-form">
          <label>
            <span>当前密码</span>
            <input name="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label>
            <span>新密码</span>
            <input name="newPassword" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <label>
            <span>确认新密码</span>
            <input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required />
          </label>
          <button type="submit" ${state.loading.has("changePassword") ? "disabled" : ""}>保存新密码</button>
        </form>
      </article>
    </div>
  `;
}

function reportSettingsTemplate() {
  if (!state.reportSettingsOpen) return "";
  const settings = state.reportSettings.data || {};
  const last = settings.lastReport;
  return `
    <div class="detail-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel report-settings-panel">
        <header>
          <div>
            <p class="eyebrow">收盘日报</p>
            <h2>自选股每日总结</h2>
          </div>
          <button class="icon-button" title="关闭" data-close-report-settings>×</button>
        </header>
        <div class="detail-content report-settings-content">
          <form id="report-settings-form" class="report-settings-form">
            <label class="switch-line">
              <input name="enabled" type="checkbox" ${settings.enabled ? "checked" : ""} />
              <span>每天 ${escapeHtml(settings.nextSendTime || "16:30")} 自动发送自选股收盘日报</span>
            </label>
            <section>
              <h3>邮箱</h3>
              <label class="switch-line">
                <input name="emailEnabled" type="checkbox" ${settings.emailEnabled ? "checked" : ""} ${settings.smtpConfigured ? "" : "disabled"} />
                <span>${settings.smtpConfigured ? "启用邮箱发送" : "服务端暂未配置 SMTP"}</span>
              </label>
              <input name="email" type="email" placeholder="你的收件邮箱" value="${escapeAttr(settings.email || "")}" />
              <p class="muted-line">日报会发送到这里填写的邮箱，保存后可以先发送测试确认。</p>
            </section>
            <div class="report-settings-actions">
              <button type="submit" ${state.loading.has("reportSettings") ? "disabled" : ""}>保存设置</button>
              <button type="button" class="plain-button" data-report-test ${state.loading.has("reportTest") ? "disabled" : ""}>发送测试</button>
            </div>
          </form>
          ${state.reportMessage ? `<p class="banner">${escapeHtml(state.reportMessage)}</p>` : ""}
          ${last ? `
            <section class="report-last-status">
              <h3>最近发送</h3>
              <p>${escapeHtml(reportStatusText(last))}</p>
              ${last.errorMessage ? `<p class="error">${escapeHtml(last.errorMessage)}</p>` : ""}
            </section>
          ` : ""}
        </div>
      </article>
    </div>
  `;
}

function reportStatusText(last) {
  const statusMap = { success: "成功", partial: "部分成功", failed: "失败" };
  const type = last.isTest ? "测试" : "自动";
  return `${type}日报 ${statusMap[last.status] || last.status || "-"} · ${formatDateTime(last.sentAt || last.createdAt) || ""}`;
}

function installGuideTemplate() {
  if (!state.installGuideOpen) return "";
  const platform = detectInstallPlatform();
  const guides = installGuideItems();
  const current = guides.find((item) => item.key === platform) || guides.find((item) => item.key === "other");
  return `
    <div class="detail-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel install-panel">
        <header>
          <div>
            <p class="eyebrow">快捷入口</p>
            <h2>添加到桌面 / Dock / 主屏幕</h2>
          </div>
          <button class="icon-button" title="关闭" data-close-install-guide>×</button>
        </header>
        <div class="detail-content install-guide">
          <section class="install-current">
            <h3>${escapeHtml(current.title)}</h3>
            <ol>${current.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
          </section>
          <div class="install-all">
            ${guides.map((item) => `
              <details ${item.key === platform ? "open" : ""}>
                <summary>${escapeHtml(item.title)}</summary>
                <ol>${item.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
              </details>
            `).join("")}
          </div>
        </div>
      </article>
    </div>
  `;
}

function newAccountInfoTemplate() {
  if (!state.newAccountInfo) return "";
  const info = state.newAccountInfo;
  return `
    <div class="detail-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel account-info-panel">
        <header>
          <div>
            <p class="eyebrow">开户信息</p>
            <h2>${escapeHtml(info.displayName || info.username)} 的登录信息</h2>
          </div>
          <button class="icon-button" title="关闭" data-close-account-info>×</button>
        </header>
        <div class="detail-content account-info-content">
          <dl>
            <div>
              <dt>网址</dt>
              <dd>${escapeHtml(info.url)}</dd>
            </div>
            <div>
              <dt>用户名</dt>
              <dd>${escapeHtml(info.username)}</dd>
            </div>
            <div>
              <dt>初始密码</dt>
              <dd>${escapeHtml(info.password)}</dd>
            </div>
          </dl>
          <div class="account-info-notes">
            <p>请用手机浏览器或电脑浏览器打开，不要在微信里直接使用。</p>
            <p>登录后可点击页面右上角“快捷入口”，按提示添加到手机桌面、电脑桌面或 Dock。</p>
          </div>
          <button class="primary-action" type="button" data-copy-account-info>一键复制开户信息</button>
        </div>
      </article>
    </div>
  `;
}

function newAccountInfoText(info = state.newAccountInfo) {
  if (!info) return "";
  return [
    "股市信息综合看板开户信息",
    `网址：${info.url}`,
    `用户名：${info.username}`,
    `初始密码：${info.password}`,
    "",
    "请用手机浏览器或电脑浏览器打开，不要在微信里直接使用。",
    "登录后可点击页面右上角“快捷入口”，按提示添加到手机桌面、电脑桌面或 Dock。"
  ].join("\n");
}

async function copyNewAccountInfo() {
  const text = newAccountInfoText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    state.message = "开户信息已复制";
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    state.message = "开户信息已复制";
  }
  render();
}

function detectInstallPlatform() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  if (/HarmonyOS|OpenHarmony/i.test(ua)) return "harmony";
  if (/iPhone|iPod/i.test(ua)) return "iphone";
  if (/iPad/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)) return "iphone";
  if (/Android/i.test(ua)) return /Huawei|Harmony/i.test(ua) ? "harmony" : "android";
  if (/Mac/i.test(platform)) return "mac";
  if (/Win/i.test(platform)) return "windows";
  return "other";
}

function installGuideItems() {
  return [
    {
      key: "windows",
      title: "Windows：添加到桌面或任务栏",
      steps: [
        "建议使用 Edge 或 Chrome 打开本页面。",
        "点击浏览器右上角菜单。",
        "选择“应用”“安装此站点为应用”或“创建快捷方式”。",
        "安装后可在开始菜单找到，也可以固定到任务栏或拖到桌面。"
      ]
    },
    {
      key: "mac",
      title: "macOS：添加到 Dock",
      steps: [
        "Safari 用户可在菜单或分享入口选择“添加到程序坞”。",
        "Chrome 或 Edge 用户可在菜单里选择“保存并共享”“创建快捷方式”或“安装页面为应用”。",
        "创建后可在启动台或应用列表找到，再拖到 Dock。"
      ]
    },
    {
      key: "iphone",
      title: "iPhone / iPad：添加到主屏幕",
      steps: [
        "建议使用 Safari 打开本页面。",
        "点击底部或顶部的分享按钮。",
        "选择“添加到主屏幕”。",
        "确认名称后点击“添加”。"
      ]
    },
    {
      key: "android",
      title: "Android：添加到主屏幕",
      steps: [
        "建议使用 Chrome、Edge 或手机自带浏览器打开本页面。",
        "点击浏览器右上角菜单。",
        "选择“添加到主屏幕”“安装应用”或“桌面快捷方式”。",
        "确认后会在桌面生成入口。"
      ]
    },
    {
      key: "harmony",
      title: "鸿蒙 / 华为设备：添加到桌面",
      steps: [
        "建议使用华为浏览器打开本页面。",
        "点击浏览器菜单。",
        "选择“添加至桌面”“桌面快捷方式”或类似入口。",
        "确认后从桌面图标打开看板。"
      ]
    },
    {
      key: "other",
      title: "其他设备：创建快捷入口",
      steps: [
        "使用系统自带浏览器或常用浏览器打开本页面。",
        "在浏览器菜单中寻找“添加到桌面”“添加到主屏幕”“安装应用”或“创建快捷方式”。",
        "如果没有相关入口，可以先收藏书签。"
      ]
    }
  ];
}

function sectionTitle(title, envelope, loadingKey) {
  return `
    <div class="section-title">
      <div>
        <h2>${title}</h2>
        <p>${envelope.updatedAt ? `更新 ${formatTime(envelope.updatedAt)}` : "等待刷新"}${envelope.stale ? " · 数据可能延迟" : ""}</p>
      </div>
      ${state.loading.has(loadingKey) ? `<span class="loading">刷新中</span>` : ""}
    </div>
    ${envelope.errorMessage ? `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>` : ""}
  `;
}

function quoteCard(item) {
  const trend = item.changePercent == null ? "flat" : item.changePercent >= 0 ? "up" : "down";
  return `
    <article class="quote-card ${trend}">
      <span>${escapeHtml(item.market)}</span>
      <h3>${escapeHtml(item.name)}</h3>
      <strong>${formatNumber(item.price)}</strong>
      <p>${formatSigned(item.change)} / ${formatPercent(item.changePercent)}</p>
    </article>
  `;
}

function marketQuotesTemplate() {
  const rows = state.market.data || [];
  if (rows.length) return `<div class="quote-grid">${rows.map(quoteCard).join("")}</div>`;
  const text = state.loading.has("market")
    ? "核心行情正在读取..."
    : state.market.errorMessage
      ? "核心行情读取失败，系统会自动重试，也可以点右上角刷新"
      : "核心行情等待刷新";
  return `<div class="quote-grid quote-grid-empty">${emptyState(text)}</div>`;
}

function aShareAnalysisTemplate() {
  const envelope = state.aShareAnalysis || emptyEnvelope(null);
  const data = envelope.data || {
    amount: null,
    amountChange: null,
    upCount: null,
    downCount: null,
    bins: defaultBreadthBins()
  };
  const bins = data.bins || [];
  const maxCount = Math.max(1, ...bins.map((item) => Number(item.count) || 0));
  return `
    <section class="market-breadth">
      <header>
        <div>
          <h3>A 股大盘</h3>
          <p>${envelope.updatedAt ? `更新 ${formatTime(envelope.updatedAt)}` : "等待刷新"}${envelope.stale ? " · 数据可能延迟" : ""}</p>
        </div>
        <div class="breadth-summary">
          <span>成交额 <strong>${formatChineseAmount(data.amount)}</strong></span>
          <span>${breadthAmountChangeText(data.amountChange)}</span>
        </div>
      </header>
      ${envelope.errorMessage ? `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>` : ""}
      <div class="breadth-bars">
        ${bins.map((item) => breadthBar(item, maxCount)).join("")}
      </div>
      <div class="breadth-ratio" style="--up-ratio: ${breadthUpRatio(data)}%">
        <span></span>
      </div>
      <footer>
        <strong class="up-text">涨 ${formatCount(data.upCount)} 家</strong>
        <strong class="down-text">跌 ${formatCount(data.downCount)} 家</strong>
      </footer>
    </section>
  `;
}

function defaultBreadthBins() {
  return [
    { label: "涨停", side: "up", count: 0 },
    { label: ">7%", side: "up", count: 0 },
    { label: "7~5%", side: "up", count: 0 },
    { label: "5~2%", side: "up", count: 0 },
    { label: "2~0%", side: "up", count: 0 },
    { label: "平", side: "flat", count: 0 },
    { label: "0~2%", side: "down", count: 0 },
    { label: "2~5%", side: "down", count: 0 },
    { label: "5~7%", side: "down", count: 0 },
    { label: "7%<", side: "down", count: 0 },
    { label: "跌停", side: "down", count: 0 }
  ];
}

function breadthBar(item, maxCount) {
  const count = Number(item.count) || 0;
  const height = Math.max(6, Math.round((count / maxCount) * 86));
  return `
    <div class="breadth-bar ${escapeAttr(item.side)}">
      <strong>${formatCount(count)}</strong>
      <i style="height: ${height}px"></i>
      <span>${escapeHtml(item.label)}</span>
    </div>
  `;
}

function breadthAmountChangeText(value) {
  if (value == null) return "较昨日 --";
  const up = Number(value) >= 0;
  return `较昨日${up ? "放量" : "缩量"} <b class="${up ? "up-text" : "down-text"}">${formatSignedChineseAmount(value)}</b>`;
}

function breadthUpRatio(data) {
  const up = Number(data.upCount) || 0;
  const down = Number(data.downCount) || 0;
  const total = up + down;
  if (!total) return 50;
  return Math.max(4, Math.min(96, (up / total) * 100));
}

function watchForm() {
  if (!state.showWatchAdd) return "";
  return `
    <form id="watch-form" class="watch-form">
      <input name="symbol" placeholder="输入代码，如 600519 / AAPL" required />
      <input name="costPrice" inputmode="decimal" placeholder="成本，可空" />
      <input name="position" inputmode="numeric" placeholder="持仓，可空" />
      <button type="submit">自动识别添加</button>
    </form>
  `;
}

function watchImageForm() {
  return `
    <form id="watch-image-form" class="watch-image-form">
      <label class="watch-action-button">
        <input name="screenshot" type="file" accept="image/*" />
        <span>${state.loading.has("watchImport") ? "识别中..." : "截图识别"}</span>
      </label>
    </form>
  `;
}

function watchActionsTemplate() {
  return `
    <div class="watch-action-row">
      <button class="watch-action-button" type="button" data-toggle-watch-add>
        ${state.showWatchAdd ? "收起添加" : "添加自选股"}
      </button>
      ${watchImageForm()}
    </div>
  `;
}

function watchSummaryTemplate() {
  if (!state.watchlist.length) return "";
  const summary = watchSummary();
  const todayTrend = summary.todayProfit == null ? "" : summary.todayProfit >= 0 ? "up-text" : "down-text";
  const totalTrend = summary.totalProfit == null ? "" : summary.totalProfit >= 0 ? "up-text" : "down-text";
  return `
    <section class="watch-summary">
      <div>
        <span>今日盈亏</span>
        <strong class="${todayTrend}">${formatSignedMoney(summary.todayProfit)}</strong>
        <b class="${todayTrend}">${formatPercent(summary.todayProfitPercent)}</b>
      </div>
      <div>
        <span>总盈亏</span>
        <strong class="${totalTrend}">${formatSignedMoney(summary.totalProfit)}</strong>
        <b class="${totalTrend}">${formatPercent(summary.totalProfitPercent)}</b>
      </div>
      <div>
        <span>总市值</span>
        <strong>${formatMoney(summary.marketValue)}</strong>
        <b>${summary.positionCount} 只持仓</b>
      </div>
    </section>
  `;
}

function watchSummary() {
  let marketValue = 0;
  let previousValue = 0;
  let totalCost = 0;
  let todayProfit = 0;
  let totalProfit = 0;
  let positionCount = 0;
  for (const item of state.watchlist) {
    const itemMarketValue = numberOrNull(item.marketValue);
    const itemTodayProfit = numberOrNull(item.todayProfit);
    const itemTotalProfit = numberOrNull(item.totalProfit);
    const itemCostPrice = numberOrNull(item.costPrice);
    const itemPosition = numberOrNull(item.position);
    if (itemMarketValue != null) marketValue += itemMarketValue;
    if (itemTodayProfit != null) {
      todayProfit += itemTodayProfit;
      if (itemMarketValue != null) previousValue += itemMarketValue - itemTodayProfit;
    }
    if (itemTotalProfit != null) totalProfit += itemTotalProfit;
    if (itemCostPrice != null && itemPosition != null && itemPosition > 0) {
      totalCost += itemCostPrice * itemPosition;
      positionCount += 1;
    }
  }
  return {
    marketValue: marketValue || null,
    todayProfit: previousValue ? todayProfit : null,
    todayProfitPercent: previousValue ? (todayProfit / previousValue) * 100 : null,
    totalProfit: totalCost ? totalProfit : null,
    totalProfitPercent: totalCost ? (totalProfit / totalCost) * 100 : null,
    positionCount
  };
}

function watchItem(item, index) {
  const active = item.symbol === state.selectedSymbol ? "active" : "";
  const trend = item.changePercent == null ? "flat" : item.changePercent >= 0 ? "up-text" : "down-text";
  const todayTrend = item.todayProfit == null ? "" : item.todayProfit >= 0 ? "up-text" : "down-text";
  const totalTrend = item.totalProfit == null ? "" : item.totalProfit >= 0 ? "up-text" : "down-text";
  const tags = (item.tags || []).slice(0, 4);
  const settingsOpen = state.openHoldingId === item.id;
  return `
    <article class="watch-item ${active}">
      <button class="watch-main" type="button" data-open-stock="${escapeHtml(item.symbol)}">
        <span class="watch-name-line">
          <strong>${escapeHtml(item.name || item.symbol)}</strong>
          <em>${escapeHtml(item.symbol)} · ${escapeHtml(item.market)}</em>
        </span>
        <span class="compact-metrics">
          <span>
            <i>成本 ${formatInputValue(item.costPrice)}</i>
            <i>持仓 ${formatInputValue(item.position)}</i>
            <i>市值 ${formatMoney(item.marketValue)}</i>
          </span>
          <span>
            <i class="${todayTrend}">今 ${formatSignedMoney(item.todayProfit)} / ${formatPercent(item.todayProfitPercent)}</i>
            <i class="${totalTrend}">总 ${formatSignedMoney(item.totalProfit)} / ${formatPercent(item.totalProfitPercent)}</i>
          </span>
        </span>
        <span class="hot-tags">${tags.map((tag) => `<i>${escapeHtml(tag)}</i>`).join("")}</span>
      </button>
      <span class="watch-quote">
        <small>现价</small>
        <strong>${formatNumber(item.price)}</strong>
        <b class="${trend}">${formatPercent(item.changePercent)}</b>
      </span>
      <div class="watch-actions">
        <button title="上移" data-up="${item.id}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button title="下移" data-down="${item.id}" ${index === state.watchlist.length - 1 ? "disabled" : ""}>↓</button>
        <button title="设置成本持仓" data-toggle-holding="${item.id}">设置</button>
        <button title="删除" data-delete="${item.id}">×</button>
      </div>
      <form class="holding-form ${settingsOpen ? "open" : ""}" data-holding-form="${item.id}">
        <label>成本 <input name="costPrice" inputmode="decimal" value="${escapeAttr(item.costPrice ?? "")}" placeholder="-" /></label>
        <label>持仓 <input name="position" inputmode="numeric" value="${escapeAttr(item.position ?? "")}" placeholder="-" /></label>
        <button type="submit">保存</button>
      </form>
    </article>
  `;
}

function newsItem(item, index) {
  return `
    <li>
      <span>${String(index + 1).padStart(2, "0")}</span>
      <button class="link-button" data-news-index="${index}">${escapeHtml(item.title)}</button>
    </li>
  `;
}

function eastmoneyNewsItem(item, index) {
  return `
    <li>
      <span>${String(index + 1).padStart(2, "0")}</span>
      <button class="link-button" data-eastmoney-news-index="${index}">${escapeHtml(item.title)}</button>
    </li>
  `;
}

function stockSearchTemplate() {
  const results = state.stockSearch.results?.data || [];
  return `
    <div class="stock-search-head">
      <div>
        <h2>个股查询</h2>
        <p>输入代码或名称，选择股票后查看详情</p>
      </div>
      ${state.loading.has("stockSearch") ? `<span class="loading">查询中</span>` : ""}
    </div>
    <form id="stock-search-form" class="stock-search-form">
      <input name="query" data-stock-search-input autocomplete="off" value="${escapeAttr(state.stockSearch.query || "")}" placeholder="输入股票名称或代码，如 贵州茅台 / 600519" />
      <button type="submit">↵</button>
    </form>
    ${state.stockSearch.results?.errorMessage ? `<p class="warning">${escapeHtml(state.stockSearch.results.errorMessage)}</p>` : ""}
    ${results.length ? `
      <div class="stock-search-results">
        ${results.map((item, index) => `
          <button type="button" data-search-stock="${index}">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.symbol)} · ${escapeHtml(item.market)}${item.type ? ` · ${escapeHtml(item.type)}` : ""}</span>
          </button>
        `).join("")}
      </div>
    ` : state.stockSearch.query && !state.loading.has("stockSearch") ? `<p class="empty compact-empty">没有匹配到股票</p>` : ""}
  `;
}

function dsaAnalysisTemplate() {
  const configured = Boolean(state.dsaConfig.data?.configured);
  if (!configured) {
    return `
      <div class="dsa-empty">
        <strong>DSA 分析服务未配置</strong>
        <p>设置环境变量 DSA_API_BASE_URL 后，可以用东方财富新闻和公告作为 AI 分析上下文。</p>
      </div>
    `;
  }
  return `
    <div class="dsa-workspace">
      <form id="dsa-analysis-form" class="dsa-form">
        <div class="dsa-search-field">
          <input name="stock" data-dsa-search-input autocomplete="off" placeholder="输入股票代码或名称，如 600519、贵州茅台" value="${escapeAttr(state.dsaQuery)}" />
          ${dsaSearchResultsTemplate()}
        </div>
        <button type="submit" ${state.loading.has("dsaAnalysis") ? "disabled" : ""}>${state.loading.has("dsaAnalysis") ? "分析中" : "分析"}</button>
      </form>
      ${dsaBatchAnalysisTemplate()}
      ${dsaQuotaTemplate()}
      ${state.dsaMessage ? `<p class="warning dsa-message">${escapeHtml(state.dsaMessage)}</p>` : ""}
      <div class="dsa-layout">
      <aside class="dsa-history">
        <header>
          <span><i></i><strong>历史分析</strong></span>
          <div class="dsa-history-actions">
            <label>
              <input type="checkbox" ${dsaAllHistorySelected() ? "checked" : ""} data-dsa-history-select-all />
              全选
            </label>
            <button type="button" class="danger" data-dsa-delete-selected ${state.dsaHistorySelection.size ? "" : "disabled"}>${state.loading.has("dsaHistoryDelete") ? "删除中" : "删除"}</button>
            <button type="button" data-dsa-refresh-history>刷新</button>
          </div>
        </header>
        ${dsaHistoryTemplate()}
      </aside>
      <div class="dsa-report">
        ${state.loading.has("dsaReport") ? emptyState("报告读取中...") : dsaReportTemplate()}
      </div>
      </div>
    </div>
  `;
}

function dsaBatchAnalysisTemplate() {
  if (!isViewingAdminOwnData()) return "";
  return `
    <form id="dsa-batch-form" class="dsa-batch-form">
      <button type="submit" ${state.loading.has("dsaBatch") ? "disabled" : ""}>${state.loading.has("dsaBatch") ? "提交中" : "一键分析自选股"}</button>
      <label>
        <input type="checkbox" data-dsa-batch-force ${state.dsaBatchForceRefresh ? "checked" : ""} />
        强制重新分析
      </label>
    </form>
  `;
}

function dsaQuotaTemplate() {
  const quota = state.dsaConfig.data?.quota;
  if (!quota) return "";
  if (quota.unlimited) return `<p class="dsa-quota unlimited">AI 分析额度：管理员不限次数</p>`;
  return `<p class="dsa-quota ${Number(quota.remaining) <= 0 ? "empty" : ""}">AI 分析额度：今日剩余 ${escapeHtml(quota.remaining)} / ${escapeHtml(quota.limit)} 次</p>`;
}

function dsaSearchResultsTemplate() {
  const results = state.dsaSearch.results?.data || [];
  if (state.dsaSearch.results?.errorMessage) {
    return `<p class="dsa-search-note">${escapeHtml(state.dsaSearch.results.errorMessage)}</p>`;
  }
  if (state.loading.has("dsaSearch")) {
    return `<div class="dsa-search-results compact"><span class="loading">匹配中</span></div>`;
  }
  if (state.loading.has("dsaAnalysis")) return "";
  if (results.length) {
    return `
      <div class="dsa-search-results">
        ${results.map((item, index) => `
          <button type="button" data-dsa-search-stock="${index}">
            <strong>${escapeHtml(item.name || item.symbol)}</strong>
            <span>${escapeHtml(item.symbol)} · ${escapeHtml(item.market || inferMarket(item.symbol))}${item.type ? ` · ${escapeHtml(item.type)}` : ""}</span>
          </button>
        `).join("")}
      </div>
    `;
  }
  return "";
}

function dsaHistoryTemplate() {
  if (state.loading.has("dsaHistory")) return emptyState("历史读取中...");
  if (state.dsaHistory.errorMessage) return emptyState(state.dsaHistory.errorMessage);
  const items = dsaHistoryItems();
  if (!items.length) return emptyState("暂无历史分析");
  return `<div class="dsa-history-list">${items.map(dsaHistoryItemTemplate).join("")}</div>`;
}

function dsaHistoryItems() {
  const savedItems = dsaSavedHistoryItems();
  const pendingIds = new Set(state.dsaPendingTasks.map((item) => String(item.taskId)));
  return [
    ...state.dsaPendingTasks.map((item) => ({ ...item, __pending: true })),
    ...savedItems.filter((item) => !pendingIds.has(String(recordIdForDsaHistory(item))))
  ];
}

function dsaSavedHistoryItems() {
  const payload = state.dsaHistory.data || {};
  return Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data?.items) ? payload.data.items : [];
}

function dsaAllHistorySelected() {
  const ids = dsaHistoryItems().map(dsaSelectionIdForHistoryItem).filter(Boolean);
  return Boolean(ids.length) && ids.every((id) => state.dsaHistorySelection.has(String(id)));
}

function dsaHistoryItemTemplate(item) {
  if (item.__pending) return dsaPendingHistoryItemTemplate(item);
  const recordId = recordIdForDsaHistory(item);
  const active = String(recordId) === String(state.dsaSelectedRecordId);
  const score = dsaRead(item, "sentimentScore", "sentiment_score");
  const advice = dsaRead(item, "operationAdvice", "operation_advice", "actionLabel", "action_label") || "--";
  const actionClass = dsaActionClass(advice);
  const checked = state.dsaHistorySelection.has(String(recordId));
  return `
    <div class="dsa-history-row ${active ? "active" : ""}">
      <input type="checkbox" ${checked ? "checked" : ""} data-dsa-history-check="${escapeAttr(recordId)}" aria-label="选择历史记录" />
      <button type="button" class="dsa-history-card ${escapeAttr(actionClass)}" data-dsa-history-id="${escapeAttr(recordId)}">
        <span>
          <strong>${escapeHtml(dsaRead(item, "stockName", "stock_name") || dsaRead(item, "stockCode", "stock_code") || "股票")}</strong>
          <em>${escapeHtml(dsaRead(item, "stockCode", "stock_code") || "")} · ${escapeHtml(formatDateTime(dsaRead(item, "CreatedAt", "createdAt", "created_at")) || "")}</em>
        </span>
        <b class="dsa-history-score ${escapeAttr(actionClass)}">${score == null ? "--" : escapeHtml(score)}</b>
        <i class="dsa-status-chip ${escapeAttr(actionClass)}">${escapeHtml(advice)}</i>
      </button>
    </div>
  `;
}

function dsaPendingHistoryItemTemplate(item) {
  const taskId = item.taskId || "";
  const selectionId = dsaPendingSelectionId(taskId);
  const active = String(taskId) === String(state.dsaSelectedRecordId);
  const status = item.status === "failed" ? "失败" : "分析中";
  const spinning = item.status !== "failed";
  const checked = state.dsaHistorySelection.has(selectionId);
  return `
    <div class="dsa-history-row pending ${escapeAttr(item.status || "")} ${active ? "active" : ""}">
      <input type="checkbox" ${checked ? "checked" : ""} data-dsa-history-check="${escapeAttr(selectionId)}" aria-label="选择分析任务" />
      <button type="button" class="dsa-history-card" data-dsa-task-id="${escapeAttr(taskId)}">
        <span>
          <strong>${escapeHtml(item.stockName || item.stockCode || "股票")}${spinning ? `<span class="dsa-inline-spinner" aria-hidden="true"></span>` : ""}</strong>
          <em>${escapeHtml(item.stockCode || "")} · ${escapeHtml(formatDateTime(item.createdAt) || "")}</em>
        </span>
        <b>${item.progress == null ? "--" : `${escapeHtml(item.progress)}%`}</b>
        <i class="dsa-status-chip neutral">${escapeHtml(status)}</i>
      </button>
    </div>
  `;
}

function dsaPendingSelectionId(taskId) {
  return taskId ? `task:${String(taskId)}` : "";
}

function dsaSelectionIdForHistoryItem(item) {
  if (item?.__pending) return dsaPendingSelectionId(item.taskId);
  const recordId = recordIdForDsaHistory(item);
  return recordId ? String(recordId) : "";
}

function recordIdForDsaHistory(item) {
  return dsaRead(item, "id") || dsaRead(item, "queryId", "query_id") || "";
}

function dsaReportTemplate() {
  const pendingTask = state.dsaPendingTasks.find((item) => String(item.taskId) === String(state.dsaSelectedRecordId));
  if (pendingTask) return dsaPendingReportTemplate(pendingTask);
  const report = dsaNormalizedReport();
  if (!report) return emptyState("选择历史记录或提交一次分析");
  const meta = dsaReportMeta(report);
  const summary = dsaReportSummary(report);
  const strategy = dsaReportStrategy(report);
  const boards = dsaReportBoards(report);
  const score = numberOrNull(summary.sentimentScore);
  const actionClass = dsaActionClass(summary.operationAdvice || summary.actionLabel || summary.action);
  const sentimentClass = dsaSentimentClass(score);
  return `
    <article class="dsa-report-card">
      <div class="dsa-report-grid">
        <div class="dsa-report-main">
          <header class="dsa-report-head">
            <div>
              <h3>${escapeHtml(meta.stockName || meta.stockCode || "分析报告")}</h3>
              <p><span>${escapeHtml(meta.stockCode || "")}</span>${meta.createdAt ? ` · ${escapeHtml(formatDateTime(meta.createdAt))}` : ""}</p>
            </div>
            <div class="dsa-head-actions">
              ${summary.operationAdvice ? `<span class="dsa-action-pill ${escapeAttr(actionClass)}">${escapeHtml(summary.operationAdvice)}</span>` : ""}
              ${summary.trendPrediction ? `<span class="dsa-trend-pill">${escapeHtml(summary.trendPrediction)}</span>` : ""}
            </div>
          </header>
          <section class="dsa-summary-box">
            <h4>核心洞察</h4>
            <p>${escapeHtml(summary.analysisSummary || "暂无分析摘要")}</p>
          </section>
          <div class="dsa-kpis">
            ${dsaKpi("操作建议", summary.operationAdvice, actionClass)}
            ${dsaKpi("趋势预测", summary.trendPrediction)}
            ${dsaKpi("现价", formatNumber(meta.currentPrice))}
            ${dsaKpi("涨跌幅", formatPercent(meta.changePct), trendClass(meta.changePct))}
          </div>
          <section class="dsa-board-section">
            <h4>关联板块</h4>
            <div class="hot-tags">${boards.length ? boards.slice(0, 10).map((item) => `<i>${escapeHtml(item)}</i>`).join("") : "<i>暂无板块数据</i>"}</div>
          </section>
          <section class="dsa-strategy">
            <h4>狙击点位</h4>
            <div>
              ${dsaStrategyItem("理想买入", strategy.idealBuy, "buy")}
              ${dsaStrategyItem("二次买入", strategy.secondaryBuy, "add")}
              ${dsaStrategyItem("止损价位", strategy.stopLoss, "risk")}
              ${dsaStrategyItem("止盈目标", strategy.takeProfit, "target")}
            </div>
          </section>
          ${dsaNewsTemplate()}
        </div>
        <aside class="dsa-score-card ${escapeAttr(sentimentClass)}">
          <span>市场情绪</span>
          <div class="dsa-score-ring" style="--score:${score == null ? 0 : Math.max(0, Math.min(100, score))}">
            <strong>${score == null ? "--" : Math.round(score)}</strong>
          </div>
          <b>${escapeHtml(summary.sentimentLabel || "评分")}</b>
          <p>${escapeHtml(summary.trendPrediction || "等待趋势判断")}</p>
        </aside>
      </div>
    </article>
  `;
}

function dsaPendingReportTemplate(task) {
  const progress = task.progress == null ? 0 : Math.max(0, Math.min(100, Number(task.progress) || 0));
  return `
    <article class="dsa-report-card pending-report">
      <div class="dsa-report-grid">
        <div class="dsa-report-main">
          <header class="dsa-report-head">
            <div>
              <h3>${escapeHtml(task.stockName || task.stockCode || "分析任务")}</h3>
              <p><span>${escapeHtml(task.stockCode || "")}</span>${task.createdAt ? ` · ${escapeHtml(formatDateTime(task.createdAt))}` : ""}</p>
            </div>
            <div class="dsa-head-actions">
              <span class="dsa-action-pill neutral">分析中</span>
            </div>
          </header>
          <section class="dsa-summary-box">
            <h4>正在生成报告</h4>
            <p>${escapeHtml(task.message || "DSA 正在读取行情、技术面、东方财富资讯和公告，并调用 AI 生成报告。")}</p>
            <div class="dsa-progress-track"><span style="width:${escapeAttr(progress)}%"></span></div>
          </section>
          ${dsaNewsTemplate()}
        </div>
        <aside class="dsa-score-card pending">
          <span>任务进度</span>
          <div class="dsa-score-ring" style="--score:${progress}">
            <strong>${Math.round(progress)}</strong>
          </div>
          <b>分析中</b>
          <p>完成后自动切换为正式报告</p>
        </aside>
      </div>
    </article>
  `;
}

function dsaKpi(label, value, cls = "") {
  return `<span><i>${escapeHtml(label)}</i><strong class="${escapeAttr(cls)}">${escapeHtml(value || "--")}</strong></span>`;
}

function dsaStrategyItem(label, value, cls = "") {
  return `<span class="${escapeAttr(cls)}"><i>${escapeHtml(label)}</i><strong>${escapeHtml(value || "--")}</strong></span>`;
}

function dsaActionClass(value) {
  const text = String(value || "").trim();
  if (/卖|减|止损|看空|风险|谨慎/.test(text)) return "negative";
  if (/买|增|看多/.test(text)) return "positive";
  return "neutral";
}

function dsaSentimentClass(score) {
  const value = numberOrNull(score);
  if (value == null) return "neutral";
  if (value >= 80) return "very-positive";
  if (value >= 60) return "positive";
  if (value >= 40) return "neutral";
  if (value >= 20) return "negative";
  return "very-negative";
}

function dsaNewsTemplate() {
  const rows = state.dsaNews.data || [];
  const activeFilter = state.dsaNewsFilter === "announcement" ? "announcement" : "news";
  const newsCount = rows.filter((item) => item.type !== "announcement").length;
  const announcementCount = rows.filter((item) => item.type === "announcement").length;
  const visibleRows = rows
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => activeFilter === "announcement" ? item.type === "announcement" : item.type !== "announcement");
  return `
    <section class="dsa-news-section">
      <header>
        <h4>相关资讯</h4>
        <p class="dsa-news-switch">
          <button type="button" class="${activeFilter === "news" ? "active" : ""}" data-dsa-news-filter="news">${newsCount} 条新闻</button>
          <button type="button" class="${activeFilter === "announcement" ? "active" : ""}" data-dsa-news-filter="announcement">${announcementCount} 条公告</button>
        </p>
      </header>
      ${state.dsaNews.errorMessage ? `<p class="dsa-news-note">${escapeHtml(state.dsaNews.errorMessage)}</p>` : ""}
      <ol class="news-list dsa-news-list">
        ${visibleRows.map(({ item, index }) => `
          <li class="${escapeAttr(item.type || "news")}">
            <span>${escapeHtml(item.type === "announcement" ? "公告" : "资讯")}</span>
            <button type="button" class="link-button" data-dsa-news-index="${index}">
              ${escapeHtml(item.title)}
              <small>${escapeHtml(item.source || "东方财富")} ${formatDateTime(item.time) || item.dateText || ""}</small>
            </button>
          </li>
        `).join("") || emptyState(activeFilter === "announcement" ? "暂无东方财富公告" : "暂无东方财富新闻")}
      </ol>
    </section>
  `;
}

function dsaNormalizedReport() {
  const selected = state.dsaSelectedReport;
  if (!selected) return null;
  return selected.report || selected;
}

function dsaReportMeta(reportLike) {
  const report = reportLike?.report || reportLike || {};
  const meta = dsaRead(report, "meta") || {};
  return {
    id: dsaRead(meta, "id"),
    queryId: dsaRead(meta, "queryId", "query_id"),
    stockCode: dsaRead(meta, "stockCode", "stock_code"),
    stockName: dsaRead(meta, "stockName", "stock_name"),
    createdAt: dsaRead(meta, "createdAt", "created_at") || dsaRead(reportLike, "createdAt", "created_at"),
    currentPrice: dsaRead(meta, "currentPrice", "current_price"),
    changePct: dsaRead(meta, "changePct", "change_pct")
  };
}

function dsaReportSummary(reportLike) {
  const report = reportLike?.report || reportLike || {};
  const summary = dsaRead(report, "summary") || {};
  return {
    analysisSummary: dsaRead(summary, "analysisSummary", "analysis_summary"),
    operationAdvice: dsaRead(summary, "operationAdvice", "operation_advice"),
    trendPrediction: dsaRead(summary, "trendPrediction", "trend_prediction"),
    sentimentScore: dsaRead(summary, "sentimentScore", "sentiment_score"),
    sentimentLabel: dsaRead(summary, "sentimentLabel", "sentiment_label")
  };
}

function dsaReportStrategy(reportLike) {
  const report = reportLike?.report || reportLike || {};
  const strategy = dsaRead(report, "strategy") || {};
  return {
    idealBuy: dsaRead(strategy, "idealBuy", "ideal_buy"),
    secondaryBuy: dsaRead(strategy, "secondaryBuy", "secondary_buy"),
    stopLoss: dsaRead(strategy, "stopLoss", "stop_loss"),
    takeProfit: dsaRead(strategy, "takeProfit", "take_profit")
  };
}

function dsaReportBoards(reportLike) {
  const report = reportLike?.report || reportLike || {};
  const details = dsaRead(report, "details") || {};
  const boards = dsaRead(details, "belongBoards", "belong_boards") || [];
  if (Array.isArray(boards)) {
    const reportBoards = boards.map((item) => typeof item === "string" ? item : dsaRead(item, "name", "boardName", "board_name") || dsaRead(item, "板块名称")).filter(Boolean);
    if (reportBoards.length) return uniqueStrings(reportBoards);
  }
  const tagRows = Array.isArray(state.dsaStockTags.data) ? state.dsaStockTags.data : [];
  if (tagRows.length) return uniqueStrings(tagRows);
  const meta = dsaReportMeta(reportLike);
  const stock = findStockForDetail(meta.stockCode);
  return uniqueStrings(stock?.tags || []);
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function dsaRead(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    if (key in obj) return obj[key];
    const snake = String(key).replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
    if (snake in obj) return obj[snake];
  }
  return undefined;
}

function hotStockItem(item, index) {
  const trend = item.changePercent == null ? "flat" : item.changePercent >= 0 ? "up-text" : "down-text";
  const tags = (item.tags || []).slice(0, 3);
  return `
    <li>
      <span>${item.rank}</span>
      <button class="hot-button" data-hot-index="${index}">
        <span class="hot-main">
          <strong>${escapeHtml(item.name)}</strong>
          <em>${escapeHtml(item.symbol || item.source || "")}</em>
        </span>
        <span class="hot-tags">${tags.map((tag) => `<i>${escapeHtml(tag)}</i>`).join("")}</span>
      </button>
      <span class="hot-quote">
        <small>现价</small>
        <strong>${formatNumber(item.price)}</strong>
        <b class="${trend}">${formatPercent(item.changePercent)}</b>
      </span>
    </li>
  `;
}

function visibleMainlines() {
  const rows = state.mainlines.data || [];
  return state.mainlinesExpanded ? rows : rows.slice(0, 12);
}

function mainlineListToolbar() {
  const total = state.mainlines.data?.length || 0;
  if (total <= 12) return "";
  return `
    <div class="mainline-list-toolbar">
      <span>首页显示 ${state.mainlinesExpanded ? total : Math.min(12, total)} / ${total}</span>
      <button type="button" data-mainlines-toggle>${state.mainlinesExpanded ? "收起" : "展开全部"}</button>
    </div>
  `;
}

function mainlineItem(item) {
  const trend = item.pct == null ? "flat" : item.pct >= 0 ? "up-text" : "down-text";
  const flowTrend = item.mainFlow == null ? "flat" : item.mainFlow >= 0 ? "up-text" : "down-text";
  const breadth = (item.upCount || 0) + (item.downCount || 0);
  const breadthText = breadth ? `涨 ${formatCount(item.upCount)} / 跌 ${formatCount(item.downCount)}` : "自动主线";
  const leaderText = item.leadStock
    ? `领涨 ${escapeHtml(item.leadStock)}${item.leadStockCode ? ` · ${escapeHtml(item.leadStockCode)}` : ""}`
    : "";
  return `
    <li>
      <span class="mainline-rank">${item.rank}</span>
      <div class="mainline-content">
        <div class="mainline-top">
          <strong>${escapeHtml(item.name)}</strong>
          <b class="${trend}">${formatPercent(item.pct)}</b>
          <button type="button" data-mainline-sector="${escapeAttr(item.code)}">相关股票</button>
        </div>
        ${leaderText ? `<small class="mainline-lead">${leaderText}</small>` : ""}
        <em class="mainline-foot">
          <span>${escapeHtml(item.code)} · ${escapeHtml(breadthText)}</span>
          <span class="${flowTrend}">净流入 ${formatSignedFixed(item.mainFlow, 2)} 亿</span>
        </em>
      </div>
    </li>
  `;
}

function nationalTeamTemplate() {
  const overview = state.ntOverview.data || {};
  const payload = state.ntPositions.data || {};
  const rows = payload.rows || [];
  const filters = { ...overview, ...(payload.filters || {}) };
  const hasQuery = Boolean(state.ntHasQueried);
  return `
    ${nationalTeamStatusTemplate(overview)}
    ${nationalTeamSummaryTemplate(overview)}
    <section class="nt-workbench">
      <header class="etf-section-head">
        <div>
          <strong>公开持仓雷达</strong>
          <small>基于公开季报/年报持仓快照；成本为前 90 日 VWAP 折价估算，缺窗口时用后续首个交易窗口兜底。</small>
        </div>
      </header>
      ${nationalTeamToolbarTemplate(filters)}
      ${state.ntPositions.errorMessage ? `<p class="warning">${escapeHtml(state.ntPositions.errorMessage)}</p>` : ""}
      ${hasQuery && state.loading.has("ntPositions") && !rows.length ? `<div class="chart-empty">持仓数据读取中...</div>` : ""}
      ${hasQuery && rows.length ? nationalTeamTableTemplate(rows) : ""}
      ${hasQuery && !state.loading.has("ntPositions") && !rows.length ? emptyState(overview.configured === false ? "未配置 TUSHARE_TOKEN，暂无国家队缓存数据" : "未找到符合条件的持仓记录") : ""}
    </section>
  `;
}

function nationalTeamStatusTemplate(overview) {
  const status = overview.refreshStatus;
  const isWarning = overview.configured === false || status?.status === "failed";
  const pieces = [];
  if (overview.configured === false) pieces.push("Tushare 未配置");
  if (status?.status && isWarning) pieces.push(`刷新状态：${status.status}`);
  if (status?.finishedAt) pieces.push(`数据检查 ${formatDateTime(status.finishedAt)}`);
  if (status?.message) pieces.push(status.message);
  if (!pieces.length) return "";
  return `<p class="nt-status-line ${isWarning ? "warning" : ""}">${pieces.map(escapeHtml).join(" · ")}</p>`;
}

function nationalTeamSummaryTemplate(overview) {
  const weighted = overview.weightedProfitRate == null ? "--" : formatPercent(overview.weightedProfitRate * 100);
  return `
    <div class="nt-kpi-strip">
      <span>当前股票 <strong>${formatCount(overview.totalCount)}</strong><em>机构持仓 ${formatCount(overview.positionCount)}</em></span>
      <span>估算市值 <strong>${formatChineseAmount(overview.totalValue)}</strong><em>加仓/新进 ${formatCount(overview.addCount)}</em></span>
      <span>盈利/被套 <strong>${formatCount(overview.profitCount)} / ${formatCount(overview.trappedCount)}</strong><em>减仓 ${formatCount(overview.reduceCount)}</em></span>
      <span>持仓收益率 <strong class="${trendClass(overview.weightedProfitRate)}">${weighted}</strong><em>按市值加权</em></span>
    </div>
    ${nationalTeamTopTemplate(overview.topPositions || [])}
  `;
}

function nationalTeamTopTemplate(rows) {
  if (!rows.length) return "";
  return `
    <div class="nt-top-chips-row">
      <div class="nt-top-chips">
        <span class="nt-top-label">重仓 Top 股票</span>
        ${rows.slice(0, 8).map((row) => `
          <button type="button" data-nt-stock="${escapeAttr(row.symbol)}">
            <strong>${escapeHtml(row.name || row.symbol)}</strong>
            <span>${formatChineseAmount(row.positionValue)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function nationalTeamToolbarTemplate(filters) {
  const groups = filters.groupsAvailable || [];
  const holders = (filters.holders || []).filter((holder) => !state.ntGroup || nationalTeamGroupForHolder(holder) === state.ntGroup);
  const statuses = filters.statuses || [];
  const endDates = filters.endDates || [];
  const canClear = Boolean(state.ntGroup || state.ntHolder || state.ntStatus || state.ntEndDate || state.ntQuery || state.ntHasQueried || state.ntPositions.data?.rows?.length);
  return `
    <div class="etf-toolbar nt-toolbar">
      <label>
        <span>机构分组</span>
        <select data-nt-filter="ntGroup">
          <option value="" ${!state.ntGroup ? "selected" : ""}>全部分组</option>
          ${groups.map((item) => `<option value="${escapeAttr(item)}" ${state.ntGroup === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>机构名称</span>
        <select data-nt-filter="ntHolder">
          <option value="" ${!state.ntHolder ? "selected" : ""}>全部机构</option>
          ${holders.map((item) => `<option value="${escapeAttr(item)}" ${state.ntHolder === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>盈亏状态</span>
        <select data-nt-filter="ntStatus">
          <option value="" ${!state.ntStatus ? "selected" : ""}>全部状态</option>
          ${statuses.map((item) => `<option value="${escapeAttr(item)}" ${state.ntStatus === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>报告期</span>
        <select data-nt-filter="ntEndDate">
          <option value="" ${!state.ntEndDate ? "selected" : ""}>全部报告期</option>
          ${endDates.map((item) => `<option value="${escapeAttr(item)}" ${state.ntEndDate === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
        </select>
      </label>
      <form class="nt-search-form" data-nt-search-form>
        <input name="query" value="${escapeAttr(state.ntQuery)}" placeholder="代码/名称/机构" />
        <button type="submit">查询</button>
      </form>
      ${canClear ? `<button type="button" class="etf-toolbar-clear" data-nt-clear>清空</button>` : ""}
    </div>
  `;
}

function nationalTeamGroupForHolder(holder) {
  const text = String(holder || "");
  if (/中央汇金|汇金资产|中国证券金融|证金/.test(text)) return "国家队核心";
  if (/全国社保基金|社保基金/.test(text)) return "社保基金";
  if (/基本养老保险基金/.test(text)) return "养老金";
  if (/国新投资|国家集成电路|梧桐树投资/.test(text)) return "战略投资";
  return "其他";
}

function nationalTeamTableTemplate(rows) {
  return `
    <div class="nt-table-wrap">
      <table class="nt-table">
        <thead>
          <tr>
            <th>股票</th>
            <th>机构概览</th>
            <th>状态</th>
            <th>均价/现价</th>
            <th>综合盈亏</th>
            <th>合计持股</th>
            <th>合计市值</th>
            <th>变动概览</th>
            <th>最新报告期</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(nationalTeamRowTemplate).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function nationalTeamRowTemplate(row) {
  const active = state.ntExpandedSymbol === row.symbol;
  const trend = row.profitRate == null ? "flat" : row.profitRate >= 0 ? "up-text" : "down-text";
  const holderGroups = row.holderGroups?.length ? row.holderGroups.join(" / ") : row.holderGroup || "--";
  return `
    <tr class="${active ? "active" : ""}">
      <td>
        <button type="button" class="nt-stock-button ${active ? "expanded" : ""}" data-nt-stock="${escapeAttr(row.symbol)}" title="${active ? "收起机构明细" : "展开机构明细"}">
          <span class="nt-expand-cue" aria-hidden="true">${active ? "⌃" : "⌄"}</span>
          <span class="nt-stock-label">
            <strong>${escapeHtml(row.name || row.symbol)}</strong>
            <span>${escapeHtml(row.symbol)} · ${active ? "收起" : "展开"}</span>
          </span>
        </button>
      </td>
      <td><span class="nt-holder"><strong>${formatCount(row.holderCount)} 家机构</strong><em>${escapeHtml(holderGroups)}</em></span></td>
      <td><span class="nt-status ${escapeAttr(row.status)}">${escapeHtml(row.status || "未知")}</span></td>
      <td><span class="nt-price-pair"><b>${formatNumber(row.estCost)}</b><em>${formatNumber(row.currPrice)}</em></span></td>
      <td><strong class="${trend}">${row.profitRate == null ? "--" : formatPercent(row.profitRate * 100)}</strong></td>
      <td>${formatCompactVolume(numberOrNull(row.holdAmount) || 0)}</td>
      <td>${formatChineseAmount(row.positionValue)}</td>
      <td>${nationalTeamChangeOverviewTemplate(row)}</td>
      <td>${escapeHtml(row.endDate || "--")}</td>
    </tr>
    ${active ? `<tr class="nt-detail-row"><td colspan="9">${nationalTeamStockDetailTemplate(row.symbol, row)}</td></tr>` : ""}
  `;
}

function nationalTeamChangeOverviewTemplate(row) {
  const text = String(row?.changeText || "--");
  if (!text || text === "--") return "--";
  const parts = text.split(" | ");
  const lead = parts.shift() || "--";
  const direction = row?.netChangeDirection || "";
  const leadClass = direction === "add" ? "up-text" : direction === "reduce" ? "down-text" : "flat";
  return `
    <span class="nt-change-overview">
      <strong class="${escapeAttr(leadClass)}">${escapeHtml(lead)}</strong>
      ${parts.length ? `<em>${parts.map(escapeHtml).join(" | ")}</em>` : ""}
    </span>
  `;
}

function nationalTeamStockDetailTemplate(symbol, summaryRow = null) {
  const envelope = state.ntStockDetail;
  const data = envelope.data;
  const summaryPositions = summaryRow?.positions || [];
  if (state.loading.has("ntStockDetail") && (!data || data.symbol !== symbol)) {
    return `
      ${summaryPositions.length ? nationalTeamInstitutionDetailTemplate(summaryPositions) : ""}
      <div class="chart-empty">单股详情读取中...</div>
    `;
  }
  if (envelope.errorMessage) return `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>`;
  if (!data || data.symbol !== symbol) {
    return `
      ${summaryPositions.length ? nationalTeamInstitutionDetailTemplate(summaryPositions) : ""}
      <div class="chart-empty">点击后读取详情...</div>
    `;
  }
  const positions = summaryPositions.length ? summaryPositions : data.positions || [];
  const history = data.history || [];
  return `
    ${nationalTeamInstitutionDetailTemplate(positions)}
    <div class="nt-detail-grid">
      <section class="stock-kline nt-kline">
        <header>
          <div>
            <strong>${escapeHtml(data.name || data.symbol)} 成本线</strong>
            <span>${escapeHtml(data.symbol)}</span>
          </div>
        </header>
        ${nationalTeamMiniChart(data)}
      </section>
      <section class="nt-history-panel">
        <header>
          <strong>报告期轨迹</strong>
          <span>${positions.length} 个最新机构持仓</span>
        </header>
        <ol>
          ${history.map((item) => `
            <li>
              <span><strong>${escapeHtml(item.holderName)}</strong><em>${escapeHtml(item.endDate)} · ${escapeHtml(item.holderGroup)}</em></span>
              <b>${formatCompactVolume(numberOrNull(item.holdAmount) || 0)}</b>
            </li>
          `).join("") || emptyState("暂无历史快照")}
        </ol>
      </section>
    </div>
  `;
}

function nationalTeamInstitutionDetailTemplate(positions = []) {
  return `
    <section class="nt-institution-panel">
      <header>
        <strong>机构明细</strong>
        <span>${formatCount(positions.length)} 条最新持仓</span>
      </header>
      <div class="nt-institution-table-wrap">
        <table class="nt-institution-table">
          <thead>
            <tr>
              <th>机构</th>
              <th>分组</th>
              <th>状态</th>
              <th>成本/现价</th>
              <th>盈亏率</th>
              <th>持股</th>
              <th>市值</th>
              <th>较上期变动</th>
              <th>报告期</th>
            </tr>
          </thead>
          <tbody>
            ${positions.map((item) => {
              const trend = item.profitRate == null ? "flat" : item.profitRate >= 0 ? "up-text" : "down-text";
              return `
                <tr>
                  <td><span class="nt-holder"><strong>${escapeHtml(item.holderName)}</strong></span></td>
                  <td>${escapeHtml(item.holderGroup || "--")}</td>
                  <td><span class="nt-status ${escapeAttr(item.status)}">${escapeHtml(item.status || "未知")}</span></td>
                  <td><span class="nt-price-pair"><b>${formatNumber(item.estCost)}</b><em>${formatNumber(item.currPrice)}</em></span></td>
                  <td><strong class="${trend}">${item.profitRate == null ? "--" : formatPercent(item.profitRate * 100)}</strong></td>
                  <td>${formatCompactVolume(numberOrNull(item.holdAmount) || 0)}</td>
                  <td>${formatChineseAmount(item.positionValue)}</td>
                  <td>${escapeHtml(item.changeText || "--")}</td>
                  <td>${escapeHtml(item.endDate || "--")}</td>
                </tr>
              `;
            }).join("") || `<tr><td colspan="9">${emptyState("暂无机构明细")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function nationalTeamMiniChart(data) {
  const rows = data.bars || [];
  const positions = data.positions || [];
  if (!rows.length) return `<div class="chart-empty">暂无 K 线缓存</div>`;
  const width = 760;
  const height = 260;
  const left = 46;
  const right = 14;
  const top = 18;
  const bottom = 28;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const costs = positions.map((item) => numberOrNull(item.estCost)).filter((item) => item != null);
  const prices = rows.flatMap((row) => [row.high, row.low, row.close]).filter((item) => item != null).concat(costs);
  const minRaw = Math.min(...prices);
  const maxRaw = Math.max(...prices);
  const pad = Math.max((maxRaw - minRaw) * 0.08, maxRaw * 0.003, 0.01);
  const min = minRaw - pad;
  const max = maxRaw + pad;
  const xFor = (index) => left + (rows.length <= 1 ? chartWidth / 2 : index / (rows.length - 1) * chartWidth);
  const yFor = (value) => top + ((max - value) / Math.max(max - min, 0.01)) * chartHeight;
  const line = rows.map((row, index) => `${xFor(index).toFixed(1)},${yFor(row.close).toFixed(1)}`).join(" ");
  const costLines = costs.slice(0, 4).map((cost, index) => {
    const y = yFor(cost);
    return `<line class="nt-cost-line" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" /><text class="chart-axis" x="${width - 118}" y="${(y - 4 - index * 2).toFixed(1)}">成本 ${formatChartPrice(cost)}</text>`;
  }).join("");
  const labels = chartLabelIndexes(rows.length);
  return `
    <svg class="stock-chart-svg nt-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(data.name || data.symbol)} 国家队成本线">
      <rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" />
      <line class="chart-grid" x1="${left}" y1="${top}" x2="${width - right}" y2="${top}" />
      <line class="chart-grid" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
      <text class="chart-axis" x="8" y="${top + 4}">${formatChartPrice(max)}</text>
      <text class="chart-axis" x="8" y="${height - bottom}">${formatChartPrice(min)}</text>
      <polyline class="chart-line" points="${line}" />
      ${costLines}
      ${labels.map((index) => `<text class="chart-x-label" x="${xFor(index).toFixed(1)}" y="${height - 5}">${escapeHtml(String(rows[index]?.date || "").slice(5))}</text>`).join("")}
    </svg>
  `;
}

function etfHoldingsTemplate() {
  const categories = state.etfCategories.data?.categories || [];
  if (state.loading.has("etfCategories") && !categories.length) return `<div class="card-loading">ETF 分类加载中...</div>`;
  if (!categories.length) {
    return `
      ${state.etfCategories.errorMessage ? `<p class="warning">${escapeHtml(state.etfCategories.errorMessage)}</p>` : ""}
      ${emptyState("暂无 ETF 分类数据")}
    `;
  }
  const primary = categories.find((item) => item.name === state.etfSelectedPrimary);
  const secondaries = primary?.secondaries || [];
  const secondary = secondaries.find((item) => item.name === state.etfSelectedSecondary);
  const data = state.etfChanges.data;
  const canClearCategory = Boolean(primary || secondary || data || state.etfChanges.errorMessage);
  return `
    ${etfDailyStatusTemplate()}
    ${etfStockLookupTemplate()}
    <section class="etf-category-panel">
      <header class="etf-section-head">
        <div>
          <strong>分类 ETF 持仓变化统计</strong>
          <small>按一级/二级行业筛选 ETF，统计新进、明显加仓和大幅加仓股票。</small>
        </div>
      </header>
      <div class="etf-toolbar">
        <label>
          <span>一级分类</span>
          <select data-etf-primary>
            <option value="" ${!primary ? "selected" : ""}>请选择一级分类</option>
            ${categories.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === primary?.name ? "selected" : ""}>${escapeHtml(item.name)}（${item.count}）</option>`).join("")}
          </select>
        </label>
        <label>
          <span>二级分类</span>
          <select data-etf-secondary ${primary ? "" : "disabled"}>
            <option value="" ${!secondary ? "selected" : ""}>${primary ? "请选择二级分类" : "先选择一级分类"}</option>
            ${secondaries.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === secondary?.name ? "selected" : ""}>${escapeHtml(item.name)}（${item.count}）</option>`).join("")}
          </select>
        </label>
        <label>
          <span>对比周期</span>
          <select data-etf-period>
            ${[5, 10, 15, 30].map((period) => `<option value="${period}" ${Number(state.etfPeriod) === period ? "selected" : ""}>${period} 个交易日</option>`).join("")}
          </select>
        </label>
        ${canClearCategory ? `<button type="button" class="etf-toolbar-clear" data-etf-category-clear>清空</button>` : ""}
      </div>
      ${state.etfChanges.errorMessage ? `<p class="warning">${escapeHtml(state.etfChanges.errorMessage)}</p>` : ""}
      ${etfCoverageTemplate(data, secondary)}
      ${state.loading.has("etfChanges") && !data ? `<div class="chart-empty">统计加载中...</div>` : ""}
      ${data ? `
        <div class="etf-change-grid">
          ${etfChangeBlock("新进股票", "newStocks", data.summary?.newStocks || [])}
          ${etfChangeBlock(`明显加仓 ≥${escapeHtml(data.growthThresholds?.strong ?? 5)} 个百分点`, "growthStrong", data.summary?.growthStrong || data.summary?.growth5 || [])}
          ${etfChangeBlock(`大幅加仓 ≥${escapeHtml(data.growthThresholds?.large ?? 10)} 个百分点`, "growthLarge", data.summary?.growthLarge || data.summary?.growth10 || [])}
        </div>
      ` : emptyState("请选择一级分类和二级分类")}
    </section>
  `;
}

function etfStockLookupTemplate() {
  const data = state.etfStockHoldings.data;
  const watchData = state.etfWatchHoldings.data;
  const suggestions = state.etfStockSuggestions.results.data || [];
  const suggestError = state.etfStockSuggestions.results.errorMessage;
  const showSuggestions = state.etfStockSuggestions.query && (suggestions.length || state.loading.has("etfStockSuggestions") || suggestError);
  const selected = state.etfStockSelected;
  const canQuery = Boolean(selected) && !state.loading.has("etfStockHoldings");
  const canClear = Boolean(state.etfStockQuery || selected || data || state.etfStockHoldings.errorMessage || suggestions.length);
  const hasWatchResult = Boolean(watchData || state.etfWatchHoldings.errorMessage);
  return `
    <section class="etf-stock-lookup">
      <header class="etf-section-head">
        <div>
          <strong>个股 ETF 持仓查询</strong>
          <small>先从候选中选定股票，再查看该股被哪些行业 ETF 持有。</small>
        </div>
        <div class="etf-section-actions">
          <button type="button" data-etf-watch-holdings ${state.loading.has("etfWatchHoldings") ? "disabled" : ""}>${state.loading.has("etfWatchHoldings") ? "查询中" : "一键查看自选股 ETF 持仓"}</button>
          ${hasWatchResult ? `<button type="button" class="ghost-button" data-etf-watch-clear>清空自选股结果</button>` : ""}
        </div>
      </header>
      <form class="etf-stock-lookup-form" data-etf-stock-query-form>
        <label>
          <span>股票代码/名称</span>
          <input name="stock" data-etf-stock-input autocomplete="off" value="${escapeAttr(state.etfStockQuery || "")}" placeholder="输入股票代码/名称，如 688525、01801、宁德时代" />
        </label>
        <button type="submit" ${canQuery ? "" : "disabled"}>${state.loading.has("etfStockHoldings") ? "查询中" : "查询"}</button>
        ${canClear ? `<button type="button" class="ghost-button" data-etf-stock-clear>清空</button>` : ""}
      </form>
      ${showSuggestions ? etfStockSuggestionList(suggestions, suggestError) : selected ? `<p class="etf-stock-hint etf-stock-selected">已选择：${escapeHtml(selected.stockName || selected.stockCode)}（${escapeHtml(selected.stockCode)}），${escapeHtml(selected.etfCount || 0)} 只ETF持有。</p>` : `<p class="etf-stock-hint">必须从候选中选择股票后才能查询，避免代码或名称输错。</p>`}
      ${state.etfStockHoldings.errorMessage ? `<p class="warning">${escapeHtml(state.etfStockHoldings.errorMessage)}</p>` : ""}
      ${state.loading.has("etfStockHoldings") && !data ? `<div class="chart-empty">个股 ETF 持仓查询中...</div>` : ""}
      ${data ? etfStockLookupResult(data) : ""}
      ${state.etfWatchHoldings.errorMessage ? `<p class="warning">${escapeHtml(state.etfWatchHoldings.errorMessage)}</p>` : ""}
      ${state.loading.has("etfWatchHoldings") && !watchData ? `<div class="chart-empty">正在汇总自选股 ETF 持仓...</div>` : ""}
      ${watchData ? etfWatchHoldingsResult(watchData) : ""}
    </section>
  `;
}

function etfStockSuggestionList(suggestions, errorMessage) {
  if (errorMessage) return `<p class="warning">${escapeHtml(errorMessage)}</p>`;
  if (state.loading.has("etfStockSuggestions") && !suggestions.length) {
    return `<div class="etf-stock-suggestions"><span class="etf-stock-suggest-empty">正在匹配股票代码和名称...</span></div>`;
  }
  if (!suggestions.length) {
    return `<div class="etf-stock-suggestions"><span class="etf-stock-suggest-empty">没有匹配到当前 ETF 池最新持仓里的股票</span></div>`;
  }
  return `
    <div class="etf-stock-suggestions">
      ${suggestions.map((item, index) => `
        <button type="button" class="etf-stock-suggest" data-etf-stock-suggest="${index}">
          <strong>${escapeHtml(item.stockName || item.stockCode)}</strong>
          <span>${escapeHtml(item.stockCode)}</span>
          <small>最新 ${escapeHtml(item.latestDate || "--")} · ${escapeHtml(item.etfCount || 0)} 只ETF持有${item.maxWeight == null ? "" : ` · 最高 ${formatPercent(item.maxWeight)}`}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function etfStockLookupResult(data, options = {}) {
  const showDetails = options.showDetails !== false;
  const details = data.details || [];
  const periodSummaries = data.periodSummaries || [];
  return `
    <div class="etf-stock-result ${showDetails ? "" : "etf-stock-result-summary"}">
      <header>
        <div>
          <strong>${escapeHtml(data.stockName || data.stockCode)}</strong>
          <small>${escapeHtml(data.stockCode || "")} · 最新 ${escapeHtml(data.latestDate || "--")} · 四周期对比</small>
        </div>
        <span class="etf-block-count"><b>${escapeHtml(data.holdingEtfs || 0)}</b> 只ETF持有</span>
      </header>
      <div class="etf-card-metrics etf-stock-summary-metrics">
        <span class="etf-card-metric"><small>平均占比</small><strong>${formatPercent(data.avgLatestWeight)}</strong></span>
        <span class="etf-card-metric"><small>持仓资金</small><strong>${formatChineseAmount(data.totalHoldingValue)}</strong></span>
        <span class="etf-card-metric"><small>占总市值</small><strong>${formatPercent(data.stockMarketValueRatio)}</strong></span>
      </div>
      ${periodSummaries.length ? `
        <div class="etf-stock-periods">
          ${periodSummaries.map((item) => `
            <span class="etf-stock-period">
              <small>${escapeHtml(item.period)}日 · 对比 ${escapeHtml(item.compareDate || "--")} · ${escapeHtml(item.comparableEtfs || 0)}只可比</small>
              <strong class="${trendClass(item.avgWeightChange)}">持仓 ${formatPercent(item.avgWeightChange)}</strong>
              <b class="${trendClass(item.periodChangePercent)}">股价 ${formatPercent(item.periodChangePercent)}</b>
            </span>
          `).join("")}
        </div>
      ` : ""}
      ${showDetails ? (details.length ? etfStockHoldingDetailsTable(details) : emptyState("当前 ETF 池最新快照未持有该股票")) : ""}
      ${showDetails && data.removedEtfs?.length ? `<details class="etf-failures"><summary>对比期曾持有但最新未持有 ${escapeHtml(data.removedEtfs.length)} 只</summary><ul>${data.removedEtfs.slice(0, 20).map((item) => `<li>${escapeHtml(item.etfCode)} ${escapeHtml(item.etfName || "")}：旧占比 ${formatPercent(item.oldWeight)}</li>`).join("")}</ul></details>` : ""}
    </div>
  `;
}

function etfWatchHoldingsResult(data) {
  const items = data.items || [];
  return `
    <section class="etf-watch-holdings-result">
      <header>
        <div>
          <strong>自选股 ETF 持仓概览</strong>
          <small>自选股 ${escapeHtml(data.total || 0)} 只 · ETF 持有 ${escapeHtml(data.matched || 0)} 只 · 未命中 ${escapeHtml(data.missingCount || 0)} 只</small>
        </div>
        ${data.latestDate ? `<span>最新 ${escapeHtml(data.latestDate)}</span>` : ""}
      </header>
      ${items.length ? `
        <div class="etf-watch-holdings-grid">
          ${items.map((item) => etfStockLookupResult(item, { showDetails: false })).join("")}
        </div>
      ` : emptyState("当前自选股里没有被 ETF 池最新快照持有的股票")}
    </section>
  `;
}

function etfStockHoldingDetailsTable(details) {
  const periods = [5, 10, 15, 30];
  return `
    <div class="etf-detail-scroll">
      <table class="etf-detail-table etf-stock-holding-table">
        <thead>
          <tr>
            <th>ETF</th>
            <th>分类</th>
            <th>最新占比</th>
            ${periods.map((period) => `<th>${period}日变化</th>`).join("")}
            <th>持仓资金</th>
          </tr>
        </thead>
        <tbody>
          ${details.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.etfName)}</strong><small>${escapeHtml(item.etfCode)}</small></td>
              <td><strong>${escapeHtml(item.secondaryCategory || item.primaryCategory || "--")}</strong><small>${escapeHtml(item.primaryCategory || "")}</small></td>
              <td>${formatPercent(item.latestWeight)}</td>
              ${periods.map((period) => etfStockPeriodChangeCell(item.periodChanges?.[period])).join("")}
              <td>${item.holdingValue == null ? escapeHtml(item.holdingValueStatus || "缺资金口径") : formatChineseAmount(item.holdingValue)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function etfStockPeriodChangeCell(change) {
  if (!change) return `<td>--</td>`;
  return `
    <td>
      <strong class="${trendClass(change.weightChange)}">${formatPercent(change.weightChange)}</strong>
      <small class="${etfHoldingStatusClass(change.status)}">${escapeHtml(change.status || "")}${change.oldWeight == null ? "" : ` · 旧 ${formatPercent(change.oldWeight)}`}</small>
    </td>
  `;
}

function etfHoldingStatusClass(status) {
  if (status === "增加" || status === "新进") return "up-text";
  if (status === "减少" || status === "剔除/清仓") return "down-text";
  return "";
}

function etfDailyStatusTemplate() {
  const data = state.etfDailyStatus.data;
  if (state.etfDailyStatus.errorMessage) return `<p class="warning">${escapeHtml(state.etfDailyStatus.errorMessage)}</p>`;
  if (!data) {
    return state.loading.has("etfDailyStatus") ? `<div class="etf-daily-status"><span>今日 ETF 数据入库率加载中...</span></div>` : "";
  }
  const percent = Number(data.completionPercent || 0);
  const width = Math.max(0, Math.min(100, percent));
  const isWaitingSource = data.dataStatus === "waiting_source" && data.sourcePendingDate;
  const titleText = isWaitingSource ? "ETF持仓源待更新" : `ETF数据入库率 ${percent.toFixed(1)}%`;
  const targetText = isWaitingSource
    ? `当前展示 ${data.snapshotDate || "--"}`
    : data.snapshotDate ? `目标交易日 ${data.snapshotDate}` : "暂无目标交易日";
  const refreshText = Array.isArray(data.refreshTimes) && data.refreshTimes.length ? data.refreshTimes.join(" / ") : "--";
  const fullRefreshText = Array.isArray(data.fullRefreshTimes) && data.fullRefreshTimes.length ? data.fullRefreshTimes.join(" / ") : "";
  const statusText = isWaitingSource
    ? `等待 ${data.sourcePendingDate} 源数据上传`
    : data.missingEtfs > 0
    ? `待补 ${data.missingEtfs} 只，${escapeHtml(data.finalAttemptTime || "08:30")} 前持续补缺口`
    : "已完成入库";
  return `
    <div class="etf-daily-status">
      <div class="etf-daily-status-head">
        <strong>${escapeHtml(titleText)}</strong>
        <span class="${data.coverageTargetMet ? "up-text" : "down-text"}">${escapeHtml(data.completedEtfs || 0)} / ${escapeHtml(data.totalEtfs || 0)}</span>
      </div>
      <div class="etf-daily-progress" aria-hidden="true"><span style="width: ${width}%"></span></div>
      <div class="etf-daily-status-meta">
        <span>${escapeHtml(targetText)}</span>
        <span>${escapeHtml(statusText)}</span>
        <span>定时采集 ${escapeHtml(refreshText)}</span>
        ${fullRefreshText ? `<span>全量覆盖 ${escapeHtml(fullRefreshText)}</span>` : ""}
        ${data.lastStatusUpdatedAt ? `<span>最近状态 ${escapeHtml(formatDateTime(data.lastStatusUpdatedAt))}</span>` : ""}
      </div>
    </div>
  `;
}

function etfCoverageTemplate(data, secondary) {
  const etfCount = secondary?.count || 0;
  if (!data) return `<p class="etf-note">当前二级分类共 ${escapeHtml(etfCount)} 只 ETF。历史对比依赖定时采集和可用快照。</p>`;
  const staleText = data.coverageMessage ? ` · ${data.coverageMessage}` : "";
  return `
    <div class="etf-status-row">
      <span>ETF ${escapeHtml(data.requestedEtfs || etfCount)} 只</span>
      <span>最新快照 ${escapeHtml(data.latestDate || "--")}</span>
      <span>对比快照 ${escapeHtml(data.compareDate || "--")}</span>
      <span>可比较 ${escapeHtml(data.comparableEtfs ?? 0)} 只</span>
      <span>最新覆盖 ${escapeHtml(data.latestEtfs || 0)} / 对比覆盖 ${escapeHtml(data.compareEtfs || 0)}</span>
      <span class="${data.partial ? "down-text" : "up-text"}">${data.partial ? "部分覆盖" : "覆盖完整"}${escapeHtml(staleText)}</span>
    </div>
    ${data.failures?.length ? `
      <details class="etf-failures">
        <summary>采集失败 ${data.failures.length} 项</summary>
        <ul>${data.failures.slice(0, 20).map((item) => `<li>${escapeHtml(item.etfCode)} ${escapeHtml(item.etfName || "")}：${escapeHtml(item.errorMessage || "失败")}</li>`).join("")}</ul>
      </details>
    ` : ""}
  `;
}

function etfChangeBlock(title, kind, rows) {
  const sortValue = state.etfChangeSort[kind] || "default";
  const sortedRows = sortEtfChangeRows(rows, sortValue);
  return `
    <section class="etf-change-block">
      <header>
        <div class="etf-block-title">
          <strong>${escapeHtml(title)}</strong>
          <span class="etf-block-count"><b>${escapeHtml(rows.length)}</b> 只股票</span>
        </div>
        ${rows.length ? etfChangeSortControl(kind, sortValue) : ""}
      </header>
      ${rows.length ? etfChangeTable(kind, sortedRows) : emptyState("暂无符合条件的股票")}
    </section>
  `;
}

function etfChangeSortControl(kind, value) {
  const options = [
    ["default", "默认排序"],
    ["etf_count", "ETF数"],
    ["latest_weight", "最新占比"],
    ["weight_change", "变化"],
    ["period_change", "周期涨跌"],
    ["holding_value", "持仓资金"],
    ["market_ratio", "占总市值"]
  ];
  return `
    <label class="etf-sort-control">
      <span>排序</span>
      <select data-etf-block-sort="${escapeAttr(kind)}">
        ${options.map(([key, label]) => `<option value="${key}" ${value === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function sortEtfChangeRows(rows, sortValue) {
  if (!sortValue || sortValue === "default") return rows;
  const keyMap = {
    etf_count: "etf_count",
    latest_weight: "avg_latest_weight",
    weight_change: "avg_weight_change",
    period_change: "period_change_percent",
    holding_value: "total_holding_value",
    market_ratio: "stock_market_value_ratio"
  };
  const key = keyMap[sortValue];
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const av = numberOrNull(a[key]);
    const bv = numberOrNull(b[key]);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const diff = bv - av;
    if (diff) return diff;
    return (numberOrNull(b.etf_count) ?? 0) - (numberOrNull(a.etf_count) ?? 0);
  });
}

function etfChangeTable(kind, rows) {
  return `
    <div class="etf-change-list">
      ${rows.map((row) => etfChangeRow(kind, row)).join("")}
    </div>
  `;
}

function etfChangeRow(kind, row) {
  const key = `${kind}:${row.stockCode}`;
  const open = state.etfExpandedStocks.has(key);
  const showAverageChange = kind !== "newStocks";
  const coverageNote = row.holding_value_missing_count
    ? `<small>覆盖 ${escapeHtml(row.holding_value_coverage_count || 0)}/${escapeHtml(row.etf_count || 0)}</small>`
    : "";
  return `
    <article class="etf-change-card">
      <div class="etf-card-head">
        <button type="button" class="etf-stock-button ${open ? "is-open" : ""}" data-etf-stock-toggle="${escapeAttr(key)}">
          <span class="etf-stock-main">
            <strong>${escapeHtml(row.stockName || row.stockCode)}</strong>
            <small>${escapeHtml(row.stockCode)}</small>
          </span>
          <span class="etf-expand-pill">${open ? "收起明细" : "展开明细"}</span>
        </button>
        <span class="etf-card-count"><small>命中 ETF</small><b>${escapeHtml(row.etf_count || 0)}</b><em>只</em></span>
      </div>
      <div class="etf-card-metrics">
        <span class="etf-card-metric">
          <small>最新占比</small>
          <strong>${formatPercent(row.avg_latest_weight)}</strong>
        </span>
        ${showAverageChange ? `
          <span class="etf-card-metric">
            <small>变化</small>
            <strong class="${trendClass(row.avg_weight_change)}">${formatPercent(row.avg_weight_change)}</strong>
          </span>
        ` : ""}
        <span class="etf-card-metric">
          <small>周期涨跌</small>
          <strong class="${trendClass(row.period_change_percent)}">${row.period_change_percent == null ? escapeHtml(row.period_change_status || "--") : formatPercent(row.period_change_percent)}</strong>
        </span>
        <span class="etf-card-metric">
          <small>持仓资金</small>
          <strong>${formatChineseAmount(row.total_holding_value)}</strong>
          ${coverageNote}
        </span>
        <span class="etf-card-metric">
          <small>占总市值</small>
          <strong>${row.stock_market_value_ratio == null ? escapeHtml(row.stock_market_value_status || "--") : formatPercent(row.stock_market_value_ratio)}</strong>
        </span>
      </div>
      ${open ? etfDetailTable(row.details || []) : ""}
    </article>
  `;
}

function etfDetailTable(details) {
  return `
    <div class="etf-detail-scroll">
      <table class="etf-detail-table">
        <thead>
          <tr>
            <th>ETF</th>
            <th>旧占比</th>
            <th>最新占比</th>
            <th>变化</th>
            <th>持仓资金</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${details.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.etfName)}</strong><small>${escapeHtml(item.etfCode)}</small></td>
              <td>${formatPercent(item.oldWeight)}</td>
              <td>${formatPercent(item.latestWeight)}</td>
              <td class="${trendClass(item.weightChange)}">${formatPercent(item.weightChange)}</td>
              <td>${item.holdingValue == null ? escapeHtml(item.holdingValueStatus || "缺资金口径") : formatChineseAmount(item.holdingValue)}</td>
              <td>${escapeHtml(item.status || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function sectorFeatureTemplate() {
  if (state.sectorMode === "overview") return sectorOverviewTemplate();
  return `
    <div class="sector-feature">
      <div class="sector-feature-tabs">
        <button type="button" data-sector-mode="overview">← 返回</button>
        <button type="button" class="${state.sectorMode === "flow" ? "active" : ""}" data-sector-mode="flow">板块流向</button>
        <button type="button" class="${state.sectorMode === "ranking" ? "active" : ""}" data-sector-mode="ranking">板块涨跌幅</button>
      </div>
      ${state.sectorMode === "ranking" ? sectorRankingTemplate() : sectorFlowTemplate()}
    </div>
  `;
}

function sectorOverviewTemplate() {
  const rankingRows = [...(state.sectorRanking.data?.rows || [])].sort((a, b) => (numberOrNull(a.source_rank) ?? Infinity) - (numberOrNull(b.source_rank) ?? Infinity));
  const flowRows = (state.sectorFlow.data?.series || [])
    .map((item) => ({ ...item, latest: lastNonNullNumber(item.data || []) }))
    .sort((a, b) => (numberOrNull(a.source_rank) ?? Infinity) - (numberOrNull(b.source_rank) ?? Infinity));
  return `
    <div class="sector-overview-grid">
      <button type="button" class="sector-overview-card ranking" data-sector-mode="ranking">
        <header>
          <strong>板块涨跌幅</strong>
          <em>完整榜单 →</em>
        </header>
        ${sectorOverviewRanking(rankingRows)}
      </button>
      <button type="button" class="sector-overview-card flow" data-sector-mode="flow">
        <header>
          <strong>板块资金流向</strong>
          <em>资金流向 →</em>
        </header>
        ${sectorOverviewFlow(flowRows)}
      </button>
    </div>
  `;
}

function sectorOverviewRanking(rows) {
  if (state.loading.has("sectorRanking") && !rows.length) return `<div class="card-loading">加载中...</div>`;
  if (!state.sectorRanking.data && state.sectorRanking.errorMessage) return emptyState(`数据加载失败：${state.sectorRanking.errorMessage}`);
  if (!state.sectorRanking.data) return emptyState("板块涨跌幅后台同步中");
  if (!rows.length) return emptyState("暂无涨跌幅数据");
  const gainers = rows.slice(0, 3);
  const losers = rows.filter((row) => numberOrNull(row.pct_1d) != null).sort((a, b) => (numberOrNull(a.pct_1d) ?? Infinity) - (numberOrNull(b.pct_1d) ?? Infinity)).slice(0, 3);
  return `
    <div class="overview-rank-list">
      ${gainers.map((row, index) => overviewRankRow(row, index, "up")).join("")}
      <hr />
      ${losers.map((row, index) => overviewRankRow(row, index, "down")).join("")}
    </div>
  `;
}

function overviewRankRow(row, index, side) {
  const value = numberOrNull(row.pct_1d);
  const width = Math.max(12, Math.min(100, Math.abs(value || 0) * 28));
  return `
    <span class="${side}">
      <b>${index + 1}</b>
      <i>${escapeHtml(row.name)}</i>
      <em><u style="width:${width}%"></u></em>
      <strong>${formatPercent(value)}</strong>
    </span>
  `;
}

function sectorOverviewFlow(rows) {
  if (state.loading.has("sectorFlow") && !rows.length) return `<div class="card-loading">加载中...</div>`;
  if (!state.sectorFlow.data && state.sectorFlow.errorMessage) return emptyState(`数据加载失败：${state.sectorFlow.errorMessage}`);
  if (!state.sectorFlow.data) return emptyState("板块资金流后台同步中");
  if (!rows.length) return emptyState("暂无资金流数据");
  const legendRows = rows.slice(0, 6);
  return `
    <div class="overview-flow-chart">${sectorOverviewFlowSvg(rows.slice(0, 12))}</div>
    <div class="overview-flow-list">
      ${legendRows.map((row) => `
        <span>
          <i style="background:${escapeAttr(row.color || "#d94f4f")}"></i>
          <b>${escapeHtml(row.name)}</b>
          <strong class="${trendClass(row.latest)}">${formatSignedFixed(row.latest, 2)}</strong>
        </span>
      `).join("")}
    </div>
  `;
}

function sectorOverviewFlowSvg(rows) {
  const width = 520;
  const height = 150;
  const left = 24;
  const right = 12;
  const top = 12;
  const bottom = 24;
  const plottedRows = rows.map((row) => ({
    ...row,
    points: (row.data || [])
      .map((value, index) => ({ value: numberOrNull(value), index }))
      .filter((point) => point.value != null)
  }));
  const plottedLatestIndex = Math.max(1, ...plottedRows.flatMap((row) => row.points.map((point) => point.index)));
  const reportedLatestIndex = numberOrNull(state.sectorFlow.data?.last_session_min);
  const latestIndex = Math.max(1, Math.min(239, reportedLatestIndex == null ? plottedLatestIndex : Math.min(reportedLatestIndex, plottedLatestIndex)));
  const values = plottedRows.flatMap((row) => row.points.filter((point) => point.index <= latestIndex).map((point) => point.value));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const xFor = (index) => left + (index / latestIndex) * (width - left - right);
  const yFor = (value) => top + ((max - value) / Math.max(1, max - min)) * (height - top - bottom);
  const middleIndex = Math.round(latestIndex / 2);
  return `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" />
      <line x1="${left}" y1="${yFor(0).toFixed(1)}" x2="${width - right}" y2="${yFor(0).toFixed(1)}" />
      ${plottedRows.map((row) => {
        const points = row.points
          .filter((point) => point.index <= latestIndex)
          .map((point) => `${xFor(point.index).toFixed(1)},${yFor(point.value).toFixed(1)}`)
          .join(" ");
        return points ? `<polyline points="${points}" stroke="${escapeAttr(row.color || "#d94f4f")}" />` : "";
      }).join("")}
      <text x="${left}" y="${height - 6}">09:30</text>
      ${latestIndex > 36 ? `<text x="${width / 2 - 16}" y="${height - 6}">${escapeHtml(sectorMinuteLabel(middleIndex))}</text>` : ""}
      <text x="${width - 48}" y="${height - 6}">${escapeHtml(sectorMinuteLabel(latestIndex))}</text>
    </svg>
  `;
}

function sectorMinuteLabel(index) {
  const safeIndex = Math.max(0, Math.min(239, Number(index) || 0));
  const minutes = safeIndex < 120 ? 9 * 60 + 30 + safeIndex : 13 * 60 + safeIndex - 120;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sectorFlowTemplate() {
  const envelope = state.sectorFlow || emptyEnvelope(null);
  const data = envelope.data;
  return `
    <div class="sector-toolbar">
      <span>${data?.trade_date || state.sectorFlowDate || ""}${data?.series?.length ? ` · ${escapeHtml(data.series.length)} 板块` : ""}${sectorFlowIsRealtime(data) ? " · 实时(60s)" : ""}</span>
    </div>
    ${envelope.errorMessage ? `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>` : ""}
    ${state.loading.has("sectorFlow") && !data ? `<div class="chart-empty">图表加载中...</div>` : ""}
    ${data ? `
      <div class="sector-flow-layout">
        <div class="sector-flow-chart-panel">
          <header class="sector-flow-title">
            <strong>${escapeHtml(data.trade_date || "")} 收盘</strong>
            <span>${escapeHtml(data.title || "资金分时流向")}</span>
          </header>
          ${sectorFlowSvg(data)}
          ${sectorReplayControls(data)}
        </div>
        ${sectorFlowPicker(data.series || [], data)}
      </div>
    ` : emptyState("暂无板块流向数据")}
  `;
}

function syncSectorFlowPickerHeight() {
  const chartPanel = document.querySelector(".sector-flow-chart-panel");
  const picker = document.querySelector(".sector-flow-picker");
  if (!chartPanel || !picker) return;
  if (window.matchMedia("(max-width: 760px)").matches) {
    picker.style.height = "";
    return;
  }
  const height = Math.round(chartPanel.getBoundingClientRect().height);
  if (height > 0) picker.style.height = `${height}px`;
}

function sectorFlowIsRealtime(data) {
  const latest = state.sectorFlowDates.data?.dates?.[0];
  return Boolean(data?.trade_date && latest && data.trade_date === latest);
}

function sectorFlowSvg(data) {
  const series = (data.series || []).filter((item) => state.sectorFlowSelected.has(item.code));
  const cursor = Math.max(1, Math.min(data.session_minutes || 240, state.sectorFlowCursor ?? data.last_session_min ?? 239));
  const visibleSeries = series.map((item) => ({ ...item, data: (item.data || []).slice(0, cursor + 1) }));
  const width = 920;
  const height = 420;
  const left = 62;
  const right = 130;
  const top = 28;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = visibleSeries.flatMap((item) => item.data).filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const pad = Math.max((maxRaw - minRaw) * 0.08, 1);
  const minValue = minRaw - pad;
  const maxValue = maxRaw + pad;
  const xFor = (index) => left + (index / Math.max(1, (data.session_minutes || 240) - 1)) * chartWidth;
  const yFor = (value) => top + ((maxValue - value) / Math.max(1, maxValue - minValue)) * chartHeight;
  const gridValues = uniqueNumbers([Math.round(maxValue), Math.round((maxValue + minValue) / 2), Math.round(minValue)]);
  const paths = visibleSeries.map((item) => {
    const plotted = item.data
      .map((value, index) => ({ value: numberOrNull(value), index }))
      .filter((point) => point.value != null);
    if (!plotted.length) return "";
    const points = plotted.map((point) => `${xFor(point.index).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(" ");
    const lastPoint = plotted.at(-1);
    const lastValue = lastPoint.value;
    const lastX = xFor(lastPoint.index);
    const lastY = yFor(Number(lastValue || 0));
    return `
      <polyline class="sector-flow-line" points="${points}" stroke="${escapeAttr(item.color || "#d94f4f")}" />
      <text class="sector-flow-label" x="${(lastX + 8).toFixed(1)}" y="${(lastY + 4).toFixed(1)}">${escapeHtml(item.name)} ${formatSignedFixed(lastValue, 2)}</text>
    `;
  }).join("");
  return `
    <svg class="sector-flow-svg" data-sector-flow-chart viewBox="0 0 ${width} ${height}" role="img" aria-label="板块资金流向">
      <rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" />
      <text class="chart-axis" x="12" y="20">亿元</text>
      ${gridValues.map((value) => {
        const y = yFor(value);
        return `<line class="chart-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" /><text class="chart-axis" x="10" y="${(y + 4).toFixed(1)}">${formatSignedFixed(value, 0)}</text>`;
      }).join("")}
      ${(data.ticks || []).map((tick) => `<text class="chart-x-label" x="${xFor(tick.value).toFixed(1)}" y="${height - 12}">${escapeHtml(tick.label)}</text>`).join("")}
      <line class="chart-grid zero" x1="${left}" y1="${yFor(0).toFixed(1)}" x2="${width - right}" y2="${yFor(0).toFixed(1)}" />
      ${paths || `<text class="chart-axis" x="${left + 20}" y="${top + 40}">请选择右侧板块</text>`}
      <g data-sector-flow-hover-layer></g>
    </svg>
  `;
}

function updateSectorFlowHover(event) {
  const svg = event.currentTarget;
  const layer = svg.querySelector("[data-sector-flow-hover-layer]");
  const data = state.sectorFlow.data;
  if (!layer || !data?.series?.length) return;
  const metrics = sectorFlowHoverMetrics(data);
  if (!metrics.series.length) {
    layer.innerHTML = "";
    return;
  }
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * metrics.width;
  const boundedX = Math.max(metrics.left, Math.min(metrics.width - metrics.right, x));
  const rawIndex = Math.round(((boundedX - metrics.left) / Math.max(1, metrics.chartWidth)) * Math.max(1, metrics.sessionMinutes - 1));
  const index = Math.max(0, Math.min(metrics.cursor, rawIndex));
  const hoverX = metrics.xFor(index);
  const rows = metrics.series
    .map((item) => ({ ...item, value: numberOrNull(item.data[index]), y: metrics.yFor(numberOrNull(item.data[index]) || 0) }))
    .filter((item) => item.value != null)
    .sort((a, b) => Number(b.value) - Number(a.value));
  if (!rows.length) {
    layer.innerHTML = "";
    return;
  }
  const maxRows = 16;
  const displayRows = rows.slice(0, maxRows);
  const hiddenCount = rows.length - displayRows.length;
  const rowHeight = 20;
  const tooltipWidth = 190;
  const tooltipHeight = 34 + displayRows.length * rowHeight + (hiddenCount ? 18 : 0);
  const tooltipX = hoverX + tooltipWidth + 14 > metrics.width ? hoverX - tooltipWidth - 14 : hoverX + 14;
  const tooltipY = Math.max(8, Math.min(metrics.height - tooltipHeight - 8, metrics.top + 4));
  const time = sectorMinuteLabel(index);
  layer.innerHTML = `
    <line class="sector-flow-hover-line" x1="${hoverX.toFixed(1)}" y1="${metrics.top}" x2="${hoverX.toFixed(1)}" y2="${metrics.height - metrics.bottom}" />
    ${rows.map((item) => `<circle class="sector-flow-hover-point" cx="${hoverX.toFixed(1)}" cy="${item.y.toFixed(1)}" r="3.6" fill="${escapeAttr(item.color || "#64748b")}" />`).join("")}
    <g class="sector-flow-tooltip">
      <rect x="${tooltipX.toFixed(1)}" y="${tooltipY.toFixed(1)}" width="${tooltipWidth}" height="${tooltipHeight}" rx="6" />
      <text class="sector-flow-tooltip-time" x="${(tooltipX + 12).toFixed(1)}" y="${(tooltipY + 22).toFixed(1)}">${escapeHtml(time)}</text>
      ${displayRows.map((item, rowIndex) => {
        const y = tooltipY + 44 + rowIndex * rowHeight;
        return `
          <circle cx="${(tooltipX + 14).toFixed(1)}" cy="${(y - 5).toFixed(1)}" r="4" fill="${escapeAttr(item.color || "#64748b")}" />
          <text class="sector-flow-tooltip-name" x="${(tooltipX + 26).toFixed(1)}" y="${y.toFixed(1)}">${escapeHtml(item.name)}</text>
          <text class="sector-flow-tooltip-value" x="${(tooltipX + tooltipWidth - 12).toFixed(1)}" y="${y.toFixed(1)}">${formatSignedFixed(item.value, 2)}</text>
        `;
      }).join("")}
      ${hiddenCount ? `<text class="sector-flow-tooltip-more" x="${(tooltipX + 12).toFixed(1)}" y="${(tooltipY + tooltipHeight - 8).toFixed(1)}">另 ${hiddenCount} 个板块未显示</text>` : ""}
    </g>
  `;
}

function clearSectorFlowHover(event) {
  const layer = event.currentTarget.querySelector("[data-sector-flow-hover-layer]");
  if (layer) layer.innerHTML = "";
}

function sectorFlowHoverMetrics(data) {
  const width = 920;
  const height = 420;
  const left = 62;
  const right = 130;
  const top = 28;
  const bottom = 42;
  const sessionMinutes = data.session_minutes || 240;
  const cursor = Math.max(1, Math.min(sessionMinutes - 1, state.sectorFlowCursor ?? data.last_session_min ?? sessionMinutes - 1));
  const series = (data.series || [])
    .filter((item) => state.sectorFlowSelected.has(item.code))
    .map((item) => ({ ...item, data: (item.data || []).slice(0, cursor + 1) }));
  const values = series.flatMap((item) => item.data).filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const pad = Math.max((maxRaw - minRaw) * 0.08, 1);
  const minValue = minRaw - pad;
  const maxValue = maxRaw + pad;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    sessionMinutes,
    cursor,
    chartWidth,
    series,
    xFor: (index) => left + (index / Math.max(1, sessionMinutes - 1)) * chartWidth,
    yFor: (value) => top + ((maxValue - Number(value || 0)) / Math.max(1, maxValue - minValue)) * chartHeight
  };
}

function sectorFlowPicker(series, data = null) {
  return `
    <aside class="sector-flow-picker">
      <div class="sector-flow-picker-actions">
        <button type="button" data-sector-flow-preset="all">全选</button>
        <button type="button" data-sector-flow-preset="featured">精选</button>
        <button type="button" data-sector-flow-preset="clear">清空</button>
      </div>
      <div class="sector-flow-checks">
        ${series.map((item) => `
          <label class="${state.sectorFlowSelected.has(item.code) ? "active" : ""}">
            <input type="checkbox" data-sector-flow-code="${escapeAttr(item.code)}" ${state.sectorFlowSelected.has(item.code) ? "checked" : ""} />
            <i style="background:${escapeAttr(item.color || "#999")}"></i>
            <span>${escapeHtml(item.name)}</span>
          </label>
        `).join("")}
      </div>
      <footer class="sector-flow-picker-meta">
        <span>${escapeHtml(series.length)} 板块${sectorFlowIsRealtime(data) ? " · 实时(60s)" : ""}</span>
      </footer>
    </aside>
  `;
}

function sectorReplayControls(data) {
  const cursor = state.sectorFlowCursor ?? data.last_session_min ?? 239;
  return `
    <div class="sector-replay">
      <button type="button" data-sector-replay>${state.sectorFlowPlaying ? "暂停" : "回放"}</button>
      <label>
        <span>速度</span>
        <input type="range" min="1" max="30" step="1" value="${escapeAttr(state.sectorFlowSpeed)}" data-sector-speed />
      </label>
      <strong>${escapeHtml(state.sectorFlowSpeed)}×</strong>
      <span>${cursor + 1}/${data.session_minutes || 240}</span>
    </div>
  `;
}

function sectorRankingTemplate() {
  const envelope = state.sectorRanking || emptyEnvelope(null);
  const data = envelope.data;
  const dates = state.sectorRankingDates.data?.dates || [];
  const rows = sortedSectorRankingRows();
  return `
    <div class="sector-toolbar">
      <label>
        <span>日期</span>
        <select data-sector-ranking-date>
          ${(dates.length ? dates : [state.sectorRankingDate || "latest"]).map((date) => `<option value="${escapeAttr(date)}" ${date === state.sectorRankingDate || (!state.sectorRankingDate && date === dates[0]) ? "selected" : ""}>${escapeHtml(date)}</option>`).join("")}
        </select>
      </label>
      <button type="button" data-sector-export ${rows.length ? "" : "disabled"}>导出 CSV</button>
      <span>${data?.date || ""}${data?.updated_at ? ` · ${escapeHtml(data.updated_at)}` : ""}</span>
    </div>
    ${envelope.errorMessage ? `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>` : ""}
    ${state.loading.has("sectorRanking") && !data ? `<div class="chart-empty">表格加载中...</div>` : ""}
    ${rows.length ? sectorRankingTable(rows) : emptyState("暂无板块涨跌幅数据")}
  `;
}

function sectorRankingColumns() {
  return [
    { key: "pct_1d", label: "今日" },
    { key: "pct_5d", label: "5 日" },
    { key: "pct_10d", label: "10 日" },
    { key: "pct_20d", label: "20 日" },
    { key: "pct_60d", label: "60 日" },
    { key: "pct_120d", label: "120 日" },
    { key: "vs_ma5_pct", label: "vs MA5" },
    { key: "vs_ma10_pct", label: "vs MA10" },
    { key: "vs_ma20_pct", label: "vs MA20" },
    { key: "sharpe", label: "Sharpe", plain: true }
  ];
}

function sortedSectorRankingRows() {
  const rows = [...(state.sectorRanking.data?.rows || [])];
  const { key, direction } = state.sectorRankingSort;
  const sign = direction === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const av = numberOrNull(a[key]);
    const bv = numberOrNull(b[key]);
    if (av == null && bv == null) return String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign;
  });
}

function sectorRankingTable(rows) {
  const columns = sectorRankingColumns();
  return `
    <div class="sector-ranking-scroll">
      <table class="sector-ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>名称</th>
            ${columns.map((column) => `<th><button type="button" data-sector-sort="${escapeAttr(column.key)}">${escapeHtml(column.label)}${state.sectorRankingSort.key === column.key ? (state.sectorRankingSort.direction === "desc" ? " ↓" : " ↑") : ""}</button></th>`).join("")}
            <th>30日走势</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>
                <button type="button" class="sector-name-button" data-sector-detail="${escapeAttr(row.code)}">
                  <strong>${escapeHtml(row.name)}</strong>
                  <small>${escapeHtml(row.code)}</small>
                </button>
              </td>
              ${columns.map((column) => sectorRankingCell(row, column)).join("")}
              <td>${sectorSparkline(row.trend_30d, row.pct_1d, row.history_error)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function sectorRankingCell(row, column) {
  const value = row?.[column.key];
  const num = numberOrNull(value);
  const historyError = String(row?.history_error || "").trim();
  if (historyError && num == null && isSectorHistoryColumn(column.key)) {
    const text = column.key === "pct_20d" ? "历史K暂不可用" : "--";
    return `<td class="sector-heat sector-history-missing" title="${escapeAttr(historyError)}">${escapeHtml(text)}</td>`;
  }
  const cls = trendClass(num);
  const intensity = column.plain || num == null ? 0 : Math.min(0.78, 0.08 + Math.abs(num) / 120);
  const bg = num == null || column.plain ? "" : ` style="--heat:${intensity.toFixed(2)}"`;
  const text = column.plain ? formatFixed(num, 2) : formatPercent(num);
  return `<td class="sector-heat ${cls}"${bg}>${escapeHtml(text)}</td>`;
}

function isSectorHistoryColumn(key) {
  return ["pct_20d", "pct_60d", "pct_120d", "vs_ma5_pct", "vs_ma10_pct", "vs_ma20_pct", "sharpe"].includes(key);
}

function sectorSparkline(values, fallbackValue, historyError = "") {
  const rows = (values || []).map(Number).filter(Number.isFinite);
  if (rows.length < 2) return historyError ? `<span class="sector-history-note" title="${escapeAttr(historyError)}">历史K暂不可用</span>` : "";
  const width = 112;
  const height = 36;
  const padX = 5;
  const padY = 5;
  const min = Math.min(...rows);
  const max = Math.max(...rows);
  const range = Math.max(max - min, Math.abs(max) * 0.005, 0.01);
  const xFor = (index) => (index / Math.max(1, rows.length - 1)) * (width - padX * 2) + padX;
  const yFor = (value) => padY + ((max - value) / range) * (height - padY * 2);
  const linePath = rows.map((value, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`).join(" ");
  const cls = rows.at(-1) >= rows[0] ? "up-text" : "down-text";
  const endX = xFor(rows.length - 1).toFixed(1);
  const endY = yFor(rows.at(-1)).toFixed(1);
  return `<svg class="sector-sparkline ${cls}" viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none"><line class="spark-guide" x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" /><path class="spark-line" d="${linePath}" /><circle cx="${endX}" cy="${endY}" r="2.5" /></svg>`;
}

function formatSignedFixed(value, digits = 2) {
  const num = numberOrNull(value);
  if (num == null) return "--";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(digits)}`;
}

function formatFixed(value, digits = 2) {
  const num = numberOrNull(value);
  return num == null ? "--" : num.toFixed(digits);
}

function adminPanelTemplate() {
  const users = state.adminUsers.data || [];
  return `
    ${tushareStatusTemplate()}
    <form id="admin-create-form" class="admin-create-form">
      <input name="displayName" placeholder="名称，如 张三" required />
      <input name="username" placeholder="新用户名" required />
      <input name="password" type="password" placeholder="初始密码，至少 6 位" required />
      <label>
        <span>到期日</span>
        <input name="expiresAt" type="date" value="${defaultExpiryDateInput()}" required />
      </label>
      <label>
        <span>每日 AI 次数</span>
        <input name="dsaDailyLimit" type="number" min="0" step="1" value="3" required />
      </label>
      <button type="submit">开设账号</button>
    </form>
    <button type="button" class="admin-users-toggle" data-toggle-admin-users>
      <span>${state.adminUsersExpanded ? "收起用户列表" : "展开用户列表"}</span>
      <em>${escapeHtml(users.length)} 个账号</em>
    </button>
    ${state.adminUsersExpanded ? `
      <div class="admin-user-list">
        ${users.map(adminUserItem).join("") || emptyState("暂无用户")}
      </div>
    ` : ""}
  `;
}

function tushareStatusTemplate() {
  const payload = state.tushareStatus.data;
  if (!state.user?.isAdmin || !payload) return "";
  const stockBasic = payload.caches?.stockBasic || {};
  const tradeCalendar = payload.caches?.tradeCalendar || {};
  const statuses = Array.isArray(payload.statuses) ? payload.statuses : [];
  const warning = payload.configured ? statuses.find((item) => item.status && !["success"].includes(item.status)) : { message: "未配置 TUSHARE_TOKEN" };
  return `
    <section class="tushare-status-card ${payload.configured ? "" : "warning"}">
      <div>
        <strong>Tushare 数据源</strong>
        <span>${payload.configured ? "已配置" : "未配置"}</span>
      </div>
      <div>
        <strong>股票基础</strong>
        <span>${formatCount(stockBasic.total)} 条 · ${formatDateTime(stockBasic.updatedAt) || "未同步"}</span>
      </div>
      <div>
        <strong>交易日历</strong>
        <span>${formatCount(tradeCalendar.total)} 条 · ${formatDateTime(tradeCalendar.updatedAt) || "未同步"}</span>
      </div>
      ${warning ? `<p>${escapeHtml(warning.message || warning.status || "数据源有降级")}</p>` : ""}
    </section>
  `;
}

function userManualTemplate() {
  return `
    <div class="system-guide">
      <section>
        <h3>快捷入口</h3>
        <p>建议使用手机浏览器或电脑浏览器打开本系统。登录后可点击右上角“快捷入口”，按当前设备提示添加到手机桌面、电脑桌面、任务栏或 Dock，后续像 App 一样直接打开。</p>
      </section>
      <section>
        <h3>核心行情</h3>
        <p>“行情”页展示上证指数、纳斯达克综合指数、国际现货金、布伦特原油、BTC/USDT 和美元/人民币汇率。数据会自动刷新，也可以点右上角刷新按钮手动更新。</p>
      </section>
      <section>
        <h3>A 股大盘</h3>
        <p>查看全 A 涨跌分布、涨跌家数、沪深成交额和较上一交易日成交额变化。红色代表上涨区间，绿色代表下跌区间。</p>
      </section>
      <section>
        <h3>资讯</h3>
        <p>“资讯”页集中查看金十重要事件和东方财富资讯热榜。点击标题会在当前页面弹出正文，阅读后关闭即可回到原列表。</p>
      </section>
      <section>
        <h3>热度</h3>
        <p>“热度”页展示主线跟踪和东财热股。点击主线可查看对应概念板块内股票，东财热股和相关股票都可以继续打开个股详情。</p>
      </section>
      <section>
        <h3>个股查询</h3>
        <p>在“行情”页输入股票代码或名称，可从候选列表中选择股票并打开详情。详情页包含现价、涨跌、关键交易指标、所属板块、K 线图、资金流向、近日公告和股吧热门贴。</p>
      </section>
      <section>
        <h3>AI 分析</h3>
        <p>在“AI分析”页输入股票代码或名称，选择股票后点击“分析”。系统会结合行情、技术面、东方财富新闻和公告生成一份参考报告，包含评分、操作建议、趋势判断、相关板块、买入区间、止损和止盈目标。相关资讯默认显示新闻，也可以切换查看公告。</p>
      </section>
      <section>
        <h3>自选股管理</h3>
        <p>在“自选股”页可以添加、排序或删除股票，也可以设置成本和持仓。添加、删除和修改成本持仓前都会先确认，避免误操作。</p>
      </section>
      <section>
        <h3>截图识别</h3>
        <p>点击“截图识别”上传持仓截图，系统会生成候选清单。确认后才会导入；已有股票不会重复添加，如果截图里的成本或持仓发生变化，会在确认后更新。</p>
      </section>
      <section>
        <h3>收盘日报</h3>
        <p>点击右上角“收盘日报”可以开启自选股每日总结。系统默认每天 16:30 发送精简版收盘日报，内容包含组合盈亏、涨跌排行、个股摘要、近一周公告和股吧热门帖。填写自己的收件邮箱并保存后，可以先点“发送测试”确认是否能收到。</p>
      </section>
    </div>
  `;
}

function adminUserItem(user) {
  return `
    <article class="admin-user-card ${user.isAdmin ? "admin" : ""} ${user.expired ? "expired" : ""}">
      <div class="admin-user-main">
        <strong>${escapeHtml(user.displayName || user.username)}${user.isAdmin ? " · 管理员" : ""}</strong>
        <span class="expiry-badge ${user.expired ? "expired" : ""}">${accountExpiryText(user)}</span>
        ${user.isAdmin ? `<span class="quota-badge">AI 不限次数</span>` : `<span class="quota-badge">AI ${escapeHtml(user.dsaDailyLimit ?? 3)} 次/天</span>`}
        ${user.isAdmin ? "" : `<span class="quota-badge ${user.isVip ? "" : "muted"}">VIP ${user.isVip ? "已开通" : "未开通"}</span>`}
        ${adminDailyReportBadge(user.dailyReport)}
        <span class="admin-user-meta">${escapeHtml(user.username)} · ID ${user.id} · 最后活跃 ${formatDateTime(user.lastActiveAt) || "暂无"}</span>
      </div>
      ${user.isAdmin ? "" : `
        <form data-account-expiry="${user.id}" data-user-id="${user.id}" class="account-expiry-form">
          <label>
            <span>到期日</span>
            <input name="expiresAt" type="date" value="${dateInputValue(user.expiresAt)}" aria-label="到期日" required />
          </label>
          <label>
            <span>每日 AI</span>
            <input name="dsaDailyLimit" type="number" min="0" step="1" value="${escapeAttr(user.dsaDailyLimit ?? 3)}" aria-label="每日 AI 次数" required />
          </label>
          <label>
            <span>VIP功能</span>
            <input name="isVip" type="checkbox" ${user.isVip ? "checked" : ""} aria-label="VIP功能：国家队和ETF持仓变化" />
          </label>
          <button type="submit">保存</button>
        </form>
      `}
      <form data-reset-password="${user.id}" data-user-id="${user.id}" class="reset-password-form">
        <input name="password" type="password" placeholder="新密码" required />
        <button type="submit">重置</button>
      </form>
    </article>
  `;
}

function adminDailyReportBadge(report) {
  if (!report?.enabled) return `<span class="quota-badge muted">日报未启用</span>`;
  const channels = report.emailEnabled && report.emailConfigured ? "邮箱" : "未配置邮箱";
  const status = report.lastReport?.status ? ` · ${report.lastReport.status}` : "";
  return `<span class="quota-badge">日报 ${escapeHtml(channels)}${escapeHtml(status)}</span>`;
}

function userDisplayLabel(user) {
  if (!user) return "当前用户";
  return user.displayName ? `${user.displayName} / ${user.username}` : user.username;
}

function defaultExpiryDateInput() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function dateInputValue(value) {
  if (!value) return defaultExpiryDateInput();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return defaultExpiryDateInput();
  return date.toISOString().slice(0, 10);
}

function accountExpiryText(user) {
  if (user?.isAdmin) return "长期有效";
  const prefix = user?.expired ? "已到期" : "到期";
  return `${prefix} ${formatDateOnly(user?.expiresAt) || "--"}`;
}

function importPreviewTemplate() {
  if (!state.importPreview) return "";
  const rows = state.importPreview.candidates || [];
  return `
    <div class="detail-backdrop import-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel import-panel">
        <header>
          <div>
            <p class="eyebrow">截图识别确认</p>
            <h2>确认导入自选股</h2>
          </div>
          <button class="icon-button" title="关闭" data-close-import-preview>×</button>
        </header>
        <form id="import-confirm-form" class="import-confirm">
          <div class="import-list">
            ${rows.map(importPreviewRow).join("") || emptyState("没有可导入的候选股票")}
          </div>
          <footer>
            <button class="plain-button" type="button" data-close-import-preview>取消</button>
            <button class="text-button" type="submit" ${!rows.length || state.loading.has("watchImportConfirm") ? "disabled" : ""}>
              ${state.loading.has("watchImportConfirm") ? "导入中..." : "确认导入/更新"}
            </button>
          </footer>
        </form>
      </article>
    </div>
  `;
}

function importPreviewRow(item) {
  const disabled = item.errorMessage ? "disabled" : "";
  const statusText = item.errorMessage
    ? item.errorMessage
    : item.exists
      ? item.holdingChanged
        ? "已存在，确认后更新成本/持仓"
        : "已存在，成本/持仓未发现变化"
      : "新股票，确认后添加";
  const currentText = item.exists
    ? `当前：成本 ${formatInputValue(item.existingCostPrice)} / 持仓 ${formatInputValue(item.existingPosition)}`
    : "";
  const nextText = `识别：成本 ${formatInputValue(item.costPrice)} / 持仓 ${formatInputValue(item.position)}`;
  return `
    <label class="import-row ${item.errorMessage ? "disabled" : ""} ${item.holdingChanged ? "changed" : ""}" data-import-row data-symbol="${escapeAttr(item.symbol)}">
      <input name="enabled" type="checkbox" ${disabled} ${item.errorMessage ? "" : "checked"} />
      <span>
        <strong>${escapeHtml(item.name || item.symbol)}</strong>
        <em>${escapeHtml(item.symbol)} · ${escapeHtml(item.market || inferMarket(item.symbol))} · ${escapeHtml(statusText)}</em>
        ${currentText ? `<small>${escapeHtml(currentText)}</small>` : ""}
        <small>${escapeHtml(nextText)}</small>
      </span>
      <input name="costPrice" inputmode="decimal" placeholder="成本" value="${escapeAttr(item.costPrice ?? "")}" ${disabled} />
      <input name="position" inputmode="numeric" placeholder="持仓" value="${escapeAttr(item.position ?? "")}" ${disabled} />
    </label>
  `;
}

function stockSelector() {
  if (!state.watchlist.length) return `<p class="empty">添加自选股后查看帖子</p>`;
  return `
    <div class="stock-chips">
      ${state.watchlist.map((item) => `<button class="${item.symbol === state.selectedSymbol ? "active" : ""}" data-stock-chip="${escapeHtml(item.symbol)}">${escapeHtml(item.name || item.symbol)}</button>`).join("")}
    </div>
  `;
}

function selectedStock() {
  return state.watchlist.find((item) => item.symbol === state.selectedSymbol) || null;
}

function detailStock() {
  return { ...(state.stockDetail || selectedStock() || {}), ...(state.stockQuote.data || {}) };
}

function stockKlinePanel() {
  const stock = detailStock();
  if (!stock) return "";
  const periods = [
    ["minute", "分时"],
    ["daily", "日K"],
    ["weekly", "周K"],
    ["monthly", "月K"]
  ];
  return `
    <article class="stock-kline">
      <header>
        <div>
          <strong>走势</strong>
          <span>${escapeHtml(state.stockChartPeriod === "minute" ? "分时" : state.stockChartPeriod === "weekly" ? "周K" : state.stockChartPeriod === "monthly" ? "月K" : "日K")}</span>
        </div>
      </header>
      <div class="chart-tabs">
        ${periods.map(([key, label]) => `<button type="button" class="${state.stockChartPeriod === key ? "active" : ""}" data-chart-period="${key}">${label}</button>`).join("")}
      </div>
      ${stockChartView()}
    </article>
  `;
}

function stockChartView() {
  const envelope = state.stockChart || emptyEnvelope(null);
  if (state.loading.has("stockChart") && !envelope.data) return `<div class="chart-empty">图表加载中...</div>`;
  if (envelope.errorMessage) return `<div class="chart-empty">${escapeHtml(envelope.errorMessage)}</div>`;
  const data = envelope.data;
  const rows = data?.rows || [];
  if (!rows.length) return `<div class="chart-empty">暂无图表数据</div>`;
  return stockChartSvg(data);
}

function stockChartSvg(data) {
  const rows = (data.rows || []).slice(-90);
  const width = 760;
  const priceTop = 14;
  const priceHeight = 210;
  const volumeTop = 244;
  const volumeHeight = 76;
  const left = 48;
  const right = 12;
  const bottom = 24;
  const chartWidth = width - left - right;
  const height = volumeTop + volumeHeight + bottom;
  const prices = rows.flatMap((row) => [row.open, row.close, row.high, row.low, row.average]).filter((value) => value != null);
  const minPriceRaw = Math.min(...prices);
  const maxPriceRaw = Math.max(...prices);
  const pricePad = Math.max((maxPriceRaw - minPriceRaw) * 0.08, maxPriceRaw * 0.002, 0.01);
  const minPrice = minPriceRaw - pricePad;
  const maxPrice = maxPriceRaw + pricePad;
  const maxVolume = Math.max(1, ...rows.map((row) => Number(row.volume) || 0));
  const xFor = (index) => left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const yForPrice = (value) => priceTop + ((maxPrice - value) / Math.max(maxPrice - minPrice, 0.01)) * priceHeight;
  const yForVolume = (value) => volumeTop + volumeHeight - ((Number(value) || 0) / maxVolume) * volumeHeight;
  const gridValues = [maxPrice, (maxPrice + minPrice) / 2, minPrice];
  const selectedIndex = Math.max(0, Math.min(rows.length - 1, state.stockChartSelectedIndex == null ? rows.length - 1 : state.stockChartSelectedIndex));
  const selectedRow = rows[selectedIndex] || rows.at(-1);
  const selectedX = xFor(selectedIndex);
  const priceLine = rows.map((row, index) => `${xFor(index).toFixed(1)},${yForPrice(row.close).toFixed(1)}`).join(" ");
  const averageLine = rows.filter((row) => row.average != null).map((row, index) => `${xFor(index).toFixed(1)},${yForPrice(row.average).toFixed(1)}`).join(" ");
  const maLines = data.period === "minute" ? [] : [
    ["ma5", 5, "5日"],
    ["ma10", 10, "10日"],
    ["ma20", 20, "20日"]
  ].map(([cls, size, label]) => ({ cls, label, points: movingAveragePoints(rows, size, xFor, yForPrice) })).filter((item) => item.points);
  const labelIndexes = chartLabelIndexes(rows.length);
  const candles = data.period === "minute"
    ? `<polyline class="chart-line" points="${priceLine}" />${averageLine ? `<polyline class="chart-average" points="${averageLine}" />` : ""}`
    : `${rows.map((row, index) => candleSvg(row, index, rows, xFor, yForPrice)).join("")}${maLines.map((line) => `<polyline class="chart-ma ${line.cls}" points="${line.points}" />`).join("")}`;
  const volumes = rows.map((row, index) => volumeBarSvg(row, index, rows, xFor, yForVolume, volumeTop, volumeHeight)).join("");
  return `
    ${chartReadout(data, selectedRow, rows[selectedIndex - 1])}
    <svg class="stock-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(data.name || data.symbol)} 图表" data-chart-interactive data-chart-left="${left}" data-chart-right="${right}" data-chart-width="${width}" data-chart-rows="${rows.length}">
      <rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" />
      ${data.period === "minute" ? "" : `<text class="chart-legend ma5" x="${width - 166}" y="18">MA5</text><text class="chart-legend ma10" x="${width - 114}" y="18">MA10</text><text class="chart-legend ma20" x="${width - 56}" y="18">MA20</text>`}
      ${gridValues.map((value) => {
        const y = yForPrice(value);
        return `<line class="chart-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" /><text class="chart-axis" x="8" y="${(y + 4).toFixed(1)}">${formatChartPrice(value)}</text>`;
      }).join("")}
      <line class="chart-grid" x1="${left}" y1="${volumeTop}" x2="${width - right}" y2="${volumeTop}" />
      <line class="chart-grid" x1="${left}" y1="${volumeTop + volumeHeight}" x2="${width - right}" y2="${volumeTop + volumeHeight}" />
      <line class="chart-crosshair" x1="${selectedX.toFixed(1)}" y1="${priceTop}" x2="${selectedX.toFixed(1)}" y2="${volumeTop + volumeHeight}" />
      <text class="chart-axis" x="8" y="${volumeTop + 12}">${formatCompactVolume(maxVolume)}</text>
      ${labelIndexes.map((index) => `<text class="chart-x-label" x="${xFor(index).toFixed(1)}" y="${height - 4}">${escapeHtml(chartTimeLabel(rows[index]?.time, data.period))}</text>`).join("")}
      ${candles}
      ${volumes}
    </svg>
  `;
}

function chartReadout(data, row, previousRow) {
  if (!row) return "";
  const isMinute = data.period === "minute";
  const open = numberOrNull(row.open);
  const close = numberOrNull(row.close);
  const high = numberOrNull(row.high);
  const low = numberOrNull(row.low);
  const previousClose = numberOrNull(previousRow?.close ?? data.preClose ?? open);
  const change = close != null && previousClose != null ? close - previousClose : null;
  const changePercent = change != null && previousClose ? (change / previousClose) * 100 : null;
  const amplitude = high != null && low != null && previousClose ? ((high - low) / previousClose) * 100 : null;
  if (isMinute) {
    return `
      <div class="chart-readout">
        ${readoutItem("时间", chartTimeLabel(row.time, data.period), "flat")}
        ${readoutItem("价格", formatNumber(close), trendClass(change))}
        ${readoutItem("均价", formatNumber(row.average), "flat")}
        ${readoutItem("涨跌", formatSignedNumber(change), trendClass(change))}
        ${readoutItem("涨幅", formatPercent(changePercent), trendClass(change))}
        ${readoutItem("成交", formatCompactVolume(row.volume), "flat")}
      </div>
    `;
  }
  return `
    <div class="chart-readout">
      ${readoutItem("开", formatNumber(open), trendClass(open != null && previousClose != null ? open - previousClose : null))}
      ${readoutItem("收", formatNumber(close), trendClass(change))}
      ${readoutItem("高", formatNumber(high), trendClass(high != null && previousClose != null ? high - previousClose : null))}
      ${readoutItem("低", formatNumber(low), trendClass(low != null && previousClose != null ? low - previousClose : null))}
      ${readoutItem("涨幅", formatPercent(changePercent), trendClass(change))}
      ${readoutItem("涨跌", formatSignedNumber(change), trendClass(change))}
      ${readoutItem("成交", formatCompactVolume(row.volume), "flat")}
      ${readoutItem("振幅", formatPercent(amplitude), "flat")}
    </div>
  `;
}

function readoutItem(label, value, cls = "flat") {
  return `<span><i>${escapeHtml(label)}</i><b class="${cls}">${escapeHtml(value == null || value === "" ? "--" : value)}</b></span>`;
}

function trendClass(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "flat";
  return num > 0 ? "up-text" : "down-text";
}

function formatSignedNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return "--";
  const num = Number(value);
  const sign = num > 0 ? "+" : "";
  return `${sign}${formatNumber(num)}`;
}

function movingAveragePoints(rows, size, xFor, yForPrice) {
  const points = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (index + 1 < size) continue;
    const windowRows = rows.slice(index + 1 - size, index + 1);
    const values = windowRows.map((row) => Number(row.close)).filter(Number.isFinite);
    if (values.length !== size) continue;
    const average = values.reduce((sum, value) => sum + value, 0) / size;
    points.push(`${xFor(index).toFixed(1)},${yForPrice(average).toFixed(1)}`);
  }
  return points.length > 1 ? points.join(" ") : "";
}

function stockFundFlowPanel() {
  const envelope = state.stockFunds || emptyEnvelope(null);
  const data = envelope.data;
  const items = data?.items || [];
  return `
    <section class="stock-funds">
      <header>
        <div>
          <h3>资金流向</h3>
          <p>${envelope.updatedAt ? `更新 ${formatTime(envelope.updatedAt)}` : "正在读取"}${envelope.stale ? " · 数据可能延迟" : ""}</p>
        </div>
        ${state.loading.has("stockFunds") ? `<span class="loading">刷新中</span>` : ""}
      </header>
      ${envelope.errorMessage ? `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>` : ""}
      <div class="fund-flow-grid">
        ${items.map(fundFlowItem).join("") || emptyState("暂未取得资金流数据")}
      </div>
    </section>
  `;
}

function stockAnnouncementsPanel() {
  const announcementEnvelope = state.stockAnnouncements || emptyEnvelope([]);
  const newsEnvelope = state.stockDetailNews || emptyEnvelope([]);
  const announcementRows = announcementEnvelope.data || [];
  const newsRows = newsEnvelope.data || [];
  const activeFilter = state.stockDetailInfoFilter === "news" ? "news" : "announcement";
  const isNews = activeFilter === "news";
  const rows = isNews ? newsRows : announcementRows;
  if (!announcementRows.length && !newsRows.length && !announcementEnvelope.errorMessage && !newsEnvelope.errorMessage) return "";
  return `
    <section class="stock-detail-announcements">
      <header>
        <div>
          <h3>个股资讯</h3>
          <p>${isNews ? "东方财富新闻" : "东方财富公告"}</p>
        </div>
        <p class="stock-detail-info-switch">
          <button type="button" class="${activeFilter === "announcement" ? "active" : ""}" data-stock-detail-info-filter="announcement">${announcementRows.length} 条公告</button>
          <button type="button" class="${activeFilter === "news" ? "active" : ""}" data-stock-detail-info-filter="news">${newsRows.length} 条新闻</button>
        </p>
      </header>
      ${state.loading.has("stockAnnouncements") || state.loading.has("stockDetailNews") ? `<p class="muted-line">资讯刷新中...</p>` : ""}
      ${announcementEnvelope.errorMessage && !isNews ? `<p class="warning">${escapeHtml(announcementEnvelope.errorMessage)}</p>` : ""}
      ${newsEnvelope.errorMessage && isNews ? `<p class="warning">${escapeHtml(newsEnvelope.errorMessage)}</p>` : ""}
      <ol class="announcement-list">
        ${isNews ? rows.map(stockDetailNewsItem).join("") : rows.map(announcementItem).join("")}
        ${rows.length ? "" : emptyState(isNews ? "暂无东方财富新闻" : "暂无东方财富公告")}
      </ol>
    </section>
  `;
}

function stockDetailNewsItem(item, index) {
  return `
    <li>
      <button type="button" data-stock-detail-news-index="${index}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.source || "东方财富资讯")} ${formatDateTime(item.time) || item.dateText || ""}</span>
      </button>
    </li>
  `;
}

function announcementItem(item, index) {
  return `
    <li>
      <button type="button" data-announcement-index="${index}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.dateText || item.time || "")}${item.category ? ` · ${escapeHtml(item.category)}` : ""}</span>
      </button>
    </li>
  `;
}

function fundFlowItem(item) {
  const trend = item.amount == null ? "flat" : item.amount >= 0 ? "up-text" : "down-text";
  const emptyOptional = item.optional && (item.amount == null || Number(item.amount) === 0);
  const ratioText = !emptyOptional && item.ratio != null ? formatPercent(item.ratio) : "";
  return `
    <article>
      <span>${escapeHtml(item.label)}</span>
      <strong class="${trend}">${emptyOptional ? "暂无" : formatSignedChineseAmount(item.amount)}</strong>
      ${ratioText ? `<small>${ratioText}</small>` : ""}
    </article>
  `;
}

function candleSvg(row, index, rows, xFor, yForPrice) {
  const x = xFor(index);
  const step = rows.length <= 1 ? 8 : Math.max(3, xFor(Math.min(index + 1, rows.length - 1)) - x);
  const bodyWidth = Math.max(3, Math.min(8, step * 0.58));
  const open = Number(row.open);
  const close = Number(row.close);
  const high = Number(row.high);
  const low = Number(row.low);
  const up = close >= open;
  const yOpen = yForPrice(open);
  const yClose = yForPrice(close);
  const yHigh = yForPrice(high);
  const yLow = yForPrice(low);
  const y = Math.min(yOpen, yClose);
  const h = Math.max(1, Math.abs(yOpen - yClose));
  const cls = up ? "up" : "down";
  return `
    <line class="chart-candle-wick ${cls}" x1="${x.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yLow.toFixed(1)}" />
    <rect class="chart-candle ${cls}" x="${(x - bodyWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bodyWidth.toFixed(1)}" height="${h.toFixed(1)}" />
  `;
}

function volumeBarSvg(row, index, rows, xFor, yForVolume, volumeTop, volumeHeight) {
  const x = xFor(index);
  const step = rows.length <= 1 ? 8 : Math.max(3, xFor(Math.min(index + 1, rows.length - 1)) - x);
  const barWidth = Math.max(2, Math.min(7, step * 0.52));
  const y = yForVolume(row.volume);
  const h = Math.max(1, volumeTop + volumeHeight - y);
  const up = Number(row.close) >= Number(row.open ?? row.close);
  return `<rect class="chart-volume ${up ? "up" : "down"}" x="${(x - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" />`;
}

function chartLabelIndexes(length) {
  if (length <= 1) return [0];
  return uniqueNumbers([0, Math.floor((length - 1) / 3), Math.floor((length - 1) * 2 / 3), length - 1]);
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 0))];
}

function chartTimeLabel(value, period) {
  const textValue = String(value || "");
  if (period === "minute") return textValue.slice(11, 16);
  if (period === "monthly") return textValue.slice(0, 7);
  return textValue.slice(5);
}

function formatChartPrice(value) {
  if (value == null || !Number.isFinite(Number(value))) return "--";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: Number(value) > 100 ? 1 : 2 });
}

function formatCompactVolume(value) {
  if (value == null) return "--";
  const number = Number(value);
  if (Math.abs(number) >= 1e8) return `${(number / 1e8).toFixed(1)}亿`;
  if (Math.abs(number) >= 1e4) return `${(number / 1e4).toFixed(0)}万`;
  return number.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function sectorDetailTemplate() {
  if (!state.sectorDetail) return "";
  const sector = state.sectorDetail.sector || {};
  const envelope = state.sectorDetail.stocks || emptyEnvelope([]);
  return `
    <div class="detail-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel sector-detail-panel">
        <header>
          <div>
            <p class="eyebrow">概念板块</p>
            <h2>${escapeHtml(sector.name || sector.code || "相关股票")}</h2>
            <p>${state.sectorDetail.loading ? "正在读取" : envelope.updatedAt ? `更新 ${formatTime(envelope.updatedAt)}` : "相关股票"}</p>
          </div>
          <button class="icon-button" title="关闭" data-close-sector-detail>×</button>
        </header>
        <div class="sector-stock-content">
          ${envelope.errorMessage ? `<p class="warning">${escapeHtml(envelope.errorMessage)}</p>` : ""}
          ${state.sectorDetail.loading ? `<p class="empty">正在读取相关股票...</p>` : `
            <ol class="sector-stock-list">
              ${(envelope.data || []).map(sectorStockItem).join("") || emptyState("暂无相关股票")}
            </ol>
          `}
        </div>
      </article>
    </div>
  `;
}

function sectorStockItem(item) {
  const trend = item.changePercent == null ? "flat" : item.changePercent >= 0 ? "up-text" : "down-text";
  return `
    <li>
      <span>${item.rank}</span>
      <button type="button" data-sector-stock-open="${escapeAttr(item.symbol)}">
        <strong>${escapeHtml(item.name)}</strong>
        <em>${escapeHtml(item.symbol)} · ${escapeHtml(item.market || inferMarket(item.symbol))}</em>
      </button>
      <span>
        <strong>${formatNumber(item.price)}</strong>
        <b class="${trend}">${formatPercent(item.changePercent)}</b>
      </span>
    </li>
  `;
}

function eastmoneySecid(stock) {
  if (!stock || !/^\d{6}$/.test(stock.symbol)) return "";
  const market = stock.market || inferMarket(stock.symbol);
  if (market === "SH") return `1.${stock.symbol}`;
  if (market === "SZ") return `0.${stock.symbol}`;
  return "";
}

function postColumn(title, envelope, source) {
  return `
    <div class="post-column">
      <h3>${title}</h3>
      <ol class="post-list">${envelope.data.map((item, index) => postItem(item, source, index)).join("") || emptyState("暂无帖子")}</ol>
    </div>
  `;
}

function postItem(item, source, index) {
  const metrics = [
    item.author ? `作者 ${item.author}` : "",
    item.readCount ? `阅读 ${item.readCount}` : "",
    item.replyCount ? `评论 ${item.replyCount}` : "",
    item.updatedAtText || item.time ? `更新 ${item.updatedAtText || item.time}` : ""
  ].filter(Boolean);
  return `
    <li>
      <button class="post-button" data-post-source="${source}" data-post-index="${index}" data-post-anchor="${source}-${index}">
        <span>${escapeHtml(item.title)}</span>
        ${metrics.length ? `<small>${metrics.map(escapeHtml).join(" · ")}</small>` : ""}
      </button>
    </li>
  `;
}

function stockDetailTemplate() {
  if (!state.stockDetail) return "";
  const stock = detailStock();
  return `
    <div class="stock-detail-backdrop" role="dialog" aria-modal="true">
      <article class="stock-detail-panel">
        <header>
          <div>
            <p class="eyebrow">个股信息</p>
            ${stockDetailTitle(stock)}
            ${stockDetailSummary(stock)}
          </div>
          <button class="icon-button" title="关闭" data-close-stock-detail>×</button>
        </header>
        <div class="stock-detail-content">
          ${stockSelector()}
          ${stockKlinePanel()}
          ${stockFundFlowPanel()}
          ${stockAnnouncementsPanel()}
          <section class="stock-detail-posts">
            <h3>股吧热门贴</h3>
            <p>${state.posts.guba.updatedAt ? `更新 ${formatTime(state.posts.guba.updatedAt)}` : "正在读取"}</p>
            ${state.loading.has("posts") ? `<p class="muted-line">帖子刷新中...</p>` : ""}
            <ol class="post-list">${state.posts.guba.data.map((item, index) => postItem(item, "guba", index)).join("") || emptyState("暂无帖子")}</ol>
          </section>
        </div>
      </article>
    </div>
  `;
}

function stockDetailTitle(stock) {
  if (!stock) return `<h2>个股详情</h2>`;
  const trend = stock.change == null ? "flat" : stock.change >= 0 ? "up-text" : "down-text";
  return `
    <h2 class="stock-detail-title">
      <span>${escapeHtml(stock.name || stock.symbol)} · ${escapeHtml(stock.symbol || "")}</span>
      <b class="${trend}">${formatNumber(stock.price)}</b>
      <em class="${trend}">${formatSigned(stock.change)} / ${formatPercent(stock.changePercent)}</em>
    </h2>
  `;
}

function stockDetailSummary(stock) {
  if (!stock) return "";
  const tags = (stock.tags || []).slice(0, 4);
  const marginText = stock.marginTradingEligible === true ? "支持两融" : "";
  if (!tags.length && !marginText) return "";
  return `
    <div class="stock-detail-summary">
      ${tags.length ? `<span>板块 ${tags.map(escapeHtml).join(" / ")}</span>` : ""}
      ${marginText ? `<span>${escapeHtml(marginText)}</span>` : ""}
    </div>
  `;
}

function stockDetailQuoteGrid(stock) {
  if (!stock) return "";
  return `
    <section class="stock-detail-quote">
      ${stockMetric("今开", formatNumber(stock.open))}
      ${stockMetric("最高", formatNumber(stock.high), stock.high != null && stock.previousClose != null ? trendClass(stock.high - stock.previousClose) : "")}
      ${stockMetric("最低", formatNumber(stock.low), stock.low != null && stock.previousClose != null ? trendClass(stock.low - stock.previousClose) : "")}
      ${stockMetric("成交额", formatChineseAmount(stock.amount))}
      ${stockMetric("换手率", formatPercent(stock.turnoverRate))}
      ${stockMetric("总市值", formatChineseAmount(stock.totalMarketValue))}
      ${stockMetric("流通市值", formatChineseAmount(stock.circulatingMarketValue))}
      ${stockMetric("市盈率(动)", formatNumber(stock.peDynamic))}
    </section>
  `;
}

function stockMetric(label, value, className = "", primary = false) {
  return `
    <span class="stock-metric ${primary ? "primary" : ""}">
      <small>${escapeHtml(label)}</small>
      <strong class="${escapeAttr(className)}">${escapeHtml(value)}</strong>
    </span>
  `;
}

function inferMarket(symbol) {
  return /^\d{6}$/.test(String(symbol || "")) && String(symbol).startsWith("6") ? "SH" : "SZ";
}

function detailTemplate() {
  if (!state.detail) return "";
  return `
    <div class="detail-backdrop article-detail-backdrop" role="dialog" aria-modal="true">
      <article class="detail-panel">
        <header>
          <div>
            <p class="eyebrow">${escapeHtml(state.detail.source || "本地详情")}</p>
            <h2>${escapeHtml(state.detail.title || "详情")}</h2>
          </div>
          <button class="icon-button" title="关闭" data-close-detail>×</button>
        </header>
        <div class="detail-content">
          ${state.detail.loading ? "<p>正文加载中...</p>" : detailContentHtml(state.detail)}
        </div>
      </article>
    </div>
  `;
}

function detailContentHtml(detail) {
  const blocks = detail?.blocks || [];
  if (blocks.length) {
    return blocks.map(detailBlockHtml).join("");
  }
  return String(detail?.content || "暂无正文")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const escaped = escapeHtml(block).replace(/\n/g, "<br />");
      return /^来源：|^时间：|^现价：|^涨跌幅：|^热门标签：/.test(block)
        ? `<p class="detail-meta">${escaped}</p>`
        : `<p>${escaped}</p>`;
    })
    .join("");
}

function detailBlockHtml(block) {
  if (block.type === "image" && block.src) {
    const alt = escapeHtml(block.alt || "");
    const src = escapeHtml(block.src);
    return `<figure class="detail-image"><img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" />${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`;
  }
  if (block.type === "reply") {
    const author = escapeHtml(block.author || "股友");
    const time = block.time ? `<time>${escapeHtml(block.time)}</time>` : "";
    const text = escapeHtml(String(block.text || "")).replace(/\n/g, "<br />");
    const images = Array.isArray(block.images)
      ? block.images.map((src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`).join("")
      : "";
    return `<article class="detail-reply"><header><strong>${author}</strong>${time}</header>${text ? `<p>${text}</p>` : ""}${images ? `<div class="detail-reply-images">${images}</div>` : ""}</article>`;
  }
  const text = String(block.text || "").trim();
  if (!text) return "";
  if (block.type === "reply-heading") {
    return `<h3 class="detail-reply-heading">${escapeHtml(text)}</h3>`;
  }
  const pdfMatch = text.match(/^原文PDF：(.+)$/);
  if (pdfMatch) {
    const href = escapeAttr(pdfMatch[1]);
    return `<p class="detail-meta"><a href="${href}" target="_blank" rel="noreferrer">打开公告 PDF 原文</a></p>`;
  }
  const linkMatch = text.match(/^原文链接：(.+)$/);
  if (linkMatch) {
    const href = escapeAttr(linkMatch[1]);
    return `<p class="detail-meta"><a href="${href}" target="_blank" rel="noreferrer">打开公告原文</a></p>`;
  }
  if (block.type === "announcement-section") {
    return `<p class="detail-announcement-section">${escapeHtml(text)}</p>`;
  }
  if (block.type === "announcement-important") {
    return `<p class="detail-announcement-important">${escapeHtml(text)}</p>`;
  }
  if (block.type === "announcement-table") {
    return `<pre class="detail-announcement-table">${escapeHtml(text)}</pre>`;
  }
  if (block.type === "announcement-paragraph") {
    return `<p class="detail-announcement-paragraph">${escapeHtml(text)}</p>`;
  }
  const escaped = escapeHtml(text).replace(/\n/g, "<br />");
  return block.type === "meta" || /^来源：|^时间：|^现价：|^涨跌幅：|^热门标签：/.test(text)
    ? `<p class="detail-meta">${escaped}</p>`
    : `<p>${escaped}</p>`;
}

function emptyState(text) {
  return `<p class="empty">${text}</p>`;
}

function mobileVisible(tab) {
  return effectiveActiveTab() === tab ? "mobile-visible" : "";
}

function formatNumber(value) {
  if (value == null) return "--";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: value > 100 ? 2 : 4 });
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function lastNonNullNumber(values) {
  for (let index = (values || []).length - 1; index >= 0; index -= 1) {
    const value = numberOrNull(values[index]);
    if (value != null) return value;
  }
  return null;
}

function formatSigned(value) {
  if (value == null) return "--";
  const sign = value > 0 ? "+" : "";
  const digits = Math.abs(Number(value)) < 1 ? 4 : 2;
  return `${sign}${Number(value).toFixed(digits)}`;
}

function formatMoney(value) {
  if (value == null) return "--";
  return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedMoney(value) {
  if (value == null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function formatInputValue(value) {
  return value == null || value === "" ? "-" : formatNumber(value);
}

function formatPercent(value) {
  if (value == null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatCount(value) {
  if (value == null) return "--";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatChineseAmount(value) {
  if (value == null) return "--";
  const number = Number(value);
  const abs = Math.abs(number);
  if (abs >= 1e12) return `${(number / 1e12).toFixed(1)} 万亿`;
  if (abs >= 1e8) return `${(number / 1e8).toFixed(1)} 亿`;
  if (abs >= 1e4) return `${(number / 1e4).toFixed(1)} 万`;
  return number.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatSignedChineseAmount(value) {
  if (value == null) return "--";
  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${formatChineseAmount(value)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

async function initializeApp() {
  render();
  await loadDevConfig();
  const hasSession = await loadMe();
  state.authChecking = false;
  state.authed = hasSession;
  if (!hasSession) {
    render();
    return;
  }
  startBootscreen();
  render();
  try {
    await refreshAll({ priorityMarket: true, skipMe: true });
  } finally {
    state.booting = false;
    render();
    warmSectorsAfterBoot();
  }
}

checkAppVersion(true);
registerServiceWorker();
window.addEventListener("resize", syncSectorFlowPickerHeight, { passive: true });
window.addEventListener("popstate", () => {
  render();
  if (isBigScreenRoute()) ensureSectorFlowLoaded({ silent: true });
});
initializeApp().catch(() => {
  state.authChecking = false;
  state.authed = false;
  render();
});

setInterval(() => {
  checkAppVersion(false);
}, 60_000);

setInterval(() => {
  runAutoRefresh(() => loadEnvelopeWithOptions("market", "/api/market/overview", { silent: true }));
}, 15_000);

setInterval(() => {
  runAutoRefresh(() => loadEnvelopeWithOptions("aShareAnalysis", "/api/market/a-share-analysis", { silent: true }));
}, 30_000);

setInterval(() => {
  runAutoRefresh(() => loadWatchlist({ silent: true, skipPosts: true }));
}, 15_000);

setInterval(() => {
  runAutoRefresh(() => loadEnvelopeWithOptions("jin10", "/api/news/jin10?limit=10", { silent: true }));
}, 60_000);

setInterval(() => {
  runAutoRefresh(() => loadEnvelopeWithOptions("eastmoneyNews", "/api/news/eastmoney-hot?limit=10", { silent: true }));
}, 120_000);

setInterval(() => {
  runAutoRefresh(() => {
    loadEnvelopeWithOptions("mainlines", "/api/mainlines?limit=30", { silent: true });
    loadEnvelopeWithOptions("hotStocks", "/api/hot-stocks?limit=10", { silent: true });
  });
}, 180_000);

setInterval(() => {
  if (!state.authed || (!isBigScreenRoute() && state.activeTab !== "板块") || state.sectorFlowPlaying) return;
  loadSectorFlow({ silent: true });
}, 60_000);

setInterval(() => {
  if (!state.authed || (!isBigScreenRoute() && state.activeTab !== "板块")) return;
  loadSectorRanking({ silent: true });
}, 600_000);

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}
