const STORAGE_KEY = "catalyst-management-system-v1";

const STATUS = {
  PRESENT: "Наличен",
  REVIEW: "Оферти / В процес на преглед",
  RESERVED: "Резервиран за продажба",
  SOLD: "Продаден",
  RECYCLING: "Изпратен за рециклиране",
  DISPOSED: "Изхвърлен",
};

const STATUS_OPTIONS = Object.values(STATUS);

const LEGACY_STATUS_MAP = {
  "Present": STATUS.PRESENT,
  "Quoted / Under Review": STATUS.REVIEW,
  "Reserved for Sale": STATUS.RESERVED,
  "Sold": STATUS.SOLD,
  "Sent for Recycling": STATUS.RECYCLING,
  "Trash / Disposed": STATUS.DISPOSED,
};

const LEGACY_ACTION_MAP = {
  "Sold": STATUS.SOLD,
  "Sent for Recycling": STATUS.RECYCLING,
  "Trash / Disposed": STATUS.DISPOSED,
  "Reserved for Sale": STATUS.RESERVED,
};

const dashboard = document.querySelector("#dashboard");
const metricTemplate = document.querySelector("#metric-card-template");
const tableBody = document.querySelector("#catalyst-table-body");
const resultCount = document.querySelector("#result-count");
const quickRegisterForm = document.querySelector("#quick-register-form");
const bulkRegisterForm = document.querySelector("#bulk-register-form");
const saveAddNewButton = document.querySelector("#save-add-new");
const searchInput = document.querySelector("#search-input");
const statusFilter = document.querySelector("#status-filter");
const priceFilter = document.querySelector("#price-filter");
const detailEmpty = document.querySelector("#detail-empty");
const detailView = document.querySelector("#detail-view");
const detailId = document.querySelector("#detail-id");
const detailSerial = document.querySelector("#detail-serial");
const detailSummary = document.querySelector("#detail-summary");
const detailForm = document.querySelector("#detail-form");
const detailStatus = document.querySelector("#detail-status");
const detailFinalAction = document.querySelector("#detail-final-action");
const photoInput = document.querySelector("#photo-input");
const photoPreviewWrap = document.querySelector("#photo-preview-wrap");
const photoPreview = document.querySelector("#photo-preview");
const activityHistory = document.querySelector("#activity-history");
const copySerialButton = document.querySelector("#copy-serial");
const markReviewedButton = document.querySelector("#mark-reviewed");
const seedDemoDataButton = document.querySelector("#seed-demo-data");

const state = {
  catalysts: [],
  nextId: 1,
  selectedId: null,
  draftPhotoDataUrl: "",
  filters: { search: "", status: "all", pricing: "all" },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.catalysts = Array.isArray(parsed.catalysts) ? parsed.catalysts.map(normalizeCatalyst) : [];
    state.nextId = Number.isFinite(parsed.nextId) ? parsed.nextId : deriveNextId(state.catalysts);
  } catch (error) {
    console.error("Неуспешно зареждане на данните", error);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ catalysts: state.catalysts, nextId: state.nextId }));
}

function deriveNextId(catalysts) {
  const highest = catalysts.reduce((max, catalyst) => Math.max(max, Number(catalyst.internalId || 0)), 0);
  return highest + 1;
}

