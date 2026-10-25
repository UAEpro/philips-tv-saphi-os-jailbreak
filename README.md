# Philips TV SAPHI OS Jailbreak

A reversible custom Home screen that runs inside the TV's existing SAPHI dashboard. It
adds favourites, an installed-app picker, connected inputs, rotating scenery,
and an optional prayer-time card while retaining native TV controls.

The implementation saves its UI and launcher hook in the TV's browser storage.
It does not replace the operating system or flash firmware. This guide explains
the approach, installation, recovery, and the files to edit for a different design.

Here, **jailbreak** means using a firmware-specific HTML injection path to run
custom code in the existing native dashboard. It does **not** provide a root
shell, replace SAPHI, or make Android APKs compatible. The stock firmware files
remain intact. Use this only on a TV you own or are authorized to modify.

The included design has glossy rounded tiles, an instant 5% focus enlargement,
remote navigation, a native installed-app picker and detected inputs. Personal
network settings, locations, backups, account data and firmware are not included.
This is an independent project, not an official Philips tool.

## Compatibility and requirements

The reference implementation targets **Philips 65PUT6703/56 with
TPM186E_018.005.036.001**. These are compatibility identifiers, not a claim that
all Philips TVs support the method. `TPM186E` identifies a firmware family;
confirm the full model and software version before proceeding.

The installer currently checks the model name, but does not enforce the firmware
version. A different model or firmware needs separate inspection of its native
APIs, dashboard and menu format. Do not simply remove the model check. Android
TV launcher and ADB instructions do not apply to this SAPHI implementation.

You need:

- A compatible TV switched on, and a computer on the same local network.
- Python 3; installation uses the standard library without extra packages.
- Node.js for the existing tests, and a browser for the design preview.
- A reachable computer LAN address and an available helper port, default `8768`.
- The source files, including `native-home/silence.mp3`.

Firmware extraction is optional research, not an installation requirement.

## How the approach works

The key distinction is between displaying a web page and running inside the
TV's native dashboard. An ordinary browser preview can show the design, but
cannot provide the dashboard's privileged app and input APIs.

### 1. Identify the native entry point

UPnP/DLNA exposes a media renderer. On the reference firmware, the native music
player renders title metadata as HTML and exposes the `TV_JSP` JavaScript
bridge. A short image error handler in the title loads an installer script from
the computer. This is a firmware-specific HTML injection path, not a standard
Philips application-install API.

The investigation checked title rendering, script execution and native API
availability separately. Read-only inspection of matching firmware explained
the dashboard paths, launch functions and window messages. The ordinary TV
Internet Browser did not provide the required native bridge.

### 2. Enter and render the real Home dashboard

`native_home.py` sends a silent audio item through `SetAVTransportURI` and
`Play`. Its title loader is limited to 127 characters. The loaded script uses
`notifyOpenUrl` to open `file:///3rd/html5/php/dash/index.html` at 1080p, then
`mtvuiUtil.sendPlatformMsg` to run the installer in that dashboard context.

The runtime replaces the dashboard document with
`document.open()`, `document.write()` and `document.close()`. Existing native
globals remain available for app launches, sources and settings. Loading code
in another window would not establish that the visible Home had changed.

### 3. Make Home reopen the saved UI

Replacing the document alone lasts only until Philips reloads its dashboard.
The installer therefore preserves the exact original `IHSMenuItems` menu and
adds load/error handlers to existing `Reorder` image entries. When the stock
menu renders again, the handler loads the saved custom runtime from localStorage.

The hook temporarily hides the old document and schedules the replacement on
the next event-loop turn, without a fixed startup delay. This reduces the flash
of the Philips menu during the handoff. The temporary visibility change is
released even if the runtime throws, so a failed load does not leave Home blank.

The installation order matters:

1. Read the menu and retain any existing original backup.
2. Check the expected menu anchors; the installer requires at least two.
3. Send the original backup to the computer and wait for acceptance.
4. Save the original menu, full runtime and enable flag on the TV.
5. Write the menu hook and synchronize `window.menu_info_tpv`.
6. Verify the saved runtime, then render the custom Home.

A reinstall must never replace the original backup with an already patched
menu. A firmware update, storage reset or regenerated Philips menu can remove
the hook, so persistence must be checked on the target device.

