# -*- coding: utf-8 -*-
"""德哈文件夹整理 — 安全版：先备份，再逐步处理"""
import os, re, shutil

DH = r"D:\CLAUDE\01-HP同人\03-原小说库\德哈"
BAK = r"D:\CLAUDE\01-HP同人\03-原小说库\德哈_整理前备份"
TMP = r"D:\CLAUDE\01-HP同人\03-原小说库\德哈_tmp"

# ===== 0. 备份 =====
print("0. 备份中...")
if os.path.exists(BAK):
    shutil.rmtree(BAK, ignore_errors=True)
if os.path.exists(TMP):
    shutil.rmtree(TMP, ignore_errors=True)
# 清理之前可能遗留的 bak2
for cleanup_dir in [DH + '_bak2', DH + '_tmp']:
    if os.path.exists(cleanup_dir):
        shutil.rmtree(cleanup_dir, ignore_errors=True)

os.makedirs(BAK, exist_ok=True)
for f in os.listdir(DH):
    fp = os.path.join(DH, f)
    if os.path.isfile(fp):
        shutil.copy2(fp, os.path.join(BAK, f))
print(f"   备份完成: {len(os.listdir(BAK))} 个文件")

# ===== 收集文件 =====
files = {}
for f in os.listdir(DH):
    fp = os.path.join(DH, f)
    if os.path.isfile(fp):
        files[f] = fp

print(f"\n初始文件: {len(files)}")

# ===== 1. 删坏压缩包 =====
print("\n1. 删坏压缩包...")
to_delete = set()
for fname, fpath in files.items():
    if fname.endswith('.rar'):
        to_delete.add(fname)
        print(f"   删除: {fname}")
for f in to_delete:
    try:
        os.chmod(files[f], 0o666)
        os.remove(files[f])
    except:
        pass
    del files[f]

# ===== 2. 删除大小相同的 _1 重复 ====
print("\n2. 删 _1 重复...")
# 找出 (base, ext, size) 组有多于1个的
by_key = {}
for fname, fpath in files.items():
    base = re.sub(r'_\d+', '', os.path.splitext(fname)[0])
    ext = os.path.splitext(fname)[1].lower()
    sz = os.path.getsize(fpath)
    key = (base, ext, sz)
    if key not in by_key:
        by_key[key] = []
    by_key[key].append(fname)

del_dedup = set()
for key, items in by_key.items():
    if len(items) <= 1:
        continue
    # 优先保留不含_数字的
    has_clean = [x for x in items if not re.search(r'_\d+', os.path.splitext(x)[0])]
    to_keep = has_clean[0] if has_clean else items[0]
    for x in items:
        if x != to_keep:
            del_dedup.add(x)

dedup_done = 0
for f in del_dedup:
    if f in files:
        try:
            os.chmod(files[f], 0o666)
            os.remove(files[f])
            dedup_done += 1
        except:
            pass
        del files[f]
print(f"   删除: {dedup_done} 个")

# ===== 3. 移走非德哈 =====
print("\n3. 移走非德哈...")
moves = {
    '【HP哈德】Crown of Peafowl孔雀荣冠.txt': '哈德',
    '【HP哈德】不能更糟了.txt': '哈德',
    '【HP哈德】极光.txt': '哈德',
    '【HP哈德】随波逐流 BY llandu (灵魂转换 穿越时空).txt': '哈德',
    '【HP伏哈】The Gambler赌徒 BY suii.txt': '待分类',
}
parent = os.path.dirname(DH)
for fname, target_dir in moves.items():
    if fname in files:
        dst_dir = os.path.join(parent, target_dir)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, fname)
        c = 1
        while os.path.exists(dst):
            dst = os.path.join(dst_dir, f"{os.path.splitext(fname)[0]}_{c}{os.path.splitext(fname)[1]}")
            c += 1
        shutil.move(files[fname], dst)
        print(f"   {fname[:50]} → {target_dir}")
        del files[fname]

# ===== 4. 文件名规范化 =====
print("\n4. 文件名规范化...")

