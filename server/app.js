import express from 'express';
import rateLimit from 'express-rate-limit';
import Groq from 'groq-sdk';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from './prompt.js';

export function createApp({ apiKey = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL, client, rateLimitMax = 20 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const groq = client ?? (apiKey && apiKey !== 'your_groq_api_key_here' ? new Groq({ apiKey, timeout: 25000, maxRetries: 0 }) : null);
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60000, limit: rateLimitMax, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Ke dërguar shumë mesazhe. Prit një minutë dhe provo përsëri.' } }));
  app.use(express.json({ limit: '96kb' }));
  app.post('/api/chat', async (req, res) => {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40 ||
      messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 6000) ||
      messages.reduce((sum, m) => sum + m.content.length, 0) > 24000 || messages.at(-1).role !== 'user') {
      return res.status(400).json({ error: 'Biseda nuk është e vlefshme. Kufiri: 40 mesazhe, 6 000 shenja për mesazh dhe 24 000 shenja gjithsej. Shkurto mesazhin ose fillo një bisedë të re.' });
    }
    if (!groq || !model?.trim()) return res.status(503).json({ error: 'Tutori nuk është konfiguruar ende. Duhet të vendosen GROQ_API_KEY dhe GROQ_MODEL në server.' });
    try {
      const completion = await groq.chat.completions.create({ model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.map(({ role, content }) => ({ role, content }))],
        max_completion_tokens: 2048,
      }, { signal: AbortSignal.timeout(25000) });
      const content = completion.choices?.[0]?.message?.content;
      if (!content?.trim() || completion.choices[0].finish_reason === 'length' || content.length > 6000) throw new Error('Invalid completion');
      return res.json({ message: { role: 'assistant', content } });
    } catch (error) {
      if (error.status === 429) return res.status(429).json({ error: 'Tutori ka arritur kufirin e kërkesave. Prit pak dhe provo përsëri.' });
      if (['AbortError', 'TimeoutError', 'APIConnectionTimeoutError'].includes(error.name)) return res.status(504).json({ error: 'Përgjigjja po vonon. Provo përsëri.' });
      if ([401, 403, 404].includes(error.status)) return res.status(503).json({ error: 'Konfigurimi i tutorit nuk është i vlefshëm. Kontrollo çelësin dhe modelin në server.' });
      return res.status(502).json({ error: 'Nuk mund të lidhemi me tutorin tani. Provo përsëri.' });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Kërkesa nuk u gjet.' }));
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Kërkesa nuk është e vlefshme ose është shumë e gjatë.' }));
  return app;
}
