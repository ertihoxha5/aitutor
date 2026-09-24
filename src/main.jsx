import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const greeting = { role: 'assistant', content: 'Përshëndetje! Jam MaturaAI. Më dërgo një ushtrim algjebre dhe më trego ku ke mbetur.' };
function App() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null), end = useRef(null), input = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, pending, error]);
  useEffect(() => () => request.current?.abort(), []);
  async function send(history) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setPending(true); setError('');
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Tutori nuk është i disponueshëm. Provo përsëri.');
      if (data.message?.role !== 'assistant' || typeof data.message.content !== 'string') throw new Error('Përgjigjja nuk është e vlefshme. Provo përsëri.');
      if (request.current === controller) setMessages([...history, data.message]);
    } catch (err) {
      if (request.current === controller) setError(err.name === 'AbortError' ? 'Përgjigjja po vonon. Provo përsëri.' : err instanceof TypeError ? 'Lidhja me serverin dështoi. Kontrollo lidhjen dhe provo përsëri.' : err.message);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setPending(false); input.current?.focus(); }
    }
  }
  function submit(event) {
    event.preventDefault();
    if (!draft.trim() || request.current || error) return;
    const history = [...messages, { role: 'user', content: draft.trim() }];
    setMessages(history); setDraft(''); send(history);
  }
  function reset() {
    request.current?.abort(); request.current = null;
    setMessages([]); setDraft(''); setError(''); setPending(false); input.current?.focus();
  }
  function editFailed() { setDraft(messages.at(-1)?.content || ''); setMessages(messages.slice(0, -1)); setError(''); input.current?.focus(); }
  return <main className="app">
    <header className="header"><div className="brand"><div className="logo" aria-hidden="true">m<span>²</span></div><div><h1>Matura<span>AI</span></h1><p>Tutori yt për përgatitjen në Maturë</p></div></div><button className="new-chat" onClick={reset}><span aria-hidden="true">＋</span> Bisedë e re</button></header>
    <aside className="notice"><span aria-hidden="true">ⓘ</span> AI mund të gabojë. Verifiko shpjegimet e rëndësishme me mësimdhënësin.</aside>
    <section className="chat" aria-label="Biseda me MaturaAI">
      <div className="chat-heading"><span className="status-dot" /> Algjebër, hap pas hapi <span className="tag">PRAKTIKË</span></div>
      <div className="conversation" role="log" aria-label="Mesazhet" aria-live="polite" aria-relevant="additions text">
        {[greeting, ...messages].map((message, i) => <article className={`message ${message.role}`} key={i}><div className="avatar" aria-hidden="true">{message.role === 'assistant' ? 'm' : 'Ti'}</div><div className="message-body"><div className="sender">{message.role === 'assistant' ? 'MaturaAI' : 'Ti'}</div><div className="bubble">{message.content}</div></div></article>)}
        {pending && <div className="loading" role="status"><span className="status-dot" /> MaturaAI po mendon…</div>}
        {error && <div className="error" role="alert"><p>{error}</p><button onClick={() => send(messages)}>Provo përsëri</button><button onClick={editFailed}>Ndrysho mesazhin</button></div>}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="composer"><label className="sr-only" htmlFor="message">Mesazhi yt</label><div className="input-wrap"><textarea id="message" ref={input} rows="2" maxLength={6000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Shkruaj ushtrimin ose pyetjen tënde…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(e); } }} /><button className="send" type="submit" disabled={!draft.trim() || pending || !!error}>Dërgo <span aria-hidden="true">↑</span></button></div><div className="input-help"><span>Enter për të dërguar · Shift + Enter për rresht të ri</span><span>{draft.length}/6000</span></div></form>
    </section>
    <footer>Prototip për AI Hackathon <span>·</span> Jo shërbim zyrtar i Maturës.</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
