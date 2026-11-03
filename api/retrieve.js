"use strict";
const fetch = require("node-fetch");
const { QdrantClient } = require("@qdrant/js-client-rest");

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const COLLECTION_NAME = "enterprise_knowledge";

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
  return Array.isArray(data[0]) ? data[0] : data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { query, top_k = 2 } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(200).json({ results: [] });
  }

  try {
    const client = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
    });
    const queryVector = await getEmbedding(query.trim());

    const hits = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: Number(top_k) || 2,
    });

    const results = hits.map((hit) => ({
      text: hit.payload ? hit.payload.text : "",
      score: hit.score,
    }));

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
