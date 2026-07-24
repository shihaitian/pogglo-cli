// 游戏分类目录（CrazyGames 官方侧栏分类，2026-07-24 用户拍板扒取）+ 支持平台枚举。
// 三仓单一来源：本表须与 ../pogglo/api/src/index.mjs 的 CATEGORIES / PLATFORMS
// 及 ../pogglo/site/src/data/categories.mjs 完全一致（改一处三处同改）。
export const CATEGORIES = [
  { id: 'action', label: 'Action' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'board', label: 'Board' },
  { id: 'card', label: 'Card' },
  { id: 'clicker', label: 'Clicker' },
  { id: 'driving', label: 'Driving' },
  { id: 'io', label: '.io' },
  { id: 'puzzle', label: 'Puzzle' },
  { id: 'shooting', label: 'Shooting' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'sports', label: 'Sports' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'thinky', label: 'Thinky' },
  { id: 'trivia', label: 'Trivia' },
  { id: 'word', label: 'Word' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const normCategory = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return CATEGORY_IDS.includes(s) ? s : null;
};

// 支持平台/输入方式：keyboard=键鼠或手柄（控件），touch=触摸屏，both=两者都支持。
export const PLATFORMS = ['keyboard', 'touch', 'both'];
export const normPlatform = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return PLATFORMS.includes(s) ? s : null;
};
