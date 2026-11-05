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
HTTP/1.1 HEAD/GET and byte-range responses were needed for playback. A temporary
adaptation of the Home UI rendered on the physical screen, enumerated native
apps, and accepted remote navigation. This is evidence for a possible port;
it does not establish a persistent default launcher on TPN226E.

The reference installer's model guard must remain intact. No firmware image
was installed. The experimental native-UI adapter and persistence probes are
not included in this compatibility fix, because activation after restart and
recovery still require hardware validation.