function generateInternalId() {
  const id = state.nextId;
  state.nextId += 1;
  return String(id).padStart(5, "0");
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateTime(value) {
  if (!value) return "Няма запис";
  return new Intl.DateTimeFormat("bg-BG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Няма";
  return `${amount.toFixed(2)} лв.`;
}

function hasAnyPrice(catalyst) {
  return Object.values(catalyst.prices || {}).some((value) => Number(value) > 0);
}

function normalizeStatus(value) {
  return LEGACY_STATUS_MAP[value] || value || STATUS.PRESENT;
}

function normalizeAction(value) {
  return LEGACY_ACTION_MAP[value] || value || "";
}

function normalizeActivityMessage(message) {
  if (!message) return "Създаден запис.";
  const replacements = [
    ['Catalyst registered with status "Present".', `Катализаторът е регистриран със статус "${STATUS.PRESENT}".`],
    ['Catalyst registered with status "Quoted / Under Review".', `Катализаторът е регистриран със статус "${STATUS.REVIEW}".`],
    ['Initial prices entered from all partner catalogues.', "Въведени са начални цени от всички партньорски каталози."],
    ['Sold after comparing three catalogue offers.', "Продаден след сравнение на три каталожни оферти."],
    ['Transferred to recycling due to poor condition.', "Изпратен за рециклиране поради лошо състояние."],
    ['Photo added or updated.', "Добавена или обновена е снимка."],
    ['Catalogue prices updated and catalyst reviewed.', "Каталожните цени са обновени и катализаторът е прегледан."],
    ['Marked as sent for recycling.', "Маркиран като изпратен за рециклиране."],
  ];
  let translated = message;
  replacements.forEach(([from, to]) => {
    translated = translated.replace(from, to);
  });
  translated = translated.replace(/^Marked as sold to /, "Маркиран като продаден на ");
  translated = translated.replace(/ for ([\d.]+(?: BGN| лв\.))\.$/, " за $1.");
  translated = translated.replace(/^Marked as disposed/, "Маркиран като изхвърлен");
  translated = translated.replace(/^Status updated to "(.+)"\.$/, 'Статусът е обновен на "$1".');
  translated = translated.replace("partner", "партньор");
  return translated;
}

function normalizeCatalyst(catalyst) {
  return {
    ...catalyst,
    status: normalizeStatus(catalyst.status),
    finalAction: normalizeAction(catalyst.finalAction),
    selectedPartner: catalyst.selectedPartner === "Other" ? "Друг" : catalyst.selectedPartner || "",
    createdBy: catalyst.createdBy || "Неуточнен служител",
    activity: Array.isArray(catalyst.activity)
      ? catalyst.activity.map((entry) => ({ ...entry, message: normalizeActivityMessage(entry.message) }))
      : [],
    prices: {
      novitera: catalyst.prices?.novitera || "",
      dsauto: catalyst.prices?.dsauto || "",
      valdi: catalyst.prices?.valdi || "",
    },
  };
}

function computeLastKnownSalePrice(serialNumber, excludeId) {
  return state.catalysts
    .filter((item) => item.serialNumber.trim().toLowerCase() === serialNumber.trim().toLowerCase())
    .filter((item) => item.id !== excludeId)
    .filter((item) => item.finalAction === STATUS.SOLD && Number(item.finalSalePrice) > 0)
    .sort((a, b) => new Date(b.saleDate || b.updatedAt) - new Date(a.saleDate || a.updatedAt))[0] || null;
}

function createActivityEntry(message) {
  return { id: crypto.randomUUID(), message, timestamp: nowIso() };
}

function buildCatalyst({ serialNumber, status, createdBy, notes = "", photoDataUrl = "" }) {
  const id = crypto.randomUUID();
  const internalId = generateInternalId();
  const createdAt = nowIso();
  const normalizedStatus = normalizeStatus(status);
  return {
    id,
    internalId,
    serialNumber: serialNumber.trim(),
    status: normalizedStatus,
    createdBy: createdBy?.trim() || "Неуточнен служител",
    createdAt,
    updatedAt: createdAt,
    prices: { novitera: "", dsauto: "", valdi: "" },
    finalAction: "",
    selectedPartner: "",
    finalSalePrice: "",
    saleDate: "",
    outcomeReason: "",
    notes,
    photoDataUrl,
    activity: [createActivityEntry(`Катализаторът е регистриран със статус "${normalizedStatus}".`)],
  };
}

function upsertStatusFilterOptions() {
  statusFilter.innerHTML = '<option value="all">Всички статуси</option>';
  detailStatus.innerHTML = "";
  STATUS_OPTIONS.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    statusFilter.append(option.cloneNode(true));
    detailStatus.append(option);
  });
}

