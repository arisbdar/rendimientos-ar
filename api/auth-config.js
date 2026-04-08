export default async function handler(req, res) {
  const allowedOrigins = [
    'https://rendimientos.co',
    'https://rendimientos-ar.netlify.app',
  ];
  const origin = (req.headers || {}).origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  });
}
