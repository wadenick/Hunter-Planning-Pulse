const DATA_MANIFEST_URL = "data/councils.json";

const state = {
  council: "all",
  type: "all",
  search: "",
  changesOnly: false
};

let daRecords = [];
let councilSources = [];

const councilFilter = document.querySelector("#councilFilter");
const typeFilter = document.querySelector("#typeFilter");
const searchInput = document.querySelector("#searchInput");
const changesOnlyButton = document.querySelector("#changesOnlyButton");

function option(label, value) {
  const element = document.createElement("option");
  element.textContent = label;
  element.value = value;
  return element;
}

function setSelectOptions(select, firstLabel, values) {
  select.innerHTML = "";
  select.append(option(firstLabel, "all"));
  values.forEach((value) => select.append(option(value, value)));
}

function attachEvents() {
  councilFilter.addEventListener("change", (event) => {
    state.council = event.target.value;
    render();
  });

  typeFilter.addEventListener("change", (event) => {
    state.type = event.target.value;
    render();
  });

  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  changesOnlyButton.addEventListener("click", () => {
    state.changesOnly = !state.changesOnly;
    changesOnlyButton.setAttribute("aria-pressed", String(state.changesOnly));
    render();
  });
}

async function loadCouncilData() {
  setLoadingState();
  const manifest = await fetchJson(DATA_MANIFEST_URL);
  councilSources = manifest.councils || [];
  const councilFiles = await Promise.all(councilSources.map(async (source) => {
    const payload = await fetchJson(source.path);
    return normalizeCouncilPayload(source, payload);
  }));

  daRecords = councilFiles.flatMap((payload) => payload.records);
  populateFilters();
  render();
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function normalizeCouncilPayload(source, payload) {
  const sourceCouncil = payload.council || source.name;
  const records = (payload.records || []).map((record) => ({
    value: 0,
    changedYesterday: false,
    changeType: null,
    changeSummary: null,
    decision: null,
    tags: [],
    ...record,
    council: record.council || sourceCouncil,
    sourceCouncil: record.sourceCouncil || sourceCouncil,
    sourceSystem: record.sourceSystem || payload.sourceSystem || source.status || "unknown",
    sourceUrl: record.sourceUrl || payload.sourceUrl || source.path,
    portalUrl: record.portalUrl || record.detailUrl || null,
    scrapedAt: record.scrapedAt || payload.generatedAt || null,
    tags: Array.isArray(record.tags) ? record.tags : []
  }));
  return { ...payload, records };
}

function recordPortalUrl(record) {
  if (record.portalUrl) return record.portalUrl;
  if (record.sourceSystem === "city-of-newcastle-dxp-public-application" && record.raw?.applicationId) {
    return `https://cn.t1cloud.com/apps/Applications/Details/MyServices/Application_Details/${encodeURIComponent(record.raw.applicationId)}`;
  }
  return /^https?:\/\//.test(record.sourceUrl || "") ? record.sourceUrl : null;
}

function applyRecordLink(element, record) {
  const url = recordPortalUrl(record);
  if (!url) return;
  element.href = url;
  element.target = "_blank";
  element.rel = "noopener";
  element.setAttribute("aria-label", `Open ${record.id} in ${record.council} portal`);
}

function populateFilters() {
  const councils = [...new Set(daRecords.map((record) => record.council))].sort();
  const types = [...new Set(daRecords.map((record) => record.type))].sort();
  setSelectOptions(councilFilter, "All councils", councils);
  setSelectOptions(typeFilter, "All types", types);
}

function setLoadingState() {
  document.querySelector("#dataWindow").textContent = "Loading council JSON";
  document.querySelector("#newApplications").textContent = "-";
  document.querySelector("#newApplicationsMeta").textContent = "loading";
  document.querySelector("#totalApplications").textContent = "-";
  document.querySelector("#totalApplicationsMeta").textContent = "loading";
  document.querySelector("#topSuburb").textContent = "-";
  document.querySelector("#topSuburbMeta").textContent = "loading";
  document.querySelector("#topCouncil").textContent = "-";
  document.querySelector("#topCouncilMeta").textContent = "loading";
  document.querySelector("#lodgementChart").innerHTML = `<div class="empty-state">Loading lodgement trend.</div>`;
  document.querySelector("#pipelineChart").innerHTML = `<div class="empty-state">Loading application pipeline.</div>`;
  document.querySelector("#changesFeed").innerHTML = `<div class="empty-state">Loading change feed.</div>`;
  document.querySelector("#mapPins").innerHTML = "";
  document.querySelector("#mapMeta").textContent = "Loading";
  document.querySelector("#notableList").innerHTML = `<div class="empty-state">Loading notable applications.</div>`;
}

function setErrorState(error) {
  const message = location.protocol === "file:"
    ? "Council JSON cannot be loaded from file://. Start a local static server and open the localhost URL."
    : `Could not load council JSON: ${error.message}`;
  document.querySelector("#dataWindow").textContent = "Data load error";
  document.querySelector("#changesFeed").innerHTML = `<div class="empty-state">${message}</div>`;
  document.querySelector("#lodgementChart").innerHTML = `<div class="empty-state">${message}</div>`;
  document.querySelector("#pipelineChart").innerHTML = `<div class="empty-state">${message}</div>`;
  document.querySelector("#notableList").innerHTML = `<div class="empty-state">${message}</div>`;
  console.error(error);
}

function getFilteredRecords() {
  return daRecords.filter((record) => {
    const text = `${record.suburb} ${record.address} ${record.applicant} ${record.id} ${record.description || ""}`.toLowerCase();
    return (state.council === "all" || record.council === state.council)
      && (state.type === "all" || record.type === state.type)
      && (!state.search || text.includes(state.search))
      && (!state.changesOnly || record.changedYesterday);
  });
}

function groupBy(records, key) {
  return records.reduce((groups, record) => {
    const value = record[key] || "Unknown";
    groups[value] = groups[value] || [];
    groups[value].push(record);
    return groups;
  }, {});
}

function topGroup(records, key) {
  const groups = groupBy(records, key);
  const entries = Object.entries(groups);
  if (!entries.length) return ["-", 0];
  return entries
    .map(([name, grouped]) => [name, grouped.length])
    .sort((a, b) => b[1] - a[1])[0];
}

function monthKey(dateText) {
  return String(dateText || "").slice(0, 7);
}

function monthLabel(month) {
  const date = new Date(`${month}-01T00:00:00`);
  return date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function renderMetrics(records) {
  const dates = daRecords
    .map((record) => new Date(record.lodged))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);

  if (!dates.length) {
    document.querySelector("#dataWindow").textContent = "No data loaded";
    document.querySelector("#newApplications").textContent = "0";
    document.querySelector("#newApplicationsMeta").textContent = "no lodgement dates";
    document.querySelector("#totalApplications").textContent = "0";
    document.querySelector("#totalApplicationsMeta").textContent = "no records";
    document.querySelector("#topSuburb").textContent = "-";
    document.querySelector("#topSuburbMeta").textContent = "no records";
    document.querySelector("#topCouncil").textContent = "-";
    document.querySelector("#topCouncilMeta").textContent = "no records";
    return;
  }

  const latest = dates[dates.length - 1];
  const weekStart = new Date(latest);
  weekStart.setDate(latest.getDate() - 6);
  const newThisWeek = records.filter((record) => new Date(record.lodged) >= weekStart);
  const [suburb, suburbCount] = topGroup(records, "suburb");
  const [council, councilCount] = topGroup(records, "council");

  document.querySelector("#dataWindow").textContent = `${formatDate(dates[0])} to ${formatDate(latest)}`;
  document.querySelector("#newApplications").textContent = newThisWeek.length;
  document.querySelector("#newApplicationsMeta").textContent = `since ${formatDate(weekStart)}`;
  document.querySelector("#totalApplications").textContent = records.length;
  document.querySelector("#totalApplicationsMeta").textContent = "filtered records";
  document.querySelector("#topSuburb").textContent = suburb;
  document.querySelector("#topSuburbMeta").textContent = `${suburbCount} lodgement${suburbCount === 1 ? "" : "s"}`;
  document.querySelector("#topCouncil").textContent = council;
  document.querySelector("#topCouncilMeta").textContent = `${councilCount} record${councilCount === 1 ? "" : "s"}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function renderLodgementChart(records) {
  const months = [...new Set(daRecords.map((record) => monthKey(record.lodged)).filter(Boolean))].sort();
  if (!months.length) {
    document.querySelector("#trendMeta").textContent = "No trend";
    document.querySelector("#lodgementChart").innerHTML = `<div class="empty-state">No lodgement dates match the current filters.</div>`;
    return;
  }

  const counts = months.map((month) => records.filter((record) => monthKey(record.lodged) === month).length);
  const rolling = counts.map((_, index) => {
    const start = Math.max(0, index - 11);
    return counts.slice(start, index + 1).reduce((total, count) => total + count, 0);
  });
  const maxCount = Math.max(...counts, ...rolling, 1);
  const width = 780;
  const height = 300;
  const pad = 42;
  const chartWidth = width - pad * 2;
  const chartHeight = height - pad * 2;
  const barWidth = chartWidth / months.length * 0.56;
  const points = rolling.map((value, index) => {
    const x = pad + (chartWidth / Math.max(months.length - 1, 1)) * index;
    const y = height - pad - (value / maxCount) * chartHeight;
    return `${x},${y}`;
  }).join(" ");
  const bars = months.map((month, index) => {
    const x = pad + (chartWidth / months.length) * index + (chartWidth / months.length - barWidth) / 2;
    const barHeight = (counts[index] / maxCount) * chartHeight;
    const y = height - pad - barHeight;
    return `<rect class="bar" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, counts[index] ? 2 : 0)}" rx="5"><title>${monthLabel(month)}: ${counts[index]} lodgement${counts[index] === 1 ? "" : "s"}</title></rect>`;
  }).join("");
  const labels = months.map((month, index) => {
    const x = pad + (chartWidth / months.length) * index + chartWidth / months.length / 2;
    return `<text class="axis-label" x="${x}" y="${height - 12}" text-anchor="middle">${monthLabel(month)}</text>`;
  }).join("");

  document.querySelector("#trendMeta").textContent = `${rolling.at(-1) || 0} rolling lodgements`;
  document.querySelector("#lodgementChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#cfd8d4" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#cfd8d4" />
      ${bars}
      <polyline class="trend" points="${points}" />
      ${labels}
    </svg>
  `;
}

function renderPipeline(records) {
  const order = ["Lodged", "On exhibition", "Under assessment", "Determined", "Refused"];
  const counts = order.map((status) => {
    if (status === "Refused") return records.filter((record) => record.decision === "Refused" || record.status === "Refused").length;
    if (status === "Determined") return records.filter((record) => record.status === "Determined" && record.decision !== "Refused").length;
    return records.filter((record) => record.status === status).length;
  });
  const max = Math.max(...counts, 1);
  const width = 520;
  const height = 300;
  const rowHeight = 48;
  const colors = ["#2f6f9f", "#008b8b", "#b47b10", "#16745a", "#d45d4c"];
  const rows = order.map((label, index) => {
    const y = 30 + index * rowHeight;
    const barWidth = 300 * (counts[index] / max);
    return `
      <text class="axis-label" x="0" y="${y + 19}">${label}</text>
      <rect x="145" y="${y}" width="${Math.max(barWidth, counts[index] ? 8 : 0)}" height="28" rx="6" fill="${colors[index]}"></rect>
      <text class="axis-label" x="${160 + barWidth}" y="${y + 19}">${counts[index]}</text>
    `;
  }).join("");

  document.querySelector("#pipelineChart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${rows}</svg>`;
}

