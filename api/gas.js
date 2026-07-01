const GAS_URL = process.env.GAS_EXEC_URL;

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

    // GAS는 POST → 302 → GET(자동) 구조. redirect: "follow"로 Node fetch가 알아서 처리
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow"   // ← manual 아닌 follow. POST→GET 자동 전환이 정상 동작
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, message: text }; }
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}
