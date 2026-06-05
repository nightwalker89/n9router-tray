#!/usr/bin/env node

/**
 * n9tray CLI — installer and launcher for the n9router Tray app (macOS + Windows).
 *
 * Usage:
 *   n9tray              # launch (install if needed)
 *   n9tray --install    # force (re)install from latest release
 *   n9tray --update     # same as --install
 *   n9tray --version    # show version
 */

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const pkg = require("../package.json");
const args = process.argv.slice(2);

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

if (!isWin && !isMac) {
  console.error("n9tray supports macOS and Windows only.");
  process.exit(1);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version);
  process.exit(0);
}

// Candidate install locations per OS (first existing wins).
const APP_PATHS = isMac
  ? ["/Applications/n9router Tray.app"]
  : [
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "n9router Tray",
        "n9router Tray.exe",
      ),
      path.join(
        process.env.ProgramFiles || "C:\\Program Files",
        "n9router Tray",
        "n9router Tray.exe",
      ),
    ];

const installedPath = APP_PATHS.find((p) => p && fs.existsSync(p));
const needsInstall =
  args.includes("--install") || args.includes("--update") || !installedPath;

if (needsInstall) {
  require("../lib/installer")
    .install()
    .then(launch)
    .catch((err) => {
      console.error("Install failed:", err.message);
      process.exit(1);
    });
} else {
  launch();
}

function launch() {
  try {
    if (isMac) {
      execSync(`open -a "${APP_PATHS[0]}"`, { stdio: "inherit" });
    } else {
      const exe = APP_PATHS.find((p) => p && fs.existsSync(p)) || APP_PATHS[0];
      spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    console.error("Failed to launch n9router Tray. Try: n9tray --install");
    process.exit(1);
  }
}
