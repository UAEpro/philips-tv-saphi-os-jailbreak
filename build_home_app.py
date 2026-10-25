#!/usr/bin/env python3
"""Build the small Home app as a single native HTML candidate and a safe preview.

No TV connection, installation, uninstallation, or boot-setting changes.
"""
import argparse
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "home-app"
OUTPUT = BASE / "build"
EXPECTED = "c521dd64ac1a3b7f9febf4a732ac00d19ad2f9f70814bb4b08d8ab422e580890"
LIBRARIES = ["jquery.min.js", "../../libs/mtvui/keycodes.js", "../../libs/mtvui/base.js", "../../libs/mtvui/input_source.js"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock', type=Path, help='Optional independently obtained reference dashboard HTML to hash-check')
    args = parser.parse_args()
    template = (SOURCE / "index.html").read_text()
    config_name = 'config.local.js' if (SOURCE / 'config.local.js').exists() else 'config.js'
    for marker, name in (("/* APP_CONFIG */", config_name), ("/* APP_CSS */", "app.css"), ("/* APP_BRIDGE */", "bridge.js"), ("/* APP_JS */", "app.js")):
        text = (SOURCE / name).read_text()
        if "</script" in text.lower() or template.count(marker) != 1:
            raise ValueError("Unexpected template or closing script tag")
        template = template.replace(marker, text)
    stock = args.stock.read_bytes() if args.stock else None
    if stock is not None and hashlib.sha256(stock).hexdigest() != EXPECTED:
        raise ValueError("Stock Home differs from the inspected firmware")
    native = OUTPUT / "compact-home"
    preview = OUTPUT / "preview"
    native.mkdir(parents=True, exist_ok=True)
    preview.mkdir(parents=True, exist_ok=True)
    library_tags = "\n".join('<script src="' + path + '"></script>' for path in LIBRARIES)
    content = template.replace("<!-- NATIVE_LIBRARIES -->", library_tags)
    (native / "index.html").write_text(content)
    if stock is not None:
        (native / "original-index.html").write_bytes(stock)
    (preview / "preview.html").write_text(template.replace("<!-- NATIVE_LIBRARIES -->", "<!-- Preview: native libraries are intentionally omitted. -->"))
    manifest = {
        "model": "65PUT6703/56", "firmware": "TPM186E_018.005.036.001",
        "status": "generated_file_only_not_written_to_tv",
        "runtime_installer": "native_home.py uses browser storage; it does not install this file",
        "apps_uninstalled": [], "target": "/3rd/html5/php/dash/index.html",
        "bytes": len(content.encode()), "sha256": hashlib.sha256(content.encode()).hexdigest(),
        "original_sha256": EXPECTED if stock is not None else None, "existing_firmware_dependencies": LIBRARIES,
    }
    (native / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