function getDashboardMetrics() {
  const stockCount = state.catalysts.filter((item) => [STATUS.PRESENT, STATUS.REVIEW].includes(item.status)).length;
  const soldCount = state.catalysts.filter((item) => item.finalAction === STATUS.SOLD || item.status === STATUS.SOLD).length;
  const recyclingCount = state.catalysts.filter((item) => item.finalAction === STATUS.RECYCLING || item.status === STATUS.RECYCLING).length;
  const disposedCount = state.catalysts.filter((item) => item.finalAction === STATUS.DISPOSED || item.status === STATUS.DISPOSED).length;
  const now = new Date();
  const newCount = state.catalysts.filter((item) => {
    const createdDate = new Date(item.createdAt);
    return createdDate.getMonth() === now.getMonth() && createdDate.getFullYear() === now.getFullYear();
  }).length;
  const pricedCount = state.catalysts.filter(hasAnyPrice).length;
  const convertedCount = state.catalysts.filter((item) => [STATUS.SOLD, STATUS.RECYCLING, STATUS.DISPOSED].includes(item.finalAction || item.status)).length;
  return [
    { label: "Текуща наличност", value: String(stockCount), detail: "Налични или в процес на преглед" },
    { label: "Продадени", value: String(soldCount), detail: "Общ брой приключени продажби" },
    { label: "За рециклиране", value: String(recyclingCount), detail: "Маркирани за рециклиране" },
    { label: "Изхвърлени", value: String(disposedCount), detail: "Отписани след преглед" },
    { label: "Нови този месец", value: String(newCount), detail: "Скоро регистрирани катализатори" },
    { label: "Конверсия", value: `${convertedCount}/${pricedCount || 0}`, detail: "Оценени записи с краен резултат" },
  ];
}

function renderDashboard() {
  dashboard.innerHTML = "";
  getDashboardMetrics().forEach((metric, index) => {
    const node = metricTemplate.content.firstElementChild.cloneNode(true);
    node.style.animationDelay = `${index * 70}ms`;
    node.querySelector(".metric-label").textContent = metric.label;
    node.querySelector(".metric-value").textContent = metric.value;
    node.querySelector(".metric-detail").textContent = metric.detail;
    dashboard.append(node);
  });
}

