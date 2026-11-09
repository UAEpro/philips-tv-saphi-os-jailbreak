/* Recovery also works when the custom dashboard is suspended or unloaded. */
(function () {
    if (location.pathname !== '/3rd/html5/php/dash/index.html'
        && location.pathname !== '/3rd/html5/php/ContentBrowser/content_browser.html') return;
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
    try {var _s=getTvJspService();(_s.tvServices||_s).advMsg('smallAdv', 'SEND_EVENT var s=document.getElementById("compact-home-hide-ad");if(s)s.parentNode.removeChild(s);');} catch(e) {}
    // Re-enable the home-menu ad that adhide turned off, so restore truly
    // returns the set to stock. Best-guess the "enabled" argument; all guarded.
    try {var _a=getTvJspService();[true,1,'true','ON','enable'].forEach(function(v){try{_a.setIhsStatusforAd(v);}catch(e){}});} catch(e) {}
    var image = new Image(); window.__nhRestoreReport = image;
    image.src = window.__nativeHomeRestoreBase + '/event?data=' + encodeURIComponent(JSON.stringify({event:'stock-restored', menuRestored:!!backup}));
    setTimeout(function () {window.location.reload();}, 300);
}());
