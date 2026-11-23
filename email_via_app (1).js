/* SES Unit Visit: email through the user's installed email app. */
(() => {
  'use strict';
  function init() {
    const root = document.getElementById('sesapp');
    if (!root || document.getElementById('emailViaAppBtn')) return;
    const actions = root.querySelector('.actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'emailViaAppBtn';
    button.className = 'secondary';
    button.textContent = '✉ Email via email app';
    actions.appendChild(button);
    const value = id => (root.querySelector('#' + id)?.value || '').trim();
    const text = el => (el?.textContent || '').trim().replace(/\s+/g, ' ');
    const safe = s => String(s || '').replace(/[\r\n]+/g, ' ');
    function buildReport() {
      const lines = [
        'SA SES UNIT VISIT RECORD',
        'Region: ' + value('region'),
        'District: ' + value('district'),
        'Unit: ' + value('unit'),
        'Visit date: ' + value('visitDate'),
        'Completed by: ' + value('officer'),
        'Position holders in attendance: ' + value('attendees'),
        'Number of volunteers: ' + value('volunteers'),
        ''
      ];
      let section = '';
      root.querySelectorAll('.item').forEach(item => {
        const heading = item.querySelector('h3');
        if (!heading) return;
        const nearest = item.closest('details');
        const group = text(nearest?.querySelector('summary')) || 'Scheduled items';
        if (group !== section) { lines.push('=== ' + group + ' ==='); section = group; }
        const done = item.querySelector('input[id$="_done"]');
        const noAction = item.querySelector('input[id$="_nar"]');
        const date = item.querySelector('input[id$="_date"]');
        const note = item.querySelector('textarea[id$="_notes"]');
        const owner = item.querySelector('input[id$="_owner"]');
        const status = noAction?.checked ? 'No action required' : done?.checked ? 'Done' : date?.value ? 'Dated' : 'Not marked';
        lines.push('[' + status + '] ' + text(heading));
        if (date?.value) lines.push('  Date: ' + date.value);
        if (note?.value.trim()) lines.push('  Comments: ' + note.value.trim());
        if (owner?.value.trim()) lines.push('  Responsible: ' + owner.value.trim());
      });
      if (value('notes')) lines.push('', 'ADDITIONAL NOTES', value('notes'));
      lines.push('', 'Photo evidence is not attached automatically. Save/print the PDF and attach it manually if required.');
      return lines.join('\n');
    }
    function download(text, name) {
      const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
    function status(message) {
      const el = root.querySelector('#message');
      if (el) el.textContent = message;
      else alert(message);
    }
    button.addEventListener('click', () => {
      const recipient = value('email');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        status('Enter a valid email address in Visit details first.');
        root.querySelector('#email')?.focus(); return;
      }
      const subject = safe('SES Unit Visit Record | ' + (value('unit') || 'Unit') + ' | ' + (value('visitDate') || 'Undated'));
      const report = buildReport();
      let body = report;
      if (encodeURIComponent(report).length > 1800) {
        download(report, 'SES_Unit_Visit_' + (value('unit') || 'Unit').replace(/[^a-z0-9_-]+/gi, '_') + '.txt');
        body = 'Completed SES Unit Visit Report\nUnit: ' + value('unit') + '\nDate: ' + value('visitDate') + '\n\nPlease attach the downloaded full text report before sending.';
        status('Full report downloaded. Attach it to the email draft before sending.');
      } else status('Opening your email app. Review and press Send.');
      window.location.href = 'mailto:' + encodeURIComponent(recipient) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
