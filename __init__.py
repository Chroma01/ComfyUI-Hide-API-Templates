import logging
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

WEB_DIRECTORY = "./js"


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
    "partner nodes and the ComfyUI Cloud sign-in button.",
    _OFFLINE,
)


class HideApiTemplatesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return []


async def comfy_entrypoint():
    return HideApiTemplatesExtension()
