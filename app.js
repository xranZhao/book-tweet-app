/* ═══════════════════════════════════════════════════════════════════════
 * 推文助手 app.js
 * 纯前端 PWA · GitHub Pages 部署 · 零后端
 * 设计风格：book-mentor-app 温暖文学风
 * 微信文章渲染：hp-drarry-review-magazine 马卡龙杂志风
 * ═══════════════════════════════════════════════════════════════════════ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* ─── State ─── */
const STEPS = ['判定', '标题', '草稿', '定稿'];
const EMPTY_BOOK = () => ({
  title: '', file: null, text: '', chars: 0, ext: '',
});
const EMPTY_SESSION = () => ({
  book: null,           // 当前书籍信息
  readReport: null,     // AI 阅读报告
  verdict: '',          // 判定结果
  titleOptions: [],     // 标题候选
  selectedTitle: '',    // 选中的标题
  draftMd: '',          // AI 生成的初稿
  finalMd: '',          // 定稿 markdown
  step: 0,              // 当前步骤: 0=已上传, 1=已判定, 2=已选标题, 3=已定稿
  previewMode: false,   // 编辑/预览切换
});
let session = EMPTY_SESSION();

function saveSession() {
  if (!session.book) return;
  localStorage.setItem('tweet_session', JSON.stringify({
    book: session.book,
    readReport: session.readReport,
    verdict: session.verdict,
    titleOptions: session.titleOptions,
    selectedTitle: session.selectedTitle,
    draftMd: session.draftMd,
    finalMd: session.finalMd,
    step: session.step,
  }));
}
function loadSession() {
  try {
    const raw = localStorage.getItem('tweet_session');
    if (raw) {
      const s = JSON.parse(raw);
      session.book = s.book || null;
      session.readReport = s.readReport || null;
      session.verdict = s.verdict || '';
      session.titleOptions = s.titleOptions || [];
      session.selectedTitle = s.selectedTitle || '';
      session.draftMd = s.draftMd || '';
      session.finalMd = s.finalMd || '';
      session.step = s.step || 0;
      session.previewMode = false;
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}
function clearSession() {
  session = EMPTY_SESSION();
  localStorage.removeItem('tweet_session');
}

/* ─── History persistence ─── */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('tweet_history') || '[]');
  } catch (e) { return []; }
}
function saveHistory(entry) {
  const h = getHistory();
  // 如果同 id 已存在则替换
  const idx = h.findIndex(e => e.id === entry.id);
  if (idx >= 0) h[idx] = entry;
  else h.unshift(entry);
  localStorage.setItem('tweet_history', JSON.stringify(h.slice(0, 200))); // 最多存 200 篇
}

/* ─── Toast ─── */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.style.display = 'block';
  const timer = setTimeout(() => { t.style.display = 'none'; }, 2200);
  t.dataset.timer = timer;
}

/* ─── Utilities ─── */
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
      html += '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">';
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

function deepSeekChat(model, content, maxTokens = 4000, timeoutMs = 120000) {
  if (!CONFIG.API_KEY) { return Promise.reject(new Error('请先设置 API Key')); }
  const MAX_RETRIES = 3;
  let lastError = null;
  async function attempt(retry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(CONFIG.BASE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.API_KEY}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: maxTokens, temperature: 0.7 }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 429 || res.status === 503) throw new Error(`服务繁忙 (${res.status})，请稍后重试。`);
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('返回格式异常');
      }
      return data.choices[0].message.content;
    } catch (e) {
      if (e.message?.includes('服务繁忙') || e.name === 'CanceledError') throw e;
      lastError = e;
      if (retry < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, retry - 1);
        await new Promise(r => setTimeout(r, delay));
        return attempt(retry + 1);
      }
      throw new Error(`已重试 ${MAX_RETRIES} 次仍失败：${lastError.message || lastError}`);
    }
  }
  return attempt(1);
}

function parseNumberedList(md) {
  let lines = md.split('\n').map(l => l.trim()).filter(Boolean);
  lines = lines.map(l => {
    return l.replace(/^\d+[\.、)）\s]+/, '').replace(/^[-*]\s+/, '').replace(/^\*\*\d+[\.、)）\s]*\*\*\s*/, '').trim();
  }).filter(l => {
    if (l.length <= 2) return false;
    if (/^(以下|以上|根据|注意|备注|说明|示例|提示|好的|这是|以下列)/.test(l)) return false;
    return true;
  });
  if (!lines.length) {
    lines = md.split('\n').map(l => l.trim()).filter(Boolean).filter(l => l.length > 2 && !/^(以下|以上|根据|注意|备注|说明|示例|提示|好的|这是)/.test(l));
  }
  return lines;
}

/* ─── Tab navigation ─── */
function navTo(tab) {
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'upload') renderUpload();
  else if (tab === 'reading') renderReading();
  else if (tab === 'final') renderFinal();
  else if (tab === 'history') renderHistory();
}

/* ═══════════════════════════════════════════════════════════════════════
 * ① UPLOAD TAB
 * ═══════════════════════════════════════════════════════════════════════ */
