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

  const { docs } = req.body || {};
  if (!Array.isArray(docs) || docs.length === 0) {
    return res.status(400).json({ error: 'Body must contain a non-empty "docs" array' });
  }

  try {
    // 1. Verify or create collection with 384 dimensions
    const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: { 'api-key': QDRANT_API_KEY }
    });

    if (checkRes.status === 404) {
      const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': QDRANT_API_KEY
        },
        body: JSON.stringify({
          vectors: { size: 384, distance: 'Cosine' }
        })
      });
      if (!createRes.ok) {
        const errJson = await createRes.json();
        throw new Error(`Failed to create collection: ${JSON.stringify(errJson)}`);
      }
    }

    // 2. Format points using Qdrant Cloud Inference Object
    const points = docs.map((doc, i) => ({
      id: Date.now() + i,
      vector: {
        text: doc.text,
        model: MODEL_NAME
      },
      payload: {
        text: doc.text,
        ...(doc.metadata || {})
      }
    }));

    // 3. Upsert points into Qdrant Cloud
    const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'api-key': QDRANT_API_KEY
      },
      body: JSON.stringify({ points })
    });

    const resultData = await upsertRes.json();
    if (!upsertRes.ok) {
      throw new Error(`Qdrant upsert failed: ${JSON.stringify(resultData)}`);
    }

    return res.status(200).json({ status: 'success', count: points.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
