/**
 * Platform dispatcher for the n9tray installer.
 * macOS uses the DMG flow; Windows downloads and runs the NSIS/MSI installer.
 */
const impl =
  process.platform === "win32"
    ? require("./installer-windows")
    : require("./installer-macos");

module.exports = { install: impl.install };
