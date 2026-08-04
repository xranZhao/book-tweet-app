# -*- coding: utf-8 -*-
"""德哈文件夹：AI逐条命名整理 + 去重"""
import os, re, shutil

SRC = r"D:\CLAUDE\01-HP同人\03-原小说库\德哈"
TMP = os.path.join(os.path.dirname(SRC), "_德哈_tmp")

# =====================================================
# 手工逐条命名：每个文件 原名 → 标准化名
# 规则：去CP杂标签、去《》、去(重生)等、作者by规范、统一【HP德哈】前缀
# =====================================================

RENAME_MAP = {
    # === 已有旧格式，简化匹配（删重复前的旧格式也要改名，但最终会被删除） ===
    '[德哈] 不能让你看见花开  BY 文葵.txt':
        '【HP德哈】不能让你看见花开_作者_文葵.txt',

    '《（HP同人）[hp]纯白年代》作者：一瓢清流.txt':
        None,  # 0KB 空文件，删除

    '《【德哈】（重生）若我西沉》作者：白桃乌龙茶加奶盖.txt':
        None,  # 与已规整版重复(1070KB)，删除

    '《【德哈】十夜谈》作者：墙头有个猫.txt':
        None,  # 重复(159.7KB)，删除

    '《【德哈】眼中有星辰》作者：yixun.txt':
        None,  # 重复(786.4KB)，删除

    '《【德哈DH】今夜无人坠入情网》作者：Ara.txt':
        None,  # 重复(40.3KB)，删除

    '《【德哈德DHD】不语胜千言 Talk to Me》作者：Saras_Girl.txt':
        None,  # 重复(90.6KB)，删除

    '《Fall暗篇（DH）》作者：趴趴尘.txt':
        '【HP德哈】Fall 暗篇_作者_趴趴尘.txt',

    '《Fall光篇（DH）》作者：趴趴尘.txt':
        '【HP德哈】Fall 光篇_作者_趴趴尘.txt',

    '《HP(德哈)飞跃时间》作者：文葵.txt':
        None,  # 重复(718.7KB)，删除

    '《HP之永远救不了斯内普》作者：月半时.txt':
        '【HP德哈】永远救不了斯内普_作者_月半时.txt',

    '【DMHP】memento mori-向死而生 by 爱丽丝梦游症候群(1).txt':
        '【HP德哈】Memento Mori-向死而生_作者_爱丽丝梦游症候群.txt',

    '【HP德哈】（重生）若我西沉_作者_白桃乌龙茶加奶盖.txt':
        '【HP德哈】若我西沉_作者_白桃乌龙茶加奶盖.txt',

    # === 已有规整格式（不动） ===
    '【HP德哈】BOND.txt': None,  # keep
    '【HP德哈】Bound by Honor_作者_rsriver.txt': None,
    '【HP德哈】Call Me By Your Name.txt': None,
    '【HP德哈】Fimbulvetr.txt': None,
    '【HP德哈】Immer.txt': None,
    '【HP德哈】Oath Breaker.txt': None,
    '【HP德哈】Sliding Door.txt': None,
    '【HP德哈】There For You.txt': None,
    '【HP德哈】Under Stars.txt': None,
    '【HP德哈】爱上自闭症男孩.txt': None,
    '【HP德哈】不虞之隙.txt': None,
    '【HP德哈】离婚.txt': None,
    '【HP德哈】两情相悦.txt': None,
    '【HP德哈】盲区.txt': None,
    '【HP德哈】迷失十年.txt': None,
    '【HP德哈】七日之失.txt': None,
    '【HP德哈】如果哈利波特不是童话.txt': None,
    '【HP德哈】撒谎者.txt': None,
    '【HP德哈】死亡尽头.txt': None,
    '【HP德哈】碎片黄金.txt': None,
    '【HP德哈】风语者.txt': None,
    '【HP德哈】长腿哥哥.txt': None,
    '【HP德哈】值得等待.txt': None,
    '【HP德哈】一桩事先张扬的凶杀案.txt': None,
    '【HP德哈】哈利觉得这不能怪他.txt': None,
    '【HP德哈】完美世界的不完美恋人.txt': None,
    '【HP德哈】级长的惩罚.txt': None,
    '【HP德哈】第二代四巨头.txt': None,
    '【HP德哈】德拉科一生中最重要的十封信.txt': None,
    '【HP德哈】江河梦里人德哈中短篇集合.txt': None,
    '【HP德哈】他、他和他的故事.txt': None,

    # === 需要改名（by/BY/括号/杂标签清理） ===
    '【HP德哈】Irresistible Poison.txt':
        None,  # keep, 不同版(450KB vs 608KB)
    '【HP德哈】Irresistible Poison_1.txt':
        '【HP德哈】Irresistible Poison 续.txt',

    '【HP德哈】Light A Fire.txt':
        None,  # keep (722.6KB)
    '【HP德哈】Light A Fire_1.txt':
        None,  # 几乎相同(723.2KB)，删除

    '【HP德哈】Memento Mori-向死而生.txt':
        None,  # keep

    '【HP德哈】My Beautiful Boy漂亮男孩.txt':
        '【HP德哈】My Beautiful Boy 漂亮男孩.txt',

    '【HP德哈】Running on Air御风而行 by eleventy7.txt':
        '【HP德哈】Running on Air 御风而行_作者_eleventy7.txt',

    '【HP德哈】Special Operation 特别行动（战后双傲罗）by 竹染轩阴.txt':
        '【HP德哈】Special Operation 特别行动_作者_竹染轩阴.txt',

    '【HP德哈】Special Operation 特别行动.txt':
        None,  # keep

    '【HP德哈】Take Me Home BY Blanche Malfoy.txt':
        '【HP德哈】Take Me Home_作者_Blanche Malfoy.txt',

    '【HP德哈】The interloper 杂物间.txt':
        '【HP德哈】The Interloper 杂物间_作者_白鹭霜.txt',

    '【HP德哈】The Lightning Letters & Ink（800年后考古BE）.txt':
        '【HP德哈】The Lightning Letters & Ink.txt',

    '【HP德哈】The Road Home BY Blanche Malfoy.txt':
        '【HP德哈】The Road Home_作者_Blanche Malfoy.txt',

    '【HP德哈】The Simple Joy of Living.txt': None,

    '【HP德哈】The Social Season 社交季 （短篇HE）.txt':
        '【HP德哈】The Social Season 社交季.txt',

    '【HP德哈】The wasted time-虚度的时间（战后甜文）.txt':
        '【HP德哈】The Wasted Time 虚度的时间.txt',

    '【HP德哈】when angles come.txt':
        '【HP德哈】When Angels Come.txt',

    '【HP德哈】暴雨夜（含番外2篇）.txt':
        None,  # keep

    '【HP德哈】暴雨夜（含番外2篇）_1.txt':
        None,  # 重复(587.5KB)，删除

    '【HP德哈】暴雨夜——长篇（含番外2篇）.txt':
        None,  # 重复(587.5KB)，删除

    '【HP德哈】不语胜千言 Talk to Me_作者_Saras_Girl.txt': None,

    '【HP德哈】残缺的字母(1).txt':
        '【HP德哈】残缺的字母.txt',

    '【HP德哈】德拉科在衣柜里藏了什么+衣柜的后续处理_作者_Avadale.txt': None,

    '【HP德哈】赌城无事记_作者_Decinda.txt': None,

    '【HP德哈】飞跃时间_作者_文葵.txt': None,

    '【HP德哈】黑暗时代-待规整.txt':
        '【HP德哈】黑暗时代.txt',

    '【HP德哈】灰烬（the Ashes）by灯獾雀楼.txt':
        '【HP德哈】灰烬_作者_灯獾雀楼.txt',

    '【HP德哈】今夜无人坠入情网_作者_Ara.txt': None,

    '【HP德哈】漆黑夜幕_作者_猫璐.txt': None,

    '【HP德哈】十夜谈_作者_墙头有个猫.txt': None,

    '【HP德哈】时间悖论 by 黑色纸鸢.txt':
        '【HP德哈】时间悖论_作者_黑色纸鸢.txt',

    '【HP德哈】时间之芯（稀里糊涂的双向暗恋）.txt':
        '【HP德哈】时间之芯.txt',

    '【HP德哈】世界星辉（正文+番外+荣誉永恒）.txt':
        '【HP德哈】世界星辉 完全版.txt',

    '【HP德哈】世界星辉.txt':
        None,  # keep (2004KB vs 2425KB不同版)

    '【HP德哈】所向无敌Invincible Charm.txt':
        '【HP德哈】所向无敌 Invincible Charm.txt',

    '【HP德哈】他、他和他的故事-长.txt':
        '【HP德哈】他、他和他的故事 长篇.txt',

    '【HP德哈】他比晚风温柔（有子离婚前穿越平行世界）.txt':
        '【HP德哈】他比晚风温柔.txt',

    '【HP德哈】他比晚风温柔BY鸵鸟的秘密.txt':
        '【HP德哈】他比晚风温柔_作者_鸵鸟的秘密.txt',

    '【HP德哈】未来回归 (哈利重生文）.txt':
        '【HP德哈】未来回归.txt',

    '【HP德哈】未完结-完美的世界-The Perfect World.txt':
        '【HP德哈】完美的世界 The Perfect World.txt',

    '【HP德哈】向救世主宣誓by猛虎落地.txt':
        '【HP德哈】向救世主宣誓_作者_猛虎落地.txt',

    '【HP德哈】眼中有星辰_作者_yixun.txt': None,

    '【HP德哈】一生所爱 BY 上山打老虎巴扎嘿.txt':
        '【HP德哈】一生所爱_作者_上山打老虎巴扎嘿.txt',

    '【HP德哈】杂物间 by 白鹭霜.txt':
        None,  # 与The Interloper重复(410.2KB相同)，删除

    '【HP德赫】Hot for Teacher.pdf':
        'MOVE_TO_德赫',  # 移走

    '【德哈PWP】论领带的多种用法（高H）.txt':
        '【HP德哈】论领带的多种用法.txt',

    '远离此间 by鸵鸟的秘密（作者240505补圆）.txt':
        '【HP德哈】远离此间_作者_鸵鸟的秘密.txt',
}

