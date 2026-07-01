const GAS_URL = "https://script.google.com/macros/s/AKfycbyRhmxkBHyPqaD2dCFK46g0mUS2c0k6t5rJSj6fY61xiv3v4TAzhxIPtaFjX153OHcs/exec";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    let body = req.body;
    if (!body && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf-8");
      try { body = JSON.parse(raw); } catch { body = {}; }
    }

    // redirect: "manual"로 직접 처리 — POST→GET 변환 방지
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },  // ← application/json → text/plain (GAS 호환)
      body: JSON.stringify(body),
      redirect: "manual"  // ← follow 대신 manual
    });

    // 302 redirect면 Location으로 다시 POST
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location");
      const response2 = await fetch(location, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body)
      });
      const text2 = await response2.text();
      let data2;
      try { data2 = JSON.parse(text2); } catch { data2 = { ok: false, message: text2 }; }
      return res.status(200).json(data2);
    }

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, message: text }; }
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}