### 4. Keep native features connected

The app picker reads the TV's installed-app registry rather than assuming a
fixed app list. Known built-in apps use native launch names; downloaded apps
use their actual IDs and launch URLs. Adding a favourite does not install an
app, and removing one does not uninstall it.

The connected-input row combines HDMI CEC, mounted USB storage and a valid
signal on the active HDMI input. Names prefer a configured source alias, then
the device name, then a port label such as `HDMI 1`. An unnamed device is still
shown when there is connection evidence. Inactive non-CEC devices may not be
detectable, and standby CEC entries can persist. **All sources** remains available
for manual selection; the full source list is not itself proof of connection.

The Philips promotion is a separate native window above the page. CSS changes
to Home cannot reliably remove it. The runtime uses the stock
`advMsg('smallAdv', 'HIDE_WIN ')` command, suppresses stock show callbacks and
keeps a lightweight hide guard while Home is visible. Recovery restores the
original menu and callbacks.

While custom Home is visible, the native session captures the remote's Home
key (`MENU`, code `462`) and exits to `sys_index`, matching the stock dashboard's
close behaviour. It consumes that press and release instead of forwarding them
to the generic handler that can reopen the stock dashboard. Held-key repeats
are suppressed; hidden Home does not intercept other pages' keys. These event
listeners are removed during reload and restoration.

## Project map

| File | Responsibility |
| --- | --- |
| [home-app/config.js](home-app/config.js) | Public clock/prayer defaults; copy to ignored `config.local.js` for personal settings |
| [home-app/index.html](home-app/index.html) | Page structure, headings, cards, controls and dialog containers |
| [home-app/app.css](home-app/app.css) | Layout, spacing, typography, colours, glossy surfaces and focus styles |
| [home-app/app.js](home-app/app.js) | Tile rendering, favourites, remote navigation, clock, scenery and prayer data |
| [home-app/bridge.js](home-app/bridge.js) | Native app registry, input detection, app launches, source changes and settings |
| [native_home.py](native_home.py) | LAN helper, bootstrap, asset assembly, update and recovery commands |
| [native-home/install.js](native-home/install.js) | Original-menu backup and persistent launcher hook |
| [native-home/session.js](native-home/session.js) | Native document replacement, promotion suppression and diagnostic commands |
| [native-home/restore.js](native-home/restore.js) | Restore stock Home without requiring a running custom UI |
| [tv_control.py](tv_control.py) | UPnP and DIAL status/control |
| [build_home_app.py](build_home_app.py) | Standalone preview/candidate build; optional reference-page hash check |
| [tests/](tests/) | Installation, restoration, native data, asynchronous lifecycle and date tests |

## Install, update and restore

Run commands from the project directory. Replace the placeholders below with
addresses from the TV's network settings and the computer's active LAN interface:

```sh
TV_IP='REPLACE_WITH_TV_LAN_IP'
COMPUTER_IP='REPLACE_WITH_COMPUTER_LAN_IP'
python3 tv_control.py --host "$TV_IP" status
```

If the address is unknown, use the router's client list or local SSDP discovery
for `urn:schemas-upnp-org:device:MediaRenderer:1`, then verify the returned model.
A timeout can mean the TV is asleep or the devices are separated by guest-network
isolation. The reference controller expects the renderer on port `2870`;
other firmware may advertise different endpoints.

**Always pass your own addresses.** There are no development network defaults
or machine-specific launch shortcuts. Manage one TV per project copy: the helper
uses a single session file and can reuse an existing session before checking newly
supplied addresses. Restore and stop the existing session before targeting another TV.

### Get the source

```sh
git clone https://github.com/UAEpro/philips-tv-saphi-os-jailbreak.git
cd philips-tv-saphi-os-jailbreak
```

### Preview the layout

Generate a standalone preview without downloading firmware or connecting to a TV:

```sh
python3 build_home_app.py
python3 -m http.server 8765 --bind 127.0.0.1 --directory build/preview
```

Open `http://127.0.0.1:8765/preview.html`. Use arrow keys, Enter and Escape to
check focus, scrolling and dialogs. The preview uses sample app/device data;
native actions are blocked. Regenerate the HTML after source edits, then refresh
the browser. Preview success does not establish TV compatibility or installation.

