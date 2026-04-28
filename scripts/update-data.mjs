#!/usr/bin/env node

import { spawn } from "node:child_process";

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  await run("node", ["scripts/scrape-newcastle.mjs", "--write"]);
  await run("node", ["scripts/validate-data.mjs"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
