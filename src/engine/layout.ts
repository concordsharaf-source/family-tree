import type {Marriage, Person, Relationship} from '../types';

/**
 * محرك تخطيط شجرة العائلة.
 *
 * يقوم بثلاث خطوات:
 * 1) توزيع الأفراد على أجيال (مستويات) اعتمادًا على علاقات الأبوة/الأمومة والزواج.
 * 2) ترتيب الأفراد داخل كل جيل بطريقة «barycenter» لتقليل تقاطع الخطوط،
 *    مع إبقاء الأزواج متجاورين، ثم محاذاة الأبناء تحت والديهم.
 * 3) توليد إحداثيات البطاقات ومسارات SVG التي تربط العلاقات فعليًا
 *    (وصلات الأبوة/الأمومة على شكل ناقل عائلي، ووصلات الزواج).
 */

export const NODE_W = 178;
export const NODE_H = 150;
const GAP_X = 46;
const GAP_Y = 108;
const GROUP_GAP = 34;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  level: number;
  relativeLevel: number;
}

export interface LayoutEdge {
  id: string;
  d: string;
  kind: 'parent' | 'spouse';
}

export interface LayoutUnion {
  id: string;
  x: number;
  y: number;
}

export interface LayoutRow {
  level: number;
  y: number;
  label: string;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  unions: LayoutUnion[];
  rows: LayoutRow[];
  width: number;
  height: number;
}

const PAD_X = 40;
const PAD_Y = 28;

/** يربط بين شخصين بإزاحة مستوى (الأب أعلى الابن بمقدار 1). */
function buildAdjacency(ids: Set<string>, rels: Relationship[], marriages: Marriage[]) {
  const adj = new Map<string, {id: string; delta: number}[]>();
  const link = (a: string, b: string, delta: number) => {
    const list = adj.get(a) ?? [];
    if (!list.some((e) => e.id === b && e.delta === delta)) list.push({id: b, delta});
    adj.set(a, list);
  };
  for (const r of rels) {
    if (!ids.has(r.fromPersonId) || !ids.has(r.toPersonId)) continue;
    if (r.type === 'parent') {
      link(r.fromPersonId, r.toPersonId, 1);
      link(r.toPersonId, r.fromPersonId, -1);
    } else {
      link(r.fromPersonId, r.toPersonId, 0);
      link(r.toPersonId, r.fromPersonId, 0);
    }
  }
  for (const m of marriages) {
    if (!ids.has(m.person1Id) || !ids.has(m.person2Id)) continue;
    link(m.person1Id, m.person2Id, 0);
    link(m.person2Id, m.person1Id, 0);
  }
  return adj;
}

/** يوزّع الأفراد على أجيال بدءًا من الشخص الجذري. */
function assignLevels(
  people: Person[],
  rels: Relationship[],
  marriages: Marriage[],
  root: string,
): Map<string, number> {
  const ids = new Set(people.map((p) => p.id));
  const adj = buildAdjacency(ids, rels, marriages);
  const level = new Map<string, number>();
  const start = ids.has(root) ? root : people[0]?.id;
  if (start) {
    level.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      const currentLevel = level.get(current)!;
      for (const edge of adj.get(current) ?? []) {
        if (level.has(edge.id)) continue;
        level.set(edge.id, currentLevel + edge.delta);
        queue.push(edge.id);
      }
    }
  }
  for (const id of ids) if (!level.has(id)) level.set(id, 0);
  const min = Math.min(...level.values());
  for (const [id, value] of level) level.set(id, value - min);
  return level;
}

/** تجميع الأزواج/الشركاء في وحدات تُعرض متجاورة. */
function buildUnits(members: string[], rels: Relationship[], marriages: Marriage[]) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) {
      parent.set(x, x);
      return x;
    }
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of members) find(id);
  for (const m of marriages) {
    if (parent.has(m.person1Id) && parent.has(m.person2Id)) union(m.person1Id, m.person2Id);
  }
  for (const r of rels) {
    if (r.type === 'partner' && parent.has(r.fromPersonId) && parent.has(r.toPersonId)) {
      union(r.fromPersonId, r.toPersonId);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of members) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()];
}

