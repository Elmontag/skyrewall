# Datenschutzerklärung

## 1. Datenschutz auf einen Blick

### Allgemeine Hinweise

Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.

### Datenerfassung auf dieser Website

**Wer ist verantwortlich für die Datenerfassung auf dieser Website?**

Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Dessen Kontaktdaten können Sie dem Impressum dieser Website entnehmen.

## 2. Hosting

Diese Website wird bei einem externen Dienstleister gehostet (Hoster). Die personenbezogenen Daten, die auf dieser Website erfasst werden, werden auf den Servern des Hosters gespeichert.

## 3. Allgemeine Hinweise und Pflichtinformationen

### Datenschutz

Der Betreiber dieser Seite nimmt den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung.

### Verantwortliche Stelle

Die verantwortliche Stelle für die Datenverarbeitung auf dieser Website ist:

**[Vor- und Nachname]**  
[Straße und Hausnummer]  
[PLZ] [Ort]  
E-Mail: [ihre-email@example.com]

### Speicherdauer

Soweit innerhalb dieser Datenschutzerklärung keine speziellere Speicherdauer genannt wurde, verbleiben Ihre personenbezogenen Daten bei uns, bis der Zweck für die Datenverarbeitung entfällt. Wenn Sie ein berechtigtes Löschersuchen geltend machen oder eine Einwilligung zur Datenverarbeitung widerrufen, werden Ihre Daten gelöscht, sofern wir keine anderen rechtlich zulässigen Gründe für die Speicherung Ihrer personenbezogenen Daten haben.

## 4. Datenerfassung auf dieser Website

### Registrierung / Abonnements

Wenn Sie sich auf unserer Website registrieren, um die Abonnement-Funktion zu nutzen, erheben wir folgende Daten:

- Ihren BlueSky-Handle (Benutzername)
- Ihr verschlüsseltes BlueSky App-Passwort (AES-256-GCM-verschlüsselt)
- Die von Ihnen eingetragenen Ziel-Handles für Abonnements

Die Verarbeitung dieser Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Ihr App-Passwort wird ausschließlich verschlüsselt gespeichert und dient der automatischen Hintergrundsynchronisierung Ihrer Blocks/Mutes.

### Cookies und Sessions

Nach der Anmeldung wird ein **technisch notwendiges** Session-Cookie gesetzt, das zur Authentifizierung dient. Dieses Cookie:

- enthält keine personenbezogenen Daten in Klartext (nur eine signierte, interne Nutzer-ID)
- ist mit den Flags `HttpOnly`, `Secure` und `SameSite=Strict` gesetzt
- hat eine serverseitig geprüfte Gültigkeitsdauer von **7 Tagen**
- wird beim Abmelden oder nach Ablauf automatisch ungültig

Da es sich um ein technisch zwingend erforderliches Cookie handelt, ist gemäß § 25 Abs. 2 Nr. 2 TTDSG **keine Einwilligung** erforderlich. Es werden **keine** Tracking-, Analyse- oder Marketing-Cookies gesetzt.

### Protokollierung von Moderationsaktionen (Block-/Mute-Events)

Wenn Sie die Tools nutzen (eingeloggt oder nicht), werden durchgeführte Block- und Mute-Aktionen in einer internen Datenbank protokolliert, sofern Sie eingeloggt sind:

- **Was wird gespeichert:** Der öffentliche AT-Protocol-Identifier (DID) des moderierten Kontos, die Art der Aktion (block/mute), die Quelle der Aktion (z. B. manuell, Abonnement, Reblock) sowie der Zeitstempel.
- **Was nicht gespeichert wird:** Keine Namen, keine E-Mail-Adressen, keine weiteren personenbezogenen Daten der moderierten Konten. DIDs sind öffentliche, technische Identifikatoren im AT-Protocol-Netzwerk.
- **Zweck:** Vermeidung von Doppelaktionen, Bereitstellung von Moderationsstatistiken für Sie als Nutzer.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
- **Löschung:** Die Ereignisse werden beim Löschen Ihres Kontos automatisch mitgelöscht.

### Schutzliste (Whitelist)

Sie können Konten in eine persönliche Schutzliste aufnehmen, um zu verhindern, dass diese durch automatische Sync-Prozesse blockiert oder gemutet werden:

- **Was wird gespeichert:** Der öffentliche AT-Protocol-Identifier (DID) des geschützten Kontos sowie eine optionale Freitextnotiz.
- **Zweck:** Nutzergesteuerte Kontrolle über Moderationsausnahmen.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
- **Löschung:** Schutzlisteneinträge können jederzeit in der App entfernt oder beim Kontolöschen automatisch mitgelöscht werden.

### Import bestehender Blocks (Ersteinrichtung)

Beim ersten Login nach der Registrierung werden Ihre bestehenden BlueSky-Blocks einmalig importiert, um Doppelaktionen zu verhindern. Es wird lediglich ein Zeitstempel dieses Imports gespeichert (`blocks_imported_at`). Der Import selbst erfolgt über Ihre BlueSky-API-Verbindung und wird nicht dauerhaft in Rohform gespeichert.

### Externe Dienste: ClearSky API

Das Reblock-Tool ruft Daten der öffentlichen **ClearSky API** (clearsky.app) ab. Dabei wird ausschließlich Ihr öffentlicher BlueSky-Handle als Teil des API-Pfades übergeben — keine Anmeldedaten oder andere personenbezogene Informationen. ClearSky indexiert öffentlich im AT-Protocol-Netzwerk verfügbare Blockbeziehungen. Für die Datenverarbeitung durch ClearSky gilt deren eigene Datenschutzerklärung.

### Nutzung ohne Registrierung (Stateless-Modus)

Wenn Sie das Block-/Mute-Tool ohne Registrierung nutzen, werden Ihre eingegebenen BlueSky-Anmeldedaten **nicht gespeichert**. Die Verarbeitung erfolgt ausschließlich im Arbeitsspeicher für die Dauer des Requests. Es werden in diesem Fall keine Block-Events protokolliert.

## 5. Ihre Rechte

Sie haben jederzeit das Recht:

- **Auskunft** über Ihre gespeicherten personenbezogenen Daten zu erhalten (Art. 15 DSGVO)
- **Berichtigung** unrichtiger Daten zu verlangen (Art. 16 DSGVO)
- **Löschung** Ihrer gespeicherten Daten zu verlangen (Art. 17 DSGVO) — über die Funktion „Konto löschen" in der App
- **Einschränkung** der Verarbeitung zu verlangen (Art. 18 DSGVO)
- **Widerspruch** gegen die Verarbeitung einzulegen (Art. 21 DSGVO)
- **Datenübertragbarkeit** zu verlangen (Art. 20 DSGVO)

Zur Ausübung dieser Rechte wenden Sie sich bitte an: [ihre-email@example.com]

Sie haben zudem das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde zu beschweren.

## 6. Datensicherheit

Diese Website nutzt aus Sicherheitsgründen und zum Schutz der Übertragung vertraulicher Inhalte eine SSL- bzw. TLS-Verschlüsselung. Gespeicherte Anmeldedaten werden mit AES-256-GCM verschlüsselt. Die Datenbank ist nicht öffentlich erreichbar und ausschließlich innerhalb der internen Netzwerkinfrastruktur zugänglich.

---

*Stand: [MM/JJJJ]*

> **Hinweis:** Diese Datei ist ein Template. Kopieren Sie sie nach `datenschutz.md` und füllen Sie die Platzhalter mit Ihren echten Angaben aus. Die Datei `datenschutz.md` wird von Git ignoriert.
