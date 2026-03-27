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
      ? JSON.stringify(localContext).slice(0, 1400)
      : "";

    const prompt = `أنت مساعد مختصر لتحليل حساسية غذائية.

اسم المنتج: ${query}
${compactContext ? `سياق محلي مختصر: ${compactContext}` : ""}

أعطني الإجابة بالعربية فقط، وبحد أقصى 4 أسطر، وبدون JSON وبدون markdown.
الصيغة المطلوبة:
الحكم: آمن أو غير آمن أو يحتاج تحقق
السبب: سبب قصير جداً
المكونات المحتملة: اذكر حتى 3 فقط
الثقة: منخفضة أو متوسطة أو مرتفعة`;

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
            maxOutputTokens: 90,
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
      return res.status(200).json({
        result: "الحكم: يحتاج تحقق\nالسبب: لم يتم العثور على نتيجة واضحة\nالمكونات المحتملة: غير محددة\nالثقة: منخفضة"
      });
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      try {
        const parsed = JSON.parse(cleaned);
        const verdict = parsed.verdict || "يحتاج تحقق";
        const reason = parsed.reason || parsed.reasoning || "لا توجد تفاصيل كافية";
        const ingredients = Array.isArray(parsed.ingredients) && parsed.ingredients.length
          ? parsed.ingredients.slice(0, 3).join("، ")
          : "غير محددة";
        const confidence = parsed.confidence || "منخفضة";

        return res.status(200).json({
          result: `الحكم: ${verdict}\nالسبب: ${reason}\nالمكونات المحتملة: ${ingredients}\nالثقة: ${confidence}`
        });
      } catch {}
    }

    return res.status(200).json({ result: cleaned });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error)
    });
  }
}