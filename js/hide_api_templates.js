import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * HideApiTemplates
 *
 * Hides the ComfyUI "partner" / API surface from the UI:
 *   1. Partner (paid) workflow templates    -> Templates menu
 *   2. Partner nodes (Node Library + create-node menu)
 *   3. ComfyUI Cloud sign-in / login button
 *
 * Partner nodes are identified by category: "partner/..." (server partner API
 * nodes) and "comfy cloud/..." (frontend Comfy Cloud nodes).
 *
 * Offline-aware: the extension reads the `extension.hide_api_templates.
 * offline_mode` feature flag (set by __init__.py from the server's --offline
 * argument). When --offline is active, ComfyUI does not register the partner
 * API nodes at all, so the client-side node filtering is skipped to avoid
 * redundant work. Templates and the login button are handled in both modes,
 * because --offline does not hide those on its own.
 */

// Categories that identify a "partner" / Comfy Cloud node.
const PARTNER_CATEGORIES = ["partner/", "comfy cloud/"];
const LOGIN_BUTTON_TESTID = "login-button";

function isPartnerDef(def) {
    const category = String(def?.category ?? "");
    return PARTNER_CATEGORIES.some((p) => category.startsWith(p));
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
        if (typeof path === "string" && path.includes("object_info")) {
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
// data-level fix with no DOM churn. The store is polled until it is populated,
// then filtered; partner entries are removed whenever they (re)appear, e.g. if
// the app reloads node definitions, and the poller stops once stable.
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

    let cleanStreak = 0;
    const apply = () => {
        const store = getStore();
        if (!store) {
            return; // store not available yet
        }
        const keys = Object.keys(store);
        if (keys.length < 50) {
            return; // not populated yet
        }
        let removed = 0;
        for (const k of keys) {
            if (isPartnerDef(store[k])) {
                delete store[k];
                removed += 1;
            }
        }
        if (removed > 0) {
            console.info(
                `[HideApiTemplates] filtered ${removed} partner nodes from the Node Library`
            );
            cleanStreak = 0;
        } else {
            cleanStreak += 1;
        }
    };

    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        apply();
        // Stop after ~2 minutes, or once the store has been clean for a while.
        if (tries > 240 || cleanStreak >= 5) {
            clearInterval(timer);
        }
    }, 500);
}

// --- 4. Login button: hide the ComfyUI Cloud sign-in control ------------------
// Primary path is the server feature flag `show_signin_button=false` (set in
// __init__.py), which keeps the button from rendering at all. The DOM guard
// below is a belt-and-braces fallback so the button stays hidden even if the
// flag is absent or overridden.
function hideLoginButton() {
    const selector = `[data-testid="${LOGIN_BUTTON_TESTID}"]`;

    const apply = (root) => {
        const scope = root?.querySelectorAll ? root : document;
        scope.querySelectorAll(selector).forEach((el) => {
            if (el.style.display !== "none") {
                el.style.display = "none";
            }
        });
    };

    apply(document);

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach((node) => {
                if (node?.nodeType !== 1) {
                    return;
                }
                if (node.matches?.(selector)) {
                    node.style.display = "none";
                } else {
                    apply(node);
                }
            });
        }
    });

    const startObserving = () => {
        observer.observe(document.body, { childList: true, subtree: true });
    };

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
}

app.registerExtension({
    name: "HideApiTemplates",
    async setup() {
        // Check whether the server is running with --offline. In that mode the
        // partner API nodes are already gone from the server, so skip the node
        // filtering entirely (no redundant work).
        const offline = await detectOfflineMode();

        // Templates + login are handled in both modes.
        hookTemplates();
        hideLoginButton();

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
