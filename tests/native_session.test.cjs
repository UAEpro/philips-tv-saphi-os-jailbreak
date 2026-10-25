const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
let nextId=0;
const timeouts=new Map(),intervals=new Map(),scripts=[];
const windowEvents=new Map(),documentEvents=new Map(),destinations=[];
function add(events,name,fn,capture=false) {
 const list=events.get(name)||[];list.push({fn,capture});events.set(name,list);
}
function remove(events,name,fn,capture=false) {
 events.set(name,(events.get(name)||[]).filter(e=>e.fn!==fn||e.capture!==capture));
}
const context={
 g_iHS_show:true,g_iHS_freeze_counter:121,
 location:{protocol:'file:',pathname:'/3rd/html5/php/dash/index.html'},TV_JSP:function(){},Image:function(){},
 __nativeHomeConfig:{base:'http://192.0.2.1/fixture',html:''},
 getTvJspService:()=>({tvServices:{advMsg(){}}}),
 mtvuiUtil:{gotoSysPage:(...args)=>destinations.push(args)},
 setTimeout:(fn,delay)=>{timeouts.set(++nextId,{fn,delay});return nextId;},clearTimeout:id=>timeouts.delete(id),
 setInterval:(fn,delay)=>{intervals.set(++nextId,{fn,delay});return nextId;},clearInterval:id=>intervals.delete(id),
 document:{hidden:false,open(){},write(){},close(){},
  addEventListener:(...args)=>add(documentEvents,...args),removeEventListener:(...args)=>remove(documentEvents,...args),
  createElement:()=>({}),head:{appendChild(script){scripts.push(script);script.parentNode={removeChild(){}};}}},
 addEventListener:(...args)=>add(windowEvents,...args),removeEventListener:(...args)=>remove(windowEvents,...args)
};
context.window=context;vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'../native-home/session.js'),'utf8');
vm.runInContext(source,context);const original=context.NativeHome;
assert.equal(context.g_iHS_show,false,'The replaced stock document must stop owning Home idle state');
assert.equal(context.g_iHS_freeze_counter,0,'Clear an already-expired stock Home counter');
// Model the stock displayTime callback that survives document.open(). It must
// not repeatedly hide Home after two minutes, even without any remote input.
for(let second=0;second<180;second++) {
 if(context.g_iHS_show && ++context.g_iHS_freeze_counter>120)context.mtvuiUtil.gotoSysPage('sys_index');
}
assert.equal(destinations.length,0,'A surviving stock idle interval cannot close the custom Home');
assert.equal(scripts.length,1);assert.equal(intervals.size,1);
// A reload happens while the first helper request is still in flight.
vm.runInContext(source,context);
assert.notEqual(context.NativeHome,original);assert.equal(scripts.length,2);
assert.equal(intervals.size,1,'Only the replacement session keeps its promotion guard');
scripts[0].onload();
assert.equal([...timeouts.values()].filter(t=>t.delay===3000).length,0,'Old callback must not resurrect polling against the new session');
scripts[1].onload();assert.equal([...timeouts.values()].filter(t=>t.delay===3000).length,1);
assert.equal(windowEvents.get('keydown').length,1,'Reload leaves one Home handler');
assert.equal(windowEvents.get('keyup').length,1);
function key(type,code,repeat=false) {
 const event={type,keyCode:code,repeat,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
 for(const listener of windowEvents.get(type)||[]) {assert.equal(listener.capture,true);listener.fn(event);}
 return event;
}
assert.equal(key('keydown',39).stopped,undefined,'Arrows still reach the normal UI');
assert.equal(key('keydown',447).stopped,undefined,'Native volume keys still pass through');
assert.equal(key('keydown',462).stopped,true,'Home must not reach generic system-menu routing');
assert.deepEqual(destinations,[['sys_index',true]],'Home dismisses instead of relaunching the dashboard');
assert.equal(key('keydown',462,true).prevented,true);
assert.equal(key('keydown',462).prevented,true,'Old remote repeat events may omit event.repeat');
assert.equal(destinations.length,1,'A held key cannot issue multiple transitions');
context.document.hidden=true;
documentEvents.get('visibilitychange')[0].fn();
assert.equal(intervals.size,0,'The hidden Home has no promotion-guard timer');
assert.equal(key('keyup',462).stopped,true,'Consume the matching release even after hiding');
assert.equal(key('keydown',462).stopped,undefined,'Hidden Home must not intercept keys for another page');
context.document.hidden=false;
context.g_iHS_show=true;context.g_iHS_freeze_counter=123;
documentEvents.get('visibilitychange')[0].fn();
assert.equal(context.g_iHS_show,false,'Retire stale stock state on native-window entry too');
assert.equal(context.g_iHS_freeze_counter,0);
documentEvents.get('visibilitychange')[0].fn();
assert.equal(intervals.size,1,'Showing Home resumes exactly one promotion guard');
assert.equal(key('keydown',462).prevented,true);
assert.equal(destinations.length,2,'A fresh press still works');
// Keyup may be delivered to the other native window; reset on returning Home.
documentEvents.get('visibilitychange')[0].fn();
key('keydown',462);assert.equal(destinations.length,3);
const retiredHomeHandler=windowEvents.get('keydown')[0].fn;
context.NativeHome.restore(false);assert.equal(intervals.size,0);
assert.equal([...timeouts.values()].filter(t=>t.delay===3000).length,0);
assert.equal(windowEvents.get('keydown').length,0);
assert.equal(windowEvents.get('keyup').length,0);
retiredHomeHandler({type:'keydown',keyCode:462});assert.equal(destinations.length,3);
console.log('Passed: disposed-session polling, single guards, Home dismiss/repeat/release handling, hidden-page pass-through and cleanup.');
