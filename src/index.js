const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  export default {
	async fetch(request, env) {
	  if (request.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	  }
  
	  const url = new URL(request.url);
	  const slug = url.pathname.slice(1);
  
	  if (request.method === 'GET' && slug === 'stats') {
		const result = await env.DB.prepare(
		  'SELECT slug, original_url, created_at, click_count FROM links ORDER BY click_count DESC'
		).all();
		return new Response(JSON.stringify(result.results), {
		  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	  }
  
	  if (request.method === 'GET' && slug) {
		const originalUrl = await env.LINKS.get(slug);
		if (originalUrl) {
		  await env.DB.prepare(
			'UPDATE links SET click_count = click_count + 1 WHERE slug = ?'
		  ).bind(slug).run();
		  return Response.redirect(originalUrl, 301);
		}
		return new Response('Link not found', { status: 404 });
	  }
  
	  if (request.method === 'DELETE') {
		const body = await request.json();
		await env.DB.prepare('DELETE FROM links WHERE slug = ?').bind(body.slug).run();
		await env.LINKS.delete(body.slug);
		return new Response(JSON.stringify({ success: true }), {
		  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	  }
  
	  if (request.method === 'POST') {
		const ip = request.headers.get('CF-Connecting-IP');
		const rateLimitKey = `rate_limit_${ip}`;
		const requests = await env.LINKS.get(rateLimitKey);
  
		if (requests && parseInt(requests) >= 10) {
		  return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
			status: 429,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		  });
		}
  
		await env.LINKS.put(rateLimitKey, requests ? String(parseInt(requests) + 1) : '1', { expirationTtl: 60 });
  
		const body = await request.json();
		const newSlug = await generateAISlug(body.url, env);
		await env.LINKS.put(newSlug, body.url);
		await env.DB.prepare(
		  'INSERT OR IGNORE INTO links (slug, original_url) VALUES (?, ?)'
		).bind(newSlug, body.url).run();
		return new Response(JSON.stringify({
		  shortUrl: `${url.origin}/${newSlug}`
		}), {
		  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	  }
  
	  return new Response('Link Shortener is running', { headers: corsHeaders });
	}
  };
  
  async function generateAISlug(url, env) {
	try {
	  const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: [
		  {
			role: 'system',
			content: 'You are a URL slug generator. Given a URL, respond with only a short 2-4 word kebab-case slug describing the page content. No punctuation, no explanation, just the slug.'
		  },
		  {
			role: 'user',
			content: url
		  }
		]
	  });
	  const slug = response.response
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 50);
	  return slug || generateFallbackSlug();
	} catch (e) {
	  return generateFallbackSlug();
	}
  }
  
  function generateFallbackSlug() {
	return Math.random().toString(36).substring(2, 8);
  }