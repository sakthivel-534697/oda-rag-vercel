'use strict';
const fetch = require('node-fetch');

const QDRANT_URL = (process.env.QDRANT_URL || '').replace(/\/+$/, '');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = "enterprise_knowledge";
const MODEL_NAME = "sentence-transformers/all-minilm-l6-v2";

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { query, top_k = 2 } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(200).json({ results: [] });
  }

  try {
    // Query directly using Qdrant's Inference search
    const queryRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': QDRANT_API_KEY
      },
      body: JSON.stringify({
        query: {
          text: query.trim(),
          model: MODEL_NAME
        },
        limit: Number(top_k) || 2,
        with_payload: true
      })
    });

    const data = await queryRes.json();
    if (!queryRes.ok) {
      throw new Error(`Qdrant query failed: ${JSON.stringify(data)}`);
    }

    const hits = (data.result && data.result.points) || data.result || [];
    const results = hits.map(hit => ({
      text: hit.payload ? hit.payload.text : '',
      score: hit.score
    }));

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
