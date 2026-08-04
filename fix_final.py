# -*- coding: utf-8 -*-
"""待分类细分 + 新建文件夹 + 命名整理"""
import os, re, shutil

BASE = r"D:\CLAUDE\01-HP同人\03-原小说库"
UNCAT = os.path.join(BASE, "待分类")

# =============================================
# 新建文件夹定义：(文件夹名, 匹配关键词, 前缀)
# "教授"只收录纯教授向，不含已归入斯哈/斯莉的
# =============================================
NEW_CATS = [
    ('西斯',  [r'西斯'],                     '【HP西斯】'),
    ('福华',  [r'福尔摩斯', r'福华'],          '【HP福华】'),
    ('教授',  [r'【HP教授】', r'Snape', r'斯内普', r'教授向'], '【HP教授】'),
    ('斯莉',  [r'斯莉', r'Snape.*Lily'],      '【HP斯莉】'),
    ('斯哈',  [r'斯哈', r'Snarry'],            '【HP斯哈】'),
]

# 已归入斯哈/斯莉/德赫/斯赫等文件夹的，不重复归入教授
PROF_EXCLUDES = ['斯哈','斯莉','德赫','斯赫','德哈','哈德','伏哈','伏赫']

def match_any(fname, patterns):
    for p in patterns:
        if re.search(p, fname, re.I):
            return True
    return False

# ===== 备份 =====
print("备份待分类...")
bak = UNCAT + "_bak"
if os.path.exists(bak):
    shutil.rmtree(bak, ignore_errors=True)
os.makedirs(bak, exist_ok=True)
for f in os.listdir(UNCAT):
    fp = os.path.join(UNCAT, f)
    if os.path.isfile(fp):
        shutil.copy2(fp, os.path.join(bak, f))
print(f"备份: {len(os.listdir(bak))} 个文件")

files = [f for f in os.listdir(UNCAT) if os.path.isfile(os.path.join(UNCAT, f))]
print(f"初始: {len(files)} 个\n")

# ===== STEP 1: 新建文件夹 + 搬移 =====
print("="*50)
print("STEP 1: 搬移文件到新建文件夹")
print("="*50)

for cat_name, patterns, prefix in NEW_CATS:
    cat_dir = os.path.join(BASE, cat_name)
    os.makedirs(cat_dir, exist_ok=True)
    moved = 0
    to_move = []
    for fname in files:
        if match_any(fname, patterns):
            if cat_name == '教授' and match_any(fname, PROF_EXCLUDES):
                continue
            to_move.append(fname)
    for fname in to_move:
        src = os.path.join(UNCAT, fname)
        dst = os.path.join(cat_dir, fname)
        c = 1
        while os.path.exists(dst):
            b, e = os.path.splitext(fname)
            dst = os.path.join(cat_dir, f"{b}_{c}{e}")
            c += 1
        try:
            shutil.move(src, dst)
            moved += 1
        except Exception as ex:
            print(f"    MOVE FAIL: {fname[:50]}: {ex}")
    print(f"  {cat_name}: +{moved} → {len(os.listdir(cat_dir))} 个")

files = [f for f in os.listdir(UNCAT) if os.path.isfile(os.path.join(UNCAT, f))]
print(f"\n  待分类剩余: {len(files)}")

# ===== STEP 2: 【HP】无子标签 + 【HP待分类】→统一【HP待分类】 =====
print("\n" + "="*50)
print("STEP 2: 统一【HP】→【HP待分类】")
print("="*50)

renamed_hp = 0
for fname in files:
    old = os.path.join(UNCAT, fname)
    # 【HP】开头（无子标签）→【HP待分类】
    if re.match(r'【HP】[^A-Za-z0-9\s]', fname) or fname.startswith('【HP】'):
        new_name = fname.replace('【HP】', '【HP待分类】', 1)
    elif fname.startswith('【HP待分类】'):
        new_name = fname  # already correct
    else:
        continue

    if new_name != fname:
        new_path = os.path.join(UNCAT, new_name)
        c = 1
        while os.path.exists(new_path) and new_path != old:
            b, e = os.path.splitext(new_name)
            new_path = os.path.join(UNCAT, f"{b}_{c}{e}")
            c += 1
        os.rename(old, new_path)
        renamed_hp += 1

print(f"  【HP】→【HP待分类】: {renamed_hp} 个")

# ===== STEP 3: 各新建文件夹内命名规范化 =====
print("\n" + "="*50)
print("STEP 3: 新建文件夹命名规范化")
print("="*50)