function renderUpload() {
  const hasSession = session.book && session.step > 0;
  let currentHtml = '';
  if (hasSession) {
    currentHtml = `
      <div class="card" style="cursor:pointer;" onclick="navTo('reading')">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:28px;flex-shrink:0;">📖</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:700;color:var(--text);">${escapeHtml(session.book.title)}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px;">${STEPS[session.step] || ''} · ${(session.book.chars / 10000).toFixed(1)}万字</div>
          </div>
          <span style="font-size:16px;color:var(--text-lighter);">→</span>
        </div>
      </div>
      <div style="margin-bottom:16px;text-align:center;">
        <button class="btn btn-ghost btn-sm" onclick="clearSession();renderUpload();">放弃当前任务 · 开始新书</button>
      </div>`;
  }
  $('#main').innerHTML = `
    <div class="screen">
      ${currentHtml}
      <div class="card">
        <div class="card-title">📤 上传新书</div>
        <div class="card-meta">支持 txt / markdown / epub / zip 格式</div>
      </div>
      <div class="upload-area" id="upload-area" onclick="document.getElementById('upload-file').click()">
        <span class="upload-icon">📂</span>
        <span class="upload-text">点击选择文件（或拖拽到此处）</span>
      </div>
      <input type="file" id="upload-file" accept=".txt,.md,.epub,.zip" style="display:none;">
      <div id="upload-name" class="upload-file-name"></div>
      <button class="btn btn-primary btn-block" id="btn-upload">上传并开始阅读</button>
      <div class="tip" style="margin-top:12px;text-align:center;">rar / 7z 手机端无法解压，请先用解压 App 转成 zip。</div>
    </div>`;
  $('#upload-file').onchange = (e) => {
    const f = e.target.files[0];
    if (f) $('#upload-name').textContent = '📎 ' + f.name;
  };
  $('#btn-upload').onclick = doUpload;

  // 拖拽上传
  const area = $('#upload-area');
  if (area) {
    area.ondragover = (e) => { e.preventDefault(); area.classList.add('dragover'); };
    area.ondragleave = () => area.classList.remove('dragover');
    area.ondrop = (e) => {
      e.preventDefault(); area.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) {
        const dt = new DataTransfer(); dt.items.add(f);
        const input = $('#upload-file');
        input.files = dt.files;
        $('#upload-name').textContent = '📎 ' + f.name;
      }
    };
  }
}

