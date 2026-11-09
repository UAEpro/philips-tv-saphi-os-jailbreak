#!/usr/bin/env python3
"""Install (or restore) the reversible custom Home on the 55OLED754/12 (TPM196E).

Reuses the project's home UI and JS, adapted for this firmware via native-home/
compat.js (flat bridge) and the content-browser install path. The reversible hook
lives in localStorage['IHSMenuItems']; the original is backed up to this PC first
and the install refuses if that backup does not arrive. Verification uses a real
JointSpace Home press to load the dashboard so the boot hook fires.

Commands:
  install  - back up, patch the launcher hook, store the runtime, then verify
  restore  - remove the hook and restore the stock launcher
  rehearse - like install but immediately restores (a safe dry run)

Safety: valid MP3 served for the injection vector (renderer can't hang); DMR
SetAVTransportURI retries on 705; JointSpace Home recovers a wedged renderer.
Nothing is written to firmware or app state — only this browser localStorage.
"""
import argparse
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.sax.saxutils import escape

from native_home import home_html, ROOT
from tv_control import TV

PIXEL = bytes.fromhex('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b')
MP3 = (ROOT / 'native-home/silence.mp3').read_bytes()
CONTENT_BROWSER = '/3rd/html5/php/ContentBrowser/content_browser.html'


