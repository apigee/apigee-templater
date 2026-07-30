import { describe, it, expect } from "vitest";
import {
  getModelName,
  getTargetRoute,
  getPrompts,
  getUsageData,
  convertOpenAiToGemini,
  convertGeminiToOpenAi,
  convertOpenAiToImagen,
  convertImagenToOpenAi
} from "../ai-functions.js";

describe("ai-functions.js unit tests", () => {
  it("should detect model name correctly", () => {
    expect(getModelName(null, JSON.stringify({ model: "openai/gpt-4o" }))).toBe("openai/gpt-4o");
    expect(getModelName("/publishers/google/models/gemini-1.5-pro:predict", null)).toBe("gemini-1.5-pro");
  });

  it("should determine target route and clean model name", () => {
    expect(getTargetRoute("gemini-eu/gemini-1.5-flash")).toEqual({
      provider: "google",
      region: "eu",
      cleanModelName: "google/gemini-1.5-flash",
      targetRoute: "gcloud-eu"
    });

    expect(getTargetRoute("google/gemini-flash-latest")).toEqual({
      provider: "google",
      region: "global",
      cleanModelName: "google/gemini-flash-latest",
      targetRoute: "gcloud"
    });

    expect(getTargetRoute("openai/gpt-4o")).toEqual({
      provider: "openai",
      region: "global",
      cleanModelName: "openai/gpt-4o",
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

  it("should convert OpenAI image generation request to Imagen format", () => {
    const openAiPayload = {
      prompt: "a majestic lion in the savanna",
      n: 2,
      response_format: "b64_json"
    };

    const imagenPayload = convertOpenAiToImagen(openAiPayload);

    expect(imagenPayload).toEqual({
      instances: [{ prompt: "a majestic lion in the savanna" }],
      parameters: {
        sampleCount: 2,
        outputOptions: { mimeType: "image/jpeg" }
      }
    });
  });

  it("should convert Imagen response format to OpenAI image response format", () => {
    const imagenResponse = {
      predictions: [
        { bytesBase64Encoded: "base64data1" },
        { bytesBase64Encoded: "base64data2" }
      ]
    };

    const openAiResponse = convertImagenToOpenAi(imagenResponse, "imagen-3.0-generate-002");

    expect(openAiResponse.data).toEqual([
      { b64_json: "base64data1" },
      { b64_json: "base64data2" }
    ]);
  });
});
