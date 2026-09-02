import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize GoogleGenAI client lazily
let aiClient = null;
function getAI() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Search Grounding API Endpoint
app.post('/api/search-grounding', async (req, res) => {
  try {
    const { prompt, useGrounding = true } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string.' });
    }

    const ai = getAI();
    const config = {
      systemInstruction: '당신은 EmStudio 및 대만 가족 여행/라이프로그 전문 AI 어시스턴트입니다. 항상 정확하고 최신의 실시간 정보를 제공하며, 구글 검색 그라운딩 출처를 신뢰성 있게 전달합니다. 친절하고 가독성 높은 마크다운 형식으로 답변하세요.',
    };

    if (useGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config,
    });

    const text = response.text || '';
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = groundingChunks
      .filter((chunk) => chunk.web && chunk.web.uri)
      .map((chunk) => ({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      }));

    const searchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];

    return res.json({
      text,
      sources: webSources,
      searchQueries,
      grounded: webSources.length > 0 || searchQueries.length > 0,
    });
  } catch (error) {
    console.error('Error generating grounded content:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error while communicating with Gemini API.',
    });
  }
});

// Serve static files with html extension fallback
app.use(express.static(__dirname, {
  extensions: ['html', 'htm']
}));

// Fallback to index.html if not found
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
