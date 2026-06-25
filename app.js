const storageKey = "sedori-inventory-ledger:v1";
const defaultFeeRate = 10;
const soldStatuses = new Set(["売却済み", "発送準備", "評価待ち", "完了"]);

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
};

const form = document.querySelector("#itemForm");
const fields = {
  id: document.querySelector("#itemId"),
  name: document.querySelector("#nameInput"),
  market: document.querySelector("#marketInput"),
  status: document.querySelector("#statusInput"),
  purchaseDate: document.querySelector("#purchaseDateInput"),
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
  inventoryBody: document.querySelector("#inventoryBody"),
  emptyState: document.querySelector("#emptyState"),
};

const controls = {
  resetButton: document.querySelector("#resetButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  pasteImportButton: document.querySelector("#pasteImportButton"),
  csvPasteDialog: document.querySelector("#csvPasteDialog"),
  csvPasteInput: document.querySelector("#csvPasteInput"),
  confirmPasteImportButton: document.querySelector("#confirmPasteImportButton"),
  closePasteDialogButton: document.querySelector("#closePasteDialogButton"),
  searchInput: document.querySelector("#searchInput"),
  statusFilters: document.querySelector("#statusFilters"),
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

function normalizeDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
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

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readForm() {
  return {
    id: fields.id.value || createId(),
    name: fields.name.value.trim(),
    market: fields.market.value,
    status: fields.status.value,
    purchaseDate: fields.purchaseDate.value,
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

function resetForm() {
  form.reset();
  fields.id.value = "";
  fields.purchaseDate.value = today();
  fields.feeRate.value = defaultFeeRate;
  output.formTitle.textContent = "商品登録";
  updateFormPreview();
  fields.name.focus();
}

function fillForm(item) {
  fields.id.value = item.id;
  fields.name.value = item.name;
  fields.market.value = normalizeMarket(item.market || "メルカリ");
  fields.status.value = normalizeStatus(item.status || "在庫");
  fields.purchaseDate.value = item.purchaseDate || "";
  fields.saleDate.value = item.saleDate || "";
  fields.purchasePrice.value = formatInput(item.purchasePrice);
  fields.salePrice.value = formatInput(item.salePrice);
  fields.shipping.value = formatInput(item.shipping);
  fields.packing.value = formatInput(item.packing);
  fields.feeRate.value = parseRate(item.feeRate);
  fields.memo.value = item.memo || "";
  output.formTitle.textContent = "商品編集";
  updateFormPreview();
  fields.name.focus();
}

function saveItems() {
  localStorage.setItem(storageKey, JSON.stringify(state.items));
}

function loadItems() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  state.items = Array.isArray(saved) ? saved.map(normalizeItem) : [];
}

function normalizeItem(item) {
  return {
    id: item.id || createId(),
    name: item.name || "",
    market: normalizeMarket(item.market || "メルカリ"),
    status: normalizeStatus(item.status || "在庫"),
    purchaseDate: item.purchaseDate || "",
    saleDate: item.saleDate || "",
    purchasePrice: Number(item.purchasePrice) || 0,
    salePrice: Number(item.salePrice) || 0,
    shipping: Number(item.shipping) || 0,
    packing: Number(item.packing) || 0,
    feeRate: parseRate(item.feeRate),
    actualFee:
      item.actualFee === null || item.actualFee === undefined || item.actualFee === "" ? null : Number(item.actualFee) || 0,
    category: item.category || "",
    sourceRef: String(item.sourceRef || "").trim(),
    memo: item.memo || "",
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function isCurrentMonth(dateString) {
  if (!dateString) return false;
  const now = new Date();
  const date = new Date(`${dateString}T00:00:00`);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function getFilteredItems() {
  const keyword = state.search.trim().toLowerCase();
  return state.items
    .filter((item) => state.filterStatus === "all" || item.status === state.filterStatus)
    .filter((item) => {
      if (!keyword) return true;
      return [item.name, item.market, item.category, item.memo, item.sourceRef].some((value) =>
        String(value).toLowerCase().includes(keyword),
      );
    })
    .sort((a, b) => {
      const left = b.saleDate || b.purchaseDate || "";
      const right = a.saleDate || a.purchaseDate || "";
      if (left !== right) return left.localeCompare(right);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

function renderSummary() {
  const activeItems = state.items.filter((item) => !soldStatuses.has(item.status));
  const stockCost = activeItems.reduce((sum, item) => sum + getCalculations(item).totalCost, 0);
  const monthlyItems = state.items.filter((item) => soldStatuses.has(item.status) && isCurrentMonth(item.saleDate));
  const monthlySales = monthlyItems.reduce((sum, item) => sum + item.salePrice, 0);
  const monthlyProfit = monthlyItems.reduce((sum, item) => sum + getCalculations(item).profit, 0);

  output.stockCount.textContent = numberFormatter.format(activeItems.length);
  output.stockCost.textContent = formatYen(stockCost);
  output.monthlySales.textContent = formatYen(monthlySales);
  output.monthlyProfit.textContent = formatYen(monthlyProfit);
  output.monthlyProfit.classList.toggle("loss-text", monthlyProfit < 0);
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
    <td>
      <div class="item-cell">
        <strong></strong>
        <span></span>
      </div>
    </td>
    <td><span class="status-badge"></span></td>
    <td></td>
    <td></td>
    <td></td>
    <td class="profit-cell"></td>
    <td>
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

  row.querySelector(".item-cell strong").textContent = item.name;
  row.querySelector(".item-cell span").textContent = [item.market, item.category, item.memo].filter(Boolean).join(" / ");
  row.querySelector(".status-badge").textContent = item.status;
  row.querySelector(".status-badge").dataset.status = item.status;
  row.children[2].textContent = item.saleDate || "-";
  row.children[3].textContent = hasSalePrice ? formatYen(item.salePrice) : "未入力";
  row.children[4].textContent = formatYen(calc.breakEven);
  row.querySelector(".profit-cell").textContent = hasSalePrice ? formatYen(calc.profit) : "-";
  row.querySelector(".profit-cell").classList.toggle("loss-text", hasSalePrice && calc.profit < 0);
  row.querySelector(".edit-action").addEventListener("click", () => fillForm(item));
  row.querySelector(".delete-action").addEventListener("click", () => deleteItem(item.id));

  return row;
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

  if (soldStatuses.has(item.status) && !item.saleDate) {
    item.saleDate = today();
    fields.saleDate.value = item.saleDate;
  }

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
    "商品名",
    "販売先",
    "状態",
    "仕入日",
    "販売日",
    "仕入れ値",
    "販売価格",
    "送料",
    "梱包費",
    "手数料率",
    "手数料実額",
    "損益分岐点",
    "利益",
    "カテゴリ",
    "管理元ID",
    "メモ",
  ];

  const rows = state.items.map((item) => {
    const calc = getCalculations(item);
    return [
      item.name,
      item.market,
      item.status,
      item.purchaseDate,
      item.saleDate,
      item.purchasePrice,
      item.salePrice,
      item.shipping,
      item.packing,
      item.feeRate,
      item.actualFee ?? "",
      calc.breakEven,
      item.salePrice > 0 ? Math.round(calc.profit) : "",
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
        sourceRef: `管理表:${row[0]}`,
        name: row[3],
        market: normalizeMarket(row[11]),
        status,
        purchaseDate: normalizeDate(row[6]),
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
  const nameColumn = columnIndex(header, ["商品名"], 0);
  const marketColumn = columnIndex(header, ["販売先"], 1);
  const statusColumn = columnIndex(header, ["状態"], 2);
  const purchaseDateColumn = columnIndex(header, ["仕入日"], 3);
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
        name: row[nameColumn],
        market: normalizeMarket(row[marketColumn]),
        status: normalizeStatus(row[statusColumn]),
        purchaseDate: normalizeDate(row[purchaseDateColumn]),
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
  return [item.name, item.purchaseDate, item.saleDate, item.purchasePrice, item.salePrice, item.market].join("|");
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

loadItems();
resetForm();
render();
