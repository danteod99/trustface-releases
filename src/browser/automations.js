/**
 * Facebook Automations for TrustMind Desktop
 * Handles: Marketplace, Groups, Pages, Messenger, Posts, Engagement
 */

const FB_URLS = {
  home: 'https://www.facebook.com/',
  marketplace: 'https://www.facebook.com/marketplace/',
  marketplaceCreate: 'https://www.facebook.com/marketplace/create/item/',
  groups: 'https://www.facebook.com/groups/',
  messenger: 'https://www.facebook.com/messages/',
  profile: 'https://www.facebook.com/me/',
};

// ── Marketplace: Create Listing ──
async function marketplaceCreateListing(page, listing) {
  await page.goto(FB_URLS.marketplaceCreate, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Upload photos
  if (listing.photos && listing.photos.length > 0) {
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(listing.photos);
      await page.waitForTimeout(3000);
    }
  }

  // Title
  const titleInput = await page.$('[aria-label*="Titulo"], [aria-label*="Title"], [placeholder*="Titulo"], [placeholder*="Title"]');
  if (titleInput) {
    await titleInput.click();
    await titleInput.fill(listing.title);
  }

  // Price
  const priceInput = await page.$('[aria-label*="Precio"], [aria-label*="Price"], [placeholder*="Precio"], [placeholder*="Price"]');
  if (priceInput) {
    await priceInput.click();
    await priceInput.fill(String(listing.price));
  }

  // Category
  if (listing.category) {
    const categoryBtn = await page.$('[aria-label*="Categoria"], [aria-label*="Category"]');
    if (categoryBtn) {
      await categoryBtn.click();
      await page.waitForTimeout(1000);
      await page.keyboard.type(listing.category);
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
    }
  }

  // Condition
  if (listing.condition) {
    const condBtn = await page.$('[aria-label*="Estado"], [aria-label*="Condition"]');
    if (condBtn) {
      await condBtn.click();
      await page.waitForTimeout(500);
      const option = await page.$(`text="${listing.condition}"`);
      if (option) await option.click();
    }
  }

  // Description
  const descInput = await page.$('[aria-label*="Descripcion"], [aria-label*="Description"], [placeholder*="Descripcion"]');
  if (descInput) {
    await descInput.click();
    await descInput.fill(listing.description || '');
  }

  // Location
  if (listing.location) {
    const locInput = await page.$('[aria-label*="Ubicacion"], [aria-label*="Location"]');
    if (locInput) {
      await locInput.click();
      await locInput.fill('');
      await locInput.type(listing.location, { delay: 50 });
      await page.waitForTimeout(2000);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
  }

  // Publish
  if (listing.autoPublish !== false) {
    await page.waitForTimeout(1000);
    const publishBtn = await page.$('[aria-label*="Publicar"], [aria-label*="Publish"], button:has-text("Publicar"), button:has-text("Publish")');
    if (publishBtn) {
      await publishBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  return { success: true };
}

// ── Marketplace: Repost Listing (delete + recreate) ──
async function marketplaceRepost(page, listingUrl, listingData) {
  // Go to listing and delete
  await page.goto(listingUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const moreBtn = await page.$('[aria-label*="Mas"], [aria-label*="More"]');
  if (moreBtn) {
    await moreBtn.click();
    await page.waitForTimeout(500);
    const deleteBtn = await page.$('text="Eliminar publicacion"');
    if (deleteBtn) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      const confirmBtn = await page.$('text="Eliminar"');
      if (confirmBtn) await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Recreate
  return await marketplaceCreateListing(page, listingData);
}

// ── Messenger: Send DM ──
async function sendMessage(page, recipient, message, options = {}) {
  await page.goto(FB_URLS.messenger, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // New message
  const newMsgBtn = await page.$('[aria-label*="Nuevo mensaje"], [aria-label*="New message"]');
  if (newMsgBtn) {
    await newMsgBtn.click();
    await page.waitForTimeout(1000);
  }

  // Search recipient
  const searchInput = await page.$('[aria-label*="Buscar"], [placeholder*="Buscar"], [aria-label*="Search"]');
  if (searchInput) {
    await searchInput.click();
    await searchInput.type(recipient, { delay: humanDelay(30, 80) });
    await page.waitForTimeout(2000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }

  // Type and send message
  const msgBox = await page.$('[aria-label*="Mensaje"], [aria-label*="Message"], [contenteditable="true"]');
  if (msgBox) {
    await msgBox.click();
    await msgBox.type(message, { delay: humanDelay(20, 60) });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }

  return { success: true, recipient };
}

// ── Mass DM ──
async function sendMassDM(page, recipients, message, options = {}) {
  const results = [];
  const templates = Array.isArray(message) ? message : [message];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const template = templates[i % templates.length];
    const personalizedMsg = template
      .replace(/{nombre}/g, recipient.name || recipient)
      .replace(/{usuario}/g, recipient.username || recipient);

    try {
      await sendMessage(page, typeof recipient === 'string' ? recipient : recipient.username, personalizedMsg, options);
      results.push({ recipient, status: 'sent' });
    } catch (err) {
      results.push({ recipient, status: 'error', error: err.message });
    }

    // Random delay between DMs
    const delay = randomBetween(options.minDelay || 30000, options.maxDelay || 120000);
    await page.waitForTimeout(delay);
  }

  return results;
}

// ── Post to Profile/Page ──
async function createPost(page, content, options = {}) {
  const url = options.pageUrl || FB_URLS.home;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "What's on your mind?"
  const postBox = await page.$('[aria-label*="que estas pensando"], [aria-label*="What\'s on your mind"], [role="button"]:has-text("que estas pensando")');
  if (postBox) {
    await postBox.click();
    await page.waitForTimeout(1500);
  }

  // Type content
  const editor = await page.$('[contenteditable="true"][role="textbox"]');
  if (editor) {
    await editor.click();
    await editor.type(content.text, { delay: humanDelay(20, 50) });
  }

  // Upload photos
  if (content.photos && content.photos.length > 0) {
    const photoBtn = await page.$('[aria-label*="Foto"], [aria-label*="Photo"]');
    if (photoBtn) {
      await photoBtn.click();
      await page.waitForTimeout(1000);
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        await fileInput.setInputFiles(content.photos);
        await page.waitForTimeout(3000);
      }
    }
  }

  // Publish
  const publishBtn = await page.$('[aria-label*="Publicar"], button:has-text("Publicar"), button:has-text("Post")');
  if (publishBtn) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
  }

  return { success: true };
}

// ── Post to Group ──
async function postToGroup(page, groupUrl, content) {
  await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const writeBox = await page.$('[aria-label*="Escribe algo"], [aria-label*="Write something"]');
  if (writeBox) {
    await writeBox.click();
    await page.waitForTimeout(1500);
  }

  const editor = await page.$('[contenteditable="true"][role="textbox"]');
  if (editor) {
    await editor.click();
    await editor.type(content.text, { delay: humanDelay(20, 50) });
  }

  if (content.photos && content.photos.length > 0) {
    const fileInput = await page.$('input[type="file"][accept*="image"]');
    if (fileInput) {
      await fileInput.setInputFiles(content.photos);
      await page.waitForTimeout(3000);
    }
  }

  const publishBtn = await page.$('button:has-text("Publicar"), button:has-text("Post")');
  if (publishBtn) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
  }

  return { success: true };
}

// ── Engagement: Like Posts ──
async function likePosts(page, targetUrl, maxLikes = 10) {
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  let liked = 0;
  for (let i = 0; i < maxLikes; i++) {
    const likeBtn = await page.$('[aria-label*="Me gusta"]:not([aria-pressed="true"]), [aria-label*="Like"]:not([aria-pressed="true"])');
    if (likeBtn) {
      await likeBtn.click();
      liked++;
      await page.waitForTimeout(randomBetween(2000, 5000));
    }
    // Scroll to load more
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);
  }

  return { liked };
}

// ── Engagement: Comment on Posts ──
async function commentOnPosts(page, targetUrl, comments, maxComments = 5) {
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  let commented = 0;
  for (let i = 0; i < maxComments; i++) {
    const commentBtn = await page.$('[aria-label*="Comentar"], [aria-label*="Comment"]');
    if (commentBtn) {
      await commentBtn.click();
      await page.waitForTimeout(1000);

      const commentBox = await page.$('[aria-label*="Escribe un comentario"], [aria-label*="Write a comment"], [contenteditable="true"]');
      if (commentBox) {
        const comment = comments[i % comments.length];
        await commentBox.type(comment, { delay: humanDelay(30, 70) });
        await page.keyboard.press('Enter');
        commented++;
        await page.waitForTimeout(randomBetween(5000, 15000));
      }
    }
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);
  }

  return { commented };
}

// ── Share Post ──
async function sharePost(page, postUrl, shareType = 'feed') {
  await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const shareBtn = await page.$('[aria-label*="Compartir"], [aria-label*="Share"]');
  if (shareBtn) {
    await shareBtn.click();
    await page.waitForTimeout(1000);

    if (shareType === 'feed') {
      const shareNowBtn = await page.$('text="Compartir ahora"');
      if (shareNowBtn) await shareNowBtn.click();
    }
    await page.waitForTimeout(2000);
  }

  return { success: true };
}

// ── Join Group ──
async function joinGroup(page, groupUrl) {
  await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const joinBtn = await page.$('button:has-text("Unirse"), button:has-text("Join")');
  if (joinBtn) {
    await joinBtn.click();
    await page.waitForTimeout(2000);
  }

  return { success: true };
}

// ── Add Friends ──
async function addFriends(page, profileUrls, maxRequests = 20) {
  let sent = 0;
  for (const url of profileUrls.slice(0, maxRequests)) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
      const addBtn = await page.$('button:has-text("Agregar"), button:has-text("Add Friend")');
      if (addBtn) {
        await addBtn.click();
        sent++;
        await page.waitForTimeout(randomBetween(5000, 15000));
      }
    } catch {}
  }
  return { sent };
}

