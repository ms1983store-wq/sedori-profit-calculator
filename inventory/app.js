const storageKey = "sedori-inventory-ledger:v1";
const goalStorageKey = "sedori-inventory-ledger:monthly-goals/v1";
const defaultInventoryLoadedKey = "sedori-inventory-ledger:default-inventory-version";
const cloudPendingSyncKey = "sedori-inventory-ledger:cloud-pending/v1";
const cloudPendingDeletedKey = "sedori-inventory-ledger:cloud-deleted/v1";
const goalCloudPendingSyncKey = "sedori-inventory-ledger:goal-cloud-pending/v1";
const calculatorReturnStorageKey = "sedori-inventory-ledger:calculator-return/v1";
const defaultInventoryVersion = "management-csv-20260708-v1";
const defaultFeeRate = 10;
const feeRateOptions = [10, 5];
const soldStatuses = new Set(["売却済み", "発送準備", "評価待ち"]);
const statusOptions = ["出品前", "検品済み", "写真待ち", "出品中", "売却済み", "発送準備", "評価待ち"];
const storageLocationOptions = ["自宅", "オークレボ"];
const marketOptions = ["メルカリ", "ラクマ", "Yahoo!フリマ", "ヤフオク", "Amazon", "その他"];
const tanomeruShippingMethod = "tanomeru";
const cloudApiUrl = "./api/inventory";
const goalCloudApiUrl = "./api/goals";
const photoApiUrl = "./api/photo";
const maxPhotoUploadBytes = 1_400_000;
const cloudSyncIntervalMs = 15000;
const canonicalCloudInventoryUrl = "https://sedori-profit-calculator.pages.dev/inventory/";
const cloudCalculatorUrl = "https://sedori-profit-calculator.pages.dev/inventory/calculator/";
const isCloudSyncHost =
  window.location.hostname === "sedori-profit-calculator.pages.dev" ||
  window.location.hostname.endsWith(".sedori-profit-calculator.pages.dev");
const isLocalDevHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
const defaultMonthlyGoals = Object.freeze({ sales: 600000, profit: 150000, soldCount: 40, margin: 20 });

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("ja-JP");
const percentFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const state = {
  items: [],
  goals: {},
  filterStatus: "all",
  filterLocation: "all",
  search: "",
  activeView: "top",
  selectedMonth: currentMonth(),
  goalMonth: currentMonth(),
};

const cloudSync = {
  available: false,
  initialized: false,
  applyingRemote: false,
  saving: false,
  needsSave: false,
  version: 0,
  updatedAt: null,
  localRevision: 0,
  pollTimer: null,
  saveTimer: null,
};

const goalCloudSync = {
  initialized: false,
  applyingRemote: false,
  saving: false,
  needsSave: false,
  version: 0,
  updatedAt: null,
  localRevision: 0,
  pollTimer: null,
  saveTimer: null,
};

let photoUploadInProgress = false;
let photoPreviewObjectUrl = "";

const form = document.querySelector("#itemForm");
const goalForm = document.querySelector("#goalForm");
const fields = {
  id: document.querySelector("#itemId"),
  ledgerNo: document.querySelector("#ledgerNoInput"),
  name: document.querySelector("#nameInput"),
  imageUrl: document.querySelector("#imageUrlInput"),
  photoFile: document.querySelector("#photoFileInput"),
  markets: Array.from(document.querySelectorAll('input[name="marketplace"]')),
  status: document.querySelector("#statusInput"),
  storageLocation: document.querySelector("#storageLocationInput"),
  purchaseDate: document.querySelector("#purchaseDateInput"),
  listingDate: document.querySelector("#listingDateInput"),
  saleDate: document.querySelector("#saleDateInput"),
  purchasePrice: document.querySelector("#purchasePriceInput"),
  salePrice: document.querySelector("#salePriceInput"),
  shipping: document.querySelector("#shippingInput"),
  packing: document.querySelector("#packingInput"),
  feeRate: document.querySelector("#feeRateInput"),
  actualFee: document.querySelector("#actualFeeInput"),
  memo: document.querySelector("#memoInput"),
};

const goalFields = {
  sales: document.querySelector("#salesGoalInput"),
  profit: document.querySelector("#profitGoalInput"),
  soldCount: document.querySelector("#soldCountGoalInput"),
  margin: document.querySelector("#marginGoalInput"),
};

const output = {
  formTitle: document.querySelector("#formTitle"),
  formBreakEven: document.querySelector("#formBreakEven"),
  formProfit: document.querySelector("#formProfit"),
  formMargin: document.querySelector("#formMargin"),
  formCalculatedFee: document.querySelector("#formCalculatedFee"),
  formFeeDifference: document.querySelector("#formFeeDifference"),
  actualFeeState: document.querySelector("#actualFeeState"),
  actualFeeField: document.querySelector("#actualFeeField"),
  stockCount: document.querySelector("#stockCount"),
  stockCost: document.querySelector("#stockCost"),
  monthlySales: document.querySelector("#monthlySales"),
  monthlyProfit: document.querySelector("#monthlyProfit"),
  summaryMonthInput: document.querySelector("#summaryMonthInput"),
  monthlySoldCount: document.querySelector("#monthlySoldCount"),
  monthEndStockCount: document.querySelector("#monthEndStockCount"),
  monthlyCost: document.querySelector("#monthlyCost"),
  monthlyAverageProfit: document.querySelector("#monthlyAverageProfit"),
  monthlyMargin: document.querySelector("#monthlyMargin"),
  inventoryBody: document.querySelector("#inventoryBody"),
  emptyState: document.querySelector("#emptyState"),
  cloudSyncStatus: document.querySelector("#cloudSyncStatus"),
  cloudSyncStatusText: document.querySelector("#cloudSyncStatusText"),
  marketSummary: document.querySelector("#marketSummary"),
  formPhotoImage: document.querySelector("#formPhotoImage"),
  formPhotoEmpty: document.querySelector("#formPhotoEmpty"),
  photoUploadStatus: document.querySelector("#photoUploadStatus"),
  goalMonthInput: document.querySelector("#goalMonthInput"),
  overallGoalRing: document.querySelector("#overallGoalRing"),
  overallGoalPercent: document.querySelector("#overallGoalPercent"),
  goalProgressDate: document.querySelector("#goalProgressDate"),
  goalActualSales: document.querySelector("#goalActualSales"),
  goalTargetSales: document.querySelector("#goalTargetSales"),
  salesGoalPercent: document.querySelector("#salesGoalPercent"),
  salesGoalBar: document.querySelector("#salesGoalBar"),
  salesGoalRemaining: document.querySelector("#salesGoalRemaining"),
  salesGoalPace: document.querySelector("#salesGoalPace"),
  goalActualProfit: document.querySelector("#goalActualProfit"),
  goalTargetProfit: document.querySelector("#goalTargetProfit"),
  profitGoalPercent: document.querySelector("#profitGoalPercent"),
  profitGoalBar: document.querySelector("#profitGoalBar"),
  profitGoalRemaining: document.querySelector("#profitGoalRemaining"),
  profitGoalPace: document.querySelector("#profitGoalPace"),
  goalActualSoldCount: document.querySelector("#goalActualSoldCount"),
  goalTargetSoldCount: document.querySelector("#goalTargetSoldCount"),
  soldCountGoalPercent: document.querySelector("#soldCountGoalPercent"),
  soldCountGoalBar: document.querySelector("#soldCountGoalBar"),
  soldCountGoalRemaining: document.querySelector("#soldCountGoalRemaining"),
  soldCountGoalPace: document.querySelector("#soldCountGoalPace"),
  goalActualMargin: document.querySelector("#goalActualMargin"),
  goalTargetMargin: document.querySelector("#goalTargetMargin"),
  marginGoalPercent: document.querySelector("#marginGoalPercent"),
  marginGoalBar: document.querySelector("#marginGoalBar"),
  marginGoalDifference: document.querySelector("#marginGoalDifference"),
  marginGoalPace: document.querySelector("#marginGoalPace"),
  goalForecastMessage: document.querySelector("#goalForecastMessage"),
  goalForecastSales: document.querySelector("#goalForecastSales"),
  goalDailySalesNeeded: document.querySelector("#goalDailySalesNeeded"),
  goalWeeklyCountNeeded: document.querySelector("#goalWeeklyCountNeeded"),
  goalWeeklyTotal: document.querySelector("#goalWeeklyTotal"),
  goalWeeklyChart: document.querySelector("#goalWeeklyChart"),
  goalActionCount: document.querySelector("#goalActionCount"),
  goalActionProfit: document.querySelector("#goalActionProfit"),
  goalActionMargin: document.querySelector("#goalActionMargin"),
};

