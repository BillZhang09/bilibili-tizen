/* Preferences that outlive a session. Small enough not to warrant more. */
var Settings = (function () {
    "use strict";
    var KEY = "bili.settings";
    var data = null;

    function load() {
        if (data) { return data; }
        try { data = JSON.parse(localStorage.getItem(KEY) || "{}"); }
        catch (e) { data = {}; }
        if (!data || typeof data !== "object" || Array.isArray(data)) { data = {}; }
        return data;
    }

    /* New installations keep the existing 4K default. HDR is an explicit choice;
     * a failed switch must not change either saved preference. */
    var QN_STEPS = [125, 120, 112, 80, 64, 32];
    var PLAY_QNS = [16, 32, 64, 74, 80, 112, 116, 120, 125];


    return {
        qnSteps: function () { return QN_STEPS.slice(); },
        qnCap: function () {
            var q = Number(this.get("maxQn", 120));
            return QN_STEPS.indexOf(q) >= 0 ? q : 120;
        },
        qualityPreference: function () {
            var q = Number(this.get("preferredQn", 0));
            return PLAY_QNS.indexOf(q) >= 0 ? q : 0;
        },
        /* Missing tiers change this video's result, never the saved preference. */
        resolveQuality: function (available, preference, cap) {
            var q = preference === undefined ? this.qualityPreference() : preference;
            var limit = cap || Settings.qnCap();
            var ids = available.filter(function (id) { return id <= limit; })
                .sort(function (a, b) { return a - b; });
            if (!ids.length) { return 0; }
            if (!q) { return ids[ids.length - 1]; }
            for (var i = ids.length - 1; i >= 0; i--) { if (ids[i] <= q) { return ids[i]; } }
            return ids[0];
        },
        preferAtmos: function () { return this.get("preferAtmos", true) !== false; },
        get: function (k, fallback) {
            var v = load()[k];
            return v === undefined ? fallback : v;
        },
        set: function (k, v) {
            load()[k] = v;
            try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
        }
    };
})();