// ── Scrape Group Members ──
async function scrapeGroupMembers(page, groupUrl, maxMembers = 100) {
  await page.goto(groupUrl + '/members', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const members = [];
  let lastCount = 0;

  while (members.length < maxMembers) {
    const memberElements = await page.$$('[data-visualcompletion="ignore-dynamic"] a[href*="/user/"], [data-visualcompletion="ignore-dynamic"] a[href*="facebook.com/"]');

    for (const el of memberElements) {
      if (members.length >= maxMembers) break;
      try {
        const name = await el.textContent();
        const href = await el.getAttribute('href');
        if (name && href && !members.find(m => m.href === href)) {
          members.push({ name: name.trim(), href, username: href.split('/').pop() });
        }
      } catch {}
    }

    if (members.length === lastCount) break;
    lastCount = members.length;

    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(2000);
  }

  return members;
}

// ── Scrape Marketplace Listings ──
async function scrapeMarketplace(page, searchQuery, maxResults = 50) {
  const url = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchQuery)}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const listings = [];
  let scrolls = 0;

  while (listings.length < maxResults && scrolls < 20) {
    const items = await page.$$('[data-testid="marketplace-feed-item"], a[href*="/marketplace/item/"]');

    for (const item of items) {
      if (listings.length >= maxResults) break;
      try {
        const text = await item.textContent();
        const href = await item.getAttribute('href');
        const priceMatch = text.match(/\$[\d,.]+|[\d,.]+\s*(?:USD|S\/)/);
        if (href && !listings.find(l => l.href === href)) {
          listings.push({
            title: text.substring(0, 100).trim(),
            price: priceMatch ? priceMatch[0] : '',
            href: href.startsWith('/') ? 'https://www.facebook.com' + href : href,
          });
        }
      } catch {}
    }

    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
    scrolls++;
  }

  return listings;
}

