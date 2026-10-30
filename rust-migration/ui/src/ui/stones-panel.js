(function(root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render({ today, week, accounts, prices, icons, at, tax = .15 }) {
    const names = Object.keys(week).sort((a,b) => a.localeCompare(b));
    if (!names.length) return '<div class="cd-empty">Nenhuma pedra registrada ainda.</div>';
    const num = n => Number(n).toLocaleString('pt-BR', {maximumFractionDigits:2});
    const amount = (n,c) => c ? today[n]?.porConta[c] || 0 : today[n]?.qtd || 0;
    const mean = n => prices[n.toLowerCase()]?.gold;
    const net = (n,q) => mean(n) > 0 ? Math.floor(mean(n)*q*(1-tax) + 1e-9) : null;
    const total = c => {
      let sum = 0;
      for (const account of c ? [c] : [1,2,3,4]) for (const n of names) {
        const q = amount(n,account); if (!q) continue;
        const v = net(n,q); if (v == null) return '—'; sum += v;
      }
      return num(sum);
    };
    const icon = n => {
      const u = icons[n.toLowerCase()];
      return u && /^src\/ui\/assets\/stones\/[\w.-]+$/.test(u) ? '<img src="'+esc(u)+'" alt="" width="28" height="28">' : '';
    };
    const row = (label, cells, value = '') => '<tr>'+cells.map(v=>'<td>'+v+'</td>').join('')+'<td>'+value+'</td><th scope="row">'+esc(label)+'</th></tr>';
    return '<div class="pio-stones-scroll" tabindex="0" role="region" aria-label="Pedras coletadas por conta"><table class="cd-table pio-stones-table"><thead><tr>'
      + names.map(n=>'<th scope="col"><span class="pio-stone-heading">'+icon(n)+'<span>'+esc(n)+'</span></span></th>').join('')
      + '<th scope="col">Líquido hoje<br><small>Coins estimados</small></th><th scope="col">Conta / período</th></tr></thead><tbody>'
      + [1,2,3,4].map(c=>row(accounts[c-1] || 'Conta '+c,names.map(n=>num(amount(n,c))),total(c))).join('')
      + '</tbody><tfoot>' + row('Total hoje',names.map(n=>'<b>'+num(amount(n))+'</b>'),total())
      + row('Total 7 dias',names.map(n=>num(week[n].qtd || 0)))
      + row('Média RMT · Coins/un.',names.map(n=>mean(n)>0?num(mean(n)):'—'))
      + '</tfoot></table></div><div class="pio-stones-help">Média de vendas por unidade nos últimos 7 dias. Líquido estimado por lote, após '+num(tax*100)+'% de taxa. — = sem preço conhecido.'
      + (at ? ' Atualizado em '+esc(new Date(at).toLocaleString('pt-BR'))+'.' : ' Abra uma conta para consultar o RMT.') + '</div>';
  }
  const api = { render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PioStonesPanel = api;
})(typeof window === 'object' ? window : globalThis);
