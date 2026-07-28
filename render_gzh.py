#!/usr/bin/env python3
"""推文助手 · 电脑端排版脚本
用法：
    python render_gzh.py "文章.md"
    python render_gzh.py "文章.md" "推文标题"    （指定标题）
    python render_gzh.py "文章.md" "推文标题" "2026.08"  （指定日期）
输出：
    文章_排版_橄榄手记.html

固定规则排版，无 AI 参与。每次同样输入 → 同样输出。
"""

import re
import sys
import os
from html import escape as html_escape


# ═══════════════════════════════════════════════════════════════════
# 设计变量（橄榄手记主题，去橙色）
# ═══════════════════════════════════════════════════════════════════

INK = "#1e1f23"
TITLE_C = "#23251d"
BODY_C = "#4d4f46"
SECONDARY = "#65675e"
FAINT = "#9ea096"
BORDER = "#bfc1b7"
BG_CREAM = "#fdfdf8"
BG_OLIVE = "#eeefe9"
TAG_BG = "#e5e7e0"
FONT = "'IBM Plex Sans',-apple-system,system-ui,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"

CURRENT_DATE = "2026.07"


# ═══════════════════════════════════════════════════════════════════
# 基础工具
# ═══════════════════════════════════════════════════════════════════

def leaf(text):
    """所有可见文字用 <span leaf=""> 包裹，否则粘贴到公众号样式丢失"""
    return f'<span leaf="">{text}</span>'

def escape(text):
    return html_escape(str(text))


# ═══════════════════════════════════════════════════════════════════
# 组件
# ═══════════════════════════════════════════════════════════════════

def global_open():
    return (
        f'<section style="max-width:677px;margin:0 auto;padding:8px;'
        f'box-sizing:border-box;background:{BG_CREAM};color:{BODY_C};'
        f'font-family:{FONT};line-height:1.75;">'
    )

def global_close():
    return '</section>'

def hidden_mark():
    return '<p style="display:none;"><mp-style-type data-value="3"></mp-style-type></p>'


def work_title_bar(work_title):
    """作品名黑底白字条（替代原 hero card）"""
    return f'''
<section style="background:{INK};border:1px solid {TITLE_C};border-radius:6px;
overflow:hidden;font-family:{FONT};">
  <section style="padding:14px 18px;text-align:center;">
    <p style="margin:0;font-size:15px;font-weight:800;color:#ffffff;letter-spacing:1px;">
      {leaf(f'作品名：《{escape(work_title)}》' if work_title else '作品推荐')}
    </p>
  </section>
</section>'''


def info_card(meta_lines):
    """基本信息栏：浅橄榄灰底，逐行显示"""
    if not meta_lines:
        return ''
    rows = '\n'.join(
        f'<p style="margin:0 0 4px;font-size:14px;line-height:1.9;color:{BODY_C};">{leaf(escape(line))}</p>'
        for line in meta_lines
    )
    return f'''
<section style="margin-top:24px;">
  <section style="background:{BG_CREAM};border:1px solid {BORDER};border-radius:6px;
  overflow:hidden;font-family:{FONT};">
    <section style="padding:10px 16px;background:{INK};display:flex;
    align-items:center;justify-content:space-between;gap:10px;">
      <p style="margin:0;font-size:10px;font-weight:800;letter-spacing:2px;color:#ffffff;">
        {leaf('EDITOR’S NOTE')}
      </p>
      <span style="font-size:10px;color:rgba(255,255,255,0.65);">{leaf('INFO')}</span>
    </section>
    <section style="padding:16px 18px 18px;background:{BG_OLIVE};">
      {rows}
    </section>
  </section>
</section>'''


def section_title(num, cn_title, en_tag):
    """章节标题：左边编号 + 竖线 + 右边中英文"""
    part_label = 'END' if num == '///' else 'PART'
    return f'''
<section style="margin-top:24px;">
  <section style="font-family:{FONT};">
    <section style="display:flex;align-items:center;gap:14px;">
      <section style="text-align:center;flex-shrink:0;">
        <p style="margin:0;font-size:24px;font-weight:800;color:{TITLE_C};
        line-height:1;letter-spacing:-2px;">{leaf(num)}</p>
        <p style="margin:0;font-size:8px;font-weight:700;color:{FAINT};
        letter-spacing:2px;">{leaf(part_label)}</p>
      </section>
      <span style="width:1px;height:36px;background:{BORDER};flex-shrink:0;
      display:inline-block;overflow:hidden;vertical-align:middle;
      font-size:0;line-height:0;">{leaf('&nbsp;')}</span>
      <section>
        <p style="margin:0 0 1px;font-size:17px;font-weight:800;color:{TITLE_C};
        letter-spacing:0.2px;">{leaf(escape(cn_title))}</p>
        <p style="margin:0;font-size:11px;font-weight:600;color:{SECONDARY};
        letter-spacing:1.2px;">{leaf(escape(en_tag))}</p>
      </section>
    </section>
  </section>
</section>'''


