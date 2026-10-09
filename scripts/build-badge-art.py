#!/usr/bin/env python3
"""Turns the bento box illustration into src/data/badgeArt.js.

    python3 scripts/build-badge-art.py /path/to/flat-vector-illustration--top-down-view-of-a-round.svg

The source file is NOT kept in this repository. It was made with Recraft AI (the file's own
content credentials say so), and whether it may ship depends on the plan it was made under.
Check that before a release.

The illustration is 991 flat shapes in a painter's order, traced from a picture that had a
checkerboard "transparent" background. So this script:
  1. drops the checkerboard: white shapes outside the box, a few big merged ones, and white
     squares at the box's corners and edges,
  2. drops the dark outline layer and the navy gap fills, which belong to every item at once.
     The app draws its own compartments and rebuilds each item's outline from the item's shapes,
  3. sorts the rest into items by their position in the file and where they sit, and
  4. rounds coordinates to one decimal and flattens the two gradients to their middle color.

The index lists below were read off renders of the file, one chunk at a time. They are specific to
that file. A different illustration needs them read again.
"""
import json, math, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else None
if not SRC:
    sys.exit(__doc__)

s = open(SRC, encoding='utf-8').read()
body = s[s.index('</metadata>') + len('</metadata>'):]
paths = re.findall(r'<path fill="([^"]*)" d="([^"]*)"\s*/?>', body)
assert len(paths) == 991, 'this script is written for the 991 shape file'

def bbox(d):
    n = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]
    return min(n[0::2]), min(n[1::2]), max(n[0::2]), max(n[1::2])

BB = [bbox(d) for _, d in paths]
WHITES = {'#F1EEE6', '#FEFEFE', '#E3E3E8'}
TX0, TY0, TX1, TY1, R = 106, 116, 916, 918, 86

def inside_tray(x, y):
    if not (TX0 <= x <= TX1 and TY0 <= y <= TY1):
        return False
    cx = min(max(x, TX0 + R), TX1 - R)
    cy = min(max(y, TY0 + R), TY1 - R)
    return math.hypot(x - cx, y - cy) <= R

keep = set()
for i, (fill, _) in enumerate(paths):
    x0, y0, x1, y1 = BB[i]
    if fill in WHITES and not inside_tray((x0 + x1) / 2, (y0 + y1) / 2):
        continue
    keep.add(i)
keep -= {389, 412, 413, 415, 424, 488, 489, 497, 973}                                    # merged checkerboard
keep -= {690, 743, 744, 750, 751, 758, 760, 761, 766, 769, 770, 771, 773, 298, 301, 303, 310, 312, 624}  # corners and edges

R_ = lambda a, b: set(range(a, b + 1))
G = {
    'cup':      R_(3, 12) | R_(34, 40),
    'oranges':  R_(13, 22) | R_(41, 56),
    'fish':     R_(23, 33) | R_(66, 70) | {74, 75},
    'cherry':   R_(58, 62),
    'tamago':   R_(79, 89),
    'skewer':   R_(90, 105) | {108, 109, 111},
    'plum':     {161, 162, 163, 164, 165, 166, 167},
    'steam':    {114, 144, 719},
    'chop':     R_(787, 797) | R_(805, 820) | {839, 840, 841, 842, 853, 861, 864, 879},
    'nori':     {799, 821, 851, 170, 186, 190, 192, 193, 196, 197, 200, 202, 203, 204, 205, 206, 208, 209, 779, 838, 845, 854},
    'leaf':     {774},
    'edamame':  R_(800, 804) | R_(822, 829) | R_(855, 863) | {850, 868},
    'broccoli': R_(781, 786) | R_(830, 835) | R_(846, 849) | {852, 866, 867, 870, 871, 872, 876, 877, 878, 880, 881, 882},
}
assigned = set().union(*G.values())
G['rice'] = {i for i in keep if i not in assigned and i != 0 and BB[i][0] < 530}
# the steam's heads and everything dark and big belong to no item
DARK = ('#243859', '#0C192F', '#0A1834')
KEEP_DARK = {67, 68, 69, 70}                       # ridges on the soy bottle's cap
def size(i):
    x0, y0, x1, y1 = BB[i]
    return max(x1 - x0, y1 - y0)
for k in G:
    G[k] = {i for i in G[k] if i in keep and (paths[i][0] not in DARK or i in KEEP_DARK or size(i) <= 40)}
# the plum's shadow must not grow an outline of its own
OUTLINE_SKIP = {'plum': {162}}
OUTLINED = ['rice', 'leaf', 'plum', 'edamame', 'broccoli', 'tamago', 'skewer', 'cup', 'oranges', 'fish', 'cherry', 'chop']

GRADIENT = {'url(#gradient_0)': '#F4E5C5', 'url(#gradient_1)': '#A44A24'}

def rnd(d):
    return re.sub(r'-?\d+\.\d+', lambda m: ('%.1f' % float(m.group(0))).replace('.0', ''), d)

def wisp(cx, cut, w0, length, amp, phase):
    left, right = [], []
    for k in range(21):
        t = k / 20.0
        y = cut - length * t
        x = cx + amp * math.sin(t * math.pi * 1.25 + phase)
        h = (w0 / 2.0) * ((1 - t) ** 0.85)
        left.append((x - h, y)); right.append((x + h, y))
    pts = left + right[::-1]
    return ' '.join('%.0f,%.0f' % p for p in pts)

out = {}
for g, idx in G.items():
    items = sorted(idx)
    entry = {'paths': [[GRADIENT.get(paths[i][0], paths[i][0]), rnd(paths[i][1])] for i in items]}
    if g in OUTLINED:
        skip = OUTLINE_SKIP.get(g, set())
        entry['outline'] = ' '.join(rnd(paths[i][1]) for i in items if i not in skip)
    out[g] = entry
# the rice was traced around the chopsticks, so their footprint is a gap in it. These two shapes
# (the sticks' bodies) are filled with rice color under the rice while the sticks are not there.
out['riceGap'] = {'paths': [[paths[i][0], rnd(paths[i][1])] for i in (787, 805)]}
# steam: the original tails, cut below the blocky heads, plus a tapered extension upward
out['steam'] = {
    'paths': out['steam']['paths'],
    'cuts': [100, 160, 108],            # in the order 719, 114, 144 (sorted by index: 114, 144, 719)
    'wisps': [wisp(236, 102, 24, 70, 9, 0.0), wisp(340, 162, 30, 82, 10, 0.6), wisp(390, 110, 20, 62, 8, 0.3)],
}
# paths are sorted by index, so the steam is 114, 144, 719: give each its own cut
out['steam']['cuts'] = [160, 108, 100]

total = sum(len(p[1]) for e in out.values() for p in e['paths'])
src = """/* The bento box badge art. GENERATED by scripts/build-badge-art.py from the original illustration.
 * Do not edit by hand. The art was made with Recraft AI: check the plan it was made under allows
 * shipping it before a release.
 *
 * Each key is one item of the box, drawn in the original's colors. `outline` is every shape of the
 * item joined into one path, stroked dark under the item to rebuild the original's outline. The
 * compartments, the fillers under the rice, nori and tamagoyaki, and the clip paths are in
 * components/Badges/BentoBox.jsx. Coordinates are in the original's 1024 space. */
export const ART = %s;
""" % json.dumps(out, separators=(',', ':'))
open('src/data/badgeArt.js', 'w').write(src)
print('wrote src/data/badgeArt.js', len(src), 'chars,', sum(len(e['paths']) for e in out.values()), 'shapes, path data', total, 'chars')
