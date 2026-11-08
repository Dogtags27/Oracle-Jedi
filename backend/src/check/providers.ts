import { env } from "../env";

export interface WebPage {
  url: string;
  title: string;
  text: string;
}

export async function exaSearch(query: string, signal: AbortSignal): Promise<WebPage[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": env.exaApiKey, "content-type": "application/json" },
    body: JSON.stringify({ query, type: "auto", numResults: 6, contents: { text: { maxCharacters: 4000 } } }),
    signal,
  });
  if (!res.ok) throw new Error(`exa_${res.status}`);
  const body = (await res.json()) as { results?: { url: string; title?: string; text?: string }[] };
  return (body.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", text: r.text ?? "" }));
}

export async function tavilySearch(query: string, signal: AbortSignal): Promise<WebPage[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.tavilyApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ query, max_results: 6, search_depth: "basic" }),
    signal,
  });
  if (!res.ok) throw new Error(`tavily_search_${res.status}`);
  const body = (await res.json()) as { results?: { url: string; title?: string; content?: string }[] };
  return (body.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", text: r.content ?? "" }));
}

export async function tavilyExtract(urls: string[], signal: AbortSignal): Promise<WebPage[]> {
  if (urls.length === 0) return [];
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.tavilyApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ urls, extract_depth: "basic" }),
    signal,
  });
  if (!res.ok) throw new Error(`tavily_extract_${res.status}`);
  const body = (await res.json()) as { results?: { url: string; raw_content?: string }[] };
  return (body.results ?? []).filter((r) => r.raw_content).map((r) => ({ url: r.url, title: "", text: r.raw_content ?? "" }));
}
