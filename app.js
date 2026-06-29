const storageKey = "sedori-buying-log:v2";
const legacyStorageKey = "sedori-inventory-ledger:v1";
const defaultFeeRate = 10;

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
const dayFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const state = {
  items: [],
  selectedDate: today(),
  search: "",
  storeFilter: "all",
};

const form = document.querySelector("#itemForm");
const fields = {
  id: document.querySelector("#itemId"),
  purchaseDate: document.querySelector("#purchaseDateInput"),
  store: document.querySelector("#storeInput"),
  name: document.querySelector("#nameInput"),
  code: document.querySelector("#codeInput"),
  quantity: document.querySelector("#quantityInput"),
  purchasePrice: document.querySelector("#purchasePriceInput"),
  salePrice: document.querySelector("#salePriceInput"),
  shipping: document.querySelector("#shippingInput"),
  feeRate: document.querySelector("#feeRateInput"),
  memo: document.querySelector("#memoInput"),
};

const output = {
  selectedDate: document.querySelector("#selectedDateInput"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  totalProfit: document.querySelector("#totalProfit"),
  profitPerStore: document.querySelector("#profitPerStore"),
  storeCount: document.querySelector("#storeCount"),
  storeNames: document.querySelector("#storeNames"),
  unitCount: document.querySelector("#unitCount"),
  productCount: document.querySelector("#productCount"),
  totalCost: document.querySelector("#totalCost"),
  estimatedSales: document.querySelector("#estimatedSales"),
  totalRoi: document.querySelector("#totalRoi"),
  formTitle: document.querySelector("#formTitle"),
  formCost: document.querySelector("#formCost"),
  formSales: document.querySelector("#formSales"),
  formProfit: document.querySelector("#formProfit"),
  formRoi: document.querySelector("#formRoi"),
  saveButtonLabel: document.querySelector("#saveButtonLabel"),
  storeSuggestions: document.querySelector("#storeSuggestions"),
  storeStrip: document.querySelector("#storeStrip"),
  recordsBody: document.querySelector("#recordsBody"),
  tableWrap: document.querySelector("#tableWrap"),
  emptyState: document.querySelector("#emptyState"),
  toast: document.querySelector("#toast"),
};

const controls = {
  previousDay: document.querySelector("#previousDayButton"),
  nextDay: document.querySelector("#nextDayButton"),
  today: document.querySelector("#todayButton"),
  reset: document.querySelector("#resetButton"),
  decreaseQuantity: document.querySelector("#decreaseQuantity"),
  increaseQuantity: document.querySelector("#increaseQuantity"),
  pasteImport: document.querySelector("#pasteImportButton"),
  export: document.querySelector("#exportButton"),
  import: document.querySelector("#importInput"),
  search: document.querySelector("#searchInput"),
  csvPasteDialog: document.querySelector("#csvPasteDialog"),
  csvPasteInput: document.querySelector("#csvPasteInput"),
  closePasteDialog: document.querySelector("#closePasteDialogButton"),
  confirmPasteImport: document.querySelector("#confirmPasteImportButton"),
};

function today() {
  const date = new Date();
  return toDateString(date);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(value, amount) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return toDateString(date);
}

function normalizeDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `purchase-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseMoney(value) {
  const normalized = String(value ?? "").replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function parseRate(value) {
  const rate = Number.parseFloat(value);
  if (!Number.isFinite(rate)) return defaultFeeRate;
  return Math.min(Math.max(rate, 0), 80);
}

function parseQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(quantity, 1), 999);
}

function formatYen(value) {
  return yenFormatter.format(Math.round(value || 0));
}

function formatMoneyInput(value) {
  const amount = parseMoney(value);
  return amount ? numberFormatter.format(amount) : "";
}

function calculateFee(price, feeRate) {
  return Math.ceil(price * (feeRate / 100));
}

function calculateBreakEvenPrice(totalCost, feeRate) {
  if (totalCost <= 0) return 0;
  let price = Math.ceil(totalCost / (1 - feeRate / 100));
  while (price - calculateFee(price, feeRate) < totalCost) price += 1;
  while (price > 0 && price - 1 - calculateFee(price - 1, feeRate) >= totalCost) price -= 1;
  return price;
}

function calculate(item) {
  const quantity = parseQuantity(item.quantity);
  const purchasePrice = Number(item.purchasePrice) || 0;
  const salePrice = Number(item.salePrice) || 0;
  const shipping = Number(item.shipping) || 0;
  const feeRate = parseRate(item.feeRate);
  const hasActualFee = item.actualFee !== null && item.actualFee !== undefined && item.actualFee !== "";
  const estimatedUnitFee = calculateFee(salePrice, feeRate);
  const totalCost = purchasePrice * quantity;
  const totalSales = salePrice * quantity;
  const totalFee = hasActualFee ? Number(item.actualFee) || 0 : estimatedUnitFee * quantity;
  const totalShipping = shipping * quantity;
  const totalProfit = totalSales - totalCost - totalShipping - totalFee;
  const unitFee = quantity > 0 ? totalFee / quantity : 0;
  const unitProfit = quantity > 0 ? totalProfit / quantity : 0;
  const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const breakEvenPrice = calculateBreakEvenPrice(purchasePrice + shipping, feeRate);

  return { quantity, unitFee, unitProfit, totalCost, totalSales, totalFee, totalShipping, totalProfit, roi, breakEvenPrice };
}

function normalizeItem(item) {
  return {
    id: item.id || createId(),
    purchaseDate: item.purchaseDate || today(),
    store: String(item.store || item.purchaseStore || "未設定").trim() || "未設定",
    name: String(item.name || "").trim(),
    code: String(item.code || item.jan || "").trim(),
    quantity: parseQuantity(item.quantity),
    purchasePrice: Number(item.purchasePrice) || 0,
    salePrice: Number(item.salePrice ?? item.expectedSalePrice) || 0,
    shipping: Number(item.shipping) + Number(item.packing || 0) || 0,
    feeRate: parseRate(item.feeRate),
    actualFee:
      item.actualFee === null || item.actualFee === undefined || item.actualFee === ""
        ? null
        : Number(item.actualFee) || 0,
    status: String(item.status || "在庫").trim() || "在庫",
    saleDate: normalizeDate(item.saleDate),
    market: String(item.market || "").trim(),
    category: String(item.category || "").trim(),
    sourceRef: String(item.sourceRef || "").trim(),
    salePriceBasis: String(item.salePriceBasis || "").trim(),
    memo: String(item.memo || "").trim(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function loadItems() {
  try {
    const savedText = localStorage.getItem(storageKey);
    if (savedText !== null) {
      const saved = JSON.parse(savedText);
      state.items = saved.map(normalizeItem);
      return;
    }

    const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) || "[]");
    if (Array.isArray(legacy) && legacy.length) {
      state.items = legacy.map(normalizeItem);
      saveItems();
      showToast(`${legacy.length}件の旧データを引き継ぎました`);
    }
  } catch {
    state.items = [];
    showToast("保存データを読み込めませんでした");
  }
}

function saveItems() {
  localStorage.setItem(storageKey, JSON.stringify(state.items));
}

function readForm() {
  const existing = state.items.find((item) => item.id === fields.id.value);
  const salePrice = parseMoney(fields.salePrice.value);
  const feeRate = parseRate(fields.feeRate.value);
  const keepActualFee =
    existing && Number(existing.salePrice) === salePrice && parseRate(existing.feeRate) === feeRate;

  return normalizeItem({
    ...existing,
    id: fields.id.value || createId(),
    purchaseDate: fields.purchaseDate.value,
    store: fields.store.value,
    name: fields.name.value,
    code: fields.code.value,
    quantity: fields.quantity.value,
    purchasePrice: parseMoney(fields.purchasePrice.value),
    salePrice,
    shipping: parseMoney(fields.shipping.value),
    feeRate,
    actualFee: keepActualFee ? existing.actualFee : null,
    memo: fields.memo.value,
    updatedAt: new Date().toISOString(),
  });
}

function setLossState(element, value) {
  element.classList.toggle("is-loss", value < 0);
}

function updateFormPreview() {
  const item = readForm();
  const calc = calculate(item);
  output.formCost.textContent = formatYen(calc.totalCost);
  output.formSales.textContent = formatYen(calc.totalSales);
  output.formProfit.textContent = formatYen(calc.totalProfit);
  output.formRoi.textContent = `${percentFormatter.format(calc.roi)}%`;
  setLossState(output.formProfit, calc.totalProfit);
  setLossState(output.formRoi, calc.roi);
}

function resetForm({ keepContext = false, focus = true } = {}) {
  const context = keepContext
    ? {
        date: fields.purchaseDate.value || state.selectedDate,
        store: fields.store.value,
        shipping: fields.shipping.value,
        feeRate: fields.feeRate.value,
      }
    : null;

  form.reset();
  fields.id.value = "";
  fields.purchaseDate.value = context?.date || state.selectedDate;
  fields.store.value = context?.store || "";
  fields.quantity.value = "1";
  fields.shipping.value = context?.shipping || "";
  fields.feeRate.value = context?.feeRate || String(defaultFeeRate);
  output.formTitle.textContent = "商品を記録";
  output.saveButtonLabel.textContent = "この商品を追加";
  updateFormPreview();
  if (focus) (context?.store ? fields.name : fields.store).focus();
}

function fillForm(item) {
  fields.id.value = item.id;
  fields.purchaseDate.value = item.purchaseDate;
  fields.store.value = item.store;
  fields.name.value = item.name;
  fields.code.value = item.code;
  fields.quantity.value = item.quantity;
  fields.purchasePrice.value = formatMoneyInput(item.purchasePrice);
  fields.salePrice.value = formatMoneyInput(item.salePrice);
  fields.shipping.value = formatMoneyInput(item.shipping);
  fields.feeRate.value = item.feeRate;
  fields.memo.value = item.memo;
  output.formTitle.textContent = "商品を編集";
  output.saveButtonLabel.textContent = "変更を保存";
  updateFormPreview();
  document.querySelector(".entry-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  fields.name.focus({ preventScroll: true });
}

function getDayItems() {
  return state.items.filter((item) => item.purchaseDate === state.selectedDate);
}

function summarize(items) {
  const stores = [...new Set(items.map((item) => item.store).filter(Boolean))];
  return items.reduce(
    (summary, item) => {
      const calc = calculate(item);
      summary.units += calc.quantity;
      summary.cost += calc.totalCost;
      summary.sales += calc.totalSales;
      summary.profit += calc.totalProfit;
      return summary;
    },
    { stores, units: 0, products: items.length, cost: 0, sales: 0, profit: 0 },
  );
}

function renderDate() {
  output.selectedDate.value = state.selectedDate;
  output.selectedDateLabel.textContent = dayFormatter.format(parseLocalDate(state.selectedDate));
}

function renderSummary() {
  const summary = summarize(getDayItems());
  const roi = summary.cost > 0 ? (summary.profit / summary.cost) * 100 : 0;
  const average = summary.stores.length ? summary.profit / summary.stores.length : 0;

  output.totalProfit.textContent = formatYen(summary.profit);
  output.profitPerStore.textContent = `1店舗あたり ${formatYen(average)}`;
  output.storeCount.textContent = numberFormatter.format(summary.stores.length);
  output.storeNames.textContent = summary.stores.length ? summary.stores.join("、") : "まだ記録がありません";
  output.unitCount.textContent = numberFormatter.format(summary.units);
  output.productCount.textContent = `${numberFormatter.format(summary.products)}商品`;
  output.totalCost.textContent = formatYen(summary.cost);
  output.estimatedSales.textContent = `想定売上 ${formatYen(summary.sales)}`;
  output.totalRoi.textContent = `${percentFormatter.format(roi)}%`;
  setLossState(output.totalProfit, summary.profit);
  setLossState(output.totalRoi, roi);
}

function getStoreSummaries(items) {
  const grouped = new Map();
  items.forEach((item) => {
    if (!grouped.has(item.store)) grouped.set(item.store, []);
    grouped.get(item.store).push(item);
  });
  return [...grouped.entries()]
    .map(([store, storeItems]) => ({ store, ...summarize(storeItems) }))
    .sort((a, b) => b.profit - a.profit || a.store.localeCompare(b.store, "ja"));
}

function createStoreChip(label, profit, detail, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "store-chip";
  button.dataset.store = value;
  button.classList.toggle("active", state.storeFilter === value);

  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = formatYen(profit);
  amount.classList.toggle("is-loss", profit < 0);
  const meta = document.createElement("small");
  meta.textContent = detail;
  button.append(name, amount, meta);
  button.addEventListener("click", () => {
    state.storeFilter = value;
    renderRecords();
  });
  return button;
}

function renderStoreStrip(dayItems) {
  const all = summarize(dayItems);
  const chips = [createStoreChip("すべての店舗", all.profit, `${all.stores.length}店・${all.units}点`, "all")];
  getStoreSummaries(dayItems).forEach((summary) => {
    chips.push(createStoreChip(summary.store, summary.profit, `${summary.products}商品・${summary.units}点`, summary.store));
  });
  output.storeStrip.replaceChildren(...chips);
  output.storeStrip.hidden = dayItems.length === 0;
}

function getFilteredItems(dayItems) {
  const keyword = state.search.trim().toLocaleLowerCase("ja");
  return dayItems
    .filter((item) => state.storeFilter === "all" || item.store === state.storeFilter)
    .filter((item) => {
      if (!keyword) return true;
      return [item.name, item.store, item.code, item.memo].some((value) =>
        String(value).toLocaleLowerCase("ja").includes(keyword),
      );
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function createRecordRow(item) {
  const calc = calculate(item);
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><div class="product-cell"><strong></strong><small></small></div></td>
    <td><div class="store-cell"><strong></strong><small></small></div></td>
    <td class="number-column quantity-cell"></td>
    <td class="number-column cost-cell"></td>
    <td class="number-column sales-cell"></td>
    <td class="number-column profit-cell"></td>
    <td><div class="row-actions">
      <button class="icon-button edit-action" type="button" aria-label="編集" title="編集">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
      <button class="icon-button danger delete-action" type="button" aria-label="削除" title="削除">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6M10 11v5m4-5v5" /></svg>
      </button>
    </div></td>
  `;

  row.querySelector(".product-cell strong").textContent = item.name;
  const saleState = item.saleDate ? `${item.status} ${item.saleDate}` : item.status;
  const breakEvenNote = item.salePriceBasis === "break-even" ? `損益分岐 ${formatYen(calc.breakEvenPrice)}` : "";
  row.querySelector(".product-cell small").textContent = [
    item.code && `JAN/ASIN ${item.code}`,
    saleState,
    item.category,
    item.market,
    breakEvenNote,
    item.memo,
  ]
    .filter(Boolean)
    .join("・");
  row.querySelector(".store-cell strong").textContent = item.store;
  row.querySelector(".store-cell small").textContent = `${formatYen(item.purchasePrice)} / 点`;
  row.querySelector(".quantity-cell").textContent = `${numberFormatter.format(calc.quantity)}点`;
  row.querySelector(".cost-cell").textContent = formatYen(calc.totalCost);
  row.querySelector(".sales-cell").textContent = formatYen(calc.totalSales);
  row.querySelector(".profit-cell").textContent = formatYen(calc.totalProfit);
  row.querySelector(".profit-cell").classList.toggle("is-loss", calc.totalProfit < 0);
  row.querySelector(".edit-action").addEventListener("click", () => fillForm(item));
  row.querySelector(".delete-action").addEventListener("click", () => deleteItem(item.id));
  return row;
}

