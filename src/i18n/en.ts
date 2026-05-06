const en = {
  // Nav
  appName: 'SkyreWall',
  mainTool: 'Block/Mute Tool',
  subscriptions: 'Subscriptions',
  account: 'Account',
  home: 'Home',

  // Account area sidebar labels
  accountSettings: 'Settings',
  accountSubs: 'Subscriptions',
  accountStats: 'Statistics',

  // Tool descriptions
  blockToolDesc: 'Block accounts and all their followers from your BlueSky profile.',
  muteToolDesc: 'Silently mute accounts and their followers without notifying them.',

  // Home page
  homeSubtitle: 'Block or mute the followers of any account — in one click or on a schedule. Open source, privacy-first.',
  homePrivacyHeading: 'Your privacy by design',
  homePrivacyStatelessHeading: 'Without an account — zero data stored',
  homePrivacyStatelessText: 'All tools work without registration. Your handle and App Password are sent directly to BlueSky for that one request and are never written to any database or disk. Ideal for one-time runs. For maximum privacy: revoke your App Password in BlueSky settings right after — the action is already done and nothing remains on this server.',
  homePrivacyStatelessBadge: 'No account needed',
  homePrivacyRegisteredHeading: 'With a registered account',
  homePrivacyRegisteredText: 'Registration unlocks Subscriptions (automatic recurring block/mute rules) and Reblock background sync. Your App Password is stored AES-256-GCM encrypted and is only used for background jobs. You can delete your account at any time — this permanently wipes all stored data.',
  homePrivacyRegisteredBadge: 'Optional',
  homeAppPassHeading: 'What is an App Password?',
  homeAppPassText: 'An App Password is a limited-access credential you create in your BlueSky settings. It can only perform a restricted set of actions and can be revoked at any time — without affecting your main account password. Always use an App Password here, never your main password.',
  homeAppPassLink: 'Create one at bsky.app → Settings → Privacy and security → App passwords',
  homeFeature1Title: 'Block Tool',
  homeFeature1Desc: 'Bulk-block the followers of any account. No credentials stored.',
  homeFeature2Title: 'Mute Tool',
  homeFeature2Desc: 'Silently mute followers. The target account won\'t know.',
  homeFeature3Title: 'Subscriptions',
  homeFeature3Desc: 'Set recurring block/mute rules. Runs automatically in the background.',
  homeFeature4Title: 'Reblock',
  homeFeature4Desc: 'Find accounts that blocked you and block them back — once or on a schedule.',
  homeFeature5Title: 'Post Block',
  homeFeature5Desc: 'Block or mute everyone who interacted with a specific post (likes, reposts, quotes).',
  homeFeature6Title: 'Statistics',
  homeFeature6Desc: 'Visualize your moderation activity: blocks, mutes, sources, and trends over time.',
  reblockClearSkyNote: 'Blocker data is fetched via the ClearSky API (clearsky.app) — no credentials are shared with that service.',
  kofiSupport: 'Support this project',
  homeGetStarted: 'Open Block Tool',
  betaNoticeLabel: 'Early Access',
  betaNoticeText: 'SkyRewall is in active development. Large operations (500+ accounts) may hit BlueSky rate limits — the tool pauses and retries automatically, but jobs can take several minutes.',

  // Account management
  accountTitle: 'Account',
  accountDesc: 'Update your SkyreWall credentials or delete your account.',
  accountNotLoggedIn: 'You must be logged into Subscriptions to manage your account.',
  changeHandle: 'Update Handle',
  changeHandleDesc: 'Enter your new BlueSky handle. Your stored App Password will be verified against it.',
  changePassword: 'Update App Password',
  changePasswordDesc: 'Enter your new App Password. It will be verified against BlueSky before saving.',
  newHandle: 'New Handle',
  newPassword: 'New App Password',
  saveChanges: 'Save',
  saving: 'Saving…',
  changesSaved: 'Saved successfully.',
  loggedOut: 'Logged out successfully.',

  // Follower search
  searchFollowers: 'Search followers…',

  usingSubscriptionAccount: 'Using subscription account:',

  // Step 1
  step1Title: 'Your BlueSky Credentials',
  step1Desc: 'Enter your BlueSky credentials to authenticate. Your password is never stored.',
  handle: 'Handle',
  handlePlaceholder: 'yourhandle.bsky.social',
  appPassword: 'App Password',
  appPasswordPlaceholder: 'xxxx-xxxx-xxxx-xxxx',
  next: 'Next',

  // Step 2
  step2Title: 'Target Account',
  blockTool: 'Block Tool',
  muteTool: 'Mute Tool',
  targetHandle: 'Target Handle to block/mute',
  targetHandlePlaceholder: 'target.bsky.social',
  includeFollowers: 'Include followers',
  withoutFollowers: 'Without followers (target only)',
  loadFollowers: 'Load Followers',
  loading: 'Loading...',
  back: 'Back',

  // Follower list
  followerListTitle: 'Select Followers to Block/Mute',
  selectAll: 'Select All',
  deselectAll: 'Deselect All',
  selected: 'selected',
  followers: 'followers',
  confirmBlock: 'Confirm Block',
  confirmMute: 'Confirm Mute',
  processing: 'Processing...',
  noFollowers: 'No followers found.',
  fetchingFollowers: 'Fetching followers...',
  fetchingPage: 'Fetching page',
  fetchingCount: '{count} found so far...',

  // Results
  success: 'Done!',
  blocked: 'accounts blocked',
  muted: 'accounts muted',
  failed: 'failed',
  startOver: 'Start Over',

  // Subscription
  subscribeTitle: 'Subscribe to Updates',
  subscribeDesc: 'Keep your blocks/mutes current automatically. Register to enable background sync.',
  subscribeBtn: 'Subscribe',
  subscriptionMode: 'Mode',
  noSubscriptions: 'No subscriptions yet.',
  deleteSubscription: 'Delete',
  lastUpdated: 'Last updated',
  never: 'Never',
  addSubscription: 'Add Subscription',
  subscriptionPausedTitle: 'Subscription paused',
  subscriptionPausedRetry: 'Retry',
  subscriptionPausedHint: 'The target account could not be reached. Retry to re-enable, or delete this subscription.',
  nextRunAt: 'Next sync',

  // Auth
  loginTitle: 'Login to SkyreWall',
  login: 'Login',
  register: 'Register',
  registerTitle: 'Create Account',
  logout: 'Logout',
  deleteAccount: 'Delete Account',
  deleteAccountConfirm: 'Are you sure? This will delete all your subscriptions.',

  // AT Protocol OAuth
  loginWithBluesky: 'Sign in with Bluesky',
  registerWithBluesky: 'Register with Bluesky',
  oauthLoginDesc: 'Use your Bluesky account directly — no app password needed. Works with any AT Protocol server.',
  oauthHandleOptional: 'Handle (optional)',
  oauthHandleOptionalPlaceholder: 'yourhandle.bsky.social',
  oauthHandleHint: 'Enter your handle to be directed to your own PDS. Leave blank for Bluesky.',
  oauthConnecting: 'Redirecting…',
  oauthErrorTitle: 'Sign-in failed',
  oauthErrorDesc: 'The OAuth sign-in could not be completed. Please try again.',
  oauthAccountLinked: 'Your existing account was linked via Bluesky OAuth.',
  oauthSessionExpiredTitle: 'Bluesky connection lost',
  oauthSessionExpiredDesc: 'Your Bluesky authorization has expired or was revoked. Subscriptions are paused until you re-authorize.',
  oauthSessionReauthorize: 'Re-authorize with Bluesky',
  authMethodOAuth: 'via Bluesky OAuth',
  authMethodPassword: 'via App Password',
  authStep1Label: 'Account',
  authStep2Label: 'App Password',
  continueWithPassword: 'Continue with App Password',
  loginStep2Title: 'Enter App Password',
  registerStep2Title: 'Set App Password',
  orDivider: 'or sign in with app password',

  // Privacy / Legal
  privacyPolicyAccept: 'I have read and accept the',
  privacyPolicyAcceptSuffix: '.',
  privacyPolicyLink: 'Privacy Policy',
  errorPrivacyRequired: 'You must accept the Privacy Policy to register.',
  impressum: 'Imprint',
  privacyPolicy: 'Privacy Policy',

  // Mutual Protection
  protectMutuals: 'Protect Mutuals',
  mutualProtectionOn: 'Mutuals protected (deselected)',
  mutualProtectionOff: 'Mutual protection off',

  // Reblock
  reblockTool: 'Reblock',
  reblockToolDesc: 'Find accounts that have blocked you and block them back.',
  reblockDesc: 'Scan your social graph for accounts that have blocked you, then block or mute them back.',
  reblockScan: 'Scan for blockers',
  reblockScanning: 'Scanning for blockers…',
  reblockListTitle: 'Accounts blocking you',
  reblockFound: 'found',
  reblockNoneFound: 'No accounts blocking you were found.',
  reblockSaveSubscription: 'Save as Reblock Subscription',
  reblockSubscriptionSaved: 'Reblock subscription saved',
  reblockOnce: 'Scan once',
  reblockSubscribe: 'Auto-subscription',
  reblockCreateSub: 'Create Subscription',

  // Post Interaction Block
  postBlockTool: 'Post Block',
  postBlockDesc: 'Block or mute users who interacted with a specific post.',
  postUrlLabel: 'Post URL or AT-URI',
  postUrlPlaceholder: 'https://bsky.app/profile/user.bsky.social/post/...',
  postInteractionTypes: 'Interaction types',
  postTypeLikes: '❤ Likes',
  postTypeReposts: '🔁 Reposts',
  postTypeQuotes: '💬 Quotes',
  postLoadInteractors: 'Load interactors',
  postLoadingInteractors: 'Loading interactors…',
  postInteractorListTitle: 'Post interactors',
  postNoInteractors: 'No interactors found.',
  postInteractionSelectType: 'Select at least one interaction type.',
  errorPostUrlRequired: 'Post URL or AT-URI is required.',
  postSubTypes: 'Monitor interaction types:',

  // Inline subscription card (shared across tools)
  saveAsSub: 'Save as Subscription',
  subSaved: 'Subscription saved!',
  subAlreadyExists: 'Already subscribed',

  // Already-actioned filter
  hideActioned: 'Hide already actioned',
  showActioned: 'Show all',
  alreadyBlocked: 'Already blocked',
  alreadyMuted: 'Already muted',

  // Auth prompts for non-authenticated views
  needLoginDesc: 'Please log in to access this feature.',
  goToSettings: 'Go to Settings',

  // Statistics
  statsTitle: 'Statistics',
  statsTotal: 'Total',
  statsBlocks: 'blocks',
  statsMutes: 'mutes',
  statsToday: 'Today',
  statsWeek: 'This Week',
  statsMonth: 'This Month',
  statsBySource: 'By Source',
  statsLast30Days: 'Last 30 Days',
  statsManual: 'Manual',
  statsSubscription: 'Subscription',
  statsReblock: 'Reblock',
  statsInteraction: 'Post Interaction',
  statsLoginRequired: 'Login required',
  statsLoginRequiredDesc: 'You must be logged in to the Subscriptions feature to view statistics.',
  statsNoData: 'No data yet.',

  // Rate limit warnings
  rateLimitWarning: 'Large operation: BlueSky may temporarily rate-limit this. The operation will pause automatically and retry.',
  rateLimitEstimate: 'Estimated time: ~{time}s',
  streamingProgress: '{done} / {total} processed',
  streamingEta: '~{secs}s remaining',

  // Errors
  errorInvalidCreds: 'Invalid credentials. Please check your handle and app password.',
  errorNetwork: 'Network error. Please try again.',
  errorGeneral: 'Something went wrong. Please try again.',
  errorHandleRequired: 'Handle is required.',
  errorPasswordRequired: 'App password is required.',
  errorTargetRequired: 'Target handle is required.',

  // Theme / Lang
  darkMode: 'Dark',
  lightMode: 'Light',
  language: 'Language',

  // Lists feature
  listSource: 'Source',
  listSourceFollowers: 'Followers of an account',
  listSourceList: 'Members of a list',
  listPickerTitle: 'Select a list',
  listPickerMyLists: 'My Lists',
  listPickerModLists: 'Moderation Lists',
  listPickerEnterUrl: 'Enter URL',
  listPickerLoading: 'Loading your lists…',
  listPickerEmpty: 'No lists found.',
  listPickerUrlPlaceholder: 'at://did:.../app.bsky.graph.list/...',
  listPickerUrlInvalid: 'Please enter a valid at:// list URI.',
  listPickerMembers: 'members',
  listExcludeToggle: 'Exclude members of a list',
  listExcludeHint: 'Accounts in this list will be removed from the selection (whitelist).',
  listExcludeLabel: 'Exclusion list',
  listUri: 'List URI',
  subTypeList: 'List',
  subListUri: 'List URI',
};

export default en;
export type Translations = typeof en;
