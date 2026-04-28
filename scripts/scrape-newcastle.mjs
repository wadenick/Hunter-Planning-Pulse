#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const GROUP_ID = "28d146fc-808b-4e3d-a486-59ddbd718224";
const BASE_URL = "https://cn.t1cloud.com/Services/ENV";
const SOURCE_URL = "https://cn.t1cloud.com/apps/Applications/Search/MyServices/Application_Search";
const DETAIL_URL = "https://cn.t1cloud.com/apps/Applications/Details/MyServices/Application_Details";
const SYSTEM = "city-of-newcastle-dxp-public-application";
const OUTPUT_PATH = new URL("../data/newcastle.json", import.meta.url);
const MANIFEST_PATH = new URL("../data/councils.json", import.meta.url);

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write");
const allowEmpty = args.has("--allow-empty");
const pageSize = Number(process.env.NEWCASTLE_PAGE_SIZE || 100);

const SEARCHES = [
  {
    key: "lodged-this-month",
    filterSetCode: "LodgedDate",
    filterCode: "THISMONTH",
    sortColumn: "LodgedDate",
    changeType: "New application",
    statusFallback: "Lodged"
  },
  {
    key: "determined-this-month",
    filterSetCode: "DecisionDate",
    filterCode: "THISMONTH",
    sortColumn: "DecisionDate",
    changeType: "Determination",
    statusFallback: "Determined"
  }
];

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseDxpDate(value) {
  if (!value || String(value).startsWith("1900-01-01")) return null;
  return String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

function extractSuburb(row) {
  const spaced = String(row.PrimaryPropertyAddress || row.SiteName || "");
  const doubleSpaceMatch = spaced.match(/\s{2,}([^0-9]+?)\s+NSW\s+\d{4}\b/);
  if (doubleSpaceMatch) return compact(doubleSpaceMatch[1]);

  const title = String(row.FormattedTitle || "");
  const titleMatch = title.match(/-\s+[^-]*?\s{2,}([^0-9]+?)\s+NSW\s+\d{4}\b/);
  if (titleMatch) return compact(titleMatch[1]);

  return "";
}

function inferType(row) {
  const sourceType = compact(row.ApplnType_Description);
  const text = `${sourceType} ${row.Description || ""}`.toLowerCase();
  if (text.includes("complying development")) return "Complying Development";
  if (text.includes("construction certificate")) return "Construction Certificate";
  if (text.includes("occupation certificate")) return "Occupation Certificate";
  if (text.includes("principal certifier")) return "Principal Certifier";
  if (text.includes("subdivision")) return "Subdivision";
  if (text.includes("modification")) return "Modification";
  if (text.includes("demolition")) return "Demolition";
  if (text.includes("dwelling") || text.includes("residential flat") || text.includes("apartment")) return "Residential";
  if (text.includes("commercial") || text.includes("shop") || text.includes("office") || text.includes("warehouse")) return "Commercial";
  return sourceType || "Development Application";
}

function inferTags(record) {
  const text = `${record.type} ${record.description || ""}`.toLowerCase();
  const tags = [];
  if (text.includes("dwelling") || text.includes("apartment") || text.includes("residential flat")) tags.push("residential");
  if (text.includes("demolition")) tags.push("demolition");
  if (text.includes("commercial") || text.includes("shop") || text.includes("office") || text.includes("warehouse")) tags.push("commercial");
  if (text.includes("childcare") || text.includes("child care")) tags.push("childcare");
  if (text.includes("medical") || text.includes("health")) tags.push("medical");
  if (text.includes("subdivision")) tags.push("subdivision");
  return tags;
}

function inferDecision(row) {
  const status = compact(row.SC_StatusCode);
  return /approved|refused|withdrawn/i.test(status) ? status : null;
}

function isYesterday(dateText) {
  if (!dateText) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const localDate = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, "0"),
    String(yesterday.getDate()).padStart(2, "0")
  ].join("-");
  return dateText === localDate;
}

function normaliseRow(row, source, scrapedAt) {
  const lodged = parseDxpDate(row.LodgedDate);
  const determined = parseDxpDate(row.DecisionDate);
  const address = compact(row.PrimaryPropertyAddress || row.SiteName);
  const description = compact(row.Description);
  const record = {
    id: compact(row.FileId) || `APP-${row.ApplicationId}`,
    council: "Newcastle",
    suburb: extractSuburb(row),
    address,
    applicant: "",
    type: inferType(row),
    description,
    value: 0,
    lodged,
    status: compact(row.SC_StatusCode) || source.statusFallback,
    decision: inferDecision(row),
    changedYesterday: isYesterday(source.sortColumn === "DecisionDate" ? determined : lodged),
    changeType: source.changeType,
    changeSummary: source.sortColumn === "DecisionDate"
      ? `Decision date recorded for ${compact(row.ApplnType_Description) || "application"}.`
      : `Lodged as ${compact(row.ApplnType_Description) || "application"}.`,
    lat: null,
    lng: null,
    tags: [],
    sourceCouncil: "Newcastle",
    sourceSystem: SYSTEM,
    sourceUrl: SOURCE_URL,
    portalUrl: `${DETAIL_URL}/${encodeURIComponent(row.ApplicationId)}`,
    scrapedAt,
    raw: {
      sourceKey: source.key,
      applicationId: row.ApplicationId,
      applicationType: row.ApplicationType,
      applicationTypeDescription: row.ApplnType_Description,
      fileId: row.FileId,
      formattedTitle: row.FormattedTitle,
      statusCode: row.StatusCode,
      statusDescription: row.SC_StatusCode,
      lodged,
      determined
    }
  };
  record.tags = inferTags(record);
  return record;
}

