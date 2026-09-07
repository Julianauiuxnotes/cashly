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

## Running unattended on a Raspberry Pi

If no laptop will be at the shop, a small always-on board works instead —
this is the recommended way to run the bridge day-to-day, rather than
relying on a Mac that needs to stay open.

**Board:** get a **Raspberry Pi Zero 2 W**, not the original Pi Zero W. Both
have Bluetooth, but the original's armv6 CPU has much weaker prebuilt-binary
support for the native Bluetooth module this bridge depends on
(`@abandonware/noble`) — the Zero 2 W's armv7/aarch64 CPU avoids that
entirely. A Pi 3/4/5 also works fine if you already have one spare.

**1. Flash the OS.** Use Raspberry Pi Imager. Pick **Raspberry Pi OS Lite**
(no desktop needed). In the imager's settings (gear icon / advanced
options) before writing: enable SSH, set a username/password, and enter
your shop's WiFi SSID/password — this gets you a headless setup with no
monitor or keyboard needed.

**2. SSH in and install Node + build tools:**

```
ssh <username>@raspberrypi.local
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3 libbluetooth-dev bluez
```

(The apt-provided Node on Raspberry Pi OS is often too old — NodeSource's
setup script above installs a current one instead.)

**3. Get the code onto the Pi** — either `git clone` the repo, or `scp -r`
the project from your Mac, then:

```
cd cashly
npm run build
cd bridge
npm install
```

**4. Let Node use Bluetooth without running as root:**

```
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

Without this, noble needs the whole process running as root to open a raw
Bluetooth socket — the systemd service below assumes you've run this step
(it grants the capability directly instead).

**5. Auto-start on boot**, so a power cut or reboot doesn't require SSHing
back in: copy `bridge/cashly-bridge.service` to the Pi, edit
`WorkingDirectory`/`User` if your paths or username differ, then:

```
sudo cp cashly-bridge.service /etc/systemd/system/
sudo systemctl enable --now cashly-bridge
```

Check it's running with `systemctl status cashly-bridge` and
`journalctl -u cashly-bridge -f` for live logs (same output you'd see from
`npm start` directly).

**6. Find its address.** Raspberry Pi OS broadcasts an mDNS hostname by
default, so `http://raspberrypi.local:8787/cashly/` should work from any
phone on the same WiFi without needing to look up its IP. If you're running
more than one Pi on the network, give this one a distinct hostname first
(`sudo raspi-config` → System Options → Hostname, e.g. `cashly-bridge`),
then use `http://cashly-bridge.local:8787/cashly/` instead.

This setup is untested against your actual hardware — if something in it
doesn't match reality once you have the Pi in hand, that's expected; treat
it as a starting point to debug from rather than an exact script.
