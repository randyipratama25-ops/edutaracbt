import { z } from 'zod';
export const providers={openai:'OpenAI (ChatGPT)',anthropic:'Anthropic (Claude)',google:'Google (Gemini)',deepseek:'DeepSeek',mistral:'Mistral AI',groq:'Groq',xai:'xAI (Grok)',openrouter:'OpenRouter'} as const;
export const providerId=z.enum(['openai','anthropic','google','deepseek','mistral','groq','xai','openrouter']);
export const providerSave=z.object({action:z.literal('save'),provider:providerId,model:z.string().trim().min(1).max(150).regex(/^[a-zA-Z0-9_./:-]+$/),version:z.number().int().min(0),api_key:z.string().min(8).max(5000).optional(),consent:z.boolean(),daily_limit:z.number().int().min(1).max(1000)}).strict();