def paragraph(text):
    """正文段落"""
    return f'''
<section style="margin-top:24px;">
  <section style="font-family:{FONT};">
    <p style="margin:0;font-size:14px;line-height:1.9;text-align:justify;color:{BODY_C};">
      {text}
    </p>
  </section>
</section>'''


def key_point_card(point_text, note_text=''):
    """重点观点卡（无橙色下划线）"""
    note_part = f'&nbsp;{leaf(escape(note_text))}' if note_text else ''
    return f'''
<section style="margin-top:24px;">
  <section style="font-family:{FONT};">
    <section style="background:{BG_CREAM};border-radius:6px;padding:16px 18px;
    border:1px solid {BORDER};">
      <p style="font-size:14px;color:{BODY_C};margin:0;line-height:1.8;text-align:justify;">
        <strong style="color:{TITLE_C};">{leaf(escape(point_text))}</strong>{note_part}
      </p>
    </section>
  </section>
</section>'''


def bullet_list(items):
    """无序列表"""
    lis = '\n'.join(
        f'<li style="margin-bottom:8px;font-size:15px;color:{BODY_C};list-style-type:disc;">'
        f'<section>{inline_markdown(item)}</section></li>'
        for item in items
    )
    return f'''
<section style="margin-top:24px;">
  <section style="font-family:{FONT};">
    <ul style="margin:0;padding-left:22px;line-height:1.8;list-style-position:outside;">
      {lis}
    </ul>
  </section>
</section>'''


def divider():
    """分割线"""
    return f'''
<section style="margin-top:24px;">
  <section style="font-family:{FONT};">
    <hr style="border:none;height:2px;background:{BORDER};margin:0;">
  </section>
</section>'''


def ending_actions():
    """结尾互动区"""
    return f'''
<section style="margin-top:24px;">
  <section style="background:{BG_CREAM};border:1px solid {BORDER};border-radius:6px;
  padding:22px 16px;text-align:center;font-family:{FONT};">
    <p style="font-size:13px;font-weight:700;color:{TITLE_C};line-height:1.6;
    margin:0 0 14px;">
      {leaf('如果你觉得今天这篇有收获，欢迎点赞、在看、转发三连，我们下篇见。')}
    </p>
    <section style="display:flex;justify-content:center;gap:18px;margin-bottom:14px;flex-wrap:wrap;">
      <section style="text-align:center;color:{BODY_C};">
        <section style="width:40px;height:40px;display:flex;align-items:center;
        justify-content:center;margin:0 auto 6px;background:{BG_OLIVE};
        border-radius:6px;border:1px solid {BORDER};">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
        </section>
        <span style="font-size:11px;font-weight:600;">{leaf('赞')}</span>
      </section>
      <section style="text-align:center;color:{BODY_C};">
        <section style="width:40px;height:40px;display:flex;align-items:center;
        justify-content:center;margin:0 auto 6px;background:{BG_OLIVE};
        border-radius:6px;border:1px solid {BORDER};">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          </svg>
        </section>
        <span style="font-size:11px;font-weight:600;">{leaf('在看')}</span>
      </section>
      <section style="text-align:center;color:{TITLE_C};">
        <section style="width:40px;height:40px;display:flex;align-items:center;
        justify-content:center;margin:0 auto 6px;background:#d4c9b8;
        border-radius:6px;border:1px solid #b17816;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="{TITLE_C}" stroke-width="1.8" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </section>
        <span style="font-size:11px;font-weight:700;">{leaf('收藏')}</span>
      </section>
    </section>
    <p style="line-height:1.6;font-size:10px;color:{FAINT};letter-spacing:2px;
    margin:0;font-weight:500;">{leaf('THANKS FOR READING')}</p>
  </section>
</section>'''


def copyright_notice():
    return (
        f'<section style="margin-top:8px;text-align:center;">'
        f'<p style="margin:0;font-size:11px;line-height:1.8;color:{FAINT};'
        f'font-family:\'IBM Plex Sans\',sans-serif;">'
        f'{leaf("所有荣誉与利益属于作者和创作者。即使不了解角色，该书仍可当成独立小说看待。")}'
        f'</p></section>'
    )


