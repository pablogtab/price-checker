import Decimal from "decimal.js";
import { kitSellingPrice } from "./bundles";
import { orderAvailability } from "./price-list-orders";
import { cleanText, flavorLabel } from "./price-list-format";

/** Bounded minimum-cost flow: group demand shares product capacity across all rows.
 * Bellman-Ford residual paths support negative costs for the maximum-price pass.
 * Augmentations move whole capacities, never enumerate flavor combinations. */
function flow(
  groups: any[],
  products: any[],
  capacities: number[],
  sign = 1,
  supply?: { own: number[]; choices: Map<number, any> },
) {
  const resources = [
    ...new Map(
      [...(supply?.choices.values() || [])].map((c) => [c.item_id, c]),
    ).values(),
  ];
  const n = groups.length + products.length + resources.length + 2,
    sink = n - 1,
    graph: any[][] = Array.from({ length: n }, () => []);
  const edge = (a: number, b: number, cap: number, cost: Decimal) => {
    const f = { to: b, cap, cost, rev: graph[b].length },
      r = { to: a, cap: 0, cost: cost.neg(), rev: graph[a].length };
    graph[a].push(f);
    graph[b].push(r);
  };
  let needed = 0;
  groups.forEach((g, i) => {
    needed += g.quantity;
    edge(0, i + 1, g.quantity, new Decimal(0));
    products.forEach((p, j) => {
      if (
        g.variant_group
          ? p.variant_group === g.variant_group
          : p.id === g.product_id
      )
        edge(
          i + 1,
          groups.length + j + 1,
          g.quantity,
          new Decimal(p.selling_price).mul(sign),
        );
    });
  });
  products.forEach((_, j) => {
    const node = groups.length + j + 1;
    if (!supply) {
      edge(node, sink, capacities[j], new Decimal(0));
      return;
    }
    edge(node, sink, Math.min(capacities[j], supply.own[j]), new Decimal(0));
    const choice = supply.choices.get(j);
    if (choice) {
      const idx = resources.findIndex((r) => r.item_id === choice.item_id);
      edge(
        node,
        groups.length + products.length + idx + 1,
        Math.max(0, capacities[j] - supply.own[j]),
        new Decimal(0),
      );
    }
  });
  resources.forEach((r, i) =>
    edge(
      groups.length + products.length + i + 1,
      sink,
      r.capacity,
      new Decimal(0),
    ),
  );
  let sent = 0,
    total = new Decimal(0);
  while (sent < needed) {
    const dist: (Decimal | null)[] = Array(n).fill(null),
      prev: any[] = Array(n);
    dist[0] = new Decimal(0);
    for (let k = 0; k < n - 1; k++) {
      let changed = false;
      graph.forEach((edges, a) => {
        if (dist[a] === null) return;
        edges.forEach((e, idx) => {
          const d = dist[a]!.plus(e.cost);
          if (e.cap > 0 && (dist[e.to] === null || d.lt(dist[e.to]!))) {
            dist[e.to] = d;
            prev[e.to] = [a, idx];
            changed = true;
          }
        });
      });
      if (!changed) break;
    }
    if (dist[sink] === null) return null;
    let amount = needed - sent;
    for (let v = sink; v !== 0;) {
      const [a, i] = prev[v];
      amount = Math.min(amount, graph[a][i].cap);
      v = a;
    }
    for (let v = sink; v !== 0;) {
      const [a, i] = prev[v],
        e = graph[a][i];
      e.cap -= amount;
      graph[v][e.rev].cap += amount;
      v = a;
    }
    sent += amount;
    total = total.plus(dist[sink]!.mul(amount));
  }
  return total.mul(sign);
}
/** Only shared offers with different pack conversions need bounded allocation of
 * physical offer copies. Ordinary flavor choices remain a polynomial flow. */
