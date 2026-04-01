const { getActiveBrowsers } = require('./manager');

let scraperCallback = null;

function onScraperEvent(callback) {
  scraperCallback = callback;
}

function emit(profileId, event, data) {
  if (scraperCallback) scraperCallback(profileId, event, data);
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPage(profileId) {
  const entry = getActiveBrowsers().get(profileId);
  if (!entry) throw new Error('Navegador no esta abierto');
  return entry.context.pages()[0] || null;
}

// Email regex — catches emails with special chars, subdomains, long TLDs
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-!#$&'*/=?^`{|}~]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,15}/g;

// Phone regex — catches international formats, parentheses, dots, dashes, spaces
const PHONE_REGEX = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,6}(?:[-.\s]?\d{1,4})?/g;

// Additional phone patterns for FB bios (WhatsApp links, labels, emojis)
const PHONE_EXTRAS = /(?:wa\.me\/|whatsapp[:\s]*|tel[:\s]*|call[:\s]*|phone[:\s]*|cel[:\s]*|celular[:\s]*|fono[:\s]*|movil[:\s]*|móvil[:\s]*|telefono[:\s]*|teléfono[:\s]*|número[:\s]*|numero[:\s]*|📞\s*|📱\s*|☎\s*|☎️\s*|📲\s*|🤙\s*)(\+?\d[\d\s\-().]{6,18})/gi;

