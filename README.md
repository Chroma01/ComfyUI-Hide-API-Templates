# ComfyUI-Hide-API-Templates

Hides the ComfyUI "partner" / API surface from the UI:

1. **Partner workflow templates** — removed from the Templates menu.
2. **Partner nodes** — removed from the Node Library and the create-node menu.
3. **ComfyUI Cloud sign-in / login button** — hidden from the top bar.
4. **"User" (My Account) settings section** — hidden from the Settings dialog.

Everything is on by default, and every item can be toggled at runtime
(without reloading the page) from the Settings dialog.

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

The extension registers four boolean settings, in the same place other
extensions put theirs: **Settings → Other → ComfyUI-Hide-API-Templates**.
All default to `true` (hidden). Toggling one applies immediately, no reload
needed.

| Setting | Controls |
|---|---|
| `HidePartnerTemplates` | Partner (paid) workflow templates in the Templates menu |
| `HidePartnerNodes` | Partner nodes in the Node Library + create-node menu |
| `HideSignInButton` | The ComfyUI Cloud sign-in button in the top bar |
| `HideUserSettings` | The "User" (My Account) section in the Settings dialog |

## What Gets Hidden

| Surface | How it's identified |
|---|---|
| Templates menu | Templates with `openSource === false` (partner / paid) |
| Node Library + create-node menu | Nodes whose category starts with `partner/` (server partner API nodes) or `comfy cloud/` (frontend Comfy Cloud nodes) |
| Sign-in button | The ComfyUI Cloud login control (`data-testid="login-button"`) |
| User settings section | The hardcoded "User" nav item (`data-nav-id="user"`) of the Settings dialog |

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
[HideApiTemplates] active (offline_mode=True): hiding partner templates, partner nodes, the ComfyUI Cloud sign-in button and the User settings section (all toggleable in Settings).
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
- **Runtime toggling** — the client subscribes to the reactive Pinia
  `setting` store, so flipping any of the four settings in the dialog applies
  immediately (an interval fallback covers throttled/background tabs, and a
  `MutationObserver` re-applies the rules to freshly inserted elements).

## Structure

```
ComfyUI-Hide-API-Templates/
├── __init__.py          # feature flags + --offline detection
├── js/
│   └── hide_api_templates.js
├── pyproject.toml
└── README.md
```

## License

MIT
