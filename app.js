/* ═══════════════════════════════════════════════════════════════════════
 * 推文助手 app.js
 * 纯前端 PWA · GitHub Pages 部署 · 零后端
 * 设计风格：book-mentor-app 温暖文学风
 * 微信文章渲染：hp-drarry-review-magazine 马卡龙杂志风
 * ═══════════════════════════════════════════════════════════════════════ */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* ─── State ─── */
const STEPS = ['角度', '深度', '标题', '定稿'];
const EMPTY_BOOK = () => ({
  title: '', file: null, text: '', chars: 0, ext: '',
});
const EMPTY_SESSION = () => ({
  book: null,           // 当前书籍信息
  angleReports: null,   // 四个角度的摘要报告 {cp, family, plot, general}
  selectedAngle: '',    // 用户选择的角度: cp|family|plot|general
  deepReport: null,     // 选定角度的深度结构化报告
  verdict: '',          // 判定结果
  titleOptions: [],     // 标题候选
  selectedTitle: '',    // 选中的标题
  draftMd: '',          // AI 生成的中性初稿
  finalMd: '',          // 当前选中的定稿 markdown
  versions: {},         // 去 AI 味三版本 {restrained, balanced, social}
  activeVersion: '',    // 当前激活的版本，空字符串表示初稿
  step: 0,              // 0=已上传, 1=角度摘要, 2=深度报告, 3=已选标题, 4=已定稿
  previewMode: false,   // 编辑/预览切换
});
let session = EMPTY_SESSION();

