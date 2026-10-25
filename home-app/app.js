/* ES5 date helpers use the owner's configured fixed UTC offset. */
var HomeData = (function () {
    var names = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    function pad(n) {return n < 10 ? '0' + n : String(n);}
    function local(now) {return new Date(now + HomeConfig.utcOffsetMinutes * 60000);}
    function dateKey(now) {var d=local(now);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());}
    function monthKey(now) {return dateKey(now).slice(0,7);}
    function nextMonth(now) {var d=local(now);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-HomeConfig.utcOffsetMinutes*60000;}
    function time(value) {var m=/^([01]\d|2[0-3]):([0-5]\d)(?:\s|$)/.exec(String(value || ''));return m ? m[1]+':'+m[2] : null;}
    function validDay(day) {return day && names.every(function (name) {return typeof day[name]==='string' && time(day[name]) === day[name];});}
    function calendar(rows, month) {
        var days={};
        if (!Array.isArray(rows)) throw new Error('Invalid prayer calendar');
        rows.forEach(function (row) {
            var date=row.date && row.date.gregorian && row.date.gregorian.date, m=/^(\d{2})-(\d{2})-(\d{4})$/.exec(date || '');
            if (!m || !row.meta || row.meta.timezone!==HomeConfig.prayers.timezone || Number(row.meta.method && row.meta.method.id)!==HomeConfig.prayers.method) return;
            var key=m[3]+'-'+m[2]+'-'+m[1], day={};
            if (key.slice(0,7)!==month) return;
            names.forEach(function (name) {day[name]=time(row.timings && row.timings[name]);});
            if (validDay(day)) days[key]=day;
        });
        if (!Object.keys(days).length) throw new Error('No valid prayer times');
        return days;
    }
    function nextPrayer(now, days) {
        var today=dateKey(now), tomorrow=dateKey(now+86400000), d=local(now), minutes=d.getUTCHours()*60+d.getUTCMinutes();
        for(var offset=0;offset<2;offset++) {
            var key=offset ? tomorrow : today, day=days[key]; if (!validDay(day)) continue;
            for(var i=0;i<names.length;i++) {
                var value=day[names[i]], bits=value.split(':'), delta=offset*1440+Number(bits[0])*60+Number(bits[1])-minutes;
                if (delta>=0) return {name:names[i],time:value,minutes:delta,tomorrow:!!offset};
            }
        }
        return null;
    }
    function twelve(value) {var bits=value.split(':'), h=Number(bits[0]);return (h%12||12)+':'+bits[1]+(h<12?' AM':' PM');}
    return {names:names,local:local,dateKey:dateKey,monthKey:monthKey,nextMonth:nextMonth,time:time,validDay:validDay,calendar:calendar,nextPrayer:nextPrayer,twelve:twelve};
}());

/* Stop periodic Home work completely while another app/input owns the screen. */
function HomeIntervals(tasks) {
    var timers=[], dead=false;
    function pause() {timers.forEach(function (timer) {clearInterval(timer);});timers=[];}
    function visible() {
        if(dead)return;
        if(document.hidden){pause();return;}
        if(timers.length)return;
        tasks.forEach(function (task) {timers.push(setInterval(function () {
            if(!dead && !document.hidden)task.run();
        },task.delay));});
    }
    document.addEventListener('visibilitychange',visible);visible();
    return {count:function () {return timers.length;},destroy:function () {
        dead=true;pause();document.removeEventListener('visibilitychange',visible);
    }};
}

