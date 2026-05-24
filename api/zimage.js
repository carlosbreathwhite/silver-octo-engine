// api/zimage.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, image_url, aspect_ratio, resolution } = req.body;

  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // Calculate dimensions
  const dimensions = calculateDimensions(aspect_ratio || '1:1', resolution || '2K');

  // Prepare image input
  let imageInput = null;
  if (image_url && image_url.trim() !== '') {
    imageInput = image_url;
  }

  try {
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "454dfb341ba686aa964a061fbe7de965ef8e51a684641e11b366305d8359c440",
        input: {
          prompt: prompt,
          image: imageInput,
          width: dimensions.width,
          height: dimensions.height,
          num_inference_steps: 50,
          guidance_scale: 7.5,
        }
      })
    });

    const prediction = await replicateResponse.json();
    const result = await pollForCompletion(prediction.urls.get);
    
    return res.status(200).json({
      success: true,
      output: result.output,
      engine: 'zimage',
      resolution: resolution,
      aspect_ratio: aspect_ratio
    });

  } catch (error) {
    console.error('Z-Image error:', error);
    return res.status(500).json({ error: error.message || 'Z-Image editing failed' });
  }
}

function calculateDimensions(aspect_ratio, resolution) {
  const ratios = {
    '1:1': 1, '16:9': 16/9, '9:16': 9/16,
    '4:3': 4/3, '3:4': 3/4
  };
  const resMap = { '1K': 1024, '2K': 2048, '4K': 4096 };
  const longSide = resMap[resolution] || 2048;
  const ratio = ratios[aspect_ratio] || 1;
  
  if (ratio >= 1) {
    return { width: longSide, height: Math.round(longSide / ratio) };
  } else {
    return { height: longSide, width: Math.round(longSide * ratio) };
  }
}

async function pollForCompletion(getUrl, maxAttempts = 90, interval = 1500) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(getUrl);
    const data = await response.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Prediction failed');
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for image generation');
}