def jointspace_key(tv_ip, key):
    req = urllib.request.Request('http://{}:1925/6/input/key'.format(tv_ip),
                                 data=json.dumps({'key': key}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req, timeout=5).close()


def run(args):
    tv = TV(args.tv)
    if tv.name not in ('65PUT6703/56', '55OLED754/12'):
        raise RuntimeError('Unexpected TV model: ' + str(tv.name))
    base_host = 'http://{}:{}'.format(args.host, args.port)
    nonce = format(int(time.time()) & 0xffffff, '06x')
    base = base_host + '/' + nonce

    compat = (ROOT / 'native-home/compat.js').read_text(encoding='utf-8')
    install_js = (ROOT / 'native-home/install.js').read_text(encoding='utf-8')
    restore_js = (ROOT / 'native-home/restore.js').read_text(encoding='utf-8')
    if getattr(args, 'mode', 'full') == 'adhide':
        # Minimal, non-intrusive runtime: just hide the home promotion.
        adhide_js = (ROOT / 'native-home/adhide.js').read_text(encoding='utf-8')
        runtime = ('window.__nativeHomeConfig=' + json.dumps({'base': base}) + ';\n'
                   + compat + '\n' + adhide_js)
    else:
        session_js = (ROOT / 'native-home/session.js').read_text(encoding='utf-8')
        html = home_html()
        runtime = ('window.__nativeHomeConfig=' + json.dumps({'base': base, 'html': html}) + ';\n'
                   + compat + '\n' + session_js)

    reports = deque()
    events = {}
    backups = deque()
    installed = threading.Event()
    ready = threading.Event()
    restored = threading.Event()
    queue = deque()

    def boot_js(target):
        report = ("function R(o){var i=new Image();window.__b=window.__b||[];window.__b.push(i);"
                  "i.src=" + json.dumps(base + '/event?data=') + "+encodeURIComponent(JSON.stringify(o));}")
        return ('(function(){' + report + compat
                + 'R({event:"bootstrap",path:location.pathname,bridge:typeof getTvJspService});'
                'if(typeof $!=="undefined"&&$.getScript){$.getScript(' + json.dumps(base + target) + ');}'
                'else{R({event:"bootstrap-nojquery",path:location.pathname});}}());').encode()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def _send(self, body, mime='application/json', status=200, extra=None):
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            # The install runs on the TV's file:// origin and POSTs the backup
            # here cross-origin; without this header Chrome 55 blocks reading the
            # response and the install aborts even though the backup arrived.
            self.send_header('Access-Control-Allow-Origin', '*')
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def do_POST(self):
            p = urllib.parse.urlsplit(self.path)
            if p.path == '/' + nonce + '/backup':
                length = int(self.headers.get('Content-Length', 0))
                data = self.rfile.read(length)
                backups.append(data)
                (ROOT / 'build').mkdir(exist_ok=True)
                (ROOT / 'build' / 'oled-ihs-backup.json').write_bytes(data)
                print('  <- backup received ({} bytes) -> build/oled-ihs-backup.json'.format(len(data)), flush=True)
                self._send(b'{"ok":true}')
                return
            self.send_error(404)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            p = urllib.parse.urlsplit(self.path)
            prefix = '/' + nonce
            if not p.path.startswith(prefix + '/'):
                self.send_error(404)
                return
            path = p.path[len(prefix):]
            if path == '/silence':
                start, end, status = 0, len(MP3) - 1, 200
                extra = {'Accept-Ranges': 'bytes',
                         'contentFeatures.dlna.org': 'DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_CI=0',
                         'transferMode.dlna.org': 'Streaming'}
                rng = self.headers.get('Range', '')
                if rng.startswith('bytes='):
                    lo, hi = rng[6:].split('-', 1)
                    start = int(lo or 0)
                    end = int(hi) if hi else len(MP3) - 1
                    status = 206
                    extra['Content-Range'] = 'bytes {}-{}/{}'.format(start, end, len(MP3))
                self._send(MP3[start:end + 1], 'audio/mpeg', status, extra)
                return
            if path == '/boot-install.js':
                self._send(boot_js('/install.js'), 'application/javascript')
                return
            if path == '/boot-restore.js':
                self._send(boot_js('/restore.js'), 'application/javascript')
                return
            if path == '/install.js':
                data = ('window.__nativeHomeInstall=' + json.dumps({'base': base, 'runtime': runtime}) + ';\n'
                        + install_js)
                self._send(data.encode(), 'application/javascript')
                return
            if path == '/restore.js':
                data = 'window.__nativeHomeRestoreBase=' + json.dumps(base) + ';\n' + restore_js
                self._send(data.encode(), 'application/javascript')
                return
            if path == '/home.js':
                self._send(runtime.encode(), 'application/javascript')
                return
            if path == '/control.js':
                cmd = queue.popleft() if queue else None
                self._send(('window.NativeHome&&window.NativeHome.command(' + json.dumps(cmd) + ');').encode(),
                           'application/javascript')
                return
            if path == '/event':
                try:
                    value = urllib.parse.parse_qs(p.query).get('data', [''])[0]
                    event = json.loads(value)
                    reports.append(event)
                    events[event.get('event')] = event
                    print('  <- [{}] {}'.format(event.get('event'), json.dumps(event)[:220]), flush=True)
                    if event.get('event') == 'installed':
                        installed.set()
                    if event.get('event') == 'ready':
                        ready.set()
                    if event.get('event') == 'stock-restored':
                        restored.set()
                except Exception:
                    pass
                self._send(PIXEL, 'image/gif')
                return
            self.send_error(404)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print('Helper serving {} ; TV {}'.format(base, tv.name))

    def set_uri_retry(uri, meta, attempts=10):
        for _ in range(attempts):
            try:
                tv.call('AVTransport', 'SetAVTransportURI', InstanceID=0, CurrentURI=uri, CurrentURIMetaData=meta)
                return True
            except Exception as e:
                if '705' in str(e):
                    time.sleep(2.5)
                    continue
                raise
        return False

    def inject(target):
        title = '<img src=x onerror="this.onerror=null;$.getScript(\'' + base + target + '\')">'
        if len(title) > 127:
            raise RuntimeError('Bootstrap title too long')
        uri = base + '/silence?t=' + format(int(time.time()), 'x')
        meta = ('<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" '
                'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">'
                '<item id="h" parentID="0" restricted="1"><dc:title>' + escape(title) + '</dc:title>'
                '<upnp:class>object.item.audioItem.musicTrack</upnp:class>'
                '<res protocolInfo="http-get:*:audio/mpeg:DLNA.ORG_PN=MP3">' + uri + '</res></item></DIDL-Lite>')
        try:
            tv.call('AVTransport', 'Stop', InstanceID=0)
        except Exception:
            pass
        time.sleep(2)
        if not set_uri_retry(uri, meta):
            raise RuntimeError('Transport stayed locked (705). Power-cycle the TV and retry.')
        tv.call('AVTransport', 'Play', InstanceID=0, Speed='1')

    def cleanup_audio():
        time.sleep(1)
        for _ in range(3):
            try:
                tv.call('AVTransport', 'Stop', InstanceID=0)
                return
            except Exception as e:
                if '705' in str(e):
                    time.sleep(2)
                    continue
                return

    def recover():
        try:
            jointspace_key(args.tv, 'Home')
            print('  (JointSpace Home sent)')
        except Exception as e:
            print('  JointSpace Home failed: ' + str(e)[:60])

    try:
        if args.command in ('install', 'rehearse'):
            print('Step 1: inject + install hook (from content browser)...')
            inject('/boot-install.js')
            if not installed.wait(args.wait):
                print('\nInstall not confirmed. Beacons above show how far it got.')
                err = events.get('install-error')
                if err:
                    print('install-error: ' + err.get('message', ''))
                cleanup_audio()
                recover()
                return
            print('\nInstall confirmed. Backup saved to build/oled-ihs-backup.json')
            cleanup_audio()
            print('Step 2: load the dashboard (JointSpace Home) so the boot hook renders...')
            time.sleep(1)
            recover()
            if ready.wait(args.wait):
                print('\nSUCCESS: custom Home rendered on the dashboard (ready beacon received).')
            else:
                print('\nHook installed but no "ready" beacon yet. The home may still render on screen;')
                print('check the TV. Diagnostic beacons are above.')
            if args.command == 'rehearse':
                print('\nRehearse mode: restoring stock now...')
                inject('/boot-restore.js')
                restored.wait(args.wait)
                cleanup_audio()
                recover()
                print('Restored.' if restored.is_set() else 'Restore not confirmed; run: python oled_home.py restore ...')
            else:
                print('\nThe custom Home is now stored (reversible). Final confirmation needs a COLD BOOT.')
                if args.hold > 0:
                    ready.clear()
                    print('\n>>> POWER-CYCLE THE TV NOW (pull power or hold the power button). <<<')
                    print('    Keeping the helper up for {}s to catch the boot...'.format(int(args.hold)))
                    if ready.wait(args.hold):
                        print('\nSUCCESS: the custom Home rendered on cold boot (ready beacon received)!')
                    else:
                        print('\nNo ready beacon within the hold window. Check the TV screen:')
                        print('  - custom Home visible  -> it works (the beacon may just be blocked)')
                        print('  - stock Home / broken  -> run: python oled_home.py restore --tv {} --host {}'.format(args.tv, args.host))
                print('\nThe custom Home is PERMANENT and reversible.')
                print('To revert:  python oled_home.py restore --tv {} --host {}'.format(args.tv, args.host))
        elif args.command == 'restore':
            print('Injecting restore...')
            inject('/boot-restore.js')
            if restored.wait(args.wait):
                print('\nStock launcher restored.')
            else:
                print('\nRestore not confirmed. If the backup localStorage was lost, the PC backup is at')
                print('build/oled-ihs-backup.json (push-from-PC restore not yet implemented).')
            cleanup_audio()
            recover()
    finally:
        time.sleep(1)
        server.shutdown()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('install', 'restore', 'rehearse'))
    parser.add_argument('--tv', required=True)
    parser.add_argument('--host', required=True)
    parser.add_argument('--port', type=int, default=8772)
    parser.add_argument('--wait', type=float, default=20.0)
    parser.add_argument('--hold', type=float, default=0.0,
                        help='After install, keep the helper up this many seconds to catch a cold boot')
    parser.add_argument('--mode', choices=('full', 'adhide'), default='full',
                        help='full = custom Home UI; adhide = only hide the home promotion (stock home kept)')
    run(parser.parse_args())


if __name__ == '__main__':
    main()