/* All network requests run on the TV; no laptop proxy is involved. */
function HomeAtmosphere() {
    var prayerConfig=HomeConfig.prayers;
    var prayerEnabled=prayerConfig.enabled===true && typeof prayerConfig.latitude==='number' && isFinite(prayerConfig.latitude) && Math.abs(prayerConfig.latitude)<=90 &&
        typeof prayerConfig.longitude==='number' && isFinite(prayerConfig.longitude) && Math.abs(prayerConfig.longitude)<=180 &&
        typeof prayerConfig.method==='number' && isFinite(prayerConfig.method) && typeof prayerConfig.timezone==='string' && !!prayerConfig.timezone;
    var dead=false, requests=[], pending={}, attempts={}, cache={months:{}}, prayerState='loading', workGeneration=0;
    var prayerKey='compact-home.prayers.v2.'+encodeURIComponent(JSON.stringify([prayerConfig.latitude,prayerConfig.longitude,prayerConfig.timezone,prayerConfig.method,HomeConfig.utcOffsetMinutes]));
    var sceneKey='compact-home.scene.v1', activeScene=0, image=null, imageTimer=null;
    document.getElementById('prayer-card').hidden=!prayerEnabled;
    document.getElementById('prayer-location').textContent=prayerConfig.location || 'Prayer times';
    document.getElementById('prayer-region').textContent=prayerConfig.region || '';
    if(!prayerEnabled)prayerState='disabled';
    var sceneState={state:'fallback',id:null}, previousId=null, lastSceneAt=0, lastInteraction=0;
    var sceneRequest=null, sceneReader=null, applyTimer=null, sceneCleanup=null, lastPrayerRows='';
    var scenePeriod=120000;
    function interacting() {return Date.now()-lastInteraction<1200;}
    function touch() {lastInteraction=Date.now();}
    document.addEventListener('keydown',touch,true);
    var scenes=[{id:10,author:'Paul Jarvis'},{id:16,author:'Paul Jarvis'},{id:28,author:'Jerry Adney'},
        {id:29,author:'Go Wild'},{id:37,author:'Austin Neill'},{id:49,author:'Margaret Barley'}];
    function report(event,detail) {if (window.NativeHome) window.NativeHome.report({event:event,detail:detail});}
    function readDays() {
        var days={};Object.keys(cache.months).forEach(function (month) {
            var record=cache.months[month];Object.keys(record.days || {}).forEach(function (key) {if (HomeData.validDay(record.days[key])) days[key]=record.days[key];});
        });return days;
    }
    function renderPrayer() {
        if (dead) return;
        var now=Date.now(), days=readDays(), today=days[HomeData.dateKey(now)], next=HomeData.nextPrayer(now,days), row=document.getElementById('prayer-times');
        var signature=JSON.stringify([today,next && !next.tomorrow ? next.name : null]);
        if (signature!==lastPrayerRows) {lastPrayerRows=signature;row.textContent='';
        HomeData.names.forEach(function (name) {
            var cell=document.createElement('div');cell.className='prayer-slot'+(next && next.name===name && !next.tomorrow?' next':'');cell.textContent=name;
            var value=document.createElement('strong');value.textContent=today ? today[name] : '—';cell.appendChild(value);row.appendChild(cell);
        });}
        document.getElementById('next-label').textContent=next ? (next.tomorrow ? 'Tomorrow · ' : 'Next · ')+next.name : 'Prayer times';
        document.getElementById('next-time').textContent=next ? HomeData.twelve(next.time) : '—';
        var delta=next && next.minutes;
        document.getElementById('prayer-countdown').textContent=next ? (delta===0 ? 'It is time for '+next.name : 'In '+(delta>=60?Math.floor(delta/60)+'h ':'')+(delta%60)+'m') :
            (prayerState==='loading'?'Fetching today’s times…':'Times unavailable · waiting for internet');
        document.getElementById('prayer-note').textContent='Calculated · '+(prayerConfig.source || 'AlAdhan')+(prayerState==='offline' && today?' · Saved times':'');
    }
    function fetchMonth(month) {
        var now=Date.now(), old=cache.months[month], generation=workGeneration;
        if (pending[month] || (attempts[month] && now-attempts[month]<600000) || (old && now-old.fetchedAt<43200000 && old.fetchedAt<=now)) return;
        attempts[month]=now;pending[month]=true;
        var xhr=new XMLHttpRequest();requests.push(xhr);
        xhr.open('GET','https://api.aladhan.com/v1/calendar/'+month.slice(0,4)+'/'+Number(month.slice(5))+'?latitude='+encodeURIComponent(prayerConfig.latitude)+'&longitude='+encodeURIComponent(prayerConfig.longitude)+'&method='+encodeURIComponent(prayerConfig.method)+'&timezonestring='+encodeURIComponent(prayerConfig.timezone),true);xhr.timeout=18000;
        function finish(ok) {
            if(dead || generation!==workGeneration)return;
            pending[month]=false;var index=requests.indexOf(xhr);if(index>=0)requests.splice(index,1);
            if (month===HomeData.monthKey(Date.now())) prayerState=ok?'online':'offline';
            report('prayer-calendar',{month:month,ok:ok,days:ok?Object.keys(cache.months[month].days).length:0});renderPrayer();
        }
        xhr.onload=function () {
            if(dead || document.hidden || generation!==workGeneration)return;
            try {
                if(xhr.status!==200)throw new Error('HTTP');
                var payload=JSON.parse(xhr.responseText), days=HomeData.calendar(payload.data,month);
                if(dead)return;
                cache.months[month]={days:days,fetchedAt:Date.now()};
                var keep=[HomeData.monthKey(Date.now()),HomeData.monthKey(HomeData.nextMonth(Date.now()))];
                Object.keys(cache.months).forEach(function (key) {if(keep.indexOf(key)<0)delete cache.months[key];});
                try {localStorage.setItem(prayerKey,JSON.stringify(cache));} catch(e) {}
                finish(true);
            } catch(e) {finish(false);}
        };
        xhr.onerror=xhr.ontimeout=function () {finish(false);};
        try {xhr.send();} catch(e) {finish(false);}
    }
    function refreshPrayers() {
        if(!prayerEnabled || dead || document.hidden || interacting())return;
        renderPrayer();var now=Date.now();fetchMonth(HomeData.monthKey(now));fetchMonth(HomeData.monthKey(HomeData.nextMonth(now)));
    }
    function present(src, scene, state) {
        if(dead)return;
        var panels=[document.getElementById('scene-a'),document.getElementById('scene-b')], next=1-activeScene;
        clearTimeout(sceneCleanup);
        panels[next].style.backgroundImage='url("'+src+'")';panels[next].classList.add('visible');panels[activeScene].classList.remove('visible');activeScene=next;
        previousId=scene.id;lastSceneAt=Date.now();sceneState={state:state,id:scene.id};
        sceneCleanup=setTimeout(function () {if(!dead)panels[1-activeScene].style.backgroundImage='none';},500);
        document.getElementById('photo-credit').textContent='Photo: '+scene.author+' · Unsplash';
    }
    function loadScene(force) {
        if(dead || document.hidden || image || sceneRequest || sceneReader || (!force && interacting()))return;
        var generation=workGeneration;
        function workActive() {return !dead && !document.hidden && generation===workGeneration;}
        var pool=scenes.filter(function (s) {return s.id!==previousId;}), scene=pool[Math.floor(Math.random()*pool.length)];
        // Decode 56% fewer pixels; keep the 1080p UI and text full resolution.
        var url='https://picsum.photos/id/'+scene.id+'/1280/720.jpg';
        function showImage(src, cacheable) {
            if(!workActive())return;
            var current=new Image();image=current;
            function failed() {
                if(dead || generation!==workGeneration || image!==current)return;
                clearTimeout(imageTimer);current.onload=current.onerror=null;image=null;lastSceneAt=Date.now();
                report('landscape',{ok:false,id:scene.id});
            }
            function apply() {
                if(dead || generation!==workGeneration || image!==current)return;
                if(document.hidden){current.onload=current.onerror=null;image=null;return;}
                if(interacting()){applyTimer=setTimeout(apply,500);return;}
                present(src,scene,'online');
                if(cacheable)try {localStorage.setItem(sceneKey,JSON.stringify({id:scene.id,data:src}));sceneState.cached=true;} catch(e) {}
                current.onload=current.onerror=null;image=null;report('landscape',{ok:true,id:scene.id});
            }
            current.onload=function () {clearTimeout(imageTimer);apply();};
            current.onerror=failed;imageTimer=setTimeout(failed,18000);current.src=src;
        }
        // Read the already-compressed JPEG asynchronously. Canvas JPEG encoding
        // used to block this TV's UI thread on every downloaded scene.
        if(typeof FileReader==='undefined'){showImage(url,false);return;}
        var xhr=new XMLHttpRequest();sceneRequest=xhr;
        function fallback() {if(!workActive())return;sceneRequest=null;sceneReader=null;showImage(url,false);}
        try {
            xhr.open('GET',url,true);xhr.responseType='blob';xhr.timeout=18000;
            xhr.onload=function () {
                if(!workActive())return;sceneRequest=null;
                if(xhr.status!==200 || !xhr.response || xhr.response.size>650000){fallback();return;}
                var reader=new FileReader();sceneReader=reader;
                reader.onload=function () {if(!workActive())return;sceneReader=null;showImage(reader.result,true);};
                reader.onerror=fallback;reader.readAsDataURL(xhr.response);
            };
            xhr.onerror=xhr.ontimeout=fallback;xhr.send();
        } catch(e) {fallback();}
    }
    try {var saved=prayerEnabled && JSON.parse(localStorage.getItem(prayerKey));if(saved && saved.months){cache=saved;prayerState='saved';}} catch(e) {}
    try {
        var savedScene=JSON.parse(localStorage.getItem(sceneKey)), scene=savedScene && scenes.filter(function (s) {return s.id===savedScene.id;})[0];
        if(scene && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(savedScene.data) && savedScene.data.length<900000){present(savedScene.data,scene,'saved');sceneState.cached=true;}
    } catch(e) {}
    function cancelWork() {
        // Detach callbacks before abort: an abort must not trigger a fallback
        // download, update storage, or delay the next visible-page retry.
        workGeneration++;
        Object.keys(pending).forEach(function (month) {if(pending[month])delete attempts[month];});pending={};
        requests.forEach(function (xhr) {xhr.onload=xhr.onerror=xhr.ontimeout=null;xhr.abort();});requests=[];
        if(sceneRequest){sceneRequest.onload=sceneRequest.onerror=sceneRequest.ontimeout=null;sceneRequest.abort();sceneRequest=null;}
        if(sceneReader){sceneReader.onload=sceneReader.onerror=null;if(sceneReader.readyState===1)sceneReader.abort();sceneReader=null;}
        if(image){image.onload=image.onerror=null;image.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';image=null;}
        clearTimeout(imageTimer);clearTimeout(applyTimer);clearTimeout(sceneCleanup);
        document.getElementById(activeScene===0?'scene-b':'scene-a').style.backgroundImage='none';
    }
    var tasks=[{run:function () {if(Date.now()-lastSceneAt>=scenePeriod)loadScene();},delay:10000}];
    if(prayerEnabled)tasks.push({run:refreshPrayers,delay:30000});
    var periodic=new HomeIntervals(tasks);
    function visible() {
        if(dead)return;
        if(document.hidden){cancelWork();return;}
        refreshPrayers();if(previousId===null || Date.now()-lastSceneAt>=scenePeriod)loadScene();
    }
    document.addEventListener('visibilitychange',visible);
    visible();
    return {busy:interacting,newScene:function () {loadScene(true);},inspect:function () {return {activity:{timers:periodic.count(),pendingCalendars:requests.length,scenePending:!!(sceneRequest || sceneReader || image)},background:sceneState,prayers:{state:prayerState,date:HomeData.dateKey(Date.now()),today:readDays()[HomeData.dateKey(Date.now())] || null}};},destroy:function () {
        dead=true;periodic.destroy();cancelWork();document.removeEventListener('keydown',touch,true);
        document.removeEventListener('visibilitychange',visible);
    }};
}

/* Home UI */
(function () {
    if (window.HomeApp) window.HomeApp.destroy();
    var catalog = HomeTV.live ? HomeTV.installedApps() : [
        {id:"youtube",name:"YouTube",symbol:"▶",style:"youtube"},
        {id:"netflix",name:"Netflix",symbol:"N",style:"netflix"},
        {id:"app:example",name:"Example app",symbol:"E",style:"installed"},
        {id:"SmartTVHome",name:"Smart TV",symbol:"S",style:"SmartTVHome"},
        {id:"appGallery",name:"App Gallery",symbol:"A",style:"appGallery"},
        {id:"OpenInternet",name:"Internet browser",symbol:"◎",style:"OpenInternet"}
    ];
    var destroyed=false, appRequest=null, allSaved=null, lastAppRefresh=0, appSignature=JSON.stringify(catalog), appRefreshGeneration=0;
    var performanceStats={keys:0,keyMaxMs:0,sourceLastMs:0,sourceMaxMs:0};
    var key = "compact-home.favourites.v1", favourites = ["youtube", "netflix"], dialog = null, previousFocus = null;
    var connected = [], sourceSignature = null, lastSourceRefresh = 0, noticeTimer = null;
    var overlay = document.getElementById("overlay"), options = document.getElementById("dialog-options");
    try {
        var saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved)) {allSaved=saved; favourites = saved.filter(function (id, i) {
            return saved.indexOf(id) === i && catalog.some(function (app) {return app.id === id;});
        });}
    } catch (e) {}
    function notify(message) {
        document.getElementById("notice").textContent = message;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(function () {document.getElementById("notice").textContent = '';}, 7000);
    }
    function attempt(action) { try { action(); } catch (error) { document.body.classList.remove("leaving"); notify(error.message || "The TV command could not be completed."); } }
    function button(text, action) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = text;
        b.addEventListener("click", action); return b;
    }
    function getApp(id) { return catalog.filter(function (app) {return app.id === id;})[0]; }
    function save() { try { localStorage.setItem(key, JSON.stringify(favourites)); } catch (e) { notify("Favourites could not be saved on this device."); } }
    function renderApps() {
        var row = document.getElementById("apps"); row.textContent = "";
        favourites.forEach(function (id) {
            var app = getApp(id), b = button("", function () { attempt(function () { HomeTV.app(id); }); });
            if (!app) return;
            // Native recommendation callbacks delete .netflix globally. Keep
            // our visual classes separate from stock selectors and launch IDs.
            b.setAttribute("data-app",id); b.className = "app-card home-app-" + app.style; b.setAttribute("data-row", "1");
            var symbol = document.createElement("span"); symbol.className = "symbol"; symbol.textContent = app.symbol;
            var name = document.createElement("span"); name.className = "app-name"; name.textContent = app.name; b.appendChild(symbol);
            if (app.icon && app.style === 'installed') {
                var img=document.createElement('img');img.className='app-icon';img.alt='';img.hidden=true;
                img.onload=function () {symbol.hidden=true;img.hidden=false;};img.onerror=function () {img.hidden=true;symbol.hidden=false;};img.src=app.icon;b.appendChild(img);
            }
            b.appendChild(name); row.appendChild(b);
        });
        var more = button("", function () {customize();}); more.className = "app-card more"; more.setAttribute("data-row", "1");
        var icon = document.createElement("span"); icon.className = "symbol"; icon.textContent = "+";
        var label = document.createElement("span"); label.className = "app-name"; label.textContent = "Add apps"; more.appendChild(icon); more.appendChild(label); row.appendChild(more);
        document.getElementById("app-count").textContent=catalog.length+" installed apps";
    }
    function refreshDevices(force) {
        if (document.hidden || (!force && (Date.now()-lastSourceRefresh<30000 || (atmosphere && atmosphere.busy())))) return;
        lastSourceRefresh = Date.now();
        var list = [], error = false;
        try {
            list = HomeTV.live ? HomeTV.connectedInputs() : [
                {id:'6', name:'Streaming box', port:'HDMI 3 / MHL', kind:'hdmi', active:false}
            ];
        } catch (e) {error = true;}
        performanceStats.sourceLastMs=Date.now()-lastSourceRefresh;
        performanceStats.sourceMaxMs=Math.max(performanceStats.sourceMaxMs,performanceStats.sourceLastMs);
        var signature = JSON.stringify({list:list, error:error});
        if (signature === sourceSignature) return;
        sourceSignature = signature; connected = list;
        var row = document.getElementById('devices'), active = document.activeElement;
        var focusedId = active && active.getAttribute('data-source');
        row.textContent = '';
        list.forEach(function (item) {
            var b = button('', function () {attempt(function () {HomeTV.source(item.id);});});
            b.className = 'device-card glass'; b.setAttribute('data-row','2'); b.setAttribute('data-source',item.id);
            var icon = document.createElement('span'); icon.className = 'device-icon'; icon.setAttribute('aria-hidden','true');
            var copy = document.createElement('span'); copy.className = 'device-copy';
            var name = document.createElement('span'); name.className = 'device-name'; name.textContent = item.name;
            var meta = document.createElement('span'); meta.className = 'device-meta';
            var dot = document.createElement('span'); dot.className = 'connection-dot'; meta.appendChild(dot);
            meta.appendChild(document.createTextNode(item.port + (item.active ? ' · Current' : '')));
            copy.appendChild(name); copy.appendChild(meta); b.appendChild(icon); b.appendChild(copy); row.appendChild(b);
        });
        document.getElementById('device-count').textContent = String(list.length);
        document.getElementById('device-status').textContent = HomeTV.live ? 'Detected by your TV' : 'Preview device';
        var empty = document.getElementById('devices-empty'); empty.hidden = list.length > 0;
        empty.textContent = error ? 'Device detection is unavailable. You can still use All sources.' : 'No devices detected. Switch on your device, or open All sources.';
        if (focusedId) {
            var next = Array.prototype.filter.call(row.querySelectorAll('button'), function (b) {return b.getAttribute('data-source') === focusedId;})[0];
            (next || row.querySelector('button') || document.querySelector('[data-action="inputs"]')).focus();
        }
    }
    function openDialog(title, hint, type) {
        previousFocus = document.activeElement; dialog = type;
        document.getElementById("dialog-title").textContent = title;
        document.getElementById("dialog-hint").textContent = hint; options.textContent = ""; overlay.hidden = false;
    }
    function addOption(label, callback, id) {
        var b = button(label, callback); b.className = "option";
        if (id) b.setAttribute("data-id", id); options.appendChild(b); return b;
    }
    function focusFirst() { var first = options.querySelector("button"); if (first) first.focus(); }
    function closeDialog() { overlay.hidden = true; dialog = null; if (previousFocus && document.body.contains(previousFocus)) previousFocus.focus(); else document.querySelector("#apps button").focus(); }
    function refreshApps(force) {
        if (!HomeTV.live || document.hidden || appRequest || destroyed || (!force && Date.now()-lastAppRefresh<60000)) return;
        lastAppRefresh=Date.now();
        var generation=appRefreshGeneration;
        try {appRequest=HomeTV.refreshApps(function (list) {
            if(destroyed || document.hidden || generation!==appRefreshGeneration)return;
            appRequest=null;if (!list) return;
            var signature=JSON.stringify(list);if(signature===appSignature)return;appSignature=signature;
            var active=document.activeElement, focused=active && active.getAttribute('data-app');
            catalog=list;
            favourites=(allSaved || favourites).filter(function (id,i,array) {return array.indexOf(id)===i && !!getApp(id);});allSaved=null;
            renderApps();
            if(dialog==='customize')customize(active && active.getAttribute('data-id'));
            else if(focused) {var found=Array.prototype.filter.call(document.querySelectorAll('#apps button'),function (b) {return b.getAttribute('data-app')===focused;})[0];(found || document.querySelector('#apps button')).focus();}
            if(window.NativeHome)window.NativeHome.report({event:'installed-apps',names:catalog.map(function (a) {return a.name;})});
        });} catch(e) {appRequest=null;}
    }
    function customize(focusId) {
        refreshApps(false);
        if (dialog !== "customize") openDialog("Your app library", "All installed apps. OK adds or hides a favourite. Left / Right reorders your favourites.", "customize");
        options.textContent = "";
        var order = favourites.concat(catalog.map(function (app) {return app.id;}).filter(function (id) {return favourites.indexOf(id) < 0;}));
        order.forEach(function (id) {
            var selected = favourites.indexOf(id) >= 0;
            var b = addOption((selected ? "✓  " : "+  ") + getApp(id).name, function () {
                if (favourites.indexOf(id) >= 0) favourites.splice(favourites.indexOf(id), 1); else favourites.push(id);
                allSaved=null; save(); renderApps(); customize(id);
            }, id);
            b.setAttribute("aria-pressed", String(selected));
        });
        var focusButton=Array.prototype.filter.call(options.querySelectorAll('button'),function (b) {return b.getAttribute('data-id')===focusId;})[0];
        if (focusButton) focusButton.focus(); else focusFirst();
    }
    function showInputs() {
        var list;
        if (HomeTV.live) { try {list = HomeTV.inputs();} catch(e) {notify(e.message);return;} }
        else list = [{id:"1",name:"TV"},{id:"4",name:"HDMI 1"},{id:"5",name:"HDMI 2"},{id:"6",name:"HDMI 3"}];
        openDialog("All sources", HomeTV.live ? "Every input on your TV. Detected devices appear on Home." : "Preview inputs. No source changes are sent to the TV.", "sources");
        list.forEach(function (item) {
            var device = connected.filter(function (d) {return d.id === item.id;})[0];
            addOption(device ? device.name + ' · ' + device.port : item.name, function () {attempt(function () {HomeTV.source(item.id);});});
        }); focusFirst();
    }
    document.getElementById("customize").addEventListener("click", function () {customize();});
    Array.prototype.forEach.call(document.querySelectorAll("[data-action]"), function (b) {
        b.addEventListener("click", function () {
            var action = b.getAttribute("data-action");
            if (action === "inputs") showInputs();
            else attempt(function () {if (action === "watch") HomeTV.source("1"); else HomeTV.settings();});
        });
    });
    function handleKey(event) {
        var code = event.which || event.keyCode, active = document.activeElement;
        if ([8,27,461].indexOf(code) >= 0) {
            event.preventDefault(); if (dialog) closeDialog(); else if (HomeTV.live) attempt(function () {HomeTV.back();}); else notify("Preview only. This page is not the TV's default Home screen."); return;
        }
        if (code === 13 || code === 14) {event.preventDefault(); if (!event.repeat && active && active.tagName === "BUTTON") active.click();return;}
        if ([37,38,39,40].indexOf(code) < 0) {HomeTV.systemKey(code);return;}
        event.preventDefault();
        if (dialog) {
            var buttons = Array.prototype.slice.call(options.querySelectorAll("button")), index = buttons.indexOf(active);
            if ((code === 38 || code === 40) && buttons.length) buttons[Math.max(0,Math.min(buttons.length-1,index+(code===38?-1:1)))].focus();
            else if (dialog === "customize" && active) {
                var id = active.getAttribute("data-id"), pos = favourites.indexOf(id), next = pos + (code===37?-1:1);
                if (pos >= 0 && next >= 0 && next < favourites.length) {favourites.splice(pos,1);favourites.splice(next,0,id);save();renderApps();customize(id);}
            }
            return;
        }
        if (!active || !active.hasAttribute("data-row")) {document.querySelector("#apps button").focus();return;}
        var row = Number(active.getAttribute("data-row"));
        var peers = Array.prototype.slice.call(document.querySelectorAll('[data-row="' + row + '"]'));
        if (code === 37 || code === 39) peers[Math.max(0,Math.min(peers.length-1,peers.indexOf(active)+(code===37?-1:1)))].focus();
        else {
            var nextRow = row + (code===38?-1:1), rect = active.getBoundingClientRect(), center = rect.left+rect.width/2;
            var candidates = Array.prototype.slice.call(document.querySelectorAll('[data-row="' + nextRow + '"]'));
            while (!candidates.length && nextRow >= 0 && nextRow <= 3) {
                nextRow += code === 38 ? -1 : 1;
                candidates = Array.prototype.slice.call(document.querySelectorAll('[data-row="' + nextRow + '"]'));
            }
            var closest=null, distance=Infinity;
            candidates.forEach(function (b) {var r=b.getBoundingClientRect(), d=Math.abs(r.left+r.width/2-center);if(d<distance){closest=b;distance=d;}});
            if (closest) closest.focus();
        }
    }
    function onKey(event) {
        var start=Date.now();try {handleKey(event);} finally {performanceStats.keys++;performanceStats.keyMaxMs=Math.max(performanceStats.keyMaxMs,Date.now()-start);}
    }
    document.addEventListener("keydown", onKey);
    function clock() {
        var now = HomeData.local(Date.now()), hour = now.getUTCHours(), minute=now.getUTCMinutes();
        document.getElementById("clock").textContent = (hour%12||12)+':'+(minute<10?'0':'')+minute+(hour<12?' AM':' PM');
        document.getElementById('date').textContent = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getUTCDay()]+', '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getUTCMonth()]+' '+now.getUTCDate();
        document.getElementById('greeting').textContent = hour < 5 ? 'WELCOME HOME' : hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
    }
    function fit() { if (!HomeTV.live) document.body.style.transform = "scale(" + Math.min(innerWidth/1920,innerHeight/1080) + ")"; }
    function cancelAppRefresh() {
        appRefreshGeneration++;
        if(appRequest){appRequest.onload=appRequest.onerror=appRequest.ontimeout=null;appRequest.abort();appRequest=null;lastAppRefresh=0;}
    }
    function restore() {
        document.body.classList.remove("leaving");
        if(document.hidden){cancelAppRefresh();return;}
        clock();refreshDevices(false);refreshApps(false);
    }
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("focus", restore); window.addEventListener("resize", fit);
    document.getElementById("mode").textContent = HomeTV.live ? "" : "DESIGN PREVIEW";
    function reveal(event) {
        var b=event.target, row=b.parentNode;
        if(row && (row.id==='apps' || row.id==='devices')) {
            var left=b.offsetLeft-row.offsetLeft, right=left+b.offsetWidth;
            if(left<row.scrollLeft+12)row.scrollLeft=Math.max(0,left-12);
            else if(right>row.scrollLeft+row.clientWidth-12)row.scrollLeft=right-row.clientWidth+12;
        }
    }
    document.addEventListener('focus',reveal,true);
    var atmosphere=new HomeAtmosphere();
    var uiTimers=new HomeIntervals([{run:function () {if(!atmosphere.busy())clock();},delay:30000},{run:function () {refreshDevices(false);},delay:5000}]);
    document.getElementById('change-scene').addEventListener('click',atmosphere.newScene);
    window.HomeApp = {performance:function () {performanceStats.uiTimers=uiTimers.count();return performanceStats;},inspect:atmosphere.inspect,apps:function () {return catalog.map(function (a) {return a.name;});},connected:function () {return connected;}, refreshDevices:refreshDevices, destroy:function () {
        destroyed=true;atmosphere.destroy();uiTimers.destroy();cancelAppRefresh();document.removeEventListener('focus',reveal,true);
        clearTimeout(noticeTimer);
        document.removeEventListener('keydown',onKey); document.removeEventListener('visibilitychange',restore);
        window.removeEventListener('focus',restore); window.removeEventListener('resize',fit);
    }};
    renderApps();clock();refreshDevices(true);refreshApps(true);fit();document.querySelector("#apps button").focus();
    if (HomeTV.live && /[?&]action=source(?:&|$)/.test(location.search)) showInputs();
}());
