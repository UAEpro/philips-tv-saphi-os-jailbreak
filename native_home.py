#!/usr/bin/env python3
"""Install a reversible Home in the owner's SAPHI dashboard browser storage.

No firmware, boot settings, or TV system files are changed. The LAN helper
serves a fixed UI and a small allowlist of control commands to the selected TV.
"""
import argparse
import base64
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

from tv_control import TV

ROOT = Path(__file__).resolve().parent
STATE = ROOT / 'build/native-home-session.json'
KEYS = {'up':38, 'down':40, 'left':37, 'right':39, 'ok':13, 'back':461}
PIXEL = base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')


def home_html():
    template = (ROOT / 'home-app/index.html').read_text()
    template = template.replace('<!-- NATIVE_LIBRARIES -->', '')
    config_name = 'config.local.js' if (ROOT / 'home-app/config.local.js').exists() else 'config.js'
    for marker, name in [('/* APP_CONFIG */', config_name), ('/* APP_CSS */', 'app.css'), ('/* APP_BRIDGE */', 'bridge.js'), ('/* APP_JS */', 'app.js')]:
        template = template.replace(marker, (ROOT / 'home-app' / name).read_text())
    return template


def control(args):
    state = json.loads(STATE.read_text())
    data = {'action': args.action}
    if args.action == 'key':
        data['code'] = KEYS[args.key]
    url = state['base'] + ('/status' if args.action == 'status' else '/command')
    request = urllib.request.Request(url, data=None if args.action == 'status' else json.dumps(data).encode(),
                                     headers={'Authorization':'Bearer ' + state['control_token'], 'Content-Type':'application/json'})
    http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with http.open(request, timeout=5) as response:
        print(response.read().decode())


