// L0 -- pure data. The Successes list, the Explorer Ranks they add up to, and the perks some pay.
//
// `desc` is the requirement, and it is shown whether or not the success is unlocked -- a locked
// card reads "???" as its title and tells you what to do. `reward` carries gold, and some carry
// a `perk` too: a permanent change to every run after it is claimed (see PERKS). `tier` is what a
// claimed success is worth toward your Explorer Rank.
//
// `progress` puts a bar on the card for something counted across runs:
//   { save: '<field>', of }   how many keys a save field holds (the legendaries beaten, ribbons)
//   { count: '<stat>', of }   a number in save.stats
//   { partners: true, of }    how many partners have won at least one ribbon
//
// Order here is the order on screen.

export const TIERS = {
  bronze: { points: 1, color: '#c88a4a', label: 'BRONZE' },
  silver: { points: 2, color: '#c8d0e0', label: 'SILVER' },
  gold: { points: 4, color: '#ffd166', label: 'GOLD' },
  platinum: { points: 8, color: '#a0f0ff', label: 'PLATINUM' },
};

export const SUCCESSES = [
  { id: 'close_call', title: 'Close Call', tier: 'silver',
    desc: 'Get down to exactly 1 HP.', reward: { gold: 500 } },
  { id: 'maxed_out', title: 'Maxed Out', tier: 'gold',
    desc: 'Reach level 100.', reward: { gold: 900 } },
  { id: 'kaboom', title: 'Kaboom', tier: 'silver',
    desc: 'Kill 30 or more enemies with a single ability use.', reward: { gold: 600 } },
  { id: 'punching_the_screen', title: 'Punching the Screen', tier: 'bronze',
    desc: 'Die between 19:30 and 20:00.', reward: { gold: 10 } },
  { id: 'legendary', title: 'Legendary', tier: 'platinum',
    desc: 'Defeat all nine legendary Pokemon of the secret floors.', reward: { gold: 3000 },
    progress: { save: 'legends', of: 9 } },

  // --- Expedition Records ------------------------------------------------------------------
  { id: 'lone_wolf', title: 'Lone Wolf', tier: 'gold',
    desc: 'Win a run holding only one weapon.', reward: { gold: 1200 } },
  { id: 'untouchable', title: 'Untouchable', tier: 'silver',
    desc: 'Take the stairs without being hit once on that floor.', reward: { gold: 600 } },
  { id: 'deep_diver', title: 'Deep Diver', tier: 'gold',
    desc: 'Reach the fourth floor of every stage.', reward: { gold: 800, perk: 'start_oran' },
    progress: { save: 'deep', of: 3 } },
  { id: 'prodigy', title: 'Prodigy', tier: 'gold',
    desc: 'Defeat a legendary while at level 30 or lower.', reward: { gold: 1000 } },
  { id: 'super_effective', title: "It's Super Effective!", tier: 'bronze',
    desc: 'Land 2,000 super effective hits in a single run.', reward: { gold: 400 } },
  { id: 'overcharged', title: 'Overcharged', tier: 'silver',
    desc: 'Have four overloaded weapons at once.', reward: { gold: 700 } },
  { id: 'pack_rat', title: 'Pack Rat', tier: 'silver',
    desc: 'Use 50 items from your bag.', reward: { gold: 500, perk: 'bag4' },
    progress: { count: 'bagUsed', of: 50 } },
  { id: 'trap_dancer', title: 'Trap Dancer', tier: 'silver',
    desc: 'Spring 15 traps yourself in a run, and still win it.', reward: { gold: 600 } },
  { id: 'shrine_keeper', title: 'Shrine Keeper', tier: 'silver',
    desc: 'Wake all three kinds of totem in a single run.', reward: { gold: 500, perk: 'totem_fast' } },
  { id: 'trial_champion', title: 'Trial Champion', tier: 'gold',
    desc: 'Win ten totem trials.', reward: { gold: 900, perk: 'chest_plus' },
    progress: { count: 'trialsWon', of: 10 } },
  { id: 'high_roller', title: 'High Roller', tier: 'silver',
    desc: 'Make three lucky offerings at Fortune totems in one run, without a single curse.', reward: { gold: 600 } },
  { id: 'speed_explorer', title: 'Speed Explorer', tier: 'gold',
    desc: 'Reach the fourth floor before 16:00.', reward: { gold: 900 } },
  { id: 'relic_hunter', title: 'Relic Hunter', tier: 'gold',
    desc: 'Carry three relics in a single run.', reward: { gold: 1000 } },
  { id: 'partner_ribbons', title: 'Ribbon Collector', tier: 'gold',
    desc: 'Earn a ribbon with every partner: win with each of them, anywhere.', reward: { gold: 1500, perk: 'start_reviver' },
    progress: { partners: true, of: 6 } },
  { id: 'grand_champion', title: 'Grand Champion', tier: 'platinum',
    desc: 'Earn all eighteen ribbons: every partner, on every stage.', reward: { gold: 5000 },
    progress: { save: 'ribbons', of: 18 } },
  { id: 'iron_stomach', title: 'Iron Stomach', tier: 'gold',
    desc: 'Win a run without eating a single berry.', reward: { gold: 1000 } },
  { id: 'endless_hero', title: 'Endless Hero', tier: 'platinum',
    desc: 'Defeat ten bosses in one endless run.', reward: { gold: 2000 } },
  { id: 'type_expert', title: 'Type Expert', tier: 'silver',
    desc: 'Knock out 5,000 enemies with super effective hits.', reward: { gold: 800, perk: 'reroll1' },
    progress: { count: 'superKOs', of: 5000 } },
  { id: 'one_punch', title: 'One Punch', tier: 'bronze',
    desc: 'Defeat an elite with a single hit.', reward: { gold: 400 } },
  { id: 'full_house', title: 'Full House', tier: 'gold',
    desc: 'At once: three items in your bag, four overloaded weapons and six held items.', reward: { gold: 1000 } },
  { id: 'conqueror', title: 'Conqueror', tier: 'gold',
    desc: 'Win a run on every stage.', reward: { gold: 1500 },
    progress: { save: 'won', of: 3 } },
  { id: 'wonder_walker', title: 'Wonder Walker', tier: 'bronze',
    desc: 'Step on 20 Wonder Tiles.', reward: { gold: 400 },
    progress: { count: 'wonderTiles', of: 20 } },
];

