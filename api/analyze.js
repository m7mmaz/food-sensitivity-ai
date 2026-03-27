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

    // تحويل مستوى الكلاس إلى معنى عملي
    function verdictFromClass(maxClass) {
      if (maxClass >= 5) return { verdict: "غير آمن", confidence: "مرتفعة" };
      if (maxClass >= 3) return { verdict: "يحتاج تحقق", confidence: "متوسطة" };
      return { verdict: "غالبًا آمن", confidence: "متوسطة" };
    }

    // تحليل سريع من نتائج التقرير المحلية المرسلة من الواجهة
    function analyzeFromLocalContext(name, ctx) {
      if (!ctx || typeof ctx !== "object") return null;

      const refs = Array.isArray(ctx?.productEstimate?.references)
        ? ctx.productEstimate.references
        : [];
      const matches = Array.isArray(ctx?.localMatches) ? ctx.localMatches : [];

      const candidates = [...refs, ...matches]
        .filter(Boolean)
        .map((x) => ({
          ar: x.ar || "",
          en: x.en || "",
          class: Number(x.class || 0)
        }));

      if (!candidates.length) return null;

      const seen = new Set();
      const unique = [];

      for (const item of candidates) {
        const key = `${item.ar}|${item.en}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      }

      const top = unique
        .sort((a, b) => b.class - a.class || (a.ar || a.en).localeCompare(b.ar || b.en))
        .slice(0, 5);

      const maxClass = top[0]?.class ?? 0;
      const base = verdictFromClass(maxClass);

      const names = top.map((x) => x.ar || x.en).filter(Boolean);
      const severe = top.filter((x) => x.class >= 5).map((x) => x.ar || x.en);
      const moderate = top.filter((x) => x.class >= 3 && x.class <= 4).map((x) => x.ar || x.en);

      let reason = "";
      if (severe.length) {
        reason = `تمت مطابقة المنتج مع عناصر عالية التفاعل في نتائجك مثل: ${severe.slice(0, 3).join("، ")}`;
      } else if (moderate.length) {
        reason = `تمت مطابقة المنتج مع عناصر متوسطة التفاعل في نتائجك مثل: ${moderate.slice(0, 3).join("، ")}`;
      } else {
        reason = `لم يظهر في المطابقات المحلية عنصر مرتفع التفاعل، وأقرب عناصر التقرير كانت: ${names.slice(0, 3).join("، ")}`;
      }

      return {
        verdict: base.verdict,
        reason,
        ingredients: names.slice(0, 5).join("، ") || "غير محددة",
        allergens: names.slice(0, 5).join("، ") || "غير واضحة",
        confidence: base.confidence,
        source: "local"
      };
    }

    // استدعاء Gemini فقط إذا لم تكفِ المطابقات المحلية
    async function analyzeWithGemini(name, ctx) {
      const localHints = [];

      const refs = Array.isArray(ctx?.productEstimate?.references)
        ? ctx.productEstimate.references
        : [];
      const matches = Array.isArray(ctx?.localMatches) ? ctx.localMatches : [];

      for (const item of [...refs, ...matches].slice(0, 8)) {
        if (item?.ar || item?.en) {
          localHints.push(`${item.ar || item.en} (class ${item.class ?? 0})`);
        }
      }

      const prompt = `أنت مساعد مختص بالحساسية الغذائية.

اسم المنتج: ${name}
${localHints.length ? `أقرب عناصر من نتائج التحليل السابقة: ${localHints.join("، ")}` : ""}

المطلوب:
1) استنتج نوع المنتج من اسمه.
2) اذكر المكونات المحتملة الشائعة له.
3) اربطها بالمواد التي قد تكون مشكلة مثل:
الحليب، صفار البيض، بياض البيض، الكازين، الجلوتين، القمح، الشعير، الجاودار، السمسم، الخردل، الفول السوداني، اللوز، الكاجو، الفستق، حليب الماعز، حليب الخروف، الجبن الكريمي، الطماطم، الكوسا.
4) أجب بالعربية فقط.
5) لا تستخدم JSON.
6) لا تستخدم markdown.
7) اكتب 5 أسطر فقط وبالترتيب:

الحكم: ...
السبب: ...
المكونات المحتملة: ...
المواد المحسسة المكتشفة: ...
الثقة: ...`;

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
              temperature: 0.15,
              maxOutputTokens: 170,
              topP: 0.8
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "Gemini API failed");
      }

      const rawText = String(
        data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      )
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      let verdict = "";
      let reason = "";
      let ingredients = "";
      let allergens = "";
      let confidence = "";

      const lines = rawText
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (line.startsWith("الحكم:")) verdict = line.replace(/^الحكم:\s*/, "").trim();
        else if (line.startsWith("السبب:")) reason = line.replace(/^السبب:\s*/, "").trim();
        else if (line.startsWith("المكونات المحتملة:")) ingredients = line.replace(/^المكونات المحتملة:\s*/, "").trim();
        else if (line.startsWith("المواد المحسسة المكتشفة:")) allergens = line.replace(/^المواد المحسسة المكتشفة:\s*/, "").trim();
        else if (line.startsWith("الثقة:")) confidence = line.replace(/^الثقة:\s*/, "").trim();
      }

      if (!verdict) verdict = "يحتاج تحقق";
      if (!reason) reason = "لم تكن هناك معلومات كافية لتحديد حكم أدق";
      if (!ingredients) ingredients = "غير محددة";
      if (!allergens) allergens = "غير واضحة";
      if (!confidence) confidence = "منخفضة";

      return { verdict, reason, ingredients, allergens, confidence, source: "gemini" };
    }

    const localResult = analyzeFromLocalContext(q, localContext);

    // إذا وجدنا مطابقة قوية أو متوسطة في التقرير المحلي، لا نحتاج Gemini
    if (localResult && (localResult.confidence === "مرتفعة" || localResult.verdict !== "غالبًا آمن")) {
      const finalText =
        `الحكم: ${localResult.verdict}\n` +
        `السبب: ${localResult.reason}\n` +
        `المكونات المحتملة: ${localResult.ingredients}\n` +
        `المواد المحسسة المكتشفة: ${localResult.allergens}\n` +
        `الثقة: ${localResult.confidence}`;
      return res.status(200).json({ result: finalText });
    }

    // إذا لا توجد مطابقة واضحة، نستخدم Gemini ثم نرجع النتيجة
    let geminiResult = null;
    try {
      geminiResult = await analyzeWithGemini(q, localContext || {});
    } catch (e) {
      geminiResult = {
        verdict: localResult?.verdict || "يحتاج تحقق",
        reason: localResult?.reason || "تعذر الحصول على تحليل إضافي من الخدمة",
        ingredients: localResult?.ingredients || "غير محددة",
        allergens: localResult?.allergens || "غير واضحة",
        confidence: localResult?.confidence || "منخفضة",
        source: "fallback"
      };
    }

    const finalText =
      `الحكم: ${geminiResult.verdict}\n` +
      `السبب: ${geminiResult.reason}\n` +
      `المكونات المحتملة: ${geminiResult.ingredients}\n` +
      `المواد المحسسة المكتشفة: ${geminiResult.allergens}\n` +
      `الثقة: ${geminiResult.confidence}`;

    return res.status(200).json({ result: finalText });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error)
    });
  }
}