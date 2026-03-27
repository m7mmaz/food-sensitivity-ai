export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ error: "Use POST request" });
    }

    const { query } = req.body || {};

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "No query provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing" });
    }

    const q = String(query).trim();

    // 🔥 fallback يعتمد فقط على اسم المنتج (تم إصلاح التكرار)
    function inferLocalFallback(name) {
      const text = String(name || "").toLowerCase();

      const milkWords = [
        "milk","dairy","cheese","yogurt","laban","labneh","cream","butter",
        "حليب","لبن","زبادي","جبنة","جبن","لبنة","قشطة","كريمة","زبدة",
        "المراعي","بوك","نادك","الصافي","السعودية"
      ];

      const eggWords = ["egg","بيض","صفار البيض","مايونيز"];
      const peanutWords = ["peanut","فول سوداني"];
      const nutWords = ["almond","cashew","pistachio","hazelnut","لوز","كاجو","فستق","بندق"];
      const soyWords = ["soy","soya","صويا"];
      const glutenWords = ["wheat","gluten","barley","قمح","جلوتين"];
      const seafoodWords = ["shrimp","fish","salmon","tuna","روبيان","سمك","سالمون","تونة"];

      const has = (arr) => arr.some(w => text.includes(w));

      if (has(milkWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يبدو من الألبان أو مشتقاتها",
          ingredients: "حليب، مشتقات الألبان، لاكتوز",
          confidence: "متوسطة"
        };
      }

      if (has(eggWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يحتوي على البيض",
          ingredients: "بيض",
          confidence: "متوسطة"
        };
      }

      if (has(peanutWords)) {
        return {
          verdict: "غير آمن",
          reason: "يحتوي على فول سوداني",
          ingredients: "فول سوداني",
          confidence: "مرتفعة"
        };
      }

      if (has(nutWords)) {
        return {
          verdict: "غير آمن",
          reason: "يحتوي على مكسرات",
          ingredients: "مكسرات",
          confidence: "متوسطة"
        };
      }

      if (has(soyWords)) {
        return {
          verdict: "يحتاج تحقق",
          reason: "قد يحتوي على صويا",
          ingredients: "صويا",
          confidence: "منخفضة"
        };
      }

      if (has(glutenWords)) {
        return {
          verdict: "يحتاج تحقق",
          reason: "قد يحتوي على جلوتين",
          ingredients: "قمح، جلوتين",
          confidence: "منخفضة"
        };
      }

      if (has(seafoodWords)) {
        return {
          verdict: "غير آمن",
          reason: "يحتوي على مأكولات بحرية",
          ingredients: "أسماك أو قشريات",
          confidence: "متوسطة"
        };
      }

      return {
        verdict: "يحتاج تحقق",
        reason: "لم يتم تحديد المكونات بدقة من الاسم فقط",
        ingredients: "غير محددة",
        confidence: "منخفضة"
      };
    }

    // 🔥 برومبت مبسط بدون localContext
    const prompt = `أنت خبير حساسية غذائية.

اسم المنتج: ${q}

أجب فقط بهذه الصيغة (4 أسطر فقط):

الحكم: آمن أو غير آمن أو يحتاج تحقق
السبب: جملة قصيرة
المكونات المحتملة: حتى 3 عناصر
الثقة: منخفضة أو متوسطة أو مرتفعة

ممنوع أي كلام إضافي.`;

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
            temperature: 0.2,
            maxOutputTokens: 120
          }
        })
      }
    );

    const data = await response.json();

    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    rawText = String(rawText).trim();

    let verdict = "";
    let reason = "";
    let ingredients = "";
    let confidence = "";

    const lines = rawText.split("\n").map(s => s.trim());

    for (const line of lines) {
      if (line.startsWith("الحكم:")) {
        verdict = line.replace("الحكم:", "").trim();
      } else if (line.startsWith("السبب:")) {
        reason = line.replace("السبب:", "").trim();
      } else if (line.startsWith("المكونات المحتملة:")) {
        ingredients = line.replace("المكونات المحتملة:", "").trim();
      } else if (line.startsWith("الثقة:")) {
        confidence = line.replace("الثقة:", "").trim();
      }
    }

    // 🔥 لو Gemini لخبط → fallback
    if (!verdict || !reason || !ingredients || !confidence) {
      const fallback = inferLocalFallback(q);
      verdict = fallback.verdict;
      reason = fallback.reason;
      ingredients = fallback.ingredients;
      confidence = fallback.confidence;
    }

    const finalText =
      `الحكم: ${verdict}\n` +
      `السبب: ${reason}\n` +
      `المكونات المحتملة: ${ingredients}\n` +
      `الثقة: ${confidence}`;

    return res.status(200).json({ result: finalText });

  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error)
    });
  }
}