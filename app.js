const STORAGE_KEY = "rieki-calc/records/v1";
const BACKUP_VERSION = 1;
const FEE_RATE = 0.1;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

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

function calculateFee(salePrice) {
  return Math.round((salePrice ?? 0) * FEE_RATE);
}

function estimateProfit({ salePrice, purchasePrice, shipping }) {
  if (!salePrice || salePrice <= 0) return null;
  return salePrice - calculateFee(salePrice) - (purchasePrice ?? 0) - (shipping ?? 0);
}

function calculateBreakEven(purchasePrice, shipping) {
  const totalCost = (purchasePrice ?? 0) + (shipping ?? 0);
  if (totalCost <= 0) return null;

  let price = Math.max(0, Math.floor(totalCost / (1 - FEE_RATE)) - 5);
  while (price - calculateFee(price) < totalCost) {
    price += 1;
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
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function normalizeRecord(record) {
  return {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: record.date || todayJst(),
    itemName: String(record.itemName ?? "").trim(),
    salePrice: parseAmount(record.salePrice),
    purchasePrice: parseAmount(record.purchasePrice),
    shipping: parseAmount(record.shipping),
    storeName: String(record.storeName ?? "").trim(),
  };
}

function addRecord(record) {
  const records = loadRecords();
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...record,
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
      normalized.storeName,
      normalized.salePrice ?? "",
      normalized.purchasePrice ?? "",
      normalized.shipping ?? "",
      normalized.salePrice ? calculateFee(normalized.salePrice) : "",
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
    merged.set(record.id, record);
  });
  return [...merged.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function updateRecord(id, patch) {
  const next = loadRecords().map((record) => (record.id === id ? { ...record, ...patch } : record));
  saveRecords(next);
  return next;
}

function deleteRecord(id) {
  const next = loadRecords().filter((record) => record.id !== id);
  saveRecords(next);
  return next;
}

function recordProfit(record) {
  return estimateProfit({
    salePrice: record.salePrice,
    purchasePrice: record.purchasePrice,
    shipping: record.shipping,
  });
}

function recordBreakEven(record) {
  return calculateBreakEven(record.purchasePrice, record.shipping);
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
        <div class="record-name">${escapeHtml(record.itemName || "（品名なし）")}</div>
        ${record.storeName ? `<div class="record-detail">店舗 ${escapeHtml(record.storeName)}</div>` : ""}
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

  item.querySelector(".edit-button").addEventListener("click", () => onEdit?.(record));
  item.querySelector(".delete-button").addEventListener("click", () => onDelete?.(record.id));
  return item;
}

function initCalculator() {
  let records = loadRecords();
  let editingId = null;
  let savedTimer = null;

  const fields = {
    date: document.querySelector("#dateInput"),
    itemName: document.querySelector("#itemNameInput"),
    salePrice: document.querySelector("#salePriceInput"),
    purchasePrice: document.querySelector("#purchasePriceInput"),
    shipping: document.querySelector("#shippingInput"),
    storeName: document.querySelector("#storeNameInput"),
  };

  const nodes = {
    editBanner: document.querySelector("#editBanner"),
    cancelEditButton: document.querySelector("#cancelEditButton"),
    profit: document.querySelector("#profitValue"),
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
  };

  fields.date.max = todayJst();
  fields.date.value = todayJst();

  function readForm() {
    return {
      date: fields.date.value || todayJst(),
      itemName: fields.itemName.value.trim(),
      salePrice: parseAmount(fields.salePrice.value),
      purchasePrice: parseAmount(fields.purchasePrice.value),
      shipping: parseAmount(fields.shipping.value),
      storeName: fields.storeName.value.trim(),
    };
  }

  function clearForm() {
    fields.date.value = todayJst();
    fields.itemName.value = "";
    fields.salePrice.value = "";
    fields.purchasePrice.value = "";
    fields.shipping.value = "";
    fields.storeName.value = "";
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
    fields.shipping.value = record.shipping ?? "";
    fields.storeName.value = record.storeName || "";
    nodes.editBanner.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderCalculator();
  }

  function renderCalculator() {
    const values = readForm();
    const profit = estimateProfit(values);
    const margin = profit !== null && values.salePrice ? Math.round((profit / values.salePrice) * 100) : null;
    const hasInput = Boolean(
      fields.itemName.value ||
        fields.salePrice.value ||
        fields.purchasePrice.value ||
        fields.shipping.value ||
        fields.storeName.value,
    );

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
      records = mergeImportedRecords(records, importedRecords);
      saveRecords(records);
      renderCalculator();
      window.alert(`${importedRecords.length}件のデータを読み込みました。`);
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
    records = editingId ? updateRecord(editingId, values) : addRecord(values);
    editingId = null;
    nodes.editBanner.hidden = true;
    clearForm();
    nodes.saveButton.textContent = "✓ 保存したよ";
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(renderCalculator, 1500);
  });

  nodes.clearButton.addEventListener("click", clearForm);
  nodes.cancelEditButton.addEventListener("click", clearForm);
  nodes.exportBackupButton.addEventListener("click", () => exportBackup(records));
  nodes.exportCsvButton.addEventListener("click", () => exportCsv(records));
  nodes.importBackupInput.addEventListener("change", () => importBackupFile(nodes.importBackupInput.files?.[0]));
  renderCalculator();
}

function initCalendar() {
  let records = loadRecords();
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
            document.querySelector(`#day-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    item.innerHTML = `
      <label class="field small-field">
        <span>品名</span>
        <input class="edit-name" type="text" value="${escapeHtml(record.itemName || "")}" placeholder="品名" />
      </label>
      <label class="field small-field">
        <span>店舗名</span>
        <input class="edit-store" type="text" value="${escapeHtml(record.storeName || "")}" placeholder="店舗名" />
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
          <input class="edit-shipping" type="number" inputmode="numeric" value="${record.shipping ?? ""}" />
        </label>
      </div>
      <div class="form-actions">
        <button class="mini-button strong save-edit" type="button">保存する</button>
        <button class="mini-button ghost cancel-edit" type="button">やめる</button>
      </div>
    `;

    item.querySelector(".save-edit").addEventListener("click", () => {
      records = updateRecord(record.id, {
        date: record.date,
        itemName: item.querySelector(".edit-name").value.trim(),
        salePrice: parseAmount(item.querySelector(".edit-sale").value),
        purchasePrice: parseAmount(item.querySelector(".edit-purchase").value),
        shipping: parseAmount(item.querySelector(".edit-shipping").value),
        storeName: item.querySelector(".edit-store").value.trim(),
      });
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

  renderCalendar();
}

if (document.body.dataset.page === "calculator") {
  initCalculator();
}

if (document.body.dataset.page === "calendar") {
  initCalendar();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    const swPath = document.body.dataset.page === "calendar" ? "../sw.js" : "./sw.js";
    navigator.serviceWorker.register(swPath, { updateViaCache: "none" }).catch(() => {});
  });
}
