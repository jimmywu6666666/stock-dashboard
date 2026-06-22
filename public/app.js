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
  sectorRankingDates: emptyEnvelope({ dates: [] }),
  sectorRanking: emptyEnvelope(null),
  sectorRankingDate: "latest",
  sectorRankingSort: { key: "source_rank", direction: "asc" },
  watchlist: [],
  adminUsers: emptyEnvelope([]),
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
  lockedWatchPanelScrollTop: null,
  lockedPageScrollTop: null,
  lastUserScrollAt: 0,
  stockDetailPostAnchor: null,
  importPreview: null,
  openHoldingId: null,
  showWatchAdd: false,
  changePasswordOpen: false,
  installGuideOpen: false,
  newAccountInfo: null,
  authMode: "login",
  allowSignup: false,
  signupCodeRequired: false,
  defaultUsername: "",
  defaultPassword: "",
  loading: new Set(),
  booting: false,
  bootTasks: {},
  appVersion: "",
  latestAppVersion: "",
  updateAvailable: false,
  message: ""
};

const baseTabs = ["行情", "AI分析", "资讯", "热度", "板块", "自选股", "使用手册"];
const bootTaskDefinitions = [
  ["market", "核心行情"],
  ["aShareAnalysis", "A 股大盘"],
  ["jin10", "金十资讯"],
  ["eastmoneyNews", "东财资讯"],
  ["hotTopics", "热股/主线"],
  ["sectors", "概念板块"],
  ["watchlist", "自选股"],
  ["posts", "股吧帖子"],
  ["reportSettings", "收盘日报"],
  ["adminUsers", "管理员数据"],
  ["dsaHistory", "AI 分析历史"]
];
const app = document.querySelector("#app");
let stockSearchTimer = null;
let stockSearchComposing = false;
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
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    state.authed = false;
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
  state.bootTasks = Object.fromEntries(bootTaskDefinitions.map(([key]) => [key, { status: "pending", message: "" }]));
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
    sectors: () => hasError(state.sectorRankingDates) || hasError(state.sectorRanking),
    watchlist: () => Boolean(state.message),
    posts: () => hasError(state.posts.guba),
    reportSettings: () => hasError(state.reportSettings),
    adminUsers: () => state.user?.isAdmin && hasError(state.adminUsers),
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
    startBootscreen();
    state.message = "";
    render();
    try {
      await refreshAll({ priorityMarket: true });
    } finally {
      state.booting = false;
      render();
      ensureSectorFlowLoaded({ silent: true });
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
    startBootscreen();
    state.message = "";
    render();
    try {
      await refreshAll({ priorityMarket: true });
    } finally {
      state.booting = false;
      render();
      ensureSectorFlowLoaded({ silent: true });
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
  state.user = null;
  state.booting = false;
  state.bootTasks = {};
  render();
}

async function loadEnvelope(key, path) {
  return loadEnvelopeWithOptions(key, path);
}

async function loadEnvelopeWithOptions(key, path, options = {}) {
  if (!options.silent) setLoading(key, true);
  try {
    state[key] = await api(path);
  } catch (error) {
    state[key] = { ...state[key], stale: true, errorMessage: `${error.message}：${path}` };
    if (options.retryOnce) {
      setTimeout(() => {
        if (!state.authed || state[key]?.data?.length) return;
        loadEnvelopeWithOptions(key, path, { ...options, retryOnce: false, silent: true });
      }, options.retryDelay || 1200);
    }
  } finally {
    if (!options.silent) setLoading(key, false);
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
  } catch {
    state.user = null;
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
    loadEnvelopeWithOptions("sectorFlowDates", "/api/sectors/flow/dates", options),
    loadEnvelopeWithOptions("sectorRankingDates", "/api/sectors/ranking/dates", options)
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
  await loadEnvelopeWithOptions("sectorFlow", `/api/sectors/flow/series?date=${encodeURIComponent(date)}`, options);
  seedSectorFlowSelection();
  const data = state.sectorFlow.data;
  if (data?.last_session_min != null && state.sectorFlowCursor == null) {
    state.sectorFlowCursor = data.last_session_min;
  }
}

async function loadSectorRanking(options = {}) {
  const date = state.sectorRankingDate || "latest";
  await loadEnvelopeWithOptions("sectorRanking", `/api/sectors/ranking?date=${encodeURIComponent(date)}`, options);
}

async function loadSectors(options = {}) {
  await Promise.all([
    loadSectorDates(options),
    loadSectorFlowPreference(options)
  ]);
  await Promise.all([
    loadSectorFlow(options),
    loadSectorRanking(options)
  ]);
}

async function loadSectorFlowPreference(options = {}) {
  if (!options.silent) setLoading("sectorFlowPreference", true);
  try {
    state.sectorFlowPreference = await api(preferencePath());
  } catch (error) {
    state.sectorFlowPreference = { ...state.sectorFlowPreference, stale: true, errorMessage: error.message };
  } finally {
    if (!options.silent) setLoading("sectorFlowPreference", false);
    else renderAfterAutoRefresh();
  }
}

async function loadSectorRankingOnly(options = {}) {
  await loadEnvelopeWithOptions("sectorRankingDates", "/api/sectors/ranking/dates", options);
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
  await loadMe();
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
    loadSectors(),
    loadWatchlist(),
    loadReportSettings(),
    loadAdminUsers(),
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
    runBootTask("sectors", () => loadSectors({ silent: true })),
    runBootTask("posts", () => state.selectedSymbol ? loadPosts(state.selectedSymbol) : Promise.resolve()),
    runBootTask("reportSettings", () => loadReportSettings()),
    runBootTask("adminUsers", () => loadAdminUsers()),
    runBootTask("dsaHistory", () => state.dsaConfig.data?.configured ? loadDsaHistory({ silent: true }) : Promise.resolve())
  ]);
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
  rememberPageScroll();
  app.innerHTML = state.authed ? (state.booting ? bootTemplate() : dashboardTemplate()) : loginTemplate();
  bindEvents();
  restoreFocusedSearchInput(focusedInput);
  restoreWatchPanelScroll();
  restoreDsaHistoryScroll();
  restoreStockDetailScroll();
  restorePageScroll();
  syncSectorFlowPickerHeight();
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
  const tasks = bootTaskDefinitions.map(([key, label]) => ({ key, label, ...(state.bootTasks[key] || { status: "pending", message: "" }) }));
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
  document.querySelectorAll("[data-refresh]").forEach((el) => el.addEventListener("click", refreshAll));
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
  if (state.activeTab === "板块") stopSectorReplay();
  state.activeTab = tab;
  state.lockedPageScrollTop = 0;
  state.pageScrollTop = 0;
  state.watchPanelScrollTop = 0;
  state.lockedWatchPanelScrollTop = null;
  state.lastUserScrollAt = Date.now();
  render();
  if (tab === "板块" && (!state.sectorFlow.data || !state.sectorRanking.data) && !state.loading.has("sectorFlow") && !state.loading.has("sectorRanking")) loadSectors();
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
  const tabs = state.user?.isAdmin ? [...baseTabs, "管理"] : baseTabs;
  return `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Asia/Shanghai</p>
          <h1>股市信息综合看板</h1>
        </div>
        <div class="top-actions">
          ${adminViewSwitcherTemplate()}
          <button class="plain-button compact-button" type="button" data-open-install-guide>快捷入口</button>
          <button class="plain-button compact-button" type="button" data-open-report-settings>收盘日报</button>
          <button class="plain-button compact-button" type="button" data-open-change-password>改密码</button>
          <button class="icon-button" title="刷新" data-refresh>⟳</button>
          <button class="text-button" data-logout>退出</button>
        </div>
      </header>

      ${appUpdateTemplate()}

      <nav class="mobile-tabs">
        ${tabs.map((tab) => `<button class="${state.activeTab === tab ? "active" : ""}" data-tab="${tab}">${tab}</button>`).join("")}
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
  if (!state.sectorRanking.data || (state.loading.has("sectorRanking") && !rows.length)) return `<div class="card-loading">加载中...</div>`;
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
  if (!state.sectorFlow.data || (state.loading.has("sectorFlow") && !rows.length)) return `<div class="card-loading">加载中...</div>`;
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
  picker.style.height = "";
  if (window.matchMedia("(max-width: 760px)").matches) return;
  requestAnimationFrame(() => {
    const height = Math.round(chartPanel.getBoundingClientRect().height);
    if (height > 0) picker.style.height = `${height}px`;
  });
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
              <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.code)}</small></td>
              ${columns.map((column) => sectorRankingCell(row[column.key], column)).join("")}
              <td>${sectorSparkline(row.trend_30d, row.pct_1d)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function sectorRankingCell(value, column) {
  const num = numberOrNull(value);
  const cls = trendClass(num);
  const intensity = column.plain || num == null ? 0 : Math.min(0.78, 0.08 + Math.abs(num) / 120);
  const bg = num == null || column.plain ? "" : ` style="--heat:${intensity.toFixed(2)}"`;
  const text = column.plain ? formatFixed(num, 2) : formatPercent(num);
  return `<td class="sector-heat ${cls}"${bg}>${escapeHtml(text)}</td>`;
}

function sectorSparkline(values) {
  const rows = (values || []).map(Number).filter(Number.isFinite);
  if (rows.length < 2) return "";
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
    <div class="admin-user-list">
      ${users.map(adminUserItem).join("") || emptyState("暂无用户")}
    </div>
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
  return state.activeTab === tab ? "mobile-visible" : "";
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

render();
loadDevConfig().finally(() => {
  if (!state.authed) render();
});
checkAppVersion(true);
registerServiceWorker();
window.addEventListener("resize", syncSectorFlowPickerHeight, { passive: true });
api("/api/market/overview").then((result) => {
  state.market = result;
  state.authed = true;
  startBootscreen();
  render();
  refreshAll().finally(() => {
    state.booting = false;
    render();
    ensureSectorFlowLoaded({ silent: true });
  });
}).catch(() => render());

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
  if (!state.authed || state.activeTab !== "板块" || state.sectorFlowPlaying) return;
  loadSectorFlow({ silent: true });
}, 60_000);

setInterval(() => {
  if (!state.authed || state.activeTab !== "板块") return;
  loadSectorRanking({ silent: true });
}, 600_000);

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}
