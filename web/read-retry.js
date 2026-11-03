// La instancia de clase puede devolver 502 transitorios. Solo se repiten lecturas.
export async function fetchWithReadRetry(input, init, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const method = (init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
  const attempts = ['GET','HEAD'].includes(method) ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    init?.signal?.throwIfAborted();
    const response = await fetcher(input, init);
    if (![502,503,504].includes(response.status) || attempt === attempts - 1) return response;
    await response.body?.cancel().catch(() => {});
    await pause(400 * (attempt + 1));
  }
}
