// Vercel Serverless Function - Google Apps Script 프록시
// 파일 위치: api/gas.js

const GAS_URL = "https://script.google.com/macros/s/AKfycbyRhmxkBHyPqaD2dCFK46g0mUS2c0k6t5rJSj6fY61xiv3v4TAzhxIPtaFjX153OHcs/exec";

export const config = {
  api: { bodyParser: true }   // ← body 자동 파싱 명시 (Next.js/Vercel 기본값이지만 명시)
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // req.body가 undefined인 경우 직접 raw text 파싱
    let body = req.body;
    if (!body && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf-8");
      try { body = JSON.parse(raw); } catch { body = {}; }
    }

    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow"
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, message: text }; }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}
