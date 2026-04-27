#!/usr/bin/env node

const SOURCES = [
  {
    key: "submitted-last-28-days",
    status: "Lodged",
    changeType: "New application",
    url: "https://cn-web.t1cloud.com/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx?Field=S&Period=L28&f=%24P1.ETR.SEARCH.SL28&r=TCON.LG.WEBGUEST"
  },
  {
    key: "determined-last-28-days",
    status: "Determined",
    changeType: "Determination",
    url: "https://cn-web.t1cloud.com/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx?Field=D&Period=L28&f=%24P1.ETR.SEARCH.DL28&r=TCON.LG.WEBGUEST"
  }
];

const SYSTEM = "city-of-newcastle-etrack";

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function htmlToText(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function toIsoDate(auDate) {
  const match = String(auDate || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractReference(line) {
  return line.match(/\b(DA|CC|CDC|MOD|BC|SC)[-/ ]?\d{4}[-/ ]?\d+\b/i)?.[0]?.replace(/\s+/g, "-") || null;
}

function inferType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("child care") || lower.includes("childcare")) return "Childcare";
  if (lower.includes("medical") || lower.includes("health")) return "Medical";
  if (lower.includes("demolition")) return "Demolition";
  if (lower.includes("dwelling") || lower.includes("residential flat") || lower.includes("apartment")) return "Multi-dwelling";
  if (lower.includes("commercial") || lower.includes("shop") || lower.includes("office")) return "Commercial";
  return "Development Application";
}

function inferTags(record) {
  const tags = [];
  const text = `${record.type} ${record.raw?.text || ""}`.toLowerCase();
  if (record.value >= 2500000) tags.push("high-value");
  if (text.includes("dwelling") || text.includes("apartment")) tags.push("multi-dwelling");
  if (text.includes("demolition")) tags.push("demolition");
  if (text.includes("childcare") || text.includes("child care")) tags.push("childcare");
  if (text.includes("medical") || text.includes("health")) tags.push("medical");
  if (text.includes("pub") || text.includes("hotel")) tags.push("pubs");
  if (text.includes("boarding")) tags.push("boarding houses");
  return [...new Set(tags)];
}

function parseCandidateLines(html, source) {
  const text = htmlToText(html);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\b(DA|CC|CDC|MOD|BC|SC)[-/ ]?\d{4}[-/ ]?\d+\b/i.test(line))
    .map((line) => normaliseLine(line, source))
    .filter((record) => record.id || record.lodged || record.raw.text.length > 30);
}

function normaliseLine(line, source) {
  const dates = [...line.matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)].map((match) => match[0]);
  const id = extractReference(line) || `${source.key}-${Math.abs(hashCode(line))}`;
  const lodged = toIsoDate(dates[0]);
  const determined = source.status === "Determined" ? toIsoDate(dates.at(-1)) : null;
  const value = Number(line.match(/\$\s?([\d,]+(?:\.\d{2})?)/)?.[1]?.replace(/,/g, "") || 0);
  const type = inferType(line);
  const record = {
    id,
    council: "Newcastle",
    suburb: "",
    address: "",
    applicant: "",
    type,
    value,
    lodged,
    status: source.status,
    decision: source.status === "Determined" ? inferDecision(line) : null,
    changedYesterday: false,
    changeType: source.changeType,
    changeSummary: "Imported from City of Newcastle historical eTrack listing.",
    lat: null,
    lng: null,
    tags: [],
    sourceCouncil: "Newcastle",
    sourceSystem: SYSTEM,
    sourceUrl: source.url,
    scrapedAt: new Date().toISOString(),
    raw: {
      sourceKey: source.key,
      text: line,
      determined
    }
  };
  record.tags = inferTags(record);
  return record;
}

function inferDecision(line) {
  const lower = line.toLowerCase();
  if (lower.includes("refused")) return "Refused";
  if (lower.includes("approved")) return "Approved";
  if (lower.includes("withdrawn")) return "Withdrawn";
  return null;
}

function hashCode(value) {
  return [...value].reduce((hash, character) => Math.imul(31, hash) + character.charCodeAt(0) | 0, 0);
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "HunterPlanningPulse/0.1 research scraper"
    }
  });
  if (!response.ok) throw new Error(`${source.key} returned ${response.status}`);
  const html = await response.text();
  return parseCandidateLines(html, source);
}

async function main() {
  const results = [];
  for (const source of SOURCES) {
    const records = await fetchSource(source);
    results.push({ source: source.key, count: records.length, records: records.slice(0, 5) });
  }
  console.log(JSON.stringify({
    council: "Newcastle",
    sourceSystem: SYSTEM,
    mode: "research-dry-run",
    note: "Parser is intentionally conservative and ignores page chrome; inspect raw.text before writing records to data/newcastle.json.",
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
