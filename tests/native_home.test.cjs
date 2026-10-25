const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function environment(backupStatus = 200) {
  const original = JSON.stringify({item: ['Sources','TV','Apps','Settings'].map(row1 => ({row1, row2:[
    {itemName:'Example',itemImg:'example.png'}, {itemName:'Reorder',itemImg:'reorder.svg'}
  ]}))});
  const storage = new Map([['IHSMenuItems', original]]);
  const context = {
    location:{protocol:'file:',pathname:'/3rd/html5/php/dash/index.html',reload(){context.reloaded=true;}},
    localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    Image:function(){}, setTimeout:callback=>callback(),
    XMLHttpRequest:function(){this.open=()=>{};this.setRequestHeader=()=>{};this.send=data=>{context.backup=data;this.status=backupStatus;this.onload();};}
  };
  context.window=context;
  context.__nativeHomeInstall={base:'http://192.0.2.1/fixture',runtime:'window.runtimeExecuted = true;'};
  vm.createContext(context);
  return {context,storage,original};
}

// Installation backs up first and preserves every original item and field,
// changing only the existing Reorder image attributes.
const installed=environment();
vm.runInContext(read('native-home/install.js'),installed.context);
assert.equal(installed.context.backup,installed.original);
assert.equal(installed.storage.get('compact-home.stock-menu.v1'),installed.original);
assert.equal(installed.context.runtimeExecuted,true);
for(const row of JSON.parse(installed.storage.get('IHSMenuItems')).item){
  assert.equal(row.row2[0].itemImg,'example.png');
  assert.match(row.row2[1].itemImg,/data-compact-home="1"/);
}
// Reapplying never backs up the hook as if it were the stock menu.
vm.runInContext(read('native-home/install.js'),installed.context);
assert.equal(installed.context.backup,installed.original);
assert.equal(installed.storage.get('compact-home.stock-menu.v1'),installed.original);

// Exercise the actual serialized image hook: conceal the stock page until the
// deferred handoff, keep only one handoff, and unmask it if execution fails.
const hook=JSON.parse(installed.storage.get('IHSMenuItems')).item[0].row2[1].itemImg.match(/onload="([^"]+)" onerror=/)[1];
function runHook(runtime, enabled='1') {
  const fixture=environment(), pending=[];
  fixture.storage.set('compact-home.enabled.v1',enabled);
  fixture.storage.set('compact-home.runtime.v1',runtime);
  fixture.context.document={documentElement:{style:{visibility:'visible'}}};
  fixture.context.setTimeout=(fn,delay)=>pending.push({fn,delay});
  fixture.fire=()=>vm.runInContext('(function(){'+hook+'}).call({})',fixture.context);
  fixture.pending=pending;
  fixture.fire();
  return fixture;
}
const handoff=runHook("window.visibilityDuringLoad=document.documentElement.style.visibility;window.runtimeExecuted=true;");
assert.equal(handoff.context.document.documentElement.style.visibility,'hidden');
assert.equal(handoff.context.runtimeExecuted,undefined,'Do not re-enter the stock renderer in the image handler');
handoff.fire();assert.equal(handoff.pending.length,1,'Multiple anchors schedule only one handoff');
assert.equal(handoff.pending[0].delay,0,'Do not deliberately expose the stock UI for 600 ms');
handoff.pending[0].fn();
assert.equal(handoff.context.visibilityDuringLoad,'hidden');
assert.equal(handoff.context.runtimeExecuted,true);
assert.equal(handoff.context.document.documentElement.style.visibility,'visible');
const brokenHook=runHook("throw new Error('fixture runtime failure')");
brokenHook.pending[0].fn();
assert.equal(brokenHook.context.document.documentElement.style.visibility,'visible','A broken runtime must not leave Home blank');
assert.equal(brokenHook.context.__nhScheduled,false,'Allow a later retry after a failed runtime');
for(const fixture of [runHook(''),runHook('window.runtimeExecuted=true;','0')]) {
  assert.equal(fixture.pending.length,0);
  assert.equal(fixture.context.document.documentElement.style.visibility,'visible');
}
const swapped=runHook("document.documentElement={style:{visibility:'inherit'}};");
const oldRoot=swapped.context.document.documentElement;
swapped.pending[0].fn();
assert.equal(oldRoot.style.visibility,'visible');
assert.equal(swapped.context.document.documentElement.style.visibility,'inherit','Only restore the old document mask');
console.log('Passed: deferred masked launcher handoff, duplicate anchors, disabled/missing runtime, failure unmask and document replacement.');

// A failed Mac backup leaves TV storage untouched.
const failed=environment(500);
vm.runInContext(read('native-home/install.js'),failed.context);
assert.equal(failed.storage.get('IHSMenuItems'),failed.original);
assert.equal(failed.storage.size,1);

