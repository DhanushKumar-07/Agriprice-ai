import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

/* =========================================================
   PATH CONFIGURATION
========================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   APP CONFIGURATION
========================================================= */

const app = express();

const port = Number(process.env.PORT) || 3000;

const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '2mb' }));

/* =========================================================
   GEMINI CONFIGURATION
========================================================= */

const apiKey = process.env.GEMINI_API_KEY?.trim() || '';

const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'AgriPrice-AI',
        },
      },
    })
  : null;

/*
  Gemini model.

  If your Google AI Studio account does not support this model,
  change it to another model available in your account.
*/
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/* =========================================================
   DEMO AGRICULTURAL MARKET DATA
========================================================= */

/*
  IMPORTANT:
  These are DEMO values for your project.

  They should NOT be described as verified live prices.
*/

const MARKET_DATA = {
  guntur: {
    name: 'Guntur APMC',
    prices: {
      Tomato: {
        price: 2850,
        trend: '+8.4%',
      },
      'Chilli Teja': {
        price: 13200,
        trend: '+5.2%',
      },
      Cotton: {
        price: 7400,
        trend: '+1.2%',
      },
      'Rice BPT': {
        price: 2350,
        trend: 'Stable',
      },
    },
  },

  tenali: {
    name: 'Tenali APMC',
    prices: {
      Tomato: {
        price: 2780,
        trend: 'Stable',
      },
      Chilli: {
        price: 12950,
        trend: 'Stable',
      },
      Turmeric: {
        price: 14800,
        trend: '+2.1%',
      },
    },
  },

  vijayawada: {
    name: 'Vijayawada Mandi',
    prices: {
      Tomato: {
        price: 2920,
        trend: '+6.1%',
      },
      Chilli: {
        price: 13400,
        trend: '+4.8%',
      },
      'Rice BPT': {
        price: 2420,
        trend: '+1.4%',
      },
    },
  },

  bapatla: {
    name: 'Bapatla Mandi',
    prices: {
      Tomato: {
        price: 2690,
        trend: 'Stable',
      },
      Chilli: {
        price: 12800,
        trend: 'Stable',
      },
    },
  },

  khammam: {
    name: 'Khammam Mandi',
    prices: {
      Chilli: {
        price: 13600,
        trend: '+3.5%',
      },
      Cotton: {
        price: 7550,
        trend: '+1.8%',
      },
    },
  },

  azadpur: {
    name: 'Azadpur Mandi',
    prices: {
      Tomato: {
        price: 3400,
        trend: '+3.2%',
      },
      Onion: {
        price: 2100,
        trend: '+2.5%',
      },
    },
  },

  nashik: {
    name: 'Nashik Mandi',
    prices: {
      Onion: {
        price: 1850,
        trend: 'Stable',
      },
      Tomato: {
        price: 2600,
        trend: '+1.5%',
      },
    },
  },
};

/* =========================================================
   HELPERS
========================================================= */

function getLanguageName(language: string) {
  const languages: Record<string, string> = {
    en: 'English',
    te: 'Telugu (తెలుగు)',
    hi: 'Hindi (हिन्दी)',
    ta: 'Tamil (தமிழ்)',
    kn: 'Kannada (ಕನ್ನಡ)',
    ml: 'Malayalam (മലയാളം)',
    mr: 'Marathi (मराठी)',
    bn: 'Bengali (বাংলা)',
    gu: 'Gujarati (ગુજરાતી)',
    pa: 'Punjabi (ਪੰਜਾਬੀ)',
    or: 'Odia (ଓଡ଼ିଆ)',
    ur: 'Urdu (اردو)',
  };

  return languages[language] || 'English';
}

function formatMarketData() {
  return Object.values(MARKET_DATA)
    .map((market) => {
      const crops = Object.entries(market.prices)
        .map(
          ([crop, data]) =>
            `- ${crop}: ₹${data.price}/quintal (${data.trend})`,
        )
        .join('\n');

      return `${market.name}:\n${crops}`;
    })
    .join('\n\n');
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: isProduction ? 'production' : 'dev',
    hasGeminiKey: Boolean(apiKey),
    model: GEMINI_MODEL,
  });
});

/* =========================================================
   ROOT API
========================================================= */

app.get('/api', (_req, res) => {
  res.json({
    name: 'AgriPrice AI API',
    status: 'running',
    geminiConfigured: Boolean(apiKey),
  });
});

/* =========================================================
   GEMINI CHAT
========================================================= */

