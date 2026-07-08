const storageKey = "sedori-inventory-ledger:v1";
const defaultInventoryLoadedKey = "sedori-inventory-ledger:default-inventory-version";
const defaultInventoryVersion = "management-csv-20260625-v1";
const defaultFeeRate = 10;
const soldStatuses = new Set(["売却済み", "発送準備", "評価待ち", "完了"]);
const statusOptions = ["在庫", "売却済み", "出品前", "出品中", "発送準備", "評価待ち", "完了"];
const stockFilterValue = "stock";

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
  filterStatus: "all",
  search: "",
  activeView: "top",
  selectedMonth: currentMonth(),
};

const form = document.querySelector("#itemForm");
const fields = {
  id: document.querySelector("#itemId"),
  ledgerNo: document.querySelector("#ledgerNoInput"),
  name: document.querySelector("#nameInput"),
  market: document.querySelector("#marketInput"),
  status: document.querySelector("#statusInput"),
  purchaseDate: document.querySelector("#purchaseDateInput"),
  listingDate: document.querySelector("#listingDateInput"),
  saleDate: document.querySelector("#saleDateInput"),
  purchasePrice: document.querySelector("#purchasePriceInput"),
  salePrice: document.querySelector("#salePriceInput"),
  shipping: document.querySelector("#shippingInput"),
  packing: document.querySelector("#packingInput"),
  feeRate: document.querySelector("#feeRateInput"),
  memo: document.querySelector("#memoInput"),
};

const output = {
  formTitle: document.querySelector("#formTitle"),
  formBreakEven: document.querySelector("#formBreakEven"),
  formProfit: document.querySelector("#formProfit"),
  formMargin: document.querySelector("#formMargin"),
  stockCount: document.querySelector("#stockCount"),
  stockCost: document.querySelector("#stockCost"),
  monthlySales: document.querySelector("#monthlySales"),
  monthlyProfit: document.querySelector("#monthlyProfit"),
  summaryMonthInput: document.querySelector("#summaryMonthInput"),
  monthlySoldCount: document.querySelector("#monthlySoldCount"),
  monthEndStockCount: document.querySelector("#monthEndStockCount"),
  monthlyCost: document.querySelector("#monthlyCost"),
  monthlyAverageProfit: document.querySelector("#monthlyAverageProfit"),
  monthlyRoi: document.querySelector("#monthlyRoi"),
  inventoryBody: document.querySelector("#inventoryBody"),
  emptyState: document.querySelector("#emptyState"),
};

