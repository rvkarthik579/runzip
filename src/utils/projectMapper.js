export function sanitizeProjectPayload(payload = {}) {
  const name = (payload.name || "Untitled Project").toString().trim().slice(0, 100);
  const summary = (payload.summary || "").toString().trim().slice(0, 280);
  const content = (payload.content || "").toString().slice(0, 50000);

  const metadata = {
    category: (payload.metadata?.category || "general").toString().trim().slice(0, 60),
    tags: Array.isArray(payload.metadata?.tags)
      ? payload.metadata.tags
          .map((item) => item.toString().trim().slice(0, 30))
          .filter(Boolean)
          .slice(0, 20)
      : []
  };

  return { name: name || "Untitled Project", summary, content, metadata };
}