app.post('/api/gemini/chat', async (req, res) => {
  try {
    const {
      message,
      history = [],
      language = 'en',
      context = {},
    } = req.body;

    /* -------------------------------------------------------
       Validate message
    ------------------------------------------------------- */

    if (
      !message ||
      typeof message !== 'string' ||
      !message.trim()
    ) {
      res.status(400).json({
        error: 'Message is required.',
      });

      return;
    }

    /* -------------------------------------------------------
       Validate history
    ------------------------------------------------------- */

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item: any) =>
              item &&
              (item.role === 'user' ||
                item.role === 'model') &&
              typeof item.text === 'string' &&
              item.text.trim(),
          )
          .slice(-10)
      : [];

    /* -------------------------------------------------------
       Gemini key check
    ------------------------------------------------------- */

    if (!ai) {
      res.status(503).json({
        error: 'Gemini API is not configured.',
        message:
          'GEMINI_API_KEY is missing. Add it to the project-root .env file and restart the server.',
        source: 'configuration_error',
      });

      return;
    }

    /* -------------------------------------------------------
       Language
    ------------------------------------------------------- */

    const selectedLanguage =
      getLanguageName(language);

    /* -------------------------------------------------------
       User context
    ------------------------------------------------------- */

    const userContext = {
      crop:
        typeof context?.crop === 'string'
          ? context.crop
          : 'Not specified',

      origin:
        typeof context?.origin === 'string'
          ? context.origin
          : 'Not specified',

      quantity:
        context?.quantity ?? 'Not specified',

      additionalContext:
        typeof context?.additionalContext === 'string'
          ? context.additionalContext
          : '',
    };

    /* -------------------------------------------------------
       System instruction
    ------------------------------------------------------- */

    const systemPrompt = `
You are "AgriPrice AI", an intelligent agricultural assistant for Indian farmers, students, and AgriTech users.

IMPORTANT:
- Answer the user's CURRENT question.
- Never automatically answer every question with tomato or chilli prices.
- Never repeat a stock answer when the question changes.

LANGUAGE — VERY IMPORTANT:
The selected language is: ${selectedLanguage}
Language code: ${language}

Always answer primarily and consistently in the selected language.

Supported languages:
en = English
te = Telugu (తెలుగు)
hi = Hindi (हिन्दी)
ta = Tamil (தமிழ்)
kn = Kannada (ಕನ್ನಡ)
ml = Malayalam (മലയാളം)
mr = Marathi (मराठी)
bn = Bengali (বাংলা)
gu = Gujarati (ગુજરાતી)
pa = Punjabi (ਪੰਜਾਬੀ)
or = Odia (ଓଡ଼ିଆ)
ur = Urdu (اردو)

Language rules:
1. Never automatically switch to English when another language is selected.
2. Telugu (te) -> answer in Telugu.
3. Hindi (hi) -> answer in Hindi.
4. Tamil (ta) -> answer in Tamil.
5. Kannada (kn) -> answer in Kannada.
6. Malayalam (ml) -> answer in Malayalam.
7. Marathi (mr) -> answer in Marathi.
8. Bengali (bn) -> answer in Bengali.
9. Gujarati (gu) -> answer in Gujarati.
10. Punjabi (pa) -> answer in Punjabi.
11. Odia (or) -> answer in Odia.
12. Urdu (ur) -> answer in Urdu.
13. English (en) -> answer in English.
14. Keep the selected language throughout the response.
15. If the user mixes languages, prioritize the selected language.
16. Technical terms such as APMC, MSP, Mandi and Quintal may remain
    in common form, but explain them in the selected language when useful.
17. Before answering, silently check that the response is primarily
    written in ${selectedLanguage}. If not, rewrite it.

QUESTION TYPES:
Crop prices, market comparison, farming advice, cultivation, irrigation,
fertilizers, pests/diseases, weather-related agriculture, storage,
transportation, profit calculations, market trends, price prediction,
MSP, APMC/mandi information, general agriculture, and unrelated questions.

IMPORTANT DATA LIMITATION:
The supplied mandi information is DEMO DATA, not verified live data.
Do not call it "real-time", "live", or "today's verified price".
If a requested crop or market is not in the supplied data, do not invent a price.

DEMO MARKET DATA:
${formatMarketData()}

NET REALIZATION:
Net realization = (Market price × quantity) - transport cost - mandi charges - other applicable costs.
Do not assume transport cost unless provided.

ANSWER STYLE:
- Clear, practical, concise, mobile-friendly, farmer-friendly.
- Use bullets, short paragraphs, tables, and calculations when useful.
- Do not unnecessarily mention AgriPrice AI.
- Do not start every answer with "Namaste Farmer!" unless appropriate.

CONVERSATION:
Use previous messages only for context. The current user message has priority.
If the user changes topic, follow the new topic. If ambiguous, ask one short clarification.

CURRENT USER CONTEXT:
${JSON.stringify(userContext, null, 2)}
`;

    /* -------------------------------------------------------
       Build Gemini conversation
    ------------------------------------------------------- */

    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string }>;
    }> = [];

    for (const item of safeHistory) {
      contents.push({
        role: item.role,
        parts: [
          {
            text: item.text,
          },
        ],
      });
    }

    /* -------------------------------------------------------
       Current user message
    ------------------------------------------------------- */

    contents.push({
      role: 'user',
      parts: [
        {
          text: message.trim(),
        },
      ],
    });

    /* -------------------------------------------------------
       Call Gemini
    ------------------------------------------------------- */

    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,

        contents,

        config: {
          systemInstruction: systemPrompt,

          temperature: 0.8,

          maxOutputTokens: 1000,
        },
      });

    /* -------------------------------------------------------
       Extract response
    ------------------------------------------------------- */

    const reply =
      response.text?.trim() ||
      'I could not generate a response right now. Please try asking the question again.';

    /* -------------------------------------------------------
       Market cards
    ------------------------------------------------------- */

    const marketHighlights = [
      {
        market: 'Guntur APMC',
        crop: 'Tomato',
        price: '₹2,850/Q',
        trend: '+8.4%',
      },
      {
        market: 'Vijayawada',
        crop: 'Tomato',
        price: '₹2,920/Q',
        trend: '+6.1%',
      },
      {
        market: 'Guntur APMC',
        crop: 'Chilli Teja',
        price: '₹13,200/Q',
        trend: '+5.2%',
      },
      {
        market: 'Vijayawada',
        crop: 'Chilli',
        price: '₹13,400/Q',
        trend: '+4.8%',
      },
    ];

    /* -------------------------------------------------------
       Send response
    ------------------------------------------------------- */

    res.json({
      reply,

      source: GEMINI_MODEL,

      language,

      marketHighlights,
    });
  } catch (error: any) {
    console.error(
      'Error calling Gemini Chat:',
      error,
    );

    res.status(500).json({
      error: 'Failed to generate AI response.',
      details:
        error?.message ||
        'Unknown server error.',
    });
  }
});

