
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body || {};
  if (!body || Object.keys(body).length === 0) {
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const result = analyzeText(message);
  return res.status(200).json({
    message,
    score: result.score,
    verdict: result.verdict,
    tip: result.tip
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });
}

function analyzeText(message) {
  const lowered = message.toLowerCase();
  let score = 0;

  const keywords = [
    'urgence', 'urgent', 'immédiatement', 'immediatement', 'vite',
    'cliquez', 'cliquer', 'payez', 'paiement', 'vérifiez', 'verifiez',
    'blocage', 'compte', 'récompense', 'recompense', 'gagner', 'gagnez',
    'argent', 'fcfa', 'otp', 'code otp', 'lien', 'http', 'https', 'partagez'
  ];

  for (const kw of keywords) {
    if (lowered.includes(kw)) score += 7;
  }

  if (message.includes('!')) score += 8;
  if (message.length > 220) score += 5;
  if (lowered.includes('http://') || lowered.includes('https://')) score += 12;
  if (lowered.includes('urgent') || lowered.includes('immédiatement') || lowered.includes('immediatement')) score += 12;
  if (lowered.includes('payez') || lowered.includes('paiement') || lowered.includes('argent')) score += 18;
  if (lowered.includes('otp') || (lowered.includes('code') && lowered.includes('otp'))) score += 15;

  score = Math.min(score, 100);

  if (score >= 70) {
    return {
      score,
      verdict: 'Arnaque probable',
      tip: 'Vérifiez via le canal officiel avant de cliquer ou de payer.'
    };
  }

  if (score >= 40) {
    return {
      score,
      verdict: 'Suspect',
      tip: 'Faites attention : demandez une vérification supplémentaire avant d’agir.'
    };
  }

  return {
    score,
    verdict: 'Probablement légitime',
    tip: 'Restez vigilant et vérifiez avec une source fiable.'
  };
}
