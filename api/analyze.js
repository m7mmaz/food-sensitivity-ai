export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ error: "Use POST request" });
    }

    const { query, localContext } = req.body || {};

    if (!query) {
      return res.status(400).json({ error: "No query provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing" });
    }

    const compactContext = localContext
      ? JSON.stringify(localContext).slice(0, 1800)
      : "";

    const prompt = `أنت محلل حساسية غذائية مختصر جداً.

اسم المنتج أو المادة: ${query}
${compactContext ? `سياق محلي من التطبيق: ${compactContext}` : ""}

المطلوب:
- اعطِ جواباً قصيراً جداً.
- أجب بصيغة JSON فقط بدون أي شرح خارج JSON.
- استخدم نفس المفاتيح التالية فقط:
{
  "verdict": "آمن" | "غير آمن" | "يحتاج تحقق",
  "reason": "سبب مختصر جداً لا يتجاوز 18 كلمة",
  "flaggedAllergens": ["..."],
  "ingredients": ["..."],
  "confidence": "منخفضة" | "متوسطة" | "مرتفعة",
  "note": "تنبيه مختصر جداً"
}
- اجعل القوائم قصيرة جداً، بحد أقصى 3 عناصر.
- إذا لم تكن متأكداً اختر "يحتاج تحقق".
- لا تكرر اسم المنتج في reason إلا عند الحاجة.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 120,
            topP: 0.8
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Gemini API failed",
        raw: data
      });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!rawText) {
      return res.status(200).json({ result: "لم يتم العثور على نتيجة واضحة." });
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ result: parsed });
    } catch {
      return res.status(200).json({ result: cleaned });
    }
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error)
    });
  }
}
