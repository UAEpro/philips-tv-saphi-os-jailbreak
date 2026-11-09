/* Minimal, reversible boot hook: suppress EVERY SAPHI home-screen advert.
   Unlike the full custom Home, this does NOT replace the UI or capture remote
   keys for navigation. The stock home stays fully functional and controllable;
   only Philips' native advertisement windows are suppressed.

   Two ads exist on this firmware:
     1. the boot promotion (the "smallAdv" native window that pops shortly
        after the dashboard renders), and
     2. the promotion that re-opens whenever you return to the dashboard with
        the Home/Menu key.
   The original build only killed (1), and only for the first 60s, so (2) came
   back. This version keeps a permanent, lightweight guard, re-hides the instant
   the dash regains focus or any key is pressed, and additionally turns the ad
   off at its source through the native setIhsStatusforAd() call. */
(function () {
    var config = window.__nativeHomeConfig || {};
    function report(data) {
        if (!config.base) return;
        try { var i = new Image(); window.__nhAdReport = i;
            i.src = config.base + '/event?data=' + encodeURIComponent(JSON.stringify(data)); } catch (e) {}
    }
    if (location.protocol !== 'file:' || location.pathname !== '/3rd/html5/php/dash/index.html') {
        report({event: 'wrong-context', path: location.pathname});
        return;
    }
    function service() { return (typeof getTvJspService === 'function') ? getTvJspService() : null; }

    // Native advert windows seen on SAPHI. 'smallAdv' is confirmed on TPM196E;
    // the others are tried defensively and are harmless no-ops if absent.
    var AD_WINDOWS = ['smallAdv', 'bigAdv', 'Adv'];

    // Turn the home-menu ("IHS") advert off at the source. The native bridge
    // exposes setIhsStatusforAd(); best-guess the "disabled" argument across the
    // usual shapes. All guarded: a wrong/absent call is caught and does nothing.
    function disableIhsAd() {
        var s = service(); if (!s) return;
        [false, 0, 'false', 'OFF', 'disable'].forEach(function (v) {
            try { s.setIhsStatusforAd(v); } catch (e) {}
        });
    }
    function hideAd() {
        var s = service(); if (!s) return;
        var tv = s.tvServices || s;
        AD_WINDOWS.forEach(function (w) {
            try { tv.advMsg(w, 'HIDE_WIN '); } catch (e) {}
        });
    }

    // Neutralise the stock functions that re-open the promotion window, so it
    // does not pop back after being hidden. Guarded: only replace real functions.
    try {
        ['open_small_Ads_window', 'show_small_Ads_window',
         'open_big_Ads_window', 'show_big_Ads_window'].forEach(function (name) {
            if (typeof window[name] === 'function') {
                window['__stock_' + name] = window[name];
                window[name] = function () {};
            }
        });
    } catch (e) {}

    disableIhsAd();
    hideAd();

    // Permanent lightweight guard: the native process can re-show the promotion
    // at any time (notably when returning to the dash), so we never stop. One
    // advMsg per second is cheap and keeps every ad window closed for good.
    setInterval(hideAd, 1000);

    // Re-hide the instant the dashboard regains focus or any key is pressed —
    // this catches the Home/Menu promotion before it is visible, rather than
    // waiting up to a second for the interval.
    try {
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) { disableIhsAd(); hideAd(); }
        }, false);
        window.addEventListener('focus', hideAd, false);
        window.addEventListener('keydown', hideAd, true);
    } catch (e) {}

    report({event: 'ready', mode: 'adhide', native: true, path: location.pathname});
}());
