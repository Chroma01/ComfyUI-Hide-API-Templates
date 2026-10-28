import json
import logging
import os
from pathlib import Path
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

WEB_DIRECTORY = "./js"


def _read_frontend_setting(key: str, default: bool = True) -> bool:
    """Read one of this node's settings from user/default/comfy.settings.json.

    Custom nodes are imported long before any browser session connects, so
    reading the persisted settings file is the only way to honour a user's
    toggle already during startup.
    """
    try:
        settings_path = (
            Path(__file__).resolve().parent.parent.parent
            / "user"
            / "default"
            / "comfy.settings.json"
        )
        with open(settings_path, encoding="utf-8") as f:
            data = json.load(f)
        return bool(
            data.get("ComfyUI-Hide-API-Templates." + key, default)
        )
    except Exception:
        return default


if _read_frontend_setting("SuppressProductTips", True):
    # Upstream app/product_tips.py checks this env var before printing the
    # "ComfyUI is developed by Comfy Org ... platform.comfy.org/ascii"
    # startup banner and the post-job /ascii hints. setdefault keeps any
    # value the user set themselves (e.g. "0" to bring the tips back).
    os.environ.setdefault("COMFYUI_DISABLE_PRODUCT_TIPS", "1")


def _server_flags() -> dict:
    """Return the mutable SERVER_FEATURE_FLAGS dict (best effort)."""
    try:
        from comfy_api.feature_flags import SERVER_FEATURE_FLAGS

        return SERVER_FEATURE_FLAGS
    except Exception as e:  # pragma: no cover - version resilience
        logging.warning(
            "[HideApiTemplates] could not import feature flags: %s", e
        )
        return {}


def _detect_offline() -> bool:
    """True when the server was launched with --offline (or --disable-partner-nodes).

    In that mode ComfyUI does not register the partner API nodes at all, so
    the client-side node filter in hide_api_templates.js has nothing to do.
    """
    try:
        from comfy.cli_args import args

        return bool(
            getattr(args, "offline", False)
            or getattr(args, "disable_partner_nodes", False)
            or getattr(args, "disable_api_nodes", False)
        )
    except Exception:
        return False


_OFFLINE = _detect_offline()
_FLAGS = _server_flags()

# Hide the ComfyUI Cloud sign-in / login button in the frontend.
_FLAGS["show_signin_button"] = False
# Expose this extension's state so the frontend (and debugging) can see it.
# The extension JS uses this to log whether --offline is active; the node
# filter itself is presence-based and safe in either mode.
_EXT = _FLAGS.setdefault("extension", {})
_EXT["hide_api_templates"] = {"offline_mode": _OFFLINE}

logging.info(
    "[HideApiTemplates] active (offline_mode=%s): hiding partner templates, "
    "partner nodes, the ComfyUI Cloud sign-in button, the User settings "
    "section, the 'Deploy to Comfy API' tab-menu item and the Comfy Org "
    "startup banner (all toggleable in Settings; the banner toggle takes "
    "effect on restart).",
    _OFFLINE,
)


class HideApiTemplatesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return []


async def comfy_entrypoint():
    return HideApiTemplatesExtension()
