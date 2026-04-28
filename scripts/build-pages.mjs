#!/usr/bin/env node

import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

const files = [
  "index.html",
  "app.js",
  "styles.css"
];

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  for (const file of files) {
    await cp(new URL(file, root), new URL(file, dist));
  }

  await cp(new URL("data/", root), new URL("data/", dist), { recursive: true });
  await writeFile(new URL(".nojekyll", dist), "");
  console.log("Built GitHub Pages artifact in dist/.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
