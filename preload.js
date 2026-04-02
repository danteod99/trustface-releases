const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  createProfile: (profile) => ipcRenderer.invoke('profiles:create', profile),
  updateProfile: (id, updates) => ipcRenderer.invoke('profiles:update', id, updates),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),

  // Browser
  launchBrowser: (profileId) => ipcRenderer.invoke('browser:launch', profileId),
  closeBrowser: (profileId) => ipcRenderer.invoke('browser:close', profileId),
  getBrowserStatus: () => ipcRenderer.invoke('browser:status'),

  // Proxies
  importProxies: (text) => ipcRenderer.invoke('proxies:import', text),
  testProxy: (proxy) => ipcRenderer.invoke('proxy:test', proxy),

  // Automations
  autoLike: (profileId, config) => ipcRenderer.invoke('auto:like', profileId, config),
  autoFollow: (profileId, config) => ipcRenderer.invoke('auto:follow', profileId, config),
  autoUnfollow: (profileId, config) => ipcRenderer.invoke('auto:unfollow', profileId, config),
  autoViewStories: (profileId, config) => ipcRenderer.invoke('auto:stories', profileId, config),
  autoVisitProfiles: (profileId, config) => ipcRenderer.invoke('auto:visit', profileId, config),
  autoComment: (profileId, config) => ipcRenderer.invoke('auto:comment', profileId, config),
  uploadPost: (profileId, config) => ipcRenderer.invoke('auto:upload-post', profileId, config),
  editProfileIG: (profileId, config) => ipcRenderer.invoke('auto:edit-profile', profileId, config),
  sharePost: (profileId, config) => ipcRenderer.invoke('auto:share-post', profileId, config),
  buffPost: (profileId, config) => ipcRenderer.invoke('auto:buff-post', profileId, config),
  followSuggestions: (profileId, config) => ipcRenderer.invoke('auto:follow-suggestions', profileId, config),
  searchAndFollow: (profileId, config) => ipcRenderer.invoke('auto:search-follow', profileId, config),
  extractFollowers: (profileId, config) => ipcRenderer.invoke('auto:extract-followers', profileId, config),
  likeByHashtag: (profileId, config) => ipcRenderer.invoke('auto:like-hashtag', profileId, config),
  likeFeed: (profileId, config) => ipcRenderer.invoke('auto:like-feed', profileId, config),
  likeExplore: (profileId, config) => ipcRenderer.invoke('auto:like-explore', profileId, config),
  watchReels: (profileId, config) => ipcRenderer.invoke('auto:watch-reels', profileId, config),
  followByHashtag: (profileId, config) => ipcRenderer.invoke('auto:follow-hashtag', profileId, config),
  sendDM: (profileId, config) => ipcRenderer.invoke('auto:send-dm', profileId, config),
  cancelAutomation: (profileId) => ipcRenderer.invoke('auto:cancel', profileId),
  getAutomationStatus: () => ipcRenderer.invoke('auto:status'),

  // Followers data
  listFollowerTargets: () => ipcRenderer.invoke('followers:list-targets'),
  getFollowers: (targetUser) => ipcRenderer.invoke('followers:get', targetUser),
  getFollowerHistory: () => ipcRenderer.invoke('followers:history'),
  exportFollowersCsv: (targetUser) => ipcRenderer.invoke('followers:export-csv', targetUser),
  deleteFollowers: (targetUser) => ipcRenderer.invoke('followers:delete', targetUser),

  // Dashboard stats
  getActionStats: () => ipcRenderer.invoke('stats:actions'),
  getRecentActivity: (limit) => ipcRenderer.invoke('stats:recent', limit),
  getDailyStats: (days) => ipcRenderer.invoke('stats:daily', days),

  // Scheduler
  listScheduledTasks: () => ipcRenderer.invoke('scheduler:list'),
  createScheduledTask: (task) => ipcRenderer.invoke('scheduler:create', task),
  toggleScheduledTask: (id) => ipcRenderer.invoke('scheduler:toggle', id),
  deleteScheduledTask: (id) => ipcRenderer.invoke('scheduler:delete', id),

  // Account health
  checkAccountHealth: (profileId) => ipcRenderer.invoke('health:check', profileId),
  checkAllAccounts: () => ipcRenderer.invoke('health:checkAll'),
  getAllHealthStatus: () => ipcRenderer.invoke('health:getAll'),

  // Shadowban
  checkShadowban: (profileId) => ipcRenderer.invoke('shadowban:check', profileId),
  getAllShadowbanStatus: () => ipcRenderer.invoke('shadowban:getAll'),

  // Warm-up
  getAllWarmupStatus: () => ipcRenderer.invoke('warmup:getAll'),
  startWarmup: (profileId) => ipcRenderer.invoke('warmup:start', profileId),
  stopWarmup: (profileId) => ipcRenderer.invoke('warmup:stop', profileId),
  getWarmupStatus: (profileId) => ipcRenderer.invoke('warmup:getStatus', profileId),

  // Scrapers
  scrapeProfiles: (profileId, config) => ipcRenderer.invoke('scrape:profiles', profileId, config),
  scrapeHashtagEmails: (profileId, config) => ipcRenderer.invoke('scrape:hashtag-emails', profileId, config),
  scrapeFollowersData: (profileId, config) => ipcRenderer.invoke('scrape:followers-data', profileId, config),
  getScrapedData: (dataType) => ipcRenderer.invoke('scrape:getData', dataType),
  exportScrapedCsv: (dataType) => ipcRenderer.invoke('scrape:exportCsv', dataType),
  deleteScrapedData: (dataType) => ipcRenderer.invoke('scrape:delete', dataType),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // Auth
  login: (email, password) => ipcRenderer.invoke('auth:login', email, password),
  loginWithGoogle: () => ipcRenderer.invoke('auth:google'),
  register: (email, password) => ipcRenderer.invoke('auth:register', email, password),
  resetPassword: (email, newPassword) => ipcRenderer.invoke('auth:reset-password', email, newPassword),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:session'),
  refreshSession: () => ipcRenderer.invoke('auth:refresh'),
  getTier: () => ipcRenderer.invoke('auth:get-tier'),

  // Payments
  createPaymentOrder: (plan) => ipcRenderer.invoke('payment:create-order', plan),
  checkPaymentStatus: (orderId) => ipcRenderer.invoke('payment:check-status', orderId),
  getPaymentHistory: () => ipcRenderer.invoke('payment:history'),

  // Events from main process
  onAutomationEvent: (callback) => {
    ipcRenderer.on('automation:event', (_, data) => callback(data));
  },
  onLoginSuccess: (callback) => {
    ipcRenderer.on('fb:login-success', (_, profileId) => callback(profileId));
  },
  onLoginFail: (callback) => {
    ipcRenderer.on('fb:login-fail', (_, data) => callback(data));
  },
  onAuthStateChange: (callback) => {
    ipcRenderer.on('auth:state-change', (_, data) => callback(data));
  },

  // Facebook Automations
  fbMarketplaceCreate: (profileId, listing) => ipcRenderer.invoke('fb:marketplace-create', profileId, listing),
  fbMarketplaceRepost: (profileId, url, data) => ipcRenderer.invoke('fb:marketplace-repost', profileId, url, data),
  fbMarketplaceScrape: (profileId, query, max) => ipcRenderer.invoke('fb:marketplace-scrape', profileId, query, max),
  fbMarketplaceAutoreply: (profileId, template) => ipcRenderer.invoke('fb:marketplace-autoreply', profileId, template),
  fbSendDM: (profileId, recipient, msg) => ipcRenderer.invoke('fb:send-dm', profileId, recipient, msg),
  fbMassDM: (profileId, recipients, templates, opts) => ipcRenderer.invoke('fb:mass-dm', profileId, recipients, templates, opts),
  fbCreatePost: (profileId, content, opts) => ipcRenderer.invoke('fb:create-post', profileId, content, opts),
  fbPostGroup: (profileId, groupUrl, content) => ipcRenderer.invoke('fb:post-group', profileId, groupUrl, content),
  fbLike: (profileId, targetUrl, max) => ipcRenderer.invoke('fb:like', profileId, targetUrl, max),
  fbComment: (profileId, targetUrl, comments, max) => ipcRenderer.invoke('fb:comment', profileId, targetUrl, comments, max),
  fbShare: (profileId, postUrl) => ipcRenderer.invoke('fb:share', profileId, postUrl),
  fbJoinGroup: (profileId, groupUrl) => ipcRenderer.invoke('fb:join-group', profileId, groupUrl),
  fbAddFriends: (profileId, urls, max) => ipcRenderer.invoke('fb:add-friends', profileId, urls, max),
  fbScrapeGroup: (profileId, groupUrl, max) => ipcRenderer.invoke('fb:scrape-group', profileId, groupUrl, max),
  fbWarmup: (profileId, opts) => ipcRenderer.invoke('fb:warmup', profileId, opts),
  runAutomation: (profileId, actionId, config) => ipcRenderer.invoke('fb:run-automation', profileId, actionId, config),

  // Facebook Pages
  fbScrapePageInfo: (profileId, pageUrl) => ipcRenderer.invoke('fb:scrape-page-info', profileId, pageUrl),
  fbScrapePageFollowers: (profileId, pageUrl, max) => ipcRenderer.invoke('fb:scrape-page-followers', profileId, pageUrl, max),
  fbPostToPage: (profileId, pageUrl, content) => ipcRenderer.invoke('fb:post-to-page', profileId, pageUrl, content),
  fbInviteToPage: (profileId, pageUrl, max) => ipcRenderer.invoke('fb:invite-to-page', profileId, pageUrl, max),
  fbScrapePageReviews: (profileId, pageUrl, max) => ipcRenderer.invoke('fb:scrape-page-reviews', profileId, pageUrl, max),
  fbSearchPages: (profileId, keyword, max) => ipcRenderer.invoke('fb:search-pages', profileId, keyword, max),

  // AI Text Generation
  generateAIText: (provider, apiKey, prompt) => ipcRenderer.invoke('ai:generate-text', provider, apiKey, prompt),

  // Auto-Updater
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (cb) => { ipcRenderer.on('updater:update-available', (_e, info) => cb(info)); },
  onUpdateDownloadProgress: (cb) => { ipcRenderer.on('updater:download-progress', (_e, p) => cb(p)); },
  onUpdateDownloaded: (cb) => { ipcRenderer.on('updater:update-downloaded', (_e, info) => cb(info)); },
});
