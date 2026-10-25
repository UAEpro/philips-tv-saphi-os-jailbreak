#!/usr/bin/env python3
"""Control the TV through services advertised by its own UPnP description."""
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape


class TV:
    def __init__(self, host, port=2870):
        self.base = f"http://{host}:{port}/"
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        root = ET.fromstring(self.http.open(self.base + "dmr.xml", timeout=5).read())
        ns = {"d": "urn:schemas-upnp-org:device-1-0"}
        self.name = root.findtext(".//d:friendlyName", namespaces=ns)
        self.services = {}
        for service in root.findall(".//d:service", ns):
            kind = service.findtext("d:serviceType", namespaces=ns)
            endpoint = urllib.parse.urljoin(
                self.base, service.findtext("d:controlURL", namespaces=ns)
            )
            if urllib.parse.urlsplit(endpoint).netloc != urllib.parse.urlsplit(self.base).netloc:
                raise RuntimeError("TV advertised a control URL on another host")
            self.services[kind.split(":")[-2]] = (kind, endpoint)

    def call(self, service, action, **args):
        kind, endpoint = self.services[service]
        # This firmware closes the socket for ElementTree's valid ns0/ns1
        # serialization. Use the envelope format accepted by its SOAP parser.
        arguments = "".join(f"<{key}>{escape(str(value))}</{key}>"
                            for key, value in args.items())
        envelope = (
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
            's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
            f'<s:Body><u:{action} xmlns:u="{kind}">{arguments}'
            f'</u:{action}></s:Body></s:Envelope>'
        )
        request = urllib.request.Request(
            endpoint,
            data=envelope.encode("utf-8"),
            headers={"Content-Type": 'text/xml; charset="utf-8"',
                     "SOAPAction": f'"{kind}#{action}"'},
        )
        try:
            response = self.http.open(request, timeout=5).read()
        except urllib.error.HTTPError as error:
            raise RuntimeError(error.read().decode(errors="replace")) from error
        root = ET.fromstring(response)
        return {item.tag.split("}")[-1]: item.text for item in root.iter() if len(item) == 0}

    def volume(self):
        return int(self.call("RenderingControl", "GetVolume", InstanceID=0,
                             Channel="Master")["CurrentVolume"])

    def set_volume(self, value):
        if not 0 <= value <= 100:
            raise ValueError("Volume must be between 0 and 100")
        self.call("RenderingControl", "SetVolume", InstanceID=0,
                  Channel="Master", DesiredVolume=value)

    def status(self):
        return {"name": self.name, "volume": self.volume(),
                "mute": self.call("RenderingControl", "GetMute", InstanceID=0,
                                  Channel="Master")["CurrentMute"],
                "transport": self.call("AVTransport", "GetTransportInfo", InstanceID=0)}

    def app(self, name, method="GET"):
        if name not in ("YouTube", "Netflix"):
            raise ValueError("Only the identified YouTube and Netflix DIAL apps are supported")
        host = urllib.parse.urlsplit(self.base).hostname
        url = f"http://{host}:56789/apps/{name}"
        if method == "DELETE":
            url += "/run"
        req = urllib.request.Request(url, method=method,
                                     data=b"" if method == "POST" else None,
                                     headers={"Origin": "http://www.youtube.com"})
        with self.http.open(req, timeout=10) as response:
            content = response.read()
            if method != "GET":
                return {"http_status": response.status}
        root = ET.fromstring(content)
        # Return state only. The additionalData block can contain session tokens.
        return {"name": name, "state": root.findtext(
            "{urn:dial-multiscreen-org:schemas:dial}state")}

    def control_test(self):
        original = self.volume()
        if original == 0:
            raise RuntimeError("Volume is zero; cannot demonstrate a decrease. No change made.")
        target = original - 1
        result = {"original": original, "requested": target}
        try:
            self.set_volume(target)
            time.sleep(0.5)
            result["observed_after_change"] = self.volume()
            if result["observed_after_change"] != target:
                raise RuntimeError("TV did not report the requested volume")
        finally:
            self.set_volume(original)
            time.sleep(0.5)
            restored = self.volume()
            if restored != original:
                raise RuntimeError(f"Volume restoration failed: expected {original}, got {restored}")
        result["restored"] = restored
        result["verified"] = True
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="TV LAN address")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    sub.add_parser("control-test", help="Decrease volume one step, verify, then restore")
    volume = sub.add_parser("volume")
    volume.add_argument("value", type=int)
    app = sub.add_parser("app")
    app.add_argument("name", choices=("YouTube", "Netflix"))
    app.add_argument("action", choices=("status", "launch", "stop"))
    args = parser.parse_args()
    tv = TV(args.host)
    if args.command == "status":
        result = tv.status()
    elif args.command == "control-test":
        result = tv.control_test()
    elif args.command == "app":
        result = tv.app(args.name, {"status": "GET", "launch": "POST", "stop": "DELETE"}[args.action])
    else:
        tv.set_volume(args.value)
        result = {"volume": tv.volume()}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
