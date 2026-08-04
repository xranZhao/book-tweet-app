# -*- coding: utf-8 -*-
"""三文件夹整理：德赫/哈德/斯赫 — 搬移 + 去重 + 命名规范化"""
import os, re, shutil, time

BASE = r"D:\CLAUDE\01-HP同人\03-原小说库"
UNCAT = os.path.join(BASE, "待分类")

# CP定义
CP_CONFIG = {
    '德赫': {
        'patterns': ['德赫', 'DHr', 'Dramione', r'HP-DHr', r'\[DHr\]'],
        'exclude': ['德哈', '哈德'],
        'prefix': '【HP德赫】',
    },
    '哈德': {
        'patterns': ['哈德', '【HP哈德】', '【哈德】'],
        'exclude': [],
        'prefix': '【HP哈德】',
    },
    '斯赫': {
        'patterns': ['斯赫', 'SSHG', '【HP斯赫】', '斯内普.*赫敏', '赫敏.*斯内普', r'Snape.*Hermione'],
        'exclude': [],
        'prefix': '【HP斯赫】',
    },
}

def cp_match(fname, patterns, excludes):
    for p in patterns:
        if re.search(p, fname):
            if excludes and any(re.search(e, fname) for e in excludes):
                continue
            return True
    return False

# ===== STEP 1: 从待分类搬移 =====
print("="*60)
print("STEP 1: 从待分类搬移文件")
print("="*60)

uncat_files = [f for f in os.listdir(UNCAT) if os.path.isfile(os.path.join(UNCAT, f))]

for cp_name, cfg in CP_CONFIG.items():
    cp_dir = os.path.join(BASE, cp_name)
    os.makedirs(cp_dir, exist_ok=True)
    moved = 0
    for fname in uncat_files:
        if cp_match(fname, cfg['patterns'], cfg['exclude']):
            src = os.path.join(UNCAT, fname)
            dst = os.path.join(cp_dir, fname)
            c = 1
            while os.path.exists(dst):
                b, e = os.path.splitext(fname)
                dst = os.path.join(cp_dir, f"{b}_{c}{e}")
                c += 1
            shutil.move(src, dst)
            moved += 1
    print(f"  {cp_name}: 搬入 {moved} 个")
    uncat_files = [f for f in os.listdir(UNCAT) if os.path.isfile(os.path.join(UNCAT, f))]

print(f"  待分类剩余: {len(uncat_files)}")

# ===== STEP 2: 逐CP规范化 =====
print("\n" + "="*60)
print("STEP 2: 文件命名规范化")
print("="*60)

def normalize(name, prefix):
    base = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()

    # 去杂标签
    base = re.sub(r'《([^》]+)》', r'\1', base)
    base = re.sub(r'^【[^】]*】', '', base)
    base = re.sub(r'^\[[^\]]*\]', '', base)
    # 去CP标签残渣
    for cp in ['德赫','哈德','斯赫','DHr','SSHG','Dramione']:
        base = re.sub(rf'[（(]\s*{cp}\s*[）)]', '', base, flags=re.I)
        base = re.sub(rf'^HP[-]?\s*{cp}', '', base, flags=re.I)
        base = re.sub(rf'\s*{cp}\s*', ' ', base, flags=re.I)
    # 去 (HP同人)等
    base = re.sub(r'[（(]HP同人[）)]', '', base, flags=re.I)
    base = re.sub(r'\[hp\]', '', base, flags=re.I)

    # 提取作者
    author = None
    m = re.search(r'作者[：:]\s*(.+?)$', base)
    if m:
        author = m.group(1).strip()
        base = re.sub(r'\s*作者[：:]\s*.+$', '', base)
    if not author:
        m = re.search(r'\b[Bb][Yy]\s+(.+?)$', base)
        if m:
            author = m.group(1).strip()
            base = re.sub(r'\s*[Bb][Yy]\s+.+$', '', base)
    # （作者：xxx）
    if not author:
        m = re.search(r'[（(]作者[：:]\s*(.+?)[）)]', base)
        if m:
            author = m.group(1).strip()
            base = re.sub(r'[（(]作者[：:]\s*[^）)]*[）)]', '', base)
    # 翻译者信息
    m = re.search(r'翻译者?[：:]\s*(.+?)$', base)
    if m:
        base = re.sub(r'\s*翻译者?[：:]\s*.+$', '', base)

    # 去状态标签
    base = re.sub(r'[（(](?:高H|BE|HE|战后|短篇|长篇|完结|未完结|连载|番外|正文)[^）)]*[）)]', '', base, flags=re.I)
    # 去(1)后缀
    base = re.sub(r'\(\d+\)$', '', base)
    base = re.sub(r'_\d+$', '', base)

    # 清理
    base = re.sub(r'\s+', ' ', base).strip()
    base = re.sub(r'^[-–—_]+', '', base)
    base = re.sub(r'[-–—_]+$', '', base)

    result = f"{prefix}{base}"
    if author:
        result += f"_作者_{author}"
    result += ext
    return result.strip()

