/* Calls and parameters come from this firmware's native dashboard.
   The live TV has verified YouTube launch and input enumeration. */
var HomeTV = (function () {
    var host = window, session = !!window.NativeHome;
    try {
        if (window.parent !== window && window.parent.NativeHome &&
            window.parent.location.protocol === "file:" &&
            window.parent.location.pathname === "/3rd/html5/php/dash/index.html") {
            host = window.parent; session = true;
        }
    } catch (e) {}
    var live = host.location.protocol === "file:" && host.location.pathname === "/3rd/html5/php/dash/index.html" && typeof host.TV_JSP === "function";
    var inputs = null, installed = {}, registryLoaded = false;
    var builtin = {'4823':'youtube','5048':'netflix','5443':'OpenInternet','20004340':'OpenInternet',
        '3059':'appGallery','20004337':'appGallery','20004317':'SmartTVHome','20004342':'SmartTVHome',
        '5446':'amazon','20004366':'amazon','20004333':'CuTV','20004318':'VOD'};
    function decode(value) {try {return decodeURI(value || '');} catch(e) {return value || '';}}
    function readApps(rows, authoritative) {
        var next = authoritative ? {} : installed;
        (rows || []).forEach(function (item) {
            var appID = decode(item.applicationId || item.appID), name = decode(item.applicationName || item.itemName);
            if (!appID || !name) return;
            var nativeName = builtin[appID.split('_')[0]], id = nativeName || 'app:' + appID;
            var icon = item.applicationIconURI || item.itemImg || '';
            if (icon.indexOf('/') === 0) icon = 'file://' + icon;
            if (!/^(file:\/\/\/3rd(?:_rw)?\/|https?:\/\/)/.test(icon) || /["<>]/.test(icon)) icon = '';
            next[id] = {id:id, name:name, appID:appID, nativeName:nativeName || 'Null',
                url:item.applicationURL || item.onEnterNettvURL || 'Null', icon:icon,
                symbol:id==='youtube' ? '▶' : id==='netflix' ? 'N' : id==='OpenInternet' ? '◎' : name.charAt(0),
                style:nativeName || 'installed'};
        });
        installed = next;
    }
    function appList() {
        requireNative();
        try { if (!registryLoaded) {
            var menu = JSON.parse(host.localStorage.getItem('IHSMenuItems'));
            (menu.item || []).filter(function (row) {return row.row1==='Apps';}).forEach(function (row) {readApps(row.row2, false);});
        }} catch(e) {}
        return Object.keys(installed).map(function (id) {
            var item = installed[id];
            return {id:id,name:item.name,icon:item.icon,symbol:item.symbol,style:item.style};
        });
    }
    function refreshApps(callback) {
        requireNative();
        var xhr = new XMLHttpRequest();
        xhr.open('GET','file:///3rd_rw/html5/dash/HomeMenu/current/app/appsInstalled.txt',true);
        xhr.timeout = 7000;
        xhr.onload = function () {
            try {
                var data = JSON.parse(xhr.responseText);
                if (!Array.isArray(data.applicationInstalled)) throw new Error('Invalid app registry');
                readApps(data.applicationInstalled,true);
                registryLoaded = true;
                // Return the authoritative file without re-merging stale menu entries.
                callback(Object.keys(installed).map(function (id) {
                    var a=installed[id];return {id:id,name:a.name,icon:a.icon,symbol:a.symbol,style:a.style};
                }));
            } catch(e) {callback(null);}
        };
        xhr.onerror = xhr.ontimeout = function () {callback(null);};
        xhr.send();
        return xhr;
    }
    function requireNative() { if (!live) throw new Error("Preview only. No TV command was sent."); }
    function report(action, value) { if (session) host.NativeHome.report({event:"action", action:action, value:value}); }
    function leave() { host.mtvuiUtil.gotoSysPage("sys_index", true); }
    function connectedInputs() {
        requireNative();
        inputs = inputs || new host.InputSource();
        var list = inputs.getInputList(), result = [], seen = {};
        var cec = [], cecFailed = false;
        try {cec = host.ipsCECObj.getConnectedDeviceList() || [];} catch(e) {cecFailed = true;}
        cec.forEach(function (device) {
            var match = list.filter(function (item) {
                var port = /^HDMI\s*(\d+)/i.exec(item.oName || item.name);
                return port && Number(port[1]) === Number(device.idx);
            })[0];
            if (!match || seen[match.id]) return;
            seen[match.id] = true;
            var name = String(device.osd_name || '').replace(/^\s+|\s+$/g, '');
            if (/^(unknown(?: device)?|undefined|null)$/i.test(name)) name = '';
            result.push({id:match.id, name:match.aName || name || match.name,
                port:match.oName || match.name, kind:'hdmi', active:!!match.active});
        });
        // A non-CEC device can still be detected on the active input when the
        // native signal-loss flag explicitly reports a valid signal. Never
        // treat a selected port alone, a null result, or an exception as proof.
        try {
            var selected = list.filter(function (item) {return item.active && /^HDMI\s*\d/i.test(item.oName || item.name);})[0];
            var signal = selected && !seen[selected.id] && new host.MtvObj().acfgGetConfigValue('g_custom_base__signal_loss');
            if (selected && !seen[selected.id] && (signal === 0 || signal === false)) {
                result.push({id:selected.id,name:selected.aName || selected.name,
                    port:selected.oName || selected.name,kind:'hdmi',active:true});
            }
        } catch(e) {}
        // The native mount list contains only USB media currently present.
        try {
            var service = host.getTvJspService().mmpServices;
            var mounted = service && service.getMountPointList('');
            var mounts = mounted ? JSON.parse(mounted).ITEMS : [];
            if (mounts && mounts.length) {
                var names = mounts.filter(function (item) {return /^\/mnt\/usb\//.test(item.PATH || '');})
                    .map(function (item) {return item.LABEL || 'USB storage';});
                if (names.length) result.push({id:'1_7', name:names.join(' · '), port:'USB', kind:'usb', active:false});
            }
        } catch (e) {}
        if (cecFailed && !result.length) throw new Error('Device detection is unavailable.');
        return result;
    }
    return {
        live: live,
        session: session,
        connectedInputs: connectedInputs,
        installedApps: appList,
        refreshApps: refreshApps,
        app: function (id) {
            requireNative();
            if (!Object.keys(installed).length) appList();
            var app = installed[id];
            if (!app) throw new Error('This app is not in the TV’s installed app list.');
            var url = app.nativeName === 'Null' ? app.url : 'Null';
            if (url !== 'Null' && !/^https?:\/\//.test(url)) throw new Error('This app uses an unsupported launch method.');
            leave();
            host.getTvJspService().tvServices.StartSmartTVApp(0, app.nativeName === 'Null' ? app.appID : 'Null', url, app.nativeName);
            report("app", id);
        },
        settings: function () {
            requireNative();
            host.getTvJspService().utility.startNativeApp(JSON.stringify({PARAMETER:{VALUE:"AllSettings",REQUEST:"MODIFY"}}));
            leave();
            report("settings", true);
        },
        inputs: function () {
            requireNative();
            inputs = inputs || new host.InputSource();
            var list = inputs.getInputList();
            if (!list || !list.length) throw new Error("The TV did not return its sources.");
            return list.map(function (item) { return {id:item.id, name:item.name}; });
        },
        source: function (id) {
            requireNative();
            inputs = inputs || new host.InputSource();
            if (id === "1") {
                var television = inputs.getInputList().filter(function (item) {return /^1_[123]$/.test(item.id);});
                if (television.length) id = television[0].id;
            }
            if (inputs.checkTimeShift()) throw new Error("Stop time-shift playback on the TV before changing source.");
            var result = inputs.setInputSource(id);
            if (result === false || result === null) throw new Error("The TV did not accept the source change.");
            leave();
            report("source", id);
        },
        back: function () { requireNative(); leave(); },
        systemKey: function (key) { if (live) return host.mtvuiUtil.procSysKey(key); }
    };
}());
