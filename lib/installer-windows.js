const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");
const { fetchJSON, download } = require("./http");

const REPO = "nightwalker89/n9router-tray";

/**
 * Windows installer — downloads the latest NSIS setup .exe (or .msi fallback)
 * and runs it silently. NSIS currentUser mode needs no admin; MSI uses /passive.
 */
async function install() {
  console.log("Fetching latest release...");
  const release = await fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`);

  // Prefer the NSIS setup .exe; fall back to .msi.
  const asset =
    release.assets.find((a) => /setup\.exe$/i.test(a.name)) ||
    release.assets.find((a) => /\.exe$/i.test(a.name)) ||
    release.assets.find((a) => /\.msi$/i.test(a.name));
  if (!asset) throw new Error("No Windows installer (.exe/.msi) in latest release");

  console.log(`Downloading ${asset.name} (${release.tag_name})...`);
  const dest = path.join(os.tmpdir(), asset.name);
  await download(asset.browser_download_url, dest);

  console.log("Installing...");
  if (/\.msi$/i.test(dest)) {
    execSync(`msiexec /i "${dest}" /passive`, { stdio: "inherit" });
  } else {
    // NSIS silent install (/S). currentUser install mode => no elevation.
    execSync(`"${dest}" /S`, { stdio: "inherit" });
  }

  try { fs.unlinkSync(dest); } catch {}
  console.log("Installed. Launch from the Start Menu or run: n9tray");
}

module.exports = { install };
