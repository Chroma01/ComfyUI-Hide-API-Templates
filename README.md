# ComfyUI-Hide-API-Templates

Hides the ComfyUI "partner" / API surface from the UI:

1. **Partner workflow templates** — removed from the Templates menu.
2. **Partner nodes** — removed from the Node Library and the create-node menu.
3. **ComfyUI Cloud sign-in / login button** — hidden from the top bar.
4. **"User" (My Account) settings section** — hidden from the Settings dialog.
5. **"Deploy to Comfy API" promo item** — hidden from the workflow tab
   context menu (right-click a workflow tab).
6. **Comfy Org startup banner** — the `[INFO] ComfyUI is developed by
   Comfy Org … platform.comfy.org/ascii …` console line (and the post-job
   `/ascii-job` hints) is suppressed via the upstream
   `COMFYUI_DISABLE_PRODUCT_TIPS` environment variable.

Everything is on by default, and every item can be toggled at runtime
(without reloading the page) from the Settings dialog — except the startup
banner, which takes effect on the next restart (it is printed before the
browser ever connects).

## Installation

### Via ComfyUI Manager

Search for "Hide API Templates" in ComfyUI Manager and install.

### Manual

Clone this repository into your `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Chroma01/ComfyUI-Hide-API-Templates.git
```

Then restart ComfyUI.

## Settings

The extension registers six boolean settings, in the same place other
extensions put theirs: **Settings → Other → ComfyUI-Hide-API-Templates**.
All default to `true` (hidden). Toggling one applies immediately, no reload
needed (`SuppressProductTips` applies on the next ComfyUI restart).

| Setting | Controls |
|---|---|
| `HidePartnerTemplates` | Partner (paid) workflow templates in the Templates menu |
| `HidePartnerNodes` | Partner nodes in the Node Library + create-node menu |
| `HideSignInButton` | The ComfyUI Cloud sign-in button in the top bar |
| `HideUserSettings` | The "User" (My Account) section in the Settings dialog |
| `HideDeployToApi` | The "Deploy to Comfy API" item in the workflow tab context menu |
| `SuppressProductTips` | The Comfy Org startup banner + `/ascii-job` hints in the server console |

## What Gets Hidden

| Surface | How it's identified |
|---|---|
| Templates menu | Templates with `openSource === false` (partner / paid) |
| Node Library + create-node menu | Nodes whose category starts with `partner/` (server partner API nodes) or `comfy cloud/` (frontend Comfy Cloud nodes) |
| Sign-in button | The ComfyUI Cloud login control (`data-testid="login-button"`) |
| User settings section | The hardcoded "User" nav item (`data-nav-id="user"`) of the Settings dialog |
| Workflow tab context menu | The menu item whose text matches "Deploy to Comfy API" (`role="menuitem"`, locale key `contextMenu.deployToComfyApi`) |
| Server console banner | Upstream `app/product_tips.py`, silenced via `COMFYUI_DISABLE_PRODUCT_TIPS=1` set at import time |

Official open-source ComfyUI templates and regular nodes are left untouched.

## Offline-Aware (`--offline`)

The extension reads the server's `--offline` state (via the
`extension.hide_api_templates.offline_mode` feature flag, set from the server
arguments in `__init__.py`).

- **Online** (default): partner nodes are present, so the extension filters
  them out of the Node Library store and the create-node `object_info`.
- **`--offline`**: ComfyUI does not register the partner API nodes at all, so
  the extension skips the node filtering entirely (no redundant work).
  Templates, the sign-in button and the User section are still hidden in both
  modes, because `--offline` does not hide those on its own.

The active mode is logged on load:

```
[HideApiTemplates] active (offline_mode=True): hiding partner templates, partner nodes, the ComfyUI Cloud sign-in button, the User settings section, the 'Deploy to Comfy API' tab-menu item and the Comfy Org startup banner (all toggleable in Settings; the banner toggle takes effect on restart).
[HideApiTemplates] --offline active: partner nodes already absent, skipping node filtering.
```

## How It Works

- **Templates** — hooks `api.getCoreWorkflowTemplates` and drops templates
  where `openSource === false` before they render (unless
  `HidePartnerTemplates` is off).
- **Nodes (create-node menu)** — hooks `api.fetchApi` so `object_info`
  responses have the partner node definitions removed.
- **Nodes (Node Library)** — the Node Library builds its category tree from the
  reactive Pinia `nodeDef` store (`nodeDefsByName`), which is populated at
  startup and is not refreshed from the filtered `object_info`. The extension
  removes the partner entries from that reactive store (backing them up first,
  so toggling `HidePartnerNodes` back on restores them), updating the library
  tree and search at the data level (no DOM churn).
- **Sign-in button** — sets the `show_signin_button` feature flag to `false`
  server-side (so the frontend renders the button hidden), plus a client-side
  guard that keeps it hidden when the setting is on.
- **User settings section** — "User" is a hardcoded nav item of the Settings
  dialog (not a registered setting), so it is hidden from the DOM via
  `display: none` while the setting is on.
- **"Deploy to Comfy API" item** — the workflow-tab context menu is a Vue
  component rebuilt on every right-click, so a `MutationObserver` catches
  the freshly inserted menu and hides any `role="menuitem"` whose text
  matches "Deploy to Comfy API" (the item ships with a "NEW" badge; both go
  away together).
- **Startup banner** — `__init__.py` reads `SuppressProductTips` from
  `user/default/comfy.settings.json` at import time (custom nodes are
  imported before the banner would be printed) and sets
  `COMFYUI_DISABLE_PRODUCT_TIPS=1` — the switch upstream itself checks in
  `app/product_tips.py`. It also silences the one-off `/ascii-job` hints
  logged after finished jobs. A value the user exported manually is kept
  (`setdefault`), so `COMFYUI_DISABLE_PRODUCT_TIPS=0` brings the tips back.
- **Runtime toggling** — the client subscribes to the reactive Pinia
  `setting` store, so flipping any setting in the dialog applies immediately
  (an interval fallback covers throttled/background tabs, and a
  `MutationObserver` re-applies the rules to freshly inserted elements).

## Structure

```
ComfyUI-Hide-API-Templates/
├── __init__.py          # feature flags + --offline detection + startup banner suppression
├── js/
│   └── hide_api_templates.js
├── pyproject.toml
└── README.md
```

## License

MIT
