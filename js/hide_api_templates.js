import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "HideApiTemplates",
    async setup() {
        const original = api.getCoreWorkflowTemplates;
        api.getCoreWorkflowTemplates = async function (locale) {
            const result = await original.call(this, locale);
            const filteredResult = result.map(module => ({
                ...module,
                templates: module.templates.filter(t => t.openSource !== false)
            }));
            return filteredResult;
        };
    },
});
