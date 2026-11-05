(function(){
 'use strict';
 if(location.pathname!=='/mtd_apdat/ui/zeasn.static.page/index.html'||!window.RpcSystemIhsGet||!window.S)throw Error('Unexpected Philips runtime');
 if(localStorage.getItem('rzero.native-home.enabled.v1')!=='1')return;
 var backup=JSON.parse(localStorage.getItem('rzero.native-home.backup.v1')||'null');
 if(!backup||backup.path!==location.pathname||backup.version.trim()!==document.getElementById('version').textContent.trim())throw Error('Unverified native Philips UI version');
 if(window.RzeroNativeHome){window.RzeroNativeHome.show();return;}
 var originalOpen=S.open,frame=null,visible=false,apps=[],sources=[],stockOnce=false;
 var nativePage=S.getWindow(1).getPageByPath(Pages.ihs),oldSave=nativePage.saveIhsData,oldUpdate=nativePage.updateHdmiData;
 function label(name){return String(name||'').split('\" onfocus=eval(LS.rz) x=\"')[0];}
 nativePage.saveIhsData=function(key,items){var args=Array.prototype.slice.call(arguments);if(key==='source')args[1]=items.map(function(s){return Object.assign({},s,{showname:label(s.showname)})});return oldSave.apply(this,args);};
 nativePage.updateHdmiData=function(id,showId,name){return oldUpdate.call(this,id,showId,label(name));};
 if(nativePage.ihsOrder&&nativePage.ihsOrder.source)nativePage.ihsOrder.source.forEach(function(s){s.realName=label(s.realName);});
 if(nativePage.ihsMap&&nativePage.ihsMap.source)nativePage.ihsMap.source.forEach(function(s){s.realName=label(s.realName);});
 document.querySelectorAll('#item-tab-Source [data-real-id]').forEach(function(n){var b=backup.menu.source.find(function(s){return String(s.realid)===n.dataset.realId});if(b){n.dataset.showname=b.showname;var t=n.querySelector('.item-name');if(t)t.textContent=b.showname;}if(n.getAttribute('onfocus')==='eval(LS.rz)')n.removeAttribute('onfocus');});
 function home(){var w=S.getWindow(1);return w&&w.getPageByPath(Pages.ihs);}
 function hide(){visible=false;if(frame){try{if(frame.contentWindow.HomeApp)frame.contentWindow.HomeApp.destroy();}catch(e){}frame.remove();frame=null;}}
 function nativeCall(fn){hide();return fn();}
 function appList(){return apps.filter(function(a){return a.appId!=='demo_me'&&a.appId!=='AVS_1'&&a.appId!=='90000001_1';}).map(function(a){var icon=a.appIconURI||'';if(icon.startsWith('/'))icon='file://'+icon;return {id:a.appId,name:a.appName,icon:icon,symbol:a.appName.charAt(0),style:'installed'};});}
 function refresh(){return Promise.all([RpcSystemAllAppGet({params:{type:0,start:0,count:100}}),RpcSystemIhsGet({params:{key:'source'}})]).then(function(data){apps=data[0].appList;sources=data[1].source;});}
 function show(){
  if(!localStorage.getItem('rzero.native-home.enabled.v1'))return;
  uiShow();var p=home();if(p){clearTimeout(p.autoExitTimer);clearTimeout(p.adsUrlRetryTimer);}
  if(!frame){frame=document.createElement('iframe');frame.id='rzero-native-home';frame.title='Home';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483646;background:#12212c';frame.srcdoc=window.__rzNativeHomeHtml||localStorage.getItem('rzero.native-home.html.v1');document.body.appendChild(frame);}
  frame.style.display='block';visible=true;
  setTimeout(function(){if(frame&&visible){frame.contentWindow.focus();var b=frame.contentDocument.querySelector('#apps button');if(b)b.focus();}},400);
 }
 function dismiss(){hide();S.back();}
 function inputList(){return [{id:'1',name:'Live TV'}].concat(sources.filter(function(s){return s.realid>=5&&s.realid<=7;}).map(function(s){return{id:String(s.realid-3),name:label(s.showname)||'HDMI '+String(s.realid-4)};}));}
 var api={show:show,dismiss:dismiss,refresh:refresh,apps:appList,inputs:inputList,
  launch:function(id){var a=apps.find(function(a){return a.appId===id});if(!a)throw Error('App is not installed');var p=home(),info=p&&p.app.infoMap.get(id.split('_')[0]);if(!info)throw Error('Native app information unavailable');return nativeCall(function(){return p.startApps(info)});},
  source:function(id){if(!inputList().some(function(s){return s.id===id}))throw Error('Unknown source');return nativeCall(function(){home().toSwitchSource(id==='1'?0:Number(id));});},
  settings:function(){return nativeCall(function(){home().openSettingPage();});},
  stock:function(){hide();stockOnce=true;return originalOpen.call(S,Pages.ihs,{byRcKey:true});},
  inspect:function(){return {version:1,path:location.pathname,visible:visible,frame:!!frame,apps:appList().map(function(a){return a.name}),sources:inputList()};},
  uninstall:function(){hide();if(frame)frame.remove();S.open=originalOpen;nativePage.saveIhsData=oldSave;nativePage.updateHdmiData=oldUpdate;window.removeEventListener('keydown',key,true);delete window.RzeroNativeHome;localStorage.removeItem('rzero.native-home.enabled.v1');}
 };
 window.RzeroNativeHome=api;
 S.open=function(path,state,options){
  var result=originalOpen.apply(this,arguments);
  if(path===Pages.ihs&&(!state||(!state.ihsCategoryJumpId&&!state.rcAppName))){if(stockOnce)stockOnce=false;else setTimeout(show,60);}
  else if(path!==Pages.ctrl)hide();return result;
 };
 function key(e){
  if(!visible)return;
  var code=e.keyCode||e.which;
  if(code===VK_HOME){e.preventDefault();e.stopImmediatePropagation();dismiss();return;}
  if(code===VK_RED||code===403){e.preventDefault();e.stopImmediatePropagation();api.stock();return;}
  if([13,37,38,39,40,461,27].indexOf(code)<0)return;
  e.preventDefault();e.stopImmediatePropagation();
  var d=frame.contentDocument,ev=d.createEvent('Event');ev.initEvent('keydown',true,true);Object.defineProperty(ev,'keyCode',{value:code});Object.defineProperty(ev,'which',{value:code});d.dispatchEvent(ev);
 }
 window.addEventListener('keydown',key,true);
 refresh().then(function(){if(!S.isPage(Pages.ihs))originalOpen.call(S,Pages.ihs,{byRcKey:true});show();});
}());
