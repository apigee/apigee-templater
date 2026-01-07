"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rootAgent = void 0;
const adk_1 = require("@google/adk");
const zod_1 = require("zod");
/* Mock tool implementation */
const getCurrentTime = new adk_1.FunctionTool({
    name: "get_current_time",
    description: "Returns the current time in a specified city.",
    parameters: zod_1.z.object({
        city: zod_1.z
            .string()
            .describe("The name of the city for which to retrieve the current time."),
    }),
    execute: ({ city }) => {
        return {
            status: "success",
            report: `The current time in ${city} is 10:30 AM`,
        };
    },
});
exports.rootAgent = new adk_1.LlmAgent({
    name: "hello_time_agent",
    model: "gemini-2.5-flash",
    description: "Tells the current time in a specified city.",
    instruction: `You are a helpful assistant that tells the current time in a city.
                Use the 'getCurrentTime' tool for this purpose.`,
    tools: [getCurrentTime],
});
//# sourceMappingURL=agent.js.map