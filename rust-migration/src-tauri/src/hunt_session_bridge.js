// The view is about to close: finish its official session before handing it off.
(() => {
  if (window.top !== window || window.__idleioTakeHuntSession) return;
  window.__idleioTakeHuntSession = () => {
    const nick = localStorage.getItem('nick');
    if (!nick) throw new Error('Nick da sessão indisponível');
    // app.js saves its in-memory session synchronously on pagehide, including
    // events since the last throttled save. Do not reconstruct it from HUD text.
    window.dispatchEvent(new Event('pagehide'));
    const saved = JSON.parse(localStorage.getItem(`sessao-hunt:${nick.toLowerCase()}`));
    if (!saved || !Number.isFinite(Number(saved.ms))) throw new Error('Histórico de hunt indisponível');
    window.__idleioFreezeGameplay?.();
    const tier = window.__poke?.estado?.outlandTier;
    return { nick, saved, ...(Number.isInteger(tier) && tier > 0 && tier <= 100 ? { outlandTier: tier } : {}) };
  };
})();
