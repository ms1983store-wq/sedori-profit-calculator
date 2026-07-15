(() => {
  const recordsKey = "rieki-calc/records/v1";
  const storesKey = "rieki-calc/stores/v1";
  const pendingKey = "rieki-calc/cloud-pending/v1";
  const deletedKey = "rieki-calc/cloud-deleted/v1";
  const migrationKey = "rieki-calc/cloud-migration/v1";
  const apiUrl = "/inventory/api/calculator";
  const cloudCalculatorUrl = "https://sedori-profit-calculator.pages.dev/inventory/calculator/";
  const cloudHostSuffix = ".sedori-profit-calculator.pages.dev";
  const syncIntervalMs = 15000;

  const isCloudPagesHost =
    window.location.hostname === "sedori-profit-calculator.pages.dev" ||
    window.location.hostname.endsWith(cloudHostSuffix);
  const isUnifiedCalculator =
    isCloudPagesHost && window.location.pathname.startsWith("/inventory/calculator/");
  const isGithubCalculator =
    window.location.hostname === "ms1983store-wq.github.io" &&
    window.location.pathname.startsWith("/sedori-profit-calculator/");
  const shouldRedirectToUnified = isGithubCalculator || (isCloudPagesHost && !isUnifiedCalculator);

  const sync = {
    available: false,
    initialized: false,
    applyingRemote: false,
    saving: false,
    needsSave: false,
    version: 0,
    updatedAt: null,
    localRevision: 0,
    saveTimer: null,
    pollTimer: null,
  };

  function fallbackUpdatedAt(record) {
    const current = Date.parse(record?.updatedAt || "");
    if (Number.isFinite(current)) return new Date(current).toISOString();

    const idTime = Number.parseInt(String(record?.id || "").split("-")[0], 10);
    if (Number.isFinite(idTime) && idTime > 1_000_000_000_000) {
      return new Date(idTime).toISOString();
    }

    const dateTime = Date.parse(`${record?.date || "1970-01-01"}T00:00:00+09:00`);
    return new Date(Number.isFinite(dateTime) ? dateTime : 0).toISOString();
  }

  function normalizeRecord(record) {
    return {
      ...record,
      id: record?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      updatedAt: fallbackUpdatedAt(record),
    };
  }

  function normalizeRecords(records) {
    return (Array.isArray(records) ? records : [])
      .filter((record) => record && typeof record === "object")
      .map(normalizeRecord)
      .sort((a, b) => {
        const dateOrder = String(b.date || "").localeCompare(String(a.date || ""));
        return dateOrder || String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function normalizeStores(stores, records = []) {
    return [
      ...new Set(
        [...(Array.isArray(stores) ? stores : []), ...records.map((record) => record.store)]
          .map((store) => String(store || "").trim())
          .filter(Boolean),
      ),
    ];
  }

  function parseStorage(key, fallback) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function readLocalState() {
    const records = normalizeRecords(parseStorage(recordsKey, []));
    const stores = normalizeStores(parseStorage(storesKey, []), records);
    return { records, stores };
  }

  function emitStateChange() {
    window.dispatchEvent(new CustomEvent("rieki-calc:cloud-state"));
  }

  function writeLocalState(state) {
    sync.applyingRemote = true;
    const records = normalizeRecords(state.records);
    const stores = normalizeStores(state.stores, records);
    window.localStorage.setItem(recordsKey, JSON.stringify(records));
    window.localStorage.setItem(storesKey, JSON.stringify(stores));
    sync.applyingRemote = false;
    emitStateChange();
  }

  function hasPendingChanges() {
    return window.localStorage.getItem(pendingKey) === "1";
  }

  function markPending() {
    if (!isUnifiedCalculator || sync.applyingRemote) return;
    sync.localRevision += 1;
    window.localStorage.setItem(pendingKey, "1");
    setStatus("saving", "端末の変更をクラウドへ同期中");
    queueSave();
  }

  function getDeletedIds() {
    const ids = parseStorage(deletedKey, []);
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  }

  function markDeleted(id) {
    if (!isUnifiedCalculator || !id) return;
    const ids = getDeletedIds();
    ids.add(String(id));
    window.localStorage.setItem(deletedKey, JSON.stringify([...ids]));
    markPending();
  }

  function clearPending(expectedRevision = sync.localRevision) {
    if (expectedRevision !== sync.localRevision) return false;
    window.localStorage.removeItem(pendingKey);
    window.localStorage.removeItem(deletedKey);
    return true;
  }

  function mergeRecords(primaryRecords, secondaryRecords) {
    const merged = new Map();
    normalizeRecords(primaryRecords).forEach((record) => merged.set(record.id, record));
    normalizeRecords(secondaryRecords).forEach((record) => {
      const existing = merged.get(record.id);
      if (!existing || Date.parse(record.updatedAt) >= Date.parse(existing.updatedAt)) {
        merged.set(record.id, { ...existing, ...record, id: existing?.id || record.id });
      }
    });

    const deletedIds = getDeletedIds();
    return normalizeRecords([...merged.values()].filter((record) => !deletedIds.has(String(record.id))));
  }

  function mergeStates(remote, local) {
    const records = mergeRecords(remote.records, local.records);
    return {
      records,
      stores: normalizeStores([...(remote.stores || []), ...(local.stores || [])], records),
    };
  }

  function serializeState(state) {
    const records = normalizeRecords(state.records);
    return JSON.stringify({ records, stores: normalizeStores(state.stores, records) });
  }

  function setStatus(stateName, message) {
    const status = document.querySelector("#calculatorCloudStatus");
    const text = document.querySelector("#calculatorCloudStatusText");
    if (!status || !text) return;
    status.dataset.state = stateName;
    text.textContent = message;
  }

  function syncedStatusText() {
    const state = readLocalState();
    const time = sync.updatedAt
      ? new Date(sync.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
      : "";
    return `クラウド同期済み・${state.records.length}件${time ? `（${time}更新）` : ""}`;
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function encodeMigrationPayload(payload) {
    const source = new TextEncoder().encode(JSON.stringify(payload));
    if (typeof CompressionStream !== "function") return `j.${bytesToBase64Url(source)}`;

    const compressed = await new Response(
      new Blob([source]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    return `g.${bytesToBase64Url(new Uint8Array(compressed))}`;
  }

  async function decodeMigrationPayload(value) {
    const [format, encoded] = String(value || "").split(".", 2);
    if (!encoded || !["g", "j"].includes(format)) throw new Error("Invalid migration payload");
    const bytes = base64UrlToBytes(encoded);
    const decoded =
      format === "g" && typeof DecompressionStream === "function"
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
        : bytes;
    return JSON.parse(new TextDecoder().decode(decoded));
  }

  async function redirectLegacyCalculator() {
    if (!shouldRedirectToUnified) return false;

    const state = readLocalState();
    const target = new URL(
      document.body?.dataset.page === "calendar" ? "calendar/" : "",
      cloudCalculatorUrl,
    );
    if (state.records.length || state.stores.length) {
      const payload = await encodeMigrationPayload({
        app: "rieki-calc",
        exportedAt: new Date().toISOString(),
        records: state.records,
        stores: state.stores,
      });
      target.hash = `migrate=${payload}`;
    }
    window.location.replace(target.href);
    return true;
  }

  async function consumeMigrationPayload() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const encoded = params.get("migrate");
    if (!encoded) return false;

    const payload = await decodeMigrationPayload(encoded);
    const local = readLocalState();
    const incoming = {
      records: normalizeRecords(payload.records),
      stores: normalizeStores(payload.stores, payload.records),
    };
    const merged = mergeStates(local, incoming);
    writeLocalState(merged);
    window.localStorage.setItem(migrationKey, "1");
    window.localStorage.setItem(pendingKey, "1");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setStatus("saving", `旧アプリの履歴${incoming.records.length}件を移行中`);
    return true;
  }

  async function fetchCloudState() {
    const response = await fetch(apiUrl, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Calculator cloud state is unavailable: ${response.status}`);
    return response.json();
  }

  async function writeCloudState(options = {}) {
    const state = readLocalState();
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        ...state,
        baseVersion: sync.version,
        force: options.force === true,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 409) return { conflict: true, ...body };
    if (!response.ok) throw new Error(body.error || `Calculator cloud save failed: ${response.status}`);
    return body;
  }

  function updateVersion(result) {
    sync.version = Number(result.version) || sync.version;
    sync.updatedAt = result.updatedAt || sync.updatedAt;
  }

  function finishSave(result, revision) {
    updateVersion(result);
    sync.available = true;
    if (clearPending(revision)) setStatus("synced", syncedStatusText());
  }

  function queueSave() {
    if (!sync.initialized || sync.applyingRemote) return;
    clearTimeout(sync.saveTimer);
    sync.saveTimer = setTimeout(() => pushCloudState().catch(() => {}), 450);
  }

  async function pushCloudState(options = {}) {
    if (!sync.initialized) return;
    if (sync.saving) {
      sync.needsSave = true;
      return;
    }

    sync.saving = true;
    const revision = sync.localRevision;
    setStatus("saving", "端末の変更をクラウドへ同期中");
    try {
      const result = await writeCloudState(options);
      if (result.conflict) {
        updateVersion(result);
        const merged = mergeStates(result, readLocalState());
        writeLocalState(merged);
        const retry = await writeCloudState({ force: true });
        finishSave(retry, revision);
      } else {
        finishSave(result, revision);
      }
    } catch {
      sync.available = false;
      setStatus("error", "クラウド同期を再試行します");
    } finally {
      sync.saving = false;
      if (sync.needsSave) {
        sync.needsSave = false;
        queueSave();
      }
    }
  }

  async function pullCloudState(options = {}) {
    if (!sync.initialized || sync.saving) return;
    try {
      const remote = await fetchCloudState();
      const remoteVersion = Number(remote.version) || 0;
      sync.available = true;
      sync.updatedAt = remote.updatedAt || sync.updatedAt;

      if (remoteVersion <= sync.version) {
        if (hasPendingChanges()) queueSave();
        else setStatus("synced", syncedStatusText());
        return;
      }

      sync.version = remoteVersion;
      const local = readLocalState();
      if (hasPendingChanges()) {
        const merged = mergeStates(remote, local);
        writeLocalState(merged);
        queueSave();
        return;
      }

      if (serializeState(remote) !== serializeState(local)) {
        writeLocalState(remote);
        if (!options.silent) setStatus("synced", "別端末の履歴を反映しました");
      }
      setStatus("synced", syncedStatusText());
    } catch {
      sync.available = false;
      setStatus("error", "クラウドを確認できません。通信時に再試行します");
    }
  }

  async function initializeCloudSync() {
    setStatus("checking", "クラウドの履歴を確認中");
    try {
      const remote = await fetchCloudState();
      sync.available = true;
      sync.initialized = true;
      sync.version = Number(remote.version) || 0;
      sync.updatedAt = remote.updatedAt || null;
      const local = readLocalState();
      const remoteHasData = remote.records?.length || remote.stores?.length || remote.version > 0;

      if (remoteHasData) {
        if (hasPendingChanges()) {
          const merged = mergeStates(remote, local);
          writeLocalState(merged);
          if (serializeState(merged) !== serializeState(remote)) {
            await pushCloudState({ force: true });
          } else {
            clearPending();
            setStatus("synced", syncedStatusText());
          }
        } else {
          writeLocalState(remote);
          setStatus("synced", syncedStatusText());
        }
      } else if (local.records.length || local.stores.length) {
        markPending();
        clearTimeout(sync.saveTimer);
        await pushCloudState({ force: true });
      } else {
        clearPending();
        setStatus("synced", syncedStatusText());
      }

      clearInterval(sync.pollTimer);
      sync.pollTimer = setInterval(() => pullCloudState({ silent: true }).catch(() => {}), syncIntervalMs);
    } catch {
      sync.available = false;
      sync.initialized = false;
      setStatus("error", "クラウドに接続できません。再表示すると再試行します");
    }
  }

  globalThis.SEDORI_CALCULATOR_CLOUD = {
    enabled: isUnifiedCalculator,
    canonicalUrl: cloudCalculatorUrl,
    markLocalChange: markPending,
    markDeleted,
    flush: pushCloudState,
  };

  window.addEventListener("online", () => pullCloudState({ silent: true }).catch(() => {}));
  window.addEventListener("focus", () => pullCloudState({ silent: true }).catch(() => {}));
  window.addEventListener("storage", (event) => {
    if (!isUnifiedCalculator || ![recordsKey, storesKey].includes(event.key)) return;
    emitStateChange();
    if (hasPendingChanges()) queueSave();
  });

  (async () => {
    try {
      if (await redirectLegacyCalculator()) return;
      if (!isUnifiedCalculator) return;
      await consumeMigrationPayload();
      await initializeCloudSync();
    } catch {
      setStatus("error", "履歴の移行に失敗しました。端末データは削除されていません");
    }
  })();
})();