### Check the code

```sh
python3 -m py_compile native_home.py tv_control.py build_home_app.py
node --check home-app/config.js
node --check home-app/app.js
node --check home-app/bridge.js
node --check native-home/install.js
node --check native-home/session.js
node --check native-home/restore.js
node tests/native_home.test.cjs
node tests/home_atmosphere.test.cjs
node tests/native_session.test.cjs
python3 -m unittest discover -s tests -p "test_*.py"
```

### Install or deploy an edit

Installation briefly interrupts playback to enter the native media player:

```sh
python3 native_home.py launch --tv "$TV_IP" --host "$COMPUTER_IP" --background
```

`--host` must be the computer's reachable LAN address, not loopback. Allow the TV
to reach the helper through the computer's firewall. A healthy existing helper
is reused; `launch` then shows the existing Home without deploying source edits.

To install edited HTML, CSS or JavaScript through that helper:

```sh
python3 native_home.py reload
python3 native_home.py inspect
```

`reload` assembles the current files and saves the updated runtime on the TV.
A `queued` reply only acknowledges the command queue. Verify a fresh TV callback
and the visible screen. Changes to the Python helper require a process restart;
served HTML/CSS/JavaScript changes do not. Use recovery before a controlled
helper restart, and avoid competing helper processes.

### Verify the result

Use `python3 native_home.py status` locally to inspect connection state and
recent events. Its output can include device and app details; do not publish it
unreviewed. The `inspection` event includes `uiVersion`, native context, screen
size, app/device data and atmosphere state. Check timestamps and the version
currently defined in `native-home/session.js`, not an older successful event.

On the physical TV, check:

1. The new screen, readable text and responsive arrow/OK/Back navigation.
2. Home closing and reopening, with the custom UI returning and promotion hidden.
3. The app picker against installed apps, plus a real app launch and return Home.
4. Connected inputs against actual devices, including unnamed devices if available.
5. Background loading/fallback and any enabled location-dependent features.
6. Operation with the computer disconnected, and a normal TV power cycle.
7. Restoration to Philips Home.

The UI and Home hook are stored on the TV. Image/calendar downloads run directly
from the TV; the computer serves installation and optional diagnostics. This
architecture is intended to work without an always-on computer, but offline
operation and cold-start persistence must be tested on each target. Online
refreshes require internet access; valid caches provide limited offline content.

### Verify restart and computer independence

Use two separate checks so a failure has a clear cause:

1. **Cold restart:** leave the computer on, turn the TV off, disconnect its
   power for 30 seconds, reconnect it and switch it on. After startup, press
   Home and test navigation. Observe the saved runtime returning without sending
   a new `launch` or `reload`. Standby alone is not a cold-start test.
2. **Computer off:** shut down the computer without using the restore command.
   Check Home closing/reopening, arrows and an app launch. For the strongest
   check, also cold-restart the TV while the computer remains off, then press
   Home again. Keep the TV connected to the router if testing online features.

Record the visible result before turning the computer back on. A failed optional
diagnostic connection is expected while the helper is unavailable; it must not
prevent the locally saved UI from working. Distinguish cached scenery/calendar
data from a new internet download. If custom Home fails, bring the computer back
online and inspect the failure before reinstalling, which would invalidate the
persistence check. Keep per-device results and network details in private local
notes rather than adding them to this general guide.

### Restore Philips Home

With the TV switched on:

```sh
python3 native_home.py recover --tv "$TV_IP" --host "$COMPUTER_IP"
```

Recovery can bootstrap through the media player when the dashboard is suspended
or its old helper is unavailable. It disables the hook, restores and reads back
the exact original menu, removes the saved runtime/backup keys, and reloads
Philips Home. Favourites and content caches remain; computer backup files remain.
Confirm a fresh `stock-restored` event and the original screen.

With a running helper, `python3 native_home.py stop` also restores Home and stops
the helper. A foreground helper attempts restoration on a normal keyboard
interrupt. **Do not use either action to test computer independence.** Disconnect
the computer from the network without issuing restore, then use the physical remote.

## Change the layout

