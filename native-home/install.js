/* Save the owner's Home UI and a reversible launcher hook in browser storage.
   The stock firmware files and app installation state are never modified. */
(function () {
    var config = window.__nativeHomeInstall;
    if (location.protocol !== 'file:' || location.pathname !== '/3rd/html5/php/dash/index.html') return;
    var prefix = 'compact-home.', backupKey = prefix + 'stock-menu.v1';
    function report(data) {
        var image = new Image(); window.__nhInstallReport = image;
        image.src = config.base + '/event?data=' + encodeURIComponent(JSON.stringify(data));
    }
    try {
        var raw = localStorage.getItem('IHSMenuItems');
        var menu = JSON.parse(raw), patched = 0;
        if (!menu || !Array.isArray(menu.item)) throw new Error('Stock launcher configuration is unavailable.');
        var backup = localStorage.getItem(backupKey) || raw;
        // Mask only the stock document while the current rendering task finishes.
        // A zero-delay handoff avoids a visible stock menu without re-entering its
        // renderer. Always release the mask if the saved runtime fails to load.
        var handler = "this.onload=null;this.onerror=null;if(localStorage.getItem('compact-home.enabled.v1')==='1'&&!window.__nhScheduled&&localStorage.getItem('compact-home.runtime.v1')){window.__nhScheduled=true;var root=document.documentElement,oldVisibility=root.style.visibility;root.style.visibility='hidden';try{getTvJspService().tvServices.advMsg('smallAdv','HIDE_WIN ')}catch(e){};setTimeout(function(){try{(0,eval)(localStorage.getItem('compact-home.runtime.v1')||'')}catch(e){window.__nhScheduled=false}finally{root.style.visibility=oldVisibility}},0)}";
        menu.item.forEach(function (row) {
            (row.row2 || []).forEach(function (item) {
                if (item && item.itemName === 'Reorder' && typeof item.itemImg === 'string') {
                    var original = item.itemImg.split('" data-compact-home=')[0];
                    item.itemImg = original + '" data-compact-home="1" onload="' + handler + '" onerror="' + handler;
                    patched++;
                }
            });
        });
        if (patched < 2) throw new Error('Expected launcher anchors were not found.');
        var request = new XMLHttpRequest();
        request.open('POST', config.base + '/backup', true);
        request.setRequestHeader('Content-Type', 'text/plain');
        request.onerror = function () {report({event:'install-error', message:'Backup could not reach the computer. No hook installed.'});};
        request.onload = function () {
            if (request.status !== 200) {report({event:'install-error', message:'Backup was not accepted. No hook installed.'});return;}
            try {
                localStorage.setItem(backupKey, backup);
                localStorage.setItem(prefix + 'runtime.v1', config.runtime);
                localStorage.setItem(prefix + 'enabled.v1', '1');
                localStorage.setItem('IHSMenuItems', JSON.stringify(menu));
                // Keep the stock launcher's own subsequent saves consistent.
                window.menu_info_tpv = menu;
                if (localStorage.getItem(prefix+'runtime.v1') !== config.runtime) throw new Error('Runtime storage verification failed.');
                report({event:'installed', anchors:patched, runtimeBytes:config.runtime.length, backupBytes:backup.length, storage:'localStorage'});
                (0,eval)(config.runtime);
            } catch(e) {
                localStorage.removeItem(prefix+'enabled.v1');
                localStorage.setItem('IHSMenuItems', backup);
                report({event:'install-error', message:String(e)});
            }
        };
        request.send(backup);
    } catch(e) {report({event:'install-error', message:String(e)});}
}());