// URL regex
const URL_REGEX = /https?:\/\/[^\s"'<>]+/g;

// System emails to filter out
const SYSTEM_EMAILS = [
  'noreply@facebookmail.com', 'security@facebookmail.com',
  'notification@facebookmail.com', 'support@facebook.com',
  'noreply@facebook.com', 'info@facebook.com',
  'noreply@meta.com', 'security@meta.com',
  'support@instagram.com', 'noreply@instagram.com',
];

// False positive patterns for phone numbers (years, postal codes, IDs)
function isPhoneFalsePositive(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return true;
  if (/^20[12]\d$/.test(digits)) return true;
  if (digits.length === 5 && digits.startsWith('0')) return true;
  if (/^(\d)\1+$/.test(digits)) return true;
  if (/^(?:012345|123456|234567|345678|456789|987654|876543|765432|654321|543210)/.test(digits)) return true;
  return false;
}

// Filter out false positive emails
function isEmailFalsePositive(email) {
  const lower = email.toLowerCase();
  if (SYSTEM_EMAILS.includes(lower)) return true;
  if (/^(test|example|email|correo|usuario|user|admin|info)@(example|test|mail)\./i.test(email)) return true;
  if (email.split('@')[0].length < 2) return true;
  return false;
}

// ─── Scrape Facebook Profile Data ──────────────────────────────────

async function scrapeProfiles(profileId, config) {
  const { usernames = [], scrapeEmails = true, scrapePhones = true, scrapeBios = true } = config;
  let cancelled = false;
  const results = [];

  try {
    const page = getPage(profileId);
    if (!page) throw new Error('No hay pagina abierta');

    console.log(`[Scraper] Starting scrape of ${usernames.length} Facebook profiles...`);
    emit(profileId, 'start', { type: 'scrape', total: usernames.length });

    for (let i = 0; i < usernames.length; i++) {
      if (cancelled) break;
      const user = usernames[i].trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?facebook\.com\//, '').replace(/\/$/, '');
      if (!user) continue;

      console.log(`[Scraper] Scraping ${user} (${i + 1}/${usernames.length})...`);
      emit(profileId, 'progress', { type: 'scrape', current: i + 1, total: usernames.length, currentUser: user });

      let retries = 0;
      const MAX_RETRIES = 1;

      while (retries <= MAX_RETRIES) {
        try {
          // Go to the user's About page for maximum info
          await page.goto(`https://www.facebook.com/${user}/about`, {
            waitUntil: 'load',
            timeout: 20000,
          });
          await page.waitForTimeout(randomDelay(2000, 4000));

          // Check if page loaded correctly
          const isError = await page.evaluate(() => {
            const body = document.body?.innerText || '';
            return body.includes("This content isn't available") ||
                   body.includes('Este contenido no esta disponible') ||
                   body.includes("This page isn't available") ||
                   body.includes('Esta pagina no esta disponible') ||
                   body.length < 100;
          }).catch(() => false);

          if (isError && retries < MAX_RETRIES) {
            retries++;
            console.log(`[Scraper] ${user}: page did not load correctly, retrying (${retries}/${MAX_RETRIES})...`);
            await page.waitForTimeout(randomDelay(3000, 5000));
            continue;
          }

          // ─── Extract profile data via page.evaluate ───
          const profileData = await page.evaluate(() => {
            const body = document.body?.innerText || '';
            const metaDesc = document.querySelector('meta[property="og:description"]')?.content || '';

            // Try to get the intro/bio section
            let bio = '';
            // FB profiles often have a "Bio" or "Intro" section
            const introSections = document.querySelectorAll('div[data-pagelet="ProfileTilesFeed_0"], div[class*="intro"], div[class*="bio"]');
            introSections.forEach(s => {
              const text = s.innerText || '';
              if (text.length > bio.length && text.length < 2000) bio = text;
            });

            // Also try the About section content
            const aboutContent = document.querySelector('div[data-pagelet*="about"], div[role="main"]');
            const aboutText = aboutContent ? aboutContent.innerText : '';

            return { bio, aboutText, metaDesc };
          }).catch(() => ({ bio: '', aboutText: '', metaDesc: '' }));

          // Full page text for deep search
          let fullPageText = '';
          try {
            fullPageText = await page.evaluate(() => document.body.innerText);
          } catch {}

          // ─── External link extraction ───
          let externalLink = '';
          try {
            externalLink = await page.evaluate(() => {
              const links = document.querySelectorAll('a[href*="l.facebook.com/l.php"], a[rel*="nofollow"]');
              for (const a of links) {
                const text = a.innerText || '';
                const href = a.href || '';
                if (href.includes('l.facebook.com') || a.rel?.includes('nofollow')) {
                  if (!href.includes('facebook.com/') || href.includes('l.facebook.com')) {
                    return text || href;
                  }
                }
              }
              // Look for website in About section
              const aboutLinks = document.querySelectorAll('a[href*="linktr.ee"], a[href*="beacons.ai"], a[href*="linkin.bio"], a[href*="bio.link"], a[href*="bit.ly"]');
              for (const a of aboutLinks) {
                return a.innerText || a.href || '';
              }
              return '';
            }).catch(() => '');
          } catch {}

          // ─── Category extraction ───
          let businessCategory = '';
          try {
            businessCategory = await page.evaluate(() => {
              // FB Pages show category under the name
              const categoryEls = document.querySelectorAll('a[href*="/pages/category/"], span[dir="auto"]');
              for (const el of categoryEls) {
                const text = (el.innerText || '').trim();
                if (text.length > 3 && text.length < 60 && !text.includes('@') && !text.match(/^\d/)) {
                  return text;
                }
              }
              return '';
            }).catch(() => '');
          } catch {}

          // ─── Email extraction via page.evaluate (mailto links) ───
          let mailtoEmails = [];
          try {
            mailtoEmails = await page.evaluate(() => {
              const emails = [];
              const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
              mailtoLinks.forEach(a => {
                const email = a.href.replace('mailto:', '').split('?')[0].trim();
                if (email && email.includes('@')) emails.push(email);
              });
              return emails;
            }).catch(() => []);
          } catch {}

          // ─── Phone extraction from tel: links ───
          let telPhones = [];
          try {
            telPhones = await page.evaluate(() => {
              const phones = [];
              const telLinks = document.querySelectorAll('a[href^="tel:"]');
              telLinks.forEach(a => {
                const num = a.href.replace('tel:', '').trim();
                if (num.replace(/\D/g, '').length >= 7) phones.push(num);
              });
              // Also check wa.me links
              const waLinks = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com/send"], a[href*="api.whatsapp"]');
              waLinks.forEach(a => {
                const href = a.href || '';
                const match = href.match(/(?:wa\.me\/|phone=)(\+?\d{7,15})/);
                if (match) phones.push(match[1]);
              });
              return phones;
            }).catch(() => []);
          } catch {}

          // ─── Friend count extraction ───
          let friendCount = '';
          try {
            friendCount = await page.evaluate(() => {
              const text = document.body.innerText || '';
              const friendMatch = text.match(/([\d,.]+[KkMm]?)\s*(?:friends|amigos)/i);
              if (friendMatch) return friendMatch[1];
              const followerMatch = text.match(/([\d,.]+[KkMm]?)\s*(?:followers|seguidores)/i);
              if (followerMatch) return followerMatch[1];
              return '';
            }).catch(() => '');
          } catch {}

          const result = {
            username: user,
            bio: (profileData.bio || '').trim(),
            externalLink: externalLink.trim(),
            businessCategory: businessCategory.trim(),
            followerCount: friendCount,
            followingCount: '',
            emails: [],
            phones: [],
          };

          // ─── Collect all emails ───
          if (scrapeEmails) {
            const allEmails = [];
            const combinedText = [profileData.bio, profileData.aboutText, profileData.metaDesc, fullPageText, externalLink].join(' ');
            const textEmails = combinedText.match(EMAIL_REGEX) || [];
            allEmails.push(...textEmails);
            allEmails.push(...mailtoEmails);

            result.emails = [...new Set(
              allEmails.map(e => e.trim().toLowerCase()).filter(e => !isEmailFalsePositive(e))
            )];
          }

          // ─── Collect all phones ───
          if (scrapePhones) {
            const allPhones = [];
            const combinedText = [profileData.bio, profileData.aboutText, fullPageText, externalLink].join(' ');
            const textPhones = combinedText.match(PHONE_REGEX) || [];
            allPhones.push(...textPhones);
            allPhones.push(...telPhones);

            // Extra patterns: emojis, labels, WhatsApp prefixes
            PHONE_EXTRAS.lastIndex = 0;
            let extraMatch;
            while ((extraMatch = PHONE_EXTRAS.exec(combinedText)) !== null) {
              const num = extraMatch[1].replace(/\s/g, '');
              allPhones.push(num);
            }

            // WhatsApp button/link
            try {
              const waBtn = page.locator('a[href*="wa.me"], a[href*="whatsapp"]').first();
              if (await waBtn.isVisible({ timeout: 1000 })) {
                const waHref = await waBtn.getAttribute('href').catch(() => '');
                if (waHref) {
                  const waMatch = waHref.match(/(?:wa\.me\/|phone=)(\+?\d{7,15})/);
                  if (waMatch) allPhones.push(waMatch[1]);
                }
              }
            } catch { /* no wa */ }

            const cleanPhones = allPhones
              .map(p => (p || '').trim())
              .filter(p => p && !isPhoneFalsePositive(p));
            result.phones = [...new Set(cleanPhones)];
          }

          results.push(result);
          console.log(`[Scraper] ${user}: ${result.emails.length} emails, ${result.phones.length} phones${result.businessCategory ? ', category: ' + result.businessCategory : ''}`);

          break; // Success — break out of retry loop

        } catch (err) {
          if (retries < MAX_RETRIES) {
            retries++;
            console.log(`[Scraper] Error scraping ${user}, retrying (${retries}/${MAX_RETRIES}): ${err.message}`);
            await page.waitForTimeout(randomDelay(3000, 5000));
            continue;
          }
          console.log(`[Scraper] Error scraping ${user} (no more retries): ${err.message}`);
          results.push({ username: user, error: err.message });
          break;
        }
      }

      await page.waitForTimeout(randomDelay(2000, 5000));
    }

    console.log(`[Scraper] Done! Scraped ${results.length} profiles`);
    const totalEmails = results.reduce((sum, r) => sum + (r.emails?.length || 0), 0);
    const totalPhones = results.reduce((sum, r) => sum + (r.phones?.length || 0), 0);
    console.log(`[Scraper] Total: ${totalEmails} emails, ${totalPhones} phones`);
    emit(profileId, 'done', { type: 'scrape', count: results.length, emails: totalEmails, phones: totalPhones });
  } catch (err) {
    console.log(`[Scraper] Fatal error: ${err.message}`);
    emit(profileId, 'error', { type: 'scrape', error: err.message });
  }

  return { results };
}

// ─── Scrape Group Members for Emails ──────────────────────────────

async function scrapeHashtagEmails(profileId, config) {
  const { hashtag: groupUrl, maxProfiles = 20 } = config;
  let cancelled = false;
  const results = [];

  try {
    const page = getPage(profileId);
    if (!page) throw new Error('No hay pagina abierta');

    // In Facebook context, we scrape group members instead of hashtags
    const cleanUrl = groupUrl.replace(/^#/, '').trim();
    const url = cleanUrl.startsWith('http') ? cleanUrl : `https://www.facebook.com/groups/${cleanUrl}/members`;

    emit(profileId, 'start', { type: 'scrape-group', target: cleanUrl });

    await page.goto(url, {
      waitUntil: 'load', timeout: 20000,
    });
    await page.waitForTimeout(randomDelay(3000, 5000));

    // Get member profile links
    const memberLinks = await page.locator('a[href*="/user/"], a[href*="facebook.com/"][role="link"]').all();
    const membersToCheck = Math.min(memberLinks.length, maxProfiles);
    const visitedUsers = new Set();

    for (let i = 0; i < membersToCheck; i++) {
      if (cancelled) break;

      try {
        const href = await memberLinks[i].getAttribute('href').catch(() => '');
        if (!href || visitedUsers.has(href)) continue;
        visitedUsers.add(href);

        // Extract username from URL
        const userMatch = href.match(/facebook\.com\/([^/?]+)/);
        const author = userMatch ? userMatch[1] : '';
        if (!author || author === 'groups' || author === 'profile.php') continue;

        // Visit the member's profile About page
        await page.goto(`https://www.facebook.com/${author}/about`, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(randomDelay(2000, 3000));

        const aboutText = await page.evaluate(() => document.body.innerText).catch(() => '');
        const emails = aboutText.match(EMAIL_REGEX) || [];
        const phones = aboutText.match(PHONE_REGEX) || [];

        if (emails.length > 0 || phones.length > 0) {
          results.push({
            username: author,
            emails: [...new Set(emails.filter(e => !isEmailFalsePositive(e.toLowerCase())))],
            phones: [...new Set(phones.filter(p => p.replace(/\D/g, '').length >= 7))],
            source: cleanUrl,
          });
        }

        emit(profileId, 'progress', {
          type: 'scrape-group',
          current: visitedUsers.size,
          total: membersToCheck,
          found: results.length,
        });

        // Go back to members page
        await page.goto(url, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(randomDelay(2000, 4000));
      } catch {
        await page.waitForTimeout(1000);
      }
    }

    emit(profileId, 'done', { type: 'scrape-group', count: results.length, target: cleanUrl });
  } catch (err) {
    emit(profileId, 'error', { type: 'scrape-group', error: err.message });
  }

  return { results };
}

// ─── Scrape Friends of a Profile ──────────────────────────────────

async function scrapeFollowersData(profileId, config) {
  const { targetUser, maxFollowers = 100, scrapeEmails = true, scrapePhones = true, fastMode = false } = config;
  let cancelled = false;
  const followers = [];
  const results = [];

  try {
    const page = getPage(profileId);
    if (!page) throw new Error('No hay pagina abierta');
    const target = targetUser.replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?facebook\.com\//, '').replace(/\/$/, '');

    console.log(`[Scraper] Starting friend scrape of ${target} (max ${maxFollowers})...`);
    emit(profileId, 'start', { type: 'scrape-friends', target, total: maxFollowers });

    // Step 1: Go to target profile friends list
    await page.goto(`https://www.facebook.com/${target}/friends`, {
      waitUntil: 'load', timeout: 20000,
    });
    await page.waitForTimeout(randomDelay(3000, 5000));

    // Step 2: Extract friend usernames by scrolling
    let previousCount = 0;
    let stuckCount = 0;

    console.log(`[Scraper] Extracting friend usernames...`);

    while (followers.length < maxFollowers && !cancelled) {
      const items = await page.locator('a[href*="facebook.com/"][role="link"]').all();

      for (const item of items) {
        if (followers.length >= maxFollowers || cancelled) break;
        try {
          const href = await item.getAttribute('href');
          if (!href || href.includes('/friends') || href.includes('/groups')) continue;
          const userMatch = href.match(/facebook\.com\/([^/?#]+)/);
          if (!userMatch) continue;
          const username = userMatch[1];
          if (!username || username === target || username === 'profile.php' ||
              username === 'pages' || username === 'groups' || username === 'watch' ||
              followers.includes(username)) continue;
          followers.push(username);
        } catch { /* skip */ }
      }

      if (followers.length === previousCount) {
        stuckCount++;
        if (stuckCount > 5) break;
      } else {
        stuckCount = 0;
        previousCount = followers.length;
      }

      // Scroll down to load more
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(randomDelay(1500, 3000));

      if (followers.length % 20 === 0 && followers.length > 0) {
        console.log(`[Scraper] Extracted ${followers.length} friend usernames...`);
        emit(profileId, 'progress', {
          type: 'scrape-friends',
          phase: 'extracting',
          current: followers.length,
          total: maxFollowers,
          target,
        });
      }
    }

    console.log(`[Scraper] Got ${followers.length} friends.`);

    // Fast mode: save usernames directly to DB without visiting profiles
    if (fastMode) {
      console.log(`[Scraper] FAST MODE — saving ${followers.length} usernames directly (no profile visits)`);
      const { getDb } = require('../db/database');
      const db = getDb();
      const stmt = db.prepare('INSERT OR IGNORE INTO scraped_data (target_user, data_type, value, scraped_by) VALUES (?, ?, ?, ?)');
      let saved = 0;
      for (const user of followers) {
        try {
          stmt.run(target, 'username', user, profileId);
          saved++;
        } catch { /* duplicate */ }
      }
      console.log(`[Scraper] FAST MODE DONE! Saved ${saved} usernames from ${target}`);
      emit(profileId, 'done', {
        type: 'scrape-friends',
        target,
        followersScraped: followers.length,
        withData: saved,
        mode: 'fast',
      });
      return { followers: followers.length, results: followers.map(u => ({ username: u })) };
    }

    console.log(`[Scraper] Now scraping their profiles for emails/phones...`);

    // Step 3: Visit each friend and scrape their data
    for (let i = 0; i < followers.length; i++) {
      if (cancelled) break;
      const user = followers[i];

      emit(profileId, 'progress', {
        type: 'scrape-friends',
        phase: 'scraping',
        current: i + 1,
        total: followers.length,
        currentUser: user,
        target,
        found: results.length,
      });

      try {
        await page.goto(`https://www.facebook.com/${user}/about`, {
          waitUntil: 'load', timeout: 12000,
        });
        await page.waitForTimeout(randomDelay(1500, 3000));

        // Get all text from About page
        const aboutText = await page.evaluate(() => document.body.innerText).catch(() => '');

        const profileResult = {
          username: user,
          source: target,
          emails: [],
          phones: [],
          bio: '',
        };

        // Emails
        if (scrapeEmails) {
          const emails = aboutText.match(EMAIL_REGEX) || [];
          profileResult.emails = [...new Set(emails.filter(e => !isEmailFalsePositive(e.toLowerCase())))];
        }

        // Phones
        if (scrapePhones) {
          const phones = aboutText.match(PHONE_REGEX) || [];

          // Also check tel/wa links
          try {
            const telLink = page.locator('a[href^="tel:"]').first();
            if (await telLink.isVisible({ timeout: 800 })) {
              const href = await telLink.getAttribute('href').catch(() => '');
              if (href) phones.push(href.replace('tel:', ''));
            }
          } catch { /* no tel */ }

          try {
            const waLink = page.locator('a[href*="wa.me"], a[href*="whatsapp"]').first();
            if (await waLink.isVisible({ timeout: 800 })) {
              const href = await waLink.getAttribute('href').catch(() => '');
              const match = (href || '').match(/(?:wa\.me\/|phone=)(\+?\d{7,15})/);
              if (match) phones.push(match[1]);
            }
          } catch { /* no wa */ }

          profileResult.phones = [...new Set(phones.filter(p => p.replace(/\D/g, '').length >= 7))];
        }

        // Only add if we found something
        if (profileResult.emails.length > 0 || profileResult.phones.length > 0) {
          results.push(profileResult);
        }

        if ((i + 1) % 10 === 0) {
          console.log(`[Scraper] Progress: ${i + 1}/${followers.length} scraped, ${results.length} with data`);
        }

      } catch {
        // Skip failed profiles
      }

      await page.waitForTimeout(randomDelay(1500, 4000));
    }

    const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
    const totalPhones = results.reduce((sum, r) => sum + r.phones.length, 0);
    console.log(`[Scraper] DONE! ${followers.length} friends scraped, found ${totalEmails} emails, ${totalPhones} phones`);

    emit(profileId, 'done', {
      type: 'scrape-friends',
      target,
      followersScraped: followers.length,
      withData: results.length,
      emails: totalEmails,
      phones: totalPhones,
    });
  } catch (err) {
    console.log(`[Scraper] Fatal error: ${err.message}`);
    emit(profileId, 'error', { type: 'scrape-friends', error: err.message });
  }

  return { followers: followers.length, results };
}

module.exports = { scrapeProfiles, scrapeHashtagEmails, scrapeFollowersData, onScraperEvent };