function saveSession() {
  if (!session.book) return;
  localStorage.setItem('tweet_session', JSON.stringify({
    book: session.book,
    angleReports: session.angleReports,
    selectedAngle: session.selectedAngle,
    deepReport: session.deepReport,
    verdict: session.verdict,
    titleOptions: session.titleOptions,
    selectedTitle: session.selectedTitle,
    draftMd: session.draftMd,
    finalMd: session.finalMd,
    versions: session.versions,
    activeVersion: session.activeVersion,
    step: session.step,
  }));
}
function loadSession() {
  try {
    const raw = localStorage.getItem('tweet_session');
    if (raw) {
      const s = JSON.parse(raw);
      session.book = s.book || null;
      session.angleReports = s.angleReports || null;
      session.selectedAngle = s.selectedAngle || '';
      session.deepReport = s.deepReport || null;
      session.verdict = s.verdict || '';
      session.titleOptions = s.titleOptions || [];
      session.selectedTitle = s.selectedTitle || '';
      session.draftMd = s.draftMd || '';
      session.finalMd = s.finalMd || '';
      session.versions = s.versions || {};
      session.activeVersion = s.activeVersion || '';
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

function updateStyleHint() {
  const hints = {
    restrained: '深度书评 · 纯文字 · 句长均匀',
    balanced: '有长短句节奏 · 无 emoji',
    social: '快节奏 · 有 emoji · 小红书风',
  };
  const el = $('#style-hint');
  if (el) el.textContent = '生成阶段轻量引导，审校阶段深度加工 · ' + (hints[currentStyle] || '');
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
  if (step >= 4 && session.finalMd) {
    showRevise();
  } else if (step >= 3 && session.draftMd) {
    showRevise();
  } else if (step >= 2 && session.deepReport) {
    if (session.selectedTitle) showTitleSelector();
    else showDeepReport();
  } else if (step >= 1 && session.angleReports) {
    showAngleSelector();
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
      <button class="btn btn-primary btn-block" id="btn-read" style="margin-bottom:12px;">🤖 AI 阅读 · 生成多角度报告</button>
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
        <p style="font-size:12px;color:var(--text-lighter);">Flash 模型 · 四角度并行分析 · 约 60-120 秒</p>
      </div>
    </div>`;

  // 计时器
  const timerInterval = setInterval(() => {
    const el = $('#elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const text = truncateText(b.text, 200000);
  const prompt = `请阅读以下小说全文，从四个角度分别输出简短的阅读报告。每个角度控制在 150-300 字，聚焦该角度最值得写的点。同时给出一个综合判定。

输出格式（严格按此结构）：
【cp向】
（聚焦感情线：概括 CP 关系动态、糖点/虐点分布、感情线节奏、可以从哪个角度切入推文）
【亲情向】
（聚焦家庭/亲情线：概括关键亲情关系、家庭冲突或温情场景、可以从哪个角度切入推文）
【剧情向】
（聚焦剧情与世界观：概括核心剧情亮点、设定特色、悬念或反转、可以从哪个角度切入推文）
【综合向】
（兼顾 CP + 亲情 + 剧情 + 人物成长，做全面概括，可以从哪个角度切入推文）
【判定】
（强推 / 可推 / 避雷可写 / 不推不写，并给简短理由）

小说全文：
${text}`;

  try {
    const res = await deepSeekChat(CONFIG.READ_MODEL, prompt, 4000);
    clearInterval(timerInterval);
    session.angleReports = parseAngleReports(res);
    session.readReportTime = ((Date.now() - startTime) / 1000).toFixed(0);
    session.step = 1;
    // 提取判定
    if (res.includes('强推')) session.verdict = '强推';
    else if (res.includes('可推')) session.verdict = '可推';
    else if (res.includes('避雷可写')) session.verdict = '避雷可写';
    else session.verdict = '不推不写';
    saveSession();
    showAngleSelector();
  } catch (e) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="loading">阅读失败：${escapeHtml(e.message)}</div>
        <button class="btn btn-primary btn-block" onclick="runReading()">重试</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showBookMenu()">返回</button>
      </div>`;
  }
}

function parseAngleReports(res) {
  const out = { cp: '', family: '', plot: '', general: '' };
  // 先合并 AI 可能加的多余换行（不超过3个连续换行）
  const cleaned = res.replace(/\n{4,}/g, '\n\n\n');
  const sections = cleaned.split(/【(.+?)】/s);
  for (let i = 1; i < sections.length; i += 2) {
    const key = sections[i].replace(/向$/, '').trim();
    const content = (sections[i + 1] || '').trim();
    if (key === 'cp' || key === 'CP') out.cp = content;
    else if (key === '亲情') out.family = content;
    else if (key === '剧情') out.plot = content;
    else if (key === '综合') out.general = content;
  }
  // 兜底：如果解析失败，把整个结果放进综合
  if (!out.cp && !out.family && !out.plot && !out.general) {
    out.general = cleaned.trim();
  }
  return out;
}

/* ─── 角度选择页 ─── */
function showAngleSelector() {
  const b = session.book;
  const v = session.verdict;
  const verdictColor = v === '不推不写' ? 'var(--text-light)' : v === '避雷可写' ? 'var(--macaron-pink)' : 'var(--macaron-sky)';
  const stepHtml = stepIndicator(0);
  const reports = session.angleReports || {};
  const angles = [
    { key: 'cp', icon: '💕', label: 'CP 向', desc: reports.cp || '（解析中...）' },
    { key: 'family', icon: '👨‍👩‍👧', label: '亲情向', desc: reports.family || '（解析中...）' },
    { key: 'plot', icon: '📖', label: '剧情向', desc: reports.plot || '（解析中...）' },
    { key: 'general', icon: '🎭', label: '综合向', desc: reports.general || '（解析中...）' },
  ];

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
      <p style="font-size:14px;color:var(--text);margin:0 0 10px;">选择一个写作角度，AI 将基于此角度生成深度报告和推文：</p>
      <div class="angle-grid" id="angle-grid">
        ${angles.map((a, i) => {
          const sel = session.selectedAngle === a.key ? ' selected' : '';
          return `<button class="angle-card${sel}" data-angle="${a.key}">
            <div class="angle-icon">${a.icon}</div>
            <div class="angle-title">${a.label}</div>
            <div class="angle-summary">${escapeHtml(a.desc.slice(0, 120))}${a.desc.length > 120 ? '...' : ''}</div>
          </button>`;
        }).join('')}
      </div>
      ${v === '不推不写' ? `
        <button class="btn btn-ghost btn-block" id="btn-pass">标记"已过"</button>
      ` : `
        <button class="btn btn-primary btn-block" id="btn-deep-report" style="margin-bottom:12px;">下一步：生成深度报告</button>
        <button class="btn btn-ghost btn-block" id="btn-pass">这书不推，标记"已过"</button>
      `}
      <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showBookMenu()">返回</button>
      <div class="dialog-overlay hidden" id="angle-detail-dialog" onclick="this.classList.add('hidden')">
        <div class="dialog-box" id="angle-detail-box" style="max-width:380px;text-align:left;" onclick="event.stopPropagation()">
          <h3 id="angle-detail-title" style="margin:0 0 10px;"></h3>
          <div id="angle-detail-body" style="font-size:14px;line-height:1.8;color:var(--text);max-height:400px;overflow-y:auto;"></div>
          <button class="btn btn-primary btn-block" id="btn-angle-detail-close" style="margin-top:12px;">关闭</button>
        </div>
      </div>
    </div>`;
  // 角度点击：单击选中；再点已选中 → 弹浮窗看完整报告
  $('#angle-grid').onclick = (e) => {
    const card = e.target.closest('.angle-card');
    if (!card) return;
    const key = card.dataset.angle;
    // 已选中 → 弹出详情
    if (key === session.selectedAngle) {
      const a = angles.find(aa => aa.key === key);
      if (a) {
        const dialog = $('#angle-detail-dialog');
        $('#angle-detail-title').textContent = a.label;
        $('#angle-detail-body').innerHTML = renderMarkdown(a.desc);
        dialog.classList.remove('hidden');
      }
      return;
    }
    // 选中
    $$('.angle-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    session.selectedAngle = card.dataset.angle;
    saveSession();
  };
  $('#btn-angle-detail-close').onclick = () => $('#angle-detail-dialog').classList.add('hidden');
  // 默认选中
  if (!session.selectedAngle) {
    session.selectedAngle = 'general';
    const firstCard = $('.angle-card[data-angle="general"]');
    if (firstCard) firstCard.classList.add('selected');
    saveSession();
  }
  $('#btn-pass').onclick = () => {
    toast('已标记"已过"');
    clearSession();
    navTo('upload');
  };
  const btnDeep = $('#btn-deep-report');
  if (btnDeep) btnDeep.onclick = () => runDeepReport();
}

/* ─── 深度阅读报告生成 ─── */
async function runDeepReport() {
  if (!session.selectedAngle) { toast('请先选择一个角度'); return; }
  const angle = session.selectedAngle;
  const angleLabels = { cp: 'CP 向', family: '亲情向', plot: '剧情向', general: '综合向' };
  const startTime = Date.now();
  const b = session.book;

  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">🔬</span>
        <span class="b-title">正在生成${angleLabels[angle] || ''}深度报告...</span>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar"><div class="progress-bar-slider"></div></div>
      </div>
      <div class="loading" style="padding:20px 16px;">
        <p id="elapsed-text">⏱ 已等待 0 秒</p>
        <p style="font-size:12px;color:var(--text-lighter);">Flash 模型 · 深度分析 · 约 30-60 秒</p>
      </div>
    </div>`;

  const timerInterval = setInterval(() => {
    const el = $('#elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const text = truncateText(b.text, 200000);
  const anglePrompts = {
    cp: '聚焦 CP 感情线，输出结构化深度报告：1) 两人关系的完整演变（从初遇到结局）；2) 关键糖点/虐点场景（至少3处，带原文引用）；3) 感情线节奏分析（慢热/一见钟情/双向暗恋等）；4) 适合推文的切入角度建议（2-3个）；5) 雷点/避雷预警。总字数控制在800字以内。',
    family: '聚焦家庭/亲情线，输出结构化深度报告：1) 核心亲情关系图谱；2) 关键家庭场景（至少3处，带原文引用）；3) 亲情线的温度和冲突点；4) 适合推文的切入角度建议（2-3个）；5) 雷点/避雷预警。总字数控制在800字以内。',
    plot: '聚焦剧情与世界观，输出结构化深度报告：1) 核心剧情脉络和关键转折；2) 世界观/设定亮点；3) 叙事结构和节奏分析；4) 适合推文的切入角度建议（2-3个）；5) 雷点/避雷预警。总字数控制在800字以内。',
    general: '输出综合结构化深度报告：1) CP 感情线核心看点；2) 亲情/家庭线核心看点；3) 剧情与世界观亮点；4) 人物成长弧光；5) 适合推文的切入角度建议（2-3个，标注每个建议偏向哪个角度）；6) 雷点/避雷预警。总字数控制在800字以内。',
  };

  const prompt = `请阅读以下小说全文，按此要求输出深度阅读报告：

${anglePrompts[angle] || anglePrompts.general}

输出格式：直接输出 Markdown 结构的报告，包括"基础信息"（作者/字数/标签）、"核心看点"、"关键场景"、"切入建议"、"避雷预警"五个板块。

小说全文：
${text}`;

  try {
    const res = await deepSeekChat(CONFIG.READ_MODEL, prompt, 4000);
    clearInterval(timerInterval);
    session.deepReport = res;
    session.deepReportTime = ((Date.now() - startTime) / 1000).toFixed(0);
    session.step = 2;
    saveSession();
    showDeepReport();
  } catch (e) {
    $('#main').innerHTML = `
      <div class="screen">
        <div class="loading">深度报告生成失败：${escapeHtml(e.message)}</div>
        <button class="btn btn-primary btn-block" onclick="runDeepReport()">重试</button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showAngleSelector()">返回选角度</button>
      </div>`;
  }
}

/* ─── 深度报告展示页 ─── */
function showDeepReport() {
  const b = session.book;
  const angleLabels = { cp: '💕 CP 向', family: '👨‍👩‍👧 亲情向', plot: '📖 剧情向', general: '🎭 综合向' };
  const stepHtml = stepIndicator(2);
  $('#main').innerHTML = `
    <div class="screen">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">🔬</span>
        <span class="b-title">${escapeHtml(b.title)}</span>
      </div>
      ${stepHtml}
      <div class="card">
        <div class="card-title">${angleLabels[session.selectedAngle] || ''} · 深度报告</div>
      </div>
      ${session.deepReportTime ? `<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">✅ 深度报告完成 · 耗时 ${session.deepReportTime} 秒</div>` : ''}
      <div class="report-card">${renderMarkdown(session.deepReport)}</div>
      <button class="btn btn-primary btn-block" id="btn-title-options" style="margin-bottom:12px;">生成标题候选</button>
      <button class="btn btn-ghost btn-block" id="btn-back-angle" style="margin-bottom:8px;">返回修改角度</button>
      <button class="btn btn-ghost btn-block" onclick="showBookMenu()">返回</button>
    </div>`;
  const tbtn = $('#btn-title-options');
  if (tbtn) tbtn.onclick = () => generateTitleOptions();
  $('#btn-back-angle').onclick = () => showAngleSelector();
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
  if (!session.deepReport) return;
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

  const prompt = `根据以下深度阅读报告，为这篇小说的公众号推文生成 5 个标题候选。

要求：
- 每个标题贴合剧情、有吸引力、适合 1500 字公众号推文
- 不要夸张到失实，不要剧透核心反转
- 标题党但真诚，能勾起读者点击兴趣
- 判定调性为「${session.verdict}」：
  - 强推/可推：突出精彩看点、张力、名场面氛围
  - 避雷可写：可带「避雷」「测评」「先别嗑」等警示感
- 只输出 5 行标题，每行前面加编号 1-5，不要多余解释
- 每个标题（含标点符号）控制在 20 字左右，不超过 25 字

深度报告：
${session.deepReport}`;

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
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="showDeepReport()">返回</button>
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
      ${stepIndicator(3)}
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
      <button class="btn btn-ghost btn-block" style="margin-top:12px;" onclick="showDeepReport()">返回修改标题</button>
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
  const angle = session.selectedAngle || 'general';
  const angleGuide = ANGLE_GUIDES[angle] || ANGLE_GUIDES.general;

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

深度阅读报告（素材来源，基于此报告创作，不要复述整份报告）：
${session.deepReport}

写作角度引导：
${angleGuide}

基调要求（初稿阶段不预设具体风格，只要求真诚、可读、有细节）：
- 用具体细节和名场面引用说话，少空泛形容词
- 段落 1-3 句短段落为主，手机端阅读友好
- 标题党但真诚，不要夸张到失实
- 文案口语化，像真人推书
- 名场面预警只聚焦 1 个最戳人的场面，用画面感和短句节奏把它写透，不要罗列多个场面

要求：
- 全文控制在 1500 字左右（含信息卡），不要写超长文
- 每章 1-3 段短段落，不要复述大量剧情，只保留最能支撑标题角度的 1-2 个细节/名场面
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
    session.versions = {};      // 三种去 AI 味版本，点一个生成一个
    session.activeVersion = ''; // 当前选中的版本 key
    session.step = 3;
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
function getVersionLabel(key) {
  const map = { restrained: '克制版', balanced: '平衡版', social: '社媒版' };
  return map[key] || key;
}

function getCurrentReviseMd() {
  const active = session.activeVersion || '';
  if (active && session.versions?.[active]) return session.versions[active];
  return session.finalMd || session.draftMd || '';
}

function saveCurrentEditorValue() {
  const editor = $('#md-editor');
  if (!editor) return;
  const md = editor.value;
  const active = session.activeVersion || '';
  if (active) {
    if (!session.versions) session.versions = {};
    session.versions[active] = md;
  }
  session.finalMd = md;
}

function showRevise() {
  session.previewMode = false;
  const title = session.selectedTitle || (session.book?.title || '推文标题');
  const versions = session.versions || {};
  const active = session.activeVersion || '';
  const currentMd = getCurrentReviseMd();

  const versionTabs = [
    { key: '', label: '初稿' },
    { key: 'restrained', label: '📖 克制版' },
    { key: 'balanced', label: '⚖️ 平衡版' },
    { key: 'social', label: '📱 社媒版' },
  ];

  // 根据当前激活版本生成操作按钮
  let actionButtons = '';
  if (active === '') {
    actionButtons = `
      <div class="version-actions">
        <button class="btn btn-accent btn-generate-version" data-style="restrained" type="button">生成克制版</button>
        <button class="btn btn-accent btn-generate-version" data-style="balanced" type="button">生成平衡版</button>
        <button class="btn btn-accent btn-generate-version" data-style="social" type="button">生成社媒版</button>
      </div>`;
  } else {
    const has = !!versions[active];
    actionButtons = `
      <div class="version-actions">
        <button class="btn btn-accent btn-generate-version" data-style="${active}" type="button">${has ? '重新生成' : '生成'}${getVersionLabel(active)}</button>
      </div>`;
  }

  $('#main').innerHTML = `
    <div class="screen" style="padding-bottom:40px;">
      <div class="book-info-bar">
        <span style="font-size:24px;flex-shrink:0;">📝</span>
        <span class="b-title">${escapeHtml(session.book.title)}</span>
      </div>
      ${stepIndicator(4)}
      <div class="title-card">
        <div class="title-label">文章标题</div>
        <div class="title-value">${escapeHtml(title)}</div>
        <button class="btn btn-ghost btn-block" id="btn-copy-title-revise" style="margin-top:8px;">复制标题</button>
      </div>
      <div class="chat-bubble ai">这是初稿。点击下方版本按钮可生成去 AI 味版本；你可以直接编辑任一版本，满意后点「完成并下载」。</div>
      <div class="version-tabs" id="version-tabs">
        ${versionTabs.map(v => {
          const has = v.key === '' ? true : !!versions[v.key];
          const cls = active === v.key ? 'active' : '';
          const badge = v.key && has ? ' ✓' : '';
          return `<button class="version-tab ${cls}" data-version="${v.key}" type="button">${v.label}${badge}</button>`;
        }).join('')}
      </div>
      <div class="editor-tabs">
        <button class="editor-tab active" id="tab-edit" type="button">编辑</button>
        <button class="editor-tab" id="tab-preview" type="button">预览</button>
      </div>
      <div id="editor-area">
        <textarea class="editor-textarea" id="md-editor">${escapeHtml(currentMd)}</textarea>
      </div>
      ${actionButtons}
      <button class="btn btn-pink btn-block" id="btn-finalize" style="margin-bottom:10px;">✅ 完成并下载</button>
      <button class="btn btn-ghost btn-block" onclick="showTitleSelector()">返回改标题</button>
    </div>`;

  $('#btn-copy-title-revise').onclick = () => copyText(title);
  $('#btn-finalize').onclick = () => {
    saveCurrentEditorValue();
    session.step = 4;
    saveSession();
    const finalTitle = session.selectedTitle || session.book?.title || '推文';
    const entry = {
      id: Date.now().toString(36),
      title: finalTitle,
      verdict: session.verdict,
      markdown: session.finalMd,
      bookTitle: session.book?.title || '',
      createdAt: new Date().toISOString(),
    };
    saveHistory(entry);
    downloadMarkdown(session.finalMd, finalTitle);
    clearSession();
    updateHistoryBadge();
    toast('已下载并保存到历史');
    navTo('upload');
  };

  // 版本切换
  $$('.version-tab').forEach(tab => {
    tab.onclick = () => {
      saveCurrentEditorValue();
      session.activeVersion = tab.dataset.version;
      session.finalMd = getCurrentReviseMd();
      saveSession();
      showRevise();
    };
  });

  // 生成版本
  $$('.btn-generate-version').forEach(btn => {
    btn.onclick = () => generateVersion(btn.dataset.style);
  });

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
    area.innerHTML = `<textarea class="editor-textarea" id="md-editor">${escapeHtml(getCurrentReviseMd())}</textarea>`;
  }
}

/* ─── 后端生成去 AI 味版本（克制/平衡/社媒）─── */
async function generateVersion(style) {
  const source = session.draftMd || session.finalMd;
  if (!source) { toast('没有可润色的初稿'); return; }

  const startTime = Date.now();
  const btn = $(`.btn-generate-version[data-style="${style}"]`);
  if (btn) { btn.textContent = '生成中...'; btn.disabled = true; }

  // 在按钮区插入进度条
  const actions = $('#version-actions');
  let progEl = null;
  if (actions) {
    progEl = document.createElement('div');
    progEl.id = 'version-progress';
    progEl.innerHTML = `
      <div class="progress-bar-wrapper" style="padding:8px 0;">
        <div class="progress-bar"><div class="progress-bar-slider"></div></div>
      </div>
      <p id="version-elapsed-text" style="font-size:13px;color:var(--text-light);margin:0 0 8px;">⏱ 已等待 0 秒</p>
    `;
    actions.appendChild(progEl);
  }

  const timerInterval = setInterval(() => {
    const el = $('#version-elapsed-text');
    if (el) el.textContent = `⏱ 已等待 ${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  // 临时设置 currentStyle，让 getPolishPrompt 输出对应风格规则
  const prevStyle = currentStyle;
  currentStyle = style;
  const prompt = `${getPolishPrompt()}

现在请对以下推书文初稿进行去 AI 味润色。记住：你是编辑，不是作者。只改需要改的地方，保留原文的结构、信息和已经很好的段落。

初稿如下：
${source}`;

  try {
    const res = await deepSeekChat(CONFIG.WRITE_MODEL, prompt, 6000, 180000);
    clearInterval(timerInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    if (progEl) progEl.remove();

    let polished = res.replace(/^#\s*.+\n+/m, '');
    polished = polished.replace(/^##\s+/gm, '### ');

    if (!session.versions) session.versions = {};
    session.versions[style] = polished;
    session.activeVersion = style;
    session.finalMd = polished;
    saveSession();
    showRevise();
    toast(`${getVersionLabel(style)}已生成 · 耗时 ${elapsed} 秒`);
  } catch (e) {
    clearInterval(timerInterval);
    if (progEl) progEl.remove();
    const existed = !!(session.versions && session.versions[style]);
    if (btn) { btn.textContent = existed ? `重新生成${getVersionLabel(style)}` : `生成${getVersionLabel(style)}`; btn.disabled = false; }
    alert('生成失败：' + e.message);
  } finally {
    currentStyle = prevStyle;
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
      <button class="btn btn-accent btn-block" id="btn-download-md" style="margin-bottom:10px;">📥 下载 Markdown</button>
      <button class="btn btn-ghost btn-block" id="btn-back-edit">返回修改文字</button>
    </div>`;
  $('#btn-copy-html').onclick = () => copyHtml($('#preview-box'));
  $('#btn-download-md').onclick = () => downloadMarkdown(session.finalMd, session.selectedTitle || session.book?.title || '推文');
  $('#btn-copy-title-final').onclick = () => copyText(title);
  $('#btn-back-edit').onclick = () => { navTo('reading'); showRevise(); };
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

/* ═══════════════════════════════════════════════════════════════════════
 * 橄榄手记组件库（嵌入式 JS 模板）
 * 来源：gzh-design references/theme-olive-journal.md
 * ═══════════════════════════════════════════════════════════════════════ */
const OLIVE = (() => {
  const FONT = "'IBM Plex Sans',-apple-system,system-ui,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
  const LEAF = (s) => `<span leaf="">${s}</span>`;

  // 全局容器开
  function globalOpen() {
    return `<section style="max-width:677px;margin:0 auto;padding:8px;box-sizing:border-box;background:#fdfdf8;color:#4d4f46;font-family:${FONT};line-height:1.75;">`;
  }
  // 全局容器闭
  function globalClose() { return '</section>'; }
  // 隐藏标记
  function hiddenMark() { return '<p style="display:none;"><mp-style-type data-value="3"></mp-style-type></p>'; }

  // 头图卡（组件2，无旧标题行，无插画）
  function heroCard(label, mainTitle, strongWord, subtitle, summary, tagsArr) {
    const tagsHtml = (tagsArr || []).slice(0, 2).map(t =>
      `<span style="background:#e5e7e0;color:#23251d;padding:3px 8px;border-radius:4px;font-size:8px;font-weight:700;border:1px solid #bfc1b7;">${LEAF(escapeHtml(t))}</span>`
    ).join('');
    return `
<section style="background:#fdfdf8;border:1px solid #bfc1b7;border-radius:6px;overflow:hidden;font-family:${FONT};">
  <section style="padding:28px 24px 22px;">
    <section style="display:flex;align-items:center;gap:8px;margin-bottom:22px;">
      <span style="width:8px;height:8px;background:#1e1f23;border-radius:50%;display:inline-block;overflow:hidden;vertical-align:middle;font-size:0;line-height:0;">${LEAF('&nbsp;')}</span>
      <span style="font-size:10px;font-weight:700;letter-spacing:3px;color:#65675e;">${LEAF(escapeHtml(label))}</span>
      <span style="flex:1;height:1px;background:#bfc1b7;display:inline-block;overflow:hidden;vertical-align:middle;font-size:0;line-height:0;">${LEAF('&nbsp;')}</span>
      <span style="font-size:10px;color:#9ea096;font-weight:500;font-variant-numeric:tabular-nums;">${LEAF('2026.07')}</span>
    </section>
    <section>
      <p style="font-size:24px;font-weight:800;color:#23251d;margin:0 0 10px;line-height:1.15;letter-spacing:-0.75px;">
        ${LEAF(escapeHtml(mainTitle))}<span style="color:#4d4f46;">${LEAF('&nbsp;·&nbsp;')}</span><span style="border-bottom:3px solid #e5e7e0;">${LEAF(escapeHtml(strongWord))}</span>
      </p>
      <section style="display:flex;align-items:center;gap:4px;margin-bottom:12px;">
        <span style="width:22px;height:3px;background:#1e1f23;border-radius:2px;display:inline-block;overflow:hidden;vertical-align:middle;font-size:0;line-height:0;">${LEAF('&nbsp;')}</span>
        <span style="width:8px;height:3px;background:#bfc1b7;border-radius:2px;display:inline-block;overflow:hidden;vertical-align:middle;font-size:0;line-height:0;">${LEAF('&nbsp;')}</span>
      </section>
      <p style="font-size:13px;color:#65675e;margin:0;line-height:1.7;">${LEAF(escapeHtml(subtitle))}</p>
    </section>
  </section>
  <section style="background:#1e1f23;padding:11px 24px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
    <p style="font-size:12px;color:rgba(255,255,255,0.92);margin:0;font-weight:600;">${LEAF(escapeHtml(summary))}</p>
    ${tagsHtml ? `<section style="display:flex;gap:6px;flex-wrap:wrap;">${tagsHtml}</section>` : ''}
  </section>
</section>`;
  }

  // 编者按（组件14）
  function editorNote(label, noteItems) {
    return `
<section style="margin-top:24px;">
  <section style="background:#fdfdf8;border:1px solid #bfc1b7;border-radius:6px;overflow:hidden;font-family:${FONT};">
    <section style="padding:10px 16px;background:#1e1f23;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <p style="margin:0;font-size:10px;font-weight:800;letter-spacing:2px;color:#ffffff;">${LEAF(escapeHtml(label))}</p>
      <span style="font-size:10px;color:rgba(255,255,255,0.65);">${LEAF('INFO')}</span>
    </section>
    <section style="padding:16px 18px 18px;background:#eeefe9;">
      <p style="margin:0;font-size:14px;line-height:1.9;color:#4d4f46;text-align:justify;">${LEAF(escapeHtml(noteItems))}</p>
    </section>
  </section>
</section>`;
  }

  // 章节标题（组件3，保留编号）
  function sectionTitle(num, cnTitle, enTag) {
    return `
<section style="margin-top:24px;">
  <section style="font-family:${FONT};">
    <section style="display:flex;align-items:center;gap:14px;">
      <section style="text-align:center;flex-shrink:0;">
        <p style="margin:0;font-size:24px;font-weight:800;color:#23251d;line-height:1;letter-spacing:-2px;">${LEAF(num)}</p>
        <p style="margin:0;font-size:8px;font-weight:700;color:#9ea096;letter-spacing:2px;">${LEAF(num === '///' ? 'END' : 'PART')}</p>
      </section>
      <span style="width:1px;height:36px;background:#bfc1b7;flex-shrink:0;display:inline-block;overflow:hidden;vertical-align:middle;font-size:0;line-height:0;">${LEAF('&nbsp;')}</span>
      <section>
        <p style="margin:0 0 1px;font-size:17px;font-weight:800;color:#23251d;letter-spacing:0.2px;">${LEAF(escapeHtml(cnTitle))}</p>
        <p style="margin:0;font-size:11px;font-weight:600;color:#65675e;letter-spacing:1.2px;">${LEAF(escapeHtml(enTag))}</p>
      </section>
    </section>
  </section>
</section>`;
  }

  // 正文段落（组件10）
  function paragraph(text) {
    return `
<section style="margin-top:24px;">
  <section style="font-family:${FONT};">
    <p style="margin:0;font-size:14px;line-height:1.9;text-align:justify;color:#4d4f46;">${text}</p>
  </section>
</section>`;
  }

  // 重点观点卡（组件15，无橙色下划线）
  function keyPointCard(pointText, noteText) {
    const notePart = noteText ? `&nbsp;${LEAF(escapeHtml(noteText))}` : '';
    return `
<section style="margin-top:24px;">
  <section style="font-family:${FONT};">
    <section style="background:#fdfdf8;border-radius:6px;padding:16px 18px;border:1px solid #bfc1b7;">
      <p style="font-size:14px;color:#4d4f46;margin:0;line-height:1.8;text-align:justify;">
        <strong style="color:#23251d;">${LEAF(escapeHtml(pointText))}</strong>${notePart}
      </p>
    </section>
  </section>
</section>`;
  }

  // 结尾行动区（组件28）
  function endingActions() {
    return `
<section style="margin-top:24px;">
  <section style="background:#fdfdf8;border:1px solid #bfc1b7;border-radius:6px;padding:22px 16px;text-align:center;font-family:${FONT};">
    <p style="font-size:13px;font-weight:700;color:#23251d;line-height:1.6;margin:0 0 14px;">${LEAF('如果你觉得今天这篇有收获，欢迎点赞、在看、转发三连，我们下篇见。')}</p>
    <section style="display:flex;justify-content:center;gap:18px;margin-bottom:14px;flex-wrap:wrap;">
      <section style="text-align:center;color:#4d4f46;">
        <section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;background:#eeefe9;border-radius:6px;border:1px solid #bfc1b7;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
        </section>
        <span style="font-size:11px;font-weight:600;">${LEAF('赞')}</span>
      </section>
      <section style="text-align:center;color:#4d4f46;">
        <section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;background:#eeefe9;border-radius:6px;border:1px solid #bfc1b7;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path></svg>
        </section>
        <span style="font-size:11px;font-weight:600;">${LEAF('在看')}</span>
      </section>
      <section style="text-align:center;color:#23251d;">
        <section style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;background:#d4c9b8;border-radius:6px;border:1px solid #b17816;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#23251d" stroke-width="1.8" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </section>
        <span style="font-size:11px;font-weight:700;">${LEAF('收藏')}</span>
      </section>
    </section>
    <p style="line-height:1.6;font-size:10px;color:#9ea096;letter-spacing:2px;margin:0;font-weight:500;">${LEAF('THANKS FOR READING')}</p>
  </section>
</section>`;
  }

  return { LEAF, globalOpen, globalClose, hiddenMark, heroCard, editorNote, sectionTitle, paragraph, keyPointCard, endingActions };
})();

/* ─── 橄榄手记风格 HTML 渲染 ─── */
function renderMagazineHTML(md, overrideTitle) {
  const title = overrideTitle || '推文标题';
  const cleanMd = md.replace(/\*\*(.+?)\*\*/g, '$1');

  // 元数据提取
  const author = (cleanMd.match(/作者\s*[:：]\s*(.+)/)?.[1] || '').trim();
  const rating = (cleanMd.match(/分级\s*[:：]\s*(.+)/)?.[1] || '').trim();
  const cp = (cleanMd.match(/CP\s*[:：]\s*(.+)/)?.[1] || '').replace(/<\/?[^>]+>/g, '').trim();
  const tagsRaw = (cleanMd.match(/标签\s*[:：]\s*(.+)/)?.[1] || '').split(/[,，\/]/).map(s => s.replace(/<\/?[^>]+>/g, '').trim()).filter(Boolean);
  const workTitle = (cleanMd.match(/原作\s*[:：]\s*(.+)/)?.[1] || '').replace(/[《》]/g, '').trim();

  // 基本信息行
  const metaParts = [];
  if (rating) metaParts.push(`分级：${rating}`);
  if (workTitle) metaParts.push(`原作：《${workTitle}》`);
  if (author) metaParts.push(`作者：${author}`);
  if (cp) metaParts.push(`CP：${cp}`);
  if (tagsRaw.length) metaParts.push(`标签：${tagsRaw.join('、')}`);
  const metaStr = metaParts.join('　');

  // 章节解析（00 链接 + 01~05 正文）
  const sections = parseSections(md);
  const labelMap = {
    '小说哪里看':       { num: '00', en: 'GUIDE · 阅读入口' },
    '文案推荐':         { num: '01', en: 'SYNOPSIS · 沦陷的开端' },
    'Fanst 碎碎念':     { num: '02', en: 'THOUGHTS · 黑咖啡般的回味' },
    '名场面预警':       { num: '03', en: 'HIGHLIGHT · 带着刺的温柔' },
    '最戳我的一个细节': { num: '04', en: 'DETAIL · 一块旧浴巾的尊重' },
    '综合评价':         { num: '///', en: 'VERDICT · 压得住阵脚的存在' },
    '避雷点':           { num: '01', en: 'WARNING · 先睹为快' },
    '踩雷预警':         { num: '03', en: 'CAUTION · 谨慎阅读' },
    '最戳我的一个槽点': { num: '04', en: 'FLAW · 瑕不掩瑜' },
  };

  // 构建章节 HTML
  let sectionHtml = '';
  sections.forEach(sec => {
    const key = Object.keys(labelMap).find(k => sec.label === k || sec.label.includes(k));
    const cfg = key ? labelMap[key] : null;
    const cn = sec.label.replace(/^\d+\s*/, '');
    const en = cfg ? cfg.en : '';
    const num = cfg ? cfg.num : '';

    if (key === '小说哪里看') {
      // 00 章节：标题 + 链接正文
      sectionHtml += OLIVE.sectionTitle(num, cn, en);
      sectionHtml += renderWeChatBody(sec.body);
    } else {
      sectionHtml += OLIVE.sectionTitle(num, cn, en);
      sectionHtml += renderWeChatBody(sec.body);
    }
  });

  // 标签（头图卡底部用）
  const heroTags = tagsRaw.slice(0, 2);

  return (
    OLIVE.globalOpen() +
    OLIVE.heroCard('FANFIC · 深度书评', title, '推文精选', tagsRaw.join(' · '), `同人佳作推荐：${escapeHtml(title)}`, heroTags) +
    OLIVE.editorNote('基本信息', metaStr) +
    sectionHtml +
    OLIVE.endingActions() +
    '<section style="margin-top:8px;text-align:center;"><p style="margin:0;font-size:11px;line-height:1.8;color:#9ea096;font-family:\'IBM Plex Sans\',sans-serif;">' + OLIVE.LEAF('所有荣誉与利益属于作者和创作者。即使不了解角色，该书仍可当成独立小说看待。') + '</p></section>' +
    OLIVE.globalClose() +
    OLIVE.hiddenMark()
  );
}

function parseSections(md) {
  const sections = [];
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
  return OLIVE.sectionTitle(num, label, '') + renderWeChatBody(body);
}

function renderWeChatBody(body) {
  const lines = body.split('\n');
  let html = '';
  let inQuote = false;
  let inList = false;

  const flushQuote = () => { if (inQuote) { html += '</section></section></section>'; inQuote = false; } };
  const flushList = () => { if (inList) { html += '</ul></section></section>'; inList = false; } };

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    // 分隔线
    if (/^[-*_]{3,}$/.test(l) || l === '· · ·') {
      flushQuote(); flushList();
      html += '<section style="margin-top:24px;"><section style="font-family:IBM Plex Sans,sans-serif;"><hr style="border:none;height:2px;background:#bfc1b7;margin:0;"></section></section>';
      continue;
    }

    // 引用块 → 重点观点卡
    if (l.startsWith('> ')) {
      flushList();
      // 联排多行引用合并成一张卡
      if (!inQuote) {
        html += '<section style="margin-top:24px;"><section style="font-family:IBM Plex Sans,sans-serif;"><section style="background:#fdfdf8;border-radius:6px;padding:16px 18px;border:1px solid #bfc1b7;">';
        inQuote = true;
      }
      html += `<p style="font-size:14px;color:#4d4f46;margin:0 0 8px;line-height:1.8;text-align:justify;">${inlineMdWeChat(l.slice(2))}</p>`;
      continue;
    } else {
      if (inQuote) { html += '</section></section></section>'; inQuote = false; }
    }

    // 列表项
    if (l.startsWith('- ') || l.startsWith('* ')) {
      flushQuote();
      if (!inList) {
        html += '<section style="margin-top:24px;"><section style="font-family:IBM Plex Sans,sans-serif;"><ul style="margin:0;padding-left:22px;line-height:1.8;list-style-position:outside;">';
        inList = true;
      }
      html += `<li style="margin-bottom:8px;font-size:15px;color:#4d4f46;list-style-type:disc;"><section>${inlineMdWeChat(l.slice(2))}</section></li>`;
      continue;
    } else {
      flushList();
    }

    // 普通段落
    flushQuote();
    html += `<section style="margin-top:24px;"><section style="font-family:IBM Plex Sans,sans-serif;"><p style="margin:0;font-size:14px;line-height:1.9;text-align:justify;color:#4d4f46;">${inlineMdWeChat(l)}</p></section></section>`;
  }

  flushQuote();
  flushList();
  return html;
}

function inlineMdWeChat(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#23251d;"><span leaf="">$1</span></strong>')
    .replace(/\*(.+?)\*/g, '<em style="font-style:italic;color:#4d4f46;"><span leaf="">$1</span></em>');
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
      <button class="btn btn-primary btn-sm" id="btn-export-all-md">📦 导出全部 Markdown</button>
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
              <button class="h-delete" data-id="${h.id}" title="删除">🗑</button>
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
  // 删除按钮
  $$('.h-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const h = getHistory().find(e => e.id === id);
      if (!h) return;
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
        const history = getHistory().filter(e => e.id !== id);
        localStorage.setItem('tweet_history', JSON.stringify(history));
        overlay.remove();
        toast('已删除');
        updateHistoryBadge();
        renderHistory();
      };
    };
  });
  // 导出全部
  const btnExportMd = $('#btn-export-all-md');
  if (btnExportMd) btnExportMd.onclick = exportAllMarkdown;
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
      <div class="report-card">${renderMarkdown(h.markdown)}</div>
      <button class="btn btn-accent btn-block" id="btn-download-md-hist" style="margin-bottom:10px;">📥 下载 Markdown</button>
      <button class="btn btn-ghost btn-block" id="btn-reload-hist" style="margin-bottom:10px;">📝 回到阅读重新编辑</button>
      <button class="btn btn-danger btn-block" id="btn-delete-hist">🗑 删除此条</button>
    </div>`;
  $('#btn-download-md-hist').onclick = () => downloadMarkdown(h.markdown, h.title);
  $('#btn-copy-title-hist').onclick = () => copyText(h.title);
  $('#btn-reload-hist').onclick = () => {
    // 恢复到 session 中重新编辑
    clearSession();
    session.book = { title: h.bookTitle || '历史文章', file: '', text: '', chars: 0, ext: '' };
    session.finalMd = h.markdown;
    session.draftMd = h.markdown;
    session.selectedTitle = h.title;
    session.verdict = h.verdict;
    session.step = 4;
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

async function exportAllMarkdown() {
  const history = getHistory();
  if (!history.length) { toast('没有可导出的文章'); return; }
  const zip = new JSZip();
  history.forEach((h, i) => {
    const filename = `推文_${(i + 1).toString().padStart(2, '0')}_${h.title.replace(/[\/:*?"<>|]/g, '_')}.md`;
    zip.file(filename, h.markdown || '');
  });
  // 同时加入备份 JSON
  zip.file('推文数据备份.json', JSON.stringify(history, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `推文导出_${new Date().toISOString().slice(0, 10)}.zip`);
  toast('导出完成，请查看下载');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadMarkdown(md, title) {
  const safeTitle = String(title).replace(/[\\/:*?"\x3c\x3e|]/g, '_').trim() || '推文';
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${safeTitle}.md`);
  toast('Markdown 已下载');
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
