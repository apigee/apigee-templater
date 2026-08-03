declare module "../ai-functions.js" {
  export function getModelName(urlString: string | null, contentString: string | object | null): string;
  export function getTargetRoute(modelName: string): {
    provider: string;
    region: string;
    cleanModelName: string;
    targetRoute: string;
  };
  export function getPrompts(contentData: any): { userPrompt: string; allUserPrompts: string };
  export function setPrompt(contentData: any, userPrompt: string): any;
  export function getResponse(contentData: any): string;
  export function setResponse(contentData: any, content: string): any;
  export function getUsageData(contentString: string): any;
  export function testAllowedModels(requestInfo: any): boolean;
  export function testDeniedModels(requestInfo: any): boolean;
  export function convertOpenAiToGemini(openAiPayload: any): any;
  export function convertGeminiToOpenAi(geminiResponse: any, modelName?: string): any;
  export function getModelTokenLimit(modelName: string | null, quotaData: any): any;
}
