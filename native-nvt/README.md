# TPN226E native Home adapter

This adapter targets the physically tested **55PUS7657/12** with
**TPN226E_V226.003.087.001**, UI build
`Thu Apr 30 2026 14:12:33 GMT+0800 (Taipei Standard Time)`.
Its native UI is `file:///mtd_apdat/ui/zeasn.static.page/index.html`.
The reference TPM186E installer and its model guard are unchanged.

`runtime.js` and `bridge.js` adapt the existing Home UI to this firmware's own
Home-page methods and `RpcSystemIhsGet` / `RpcSystemAllAppGet`. App shortcuts use
its native `startApps` method, retaining the TV's network and parental checks.
Settings and input changes also use native Home methods. The iframe and its
background work are destroyed when leaving Home. Captions remove the bootstrap
suffix before displaying input names.

The tested TV stores its original Home configuration under
`rzero.native-home.backup.v1`, the self-contained UI under
`rzero.native-home.html.v1`, and the runtime under
`rzero.native-home.runtime.v1`. The `rz` key contains the same runtime. A source
alias suffix, `" onfocus=eval(LS.rz) x="`, activates that saved runtime when a
native HDMI source tile receives focus. Installation must save and verify the
original configuration both on the TV and privately on the admin computer
**before** changing aliases. Append the suffix only to the three HDMI entries
(real IDs 5, 6, 7), preserving their other fields. Verify readback and restore the
original source list if it differs. Firmware files and application registrations
are not modified.

These are adapter assets, not an unattended installer. They require a verified
native UI session, a matching original backup, and the existing Home HTML/CSS/JS
with `bridge.js` substituted. The firmware-specific inspection helper and private
TV dumps are deliberately excluded. Do not run the reference installer against
this model or remove its guard to load these assets. Runtime enablement requires
`rzero.native-home.enabled.v1` to equal `1`; the runtime also checks its native
path and the saved UI build before changing the running UI.

## Operation and verification

After a full menu restart, press **Source**, then **Down** once while an HDMI
input is active. The saved hook starts Home. Thereafter **Home** opens and
closes the custom launcher. **Red** temporarily opens stock Home; native settings,
volume and input controls remain available. This does not establish automatic
startup at cold boot, and activation from a non-HDMI source is unverified.

Physical verification covered source-hook readback, activation through remote
navigation, favourites, native Settings, Home dismissal/reopening, and recovery
after reloading the complete native UI with the laptop HTTP helper stopped.
YouTube's native launch was requested and its loader appeared; successful video
playback was not established. A mains power-cycle test was not performed.

## Recovery contract

Disable the enable flag, call `RzeroNativeHome.uninstall()` if a runtime is
active, then use `RpcSystemIhsSet({params:{source:backup.menu.source}})` to restore
the exact saved source list. Read it back through
`RpcSystemIhsGet({params:{key:'source'}})` and require an exact match before
reporting restoration. Remove `rz` only after restoring the source aliases.
Keep the original backup. The runtime's `uninstall()` only removes the running
UI; it does not restore durable aliases or delete user favourites.

A normal-TV firmware update may invalidate the adapter's UI-build check. Keep a
private recovery copy of the original source list. No custom firmware image is
provided or required.