const controls = {
  resetButton: document.querySelector("#resetButton"),
  saveButton: document.querySelector("#saveButton"),
  photoUploadLabel: document.querySelector(".photo-upload-button"),
  removePhotoButton: document.querySelector("#removePhotoButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  pasteImportButton: document.querySelector("#pasteImportButton"),
  reloadDefaultButton: document.querySelector("#reloadDefaultButton"),
  csvPasteDialog: document.querySelector("#csvPasteDialog"),
  csvPasteInput: document.querySelector("#csvPasteInput"),
  confirmPasteImportButton: document.querySelector("#confirmPasteImportButton"),
  closePasteDialogButton: document.querySelector("#closePasteDialogButton"),
  previousMonthButton: document.querySelector("#previousMonthButton"),
  nextMonthButton: document.querySelector("#nextMonthButton"),
  searchInput: document.querySelector("#searchInput"),
  statusFilters: document.querySelector("#statusFilters"),
  locationFilters: document.querySelector("#locationFilters"),
  viewTabs: Array.from(document.querySelectorAll("[data-view-tab]")),
  viewPanels: Array.from(document.querySelectorAll("[data-view-panel]")),
  viewTargets: Array.from(document.querySelectorAll("[data-view-target]")),
  toast: document.querySelector("#toast"),
  calculatorBackLink: document.querySelector("#calculatorBackLink"),
  cloudInventoryLink: document.querySelector("#cloudInventoryLink"),
  marketPicker: document.querySelector("#marketPicker"),
  goalsPreviousMonthButton: document.querySelector("#goalsPreviousMonthButton"),
  goalsNextMonthButton: document.querySelector("#goalsNextMonthButton"),
  openGoalDialogButton: document.querySelector("#openGoalDialogButton"),
  closeGoalDialogButton: document.querySelector("#closeGoalDialogButton"),
  goalDialog: document.querySelector("#goalDialog"),
};

function parseMoney(value) {
  const normalized = String(value).replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function parseRate(value) {
  const rate = Number.parseFloat(value);
  if (!Number.isFinite(rate)) return defaultFeeRate;
  return Math.min(Math.max(rate, 0), 80);
}

function normalizeFeeRateChoice(value) {
  const rate = parseRate(value);
  return feeRateOptions.reduce((closest, option) =>
    Math.abs(option - rate) < Math.abs(closest - rate) ? option : closest,
  );
}

function formatInput(value, allowZero = false) {
  const normalized = String(value).replace(/[^\d]/g, "");
  if (!normalized) return "";
  const amount = Number(normalized);
  return amount || allowZero ? numberFormatter.format(amount) : "";
}

function formatYen(value) {
  return yenFormatter.format(Math.round(value || 0));
}

function normalizeImageUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function calculateFee(price, feeRate, rounding = "ceil") {
  const fee = price * (feeRate / 100);
  return rounding === "round" ? Math.round(fee) : Math.ceil(fee);
}

function calculateBreakEvenPrice(totalCost, feeRate, options = {}) {
  if (totalCost <= 0) return 0;

  const shipping = Number(options.shipping) || 0;
  const isTanomeru = options.shippingMethod === tanomeruShippingMethod;
  const rounding = options.feeRounding === "round" ? "round" : "ceil";
  const rate = feeRate / 100;
  const feeBearingCost = isTanomeru ? Math.max(0, totalCost - shipping) : totalCost;
  let price = (isTanomeru ? shipping : 0) + Math.ceil(feeBearingCost / (1 - rate));

  const retainedAfterFee = (salePrice) => {
    const feeBase = isTanomeru ? salePrice - shipping : salePrice;
    return salePrice - calculateFee(feeBase, feeRate, rounding);
  };

  while (retainedAfterFee(price) < totalCost) {
    price += 1;
  }

  while (price > 0 && retainedAfterFee(price - 1) >= totalCost) {
    price -= 1;
  }

  return price;
}

function getCalculations(item) {
  const purchasePrice = Number(item.purchasePrice) || 0;
  const shipping = Number(item.shipping) || 0;
  const packing = Number(item.packing) || 0;
  const salePrice = Number(item.salePrice) || 0;
  const feeRate = parseRate(item.feeRate);
  const totalCost = purchasePrice + shipping + packing;
  const hasActualFee = item.actualFee !== null && item.actualFee !== undefined && item.actualFee !== "";
  const shippingMethod = item.shippingMethod === tanomeruShippingMethod ? tanomeruShippingMethod : "";
  const feeRounding = item.feeRounding === "round" ? "round" : "ceil";
  const feeBase = shippingMethod === tanomeruShippingMethod ? salePrice - shipping : salePrice;
  const calculatedFee = calculateFee(feeBase, feeRate, feeRounding);
  const fee = hasActualFee ? Number(item.actualFee) || 0 : calculatedFee;
  const profit = salePrice - fee - totalCost;
  const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const breakEven = calculateBreakEvenPrice(totalCost, feeRate, {
    shipping,
    shippingMethod,
    feeRounding,
  });

  return { totalCost, calculatedFee, hasActualFee, fee, profit, margin, breakEven };
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonth() {
  return today().slice(0, 7);
}

function shiftMonth(monthString, amount) {
  const [year, month] = String(monthString || currentMonth()).split("-").map(Number);
  const date = new Date(year, (month || 1) - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeCalculatorReturnUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";

    if (url.origin === "https://sedori-profit-calculator.pages.dev") {
      return cloudCalculatorUrl;
    }

    if (url.origin === "https://ms1983store-wq.github.io" && url.pathname.startsWith("/sedori-profit-calculator/")) {
      return cloudCalculatorUrl;
    }

    if (url.origin === "https://rieki-calc.hachi-ribe.workers.dev") {
      return cloudCalculatorUrl;
    }

    if (["localhost", "127.0.0.1"].includes(url.hostname)) {
      return new URL("../", url).href;
    }
  } catch {
    return "";
  }

  return "";
}

function configureCalculatorBackLink() {
  const params = new URLSearchParams(window.location.search);
  const requested = normalizeCalculatorReturnUrl(params.get("return"));
  const referrer = normalizeCalculatorReturnUrl(document.referrer);
  const saved = normalizeCalculatorReturnUrl(localStorage.getItem(calculatorReturnStorageKey));
  const target = requested || referrer || saved || cloudCalculatorUrl;

  if (requested || referrer) {
    localStorage.setItem(calculatorReturnStorageKey, target);
  }

  if (controls.calculatorBackLink) {
    controls.calculatorBackLink.href = target;
  }

  if (controls.cloudInventoryLink) {
    const cloudUrl = new URL(canonicalCloudInventoryUrl);
    cloudUrl.searchParams.set("return", target);
    controls.cloudInventoryLink.href = cloudUrl.href;
  }

  return target;
}

function setCloudSyncStatus(stateName, message, options = {}) {
  if (!output.cloudSyncStatus || !output.cloudSyncStatusText) return;
  output.cloudSyncStatus.dataset.state = stateName;
  output.cloudSyncStatusText.textContent = message;
  if (controls.cloudInventoryLink) {
    controls.cloudInventoryLink.hidden = options.showCloudLink !== true;
  }
}

function formatCloudSyncStatus(updatedAt = cloudSync.updatedAt) {
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : "";
  return `クラウド最新版・${state.items.length}件${time ? `（${time}更新）` : ""}`;
}

function getMonthEndDate(monthString) {
  const [year, month] = String(monthString || currentMonth()).split("-").map(Number);
  if (!year || !month) return "";
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getInitialView() {
  const view = window.location.hash.replace(/^#/, "");
  return ["top", "entry", "inventory", "goals"].includes(view) ? view : "top";
}

function switchView(view, options = {}) {
  const { updateHash = true, scroll = true } = options;
  const nextView = ["top", "entry", "inventory", "goals"].includes(view) ? view : "top";
  state.activeView = nextView;

  controls.viewTabs.forEach((button) => {
    const active = button.dataset.viewTab === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  controls.viewPanels.forEach((panel) => {
    const active = panel.dataset.viewPanel === nextView;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });

  if (updateHash) {
    const suffix = nextView === "top" ? "" : `#${nextView}`;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${suffix}`);
  }

  if (scroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function normalizeDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseLocalDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function formatSaleDays(item) {
  const startDate = item.listingDate || item.purchaseDate;
  const days = item.saleDate ? daysBetween(startDate, item.saleDate) : null;
  return days === null ? "-" : `${numberFormatter.format(days)}日`;
}

function normalizeMarket(value) {
  const market = String(value || "").trim();
  if (!market) return "その他";
  if (market === "Yahooフリマ") return "Yahoo!フリマ";
  return market;
}

function normalizeMarkets(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\s*(?:[|、,／\/・]|\r?\n)\s*/)
        .filter(Boolean);
  const markets = values.map((market) => normalizeMarket(market)).filter(Boolean);
  return markets.length ? Array.from(new Set(markets)) : ["その他"];
}

function getItemMarkets(item) {
  return normalizeMarkets(item?.markets ?? item?.market);
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  if (!status || status === "在庫") return "出品中";
  if (status === "販売済み" || status === "完了") return "売却済み";
  if (statusOptions.includes(status)) {
    return status;
  }
  return status;
}

function normalizeStorageLocation(value) {
  const location = String(value || "").trim();
  return storageLocationOptions.includes(location) ? location : "自宅";
}

function getCurrentStorageLocation(item) {
  if (soldStatuses.has(normalizeStatus(item?.status))) return "";
  return normalizeStorageLocation(item?.storageLocation);
}

function normalizeShippingMethod(value) {
  const method = String(value || "").trim();
  return method === tanomeruShippingMethod || method === "たのメル便" ? tanomeruShippingMethod : "";
}

function normalizeFeeRounding(value) {
  const rounding = String(value || "").trim();
  return rounding === "round" || rounding === "四捨五入" ? "round" : "";
}

function normalizeLedgerNo(value) {
  return String(value || "").trim();
}

function ledgerNoFromSourceRef(sourceRef) {
  const match = String(sourceRef || "").match(/管理表[:：\s-]*(.+)$/);
  return match ? normalizeLedgerNo(match[1]) : "";
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSelectedMarkets() {
  return fields.markets.filter((input) => input.checked).map((input) => input.value);
}

function updateMarketSummary() {
  const markets = getSelectedMarkets();
  if (!markets.length) {
    output.marketSummary.textContent = "出品先を選択";
  } else if (markets.length <= 2) {
    output.marketSummary.textContent = markets.join("・");
  } else {
    output.marketSummary.textContent = `${markets[0]}ほか${markets.length - 1}件`;
  }
}

function setFormMarkets(value) {
  const selected = new Set(
    normalizeMarkets(value).map((market) => (marketOptions.includes(market) ? market : "その他")),
  );
  fields.markets.forEach((input) => {
    input.checked = selected.has(input.value);
  });
  updateMarketSummary();
}

function readForm() {
  const markets = getSelectedMarkets();
  return {
    id: fields.id.value || createId(),
    ledgerNo: normalizeLedgerNo(fields.ledgerNo.value),
    name: fields.name.value.trim(),
    imageUrl: normalizeImageUrl(fields.imageUrl.value),
    market: markets[0] || "",
    markets,
    status: fields.status.value,
    storageLocation: normalizeStorageLocation(fields.storageLocation.value),
    purchaseDate: fields.purchaseDate.value,
    listingDate: fields.listingDate.value,
    saleDate: fields.saleDate.value,
    purchasePrice: parseMoney(fields.purchasePrice.value),
    salePrice: parseMoney(fields.salePrice.value),
    shipping: parseMoney(fields.shipping.value),
    packing: parseMoney(fields.packing.value),
    feeRate: normalizeFeeRateChoice(fields.feeRate.value),
    actualFee:
      soldStatuses.has(fields.status.value) && fields.actualFee.value.trim() !== ""
        ? parseMoney(fields.actualFee.value)
        : null,
    memo: fields.memo.value.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function updateFormPhotoPreview() {
  if (photoUploadInProgress && photoPreviewObjectUrl) {
    output.formPhotoImage.alt = fields.name.value.trim() ? `${fields.name.value.trim()}の写真` : "商品写真";
    return;
  }

  const imageUrl = normalizeImageUrl(fields.imageUrl.value);
  output.formPhotoImage.hidden = !imageUrl;
  output.formPhotoEmpty.hidden = Boolean(imageUrl);

  if (!imageUrl) {
    output.formPhotoImage.removeAttribute("src");
    output.formPhotoImage.alt = "";
    return;
  }

  output.formPhotoImage.src = imageUrl;
  output.formPhotoImage.alt = fields.name.value.trim() ? `${fields.name.value.trim()}の写真` : "商品写真";
}

function setPhotoUploadStatus(message = "", stateName = "") {
  output.photoUploadStatus.textContent = message;
  if (stateName) {
    output.photoUploadStatus.dataset.state = stateName;
  } else {
    delete output.photoUploadStatus.dataset.state;
  }
}

function releasePhotoPreviewObjectUrl() {
  if (!photoPreviewObjectUrl) return;
  URL.revokeObjectURL(photoPreviewObjectUrl);
  photoPreviewObjectUrl = "";
}

function setPhotoUploadInProgress(isUploading) {
  photoUploadInProgress = isUploading;
  fields.photoFile.disabled = isUploading;
  controls.saveButton.disabled = isUploading;
  controls.resetButton.disabled = isUploading;
  controls.removePhotoButton.disabled = isUploading;
  controls.photoUploadLabel.setAttribute("aria-disabled", String(isUploading));
}

function loadPhotoImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("この写真を読み込めませんでした。JPEGまたはPNGでお試しください"));
    image.src = url;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("写真を変換できませんでした"));
      }
    }, "image/jpeg", quality);
  });
}

async function preparePhotoUpload(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("写真ファイルを選択してください");
  }

  const image = await loadPhotoImage(photoPreviewObjectUrl);
  let maxDimension = 1400;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.84, 0.72, 0.6]) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (blob.size <= maxPhotoUploadBytes) return blob;
    }

    maxDimension = Math.round(maxDimension * 0.72);
  }

  throw new Error("写真の容量を小さくできませんでした。別の写真をお試しください");
}

async function uploadPhotoFile(file) {
  const blob = await preparePhotoUpload(file);
  const headers = { "content-type": blob.type };
  if (isLocalDevHost) headers["x-inventory-user-email"] = "local-photo-test@example.invalid";
  const response = await fetch(photoApiUrl, {
    method: "POST",
    headers,
    body: blob,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !normalizeImageUrl(result.url)) {
    throw new Error(result.error || "写真をクラウドへ保存できませんでした");
  }
  return normalizeImageUrl(result.url);
}

async function handlePhotoFileChange(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  if (!isCloudSyncHost && !isLocalDevHost) {
    input.value = "";
    setPhotoUploadStatus("写真の直接登録はクラウド版で利用できます", "error");
    showToast("クラウド版の在庫帳から写真を登録してください");
    return;
  }

  const previousUrl = fields.imageUrl.value;
  releasePhotoPreviewObjectUrl();
  photoPreviewObjectUrl = URL.createObjectURL(file);
  output.formPhotoImage.src = photoPreviewObjectUrl;
  output.formPhotoImage.hidden = false;
  output.formPhotoEmpty.hidden = true;
  output.formPhotoImage.alt = fields.name.value.trim() ? `${fields.name.value.trim()}の写真` : "選択した商品写真";
  setPhotoUploadInProgress(true);
  setPhotoUploadStatus("写真を軽量化してクラウドへ保存中です");

  try {
    fields.imageUrl.value = await uploadPhotoFile(file);
    releasePhotoPreviewObjectUrl();
    updateFormPhotoPreview();
    setPhotoUploadStatus("写真を保存しました。商品情報の保存を押してください");
    showToast("写真をクラウドへ保存しました");
  } catch (error) {
    fields.imageUrl.value = previousUrl;
    releasePhotoPreviewObjectUrl();
    updateFormPhotoPreview();
    setPhotoUploadStatus(error.message || "写真を保存できませんでした", "error");
    showToast(error.message || "写真を保存できませんでした");
  } finally {
    input.value = "";
    setPhotoUploadInProgress(false);
  }
}

function removeFormPhoto() {
  releasePhotoPreviewObjectUrl();
  fields.imageUrl.value = "";
  fields.photoFile.value = "";
  updateFormPhotoPreview();
  setPhotoUploadStatus("写真を外しました。商品情報の保存を押してください");
}

function setMoneyInputs() {
  [fields.purchasePrice, fields.salePrice, fields.shipping, fields.packing, fields.actualFee].forEach((input) => {
    input.value = formatInput(input.value, input === fields.purchasePrice || input === fields.actualFee);
  });
}

function updateFormPreview() {
  setMoneyInputs();
  const canAdjustFee = soldStatuses.has(fields.status.value);
  fields.actualFee.disabled = !canAdjustFee;
  const item = readForm();
  const calc = getCalculations(item);
  const feeDifference = calc.fee - calc.calculatedFee;
  const isAdjusted = canAdjustFee && calc.hasActualFee;
  output.formCalculatedFee.textContent = numberFormatter.format(calc.calculatedFee);
  output.actualFeeState.textContent = isAdjusted ? "補正中" : canAdjustFee ? "自動計算" : "売却後に入力";
  output.actualFeeState.dataset.active = String(isAdjusted);
  output.actualFeeField.classList.toggle("is-adjusted", isAdjusted);
  output.formFeeDifference.textContent = isAdjusted
    ? `計算値より ${feeDifference > 0 ? "+" : feeDifference < 0 ? "-" : "±"}¥${numberFormatter.format(Math.abs(feeDifference))}`
    : "計算手数料を使用";
  output.formBreakEven.textContent = formatYen(calc.breakEven);
  output.formProfit.textContent = formatYen(calc.profit);
  output.formMargin.textContent = `${percentFormatter.format(calc.margin)}%`;
  output.formProfit.classList.toggle("loss-text", calc.profit < 0);
}

function resetForm(options = {}) {
  const { focus = state.activeView === "entry" } = options;
  releasePhotoPreviewObjectUrl();
  form.reset();
  fields.id.value = "";
  fields.ledgerNo.value = "";
  fields.imageUrl.value = "";
  fields.photoFile.value = "";
  fields.purchaseDate.value = today();
  fields.feeRate.value = defaultFeeRate;
  fields.storageLocation.value = "自宅";
  controls.marketPicker.open = false;
  updateMarketSummary();
  output.formTitle.textContent = "商品登録";
  setPhotoUploadStatus();
  updateFormPhotoPreview();
  updateFormPreview();
  if (focus) fields.name.focus();
}

function fillForm(item) {
  releasePhotoPreviewObjectUrl();
  fields.id.value = item.id;
  fields.ledgerNo.value = item.ledgerNo || "";
  fields.name.value = item.name;
  fields.imageUrl.value = item.imageUrl || "";
  fields.photoFile.value = "";
  setFormMarkets(item.markets ?? item.market ?? "メルカリ");
  controls.marketPicker.open = false;
  fields.status.value = normalizeStatus(item.status);
  fields.storageLocation.value = normalizeStorageLocation(item.storageLocation);
  fields.purchaseDate.value = item.purchaseDate || "";
  fields.listingDate.value = item.listingDate || "";
  fields.saleDate.value = item.saleDate || "";
  fields.purchasePrice.value = formatInput(item.purchasePrice, true);
  fields.salePrice.value = formatInput(item.salePrice);
  fields.shipping.value = formatInput(item.shipping);
  fields.packing.value = formatInput(item.packing);
  fields.feeRate.value = normalizeFeeRateChoice(item.feeRate);
  fields.actualFee.value =
    item.actualFee === null || item.actualFee === undefined || item.actualFee === ""
      ? ""
      : formatInput(item.actualFee, true);
  fields.memo.value = item.memo || "";
  output.formTitle.textContent = "商品編集";
  setPhotoUploadStatus();
  updateFormPhotoPreview();
  updateFormPreview();
  switchView("entry");
  fields.name.focus();
}

function storeLocalItems() {
  localStorage.setItem(storageKey, JSON.stringify(state.items));
}

function hasPendingCloudChanges() {
  return localStorage.getItem(cloudPendingSyncKey) === "1";
}

function markPendingCloudChanges() {
  cloudSync.localRevision += 1;
  localStorage.setItem(cloudPendingSyncKey, "1");
  if (isCloudSyncHost) {
    setCloudSyncStatus("saving", "端末の変更をクラウドへ同期中");
  }
}

function clearPendingCloudChanges(expectedRevision = cloudSync.localRevision) {
  if (expectedRevision !== cloudSync.localRevision) return false;
  localStorage.removeItem(cloudPendingSyncKey);
  localStorage.removeItem(cloudPendingDeletedKey);
  return true;
}

function getPendingDeletedIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(cloudPendingDeletedKey) || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function rememberPendingDeletion(id) {
  const ids = getPendingDeletedIds();
  ids.add(String(id));
  localStorage.setItem(cloudPendingDeletedKey, JSON.stringify([...ids]));
}

function forgetPendingDeletion(id) {
  const ids = getPendingDeletedIds();
  if (!ids.delete(String(id))) return;
  if (ids.size) {
    localStorage.setItem(cloudPendingDeletedKey, JSON.stringify([...ids]));
  } else {
    localStorage.removeItem(cloudPendingDeletedKey);
  }
}

function applyPendingDeletions(items) {
  const deletedIds = getPendingDeletedIds();
  return deletedIds.size ? items.filter((item) => !deletedIds.has(String(item.id))) : items;
}

function saveItems(options = {}) {
  storeLocalItems();
  if (options.dirty !== false) {
    markPendingCloudChanges();
  }
  if (options.cloud !== false) {
    queueCloudSave();
  }
}

function loadItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    state.items = Array.isArray(saved) ? saved.map(normalizeItem) : [];
  } catch {
    state.items = [];
  }
  seedDefaultInventory();
}

function normalizeGoalValue(value, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), maximum);
}

function normalizeMonthlyGoal(goal = {}) {
  return {
    sales: Math.round(normalizeGoalValue(goal.sales, 1_000_000_000)),
    profit: Math.round(normalizeGoalValue(goal.profit, 1_000_000_000)),
    soldCount: Math.round(normalizeGoalValue(goal.soldCount, 100_000)),
    margin: normalizeGoalValue(goal.margin, 100),
    updatedAt: String(goal.updatedAt || ""),
  };
}

function normalizeGoalCollection(goals) {
  if (!goals || typeof goals !== "object" || Array.isArray(goals)) return {};
  return Object.fromEntries(
    Object.entries(goals)
      .filter(([month, goal]) => /^\d{4}-\d{2}$/.test(month) && goal && typeof goal === "object")
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-120)
      .map(([month, goal]) => [month, normalizeMonthlyGoal(goal)]),
  );
}

function storeLocalGoals() {
  localStorage.setItem(goalStorageKey, JSON.stringify(state.goals));
}

function loadGoals() {
  try {
    state.goals = normalizeGoalCollection(JSON.parse(localStorage.getItem(goalStorageKey) || "{}"));
  } catch {
    state.goals = {};
  }
}

function getGoalConfig(month = state.goalMonth) {
  const saved = state.goals[month];
  return saved ? normalizeMonthlyGoal(saved) : { ...defaultMonthlyGoals, updatedAt: "" };
}

function openGoalDialog() {
  const goal = getGoalConfig();
  goalFields.sales.value = formatInput(goal.sales, true);
  goalFields.profit.value = formatInput(goal.profit, true);
  goalFields.soldCount.value = String(goal.soldCount);
  goalFields.margin.value = String(goal.margin);
  const [year, month] = state.goalMonth.split("-").map(Number);
  controls.goalDialog.querySelector("#goalDialogTitle").textContent = `${year}年${month}月の目標`;
  controls.goalDialog.showModal();
}

function closeGoalDialog() {
  controls.goalDialog.close();
}

function saveMonthlyGoal(event) {
  event.preventDefault();
  state.goals[state.goalMonth] = normalizeMonthlyGoal({
    sales: parseMoney(goalFields.sales.value),
    profit: parseMoney(goalFields.profit.value),
    soldCount: goalFields.soldCount.value,
    margin: goalFields.margin.value,
    updatedAt: new Date().toISOString(),
  });
  storeLocalGoals();
  markPendingGoalCloudChanges();
  queueGoalCloudSave();
  renderGoals();
  closeGoalDialog();
  showToast("月間目標を保存しました");
}

function normalizeItem(item) {
  const sourceRef = String(item.sourceRef || "").trim();
  const ledgerNo =
    normalizeLedgerNo(item.ledgerNo ?? item.ledgerNumber ?? item.no ?? item.number ?? item["No."] ?? item["№"]) ||
    ledgerNoFromSourceRef(sourceRef);
  const markets = normalizeMarkets(item.markets ?? item.market ?? "メルカリ");

  return {
    id: item.id || createId(),
    ledgerNo,
    name: item.name || "",
    imageUrl: normalizeImageUrl(item.imageUrl ?? item.photoUrl ?? item.thumbnailUrl),
    market: markets[0],
    markets,
    status: normalizeStatus(item.status),
    storageLocation: normalizeStorageLocation(item.storageLocation),
    purchaseDate: item.purchaseDate || "",
    listingDate: item.listingDate || "",
    saleDate: item.saleDate || "",
    purchasePrice: Number(item.purchasePrice) || 0,
    salePrice: Number(item.salePrice) || 0,
    shipping: Number(item.shipping) || 0,
    packing: Number(item.packing) || 0,
    feeRate: normalizeFeeRateChoice(item.feeRate),
    feeRounding: normalizeFeeRounding(item.feeRounding),
    shippingMethod: normalizeShippingMethod(item.shippingMethod),
    actualFee:
      item.actualFee === null || item.actualFee === undefined || item.actualFee === "" ? null : Number(item.actualFee) || 0,
    category: item.category || "",
    sourceRef,
    memo: item.memo || "",
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function getDefaultInventoryItems() {
  return Array.isArray(globalThis.SEDORI_DEFAULT_INVENTORY) ? globalThis.SEDORI_DEFAULT_INVENTORY : [];
}

function isGeneratedDefaultItem(item) {
  return (
    String(item.id || "").startsWith("default-management-") &&
    String(item.sourceRef || "").startsWith("管理表:") &&
    /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(String(item.updatedAt || ""))
  );
}

function seedDefaultInventory() {
  const defaultItems = getDefaultInventoryItems().map(normalizeItem).filter((item) => item.name);
  if (!defaultItems.length) return;
  if (localStorage.getItem(defaultInventoryLoadedKey) === defaultInventoryVersion) return;

  const indexByIdentity = new Map(state.items.map((item, index) => [getItemIdentity(item), index]));
  const additions = [];
  let updated = 0;

  defaultItems.forEach((item) => {
    const identity = getItemIdentity(item);
    const existingIndex = indexByIdentity.get(identity);

    if (existingIndex === undefined) {
      additions.push(item);
      return;
    }

    const existing = state.items[existingIndex];
    if (isGeneratedDefaultItem(existing) && existing.updatedAt !== item.updatedAt) {
      state.items[existingIndex] = { ...item, id: existing.id };
      updated += 1;
    }
  });

  if (additions.length || updated) {
    state.items = [...additions, ...state.items];
    saveItems({ cloud: false, dirty: false });
  }

  localStorage.setItem(defaultInventoryLoadedKey, defaultInventoryVersion);
}

function isSameMonth(dateString, monthString) {
  return Boolean(dateString && monthString && dateString.slice(0, 7) === monthString);
}

function getLatestSaleMonth() {
  return state.items
    .filter((item) => soldStatuses.has(item.status) && item.saleDate)
    .map((item) => item.saleDate.slice(0, 7))
    .sort()
    .at(-1);
}

function isStockAtMonthEnd(item, monthString) {
  const monthEndDate = getMonthEndDate(monthString);
  if (!monthEndDate) return false;

  const purchaseDate = normalizeDate(item.purchaseDate);
  if (purchaseDate && purchaseDate > monthEndDate) return false;
  if (!purchaseDate && soldStatuses.has(item.status)) return false;
  if (!soldStatuses.has(item.status)) return true;

  const saleDate = normalizeDate(item.saleDate);
  if (!saleDate) return false;
  return saleDate > monthEndDate;
}

function getFilteredItems() {
  const keyword = state.search.trim().toLowerCase();
  return state.items
    .filter((item) => {
      if (state.filterStatus === "all") return true;
      return item.status === state.filterStatus;
    })
    .filter((item) => {
      if (state.filterLocation === "all") return true;
      return getCurrentStorageLocation(item) === state.filterLocation;
    })
    .filter((item) => {
      if (!keyword) return true;
      return [
        item.ledgerNo,
        item.name,
        ...getItemMarkets(item),
        getCurrentStorageLocation(item),
        item.category,
        item.memo,
        item.sourceRef,
      ].some((value) => String(value).toLowerCase().includes(keyword));
    })
    .sort((a, b) => {
      const left = soldStatuses.has(b.status) ? b.saleDate || b.purchaseDate || "" : b.purchaseDate || "";
      const right = soldStatuses.has(a.status) ? a.saleDate || a.purchaseDate || "" : a.purchaseDate || "";
      if (left !== right) return left.localeCompare(right);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

function renderSummary() {
  const activeItems = state.items.filter((item) => !soldStatuses.has(item.status));
  const stockCost = activeItems.reduce((sum, item) => sum + getCalculations(item).totalCost, 0);
  const monthlyItems = state.items.filter((item) => soldStatuses.has(item.status) && isSameMonth(item.saleDate, state.selectedMonth));
  const monthlySales = monthlyItems.reduce((sum, item) => sum + item.salePrice, 0);
  const monthlyProfit = monthlyItems.reduce((sum, item) => sum + getCalculations(item).profit, 0);
  const monthlyCost = monthlyItems.reduce((sum, item) => sum + getCalculations(item).totalCost, 0);
  const monthEndItems = state.items.filter((item) => isStockAtMonthEnd(item, state.selectedMonth));
  const averageProfit = monthlyItems.length ? monthlyProfit / monthlyItems.length : 0;
  const monthlyMargin = monthlySales > 0 ? (monthlyProfit / monthlySales) * 100 : 0;

  output.summaryMonthInput.value = state.selectedMonth;
  output.stockCount.textContent = numberFormatter.format(activeItems.length);
  output.stockCost.textContent = formatYen(stockCost);
  output.monthlySales.textContent = formatYen(monthlySales);
  output.monthlyProfit.textContent = formatYen(monthlyProfit);
  output.monthlySoldCount.textContent = numberFormatter.format(monthlyItems.length);
  output.monthEndStockCount.textContent = numberFormatter.format(monthEndItems.length);
  output.monthlyCost.textContent = formatYen(monthlyCost);
  output.monthlyAverageProfit.textContent = formatYen(averageProfit);
  output.monthlyMargin.textContent = `${percentFormatter.format(monthlyMargin)}%`;
  output.monthlyProfit.classList.toggle("loss-text", monthlyProfit < 0);
  output.monthlyAverageProfit.classList.toggle("loss-text", averageProfit < 0);
  output.monthlyMargin.classList.toggle("loss-text", monthlyMargin < 0);
}

function getMonthTiming(monthString) {
  const [year, month] = String(monthString || currentMonth()).split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const current = currentMonth();
  if (monthString < current) return { totalDays, elapsedDays: totalDays, remainingDays: 0, period: "past" };
  if (monthString > current) return { totalDays, elapsedDays: 0, remainingDays: totalDays, period: "future" };
  const elapsedDays = Math.min(new Date().getDate(), totalDays);
  return { totalDays, elapsedDays, remainingDays: totalDays - elapsedDays, period: "current" };
}

function getGoalProgress(actual, target) {
  if (!(target > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((actual / target) * 100)));
}

function getGoalPaceLabel(progress, timing) {
  if (progress >= 100) return "達成";
  if (timing.period === "future") return "開始前";
  if (timing.period === "past") return "未達成";
  const expected = timing.totalDays ? (timing.elapsedDays / timing.totalDays) * 100 : 0;
  return progress + 4 >= expected ? "順調" : "要ペースアップ";
}

function setGoalMetric({ actual, target, percentElement, barElement, paceElement }) {
  const progress = getGoalProgress(actual, target);
  percentElement.textContent = progress >= 100 ? "達成" : `${progress}%`;
  barElement.style.width = `${progress}%`;
  paceElement.textContent = getGoalPaceLabel(progress, getMonthTiming(state.goalMonth));
  return progress;
}

function getWeeklySales(items) {
  const weekly = [0, 0, 0, 0, 0];
  items.forEach((item) => {
    const day = Number(String(item.saleDate || "").slice(8, 10));
    if (!day) return;
    const index = Math.min(4, Math.floor((day - 1) / 7));
    weekly[index] += Number(item.salePrice) || 0;
  });
  return weekly;
}

function renderGoalChart(monthlyItems, salesTarget, timing) {
  const weeklySales = getWeeklySales(monthlyItems);
  const targetPerWeek = salesTarget / 5;
  const scaleMaximum = Math.max(targetPerWeek, ...weeklySales, 1);
  const bars = Array.from(output.goalWeeklyChart.querySelectorAll(".chart-bar"));
  const currentWeek = timing.period === "current" ? Math.min(4, Math.floor(Math.max(timing.elapsedDays - 1, 0) / 7)) : -1;

  bars.forEach((bar, index) => {
    const height = weeklySales[index] > 0 ? Math.max(7, Math.round((weeklySales[index] / scaleMaximum) * 100)) : 4;
    bar.style.height = `${Math.min(height, 100)}%`;
    bar.classList.toggle("current", index === currentWeek);
    bar.title = `${index + 1}週: ${formatYen(weeklySales[index])}`;
  });

  const goalLine = Math.min(92, Math.max(8, (targetPerWeek / scaleMaximum) * 100));
  output.goalWeeklyChart.style.setProperty("--goal-line", `${goalLine}%`);
}

function renderGoals() {
  if (!output.goalMonthInput) return;
  const goal = getGoalConfig();
  const timing = getMonthTiming(state.goalMonth);
  const monthlyItems = state.items.filter(
    (item) => soldStatuses.has(item.status) && isSameMonth(item.saleDate, state.goalMonth),
  );
  const sales = monthlyItems.reduce((sum, item) => sum + item.salePrice, 0);
  const profit = monthlyItems.reduce((sum, item) => sum + getCalculations(item).profit, 0);
  const soldCount = monthlyItems.length;
  const margin = sales > 0 ? (profit / sales) * 100 : 0;

  output.goalMonthInput.value = state.goalMonth;
  output.goalActualSales.textContent = formatYen(sales);
  output.goalTargetSales.textContent = `/ ${formatYen(goal.sales)}`;
  output.salesGoalRemaining.textContent = `残り ${formatYen(Math.max(0, goal.sales - sales))}`;
  output.goalActualProfit.textContent = formatYen(profit);
  output.goalTargetProfit.textContent = `/ ${formatYen(goal.profit)}`;
  output.profitGoalRemaining.textContent = `残り ${formatYen(Math.max(0, goal.profit - profit))}`;
  output.goalActualSoldCount.textContent = `${numberFormatter.format(soldCount)}件`;
  output.goalTargetSoldCount.textContent = `/ ${numberFormatter.format(goal.soldCount)}件`;
  output.soldCountGoalRemaining.textContent = `残り ${numberFormatter.format(Math.max(0, goal.soldCount - soldCount))}件`;
  output.goalActualMargin.textContent = `${percentFormatter.format(margin)}%`;
  output.goalTargetMargin.textContent = `/ ${percentFormatter.format(goal.margin)}%`;
  const marginDifference = margin - goal.margin;
  output.marginGoalDifference.textContent = `目標比 ${marginDifference >= 0 ? "+" : ""}${percentFormatter.format(marginDifference)}pt`;

  const progressValues = [
    setGoalMetric({
      actual: sales,
      target: goal.sales,
      percentElement: output.salesGoalPercent,
      barElement: output.salesGoalBar,
      paceElement: output.salesGoalPace,
    }),
    setGoalMetric({
      actual: Math.max(0, profit),
      target: goal.profit,
      percentElement: output.profitGoalPercent,
      barElement: output.profitGoalBar,
      paceElement: output.profitGoalPace,
    }),
    setGoalMetric({
      actual: soldCount,
      target: goal.soldCount,
      percentElement: output.soldCountGoalPercent,
      barElement: output.soldCountGoalBar,
      paceElement: output.soldCountGoalPace,
    }),
    setGoalMetric({
      actual: Math.max(0, margin),
      target: goal.margin,
      percentElement: output.marginGoalPercent,
      barElement: output.marginGoalBar,
      paceElement: output.marginGoalPace,
    }),
  ];

  const overall = Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length);
  output.overallGoalPercent.textContent = `${overall}%`;
  output.overallGoalRing.style.setProperty("--progress", `${overall}%`);
  const monthNumber = Number(state.goalMonth.slice(5, 7));
  output.goalProgressDate.textContent =
    timing.period === "current"
      ? `${monthNumber}月${timing.elapsedDays}日時点`
      : timing.period === "past"
        ? `${monthNumber}月実績`
        : `${monthNumber}月目標`;

  const forecastSales =
    timing.period === "current" && timing.elapsedDays > 0
      ? (sales / timing.elapsedDays) * timing.totalDays
      : timing.period === "past"
        ? sales
        : 0;
  const remainingSales = Math.max(0, goal.sales - sales);
  const remainingProfit = Math.max(0, goal.profit - profit);
  const remainingCount = Math.max(0, goal.soldCount - soldCount);
  const dailySalesNeeded = timing.remainingDays > 0 ? remainingSales / timing.remainingDays : remainingSales;
  const remainingWeeks = Math.max(1, timing.remainingDays / 7);
  const weeklyCountNeeded = Math.ceil(remainingCount / remainingWeeks);

  output.goalForecastSales.textContent = formatYen(forecastSales);
  output.goalDailySalesNeeded.textContent = formatYen(dailySalesNeeded);
  output.goalWeeklyCountNeeded.textContent = `週${numberFormatter.format(weeklyCountNeeded)}件`;
  output.goalWeeklyTotal.textContent = `累計 ${formatYen(sales)}`;
  output.goalForecastMessage.textContent =
    timing.period === "future"
      ? "販売開始前"
      : sales >= goal.sales
        ? "売上目標を達成しました"
        : forecastSales >= goal.sales
          ? "このペースなら達成圏内"
          : "ペースアップが必要です";

  output.goalActionCount.textContent = remainingCount ? `残り${numberFormatter.format(remainingCount)}件を販売` : "販売数目標を達成";
  output.goalActionProfit.textContent = remainingProfit ? `利益を${formatYen(remainingProfit)}追加` : "利益目標を達成";
  output.goalActionMargin.textContent =
    marginDifference >= 0
      ? `利益率${percentFormatter.format(goal.margin)}%以上を維持`
      : `利益率をあと${percentFormatter.format(Math.abs(marginDifference))}pt改善`;

  renderGoalChart(monthlyItems, goal.sales, timing);
}

function renderInventory() {
  const items = getFilteredItems();
  output.inventoryBody.replaceChildren(...items.map(createRow));
  output.emptyState.hidden = items.length > 0;
}

function getListingAge(item) {
  if (!item.listingDate) return null;
  const endDate = soldStatuses.has(item.status) && item.saleDate ? item.saleDate : today();
  return daysBetween(item.listingDate, endDate);
}

function getListingAgeStage(days) {
  if (days === null) return "unset";
  if (days >= 28) return "late";
  if (days >= 14) return "aging";
  if (days >= 7) return "watch";
  return "fresh";
}

function createMarketBadge(market) {
  const badge = document.createElement("span");
  badge.className = "market-badge";
  badge.dataset.market = market;
  badge.title = market;

  const dot = document.createElement("span");
  dot.className = "market-dot";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = market;
  badge.append(dot, label);
  return badge;
}

function createItemPhoto(item) {
  const imageUrl = normalizeImageUrl(item.imageUrl);
  if (!imageUrl) {
    const empty = document.createElement("span");
    empty.className = "item-photo item-photo-empty";
    empty.textContent = "写真なし";
    return empty;
  }

  const link = document.createElement("a");
  link.className = "item-photo";
  link.href = imageUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${item.name}の写真を開く`);

  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = `${item.name}の写真`;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener(
    "error",
    () => {
      const empty = document.createElement("span");
      empty.className = "item-photo item-photo-empty";
      empty.textContent = "写真なし";
      link.replaceWith(empty);
    },
    { once: true },
  );
  link.append(image);
  return link;
}

function renderListingGlance(row, item) {
  const glance = row.querySelector(".listing-glance");
  const marketBadges = row.querySelector(".market-badges");
  const ageOutput = row.querySelector(".listing-age");
  const markets = getItemMarkets(item);
  const age = getListingAge(item);
  const ageText = age === null ? "" : `${numberFormatter.format(age)}日`;

  marketBadges.replaceChildren(...markets.map(createMarketBadge));
  ageOutput.textContent = ageText;
  ageOutput.dataset.ageStage = getListingAgeStage(age);
  ageOutput.hidden = age === null;
  ageOutput.setAttribute(
    "aria-label",
    soldStatuses.has(item.status) && item.saleDate ? `出品から販売まで${ageText}` : `出品から${ageText}`,
  );
  glance.hidden = !markets.length && age === null;
}

function createRow(item) {
  const calc = getCalculations(item);
  const hasSalePrice = Number(item.salePrice) > 0;
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="ledger-no-cell" data-label="No."></td>
    <td class="photo-cell" data-label="写真"></td>
    <td data-label="商品">
      <div class="item-cell">
        <strong></strong>
        <div class="item-detail-line">
          <span class="item-meta"></span>
          <select class="storage-badge storage-select" aria-label="保管場所を変更"></select>
        </div>
      </div>
    </td>
    <td data-label="状態">
      <div class="status-stack">
        <select class="status-badge status-select" aria-label="状態を変更"></select>
        <div class="listing-glance" hidden>
          <div class="market-badges" aria-label="出品先"></div>
          <span class="listing-age"></span>
        </div>
      </div>
    </td>
    <td class="purchase-price-cell" data-label="仕入れ値"></td>
    <td class="listing-date-cell" data-label="出品日"></td>
    <td class="sale-date-cell" data-label="販売日"></td>
    <td class="sale-days-cell" data-label="販売まで"></td>
    <td class="sale-price-cell" data-label="販売価格"></td>
    <td class="break-even-cell" data-label="損益分岐点"></td>
    <td class="profit-cell" data-label="利益"></td>
    <td class="margin-cell" data-label="利益率"></td>
    <td data-label="操作">
      <div class="row-actions">
        <button class="icon-button tiny edit-action" type="button" aria-label="編集" title="編集">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button class="icon-button tiny danger delete-action" type="button" aria-label="削除" title="削除">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="m19 6-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
          </svg>
        </button>
      </div>
    </td>
  `;

  row.querySelector(".ledger-no-cell").textContent = item.ledgerNo || "-";
  const currentStorageLocation = getCurrentStorageLocation(item);
  row.dataset.storageLocation = currentStorageLocation;
  row.querySelector(".photo-cell").replaceChildren(createItemPhoto(item));
  row.querySelector(".item-cell strong").textContent = item.name;
  row.querySelector(".item-meta").textContent = [item.category, item.memo]
    .filter(Boolean)
    .join(" / ");
  const storageSelect = row.querySelector(".storage-select");
  storageSelect.replaceChildren(
    ...storageLocationOptions.map((location) => {
      const option = document.createElement("option");
      option.value = location;
      option.textContent = location;
      option.selected = location === currentStorageLocation;
      return option;
    }),
  );
  storageSelect.dataset.location = currentStorageLocation;
  storageSelect.hidden = !currentStorageLocation;
  storageSelect.setAttribute("aria-label", `${item.name}の保管場所を変更`);
  const statusSelect = row.querySelector(".status-select");
  statusSelect.replaceChildren(
    ...statusOptions.map((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      option.selected = status === item.status;
      return option;
    }),
  );
  statusSelect.dataset.status = item.status;
  renderListingGlance(row, item);
  row.querySelector(".purchase-price-cell").textContent = formatYen(item.purchasePrice);
  row.querySelector(".listing-date-cell").textContent = item.listingDate || "-";
  row.querySelector(".sale-date-cell").textContent = item.saleDate || "-";
  row.querySelector(".sale-days-cell").textContent = formatSaleDays(item);
  row.querySelector(".sale-price-cell").textContent = hasSalePrice ? formatYen(item.salePrice) : "未入力";
  row.querySelector(".break-even-cell").textContent = formatYen(calc.breakEven);
  row.querySelector(".profit-cell").textContent = hasSalePrice ? formatYen(calc.profit) : "-";
  row.querySelector(".profit-cell").classList.toggle("loss-text", hasSalePrice && calc.profit < 0);
  row.querySelector(".margin-cell").textContent = hasSalePrice ? `${percentFormatter.format(calc.margin)}%` : "-";
  row.querySelector(".margin-cell").classList.toggle("loss-text", hasSalePrice && calc.margin < 0);
  statusSelect.addEventListener("change", () => changeItemStatus(item.id, statusSelect.value));
  storageSelect.addEventListener("change", () => changeItemStorageLocation(item.id, storageSelect.value));
  row.querySelector(".edit-action").addEventListener("click", () => fillForm(item));
  row.querySelector(".delete-action").addEventListener("click", () => deleteItem(item.id));

  return row;
}

function applyStatusDates(item, previousStatus = "") {
  if (soldStatuses.has(item.status) && !item.saleDate) {
    item.saleDate = today();
  }

  if (!soldStatuses.has(item.status) && soldStatuses.has(previousStatus)) {
    item.saleDate = "";
    item.actualFee = null;
  }

  if (item.status === "出品中" && !item.listingDate) {
    item.listingDate = today();
  }

  return item;
}

function renderFilters() {
  const counts = new Map(statusOptions.map((status) => [status, 0]));
  state.items.forEach((item) => {
    counts.set(item.status, (counts.get(item.status) || 0) + 1);
  });

  controls.statusFilters.querySelectorAll(".filter-chip").forEach((button) => {
    const status = button.dataset.status;
    const count = status === "all" ? state.items.length : counts.get(status) || 0;
    const label = button.querySelector(".filter-label")?.textContent || status;
    const countOutput = button.querySelector(".filter-count");
    if (countOutput) countOutput.textContent = numberFormatter.format(count);
    button.setAttribute("aria-label", `${label} ${numberFormatter.format(count)}件`);
    button.classList.toggle("active", button.dataset.status === state.filterStatus);
  });

  const locationItems =
    state.filterStatus === "all" ? state.items : state.items.filter((item) => item.status === state.filterStatus);
  const locationCounts = new Map(storageLocationOptions.map((location) => [location, 0]));
  locationItems.forEach((item) => {
    const location = getCurrentStorageLocation(item);
    if (!location) return;
    locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
  });

  controls.locationFilters.querySelectorAll(".location-filter").forEach((button) => {
    const location = button.dataset.location;
    const count = location === "all" ? locationItems.length : locationCounts.get(location) || 0;
    const countOutput = button.querySelector(".location-filter-count");
    if (countOutput) countOutput.textContent = numberFormatter.format(count);
    button.classList.toggle("active", location === state.filterLocation);
  });
}

function render() {
  renderSummary();
  renderGoals();
  renderFilters();
  renderInventory();
}

function saveItem(event) {
  event.preventDefault();
  if (photoUploadInProgress) {
    showToast("写真の保存が完了するまでお待ちください");
    return;
  }
  const formItem = readForm();
  if (!formItem.markets.length) {
    controls.marketPicker.open = true;
    controls.marketPicker.querySelector("summary")?.focus();
    showToast("出品先を1つ以上選択してください");
    return;
  }
  const existing = state.items.find((candidate) => candidate.id === formItem.id);
  const item = normalizeItem({
    ...existing,
    ...formItem,
    category: existing?.category || "",
    sourceRef: existing?.sourceRef || "",
  });
  if (!item.name) return;

  applyStatusDates(item, existing?.status || "");
  fields.saleDate.value = item.saleDate;
  fields.listingDate.value = item.listingDate;
  forgetPendingDeletion(item.id);

  const index = state.items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    state.items[index] = item;
  } else {
    state.items.unshift(item);
  }

  saveItems();
  render();
  resetForm();
}

function changeItemStatus(id, status) {
  const index = state.items.findIndex((candidate) => candidate.id === id);
  if (index < 0) return;

  const previousStatus = state.items[index].status;
  const item = applyStatusDates(
    normalizeItem({
      ...state.items[index],
      status: normalizeStatus(status),
      updatedAt: new Date().toISOString(),
    }),
    previousStatus,
  );

  state.items[index] = item;

  if (fields.id.value === item.id) {
    fields.status.value = item.status;
    fields.saleDate.value = item.saleDate;
    fields.listingDate.value = item.listingDate;
    fields.actualFee.value =
      item.actualFee === null || item.actualFee === undefined || item.actualFee === ""
        ? ""
        : formatInput(item.actualFee, true);
    updateFormPreview();
  }

  saveItems();
  render();
  showToast(`状態を「${item.status}」に変更しました`);
}

function changeItemStorageLocation(id, storageLocation) {
  const index = state.items.findIndex((candidate) => candidate.id === id);
  if (index < 0 || soldStatuses.has(state.items[index].status)) return;

  const item = normalizeItem({
    ...state.items[index],
    storageLocation: normalizeStorageLocation(storageLocation),
    updatedAt: new Date().toISOString(),
  });
  state.items[index] = item;

  if (fields.id.value === item.id) {
    fields.storageLocation.value = item.storageLocation;
  }

  saveItems();
  render();
  showToast(`保管場所を「${item.storageLocation}」に変更しました`);
}

function deleteItem(id) {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;
  const confirmed = window.confirm(`${item.name} を削除しますか？`);
  if (!confirmed) return;
  rememberPendingDeletion(id);
  state.items = state.items.filter((candidate) => candidate.id !== id);
  saveItems();
  render();
  if (fields.id.value === id) resetForm();
}

function exportCsv() {
  const header = [
    "No.",
    "商品名",
    "写真URL",
    "販売先",
    "状態",
    "保管場所",
    "仕入日",
    "出品日",
    "販売日",
    "仕入れ値",
    "販売価格",
    "送料",
    "配送",
    "梱包費",
    "手数料率",
    "手数料端数",
    "手数料実額",
    "損益分岐点",
    "利益",
    "利益率",
    "カテゴリ",
    "管理元ID",
    "メモ",
  ];

  const rows = state.items.map((item) => {
    const calc = getCalculations(item);
    return [
      item.ledgerNo,
      item.name,
      item.imageUrl,
      getItemMarkets(item).join("・"),
      item.status,
      item.storageLocation,
      item.purchaseDate,
      item.listingDate,
      item.saleDate,
      item.purchasePrice,
      item.salePrice,
      item.shipping,
      item.shippingMethod === tanomeruShippingMethod ? "たのメル便" : "",
      item.packing,
      item.feeRate,
      item.feeRounding === "round" ? "四捨五入" : "切り上げ",
      item.actualFee ?? "",
      calc.breakEven,
      item.salePrice > 0 ? Math.round(calc.profit) : "",
      item.salePrice > 0 ? `${percentFormatter.format(calc.margin)}%` : "",
      item.category,
      item.sourceRef,
      item.memo,
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sedori-inventory-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value !== ""));
}

function columnIndex(header, names, fallback = -1) {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return index;
  }
  return fallback;
}

function isManagementSheetCsv(rows) {
  return rows[3]?.[2] === "ステータス" && rows[3]?.[3] === "品名" && rows[3]?.[23] === "売上金額";
}

function mapManagementSheetRows(rows) {
  const listingDateColumn = columnIndex(rows[3] || [], ["出品日", "掲載日", "出品開始日"]);

  return rows
    .filter((row) => /^\d+$/.test(row[0] || "") && row[3])
    .map((row) => {
      const status = normalizeStatus(row[2]);
      const purchasePrice = parseMoney(row[28] || row[7]);
      const shipping = parseMoney(row[30] || row[21] || row[20]);
      const packing = parseMoney(row[31] || row[22]);
      const salePrice = parseMoney(row[23]);
      const category = [row[4], row[5]].filter(Boolean).join(" / ");
      const sourceStore = String(row[8] || row[27] || "").trim();
      const memo = [sourceStore && `仕入先:${sourceStore}`, row[36]].filter(Boolean).join(" / ");

      return normalizeItem({
        ledgerNo: row[0],
        sourceRef: `管理表:${row[0]}`,
        name: row[3],
        market: normalizeMarket(row[11]),
        status,
        purchaseDate: normalizeDate(row[6]),
        listingDate: listingDateColumn >= 0 ? normalizeDate(row[listingDateColumn]) : "",
        saleDate: normalizeDate(row[25]),
        purchasePrice,
        salePrice,
        shipping,
        packing,
        feeRate: parseRate(row[13] || defaultFeeRate),
        actualFee: soldStatuses.has(status) && row[29] !== "" ? parseMoney(row[29]) : null,
        category,
        memo,
      });
    });
}

function mapInventoryLedgerRows(rows) {
  const [header = [], ...records] = rows;
  const ledgerNoColumn = columnIndex(header, ["No.", "No", "№", "古物台帳No", "古物台帳№", "台帳No", "台帳№", "番号"]);
  const nameColumn = columnIndex(header, ["商品名"], 0);
  const imageUrlColumn = columnIndex(header, ["写真URL", "画像URL", "サムネイルURL"]);
  const marketColumn = columnIndex(header, ["販売先"], 1);
  const statusColumn = columnIndex(header, ["状態"], 2);
  const storageLocationColumn = columnIndex(header, ["保管場所", "保管先", "在庫場所"]);
  const purchaseDateColumn = columnIndex(header, ["仕入日"], 3);
  const listingDateColumn = columnIndex(header, ["出品日", "掲載日", "出品開始日"]);
  const saleDateColumn = columnIndex(header, ["販売日"], 4);
  const purchasePriceColumn = columnIndex(header, ["仕入れ値"], 5);
  const salePriceColumn = columnIndex(header, ["販売価格"], 6);
  const shippingColumn = columnIndex(header, ["送料"], 7);
  const shippingMethodColumn = columnIndex(header, ["配送", "配送方法"]);
  const packingColumn = columnIndex(header, ["梱包費", "その他経費"], 8);
  const feeRateColumn = columnIndex(header, ["手数料率"], 9);
  const feeRoundingColumn = columnIndex(header, ["手数料端数", "手数料丸め"]);
  const actualFeeColumn = columnIndex(header, ["手数料実額"]);
  const categoryColumn = columnIndex(header, ["カテゴリ"]);
  const sourceRefColumn = columnIndex(header, ["管理元ID"]);
  const memoColumn = columnIndex(header, ["メモ"], header.length - 1);

  return records
    .map((row) =>
      normalizeItem({
        ledgerNo: ledgerNoColumn >= 0 ? row[ledgerNoColumn] : "",
        name: row[nameColumn],
        imageUrl: imageUrlColumn >= 0 ? row[imageUrlColumn] : "",
        markets: normalizeMarkets(row[marketColumn]),
        status: normalizeStatus(row[statusColumn]),
        storageLocation: storageLocationColumn >= 0 ? normalizeStorageLocation(row[storageLocationColumn]) : "自宅",
        purchaseDate: normalizeDate(row[purchaseDateColumn]),
        listingDate: listingDateColumn >= 0 ? normalizeDate(row[listingDateColumn]) : "",
        saleDate: normalizeDate(row[saleDateColumn]),
        purchasePrice: parseMoney(row[purchasePriceColumn]),
        salePrice: parseMoney(row[salePriceColumn]),
        shipping: parseMoney(row[shippingColumn]),
        shippingMethod: shippingMethodColumn >= 0 ? normalizeShippingMethod(row[shippingMethodColumn]) : "",
        packing: parseMoney(row[packingColumn]),
        feeRate: parseRate(row[feeRateColumn]),
        feeRounding: feeRoundingColumn >= 0 ? normalizeFeeRounding(row[feeRoundingColumn]) : "",
        actualFee: actualFeeColumn >= 0 && row[actualFeeColumn] !== "" ? parseMoney(row[actualFeeColumn]) : null,
        category: categoryColumn >= 0 ? row[categoryColumn] : "",
        sourceRef: sourceRefColumn >= 0 ? row[sourceRefColumn] : "",
        memo: row[memoColumn],
      }),
    )
    .filter((item) => item.name);
}

function getItemIdentity(item) {
  if (item.sourceRef) return item.sourceRef;
  if (item.ledgerNo) return `ledger:${item.ledgerNo}`;
  return [item.name, item.purchaseDate, item.listingDate, item.saleDate, item.purchasePrice, item.salePrice, item.market].join("|");
}

function mergeImportedItems(importedItems) {
  const merged = [...state.items];
  const indexByIdentity = new Map(merged.map((item, index) => [getItemIdentity(item), index]));
  let added = 0;
  let updated = 0;

  importedItems.forEach((item) => {
    const identity = getItemIdentity(item);
    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, merged.length);
      merged.push(item);
      added += 1;
      return;
    }

    merged[existingIndex] = { ...item, id: merged[existingIndex].id };
    updated += 1;
  });

  state.items = merged;
  return { added, updated };
}

function serializeItems(items) {
  return JSON.stringify(items.map(normalizeItem));
}

function hasLegacyStatusValues(items) {
  return items.some((item) => normalizeStatus(item.status) !== String(item.status || "").trim());
}

function getMergeKeys(item) {
  return [`id:${item.id}`, `identity:${getItemIdentity(item)}`].filter((value) => !value.endsWith(":"));
}

function isNewerItem(item, existing) {
  const itemTime = Date.parse(item.updatedAt || "");
  const existingTime = Date.parse(existing.updatedAt || "");
  if (Number.isFinite(itemTime) && Number.isFinite(existingTime)) return itemTime >= existingTime;
  if (Number.isFinite(itemTime)) return true;
  if (Number.isFinite(existingTime)) return false;
  return true;
}

function mergeItemCollections(primaryItems, secondaryItems) {
  const merged = [];
  const indexByKey = new Map();

  function indexItem(item, index) {
    getMergeKeys(item).forEach((key) => indexByKey.set(key, index));
  }

  function addItem(rawItem) {
    const item = normalizeItem(rawItem);
    if (!item.name) return;
    const keys = getMergeKeys(item);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const index = merged.push(item) - 1;
      indexItem(item, index);
      return;
    }

    const existing = merged[existingIndex];
    const nextItem = isNewerItem(item, existing) ? { ...existing, ...item, id: existing.id || item.id } : existing;
    merged[existingIndex] = nextItem;
    indexItem(nextItem, existingIndex);
  }

  primaryItems.forEach(addItem);
  secondaryItems.forEach(addItem);
  return merged;
}

function applyCloudItems(items) {
  cloudSync.applyingRemote = true;
  state.items = items.map(normalizeItem).filter((item) => item.name);
  storeLocalItems();
  state.selectedMonth = getLatestSaleMonth() || state.selectedMonth || currentMonth();
  render();
  cloudSync.applyingRemote = false;
}

function mergePendingLocalWithRemote(remoteItems) {
  return applyPendingDeletions(mergeItemCollections(remoteItems, state.items));
}

function updateCloudVersion(result) {
  cloudSync.version = Number(result.version) || cloudSync.version;
  cloudSync.updatedAt = result.updatedAt || cloudSync.updatedAt;
}

function finishCloudSave(result, revision) {
  updateCloudVersion(result);
  cloudSync.available = true;
  if (clearPendingCloudChanges(revision)) {
    setCloudSyncStatus("synced", formatCloudSyncStatus());
  }
}

async function fetchCloudInventory() {
  const response = await fetch(cloudApiUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Cloud inventory is unavailable: ${response.status}`);
  return response.json();
}

async function writeCloudInventory(options = {}) {
  const response = await fetch(cloudApiUrl, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      items: state.items,
      baseVersion: cloudSync.version,
      force: options.force === true,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (response.status === 409) return { conflict: true, ...body };
  if (!response.ok) throw new Error(body.error || `Cloud save failed: ${response.status}`);
  return body;
}

function queueCloudSave() {
  if (!cloudSync.initialized || cloudSync.applyingRemote) return;
  clearTimeout(cloudSync.saveTimer);
  cloudSync.saveTimer = setTimeout(() => {
    pushCloudInventory().catch(() => {});
  }, 500);
}

async function pushCloudInventory(options = {}) {
  if (!cloudSync.initialized) return;
  if (cloudSync.saving) {
    cloudSync.needsSave = true;
    return;
  }

  cloudSync.saving = true;
  const revision = cloudSync.localRevision;
  setCloudSyncStatus("saving", "端末の変更をクラウドへ同期中");
  try {
    const result = await writeCloudInventory(options);

    if (result.conflict) {
      updateCloudVersion(result);
      const remoteItems = Array.isArray(result.items) ? result.items : [];
      const merged = mergePendingLocalWithRemote(remoteItems);
      applyCloudItems(merged);
      const retry = await writeCloudInventory({ force: true });
      finishCloudSave(retry, revision);
      showToast("クラウドの在庫とマージしました");
      return;
    }

    finishCloudSave(result, revision);
  } catch {
    cloudSync.available = false;
    setCloudSyncStatus("error", "同期できません。通信を確認すると自動で再試行します");
  } finally {
    cloudSync.saving = false;
    if (cloudSync.needsSave) {
      cloudSync.needsSave = false;
      queueCloudSave();
    }
  }
}

async function pullCloudInventory(options = {}) {
  if (!cloudSync.initialized || cloudSync.saving) return;

  try {
    const remote = await fetchCloudInventory();
    const remoteVersion = Number(remote.version) || 0;
    cloudSync.available = true;
    cloudSync.updatedAt = remote.updatedAt || cloudSync.updatedAt;
    if (remoteVersion <= cloudSync.version) {
      if (hasPendingCloudChanges()) {
        queueCloudSave();
      } else {
        setCloudSyncStatus("synced", formatCloudSyncStatus());
      }
      return;
    }

    const remoteItems = Array.isArray(remote.items) ? remote.items : [];
    const remoteJson = serializeItems(remoteItems);
    const localJson = serializeItems(state.items);

    cloudSync.version = remoteVersion;
    if (hasPendingCloudChanges()) {
      const merged = mergePendingLocalWithRemote(remoteItems);
      const mergedJson = serializeItems(merged);
      if (mergedJson !== localJson) applyCloudItems(merged);
      if (mergedJson !== remoteJson || hasLegacyStatusValues(remoteItems)) {
        queueCloudSave();
      } else {
        clearPendingCloudChanges();
        setCloudSyncStatus("synced", formatCloudSyncStatus());
      }
      return;
    }

    if (remoteJson !== localJson) {
      applyCloudItems(remoteItems);
      if (!options.silent) showToast("クラウドから更新しました");
    }
    setCloudSyncStatus("synced", formatCloudSyncStatus());
  } catch {
    cloudSync.available = false;
    setCloudSyncStatus("error", "クラウドを確認できません。通信時に自動更新します");
  }
}

function startCloudPolling() {
  clearInterval(cloudSync.pollTimer);
  cloudSync.pollTimer = setInterval(() => {
    pullCloudInventory({ silent: true }).catch(() => {});
  }, cloudSyncIntervalMs);
}

async function initializeCloudSync() {
  if (!isCloudSyncHost) {
    setCloudSyncStatus("error", "このURLは端末保存版です。同期版で最新版を確認してください", {
      showCloudLink: true,
    });
    return;
  }

  setCloudSyncStatus("checking", "クラウドの最新版を確認中");
  try {
    const remote = await fetchCloudInventory();
    cloudSync.available = true;
    cloudSync.initialized = true;
    cloudSync.version = Number(remote.version) || 0;
    cloudSync.updatedAt = remote.updatedAt || null;

    const remoteItems = Array.isArray(remote.items) ? remote.items : [];
    if (remoteItems.length) {
      if (hasPendingCloudChanges()) {
        const merged = mergePendingLocalWithRemote(remoteItems);
        const shouldUpload =
          serializeItems(merged) !== serializeItems(remoteItems) || hasLegacyStatusValues(remoteItems);
        applyCloudItems(merged);
        if (shouldUpload) {
          await pushCloudInventory({ force: true });
        } else {
          clearPendingCloudChanges();
          setCloudSyncStatus("synced", formatCloudSyncStatus());
        }
      } else {
        applyCloudItems(remoteItems);
        setCloudSyncStatus("synced", formatCloudSyncStatus());
      }
    } else if (state.items.length) {
      if (!hasPendingCloudChanges()) markPendingCloudChanges();
      await pushCloudInventory({ force: true });
      showToast("端末内の在庫をクラウドへ同期しました");
    } else {
      clearPendingCloudChanges();
      setCloudSyncStatus("synced", formatCloudSyncStatus());
    }

    startCloudPolling();
  } catch {
    cloudSync.available = false;
    cloudSync.initialized = false;
    setCloudSyncStatus("error", "クラウドに接続できません。再表示すると再試行します");
  }
}

function hasPendingGoalCloudChanges() {
  return localStorage.getItem(goalCloudPendingSyncKey) === "1";
}

function markPendingGoalCloudChanges() {
  goalCloudSync.localRevision += 1;
  localStorage.setItem(goalCloudPendingSyncKey, "1");
  if (isCloudSyncHost) setCloudSyncStatus("saving", "目標をクラウドへ同期中");
}

function clearPendingGoalCloudChanges(expectedRevision = goalCloudSync.localRevision) {
  if (expectedRevision !== goalCloudSync.localRevision) return false;
  localStorage.removeItem(goalCloudPendingSyncKey);
  return true;
}

function serializeGoals(goals) {
  return JSON.stringify(normalizeGoalCollection(goals));
}

function mergeGoalCollections(primaryGoals, secondaryGoals) {
  const merged = normalizeGoalCollection(primaryGoals);
  Object.entries(normalizeGoalCollection(secondaryGoals)).forEach(([month, goal]) => {
    const existing = merged[month];
    if (!existing) {
      merged[month] = goal;
      return;
    }
    const incomingTime = Date.parse(goal.updatedAt || "");
    const existingTime = Date.parse(existing.updatedAt || "");
    if (!Number.isFinite(existingTime) || (Number.isFinite(incomingTime) && incomingTime >= existingTime)) {
      merged[month] = goal;
    }
  });
  return merged;
}

function applyCloudGoals(goals) {
  goalCloudSync.applyingRemote = true;
  state.goals = normalizeGoalCollection(goals);
  storeLocalGoals();
  renderGoals();
  goalCloudSync.applyingRemote = false;
}

async function fetchCloudGoals() {
  const response = await fetch(goalCloudApiUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Cloud goals are unavailable: ${response.status}`);
  return response.json();
}

async function writeCloudGoals(options = {}) {
  const response = await fetch(goalCloudApiUrl, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      goals: state.goals,
      baseVersion: goalCloudSync.version,
      force: options.force === true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 409) return { conflict: true, ...body };
  if (!response.ok) throw new Error(body.error || `Cloud goal save failed: ${response.status}`);
  return body;
}

function queueGoalCloudSave() {
  if (!goalCloudSync.initialized || goalCloudSync.applyingRemote) return;
  clearTimeout(goalCloudSync.saveTimer);
  goalCloudSync.saveTimer = setTimeout(() => {
    pushCloudGoals().catch(() => {});
  }, 500);
}

function finishGoalCloudSave(result, revision) {
  goalCloudSync.version = Number(result.version) || goalCloudSync.version;
  goalCloudSync.updatedAt = result.updatedAt || goalCloudSync.updatedAt;
  if (clearPendingGoalCloudChanges(revision)) {
    setCloudSyncStatus("synced", formatCloudSyncStatus());
  }
}

async function pushCloudGoals(options = {}) {
  if (!goalCloudSync.initialized) return;
  if (goalCloudSync.saving) {
    goalCloudSync.needsSave = true;
    return;
  }
  goalCloudSync.saving = true;
  const revision = goalCloudSync.localRevision;
  setCloudSyncStatus("saving", "目標をクラウドへ同期中");
  try {
    const result = await writeCloudGoals(options);
    if (result.conflict) {
      goalCloudSync.version = Number(result.version) || goalCloudSync.version;
      applyCloudGoals(mergeGoalCollections(result.goals, state.goals));
      const retry = await writeCloudGoals({ force: true });
      finishGoalCloudSave(retry, revision);
      return;
    }
    finishGoalCloudSave(result, revision);
  } catch {
    setCloudSyncStatus("error", "目標を同期できません。通信時に自動で再試行します");
  } finally {
    goalCloudSync.saving = false;
    if (goalCloudSync.needsSave) {
      goalCloudSync.needsSave = false;
      queueGoalCloudSave();
    }
  }
}

async function pullCloudGoals(options = {}) {
  if (!goalCloudSync.initialized || goalCloudSync.saving) return;
  try {
    const remote = await fetchCloudGoals();
    const remoteVersion = Number(remote.version) || 0;
    if (remoteVersion <= goalCloudSync.version) {
      if (hasPendingGoalCloudChanges()) queueGoalCloudSave();
      return;
    }
    const remoteGoals = normalizeGoalCollection(remote.goals);
    goalCloudSync.version = remoteVersion;
    goalCloudSync.updatedAt = remote.updatedAt || goalCloudSync.updatedAt;
    if (hasPendingGoalCloudChanges()) {
      const merged = mergeGoalCollections(remoteGoals, state.goals);
      applyCloudGoals(merged);
      if (serializeGoals(merged) !== serializeGoals(remoteGoals)) {
        queueGoalCloudSave();
      } else {
        clearPendingGoalCloudChanges();
      }
      return;
    }
    if (serializeGoals(remoteGoals) !== serializeGoals(state.goals)) {
      applyCloudGoals(remoteGoals);
      if (!options.silent) showToast("クラウドから目標を更新しました");
    }
  } catch {
    setCloudSyncStatus("error", "目標のクラウド同期を確認できません");
  }
}

function startGoalCloudPolling() {
  clearInterval(goalCloudSync.pollTimer);
  goalCloudSync.pollTimer = setInterval(() => {
    pullCloudGoals({ silent: true }).catch(() => {});
  }, cloudSyncIntervalMs);
}

async function initializeGoalCloudSync() {
  if (!isCloudSyncHost) return;
  try {
    const remote = await fetchCloudGoals();
    goalCloudSync.initialized = true;
    goalCloudSync.version = Number(remote.version) || 0;
    goalCloudSync.updatedAt = remote.updatedAt || null;
    const remoteGoals = normalizeGoalCollection(remote.goals);
    if (hasPendingGoalCloudChanges()) {
      const merged = mergeGoalCollections(remoteGoals, state.goals);
      applyCloudGoals(merged);
      if (serializeGoals(merged) !== serializeGoals(remoteGoals)) {
        await pushCloudGoals({ force: true });
      } else {
        clearPendingGoalCloudChanges();
      }
    } else if (Object.keys(remoteGoals).length) {
      applyCloudGoals(remoteGoals);
    } else if (Object.keys(state.goals).length) {
      markPendingGoalCloudChanges();
      await pushCloudGoals({ force: true });
    }
    startGoalCloudPolling();
  } catch {
    goalCloudSync.initialized = false;
    setCloudSyncStatus("error", "目標のクラウド同期に接続できません");
  }
}

let toastTimer;
function showToast(message) {
  if (!controls.toast) {
    window.alert(message);
    return;
  }
  controls.toast.textContent = message;
  controls.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => controls.toast.classList.remove("show"), 2600);
}

function importText(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const importedItems = isManagementSheetCsv(rows) ? mapManagementSheetRows(rows) : mapInventoryLedgerRows(rows);
  if (!importedItems.length) throw new Error("取り込める商品がありません");

  const result = mergeImportedItems(importedItems);
  saveItems();
  render();
  showToast(`${importedItems.length}件を読込（追加${result.added}・更新${result.updated}）`);
  return { count: importedItems.length, ...result };
}

function reloadDefaultInventory() {
  const defaultItems = getDefaultInventoryItems().map(normalizeItem).filter((item) => item.name);
  if (!defaultItems.length) {
    showToast("初期データが見つかりませんでした");
    return;
  }

  const confirmed = window.confirm(
    "スマホ内の保存データを削除して、公開中の初期データを入れ直します。必要なら先にCSVを書き出してください。実行しますか？",
  );
  if (!confirmed) return;

  const defaultIds = new Set(defaultItems.map((item) => String(item.id)));
  state.items.forEach((item) => {
    if (!defaultIds.has(String(item.id))) rememberPendingDeletion(item.id);
  });
  state.items = defaultItems;
  state.filterStatus = "all";
  state.filterLocation = "all";
  state.search = "";
  controls.searchInput.value = "";
  localStorage.setItem(defaultInventoryLoadedKey, defaultInventoryVersion);
  saveItems();
  state.selectedMonth = getLatestSaleMonth() || currentMonth();
  resetForm({ focus: false });
  render();
  showToast(`${state.items.length}件の初期データに更新しました`);
}

async function importCsv(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    importText(await file.text());
  } catch (error) {
    showToast(error.message || "CSVを読み込めませんでした");
  } finally {
    controls.importInput.value = "";
  }
}

function openPasteDialog() {
  if (typeof controls.csvPasteDialog?.showModal === "function") {
    controls.csvPasteDialog.showModal();
  } else {
    controls.csvPasteDialog?.setAttribute("open", "");
  }
  controls.csvPasteInput?.focus();
}

function closePasteDialog() {
  if (typeof controls.csvPasteDialog?.close === "function") {
    controls.csvPasteDialog.close();
  } else {
    controls.csvPasteDialog?.removeAttribute("open");
  }
}

[fields.purchasePrice, fields.salePrice, fields.shipping, fields.packing, fields.actualFee].forEach((input) => {
  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatInput(input.value, input === fields.purchasePrice || input === fields.actualFee);
    if (cursorAtEnd) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
    updateFormPreview();
  });

  input.addEventListener("focus", () => input.select());
});

[goalFields.sales, goalFields.profit].forEach((input) => {
  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatInput(input.value, true);
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
  input.addEventListener("focus", () => input.select());
});

[fields.feeRate, fields.status, fields.saleDate].forEach((input) => {
  input.addEventListener("input", updateFormPreview);
  input.addEventListener("change", updateFormPreview);
});

fields.markets.forEach((input) => {
  input.addEventListener("change", updateMarketSummary);
});

fields.photoFile.addEventListener("change", handlePhotoFileChange);
controls.removePhotoButton.addEventListener("click", removeFormPhoto);
fields.imageUrl.addEventListener("input", () => {
  if (!photoUploadInProgress) releasePhotoPreviewObjectUrl();
  setPhotoUploadStatus();
  updateFormPhotoPreview();
});
fields.imageUrl.addEventListener("change", () => {
  fields.imageUrl.value = normalizeImageUrl(fields.imageUrl.value);
  updateFormPhotoPreview();
});
fields.name.addEventListener("input", updateFormPhotoPreview);
output.formPhotoImage.addEventListener("error", () => {
  output.formPhotoImage.hidden = true;
  output.formPhotoEmpty.hidden = false;
});

form.addEventListener("submit", saveItem);
goalForm.addEventListener("submit", saveMonthlyGoal);
controls.resetButton.addEventListener("click", resetForm);
controls.openGoalDialogButton.addEventListener("click", openGoalDialog);
controls.closeGoalDialogButton.addEventListener("click", closeGoalDialog);
controls.exportButton.addEventListener("click", exportCsv);
controls.importInput.addEventListener("change", importCsv);
controls.pasteImportButton?.addEventListener("click", openPasteDialog);
controls.reloadDefaultButton?.addEventListener("click", reloadDefaultInventory);
controls.closePasteDialogButton?.addEventListener("click", closePasteDialog);
controls.confirmPasteImportButton?.addEventListener("click", () => {
  try {
    importText(controls.csvPasteInput.value);
    controls.csvPasteInput.value = "";
    closePasteDialog();
  } catch (error) {
    showToast(error.message || "CSVを読み込めませんでした");
  }
});
controls.previousMonthButton.addEventListener("click", () => {
  state.selectedMonth = shiftMonth(state.selectedMonth, -1);
  renderSummary();
});
controls.nextMonthButton.addEventListener("click", () => {
  state.selectedMonth = shiftMonth(state.selectedMonth, 1);
  renderSummary();
});
output.summaryMonthInput.addEventListener("input", (event) => {
  if (!event.target.value) return;
  state.selectedMonth = event.target.value;
  renderSummary();
});
controls.goalsPreviousMonthButton.addEventListener("click", () => {
  state.goalMonth = shiftMonth(state.goalMonth, -1);
  renderGoals();
});
controls.goalsNextMonthButton.addEventListener("click", () => {
  state.goalMonth = shiftMonth(state.goalMonth, 1);
  renderGoals();
});
output.goalMonthInput.addEventListener("input", (event) => {
  if (!event.target.value) return;
  state.goalMonth = event.target.value;
  renderGoals();
});
controls.viewTabs.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewTab));
});
controls.viewTargets.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewTarget));
});
controls.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderInventory();
});

controls.statusFilters.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-chip");
  if (!button) return;
  state.filterStatus = button.dataset.status;
  renderFilters();
  renderInventory();
});

controls.locationFilters.addEventListener("click", (event) => {
  const button = event.target.closest(".location-filter");
  if (!button) return;
  state.filterLocation = button.dataset.location;
  renderFilters();
  renderInventory();
});

document.addEventListener("click", (event) => {
  if (controls.marketPicker.open && !controls.marketPicker.contains(event.target)) {
    controls.marketPicker.open = false;
  }
});

if ("serviceWorker" in navigator) {
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

window.addEventListener("hashchange", () => {
  switchView(getInitialView(), { updateHash: false });
});

window.addEventListener("focus", () => {
  pullCloudInventory({ silent: true }).catch(() => {});
  pullCloudGoals({ silent: true }).catch(() => {});
});

window.addEventListener("storage", (event) => {
  if (event.key === storageKey && event.newValue) {
    try {
      const incoming = JSON.parse(event.newValue);
      if (!Array.isArray(incoming)) return;
      const merged = mergeItemCollections(state.items, incoming);
      if (serializeItems(merged) === serializeItems(state.items)) return;
      applyCloudItems(merged);
      markPendingCloudChanges();
      queueCloudSave();
      showToast("粗利計算の保存内容を反映しました");
    } catch {
      // Ignore malformed inventory updates from other tabs.
    }
  }

  if (event.key === goalStorageKey && event.newValue) {
    try {
      const incomingGoals = normalizeGoalCollection(JSON.parse(event.newValue));
      const mergedGoals = mergeGoalCollections(state.goals, incomingGoals);
      if (serializeGoals(mergedGoals) === serializeGoals(state.goals)) return;
      applyCloudGoals(mergedGoals);
      markPendingGoalCloudChanges();
      queueGoalCloudSave();
    } catch {
      // Ignore malformed goal updates from other tabs.
    }
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    pullCloudInventory({ silent: true }).catch(() => {});
    pullCloudGoals({ silent: true }).catch(() => {});
  }
});

configureCalculatorBackLink();
loadItems();
loadGoals();
state.selectedMonth = getLatestSaleMonth() || currentMonth();
state.goalMonth = currentMonth();
switchView(getInitialView(), { updateHash: false, scroll: false });
resetForm();
render();
initializeCloudSync();
initializeGoalCloudSync();
