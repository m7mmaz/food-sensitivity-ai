export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).json({ error: "Use POST request" });
    }

    const { query, localContext } = req.body || {};

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "No query provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing" });
    }

    const q = String(query).trim();

    // fallback محلي ذكي لو رد Gemini كان ناقص
    function inferLocalFallback(name, ctx) {
      const text = `${name} ${JSON.stringify(ctx || {})}`.toLowerCase();

      const milkWords = [
        "milk", "dairy", "cheese", "yogurt", "laban", "labneh", "cream", "butter",
        "حليب", "لبن", "زبادي", "جبنة", "جبن", "لبنة", "قشطة", "كريمة", "زبدة",
        "المراعي", "بوك", "نادك", "الصافي", "السعودية"
      ];

      const eggWords = ["egg", "بيض", "صفار البيض", "مايونيز"];
      const peanutWords = ["peanut", "فول سوداني"];
      const nutWords = ["almond", "cashew", "pistachio", "hazelnut", "لوز", "كاجو", "فستق", "بندق"];
      const soyWords = ["soy", "soya", "صويا", "ليسيثين الصويا"];
      const glutenWords = ["wheat", "gluten", "barley", "rye", "قمح", "جلوتين", "شعير", "جاودار"];
      const seafoodWords = ["shrimp", "prawn", "fish", "salmon", "tuna", "روبيان", "جمبري", "سمك", "سالمون", "تونة"];

      const has = (arr) => arr.some(w => text.includes(w));

      if (has(milkWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يبدو من فئة الألبان أو يحتوي غالبًا على مشتقات الحليب",
          ingredients: "حليب، مشتقات الألبان، لاكتوز",
          confidence: "متوسطة"
        };
      }

      if (has(eggWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يبدو مرتبطًا بالبيض أو مشتقاته",
          ingredients: "بيض، بروتين البيض",
          confidence: "متوسطة"
        };
      }

      if (has(peanutWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يبدو مرتبطًا بالفول السوداني",
          ingredients: "فول سوداني",
          confidence: "مرتفعة"
        };
      }

      if (has(nutWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يبدو مرتبطًا بالمكسرات",
          ingredients: "مكسرات",
          confidence: "متوسطة"
        };
      }

      if (has(soyWords)) {
        return {
          verdict: "يحتاج تحقق",
          reason: "قد يحتوي على الصويا أو أحد مشتقاتها",
          ingredients: "صويا",
          confidence: "منخفضة"
        };
      }

      if (has(glutenWords)) {
        return {
          verdict: "يحتاج تحقق",
          reason: "قد يحتوي على القمح أو الجلوتين",
          ingredients: "قمح، جلوتين",
          confidence: "منخفضة"
        };
      }

      if (has(seafoodWords)) {
        return {
          verdict: "غير آمن",
          reason: "المنتج يبدو من المأكولات البحرية أو مشتقاتها",
          ingredients: "أسماك أو قشريات",
          confidence: "متوسطة"
        };
      }

      return {
        verdict: "يحتاج تحقق",
        reason: "لم أستطع تأكيد المكونات بشكل كافٍ من الاسم وحده",
        ingredients: "غير محددة",
        confidence: "منخفضة"
      };
    }

    const compactContext = localContext
      ? JSON.stringify(localContext).slice(0, 1600)
      : "";

    const prompt = `أنت مساعد حساسية غذائية.

اسم المنتج: ${q}
${compactContext ? `سياق محلي: ${compactContext}` : ""}

أجب بالعربية فقط.
ممنوع JSON.
ممنوع markdown.
اكتب 4 أسطر فقط لا غير، وابدأ كل سطر كما يلي حرفيًا:

الحكم: ...
السبب: ...
المكونات المحتملة: ...
الثقة: ...

ويجب أن تكون القيم بعد النقطتين مكتملة وليست فارغة.`;

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
            maxOutputTokens: 140,
            topP: 0.8
          }
        })
      }
    );

    const data = await response.json();

    let rawText = "";
    if (response.ok) {
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    }

    rawText = String(rawText || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let verdict = "";
    let reason = "";
    let ingredients = "";
    let confidence = "";

    // محاولة قراءة JSON لو رجع بالغلط
    if (rawText.startsWith("{") && rawText.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawText);
        verdict = parsed.verdict || parsed["الحكم"] || "";
        reason = parsed.reason || parsed.reasoning || parsed["السبب"] || "";
        ingredients = Array.isArray(parsed.ingredients)
          ? parsed.ingredients.slice(0, 3).join("، ")
          : (parsed["المكونات المحتملة"] || "");
        confidence = parsed.confidence || parsed["الثقة"] || "";
      } catch {}
    }

    // محاولة استخراج الأسطر النصية
    if (!verdict && !reason && !ingredients && !confidence && rawText) {
      const lines = rawText
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (line.startsWith("الحكم:")) {
          verdict = line.replace(/^الحكم:\s*/, "").trim();
        } else if (line.startsWith("السبب:")) {
          reason = line.replace(/^السبب:\s*/, "").trim();
        } else if (line.startsWith("المكونات المحتملة:")) {
          ingredients = line.replace(/^المكونات المحتملة:\s*/, "").trim();
        } else if (line.startsWith("الثقة:")) {
          confidence = line.replace(/^الثقة:\s*/, "").trim();
        }
      }
    }

    // لو أي قيمة ناقصة، استخدم fallback محلي بدل الرد الناقص
    if (!verdict || !reason || !ingredients || !confidence) {
      const fallback = inferLocalFallback(q, localContext);
      verdict = verdict || fallback.verdict;
      reason = reason || fallback.reason;
      ingredients = ingredients || fallback.ingredients;
      confidence = confidence || fallback.confidence;
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