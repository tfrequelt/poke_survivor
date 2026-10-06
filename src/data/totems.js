// L0 -- pure data. Totems, and the blessings they grant.
//
// Two totems stand somewhere on every ordinary floor, two different kinds of the three. Stand in
// a totem's ring until it fills to wake it; the crowd comes in harder while you do. What waking
// it gets you depends on the kind:
//
//   blessing  a choice of three blessings: rare, permanent boons, each at most once a run
//   trial     a timed fight: three elites around the totem. Beat them in time for a treasure chest
//   fortune   an offering of gold, with a blessing, a bag item, double your gold back -- or a curse
//
// The sprites are the totem poles in items_2.png's "Other 2" corner (the pink one with a skull is
// not used).

export const TOTEM_KINDS = {
  blessing: { name: 'Blessing Totem', sprite: 'totem_blessing', color: '#7fe08a',
    hint: 'STAND IN ITS RING TO RECEIVE A BLESSING' },
  trial: { name: 'Trial Totem', sprite: 'totem_trial', color: '#ff8a5a',
    hint: 'STAND IN ITS RING TO BEGIN THE TRIAL' },
  fortune: { name: 'Fortune Totem', sprite: 'totem_fortune', color: '#ffd166',
    hint: 'STAND IN ITS RING, THEN MAKE AN OFFERING' },
};
export const TOTEM_KEYS = Object.keys(TOTEM_KINDS);

/** Seconds standing in the ring to wake a totem. The ring drains at half this rate when you step out. */
export const WAKE_SECS = 4;
export const RING_R = 44;
/** How long a trial lasts, and how much gold one offering at a Fortune totem costs at least. */
export const TRIAL_SECS = 30;
export const FORTUNE_MIN = 50;
export const FORTUNE_USES = 3;

/**
 * Blessings: what a Blessing totem offers, and what a lucky offering at a Fortune totem grants.
 * Bigger than a level-up card, and each one only once a run.
 */
export const BLESSINGS = [
  { id: 'twin_soul', name: 'Twin Soul', desc: '+1 projectile on every weapon that fires them.',
    mods: [{ stat: 'amount', op: 'flat', value: 1 }] },
  { id: 'giant', name: 'Giant Growth', desc: '+25% area of effect.',
    mods: [{ stat: 'area', op: 'inc', value: 0.25 }] },
  { id: 'eagle_eye', name: 'Eagle Eye', desc: '+12% critical chance and +25% critical damage.',
    mods: [{ stat: 'crit', op: 'flat', value: 0.12 }, { stat: 'critMult', op: 'flat', value: 0.25 }] },
  { id: 'swift_wind', name: 'Swift Wind', desc: '+15% attack speed and +10% movement speed.',
    mods: [{ stat: 'attackSpeed', op: 'inc', value: 0.15 }, { stat: 'moveSpeed', op: 'inc', value: 0.1 }] },
  { id: 'iron_skin', name: 'Iron Skin', desc: '+4 armour: every hit you take is 4 smaller.',
    mods: [{ stat: 'armor', op: 'flat', value: 4 }] },
  { id: 'vitality', name: 'Vitality', desc: '+40 max health, and all of it restored now.',
    mods: [{ stat: 'maxHp', op: 'flat', value: 40 }], heal: 9999 },
  { id: 'regrowth', name: 'Regrowth', desc: 'Regenerate 1.5 health a second.',
    mods: [{ stat: 'regen', op: 'flat', value: 1.5 }] },
  { id: 'scholar', name: 'Scholar', desc: '+30% experience from everything.',
    mods: [{ stat: 'xpGain', op: 'inc', value: 0.3 }] },
  { id: 'magnetism', name: 'Magnetism', desc: 'Pick up experience and gold from twice as far.',
    mods: [{ stat: 'magnet', op: 'inc', value: 1 }] },
  { id: 'focus', name: 'Deep Focus', desc: '-20% ability cooldown.',
    mods: [{ stat: 'cooldown', op: 'inc', value: -0.2 }] },
  { id: 'might', name: 'Might', desc: '+20% damage from everything you do.',
    mods: [{ stat: 'power', op: 'inc', value: 0.2 }] },
  { id: 'piercing', name: 'Piercing Gaze', desc: 'Shots pierce two more enemies.',
    mods: [{ stat: 'pierce', op: 'flat', value: 2 }] },
  { id: 'lingering', name: 'Lingering Spirit', desc: '+30% duration on everything that lasts.',
    mods: [{ stat: 'duration', op: 'inc', value: 0.3 }] },
  { id: 'gilded', name: 'Gilded Touch', desc: '+40% gold from everything.',
    mods: [{ stat: 'greed', op: 'inc', value: 0.4 }] },
  { id: 'longshot', name: 'Longshot', desc: '+30% weapon range and +20% projectile speed.',
    mods: [{ stat: 'range', op: 'inc', value: 0.3 }, { stat: 'projSpeed', op: 'inc', value: 0.2 }] },
  { id: 'fortunate', name: 'Fortunate', desc: '+15% luck.',
    mods: [{ stat: 'luck', op: 'flat', value: 0.15 }] },
];
export const BLESSING_BY_ID = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));

/** A Fortune totem's curse: a minute of being slower and hurting more. */
export const CURSE = {
  name: 'CURSED', secs: 60,
  mods: [{ stat: 'moveSpeed', op: 'inc', value: -0.12 }, { stat: 'contactMult', op: 'inc', value: 0.3 }],
};
