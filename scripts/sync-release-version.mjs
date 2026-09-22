import { readFile, writeFile } from "node:fs/promises";

const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || "";
const version = tag.replace(/^v/, "");

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Release tag must contain a semantic version, received: ${tag || "(empty)"}`);
}

const updateJson = async (path, update) => {
  const value = JSON.parse(await readFile(path, "utf8"));
  update(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

await updateJson("package.json", (packageJson) => {
  packageJson.version = version;
});

await updateJson("package-lock.json", (lockfile) => {
  lockfile.version = version;
  if (lockfile.packages?.[""]) {
    lockfile.packages[""].version = version;
  }
});

await updateJson("src-tauri/tauri.conf.json", (tauriConfig) => {
  tauriConfig.version = version;
});

console.log(`Using release version ${version}`);
