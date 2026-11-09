/* Firmware compatibility shim.

   The 65PUT6703/56 (TPM186E) exposes the native bridge namespaced:
     getTvJspService().utility.X, .tvServices.Y, .mmpServices.Z
   and a global TV_JSP function. The 55OLED754/12 (TPM196E, MediaTek MT5806)
   exposes the SAME methods flat, directly on getTvJspService(), with no TV_JSP
   global. This shim makes a flat service look namespaced so the rest of the
   (firmware-agnostic) code runs unchanged on both. It is additive and idempotent:
   on namespaced firmware it detects the namespaces are already present and does
   nothing. */
(function (scope) {
    scope = scope || window;
    try {
        if (typeof scope.getTvJspService !== 'function') return false;
        var raw = scope.getTvJspService();
        if (!raw) return false;
        // Point the namespaces at the flat service when they are absent. The
        // service is a singleton, so these aliases persist for every later
        // getTvJspService() call in this window.
        if (!raw.utility) { try { raw.utility = raw; } catch (e) {} }
        if (!raw.tvServices) { try { raw.tvServices = raw; } catch (e) {} }
        if (!raw.mmpServices) { try { raw.mmpServices = raw; } catch (e) {} }
        // Several "are we on the live dashboard" checks test `typeof TV_JSP ===
        // 'function'`. On flat firmware TV_JSP is undefined; alias it to the
        // service accessor so those checks pass without weakening them.
        if (typeof scope.TV_JSP !== 'function') {
            try { scope.TV_JSP = scope.getTvJspService; } catch (e) {}
        }
        return true;
    } catch (e) { return false; }
}(typeof window !== 'undefined' ? window : this));
