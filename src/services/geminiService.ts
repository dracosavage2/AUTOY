import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const generateSEOData = async (fileName: string, userPrompt: string) => {
  if (!ai) throw new Error("GEMINI_API_KEY não configurada.");

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      Gere um título e descrição otimizados para YouTube para um vídeo.
      Nome do arquivo: "${fileName}"
      Conceito do usuário: "${userPrompt || 'Nenhum conceito adicional fornecido.'}"
      
      Retorne estritamente em formato JSON válido: { "title": "...", "description": "...", "tags": "..." }. 
      Use português do Brasil. O título deve ser chamativo (clickbait ético). 
      A descrição deve ser profissional e incluir uma breve introdução. 
      As tags devem ser relevantes e separadas por vírgula.
    `,
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    const text = response.text || "";
    return JSON.parse(text.trim());
  } catch (e) {
    console.error("Erro ao analisar JSON da AI:", response.text);
    throw new Error("Falha ao processar resposta da AI.");
  }
};

export const generateEditPlan = async (fileName: string, userPrompt: string, style: string) => {
  if (!ai) throw new Error("GEMINI_API_KEY não configurada.");

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      Você é um especialista em edição de vídeo por IA. 
      O usuário quer aplicar um estilo de edição "${style}" ao vídeo chamado "${fileName}".
      Conceito: "${userPrompt || 'Nenhum conceito adicional'}"
      
      Gere um "Plano de Edição Inteligente" em formato JSON:
      {
        "operation": "ex: Corte Inteligente + Estabilização",
        "duration": "ex: 00:02 - 00:45 (Removendo silêncios)",
        "transition": "ex: Cross-fade suave",
        "summary": "Breve frase sobre o que a IA 'fez' no vídeo",
        "suggestedTitle": "Novo título sugerido se necessário"
      }
      
      Seja criativo e técnico. Use português do Brasil. 
      Retorne APENAS o JSON.
    `,
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    const text = response.text || "";
    return JSON.parse(text.trim());
  } catch (e) {
    console.error("Erro ao analisar JSON da AI:", response.text);
    throw new Error("Falha ao processar resposta da AI.");
  }
};
