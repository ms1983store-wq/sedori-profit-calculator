const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fields = {
  cost: document.querySelector("#costInput"),
  price: document.querySelector("#priceInput"),
  shipping: document.querySelector("#shippingInput"),
};

const output = {
  status: document.querySelector("#statusPill"),
  profitCard: document.querySelector("#profitCard"),
  profit: document.querySelector("#profitValue"),
  profitMessage: document.querySelector("#profitMessage"),
  margin: document.querySelector("#marginRate"),
  breakEven: document.querySelector("#breakEvenPrice"),
  breakEvenGap: document.querySelector("#breakEvenGap"),
  maxCost: document.querySelector("#maxCost"),
};

const clearButton = document.querySelector("#clearButton");
const shareButton = document.querySelector("#shareButton");
const storageKey = "sedori-profit-calculator:v1";

function parseMoney(value) {
  const normalized = String(value).replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function formatInput(value) {
  const number = parseMoney(value);
  return number ? new Intl.NumberFormat("ja-JP").format(number) : "";
}

function formatYen(value) {
  return yenFormatter.format(Math.round(value));
}

function readValues() {
  return {
    cost: parseMoney(fields.cost.value),
    price: parseMoney(fields.price.value),
    shipping: parseMoney(fields.shipping.value),
  };
}

function setStatus(kind, label) {
  output.status.className = `status-pill ${kind}`.trim();
  output.status.textContent = label;
  output.profitCard.className = `hero-result ${kind}`.trim();
}

function calculate() {
  const { cost, price, shipping } = readValues();
  const breakEven = cost + shipping;
  const profit = price - breakEven;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const maxCost = Math.max(price - shipping, 0);
  const breakEvenGap = price - breakEven;
  const hasAnyInput = cost > 0 || price > 0 || shipping > 0;

  output.profit.textContent = formatYen(profit);
  output.margin.textContent = `${percentFormatter.format(margin)}%`;
  output.breakEven.textContent = formatYen(breakEven);
  output.breakEvenGap.textContent = formatYen(breakEvenGap);
  output.maxCost.textContent = formatYen(maxCost);

  if (!hasAnyInput) {
    setStatus("", "入力待ち");
    output.profitMessage.textContent = "仕入れ値、売値、送料を入力";
  } else if (profit > 0) {
    setStatus("", "利益あり");
    output.profitMessage.textContent = `損益分岐より ${formatYen(profit)} 上`;
  } else if (profit === 0) {
    setStatus("flat", "分岐点");
    output.profitMessage.textContent = "利益も損失も出ない売値";
  } else {
    setStatus("loss", "赤字");
    output.profitMessage.textContent = `損益分岐まで ${formatYen(Math.abs(profit))} 不足`;
  }

  localStorage.setItem(storageKey, JSON.stringify({ cost, price, shipping }));
}

function restore() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  Object.entries(fields).forEach(([name, input]) => {
    if (saved[name]) {
      input.value = formatInput(saved[name]);
    }
  });
  calculate();
}

Object.values(fields).forEach((input) => {
  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatInput(input.value);
    if (cursorAtEnd) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
    calculate();
  });

  input.addEventListener("focus", () => {
    input.select();
  });
});

clearButton.addEventListener("click", () => {
  Object.values(fields).forEach((input) => {
    input.value = "";
  });
  localStorage.removeItem(storageKey);
  calculate();
  fields.cost.focus();
});

shareButton.addEventListener("click", async () => {
  const { cost, price, shipping } = readValues();
  const breakEven = cost + shipping;
  const profit = price - breakEven;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const text = [
    "せどり粗利計算",
    `仕入れ値: ${formatYen(cost)}`,
    `売値: ${formatYen(price)}`,
    `送料: ${formatYen(shipping)}`,
    `粗利: ${formatYen(profit)}`,
    `粗利率: ${percentFormatter.format(margin)}%`,
    `損益分岐売値: ${formatYen(breakEven)}`,
  ].join("\n");

  if (navigator.share) {
    await navigator.share({ text });
    return;
  }

  await navigator.clipboard.writeText(text);
  output.profitMessage.textContent = "結果をコピーしました";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

restore();
