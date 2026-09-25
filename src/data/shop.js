// L0 -- pure data. The Kecleon Shop's stock.
//
// Everything here is permanent and applies to every future run. The gold comes from runs you
// have already finished, win or lose, so a bad run still buys something.
//
// `mods` is the same shape the level-up cards use in upgrades.js, so addMods() consumes it
// unchanged -- one rank of Might here and one Might card in a run are the same modifier. The
// values are deliberately smaller than the in-run cards: this is a head start, not a shortcut
// past the run itself.
//
// Three rows are not stats at all. REROLLS / BANISHES / SKIPS set the level-up screen's starting
// charges, which main.js hardcoded to one until this table existed. They carry `start` instead
// of `mods` and are read directly by startRun.

/** Rank n (1-based) costs base * n^1.6, rounded to something that reads as a price. */
function priceCurve(base, ranks) {
  const out = [];
  for (let i = 1; i <= ranks; i++) out.push(Math.round((base * Math.pow(i, 1.6)) / 10) * 10);
  return out;
}

const stat = (id, name, desc, stats, base, ranks, mods) => ({
  id, name, desc, group: stats, ranks, costs: priceCurve(base, ranks), mods,
});

export const SHOP_ITEMS = [
  // --- offence ---
  stat('s_power', 'MIGHT', '+8% attack power', 'OFFENCE', 120, 5,
    [{ stat: 'power', op: 'inc', value: 0.08 }]),
  stat('s_haste', 'HASTE', '+6% attack speed', 'OFFENCE', 120, 5,
    [{ stat: 'attackSpeed', op: 'inc', value: 0.06 }]),
  stat('s_area', 'REACH', '+7% area of effect', 'OFFENCE', 100, 5,
    [{ stat: 'area', op: 'inc', value: 0.07 }]),
  stat('s_amount', 'MULTISHOT', '+1 projectile', 'OFFENCE', 400, 3,
    [{ stat: 'amount', op: 'flat', value: 1 }]),
  stat('s_crit', 'FOCUS', '+3% critical chance', 'OFFENCE', 110, 5,
    [{ stat: 'crit', op: 'flat', value: 0.03 }]),
  stat('s_cooldown', 'ATTUNEMENT', '-4% ability cooldown', 'OFFENCE', 150, 5,
    [{ stat: 'cooldown', op: 'inc', value: -0.04 }]),

  // --- survival ---
  stat('s_hp', 'VITALITY', '+10 max HP', 'SURVIVAL', 90, 5,
    [{ stat: 'maxHp', op: 'flat', value: 10 }]),
  stat('s_armor', 'HIDE', '+1 armour', 'SURVIVAL', 140, 5,
    [{ stat: 'armor', op: 'flat', value: 1 }]),
  stat('s_speed', 'SWIFTNESS', '+5% movement speed', 'SURVIVAL', 130, 4,
    [{ stat: 'moveSpeed', op: 'inc', value: 0.05 }]),
  stat('s_revive', 'REVIVE', 'Get up once at half health', 'SURVIVAL', 900, 2,
    [{ stat: 'revives', op: 'flat', value: 1 }]),

  // --- fortune ---
  stat('s_xp', 'SCHOLAR', '+7% experience gained', 'FORTUNE', 110, 5,
    [{ stat: 'xpGain', op: 'inc', value: 0.07 }]),
  stat('s_greed', 'GREED', '+10% gold gained', 'FORTUNE', 130, 5,
    [{ stat: 'greed', op: 'inc', value: 0.10 }]),
  stat('s_magnet', 'MAGNETISM', '+12% pickup range', 'FORTUNE', 80, 4,
    [{ stat: 'magnet', op: 'inc', value: 0.12 }]),
  stat('s_luck', 'LUCK', '+5% luck', 'FORTUNE', 160, 4,
    [{ stat: 'luck', op: 'flat', value: 0.05 }]),

  // --- draft charges: not stats, read by startRun ---
  { id: 'c_reroll', name: 'REROLL', desc: '+1 reroll per run', group: 'DRAFT',
    ranks: 3, costs: priceCurve(300, 3), start: 'rerolls' },
  { id: 'c_banish', name: 'BANISH', desc: '+1 banish per run', group: 'DRAFT',
    ranks: 3, costs: priceCurve(300, 3), start: 'banishes' },
  { id: 'c_skip', name: 'SKIP', desc: '+1 skip per run', group: 'DRAFT',
    ranks: 3, costs: priceCurve(200, 3), start: 'skips' },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map((s) => [s.id, s]));

/** What one more rank of `item` costs, or -1 when it is already maxed. */
export function rankCost(item, owned) {
  return owned >= item.ranks ? -1 : item.costs[owned];
}
