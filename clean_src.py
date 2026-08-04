# -*- coding: utf-8 -*-
import os, re, shutil

SRC = r"D:\CLAUDE\01-HP同人\03-原小说库"

COMPRESSED = {'.rar','.zip','.7z'}
JUNK = {'.cfg','.xltd','.downloading','.ffs_tmp'}

del_count = 0; del_size = 0; move_count = 0

# === STEP 1+2: Delete compressed + junk + MACOSX + META-INF ===
for root, dirs, files in os.walk(SRC, topdown=False):
    for d in list(dirs):
        if d == '__MACOSX' or d == 'META-INF':
            dp = os.path.join(root, d)
            try:
                shutil.rmtree(dp, ignore_errors=True)
            except:
                pass

    for f in files:
        ext = os.path.splitext(f)[1].lower()
        name = f
        skip = False
        if ext in COMPRESSED: skip = True
        if ext in JUNK: skip = True
        if not ext or ext == '.': skip = True
        if name == '.DS_Store': skip = True
        if name.startswith('._'): skip = True
        if 'baiduyun' in name.lower(): skip = True

        if skip:
            fp = os.path.join(root, f)
            try:
                sz = os.path.getsize(fp)
                os.remove(fp)
                del_count += 1
                del_size += sz
            except Exception as e:
                pass

print(f"DELETED files: {del_count}, size: {round(del_size/1048576,1)} MB")

# === STEP 3: Flatten nested subdirs ===
NESTED = [
    '240410-Fanst补充资源','240410-Fanst补充资源(1)','240415-Fanst补充资源',
    '240416-Fanst补充资源','240416-Fanst补充资源(1)','240425-Fanst补充资源',
    '240425-Fanst补充资源(1)','240428-fanst补充资源','240522-fanst补充资源',
    '240523-fanst补充资源','240920-磕学家补充资源','240924-磕学家补充资源',
    '240925-磕学家补充资源','240928-磕学家补充资源','241014-磕学家补充资源',
    '241022-磕学家补充资源','241112-磕学家','241128-哈皮磕学家',
    'Fanst资源日更中（先转存再查看',
]

def flatten_dir(target_dir, parent_dir):
    global move_count
    if not os.path.isdir(target_dir):
        return
    for r2, d2, f2 in os.walk(target_dir):
        for fn in f2:
            src_f = os.path.join(r2, fn)
            dst_f = os.path.join(parent_dir, fn)
            c = 1
            base, ext = os.path.splitext(fn)
            while os.path.exists(dst_f):
                dst_f = os.path.join(parent_dir, f"{base}_{c}{ext}")
                c += 1
            try:
                shutil.move(src_f, dst_f)
                move_count += 1
            except:
                pass
    try:
        shutil.rmtree(target_dir, ignore_errors=True)
        print(f"  FLATTENED: {os.path.basename(target_dir)}")
    except:
        pass

# Flatten 待分类 subdirs
uncat = os.path.join(SRC, "待分类")
for dn in NESTED:
    flatten_dir(os.path.join(uncat, dn), uncat)

# Flatten 斯赫 subdirs
ss = os.path.join(SRC, "斯赫")
for dn in ['赫敏的学徒生涯','冥冥天意','双重人生']:
    flatten_dir(os.path.join(ss, dn), ss)

# Flatten CP dir subdirs starting with 【HP
for cp_name in ['哈德','德哈','德赫','斯赫','小龙','柿饼','待分类']:
    cp_path = os.path.join(SRC, cp_name)
    if not os.path.isdir(cp_path):
        continue
    for entry in os.listdir(cp_path):
        ep = os.path.join(cp_path, entry)
        if os.path.isdir(ep) and entry.startswith('【HP'):
            flatten_dir(ep, cp_path)

print(f"MOVED files: {move_count}")

# === SUMMARY ===
remaining = 0
remaining_size = 0
subdirs_left = []
for root, dirs, files in os.walk(SRC):
    remaining += len(files)
    for f in files:
        try:
            remaining_size += os.path.getsize(os.path.join(root, f))
        except:
            pass
    for d in dirs:
        subdirs_left.append(os.path.join(root, d))

print(f"\nREMAINING: {remaining} files, {round(remaining_size/1048576,1)} MB")
print(f"Subdirs remaining: {len(subdirs_left)}")
for sd in subdirs_left:
    print(f"  {sd}")

print("\n=== Per folder ===")
for d in sorted(os.listdir(SRC)):
    dp = os.path.join(SRC, d)
    if not os.path.isdir(dp):
        continue
    fc = 0; sz = 0; sc = 0
    for r2, d2, f2 in os.walk(dp):
        fc += len(f2)
        sc += len(d2)
        for fn in f2:
            try:
                sz += os.path.getsize(os.path.join(r2, fn))
            except:
                pass
    print(f"  {d}: {fc} files, {round(sz/1048576,1)} MB, {sc} subdirs")

print("DONE")
