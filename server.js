import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.6-27b";

app.use(express.json({ limit: "10mb" }));

// Serve ONLY the web page (never expose server.js or .env)
app.get(["/", "/safeplate.html"], (req, res) =>
  res.sendFile(path.join(__dirname, "safeplate.html"))
);

app.post("/api/analyze", async (req, res) => {
  try {
    if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY is missing" });

    const { image, mimeType = "image/jpeg", allergies = [], language = "en-IN" } = req.body || {};
    if (!image) return res.status(400).json({ error: "No image received" });

    const prompt = `You are a food label safety assistant. Read this packaged food photo.
User allergies: ${Array.isArray(allergies) && allergies.length ? allergies.join(", ") : "none"}.
Write all text values in the language with code ${language}.
Return ONLY valid JSON, with no extra text, in exactly this shape:
{"verdict":"safe|caution|avoid","summary":"2 short sentences",
"expiry":{"status":"green|yellow|red","text":"short"},
"halal":true,"vegan":false,
"ingredients":[],"allergens":[],"additives":[]}
Rules: if any user allergen is present, verdict must be "avoid".
Use null for halal or vegan if you cannot tell. If text is unreadable, say so. Never guess.`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${image}` } },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error("Groq error", r.status, detail.slice(0, 300));
      return res.status(502).json({ error: `Groq error ${r.status}` });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/); // grab the JSON part
    if (!match) throw new Error("Model did not return JSON");
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scan failed" });
  }
});

app.listen(PORT, () => console.log(`SafePlate AI running on port ${PORT}`));
