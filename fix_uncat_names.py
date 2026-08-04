# -*- coding: utf-8 -*-
"""待分类：6类文件名问题修复"""
import os, re, shutil

SRC = r"D:\CLAUDE\01-HP同人\03-原小说库\待分类"
TMP = SRC + "_fix_tmp"

# HP CP标签（应加【HP】前缀的）
HP_CP_TAGS = [
    '哈德','德哈','德赫','斯赫','斯哈','斯莉','斯教','伏哈','伏赫','伏斯',
    '卢伏','卢赫','卢斯','卢蝠','卢爹','卢平','卢唐',
    '小龙','德拉科','马尔福','双子','弗雷德','乔治','韦斯莱',
    '格邓','创始人','原创女主','原创男主','教授',
    '犬蝠','犬狼','犬哈','塞德','塞秋','塞哈','德罗','汤德',
    '柿饼','无CP','无差','罗赫','哈赫','珀西',
    '小天狼星','天狼星','西里斯',
]

# 非HP标签（不加HP前缀，保持原样）
NON_HP_TAGS = [
    '书香门第','博君一笑','博君一肖','飞机能飞','袁朗','西斯','西詹',
    '罗密欧与朱丽叶','福尔摩斯','福华','DMHP','同人',
]

def fix_name(fname):
    base = os.path.splitext(fname)[0]
    ext = os.path.splitext(fname)[1].lower()
    changed = False

    # === 1. 删 [HP] [hp] 双标签 ===
    base2 = re.sub(r'\[HP\]', '', base, flags=re.I)
    base2 = re.sub(r'\[hp\]', '', base2, flags=re.I)
    if base2 != base: changed = True
    base = base2

    # === 2. 作者：xxx → _作者_xxx ===
    m = re.search(r'作者[：:]\s*(.+?)$', base)
    if m and '_作者_' not in base:
        author = m.group(1).strip()
        base = re.sub(r'\s*作者[：:]\s*.+$', '', base)
        base = base.strip() + f'_作者_{author}'
        changed = True

    # === 3. 【HP】后跟 HP之/HP/HP/HP 等多余前缀 ===
    m = re.match(r'【HP】\s*(?:HP|hp|Hp)\s*(之|的|\.|\s)?(.+)', base)
    if m:
        base = f'【HP】{m.group(2)}'
        changed = True

    # === 4. 【HP】数字— xxx → 【HP】xxx ===
    # 匹配: 【HP】+ 1-3位数字 + —(em dash)或-(dash) + 空格 + 内容
    m = re.match(r'【HP】\d{1,3}[—\-]\s*(.+)', base)
    if m:
        base = f'【HP】{m.group(1)}'
        changed = True

    # === 5. HP CP标签（如【哈德】→【HP哈德】,【德哈DH】→【HP德哈】）===
    for tag in sorted(HP_CP_TAGS, key=len, reverse=True):
        m = re.match(rf'【({tag}[^】]*)】', base)
        if m:
            inner = m.group(1)
            # 去数字/字母杂质 如【德哈DH】→ DH去掉，只留德哈
            clean_inner = re.sub(r'[A-Za-z0-9]$', '', tag)
            base = re.sub(rf'^【{re.escape(m.group(1))}】', f'【HP{clean_inner}】', base)
            changed = True
            break

    # === 6. .mobi _数字 清除 ===
    if ext == '.mobi':
        base2 = re.sub(r'_(\d{1,4})$', '', base)
        if base2 != base:
            base = base2
            changed = True

    # === 7. (角色x角色) 清除 ===
    base = re.sub(r'[（(][^）)]*[xX×][^）)]*[）)]', '', base)

    # === 8. 多余空格清理 ===
    base2 = re.sub(r'\s+', ' ', base).strip()
    if base2 != base: changed = True
    base = base2

    # === 9. 书名号清理 ===
    if '《' in base:
        base = re.sub(r'《([^》]+)》', r'\1', base)
        changed = True

    new_name = base + ext
    return new_name, changed

# ===== 执行 =====
print("="*60)
print("待分类文件名修复")
print("="*60)

files = [f for f in os.listdir(SRC) if os.path.isfile(os.path.join(SRC, f))]
print(f"文件总数: {len(files)}")

os.makedirs(TMP, exist_ok=True)

fixed = 0; unchanged = 0
for fname in files:
    src_path = os.path.join(SRC, fname)
    new_name, chg = fix_name(fname)

    if chg:
        fixed += 1
        if fixed <= 20:
            print(f"  {fname[:60]}")
            print(f"  → {new_name[:60]}")
            print()

    dst = os.path.join(TMP, new_name)
    c = 1
    b2, e2 = os.path.splitext(dst)
    while os.path.exists(dst):
        dst = f"{b2}_{c}{e2}"
        c += 1

    shutil.copy2(src_path, dst)

print(f"\n修复: {fixed}, 未变: {len(files) - fixed}")

# 替换
old = SRC + "_old2"
if os.path.exists(old): shutil.rmtree(old, ignore_errors=True)
os.rename(SRC, old)
os.rename(TMP, SRC)
shutil.rmtree(old, ignore_errors=True)

# 验证
print(f"\n=== 验证 ===")
issues = [
    ('双标签[HP]', r'\[HP\]|\[hp\]'),
    ('作者：未规范', r'作者[：:]'),
    ('【HP】数字—', r'【HP】\d{1,3}[—\-]'),
    ('【HP】HP多余', r'【HP】HP'),
    ('.mobi_数字', r'_\d+\.mobi$'),
    ('()角色', r'[（(].*[xX×].*[）)]'),
]
for label, pat in issues:
    count = 0
    for f in os.listdir(SRC):
        if re.search(pat, f):
            count += 1
    print(f"  {label}: {count} (应0)")

final = len(os.listdir(SRC))
print(f"\n最终: {final} 个文件")
print("DONE")
