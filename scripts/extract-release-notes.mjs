import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/extract-release-notes.mjs <tag>");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  console.error("GITHUB_REPOSITORY is required");
  process.exit(1);
}

const changelog = readFileSync("CHANGELOG.md", "utf8");
const sectionPattern = new RegExp(
  `## \\[${version.replaceAll(".", "\\.")}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`,
);
const match = changelog.match(sectionPattern);
if (!match) {
  console.error(`No changelog section found for version ${version}`);
  process.exit(1);
}

const notes = match[1].trimEnd();
const tags = execSync("git tag --sort=-v:refname", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const currentIndex = tags.indexOf(tag);
const previousTag = currentIndex >= 0 ? tags[currentIndex + 1] : null;
const compareLine = previousTag
  ? `**Compare:** https://github.com/${repo}/compare/${previousTag}...${tag}`
  : "";

const body = [
  `## What's new in ${version}`,
  "",
  notes,
  "",
  "---",
  "",
  `**Full changelog:** [CHANGELOG.md](https://github.com/${repo}/blob/main/CHANGELOG.md)`,
  compareLine,
]
  .filter(Boolean)
  .join("\n");

process.stdout.write(body);
