function getModelName(urlString, contentString) {
  var modelName = "unknown";
  if (urlString && urlString.includes("/publishers/anthropic/models/")) {
    // gcp claude url format
    var urlPieces = urlString.split("/publishers/anthropic/models/");
    if (urlPieces.length > 1) {
      var urlPieces2 = urlPieces[1].split(":");
      if (urlPieces2.length > 0) {
        modelName = urlPieces2[0];
      }
    }
  } else if (urlString && urlString.includes("/publishers/google/models/")) {
    // gcp gemini url format
    var urlPieces = urlString.split("/publishers/google/models/");
    if (urlPieces.length > 1) {
      var urlPieces2 = urlPieces[1].split(":");
      if (urlPieces2.length > 0) {
        modelName = urlPieces2[0];
      }
    }
  } else if (contentString) {
    try {
      var contentData = contentString;
      if (typeof contentString === "string") {
        contentData = JSON.parse(contentString);
      } else if (contentString.asJSON) {
        contentData = contentString.asJSON;
      }
      if (contentData && contentData["model"]) modelName = contentData["model"];
    } catch (e) {}
  }

  return modelName;
}

function getTargetRoute(modelName) {
  var result = {
    provider: "unknown",
    region: "global",
    cleanModelName: modelName,
    targetRoute: "gcloud"
  };

  if (!modelName || modelName === "unknown") {
    return result;
  }

  var lowerModel = modelName.toLowerCase();
  var rawProvider = "";
  var cleanModel = modelName;

  if (modelName.indexOf("/") !== -1) {
    var parts = modelName.split("/");
    rawProvider = parts[0].toLowerCase();
    cleanModel = parts.slice(1).join("/");
  }

  if (rawProvider === "google-eu" || rawProvider === "gcloud-eu" || rawProvider === "gemini-eu") {
    result.provider = "google";
    result.region = "eu";
    result.targetRoute = "gcloud-eu";
    result.cleanModelName = "google/" + cleanModel;
  } else if (rawProvider === "google" || rawProvider === "gcloud" || rawProvider === "gemini") {
    result.provider = "google";
    result.region = "global";
    result.targetRoute = "gcloud";
    result.cleanModelName = modelName;
  } else if (rawProvider === "openai") {
    result.provider = "openai";
    result.region = "global";
    result.targetRoute = "openai";
    result.cleanModelName = modelName;
  } else if (rawProvider === "anthropic") {
    result.provider = "anthropic";
    result.region = "global";
    result.targetRoute = "anthropic";
    result.cleanModelName = modelName;
  } else {
    // Default checks based on model prefix
    if (lowerModel.indexOf("gpt-") === 0 || lowerModel.indexOf("text-embedding-") === 0 || lowerModel.indexOf("dall-e") === 0 || lowerModel.indexOf("o1-") === 0 || lowerModel.indexOf("o3-") === 0) {
      result.provider = "openai";
      result.region = "global";
      result.targetRoute = "openai";
      result.cleanModelName = "openai/" + modelName;
    } else if (lowerModel.indexOf("claude-") === 0) {
      result.provider = "anthropic";
      result.region = "global";
      result.targetRoute = "anthropic";
      result.cleanModelName = "anthropic/" + modelName;
    } else if (lowerModel.indexOf("gemini-") === 0 || lowerModel.indexOf("bison") !== -1 || lowerModel.indexOf("imagen") !== -1) {
      result.provider = "google";
      result.region = "global";
      result.targetRoute = "gcloud";
      result.cleanModelName = lowerModel.indexOf("google/") === 0 ? modelName : "google/" + modelName;
    } else {
      result.provider = "google";
      result.region = "global";
      result.targetRoute = "gcloud";
      result.cleanModelName = lowerModel.indexOf("google/") === 0 ? modelName : "google/" + modelName;
    }
  }

  return result;
}

function getPrompts(contentData) {
  var promptInfo = {
    userPrompt: "",
    allUserPrompts: "",
  };

  if (contentData && contentData["contents"]) {
    // gemini format
    for (var i = contentData["contents"].length - 1; i >= 0; i--) {
      var content = contentData["contents"][i];
      if (
        content &&
        content["role"] &&
        content["role"].toLowerCase() == "user" &&
        content["parts"]
      ) {
        for (var p = content["parts"].length - 1; p >= 0; p--) {
          var part = content["parts"][p];
          if (!promptInfo.userPrompt && content["parts"][p]["text"]) {
            promptInfo.userPrompt = content["parts"][p]["text"];
          }

          if (content["parts"][p]["text"]) {
            promptInfo.allUserPrompts += " " + content["parts"][p]["text"];
          }
        }
      }
    }
  } else if (contentData && contentData["messages"]) {
    // oapi format
    for (var i = contentData["messages"].length - 1; i >= 0; i--) {
      var message = contentData["messages"][i];
      if (message && message["role"] && message["role"].toLowerCase() == "user") {
        if (!promptInfo.userPrompt && message["content"]) {
          promptInfo.userPrompt = message["content"];
        }

        if (message["content"]) {
          promptInfo.allUserPrompts += " " + message["content"];
        }
      }
    }
  }

  return promptInfo;
}