// Recovery disables the hook, restores the exact menu, and clears its runtime.
installed.context.__nativeHomeRestoreBase='http://192.0.2.1/fixture';
vm.runInContext(read('native-home/restore.js'),installed.context);
assert.equal(installed.storage.get('IHSMenuItems'),installed.original);
assert.equal(installed.storage.has('compact-home.enabled.v1'),false);
assert.equal(installed.storage.has('compact-home.runtime.v1'),false);
assert.equal(installed.context.reloaded,true);

// A normal web preview cannot invoke native controls, even with a fake marker.
const preview={location:{protocol:'http:',pathname:'/preview.html'},NativeHome:{},TV_JSP:function(){}};
preview.window=preview;preview.parent=preview;vm.createContext(preview);
vm.runInContext(read('home-app/bridge.js'),preview);
assert.equal(preview.HomeTV.live,false);
assert.throws(()=>preview.HomeTV.app('youtube'),/Preview only/);
console.log('Passed: backup-first install, idempotent backup, failed-backup rollback, exact restore, preview isolation.');

// Only HDMI ports with CEC evidence and actually mounted USB storage appear.
// Device names are associated by physical port, never by list position.
const sourceFixture={
  location:{protocol:'file:',pathname:'/3rd/html5/php/dash/index.html'}, TV_JSP:function(){},
  InputSource:function(){this.getInputList=()=>[
    {id:'1_2',name:'Antenna TV'}, {id:'4',name:'HDMI 1',oName:'HDMI 1'},
    {id:'5',name:'HDMI 2',oName:'HDMI 2'}, {id:'6',name:'HDMI 3 / MHL',oName:'HDMI 3 / MHL'}
  ];},
  ipsCECObj:{getConnectedDeviceList:()=>[
    {idx:3,dev_la:8,osd_name:'Streaming box'}, {idx:3,dev_la:4,osd_name:'Duplicate'},
    {idx:2,dev_la:5,osd_name:'Audio receiver'}, {idx:99,dev_la:4,osd_name:'Unknown port'}
  ]},
  getTvJspService:()=>({mmpServices:{getMountPointList:()=>JSON.stringify({ITEMS:[
    {PATH:'/mnt/usb/sda1/',LABEL:'Movies'}, {PATH:'/mnt/network/share',LABEL:'Network'}
  ]})}})
};
sourceFixture.window=sourceFixture; sourceFixture.parent=sourceFixture;vm.createContext(sourceFixture);
vm.runInContext(read('home-app/bridge.js'),sourceFixture);
let sources=JSON.parse(JSON.stringify(sourceFixture.HomeTV.connectedInputs()));
assert.deepEqual(sources.map(s=>[s.id,s.name]),[['6','Streaming box'],['5','Audio receiver'],['1_7','Movies']]);
sourceFixture.ipsCECObj.getConnectedDeviceList=()=>[];
sourceFixture.getTvJspService=()=>({mmpServices:{getMountPointList:()=>'{"ITEMS":[]}'}});
assert.equal(sourceFixture.HomeTV.connectedInputs().length,0);
sourceFixture.ipsCECObj.getConnectedDeviceList=()=>{throw Error('Unavailable');};
assert.throws(()=>sourceFixture.HomeTV.connectedInputs(),/unavailable/);
console.log('Passed: HDMI port/name matching, duplicate filtering and connected audio devices, mounted USB, empty detection, unavailable detection.');

// Missing manufacturer / CEC display name must not hide a connected port.
sourceFixture.ipsCECObj.getConnectedDeviceList=()=>[{idx:1,dev_la:4,osd_name:'   '}];
assert.equal(sourceFixture.HomeTV.connectedInputs()[0].name,'HDMI 1');
sourceFixture.ipsCECObj.getConnectedDeviceList=()=>[{idx:2,dev_la:4,osd_name:'Unknown device'}];
assert.equal(sourceFixture.HomeTV.connectedInputs()[0].name,'HDMI 2');
// A non-CEC source with a confirmed signal is visible; selected-but-empty is not.
sourceFixture.ipsCECObj.getConnectedDeviceList=()=>[];
sourceFixture.MtvObj=function(){this.acfgGetConfigValue=()=>sourceFixture.signal;};
// InputSource is cached by the bridge, so expose the fixture list through its prototype.
const activeFixture={...sourceFixture};
activeFixture.InputSource=function(){this.getInputList=()=>[{id:'5',name:'HDMI 2',oName:'HDMI 2',active:true}];};
activeFixture.window=activeFixture;activeFixture.parent=activeFixture;
activeFixture.MtvObj=function(){this.acfgGetConfigValue=()=>activeFixture.signal;};
vm.createContext(activeFixture);vm.runInContext(read('home-app/bridge.js'),activeFixture);
activeFixture.signal=0;
assert.equal(activeFixture.HomeTV.connectedInputs()[0].name,'HDMI 2');
for(const value of [1,null,undefined,-1]) {activeFixture.signal=value;assert.equal(activeFixture.HomeTV.connectedInputs().length,0);}
console.log('Passed: unnamed HDMI and non-CEC active signal, no invented connection on empty or unknown signal.');

