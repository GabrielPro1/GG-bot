# GG-bot

Bot WhatsApp basato su [Baileys](https://github.com/WhiskeySockets/Baileys), con integrazione Telegram opzionale, dashboard web, database SQLite e funzionalità AI opzionali tramite Google Gemini.

Questa guida descrive l'installazione e la configurazione su **Windows 10/11**, utilizzando il branch `windows` del repository.

---

## 1. Requisiti

Prima di iniziare, assicurati di avere:

- Windows 10 o Windows 11 a 64 bit.
- [Git for Windows](https://git-scm.com/download/win).
- [Node.js 24 LTS](https://nodejs.org/), comprensivo di npm.
- Una connessione Internet.

### Strumenti aggiuntivi per la compilazione

Il progetto utilizza `better-sqlite3`, un modulo Node.js che include codice nativo.

Se npm non trova un binario precompilato compatibile e deve compilare il modulo, su Windows sono necessari:

- Python 3.
- Visual Studio Build Tools.
- Carico di lavoro **Desktop development with C++**, comprensivo di MSVC e Windows SDK.

Questi strumenti possono essere scaricati dai siti ufficiali:

- [Python](https://www.python.org/downloads/)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

Non è necessario installare l'intero ambiente Visual Studio: sono sufficienti i Build Tools con il carico di lavoro C++.

---

## 2. Clonare il repository

Apri PowerShell e spostati nella cartella in cui desideri installare il bot.

Per esempio:

```powershell
cd C:\HomeServer
```

Clona esclusivamente il branch Windows:

```powershell
git clone --branch windows --single-branch https://github.com/GabrielPro1/GG-bot.git GG-bot
```

Entra nella cartella del progetto:

```powershell
cd GG-bot
```

Verifica di essere sul branch corretto:

```powershell
git branch --show-current
```

Il risultato atteso è:

```text
windows
```

---

## 3. Installare le dipendenze

Dalla cartella principale del progetto esegui:

```powershell
npm install
```

Se utilizzi PowerShell e il comando `npm` non viene riconosciuto, puoi utilizzare direttamente:

```powershell
npm.cmd install
```

Attendi il completamento dell'installazione.

Per controllare le dipendenze installate:

```powershell
npm.cmd ls --depth=0
```

Se durante l'installazione compare un errore relativo a `better-sqlite3`, verifica che Python e i Visual Studio C++ Build Tools siano installati correttamente.

Puoi controllare Python con:

```powershell
python --version
```

Per verificare i compilatori, apri **Developer PowerShell for Visual Studio** ed esegui:

```powershell
cl
msbuild -version
```

Dopo aver installato gli strumenti mancanti, ripeti `npm install`.

---

## 4. Configurazione del file .env

Nella cartella principale del progetto è presente il file `.env.example`.

Crea una copia chiamata `.env`:

```powershell
Copy-Item .env.example .env
```

Apri il file con Blocco note:

```powershell
notepad .env
```

Il file contiene le variabili di configurazione del bot.

### Variabili principali

#### Telegram

```env
TELEGRAM_BOT_TOKEN=
```

Inserisci il token del bot Telegram se desideri attivare l'integrazione Telegram.

Se lasci il campo vuoto, il bot Telegram rimane disattivato. Il collegamento WhatsApp continua a funzionare.

#### Proprietari WhatsApp

```env
BOT_OWNERS=
```

Inserisci gli identificativi WhatsApp degli owner, separati da virgola.

Sono supportati gli identificativi LID e PN.

Esempio:

```env
BOT_OWNERS=1234@lid,999@s.whatsapp.net
```

#### Dashboard web

```env
DASHBOARD_PASSWORD=INSERISCI_UNA_PASSWORD_SICURA
DASHBOARD_PORT=3000
DASHBOARD_HOST=127.0.0.1
```

La password è obbligatoria: senza `DASHBOARD_PASSWORD` la dashboard non viene avviata.

Configurazione predefinita:

- Porta: `3000`.
- Host: `127.0.0.1`.
- Accesso: solo dal computer su cui gira il bot.

Per consentire l'accesso alla dashboard dalla rete locale, modifica l'host:

```env
DASHBOARD_PASSWORD=INSERISCI_UNA_PASSWORD_SICURA
DASHBOARD_HOST=0.0.0.0
```

Per compatibilità, se `DASHBOARD_PASSWORD` è vuota viene usata `DASHBOARD_TOKEN`.

Non esporre direttamente la dashboard su Internet. Per l'accesso remoto utilizza una soluzione sicura, ad esempio una VPN.

#### Minecraft Java (RCON)

Il comando `/mc` invia un comando alla console del server Minecraft Java tramite RCON. È riservato agli owner e richiede che bot e server siano sulla stessa macchina (o sulla stessa rete fidata).

Nel `server.properties` del server abilita RCON:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=INSERISCI_LA_PASSWORD_RCON
```

Poi configura il bot:

```env
MC_RCON_HOST=127.0.0.1
MC_RCON_PORT=25575
MC_RCON_PASSWORD=INSERISCI_LA_PASSWORD_RCON
```

Riavvia il server e il bot. Esempi:

```text
/mc list
/mc say Ciao dal bot
/mc whitelist add NomeGiocatore
```

RCON viaggia in chiaro: lascia `MC_RCON_HOST=127.0.0.1` e non aprire la porta `25575` verso Internet. Se `MC_RCON_PASSWORD` è vuota, `/mc` risponde che RCON non è configurato.

#### Google Gemini (AI)

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
```

La chiave API è facoltativa.

Se non viene inserita, il bot continua a funzionare, ma le funzionalità AI che dipendono da Gemini rimangono disattivate.

#### Livello dei log Baileys

```env
BAILEYS_LOG_LEVEL=silent
```

Valori disponibili:

- `silent`
- `error`
- `warn`
- `info`
- `debug`

Il valore predefinito è `silent`.

### Altre impostazioni

Il file `.env.example` contiene anche parametri opzionali per la gestione e il rendering dei PDF.

Puoi lasciarli ai valori predefiniti e modificarli successivamente, se necessario.

**Importante:** non condividere il file `.env` e non caricarlo su GitHub. Contiene token e informazioni private.

---

## 5. Avviare il bot

Dalla cartella principale del progetto esegui:

```powershell
npm start
```

In alternativa, su PowerShell:

```powershell
npm.cmd start
```

Durante il primo avvio:

1. Il bot inizializza il database SQLite.
2. Viene avviata la dashboard web.
3. Viene inizializzato il collegamento WhatsApp.
4. Nel terminale compare un QR code.

### Collegare WhatsApp

Dal telefono:

1. Apri WhatsApp.
2. Vai su **Dispositivi collegati**.
3. Seleziona **Collega un dispositivo**.
4. Inquadra il QR code mostrato nel terminale.

Al termine del collegamento, il bot dovrebbe mostrare:

```text
GG Bot connected.
```

La sessione WhatsApp viene salvata nella cartella `auth`.

Nei successivi avvii non sarà normalmente necessario scansionare nuovamente il QR code, perché Baileys riutilizzerà la sessione salvata.

**Non eliminare la cartella `auth`**, a meno che tu non voglia scollegare la sessione e configurare nuovamente il dispositivo.

---

## 6. Dashboard web

La dashboard è disponibile, per impostazione predefinita, all'indirizzo:

```text
http://127.0.0.1:3000
```

Mostra informazioni come:

- Stato della connessione WhatsApp.
- Tempo di attività del bot.
- Numero di sessioni.
- Numero di comandi.
- Giocatori e identità registrate.
- Utilizzo della RAM.
- Utilizzo del disco.
- Dimensione del database.
- Informazioni sul sistema.

Alla schermata di accesso dovrai inserire la password configurata in `DASHBOARD_PASSWORD` per visualizzare le statistiche.

---

## 7. Comandi disponibili

Il progetto mette a disposizione questi script npm:

| Comando | Descrizione |
|---|---|
| `npm start` | Avvia il bot |
| `npm run dev` | Avvia il bot in modalità sviluppo, con riavvio automatico al modificarsi dei file |
| `npm test` | Esegue i test automatici |

Su PowerShell, se necessario, utilizza `npm.cmd`:

```powershell
npm.cmd start
npm.cmd run dev
npm.cmd test
```

Per arrestare il bot, premi:

```text
CTRL + C
```

---

## 8. File e dati importanti

Durante l'esecuzione il bot crea e utilizza alcune cartelle:

| Cartella | Contenuto |
|---|---|
| `auth/` | Credenziali e sessioni WhatsApp |
| `data/` | Database SQLite e dati persistenti |
| `node_modules/` | Dipendenze Node.js |
| `libri/` | Libreria locale dei PDF |
| `logs/` | Eventuali file di log |

Il database principale si trova in:

```text
data/gg-bot.db
```

Le cartelle `auth/` e `data/` contengono informazioni importanti e devono essere incluse nei backup.

**Non condividere né pubblicare queste cartelle.**

---

## 9. Aggiornare il bot

Prima di aggiornare il progetto:

1. Arresta il bot.
2. Effettua un backup delle cartelle `auth/` e `data/`.
3. Apri PowerShell nella cartella del progetto.

Per aggiornare il branch Windows:

```powershell
git pull origin windows
```

Aggiorna le dipendenze:

```powershell
npm install
```

Esegui i test:

```powershell
npm test
```

Se i test terminano correttamente, puoi riavviare il bot:

```powershell
npm start
```

Se hai apportato modifiche personali ai file del progetto, verifica prima eventuali conflitti Git prima di eseguire il pull.

---

## 10. Sicurezza

Alcune precauzioni importanti:

- Non condividere il QR code WhatsApp.
- Non pubblicare la cartella `auth/`.
- Non pubblicare la cartella `data/`.
- Non caricare il file `.env` su GitHub.
- Non condividere token Telegram o chiavi API Gemini.
- Non esporre la dashboard direttamente su Internet.
- Non esporre RCON su Internet: `/mc` è riservato agli owner e può eseguire qualsiasi comando della console.
- Mantieni aggiornati Node.js e le dipendenze.

Il repository include un `.gitignore` che esclude già file e cartelle sensibili, tra cui `.env`, `auth/`, `data/`, `node_modules/` e i PDF locali.

Prima di ogni aggiornamento importante, esegui un backup dei dati.

---

## 11. Test automatici

Per verificare il corretto funzionamento dei test del progetto:

```powershell
npm test
```

Il comando esegue i test presenti nella cartella `tests/`.

---

## 12. Supporto

Per segnalare problemi, bug o richiedere miglioramenti, utilizza la sezione Issues del repository:

[GitHub Issues – GG-bot](https://github.com/GabrielPro1/GG-bot/issues)

---

**GG-bot – Windows branch**