function renderChanges(records) {
  const feed = document.querySelector("#changesFeed");
  const changed = records.filter((record) => record.changedYesterday);
  if (!changed.length) {
    feed.innerHTML = `<div class="empty-state">No changes match the current filters.</div>`;
    return;
  }

  feed.innerHTML = "";
  changed
    .sort((a, b) => String(b.lodged || "").localeCompare(String(a.lodged || "")))
    .forEach((record) => {
      const item = document.querySelector("#feedItemTemplate").content.firstElementChild.cloneNode(true);
      applyRecordLink(item, record);
      item.querySelector(".change-badge").style.background = changeColor(record.changeType);
      item.querySelector("strong").textContent = `${record.changeType}: ${record.suburb}`;
      item.querySelector("p").textContent = record.changeSummary || "A tracked field changed since the previous snapshot.";
      item.querySelector("small").textContent = `${record.council} - ${record.type} - ${record.status} - ${record.id}`;
      feed.append(item);
    });
}

function changeColor(changeType) {
  return {
    "New application": "#2f6f9f",
    "New exhibition": "#008b8b",
    "Status changed": "#b47b10",
    "Value changed": "#d45d4c",
    "Determination": "#16745a"
  }[changeType] || "#637176";
}

function renderMap(records) {
  const pins = document.querySelector("#mapPins");
  const bounds = {
    minLat: -33.08,
    maxLat: -32.62,
    minLng: 151.28,
    maxLng: 152.18
  };

  pins.innerHTML = "";
  const mapped = records.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
  document.querySelector("#mapMeta").textContent = `${mapped.length} pin${mapped.length === 1 ? "" : "s"}`;
  mapped.forEach((record) => {
    const pin = document.createElement("button");
    const x = ((record.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 86 + 7;
    const y = (1 - (record.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 78 + 10;
    const size = 16;
    pin.className = "pin";
    pin.type = "button";
    pin.style.left = `${x}%`;
    pin.style.top = `${y}%`;
    pin.style.setProperty("--size", `${size}px`);
    pin.style.setProperty("--pin-color", typeColor(record.type));
    pin.setAttribute("aria-label", `${record.suburb}, ${record.type}, ${record.status}`);
    pins.append(pin);
  });
}

function typeColor(type) {
  return {
    "Multi-dwelling": "#2f6f9f",
    "Commercial": "#16745a",
    "Medical": "#d45d4c",
    "Childcare": "#b47b10",
    "Demolition": "#555f64",
    "Tourism": "#008b8b",
    "Industrial": "#7b6eb0",
    "Pub": "#9a5b2f",
    "Boarding house": "#c24475"
  }[type] || "#637176";
}

function renderNotable(records) {
  const container = document.querySelector("#notableList");
  const notable = records
    .filter((record) => record.tags.some((tag) => ["multi-dwelling", "demolition", "childcare", "medical", "pubs", "boarding houses", "commercial", "subdivision"].includes(tag)) || record.changeType === "Determination")
    .sort((a, b) => String(b.lodged || "").localeCompare(String(a.lodged || "")))
    .slice(0, 9);

  if (!notable.length) {
    container.innerHTML = `<div class="empty-state">No notable applications match the current filters.</div>`;
    return;
  }

  container.innerHTML = "";
  notable.forEach((record) => {
    const item = document.createElement("a");
    item.className = "notable record-link";
    applyRecordLink(item, record);

    const title = document.createElement("strong");
    title.textContent = `${record.suburb}: ${record.type}`;

    const description = document.createElement("p");
    description.textContent = `${record.address} by ${record.applicant || "unknown applicant"}`;

    const meta = document.createElement("small");
    meta.textContent = `${record.council} - ${record.status}${record.decision ? ` / ${record.decision}` : ""} - ${record.id}`;

    const tagRow = document.createElement("div");
    tagRow.className = "tag-row";
    record.tags.forEach((tag) => {
      const tagElement = document.createElement("span");
      tagElement.className = "tag";
      tagElement.textContent = tag;
      tagRow.append(tagElement);
    });

    item.append(title, description, meta, tagRow);
    container.append(item);
  });
}

function render() {
  const records = getFilteredRecords();
  renderMetrics(records);
  renderLodgementChart(records);
  renderPipeline(records);
  renderChanges(records);
  renderMap(records);
  renderNotable(records);
}

attachEvents();
loadCouncilData().catch(setErrorState);
