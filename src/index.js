const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  export default {
	async fetch(request, env) {
	  if (request.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	  }
  
	  const url = new URL(request.url);
	  const slug = url.pathname.slice(1);
  
	  if (request.method === 'GET' && slug) {
		const originalUrl = await env.LINKS.get(slug);
		if (originalUrl) {
		  return Response.redirect(originalUrl, 301);
		}
		return new Response('Link not found', { status: 404 });
	  }
  
	  if (request.method === 'POST') {
		const body = await request.json();
		const newSlug = await generateAISlug(body.url, env);
		await env.LINKS.put(newSlug, body.url);
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