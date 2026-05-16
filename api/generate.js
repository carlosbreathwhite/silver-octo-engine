export default async function handler(req, res) {
  // Allow requests from any origin (your Conjure app)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, links, ratio, res: resolution } = req.body;

    if (!text) return res.status(400).json({ success: false, error: 'Text is required' });

    // Build form data to forward to NanoBanana
    const form = new URLSearchParams();
    form.append('text', text);
    if (ratio)      form.append('ratio', ratio);
    if (resolution) form.append('res', resolution);
    if (links)      form.append('links', links);

    const response = await fetch('https://zecora0.serv00.net/ai/NanoBanana.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Proxy error: ' + err.message });
  }
}