def normalize(name, prefix):
    base = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()

    # 去杂标签
    base = re.sub(r'《([^》]+)》', r'\1', base)
    base = re.sub(r'^【[^】]*】', '', base)
    base = re.sub(r'^\[[^\]]*\]', '', base)
    base = re.sub(r'^[（(][^）)]*[）)]', '', base)
    # 去CP残渣
    for tag in ['西斯','福尔摩斯-福华','福华','教授','斯莉','斯哈','Snarry','Snape']:
        base = re.sub(rf'[（(]\s*{tag}\s*[）)]', '', base, flags=re.I)
    base = re.sub(r'HP[-]?\s*', '', base, flags=re.I)

    # 提取作者
    author = None
    m = re.search(r'作者[：:]\s*(.+?)$', base)
    if m: author = m.group(1).strip(); base = re.sub(r'\s*作者[：:]\s*.+$', '', base)
    if not author:
        m = re.search(r'\b[Bb][Yy]\s+(.+?)$', base)
        if m: author = m.group(1).strip(); base = re.sub(r'\s*[Bb][Yy]\s+.+$', '', base)
    if not author:
        m = re.search(r'[（(]作者[：:]\s*(.+?)[）)]', base)
        if m: author = m.group(1).strip()
    base = re.sub(r'[（(]作者[：:]\s*[^）)]*[）)]', '', base)

    # 去状态
    base = re.sub(r'[（(](?:高H|BE|HE|完结|未完结|连载|完)[^）)]*[）)]', '', base, flags=re.I)
    base = re.sub(r'\(\d+\)$', '', base)
    base = re.sub(r'_\d+$', '', base)

    base = re.sub(r'\s+', ' ', base).strip()
    base = re.sub(r'^[-–—_]+', '', base)
    base = re.sub(r'[-–—_]+$', '', base)

    result = f"{prefix}{base}"
    if author: result += f"_作者_{author}"
    result += ext
    return result.strip()

for cat_name, _, prefix in NEW_CATS:
    cat_dir = os.path.join(BASE, cat_name)
    if not os.path.isdir(cat_dir): continue
    files_in = [f for f in os.listdir(cat_dir) if os.path.isfile(os.path.join(cat_dir, f))]
    print(f"\n--- {cat_name}: {len(files_in)} 个 ---")

    TMP = os.path.join(BASE, f"_{cat_name}_tmp")
    if os.path.exists(TMP): shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP, exist_ok=True)

    seen = set()
    renamed = 0
    deduped = 0
    for fname in files_in:
        src = os.path.join(cat_dir, fname)
        sz = os.path.getsize(src)
        new_name = normalize(fname, prefix)
        if new_name != fname: renamed += 1

        key = (new_name, sz)
        if key in seen: deduped += 1; continue
        seen.add(key)

        dst = os.path.join(TMP, new_name)
        c = 1
        while os.path.exists(dst):
            b2, e2 = os.path.splitext(new_name)
            dst = os.path.join(TMP, f"{b2}_{c}{e2}")
            c += 1
        shutil.copy2(src, dst)

    print(f"  改名: {renamed}, 去重: {deduped}")

    old = cat_dir + "_bak"
    if os.path.exists(old): shutil.rmtree(old, ignore_errors=True)
    os.rename(cat_dir, old)
    os.rename(TMP, cat_dir)
    shutil.rmtree(old, ignore_errors=True)

    final = len(os.listdir(cat_dir))
    bad = [f for f in os.listdir(cat_dir) if not f.startswith(prefix)]
    print(f"  最终: {final} 个, 非标准: {len(bad)}")

# ===== STEP 4: 待分类内命名整理（统一前缀，去重） =====
print("\n" + "="*50)
print("STEP 4: 待分类收尾整理")
print("="*50)

files_uncat = [f for f in os.listdir(UNCAT) if os.path.isfile(os.path.join(UNCAT, f))]
print(f"当前: {len(files_uncat)} 个")

# 只做：去《》+ 去大小相同_1重复，不改变前缀
TMP = os.path.join(BASE, "_待分类_tmp")
if os.path.exists(TMP): shutil.rmtree(TMP, ignore_errors=True)
os.makedirs(TMP, exist_ok=True)

def normalize_uncat(name):
    base = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()
    # 去《》
    base = re.sub(r'《([^》]+)》', r'\1', base)
    # 去(1)
    base = re.sub(r'\(\d+\)$', '', base)
    base = re.sub(r'_\d+$', '', base)
    base = re.sub(r'\s+', ' ', base).strip()
    return base + ext

seen = set(); renamed = 0; deduped = 0
for fname in files_uncat:
    src = os.path.join(UNCAT, fname)
    sz = os.path.getsize(src)
    new_name = normalize_uncat(fname)
    if new_name != fname: renamed += 1
    key = (new_name, sz)
    if key in seen: deduped += 1; continue
    seen.add(key)
    dst = os.path.join(TMP, new_name)
    c = 1
    while os.path.exists(dst):
        b2, e2 = os.path.splitext(new_name)
        dst = os.path.join(TMP, f"{b2}_{c}{e2}")
        c += 1
    shutil.copy2(src, dst)

old = UNCAT + "_bak2"
if os.path.exists(old): shutil.rmtree(old, ignore_errors=True)
os.rename(UNCAT, old)
os.rename(TMP, UNCAT)
shutil.rmtree(old, ignore_errors=True)

print(f"  改名: {renamed}, 去重: {deduped}")
print(f"  最终: {len(os.listdir(UNCAT))} 个")

# ===== FINAL =====
print("\n" + "="*60)
print("全部完成!")
print("="*60)
for d in sorted(os.listdir(BASE)):
    fp = os.path.join(BASE, d)
    if not os.path.isdir(fp) or d.startswith('_'): continue
    cnt = sum(1 for _ in os.listdir(fp) if os.path.isfile(os.path.join(fp, _)))
    print(f"  {d}: {cnt} 个")
print("DONE")
