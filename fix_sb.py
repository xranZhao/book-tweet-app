# -*- coding: utf-8 -*-
"""柿饼文件夹整理 + 小龙处理"""
import os, re, shutil

BASE = r"D:\CLAUDE\01-HP同人\03-原小说库"
SB = os.path.join(BASE, "柿饼")

print("=" * 60)
print("柿饼文件夹整理")
print("=" * 60)

files = [f for f in os.listdir(SB) if os.path.isfile(os.path.join(SB, f))]
print(f"初始: {len(files)} 个")

TMP = os.path.join(BASE, "_柿饼_tmp")
if os.path.exists(TMP):
    shutil.rmtree(TMP, ignore_errors=True)
os.makedirs(TMP, exist_ok=True)

def normalize_sb(name):
    """清理文件名 → 统一加【柿饼】前缀"""
    base = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()

    # 去《》
    base = re.sub(r'《([^》]+)》', r'\1', base)

    # 去掉所有【xxx】前缀标签（包括【柿饼xxx】）
    base = re.sub(r'^【[^】]*】', '', base)
    # 去掉开头的 [xxx]
    base = re.sub(r'^\[[^\]]*\]', '', base)

    # 去掉 HP同人 / HP- 等
    base = re.sub(r'[（(]HP同人[）)]', '', base, flags=re.I)
    base = re.sub(r'HP[-]?\s*', '', base, flags=re.I)

    # 去掉各种角色标签前缀（非【】的残余）
    base = re.sub(r'^袁朗[：:·]?\s*', '', base)
    base = re.sub(r'^高城[：:·]?\s*', '', base)
    base = re.sub(r'^袁许[：:·]?\s*', '', base)
    base = re.sub(r'^城[：:·]?\s*', '', base)
    base = re.sub(r'^bg[：:·]?\s*', '', base, flags=re.I)

    # 提取作者（作者： 或 BY）
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
    if not author:
        m = re.search(r'[（(]作者[：:]\s*(.+?)[）)]', base)
        if m:
            author = m.group(1).strip()
    base = re.sub(r'[（(]作者[：:]\s*[^）)]*[）)]', '', base)

    # 去广告尾
    base = re.sub(r'[-–—_\s]*微信搜索[^】]*$', '', base)
    base = re.sub(r'[-–—_\s]*派派后花园[^】]*$', '', base)
    base = re.sub(r'[-–—_\s]*TXT下载[^】]*$', '', base)
    base = re.sub(r'[-–—_\s]*JJ.*?(?:完结|下载)[^】]*$', '', base)
    base = re.sub(r'[-–—_\s]*[（(]?(?:晋江|起点|乐乎|lofter|LOFTER)[）)]?.*$', '', base, flags=re.I)
    base = re.sub(r'[-–—_\s]*wxfanst.*$', '', base)
    base = re.sub(r'[-–—_\s]*fanst.*$', '', base)
    base = re.sub(r'[-–—_\s]*wwww.*$', '', base)

    # 去状态标签
    base = re.sub(r'[（(](?:高H|BE|HE|完结|未完结|连载|完|慎入|雷)[^）)]*[）)]', '', base, flags=re.I)
    # 去 (1) _1 后缀
    base = re.sub(r'\(\d+\)$', '', base)
    base = re.sub(r'_\d+$', '', base)
    # 去行首行尾残渣
    base = re.sub(r'^[-–—_\s]+', '', base)
    base = re.sub(r'[-–—_\s]+$', '', base)

    base = re.sub(r'\s+', ' ', base).strip()

    if not base:
        base = "未命名"

    result = f"【柿饼】{base}"
    if author:
        result += f"_作者_{author}"
    result += ext
    return result.strip()

seen = set()
renamed = 0
deduped = 0

for fname in sorted(files):
    src = os.path.join(SB, fname)
    sz = os.path.getsize(src)
    new_name = normalize_sb(fname)

    if new_name != fname:
        renamed += 1

    key = (new_name, sz)
    if key in seen:
        deduped += 1
        # 保留非"无"前缀的版本
        # 如果当前文件不含"无"且之前保留的含"无"，替换
        continue
    seen.add(key)

    dst = os.path.join(TMP, new_name)
    c = 1
    while os.path.exists(dst):
        b2, e2 = os.path.splitext(new_name)
        dst = os.path.join(TMP, f"{b2}_{c}{e2}")
        c += 1
    shutil.copy2(src, dst)

print(f"改名: {renamed}, 去重: {deduped}")

# 检查是否还有"无"前缀重复（同大小文件去掉"无"版本）
# 重新扫一轮 TMP
tmp_files = os.listdir(TMP)
to_remove = []
for f in tmp_files:
    if '无' in f:
        base_no_wu = f.replace('无', '')
        # 找同名不含"无"的
        for f2 in tmp_files:
            if f2 == f:
                continue
            f2_compare = f2
            # 近似比较：去掉"无"后同名的
            if base_no_wu == f2_compare:
                # 检查大小是否相同
                s1 = os.path.getsize(os.path.join(TMP, f))
                s2 = os.path.getsize(os.path.join(TMP, f2))
                if s1 == s2:
                    to_remove.append(f)
                    print(f"  去重(无): {f[:60]}")
                break

for f in to_remove:
    fp = os.path.join(TMP, f)
    if os.path.exists(fp):
        os.remove(fp)

final_tmp = [f for f in os.listdir(TMP) if os.path.isfile(os.path.join(TMP, f))]
print(f"最终: {len(final_tmp)} 个")

# 检查
bad = [f for f in final_tmp if not f.startswith('【柿饼】')]
print(f"非【柿饼】前缀: {len(bad)}")
if bad:
    for b in bad[:10]:
        print(f"  ! {b[:80]}")

# 替换
old = SB + "_bak"
if os.path.exists(old):
    shutil.rmtree(old, ignore_errors=True)
os.rename(SB, old)
os.rename(TMP, SB)
shutil.rmtree(old, ignore_errors=True)

print("柿饼 DONE")

# =============================================
# 小龙处理
# =============================================
print("\n" + "=" * 60)
print("小龙处理")
print("=" * 60)

XL = os.path.join(BASE, "小龙")
UNCAT = os.path.join(BASE, "待分类")

xl_files = [f for f in os.listdir(XL) if os.path.isfile(os.path.join(XL, f))]
for fname in xl_files:
    base = os.path.splitext(fname)[0]
    ext = os.path.splitext(fname)[1].lower()

    # 去【HP-小龙文】前缀
    base = re.sub(r'^【[^】]*】', '', base)
    # 去广告尾
    base = re.sub(r'[-–—_\s]*微信搜索.*$', '', base)
    base = re.sub(r'[-–—_\s]*wxfanst.*$', '', base)
    base = re.sub(r'[-–—_\s]*同人小说$', '', base)
    base = re.sub(r'\s+', ' ', base).strip()

    new_name = f"【HP马尔福】{base}{ext}"

    src = os.path.join(XL, fname)
    dst = os.path.join(UNCAT, new_name)
    c = 1
    while os.path.exists(dst):
        b2, e2 = os.path.splitext(new_name)
        dst = os.path.join(UNCAT, f"{b2}_{c}{e2}")
        c += 1
    os.rename(src, dst)
    print(f"  移动: {fname[:50]} → {new_name[:60]}")

# 删除小龙空文件夹
try:
    os.rmdir(XL)
    print("  小龙文件夹已删除")
except:
    print(f"  小龙文件夹非空或不存在，跳过删除")

print("\n全部完成!")
