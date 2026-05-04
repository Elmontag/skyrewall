import type { Translations } from './en';

const de: Translations = {
  // Nav
  appName: 'SkyRewall',
  mainTool: 'Blockieren/Stummschalten',
  subscriptions: 'Abonnements',
  account: 'Konto',

  // Step 1
  step1Title: 'Deine BlueSky-Anmeldedaten',
  step1Desc: 'Gib deine BlueSky-Anmeldedaten ein. Dein Passwort wird niemals gespeichert.',
  handle: 'Handle',
  handlePlaceholder: 'deinhandle.bsky.social',
  appPassword: 'App-Passwort',
  appPasswordPlaceholder: 'xxxx-xxxx-xxxx-xxxx',
  next: 'Weiter →',

  // Step 2
  step2Title: 'Zielkonto',
  blockTool: 'Blockieren',
  muteTool: 'Stummschalten',
  targetHandle: 'Ziel-Handle zum Blockieren/Stummschalten',
  targetHandlePlaceholder: 'ziel.bsky.social',
  includeFollowers: 'Follower einbeziehen',
  withoutFollowers: 'Nur Zielkonto (ohne Follower)',
  loadFollowers: 'Follower laden',
  loading: 'Lädt...',
  back: '← Zurück',

  // Follower list
  followerListTitle: 'Follower zum Blockieren/Stummschalten auswählen',
  selectAll: 'Alle auswählen',
  deselectAll: 'Alle abwählen',
  selected: 'ausgewählt',
  followers: 'Follower',
  confirmBlock: 'Blockieren bestätigen',
  confirmMute: 'Stummschalten bestätigen',
  processing: 'Verarbeitung...',
  noFollowers: 'Keine Follower gefunden.',
  fetchingFollowers: 'Follower werden geladen...',
  fetchingPage: 'Seite wird geladen',

  // Results
  success: 'Fertig!',
  blocked: 'Konten blockiert',
  muted: 'Konten stummgeschaltet',
  failed: 'fehlgeschlagen',
  startOver: 'Neu starten',

  // Subscription
  subscribeTitle: 'Updates abonnieren',
  subscribeDesc: 'Halte deine Blöcke/Stummschaltungen automatisch aktuell. Registriere dich für die Hintergrundsynchronisierung.',
  subscribeBtn: 'Abonnieren',
  subscriptionMode: 'Modus',
  noSubscriptions: 'Noch keine Abonnements.',
  deleteSubscription: 'Löschen',
  lastUpdated: 'Zuletzt aktualisiert',
  never: 'Nie',
  addSubscription: 'Abonnement hinzufügen',

  // Auth
  loginTitle: 'Bei SkyRewall anmelden',
  login: 'Anmelden',
  register: 'Registrieren',
  registerTitle: 'Konto erstellen',
  logout: 'Abmelden',
  deleteAccount: 'Konto löschen',
  deleteAccountConfirm: 'Bist du sicher? Damit werden alle deine Abonnements gelöscht.',

  // Errors
  errorInvalidCreds: 'Ungültige Anmeldedaten. Bitte überprüfe Handle und App-Passwort.',
  errorNetwork: 'Netzwerkfehler. Bitte versuche es erneut.',
  errorGeneral: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
  errorHandleRequired: 'Handle ist erforderlich.',
  errorPasswordRequired: 'App-Passwort ist erforderlich.',
  errorTargetRequired: 'Ziel-Handle ist erforderlich.',

  // Theme / Lang
  darkMode: 'Dunkel',
  lightMode: 'Hell',
  language: 'Sprache',
};

export default de;
