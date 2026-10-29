"use strict";
const fetch = require("node-fetch");
const { QdrantClient } = require("@qdrant/js-client-rest");

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const COLLECTION_NAME = "enterprise_knowledge";

// Generates 384-dimensional vector embeddings using Hugging Face router
async function getEmbedding(text) {
  const url =
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HF Embedding error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  // Handle nested output if returned as [[...]]
  return Array.isArray(data[0]) ? data[0] : data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { docs } = req.body || {};
  if (!Array.isArray(docs) || docs.length === 0) {
    return res
      .status(400)
      .json({ error: 'Body must contain a non-empty "docs" array' });
  }

  try {
    const client = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
    });

    // Initialize collection if not yet created
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION_NAME,
    );
    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: { size: 384, distance: "Cosine" },
      });
    }

    const points = [];
    for (let i = 0; i < docs.length; i++) {
      const text = docs[i].text;
      if (!text) continue;

      const vector = await getEmbedding(text);
      points.push({
        id: Date.now() + i,
        vector: vector,
        payload: { text: text, ...(docs[i].metadata || {}) },
      });
    }

    await client.upsert(COLLECTION_NAME, { points });
    return res.status(200).json({ status: "success", count: points.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