def launch(args):
    recover_only = args.action == 'recover'
    # A second launch reuses a healthy helper. Never spawn competing sessions.
    if STATE.exists():
        try:
            old = json.loads(STATE.read_text())
            http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            headers = {'Authorization':'Bearer '+old['control_token'],'Content-Type':'application/json'}
            request = urllib.request.Request(old['base']+'/status',headers=headers)
            with http.open(request,timeout=2) as response:existing=json.load(response)
            action = 'show' if existing.get('connected') and not recover_only else 'stop'
            request = urllib.request.Request(old['base']+'/command',headers=headers,data=json.dumps({'action':action}).encode())
            http.open(request,timeout=2).close()
            if action == 'show':
                print('Existing native Home shown.');return
            for _ in range(35):
                time.sleep(1)
                try:http.open(urllib.request.Request(old['base']+'/status',headers=headers),timeout=1).close()
                except OSError:break
        except (OSError, ValueError, KeyError):pass
    if getattr(args, 'background', False):
        output = ROOT / 'build/native-home-helper.log'
        output.parent.mkdir(parents=True,exist_ok=True)
        with output.open('ab') as handle:
            process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'launch', '--tv', args.tv,
                                        '--host', args.host, '--port', str(args.port)],
                                       stdin=subprocess.DEVNULL,stdout=handle,stderr=subprocess.STDOUT,start_new_session=True)
        print('Helper started with PID '+str(process.pid)+'. Log: '+str(output));return
    tv = TV(args.tv)
    if tv.name != '65PUT6703/56':
        raise RuntimeError('Unexpected TV model: ' + str(tv.name))
    original = {'media':tv.call('AVTransport', 'GetMediaInfo', InstanceID=0),
                'transport':tv.call('AVTransport', 'GetTransportInfo', InstanceID=0)}
    nonce = secrets.token_hex(4)
    base = f'http://{args.host}:{args.port}/{nonce}'
    state = {'base':base, 'tv':args.tv, 'name':tv.name, 'control_token':secrets.token_hex(24),
             'started':datetime.now(timezone.utc).isoformat(), 'storage':'native browser localStorage', 'cold_boot_verified':False}
    directory = ROOT / 'build/native-home'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f'{nonce}-original.json').write_text(json.dumps(original, indent=2))
    log = directory / f'{nonce}-events.jsonl'
    ready = threading.Event()
    restored = threading.Event()
    stopping = threading.Event()
    last_poll = [0.0]
    queue = deque()
    events = deque(maxlen=60)
    mp3 = (ROOT / 'native-home/silence.mp3').read_bytes()
    report = 'function report(d){var i=new Image();window.__nhReport=i;i.src=' + json.dumps(base+'/event?data=') + '+encodeURIComponent(JSON.stringify(d));}'
    def bootstrap(target):
        other = "$.getScript(" + json.dumps(base+target) + ")"
        return ('(function(){' + report + 'report({event:"bootstrap",path:location.pathname,width:innerWidth,bridge:typeof TV_JSP});'
            'if(location.pathname==="/3rd/html5/php/dash/index.html"){' + other + ';}'
            'else{getTvJspService().utility.notifyOpenUrl(JSON.stringify({URL:"file:///3rd/html5/php/dash/index.html",RESOLUTION:"1080P"}));setTimeout(function(){mtvuiUtil.sendPlatformMsg(' + json.dumps({'type':1,'value':{'msgType':'execute','value':other}}) + ');},1200);}}());').encode()

    def runtime():
        return 'window.__nativeHomeConfig=' + json.dumps({'base':base,'html':home_html()}) + ';\n' + (ROOT / 'native-home/session.js').read_text()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, data, mime='application/json', status=200, headers=None, head=False):
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            for key, value in (headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if not head:
                try:self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):pass

        def authenticated(self):
            return self.client_address[0] in (args.host, '127.0.0.1') and secrets.compare_digest(
                self.headers.get('Authorization',''), 'Bearer '+state['control_token'])

        def do_POST(self):
            if self.path == '/' + nonce + '/backup' and self.client_address[0] == args.tv:
                try:
                    size = int(self.headers.get('Content-Length','0'))
                    if not 0 < size < 1048576:raise ValueError()
                    data = self.rfile.read(size)
                    if not isinstance(json.loads(data).get('item'),list):raise ValueError()
                    destination = directory / (nonce+'-stock-menu.json')
                    if not destination.exists():
                        destination.write_bytes(data);destination.chmod(0o600)
                    self.send(b'{}',headers={'Access-Control-Allow-Origin':'*'})
                except (ValueError,TypeError):self.send_error(400)
                return
            if self.path != '/' + nonce + '/command' or not self.authenticated():
                self.send_error(403); return
            try:
                size = int(self.headers.get('Content-Length','0'))
                if not 0 < size < 1024:raise ValueError()
                command = json.loads(self.rfile.read(size))
                if command.get('action') not in ('show','inspect','key','restore','reload','remote-home','stop'):raise ValueError()
                if command['action'] == 'key' and command.get('code') not in KEYS.values():raise ValueError()
                command['id'] = secrets.token_hex(4)
                if command['action'] == 'stop':stopping.set()
                else:queue.append(command)
                self.send(json.dumps({'queued':command}).encode())
            except (ValueError, TypeError):self.send_error(400)

        def do_HEAD(self):
            self.serve(True)

        def do_GET(self):
            self.serve(False)

        def serve(self, head):
            parsed = urllib.parse.urlsplit(self.path)
            prefix = '/' + nonce
            if not parsed.path.startswith(prefix+'/') or self.client_address[0] not in (args.tv,args.host,'127.0.0.1'):
                self.send_error(404);return
            path = parsed.path[len(prefix):]
            if path == '/status':
                if not self.authenticated():self.send_error(403);return
                self.send(json.dumps({'tv':tv.name, 'ready':ready.is_set(),
                                      'connected':ready.is_set() and time.monotonic()-last_poll[0]<10,
                                      'events':list(events)},indent=2).encode());return
            if self.client_address[0] != args.tv:
                self.send_error(403);return
            if path == '/boot.js':self.send(bootstrap('/install.js'),'application/javascript');return
            if path == '/restore-boot.js':self.send(bootstrap('/restore.js'),'application/javascript');return
            if path == '/install.js':
                data = 'window.__nativeHomeInstall=' + json.dumps({'base':base,'runtime':runtime()}) + ';\n' + (ROOT / 'native-home/install.js').read_text()
                self.send(data.encode(),'application/javascript');return
            if path == '/restore.js':
                data = 'window.__nativeHomeRestoreBase='+json.dumps(base)+';\n'+(ROOT/'native-home/restore.js').read_text()
                self.send(data.encode(),'application/javascript');return
            if path == '/home.js':
                self.send(runtime().encode(),'application/javascript');return
            if path == '/control.js':
                last_poll[0] = time.monotonic()
                command = queue.popleft() if queue else None
                if command and command['action'] == 'reload':
                    self.send(('$.getScript('+json.dumps(base+'/install.js')+');').encode(),'application/javascript');return
                self.send(('window.NativeHome&&window.NativeHome.command('+json.dumps(command)+');').encode(),'application/javascript');return
            if path == '/event':
                try:
                    value = urllib.parse.parse_qs(parsed.query).get('data',[''])[0]
                    if len(value)>16000:raise ValueError()
                    event = json.loads(value)
                    event['at'] = datetime.now(timezone.utc).isoformat()
                    events.append(event)
                    with log.open('a') as output:output.write(json.dumps(event)+'\n')
                    print(json.dumps(event),flush=True)
                    if event.get('event') == 'ready' and event.get('native') is True:ready.set()
                    if event.get('event') == 'stock-restored':restored.set()
                except (ValueError,TypeError):self.send_error(400);return
                self.send(PIXEL,'image/gif');return
            if path == '/silence.mp3':
                data=mp3;status=200
                headers={'Accept-Ranges':'bytes','contentFeatures.dlna.org':'DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_CI=0','transferMode.dlna.org':'Streaming'}
                range_value=self.headers.get('Range','')
                if range_value.startswith('bytes='):
                    try:
                        lo,hi=range_value[6:].split('-',1);start=int(lo or '0');end=min(int(hi) if hi else len(mp3)-1,len(mp3)-1)
                        if not 0<=start<=end:raise ValueError()
                        data=mp3[start:end+1];status=206;headers['Content-Range']=f'bytes {start}-{end}/{len(mp3)}'
                    except ValueError:self.send_error(416);return
                self.send(data,'audio/mpeg',status,headers,head);return
            self.send_error(404)

    server = ThreadingHTTPServer((args.host,args.port),Handler)
    STATE.write_text(json.dumps(state, indent=2));STATE.chmod(0o600)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    def activate(script):
        title = '<img src=x onerror="this.onerror=null;$.getScript(\'' + base + script + '\')">'
        if len(title)>127:raise RuntimeError('Bootstrap title exceeds our conservative size limit')
        uri = base+'/silence.mp3?t='+secrets.token_hex(4)
        metadata = ('<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">'
                '<item id="compact-home" parentID="0" restricted="1"><dc:title>'+escape(title)+'</dc:title>'
                '<upnp:class>object.item.audioItem.musicTrack</upnp:class>'
                '<res protocolInfo="http-get:*:audio/mpeg:DLNA.ORG_PN=MP3">'+uri+'</res></item></DIDL-Lite>')
        tv.call('AVTransport','SetAVTransportURI',InstanceID=0,CurrentURI=uri,CurrentURIMetaData=metadata)
        tv.call('AVTransport','Play',InstanceID=0,Speed='1')
    print(('Restoring Philips Home on ' if recover_only else 'Loading Compact Home on ')+tv.name+'; helper '+base,flush=True)
    try:
        if recover_only:
            activate('/restore-boot.js')
            confirmed = restored.wait(25)
            tv.call('AVTransport','Stop',InstanceID=0)
            if not confirmed:
                raise RuntimeError('Restoration was not confirmed. Keep the TV on and retry recovery.')
            print('Philips Home restored; the saved custom launcher is disabled.',flush=True)
            return
        activate('/boot.js')
        confirmed = ready.wait(25)
        tv.call('AVTransport','Stop',InstanceID=0)
        time.sleep(1)
        if confirmed:
            queue.append({'id':'initial-show','action':'show'})
            print('Native Home ready. Launcher configuration and UI are saved on the TV; cold-boot behavior is not yet verified.',flush=True)
        else:
            print('Native Home has not confirmed readiness; diagnostics remain available.',flush=True)
        stopping.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if not recover_only:
            queue.append({'id':'shutdown','action':'restore'})
        if not recover_only and not restored.wait(2):
            try:
                activate('/restore-boot.js')
                if not restored.wait(20):print('Stock restoration was not confirmed; TV may be off.',flush=True)
                tv.call('AVTransport','Stop',InstanceID=0)
            except Exception as error:print('Restore requires the TV online: '+str(error),flush=True)
        time.sleep(1)
        server.shutdown();server.server_close()


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='action',required=True)
    for action in ('launch','recover'):
        start=sub.add_parser(action)
        start.add_argument('--tv',required=True,help='TV LAN address')
        start.add_argument('--host',required=True,help='Computer LAN address reachable by the TV')
        start.add_argument('--port',type=int,default=8768)
        if action == 'launch':start.add_argument('--background',action='store_true')
    for action in ('status','show','inspect','restore','reload','remote-home','stop'):sub.add_parser(action)
    key=sub.add_parser('key');key.add_argument('key',choices=KEYS)
    args=parser.parse_args()
    if args.action in ('launch','recover'):launch(args)
    else:control(args)