function renderRecords() {
  const dayItems = getDayItems();
  const validStores = new Set(dayItems.map((item) => item.store));
  if (state.storeFilter !== "all" && !validStores.has(state.storeFilter)) state.storeFilter = "all";
  renderStoreStrip(dayItems);

  const items = getFilteredItems(dayItems);
  output.recordsBody.replaceChildren(...items.map(createRecordRow));
  output.tableWrap.hidden = items.length === 0;
  output.emptyState.hidden = items.length > 0;

  const title = output.emptyState.querySelector("h3");
  const description = output.emptyState.querySelector("p");
  if (dayItems.length && !items.length) {
    title.textContent = "条件に合う商品がありません";
    description.textContent = "店舗の絞り込みや検索キーワードを変更してください。";
  } else {
    title.textContent = "この日の仕入れはまだありません";
    description.textContent = "左のフォームから商品を追加すると、店舗数と想定粗利がここにまとまります。";
  }
}

function renderStoreSuggestions() {
  const stores = [...new Set(state.items.map((item) => item.store).filter((store) => store && store !== "未設定"))]
    .sort((a, b) => a.localeCompare(b, "ja"));
  output.storeSuggestions.replaceChildren(
    ...stores.map((store) => {
      const option = document.createElement("option");
      option.value = store;
      return option;
    }),
  );
}

