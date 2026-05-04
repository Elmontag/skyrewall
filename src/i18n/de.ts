import type { Translations } from './en';

const de: Translations = {
  // Nav
  appName: 'SkyreWall',
  mainTool: 'Blockieren/Stummschalten',
  subscriptions: 'Abonnements',
  account: 'Konto',
  home: 'Start',

  // Tool descriptions
  blockToolDesc: 'Blockiere Accounts und alle ihre Follower von deinem BlueSky-Profil.',
  muteToolDesc: 'Stumm schalten von Accounts und ihren Followern, ohne sie zu benachrichtigen.',

  // Home page
  homeHero: 'BlueSky-Moderation, vereinfacht.',
  homeSubtitle: 'Blockiere oder schalte stumm — die Follower jedes Accounts. Einmalig oder automatisiert. Open Source, datenschutzorientiert.',
  homePrivacyHeading: 'Datenschutz by Design',
  homePrivacyText: 'Beim direkten Nutzen der Block- oder Stummschalt-Tools werden deine Anmeldedaten nur für die aktuelle Anfrage verwendet und niemals gespeichert. Nur das Abonnement-Feature speichert eine verschlüsselte Kopie deines App-Passworts für die Hintergrund-Synchronisierung.',
  homeAppPassHeading: 'Was ist ein App-Passwort?',
  homeAppPassText: 'Ein App-Passwort ist ein Zugangsdaten mit eingeschränkten Rechten, das du in den BlueSky-Einstellungen erstellst. Es kann nur bestimmte Aktionen ausführen und jederzeit widerrufen werden – ohne dein Hauptpasswort zu betreffen. Verwende hier immer ein App-Passwort, nie dein Hauptpasswort.',
  homeAppPassLink: 'Erstelle eines unter bsky.app → Einstellungen → Datenschutz und Sicherheit → App-Passwörter',
  homeFeature1Title: 'Block-Tool',
  homeFeature1Desc: 'Blockiere massenweise die Follower eines Accounts. Keine Speicherung.',
  homeFeature2Title: 'Stumm-Tool',
  homeFeature2Desc: 'Follower still stummschalten. Das Zielkonto erfährt nichts davon.',
  homeFeature3Title: 'Abonnements',
  homeFeature3Desc: 'Automatische Block-/Stummschalt-Regeln im Hintergrund.',
  homeGetStarted: 'Block-Tool öffnen',

  // Account management
  accountTitle: 'Konto',
  accountDesc: 'Anmeldedaten aktualisieren oder Konto löschen.',
  accountNotLoggedIn: 'Du musst bei Abonnements angemeldet sein, um dein Konto zu verwalten.',
  changeHandle: 'Handle aktualisieren',
  changeHandleDesc: 'Gib deinen neuen BlueSky-Handle ein. Das gespeicherte App-Passwort wird dagegen geprüft.',
  changePassword: 'App-Passwort aktualisieren',
  changePasswordDesc: 'Gib dein neues App-Passwort ein. Es wird vor dem Speichern gegen BlueSky geprüft.',
  newHandle: 'Neuer Handle',
  newPassword: 'Neues App-Passwort',
  saveChanges: 'Speichern',
  saving: 'Speichert…',
  changesSaved: 'Erfolgreich gespeichert.',

  // Follower search
  searchFollowers: 'Follower suchen…',

  usingSubscriptionAccount: 'Angemeldet als:',

  // Step 1
  step1Title: 'Deine BlueSky-Anmeldedaten',
  step1Desc: 'Gib deine BlueSky-Anmeldedaten ein. Dein Passwort wird niemals gespeichert.',
  handle: 'Handle',
  handlePlaceholder: 'deinhandle.bsky.social',
  appPassword: 'App-Passwort',
  appPasswordPlaceholder: 'xxxx-xxxx-xxxx-xxxx',
  next: 'Weiter',

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
  back: 'Zurück',

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
  loginTitle: 'Bei SkyreWall anmelden',
  login: 'Anmelden',
  register: 'Registrieren',
  registerTitle: 'Konto erstellen',
  logout: 'Abmelden',
  deleteAccount: 'Konto löschen',
  deleteAccountConfirm: 'Bist du sicher? Damit werden alle deine Abonnements gelöscht.',

  // Privacy / Legal
  privacyPolicyAccept: 'Ich habe die',
  privacyPolicyAcceptSuffix: ' gelesen und akzeptiert.',
  privacyPolicyLink: 'Datenschutzerklärung',
  errorPrivacyRequired: 'Du musst die Datenschutzerklärung akzeptieren, um dich zu registrieren.',
  impressum: 'Impressum',
  privacyPolicy: 'Datenschutzerklärung',

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
