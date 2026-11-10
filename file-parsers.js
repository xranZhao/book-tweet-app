function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  lines.forEach(line => {
    let l = line.trim();
    if (!l) { if (inList) { html += '</ul>'; inList = false; } return; }
    if (/^[-*_]{3,}$/.test(l)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr style="border:none;margin:8px 0;">';
      return;
    }
    const h = l.match(/^(#{1,3})\s+(.+)/);
    if (h) {
      if (inList) { html += '</ul>'; inList = false; }
      const level = h[1].length;
      const fs = level === 1 ? 17 : level === 2 ? 16 : 15;
      html += `<h${level} style="font-weight:700;color:var(--text);margin:12px 0 8px;font-size:${fs}px;">${inlineMd(h[2])}</h${level}>`;
      return;
    }
    if (l.startsWith('- ') || l.startsWith('* ')) {
      if (!inList) { html += '<ul style="margin:0 0 10px 18px;padding:0;list-style:disc;">'; inList = true; }
      html += `<li style="margin-bottom:4px;">${inlineMd(l.slice(2))}</li>`;
      return;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p style="margin:0 0 8px;">${inlineMd(l)}</p>`;
  });
  if (inList) html += '</ul>';
  return html;
}

function inlineMd(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text);">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:var(--text-light);">$1</em>');
}

async function parseEpub(file) {
  const zip = await JSZip.loadAsync(file);
  const container = await zip.file('META-INF/container.xml')?.async('text');
  if (!container) throw new Error('不是标准 EPUB');
  const rootfile = container.match(/full-path="([^"]+)"/);
  if (!rootfile) throw new Error('EPUB 结构异常');
  const opfPath = rootfile[1];
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = await zip.file(opfPath)?.async('text');
  if (!opf) throw new Error('内容索引缺失');
  const xml = new DOMParser().parseFromString(opf, 'application/xml');
  const ids = Array.from(xml.getElementsByTagNameNS('*','itemref')).map(el=>el.getAttribute('idref'));
  const items = Array.from(xml.getElementsByTagNameNS('*','item')).map(el=>({id:el.getAttribute('id'),href:el.getAttribute('href'),type:el.getAttribute('media-type')||''}));
  let parts = [];
  for (const id of ids) {
    const item = items.find(i => i.id === id);
    if (!item || !item.type.includes('html') && !item.type.includes('xhtml')) continue;
    const path = decodeURIComponent(new URL(item.href, 'https://epub.local/' + opfPath).pathname.slice(1));
    const html = await zip.file(path)?.async('text');
    if (!html) throw new Error('EPUB 章节缺失：' + path);
    const t = htmlToText(html);
    if (t.trim()) parts.push(t);
  }
  const result = parts.join('\n\n');
  if (!result.trim()) throw new Error('EPUB 解析后无有效文字');
  return result;
}

async function parseZipText(file) {
  const head = await readFirstBytes(file, 4);
  const hex = Array.from(head).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('52617221')) throw new Error('这是 RAR 文件，手机端无法解压。请先用解压 App 转成 zip 再上传');
  if (hex.startsWith('377abcaf')) throw new Error('这是 7z 文件，手机端无法解压。请先用解压 App 转成 zip 再上传');
  if (!hex.startsWith('504b')) throw new Error('不是标准 ZIP 文件，请转成 txt 再上传');
  const zip = await JSZip.loadAsync(file);
  const candidates = [];
  zip.forEach((path, obj) => {
    if (/\.(txt|md)$/i.test(path) && !obj.dir) candidates.push({ path, obj });
  });
  if (!candidates.length) throw new Error('zip 里没找到 txt 文件');
  candidates.sort((a, b) => (b.obj._data?.uncompressedSize || 0) - (a.obj._data?.uncompressedSize || 0));
  return await candidates[0].obj.async('text');
}

function readFirstBytes(file, n) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Uint8Array(e.target.result));
    reader.onerror = e => reject(e);
    reader.readAsArrayBuffer(file.slice(0, n));
  });
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const block = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'SECTION', 'BR'];
  doc.querySelectorAll(block.join(',')).forEach(el => {
    if (el.tagName === 'BR') {
      el.after(doc.createTextNode('\n'));
    } else {
      el.appendChild(doc.createTextNode('\n'));
    }
  });
  return (doc.body.textContent || '').replace(/\n\s*\n+/g, '\n\n').trim();
}