// ── Reply to Marketplace Messages ──
async function autoReplyMarketplace(page, replyTemplate) {
  await page.goto('https://www.facebook.com/marketplace/you/selling', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Look for unread messages indicators
  const unreadBadges = await page.$$('[aria-label*="mensaje"], [aria-label*="message"]');
  let replied = 0;

  for (const badge of unreadBadges) {
    try {
      await badge.click();
      await page.waitForTimeout(2000);

      const msgBox = await page.$('[contenteditable="true"]');
      if (msgBox) {
        await msgBox.click();
        await msgBox.type(replyTemplate, { delay: humanDelay(30, 60) });
        await page.keyboard.press('Enter');
        replied++;
        await page.waitForTimeout(randomBetween(3000, 8000));
      }
    } catch {}
  }

  return { replied };
}

// ── Warm-up Account ──
async function warmupAccount(page, options = {}) {
  const actions = [];

  // Scroll feed
  await page.goto(FB_URLS.home, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  for (let i = 0; i < (options.scrolls || 5); i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(randomBetween(2000, 5000));

    // Random like
    if (Math.random() < 0.3) {
      const likeBtn = await page.$('[aria-label*="Me gusta"]:not([aria-pressed="true"])');
      if (likeBtn) {
        await likeBtn.click();
        actions.push('like');
        await page.waitForTimeout(randomBetween(1000, 3000));
      }
    }
  }

  // View some stories
  if (options.viewStories) {
    const storyBtn = await page.$('[aria-label*="Historia"], [aria-label*="Story"]');
    if (storyBtn) {
      await storyBtn.click();
      await page.waitForTimeout(5000);
      actions.push('story_view');
      await page.keyboard.press('Escape');
    }
  }

  return { actions };
}

// ── Helpers ──
function humanDelay(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

module.exports = {
  FB_URLS,
  marketplaceCreateListing,
  marketplaceRepost,
  sendMessage,
  sendMassDM,
  createPost,
  postToGroup,
  likePosts,
  commentOnPosts,
  sharePost,
  joinGroup,
  addFriends,
  scrapeGroupMembers,
  scrapeMarketplace,
  autoReplyMarketplace,
  warmupAccount,
  // Pages
  scrapePageInfo,
  scrapePageFollowers,
  postToPage,
  inviteToPage,
  scrapePageReviews,
  searchPages,
};

// ── Pages: Scrape Page Info (email, phone, address, website, category) ──
async function scrapePageInfo(page, pageUrl) {
  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const result = {
      name: '',
      category: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      followers: '',
      likes: '',
      rating: '',
      hours: '',
      about: '',
      allEmails: [],
      allPhones: [],
    };

    // Page name
    const h1 = document.querySelector('h1');
    if (h1) result.name = h1.innerText.trim();

    // Full page text for regex extraction
    const bodyText = document.body.innerText || '';

    // Meta description
    const meta = document.querySelector('meta[property="og:description"]');
    if (meta) result.about = meta.content || '';

    // Category — usually near the page name
    const categoryEls = document.querySelectorAll('a[href*="/pages/category/"], span[dir="auto"]');
    categoryEls.forEach(el => {
      const text = el.innerText.trim();
      if (text.length > 2 && text.length < 50 && !text.includes('http') && !text.match(/^\d/)) {
        if (!result.category) result.category = text;
      }
    });

    // Emails from page
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const emails = bodyText.match(emailRegex) || [];
    // Also check mailto links
    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const email = a.href.replace('mailto:', '').split('?')[0].trim();
      if (email) emails.push(email);
    });
    result.allEmails = [...new Set(emails.filter(e => !e.includes('facebook.com')))];
    if (result.allEmails.length > 0) result.email = result.allEmails[0];

    // Phones from page
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}/g;
    const phones = bodyText.match(phoneRegex) || [];
    // Also check tel links
    document.querySelectorAll('a[href^="tel:"]').forEach(a => {
      const num = a.href.replace('tel:', '').trim();
      if (num) phones.push(num);
    });
    result.allPhones = [...new Set(phones.filter(p => p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15))];
    if (result.allPhones.length > 0) result.phone = result.allPhones[0];

    // Website
    const websiteLinks = document.querySelectorAll('a[href*="l.facebook.com/l.php"], a[target="_blank"][rel*="nofollow"]');
    websiteLinks.forEach(a => {
      const href = a.href || '';
      const text = a.innerText.trim();
      if (text && !text.includes('facebook.com') && !text.includes('instagram.com') && text.length < 100) {
        if (!result.website) result.website = text;
      }
    });

    // Address — look for map-related elements or specific text patterns
    const addressPatterns = /(?:Dirección|Address|Ubicación|Location)[:\s]*([^\n]+)/i;
    const addrMatch = bodyText.match(addressPatterns);
    if (addrMatch) result.address = addrMatch[1].trim().substring(0, 200);

    // Followers and likes count
    const followerMatch = bodyText.match(/([\d,.]+[KkMm]?)\s*(?:seguidores|followers|personas siguen esto|people follow this)/i);
    if (followerMatch) result.followers = followerMatch[1];
    const likesMatch = bodyText.match(/([\d,.]+[KkMm]?)\s*(?:me gusta|likes|personas les gusta)/i);
    if (likesMatch) result.likes = likesMatch[1];

    // Rating
    const ratingMatch = bodyText.match(/([\d.]+)\s*(?:de 5|out of 5|\/5|estrellas|stars)/i);
    if (ratingMatch) result.rating = ratingMatch[1];

    // Hours
    const hoursMatch = bodyText.match(/(?:Horario|Hours|Abierto|Open)[:\s]*([^\n]{5,100})/i);
    if (hoursMatch) result.hours = hoursMatch[1].trim();

    return result;
  });

  return data;
}