export const SUCCESS_BY_ID = Object.fromEntries(SUCCESSES.map((s) => [s.id, s]));

/** The counters save.stats may hold. Anything else is dropped on load. */
export const STAT_COUNTERS = ['bagUsed', 'trialsWon', 'superKOs', 'wonderTiles'];

/** Permanent perks a claimed success can pay, applied at the start of every run. */
export const PERKS = {
  start_oran: { name: 'Packed Lunch', desc: 'Every run starts with an Oran Berry in the bag.' },
  start_reviver: { name: 'Second Wind', desc: 'Every run starts with a Reviver Seed in the bag.' },
  bag4: { name: 'Bigger Bag', desc: 'A fourth bag slot, on key 4.' },
  totem_fast: { name: 'Shrine Friend', desc: 'Totems wake 30% faster.' },
  reroll1: { name: 'Second Look', desc: 'One more card reroll every run.' },
  chest_plus: { name: 'Treasure Sense', desc: 'Treasure chests always hold at least three upgrades.' },
};

/**
 * The Explorer Ranks, from the rank badges of items_2.png. `at` is the points needed, the points
 * being the claimed successes' tiers summed.
 */
export const RANKS = [
  { name: 'NORMAL', at: 0 }, { name: 'BRONZE', at: 4 }, { name: 'SILVER', at: 10 },
  { name: 'GOLD', at: 18 }, { name: 'DIAMOND', at: 28 }, { name: 'SUPER', at: 40 },
  { name: 'ULTRA', at: 54 }, { name: 'HYPER', at: 70 }, { name: 'MASTER', at: 86 },
];

/** How a reward reads on a card. */
export function rewardLabel(reward) {
  if (!reward) return '';
  const gold = reward.gold ? `${reward.gold} G` : '';
  if (reward.perk && PERKS[reward.perk]) return gold ? `${gold} + PERK` : 'PERK';
  return gold;
}
