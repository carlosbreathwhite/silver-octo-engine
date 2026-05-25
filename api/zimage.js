export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  maxDuration: 300 // Replicate polling needs time (requires Vercel Pro)
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, image_url, aspect_ratio, resolution } = req.body;

  if (!prompt) return res.status(400).json({ success: false, error: 'Missing prompt' });

  const dimensions = calculateDimensions(aspect_ratio || '1:1', resolution || '2K');

  try {
    const modelInput = {
      prompt: prompt,
      width: dimensions.width,
      height: dimensions.height,
      num_inference_steps: 50,
      guidance_scale: 7.5,
    };

    if (image_url) {
      modelInput.image = image_url;
    }

    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.REPLICATE_API_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '454dfb341ba686aa964a061fbe7de965ef8e51a684641e11b366305d8359c440',
        input: modelInput,
      }),
    });

    if (!replicateResponse.ok) {
      const errBody = await replicateResponse.json().catch(function() { return {}; });
      throw new Error(errBody.detail || 'Replicate API returned ' + replicateResponse.status);
    }

    const prediction = await replicateResponse.json();

    if (!prediction.urls || !prediction.urls.get) {
      throw new Error('Invalid prediction response from Replicate');
    }

    const result = await pollForCompletion(prediction.urls.get);

    let outputUrl = result.output;
    if (Array.isArray(outputUrl)) {
      outputUrl = outputUrl[0];
      if (typeof outputUrl === 'object' && outputUrl.url) {
        outputUrl = outputUrl.url;
      }
    }

    if (!outputUrl) {
      throw new Error('No image returned from model');
    }

    return res.status(200).json({
      success: true,
      output: outputUrl,
      engine: 'zimage',
    });

  } catch (error) {
    console.error('Z-Image error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Z-Image editing failed' });
  }
}

function calculateDimensions(aspect_ratio, resolution) {
  const ratios = { '1:1': 1, '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '3:4': 3 / 4 };
  const resMap = { '1K': 1024, '2K': 2048, '4K': 4096 };
  const longSide = resMap[resolution] || 2048;
  const ratio = ratios[aspect_ratio] || 1;

  if (ratio >= 1) {
    return { width: longSide, height: Math.round(longSide / ratio) };
  } else {
    return { height: longSide, width: Math.round(longSide * ratio) };
  }
}

async function pollForCompletion(getUrl, maxAttempts = 120, interval = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(getUrl, {
      headers: {
        'Authorization': 'Bearer ' + process.env.REPLICATE_API_TOKEN,
      },
    });

    if (!response.ok) {
      throw new Error('Polling failed with status ' + response.status);
    }

    const data = await response.json();

    if (data.status === 'succeeded') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Prediction failed');
    if (data.status === 'canceled') throw new Error('Prediction was canceled');

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for image generation');
}
