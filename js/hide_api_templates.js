import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * HideApiTemplates
 *
 * Hides the ComfyUI "partner" / API surface from the UI:
 *   1. Partner (paid) workflow templates   -> Templates menu
 *   2. Partner nodes (Node Library + create-node menu)
 *   3. ComfyUI Cloud sign-in button        -> top bar
 *   4. "User" (My Account) settings section -> Settings dialog
 *
 * Every item is controlled by a user setting, registered in the Settings
 * dialog under "Other" -> "ComfyUI-Hide-API-Templates" (the same place
 * KJNodes, EasyUse & co. register theirs). All defaults are ON, and all can
 * be toggled at runtime without reloading the page:
 *
 *   ComfyUI-Hide-API-Templates.HidePartnerTemplates
 *   ComfyUI-Hide-API-Templates.HidePartnerNodes
 *   ComfyUI-Hide-API-Templates.HideSignInButton
 *   ComfyUI-Hide-API-Templates.HideUserSettings
 *
 * Partner nodes are identified by category: "partner/..." (server partner API
 * nodes) and "comfy cloud/..." (frontend Comfy Cloud nodes).
 *
 * Offline-aware: the extension reads the `extension.hide_api_templates.
 * offline_mode` feature flag (set by __init__.py from the server's --offline
 * argument). When --offline is active, ComfyUI does not register the partner
 * API nodes at all, so the client-side node filtering is skipped to avoid
 * redundant work. Templates, the sign-in button and the User section are
 * handled in both modes, because --offline does not hide those on its own.
 */

// Categories that identify a "partner" / Comfy Cloud node.
const PARTNER_CATEGORIES = ["partner/", "comfy cloud/"];
const LOGIN_BUTTON_TESTID = "login-button";
const USER_SETTINGS_NAV_ID = "user";
// The workflow-tab context menu promo item ("Deploy to Comfy API", shipped
// with a NEW badge). It is rendered as a DIV with role="menuitem"; text match
// is stable across builds because the label comes from the en locale string
// (contextMenu.deployToComfyApi).
const DEPLOY_MENU_TEXT = /deploy to comfy api/i;

// User settings (Settings dialog -> "Other" -> "ComfyUI-Hide-API-Templates").
const SETTINGS = {
    templates: "ComfyUI-Hide-API-Templates.HidePartnerTemplates",
    nodes: "ComfyUI-Hide-API-Templates.HidePartnerNodes",
    signin: "ComfyUI-Hide-API-Templates.HideSignInButton",
    userSection: "ComfyUI-Hide-API-Templates.HideUserSettings",
    deployApi: "ComfyUI-Hide-API-Templates.HideDeployToApi",
    // Server-side: __init__.py reads this from the persisted settings file at
    // startup to set COMFYUI_DISABLE_PRODUCT_TIPS. No client DOM guard — the
    // banner is a console message, and this toggle only takes effect on
    // restart (it is registered here just so the user has a UI control).
    suppressTips: "ComfyUI-Hide-API-Templates.SuppressProductTips",
};

function isPartnerDef(def) {
    const category = String(def?.category ?? "");
    return PARTNER_CATEGORIES.some((p) => category.startsWith(p));
}

// Read a user setting live. Falls back to true (hide) when the value is
// missing or the settings API is not ready yet, so the defaults hold before
// registration completes and after a page reload.
function getSetting(id) {
    try {
        const v = app.ui?.settings?.getSettingValue?.(id);
        return typeof v === "boolean" ? v : true;
    } catch {
        return true;
    }
}