function setPrompt(contentData, userPrompt) {
  if (contentData && contentData["contents"]) {
    // gemini format
    for (var i = contentData["contents"].length - 1; i >= 0; i--) {
      var content = contentData["contents"][i];
      if (
        content &&
        content["role"] &&
        content["role"].toLowerCase() == "user" &&
        content["parts"]
      ) {
        for (var p = content["parts"].length - 1; p >= 0; p--) {
          var part = content["parts"][p];
          if (content["parts"][p]["text"]) {
            content["parts"][p]["text"] = userPrompt;
            break;
          }
        }
      }
    }
  } else if (contentData && contentData["messages"]) {
    // oapi format
    for (var i = contentData["messages"].length - 1; i >= 0; i--) {
      var message = contentData["messages"][i];
      if (message && message["role"] && message["role"].toLowerCase() == "user") {
        if (message["content"]) {
          message["content"] = userPrompt;
          break;
        }
      }
    }
  }

  return contentData;
}

function getResponse(contentData) {
  var responseText = "";

  if (contentData && contentData["candidates"] && contentData["candidates"].length > 0) {
    // gemini format
    for (var i = contentData["candidates"].length - 1; i >= 0; i--) {
      var candidate = contentData["candidates"][i];
      if (
        candidate &&
        candidate["content"] &&
        candidate["content"]["parts"] &&
        candidate["content"]["parts"].length > 0
      ) {
        for (var p = candidate["content"]["parts"].length - 1; p >= 0; p--) {
          var part = candidate["content"]["parts"][p];
          if (part && part["text"]) {
            responseText = part["text"];
            break;
          }
        }
      }
    }
  } else if (contentData && contentData["choices"] && contentData["choices"].length > 0) {
    // openmodel format
    for (var i = contentData["choices"].length - 1; i >= 0; i--) {
      var choice = contentData["choices"][i];
      if (choice && choice["message"] && choice["message"]["content"]) {
        responseText = choice["message"]["content"];
        break;
      }
    }
  } else if (contentData && contentData["content"] && contentData["content"].length > 0) {
    // claude format
    for (var i = contentData["content"].length - 1; i >= 0; i--) {
      var content = contentData["content"][i];
      if (content && content["type"] == "text") {
        responseText = content["text"];
        break;
      }
    }
  }

  return responseText;
}

function setResponse(contentData, content) {
  if (contentData && contentData["candidates"] && contentData["candidates"].length > 0) {
    // gemini format
    for (var i = contentData["candidates"].length - 1; i >= 0; i--) {
      var candidate = contentData["candidates"][i];
      if (
        candidate &&
        candidate["content"] &&
        candidate["content"]["parts"] &&
        candidate["content"]["parts"].length > 0
      ) {
        for (var p = candidate["content"]["parts"].length - 1; p >= 0; p--) {
          var part = candidate["content"]["parts"][p];
          if (part && part["text"]) {
            part["text"] = content;
            break;
          }
        }
      }
    }
  } else if (contentData && contentData["choices"] && contentData["choices"].length > 0) {
    // openmodel format
    for (var i = contentData["choices"].length - 1; i >= 0; i--) {
      var choice = contentData["choices"][i];
      if (choice && choice["message"] && choice["message"]["content"]) {
        choice["message"]["content"] = content;
        break;
      }
    }
  } else if (contentData && contentData["content"] && contentData["content"].length > 0) {
    // claude format
    for (var i = contentData["content"].length - 1; i >= 0; i--) {
      var claudeContent = contentData["content"][i];
      if (claudeContent && claudeContent["type"] == "text") {
        claudeContent["text"] = content;
        break;
      }
    }
  }

  return contentData;
}

