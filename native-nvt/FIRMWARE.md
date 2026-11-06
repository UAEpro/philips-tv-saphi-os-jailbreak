# TPN226E native-executable investigation

Static inspection on 2026-11-06 found an executable app manager and native
graphics stack in an official TPN226E firmware package. It did **not** establish
an installation or execution route for a new compiled app on the tested TV.
The existing Home adapter continues to render HTML/CSS/JavaScript.

## Package identity and limits

- Tested television: Philips 55PUS7657/12, installed version
  `TPN226E_V226.003.087.001`.
- Inspected package: [official 76x7-family download](https://firmware.nettvservices.com/files/4/43pus7607_12/43pus7607_12_fus_aen.zip),
  linked through the [Philips model support page](https://www.philips.co.uk/c-p/55PUS7657_12/led-4k-uhd-led-smart-tv/support).
- ZIP size: 500,975,355 bytes; SHA-256:
  `bcb80010c97e9483b936f69639baf5c7b18a9eb4b30e1697be86dc3d61d4283d`.
- Internal metadata identifies `TPN226E_V226`, chip 690 and
  `PH_2K22_ALL_EU_NT72690`. Its application build date is
  **2022-11-24**, so this is an older baseline, not a dump of the installed 2026
  firmware. Do not assume that its hooks, ABIs or addresses apply to that build.

The ZIP contains a `TIMGPKGVER40` update container. Offline extraction produced
18 partition payloads. The `fs`, `ap` and `apext` payloads contain SquashFS
filesystems after 4096-byte NFSB headers. No vendor executable was run, and no
image was flashed. Downloaded images, extraction logs and tools remain private
and are excluded from this repository.

## Native graphics and app registration

`/mtd_apexe/board/com.nvt.wayland/` includes Weston 9, its DRM backend,
Wayland client libraries and native sample clients. Its client environment
selects Wayland and the vendor EGL/GLES libraries. This is evidence that a
compiled graphical client is technically plausible on this firmware family;
it is not a successful custom-client test.

`/mtd_apexe/board/run.sh` starts `com.nvt.appmgr` with
`--applist=/mtd_apexe/board/data/nvt.app.ini`. That file registers executable
paths, arguments, initial/background/foreground states and capabilities.
It includes the stock UI, browser and compositor. Native demo entries exist
but are disabled in the app list.

The inspected app manager, RPC plugin and compositor are **32-bit ARM EABI5
hard-float** executables/libraries; the kernel image is ARM64. A future client
must match the actual running userspace ABI, rather than infer it from the
processor or browser user-agent.

## Process-switch RPC trace

The old image's process-switch path is:

```text
CSystemImpl::switchOnProcess (libsetupplugin.so)
  -> SocMwSystemMgr::switchOnProcess (libsocmw.so)
  -> NUI_SETTING_AM_SwitchOnProcess (libnui.so)
  -> APP_MGR_AM_SwitchOnProcess (libapp.so)
  -> LIBNAM_APP_SendCommand
  -> AM_Class::COM_SwitchOnProcess (libappmgr.so)
  -> MGR_LookupApplication
  -> APP_SwitchApp / registered shortcut handling
```

`MGR_LookupApplication` compares the requested name with registered names using
`strcmp`. `COM_SwitchOnProcess` returns an error if no application is found.
Consequently, this path switches a registered app; finding its RPC name does
not establish arbitrary executable launch or app installation.

Useful symbol offsets for reproducing this static trace, specific to the
download hash above (Thumb indicator bit removed):

| Component | Function | ELF virtual address |
| --- | --- | --- |
| `libsetupplugin.so` | `CSystemImpl::switchOnProcess` | `0x665b0` |
| `libsocmw.so` | `SocMwSystemMgr::switchOnProcess` | `0x1abbd0` |
| `libnui.so` | `NUI_SETTING_AM_SwitchOnProcess` | `0x185cb8` |
| `libapp.so` | `APP_MGR_AM_SwitchOnProcess` | `0x279d24` |
| `libappmgr.so` | `AM_Class::COM_SwitchOnProcess` | `0x379f4` |
| `libappmgr.so` | `AM_Class::MGR_LookupApplication` | `0x3046c` |

## What remains before a compiled launcher

The current TV's exact binaries and startup configuration need to be compared
with this baseline. A reversible way to place and execute a client, and then
register it with the app manager, has not been established. Development startup
code in the old package is a research lead; its presence is not proof that a
retail TV accepts custom images or USB executables.

Once execution is available, the first test should be a temporary native client
on the existing compositor with an explicit exit path. Home-button integration,
IR input and stock-app launch need separate verification. No debug mode,
factory option, app registration or firmware partition was changed during this
inspection.