// --- Settings: register the user toggles --------------------------------------
// Registered in init() (same phase KJNodes / pysssss use). No `category` is
// passed, so the dialog derives the folder from the id prefix and places the
// settings under "Other" -> "ComfyUI-Hide-API-Templates", next to the other
// extensions.
function registerSettings() {
    const entries = [
        [
            SETTINGS.templates,
            "Hide partner templates",
            "Hide partner (API) workflow templates from the template browser.",
        ],
        [
            SETTINGS.nodes,
            "Hide partner nodes",
            "Hide partner (API) nodes from the Node Library and the create-node menu.",
        ],
        [
            SETTINGS.signin,
            "Hide sign-in button",
            "Hide the ComfyUI Cloud sign-in button from the top bar.",
        ],
        [
            SETTINGS.userSection,
            "Hide User settings section",
            "Hide the User (My Account) section from the Settings dialog.",
        ],
        [
            SETTINGS.deployApi,
            "Hide 'Deploy to Comfy API' menu item",
            "Hide the 'Deploy to Comfy API' promo item from the workflow tab context menu.",
        ],
        [
            SETTINGS.suppressTips,
            "Suppress Comfy Org startup banner",
            "Hide the '[INFO] ComfyUI is developed by Comfy Org ... platform.comfy.org/ascii' console banner and the post-job /ascii hints. Takes effect on next ComfyUI restart.",
        ],
    ];

    let tries = 0;
    const attempt = () => {
        tries += 1;
        const add = app.ui?.settings?.addSetting;
        if (typeof add !== "function") {
            // app.ui is not ready yet; retry briefly.
            if (tries < 100) {
                setTimeout(attempt, 100);
            }
            return;
        }
        for (const [id, name, tooltip] of entries) {
            try {
                add.call(app.ui.settings, {
                    id,
                    name,
                    tooltip,
                    type: "boolean",
                    defaultValue: true,
                });
            } catch (e) {
                console.warn("[HideApiTemplates] could not register " + id, e);
            }
        }
    };
    attempt();
}

// --- 0. Offline detection -----------------------------------------------------
// Read the offline_mode flag this extension published via the server feature
// flags (set in __init__.py from the server's --offline argument). Returns
// true when the server runs with --offline (or --disable-partner-nodes /
// --disable-api-nodes).
async function detectOfflineMode() {
    try {
        const res = await fetch("/features", { cache: "no-store" });
        const features = await res.json();
        const ext = features?.extension?.hide_api_templates;
        return !!ext?.offline_mode;
    } catch {
        return false;
    }
}

// --- 1. Templates: drop templates with openSource === false (partner/paid) ---
function hookTemplates() {
    const original = api.getCoreWorkflowTemplates;
    api.getCoreWorkflowTemplates = async function (locale) {
        const result = await original.call(this, locale);
        if (!getSetting(SETTINGS.templates)) {
            return result;
        }
        return result.map((module) => ({
            ...module,
            templates: module.templates.filter((t) => t.openSource !== false),
        }));
    };
}