# =====================
print("="*60)
print("德哈文件整理")
print("="*60)

files = {f: (os.path.join(SRC, f), os.path.getsize(os.path.join(SRC, f)))
         for f in os.listdir(SRC) if os.path.isfile(os.path.join(SRC, f))}

os.makedirs(TMP, exist_ok=True)

deleted = 0; renamed = 0; kept = 0; moved = 0
seen = set()
# 先处理 renamed ones that might produce same output name

for fname, (src_path, fsize) in files.items():
    action = RENAME_MAP.get(fname, "NOT_FOUND")

    if action == "NOT_FOUND":
        # 文件不在映射中，直接保留
        dst = os.path.join(TMP, fname)
        shutil.copy2(src_path, dst)
        kept += 1
        print(f"  [未映射/保留] {fname}")
        continue

    if action is None:
        # 删除重复
        deleted += 1
        print(f"  [删除重复] {fname[:60]}")
        continue

    if action == "MOVE_TO_德赫":
        dh_dest = os.path.join(os.path.dirname(SRC), "德赫", fname)
        c = 1
        while os.path.exists(dh_dest):
            dh_dest = os.path.join(os.path.dirname(SRC), "德赫",
                                   f"{os.path.splitext(fname)[0]}_{c}{os.path.splitext(fname)[1]}")
            c += 1
        shutil.move(src_path, dh_dest)
        moved += 1
        print(f"  [移动到德赫] {fname}")
        continue

    if action == "_KEEP":
        # 保留原样
        dst = os.path.join(TMP, fname)
        shutil.copy2(src_path, dst)
        kept += 1
        continue

    # 改名
    new_name = action
    # 去重检测
    key = (new_name, fsize)
    if key in seen:
        deleted += 1
        print(f"  [去重删除] {fname[:60]} -> {new_name[:60]}")
        continue
    seen.add(key)

    dst = os.path.join(TMP, new_name)
    c = 1
    while os.path.exists(dst):
        base, ext = os.path.splitext(new_name)
        dst = os.path.join(TMP, f"{base}_{c}{ext}")
        c += 1

    shutil.copy2(src_path, dst)
    renamed += 1
    print(f"  [改名] {fname[:50]}")
    print(f"      -> {os.path.basename(dst)[:50]}")

# 替换
old = SRC + "_bak"
if os.path.exists(old): shutil.rmtree(old, ignore_errors=True)
os.rename(SRC, old)
os.rename(TMP, SRC)
shutil.rmtree(old, ignore_errors=True)

print(f"\n删除: {deleted} | 改名: {renamed} | 保留: {kept} | 移走: {moved}")
print(f"最终: {len(os.listdir(SRC))} 个文件")
print("DONE")
