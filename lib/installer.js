const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const REPO = "nightwalker89/n9router-tray";
const APP_DIR = path.join(os.homedir(), ".n9tray");
const APP_NAME = "n9router-tray.app";

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, { headers: { "User-Agent": "n9tray-cli" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(JSON.parse(data)));
      }).on("error", reject);
    };
    get(url);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, { headers: { "User-Agent": "n9tray-cli" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", reject);
    };
    get(url);
  });
}

async function install() {
  console.log("Fetching latest release...");
  const release = await fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
  const dmgAsset = release.assets.find((a) => a.name.endsWith(".dmg"));
  if (!dmgAsset) throw new Error("No DMG found in latest release");

  console.log(`Downloading ${dmgAsset.name} (${release.tag_name})...`);
  const dmgPath = path.join(os.tmpdir(), dmgAsset.name);
  await download(dmgAsset.browser_download_url, dmgPath);

  console.log("Installing...");
  fs.mkdirSync(APP_DIR, { recursive: true });

  const mountPoint = "/tmp/n9tray-dmg";
  try { execSync(`hdiutil detach "${mountPoint}" -quiet 2>/dev/null`); } catch {}
  execSync(`hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -nobrowse -quiet`);
  try {
    const appName = fs.readdirSync(mountPoint).find((f) => f.endsWith(".app"));
    if (!appName) throw new Error("No .app found in DMG");
    const dest = path.join(APP_DIR, appName);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
    execSync(`cp -R "${mountPoint}/${appName}" "${APP_DIR}/"`);
  } finally {
    execSync(`hdiutil detach "${mountPoint}" -quiet`);
    fs.unlinkSync(dmgPath);
  }

  // Remove quarantine attribute
  try { execSync(`xattr -cr "${APP_DIR}"`); } catch {}

  console.log(`Installed to ${APP_DIR}`);
}

module.exports = { install };
