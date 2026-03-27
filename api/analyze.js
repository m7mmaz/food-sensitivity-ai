const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part.text || '').join('\n').trim();
}

function extractSources(payload) {
  const groundingChunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();
  const out = [];

  for (const chunk of groundingChunks) {
    const web = chunk?.web;
    if (web?.uri && !seen.has(web.uri)) {
      seen.add(web.uri);
      out.push({ title: web.title || web.uri, url: web.uri });
    }
  }

  return out.slice(0, 8);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY is missing' });
  }

  const { query, localContext } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing query' });
  }

  const prompt = `أنت محلل ذكي لحساسية الأطعمة، ولغة الواجهة عربية.

المطلوب: حلل أمان المنتج التالي للمستخدم مع الاستفادة من البحث على الويب عندما يفيد ذلك:
المنتج: ${query}

السياق المحلي من التطبيق:
${JSON.stringify(localContext || {}, null, 2)}

قواعد صارمة:
- لا تخمّن إذا لم تجد أدلة كافية.
- إذا كانت الأدلة ضعيفة أو غير حديثة أو متعارضة، اجعل الحكم "يحتاج تحقق".
- فضّل الصفحات الرسمية للعلامة التجارية، أو المتاجر الموثوقة، أو قواعد بيانات غذائية معروفة.
- أعطني JSON فقط بدون أي نص إضافي.

صيغة JSON المطلوبة بالضبط:
{
  "verdict": "آمن | غير آمن | يحتاج تحقق",
  "confidence": "عالية | متوسطة | منخفضة",
  "reasoning": "شرح عربي مختصر وواضح",
  "ingredients": ["..."],
  "flaggedAllergens": ["..."],
  "note": "ملاحظة مختصرة للمستخدم"
}`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: prompt }] }
        ],
        tools: [
          { google_search: {} }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          responseMimeType: 'application/json'
        }
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: payload?.error?.message || 'Gemini request failed'
      });
    }

    const text = extractText(payload);
    const parsed = tryParseJson(text);

    if (!parsed) {
      return res.status(502).json({ ok: false, error: 'Model did not return valid JSON', raw: text });
    }

    return res.status(200).json({
      ok: true,
      result: {
        ...parsed,
        sources: extractSources(payload)
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unexpected server error' });
  }
}
