import { getStore } from "@netlify/blobs";

const STORE = "shared-sales-report-oct-2026";
const PREFIX = "field:";
const MAX_BODY_BYTES = 20000;
const MAX_VALUE_LENGTH = 10000;
const KEY_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default async (request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Allow": "GET, POST" }
    });
  }

  try {
    const store = getStore(STORE);

    if (request.method === "GET") {
      const { blobs } = await store.list({ prefix: PREFIX });
      const entries = await Promise.all(blobs.map(async (blob) => {
        const value = await store.get(blob.key, { type: "json", consistency: "strong" });
        return [blob.key.slice(PREFIX.length), value];
      }));
      return json(Object.fromEntries(entries));
    }

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large" }, 413);
    }

    let body;
    try { body = JSON.parse(bodyText); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    if (!body || typeof body.key !== "string" || !KEY_PATTERN.test(body.key)) {
      return json({ error: "Invalid field key" }, 400);
    }
    if (typeof body.value !== "string" || body.value.length > MAX_VALUE_LENGTH) {
      return json({ error: "Invalid field value" }, 400);
    }

    await store.setJSON(PREFIX + body.key, body.value);
    return json({ ok: true, key: body.key });
  } catch (error) {
    console.error("Shared report data error:", error);
    return json({ error: "Storage unavailable" }, 500);
  }
};
