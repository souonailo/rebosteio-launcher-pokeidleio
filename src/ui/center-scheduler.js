// One-shot scheduling through the game's existing hunt exit button.
(function (root) {
  function install() {
    const key = '__rebosteioCenterScheduler';
    if (window[key]?.version === 1) return true;
    if (!pickTarget()) return false;

    const style = document.createElement('style');
    style.id = 'rb-center-scheduler-style';
    style.textContent = `
      #rb-center-schedule { width: 34px; min-width: 34px; height: 34px; padding: 0; flex: 0 0 34px; }
      #rb-center-schedule svg { width: 18px; height: 18px; }
      #rb-center-schedule[aria-pressed="true"] { outline: 2px solid #f5ce70; outline-offset: -2px; color: #ffe3a0; }
      #rb-center-schedule:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      #rb-center-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    `;
    document.head.appendChild(style);
    const button = document.createElement('button');
    button.id = 'rb-center-schedule';
    button.className = 'ir-centro';
    button.type = 'button';
    const status = document.createElement('span');
    status.id = 'rb-center-status';
    status.setAttribute('role', 'status');
    const clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>';
    const cancelIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/></svg>';
    let native = null;
    let holder = null;
    let ancora = null;
    let label = null;
    let pending = null;
    let timer = null;
    let destroyed = false;
    const observer = new MutationObserver(refresh);
    const hidden = element => !element || element.hidden || element.classList.contains('hidden');
    const isRendered = element => !!element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    function huntName() { return (label?.textContent || '').trim(); }
    function connected() {
      const socket = window.__poke?.sock;
      return !socket || socket.readyState === 1;
    }
    function inCenter() {
      // This class is painted from the server's noCentro flag, not from a click.
      return !hidden(document.getElementById('centro-curar'));
    }
    // O jogo pinta um botao de ir ao Centro para cada modo: a cena usa #ir-centro dentro de
    // #hunt-saida, o Modo Economia usa #eco-ir-centro dentro da .eco-lugar. O mesmo agendamento
    // serve para os dois, entao o alvo e escolhido pelo modo ativo (e o que estiver renderizado).
    function pickTarget() {
      const cena = document.getElementById('ir-centro');
      const eco = document.getElementById('eco-ir-centro');
      const noEco = document.documentElement.classList.contains('modo-economia');
      return (noEco ? (eco || cena) : (cena || eco)) || null;
    }
    // O nome da hunt tambem muda de lugar: a cena usa #hud-hunt, o painel de economia #eco-onde
    // (mesmo par que o coletor do app ja resolve em index.html:8408).
    function pickLabel() {
      const cena = document.getElementById('hud-hunt');
      const eco = document.getElementById('eco-onde');
      const noEco = document.documentElement.classList.contains('modo-economia');
      return (noEco ? (eco || cena) : (cena || eco)) || null;
    }
    function eligible() {
      const classes = document.documentElement.classList;
      return native?.isConnected && holder?.isConnected && !hidden(holder) && isRendered(holder) && isRendered(native) &&
        !classes.contains('modo-imersivo') &&
        !document.getElementById('pg-clean') && !inCenter() && !!huntName() && connected();
    }
    function paint() {
      const phase = pending?.phase || 'idle';
      if (button.dataset.phase !== phase) {
        button.dataset.phase = phase;
        button.innerHTML = pending ? cancelIcon : clock;
        button.setAttribute('aria-pressed', String(!!pending));
        const text = pending ? (phase === 'sending' ? 'Ida ao Centro solicitada. Clique para cancelar novas tentativas.' : 'Ida ao Centro agendada. Clique para cancelar.') : 'Agendar ida ao Centro Pokémon assim que liberar';
        button.title = text;
        button.setAttribute('aria-label', text);
      }
      const unavailable = !pending && !eligible();
      if (button.disabled !== unavailable) button.disabled = unavailable;
    }
    function stop(message) {
      pending = null;
      if (timer !== null) clearInterval(timer);
      timer = null;
      status.textContent = message;
      paint();
    }
    function watchNodes() {
      observer.disconnect();
      observer.observe(native, { attributes: true, attributeFilter: ['disabled'] });
      if (label) observer.observe(label, { childList: true, characterData: true, subtree: true });
      const cure = document.getElementById('centro-curar');
      if (cure) observer.observe(cure, { attributes: true, attributeFilter: ['class', 'hidden'] });
      for (let parent = native.parentElement; parent; parent = parent.parentElement) {
        observer.observe(parent, { childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
      }
    }
    function bind() {
      const next = pickTarget();
      const acoes = next ? next.closest('.hunt-saida-acoes') : null;
      const novaAncora = acoes && acoes.parentElement ? acoes : next;
      const container = novaAncora ? novaAncora.parentElement : null;
      const hunt = pickLabel();
      if (next === native && container === holder && novaAncora === ancora && hunt === label) return;
      // CENA <-> MODO ECONOMIA e a MESMA ida ao Centro: so muda onde o jogo a pinta, entao o
      // agendamento sobrevive a troca. Trocar de botao DENTRO do mesmo modo (o jogo re-renderiza
      // a tela) continua cancelando, como sempre.
      const trocaDeModo = !!next && !!native && next !== native &&
        (native.id === 'eco-ir-centro' || next.id === 'eco-ir-centro');
      if (pending && !trocaDeModo) stop('Ida cancelada: a tela da hunt mudou.');
      const mantinha = !!(pending && trocaDeModo);
      native = next;
      holder = container;
      ancora = novaAncora;
      label = hunt;
      button.remove();
      status.remove();
      if (!native || !holder || !ancora) return;
      if (mantinha) pending.hunt = huntName(); // #eco-onde pode formatar o nome de outro jeito
      button.className = document.documentElement.classList.contains('modo-economia') ? 'eco-saida-bt' : 'ir-centro';
      // Like the native rope/popup buttons: same row, no reparenting of game controls.
      holder.insertBefore(button, ancora);
      holder.appendChild(status);
      watchNodes();
    }
    function refresh() {
      if (destroyed) return;
      bind();
      if (!pending) { paint(); return; }
      if (inCenter()) { stop('Chegada ao Centro Pokémon confirmada.'); return; }
      if (!eligible() || huntName() !== pending.hunt) { stop('Ida cancelada: você saiu da cena da hunt ou desconectou.'); return; }
      const now = performance.now();
      if (pending.phase === 'sending') {
        // A renewed combat lock permits a retry on the NEXT unlock. Never repeat
        // while the button remains enabled or while the first request is pending.
        if (native.disabled) pending.relocked = true;
        if (pending.relocked && now - pending.sentAt >= 1000) pending.phase = 'waiting';
        else if (now - pending.sentAt >= 10000) { stop('Sem confirmação da ida. Agende novamente se necessário.'); return; }
        else { paint(); return; }
      }
      if (!native.disabled) {
        pending.phase = 'sending';
        pending.sentAt = now;
        pending.relocked = false;
        paint();
        try { native.click(); }
        catch { stop('Não foi possível solicitar a ida ao Centro.'); }
      } else paint();
    }
    button.onclick = event => {
      event.stopPropagation();
      if (pending) { stop('Agendamento cancelado. Uma solicitação já enviada não pode ser desfeita.'); return; }
      if (!eligible()) return;
      pending = { phase: 'waiting', hunt: huntName(), sentAt: 0, relocked: false };
      status.textContent = 'Ida ao Centro agendada. Aguardando a saída liberar.';
      // Only scheduled hunts run a timer. Native disabled mutations also wake
      // refresh immediately, catching short gaps without network polling.
      timer = setInterval(refresh, 100);
      refresh();
    };
    function onNativeClick(event) {
      if (event.target.closest?.('#ir-centro, #eco-ir-centro, #desistir-combate, #escape-rope') && event.isTrusted && pending) stop('Agendamento encerrado: saída manual.');
    }
    function destroy() {
      destroyed = true;
      observer.disconnect();
      if (timer !== null) clearInterval(timer);
      pending = null;
      button.remove();
      status.remove();
      style.remove();
      document.removeEventListener('click', onNativeClick, true);
      window.removeEventListener('pagehide', destroy);
      delete window[key];
    }
    window[key] = { version: 1, destroy };
    document.addEventListener('click', onNativeClick, true);
    window.addEventListener('pagehide', destroy);
    refresh();
    return true;
  }
  const api = { script: () => '(' + install.toString() + ')()' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RebosteioCenterScheduler = api;
})(typeof window === 'object' ? window : globalThis);