for cp_name, cfg in CP_CONFIG.items():
    cp_dir = os.path.join(BASE, cp_name)
    print(f"\n--- {cp_name} ---")
    cp_files = [f for f in os.listdir(cp_dir) if os.path.isfile(os.path.join(cp_dir, f))]
    print(f"  当前: {len(cp_files)} 个")

    # 先删坏文件
    del_bad = 0
    for fname in cp_files:
        if fname.endswith('.rar') or fname.endswith('.zip') or fname.endswith('.7z'):
            try:
                os.remove(os.path.join(cp_dir, fname))
                del_bad += 1
            except: pass
        if fname == '.DS_Store' or fname.startswith('._'):
            try:
                os.remove(os.path.join(cp_dir, fname))
                del_bad += 1
            except: pass
    print(f"  删除压缩包/垃圾: {del_bad}")

    # 重读文件
    cp_files = [f for f in os.listdir(cp_dir) if os.path.isfile(os.path.join(cp_dir, f))]

    TMP = os.path.join(BASE, f"_{cp_name}_tmp")
    if os.path.exists(TMP):
        shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP, exist_ok=True)

    seen = set()
    renamed = 0
    deduped = 0
    for fname in cp_files:
        src = os.path.join(cp_dir, fname)
        sz = os.path.getsize(src)
        new_name = normalize(fname, cfg['prefix'])
        if new_name != fname:
            renamed += 1

        key = (new_name, sz)
        if key in seen:
            deduped += 1
            continue
        seen.add(key)

        dst = os.path.join(TMP, new_name)
        c = 1
        while os.path.exists(dst):
            b2, e2 = os.path.splitext(new_name)
            dst = os.path.join(TMP, f"{b2}_{c}{e2}")
            c += 1
        shutil.copy2(src, dst)

    print(f"  改名: {renamed}, 去重: {deduped}")

    # 替换
    old = cp_dir + "_bak"
    if os.path.exists(old):
        shutil.rmtree(old, ignore_errors=True)
    os.rename(cp_dir, old)
    os.rename(TMP, cp_dir)
    shutil.rmtree(old, ignore_errors=True)

    final = len(os.listdir(cp_dir))
    sz_mb = round(sum(os.path.getsize(os.path.join(cp_dir, f)) for f in os.listdir(cp_dir)) / 1048576, 1)
    print(f"  最终: {final} 个, {sz_mb} MB")

    # 验证
    bad = [f for f in os.listdir(cp_dir) if not f.startswith(cfg['prefix'])]
    books = [f for f in os.listdir(cp_dir) if '《' in f or '》' in f]
    print(f"  非标准前缀: {len(bad)}, 书名号: {len(books)}")

# ===== STEP 3: 移走混入的异CP文件 =====
print("\n" + "="*60)
print("STEP 3: 移走异CP混入文件")
print("="*60)

CROSS_MOVE = {
    '哈德': [
        (r'【HP哈德】.*德赫', '德赫'),
        (r'【HP哈德】.*斯赫', '斯赫'),
        (r'【HP哈德】.*伏哈', '待分类'),
    ],
    '斯赫': [
        (r'【HP斯赫】.*德赫', '德赫'),
        (r'【HP斯赫】.*德哈', '德哈'),
        (r'【HP斯赫】.*哈德', '哈德'),
    ],
    '德赫': [
        (r'【HP德赫】.*斯赫', '斯赫'),
        (r'【HP德赫】.*哈德', '哈德'),
        (r'【HP德赫】.*德哈', '德哈'),
        (r'【HP德赫】.*伏哈', '待分类'),
    ],
}

for cp_name, rules in CROSS_MOVE.items():
    cp_dir = os.path.join(BASE, cp_name)
    for pat, target_dir in rules:
        for fname in os.listdir(cp_dir):
            if re.search(pat, fname):
                src = os.path.join(cp_dir, fname)
                dst_dir = os.path.join(BASE, target_dir)
                os.makedirs(dst_dir, exist_ok=True)
                dst = os.path.join(dst_dir, fname)
                c = 1
                while os.path.exists(dst):
                    b, e = os.path.splitext(fname)
                    dst = os.path.join(dst_dir, f"{b}_{c}{e}")
                    c += 1
                shutil.move(src, dst)
                print(f"  {fname[:50]} → {target_dir}")

# ===== FINAL SUMMARY =====
print("\n" + "="*60)
print("整理完成!")
print("="*60)
for cp in ['德赫','哈德','斯赫','德哈','待分类']:
    p = os.path.join(BASE, cp)
    if not os.path.isdir(p): continue
    cnt = len([x for x in os.listdir(p) if os.path.isfile(os.path.join(p,x))])
    sz = round(sum(os.path.getsize(os.path.join(p,f)) for f in os.listdir(p) if os.path.isfile(os.path.join(p,f))) / 1048576, 1)
    bad = len([f for f in os.listdir(p) if not f.startswith(f'【HP{cp}】') and cp != '待分类'])
    print(f"  {cp}: {cnt} 个, {sz} MB, 非标准: {bad}")
print("DONE")
