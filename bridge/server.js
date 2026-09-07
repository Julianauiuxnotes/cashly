// Cashly print bridge — runs on a machine that already has working
// Bluetooth to the receipt printer (e.g. this Mac). It connects to the
// printer once over BLE using Node's own Bluetooth stack (no browser
// involved) and exposes a plain HTTP endpoint any phone on the same WiFi
// can POST print bytes to.
//
// This exists because iOS bans the Web Bluetooth API in WebKit — no iPhone
// browser can ever talk BLE directly to the printer, no matter what the
// web app does. Routing print jobs through this always-on relay is the
// workaround: the phone only needs a plain HTTP fetch, which every browser
// supports.
//
// It also serves the built app itself (../dist) over plain HTTP, so a
// phone can open it same-origin — fetching this bridge's /print endpoint
// from the HTTPS GitHub Pages deployment would otherwise be blocked by the
// browser's mixed-content policy (HTTPS page → HTTP LAN endpoint).
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import noble from "@abandonware/noble";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = process.env.PORT || 8787;

// Same candidate service UUIDs the browser app (PRINTER_SERVICE_UUIDS in
// src/cashier-app.jsx) scans — kept in sync manually since this is a
// separate, non-bundled Node script. Used to recognize the printer among
// whatever else is advertising nearby, since noble sees every BLE device
// in range, not just this one.
const PRINTER_SERVICE_UUIDS = new Set(
  [
    "000018f0-0000-1000-8000-00805f9b34fb",
    "0000ff00-0000-1000-8000-00805f9b34fb",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    "0000ffe0-0000-1000-8000-00805f9b34fb",
    "0000fff0-0000-1000-8000-00805f9b34fb",
    "0000ae30-0000-1000-8000-00805f9b34fb",
    "0000af30-0000-1000-8000-00805f9b34fb",
  ].map((u) => u.replace(/-/g, "").toLowerCase())
);

// Optional exact-name filter, for when service-UUID matching alone isn't
// selective enough (e.g. another BLE device nearby happens to advertise one
// of the same common service UUIDs). Set before starting: PRINTER_NAME="Cat
// Printer" npm start. Substring match, case-insensitive.
const NAME_FILTER = (process.env.PRINTER_NAME || "").toLowerCase();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let printerCharacteristic = null;
let printerName = null;

function looksLikePrinter(peripheral) {
  const name = peripheral.advertisement.localName || "";
  if (NAME_FILTER) return name.toLowerCase().includes(NAME_FILTER);
  const adUuids = (peripheral.advertisement.serviceUuids || []).map((u) =>
    u.replace(/-/g, "").toLowerCase()
  );
  return adUuids.some((u) => PRINTER_SERVICE_UUIDS.has(u));
}

async function connectToPrinter(peripheral) {
  await noble.stopScanningAsync();
  console.log(`Connecting to ${peripheral.advertisement.localName || peripheral.id}…`);
  await peripheral.connectAsync();
  const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();
  const writable = characteristics.find(
    (c) => c.properties.includes("write") || c.properties.includes("writeWithoutResponse")
  );
  if (!writable) {
    console.log("Connected, but no writable characteristic found — disconnecting, still scanning.");
    await peripheral.disconnectAsync();
    await noble.startScanningAsync([], false);
    return;
  }
  printerCharacteristic = writable;
  printerName = peripheral.advertisement.localName || peripheral.id;
  console.log(`Printer connected: ${printerName}`);
  peripheral.once("disconnect", () => {
    console.log("Printer disconnected — resuming scan.");
    printerCharacteristic = null;
    printerName = null;
    noble.startScanningAsync([], false).catch(() => {});
  });
}

noble.on("stateChange", async (state) => {
  if (state === "poweredOn") {
    console.log("Bluetooth on — scanning for the printer…");
    await noble.startScanningAsync([], false);
  } else {
    await noble.stopScanningAsync().catch(() => {});
  }
});

noble.on("discover", async (peripheral) => {
  if (printerCharacteristic || !looksLikePrinter(peripheral)) return;
  try {
    await connectToPrinter(peripheral);
  } catch (err) {
    console.log(`Connect failed (${err.message}) — still scanning.`);
  }
});

// Paced the same way as the browser app's writeBytesToCharacteristic — this
// printer family's tiny BLE RX buffer silently drops data sent faster.
const CHUNK = 182;
const CHUNK_DELAY_MS = 40;

async function printBytes(bytes) {
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    const withoutResponse = printerCharacteristic.properties.includes("writeWithoutResponse");
    await printerCharacteristic.writeAsync(chunk, withoutResponse);
    await sleep(CHUNK_DELAY_MS);
  }
  await sleep(1500);
}

const app = express();

app.get("/health", (req, res) => {
  res.json({ ok: true, printerConnected: !!printerCharacteristic, printerName });
});

app.post("/print", express.raw({ type: "*/*", limit: "5mb" }), async (req, res) => {
  if (!printerCharacteristic) {
    return res.status(503).json({ ok: false, error: "No printer connected to the bridge." });
  }
  try {
    await printBytes(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "Print failed." });
  }
});

// Serve the built app at the same base path Vite builds it for (see
// vite.config.js: base: '/cashly/'), so its asset URLs resolve unchanged.
app.use("/cashly", express.static(DIST_DIR));
app.get("/", (req, res) => res.redirect("/cashly/"));

app.listen(PORT, () => {
  console.log(`\nCashly print bridge running.`);
  console.log(`On any phone connected to this WiFi, open:`);
  console.log(`  http://<this-Mac's-LAN-IP>:${PORT}/cashly/\n`);
  console.log(`(Find the IP in System Settings → Wi-Fi → Details, or run: ipconfig getifaddr en0)`);
});
