import os, re
uncat = r'D:/CLAUDE/01-HP同人/03-原小说库/待分类'
files = [f for f in os.listdir(uncat) if os.path.isfile(os.path.join(uncat, f))]
print(f'总: {len(files)}')

cats = {
    '西斯': [r'西斯'],
    '福华': [r'福尔摩斯', r'福华'],
    '教授斯内普': [r'Snape', r'斯内普'],
    '斯莉': [r'斯莉'],
    '斯哈': [r'斯哈', r'Snarry'],
}
for cat, pats in cats.items():
    matched = []
    for f in files:
        for p in pats:
            if re.search(p, f, re.I):
                matched.append(f)
                break
    print(f'\n{cat}: {len(matched)}')
    for f in matched[:5]:
        print(f'  {f[:80]}')

# HP子标签全部
hp_tags = {}
for f in files:
    m = re.match(r'【HP([^】]+)】', f)
    if m:
        hp_tags[m.group(1)] = hp_tags.get(m.group(1), 0) + 1
print('\n=== HP子标签 ===')
for t, c in sorted(hp_tags.items(), key=lambda x: -x[1])[:25]:
    print(f'  【HP{t}】: {c}')

# 无任何【HP前缀的
no_hp = [f for f in files if not f.startswith('【HP')]
print(f'\n无HP前缀: {len(no_hp)}')
