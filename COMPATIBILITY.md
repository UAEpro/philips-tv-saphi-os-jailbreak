# Other Philips renderer endpoints

Some Philips TVs advertise a renderer description at `description.xml` on a
different port instead of the reference TV's `dmr.xml` on port 2870. Use the
TV's current SSDP LOCATION to supply the endpoint explicitly:

```sh
python3 tv_control.py --host TV_ADDRESS --port ADVERTISED_PORT --description description.xml status
```

The Python API accepts the same optional path: `TV(host, port, description)`.
The existing defaults and same-host SOAP control-URL check remain in place.
Discovery ports may change after restarting the TV.

## TPN226E observations

A 55PUS7657/12 running TPN226E_V226.003.087.001 exposes a different native UI
from the reference TPM186E platform. Its UI is
`file:///mtd_apdat/ui/zeasn.static.page/index.html`, and its Home page uses
`RpcSystemIhsGet`, `RpcSystemAllAppGet` and scheduler-managed pages instead of
`TV_JSP` and `IHSMenuItems`.

A DLNA-title script probe executed in that native UI. Correct MP3 metadata,
HTTP/1.1 HEAD/GET and byte-range responses were needed for playback. The native
adapter rendered on the physical screen, enumerated native apps,
and accepted remote navigation. A saved source-tile focus hook recovered it
after a complete native UI reload with the laptop helper stopped. See
[native-nvt/README.md](native-nvt/README.md) for the activation requirement and
recovery contract. Automatic cold-boot startup is not established.

The reference installer's model guard must remain intact. No firmware image
was installed. The adapter assets are included separately; private inspection
helpers and
firmware extracts are excluded. They do not change the reference installer or
claim unattended installation on other models.
