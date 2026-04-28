#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const manifestPath = new URL("../data/councils.json", import.meta.url);
const requiredRecordFields = ["id", "council", "type", "lodged", "status", "sourceSystem", "sourceUrl", "scrapedAt"];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const manifest = await readJson(manifestPath);
  assert(Array.isArray(manifest.councils), "data/councils.json must contain a councils array.");

  let totalRecords = 0;
  for (const council of manifest.councils) {
    assert(council.name && council.slug && council.path && council.status, `Invalid council manifest entry: ${JSON.stringify(council)}`);

    const payload = await readJson(new URL(`../${council.path}`, import.meta.url));
    assert(payload.council === council.name, `${council.path} council must be ${council.name}.`);
    assert(Array.isArray(payload.records), `${council.path} must contain a records array.`);

    for (const [index, record] of payload.records.entries()) {
      for (const field of requiredRecordFields) {
        assert(record[field] !== undefined && record[field] !== null, `${council.path} record ${index} is missing ${field}.`);
      }
      assert(record.council === council.name, `${council.path} record ${index} has council ${record.council}.`);
      assert(Array.isArray(record.tags), `${council.path} record ${index} tags must be an array.`);
      assert(Number.isFinite(Number(record.value)), `${council.path} record ${index} value must be numeric.`);
    }

    totalRecords += payload.records.length;
  }

  assert(totalRecords > 0, "At least one council record is required for deployment.");
  console.log(`Validated ${totalRecords} records across ${manifest.councils.length} councils.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
