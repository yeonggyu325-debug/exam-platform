const GAS_URL = "https://script.google.com/macros/s/AKfycbyRhmxkBHyPqaD2dCFK46g0mUS2c0k6t5rJSj6fY61xiv3v4TAzhxIPtaFjX153OHcs/exec";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const body = req.method === "POST" ? req.body : {};
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