def normalize(name):
    base = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()

    # Step A: 去掉所有形式的德哈CP杂标签，准备重加【HP德哈】
    # —— 【德哈】、【德哈DH】、【德哈德DHD】、【DMHP】、【德哈PWP】、[德哈]、[DHr]、[HP-DHr]
    # —— 《》(HP同人)[hp] 《FallXX(DH)》
    # —— (DH)、（DH）

    # 去《》书名号
    base = re.sub(r'《([^》]+)》', r'\1', base)
    # 去【xxx】后提取原标题
    base = re.sub(r'^【[^】]*】', '', base)
    # 去开头标签 [xxx]
    base = re.sub(r'^\[[^\]]*\]', '', base)
    # 去 (DH)（DH）残渣
    base = re.sub(r'[（(]DH[）)]', '', base)
    base = re.sub(r'[（(]德哈[）)]', '', base)
    base = re.sub(r'[（(]hp[）)]', '', base, flags=re.I)
    base = re.sub(r'[（(]HP同人[）)]', '', base)
    # 去 (重生)（未完结）等状态标签
    base = re.sub(r'[（(]重生[）)]', '', base)
    base = re.sub(r'[（(]未完结[）)]', '', base)
    base = re.sub(r'[（(]\d+章[）)]', '', base)

    # 提取作者信息
    author = None
    # 作者：xxx
    m = re.search(r'作者[：:]\s*(.+?)$', base)
    if m:
        author = m.group(1).strip()
        base = re.sub(r'\s*作者[：:]\s*.+$', '', base)
    # 翻译者：xxx (简化，只留原作者)
    m2 = re.search(r'翻译[者]?[：:]\s*(.+?)$', base)
    if m2 and not author:
        author = m2.group(1).strip()
        base = re.sub(r'\s*翻译[者]?[：:]\s*.+$', '', base)
    # BY xxx / by xxx
    if not author:
        m = re.search(r'\b[Bb][Yy]\s+(.+?)$', base)
        if m:
            author = m.group(1).strip()
            base = re.sub(r'\s*[Bb][Yy]\s+.+$', '', base)

    # 去残留的（作者：xxx）括号格式
    base = re.sub(r'[（(]作者[：:]\s*[^）)]*[）)]', '', base)
    # 去（译者：xxx）
    base = re.sub(r'[（(]翻译者[：:]\s*[^）)]*[）)]', '', base)
    # 去 (HP同人) 等前缀
    base = re.sub(r'^[（(]HP同人[）)]', '', base)
    base = re.sub(r'^\[hp\]', '', base, flags=re.I)
    # 去(1)后缀
    base = re.sub(r'\(\d+\)$', '', base)
    # 去 _1 _2 后缀 (去重后残余)
    base = re.sub(r'_\d+$', '', base)

    # 清理括号注释（收尾）
    base = re.sub(r'[（(](?:高H|BE|HE|战后|短篇|长篇|完结)[^）)]*[）)]', '', base, flags=re.I)
    base = re.sub(r'[（(]\d+[）)]$', '', base)

    # 清理多余空格和标点
    base = re.sub(r'\s+', ' ', base)
    base = base.strip()
    base = re.sub(r'^[-–—_]+', '', base)
    base = re.sub(r'[-–—_]+$', '', base)

    # 构建新名
    result = f"【HP德哈】{base}"
    if author:
        result += f"_作者_{author}"
    result += ext
    return result.strip()

# 创建临时目录
if os.path.exists(TMP):
    shutil.rmtree(TMP, ignore_errors=True)
os.makedirs(TMP, exist_ok=True)

renamed = 0; unchanged = 0
output_seen = set()

for fname, fpath in files.items():
    new_name = normalize(fname)
    if new_name != fname:
        renamed += 1
        if renamed <= 30:
            print(f"   {fname[:55]}")
            print(f"   → {new_name[:55]}")

    # 去重: (新名, 大小)
    sz = os.path.getsize(fpath)
    key = (new_name, sz)
    if key in output_seen:
        continue  # dup, skip
    output_seen.add(key)

    dst = os.path.join(TMP, new_name)
    c = 1
    while os.path.exists(dst):
        base2, ext2 = os.path.splitext(new_name)
        dst = os.path.join(TMP, f"{base2}_{c}{ext2}")
        c += 1
    shutil.copy2(fpath, dst)

final_count = len(os.listdir(TMP))
print(f"\n   改名: {renamed}, 未变: {unchanged}")
print(f"   去重后: {final_count} (原 {len(files)})")

# ===== 5. 替换 =====
print("\n5. 替换...")
bak2 = DH + "_bak2"
if os.path.exists(bak2):
    shutil.rmtree(bak2, ignore_errors=True)
os.rename(DH, bak2)
os.rename(TMP, DH)
try:
    shutil.rmtree(bak2, ignore_errors=True)
except:
    import time
    time.sleep(2)
    shutil.rmtree(bak2, ignore_errors=True)
print("   完成")

# ===== 验证 =====
print(f"\n=== 最终验证 ===")
dh_files = os.listdir(DH)
print(f"文件数: {len(dh_files)}")
print(f"大小: {round(sum(os.path.getsize(os.path.join(DH,f)) for f in dh_files)/1048576,1)} MB")

# 检查非【HP德哈】前缀
bad = [f for f in dh_files if not f.startswith('【HP德哈】')]
print(f"非【HP德哈】前缀: {len(bad)}")
for b in bad:
    print(f"  {b}")

# 检查《》
books = [f for f in dh_files if '《' in f or '》' in f]
print(f"书名号残留: {len(books)}")

# 检查 by/BY 未规整
byleft = [f for f in dh_files if re.search(r'\b[Bb][Yy]\b', f) and '_作者_' not in f]
print(f"BY未规整: {len(byleft)}")

# 检查作者：未规整
authleft = [f for f in dh_files if re.search(r'作者[：:]', f) and '_作者_' not in f]
print(f"作者：未规整: {len(authleft)}")

print("DONE")