/** ترتيب الأفراد داخل كل جيل عبر تمريرات barycenter. */
function computeOrder(
  people: Person[],
  rels: Relationship[],
  marriages: Marriage[],
  level: Map<string, number>,
): Map<number, string[]> {
  const byLevel = new Map<number, string[]>();
  const originalIndex = new Map<string, number>();
  people.forEach((p, i) => originalIndex.set(p.id, i));
  for (const p of people) {
    const l = level.get(p.id) ?? 0;
    const list = byLevel.get(l) ?? [];
    list.push(p.id);
    byLevel.set(l, list);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  const parentsOf = (id: string) =>
    rels.filter((r) => r.type === 'parent' && r.toPersonId === id).map((r) => r.fromPersonId);
  const childrenOf = (id: string) =>
    rels.filter((r) => r.type === 'parent' && r.fromPersonId === id).map((r) => r.toPersonId);

  const orders = new Map<number, string[]>();

  const orderLevel = (l: number, reference: Map<string, number>, useParents: boolean) => {
    const members = byLevel.get(l) ?? [];
    const units = buildUnits(members, rels, marriages);
    const barycenter = (unit: string[]) => {
      const values: number[] = [];
      for (const id of unit) {
        const neighbors = useParents ? parentsOf(id) : childrenOf(id);
        for (const n of neighbors) {
          const ref = reference.get(n);
          if (ref !== undefined) values.push(ref);
        }
      }
      if (values.length) return values.reduce((a, b) => a + b, 0) / values.length;
      return unit.reduce((a, id) => a + (originalIndex.get(id) ?? 0), 0) / unit.length;
    };
    const ordered = units
      .map((unit) => ({
        unit: [...unit].sort((a, b) => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)),
        key: barycenter(unit),
      }))
      .sort((a, b) => a.key - b.key)
      .flatMap((entry) => entry.unit);
    orders.set(l, ordered);
    const pos = new Map<string, number>();
    ordered.forEach((id, i) => pos.set(id, i));
    return pos;
  };

  // تمريرة من الأعلى للأسفل (محاذاة تحت الوالدين)
  let reference = new Map<string, number>();
  for (const l of levels) reference = orderLevel(l, reference, true);
  // تمريرة من الأسفل للأعلى (محاذاة فوق الأبناء)
  reference = new Map<string, number>();
  for (const l of [...levels].reverse()) reference = orderLevel(l, reference, false);
  // تمريرة أخيرة من الأعلى للأسفل
  reference = new Map<string, number>();
  for (const l of levels) reference = orderLevel(l, reference, true);

  return orders;
}

