const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const runtime = fs.readFileSync(path.join(__dirname, '../native-nvt/runtime.js'), 'utf8');
const build = 'Thu Apr 30 2026 14:12:33 GMT+0800 (Taipei Standard Time)';

function fixture({enabled = '1', savedBuild = build, nativePath = '/mtd_apdat/ui/zeasn.static.page/index.html'} = {}) {
  const values = new Map([
    ['rzero.native-home.enabled.v1', enabled],
    ['rzero.native-home.backup.v1', JSON.stringify({path: nativePath, version: savedBuild, menu: {source: []}})],
    ['rzero.native-home.html.v1', '<html></html>'],
  ]);
  const calls = {opened: [], destroyed: 0, removed: 0, launched: [], sources: [], settings: 0};
  const source = {realName: 'HDMI one\" onfocus=eval(LS.rz) x=\"'};
  const page = {
    ihsOrder: {source: [source]}, ihsMap: {source: new Map([['HDMI1', source]])},
    saveIhsData() {}, updateHdmiData() {},
    app: {infoMap: new Map([['4823', {id: '4823_1', jumpName: 'YouTube'}]])},
    startApps(app) {calls.launched.push(app);},
    openSettingPage() {calls.settings++;},
    toSwitchSource(id) {calls.sources.push(id);},
  };
  const originalOpen = function(p) {calls.opened.push(p); return page;};
  const scheduler = {open: originalOpen, back() {}, getWindow() {return {getPageByPath() {return page;}};}, isPage() {return true;}};
  const context = {
    location: {pathname: nativePath}, S: scheduler, Pages: {ihs: '/main/ihs', ctrl: '/volume/ctrl'},
    localStorage: {getItem(k) {return values.get(k) ?? null;}, setItem(k,v) {values.set(k,String(v));}, removeItem(k) {values.delete(k);}},
    document: {
      getElementById() {return {textContent: build};}, querySelectorAll() {return [];},
      createElement() {return {style: {}, contentWindow: {HomeApp: {destroy() {calls.destroyed++;}}}, remove() {calls.removed++;}};},
      body: {appendChild() {}},
    },
    RpcSystemAllAppGet: async () => ({appList: [{appId: '4823_1', appName: 'YouTube', appIconURI: '/icon.png'}]}),
    RpcSystemIhsGet: async () => ({source: [{realid: 5, showname: 'HDMI one" onfocus=eval(LS.rz) x="'}]}),
    uiShow() {}, setTimeout() {}, clearTimeout() {}, addEventListener() {}, removeEventListener() {},
    VK_HOME: 'VK_HOME', VK_RED: 403,
  };
  context.window = context;
  return {context, calls, page, scheduler, originalOpen, values};
}

async function start(f) {
  vm.runInNewContext(runtime, f.context);
  await new Promise(resolve => setImmediate(resolve));
  return f.context.RzeroNativeHome;
}

test('disabled or mismatched native contexts leave the running UI alone', async () => {
  const disabled = fixture({enabled: '0'});
  assert.equal(await start(disabled), undefined);
  assert.equal(disabled.scheduler.open, disabled.originalOpen);
  const stale = fixture({savedBuild: 'other firmware build'});
  assert.throws(() => vm.runInNewContext(runtime, stale.context), /Unverified/);
  assert.equal(stale.scheduler.open, stale.originalOpen);
  const wrong = fixture({nativePath: '/other/index.html'});
  assert.throws(() => vm.runInNewContext(runtime, wrong.context), /Unexpected/);
});

test('input labels hide the saved bootstrap and native source changes retain numeric IDs', async () => {
  const f = fixture(), api = await start(f);
  assert.equal(api.inputs()[1].name, 'HDMI one');
  assert.equal(f.page.ihsOrder.source[0].realName, 'HDMI one');
  assert.equal(f.page.ihsMap.source.get('HDMI1').realName, 'HDMI one');
  api.source('2');
  assert.deepEqual(f.calls.sources, [2]);
  assert.equal(api.inspect().visible, false);
  assert.equal(api.inspect().frame, false);
  assert.equal(f.calls.destroyed, 1);
  assert.equal(f.calls.removed, 1);
  assert.throws(() => api.source('999'), /Unknown source/);
});

test('app launch uses the stock Home method and rejects unknown installed IDs', async () => {
  const f = fixture(), api = await start(f);
  api.launch('4823_1');
  assert.equal(f.calls.launched.length, 1);
  assert.equal(f.calls.launched[0].jumpName, 'YouTube');
  assert.throws(() => api.launch('uninstalled'), /not installed/);
});

test('uninstall retires the iframe and restores stock methods without deleting favourites', async () => {
  const f = fixture(), originalSave = f.page.saveIhsData;
  f.values.set('compact-home.favourites.v1', '["4823_1"]');
  const api = await start(f);
  assert.notEqual(f.scheduler.open, f.originalOpen);
  api.uninstall();
  assert.equal(f.scheduler.open, f.originalOpen);
  assert.equal(f.page.saveIhsData, originalSave);
  assert.equal(f.context.RzeroNativeHome, undefined);
  assert.equal(f.values.get('rzero.native-home.enabled.v1'), undefined);
  assert.equal(f.values.get('compact-home.favourites.v1'), '["4823_1"]');
  assert.equal(f.calls.destroyed, 1);
});

test('native settings delegates to the stock Home settings operation', async () => {
  const f = fixture(), api = await start(f);
  api.settings();
  assert.equal(f.calls.settings, 1);
  assert.equal(api.inspect().visible, false);
});
