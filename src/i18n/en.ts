const en = {
  // Nav
  appName: 'SkyreWall',
  mainTool: 'Block/Mute Tool',
  subscriptions: 'Subscriptions',
  account: 'Account',
  home: 'Home',

  // Tool descriptions
  blockToolDesc: 'Block accounts and all their followers from your BlueSky profile.',
  muteToolDesc: 'Silently mute accounts and their followers without notifying them.',

  // Home page
  homeHero: 'BlueSky moderation, simplified.',
  homeSubtitle: 'Block or mute the followers of any account — in one click or on a schedule. Open source, privacy-first.',
  homePrivacyHeading: 'Your privacy by design',
  homePrivacyText: 'When using the Block or Mute tools directly, your credentials are used only for the current request and are never stored. Only the Subscriptions feature stores an encrypted copy of your App Password for background sync.',
  homeAppPassHeading: 'What is an App Password?',
  homeAppPassText: 'An App Password is a limited-access credential you create in your BlueSky settings. It can only perform a restricted set of actions and can be revoked at any time — without affecting your main account password. Always use an App Password here, never your main password.',
  homeAppPassLink: 'Create one at bsky.app → Settings → Privacy and security → App passwords',
  homeFeature1Title: 'Block Tool',
  homeFeature1Desc: 'Bulk-block the followers of any account. No credentials stored.',
  homeFeature2Title: 'Mute Tool',
  homeFeature2Desc: 'Silently mute followers. The target account won\'t know.',
  homeFeature3Title: 'Subscriptions',
  homeFeature3Desc: 'Set recurring block/mute rules. Runs automatically in the background.',
  homeGetStarted: 'Open Block Tool',

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

  // Auth
  loginTitle: 'Login to SkyreWall',
  login: 'Login',
  register: 'Register',
  registerTitle: 'Create Account',
  logout: 'Logout',
  deleteAccount: 'Delete Account',
  deleteAccountConfirm: 'Are you sure? This will delete all your subscriptions.',

  // Privacy / Legal
  privacyPolicyAccept: 'I have read and accept the',
  privacyPolicyAcceptSuffix: '.',
  privacyPolicyLink: 'Privacy Policy',
  errorPrivacyRequired: 'You must accept the Privacy Policy to register.',
  impressum: 'Imprint',
  privacyPolicy: 'Privacy Policy',

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
};

export default en;
export type Translations = typeof en;