// Use the installed registry, including third-party apps; never expose launch URLs
// in public UI metadata. Refresh must remove uninstalled stale menu entries.
const appFixture={location:{protocol:'file:',pathname:'/3rd/html5/php/dash/index.html'},TV_JSP:function(){},
 localStorage:{getItem:()=>JSON.stringify({item:[{row1:'Apps',row2:[
  {appID:'4823_52870',itemName:'YouTube'}, {appID:'old_1',itemName:'Removed app'}]}]})},
 mtvuiUtil:{gotoSysPage(){}},getTvJspService:()=>({tvServices:{StartSmartTVApp(...args){appFixture.launched=args;}}}),
 XMLHttpRequest:function(){this.open=()=>{};this.send=()=>{appFixture.xhr=this;};}
};
appFixture.window=appFixture;appFixture.parent=appFixture;vm.createContext(appFixture);vm.runInContext(read('home-app/bridge.js'),appFixture);
assert.equal(appFixture.HomeTV.installedApps().length,2);
const registry=[
 {applicationId:'4823_52870',applicationName:'YouTube'},
 {applicationId:'5048_52845',applicationName:'Netflix'},
 {applicationId:'7001_10000001',applicationName:'Example%20Video',applicationURL:'https://example.invalid/app?private=fixture'},
 {applicationId:'20004317_20004875',applicationName:'Smart%20TV'},
 {applicationId:'3059_20013063',applicationName:'App%20Gallery'},
 {applicationId:'5443_52874',applicationName:'Internet%20browser'},
 {applicationId:'7002_10000002',applicationName:'Example%20Music'},
 {itemName:'Reorder',itemImg:'hook'}
];
let refreshed;
appFixture.HomeTV.refreshApps(list=>refreshed=list);
appFixture.xhr.responseText=JSON.stringify({applicationInstalled:registry});appFixture.xhr.onload();
assert.equal(refreshed.length,7);
assert.equal(appFixture.HomeTV.installedApps().length,7);
assert.equal(refreshed.some(a=>a.name==='Removed app'),false);
assert.equal(JSON.stringify(refreshed).includes('private'),false);
appFixture.HomeTV.app('app:7001_10000001');
assert.deepEqual(appFixture.launched,[0,'7001_10000001','https://example.invalid/app?private=fixture','Null']);
appFixture.HomeTV.app('youtube');assert.deepEqual(appFixture.launched,[0,'Null','Null','youtube']);
assert.throws(()=>appFixture.HomeTV.app('amazon'),/not in/);
console.log('Passed: all installed apps, stale removal, private launch URL isolation and correct native/third-party launch arguments.');

const dataContext={HomeConfig:{utcOffsetMinutes:240,prayers:{timezone:"Etc/GMT-4",method:3}}};vm.createContext(dataContext);
vm.runInContext(read('home-app/app.js').split('/* All network requests')[0],dataContext);
const D=dataContext.HomeData;
const t=Date.parse('2026-10-24T20:05:00Z');
assert.equal(D.dateKey(t),'2026-10-25');
assert.equal(D.monthKey(D.nextMonth(Date.parse('2026-12-31T20:00:00Z'))),'2027-02');
assert.equal(D.time('05:02 (+04)'),'05:02');assert.equal(D.time('25:02'),null);
assert.equal(D.validDay({Fajr:null,Dhuhr:null,Asr:null,Maghrib:null,Isha:null}),false);
const day={Fajr:'05:02',Dhuhr:'12:03',Asr:'15:15',Maghrib:'17:43',Isha:'18:58'};
const row={date:{gregorian:{date:'25-10-2026'}},timings:day,meta:{timezone:'Etc/GMT-4',method:{id:3}}};
let days=D.calendar([row],'2026-10');
assert.equal(D.nextPrayer(t,days).name,'Fajr');
assert.equal(D.nextPrayer(Date.parse('2026-10-25T15:30:00Z'),days),null);
days['2026-10-26']={...day,Fajr:'05:03'};
let next=D.nextPrayer(Date.parse('2026-10-25T15:30:00Z'),days);
assert.equal(next.name,'Fajr');assert.equal(next.tomorrow,true);assert.equal(next.minutes,573);
assert.equal(D.nextPrayer(Date.parse('2026-10-27T00:00:00Z'),days),null);
assert.throws(()=>D.calendar([{...row,meta:{timezone:'UTC',method:{id:3}}}],'2026-10'),/No valid/);
assert.throws(()=>D.calendar([row],'2026-11'),/No valid/);
console.log('Passed: configured-offset midnight, year/month rollover, prayer validation, next-day Fajr and expired-cache omission.');