/** توزيع الإحداثيات الأفقية مع محاذاة الأبناء تحت والديهم. */
function assignCoordinates(
  orders: Map<number, string[]>,
  levels: number[],
  rels: Relationship[],
  marriages: Marriage[],
) {
  const x = new Map<string, number>();
  const levelsSorted = [...levels].sort((a, b) => a - b);
  const unitsOfLevel = (l: number) => buildUnits(orders.get(l) ?? [], rels, marriages);

  // الموضع الأولي: كل جيل يبدأ من الصفر مع فجوة إضافية بين الوحدات
  for (const l of levelsSorted) {
    let cursor = 0;
    const units = unitsOfLevel(l);
    units.forEach((unit, ui) => {
      unit.forEach((id, i) => {
        x.set(id, cursor);
        cursor += NODE_W;
        if (i < unit.length - 1) cursor += GAP_X;
      });
      if (ui < units.length - 1) cursor += GAP_X + GROUP_GAP;
    });
  }

  const parentsOf = (id: string) =>
    rels.filter((r) => r.type === 'parent' && r.toPersonId === id).map((r) => r.fromPersonId);

  const parentKeyOf = (unit: string[]) => {
    const ps = [...new Set(unit.flatMap((id) => parentsOf(id)))].sort();
    return ps.length ? ps.join('|') : `u:${unit.join('+')}`;
  };
  // كتلة = مجموعة وحدات متجاورة تتشارك نفس الوالدين (الأشقاء)
  const blocksOfLevel = (l: number) => {
    const units = unitsOfLevel(l);
    const blocks: {key: string; units: string[][]}[] = [];
    for (const unit of units) {
      const key = parentKeyOf(unit);
      const last = blocks[blocks.length - 1];
      if (last && last.key === key && !key.startsWith('u:')) last.units.push(unit);
      else blocks.push({key, units: [unit]});
    }
    return blocks;
  };

  const shiftBlock = (block: {units: string[][]}, delta: number) => {
    for (const unit of block.units) for (const id of unit) x.set(id, x.get(id)! + delta);
  };
  const blockBounds = (block: {units: string[][]}) => {
    const ids = block.units.flat();
    const min = Math.min(...ids.map((id) => x.get(id)!));
    const max = Math.max(...ids.map((id) => x.get(id)!)) + NODE_W;
    return {min, max};
  };
  const resolveOverlaps = (l: number) => {
    const blocks = blocksOfLevel(l);
    for (let i = 1; i < blocks.length; i++) {
      const prev = blockBounds(blocks[i - 1]);
      const cur = blockBounds(blocks[i]);
      if (cur.min < prev.max + GAP_X) shiftBlock(blocks[i], prev.max + GAP_X - cur.min);
    }
  };

  // محاذاة كتل الأشقاء تحت والديهم مع حل التداخل
  for (let pass = 0; pass < 6; pass++) {
    for (const l of levelsSorted) {
      const blocks = blocksOfLevel(l);
      for (const block of blocks) {
        const parentXs = block.units
          .flatMap((unit) => unit.flatMap((id) => parentsOf(id)))
          .map((pid) => x.get(pid))
          .filter((v): v is number => v !== undefined);
        if (!parentXs.length) continue;
        const desiredCenter = parentXs.reduce((a, b) => a + b, 0) / parentXs.length + NODE_W / 2;
        const bounds = blockBounds(block);
        const currentCenter = (bounds.min + bounds.max) / 2;
        shiftBlock(block, desiredCenter - currentCenter);
      }
      resolveOverlaps(l);
    }
  }
  for (const l of levelsSorted) resolveOverlaps(l);

  // إزاحة شاملة واحدة للحفاظ على محاذاة الأجيال
  const min = Math.min(...x.values());
  for (const [id, value] of x) x.set(id, value - min);
  return x;
}

function generationLabel(relative: number) {
  if (relative < 0) return 'الأجداد';
  if (relative === 0) return 'الجيل الرئيسي';
  if (relative === 1) return 'الأبناء';
  return 'الأحفاد';
}

