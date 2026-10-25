/* Renders the owner's custom UI in the existing SAPHI dashboard. */
(function () {
    var config = window.__nativeHomeConfig;
    var pendingImages = [], pollTimer = null, promotionTimer = null, pollDelay = 3000, disposed = false;
    var promotionCost = {calls:0,lastMs:0,maxMs:0};
    var homePressed = false, homeNavigation = {dismissals:0,repeats:0};
    function report(data) {
        if (pendingImages.length>=8) return;
        var image = new Image();
        pendingImages.push(image);
        var expiry = setTimeout(done,8000);
        function done() {
            clearTimeout(expiry);image.onload=image.onerror=null;
            var i = pendingImages.indexOf(image); if (i >= 0) pendingImages.splice(i, 1);
        }
        image.onload = image.onerror = done;
        image.src = config.base + '/event?data=' + encodeURIComponent(JSON.stringify(data));
    }
    if (location.protocol !== 'file:' || location.pathname !== '/3rd/html5/php/dash/index.html' || typeof TV_JSP !== 'function') {
        report({event:'wrong-context', path:location.pathname, width:innerWidth, bridge:typeof TV_JSP});
        return;
    }
    if (window.NativeHome) window.NativeHome.restore(false);
    // document.open() replaces DOM listeners, but the stock displayTime interval
    // survives. Its stale "Home visible" flag otherwise counts past 120 seconds
    // and closes the native window every second, including after reopening it.
    // Retire that DOM's idle state without cancelling unrelated native timers.
    var stockIdleBefore = {visible:typeof g_iHS_show === 'undefined' ? null : g_iHS_show,
        seconds:typeof g_iHS_freeze_counter === 'undefined' ? null : g_iHS_freeze_counter};
    function retireStockIdle() {
        if (typeof g_iHS_show !== 'undefined') window.g_iHS_show = false;
        if (typeof g_iHS_freeze_counter !== 'undefined') window.g_iHS_freeze_counter = 0;
    }
    retireStockIdle();
    report({event:'stock-idle-retired',previous:stockIdleBefore});
    // Philips renders this promotion in its own native window above the DOM.
    var stockAdFunctions = {};
    ['open_small_Ads_window', 'show_small_Ads_window'].forEach(function (name) {
        stockAdFunctions[name] = window[name];
        window[name] = function () {};
    });
    var adStyleScript = '(function(){if(document.getElementById("compact-home-hide-ad"))return;var s=document.createElement("style");s.id="compact-home-hide-ad";s.textContent="html,body{visibility:hidden!important;background:transparent!important}";(document.head||document.documentElement).appendChild(s);var i=new Image();window.__compactHomeAdReport=i;i.src=' + JSON.stringify(config.base + '/event?data=') + '+encodeURIComponent(JSON.stringify({event:"promotion-content-hidden",path:location.pathname}));}());';
    function hidePromotion(prepare) {
        var start=Date.now();
        try {
            var service = getTvJspService().tvServices;
            // The content script is only needed on entry; the native hide
            // guard remains active without resending that script every second.
            if(prepare)service.advMsg('smallAdv', 'SEND_EVENT ' + adStyleScript);
            service.advMsg('smallAdv', 'HIDE_WIN ');
            if (typeof Ads_STATE_WINDOW_OPEN_HIDE !== 'undefined') window.current_Ads_state = Ads_STATE_WINDOW_OPEN_HIDE;
        } catch (e) {report({event:'promotion-error', message:String(e)});}
        promotionCost.calls++;promotionCost.lastMs=Date.now()-start;promotionCost.maxMs=Math.max(promotionCost.maxMs,promotionCost.lastMs);
    }
    hidePromotion(true);
    function dispatch(code) {
        var doc = document, event = doc.createEvent('Event');
        event.initEvent('keydown', true, true);
        Object.defineProperty(event, 'keyCode', {value:code});
        Object.defineProperty(event, 'which', {value:code});
        doc.dispatchEvent(event);
    }
    function focus() {
        var doc = document, active = doc.activeElement;
        if (!active || active.tagName !== 'BUTTON') {
            var b = doc.querySelector('#apps button'); if (b) b.focus();
        }
    }
    function visibility() {
        retireStockIdle();
        report({event:'visibility', hidden:document.hidden});
        syncPromotionGuard();
        if (!document.hidden) {homePressed=false; hidePromotion(true); setTimeout(focus, 100);}
    }
    function syncPromotionGuard() {
        if(disposed)return;
        if(document.hidden){clearInterval(promotionTimer);promotionTimer=null;}
        else if(promotionTimer===null)promotionTimer=setInterval(function () {if (!document.hidden) hidePromotion();},1000);
    }
    function homeKey(event) {
        // Philips uses MENU (462) for the remote's Home button. The generic
        // procSysKey route opens the dashboard again; stock Home exits instead.
        var code=event.which || event.keyCode;
        if (disposed || code !== 462) return;
        if (event.type === 'keyup') {
            if (!homePressed) return;
            homePressed=false;
        } else {
            if (document.hidden) return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === 'keyup') return;
        if (homePressed || event.repeat) {homeNavigation.repeats++;return;}
        homePressed=true;
        try {
            hidePromotion();
            mtvuiUtil.gotoSysPage('sys_index', true);
            homeNavigation.dismissals++;
            report({event:'home-key',action:'dismiss'});
        } catch(e) {homePressed=false; report({event:'error',action:'home-key',message:String(e)});}
    }
    function inspect() {
        var doc = document, button = doc.activeElement, inputs = [];
        try {inputs = window.HomeTV.inputs();} catch(e) {inputs = [{error:String(e)}];}
        report({event:'inspection', uiVersion:'glass-home-tiles-v3', path:location.pathname, native:window.HomeTV.live,
            width:innerWidth, height:innerHeight, homeWidth:doc.getElementById('home').clientWidth,
            homeHeight:doc.getElementById('home').clientHeight, focused:button ? button.textContent : '',
            dialog:doc.getElementById('overlay').hidden ? null : doc.getElementById('dialog-title').textContent,
            notice:doc.getElementById('notice').textContent,
            inputs:inputs, connectedDevices:window.HomeApp ? window.HomeApp.connected() : [],
            installedApps:window.HomeApp ? window.HomeApp.apps() : [],
            appTiles:Array.prototype.map.call(doc.querySelectorAll('#apps [data-app]'),function (item) {return {id:item.getAttribute('data-app'),name:item.textContent};}),
            atmosphere:window.HomeApp ? window.HomeApp.inspect() : null,
            performance:window.HomeApp ? window.HomeApp.performance() : null,
            promotionCost:promotionCost,
            promotionGuardActive:promotionTimer!==null,
            homeNavigation:homeNavigation,
            stockIdle:{visible:typeof g_iHS_show === 'undefined' ? null : g_iHS_show,
                seconds:typeof g_iHS_freeze_counter === 'undefined' ? null : g_iHS_freeze_counter},
            sceneAnimation:window.getComputedStyle(doc.querySelector('.scene.visible') || doc.querySelector('.scene')).animationName,
            appOptions:Array.prototype.map.call(doc.querySelectorAll('#dialog-options button'),function (item) {return item.textContent;}),
            deviceTiles:Array.prototype.map.call(doc.querySelectorAll('.device-name'),function (item) {return item.textContent;}),
            promotionState:typeof current_Ads_state === 'undefined' ? null : current_Ads_state,
            hidden:document.hidden});
    }
    function show() {
        homePressed=false;
        mtvuiUtil.ctrlWindow(720, 0);
        mtvuiUtil.ctrlWindow(1080, 1);
        mtvuiUtil.setHtmlUIStatus({PARAMETER:{VALUE:JSON.stringify({PageID:'HTML5_UI_PAGE_DASH',Status:'Show',Resolution:'1080P'}),REQUEST:'MODIFY'}});
        hidePromotion(true);
        setTimeout(focus, 200);
    }
    function restore(showStock) {
        disposed = true;
        clearTimeout(pollTimer);
        clearInterval(promotionTimer);
        if (window.HomeApp) window.HomeApp.destroy();
        window.removeEventListener('focus', focus);
        window.removeEventListener('keydown', homeKey, true);
        window.removeEventListener('keyup', homeKey, true);
        document.removeEventListener('visibilitychange', visibility);
        Object.keys(stockAdFunctions).forEach(function (name) {window[name] = stockAdFunctions[name];});
        delete window.NativeHome;
        report({event:'restored'});
        if (showStock !== false) {
            try {getTvJspService().tvServices.advMsg('smallAdv', 'SEND_EVENT var s=document.getElementById("compact-home-hide-ad");if(s)s.parentNode.removeChild(s);');} catch(e) {}
            var backup = localStorage.getItem('compact-home.stock-menu.v1');
            localStorage.removeItem('compact-home.enabled.v1');
            if (backup) {
                var menu = JSON.parse(backup);
                if (!menu || !Array.isArray(menu.item)) throw new Error('Invalid stock menu backup');
                localStorage.setItem('IHSMenuItems', backup);
                if (localStorage.getItem('IHSMenuItems') !== backup) throw new Error('Stock menu restore verification failed');
                window.menu_info_tpv = menu;
            }
            localStorage.removeItem('compact-home.runtime.v1');
            localStorage.removeItem('compact-home.stock-menu.v1');
            report({event:'stock-restored', menuRestored:!!backup});
            setTimeout(function () {window.location.reload();}, 250);
        }
    }
    function command(value) {
        if (!value) return;
        try {
            if (value.action === 'key') dispatch(value.code);
            else if (value.action === 'remote-home') getTvJspService().utility.sendKeyIRRC('MENU');
            else if (value.action === 'show') {
                show();
            } else if (value.action === 'restore') {restore(true);return;}
            else if (value.action === 'inspect') inspect();
            report({event:'command', id:value.id, action:value.action});
        } catch(e) {report({event:'error', action:value.action, message:String(e)});}
    }
    function poll() {
        if (disposed || !window.NativeHome) return;
        var script = document.createElement('script');
        script.src = config.base + '/control.js?t=' + Date.now();
        function complete(ok) {
            if (script.parentNode) script.parentNode.removeChild(script);
            pollDelay=ok?3000:Math.min(pollDelay*2,60000);
            if (!disposed && window.NativeHome) pollTimer = setTimeout(poll, pollDelay);
        }
        script.onload=function () {complete(true);};script.onerror=function () {complete(false);};
        document.head.appendChild(script);
    }
    window.NativeHome = {report:report, restore:restore, command:command, inspect:inspect};
    document.open();
    document.write(config.html);
    document.close();
    // The native ad process can show its window after the dashboard's own
    // visibility callback. Keep it hidden while this Home is on screen.
    syncPromotionGuard();
    setTimeout(function () {
        if(disposed)return;
        try { focus(); inspect(); report({event:'ready', native:HomeTV.live, saved:localStorage.getItem('compact-home.enabled.v1')==='1', rendering:'direct-document'}); }
        catch(e) {report({event:'error', message:String(e)});}
    }, 300);
    window.addEventListener('focus', focus);
    // Capture before the UI's document listener to prevent duplicate native
    // navigation/default handling for the same press. No extra polling needed.
    window.addEventListener('keydown', homeKey, true);
    window.addEventListener('keyup', homeKey, true);
    document.addEventListener('visibilitychange', visibility);
    poll();
}());