function getFilteredCatalysts() {
  return [...state.catalysts]
    .filter((item) => {
      const search = state.filters.search.trim().toLowerCase();
      if (!search) return true;
      return item.serialNumber.toLowerCase().includes(search) || item.internalId.toLowerCase().includes(search);
    })
    .filter((item) => state.filters.status === "all" ? true : item.status === state.filters.status)
    .filter((item) => {
      if (state.filters.pricing === "all") return true;
      return state.filters.pricing === "priced" ? hasAnyPrice(item) : !hasAnyPrice(item);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderPriceSummary(catalyst) {
  const names = { novitera: "NOV", dsauto: "DSA", valdi: "VAL" };
  const entries = Object.entries(catalyst.prices || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${names[key]}: ${Number(value).toFixed(2)}`);
  return entries.length ? entries.join(" | ") : "Все още няма цени";
}

function statusClassName(status) {
  switch (status) {
    case STATUS.PRESENT: return "status-present";
    case STATUS.REVIEW: return "status-review";
    case STATUS.RESERVED: return "status-reserved";
    case STATUS.SOLD: return "status-sold";
    case STATUS.RECYCLING: return "status-recycling";
    case STATUS.DISPOSED: return "status-disposed";
    default: return "";
  }
}

function renderTable() {
  const catalysts = getFilteredCatalysts();
  resultCount.textContent = String(catalysts.length);
  tableBody.innerHTML = "";

  if (!catalysts.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.innerHTML = '<div class="empty-state">Няма катализатори, които отговарят на избраните филтри.</div>';
    row.append(cell);
    tableBody.append(row);
    return;
  }

  catalysts.forEach((catalyst) => {
    const row = document.createElement("tr");
    if (catalyst.id === state.selectedId) row.classList.add("selected");
    row.innerHTML = `
      <td data-label="ID"><strong>#${catalyst.internalId}</strong></td>
      <td data-label="Сериен номер">${escapeHtml(catalyst.serialNumber)}</td>
      <td data-label="Статус"><span class="status-pill ${statusClassName(catalyst.status)}">${escapeHtml(catalyst.status)}</span></td>
      <td data-label="Цени">${escapeHtml(renderPriceSummary(catalyst))}</td>
      <td data-label="Резултат">${escapeHtml(catalyst.finalAction || catalyst.selectedPartner || "Изчаква решение")}</td>
      <td data-label="Обновен">${escapeHtml(formatDateTime(catalyst.updatedAt))}</td>`;
    row.addEventListener("click", () => {
      state.selectedId = catalyst.id;
      renderAll();
    });
    tableBody.append(row);
  });
}

function renderHistory(history) {
  activityHistory.innerHTML = "";
  if (!history.length) {
    const item = document.createElement("li");
    item.innerHTML = "<strong>Все още няма записани действия.</strong><span>Тук ще се виждат всички промени по катализатора.</span>";
    activityHistory.append(item);
    return;
  }
  [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach((entry) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${escapeHtml(entry.message)}</strong><span>${escapeHtml(formatDateTime(entry.timestamp))}</span>`;
    activityHistory.append(item);
  });
}

function renderDetail() {
  const catalyst = state.catalysts.find((item) => item.id === state.selectedId);
  if (!catalyst) {
    detailEmpty.classList.remove("hidden");
    detailView.classList.add("hidden");
    return;
  }

  detailEmpty.classList.add("hidden");
  detailView.classList.remove("hidden");

  const lastKnownSale = computeLastKnownSalePrice(catalyst.serialNumber, catalyst.id);
  detailId.textContent = `Вътрешен ID #${catalyst.internalId}`;
  detailSerial.textContent = catalyst.serialNumber;
  detailSummary.innerHTML = "";

  [
    { title: "Текущ статус", value: catalyst.status, detail: `Регистриран ${formatDateTime(catalyst.createdAt)}` },
    { title: "Регистриран от", value: catalyst.createdBy || "Неуточнен служител", detail: "Служител по първоначалния прием" },
    { title: "Последна известна продажба", value: lastKnownSale ? formatMoney(lastKnownSale.finalSalePrice) : "Няма предишна продажба", detail: lastKnownSale ? `Партньор: ${lastKnownSale.selectedPartner || "Неуточнен"}` : "Използвайте като ориентир" },
    { title: "Краен резултат", value: catalyst.finalAction || "Все още няма", detail: catalyst.finalAction ? `Обновен ${formatDateTime(catalyst.updatedAt)}` : "Все още е в активен процес" },
  ].forEach((card) => {
    const div = document.createElement("div");
    div.className = "summary-card";
    div.innerHTML = `<strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.value)}</span><small>${escapeHtml(card.detail)}</small>`;
    detailSummary.append(div);
  });

  detailForm.novitera.value = catalyst.prices.novitera || "";
  detailForm.dsauto.value = catalyst.prices.dsauto || "";
  detailForm.valdi.value = catalyst.prices.valdi || "";
  detailForm.status.value = catalyst.status;
  detailForm.finalAction.value = catalyst.finalAction || "";
  detailForm.selectedPartner.value = catalyst.selectedPartner || "";
  detailForm.finalSalePrice.value = catalyst.finalSalePrice || "";
  detailForm.saleDate.value = catalyst.saleDate || "";
  detailForm.outcomeReason.value = catalyst.outcomeReason || "";
  detailForm.notes.value = catalyst.notes || "";
  photoInput.value = "";

  const photo = state.draftPhotoDataUrl || catalyst.photoDataUrl;
  if (photo) {
    photoPreview.src = photo;
    photoPreviewWrap.classList.remove("hidden");
  } else {
    photoPreview.removeAttribute("src");
    photoPreviewWrap.classList.add("hidden");
  }

  renderHistory(catalyst.activity || []);
}

function renderAll() {
  renderDashboard();
  renderTable();
  renderDetail();
}

function addCatalyst(catalyst, shouldSelect = true) {
  state.catalysts.push(catalyst);
  saveState();
  if (shouldSelect) state.selectedId = catalyst.id;
  renderAll();
}

function registerSingleCatalyst(saveMode) {
  const formData = new FormData(quickRegisterForm);
  const serialNumber = String(formData.get("serialNumber") || "").trim();
  if (!serialNumber) return;

  const catalyst = buildCatalyst({
    serialNumber,
    status: String(formData.get("status") || STATUS.PRESENT),
    createdBy: String(formData.get("createdBy") || ""),
  });

  addCatalyst(catalyst, true);
  quickRegisterForm.reset();
  document.querySelector("#status-input").value = STATUS.PRESENT;
  if (saveMode === "stay") document.querySelector("#serial-input").focus();
}

function registerBulkCatalysts() {
  const serials = String(new FormData(bulkRegisterForm).get("serials") || "")
    .split(/\r?\n/)
    .map((serial) => serial.trim())
    .filter(Boolean);
  if (!serials.length) return;

  const newCatalysts = serials.map((serial) => buildCatalyst({
    serialNumber: serial,
    status: STATUS.PRESENT,
    createdBy: quickRegisterForm.createdBy.value || "",
  }));

  state.catalysts.push(...newCatalysts);
  state.selectedId = newCatalysts[newCatalysts.length - 1].id;
  saveState();
  renderAll();
  bulkRegisterForm.reset();
}

function sanitizeMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : "";
}

function buildActivityMessage(catalyst) {
  if (catalyst.finalAction === STATUS.SOLD) {
    return `Маркиран като продаден на ${catalyst.selectedPartner || "партньор"} за ${formatMoney(catalyst.finalSalePrice)}.`;
  }
  if (catalyst.finalAction === STATUS.RECYCLING) {
    return "Маркиран като изпратен за рециклиране.";
  }
  if (catalyst.finalAction === STATUS.DISPOSED) {
    return `Маркиран като изхвърлен${catalyst.outcomeReason ? `: ${catalyst.outcomeReason}` : "."}`;
  }
  if (catalyst.finalAction === STATUS.RESERVED) {
    return `Маркиран като резервиран за продажба${catalyst.selectedPartner ? ` към ${catalyst.selectedPartner}` : ""}.`;
  }
  if (hasAnyPrice(catalyst)) {
    return "Каталожните цени са обновени и катализаторът е прегледан.";
  }
  return `Статусът е обновен на "${catalyst.status}".`;
}

function syncStatusAndAction(catalyst) {
  if (catalyst.finalAction === STATUS.SOLD) catalyst.status = STATUS.SOLD;
  else if (catalyst.finalAction === STATUS.RECYCLING) catalyst.status = STATUS.RECYCLING;
  else if (catalyst.finalAction === STATUS.DISPOSED) catalyst.status = STATUS.DISPOSED;
  else if (catalyst.finalAction === STATUS.RESERVED) catalyst.status = STATUS.RESERVED;
  else if (hasAnyPrice(catalyst) && catalyst.status === STATUS.PRESENT) catalyst.status = STATUS.REVIEW;
}

function updateSelectedCatalyst() {
  const catalyst = state.catalysts.find((item) => item.id === state.selectedId);
  if (!catalyst) return;

  const previousSnapshot = JSON.stringify({
    status: catalyst.status,
    finalAction: catalyst.finalAction,
    selectedPartner: catalyst.selectedPartner,
    finalSalePrice: catalyst.finalSalePrice,
    prices: catalyst.prices,
    notes: catalyst.notes,
    outcomeReason: catalyst.outcomeReason,
  });

  catalyst.prices = {
    novitera: sanitizeMoney(detailForm.novitera.value),
    dsauto: sanitizeMoney(detailForm.dsauto.value),
    valdi: sanitizeMoney(detailForm.valdi.value),
  };
  catalyst.status = detailForm.status.value;
  catalyst.finalAction = detailForm.finalAction.value;
  catalyst.selectedPartner = detailForm.selectedPartner.value;
  catalyst.finalSalePrice = sanitizeMoney(detailForm.finalSalePrice.value);
  catalyst.saleDate = detailForm.saleDate.value;
  catalyst.outcomeReason = detailForm.outcomeReason.value.trim();
  catalyst.notes = detailForm.notes.value.trim();
  catalyst.updatedAt = nowIso();

  const hadDraftPhoto = Boolean(state.draftPhotoDataUrl);
  if (hadDraftPhoto) {
    catalyst.photoDataUrl = state.draftPhotoDataUrl;
    state.draftPhotoDataUrl = "";
  }

  syncStatusAndAction(catalyst);

  const currentSnapshot = JSON.stringify({
    status: catalyst.status,
    finalAction: catalyst.finalAction,
    selectedPartner: catalyst.selectedPartner,
    finalSalePrice: catalyst.finalSalePrice,
    prices: catalyst.prices,
    notes: catalyst.notes,
    outcomeReason: catalyst.outcomeReason,
  });

  if (previousSnapshot !== currentSnapshot) catalyst.activity.push(createActivityEntry(buildActivityMessage(catalyst)));
  if (hadDraftPhoto) catalyst.activity.push(createActivityEntry("Добавена или обновена е снимка."));

  saveState();
  renderAll();
}

function seedDemoData() {
  const demoItems = [
    { serialNumber: "KTX-4421-BG", status: STATUS.REVIEW, createdBy: "Николай", notes: "Запазен корпус, добър референтен брой." },
    { serialNumber: "VN-9011-R", status: STATUS.SOLD, createdBy: "Петър", notes: "Повтарящ се сериен номер в предишни продажби." },
    { serialNumber: "DSA-1100-X", status: STATUS.RECYCLING, createdBy: "Мария", notes: "Лошо състояние, не си струва директна продажба." },
  ].map((item) => buildCatalyst(item));

  demoItems[0].prices = { novitera: "280.00", dsauto: "295.00", valdi: "270.00" };
  demoItems[0].activity.push(createActivityEntry("Въведени са начални цени от всички партньорски каталози."));

  demoItems[1].prices = { novitera: "340.00", dsauto: "360.00", valdi: "355.00" };
  demoItems[1].finalAction = STATUS.SOLD;
  demoItems[1].status = STATUS.SOLD;
  demoItems[1].selectedPartner = "DSAuto";
  demoItems[1].finalSalePrice = "360.00";
  demoItems[1].saleDate = new Date().toISOString().slice(0, 10);
  demoItems[1].activity.push(createActivityEntry("Продаден след сравнение на три каталожни оферти."));

  demoItems[2].prices = { novitera: "120.00", dsauto: "", valdi: "105.00" };
  demoItems[2].finalAction = STATUS.RECYCLING;
  demoItems[2].status = STATUS.RECYCLING;
  demoItems[2].activity.push(createActivityEntry("Изпратен за рециклиране поради лошо състояние."));

  state.catalysts.push(...demoItems);
  state.selectedId = demoItems[0].id;
  saveState();
  renderAll();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attachListeners() {
  quickRegisterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    registerSingleCatalyst("save");
  });

  saveAddNewButton.addEventListener("click", () => registerSingleCatalyst("stay"));

  bulkRegisterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    registerBulkCatalysts();
  });

  searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderTable();
  });

  statusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderTable();
  });

  priceFilter.addEventListener("change", (event) => {
    state.filters.pricing = event.target.value;
    renderTable();
  });

  detailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateSelectedCatalyst();
  });

  photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.draftPhotoDataUrl = await readFileAsDataUrl(file);
    renderDetail();
  });

  copySerialButton.addEventListener("click", async () => {
    const catalyst = state.catalysts.find((item) => item.id === state.selectedId);
    if (!catalyst) return;
    try {
      await navigator.clipboard.writeText(catalyst.serialNumber);
      copySerialButton.textContent = "Копирано";
      window.setTimeout(() => {
        copySerialButton.textContent = "Копирай номера";
      }, 1400);
    } catch (error) {
      console.error("Проблем при копиране", error);
    }
  });

  markReviewedButton.addEventListener("click", () => {
    detailStatus.value = STATUS.REVIEW;
    detailFinalAction.value = "";
  });

  seedDemoDataButton.addEventListener("click", () => {
    if (!state.catalysts.length) seedDemoData();
  });
}

function init() {
  upsertStatusFilterOptions();
  loadState();
  if (!state.selectedId && state.catalysts.length) {
    state.selectedId = [...state.catalysts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0].id;
  }
  attachListeners();
  renderAll();
}

init();
