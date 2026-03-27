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

    // قائمة المواد المحسسة/الحساسة التي نطابقها برمجيًا
    const allergenRules = [
      {
        key: "الحليب",
        words: [
          "حليب", "لبن", "زبادي", "جبنة", "جبن", "لبنة", "قشطة", "كريمة", "زبدة",
          "milk", "dairy", "cheese", "yogurt", "cream", "butter"
        ]
      },
      {
        key: "اللاكتوز",
        words: ["لاكتوز", "lactose"]
      },
      {
        key: "الكازين",
        words: ["كازين", "casein", "caseinate", "sodium caseinate", "calcium caseinate"]
      },
      {
        key: "مصل اللبن",
        words: ["مصل اللبن", "شرش اللبن", "whey", "whey protein", "whey powder"]
      },
      {
        key: "البيض",
        words: [
          "بيض", "صفار البيض", "بياض البيض", "مايونيز",
          "egg", "eggs", "egg yolk", "egg white", "mayonnaise"
        ]
      },
      {
        key: "الصويا",
        words: [
          "صويا", "ليسيثين الصويا", "بروتين الصويا",
          "soy", "soya", "soy lecithin", "soy protein"
        ]
      },
      {
        key: "الجلوتين",
        words: ["جلوتين", "gluten"]
      },
      {
        key: "القمح",
        words: ["قمح", "سميد", "دقيق القمح", "wheat", "durum", "semolina", "wheat flour"]
      },
      {
        key: "الشعير",
        words: ["شعير", "barley", "malt", "malted barley"]
      },
      {
        key: "الجاودار",
        words: ["جاودار", "rye", "spelt"]
      },
      {
        key: "الشوفان",
        words: ["شوفان", "oat", "oats"]
      },
      {
        key: "الفول السوداني",
        words: ["فول سوداني", "peanut", "peanuts", "groundnut"]
      },
      {
        key: "المكسرات",
        words: ["مكسرات", "nuts", "tree nuts"]
      },
      {
        key: "اللوز",
        words: ["لوز", "almond", "almonds"]
      },
      {
        key: "الكاجو",
        words: ["كاجو", "cashew", "cashews"]
      },
      {
        key: "الفستق",
        words: ["فستق", "pistachio", "pistachios"]
      },
      {
        key: "البندق",
        words: ["بندق", "hazelnut", "hazelnuts"]
      },
      {
        key: "الجوز",
        words: ["جوز", "walnut", "walnuts"]
      },
      {
        key: "الجوز البرازيلي",
        words: ["جوز برازيلي", "brazil nut", "brazil nuts"]
      },
      {
        key: "البقان",
        words: ["بقان", "pecan", "pecans"]
      },
      {
        key: "الصنوبر",
        words: ["صنوبر", "pine nut", "pine nuts"]
      },
      {
        key: "الماكاديميا",
        words: ["ماكاديميا", "macadamia", "macadamia nuts"]
      },
      {
        key: "السمك",
        words: ["سمك", "سالمون", "تونة", "سردين", "fish", "salmon", "tuna", "sardine"]
      },
      {
        key: "القشريات",
        words: ["قشريات", "shrimp", "prawn", "crustacean", "crustaceans"]
      },
      {
        key: "الروبيان",
        words: ["روبيان", "جمبري", "قريدس", "shrimp", "prawn"]
      },
      {
        key: "سرطان البحر",
        words: ["سرطان البحر", "crab", "lobster"]
      },
      {
        key: "المحار",
        words: ["محار", "oyster", "oysters", "mussel", "mussels", "clam", "clams", "scallop", "squid", "octopus"]
      },
      {
        key: "السمسم",
        words: ["سمسم", "طحينة", "sesame", "tahini"]
      },
      {
        key: "الخردل",
        words: ["خردل", "mustard"]
      },
      {
        key: "الكبريتيت",
        words: ["كبريتيت", "سلفيت", "sulfite", "sulfites", "sulphite", "sulphites"]
      },
      {
        key: "الذرة",
        words: ["ذرة", "corn", "maize", "corn starch"]
      },
      {
        key: "جوز الهند",
        words: ["جوز الهند", "coconut"]
      },
      {
        key: "الخميرة",
        words: ["خميرة", "yeast", "yeast extract"]
      }
    ];

    function detectAllergens(text) {
      const haystack = String(text || "").toLowerCase();
      const found = [];

      for (const rule of allergenRules) {
        if (rule.words.some((w) => haystack.includes(String(w).toLowerCase()))) {
          found.push(rule.key);
        }
      }

      return [...new Set(found)];
    }

    function uniqueArray(arr) {
      return [...new Set((arr || []).filter(Boolean))];
    }

    const prompt = `أنت مساعد مختص بالحساسية الغذائية وبحث المنتجات.

اسم المنتج: ${q}

المطلوب:
1) ابحث على الويب عن هذا المنتج أو أقرب منتج مطابق له.
2) استخرج المكونات من المصادر الظاهرة إن أمكن.
3) إذا لم تجد صفحة مؤكدة، فاذكر المكونات المحتملة الشائعة فقط بوضوح.
4) لا تعطِ الحكم النهائي على الحساسية، فقط أعطني معلومات المنتج والمكونات.
5) أجب بالعربية فقط.
6) لا تستخدم JSON.
7) لا تستخدم markdown.
8) اكتب فقط بهذه الصيغة وبنفس الترتيب:

نوع المنتج: ...
المكونات: ...
ملاحظات: ...
ثقة المكونات: ...`;

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
              parts: [{ text: prompt }]
            }
          ],
          tools: [
            {
              google_search: {}
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 220,
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

    const rawText = String(
      data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
    )
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let productType = "";
    let ingredientsText = "";
    let notesText = "";
    let ingredientsConfidence = "";

    const lines = rawText
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (line.startsWith("نوع المنتج:")) {
        productType = line.replace(/^نوع المنتج:\s*/, "").trim();
      } else if (line.startsWith("المكونات:")) {
        ingredientsText = line.replace(/^المكونات:\s*/, "").trim();
      } else if (line.startsWith("ملاحظات:")) {
        notesText = line.replace(/^ملاحظات:\s*/, "").trim();
      } else if (line.startsWith("ثقة المكونات:")) {
        ingredientsConfidence = line.replace(/^ثقة المكونات:\s*/, "").trim();
      }
    }

    if (!productType) productType = "غير محدد";
    if (!ingredientsText) ingredientsText = "غير محددة";
    if (!notesText) notesText = "لا توجد ملاحظات إضافية";
    if (!ingredientsConfidence) ingredientsConfidence = "منخفضة";

    const analysisText = `${q} ${productType} ${ingredientsText} ${notesText}`;
    const detectedAllergens = detectAllergens(analysisText);

    let verdict = "يحتاج تحقق";
    let reason = "لا توجد معلومات كافية لتأكيد وجود مادة محسسة بشكل حاسم";
    let confidence = "منخفضة";

    if (detectedAllergens.length > 0) {
      verdict = "غير آمن";
      reason = `تم اكتشاف مواد محسسة محتملة في المكونات أو وصف المنتج: ${detectedAllergens.join("، ")}`;
      confidence =
        ingredientsConfidence.includes("مرتفع") || ingredientsConfidence.includes("عالية")
          ? "مرتفعة"
          : ingredientsConfidence.includes("متوسط")
          ? "متوسطة"
          : "متوسطة";
    } else if (
      ingredientsText &&
      ingredientsText !== "غير محددة" &&
      !/غير واضحة|غير معروف|غير محددة/i.test(ingredientsText)
    ) {
      verdict = "يحتاج تحقق";
      reason = "تم العثور على مكونات محتملة لكن لم تُكتشف مادة محسسة واضحة من قائمتك";
      confidence = "منخفضة";
    }

    const grounding =
      data?.candidates?.[0]?.groundingMetadata ||
      data?.candidates?.[0]?.grounding_metadata ||
      null;

    const sources = [];

    const groundingChunks = grounding?.groundingChunks || grounding?.grounding_chunks || [];
    for (const chunk of groundingChunks) {
      const web = chunk?.web;
      if (web?.uri || web?.title) {
        sources.push({
          title: web?.title || web?.uri || "مصدر",
          url: web?.uri || ""
        });
      }
    }

    const uniqueSources = uniqueArray(
      sources.map((s) => JSON.stringify(s))
    ).map((s) => JSON.parse(s));

    const finalText =
      `الحكم: ${verdict}\n` +
      `السبب: ${reason}\n` +
      `نوع المنتج: ${productType}\n` +
      `المكونات المحتملة: ${ingredientsText}\n` +
      `المواد المحسسة المكتشفة: ${detectedAllergens.length ? detectedAllergens.join("، ") : "غير واضحة"}\n` +
      `الثقة: ${confidence}\n` +
      `ملاحظات: ${notesText}`;

    return res.status(200).json({
      result: finalText,
      sources: uniqueSources
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal Server Error",
      details: error?.message || String(error)
    });
  }
}