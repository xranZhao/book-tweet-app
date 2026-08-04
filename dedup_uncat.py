# -*- coding: utf-8 -*-
"""待分类：去重 + 文件名规范化"""
import os, re, shutil

SRC = r"D:\CLAUDE\01-HP同人\03-原小说库\待分类"
TMP = r"D:\CLAUDE\01-HP同人\03-原小说库\_待分类_tmp"
LOG = r"D:\CLAUDE\01-HP同人\03-原小说库\_待分类整理日志.txt"

log = []

def L(msg):
    log.append(msg)
    print(msg)

# ==== STEP 1: 收集所有文件，建立去重索引 ====
L("===== STEP 1: 收集文件 =====")

files = []
for f in os.listdir(SRC):
    fp = os.path.join(SRC, f)
    if os.path.isfile(fp):
        files.append((f, os.path.getsize(fp), fp))

L(f"总文件: {len(files)}")

# 去重 key: (去后缀的基名, 扩展名, 大小)
# 去后缀规则: 去 _1 _2 _3 _4 _5  和  (1) (2)
def strip_suffix(name):
    base = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()
    # 去 (1) (2) 等括号数字
    base = re.sub(r'\(\d+\)$', '', base)
    # 去 _1 _2 等
    base = re.sub(r'_\d+$', '', base)
    # 去 (1)_1 双重后缀残骸
    base = re.sub(r'\(\d+\)$', '', base)
    base = base.strip()
    return base, ext

# 分组
groups = {}
for fname, fsize, fpath in files:
    base, ext = strip_suffix(fname)
    key = (base, ext, fsize)
    if key not in groups:
        groups[key] = []
    groups[key].append((fname, fpath))

L(f"去重后组数: {len(groups)}")

# ==== STEP 2: 每组选最优保留文件（无后缀的优先） ====
L("\n===== STEP 2: 选优保留 =====")
del_count = 0
err_files = []  # .xhtml分页文件保留

keep_files = {}  # (base, ext, size) -> (best_name, path)

for key, items in groups.items():
    base, ext, size = key
    names = [it[0] for it in items]

    # xhtml 分页文件全部保留
    if ext == '.xhtml':
        for fname, fpath in items:
            keep_files[(fname, size)] = (fname, fpath)
        continue

    if len(items) == 1:
        fname, fpath = items[0]
        keep_files[(fname, size)] = (fname, fpath)
    else:
        # 优先选不含 _ 和 (数字) 后缀的
        best = items[0]
        for fname, fpath in items:
            # 无任何后缀的优先
            bare = os.path.splitext(fname)[0]
            if not re.search(r'[\(_]\d+', bare):
                best = (fname, fpath)
                break
        keep_files[(best[0], size)] = best
        dups = len(items) - 1
        if dups > 0:
            L(f"  DUP: {best[0][:60]} ({len(items)} copies, kept 1)")
        del_count += dups

L(f"删除重复: {del_count} 个, 保留: {len(keep_files)} 个")

# ==== STEP 3: 文件名规范化 ====
L("\n===== STEP 3: 文件名规范化 =====")
os.makedirs(TMP, exist_ok=True)

def normalize_name(name):
    """规范化文件名"""
    ext = os.path.splitext(name)[1].lower()
    base = os.path.splitext(name)[0]

    # 1. 【HP待分类】→【HP】
    base = base.replace('【HP待分类】', '【HP】')

    # 2. 【HP xxx】→【HPxxx】（去空格）
    base = re.sub(r'【HP\s+([^】]+)】', r'【HP\1】', base)

    # 3. 【HP-xxx】→【HPxxx】
    base = re.sub(r'【HP-([^】]+)】', r'【HP\1】', base)

    # 4. 双标签 【HPxxx】【yyy】→ 合并为【HPxxx】
    base = re.sub(r'】【HP', '', base)

    # 5. 去《》书名号（如果有【】标签且同时有《》）
    base = re.sub(r'《([^》]+)》', r'\1', base)

    # 6. 清理多余空格
    base = re.sub(r'\s+', ' ', base).strip()

    # 7. 无【HP】前缀的加上
    if '【HP' not in base and '【HP' not in name:
        # 已有【xxx】开头的保留
        if not base.startswith('【'):
            base = f'【HP】{base}'

    return base.strip() + ext

renamed = 0
for (fname, fsize), (best_name, src_path) in keep_files.items():
    new_name = normalize_name(fname)
    if new_name != fname:
        renamed += 1

    dst = os.path.join(TMP, new_name)
    c = 1
    b2, e2 = os.path.splitext(dst)
    while os.path.exists(dst):
        dst = f"{b2}_{c}{e2}"
        c += 1

    try:
        shutil.copy2(src_path, dst)
    except:
        pass

L(f"规范化: {renamed} 个")

# ==== STEP 4: 替换 ====
L("\n===== STEP 4: 替换原目录 =====")
old_bak = SRC + "_bak"
if os.path.exists(old_bak):
    shutil.rmtree(old_bak, ignore_errors=True)
os.rename(SRC, old_bak)
os.rename(TMP, SRC)
shutil.rmtree(old_bak, ignore_errors=True)
L("替换完成")

# ==== FINAL ====
final_count = len(os.listdir(SRC))
sz = round(sum(os.path.getsize(os.path.join(SRC, f)) for f in os.listdir(SRC) if os.path.isfile(os.path.join(SRC, f))) / 1048576, 1)
L(f"\n===== 完成 =====")
L(f"去重前: {len(files)}")
L(f"去重后: {final_count} (删 {del_count} 个重复, 改名 {renamed} 个)")
L(f"大小: {sz} MB")

# ext分布
exts = {}
for f in os.listdir(SRC):
    e = os.path.splitext(f)[1].lower()
    exts[e] = exts.get(e, 0) + 1
L("\n扩展名分布:")
for e, c in sorted(exts.items(), key=lambda x: -x[1]):
    L(f"  {e}: {c}")

with open(LOG, 'w', encoding='utf-8') as lf:
    lf.write('\n'.join(log))
print("DONE")
