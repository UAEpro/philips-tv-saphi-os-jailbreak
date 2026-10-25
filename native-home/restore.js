/* Recovery also works when the custom dashboard is suspended or unloaded. */
(function () {
    if (location.pathname !== '/3rd/html5/php/dash/index.html') return;
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
    try {getTvJspService().tvServices.advMsg('smallAdv', 'SEND_EVENT var s=document.getElementById("compact-home-hide-ad");if(s)s.parentNode.removeChild(s);');} catch(e) {}
    var image = new Image(); window.__nhRestoreReport = image;
    image.src = window.__nativeHomeRestoreBase + '/event?data=' + encodeURIComponent(JSON.stringify({event:'stock-restored', menuRestored:!!backup}));
    setTimeout(function () {window.location.reload();}, 300);
}());