export function computeTreeLayout(
  people: Person[],
  rels: Relationship[],
  marriages: Marriage[],
  root: string,
): TreeLayout {
  if (!people.length) {
    return {nodes: [], edges: [], unions: [], rows: [], width: 0, height: 0};
  }
  const level = assignLevels(people, rels, marriages, root);
  const orders = computeOrder(people, rels, marriages, level);
  const levels = [...new Set(level.values())];
  const x = assignCoordinates(orders, levels, rels, marriages);

  const rootLevel = level.get(root) ?? Math.min(...level.values());

  const nodes: LayoutNode[] = people.map((p) => {
    const l = level.get(p.id) ?? 0;
    return {
      id: p.id,
      x: (x.get(p.id) ?? 0) + PAD_X,
      y: l * (NODE_H + GAP_Y) + PAD_Y,
      level: l,
      relativeLevel: l - rootLevel,
    };
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set(nodes.map((n) => n.id));

  const edges: LayoutEdge[] = [];
  const unions: LayoutUnion[] = [];

  // وصلات الزواج: خط أفقي عند منتصف ارتفاع البطاقتين
  marriages.forEach((m, index) => {
    const a = nodeById.get(m.person1Id);
    const b = nodeById.get(m.person2Id);
    if (!a || !b) return;
    const left = a.x <= b.x ? a : b;
    const right = a.x <= b.x ? b : a;
    const y = left.y + NODE_H / 2;
    const startX = left.x + NODE_W;
    const endX = right.x;
    if (endX > startX) {
      edges.push({id: `spouse-${m.id}-${index}`, d: `M ${startX} ${y} L ${endX} ${y}`, kind: 'spouse'});
      unions.push({id: `union-${m.id}`, x: (startX + endX) / 2, y});
    } else {
      edges.push({id: `spouse-${m.id}-${index}`, d: `M ${startX} ${y} L ${endX} ${y}`, kind: 'spouse'});
      unions.push({id: `union-${m.id}`, x: (startX + endX) / 2, y});
    }
  });

  // وصلات الأبوة/الأمومة: ناقل عائلي واحد لكل مجموعة والدين
  const families = new Map<string, {parents: string[]; children: string[]}>();
  for (const r of rels) {
    if (r.type !== 'parent') continue;
    if (!placed.has(r.fromPersonId) || !placed.has(r.toPersonId)) continue;
    const key = r.toPersonId;
    const entry = families.get(key) ?? {parents: [], children: []};
    if (!entry.parents.includes(r.fromPersonId)) entry.parents.push(r.fromPersonId);
    if (!entry.children.includes(r.toPersonId)) entry.children.push(r.toPersonId);
    families.set(key, entry);
  }
  // تجميع الأبناء الذين يتشاركون نفس مجموعة الوالدين
  const groups = new Map<string, {parents: string[]; children: string[]}>();
  for (const entry of families.values()) {
    const key = [...entry.parents].sort().join('|');
    const group = groups.get(key) ?? {parents: entry.parents, children: []};
    for (const child of entry.children) if (!group.children.includes(child)) group.children.push(child);
    groups.set(key, group);
  }

  let busIndex = 0;
  for (const group of groups.values()) {
    const parentNodes = group.parents.map((id) => nodeById.get(id)!).filter(Boolean);
    const childNodes = group.children
      .map((id) => nodeById.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (!parentNodes.length || !childNodes.length) continue;

    const anchorX = parentNodes.reduce((sum, n) => sum + n.x + NODE_W / 2, 0) / parentNodes.length;
    const parentBottom = Math.max(...parentNodes.map((n) => n.y + NODE_H));
    const childTop = Math.min(...childNodes.map((n) => n.y));
    const busY = parentBottom + (childTop - parentBottom) / 2;

    const xs = [anchorX, ...childNodes.map((n) => n.x + NODE_W / 2)];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    let d = `M ${anchorX} ${parentBottom} L ${anchorX} ${busY}`;
    d += ` M ${minX} ${busY} L ${maxX} ${busY}`;
    for (const child of childNodes) {
      const cx = child.x + NODE_W / 2;
      d += ` M ${cx} ${busY} L ${cx} ${childTop}`;
    }
    edges.push({id: `parent-${busIndex++}`, d, kind: 'parent'});
  }

  const width = Math.max(...nodes.map((n) => n.x + NODE_W)) + PAD_X;
  const height = Math.max(...nodes.map((n) => n.y + NODE_H)) + PAD_Y;

  const rows: LayoutRow[] = levels
    .sort((a, b) => a - b)
    .map((l) => ({
      level: l,
      y: l * (NODE_H + GAP_Y) + PAD_Y,
      label: generationLabel(l - rootLevel),
    }));

  return {nodes, edges, unions, rows, width, height};
}