const controls = {
  resetButton: document.querySelector("#resetButton"),
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
  viewTabs: Array.from(document.querySelectorAll("[data-view-tab]")),
  viewPanels: Array.from(document.querySelectorAll("[data-view-panel]")),
  viewTargets: Array.from(document.querySelectorAll("[data-view-target]")),
  toast: document.querySelector("#toast"),
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

function formatInput(value) {
  const amount = parseMoney(value);
  return amount ? numberFormatter.format(amount) : "";
}

function formatYen(value) {
  return yenFormatter.format(Math.round(value || 0));
}

function calculateFee(price, feeRate) {
  return Math.ceil(price * (feeRate / 100));
}

function calculateBreakEvenPrice(totalCost, feeRate) {
  if (totalCost <= 0) return 0;

  const rate = feeRate / 100;
  let price = Math.ceil(totalCost / (1 - rate));

  while (price - calculateFee(price, feeRate) < totalCost) {
    price += 1;
  }

  while (price > 0 && price - 1 - calculateFee(price - 1, feeRate) >= totalCost) {
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
  const fee = hasActualFee ? Number(item.actualFee) || 0 : calculateFee(salePrice, feeRate);
  const profit = salePrice - fee - totalCost;
  const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const breakEven = calculateBreakEvenPrice(totalCost, feeRate);

  return { totalCost, fee, profit, margin, breakEven };
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

function getMonthEndDate(monthString) {
  const [year, month] = String(monthString || currentMonth()).split("-").map(Number);
  if (!year || !month) return "";
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getInitialView() {
  const view = window.location.hash.replace(/^#/, "");
  return ["top", "entry", "inventory"].includes(view) ? view : "top";
}

function switchView(view, options = {}) {
  const { updateHash = true, scroll = true } = options;
  const nextView = ["top", "entry", "inventory"].includes(view) ? view : "top";
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

function normalizeStatus(value) {
  const status = String(value || "").trim();
  if (!status) return "在庫";
  if (status === "販売済み") return "売却済み";
  if (["在庫", "売却済み", "出品前", "出品中", "発送準備", "評価待ち", "完了"].includes(status)) {
    return status;
  }
  return status;
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

function readForm() {
  return {
    id: fields.id.value || createId(),
    ledgerNo: normalizeLedgerNo(fields.ledgerNo.value),
    name: fields.name.value.trim(),
    market: fields.market.value,
    status: fields.status.value,
    purchaseDate: fields.purchaseDate.value,
    listingDate: fields.listingDate.value,
    saleDate: fields.saleDate.value,
    purchasePrice: parseMoney(fields.purchasePrice.value),
    salePrice: parseMoney(fields.salePrice.value),
    shipping: parseMoney(fields.shipping.value),
    packing: parseMoney(fields.packing.value),
    feeRate: parseRate(fields.feeRate.value),
    memo: fields.memo.value.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function setMoneyInputs() {
  [fields.purchasePrice, fields.salePrice, fields.shipping, fields.packing].forEach((input) => {
    input.value = formatInput(input.value);
  });
}

function updateFormPreview() {
  setMoneyInputs();
  const item = readForm();
  const calc = getCalculations(item);
  output.formBreakEven.textContent = formatYen(calc.breakEven);
  output.formProfit.textContent = formatYen(calc.profit);
  output.formMargin.textContent = `${percentFormatter.format(calc.margin)}%`;
  output.formProfit.classList.toggle("loss-text", calc.profit < 0);
}

function resetForm(options = {}) {
  const { focus = state.activeView === "entry" } = options;
  form.reset();
  fields.id.value = "";
  fields.ledgerNo.value = "";
  fields.purchaseDate.value = today();
  fields.feeRate.value = defaultFeeRate;
  output.formTitle.textContent = "商品登録";
  updateFormPreview();
  if (focus) fields.name.focus();
}

function fillForm(item) {
  fields.id.value = item.id;
  fields.ledgerNo.value = item.ledgerNo || "";
  fields.name.value = item.name;
  fields.market.value = normalizeMarket(item.market || "メルカリ");
  fields.status.value = normalizeStatus(item.status || "在庫");
  fields.purchaseDate.value = item.purchaseDate || "";
  fields.listingDate.value = item.listingDate || "";
  fields.saleDate.value = item.saleDate || "";
  fields.purchasePrice.value = formatInput(item.purchasePrice);
  fields.salePrice.value = formatInput(item.salePrice);
  fields.shipping.value = formatInput(item.shipping);
  fields.packing.value = formatInput(item.packing);
  fields.feeRate.value = parseRate(item.feeRate);
  fields.memo.value = item.memo || "";
  output.formTitle.textContent = "商品編集";
  updateFormPreview();
  switchView("entry");
  fields.name.focus();
}

function saveItems() {
  localStorage.setItem(storageKey, JSON.stringify(state.items));
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

function normalizeItem(item) {
  const sourceRef = String(item.sourceRef || "").trim();
  const ledgerNo =
    normalizeLedgerNo(item.ledgerNo ?? item.ledgerNumber ?? item.no ?? item.number ?? item["No."] ?? item["№"]) ||
    ledgerNoFromSourceRef(sourceRef);

  return {
    id: item.id || createId(),
    ledgerNo,
    name: item.name || "",
    market: normalizeMarket(item.market || "メルカリ"),
    status: normalizeStatus(item.status || "在庫"),
    purchaseDate: item.purchaseDate || "",
    listingDate: item.listingDate || "",
    saleDate: item.saleDate || "",
    purchasePrice: Number(item.purchasePrice) || 0,
    salePrice: Number(item.salePrice) || 0,
    shipping: Number(item.shipping) || 0,
    packing: Number(item.packing) || 0,
    feeRate: parseRate(item.feeRate),
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

function seedDefaultInventory() {
  const defaultItems = getDefaultInventoryItems().map(normalizeItem).filter((item) => item.name);
  if (!defaultItems.length) return;
  if (localStorage.getItem(defaultInventoryLoadedKey) === defaultInventoryVersion) return;

  const existingIdentities = new Set(state.items.map(getItemIdentity));
  const additions = defaultItems.filter((item) => !existingIdentities.has(getItemIdentity(item)));

  if (additions.length) {
    state.items = [...additions, ...state.items];
    saveItems();
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
      if (state.filterStatus === stockFilterValue) return !soldStatuses.has(item.status);
      return item.status === state.filterStatus;
    })
    .filter((item) => {
      if (!keyword) return true;
      return [item.ledgerNo, item.name, item.market, item.category, item.memo, item.sourceRef].some((value) =>
        String(value).toLowerCase().includes(keyword),
      );
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
  const roi = monthlyCost > 0 ? (monthlyProfit / monthlyCost) * 100 : 0;

  output.summaryMonthInput.value = state.selectedMonth;
  output.stockCount.textContent = numberFormatter.format(activeItems.length);
  output.stockCost.textContent = formatYen(stockCost);
  output.monthlySales.textContent = formatYen(monthlySales);
  output.monthlyProfit.textContent = formatYen(monthlyProfit);
  output.monthlySoldCount.textContent = numberFormatter.format(monthlyItems.length);
  output.monthEndStockCount.textContent = numberFormatter.format(monthEndItems.length);
  output.monthlyCost.textContent = formatYen(monthlyCost);
  output.monthlyAverageProfit.textContent = formatYen(averageProfit);
  output.monthlyRoi.textContent = `${percentFormatter.format(roi)}%`;
  output.monthlyProfit.classList.toggle("loss-text", monthlyProfit < 0);
  output.monthlyAverageProfit.classList.toggle("loss-text", averageProfit < 0);
  output.monthlyRoi.classList.toggle("loss-text", roi < 0);
}

function renderInventory() {
  const items = getFilteredItems();
  output.inventoryBody.replaceChildren(...items.map(createRow));
  output.emptyState.hidden = items.length > 0;
}

function createRow(item) {
  const calc = getCalculations(item);
  const hasSalePrice = Number(item.salePrice) > 0;
  const row = document.createElement("tr");

  row.innerHTML = `
    <td class="ledger-no-cell" data-label="No."></td>
    <td data-label="商品">
      <div class="item-cell">
        <strong></strong>
        <span></span>
      </div>
    </td>
    <td data-label="状態"><select class="status-badge status-select" aria-label="状態を変更"></select></td>
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
  row.querySelector(".item-cell strong").textContent = item.name;
  row.querySelector(".item-cell span").textContent = [item.market, item.category, item.memo].filter(Boolean).join(" / ");
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
  controls.statusFilters.querySelectorAll(".filter-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === state.filterStatus);
  });
}

function render() {
  renderSummary();
  renderFilters();
  renderInventory();
}

function saveItem(event) {
  event.preventDefault();
  const formItem = readForm();
  const existing = state.items.find((candidate) => candidate.id === formItem.id);
  const keepActualFee =
    existing && Number(existing.salePrice) === Number(formItem.salePrice) && existing.status === formItem.status;
  const item = normalizeItem({
    ...existing,
    ...formItem,
    actualFee: keepActualFee ? existing.actualFee : null,
    category: existing?.category || "",
    sourceRef: existing?.sourceRef || "",
  });
  if (!item.name) return;

  applyStatusDates(item, existing?.status || "");
  fields.saleDate.value = item.saleDate;
  fields.listingDate.value = item.listingDate;

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
    updateFormPreview();
  }

  saveItems();
  render();
  showToast(`状態を「${item.status}」に変更しました`);
}

function deleteItem(id) {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;
  const confirmed = window.confirm(`${item.name} を削除しますか？`);
  if (!confirmed) return;
  state.items = state.items.filter((candidate) => candidate.id !== id);
  saveItems();
  render();
  if (fields.id.value === id) resetForm();
}

function exportCsv() {
  const header = [
    "No.",
    "商品名",
    "販売先",
    "状態",
    "仕入日",
    "出品日",
    "販売日",
    "仕入れ値",
    "販売価格",
    "送料",
    "梱包費",
    "手数料率",
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
      item.market,
      item.status,
      item.purchaseDate,
      item.listingDate,
      item.saleDate,
      item.purchasePrice,
      item.salePrice,
      item.shipping,
      item.packing,
      item.feeRate,
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
      const status = normalizeStatus(row[2] || "在庫");
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
  const marketColumn = columnIndex(header, ["販売先"], 1);
  const statusColumn = columnIndex(header, ["状態"], 2);
  const purchaseDateColumn = columnIndex(header, ["仕入日"], 3);
  const listingDateColumn = columnIndex(header, ["出品日", "掲載日", "出品開始日"]);
  const saleDateColumn = columnIndex(header, ["販売日"], 4);
  const purchasePriceColumn = columnIndex(header, ["仕入れ値"], 5);
  const salePriceColumn = columnIndex(header, ["販売価格"], 6);
  const shippingColumn = columnIndex(header, ["送料"], 7);
  const packingColumn = columnIndex(header, ["梱包費", "その他経費"], 8);
  const feeRateColumn = columnIndex(header, ["手数料率"], 9);
  const actualFeeColumn = columnIndex(header, ["手数料実額"]);
  const categoryColumn = columnIndex(header, ["カテゴリ"]);
  const sourceRefColumn = columnIndex(header, ["管理元ID"]);
  const memoColumn = columnIndex(header, ["メモ"], header.length - 1);

  return records
    .map((row) =>
      normalizeItem({
        ledgerNo: ledgerNoColumn >= 0 ? row[ledgerNoColumn] : "",
        name: row[nameColumn],
        market: normalizeMarket(row[marketColumn]),
        status: normalizeStatus(row[statusColumn]),
        purchaseDate: normalizeDate(row[purchaseDateColumn]),
        listingDate: listingDateColumn >= 0 ? normalizeDate(row[listingDateColumn]) : "",
        saleDate: normalizeDate(row[saleDateColumn]),
        purchasePrice: parseMoney(row[purchasePriceColumn]),
        salePrice: parseMoney(row[salePriceColumn]),
        shipping: parseMoney(row[shippingColumn]),
        packing: parseMoney(row[packingColumn]),
        feeRate: parseRate(row[feeRateColumn]),
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

  state.items = defaultItems;
  state.filterStatus = "all";
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

[fields.purchasePrice, fields.salePrice, fields.shipping, fields.packing].forEach((input) => {
  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatInput(input.value);
    if (cursorAtEnd) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
    updateFormPreview();
  });

  input.addEventListener("focus", () => input.select());
});

[fields.feeRate, fields.status, fields.saleDate].forEach((input) => {
  input.addEventListener("input", updateFormPreview);
});

form.addEventListener("submit", saveItem);
controls.resetButton.addEventListener("click", resetForm);
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

loadItems();
state.selectedMonth = getLatestSaleMonth() || currentMonth();
switchView(getInitialView(), { updateHash: false, scroll: false });
resetForm();
render();