function render() {
  renderDate();
  renderSummary();
  renderStoreSuggestions();
  renderRecords();
}

function saveItem(event) {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const item = readForm();
  const existingIndex = state.items.findIndex((candidate) => candidate.id === item.id);
  const editing = existingIndex >= 0;
  if (editing) state.items[existingIndex] = item;
  else state.items.unshift(item);

  state.selectedDate = item.purchaseDate;
  state.storeFilter = "all";
  saveItems();
  render();
  showToast(editing ? "変更を保存しました" : `${item.store}に「${item.name}」を追加しました`);
  resetForm({ keepContext: !editing });
}

function deleteItem(id) {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item || !window.confirm(`「${item.name}」を削除しますか？`)) return;
  state.items = state.items.filter((candidate) => candidate.id !== id);
  saveItems();
  if (fields.id.value === id) resetForm({ focus: false });
  render();
  showToast("商品を削除しました");
}

function selectDate(value) {
  if (!value) return;
  state.selectedDate = value;
  state.storeFilter = "all";
  state.search = "";
  controls.search.value = "";
  resetForm({ focus: false });
  render();
}

function changeQuantity(amount) {
  fields.quantity.value = String(parseQuantity(fields.quantity.value) + amount);
  fields.quantity.value = String(parseQuantity(fields.quantity.value));
  updateFormPreview();
}