async function dxpFetch(path, body, cookie) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return {
    cookie: response.headers.get("set-cookie"),
    json: await response.json()
  };
}

function extractAuthCookie(setCookie) {
  return String(setCookie || "").match(/CiAnywhere\.Auth=[^;]+/)?.[0];
}

async function logon() {
  const { cookie, json } = await dxpFetch("/LocalGovernment/DxpApi/Guest/Logon", {
    Request: [{ GroupId: GROUP_ID }]
  });
  const authCookie = extractAuthCookie(cookie);
  const guest = json?.Guest?.Logon?.[0];
  if (!authCookie || !guest?.IsGuest) throw new Error("Guest logon did not return a usable auth cookie.");
  return authCookie;
}

async function fetchApplications(cookie, source) {
  const rows = [];
  let totalRecordCount = 0;
  let pageNumber = 1;

  do {
    const { json } = await dxpFetch("/LocalGovernment/DxpApi/PublicApplication/Query", {
      ReadDataRequest: [{
        ParameterValues: {},
        GetTotalRecordCount: true,
        PageNumber: pageNumber,
        PageSize: pageSize,
        SearchValue: "",
        SelectedFilters: [{ FilterSetCode: source.filterSetCode, FilterCode: source.filterCode }],
        SortList: [{ ColumnId: source.sortColumn, SortOrder: "DESC" }]
      }]
    }, cookie);
    const payload = json?.PublicApplication?.Query?.Data?.[0];
    const pageRows = payload?.ResultSet?.DataSet?.Table || [];
    totalRecordCount = payload?.ResultSet?.TotalRecordCount || rows.length + pageRows.length;
    rows.push(...pageRows);
    pageNumber += 1;
    if (!pageRows.length) break;
  } while (rows.length < totalRecordCount);

  return {
    source: source.key,
    totalRecordCount,
    rows
  };
}

function mergeRecords(recordSets) {
  const merged = new Map();
  for (const record of recordSets.flat()) {
    const existing = merged.get(record.id);
    if (!existing) {
      merged.set(record.id, record);
      continue;
    }
    merged.set(record.id, {
      ...existing,
      ...record,
      changedYesterday: existing.changedYesterday || record.changedYesterday,
      tags: [...new Set([...(existing.tags || []), ...(record.tags || [])])],
      raw: {
        ...existing.raw,
        ...record.raw,
        sourceKey: [...new Set([existing.raw?.sourceKey, record.raw?.sourceKey].filter(Boolean))].join(",")
      }
    });
  }
  return [...merged.values()].sort((a, b) => String(b.lodged || "").localeCompare(String(a.lodged || "")));
}

async function writeOutputs(records, scrapedAt) {
  if (!records.length && !allowEmpty) {
    throw new Error("Refusing to write zero Newcastle records. Pass --allow-empty to override.");
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    council: "Newcastle",
    generatedAt: scrapedAt,
    sourceSystem: SYSTEM,
    sourceUrl: SOURCE_URL,
    records
  }, null, 2)}\n`);

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  manifest.generatedAt = scrapedAt;
  manifest.councils = manifest.councils.map((council) => council.slug === "newcastle"
    ? { ...council, status: "scraped-dxp-current-month" }
    : council);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const scrapedAt = new Date().toISOString();
  const cookie = await logon();
  const fetched = [];

  for (const source of SEARCHES) {
    const result = await fetchApplications(cookie, source);
    fetched.push({
      ...result,
      records: result.rows.map((row) => normaliseRow(row, source, scrapedAt))
    });
  }

  const records = mergeRecords(fetched.map((source) => source.records));
  if (shouldWrite) await writeOutputs(records, scrapedAt);

  console.log(JSON.stringify({
    council: "Newcastle",
    sourceSystem: SYSTEM,
    mode: shouldWrite ? "write" : "dry-run",
    generatedAt: scrapedAt,
    pageSize,
    sourceUrl: SOURCE_URL,
    detailUrl: DETAIL_URL,
    sources: fetched.map(({ source, totalRecordCount, rows }) => ({ source, totalRecordCount, fetched: rows.length })),
    recordCount: records.length,
    sample: records.slice(0, 5)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
