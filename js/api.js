// AlphaFundamental — API Layer (Yahoo Finance via local backend)
import { sleep } from './utils.js';

const cache = {};

async function fetchJSON(url) {
  if (cache[url]) return cache[url];
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  const data = await res.json();
  cache[url] = data;
  return data;
}

export async function fetchAllData(ticker, onProgress) {
  if (onProgress) onProgress('Fetching fundamentals...', 0.2);
  const fundamentals = await fetchJSON(`/api/fundamentals/${ticker}`);
  
  await sleep(100);
  if (onProgress) onProgress('Analysis complete.', 1.0);

  return fundamentals;
}