# ═══════════════════════════════════════════════════════════════════
# 行内 Markdown 转义
# ═══════════════════════════════════════════════════════════════════

def inline_markdown(text):
    """
    **加粗** → <strong> 黑色（无下划线）
    *斜体*  → <em>
    先做加粗斜体替换，再整体包 leaf 确保所有文字合规
    """
    text = escape(text)
    # 加粗（先处理，用黑色不加下划线）
    text = re.sub(
        r'\*\*(.+?)\*\*',
        rf'<strong style="color:{TITLE_C};"><span leaf="">\1</span></strong>',
        text
    )
    # 斜体
    text = re.sub(
        r'\*(.+?)\*',
        rf'<em style="font-style:italic;color:{BODY_C};"><span leaf="">\1</span></em>',
        text
    )
    # 整体包一层 leaf，确保所有文字被包裹
    return leaf(text)


# ═══════════════════════════════════════════════════════════════════
# 正文段渲染（逐行解析）
# ═══════════════════════════════════════════════════════════════════

def render_body(body_text):
    """将章节正文逐行解析为 HTML 片段"""
    lines = body_text.strip().split('\n')
    html_parts = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # 分割线
        if re.match(r'^[-*_]{3,}$', line) or line == '· · ·':
            html_parts.append(divider())
            i += 1
            continue

        # 引用块（> 开头）→ 重点观点卡
        if line.startswith('> '):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith('> '):
                quote_lines.append(lines[i].strip()[2:])
                i += 1
            # 合并多行引用的内容（纯文本合并，不加粗）
            combined = ' '.join(quote_lines)
            html_parts.append(key_point_card(combined))
            continue

        # 列表项（- 或 * 开头，且后面是空格）
        if re.match(r'^[-*] ', line):
            list_items = []
            while i < len(lines) and re.match(r'^[-*] ', lines[i].strip()):
                list_items.append(lines[i].strip()[2:])
                i += 1
            html_parts.append(bullet_list(list_items))
            continue

        # 普通段落 → 收集连续非空行（【开头的行独立成段）
        if line.startswith('【'):
            # 【链接/引用类短行】单独成段，不合并
            html_parts.append(paragraph(inline_markdown(line)))
            i += 1
            continue

        para_lines = []
        while i < len(lines) and lines[i].strip() and \
              not lines[i].strip().startswith('> ') and \
              not lines[i].strip().startswith('#') and \
              not lines[i].strip().startswith('【') and \
              not re.match(r'^[-*] ', lines[i].strip()) and \
              not re.match(r'^[-*_]{3,}$', lines[i].strip()):
            para_lines.append(lines[i].strip())
            i += 1
        combined = ' '.join(para_lines)
        html_parts.append(paragraph(inline_markdown(combined)))

    return ''.join(html_parts)


# ═══════════════════════════════════════════════════════════════════
# 章节标签映射
# ═══════════════════════════════════════════════════════════════════

LABEL_MAP = {
    '小说在哪看':       ('00', 'GUIDE · 阅读入口'),
    '小说哪里看':       ('00', 'GUIDE · 阅读入口'),
    '文案推荐':         ('01', 'SYNOPSIS · 沦陷的开端'),
    'Fanst 碎碎念':     ('02', 'THOUGHTS · 黑咖啡般的回味'),
    '名场面预警':       ('03', 'HIGHLIGHT · 带着刺的温柔'),
    '最戳我的一个细节': ('04', 'DETAIL · 一块旧浴巾的尊重'),
    '综合评价':         ('///', 'VERDICT · 压得住阵脚的存在'),
    '避雷点':           ('01', 'WARNING · 先睹为快'),
    '踩雷预警':         ('03', 'CAUTION · 谨慎阅读'),
    '最戳我的一个槽点': ('04', 'FLAW · 瑕不掩瑜'),
}


def match_label(sec_label):
    """根据章节标题文字匹配编号和英文标签"""
    for key, (num, en) in LABEL_MAP.items():
        if key == sec_label or sec_label.startswith(key) or key in sec_label:
            return num, en
    # fallback：取前两字
    return sec_label[:2] if len(sec_label) >= 2 else sec_label, ''


# ═══════════════════════════════════════════════════════════════════
# 元数据提取
# ═══════════════════════════════════════════════════════════════════

