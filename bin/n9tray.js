#!/usr/bin/env node

/**
 * n9tray CLI — installer and launcher for n9router tray app (macOS).
 *
 * Usage:
 *   n9tray              # launch (install if needed)
 *   n9tray --install    # force (re)install from latest release
 *   n9tray --update     # same as --install
 *   n9tray --version    # show version
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const APP_DIR = "/Applications";
const APP_NAME = "n9router tray.app";
const APP_PATH = path.join(APP_DIR, APP_NAME);

const pkg = require("../package.json");
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version);
  process.exit(0);
}

const needsInstall = args.includes("--install") || args.includes("--update") || !fs.existsSync(APP_PATH);

if (needsInstall) {
  require("../lib/installer").install().then(launch).catch(err => {
    console.error("Install failed:", err.message);
    process.exit(1);
  });
} else {
  launch();
}

function launch() {
  try {
    execSync(`open -a "${APP_PATH}"`, { stdio: "inherit" });
  } catch {
    console.error(`Failed to launch ${APP_NAME}. Try: n9tray --install`);
    process.exit(1);
  }
}
