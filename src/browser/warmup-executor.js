const { getActiveBrowsers } = require('./manager');

// ─── 14-Day Warm-up Plan ─────────────────────────────────────────
// Gradual increase in daily actions to simulate organic Facebook growth
const WARMUP_PLAN = {
  1:  { likes: 3,  friends: 1, posts: 0, groups: 0 },
  2:  { likes: 5,  friends: 2, posts: 0, groups: 0 },
  3:  { likes: 8,  friends: 3, posts: 1, groups: 1 },
  4:  { likes: 10, friends: 4, posts: 1, groups: 1 },
  5:  { likes: 12, friends: 5, posts: 1, groups: 1 },
  6:  { likes: 15, friends: 6, posts: 1, groups: 1 },
  7:  { likes: 18, friends: 8, posts: 2, groups: 2 },
  8:  { likes: 20, friends: 10, posts: 2, groups: 2 },
  9:  { likes: 22, friends: 12, posts: 2, groups: 2 },
  10: { likes: 25, friends: 14, posts: 3, groups: 2 },
  11: { likes: 28, friends: 16, posts: 3, groups: 3 },
  12: { likes: 30, friends: 18, posts: 3, groups: 3 },
  13: { likes: 33, friends: 20, posts: 3, groups: 3 },
  14: { likes: 35, friends: 22, posts: 4, groups: 3 },
};

const processingProfiles = new Set();

let intervalRef = null;
let dbGetter = null;
let eventCallback = null;

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function emitWarmup(profileId, event, data) {
  if (eventCallback) {
    eventCallback(profileId, event, { ...data, source: 'warmup-auto' });
  }
}

// ─── Helper: get page safely ─────────────────────────────────────

function getPage(profileId) {
  const browsers = getActiveBrowsers();
  const entry = browsers.get(profileId);
  if (!entry) return null;
  const pages = entry.context.pages();
  return pages[0] || null;
}

// ─── Helper: wait until page is ready (loaded + logged in) ───────

async function waitForPageReady(profileId, maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const page = getPage(profileId);
    if (page) {
      try {
        const url = page.url();
        if (url.includes('facebook.com') && !url.includes('/login') && !url.includes('checkpoint')) {
          return page;
        }
      } catch { /* page not ready yet */ }
    }
    await sleep(2000);
  }
  return null;
}

// ─── Day Advancement & Reset ─────────────────────────────────────

function checkAndAdvanceDay(db, warmup) {
  const lastActionDate = warmup.last_action
    ? warmup.last_action.slice(0, 10)
    : null;
  const today = todayDateStr();

  if (lastActionDate && lastActionDate < today) {
    const newDay = warmup.day + 1;

    if (newDay > 14) {
      db.prepare(
        'UPDATE warmup_status SET active = 0, day = 14 WHERE profile_id = ?'
      ).run(warmup.profile_id);
      emitWarmup(warmup.profile_id, 'done', { type: 'warmup', message: 'Warm-up de 14 dias completado' });
      return null;
    }

    db.prepare(`
      UPDATE warmup_status
      SET day = ?, today_likes = 0, today_follows = 0, today_stories = 0, today_comments = 0
      WHERE profile_id = ?
    `).run(newDay, warmup.profile_id);

    return { ...warmup, day: newDay, today_likes: 0, today_follows: 0, today_stories: 0, today_comments: 0 };
  }

  return warmup;
}

// ─── Direct Warmup Actions (Facebook) ────────────────────────────

async function warmupLikeFeed(page, maxLikes) {
  let liked = 0;
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    for (let i = 0; i < maxLikes; i++) {
      try {
        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(randomDelay(1500, 3000));

        // Find Like buttons (thumbs up, not already liked)
        const likeBtn = page.locator('div[aria-label="Like"], div[aria-label="Me gusta"], div[role="button"]:has-text("Like")').first();
        if (await likeBtn.isVisible({ timeout: 3000 })) {
          await likeBtn.click();
          liked++;
          console.log(`[Warmup] Liked post ${liked}/${maxLikes}`);
          await page.waitForTimeout(randomDelay(3000, 7000));
        }
      } catch { /* skip this post */ }
    }
  } catch (err) {
    console.log(`[Warmup] likeFeed error: ${err.message}`);
  }
  return liked;
}

async function warmupBrowseFeed(page) {
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(randomDelay(2000, 4000));

    // Scroll through feed naturally
    const scrolls = randomDelay(5, 12);
    for (let i = 0; i < scrolls; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * (0.4 + Math.random() * 0.3)));
      await page.waitForTimeout(randomDelay(2000, 5000));
    }

    // Visit Watch briefly
    await page.goto('https://www.facebook.com/watch', { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(randomDelay(3000, 6000));

    console.log(`[Warmup] Feed browsing completed (${scrolls} scrolls)`);
  } catch (err) {
    console.log(`[Warmup] browseFeed error: ${err.message}`);
  }
}

