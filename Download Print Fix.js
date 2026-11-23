/* SES Unit Visit PWA print repair. Load after the checklist's existing scripts. */
(() => {
  'use strict';
  function preparePrint(event) {
    const button = event.target.closest('#printBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    const app = document.getElementById('sesapp');
    if (!app) { alert('Checklist not found.'); return; }
    // Open synchronously during the tap/click so browsers are less likely to block it.
    const win = window.open('', '_blank');
    if (!win) {
      alert('Your browser blocked the print window. Allow pop-ups for this website and try again. On iPhone, use Safari Share > Print.');
      return;
    }
    const clone = app.cloneNode(true);
    const live = app.querySelectorAll('input, select, textarea');
    const copied = clone.querySelectorAll('input, select, textarea');
    live.forEach((el, i) => {
      const dst = copied[i]; if (!dst) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        dst.checked = el.checked;
        if (el.checked) dst.setAttribute('checked', 'checked');
        else dst.removeAttribute('checked');
      } else if (el.tagName === 'SELECT') {
        [...dst.options].forEach((o, j) => { o.selected = j === el.selectedIndex; });
      } else if (el.tagName === 'TEXTAREA') dst.textContent = el.value;
      else if (el.type !== 'file') dst.setAttribute('value', el.value);
    });
    clone.querySelectorAll('details').forEach(d => { d.open = true; d.hidden = false; });
    clone.querySelectorAll('script, iframe, .actions, .sticky, .mobileNav, .photoControls, .removePhoto, #pagingReload, #incidentRefresh').forEach(el => el.remove());
    const css = [...document.querySelectorAll('style')].map(el => el.outerHTML).join('\n');
    const title = 'SES Unit Visit - Printable Report';
    const printCss = `<style>
      body{margin:0;background:white!important;color:#142d40;font-family:Arial,sans-serif}
      .print-toolbar{padding:14px;background:#eaf2f8;position:sticky;top:0;z-index:9999;text-align:center}
      .print-toolbar button{font-size:18px;padding:12px 22px;background:#143b62;color:white;border:0;border-radius:8px}
      #sesapp .photoGallery img{max-width:100%;height:auto;object-fit:contain}
      #sesapp .rowfields[hidden]{display:none!important}
      @media print{.print-toolbar{display:none!important} #sesapp .hero{background:white!important;color:#143b62!important} #sesapp .card{box-shadow:none!important;break-inside:auto} #sesapp .item, #sesapp .photoGallery figure{break-inside:avoid} #sesapp .photoGallery{grid-template-columns:repeat(2,minmax(0,1fr))} }
    </style>`;
    try {
      win.document.open();
      win.document.write('<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' + css + printCss + '</head><body><div class="print-toolbar"><button type="button" id="doPrint">Print / Save PDF</button><p>Choose Save as PDF from your printer options.</p></div>' + clone.outerHTML + '</body></html>');
      win.document.close();
      win.document.getElementById('doPrint').addEventListener('click', () => win.print());
      win.focus();
    } catch (err) {
      win.close();
      alert('Unable to open printable report: ' + err.message);
    }
  }
  document.addEventListener('click', preparePrint, true);
})();
