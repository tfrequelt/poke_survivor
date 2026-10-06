// L0 -- pure data. The Explorer's Bag: single-use items.
//
// Picked up off the ground into one of the bag's slots and used when YOU choose, with the slot's
// key (1, 2, 3 -- and 4 with the perk). The one exception is the Reviver Seed, which waits in the
// bag and spends itself the moment you would faint.
//
// `weight` is how often each turns up when the game rolls "a bag item". `kind` is its pickup kind
// in pickups.js, and with it its sprite (a crop of items_2.png in the manifest).

export const BAG_ITEMS = [
  { id: 'oran_berry', kind: 'bag_oran', name: 'Oran Berry', weight: 16, color: '#7ac8ff',
    desc: 'Restores half of your health.' },
  { id: 'sleep_seed', kind: 'bag_sleep', name: 'Sleep Seed', weight: 12, color: '#9a9aff',
    desc: 'Everything within 240px falls fast asleep for 6s: it stays put and cannot bite.' },
  { id: 'gravelerock', kind: 'bag_gravelerock', name: 'Gravelerock', weight: 12, color: '#c8c0ad',
    desc: 'Hurls sixteen rocks out in every direction.' },
  { id: 'warp_seed', kind: 'bag_warp', name: 'Warp Seed', weight: 10, color: '#7af0e8',
    desc: 'Warps you somewhere safe, well away from here.' },
  { id: 'totter_seed', kind: 'bag_totter', name: 'Totter Seed', weight: 10, color: '#ff9ad8',
    desc: 'Everything on screen totters about, confused, for 6s.' },
  { id: 'petrify_orb', kind: 'bag_petrify', name: 'Petrify Orb', weight: 8, color: '#b0b0bc',
    desc: 'Everything on screen turns to stone for 5s and takes 50% more damage.' },
  { id: 'all_power_orb', kind: 'bag_allpower', name: 'All-Power Orb', weight: 8, color: '#ff8a5a',
    desc: '20s of +40% power, +30% attack speed and +15% speed.' },
  { id: 'max_elixir', kind: 'bag_maxelixir', name: 'Max Elixir', weight: 8, color: '#ffd166',
    desc: 'Both abilities ready at once, then 15s of -30% ability cooldown.' },
  { id: 'luminous_orb', kind: 'bag_luminous', name: 'Luminous Orb', weight: 7, color: '#ffe14a',
    desc: 'Lights up the floor: every trap shows, and arrows point to the stairs, portal and totems.' },
  { id: 'joy_seed', kind: 'bag_joy', name: 'Joy Seed', weight: 5, color: '#7fe08a',
    desc: 'A level up, on the spot.' },
  { id: 'reviver_seed', kind: 'bag_reviver', name: 'Reviver Seed', weight: 4, color: '#ffd166', auto: true,
    desc: 'Works on its own: when you would faint, you are back up at half health instead.' },
  { id: 'escape_orb', kind: 'bag_escape', name: 'Escape Orb', weight: 4, color: '#7fe08a',
    desc: 'Takes you to the next floor, right now, from wherever you are.' },
];

export const BAG_BY_ID = Object.fromEntries(BAG_ITEMS.map((b) => [b.id, b]));
export const BAG_BY_KIND = Object.fromEntries(BAG_ITEMS.map((b) => [b.kind, b]));

/** Slots in the bag without the perk. */
export const BAG_SLOTS = 3;
