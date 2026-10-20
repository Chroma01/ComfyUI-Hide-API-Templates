# ComfyUI-Hide-API-Templates

Hides the ComfyUI "partner" / API surface from the UI:

1. **Partner workflow templates** — removed from the Templates menu.
2. **Partner nodes** — removed from the Node Library and the create-node menu.
3. **ComfyUI Cloud sign-in / login button** — hidden.

No configuration required.

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

## What Gets Hidden

| Surface | How it's identified |
|---|---|
| Templates menu | Templates with `openSource === false` (partner / paid) |
| Node Library + create-node menu | Nodes whose category starts with `partner/` (server partner API nodes) or `comfy cloud/` (frontend Comfy Cloud nodes) |
| Sign-in button | The ComfyUI Cloud login control (`data-testid="login-button"`) |

Official open-source ComfyUI templates and regular nodes are left untouched.

## Offline-Aware (`--offline`)

The extension reads the server's `--offline` state (via the
`extension.hide_api_templates.offline_mode` feature flag, set from the server
arguments in `__init__.py`).

- **Online** (default): partner nodes are present, so the extension filters
  them out of the Node Library store and the create-node `object_info`.
- **`--offline`**: ComfyUI does not register the partner API nodes at all, so
  the extension skips the node filtering entirely (no redundant work).
  Templates and the login button are still hidden in both modes, because
  `--offline` does not hide those on its own.

The active mode is logged to the console on load:

```
[HideApiTemplates] active (offline_mode=False): hiding partner templates, partner nodes and the ComfyUI Cloud sign-in button.
[HideApiTemplates] online mode: filtering partner nodes from object_info and the Node Library store.
```

## How It Works

- **Templates** — hooks `api.getCoreWorkflowTemplates` and drops templates
  where `openSource === false` before they render.
- **Nodes (create-node menu)** — hooks `api.fetchApi` so `object_info`
  responses have the partner node definitions removed.
- **Nodes (Node Library)** — the Node Library builds its category tree from the
  reactive Pinia `nodeDef` store (`nodeDefsByName`), which is populated at
  startup and is not refreshed from the filtered `object_info`. The extension
  removes the partner entries from that reactive store, updating the library
  tree and search at the data level (no DOM churn).
- **Login button** — sets the `show_signin_button` feature flag to `false`
  server-side (so the button never renders), with a client-side `MutationObserver`
  fallback that hides the button if it appears anyway.

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
