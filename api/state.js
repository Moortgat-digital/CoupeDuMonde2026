import { list, put } from "@vercel/blob";

const blobPath = "state/pronostics-state.json";

const emptyState = {
  predictions: {},
  results: {},
  teamProgress: {},
  matchOverrides: {},
  updatedAt: null,
};

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  try {
    if (request.method === "GET") {
      return response.status(200).json(await readState());
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return response.status(405).json({ error: "Method not allowed" });
    }

    const body = await readBody(request);

    if (body.action === "savePrediction") {
      return savePrediction(body, response);
    }

    if (body.action === "saveAdmin") {
      return saveAdmin(body, request, response);
    }

    return response.status(400).json({ error: "Unknown action" });
  } catch (error) {
    return response.status(500).json({ error: error.message || "Unexpected error" });
  }
}

async function savePrediction(body, response) {
  if (!body.participant || typeof body.participant !== "string") {
    return response.status(400).json({ error: "Participant is required" });
  }

  const state = await readState();
  state.predictions[body.participant] = body.prediction || { champion: "", matches: {} };
  state.updatedAt = new Date().toISOString();

  await writeState(state);
  return response.status(200).json(state);
}

async function saveAdmin(body, request, response) {
  const configuredSecret = process.env.ADMIN_SECRET;
  const providedSecret = request.headers["x-admin-secret"] || body.adminSecret;

  if (!configuredSecret) {
    return response.status(500).json({ error: "ADMIN_SECRET is not configured" });
  }

  if (providedSecret !== configuredSecret) {
    return response.status(401).json({ error: "Invalid admin secret" });
  }

  const state = await readState();
  state.results = body.results || {};
  state.teamProgress = body.teamProgress || {};
  state.matchOverrides = body.matchOverrides || {};
  state.updatedAt = new Date().toISOString();

  await writeState(state);
  return response.status(200).json(state);
}

async function readState() {
  const { blobs } = await list({ prefix: blobPath, limit: 1 });
  const blob = blobs.find((item) => item.pathname === blobPath);

  if (!blob) return structuredClone(emptyState);

  const blobResponse = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
  if (!blobResponse.ok) return structuredClone(emptyState);

  return {
    ...structuredClone(emptyState),
    ...(await blobResponse.json()),
  };
}

async function writeState(state) {
  await put(blobPath, JSON.stringify(state, null, 2), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readBody(request) {
  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  if (Buffer.isBuffer(request.body)) {
    const rawBody = request.body.toString("utf8");
    return rawBody ? JSON.parse(rawBody) : {};
  }

  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}
