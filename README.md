# ComfyUI-Hide-API-Templates

Hides API templates (partner/paid templates) from the Templates menu in ComfyUI.

## Installation

### Via ComfyUI Manager

Search for "Hide API Templates" in ComfyUI Manager and install.

### Manual

Clone this repository into your `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/YOUR_USERNAME/ComfyUI-Hide-API-Templates.git
```

Then restart ComfyUI.

## Usage

Once installed and ComfyUI is restarted, all templates with the `openSource` flag set to `false` will be hidden from the Templates menu. This includes API templates and templates that require paid nodes.

No configuration required.

## How It Works

This extension hooks into `api.getCoreWorkflowTemplates` and filters out templates where `openSource === false` before they are rendered in the UI.

## Structure

```
ComfyUI-Hide-API-Templates/
├── __init__.py
├── js/
│   └── hide_api_templates.js
└── pyproject.toml
```

## License

MIT