async function warmupAddFriends(page, maxFriends) {
  let added = 0;
  try {
    await page.goto('https://www.facebook.com/friends/suggestions', { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    for (let i = 0; i < maxFriends; i++) {
      try {
        const addBtn = page.locator('div[aria-label="Add friend"], div[aria-label="Agregar amigo"], div[role="button"]:has-text("Add Friend"), div[role="button"]:has-text("Agregar")').first();
        if (await addBtn.isVisible({ timeout: 3000 })) {
          await addBtn.click();
          added++;
          console.log(`[Warmup] Added friend ${added}/${maxFriends}`);
          await page.waitForTimeout(randomDelay(4000, 10000));
        } else {
          await page.evaluate(() => window.scrollBy(0, 400));
          await page.waitForTimeout(randomDelay(2000, 4000));
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    console.log(`[Warmup] addFriends error: ${err.message}`);
  }
  return added;
}

// ─── Execute Warm-up for a Single Profile ────────────────────────

async function executeWarmupForProfile(db, warmup) {
  const profileId = warmup.profile_id;

  if (processingProfiles.has(profileId)) return;

  const dayPlan = WARMUP_PLAN[warmup.day];
  if (!dayPlan) return;

  // Reuse DB columns: likes=likes, follows=friends, stories=browsing, comments=groups
  const remainingLikes = Math.max(0, dayPlan.likes - (warmup.today_likes || 0));
  const remainingFriends = Math.max(0, dayPlan.friends - (warmup.today_follows || 0));

  if (remainingLikes === 0 && remainingFriends === 0) return;

  const page = await waitForPageReady(profileId);
  if (!page) {
    console.log(`[Warmup] ${profileId}: browser not ready, skipping this tick`);
    return;
  }

  processingProfiles.add(profileId);

  try {
    emitWarmup(profileId, 'start', {
      type: 'warmup',
      day: warmup.day,
      plan: dayPlan,
      remaining: { likes: remainingLikes, friends: remainingFriends },
    });

    console.log(`[Warmup] ${profileId}: Day ${warmup.day} — executing batch (likes: ${remainingLikes}, friends: ${remainingFriends})`);

    // ── Step 1: Browse feed naturally ──
    await warmupBrowseFeed(page);
    await sleep(randomDelay(5000, 15000));

    // ── Step 2: Like feed posts ──
    if (remainingLikes > 0) {
      const batchLikes = Math.min(remainingLikes, randomDelay(3, 6));
      const actualLikes = await warmupLikeFeed(page, batchLikes);
      if (actualLikes > 0) {
        db.prepare(
          "UPDATE warmup_status SET today_likes = today_likes + ?, last_action = datetime('now') WHERE profile_id = ?"
        ).run(actualLikes, profileId);
        emitWarmup(profileId, 'progress', { type: 'warmup', action: 'likes', done: actualLikes, day: warmup.day });
      }
      await sleep(randomDelay(30000, 90000));
    }

    // ── Step 3: Add friends from suggestions ──
    if (remainingFriends > 0) {
      const batchFriends = Math.min(remainingFriends, randomDelay(1, 3));
      const actualFriends = await warmupAddFriends(page, batchFriends);
      if (actualFriends > 0) {
        db.prepare(
          "UPDATE warmup_status SET today_follows = today_follows + ?, last_action = datetime('now') WHERE profile_id = ?"
        ).run(actualFriends, profileId);
        emitWarmup(profileId, 'progress', { type: 'warmup', action: 'friends', done: actualFriends, day: warmup.day });
      }
    }

    db.prepare(
      "UPDATE warmup_status SET last_action = datetime('now') WHERE profile_id = ?"
    ).run(profileId);

    console.log(`[Warmup] ${profileId}: Day ${warmup.day} batch completed`);
    emitWarmup(profileId, 'done', {
      type: 'warmup-batch',
      day: warmup.day,
      message: `Batch de warm-up dia ${warmup.day} ejecutado`,
    });

  } catch (err) {
    console.log(`[Warmup] Error general para ${profileId}:`, err.message);
    emitWarmup(profileId, 'error', { type: 'warmup', error: err.message });
  } finally {
    processingProfiles.delete(profileId);
  }
}

// ─── Main Tick ───────────────────────────────────────────────────

async function warmupTick() {
  if (!dbGetter) return;

  try {
    const db = dbGetter();
    const activeWarmups = db.prepare('SELECT * FROM warmup_status WHERE active = 1').all();

    if (activeWarmups.length === 0) return;

    console.log(`[Warmup] Tick: ${activeWarmups.length} active warmups`);

    for (const warmup of activeWarmups) {
      const updated = checkAndAdvanceDay(db, warmup);
      if (!updated) continue;

      await sleep(randomDelay(15000, 45000));

      await executeWarmupForProfile(db, updated);
    }
  } catch (err) {
    console.log('[Warmup] Error en tick general:', err.message);
  }
}

// ─── Start / Stop ────────────────────────────────────────────────

function startWarmupExecutor(getDbFn, onEventFn) {
  dbGetter = getDbFn;
  eventCallback = onEventFn || null;

  console.log('[Warmup] Executor iniciado - verificacion cada 5 minutos');
  setTimeout(() => warmupTick(), 30000);
  intervalRef = setInterval(warmupTick, 5 * 60 * 1000);
}

function stopWarmupExecutor() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
  console.log('[Warmup] Executor detenido');
}

module.exports = {
  startWarmupExecutor,
  stopWarmupExecutor,
  WARMUP_PLAN,
};