/* =========================================================
   PRICE PREDICTION / INSIGHTS
========================================================= */

app.post(
  '/api/gemini/predict-insights',
  async (req, res) => {
    try {
      const {
        crop = 'Tomato',
        market = 'Guntur APMC',
        language = 'en',
      } = req.body;

      if (!ai) {
        res.status(503).json({
          error: 'Gemini API is not configured.',
          message:
            'Add GEMINI_API_KEY to .env and restart the server.',
        });

        return;
      }

      const prompt = `
You are an agricultural market analyst.

Provide a concise market insight for:

Crop: ${crop}
Market: ${market}
Language: ${getLanguageName(language)}

Use only the supplied demo dataset when discussing
specific market prices.

Do not claim the data is live.

Explain:

1. Current demo price if available
2. Observed trend
3. Possible factors affecting price
4. Risks
5. Practical considerations for a farmer

Clearly distinguish known demo data from general
agricultural reasoning.

Demo data:

${formatMarketData()}
`;

      const response =
        await ai.models.generateContent({
          model: GEMINI_MODEL,

          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],

          config: {
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        });

      res.json({
        insight:
          response.text?.trim() ||
          'Unable to generate market insight.',
        crop,
        market,
        source: GEMINI_MODEL,
      });
    } catch (error: any) {
      console.error(
        'Prediction error:',
        error,
      );

      res.status(500).json({
        error:
          'Failed to generate market insight.',
        details:
          error?.message ||
          'Unknown server error.',
      });
    }
  },
);

/* =========================================================
   SERVE REACT FRONTEND
========================================================= */

/*
  Serve the Vite-built React application in both development
  and production. The API routes above remain available under
  /api/*.

  Run `npm run build` before starting the server so that the
  `dist/` folder exists.
*/

const distPath = path.join(process.cwd(), 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn(
    `⚠️ Frontend build not found at ${distPath}. Run "npm run build" first.`,
  );
}

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      'Unhandled server error:',
      error,
    );

    res.status(500).json({
      error: 'Internal server error.',
    });
  },
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(port, () => {
  console.log(
    `🌾 AgriPrice AI Server running on port ${port} (mode: ${
      isProduction ? 'production' : 'dev'
    })`,
  );

  console.log(
    `🤖 Gemini API: ${
      apiKey ? 'configured' : 'NOT configured'
    }`,
  );

  console.log(
    `🧠 Gemini model: ${GEMINI_MODEL}`,
  );
});