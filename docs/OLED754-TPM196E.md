# Philips 55OLED754 / TPM196E (MediaTek MT5806) support

This adds support for a second SAPHI generation to the reversible custom-Home
jailbreak. The original work targets the **65PUT6703/56 (TPM186E)**; this port
makes the same reversible launcher hook — and a new minimal **ad-hider** mode —
work on the **55OLED754/12 (TPM196E, MediaTek MT5806)**.

Everything here is **reversible** and touches only `localStorage`; no stock
firmware file or app-install state is modified.

## Firmware differences (TPM186E → TPM196E)

| | TPM186E (65PUT6703) | TPM196E (55OLED754) |
|---|---|---|
| Platform | | MediaTek MT5806 |
| UA | `com.tpv-tech.TPM186E` | `com.tpv-tech.TPM196E` |
| Browser / jQuery | | Chrome 55, jQuery 2.1.4 |
| Native bridge global | `TV_JSP` is a function | `TV_JSP` **undefined** — reached via `getTvJspService()` |
| Bridge API shape | **namespaced**: `svc.utility.X`, `svc.tvServices.Y`, `svc.mmpServices.Z` | **flat**: methods sit directly on `getTvJspService()` (`notifyOpenUrl`, `advMsg`, `executeJSSnippet`, `getConfigValue`, …) |
| Injection landing page | dashboard | the content browser (`ContentBrowser/content_browser.html`), not the dashboard |

### `compat.js` — flat-bridge shim

`native-home/compat.js` makes a flat service look namespaced so the rest of the
(firmware-agnostic) code runs unchanged on both sets. It is additive and
idempotent: on namespaced firmware it detects the namespaces already exist and
does nothing. On flat firmware it aliases `svc.utility`, `svc.tvServices`,
`svc.mmpServices` to the service itself and aliases `TV_JSP` to
`getTvJspService`.

Accordingly, every bridge call in `install.js` / `restore.js` now uses the
`(svc.utility || svc)` / `(svc.tvServices || svc)` pattern so it resolves on
either firmware.

### Install from the content browser

On TPM196E, the DMR/injection vector lands the webview on the content browser,
not the dashboard. Both pages share `localStorage['IHSMenuItems']` on the same
`file://` origin, so `install.js` now accepts **either** page. When it installs
from the content browser it patches the menu, then `notifyOpenUrl`s a fresh
dashboard so its menu images fire the boot `onload` hook exactly as a cold boot
does.

## Modes

`oled_home.py` installs the hook with two runtime modes (`--mode`):

- **`full`** — the custom Home UI (port of `session.js`). *Experimental on
  TPM196E:* it renders on cold boot but currently traps the remote, because
  `session.js` key handling targets the TPM186E firmware. Use `restore` + reboot
  to recover. Needs the key handling adapted before it is usable here.
- **`adhide`** (recommended, safe) — a minimal, non-intrusive runtime that does
  **not** replace the UI or capture navigation keys. The stock home stays fully
  functional; only Philips' native advertisement windows are suppressed.

### `adhide.js` — full ad suppression

SAPHI shows two promotions: the **boot promotion** (the `smallAdv` native window
that pops shortly after the dashboard renders) and the promotion that **re-opens
whenever you return to the dashboard with the Home/Menu key**. `adhide.js`
suppresses both:

- a **permanent** lightweight guard (`advMsg('<adWindow>', 'HIDE_WIN ')` once a
  second) — never stops, so the ad can't creep back;
- an **instant re-hide** on `visibilitychange` / `focus` / `keydown`, so the
  Home/Menu promotion is closed before it becomes visible;
- turns the home-menu ("IHS") ad off at the source via the native
  `setIhsStatusforAd()` bridge call;
- neutralises the stock `open_*_Ads_window` / `show_*_Ads_window` functions.

`restore.js` re-enables `setIhsStatusforAd` so a restore truly returns the set to
stock.

## Usage

```sh
# Hide all ads, keep the stock home (recommended)
python oled_home.py install --mode adhide --tv <tv-ip> --host <pc-ip>

# Revert everything (reversible, localStorage only)
python oled_home.py restore --tv <tv-ip> --host <pc-ip>
```

`--tv` is the TV's LAN IP; `--host` is the PC running the helper (reachable by
the TV). A backup of the stock menu is written under `build/` before any change.

## Operational notes & safety (TPM196E)

These were learned the hard way; they keep the TV's web stack healthy:

- **The DMR renderer (UPnP, port 2870) is the only injection vector and does not
  survive a soft reboot.** After a reboot it may be fully down. A **full
  power-cycle** (pull the plug ~30 s) restarts it. JointSpace (port 1925) stays
  up regardless and is the safe recovery + input channel.
- **Do not iterate live on the TV.** Rapid repeated DMR injections destabilise
  the whole web stack (JointSpace and UPnP stop answering HTTP) and the DMR
  renderer locks with `errorCode 705 "Transport locked"`. Build/adapt offline,
  then do **one** clean install run on a freshly power-cycled set.
- **Always serve a valid MP3 with Range support** at the audio path; a 404 there
  hangs the renderer in `TRANSITIONING` until a reboot.
- **Never send the `Standby` key during recovery** — standby stops JointSpace
  HTTP from responding. Wake with `POST http://<tv>:1925/6/powerstate
  {"powerstate":"On"}` or the remote power button.
- JointSpace v6.1 (port 1925, `pairing_type: none`) exposes `input/key`,
  `activities/browser` (`POST /6/activities/browser {url}` opens a URL without
  DMR), `audio/volume`, `ambilight`, etc. `applications` / `sources` /
  `applicationmanager` are **Forbidden**, so native app launch needs the
  `file://` `getTvJspService` bridge, not JointSpace.