// ── Pages: Scrape Followers/Fans of a Page ──
async function scrapePageFollowers(page, pageUrl, maxFollowers = 100) {
  // Go to the page's community/followers section
  const communityUrl = pageUrl.replace(/\/$/, '') + '/community/';
  await page.goto(communityUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const followers = [];
  let lastCount = 0;
  let scrollAttempts = 0;

  while (followers.length < maxFollowers && scrollAttempts < 30) {
    const newFollowers = await page.evaluate(() => {
      const results = [];
      // Facebook shows followers as links with profile URLs
      const links = document.querySelectorAll('a[href*="/profile.php"], a[href*="facebook.com/"][role="link"]');
      links.forEach(a => {
        const name = a.innerText.trim();
        const href = a.href;
        if (name && name.length > 1 && name.length < 100 && href && !results.find(r => r.href === href)) {
          results.push({ name, href, username: href.split('/').filter(Boolean).pop() });
        }
      });
      return results;
    });

    for (const f of newFollowers) {
      if (followers.length >= maxFollowers) break;
      if (!followers.find(existing => existing.href === f.href)) {
        followers.push(f);
      }
    }

    if (followers.length === lastCount) {
      scrollAttempts++;
    } else {
      scrollAttempts = 0;
    }
    lastCount = followers.length;

    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(2000);
  }

  return followers;
}

// ── Pages: Post to a Page ──
async function postToPage(page, pageUrl, content) {
  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "Create post" / "Crear publicación"
  const createPostBtn = await page.$('[aria-label*="Crear"], [aria-label*="Create"], [role="button"]:has-text("Crear publicación"), [role="button"]:has-text("Create post")');
  if (createPostBtn) {
    await createPostBtn.click();
    await page.waitForTimeout(1500);
  }

  // Type content
  const editor = await page.$('[contenteditable="true"][role="textbox"]');
  if (editor) {
    await editor.click();
    await editor.type(content.text, { delay: humanDelay(20, 50) });
  }

  // Upload photos if provided
  if (content.photos && content.photos.length > 0) {
    const photoBtn = await page.$('[aria-label*="Foto"], [aria-label*="Photo"]');
    if (photoBtn) {
      await photoBtn.click();
      await page.waitForTimeout(1000);
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        await fileInput.setInputFiles(content.photos);
        await page.waitForTimeout(3000);
      }
    }
  }

  // Publish
  const publishBtn = await page.$('button:has-text("Publicar"), button:has-text("Post"), [aria-label*="Publicar"], [aria-label*="Post"]');
  if (publishBtn) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
  }

  return { success: true };
}

