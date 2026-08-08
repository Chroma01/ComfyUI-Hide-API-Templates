from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

WEB_DIRECTORY = "./js"


class HideApiTemplatesExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return []


async def comfy_entrypoint():
    return HideApiTemplatesExtension()
