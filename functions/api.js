export async function onRequest(context) {
  const { request } = context;

  // Handle CORS OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const bodyText = await request.text();
    const payload = JSON.parse(bodyText);
    const action = payload.action || '';

    // Cache-able actions: starts with GET_ or is GEOCODE
    const isCacheable = action.startsWith('GET_') || action === 'GEOCODE';
    
    const targetGasUrl = 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';

    const cache = caches.default;
    let cacheKey;
    if (isCacheable) {
      const url = new URL(request.url);
      url.pathname = `/api/cache/${action}`;
      
      // Hash the body text to construct a unique cache key URL
      const hash = await sha256(bodyText);
      url.searchParams.set('h', hash);
      cacheKey = new Request(url.toString(), {
        method: 'GET',
      });

      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Proxy-Cache', 'HIT');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        });
      }
    }

    // Call GAS Web App
    const gasResponse = await fetch(targetGasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: bodyText,
    });

    const responseBody = await gasResponse.text();
    
    // Build response to return
    const responseHeaders = {
      'Content-Type': 'application/json;charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Proxy-Cache': 'MISS',
    };

    if (isCacheable) {
      // Cache on Cloudflare Edge for 60 seconds
      responseHeaders['Cache-Control'] = 'public, max-age=60';
    } else {
      responseHeaders['Cache-Control'] = 'no-store';
    }

    const response = new Response(responseBody, {
      status: 200,
      headers: responseHeaders,
    });

    if (isCacheable) {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