// ── Pages: Invite Friends to Like a Page ──
async function inviteToPage(page, pageUrl, maxInvites = 50) {
  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "Invite friends" / "Invitar amigos"
  const inviteBtn = await page.$('a:has-text("Invitar"), a:has-text("Invite"), [role="button"]:has-text("Invitar amigos"), [role="button"]:has-text("Invite friends")');
  if (inviteBtn) {
    await inviteBtn.click();
    await page.waitForTimeout(2000);
  }

  // Click invite buttons inside the dialog
  let invited = 0;
  for (let i = 0; i < maxInvites; i++) {
    try {
      const btn = await page.$('div[role="dialog"] button:has-text("Invitar"), div[role="dialog"] button:has-text("Invite")');
      if (btn) {
        await btn.click();
        invited++;
        await page.waitForTimeout(randomBetween(1000, 3000));
      } else {
        // Scroll in dialog to load more
        await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"]');
          if (dialog) dialog.scrollTop += 500;
        });
        await page.waitForTimeout(1500);
      }
    } catch { break; }
  }

  // Close dialog
  await page.keyboard.press('Escape').catch(() => {});

  return { invited };
}

// ── Pages: Scrape Reviews from a Page ──
async function scrapePageReviews(page, pageUrl, maxReviews = 50) {
  const reviewsUrl = pageUrl.replace(/\/$/, '') + '/reviews/';
  await page.goto(reviewsUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const reviews = [];
  let scrollAttempts = 0;

  while (reviews.length < maxReviews && scrollAttempts < 20) {
    const newReviews = await page.evaluate(() => {
      const results = [];
      // Reviews are usually in separate containers with rating + text
      const reviewEls = document.querySelectorAll('[data-testid*="review"], div[role="article"]');
      reviewEls.forEach(el => {
        const text = el.innerText.trim();
        if (text.length > 10) {
          // Try to extract rating (stars)
          const stars = el.querySelectorAll('[aria-label*="star"], [aria-label*="estrella"]');
          const ratingText = stars.length > 0 ? stars[0].getAttribute('aria-label') || '' : '';

          // Try to extract reviewer name
          const nameEl = el.querySelector('a[href*="/profile"], a[role="link"]');
          const name = nameEl ? nameEl.innerText.trim() : '';

          results.push({
            reviewer: name,
            rating: ratingText,
            text: text.substring(0, 500),
          });
        }
      });
      return results;
    });

    for (const r of newReviews) {
      if (reviews.length >= maxReviews) break;
      if (!reviews.find(existing => existing.text === r.text)) {
        reviews.push(r);
      }
    }

    const prevCount = reviews.length;
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(2000);
    if (reviews.length === prevCount) scrollAttempts++;
    else scrollAttempts = 0;
  }

  return reviews;
}

// ── Pages: Search Pages by keyword ──
async function searchPages(page, keyword, maxResults = 20) {
  const searchUrl = `https://www.facebook.com/search/pages/?q=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const pages = [];
  let scrollAttempts = 0;

  while (pages.length < maxResults && scrollAttempts < 15) {
    const newPages = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="facebook.com/"][role="presentation"], a[href*="facebook.com/"]:not([href*="/search/"])');
      links.forEach(a => {
        const name = a.innerText.trim();
        const href = a.href;
        if (name && name.length > 1 && name.length < 100 && href && !href.includes('/search/') && !results.find(r => r.href === href)) {
          // Try to get category/description
          const parent = a.closest('div[role="article"]') || a.parentElement?.parentElement;
          const parentText = parent ? parent.innerText : '';
          const category = parentText.split('\n').find(l => l.length > 2 && l.length < 50 && l !== name) || '';

          results.push({ name, href, category, username: href.split('/').filter(Boolean).pop() });
        }
      });
      return results;
    });

    for (const p of newPages) {
      if (pages.length >= maxResults) break;
      if (!pages.find(existing => existing.href === p.href)) {
        pages.push(p);
      }
    }

    const prevCount = pages.length;
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(2000);
    if (pages.length === prevCount) scrollAttempts++;
    else scrollAttempts = 0;
  }

  return pages;
}

// ── Stubs for Instagram functions (not used in TrustFace but required by main.js) ──
async function autoLike() { return { likesGiven: 0 }; }
async function autoFollow() { return { followed: 0 }; }
async function autoUnfollow() { return { unfollowed: 0 }; }
async function autoViewStories() { return { viewed: 0 }; }
async function autoVisitProfiles() { return { visited: 0 }; }
async function autoComment() { return { commented: 0 }; }
async function extractFollowers() { return []; }
async function likeByHashtag() { return { likesGiven: 0 }; }
async function likeFeed() { return { likesGiven: 0 }; }
async function likeExplore() { return { likesGiven: 0 }; }
async function watchReels() { return { watched: 0 }; }
async function followByHashtag() { return { followed: 0 }; }
async function sendDM() { return { sent: false }; }
async function uploadPost() { return { success: false }; }
async function editProfile() { return { success: false }; }
async function sharePost() { return { success: false }; }
async function buffPost() { return { success: false }; }
async function followSuggestions() { return { followed: 0 }; }
async function searchAndFollow() { return { followed: 0 }; }
function cancelAutomation() {}
function getAllAutomationStatus() { return {}; }
function onAutomationEvent() {}

module.exports = {
  ...module.exports,
  autoLike, autoFollow, autoUnfollow, autoViewStories,
  autoVisitProfiles, autoComment, extractFollowers,
  likeByHashtag, likeFeed, likeExplore, watchReels, followByHashtag, sendDM,
  uploadPost, editProfile, sharePost, buffPost, followSuggestions, searchAndFollow,
  cancelAutomation, getAllAutomationStatus, onAutomationEvent,
};
