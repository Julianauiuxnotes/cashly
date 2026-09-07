# Cashly print bridge

Lets any phone print receipts to the Bluetooth thermal printer — iPhone
included. iOS bans the Web Bluetooth API in WebKit, so no browser on
iPhone/iPad can ever talk BLE to the printer directly, no matter what the
web app does. This bridge works around that: it's a small always-on server
that runs on a computer with working Bluetooth to the printer (this Mac),
connects to the printer once using Node's own Bluetooth stack, and exposes
a plain HTTP endpoint any phone on the same WiFi can print through.

It also serves the built Cashly app itself, so a phone can open it
same-origin over plain HTTP — fetching this bridge's `/print` endpoint from
the HTTPS GitHub Pages deployment would otherwise be blocked by the
browser's mixed-content policy (HTTPS page → HTTP LAN endpoint).

## One-time setup

```
cd bridge
npm install
```

The first `npm install` needs to compile a native Bluetooth module
(`@abandonware/noble`) — requires Xcode Command Line Tools on macOS
(`xcode-select -p` to check; `xcode-select --install` if missing).

## Running it

From the **repo root** (not `bridge/`), build the app, then start the
bridge:

```
npm run build
cd bridge && npm start
```

The first time it runs, macOS will prompt for Bluetooth permission for
Terminal (or whatever app you launched it from) — grant it, or the printer
will never be found.

You'll see something like:

```
Cashly print bridge running.
On any phone connected to this WiFi, open:
  http://<this-Mac's-LAN-IP>:8787/cashly/
```

Find the Mac's LAN IP with `ipconfig getifaddr en0`, or System Settings →
Wi-Fi → Details. On any phone connected to the **same WiFi network**, open
that address — the app loads and works exactly like the GitHub Pages
version.

In Settings → Receipt printer, use "Connect to bridge" and enter the same
address (e.g. `http://192.168.1.23:8787`) rather than "Connect printer" —
the bridge, not the phone's browser, is the one actually talking Bluetooth.

## Re-running after code changes

The bridge serves whatever is in `../dist` — rebuild before restarting it:

```
npm run build   # from the repo root
cd bridge && npm start
```

## Printer detection

On startup the bridge scans for BLE devices and connects to the first one
that either matches a known printer service UUID (the same list the
browser app scans, `PRINTER_SERVICE_UUIDS` in `src/cashier-app.jsx`) or, if
set, matches `PRINTER_NAME`:

```
PRINTER_NAME="RPP02N" npm start
```

Use `PRINTER_NAME` if the bridge ever connects to the wrong nearby BLE
device — watch the terminal log for what it finds and connects to.

## Other machines / a non-default port

```
PORT=9000 npm start
```

Whatever machine runs this needs to (a) stay on and awake during opening
hours, and (b) stay within Bluetooth range of the printer.
