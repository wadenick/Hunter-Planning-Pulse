#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const MANIFEST_PATH = new URL("../data/councils.json", import.meta.url);
const DASHBOARD_PATH = new URL("../data/dashboard.json", import.meta.url);
const RECORD_INDEX_PATH = new URL("../data/records/index.json", import.meta.url);
const RECORDS_DIR = new URL("../data/records/", import.meta.url);
const DASHBOARD_RECORD_LIMIT = Number(process.env.DASHBOARD_RECORD_LIMIT || 2000);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function monthKey(dateText) {
  return String(dateText || "").slice(0, 7);
}

function yearKey(dateText) {
  return String(dateText || "unknown").slice(0, 4) || "unknown";
}

function sortByLodgedDesc(a, b) {
  return String(b.lodged || "").localeCompare(String(a.lodged || ""));
}

function countBy(records, key) {
  return Object.fromEntries([...records.reduce((counts, record) => {
    const value = record[key] || "Unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function monthlyCounts(records) {
  const counts = new Map();
  for (const record of records) {
    const month = monthKey(record.lodged);
    if (month) counts.set(month, (counts.get(month) || 0) + 1);
  }
  return Object.fromEntries([...counts].sort((a, b) => a[0].localeCompare(b[0])));
}

async function writeRecordChunks(councilSources, recordsByCouncil) {
  await rm(RECORDS_DIR, { recursive: true, force: true });
  await mkdir(RECORDS_DIR, { recursive: true });

  const chunks = [];
  for (const council of councilSources) {
    const records = recordsByCouncil.get(council.slug) || [];
    const byYear = records.reduce((groups, record) => {
      const year = yearKey(record.lodged);
      groups.set(year, groups.get(year) || []);
      groups.get(year).push(record);
      return groups;
    }, new Map());

    const councilDir = new URL(`${council.slug}/`, RECORDS_DIR);
    await mkdir(councilDir, { recursive: true });
    for (const [year, yearRecords] of [...byYear].sort((a, b) => b[0].localeCompare(a[0]))) {
      const path = `data/records/${council.slug}/${year}.json`;
      await writeFile(new URL(`${year}.json`, councilDir), `${JSON.stringify({
        council: council.name,
        slug: council.slug,
        year,
        generatedAt: new Date().toISOString(),
        recordCount: yearRecords.length,
        records: yearRecords.sort(sortByLodgedDesc)
      }, null, 2)}\n`);
      chunks.push({ council: council.name, slug: council.slug, year, path, recordCount: yearRecords.length });
    }
  }

  await writeFile(RECORD_INDEX_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    chunks
  }, null, 2)}\n`);
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const recordsByCouncil = new Map();
  const allRecords = [];

  for (const council of manifest.councils || []) {
    const payload = await readJson(new URL(`../${council.path}`, import.meta.url));
    const records = payload.records || [];
    recordsByCouncil.set(council.slug, records);
    allRecords.push(...records);
  }

  const sortedRecords = [...allRecords].sort(sortByLodgedDesc);
  const dashboardRecords = sortedRecords.slice(0, DASHBOARD_RECORD_LIMIT);

  await writeRecordChunks(manifest.councils || [], recordsByCouncil);
  await writeFile(DASHBOARD_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: manifest.generatedAt || null,
    recordCount: allRecords.length,
    dashboardRecordCount: dashboardRecords.length,
    dashboardRecordLimit: DASHBOARD_RECORD_LIMIT,
    dataStrategy: "Dashboard uses a bounded summary payload; full records are partitioned by council and lodgement year.",
    councils: manifest.councils || [],
    counts: {
      byCouncil: countBy(allRecords, "council"),
      byType: countBy(allRecords, "type"),
      byStatus: countBy(allRecords, "status"),
      byMonth: monthlyCounts(allRecords)
    },
    records: dashboardRecords
  }, null, 2)}\n`);

  console.log(`Built dashboard payload with ${dashboardRecords.length} of ${allRecords.length} records.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