function getUsageData(contentString) {
  var usageData = {
    model: "",
    requestTokenCount: 0,
    responseTokenCount: 0,
    totalTokenCount: 0,
  };

  if (
    contentString &&
    contentString != "[DONE]" &&
    !contentString.startsWith("event: content_block_delta") &&
    !contentString.startsWith("event: ping") &&
    !contentString.startsWith("event: content_block_start") &&
    !contentString.startsWith("event: content_block_stop") &&
    !contentString.startsWith("event: message_stop")
  ) {
    contentString = contentString.replace("data: ", "");
    contentString = contentString.replace("event: message_delta data:", "");
    contentString = contentString.replace("event: message_delta", "");
    contentString = contentString.replace("event: message_start", "");

    try {
      var contentData = JSON.parse(contentString);

      // model
      if (contentData["model"]) {
        usageData.model = contentData["model"];
      }
      if (contentData["modelVersion"]) {
        usageData.model = contentData["modelVersion"];
      }
      if (contentData["message"] && contentData["message"]["model"]) {
        usageData.model = contentData["message"]["model"];
      }
      if (usageData.model.includes("/")) {
        var modelNamePieces = usageData.model.split("/");
        usageData.model = modelNamePieces[modelNamePieces.length - 1];
      }

      // requestTokenCount
      // openmodels
      if (contentData["usage"] && contentData["usage"]["prompt_tokens"]) {
        usageData.requestTokenCount = contentData["usage"]["prompt_tokens"];
      }
      // claude
      if (
        contentData["message"] &&
        contentData["message"]["usage"] &&
        contentData["message"]["usage"]["input_tokens"]
      ) {
        usageData.requestTokenCount = contentData["message"]["usage"]["input_tokens"];
      }
      if (contentData["usage"] && contentData["usage"]["input_tokens"]) {
        usageData.requestTokenCount = contentData["usage"]["input_tokens"];
      }
      // gemini API
      if (contentData["usageMetadata"] && contentData["usageMetadata"]["promptTokenCount"]) {
        usageData.requestTokenCount = contentData["usageMetadata"]["promptTokenCount"];
      }

      // responseTokenCount
      // openmodels
      if (contentData["usage"] && contentData["usage"]["completion_tokens"])
        usageData.responseTokenCount = contentData["usage"]["completion_tokens"];
      // claude
      if (contentData["usage"] && contentData["usage"]["output_tokens"]) {
        usageData.responseTokenCount = contentData["usage"]["output_tokens"];
      }
      // gemini
      if (contentData["usageMetadata"] && contentData["usageMetadata"]["candidatesTokenCount"]) {
        usageData.responseTokenCount = contentData["usageMetadata"]["candidatesTokenCount"];
      }
    } catch (e) {
      print("Exception in getUsageData: " + JSON.stringify(e));
    }
  }

  return usageData;
}

function testAllowedModels(requestInfo) {
  var result = true;
  if (requestInfo.allowedModelPatterns && requestInfo.allowedModelPatterns != "ALL") {
    result = false;
    var patterns = requestInfo.allowedModelPatterns.split(";");
    for (var i = 0; i < patterns.length; i++) {
      var pattern = patterns[i];
      if (requestInfo.type == "googlecloud") {
        if (requestInfo.url.includes(pattern)) {
          result = true;
          break;
        }
      } else if (requestInfo.type == "oai" && requestInfo.requestContent["model"]) {
        if (requestInfo.requestContent["model"].includes(pattern)) {
          result = true;
          break;
        }
      }
    }
  }

  return result;
}

function testDeniedModels(requestInfo) {
  var result = true;
  if (requestInfo.deniedModelPatterns && requestInfo.deniedModelPatterns != "NONE") {
    var patterns = requestInfo.deniedModelPatterns.split(";");
    for (var i = 0; i < patterns.length; i++) {
      var pattern = patterns[i];
      if (requestInfo.type == "googlecloud") {
        if (requestInfo.url.includes(pattern)) {
          result = false;
          break;
        }
      } else if (requestInfo.type == "oai" && requestInfo.requestContent["model"]) {
        if (requestInfo.requestContent["model"].includes(pattern)) {
          result = false;
          break;
        }
      } else if (requestInfo.type == "oai") {
        result = false;
        break;
      }
    }
  }

  return result;
}

// Open AI to Gemini native format conversion
function convertOpenAiToGemini(openAiPayload) {
  if (!openAiPayload) return {};
  
  var geminiPayload = {
    contents: []
  };

  if (openAiPayload.messages && Array.isArray(openAiPayload.messages)) {
    var systemInstructionParts = [];

    for (var i = 0; i < openAiPayload.messages.length; i++) {
      var msg = openAiPayload.messages[i];
      var role = msg.role;
      var content = msg.content;

      if (role === "system") {
        if (typeof content === "string") {
          systemInstructionParts.push({ text: content });
        } else if (Array.isArray(content)) {
          for (var j = 0; j < content.length; j++) {
            if (content[j].type === "text" && content[j].text) {
              systemInstructionParts.push({ text: content[j].text });
            }
          }
        }
      } else {
        var geminiRole = (role === "assistant") ? "model" : "user";
        var parts = [];

        if (typeof content === "string") {
          parts.push({ text: content });
        } else if (Array.isArray(content)) {
          for (var k = 0; k < content.length; k++) {
            if (content[k].type === "text" && content[k].text) {
              parts.push({ text: content[k].text });
            }
          }
        }

        if (parts.length > 0) {
          geminiPayload.contents.push({
            role: geminiRole,
            parts: parts
          });
        }
      }
    }

    if (systemInstructionParts.length > 0) {
      geminiPayload.systemInstruction = {
        parts: systemInstructionParts
      };
    }
  }

  var generationConfig = {};
  if (openAiPayload.temperature !== undefined) generationConfig.temperature = openAiPayload.temperature;
  if (openAiPayload.top_p !== undefined) generationConfig.topP = openAiPayload.top_p;
  if (openAiPayload.max_tokens !== undefined) generationConfig.maxOutputTokens = openAiPayload.max_tokens;
  if (openAiPayload.stop !== undefined) {
    generationConfig.stopSequences = Array.isArray(openAiPayload.stop) ? openAiPayload.stop : [openAiPayload.stop];
  }

  if (Object.keys(generationConfig).length > 0) {
    geminiPayload.generationConfig = generationConfig;
  }

  return geminiPayload;
}

