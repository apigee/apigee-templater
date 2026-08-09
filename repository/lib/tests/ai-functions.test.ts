import { describe, it, expect } from "vitest";
import {
  getRequestInfo,
  getModelName,
  getTargetRoute,
  getPrompts,
  getUsageData,
  parseMultipartFormData,
  convertOpenAiMultipartToGemini,
  convertOpenAiToGeminiEmbeddings,
  convertGeminiEmbeddingsToOpenAi,
  convertOpenAiToGemini,
  convertOpenAiToGeminiAudio,
  convertGeminiAudioToOpenAi,
  decodeBase64ToBytes,
  convertOpenAiPayload,
  convertGeminiToOpenAi,
  convertOpenAiToImagen,
  convertOpenAiToGeminiImage,
  convertImagenToOpenAi,
  convertOpenAiToAnthropic,
  convertAnthropicToOpenAi,
  convertAnthropicStreamToOpenAi,
  getModelTokenLimit,
  getModelList
} from "../ai-functions.js";

describe("ai-functions.js unit tests", () => {
  it("should parse request info correctly for speech, transcription, images, and text requests", () => {
    const speechReq = {
      model: "google/gemini-3.1-flash-tts-preview",
      input: "Hello, how are you?",
      voice: "alloy"
    };
    const speechInfo = getRequestInfo("/v1/speech/audio", speechReq);
    expect(speechInfo).toEqual({
      input: "Hello, how are you?",
      rawModelName: "google/gemini-3.1-flash-tts-preview",
      modelName: "gemini-3.1-flash-tts-preview",
      protocol: "openai",
      requestType: "audio-text"
    });

    const transcriptionInfo = getRequestInfo("/v1/audio/transcriptions", { model: "whisper-1" });
    expect(transcriptionInfo.requestType).toBe("audio-data");
    expect(transcriptionInfo.modelName).toBe("whisper-1");
    expect(transcriptionInfo.rawModelName).toBe("whisper-1");

    const imageInfo = getRequestInfo("/v1/images/generations", { model: "dall-e-3", prompt: "A majestic lion" });
    expect(imageInfo).toEqual({
      input: "A majestic lion",
      rawModelName: "dall-e-3",
      modelName: "dall-e-3",
      protocol: "openai",
      requestType: "image-generation"
    });

    const textInfo = getRequestInfo("/v1/chat/completions", {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Tell me a joke" }]
    });
    expect(textInfo).toEqual({
      input: "Tell me a joke",
      rawModelName: "openai/gpt-4o",
      modelName: "gpt-4o",
      protocol: "openai",
      requestType: "text"
    });
  });

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
      targetRoute: "googlecloud"
    });

    expect(getTargetRoute("claude-3-5-sonnet")).toEqual({
      provider: "anthropic",
      region: "global",
      cleanModelName: "claude-3-5-sonnet",
      targetRoute: "anthropic"
    });

    expect(getTargetRoute("gpt-4o-mini")).toEqual({
      provider: "openai",
      region: "global",
      cleanModelName: "gpt-4o-mini",
      targetRoute: "openai"
    });

    expect(getTargetRoute("google/gemini-embedding-2")).toEqual({
      provider: "google",
      region: "global",
      cleanModelName: "gemini-embedding-2",
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
      targetRoute: "anthropic"
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
    expect(startResult.messageId).toBe("chatcmpl-123");
    expect(startResult.usageData.usageFound).toBe(true);
    expect(startResult.usageData.requestTokenCount).toBe(15);

    const messageDeltaEvent = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":15,"output_tokens":549}}';
    const deltaResult = convertAnthropicStreamToOpenAi(messageDeltaEvent, "claude-3-5-sonnet", startResult.messageId);
    expect(deltaResult.contentString).toContain('"finish_reason":"stop"');
    expect(deltaResult.contentString).toContain('"id":"chatcmpl-123"');
    expect(deltaResult.contentString).toContain('"prompt_tokens":15');
    expect(deltaResult.contentString).toContain('"completion_tokens":549');
    expect(deltaResult.usageData.usageFound).toBe(true);
    expect(deltaResult.usageData.requestTokenCount).toBe(15);
    expect(deltaResult.usageData.responseTokenCount).toBe(549);

    const textDeltaEvent = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}';
    const textDeltaResult = convertAnthropicStreamToOpenAi(textDeltaEvent, "claude-3-5-sonnet", startResult.messageId);
    expect(textDeltaResult.contentString).toContain('"content":"Hello"');
    expect(textDeltaResult.contentString).toContain('"id":"chatcmpl-123"');
    expect(textDeltaResult.usageData.usageFound).toBe(false);

    // Ping and content_block_stop should produce empty string output (no leaked events or extra line breaks)
    const pingEvent = 'event: ping\ndata: {"type":"ping"}';
    const pingResult = convertAnthropicStreamToOpenAi(pingEvent, "claude-3-5-sonnet");
    expect(pingResult.contentString).toBe("");

    const blockStopEvent = 'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}';
    const blockStopResult = convertAnthropicStreamToOpenAi(blockStopEvent, "claude-3-5-sonnet");
    expect(blockStopResult.contentString).toBe("");

    // Test multi-event chunk in a single string
    const multiEvent = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}';
    const multiResult = convertAnthropicStreamToOpenAi(multiEvent, "claude-3-5-sonnet", "chatcmpl-123");
    expect(multiResult.contentString).toContain('"content":"Hello "');
    expect(multiResult.contentString).toContain('"content":"world"');

    // Test thinking delta conversion
    const thinkingEvent = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}';
    const thinkingResult = convertAnthropicStreamToOpenAi(thinkingEvent, "claude-3-5-sonnet");
    expect(thinkingResult.contentString).toContain('"reasoning_content":"Let me think..."');

    const stopEvent = 'event: message_stop\ndata: {"type":"message_stop" }';
    const stopResult = convertAnthropicStreamToOpenAi(stopEvent, "claude-3-5-sonnet");
    expect(stopResult.contentString).toBe("data: [DONE]");
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

  it("should convert OpenAI speech audio request format to Vertex Gemini TTS format via convertOpenAiPayload", () => {
    const speechPayload = {
      model: "google/gemini-3.1-flash-tts-preview",
      input: "Hello, how are you?",
      voice: "alloy"
    };

    const result = convertOpenAiPayload(speechPayload, "google", "audio-text");

    expect(result).toEqual({
      contents: [
        {
          role: "user",
          parts: [{ text: "Hello, how are you?" }]
        }
      ],
      generation_config: {
        response_modalities: ["AUDIO"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: "Puck"
            }
          }
        }
      }
    });
  });

  it("should extract base64 audio data and mimeType from Gemini TTS response", () => {
    const geminiAudioResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/mp3",
                  data: "SGVsbG8gV29ybGQ="
                }
              }
            ]
          }
        }
      ]
    };

    const extracted = convertGeminiAudioToOpenAi(geminiAudioResponse);
    expect(extracted).toEqual({
      base64Data: "SGVsbG8gV29ybGQ=",
      mimeType: "audio/mp3"
    });

    const decoded = decodeBase64ToBytes(extracted.base64Data);
    expect(decoded.toString()).toBe("Hello World");
  });

  it("should parse multipart form data and convert OpenAI transcription request to Gemini JSON payload", () => {
    const multipartBody = [
      "------WebKitFormBoundary7MA4YWxkTrZu0gW",
      'Content-Disposition: form-data; name="model"',
      "",
      "google/gemini-2.0-flash",
      "------WebKitFormBoundary7MA4YWxkTrZu0gW",
      'Content-Disposition: form-data; name="prompt"',
      "",
      "Transcribe audio accurately",
      "------WebKitFormBoundary7MA4YWxkTrZu0gW",
      'Content-Disposition: form-data; name="file"; filename="sample.wav"',
      "Content-Type: audio/wav",
      "",
      "Hello Audio Bytes",
      "------WebKitFormBoundary7MA4YWxkTrZu0gW--"
    ].join("\r\n");

    const parsed = parseMultipartFormData(multipartBody, "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW");
    expect(parsed.model).toBe("google/gemini-2.0-flash");
    expect(parsed.prompt).toBe("Transcribe audio accurately");
    expect(parsed.fileMimeType).toBe("audio/wav");

    const converted = convertOpenAiPayload(parsed, "google", "audio-data");
    expect(converted).toEqual({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "audio/wav",
                data: Buffer.from("Hello Audio Bytes").toString("base64")
              }
            },
            {
              text: "Transcribe audio accurately"
            }
          ]
        }
      ]
    });
  });

  it("should convert OpenAI embeddings request and Gemini embeddings response format", () => {
    const embeddingsReq = {
      model: "google/gemini-embedding-001",
      input: "This is a test sentence to embed."
    };

    const convertedReq = convertOpenAiPayload(embeddingsReq, "google", "embeddings");
    expect(convertedReq).toEqual({
      content: {
        parts: [
          { text: "This is a test sentence to embed." }
        ]
      }
    });

    const geminiEmbedResp = {
      embedding: {
        values: [0.0123, -0.0456, 0.0789]
      }
    };

    const convertedResp = convertGeminiEmbeddingsToOpenAi(geminiEmbedResp, "gemini-embedding-001");
    expect(convertedResp).toEqual({
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: [0.0123, -0.0456, 0.0789]
        }
      ],
      model: "gemini-embedding-001",
      usage: {
        prompt_tokens: 0,
        total_tokens: 0
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

  it("should convert OpenAI image generation request to Imagen format when model contains imagen", () => {
    const openAiPayload = {
      model: "google/imagen-3.0-generate-002",
      prompt: "a majestic lion in the savanna",
      n: 2,
      response_format: "b64_json"
    };

    const imagenPayload = convertOpenAiPayload(openAiPayload, "google", "image-generation");

    expect(imagenPayload).toEqual({
      instances: [{ prompt: "a majestic lion in the savanna" }],
      parameters: {
        sampleCount: 2,
        outputOptions: { mimeType: "image/jpeg" }
      }
    });
  });

  it("should convert OpenAI image generation request to Gemini generateContent format when model is gemini", () => {
    const openAiPayload = {
      model: "google/gemini-3.1-flash-lite-image",
      prompt: "A small red fox sitting in a snowy forest at sunset",
      size: "1024x1024"
    };

    const geminiImagePayload = convertOpenAiPayload(openAiPayload, "google", "image-generation");

    expect(geminiImagePayload).toEqual({
      contents: [
        {
          role: "user",
          parts: [
            { text: "A small red fox sitting in a snowy forest at sunset" }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    });
  });

  it("should convert Imagen and Gemini image response format to OpenAI image response format", () => {
    const imagenResponse = {
      predictions: [
        { bytesBase64Encoded: "base64data1" },
        { bytesBase64Encoded: "base64data2" }
      ]
    };

    const openAiResponse1 = convertImagenToOpenAi(imagenResponse, "imagen-3.0-generate-002");

    expect(openAiResponse1.data).toEqual([
      { b64_json: "base64data1" },
      { b64_json: "base64data2" }
    ]);

    const geminiImageResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "geminiBase64Data"
                }
              }
            ]
          }
        }
      ]
    };

    const openAiResponse2 = convertImagenToOpenAi(geminiImageResponse, "gemini-3.1-flash-lite-image");
    expect(openAiResponse2.data).toEqual([
      { b64_json: "geminiBase64Data" }
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
