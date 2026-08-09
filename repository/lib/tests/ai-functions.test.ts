import { describe, it, expect } from "vitest";
import {
  getModelName,
  getTargetRoute,
  getPrompts,
  getUsageData,
  convertOpenAiToGemini,
  convertGeminiToOpenAi,
  convertOpenAiToImagen,
  convertImagenToOpenAi,
  convertOpenAiToAnthropic,
  convertAnthropicToOpenAi,
  convertAnthropicStreamToOpenAi,
  getModelTokenLimit,
  getModelList
} from "../ai-functions.js";

describe("ai-functions.js unit tests", () => {
  it("should detect model name correctly", () => {
    expect(getModelName(null, JSON.stringify({ model: "openai/gpt-4o" }))).toBe("gpt-4o");
    expect(getModelName("/publishers/google/models/gemini-1.5-pro:predict", null)).toBe("gemini-1.5-pro");
  });

  it("should determine target route and extract provider name", () => {
    expect(getTargetRoute("gemini-eu/gemini-1.5-flash")).toEqual({
      provider: "gemini-eu",
      region: "global",
      cleanModelName: "gemini-1.5-flash",
      targetRoute: ""
    });

    expect(getTargetRoute("google/gemini-flash-latest")).toEqual({
      provider: "google",
      region: "global",
      cleanModelName: "gemini-flash-latest",
      targetRoute: ""
    });

    expect(getTargetRoute("openai/gpt-4o")).toEqual({
      provider: "openai",
      region: "global",
      cleanModelName: "gpt-4o",
      targetRoute: ""
    });

    expect(getTargetRoute("gemini-1.5-pro")).toEqual({
      provider: "google",
      region: "global",
      cleanModelName: "gemini-1.5-pro",
      targetRoute: ""
    });

    expect(getTargetRoute("claude-3-5-sonnet")).toEqual({
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-3-5-sonnet",
      targetRoute: ""
    });

    expect(getTargetRoute("gpt-4o-mini")).toEqual({
      provider: "openai",
      region: "global",
      cleanModelName: "gpt-4o-mini",
      targetRoute: ""
    });
  });

  it("should determine target route with new ModelRouting JSON configuration", () => {
    const routingConfig = {
      models: {
        "google/gemini-flash-latest": "googlecloud-oai",
        "anthropic/claude-sonnet-5": "googlecloud"
      },
      mappings: {
        "google/gemini-flash-latest": "google/gemini-3.6-flash"
      }
    };

    expect(getTargetRoute("google/gemini-flash-latest", routingConfig)).toEqual({
      provider: "google",
      region: "global",
      cleanModelName: "gemini-3.6-flash",
      targetRoute: "googlecloud-oai",
      mappedModelName: "google/gemini-3.6-flash"
    });

    expect(getTargetRoute("anthropic/claude-sonnet-5", routingConfig)).toEqual({
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-sonnet-5",
      targetRoute: "googlecloud"
    });

    expect(getTargetRoute("claude-sonnet-5", routingConfig)).toEqual({
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-sonnet-5",
      targetRoute: "googlecloud"
    });

    expect(getTargetRoute("unconfigured-model", routingConfig)).toEqual({
      provider: "unknown",
      region: "global",
      cleanModelName: "unconfigured-model",
      targetRoute: ""
    });
  });

  it("should extract user prompts and detect protocol format", () => {
    const oaiBody = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello world!" }
      ]
    };
    const oaiPrompts = getPrompts(oaiBody);
    expect(oaiPrompts.userPrompt).toBe("Hello world!");
    expect(oaiPrompts.protocol).toBe("openai");

    const anthropicBody = {
      model: "claude-3-5-sonnet",
      system: "You are a helpful assistant.",
      messages: [
        { role: "user", content: "Hello world!" }
      ]
    };
    const anthropicPrompts = getPrompts(anthropicBody);
    expect(anthropicPrompts.userPrompt).toBe("Hello world!");
    expect(anthropicPrompts.protocol).toBe("anthropic");

    const googleBody = {
      contents: [
        { role: "user", parts: [{ text: "Hello world!" }] }
      ]
    };
    const googlePrompts = getPrompts(googleBody);
    expect(googlePrompts.userPrompt).toBe("Hello world!");
    expect(googlePrompts.protocol).toBe("google");
  });

  it("should convert OpenAI request format to Anthropic format and set anthropic_version", () => {
    const openAiPayload = {
      model: "anthropic/claude-3-5-sonnet",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "What is the capital of France?" }
      ],
      temperature: 0.7,
      max_tokens: 100,
      stream: true
    };

    const googleRouteInfo = {
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-3-5-sonnet",
      targetRoute: "googlecloud-oai"
    };

    const googlePayload = convertOpenAiToAnthropic(openAiPayload, googleRouteInfo);
    expect(googlePayload.anthropic_version).toBe("vertex-2023-10-16");
    expect(googlePayload.model).toBeUndefined();

    const emptyRoutePayload = convertOpenAiToAnthropic(openAiPayload);
    expect(emptyRoutePayload.anthropic_version).toBe("vertex-2023-10-16");
    expect(emptyRoutePayload.model).toBeUndefined();

    const bedrockRouteInfo = {
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-3-5-sonnet",
      targetRoute: "aws-bedrock"
    };

    const bedrockPayload = convertOpenAiToAnthropic(openAiPayload, bedrockRouteInfo);
    expect(bedrockPayload.anthropic_version).toBe("bedrock-2023-05-31");
    expect(bedrockPayload.model).toBeUndefined();

    const directAnthropicRouteInfo = {
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-3-5-sonnet",
      targetRoute: "anthropic"
    };

    const directPayload = convertOpenAiToAnthropic(openAiPayload, directAnthropicRouteInfo);
    expect(directPayload.anthropic_version).toBeUndefined();
    expect(directPayload.model).toBe("claude-3-5-sonnet");
  });

  it("should convert Anthropic response format to OpenAI format (non-streaming)", () => {
    const anthropicResponse = {
      id: "msg_123456",
      model: "claude-3-5-sonnet-20241022",
      content: [
        { type: "text", text: "The capital of France is Paris." }
      ],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 10,
        output_tokens: 7
      }
    };

    const result = convertAnthropicToOpenAi(anthropicResponse, "claude-3-5-sonnet");
    const openAiResponse = result.openAiResponse;

    expect(openAiResponse.model).toBe("claude-3-5-sonnet");
    expect(openAiResponse.choices[0].message.content).toBe("The capital of France is Paris.");
    expect(openAiResponse.choices[0].finish_reason).toBe("stop");
    expect(openAiResponse.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 7,
      total_tokens: 17
    });
    expect(result.usageData.usageFound).toBe(true);
    expect(result.usageData.requestTokenCount).toBe(10);
    expect(result.usageData.responseTokenCount).toBe(7);
  });

  it("should convert Anthropic stream events to OpenAI format (streaming) and extract usage data safely", () => {
    const startEvent = 'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","model":"claude-3-5-sonnet","usage":{"input_tokens":15,"output_tokens":1}}}';
    const startResult = convertAnthropicStreamToOpenAi(startEvent, "claude-3-5-sonnet");
    expect(startResult.contentString).toContain('"object":"chat.completion.chunk"');
    expect(startResult.contentString).toContain('"role":"assistant"');
    expect(startResult.contentString).toContain('"prompt_tokens":15');
    expect(startResult.usageData.usageFound).toBe(true);
    expect(startResult.usageData.requestTokenCount).toBe(15);

    const messageDeltaEvent = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":15,"output_tokens":549}}';
    const deltaResult = convertAnthropicStreamToOpenAi(messageDeltaEvent, "claude-3-5-sonnet");
    expect(deltaResult.contentString).toContain('"finish_reason":"stop"');
    expect(deltaResult.contentString).toContain('"prompt_tokens":15');
    expect(deltaResult.contentString).toContain('"completion_tokens":549');
    expect(deltaResult.usageData.usageFound).toBe(true);
    expect(deltaResult.usageData.requestTokenCount).toBe(15);
    expect(deltaResult.usageData.responseTokenCount).toBe(549);

    const textDeltaEvent = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}';
    const textDeltaResult = convertAnthropicStreamToOpenAi(textDeltaEvent, "claude-3-5-sonnet");
    expect(textDeltaResult.contentString).toContain('"content":"Hello"');
    expect(textDeltaResult.usageData.usageFound).toBe(false);

    const stopEvent = 'event: message_stop\ndata: {"type":"message_stop" }';
    const stopResult = convertAnthropicStreamToOpenAi(stopEvent, "claude-3-5-sonnet");
    expect(stopResult.contentString).toBe("data: [DONE]\n\n");
    expect(stopResult.usageData.usageFound).toBe(false);

    // Test getUsageData on [DONE] converted chunk (must not throw exception)
    expect(() => getUsageData(stopResult.contentString)).not.toThrow();
    expect(getUsageData(stopResult.contentString).usageFound).toBe(false);
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

  it("should return model token limit if present or -1 if not", () => {
    const quotaData = [
      {
        apiSource: "ai-auth",
        llmOperations: [
          {
            resource: "/",
            model: "gemini-flash-latest",
            methods: []
          }
        ],
        llmTokenQuota: {},
        attributes: []
      },
      {
        apiSource: "ai-auth",
        llmOperations: [
          {
            resource: "/",
            model: "gemini-3.5-flash",
            methods: []
          }
        ],
        llmTokenQuota: {
          limit: "10000",
          interval: "1",
          timeUnit: "hour"
        },
        attributes: []
      }
    ];

    expect(getModelTokenLimit("gemini-3.5-flash", quotaData)).toBe("10000");
    expect(getModelTokenLimit("google/gemini-3.5-flash", quotaData)).toBe("10000");
    expect(getModelTokenLimit("gemini-flash-latest", quotaData)).toBe(-1);
    expect(getModelTokenLimit("non-existent-model", quotaData)).toBe(-1);
    expect(getModelTokenLimit("gemini-3.5-flash", JSON.stringify(quotaData))).toBe("10000");
    expect(getModelTokenLimit(null, quotaData)).toBe(-1);
    expect(getModelTokenLimit("gemini-3.5-flash", null)).toBe(-1);
  });

  it("should return OpenAI models list from quota data", () => {
    const quotaData = [
      {
        apiSource: "ai-auth",
        llmOperations: [
          {
            resource: "/",
            model: "gemini-3.5-flash",
            methods: []
          }
        ],
        llmTokenQuota: {
          limit: "1000",
          interval: "1",
          timeUnit: "minute"
        },
        attributes: []
      },
      {
        apiSource: "ai-auth",
        llmOperations: [
          {
            resource: "/",
            model: "gemini-flash-latest",
            methods: []
          }
        ],
        llmTokenQuota: {},
        attributes: []
      }
    ];

    const expected = {
      object: "list",
      data: [
        {
          id: "gemini-3.5-flash",
          object: "model",
          created: 1686935002,
          owned_by: "system"
        },
        {
          id: "gemini-flash-latest",
          object: "model",
          created: 1686935002,
          owned_by: "system"
        }
      ]
    };

    expect(getModelList(quotaData)).toEqual(expected);
    expect(getModelList(JSON.stringify(quotaData))).toEqual(expected);
    expect(getModelList(null)).toEqual({ object: "list", data: [] });
  });
});
