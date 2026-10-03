// L0 -- pure data. The Successes list.
//
// `desc` is the requirement, and it is shown whether or not the success is unlocked -- a locked
// card reads "???" as its title and tells you what to do. `reward` is an object rather than a bare
// number so later kinds (a Pokemon, a new boost) can sit beside `gold` without changing the save
// format or the cards. Only `gold` is paid out today.
//
// Order here is the order on screen.

export const SUCCESSES = [
  {
    id: 'close_call', title: 'Close Call',
    desc: 'Get down to exactly 1 HP.',
    reward: { gold: 500 },
  },
  {
    id: 'maxed_out', title: 'Maxed Out',
    desc: 'Reach level 100.',
    reward: { gold: 900 },
  },
  {
    id: 'kaboom', title: 'Kaboom',
    desc: 'Kill 30 or more enemies with a single ability use.',
    reward: { gold: 600 },
  },
  {
    id: 'punching_the_screen', title: 'Punching the Screen',
    desc: 'Die between 19:30 and 20:00.',
    reward: { gold: 10 },
  },
  {
    id: 'legendary', title: 'Legendary',
    desc: 'Defeat all nine legendary Pokemon of the secret floors.',
    reward: { gold: 3000 },
    // Counted across runs, so the card shows how far along it is: `save` names the field of the
    // save that holds the tally and `of` is the target.
    progress: { save: 'legends', of: 9 },
  },
];

export const SUCCESS_BY_ID = Object.fromEntries(SUCCESSES.map((s) => [s.id, s]));

/** How a reward reads on a card. */
export function rewardLabel(reward) {
  if (reward && reward.gold) return `${reward.gold} G`;
  return '';
}