Most design work belongs in `home-app/`. Leave the native installer and restore
path intact when changing the appearance.

| What to change | Where to edit |
| --- | --- |
| Header, hero text, section order and control labels | `index.html`: `header`, `.hero`, `.apps-section`, `.devices-section`, `.essentials-row` |
| Screen margins and canvas | `app.css`: `body`, `#home`; preview scaling is `fit()` in `app.js` |
| App tile size, gaps, corners and colours | `app.css`: `.app-card`, `.app-card.more`, app-specific classes |
| Device tile layout | `app.css`: `.devices-row`, `.device-card`, `.device-name`, `.device-meta` |
| Glossy surfaces and background contrast | `app.css`: `.glass`, `.scene-shade`, `.landscape` |
| Remote selection highlight | `app.css`: `button:focus` and `.app-card:focus`; rounded shadows replace the old browser's square outline, with an instant 5% enlargement and small lift for app tiles. Keep row padding large enough for the enlarged tile; avoid focus transitions to preserve fast navigation. |
| App contents and favourites | `app.js`: `renderApps()`, `customize()`, `favourites`; real app discovery stays in `bridge.js` |
| Device contents and refresh behaviour | `app.js`: `refreshDevices()`; connection evidence stays in `bridge.js` |
| Dialog appearance and scrolling | `app.css`: `#overlay`, `#dialog-options`, `.option` |
| Remote movement and scroll-to-focus | `app.js`: `handleKey()`, `reveal()`, and the `data-row` attributes |
| Background selection and interval | `app.js`: `HomeAtmosphere()`, `scenes`, `scenePeriod`, `loadScene()` |
| Clock format and greeting | `app.js`: `clock()` and the `HomeData` date helpers |

### Example: smaller app tiles

Edit the matching declarations in `home-app/app.css`, or append an override:

```css
.app-card {
    flex: 0 0 260px;
    width: 260px;
    height: 160px;
    margin-right: 20px;
    border-radius: 20px;
}
.app-card.more {
    flex-basis: 200px;
    width: 200px;
}
```

Then regenerate the preview and test horizontal scrolling, long app names and
focus visibility. Deploy with `reload` only after the preview looks right.

### Keep the remote-navigation contract

The canvas is **1920 × 1080**, even when the panel itself has a higher resolution.
The browser preview scales it down. Changing the canvas requires coordinated
changes to CSS, `fit()`, the viewport and the native window resolution.

Navigation uses these rows:

| `data-row` | Controls |
| --- | --- |
| `0` | Header / Customize |
| `1` | App tiles and Add apps |
| `2` | Connected devices |
| `3` | TV controls |

Left/right follows DOM order within a row. Up/down selects the nearest horizontal
button in the next populated row. When reordering sections, update both the HTML
and the row attributes generated by `renderApps()` / `refreshDevices()`. Adding
a fifth row also requires changing the `0..3` bounds in `handleKey()`.

Keep IDs referenced by JavaScript, such as `apps`, `devices`, `overlay`,
`dialog-options` and the clock/prayer fields. Removing a widget's markup without
updating its JS lookups can stop the page. Keep the `APP_CONFIG`, `APP_CSS`, `APP_BRIDGE` and
`APP_JS` template markers used by `home_html()`.

### Backgrounds and optional prayer times