def extract_meta(md_text):
    """从 MD 正文提取元数据"""
    clean = re.sub(r'\*\*(.+?)\*\*', r'\1', md_text)

    author = ''
    rating = ''
    cp = ''
    tags = []
    work_title = ''

    m = re.search(r'作者\s*[:：]\s*(.+)', clean)
    if m:
        author = m.group(1).strip()

    m = re.search(r'分级\s*[:：]\s*(.+)', clean)
    if m:
        rating = m.group(1).strip()

    m = re.search(r'CP\s*[:：]\s*(.+)', clean)
    if m:
        cp = re.sub(r'<[^>]+>', '', m.group(1)).strip()

    m = re.search(r'标签\s*[:：]\s*(.+)', clean)
    if m:
        tags = [t.strip() for t in re.split(r'[,，/]', m.group(1)) if t.strip()]

    m = re.search(r'原作\s*[:：]\s*(.+)', clean)
    if m:
        work_title = re.sub(r'[《》]', '', m.group(1)).strip()

    meta_lines = []
    if rating:
        meta_lines.append(f'分级：{rating}')
    if work_title:
        meta_lines.append(f'原作：《{work_title}》')
    if author:
        meta_lines.append(f'作者：{author}')
    if cp:
        meta_lines.append(f'CP：{cp}')
    if tags:
        meta_lines.append(f'标签：{"、".join(tags)}')

    # 用原作名作为作品名（没有原作名就用标签推断）
    display_title = work_title or (tags[0] if tags else '')

    return display_title, meta_lines


# ═══════════════════════════════════════════════════════════════════
# 解析章节
# ═══════════════════════════════════════════════════════════════════

def parse_sections(md_text):
    """按 ### 分割章节"""
    sections = []
    normalized = '\n' + md_text.replace('\r\n', '\n')
    parts = normalized.split('\n### ')
    for part in parts[1:]:  # 跳过第一个（### 之前的内容）
        nl_idx = part.find('\n')
        if nl_idx > 0:
            label = part[:nl_idx].strip()
            body = part[nl_idx + 1:].strip()
        else:
            label = part.strip()
            body = ''
        # 去掉编号前缀
        clean_label = re.sub(r'^\d+\s*', '', label)
        sections.append({'label': clean_label, 'body': body, 'raw_label': label})
    return sections


# ═══════════════════════════════════════════════════════════════════
# 主渲染
# ═══════════════════════════════════════════════════════════════════

def render(md_text, override_title=None, date_str=None):
    """
    将 Markdown 渲染为橄榄手记 HTML
    """

    # 1. 元数据
    work_title, meta_lines = extract_meta(md_text)

    # 2. 章节
    sections = parse_sections(md_text)

    # 3. 拼装
    html = global_open()

    # 作品名黑底白字条
    display_name = override_title or work_title or '作品推荐'
    html += work_title_bar(display_name)

    # 基本信息卡
    if meta_lines:
        html += info_card(meta_lines)

    # 各章节
    for sec in sections:
        num, en_tag = match_label(sec['label'])
        cn = sec['label']
        if not en_tag:
            en_tag = ''
        html += section_title(num, cn, en_tag)
        html += render_body(sec['body'])

    # 结尾
    html += ending_actions()
    html += copyright_notice()
    html += global_close()
    html += hidden_mark()

    return html


# ═══════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print('用法：python render_gzh.py "文章.md" [标题] [日期]')
        print('示例：python render_gzh.py "A-Marriage-of-inconvenience.md"')
        print('      python render_gzh.py "手稿.md" "我的文章标题" "2026.08"')
        sys.exit(1)

    md_path = sys.argv[1]
    override_title = sys.argv[2] if len(sys.argv) >= 3 else None
    date_str = sys.argv[3] if len(sys.argv) >= 4 else None

    global CURRENT_DATE
    if date_str:
        CURRENT_DATE = date_str

    # 读文件
    if not os.path.exists(md_path):
        print(f'文件不存在：{md_path}')
        sys.exit(1)

    with open(md_path, 'r', encoding='utf-8') as f:
        md_text = f.read()

    html = render(md_text, override_title, date_str)

    # 输出路径
    base = os.path.splitext(os.path.basename(md_path))[0]
    out_dir = os.path.dirname(os.path.abspath(md_path))
    out_path = os.path.join(out_dir, f'{base}_排版_橄榄手记.html')

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f'✅ 排版完成')
    print(f'   输入：{md_path}')
    print(f'   输出：{out_path}')
    print(f'   下一步：打开输出文件 → Ctrl+A Ctrl+C → 到公众号编辑器粘贴')


if __name__ == '__main__':
    main()