function allocateSelected(
  groups: any[],
  products: any[],
  capacities: number[],
  sign = 1,
  supply?: { own: number[]; choices: Map<number, any> },
): Decimal | null {
  if (!supply) return flow(groups, products, capacities, sign);
  const byItem = new Map<number, number[]>();
  for (const [j, c] of supply.choices) {
    if (!byItem.has(c.item_id)) byItem.set(c.item_id, []);
    byItem.get(c.item_id)!.push(j);
  }
  const weighted = [...byItem.values()].filter(
    (ids) => new Set(ids.map((j) => supply.choices.get(j).units)).size > 1,
  );
  if (!weighted.length) return flow(groups, products, capacities, sign, supply);
  let best: Decimal | null = null;
  const visit = (index: number, choices: Map<number, any>, caps: number[]) => {
    if (index === weighted.length) {
      const v = flow(groups, products, caps, sign, {
        own: supply.own,
        choices,
      });
      if (v !== null && (best === null || v.mul(sign).lt(best.mul(sign))))
        best = v;
      return;
    }
    const ids = weighted[index],
      stock = Math.floor(supply.choices.get(ids[0]).stock);
    const distribute = (
      at: number,
      left: number,
      next: Map<number, any>,
      limits: number[],
    ) => {
      if (at === ids.length) {
        visit(index + 1, next, limits);
        return;
      }
      const j = ids[at],
        choice = supply.choices.get(j),
        needed = Math.max(0, caps[j] - supply.own[j]),
        max = Math.min(left, Math.ceil(needed / choice.units));
      for (
        let copies = at === ids.length - 1 ? max : 0;
        copies <= max;
        copies++
      ) {
        const c = new Map(next),
          l = [...limits];
        c.set(j, {
          ...choice,
          item_id: -(j + 1),
          capacity: copies * choice.units,
        });
        l[j] = Math.min(caps[j], supply.own[j] + copies * choice.units);
        distribute(at + 1, left - copies, c, l);
      }
    };
    distribute(0, stock, choices, caps);
  };
  visit(0, supply.choices, capacities);
  return best;
}
function allocate(
  groups: any[],
  products: any[],
  capacities: number[],
  sign = 1,
  supply?: { own: number[]; choices: Map<number, any[]> },
): Decimal | null {
  if (!supply) return allocateSelected(groups, products, capacities, sign);
  const entries = [...supply.choices];
  let best: Decimal | null = null;
  const visit = (at: number, choices: Map<number, any>) => {
    if (at === entries.length) {
      const caps = capacities.map((cap, j) =>
        Math.min(cap, supply.own[j] + (choices.get(j)?.capacity || 0)),
      );
      const value = allocateSelected(groups, products, caps, sign, {
        own: supply.own,
        choices,
      });
      if (
        value !== null &&
        (best === null || value.mul(sign).lt(best.mul(sign)))
      )
        best = value;
      return;
    }
    const [j, options] = entries[at];
    for (const option of options) {
      choices.set(j, option);
      visit(at + 1, choices);
    }
  };
  visit(0, new Map());
  return best;
}
export function evaluatePromo(
  promo: any,
  rows: any[],
  catalog: any[],
  offers: any[],
  now: Date,
) {
  const groups = rows.filter((c) => c.kit_id === promo.id),
    demand = groups.reduce((n, c) => n + c.quantity, 0);
  const candidates = catalog.filter(
    (p) =>
      p.kind !== "kit" &&
      !p.archived &&
      new Decimal(p.selling_price || 0).gt(0) &&
      groups.some((g) =>
        g.variant_group
          ? p.variant_group === g.variant_group
          : p.id === g.product_id,
      ),
  );
  if (!groups.length)
    return { omission_reason: "Promo sin componentes", providers: [] };
  const own = candidates.map((p) =>
    Math.min(demand, Math.max(0, Math.floor(Number(p.own_stock) || 0))),
  );
  const providers: any[] = [];
  const supplyProviders = new Map<number, any[]>();
  const choices = new Map<number, any>();
  const total = candidates.map((p, j) => {
    if (!promo.price_list_order_allowed || !p.price_list_order_allowed)
      return own[j];
    const eligible = offers.filter(
      (o) =>
        o.product_id === p.id &&
        o.available &&
        o.last_success_at &&
        o.stock !== null &&
        Number(o.stock) > 0 &&
        Number(o.units) > 0,
    );
    const unique = eligible;
    const options = unique
      .map((o) => ({
        offer: o,
        capacity: Math.floor(new Decimal(o.stock).mul(o.units).toNumber()),
        state: orderAvailability({ ...p, own_stock: 0 }, [o], now),
      }))
      .filter((o) => o.capacity > 0);
    if (!options.length) return own[j];
    supplyProviders.set(
      j,
      options.flatMap((o) => o.state.providers),
    );
    choices.set(
      j,
      options.map((choice) => ({
        item_id: choice.offer.item_id,
        capacity: choice.capacity,
        units: Number(choice.offer.units),
        stock: Number(choice.offer.stock),
      })),
    );
    return Math.min(
      demand,
      own[j] + Math.max(...options.map((o) => o.capacity)),
    );
  });
  const supply = { own, choices };
  const low = allocate(groups, candidates, total, 1, supply),
    high = allocate(groups, candidates, total, -1, supply);
  if (low === null || high === null)
    return {
      omission_reason:
        "Componentes insuficientes para una combinación completa",
      providers: [],
    };
  const price = (base: Decimal) =>
    promo.kit_pricing_mode === "discount"
      ? kitSellingPrice(
          [{ quantity: 1, selling_price: base.toString() }],
          promo.kit_discount_percent || "0",
        ).selling_price
      : promo.selling_price;
  if (!new Decimal(price(low)).eq(price(high)))
    return {
      omission_reason: "Promo con precio variable según sabores",
      providers: [],
    };
  const available = allocate(groups, candidates, own) !== null;
  // Only advertise order capacity when a feasible combination actually consumes a shortage.
  let order = false;
  candidates.forEach((_, j) => {
    if (
      total[j] > own[j] &&
      (allocate(
        groups,
        candidates.map((p, k) => ({
          ...p,
          selling_price: k === j ? "1" : "0",
        })),
        total,
        -1,
        supply,
      )?.gt(own[j]) ??
        false)
    ) {
      order = true;
      providers.push(...(supplyProviders.get(j) || []));
    }
  });
  const describe = (caps: number[]) =>
    groups
      .map(
        (g, i) =>
          `${g.quantity} × ${cleanText(g.variant_group || catalog.find((p) => p.id === g.product_id)?.name || "Componente")}: ` +
          candidates
            .map((p, j) => ({ p, j }))
            .filter(({ p, j }) => {
              if (
                caps[j] < 1 ||
                !(g.variant_group
                  ? p.variant_group === g.variant_group
                  : p.id === g.product_id)
              )
                return false;
              const reduced = groups.map((x, k) => ({
                ...x,
                quantity: x.quantity - (k === i ? 1 : 0),
              }));
              reduced.push({
                product_id: p.id,
                quantity: 1,
                variant_group: null,
              });
              return (
                allocate(
                  reduced,
                  candidates,
                  caps,
                  1,
                  caps === own ? undefined : supply,
                ) !== null
              );
            })
            .map(({ p, j }) => {
              const name = flavorLabel(p.name, g.variant_group);
              const maximum = groups
                .filter((row) =>
                  row.variant_group
                    ? p.variant_group === row.variant_group
                    : p.id === row.product_id,
                )
                .reduce((sum, row) => sum + row.quantity, 0);
              return (
                name +
                (caps[j] < maximum
                  ? ` (máximo ${caps[j]} en toda la promo)`
                  : "")
              );
            })
            .join("; "),
      )
      .join("\n");
  const shared = new Map<number, number[]>();
  for (const [j, options] of choices)
    for (const c of options) {
      if (!shared.has(c.item_id)) shared.set(c.item_id, []);
      shared.get(c.item_id)!.push(j);
    }
  const sharedRules = [...shared.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([itemId, ids]) => {
      const choice = (j: number) =>
        choices.get(j).find((c: any) => c.item_id === itemId);
      const count = Math.min(
        Math.floor(choice(ids[0]).stock),
        ids.reduce(
          (n, j) =>
            n + Math.ceil(Math.max(0, total[j] - own[j]) / choice(j).units),
          0,
        ),
      );
      return (
        `Encargo compartido: hasta ${count} packs para esta promo. Cada pack aporta ` +
        ids
          .map((j) => `${choice(j).units} × ${cleanText(candidates[j].name)}`)
          .join(" o ") +
        ", sin combinar ambos aportes del mismo pack. Primero se usan las unidades disponibles indicadas arriba."
      );
    });
  const constraints = [
    available ? "Disponible — " + describe(own) : "",
    order
      ? "Por encargo — " +
        describe(total) +
        (sharedRules.length ? "\n" + sharedRules.join("\n") : "") +
        "\nRequiere al menos un componente por encargo."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    selling_price: price(low),
    availability: order ? "order" : "available",
    own_stock: 1,
    providers: order ? providers : [],
    promo_details:
      constraints +
      "\nLos límites por sabor se comparten entre todos los componentes de una promo.",
  };
}
