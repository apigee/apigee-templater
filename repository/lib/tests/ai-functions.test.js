import { describe, it, expect } from "vitest";
import { getModelName, getTargetRoute, getPrompts, getUsageData, convertOpenAiToGemini, convertGeminiToOpenAi } from "../ai-functions.js";
describe("ai-functions.js unit tests", () => {
    it("should detect model name correctly", () => {
        expect(getModelName(null, JSON.stringify({ model: "openai/gpt-4o" }))).toBe("openai/gpt-4o");
        expect(getModelName("/publishers/google/models/gemini-1.5-pro:predict", null)).toBe("gemini-1.5-pro");
    });
    it("should determine target route and clean model name", () => {
        expect(getTargetRoute("gemini-eu/gemini-1.5-flash")).toEqual({
            provider: "google",
            cleanModelName: "gemini-1.5-flash",
            targetRoute: "gcloud-eu"
        });
        expect(getTargetRoute("openai/gpt-4o")).toEqual({
            provider: "openai",
            cleanModelName: "gpt-4o",
            targetRoute: "openai"
        });
    });
    it("should extract user prompts", () => {
        const oaiBody = {
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: "Hello world!" }
            ]
        };
        expect(getPrompts(oaiBody).userPrompt).toBe("Hello world!");
    });
    it("should convert OpenAI request format to Gemini native format", () => {
        const openAiPayload = {
            model: "gemini-eu/gemini-1.5-flash",
            messages: [
                { role: "system", content: "Be concise." },
                { role: "user", content: "What is the capital of France?" }
            ],
            temperature: 0.7,
            max_tokens: 100
        };
        const geminiPayload = convertOpenAiToGemini(openAiPayload);
        expect(geminiPayload).toEqual({
            systemInstruction: {
                parts: [{ text: "Be concise." }]
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: "What is the capital of France?" }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 100
            }
        });
    });
    it("should convert Gemini native response format to OpenAI format", () => {
        const geminiResponse = {
            candidates: [
                {
                    content: {
                        parts: [{ text: "The capital of France is Paris." }],
                        role: "model"
                    },
                    finishReason: "STOP",
                    index: 0
                }
            ],
            usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 7,
                totalTokenCount: 17
            }
        };
        const openAiResponse = convertGeminiToOpenAi(geminiResponse, "gemini-1.5-flash");
        expect(openAiResponse.model).toBe("gemini-1.5-flash");
        expect(openAiResponse.choices[0].message.content).toBe("The capital of France is Paris.");
        expect(openAiResponse.choices[0].finish_reason).toBe("stop");
        expect(openAiResponse.usage).toEqual({
            prompt_tokens: 10,
            completion_tokens: 7,
            total_tokens: 17
        });
    });
});
//# sourceMappingURL=ai-functions.test.js.map