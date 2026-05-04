const en = {
  // Nav
  appName: 'SkyRewall',
  mainTool: 'Block/Mute Tool',
  subscriptions: 'Subscriptions',
  account: 'Account',

  // Step 1
  step1Title: 'Your BlueSky Credentials',
  step1Desc: 'Enter your BlueSky credentials to authenticate. Your password is never stored.',
  handle: 'Handle',
  handlePlaceholder: 'yourhandle.bsky.social',
  appPassword: 'App Password',
  appPasswordPlaceholder: 'xxxx-xxxx-xxxx-xxxx',
  next: 'Next →',

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
  back: '← Back',

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
  loginTitle: 'Login to SkyRewall',
  login: 'Login',
  register: 'Register',
  registerTitle: 'Create Account',
  logout: 'Logout',
  deleteAccount: 'Delete Account',
  deleteAccountConfirm: 'Are you sure? This will delete all your subscriptions.',

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
