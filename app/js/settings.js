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

    function language(track) {
        var lang = String((track || {}).lan || "").toLowerCase().replace(/^ai-/, "");
        /* Bilibili calls AI simplified Chinese ai-zh, but human tracks zh-CN. */
        if (/^(zh|zh-cn|zh-sg|zh-hans)$/.test(lang)) { return "zh-hans"; }
        if (/^(zh-tw|zh-hk|zh-hant)$/.test(lang)) { return "zh-hant"; }
        if (lang === "en" || lang.indexOf("en-") === 0) { return "en"; }
        return lang;
    }

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
        subtitleLanguage: function () {
            var lang = this.get("subtitleLanguage", "");
            return typeof lang === "string" && /^[a-z0-9-]{1,32}$/.test(lang) ? language({ lan: lang }) : "";
        },
        subtitleLanguageOf: language,
        chooseSubtitle: function (tracks) {
            var preferred = this.subtitleLanguage(), best = null, score = -1, bestAI = false;
            for (var i = 0; i < tracks.length; i++) {
                var t = tracks[i];
                if (!t || !t.subtitle_url) { continue; }
                var lang = language(t), ai = !!t.ai_type || /^ai-/.test(t.lan || "");
                /* Keep the original fallback language: human Chinese, AI
                 * Chinese, then the first other language. Human preference
                 * must not promote a different non-Chinese language. */
                var rank = preferred && lang === preferred ? 100 : /^zh/.test(lang) ? (ai ? 2 : 3) : 1;
                if (rank > score || (rank === score && lang === language(best) && bestAI && !ai)) {
                    best = t; score = rank; bestAI = ai;
                }
            }
            return best;
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
