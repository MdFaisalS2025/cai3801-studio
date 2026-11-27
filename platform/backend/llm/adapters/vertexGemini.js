// Gemini on Vertex AI through the Google Gen AI SDK (@google/genai) in Vertex mode.
// Auth: Application Default Credentials (the Cloud Run service account, or
// `gcloud auth application-default login` locally). No API key is used.
//
// Env: GOOGLE_CLOUD_PROJECT (required), GOOGLE_CLOUD_LOCATION (default us-central1),
//      GEMINI_MODEL (default gemini-2.5-flash), LLM_TEMPERATURE (default 0.2)

import { parseJson } from '../parseJson.js';

export async function create(env = process.env) {
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('vertex-gemini needs GOOGLE_CLOUD_PROJECT.');
  const location = env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const temperature = Number(env.LLM_TEMPERATURE ?? 0.2);
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ vertexai: true, project, location });

  return {
    id: 'vertex-gemini',
    model,
    async complete({ system, messages = [], json = false } = {}) {
      const res = await ai.models.generateContent({
        model,
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: {
          ...(system ? { systemInstruction: system } : {}),
          ...(json ? { responseMimeType: 'application/json' } : {}),
          temperature,
        },
      });
      const text = res.text || '';
      return { text, json: json ? parseJson(text) : null, model, provider: 'vertex-gemini' };
    },
  };
}
