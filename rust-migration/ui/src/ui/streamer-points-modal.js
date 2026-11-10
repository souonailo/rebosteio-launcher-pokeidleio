(() => {
  'use strict';

  // Small styled replacement for the old browser title tooltip.
  const format = value => Number(value || 0).toLocaleString('pt-BR');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  let popover = null;
  let trigger = null;
  let account = 0;
  let platform = 'twitch';
  let pinned = false;
  let closeTimer = null;
  let signature = '';

  function cancelClose() {
    if (closeTimer !== null) clearTimeout(closeTimer);
    closeTimer = null;
  }

  function close() {
    cancelClose();
    if (popover) popover.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    trigger = null;
    pinned = false;
    signature = '';
  }

  function scheduleClose() {
    if (pinned) return;
    cancelClose();
    closeTimer = setTimeout(close, 220);
  }

  function position() {
    if (!popover || popover.hidden || !trigger?.isConnected) return;
    const anchor = trigger.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const gutter = 10;
    let x = anchor.right + gutter;
    if (x + width > window.innerWidth - gutter) x = anchor.left - width - gutter;
    if (x < gutter) x = Math.max(gutter, Math.min(anchor.left, window.innerWidth - width - gutter));
    const y = Math.max(gutter, Math.min(anchor.top - 12, window.innerHeight - height - gutter));
    popover.style.left = `${Math.round(x)}px`;
    popover.style.top = `${Math.round(y)}px`;
  }

  function ensure() {
    if (popover) return popover;
    if (!document.body) return null;
    popover = document.createElement('section');
    popover.className = 'spm-popover is-twitch';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-label', 'Pontos dos streamers');
    popover.innerHTML = `
      <div class="spm-top">
        <div class="spm-headlines"><strong class="spm-heading"></strong><span class="spm-summary"></span></div>
        <button type="button" class="spm-close" aria-label="Fechar pontos dos streamers">×</button>
      </div>
      <div class="spm-list" role="list"></div>`;
    document.body.appendChild(popover);
    popover.querySelector('.spm-close').addEventListener('click', close);
    popover.addEventListener('mouseenter', cancelClose);
    popover.addEventListener('mouseleave', scheduleClose);
    document.addEventListener('pointerdown', event => {
      if (!popover.hidden && !popover.contains(event.target) && !trigger?.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !popover.hidden) {
        close();
        event.preventDefault();
      }
    });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return popover;
  }

  function refresh() {
    if (!popover || popover.hidden) return;
    const snapshot = window.PioBattleHud?.pointsSnapshot(account, platform);
    if (!snapshot) return;
    const next = JSON.stringify([platform, account, snapshot]);
    if (next === signature) { position(); return; }
    signature = next;
    popover.classList.toggle('is-twitch', platform === 'twitch');
    popover.classList.toggle('is-kick', platform === 'kick');
    popover.querySelector('.spm-heading').textContent = `${platform === 'twitch' ? 'Twitch' : 'Kick'} · Conta ${account + 1}`;
    popover.querySelector('.spm-summary').textContent = `${snapshot.verifiedCount} confirmados · ${format(snapshot.total)} pts`;
    const list = popover.querySelector('.spm-list');
    const previousScroll = list.scrollTop;
    const channels = [...snapshot.channels].sort((a, b) =>
      Number(b.verified) - Number(a.verified) || a.login.localeCompare(b.login));
    list.innerHTML = channels.length ? channels.map(channel => `
      <div class="spm-row${channel.verified ? ' is-confirmed' : ''}" role="listitem">
        <span class="spm-name">${escape(channel.login)}</span>
        <span class="spm-value">${channel.verified ? format(channel.points) : 'indisponível'}</span>
      </div>`).join('') : `<div class="spm-empty">${snapshot.hasOfficialList ? 'Nenhum canal oficial nesta conta.' : 'Aguardando lista de canais do jogo.'}</div>`;
    list.scrollTop = previousScroll;
    position();
  }

  function show(index, selectedPlatform, element, pin) {
    if (!Number.isInteger(index) || index < 0 || index >= 4 || !['twitch', 'kick'].includes(selectedPlatform) || !element) return;
    if (!ensure()) return;
    cancelClose();
    if (pin && pinned && trigger === element && !popover.hidden) return close();
    if (trigger && trigger !== element) trigger.setAttribute('aria-expanded', 'false');
    trigger = element;
    account = index;
    platform = selectedPlatform;
    pinned = !!pin;
    signature = '';
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    popover.querySelector('.spm-list').scrollTop = 0;
    refresh();
  }

  // Hover behaves like the original tooltip; clicking pins it for scrolling through long lists.
  window.PioStreamerPoints = {
    preview(index, selectedPlatform, element) {
      if (pinned) return;
      show(index, selectedPlatform, element, false);
    },
    open(index, selectedPlatform, element) { show(index, selectedPlatform, element, true); },
    leave: scheduleClose,
    close,
    refresh
  };
})();