async function doUpload() {
  const file = $('#upload-file').files[0];
  if (!file) { toast('请选择文件'); return; }
  if (!CONFIG.API_KEY) { alert('请先在设置里填入 DeepSeek API Key'); openSettings(); return; }
  $('#btn-upload').textContent = '解析中...';

  let title = file.name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ').trim();
  let text = '';
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  try {
    if (ext === 'txt' || ext === 'md') {
      text = await file.text();
    } else if (ext === 'epub') {
      text = await parseEpub(file);
    } else if (ext === 'zip') {
      text = await parseZipText(file);
    } else {
      throw new Error('不支持的格式：' + ext);
    }
  } catch (e) {
    $('#btn-upload').textContent = '上传并开始阅读';
    alert('解析失败：' + e.message);
    return;
  }

  if (!text || text.length < 200) {
    $('#btn-upload').textContent = '上传并开始阅读';
    toast('文件内容为空或太短（少于200字）');
    return;
  }

  $('#btn-upload').textContent = '上传并开始阅读';

  // 尝试从 md 标题提取书名
  if (ext === 'md') {
    const m = text.match(/^#\s+(.+)/m);
    if (m) title = m[1].trim();
  }

  clearSession();
  session.book = { title, file: file.name, text, chars: text.length, ext };
  saveSession();
  toast('上传成功');
  navTo('reading');
}

/* ─── File parsers ─── */
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
  const ids = [...opf.matchAll(/<itemref\s+idref="([^"]+)"/g)].map(m => m[1]);
  const items = [...opf.matchAll(/<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"[^>]*>/g)]
    .map(m => ({ id: m[1], href: m[2], type: m[3] }));
  let parts = [];
  for (const id of ids) {
    const item = items.find(i => i.id === id);
    if (!item || !item.type.includes('html') && !item.type.includes('xhtml')) continue;
    const path = opfDir + item.href;
    const html = await zip.file(path)?.async('text');
    if (!html) continue;
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

/* ═══════════════════════════════════════════════════════════════════════
 * ② READING TAB
 * ═══════════════════════════════════════════════════════════════════════ */
function renderReading() {
  if (!session.book) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="empty-state">
          <span class="empty-icon">📖</span>
          <p>还没有正在处理的书<br>去「上传」Tab 添加一本吧</p>
        </div>
        <button class="btn btn-primary btn-block" onclick="navTo('upload')">去上传</button>
      </div>`;
    return;
  }
  const step = session.step;
  // step > 0 → 从之前的步骤继续
  if (step >= 3 && session.finalMd) {
    showRevise();
  } else if (step >= 2 && session.draftMd) {
    showRevise();
  } else if (step >= 1 && session.readReport) {
    // 已有判定 → 显示阅读报告（如果已选标题则跳到标题选择）
    if (session.selectedTitle) showTitleSelector();
    else showReadingReport();
  } else {
    showBookMenu();
  }
}

function showBookMenu() {
  const b = session.book;
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">📖</span>
        <span class="b-title">${escapeHtml(b.title)}</span>
        <span class="b-status">${(b.chars / 10000).toFixed(1)}万字</span>
      </div>
      <div class="card">
        <div class="card-title">${escapeHtml(b.title)}</div>
        <div class="card-meta">${escapeHtml(b.file || '')} · ${(b.chars / 10000).toFixed(1)}万字</div>
      </div>
      <div class="chat-bubble ai">
        准备好后点击下方按钮，AI 会通读全文并给出推荐判定。<br>
        Flash 模型省钱快速，大约 30-90 秒。
      </div>
      <button class="btn btn-primary btn-block" id="btn-read" style="margin-bottom:12px;">🤖 AI 阅读并判定</button>
      <button class="btn btn-ghost btn-block" onclick="navTo('upload')">返回上传</button>
    </div>`;
  $('#btn-read').onclick = runReading;
}

function truncateText(text, maxChars = 200000) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n（后文已截断，共 ${text.length} 字）`;
}

async function runReading() {
  if (!CONFIG.API_KEY) { alert('请先设置 DeepSeek API Key'); openSettings(); return; }
  const b = session.book;
  const startTime = Date.now();
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">🔍</span>
        <span class="b-title">AI 正在阅读《${escapeHtml(b.title)}》...</span>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar"><div class="progress-bar-slider"></div></div>
      </div>
      <div class="loading" style="padding:20px 16px;">
        <p id="elapsed-text">⏱ 已等待 0 秒</p>
        <p style="font-size:12px;color:var(--text-lighter);">Flash 模型 · 约 30-90 秒</p>
      </div>
    </div>`;

  // 计时器
  const timerInterval = setInterval(() => {
    const el = $('#elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const text = truncateText(b.text, 200000);
  const prompt = `请阅读以下小说全文，输出一份结构化的阅读报告。要求：
1. 真实简介（基于原文，不要编造；控制在 2-3 句话）
2. 作者、字数、完结状态（简明列出；如无法获取作者信息，直说"作者未知"）
3. 文笔评价：是否流畅、情感描写是否细腻、剧情是否保留完整（控制在 1-2 句话）
4. 雷点 / 避雷预警：如强制婚姻、黑化、OOC、未完结、BE 等
5. 最终判定四选一：强推 / 可推 / 避雷可写 / 不推不写，并给出简短理由
6. 总字数控制在 1000 字以内，不要复述剧情细节，减少冗长描述

小说全文：
${text}`;

  try {
    const res = await deepSeekChat(CONFIG.READ_MODEL, prompt, 4000);
    clearInterval(timerInterval);
    session.readReport = res;
    session.readReportTime = ((Date.now() - startTime) / 1000).toFixed(0);
    session.step = 1;
    // 提取判定
    if (res.includes('强推')) session.verdict = '强推';
    else if (res.includes('可推')) session.verdict = '可推';
    else if (res.includes('避雷可写')) session.verdict = '避雷可写';
    else session.verdict = '不推不写';
    saveSession();
    showReadingReport();
  } catch (e) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="loading">阅读失败：${escapeHtml(e.message)}</div>
        <button class="btn btn-primary btn-block" onclick="runReading()">重试</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showBookMenu()">返回</button>
      </div>`;
  }
}

function showReadingReport() {
  const b = session.book;
  const v = session.verdict;
  const verdictColor = v === '不推不写' ? 'var(--text-light)' : v === '避雷可写' ? 'var(--macaron-pink)' : 'var(--macaron-sky)';
  const stepHtml = stepIndicator(1);
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">📖</span>
        <span class="b-title">${escapeHtml(b.title)}</span>
      </div>
      ${stepHtml}
      <div class="card">
        <div class="card-title">${escapeHtml(b.title)}</div>
        <div class="card-meta" style="color:${verdictColor};font-weight:700;">判定：${v}</div>
      </div>
      ${session.readReportTime ? `<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">✅ AI 阅读完成 · 耗时 ${session.readReportTime} 秒</div>` : ''}
      <div class="report-card">${renderMarkdown(session.readReport)}</div>
      ${v === '不推不写' ? `
        <button class="btn btn-ghost btn-block" id="btn-pass">标记"已过"</button>
      ` : `
        <button class="btn btn-primary btn-block" id="btn-title-options" style="margin-bottom:12px;">生成标题候选</button>
        <button class="btn btn-ghost btn-block" id="btn-pass">这书不推，标记"已过"</button>
      `}
      <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showBookMenu()">返回</button>
    </div>`;
  $('#btn-pass').onclick = () => {
    toast('已标记"已过"');
    clearSession();
    navTo('upload');
  };
  const tbtn = $('#btn-title-options');
  if (tbtn) tbtn.onclick = () => generateTitleOptions();
}

function stepIndicator(currentIdx) {
  return `<div class="step-indicator">
    ${STEPS.map((s, i) => {
      let cls = '';
      if (i < currentIdx) cls = 'done';
      else if (i === currentIdx) cls = 'active';
      return `<div class="step-dot ${cls}" title="${s}"></div>`;
    }).join('')}
  </div>`;
}

/* ─── Title generation ─── */
async function generateTitleOptions() {
  if (!session.readReport) return;
  const startTime = Date.now();
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">✏️</span>
        <span class="b-title">正在生成标题候选...</span>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar"><div class="progress-bar-slider"></div></div>
      </div>
      <div class="loading" style="padding:20px 16px;">
        <p id="elapsed-text">⏱ 已等待 0 秒</p>
        <p style="font-size:12px;color:var(--text-lighter);">Pro 模型 · 生成 5 个标题 · 约 20-40 秒</p>
      </div>
    </div>`;

  const timerInterval = setInterval(() => {
    const el = $('#elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const prompt = `根据以下阅读报告，为这篇小说的公众号推文生成 5 个标题候选。

要求：
- 每个标题贴合剧情、有吸引力、适合 1500 字公众号推文
- 不要夸张到失实，不要剧透核心反转
- 标题党但真诚，能勾起读者点击兴趣
- 判定调性为「${session.verdict}」：
  - 强推/可推：突出精彩看点、张力、名场面氛围
  - 避雷可写：可带「避雷」「测评」「先别嗑」等警示感
- 只输出 5 行标题，每行前面加编号 1-5，不要多余解释

阅读报告：
${session.readReport}`;

  try {
    const res = await deepSeekChat(CONFIG.WRITE_MODEL, prompt, 2000, 120000);
    clearInterval(timerInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    session.titleOptions = parseNumberedList(res);
    if (!session.titleOptions.length) {
      session.titleOptions = [res.trim().split('\n').filter(Boolean).slice(0, 5).join('\n') || res.trim()];
    }
    session.titleGenTime = elapsed;
    saveSession();
    showTitleSelector();
    toast(`标题已生成 · 耗时 ${elapsed} 秒`);
  } catch (e) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="loading">标题生成失败：${escapeHtml(e.message)}</div>
        <button class="btn btn-primary btn-block" onclick="generateTitleOptions()">重试</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showReadingReport()">返回</button>
      </div>`;
  }
}

function showTitleSelector() {
  const selectedIdx = session.selectedTitle ? session.titleOptions.indexOf(session.selectedTitle) : -1;
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">✏️</span>
        <span class="b-title">${escapeHtml(session.book.title)}</span>
      </div>
      ${stepIndicator(2)}
      <h3 style="margin-top:0;margin-bottom:12px;color:var(--text);">选择文章标题</h3>
      <div class="option-list" id="title-options">
        ${session.titleOptions.map((t, i) => `
          <label class="option-row" style="word-break:break-word;">
            <input type="radio" name="title" value="${escapeHtml(t)}" ${session.selectedTitle === t || (i === 0 && !session.selectedTitle) ? 'checked' : ''}>
            <span class="option-text">${escapeHtml(t)}</span>
          </label>
        `).join('')}
      </div>
      <div class="setting-group" style="margin-top:16px;">
        <div class="setting-label">或自定义标题</div>
        <input type="text" id="custom-title" placeholder="输入你想用的标题" value="${escapeHtml(session.selectedTitle || '')}">
      </div>
      <button class="btn btn-primary btn-block" id="btn-generate-draft" style="margin-top:16px;">下一步：生成推文初稿</button>
      <button class="btn btn-ghost btn-block" style="margin-top:12px;" onclick="showReadingReport()">返回修改判定</button>
    </div>`;
  $('#btn-generate-draft').onclick = () => {
    const custom = $('#custom-title').value.trim();
    const selected = custom || document.querySelector('input[name="title"]:checked')?.value;
    if (!selected) { toast('请选择一个标题'); return; }
    session.selectedTitle = selected;
    saveSession();
    generateDraft();
  };
}

/* ─── Draft generation ─── */
async function generateDraft() {
  const b = session.book;
  const startTime = Date.now();
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">📝</span>
        <span class="b-title">Pro 模型正在写初稿...</span>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar"><div class="progress-bar-slider"></div></div>
      </div>
      <div class="loading" style="padding:20px 16px;">
        <p id="elapsed-text">⏱ 已等待 0 秒</p>
        <p style="font-size:12px;color:var(--text-lighter);">Pro 模型 · 生成推文初稿 · 约 60-180 秒</p>
      </div>
    </div>`;

  const timerInterval = setInterval(() => {
    const el = $('#elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const isAvoid = session.verdict === '避雷可写';
  const title = session.selectedTitle || b.title;

  const prompt = `请根据以下信息，按「杂志风推文」结构写初稿，直接输出 Markdown。

注意：不要输出标题行（标题会单独展示），直接从正文信息卡开始。

固定信息卡格式（必须严格遵循）：

**基本信息卡**
- **原作**：《${b.title}》
- **作者**：从阅读报告或小说原文中提取真实作者；若无法提取，直写"作者未知"
- **分级**：[如能推断则写，否则省略此行]
- **CP**：[主要人物关系]
- **标签**：[自由生成 3-6 个贴合的标签]

你必须按顺序输出以下 6 个章节，不可省略任何一个、不可更改章节标题文字：

### 00 小说哪里看
（这一章是固定的读者导航，不要自由发挥。**必须**原样输出下面两行，一字不改：）
【小说在哪看】请看这篇：小说阅读途径 →
【已推小说合集】请看这篇：已推小说合集 →

### ${isAvoid ? '01 避雷点' : '01 文案推荐'}
### 02 Fanst 碎碎念
### ${isAvoid ? '03 踩雷预警' : '03 名场面预警'}
### ${isAvoid ? '04 最戳我的一个槽点' : '04 最戳我的一个细节'}
### 05 综合评价

章节输出规则：
- 每个 ### 标题独占一行，后面紧跟该章节正文
- 00 章节正文只包含上面指定的两行，不要加多余内容
- 其他章节正常写 1-3 段短段落

阅读报告（仅供参考，不要复述细节）：
${session.readReport}

风格指南：
${STYLE_GUIDE_SEED}

要求：
- 全文控制在 1500 字左右（含信息卡），不要写超长文
- 每章 1-3 段短段落，不要复述大量剧情，只保留最能支撑标题角度的 1-2 个细节/名场面
- 标题党但真诚，不要夸张到失实
- 文案口语化，真诚推荐
- 结尾固定放「所有荣誉与利益属于作者和创作者。」和「💬 非常需要你的推荐留言或观后感！」
- 不要在文中出现文件编码或乱码`;

  try {
    const res = await deepSeekChat(CONFIG.WRITE_MODEL, prompt, 6000, 180000);
    clearInterval(timerInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    // 去掉 AI 可能加的大标题
    let md = res.replace(/^#\s*.+\n+/m, '');
    // 强制 ### 格式
    md = md.replace(/^##\s+/gm, '### ');
    session.draftMd = md;
    session.finalMd = md;
    session.step = 2;
    saveSession();
    showRevise();
    toast(`初稿已生成 · 耗时 ${elapsed} 秒`);
  } catch (e) {
    clearInterval(timerInterval);
    $('#main').innerHTML = `
      <div class="screen">
        <div class="loading">初稿生成失败：${escapeHtml(e.message)}</div>
        <button class="btn btn-primary btn-block" onclick="generateDraft()">重试</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showTitleSelector()">返回改标题</button>
      </div>`;
  }
}

/* ─── Revise / Manual edit ─── */
function showRevise() {
  session.previewMode = false;
  const title = session.selectedTitle || (session.book?.title || '推文标题');
  $('#main').innerHTML = `
    <div class="screen" style="padding-bottom:40px;">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">📝</span>
        <span class="b-title">${escapeHtml(session.book.title)}</span>
      </div>
      ${stepIndicator(3)}
      <div class="title-card">
        <div class="title-label">文章标题</div>
        <div class="title-value">${escapeHtml(title)}</div>
        <button class="btn btn-ghost btn-block" id="btn-copy-title-revise" style="margin-top:8px;">复制标题</button>
      </div>
      <div class="chat-bubble ai">这是初稿。你可以直接编辑 Markdown，也可以让 AI 帮你改。点击下方切换可预览渲染效果。</div>
      <div class="editor-tabs">
        <button class="editor-tab active" id="tab-edit" type="button">编辑</button>
        <button class="editor-tab" id="tab-preview" type="button">预览</button>
      </div>
      <div id="editor-area">
        <textarea class="editor-textarea" id="md-editor">${escapeHtml(session.finalMd || session.draftMd)}</textarea>
      </div>
      <div class="setting-group">
        <div class="setting-label">告诉 AI 怎么改（可选）</div>
        <input type="text" id="revise-input" placeholder="例如：第二段太啰嗦，第三段加一段名场面">
      </div>
      <button class="btn btn-primary btn-block" id="btn-ai-revise" style="margin-bottom:10px;">让 AI 按上面意见改</button>
      <button class="btn btn-pink btn-block" id="btn-finalize" style="margin-bottom:10px;">定稿并查看成品</button>
      <button class="btn btn-ghost btn-block" onclick="showTitleSelector()">返回改标题</button>
    </div>`;
  $('#btn-copy-title-revise').onclick = () => copyText(title);
  $('#btn-ai-revise').onclick = aiRevise;
  $('#btn-finalize').onclick = () => {
    const md = $('#md-editor') ? $('#md-editor').value : session.finalMd;
    session.finalMd = md;
    session.step = 3;
    saveSession();
    showFinal();
  };
  $('#tab-edit').onclick = () => switchEditorTab(false);
  $('#tab-preview').onclick = () => switchEditorTab(true);
}

function switchEditorTab(preview) {
  session.previewMode = preview;
  $$('.editor-tab').forEach(t => t.classList.toggle('active', t.id === (preview ? 'tab-preview' : 'tab-edit')));
  const area = $('#editor-area');
  if (preview) {
    const md = $('#md-editor').value;
    area.innerHTML = `<div class="editor-preview">${renderMarkdown(md)}</div>`;
  } else {
    area.innerHTML = `<textarea class="editor-textarea" id="md-editor">${escapeHtml(session.finalMd || session.draftMd || '')}</textarea>`;
  }
}

async function aiRevise() {
  const instruction = $('#revise-input').value.trim();
  if (!instruction) { toast('请先写修改意见'); return; }
  const current = $('#md-editor') ? $('#md-editor').value : session.finalMd;
  const startTime = Date.now();
  $('#btn-ai-revise').textContent = '修改中...';
  $('#btn-ai-revise').disabled = true;

  // 在输入框下方插入进度条
  const reviseArea = $('#revise-input').parentNode;
  const progEl = document.createElement('div');
  progEl.id = 'revise-progress';
  progEl.innerHTML = `
    <div class="progress-bar-wrapper" style="padding:8px 0;">
      <div class="progress-bar"><div class="progress-bar-slider"></div></div>
    </div>
    <p id="revise-elapsed-text" style="font-size:13px;color:var(--text-light);margin:0 0 8px;">⏱ 已等待 0 秒</p>
  `;
  reviseArea.appendChild(progEl);

  const timerInterval = setInterval(() => {
    const el = $('#revise-elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const prompt = `请根据以下要求修改推文初稿。只返回修改后的完整 Markdown，不要解释。

要求：${instruction}

当前初稿：
${current}`;
  try {
    const res = await deepSeekChat(CONFIG.WRITE_MODEL, prompt, 6000, 180000);
    clearInterval(timerInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    // 移除进度条
    const progEl = $('#revise-progress');
    if (progEl) progEl.remove();
    let revised = res.replace(/^#\s*.+\n+/m, '');
    session.finalMd = revised;
    session.draftMd = revised;
    saveSession();
    if (session.previewMode) {
      switchEditorTab(true);
    } else {
      $('#md-editor').value = revised;
    }
    $('#btn-ai-revise').textContent = '让 AI 按上面意见改';
    $('#btn-ai-revise').disabled = false;
    toast(`已修改 · 耗时 ${elapsed} 秒`);
  } catch (e) {
    clearInterval(timerInterval);
    const progEl = $('#revise-progress');
    if (progEl) progEl.remove();
    $('#btn-ai-revise').textContent = '让 AI 按上面意见改';
    $('#btn-ai-revise').disabled = false;
    alert('修改失败：' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * ③ FINAL TAB — 微信杂志风文章预览
 *    渲染风格严格参考 hp-drarry-review-magazine.html
 * ═══════════════════════════════════════════════════════════════════════ */
function renderFinal() {
  if (!session.finalMd) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="empty-state">
          <span class="empty-icon">✨</span>
          <p>还没有生成推文<br>去「阅读」Tab 完成推文吧</p>
        </div>
        <button class="btn btn-primary btn-block" onclick="navTo('reading')">去阅读</button>
      </div>`;
    return;
  }
  showFinal();
}

function showFinal() {
  const html = renderMagazineHTML(session.finalMd, session.selectedTitle);
  const title = session.selectedTitle || (session.book?.title || '推文标题');
  $('#main').innerHTML = `
    <div class="screen" style="padding-bottom:40px;">
      <div class="title-card">
        <div class="title-label">文章标题</div>
        <div class="title-value" id="article-title">${escapeHtml(title)}</div>
        <button class="btn btn-ghost btn-block" id="btn-copy-title-final" style="margin-top:8px;">复制标题</button>
      </div>
      <div class="preview-wrap" id="preview-box">${html}</div>
      <button class="btn btn-primary btn-block" id="btn-copy-html" style="margin-bottom:10px;">📋 一键复制全文（去订阅号助手粘贴）</button>
      <button class="btn btn-pink btn-block" id="btn-save-history" style="margin-bottom:10px;">💾 保存到历史</button>
      <button class="btn btn-ghost btn-block" id="btn-back-edit">返回修改文字</button>
    </div>`;
  $('#btn-copy-html').onclick = () => copyHtml($('#preview-box'));
  $('#btn-copy-title-final').onclick = () => copyText(title);
  $('#btn-back-edit').onclick = () => { navTo('reading'); showRevise(); };
  $('#btn-save-history').onclick = () => {
    const entry = {
      id: Date.now().toString(36),
      title: title,
      verdict: session.verdict,
      markdown: session.finalMd,
      html: renderMagazineHTML(session.finalMd, session.selectedTitle),
      bookTitle: session.book?.title || '',
      createdAt: new Date().toISOString(),
    };
    saveHistory(entry);
    clearSession();
    toast('已存入历史');
    updateHistoryBadge();
    navTo('history');
  };
}

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('标题已复制'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('标题已复制');
  }
}

function copyHtml(el) {
  const done = () => toast('已复制，去订阅号助手粘贴');
  if (navigator.clipboard && window.ClipboardItem) {
    const html = el.innerHTML;
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([el.innerText], { type: 'text/plain' })
    });
    navigator.clipboard.write([item]).then(done).catch(() => legacyCopy(el, done));
  } else legacyCopy(el, done);
}
function legacyCopy(el, done) {
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  document.execCommand('copy'); sel.removeAllRanges(); done();
}

/* ─── 微信杂志风 HTML 渲染（马卡龙色板）─── */
function renderMagazineHTML(md, overrideTitle) {
  const title = overrideTitle || '推文标题';

  // 预处理：去掉 markdown 粗体标记，方便正则提取信息卡字段
  const cleanMd = md.replace(/\*\*(.+?)\*\*/g, '$1');
  const author = (cleanMd.match(/作者\s*[:：]\s*(.+)/)?.[1] || '').trim();
  const rating = (cleanMd.match(/分级\s*[:：]\s*(.+)/)?.[1] || '').trim();
  const cp = (cleanMd.match(/CP\s*[:：]\s*(.+)/)?.[1] || '').trim();
  const tags = (cleanMd.match(/标签\s*[:：]\s*(.+)/)?.[1] || '').split(/[,，\/]/).map(s => s.trim()).filter(Boolean);

  // 分章节
  const sections = parseSections(md);

  const tagsHtml = tags.map(t =>
    `<span style="display:inline-block;padding:4px 12px;background:#dcecf8;color:#2d72ad;border-radius:999px;font-size:12px;font-weight:500;margin:0 8px 6px 0;">${escapeHtml(t)}</span>`
  ).join('');


  // Section labels
  const sectionLabels = ['小说哪里看', '文案推荐', 'Fanst 碎碎念', '名场面预警', '最戳我的一个细节', '综合评价',
    '避雷点', '踩雷预警', '最戳我的一个槽点'];
  const labelNums = {
    '小说哪里看': '00', '文案推荐': '01', 'Fanst 碎碎念': '02', '名场面预警': '03',
    '最戳我的一个细节': '04', '综合评价': '05', '避雷点': '01', '踩雷预警': '03', '最戳我的一个槽点': '04',
  };

  let sectionHtml = '';
  sectionLabels.forEach(label => {
    // 匹配时忽略编号前缀（AI 可能输出 "00 小说哪里看" 或 "小说哪里看"）
    const sec = sections.find(s => s.label === label || s.label.endsWith(' ' + label) || s.label.includes(label));
    if (sec) {
      sectionHtml += renderSectionForMagazine(labelNums[label] || '00', label, sec.body);
    } else if (label === '小说哪里看') {
      // AI 漏掉了 00 章节 → 自动补上固定内容
      sectionHtml += renderSectionForMagazine('00', '小说哪里看',
        '【小说在哪看】请看这篇：小说阅读途径 →\n\n【已推小说合集】请看这篇：已推小说合集 →');
    }
  });

  return `
    <div style="max-width:100%;margin:0 auto;background:#fafcfd;">
      <!-- CP 角色图占位 -->
      <div style="width:100%;aspect-ratio:16/10;background:linear-gradient(135deg,#c8ddf5 0%,#a8cdf0 30%,#f5d8e2 60%,#fad2e0 100%);display:flex;align-items:center;justify-content:center;">
        <p style="margin:0;font-size:14px;color:rgba(59,130,197,0.6);letter-spacing:0.04em;">📷 在此插入角色图</p>
      </div>
      <div style="height:3px;background:#3B82C5;opacity:0.7;font-size:0;line-height:0;">&nbsp;</div>

      <!-- 信息卡 -->
      <section style="background:#ffffff;padding:20px 16px 20px;">
        ${author ? `<div style="display:flex;align-items:baseline;gap:8px;"><span style="font-size:12px;color:#888;letter-spacing:0.06em;min-width:56px;">作者</span><span style="font-weight:500;color:#1a1a1a;">${escapeHtml(author)}</span></div>` : ''}
        ${rating ? `<div style="display:flex;align-items:baseline;gap:8px;margin-top:${author ? '8px' : '0'};"><span style="font-size:12px;color:#888;letter-spacing:0.06em;min-width:56px;">分级</span><span style="font-weight:500;color:#3B82C5;">${escapeHtml(rating)}</span></div>` : ''}
        ${cp ? `<div style="display:flex;align-items:baseline;gap:8px;margin-top:${author || rating ? '8px' : '0'};"><span style="font-size:12px;color:#888;letter-spacing:0.06em;min-width:56px;">CP</span><span style="font-weight:500;color:#3B82C5;">${escapeHtml(cp)}</span></div>` : ''}
        ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #e0e0e0;">${tagsHtml}</div>` : ''}
      </section>

      ${sectionHtml}

      <!-- 收尾 -->
      <section style="padding:28px 16px 32px;background:linear-gradient(180deg,#fdf2f5 0%,#eef5fb 100%);text-align:center;border-top:1px solid #e5dfe2;">
        <p style="font-size:12px;line-height:2;color:#888;margin:0 0 20px;">所有荣誉与利益属于作者和创作者。<br>即使不了解角色，该书仍可当成独立小说看待，欢迎尝试。</p>
        <div style="display:inline-block;padding:12px 28px;background:#ffffff;border:2px solid #E8739A;border-radius:8px;">
          <p style="font-size:14px;font-weight:600;line-height:1.6;color:#E8739A;margin:0;">💬 非常需要你的推荐留言或观后感！</p>
          <p style="font-size:12px;color:#888;margin:4px 0 0;">读完这篇文你有什么感受？在评论区告诉我们～</p>
        </div>
        <p style="margin:18px 0 0;font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-size:12px;color:#b8c8d5;letter-spacing:0.08em;">磕学家 · 哈利波特板块</p>
      </section>
    </div>`;
}

function parseSections(md) {
  const sections = [];
  // 统一换行符 + 确保首个 ### 能被匹配
  const normalized = '\n' + md.replace(/\r\n/g, '\n');
  const parts = normalized.split(/\n###\s+/);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const nlIdx = part.indexOf('\n');
    const label = nlIdx > 0 ? part.slice(0, nlIdx).trim() : part.trim();
    const body = nlIdx > 0 ? part.slice(nlIdx + 1).trim() : '';
    sections.push({ label, body });
  }
  return sections;
}

function renderSectionForMagazine(num, label, body) {
  const bodyHtml = renderWeChatBody(body);
  return `
    <section style="padding:32px 16px;border-top:1px solid #e5dfe2;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <span style="font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-size:40px;font-weight:700;line-height:1;color:#3B82C5;">${num}</span>
        <span style="font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-size:20px;font-weight:700;color:#1a1a1a;">${escapeHtml(label)}</span>
      </div>
      <div style="font-size:15px;line-height:1.85;color:#3a3a3a;">${bodyHtml}</div>
    </section>`;
}

function renderWeChatBody(body) {
  // 解析段落、引用块、分隔线
  const lines = body.split('\n');
  let html = '';
  let inQuote = false;
  let inList = false;

  const flushQuote = () => {
    if (inQuote) { html += '</div>'; inQuote = false; }
  };
  const flushList = () => {
    if (inList) { html += '</ul>'; inList = false; }
  };

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    // 分隔线
    if (/^[-*_]{3,}$/.test(l) || l === '· · ·') {
      flushQuote(); flushList();
      html += '<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin:20px 0;color:#e5dfe2;font-size:10px;letter-spacing:0.12em;"><span style="flex:1;height:1px;background:#e5dfe2;max-width:60px;"></span>· · ·<span style="flex:1;height:1px;background:#e5dfe2;max-width:60px;"></span></div>';
      continue;
    }

    // 引用块（以 > 开头）
    if (l.startsWith('> ')) {
      flushList();
      if (!inQuote) {
        html += '<div style="margin:20px 0;padding:20px 22px;background:#fdf2f5;border-left:3px solid #E8739A;border-radius:0 4px 4px 0;">';
        inQuote = true;
      }
      html += `<p style="font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-size:13px;line-height:1.85;color:#3a3a3a;font-style:italic;margin-bottom:8px;">${inlineMdWeChat(l.slice(2))}</p>`;
      continue;
    } else {
      flushQuote();
    }

    // 标题
    const h = l.match(/^#{1,3}\s+(.+)/);
    if (h) {
      flushList();
      html += `<p style="font-weight:700;color:#1a1a1a;margin:12px 0 8px;">${inlineMdWeChat(h[1])}</p>`;
      continue;
    }

    // 列表项
    if (l.startsWith('- ') || l.startsWith('* ')) {
      flushQuote();
      if (!inList) { html += '<ul style="margin:0 0 10px 18px;padding:0;list-style:disc;">'; inList = true; }
      html += `<li style="margin-bottom:4px;">${inlineMdWeChat(l.slice(2))}</li>`;
      continue;
    }

    flushQuote(); flushList();
    html += `<p style="margin-bottom:14px;">${inlineMdWeChat(l)}</p>`;
  }

  flushQuote();
  flushList();
  return html;
}

function inlineMdWeChat(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1a1a1a;font-weight:600;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="font-style:italic;color:#3a3a3a;">$1</em>');
}

/* ═══════════════════════════════════════════════════════════════════════
 * ④ HISTORY TAB
 * ═══════════════════════════════════════════════════════════════════════ */
function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>还没有保存的推文<br>在「成品」Tab 中定稿后保存到此处</p>
        </div>
      </div>`;
    return;
  }
  const actionsHtml = history.length ? `
    <div class="history-actions">
      <button class="btn btn-primary btn-sm" id="btn-export-all">📦 导出全部 HTML</button>
      <button class="btn btn-ghost btn-sm" id="btn-export-json">📋 导出备份 JSON</button>
    </div>` : '';
  $('#main').innerHTML = `
    <div class="screen">
      ${actionsHtml}
      <div class="history-list" id="history-list">
        ${history.map(h => {
          const date = new Date(h.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
          const vc = h.verdict === '强推' || h.verdict === '可推' ? 'verdict-rec' : h.verdict === '避雷可写' ? 'verdict-push' : 'verdict-pass';
          const icon = h.verdict === '强推' ? '⭐' : h.verdict === '可推' ? '✅' : h.verdict === '避雷可写' ? '⚠️' : '📝';
          return `
            <div class="history-item" data-id="${h.id}">
              <span class="h-icon">${icon}</span>
              <div class="h-body">
                <div class="h-title">${escapeHtml(h.title)}</div>
                <div class="h-meta">
                  <span>${date}</span>
                  ${h.verdict ? `<span class="h-verdict ${vc}">${escapeHtml(h.verdict)}</span>` : ''}
                  ${h.bookTitle ? `<span style="color:var(--text-lighter);">${escapeHtml(h.bookTitle)}</span>` : ''}
                </div>
              </div>
              <span class="h-arrow">→</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
  // 点击查看
  $$('.history-item').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const h = getHistory().find(e => e.id === id);
      if (h) showHistoryDetail(h);
    };
  });
  // 导出全部
  const btnExport = $('#btn-export-all');
  if (btnExport) btnExport.onclick = exportAllHTML;
  const btnJson = $('#btn-export-json');
  if (btnJson) btnJson.onclick = exportAllJSON;
}

function showHistoryDetail(h) {
  const date = new Date(h.createdAt).toLocaleString('zh-CN');
  $('#main').innerHTML = `
    <div class="screen" style="padding-bottom:120px;">
      <div class="book-info-bar">
        <span style="font-size:20px;flex-shrink:0;">←</span>
        <span class="b-title" style="cursor:pointer;" onclick="renderHistory()">返回历史</span>
        ${h.verdict ? `<span class="b-status" style="color:var(--macaron-pink);">${escapeHtml(h.verdict)}</span>` : ''}
      </div>
      <div class="title-card">
        <div class="title-label">${date}</div>
        <div class="title-value">${escapeHtml(h.title)}</div>
        <button class="btn btn-ghost btn-block" id="btn-copy-title-hist" style="margin-top:8px;">复制标题</button>
      </div>
      <div class="preview-wrap" id="preview-box-hist">${h.html}</div>
      <button class="btn btn-primary btn-block" id="btn-copy-html-hist" style="margin-bottom:10px;">📋 一键复制全文</button>
      <button class="btn btn-ghost btn-block" id="btn-reload-hist" style="margin-bottom:10px;">📝 回到阅读重新编辑</button>
      <button class="btn btn-danger btn-block" id="btn-delete-hist">🗑 删除此条</button>
    </div>`;
  $('#btn-copy-html-hist').onclick = () => copyHtml($('#preview-box-hist'));
  $('#btn-copy-title-hist').onclick = () => copyText(h.title);
  $('#btn-reload-hist').onclick = () => {
    // 恢复到 session 中重新编辑
    clearSession();
    session.book = { title: h.bookTitle || '历史文章', file: '', text: '', chars: 0, ext: '' };
    session.finalMd = h.markdown;
    session.draftMd = h.markdown;
    session.selectedTitle = h.title;
    session.verdict = h.verdict;
    session.step = 3;
    saveSession();
    navTo('reading');
    showRevise();
  };
  $('#btn-delete-hist').onclick = () => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <h3>确认删除</h3>
        <p>删除后无法恢复，确定要删除「${escapeHtml(h.title)}」吗？</p>
        <div class="btn-row">
          <button class="btn btn-ghost" id="dialog-cancel">取消</button>
          <button class="btn btn-danger" id="dialog-confirm">删除</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    $('#dialog-cancel', overlay).onclick = () => overlay.remove();
    $('#dialog-confirm', overlay).onclick = () => {
      const history = getHistory().filter(e => e.id !== h.id);
      localStorage.setItem('tweet_history', JSON.stringify(history));
      overlay.remove();
      toast('已删除');
      updateHistoryBadge();
      renderHistory();
    };
  };
}

function updateHistoryBadge() {
  const h = getHistory();
  const badge = $('#history-badge');
  if (badge) {
    badge.textContent = h.length || '';
    badge.classList.toggle('hidden', !h.length);
  }
}

async function exportAllHTML() {
  const history = getHistory();
  if (!history.length) { toast('没有可导出的文章'); return; }
  const zip = new JSZip();
  history.forEach((h, i) => {
    const filename = `推文_${(i + 1).toString().padStart(2, '0')}_${h.title.replace(/[\/:*?"<>|]/g, '_')}.html`;
    const fullHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(h.title)}</title></head><body style="background:#ededed;">${h.html}</body></html>`;
    zip.file(filename, fullHtml);
  });
  // 同时加入备份 JSON
  zip.file('推文数据备份.json', JSON.stringify(history, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `推文导出_${new Date().toISOString().slice(0, 10)}.zip`);
  toast('导出完成，请查看下载');
}

async function exportAllJSON() {
  const history = getHistory();
  if (!history.length) { toast('没有可导出的数据'); return; }
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `推文备份_${new Date().toISOString().slice(0, 10)}.json`);
  toast('备份完成');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════════════════
 * SETTINGS
 * ═══════════════════════════════════════════════════════════════════════ */
function openSettings() {
  const prev = $('#main').innerHTML;
  $('#main').innerHTML = `
    <div class="screen" id="settings-screen">
      <h3 style="margin-top:0;color:var(--text);">⚙️ 设置</h3>
      <div class="setting-group"><div class="setting-label">DeepSeek API Key</div><input type="password" id="set-api-key" value="${escapeHtml(CONFIG.API_KEY)}" placeholder="sk-..."></div>
      <div class="setting-group"><div class="setting-label">阅读模型（省钱快速）</div><input type="text" id="set-read-model" value="${escapeHtml(CONFIG.READ_MODEL)}"></div>
      <div class="setting-group"><div class="setting-label">写作模型（高质量）</div><input type="text" id="set-write-model" value="${escapeHtml(CONFIG.WRITE_MODEL)}"></div>
      <div class="tip">Key 只存在手机本地，不会上传到任何服务器。</div>
      <button class="btn btn-primary btn-block" id="btn-save-settings" style="margin-top:16px;">保存设置</button>
      <button class="btn btn-ghost btn-block" style="margin-top:12px;" id="btn-back-from-settings">返回</button>
    </div>`;
  $('#btn-save-settings').onclick = () => {
    CONFIG.API_KEY = $('#set-api-key').value.trim();
    CONFIG.READ_MODEL = $('#set-read-model').value.trim() || 'deepseek-v4-flash';
    CONFIG.WRITE_MODEL = $('#set-write-model').value.trim() || 'deepseek-v4-pro';
    saveUserConfig();
    toast('设置已保存');
    navTo('upload');
  };
  $('#btn-back-from-settings').onclick = () => { $('#main').innerHTML = prev; };
}

/* ═══════════════════════════════════════════════════════════════════════
 * INIT
 * ═══════════════════════════════════════════════════════════════════════ */
$('#btn-settings').onclick = openSettings;
$$('#nav button').forEach(b => b.onclick = () => navTo(b.dataset.tab));

(function init() {
  // 动态 vh 修复 iOS Safari
  const setVH = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 100));

  // 安全区域
  document.documentElement.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');

  // 恢复 session
  loadSession();

  // 更新历史 badge
  updateHistoryBadge();

  // 默认显示上传页
  if (!CONFIG.API_KEY) {
    openSettings();
  } else if (session.book && session.step > 0) {
    // 有未完成的 session → 跳到阅读
    navTo('reading');
  } else {
    navTo('upload');
  }
})();