Scenery uses [Lorem Picsum](https://picsum.photos/) images with photographer
credits. Edit `scenes` to change the pool and `scenePeriod` to change the rotation
interval. The existing renderer expects a Picsum image ID; another provider
requires changes to URL generation and credit handling. Photos crossfade while
Home is visible and idle; they are not live video.

The prayer card uses the [AlAdhan API](https://aladhan.com/prayer-times-api)
and is **disabled by default**. No coordinates or calendar requests are included
in the default setup. The clock defaults to UTC.

To personalize it:

```sh
cp home-app/config.js home-app/config.local.js
```

Edit the ignored `config.local.js` file:

- Set `utcOffsetMinutes` to your fixed local UTC offset in minutes.
- To enable prayer times, set `prayers.enabled` to `true`, then enter your own
  latitude, longitude, IANA timezone, calculation method and display labels.
- The offset must match the selected timezone. This implementation does not
  automatically follow daylight-saving transitions; update the offset when needed
  or implement and test timezone-aware date/countdown handling first.
- Keep `enabled: false` to hide the card and disable its calendar requests and timer.

Both builders embed the local configuration when present, so the TV does not need
to retrieve a separate settings file. Configuration changes require `reload`.
The cache key includes coordinates, method, timezone and offset, preventing a
location change from silently reusing another timetable. Changing only labels does
not alter calculation settings. Timings are calculated and depend on the chosen
method; verify them against your local timetable.

Keep personal configuration and generated HTML out of commits. The local file is
ignored by Git; the public defaults remain in `config.js`.

### Keep navigation fast

The runtime targets an older browser: use ES5-compatible JavaScript and simple
CSS. Prefer the existing gradients and transparency over modern backdrop blur.
Avoid continuous full-screen transforms, animated blurred shadows and synchronous
image re-encoding. Keep focus changes immediate and clearly visible.

The current design uses 720p background JPEGs, asynchronous caching, a short
crossfade and idle-only image work. Device scans are throttled and wait until
navigation settles. Preserve cleanup of timers, requests and event listeners
when reloading. Do not measure physical remote latency by timing helper commands;
they use a separate polling loop. JS handler durations also exclude rendering.

When Home becomes hidden, its clock, device-scan, calendar, landscape and
promotion-guard intervals stop. Pending app-registry/calendar/photo requests
are canceled, and stale callbacks cannot revive them. On return, Home resumes
one set of timers, keeps the cached scene and refreshes data as needed. Optional
helper diagnostics remain available; this is not a claim of zero background CPU
use. Inspection exposes `performance.uiTimers`, `atmosphere.activity` and
`promotionGuardActive` to verify the visible/hidden lifecycle.

One stock timer needs explicit handling: `displayTime()` survives
`document.open()` and uses `g_iHS_show` / `g_iHS_freeze_counter` to close Home
after 120 seconds. Replacing its document removes the listeners that reset that
counter, so it can keep closing each newly opened Home once per second. The
custom session retires those two JavaScript variables at startup and on visibility
changes. This does not cancel shared native timers or change TV settings.
`stockIdle.visible` should be `false` and `stockIdle.seconds` should be `0` in
inspection. Verify Home stays open beyond two minutes and still closes/reopens
with the remote. Restoring Philips Home reloads its original timer behaviour.

The old dashboard's firmware files remain the startup and recovery route.
Deleting them is not part of this optimization. The custom document replaces
the stock page's visible content, but this does not prove that every original
native callback or service has stopped. Avoid blanket timer cancellation,
system-file deletion or disabling TV services without a verified recovery path.
These changes stay within the saved custom runtime and can be undone by reloading
an earlier source version or restoring Philips Home.

## Storage and sharing

| Storage key / variable | Purpose |
| --- | --- |
| `IHSMenuItems` | Philips launcher menu with reversible hooks |
| `compact-home.stock-menu.v1` | Exact original menu |
| `compact-home.runtime.v1` | Complete custom UI and native runtime |
| `compact-home.enabled.v1` | Enables the saved hook |
| `compact-home.favourites.v1` | Favourite app order |
| `compact-home.scene.v1` | Last cached landscape |
| `prayerKey` in `app.js` | Location-specific calendar cache |

`build/` contains local session state, backups, logs and generated previews.
The session file contains a control secret; app registry backups can contain
private launch URLs. Keep these out of public documentation and shared archives.
The helper restricts UI delivery to the selected local addresses and authenticates
control requests; preserve those checks when changing its implementation.

For sharing, include source files, tests, this guide and `silence.mp3`. Review
all staged content before publishing. Personal settings belong in ignored
`home-app/config.local.js`; generated HTML can contain those settings. The ignored `research/firmware/` and `research/tools/`
directories are not needed for ordinary installation.

## Workflow for an AI agent

An agent can edit and test the design with filesystem and shell access. To
install and verify it, the agent also needs access to the TV's LAN and someone
who can confirm the physical display and remote behaviour.

1. Read the project map, installer, bridge, runtime and recovery code. Identify
   the actual model, firmware and network addresses; never inherit another setup's defaults.
2. For matching firmware, use the existing install/reload path. For a new target,
   inspect matching firmware and probe native capabilities before adapting it.
   Verify the dashboard path, service calls, app registry and menu anchors.
3. Make layout changes in `home-app/`. Keep native-context checks, exact backups,
   restore verification and promotion handling intact.
4. Run relevant checks, generate a preview and exercise keyboard navigation.
5. Deploy to the selected TV, reusing a healthy helper. Verify fresh callbacks
   and the actual picture; a preview or queued command is not installation proof.
6. Test Home reopening, app/source actions and recovery. Check computer-off and
   power-cycle behaviour separately. Report what was actually verified.
7. Document reusable knowledge without publishing addresses, location settings,
   device inventories, session secrets, launch URLs or a user's activity history.

A reusable starting prompt:

> Adapt this Philips SAPHI Home project for my TV. Read README.md and the native
> installation/recovery code first. Discover and verify my target's model,
> firmware and LAN addresses instead of guessing. Explain
> any compatibility gap before modifying the installer. Make design changes in
> home-app/, preserve original-menu backups and restoration, and keep remote
> navigation responsive. Preview and test locally, deploy through the existing
> helper, then verify the physical screen and Home-button reopening. Test offline
> persistence separately. Keep personal settings and diagnostic data out of
> shared documentation.

Useful firmware paths when adapting the native integration:

| Path on the reference firmware | What to inspect |
| --- | --- |
| `/3rd/html5/php/dash/index.html` | Native dashboard and loaded libraries |
| `/3rd/html5/php/dash/main.js` | Dashboard/window lifecycle |
| `/3rd/html5/php/dash/keyHandle.js` | Native app launch arguments |
| `/3rd/html5/php/dash/menu_update.js` | App-registry processing |
| `/3rd/html5/libs/mtvui/base.js` | Native services and window messages |
| `/3rd/html5/libs/mtvui/input_source.js` | Input IDs, CEC matching and switching |
| `/3rd_rw/html5/dash/HomeMenu/current/app/appsInstalled.txt` | Installed-app registry |

The public repository contains no firmware, extracted Philips libraries or
per-device research dumps. For another firmware version, obtain and inspect your
own matching package without modifying the TV first. `build_home_app.py --stock PATH_TO_REFERENCE_HTML` optionally verifies the known reference dashboard hash;
normal previews and installation do not require that file. A standalone candidate
is not an installable firmware image.

## Troubleshooting

| Symptom | Next check |
| --- | --- |
| TV does not respond | Power, current LAN address, client isolation and advertised services |
| Command is queued but screen is unchanged | Fresh connection/events, dashboard visibility and runtime version |
| Preview works but native actions fail | Native dashboard context and `TV_JSP`; HTTP previews cannot control the TV |
| Stock Home returns on reopening | Saved runtime, enable flag and original menu anchors; the menu may have regenerated |
| Stock Home flashes briefly before custom Home | Deploy the updated saved hook with `reload`; check the masked handoff and explicit Home-key handling |
| Home immediately disappears back to HDMI after working initially | Check the surviving stock idle counter; deploy the lifecycle fix and verify `stockIdle` stays inactive beyond two minutes |
| Promotion returns | Early native hide, blocked show callbacks and visible-page hide guard |
| Installed app is missing | Actual registry refresh; firmware bundles and preview samples are not installed-app evidence |
| Connected device is missing | CEC, USB or active-signal evidence; inactive non-CEC inputs may be undetectable |
| Photo or calendar fails only on TV | TV-side internet/TLS/CORS behaviour; retain cache and fallback UI |
| Backup or storage write fails | Preserve the original backup, inspect the failure and recover before retrying |
| Recovery appears queued or fails | Keep the TV on, check fresh restoration evidence and confirm Philips Home visually |

## Streaming app compatibility

The custom Home does not make Android packages compatible with SAPHI or upgrade its browser engine. A website opening is separate from working remote navigation and video playback. Current Stremio Web requires features absent from the tested browser, and the current Shahid website uses newer JavaScript syntax.

Streaming experiments are not shipped in this repository. Catalogue loading did
not establish reliable video playback, and a native-player test required a TV
power cycle. The public release contains the custom Home only and does not claim
to install or provide working Shahid or Stremio apps.
