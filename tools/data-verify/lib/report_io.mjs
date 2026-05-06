import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function defaultReportPath(filename) {
  return resolve("tools/data-verify/reports", filename);
}

export async function writeTextFile(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return path;
}

export async function writeJsonFile(path, payload) {
  return writeTextFile(path, JSON.stringify(payload, null, 2));
}

export function reportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
