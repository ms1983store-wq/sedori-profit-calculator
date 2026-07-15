const STORAGE_KEY = "rieki-calc/records/v1";
const STORES_KEY = "rieki-calc/stores/v1";
const ANNOUNCEMENT_KEY = "rieki-calc/announce-dismissed/v1";
const INVENTORY_STORAGE_KEY = "sedori-inventory-ledger:v1";
const INVENTORY_PENDING_SYNC_KEY = "sedori-inventory-ledger:cloud-pending/v1";
const CALCULATOR_INVENTORY_CLOUD_PENDING_KEY = "rieki-calc/inventory-cloud-pending/v1";
const CALCULATOR_INVENTORY_CLOUD_MIGRATION_KEY = "rieki-calc/inventory-cloud-migration/v1";
const INVENTORY_SOURCE_PREFIX = "粗利計算:";
const CLOUD_INVENTORY_URL = "https://sedori-profit-calculator.pages.dev/inventory/";
const CLOUD_CALCULATOR_URL = "https://sedori-profit-calculator.pages.dev/inventory/calculator/";
const IS_CLOUD_PAGES_HOST =
  window.location.hostname === "sedori-profit-calculator.pages.dev" ||
  window.location.hostname.endsWith(".sedori-profit-calculator.pages.dev");
const CLOUD_INVENTORY_API_URL = IS_CLOUD_PAGES_HOST
  ? "/inventory/api/inventory"
  : `${CLOUD_INVENTORY_URL}api/inventory`;
const ANNOUNCEMENT_PUBLISHED_AT = "2026-07-09";
const TANOMERU_METHOD = "tanomeru";
const BACKUP_VERSION = 1;
const FEE_RATE = 0.1;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TANOMERU_SIZES = [
  { size: 80, fee: 1700 },
  { size: 120, fee: 2400 },
  { size: 160, fee: 3400 },
  { size: 200, fee: 5000 },
  { size: 250, fee: 8600 },
  { size: 300, fee: 12000 },
  { size: 350, fee: 18500 },
  { size: 400, fee: 25400 },
  { size: 450, fee: 33000 },
];

function todayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function parseAmount(value) {
  const text = String(value ?? "").replace(/[, ]/g, "").trim();
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatYen(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "−" : "";
  return `${sign}¥${Math.abs(amount).toLocaleString("ja-JP")}`;
}

function calculateFee(salePrice, method = null, shipping = 0) {
  const feeBase = method === TANOMERU_METHOD ? (salePrice ?? 0) - (shipping ?? 0) : salePrice ?? 0;
  return Math.round(feeBase * FEE_RATE);
}

function estimateProfit({ salePrice, purchasePrice, shipping, method }) {
  if (!salePrice || salePrice <= 0) return null;
  return salePrice - calculateFee(salePrice, method, shipping) - (purchasePrice ?? 0) - (shipping ?? 0);
}

function calculateBreakEven(purchasePrice, shipping, method = null) {
  const purchase = purchasePrice ?? 0;
  const delivery = shipping ?? 0;
  const totalCost = purchase + delivery;
  if (totalCost <= 0) return null;

  const feeBearingCost = method === TANOMERU_METHOD ? purchase : totalCost;
  const deliveryOffset = method === TANOMERU_METHOD ? delivery : 0;
  let price = Math.max(1, deliveryOffset + Math.floor(feeBearingCost / (1 - FEE_RATE)) - 5);
  while (estimateProfit({ salePrice: price, purchasePrice: purchase, shipping: delivery, method }) < 0) {
    price += 1;
  }
  while (
    price > 1 &&
    estimateProfit({ salePrice: price - 1, purchasePrice: purchase, shipping: delivery, method }) >= 0
  ) {
    price -= 1;
  }
  return price;
}

function formatProfit(value) {
  return formatYen(value);
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dateKey(year, month, day) {
  return `${monthKey(year, month)}-${String(day).padStart(2, "0")}`;
}

function getDayOfWeek(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function loadRecords() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw);
    return Array.isArray(records) ? records.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function loadStores() {
  let savedStores = [];
  try {
    const raw = window.localStorage.getItem(STORES_KEY);
    const stores = raw ? JSON.parse(raw) : [];
    savedStores = Array.isArray(stores) ? stores : [];
  } catch {
    savedStores = [];
  }

  return [...new Set([...savedStores, ...loadRecords().map((record) => record.store)].filter(Boolean))];
}

function saveStores(stores, options = {}) {
  window.localStorage.setItem(STORES_KEY, JSON.stringify([...new Set(stores.filter(Boolean))]));
  if (options.cloud !== false) globalThis.SEDORI_CALCULATOR_CLOUD?.markLocalChange();
}

function addStore(store) {
  const name = String(store ?? "").trim();
  const stores = loadStores();
  if (!name || stores.includes(name)) return stores;
  const next = [name, ...stores];
  saveStores(next);
  return next;
}

function saveRecords(records, options = {}) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  if (options.cloud !== false) globalThis.SEDORI_CALCULATOR_CLOUD?.markLocalChange();
}

function recordUpdatedAt(record) {
  const saved = Date.parse(record?.updatedAt || "");
  if (Number.isFinite(saved)) return new Date(saved).toISOString();

  const idTime = Number.parseInt(String(record?.id || "").split("-")[0], 10);
  if (Number.isFinite(idTime) && idTime > 1_000_000_000_000) return new Date(idTime).toISOString();
  if (!record?.id) return new Date().toISOString();

  const dateTime = Date.parse(`${record?.date || "1970-01-01"}T00:00:00+09:00`);
  return new Date(Number.isFinite(dateTime) ? dateTime : 0).toISOString();
}

function normalizeRecord(record) {
  const store = String(record.store ?? record.storeName ?? "").trim();
  return {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: record.date || todayJst(),
    itemName: String(record.itemName ?? "").trim(),
    salePrice: parseAmount(record.salePrice),
    purchasePrice: parseAmount(record.purchasePrice),
    shipping: parseAmount(record.shipping),
    store: store || null,
    method: record.method === TANOMERU_METHOD ? TANOMERU_METHOD : null,
    updatedAt: recordUpdatedAt(record),
  };
}

function loadInventoryItems() {
  try {
    const items = JSON.parse(window.localStorage.getItem(INVENTORY_STORAGE_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function inventoryMemoForRecord(record) {
  return [
    "粗利計算から自動登録",
    record.store ? `仕入先:${record.store}` : "",
    record.method === TANOMERU_METHOD ? "配送:たのメル便" : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function syncRecordToInventory(record) {
  if (!record?.id) return { synced: false, reason: "missing-record" };

  const items = loadInventoryItems();
  const sourceRef = `${INVENTORY_SOURCE_PREFIX}${record.id}`;
  const generatedId = `rieki-calc-${record.id}`;
  const existingIndex = items.findIndex((item) => item.id === generatedId || item.sourceRef === sourceRef);
  const existing = existingIndex >= 0 ? items[existingIndex] : null;

  if (existing && existing.status !== "出品前") {
    return { synced: false, reason: "inventory-progressed", item: existing };
  }

  const generatedMemo = inventoryMemoForRecord(record);
  const existingMemo = String(existing?.memo || "");
  const memo = !existing || !existingMemo || existingMemo.startsWith("粗利計算から自動登録")
    ? generatedMemo
    : existingMemo;
  const item = {
    ...existing,
    id: existing?.id || generatedId,
    ledgerNo: existing?.ledgerNo || "",
    name: record.itemName || "（品名なし）",
    market: existing?.market || "メルカリ",
    status: "出品前",
    purchaseDate: record.date || todayJst(),
    listingDate: existing?.listingDate || "",
    saleDate: existing?.saleDate || "",
    purchasePrice: record.purchasePrice ?? 0,
    salePrice: record.salePrice ?? 0,
    shipping: record.shipping ?? 0,
    packing: existing?.packing ?? 0,
    feeRate: existing?.feeRate ?? 10,
    feeRounding: "round",
    shippingMethod: record.method === TANOMERU_METHOD ? TANOMERU_METHOD : "",
    actualFee: null,
    category: existing?.category || "",
    sourceRef,
    memo,
    updatedAt: record.updatedAt || new Date().toISOString(),
  };

  const next = [...items];
  if (existingIndex >= 0) {
    next[existingIndex] = item;
  } else {
    next.unshift(item);
  }

  try {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(INVENTORY_PENDING_SYNC_KEY, "1");
    window.localStorage.setItem(CALCULATOR_INVENTORY_CLOUD_PENDING_KEY, "1");
    return { synced: true, created: existingIndex < 0, item };
  } catch {
    return { synced: false, reason: "storage-failed" };
  }
}

let calculatorInventorySyncPromise = null;

function prepareCalculatorInventoryCloudMigration() {
  if (window.localStorage.getItem(CALCULATOR_INVENTORY_CLOUD_MIGRATION_KEY) === "2") return;
  const records = loadRecords();
  records.forEach((record) => syncRecordToInventory(record));
  if (records.length) window.localStorage.setItem(CALCULATOR_INVENTORY_CLOUD_PENDING_KEY, "1");
}

async function flushCalculatorInventoryToCloud() {
  if (window.localStorage.getItem(CALCULATOR_INVENTORY_CLOUD_PENDING_KEY) !== "1") return true;
  if (calculatorInventorySyncPromise) return calculatorInventorySyncPromise;

  const items = loadInventoryItems().filter((item) => String(item.sourceRef || "").startsWith(INVENTORY_SOURCE_PREFIX));
  if (!items.length) {
    window.localStorage.removeItem(CALCULATOR_INVENTORY_CLOUD_PENDING_KEY);
    window.localStorage.setItem(CALCULATOR_INVENTORY_CLOUD_MIGRATION_KEY, "2");
    return true;
  }

  calculatorInventorySyncPromise = fetch(CLOUD_INVENTORY_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "text/plain;charset=UTF-8",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ mode: "merge", source: "calculator", items }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Cloud inventory sync failed: ${response.status}`);
      window.localStorage.removeItem(CALCULATOR_INVENTORY_CLOUD_PENDING_KEY);
      window.localStorage.setItem(CALCULATOR_INVENTORY_CLOUD_MIGRATION_KEY, "2");
      return true;
    })
    .catch(() => false)
    .finally(() => {
      calculatorInventorySyncPromise = null;
    });

  return calculatorInventorySyncPromise;
}

function configureInventoryNavigation() {
  const link = document.querySelector("[data-inventory-link]");
  if (!link || !/^https?:$/.test(window.location.protocol)) return;

  const inventoryUrl = new URL(CLOUD_INVENTORY_URL);
  inventoryUrl.searchParams.set("return", CLOUD_CALCULATOR_URL);
  link.href = inventoryUrl.href;

  link.addEventListener("click", (event) => {
    if (window.localStorage.getItem(CALCULATOR_INVENTORY_CLOUD_PENDING_KEY) !== "1") return;
    event.preventDefault();
    const destination = link.href;
    Promise.race([
      flushCalculatorInventoryToCloud(),
      new Promise((resolve) => window.setTimeout(resolve, 900)),
    ]).finally(() => window.location.assign(destination));
  });
}

function addRecord(record) {
  const records = loadRecords();
  const normalized = normalizeRecord(record);
  const next = [
    {
      ...normalized,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      updatedAt: new Date().toISOString(),
    },
    ...records,
  ];
  saveRecords(next);
  return next;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportBackup(records) {
  const payload = {
    app: "rieki-calc",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    records: records.map(normalizeRecord),
    stores: loadStores(),
  };
  downloadText(`rieki-calc-backup-${todayJst()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv(records) {
  const header = [
    "日付",
    "品名",
    "店舗名",
    "売値",
    "仕入値",
    "送料",
    "配送",
    "メルカリ手数料",
    "概算粗利",
    "粗利率",
    "損益分岐点",
  ];
  const rows = records.map((record) => {
    const normalized = normalizeRecord(record);
    const profit = recordProfit(normalized);
    const margin =
      profit !== null && normalized.salePrice ? `${Math.round((profit / normalized.salePrice) * 100)}%` : "";
    return [
      normalized.date,
      normalized.itemName,
      normalized.store,
      normalized.salePrice ?? "",
      normalized.purchasePrice ?? "",
      normalized.shipping ?? "",
      normalized.method === TANOMERU_METHOD ? "たのメル便" : "",
      normalized.salePrice
        ? calculateFee(normalized.salePrice, normalized.method, normalized.shipping)
        : "",
      profit ?? "",
      margin,
      recordBreakEven(normalized) ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  downloadText(
    `rieki-calc-records-${todayJst()}.csv`,
    `\ufeff${[header.map(csvCell).join(","), ...rows].join("\r\n")}`,
    "text/csv;charset=utf-8",
  );
}

function mergeImportedRecords(currentRecords, importedRecords) {
  const merged = new Map(currentRecords.map((record) => [record.id, normalizeRecord(record)]));
  importedRecords.map(normalizeRecord).forEach((record) => {
    if (!merged.has(record.id)) merged.set(record.id, record);
  });
  return [...merged.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function updateRecord(id, patch) {
  const next = loadRecords().map((record) =>
    record.id === id ? normalizeRecord({ ...record, ...patch, updatedAt: new Date().toISOString() }) : record,
  );
  saveRecords(next);
  return next;
}

function deleteRecord(id) {
  globalThis.SEDORI_CALCULATOR_CLOUD?.markDeleted(id);
  const next = loadRecords().filter((record) => record.id !== id);
  saveRecords(next);
  return next;
}

function recordProfit(record) {
  return estimateProfit({
    salePrice: record.salePrice,
    purchasePrice: record.purchasePrice,
    shipping: record.shipping,
    method: record.method,
  });
}

function recordBreakEven(record) {
  return calculateBreakEven(record.purchasePrice, record.shipping, record.method);
}

function summarizeRecords(records) {
  return records.reduce(
    (summary, record) => {
      summary.count += 1;
      summary.purchase += record.purchasePrice ?? 0;
      const profit = recordProfit(record);
      if (profit !== null) {
        summary.profit += profit;
        summary.profitCount += 1;
      }
      return summary;
    },
    { count: 0, purchase: 0, profit: 0, profitCount: 0 },
  );
}

function setSignedMoneyClass(element, value) {
  element.classList.remove("profit-plus", "profit-minus", "muted-value", "break-even-value");
  element.classList.add(value >= 0 ? "profit-plus" : "profit-minus");
}

function renderRecordItem(record, { onEdit, onDelete, tagName = "li" } = {}) {
  const profit = recordProfit(record);
  const breakEven = recordBreakEven(record);
  const item = document.createElement(tagName);
  item.className = "record-card";

  const profitMarkup =
    profit === null
      ? ""
      : `<strong class="${profit >= 0 ? "profit-plus" : "profit-minus"}">${formatProfit(profit)}</strong>`;

  item.innerHTML = `
    <div class="record-main">
      <div class="record-text">
        <div class="record-name">
          ${escapeHtml(record.itemName || "（品名なし）")}
          ${record.method === TANOMERU_METHOD ? '<span class="shipping-badge">🚚 たのメル便</span>' : ""}
        </div>
        ${record.store ? `<div class="record-detail store-detail">🏬 ${escapeHtml(record.store)}</div>` : ""}
        <div class="record-detail">
          売値 ${formatYen(record.salePrice ?? 0)} ／ 仕入 ${formatYen(record.purchasePrice ?? 0)} ／ 送料 ${formatYen(record.shipping ?? 0)}
        </div>
        <div class="record-detail">損益分岐点 ${breakEven === null ? "—" : formatYen(breakEven)}</div>
      </div>
      <div class="record-result">
        ${profitMarkup}
        <div class="record-actions">
          <button type="button" class="mini-button edit-button">編集</button>
          <button type="button" class="mini-button ghost delete-button">削除</button>
        </div>
      </div>
    </div>
  `;

  item.querySelector(".edit-button").addEventListener("click", (event) => {
    event.preventDefault();
    if (onEdit) onEdit(record);
  });
  item.querySelector(".delete-button").addEventListener("click", (event) => {
    event.preventDefault();
    if (onDelete) onDelete(record.id);
  });
  return item;
}

function initCalculator() {
  let records = loadRecords();
  let stores = loadStores();
  let editingId = null;
  let shippingMethod = null;
  let savedTimer = null;

  const fields = {
    date: document.querySelector("#dateInput"),
    itemName: document.querySelector("#itemNameInput"),
    salePrice: document.querySelector("#salePriceInput"),
    purchasePrice: document.querySelector("#purchasePriceInput"),
    shipping: document.querySelector("#shippingInput"),
    tanomeruSize: document.querySelector("#tanomeruSizeInput"),
    store: document.querySelector("#storeNameInput"),
  };

  const nodes = {
    editBanner: document.querySelector("#editBanner"),
    cancelEditButton: document.querySelector("#cancelEditButton"),
    profit: document.querySelector("#profitValue"),
    profitMethodLabel: document.querySelector("#profitMethodLabel"),
    breakEven: document.querySelector("#breakEvenValue"),
    breakEvenNote: document.querySelector("#breakEvenNote"),
    saveButton: document.querySelector("#saveButton"),
    clearButton: document.querySelector("#clearButton"),
    todayCount: document.querySelector("#todayCount"),
    todayEmpty: document.querySelector("#todayEmpty"),
    todaySummary: document.querySelector("#todaySummary"),
    todayPurchaseTotal: document.querySelector("#todayPurchaseTotal"),
    todayProfitTotal: document.querySelector("#todayProfitTotal"),
    todayList: document.querySelector("#todayList"),
    exportBackupButton: document.querySelector("#exportBackupButton"),
    importBackupInput: document.querySelector("#importBackupInput"),
    exportCsvButton: document.querySelector("#exportCsvButton"),
    shippingModeButton: document.querySelector("#shippingModeButton"),
    shippingModeNote: document.querySelector("#shippingModeNote"),
    storeSuggestions: document.querySelector("#storeSuggestions"),
    announcement: document.querySelector("#announcement"),
    announcementDetail: document.querySelector("#announcementDetail"),
    announcementDetailButton: document.querySelector("#announcementDetailButton"),
    announcementDismissButton: document.querySelector("#announcementDismissButton"),
  };

  fields.date.max = todayJst();
  fields.date.value = todayJst();

  function renderStoreSuggestions() {
    nodes.storeSuggestions.replaceChildren(
      ...stores.map((store) => {
        const option = document.createElement("option");
        option.value = store;
        return option;
      }),
    );
  }

  function renderShippingMode() {
    const isTanomeru = shippingMethod === TANOMERU_METHOD;
    fields.shipping.hidden = isTanomeru;
    fields.tanomeruSize.hidden = !isTanomeru;
    nodes.shippingModeNote.hidden = !isTanomeru;
    nodes.shippingModeButton.classList.toggle("active", isTanomeru);
    nodes.shippingModeButton.textContent = isTanomeru
      ? "🚚 たのメル便で計算中（タップでふつうに戻す）"
      : "🚚 たのメル便で送る場合はタップ";
    nodes.profitMethodLabel.textContent = isTanomeru ? "（🚚たのメル便）" : "（手数料10%）";
  }

  function initAnnouncement() {
    if (!nodes.announcement) return;
    let dismissed = [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(ANNOUNCEMENT_KEY) || "[]");
      dismissed = Array.isArray(saved) ? saved : [];
    } catch {
      dismissed = [];
    }
    const publishedAt = new Date(`${ANNOUNCEMENT_PUBLISHED_AT}T00:00:00`);
    const isCurrent = Date.now() < publishedAt.getTime() + 7 * 24 * 60 * 60 * 1000;
    nodes.announcement.hidden = !isCurrent || dismissed.includes("tanomeru-2026-07");
  }

  function readForm() {
    return {
      date: fields.date.value || todayJst(),
      itemName: fields.itemName.value.trim(),
      salePrice: parseAmount(fields.salePrice.value),
      purchasePrice: parseAmount(fields.purchasePrice.value),
      shipping: parseAmount(
        shippingMethod === TANOMERU_METHOD ? fields.tanomeruSize.value : fields.shipping.value,
      ),
      store: fields.store.value.trim() || null,
      method: shippingMethod,
    };
  }

  function clearForm() {
    fields.date.value = todayJst();
    fields.itemName.value = "";
    fields.salePrice.value = "";
    fields.purchasePrice.value = "";
    fields.shipping.value = "";
    fields.tanomeruSize.value = "";
    fields.store.value = "";
    shippingMethod = null;
    editingId = null;
    nodes.editBanner.hidden = true;
    renderCalculator();
  }

  function startEdit(record) {
    editingId = record.id;
    fields.date.value = record.date || todayJst();
    fields.itemName.value = record.itemName || "";
    fields.salePrice.value = record.salePrice ?? "";
    fields.purchasePrice.value = record.purchasePrice ?? "";
    shippingMethod = record.method === TANOMERU_METHOD ? TANOMERU_METHOD : null;
    fields.shipping.value = shippingMethod ? "" : record.shipping ?? "";
    fields.tanomeruSize.value = shippingMethod ? String(record.shipping ?? "") : "";
    fields.store.value = record.store || "";
    nodes.editBanner.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderCalculator();
  }

  function renderCalculator() {
    const values = readForm();
    const profit = estimateProfit(values);
    const breakEven = calculateBreakEven(values.purchasePrice, values.shipping, values.method);
    const margin = profit !== null && values.salePrice ? Math.round((profit / values.salePrice) * 100) : null;
    const hasInput = Boolean(
      fields.itemName.value ||
        fields.salePrice.value ||
        fields.purchasePrice.value ||
        fields.shipping.value ||
        fields.tanomeruSize.value ||
        fields.store.value,
    );

    renderShippingMode();

    nodes.saveButton.disabled = profit === null;
    nodes.saveButton.textContent = editingId ? "更新する" : "この内容を保存する";
    nodes.clearButton.hidden = !hasInput && !editingId;

    if (profit === null) {
      nodes.profit.className = "muted-value";
      nodes.profit.textContent = "売値を入れてね";
    } else {
      setSignedMoneyClass(nodes.profit, profit);
      nodes.profit.textContent = `${formatProfit(profit)}${margin === null ? "" : ` 粗利率 ${margin}%`}`;
    }

    if (breakEven === null) {
      nodes.breakEven.className = "muted-value";
      nodes.breakEven.textContent = "仕入値を入れてね";
      nodes.breakEvenNote.textContent =
        values.method === TANOMERU_METHOD
          ? "仕入値と送料から、たのメル便の手数料込みで自動計算します。"
          : "仕入値と送料から、10%手数料込みで自動計算します。";
    } else {
      nodes.breakEven.className = "break-even-value";
      nodes.breakEven.textContent = formatYen(breakEven);
      if (values.salePrice && values.salePrice > 0) {
        const gap = values.salePrice - breakEven;
        nodes.breakEvenNote.textContent =
          gap >= 0
            ? `予定売値は分岐点より ${formatYen(gap)} 上です。`
            : `予定売値は分岐点まで ${formatYen(Math.abs(gap))} 足りません。`;
      } else {
        nodes.breakEvenNote.textContent = "この金額以上で売ると、手数料を引いた後に赤字を避けられます。";
      }
    }

    renderToday();
  }

  function renderToday() {
    const today = todayJst();
    const todayRecords = records.filter((record) => record.date === today);
    const summary = summarizeRecords(todayRecords);

    nodes.todayCount.textContent = String(todayRecords.length);
    nodes.todayEmpty.hidden = todayRecords.length > 0;
    nodes.todaySummary.hidden = todayRecords.length === 0;
    nodes.todayPurchaseTotal.textContent = formatYen(summary.purchase);
    nodes.todayProfitTotal.textContent = summary.profitCount ? formatProfit(summary.profit) : "—";
    nodes.todayProfitTotal.className = summary.profitCount
      ? summary.profit >= 0
        ? "profit-plus"
        : "profit-minus"
      : "muted-value";
    nodes.todayList.innerHTML = "";

    todayRecords.forEach((record) => {
      nodes.todayList.append(
        renderRecordItem(record, {
          onEdit: startEdit,
          onDelete: (id) => {
            if (editingId === id) clearForm();
            records = deleteRecord(id);
            renderCalculator();
          },
        }),
      );
    });
  }

  async function importBackupFile(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const importedRecords = Array.isArray(payload) ? payload : payload.records;
      if (!Array.isArray(importedRecords)) {
        throw new Error("Invalid backup file");
      }
      const currentIds = new Set(records.map((record) => record.id));
      const addedCount = importedRecords.filter((record) => record?.id && !currentIds.has(record.id)).length;
      records = mergeImportedRecords(records, importedRecords);
      saveRecords(records);
      const importedStores = Array.isArray(payload?.stores) ? payload.stores : [];
      stores = [
        ...new Set([...stores, ...importedStores, ...records.map((record) => record.store)].filter(Boolean)),
      ];
      saveStores(stores);
      renderStoreSuggestions();
      renderCalculator();
      window.alert(`${addedCount}件のデータを読み込みました。`);
    } catch {
      window.alert("読み込みに失敗しました。書き出したバックアップファイルを選んでください。");
    } finally {
      nodes.importBackupInput.value = "";
    }
  }

  Object.values(fields).forEach((field) => {
    field.addEventListener("input", renderCalculator);
    field.addEventListener("change", renderCalculator);
  });

  nodes.saveButton.addEventListener("click", () => {
    const values = readForm();
    if (estimateProfit(values) === null) return;
    if (values.store) {
      stores = addStore(values.store);
      renderStoreSuggestions();
    }
    const savedRecordId = editingId;
    records = editingId ? updateRecord(editingId, values) : addRecord(values);
    const savedRecord = savedRecordId
      ? records.find((record) => record.id === savedRecordId)
      : records[0];
    const inventorySync = syncRecordToInventory(savedRecord);
    const inventoryCloudSync = flushCalculatorInventoryToCloud();
    editingId = null;
    nodes.editBanner.hidden = true;
    clearForm();
    nodes.saveButton.textContent = inventorySync.synced ? "保存済み・在庫帳へ同期中" : "✓ 保存したよ";
    inventoryCloudSync.then((synced) => {
      if (!inventorySync.synced) return;
      nodes.saveButton.textContent = synced ? "✓ 保存・在庫帳に反映したよ" : "保存済み・同期を再試行します";
    });
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(renderCalculator, 1500);
  });

  nodes.clearButton.addEventListener("click", clearForm);
  nodes.cancelEditButton.addEventListener("click", clearForm);
  nodes.shippingModeButton.addEventListener("click", () => {
    shippingMethod = shippingMethod === TANOMERU_METHOD ? null : TANOMERU_METHOD;
    fields.shipping.value = "";
    fields.tanomeruSize.value = "";
    renderCalculator();
  });
  nodes.announcementDetailButton.addEventListener("click", () => {
    nodes.announcementDetail.hidden = !nodes.announcementDetail.hidden;
    nodes.announcementDetailButton.textContent = nodes.announcementDetail.hidden ? "詳細" : "閉じる";
  });
  nodes.announcementDismissButton.addEventListener("click", () => {
    let dismissed = [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(ANNOUNCEMENT_KEY) || "[]");
      dismissed = Array.isArray(saved) ? saved : [];
    } catch {
      dismissed = [];
    }
    window.localStorage.setItem(
      ANNOUNCEMENT_KEY,
      JSON.stringify([...new Set([...dismissed, "tanomeru-2026-07"])]),
    );
    nodes.announcement.hidden = true;
  });
  nodes.exportBackupButton.addEventListener("click", () => exportBackup(records));
  nodes.exportCsvButton.addEventListener("click", () => exportCsv(records));
  nodes.importBackupInput.addEventListener("change", () => importBackupFile(nodes.importBackupInput.files?.[0]));
  window.addEventListener("rieki-calc:cloud-state", () => {
    records = loadRecords();
    stores = loadStores();
    prepareCalculatorInventoryCloudMigration();
    flushCalculatorInventoryToCloud();
    renderStoreSuggestions();
    renderCalculator();
  });
  renderStoreSuggestions();
  initAnnouncement();
  renderCalculator();
}

function initCalendar() {
  let records = loadRecords();
  let stores = loadStores();
  const [todayYear, todayMonth] = todayJst().split("-").map(Number);
  let year = todayYear;
  let month = todayMonth;
  let openDate = "";
  let editingId = null;

  const nodes = {
    monthTitle: document.querySelector("#monthTitle"),
    calendarGrid: document.querySelector("#calendarGrid"),
    monthCountLabel: document.querySelector("#monthCountLabel"),
    monthCount: document.querySelector("#monthCount"),
    monthPurchaseLabel: document.querySelector("#monthPurchaseLabel"),
    monthPurchase: document.querySelector("#monthPurchase"),
    monthProfitLabel: document.querySelector("#monthProfitLabel"),
    monthProfit: document.querySelector("#monthProfit"),
    dayList: document.querySelector("#dayList"),
    prevMonth: document.querySelector("#prevMonth"),
    nextMonth: document.querySelector("#nextMonth"),
  };

  const storeSuggestions = document.createElement("datalist");
  storeSuggestions.id = "calendarStoreSuggestions";
  document.body.append(storeSuggestions);

  function renderStoreSuggestions() {
    storeSuggestions.replaceChildren(
      ...stores.map((store) => {
        const option = document.createElement("option");
        option.value = store;
        return option;
      }),
    );
  }

  function recordsByDate() {
    const currentMonth = monthKey(year, month);
    return records.reduce((map, record) => {
      if (!record.date || !record.date.startsWith(`${currentMonth}-`)) return map;
      const list = map.get(record.date) ?? [];
      list.push(record);
      map.set(record.date, list);
      return map;
    }, new Map());
  }

  function weekdayClass(day) {
    if (day === 0) return "sunday";
    if (day === 6) return "saturday";
    return "";
  }

  function renderCalendar() {
    const byDate = recordsByDate();
    const today = todayJst();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDay = getDayOfWeek(year, month, 1);
    const monthRecords = [...byDate.values()].flat();
    const monthSummary = summarizeRecords(monthRecords);

    nodes.monthTitle.textContent = `${year}年${month}月`;
    nodes.monthCountLabel.textContent = `${month}月の保存件数`;
    nodes.monthPurchaseLabel.textContent = `${month}月の仕入値合計`;
    nodes.monthProfitLabel.textContent = `${month}月の概算粗利`;
    nodes.monthCount.textContent = `${monthSummary.count} 件`;
    nodes.monthPurchase.textContent = formatYen(monthSummary.purchase);
    nodes.monthProfit.textContent = monthSummary.profitCount ? formatProfit(monthSummary.profit) : "まだないよ";
    nodes.monthProfit.className = monthSummary.profitCount
      ? monthSummary.profit >= 0
        ? "profit-plus"
        : "profit-minus"
      : "muted-value";

    nodes.calendarGrid.innerHTML = "";
    for (let i = 0; i < firstDay; i += 1) {
      nodes.calendarGrid.append(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, month, day);
      const dateRecords = byDate.get(key) ?? [];
      const summary = summarizeRecords(dateRecords);
      const dayOfWeek = getDayOfWeek(year, month, day);
      const cell = document.createElement(dateRecords.length ? "button" : "div");
      cell.className = [
        "calendar-day",
        weekdayClass(dayOfWeek),
        key === today ? "today" : "",
        key === openDate ? "selected" : "",
        dateRecords.length ? "has-record" : "",
      ]
        .filter(Boolean)
        .join(" ");

      cell.innerHTML = `
        <span class="day-number">${day}</span>
        ${
          dateRecords.length
            ? `<span class="mini-total purchase">仕 ${summary.purchase.toLocaleString("ja-JP")}</span>
               ${
                 summary.profitCount
                   ? `<span class="mini-total ${summary.profit >= 0 ? "profit-plus" : "profit-minus"}">粗 ${summary.profit < 0 ? "−" : ""}${Math.abs(summary.profit).toLocaleString("ja-JP")}</span>`
                   : ""
               }`
            : ""
        }
      `;

      if (dateRecords.length) {
        cell.type = "button";
        cell.addEventListener("click", () => {
          openDate = key;
          renderCalendar();
          window.setTimeout(() => {
            document.querySelector(`#day-${key}`)?.scrollIntoView({ behavior: "auto", block: "start" });
          }, 20);
        });
      }

      nodes.calendarGrid.append(cell);
    }

    renderDayList(byDate, daysInMonth);
  }

  function renderDayList(byDate, daysInMonth) {
    const today = todayJst();
    nodes.dayList.innerHTML = "";

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, month, day);
      const dateRecords = byDate.get(key) ?? [];
      const dayOfWeek = getDayOfWeek(year, month, day);
      const item = document.createElement("li");
      item.id = `day-${key}`;
      item.className = [
        "day-card",
        weekdayClass(dayOfWeek),
        key === today ? "today" : "",
        key === openDate ? "selected" : "",
        dateRecords.length ? "has-record" : "",
      ]
        .filter(Boolean)
        .join(" ");

      if (!dateRecords.length) {
        item.innerHTML = `
          <div class="day-header static">
            <span>${month}/${day}（${WEEKDAYS[dayOfWeek]}）${key === today ? '<b class="today-badge">今日</b>' : ""}</span>
            <small>記録なし</small>
          </div>
        `;
        nodes.dayList.append(item);
        continue;
      }

      const summary = summarizeRecords(dateRecords);
      const isOpen = openDate === key;
      item.innerHTML = `
        <button class="day-header" type="button">
          <span>${month}/${day}（${WEEKDAYS[dayOfWeek]}）${key === today ? '<b class="today-badge">今日</b>' : ""}</span>
          <small>${summary.count}件 ${isOpen ? "▲" : "▼"}</small>
        </button>
        <div class="day-totals">
          <div><span>仕入</span><strong>${formatYen(summary.purchase)}</strong></div>
          <div><span>概算粗利</span><strong class="${summary.profit >= 0 ? "profit-plus" : "profit-minus"}">${summary.profitCount ? formatProfit(summary.profit) : "—"}</strong></div>
        </div>
        <div class="day-records" ${isOpen ? "" : "hidden"}></div>
      `;

      item.querySelector(".day-header").addEventListener("click", () => {
        openDate = openDate === key ? "" : key;
        editingId = null;
        renderCalendar();
      });

      const recordContainer = item.querySelector(".day-records");
      dateRecords.forEach((record) => {
        recordContainer.append(renderCalendarRecord(record));
      });

      nodes.dayList.append(item);
    }
  }

  function renderCalendarRecord(record) {
    if (editingId !== record.id) {
      return renderRecordItem(record, {
        tagName: "div",
        onEdit: () => {
          editingId = record.id;
          renderCalendar();
        },
        onDelete: (id) => {
          if (editingId === id) editingId = null;
          records = deleteRecord(id);
          renderCalendar();
        },
      });
    }

    const item = document.createElement("div");
    item.className = "record-card edit-card";
    item.dataset.method = record.method === TANOMERU_METHOD ? TANOMERU_METHOD : "normal";
    const isTanomeru = item.dataset.method === TANOMERU_METHOD;
    const sizeOptions = TANOMERU_SIZES.map(
      ({ size, fee }) =>
        `<option value="${fee}" ${Number(record.shipping) === fee ? "selected" : ""}>${size} ¥${fee.toLocaleString("ja-JP")}</option>`,
    ).join("");
    item.innerHTML = `
      <label class="field small-field">
        <span>品名</span>
        <input class="edit-name" type="text" value="${escapeHtml(record.itemName || "")}" placeholder="品名" />
      </label>
      <label class="field small-field">
        <span>店舗名</span>
        <input class="edit-store" type="text" list="calendarStoreSuggestions" value="${escapeHtml(record.store || "")}" placeholder="店舗名" />
      </label>
      <div class="field-grid three">
        <label class="field small-field">
          <span>売値</span>
          <input class="edit-sale" type="number" inputmode="numeric" value="${record.salePrice ?? ""}" />
        </label>
        <label class="field small-field">
          <span>仕入</span>
          <input class="edit-purchase" type="number" inputmode="numeric" value="${record.purchasePrice ?? ""}" />
        </label>
        <label class="field small-field">
          <span>送料</span>
          <input class="edit-shipping" type="number" inputmode="numeric" value="${isTanomeru ? "" : record.shipping ?? ""}" ${isTanomeru ? "hidden" : ""} />
          <select class="edit-shipping-select" aria-label="たのメル便のサイズ" ${isTanomeru ? "" : "hidden"}>
            <option value="">サイズ</option>
            ${sizeOptions}
          </select>
        </label>
      </div>
      <button class="shipping-mode-button compact ${isTanomeru ? "active" : ""}" type="button">
        ${isTanomeru ? "🚚 たのメル便で計算中（タップで戻す）" : "🚚 たのメル便で送る場合はタップ"}
      </button>
      <div class="form-actions">
        <button class="mini-button strong save-edit" type="button">保存する</button>
        <button class="mini-button ghost cancel-edit" type="button">やめる</button>
      </div>
    `;

    const shippingInput = item.querySelector(".edit-shipping");
    const shippingSelect = item.querySelector(".edit-shipping-select");
    const shippingToggle = item.querySelector(".shipping-mode-button");

    shippingToggle.addEventListener("click", () => {
      const nextMethod = item.dataset.method === TANOMERU_METHOD ? "normal" : TANOMERU_METHOD;
      item.dataset.method = nextMethod;
      const nextIsTanomeru = nextMethod === TANOMERU_METHOD;
      shippingInput.value = "";
      shippingSelect.value = "";
      shippingInput.hidden = nextIsTanomeru;
      shippingSelect.hidden = !nextIsTanomeru;
      shippingToggle.classList.toggle("active", nextIsTanomeru);
      shippingToggle.textContent = nextIsTanomeru
        ? "🚚 たのメル便で計算中（タップで戻す）"
        : "🚚 たのメル便で送る場合はタップ";
    });

    item.querySelector(".save-edit").addEventListener("click", () => {
      const method = item.dataset.method === TANOMERU_METHOD ? TANOMERU_METHOD : null;
      const store = item.querySelector(".edit-store").value.trim();
      records = updateRecord(record.id, {
        date: record.date,
        itemName: item.querySelector(".edit-name").value.trim(),
        salePrice: parseAmount(item.querySelector(".edit-sale").value),
        purchasePrice: parseAmount(item.querySelector(".edit-purchase").value),
        shipping: parseAmount(method ? shippingSelect.value : shippingInput.value),
        store: store || null,
        method,
      });
      syncRecordToInventory(records.find((candidate) => candidate.id === record.id));
      flushCalculatorInventoryToCloud();
      if (store) {
        stores = addStore(store);
        renderStoreSuggestions();
      }
      editingId = null;
      renderCalendar();
    });
    item.querySelector(".cancel-edit").addEventListener("click", () => {
      editingId = null;
      renderCalendar();
    });
    return item;
  }

  nodes.prevMonth.addEventListener("click", () => {
    openDate = "";
    editingId = null;
    if (month === 1) {
      year -= 1;
      month = 12;
    } else {
      month -= 1;
    }
    renderCalendar();
  });

  nodes.nextMonth.addEventListener("click", () => {
    openDate = "";
    editingId = null;
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
    renderCalendar();
  });

  window.addEventListener("rieki-calc:cloud-state", () => {
    records = loadRecords();
    stores = loadStores();
    prepareCalculatorInventoryCloudMigration();
    flushCalculatorInventoryToCloud();
    renderStoreSuggestions();
    renderCalendar();
  });
  renderStoreSuggestions();
  renderCalendar();
}

configureInventoryNavigation();

if (document.body.dataset.page === "calculator") {
  initCalculator();
}

if (document.body.dataset.page === "calendar") {
  initCalendar();
}

prepareCalculatorInventoryCloudMigration();
flushCalculatorInventoryToCloud();

window.addEventListener("online", () => flushCalculatorInventoryToCloud());
window.addEventListener("focus", () => flushCalculatorInventoryToCloud());

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    const swPath = document.body.dataset.page === "calendar" ? "../sw.js" : "./sw.js";
    navigator.serviceWorker.register(swPath, { updateViaCache: "none" }).catch(() => {});
  });
}
