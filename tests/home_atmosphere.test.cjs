const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../home-app/app.js'),'utf8').split('/* Home UI */')[0];
function environment(withCache=true, readerSupported=true, initiallyHidden=false, prayerCache=true, prayerEnabled=true){
  let now=Date.parse('2026-10-25T06:00:00Z'), nextId=0;
  const elements={},events={},listeners={},timeouts=new Map(),intervals=new Map(),requests=[],images=[],readers=[],reports=[];
  const storage=new Map();
  const config={utcOffsetMinutes:240,prayers:{enabled:prayerEnabled,latitude:0,longitude:0,timezone:'Etc/GMT-4',method:3,location:'Test location',region:'Fixture',source:'AlAdhan'}};
  const prayerKey='compact-home.prayers.v2.'+encodeURIComponent(JSON.stringify([0,0,'Etc/GMT-4',3,240]));
  const day={Fajr:'05:02',Dhuhr:'12:03',Asr:'15:15',Maghrib:'17:43',Isha:'18:58'};
  if(prayerCache)storage.set(prayerKey,JSON.stringify({months:{
    '2026-10':{fetchedAt:now,days:{'2026-10-25':day}},'2026-11':{fetchedAt:now,days:{'2026-11-01':day}}
  }}));
  if(withCache)storage.set('compact-home.scene.v1',JSON.stringify({id:10,data:'data:image/jpeg;base64,Y2FjaGVk'}));
  function node(){return {textContent:'',style:{},classList:{add(){},remove(){}},appendChild(){}};}
  const context={HomeConfig:config,
    Date:class extends Date{static now(){return now;}},Math,
    document:{hidden:initiallyHidden,getElementById:id=>elements[id]||(elements[id]=node()),
      createElement:tag=>{assert.notEqual(tag,'canvas','No synchronous image encoding');return node();},
      addEventListener:(name,fn)=>{(listeners[name]||(listeners[name]=[])).push(fn);events[name]=()=>listeners[name].slice().forEach(fn=>fn());},
      removeEventListener:(name,fn)=>{listeners[name]=(listeners[name]||[]).filter(f=>f!==fn);if(!listeners[name].length)delete events[name];}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:(fn,delay)=>{timeouts.set(++nextId,{fn,at:now+delay});return nextId;},clearTimeout:id=>timeouts.delete(id),
    setInterval:(fn,delay)=>{intervals.set(++nextId,{fn,delay});return nextId;},clearInterval:id=>intervals.delete(id),
    XMLHttpRequest:function(){requests.push(this);this.open=(method,url)=>{this.url=url;};this.send=()=>{};this.abort=()=>{this.aborted=true;};},
    Image:function(){images.push(this);},
    NativeHome:{report:e=>reports.push(e)}
  };
  if(readerSupported)context.FileReader=function(){readers.push(this);this.readyState=0;this.readAsDataURL=()=>{this.readyState=1;};this.abort=()=>{this.aborted=true;};};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  const app=vm.runInContext('new HomeAtmosphere()',context);
  return {app,context,elements,storage,requests,images,readers,reports,events,timeouts,intervals,
    hide(value=true){context.document.hidden=value;if(events.visibilitychange)events.visibilitychange();},
    advance(ms){now+=ms;for(const [id,t] of Array.from(timeouts)){if(t.at<=now){timeouts.delete(id);t.fn();}}},
    tick(){for(const t of intervals.values())t.fn();},
    jpeg(){const xhr=requests[requests.length-1];xhr.status=200;xhr.response={size:12345};xhr.onload();
      const reader=readers[readers.length-1];reader.result='data:image/jpeg;base64,bmV3';reader.readyState=2;reader.onload();}
  };
}
const cached=environment();
assert.equal(cached.requests.length,0,'A cached Home should not immediately download another scene');
assert.equal(cached.app.inspect().background.state,'saved');
assert.equal(cached.app.inspect().prayers.today.Fajr,'05:02');
cached.advance(120000);cached.events.keydown();cached.tick();
assert.equal(cached.requests.length,0,'Automatic downloads defer during remote navigation');
cached.advance(1300);cached.tick();assert.equal(cached.requests.length,1);
assert.match(cached.requests[0].url,/1280\/720\.jpg$/);
assert.equal(cached.requests[0].responseType,'blob');
cached.jpeg();cached.events.keydown();cached.images[0].onload();
assert.equal(cached.app.inspect().background.state,'saved','A decoded scene waits for navigation to settle');
cached.advance(1500);
assert.equal(cached.app.inspect().background.state,'online');
assert.equal(cached.app.inspect().background.cached,true);
assert.equal(JSON.parse(cached.storage.get('compact-home.scene.v1')).data,'data:image/jpeg;base64,bmV3');
cached.app.destroy();assert.equal(cached.timeouts.size,0);assert.equal(cached.intervals.size,0);

const manual=environment();manual.events.keydown();manual.app.newScene();assert.equal(manual.requests.length,1,'New view works immediately after OK');
manual.app.destroy();assert.equal(manual.requests[0].aborted,true);
const loading=environment(false);assert.equal(loading.requests.length,1);loading.jpeg();loading.app.destroy();
assert.equal(loading.images[0].onload,null,'Disposed Home cannot apply late image callbacks');
const reading=environment(false);reading.requests[0].status=200;reading.requests[0].response={size:1};reading.requests[0].onload();
reading.app.destroy();assert.equal(reading.readers[0].aborted,true);
const fallback=environment(false,false);assert.equal(fallback.images.length,1,'Older browsers can display a direct image');
fallback.images[0].onload();assert.equal(fallback.app.inspect().background.state,'online');fallback.app.destroy();
const hidden=environment();hidden.context.document.hidden=true;hidden.advance(120000);hidden.tick();assert.equal(hidden.requests.length,0);hidden.app.destroy();

// Hidden Home should have no periodic wakeups and no new content downloads.
const sleeping=environment();assert.equal(sleeping.intervals.size,2);
sleeping.hide();assert.equal(sleeping.intervals.size,0);assert.equal(sleeping.app.inspect().activity.timers,0);
sleeping.advance(60000);sleeping.tick();assert.equal(sleeping.requests.length,0);
sleeping.hide(false);sleeping.hide(false);assert.equal(sleeping.intervals.size,2,'Resume must not duplicate timers');
assert.equal(sleeping.requests.length,0,'Retain the cached scene after a short visit to another input');
sleeping.app.destroy();sleeping.hide(false);assert.equal(sleeping.intervals.size,0,'Disposed Home cannot restart');
const bornHidden=environment(false,true,true);assert.equal(bornHidden.intervals.size,0);assert.equal(bornHidden.requests.length,0);
bornHidden.hide(false);assert.equal(bornHidden.intervals.size,2);assert.equal(bornHidden.requests.length,1);bornHidden.app.destroy();

// Abort handlers must not fall back to another image request or interfere with
// a fresh request on return, even when an old callback was already queued.
const interrupted=environment(false);
const oldRequest=interrupted.requests[0], lateLoad=oldRequest.onload, lateError=oldRequest.onerror;
interrupted.hide();assert.equal(oldRequest.aborted,true);assert.equal(oldRequest.onload,null);assert.equal(oldRequest.onerror,null);
oldRequest.status=200;oldRequest.response={size:123};lateLoad();lateError();
assert.equal(interrupted.readers.length,0);assert.equal(interrupted.images.length,0);
assert.equal(interrupted.app.inspect().activity.scenePending,false);
interrupted.hide(false);assert.equal(interrupted.requests.length,2);lateError();
assert.equal(interrupted.app.inspect().activity.scenePending,true,'Late old failure cannot clear a new request');
interrupted.jpeg();interrupted.images[0].onload();assert.equal(interrupted.app.inspect().background.state,'online');interrupted.app.destroy();

const calendars=environment(true,true,false,false);
const oldCalendars=calendars.requests.slice();assert.equal(oldCalendars.length,2);
const lateCalendar=oldCalendars[0].onload;
calendars.hide();assert.ok(oldCalendars.every(r=>r.aborted));assert.equal(calendars.app.inspect().activity.pendingCalendars,0);
calendars.hide(false);assert.equal(calendars.requests.length,4,'Canceled calendars can retry immediately on resume');
lateCalendar();assert.equal(calendars.app.inspect().activity.pendingCalendars,2);
calendars.app.destroy();assert.equal(calendars.intervals.size,0);
console.log('Passed: cached paint, idle work, async images, hidden timer suspension, cancellation, stale-callback isolation, resume and cleanup.');

const disabled=environment(true,true,false,false,false);
assert.equal(disabled.elements['prayer-card'].hidden,true);
assert.equal(disabled.app.inspect().prayers.state,'disabled');
assert.equal(disabled.intervals.size,1,'Disabled calendar adds no periodic timer');
disabled.advance(60000);disabled.tick();
assert.equal(disabled.requests.length,0,'Disabled calendar sends no location request');
disabled.app.destroy();
const defaults={};vm.createContext(defaults);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../home-app/config.js'),'utf8'),defaults);
assert.equal(defaults.HomeConfig.prayers.enabled,false);
assert.equal(defaults.HomeConfig.prayers.latitude,null);
assert.equal(defaults.HomeConfig.prayers.longitude,null);
console.log('Passed: public defaults have no coordinates, calendar traffic or calendar timer.');