// --- 2. Nodes: filter partner/* node defs out of /object_info -----------------
// Hook api.fetchApi so every consumer (node defs, node registry, node library)
// receives an object_info payload without partner nodes. Works whether or not
// the server runs with --offline: in offline mode the partner defs are simply
// already absent and nothing is filtered.
function hookPartnerNodes() {
    const originalFetchApi = api.fetchApi.bind(api);
    api.fetchApi = async function (path, options) {
        const res = await originalFetchApi(path, options);
        if (
            typeof path === "string" &&
            path.includes("object_info") &&
            getSetting(SETTINGS.nodes)
        ) {
            const data = await res.json();
            const defs = data && typeof data === "object" && "nodeDefs" in data
                ? data.nodeDefs
                : data;
            let removed = 0;
            const filtered = {};
            for (const [name, def] of Object.entries(defs ?? {})) {
                if (isPartnerDef(def)) {
                    removed += 1;
                    continue;
                }
                filtered[name] = def;
            }
            if (removed > 0) {
                console.info(
                    `[HideApiTemplates] filtered ${removed} partner nodes from object_info`
                );
                return new Response(JSON.stringify(filtered), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }
        return res;
    };
}

// --- 3. Nodes (Node Library): filter partner defs out of the reactive store --
// The Node Library builds its category tree from the Pinia `nodeDef` store
// (`nodeDefsByName`), which is populated at startup and is NOT refreshed from
// the filtered object_info. Removing the partner entries from this reactive
// object updates the Node Library tree (and search) automatically — a clean,
// data-level fix with no DOM churn.
//
// Removed defs are kept in a backup map so the "Hide partner nodes" setting
// can be toggled OFF at runtime and the partner defs are restored; toggling it
// back ON removes them again. The poller stays alive (a few thousand cheap
// string checks every 500 ms) so runtime toggles work in both directions.
function filterNodeLibraryStore() {
    const getStore = () => {
        try {
            const el = document.getElementById("vue-app");
            const pinia =
                el?.__vue_app__?.config?.globalProperties?.$pinia;
            const store = pinia?.state?.value?.nodeDef?.nodeDefsByName;
            return store && typeof store === "object" ? store : null;
        } catch {
            return null;
        }
    };

    // Partner defs removed from the store (name -> def), for restoration.
    const removedDefs = {};

    const apply = () => {
        const store = getStore();
        if (!store) {
            return; // store not available yet
        }
        const keys = Object.keys(store);
        if (keys.length < 50) {
            return; // not populated yet
        }

        if (getSetting(SETTINGS.nodes)) {
            let removed = 0;
            for (const k of keys) {
                if (isPartnerDef(store[k])) {
                    removedDefs[k] = store[k];
                    delete store[k];
                    removed += 1;
                }
            }
            if (removed > 0) {
                console.info(
                    `[HideApiTemplates] filtered ${removed} partner nodes from the Node Library`
                );
            }
        } else {
            let restored = 0;
            for (const k of Object.keys(removedDefs)) {
                if (!(k in store)) {
                    store[k] = removedDefs[k];
                    restored += 1;
                }
            }
            if (restored > 0) {
                console.info(
                    `[HideApiTemplates] restored ${restored} partner nodes to the Node Library`
                );
            }
        }
    };

    setInterval(apply, 500);
}

// --- 4. DOM guards: sign-in button + "User" settings section ------------------
// For the sign-in button the primary path is the server feature flag
// `show_signin_button=false` (set in __init__.py); the DOM guards below are
// the belt-and-braces fallback and also the mechanism that lets the user
// re-enable either element at runtime from the settings.
//
// "User" is a hardcoded nav item of the Settings dialog
// ([data-nav-id="user"]) that opens the My Account panel, so it is hidden
// from the dialog's sidebar via display:none.
function installDomGuards() {
    const loginSelector = `[data-testid="${LOGIN_BUTTON_TESTID}"]`;
    const userSelector = `[data-nav-id="${USER_SETTINGS_NAV_ID}"]`;

    // Debug heartbeat: lets runtime behaviour be inspected from the console
    // (window.__hideApiTemplates) if something misbehaves.
    const dbg = (window.__hideApiTemplates = window.__hideApiTemplates || {
        ticks: 0,
        subscribed: false,
        lastLogin: null,
        lastUser: null,
        lastDeploy: null,
        lastApplyTs: 0,
        errors: [],
    });

    // Locate the reactive pinia `setting` store (the same source the
    // settings dialog UI binds to). Null until the app is booted.
    const getSettingStore = () => {
        try {
            const el = document.getElementById("vue-app");
            const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia;
            return pinia?._s?.get("setting") ?? null;
        } catch {
            return null;
        }
    };

    // Read a hide-setting live. Prefer the reactive pinia `setting` store
    // (via its `get` action, which resolves defaults), fall back to the
    // legacy settings API, and default to true (hide) when neither is
    // available yet.
    const readSetting = (id) => {
        try {
            const v = getSettingStore()?.get?.(id);
            if (typeof v === "boolean") {
                return v;
            }
        } catch {
            /* fall through */
        }
        try {
            const v = app.ui?.settings?.getSettingValue?.(id);
            if (typeof v === "boolean") {
                return v;
            }
        } catch {
            /* fall through */
        }
        return true;
    };

    // The workflow-tab context menu is mounted fresh on every right-click,
    // so its promo item is caught here (apply runs from the observer for
    // every inserted subtree) and by the periodic re-apply.
    const hideDeployItems = (scope, hide) => {
        const want = hide ? "none" : "";
        scope
            .querySelectorAll('[role="menuitem"]')
            .forEach((el) => {
                if (!DEPLOY_MENU_TEXT.test(el.textContent || "")) {
                    return;
                }
                if (el.style.display !== want) {
                    el.style.display = want;
                }
            });
    };

    const apply = (root) => {
        const scope = root?.querySelectorAll ? root : document;
        const hideLogin = readSetting(SETTINGS.signin) ? "none" : "";
        const hideUser = readSetting(SETTINGS.userSection) ? "none" : "";
        scope
            .querySelectorAll(loginSelector)
            .forEach((el) => {
                if (el.style.display !== hideLogin) {
                    el.style.display = hideLogin;
                }
            });
        scope
            .querySelectorAll(userSelector)
            .forEach((el) => {
                if (el.style.display !== hideUser) {
                    el.style.display = hideUser;
                }
            });
        hideDeployItems(scope, readSetting(SETTINGS.deployApi));
    };

    // Re-apply whenever a setting value changes (e.g. the user toggles one
    // in the settings dialog at runtime). Primary mechanism: a reactive
    // subscription to the setting store (instant, event-driven). The
    // interval is the fallback for throttled/background tabs and covers
    // the window before the store exists. The MutationObserver below
    // handles freshly inserted elements.
    let lastLoginHide = null;
    let lastUserHide = null;
    let lastDeployHide = null;
    let subscribed = false;
    const forceApply = () => {
        try {
            lastLoginHide = readSetting(SETTINGS.signin);
            lastUserHide = readSetting(SETTINGS.userSection);
            lastDeployHide = readSetting(SETTINGS.deployApi);
            apply(document);
            dbg.lastApplyTs = Date.now();
        } catch (e) {
            if (dbg.errors.length < 5) {
                dbg.errors.push("apply: " + String(e));
            }
        }
    };
    try {
        setInterval(() => {
            try {
                dbg.ticks += 1;
                if (!subscribed) {
                    const store = getSettingStore();
                    if (store && typeof store.$subscribe === "function") {
                        store.$subscribe(() => forceApply());
                        subscribed = true;
                    }
                }
                dbg.subscribed = subscribed;
                const hideLogin = readSetting(SETTINGS.signin);
                const hideUser = readSetting(SETTINGS.userSection);
                const hideDeploy = readSetting(SETTINGS.deployApi);
                dbg.lastLogin = hideLogin;
                dbg.lastUser = hideUser;
                dbg.lastDeploy = hideDeploy;
                if (
                    hideLogin !== lastLoginHide ||
                    hideUser !== lastUserHide ||
                    hideDeploy !== lastDeployHide
                ) {
                    lastLoginHide = hideLogin;
                    lastUserHide = hideUser;
                    lastDeployHide = hideDeploy;
                    apply(document);
                    dbg.lastApplyTs = Date.now();
                }
            } catch (e) {
                if (dbg.errors.length < 5) {
                    dbg.errors.push("tick: " + String(e));
                }
            }
        }, 1000);
    } catch (e) {
        if (dbg.errors.length < 5) {
            dbg.errors.push("interval: " + String(e));
        }
    }

    try {
        apply(document);
        dbg.lastApplyTs = Date.now();
    } catch (e) {
        if (dbg.errors.length < 5) {
            dbg.errors.push("init-apply: " + String(e));
        }
    }

    const observer = new MutationObserver((mutations) => {
        try {
            for (const m of mutations) {
                m.addedNodes.forEach((node) => {
                    if (node?.nodeType !== 1 || !node.querySelectorAll) {
                        return;
                    }
                    // The added node itself may be a target.
                    const hideLogin = readSetting(SETTINGS.signin) ? "none" : "";
                    const hideUser = readSetting(SETTINGS.userSection) ? "none" : "";
                    if (
                        node.matches?.(loginSelector) &&
                        node.style.display !== hideLogin
                    ) {
                        node.style.display = hideLogin;
                    }
                    if (
                        node.matches?.(userSelector) &&
                        node.style.display !== hideUser
                    ) {
                        node.style.display = hideUser;
                    }
                    apply(node);
                });
            }
        } catch (e) {
            if (dbg.errors.length < 5) {
                dbg.errors.push("observer: " + String(e));
            }
        }
    });

    const startObserving = () => {
        observer.observe(document.body, { childList: true, subtree: true });
    };

    try {
        if (document.body) {
            startObserving();
        } else {
            new MutationObserver((_, obs) => {
                if (document.body) {
                    obs.disconnect();
                    startObserving();
                }
            }).observe(document.documentElement, { childList: true });
        }
    } catch (e) {
        if (dbg.errors.length < 5) {
            dbg.errors.push("observe: " + String(e));
        }
    }
}

app.registerExtension({
    name: "HideApiTemplates",
    init() {
        registerSettings();
    },
    async setup() {
        // Check whether the server is running with --offline. In that mode the
        // partner API nodes are already gone from the server, so skip the node
        // filtering entirely (no redundant work).
        const offline = await detectOfflineMode();

        // Templates, sign-in and the User section are handled in both modes.
        hookTemplates();
        installDomGuards();

        // Node hiding only matters when online (partner nodes present).
        if (offline) {
            console.info(
                "[HideApiTemplates] --offline active: partner nodes already absent, skipping node filtering."
            );
        } else {
            hookPartnerNodes();
            filterNodeLibraryStore();
            console.info(
                "[HideApiTemplates] online mode: filtering partner nodes from object_info and the Node Library store."
            );
        }
    },
});
