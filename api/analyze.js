export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { query } = req.body || {};

    if (!query) {
      return res.status(400).json({ error: "No query provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing" });
    }

    const prompt = `
حلل المنتج التالي من ناحية الحساسية الغذائية:
"${query}"

أجب بالعربية فقط بهذا الشكل:
- الحكم: آمن / غير آمن / يحتاج تحقق
- السبب:
- المواد المثيرة المحتملة:
- درجة الثقة:
- تنبيه:
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Gemini API request failed",
        raw: data,
      });
    }

    const result =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "لم يتم العثور على نتيجة واضحة.";

    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error),
    });
  }
}