// Gemini native response to OpenAI format conversion
function convertGeminiToOpenAi(geminiResponse, modelName) {
  if (!geminiResponse) return {};

  var openAiResponse = {
    id: "chatcmpl-" + Math.random().toString(36).substring(2, 11),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelName || "gemini",
    choices: [],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };

  if (geminiResponse.candidates && Array.isArray(geminiResponse.candidates)) {
    for (var i = 0; i < geminiResponse.candidates.length; i++) {
      var candidate = geminiResponse.candidates[i];
      var text = "";
      
      if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
        for (var p = 0; p < candidate.content.parts.length; p++) {
          if (candidate.content.parts[p].text) {
            text += candidate.content.parts[p].text;
          }
        }
      }

      var finishReason = "stop";
      if (candidate.finishReason) {
        if (candidate.finishReason === "MAX_TOKENS") finishReason = "length";
        else if (candidate.finishReason === "SAFETY") finishReason = "content_filter";
        else finishReason = candidate.finishReason.toLowerCase();
      }

      openAiResponse.choices.push({
        index: candidate.index || i,
        message: {
          role: "assistant",
          content: text
        },
        finish_reason: finishReason
      });
    }
  }

  if (geminiResponse.usageMetadata) {
    var promptTokens = geminiResponse.usageMetadata.promptTokenCount || 0;
    var completionTokens = geminiResponse.usageMetadata.candidatesTokenCount || 0;
    var totalTokens = geminiResponse.usageMetadata.totalTokenCount || (promptTokens + completionTokens);

    openAiResponse.usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens
    };
  }

  return openAiResponse;
}

// OpenAI image generation request to Imagen native predict request conversion
function convertOpenAiToImagen(openAiPayload) {
  if (!openAiPayload) return { instances: [] };

  var promptText = openAiPayload.prompt || "";
  var sampleCount = openAiPayload.n || 1;

  var parameters = {};
  if (openAiPayload.response_format === "b64_json") {
    parameters.outputOptions = { mimeType: "image/jpeg" };
  }
  if (openAiPayload.aspect_ratio) {
    parameters.aspectRatio = openAiPayload.aspect_ratio;
  }
  if (sampleCount) {
    parameters.sampleCount = sampleCount;
  }

  return {
    instances: [{ prompt: promptText }],
    parameters: parameters
  };
}

// Imagen native predict response to OpenAI image generation response conversion
function convertImagenToOpenAi(imagenResponse, modelName) {
  if (!imagenResponse) return { created: Math.floor(Date.now() / 1000), data: [] };

  var openAiResponse = {
    created: Math.floor(Date.now() / 1000),
    data: []
  };

  if (imagenResponse.predictions && Array.isArray(imagenResponse.predictions)) {
    for (var i = 0; i < imagenResponse.predictions.length; i++) {
      var pred = imagenResponse.predictions[i];
      if (pred.bytesBase64Encoded) {
        openAiResponse.data.push({
          b64_json: pred.bytesBase64Encoded
        });
      } else if (pred.gcsUri) {
        openAiResponse.data.push({
          url: pred.gcsUri
        });
      }
    }
  }

  return openAiResponse;
}

if (typeof exports !== "undefined") {
  exports.getModelName = getModelName;
  exports.getTargetRoute = getTargetRoute;
  exports.getPrompts = getPrompts;
  exports.setPrompt = setPrompt;
  exports.getResponse = getResponse;
  exports.setResponse = setResponse;
  exports.getUsageData = getUsageData;
  exports.testAllowedModels = testAllowedModels;
  exports.testDeniedModels = testDeniedModels;
  exports.convertOpenAiToGemini = convertOpenAiToGemini;
  exports.convertGeminiToOpenAi = convertGeminiToOpenAi;
  exports.convertOpenAiToImagen = convertOpenAiToImagen;
  exports.convertImagenToOpenAi = convertImagenToOpenAi;
}