let toastTimer;
function showToast(message) {
  output.toast.textContent = message;
  output.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => output.toast.classList.remove("show"), 2600);
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const header = [
    "仕入れ日", "店舗名", "商品名", "JAN_ASIN", "数量", "仕入れ単価", "想定売価",
    "送料梱包費_1点", "販売手数料率", "仕入れ額", "想定売上", "想定粗利", "ROI", "メモ",
    "ステータス", "売上日", "販売ルート", "手数料実額", "管理元ID", "売価基準",
  ];
  const rows = [...state.items]
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.updatedAt.localeCompare(a.updatedAt))
    .map((item) => {
      const calc = calculate(item);
      return [
        item.purchaseDate, item.store, item.name, item.code, item.quantity, item.purchasePrice, item.salePrice,
        item.shipping, item.feeRate, calc.totalCost, calc.totalSales, calc.totalProfit, calc.roi.toFixed(1), item.memo,
        item.status, item.saleDate, item.market, item.actualFee ?? "", item.sourceRef, item.salePriceBasis,
      ];
    });
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `仕入れノート_${today()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast(`${state.items.length}件の記録をCSVに保存しました`);
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
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value !== ""));
}

function normalizeMarket(value) {
  const market = String(value || "").trim();
  return market === "Yahooフリマ" ? "Yahoo!フリマ" : market;
}

function isManagementSheetCsv(rows) {
  return rows[3]?.[2] === "ステータス" && rows[3]?.[3] === "品名" && rows[3]?.[23] === "売上金額";
}

function mapManagementSheetRows(rows) {
  return rows
    .filter((row) => /^\d+$/.test(row[0] || "") && row[3])
    .map((row) => {
      const purchasePrice = parseMoney(row[28] || row[7]);
      const shipping = parseMoney(row[30] || row[21] || row[20]) + parseMoney(row[31] || row[22]);
      const feeRate = parseRate(row[13] || defaultFeeRate);
      const actualSalePrice = parseMoney(row[23]);
      const breakEvenPrice = calculateBreakEvenPrice(purchasePrice + shipping, feeRate);
      const hasActualSalePrice = actualSalePrice > 0;

      return normalizeItem({
        sourceRef: `管理表:${row[0]}`,
        purchaseDate: normalizeDate(row[6]),
        store: row[8] || row[27] || "未設定",
        name: row[3],
        code: "",
        quantity: 1,
        purchasePrice,
        salePrice: hasActualSalePrice ? actualSalePrice : breakEvenPrice,
        shipping,
        feeRate,
        actualFee: row[2] === "売却済み" && row[29] !== "" ? parseMoney(row[29]) : null,
        status: row[2] || "在庫",
        saleDate: normalizeDate(row[25]),
        market: normalizeMarket(row[11]),
        category: row[5] || row[4],
        salePriceBasis: hasActualSalePrice ? "actual" : "break-even",
        memo: row[36] || "",
      });
    });
}

function columnIndex(header, names, fallback = -1) {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return index;
  }
  return fallback;
}

function mapBuyingLogRows(rows) {
  const [header = [], ...records] = rows;
  const column = (name) => header.indexOf(name);
  return records
    .map((row) =>
      normalizeItem({
        purchaseDate: normalizeDate(row[column("仕入れ日")]),
        store: row[column("店舗名")],
        name: row[column("商品名")],
        code: row[column("JAN_ASIN")],
        quantity: row[column("数量")],
        purchasePrice: parseMoney(row[column("仕入れ単価")]),
        salePrice: parseMoney(row[column("想定売価")]),
        shipping: parseMoney(row[column("送料梱包費_1点")]),
        feeRate: row[column("販売手数料率")],
        memo: row[column("メモ")],
        status: row[column("ステータス")],
        saleDate: normalizeDate(row[column("売上日")]),
        market: row[column("販売ルート")],
        actualFee: column("手数料実額") >= 0 && row[column("手数料実額")] !== "" ? parseMoney(row[column("手数料実額")]) : null,
        sourceRef: row[column("管理元ID")],
        salePriceBasis: row[column("売価基準")],
      }),
    )
    .filter((item) => item.name);
}

function mapInventoryLedgerRows(rows) {
  const [header = [], ...records] = rows;
  const nameColumn = columnIndex(header, ["商品名"], 0);
  const marketColumn = columnIndex(header, ["販売先"], 1);
  const statusColumn = columnIndex(header, ["状態"], 2);
  const purchaseDateColumn = columnIndex(header, ["仕入日"], 3);
  const saleDateColumn = columnIndex(header, ["販売日"], 4);
  const purchasePriceColumn = columnIndex(header, ["仕入れ値"], 5);
  const salePriceColumn = columnIndex(header, ["販売価格"], 6);
  const shippingColumn = columnIndex(header, ["送料"], 7);
  const otherCostColumn = columnIndex(header, ["その他経費", "梱包費"], 8);
  const feeRateColumn = columnIndex(header, ["手数料率"], 9);
  const actualFeeColumn = columnIndex(header, ["手数料実額"]);
  const memoColumn = columnIndex(header, ["メモ"], header.length - 1);

  return records
    .map((row) =>
      normalizeItem({
        name: row[nameColumn],
        store: "未設定",
        purchaseDate: normalizeDate(row[purchaseDateColumn]),
        purchasePrice: parseMoney(row[purchasePriceColumn]),
        salePrice: parseMoney(row[salePriceColumn]),
        shipping: parseMoney(row[shippingColumn]) + parseMoney(row[otherCostColumn]),
        feeRate: row[feeRateColumn],
        actualFee: actualFeeColumn >= 0 && row[actualFeeColumn] !== "" ? parseMoney(row[actualFeeColumn]) : null,
        status: row[statusColumn],
        saleDate: normalizeDate(row[saleDateColumn]),
        market: normalizeMarket(row[marketColumn]),
        memo: row[memoColumn],
      }),
    )
    .filter((item) => item.name);
}

function getItemIdentity(item) {
  if (item.sourceRef) return item.sourceRef;
  return [item.purchaseDate, item.store, item.name, item.purchasePrice, item.saleDate].join("|");
}

function mergeImportedItems(imported) {
  const merged = [...state.items];
  const indexByIdentity = new Map(merged.map((item, index) => [getItemIdentity(item), index]));
  let added = 0;
  let updated = 0;

  imported.forEach((item) => {
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

function importText(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const header = rows[0] || [];
  let imported;

  if (isManagementSheetCsv(rows)) imported = mapManagementSheetRows(rows);
  else if (header.includes("店舗名") && header.includes("想定売価")) imported = mapBuyingLogRows(rows);
  else imported = mapInventoryLedgerRows(rows);

  if (!imported.length) throw new Error("取り込める商品がありません");
  const result = mergeImportedItems(imported);
  state.selectedDate = imported.map((item) => item.purchaseDate).sort().at(-1) || state.selectedDate;
  state.storeFilter = "all";
  saveItems();
  resetForm({ focus: false });
  render();
  showToast(`${imported.length}件を読込（追加${result.added}・更新${result.updated}）`);
  return { count: imported.length, ...result };
}

async function importCsv(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    importText(await file.text());
  } catch {
    showToast("CSVを読み込めませんでした。ファイル形式を確認してください");
  } finally {
    controls.import.value = "";
  }
}

[fields.purchasePrice, fields.salePrice, fields.shipping].forEach((input) => {
  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatMoneyInput(input.value);
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    updateFormPreview();
  });
  input.addEventListener("focus", () => input.select());
});

[fields.quantity, fields.feeRate].forEach((input) => input.addEventListener("input", updateFormPreview));
form.addEventListener("submit", saveItem);
controls.reset.addEventListener("click", () => resetForm());
controls.decreaseQuantity.addEventListener("click", () => changeQuantity(-1));
controls.increaseQuantity.addEventListener("click", () => changeQuantity(1));
controls.previousDay.addEventListener("click", () => selectDate(shiftDate(state.selectedDate, -1)));
controls.nextDay.addEventListener("click", () => selectDate(shiftDate(state.selectedDate, 1)));
controls.today.addEventListener("click", () => selectDate(today()));
output.selectedDate.addEventListener("change", (event) => selectDate(event.target.value));
controls.search.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderRecords();
});
controls.pasteImport.addEventListener("click", () => {
  controls.csvPasteDialog.showModal();
  controls.csvPasteInput.focus();
});
controls.closePasteDialog.addEventListener("click", () => controls.csvPasteDialog.close());
controls.confirmPasteImport.addEventListener("click", () => {
  try {
    importText(controls.csvPasteInput.value);
    controls.csvPasteInput.value = "";
    controls.csvPasteDialog.close();
  } catch (error) {
    showToast(error.message);
  }
});
controls.export.addEventListener("click", exportCsv);
controls.import.addEventListener("change", importCsv);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

loadItems();
resetForm({ focus: false });
render();
