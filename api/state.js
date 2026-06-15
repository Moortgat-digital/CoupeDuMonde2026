import { list, put } from "@vercel/blob";

const blobPath = "state/pronostics-state.json";

// Base publique du store Blob, mise en cache pour éviter les appels `list()`
// (facturés comme "Advanced Operations"). On la déduit du token Blob, puis on
// la confirme avec l'URL renvoyée par `put()`.
let cachedBaseUrl = null;

function getBlobBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;

  // Token au format vercel_blob_rw_<storeId>_<secret> ; le storeId est aussi le
  // sous-domaine de l'URL publique : https://<storeId>.public.blob.vercel-storage.com
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  const parts = token.split("_");
  if (parts.length >= 5 && parts[3]) {
    cachedBaseUrl = `https://${parts[3].toLowerCase()}.public.blob.vercel-storage.com`;
  }

  return cachedBaseUrl;
}

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
  // Lecture directe via l'URL publique du CDN : ce simple GET HTTP n'est PAS
  // facturé comme une opération Blob, contrairement à `list()`.
  const baseUrl = getBlobBaseUrl();
  if (baseUrl) {
    const directResponse = await fetch(`${baseUrl}/${blobPath}?v=${Date.now()}`, {
      cache: "no-store",
    });

    if (directResponse.ok) {
      return {
        ...structuredClone(emptyState),
        ...(await directResponse.json()),
      };
    }

    // 404 = état pas encore créé : on renvoie l'état vide sans appeler `list()`.
    if (directResponse.status === 404) return structuredClone(emptyState);
  }

  // Filet de sécurité (token absent ou réponse inattendue) : on retombe sur la
  // méthode `list()` historique et on mémorise la base pour les prochains appels.
  const { blobs } = await list({ prefix: blobPath, limit: 1 });
  const blob = blobs.find((item) => item.pathname === blobPath);

  if (!blob) return structuredClone(emptyState);

  cacheBaseUrlFrom(blob.url);

  const blobResponse = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
  if (!blobResponse.ok) return structuredClone(emptyState);

  return {
    ...structuredClone(emptyState),
    ...(await blobResponse.json()),
  };
}

async function writeState(state) {
  const result = await put(blobPath, JSON.stringify(state, null, 2), {
    access: "public",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });

  // On garde l'URL exacte renvoyée par Vercel pour fiabiliser les lectures.
  cacheBaseUrlFrom(result.url);
}

function cacheBaseUrlFrom(blobUrl) {
  try {
    cachedBaseUrl = new URL(blobUrl).origin;
  } catch {
    // URL invalide : on conserve la base déjà connue.
  }
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
