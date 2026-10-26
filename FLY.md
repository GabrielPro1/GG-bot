# Hosting su Fly.io

Questa guida sposta GG Bot dal telefono a una macchina Fly.io sempre accesa.
Il progetto gira in un container Linux con un volume persistente per `auth/`,
`data/` e `libri/`.

Fly.io non ha un piano gratuito per i nuovi account: serve una carta. Il costo
di una macchina con 1 GB di RAM e un volume da 1 GB è di pochi dollari al mese.

## Cosa c'è nel repository

| File                  | Scopo                                                        |
| --------------------- | ------------------------------------------------------------ |
| `Dockerfile`          | Node 22 su Debian, installa le dipendenze native             |
| `docker-entrypoint.sh`| crea `auth/`, `data/` e `libri/` sul volume prima di partire |
| `fly.toml`            | una sola macchina, volume in `/data`, niente HTTP            |
| `.dockerignore`       | esclude segreti, PDF locali e cartelle runtime dal build     |

Il QR di primo accesso viene salvato in `/data/qr.png` (variabile
`QR_IMAGE_PATH` in `fly.toml`), così puoi scaricarlo e inquadrarlo.

## 1. Installa flyctl (Windows)

In PowerShell:

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Chiudi e riapri il terminale, poi:

```powershell
fly version
fly auth signup    # oppure: fly auth login
```

## 2. Crea l'app

Scegli un nome unico (minuscolo, trattini):

```powershell
fly apps create gg-bot-tuonome
```

Apri `fly.toml` e sostituisci la riga:

```toml
app = "gg-bot-tuonome"
```

con il nome appena creato.

## 3. Crea il volume

```powershell
fly volumes create gg_bot_data --region fra --size 1
```

`fra` (Francoforte) va bene dall'Italia. Se i PDF sono tanti, aumenta `--size`.

## 4. Imposta i segreti

Solo quelli che usi:

```powershell
fly secrets set TELEGRAM_BOT_TOKEN="..." GEMINI_API_KEY="..." BOT_OWNERS="..."
```

`GEMINI_MODEL` è opzionale. Senza token Telegram il bot WhatsApp funziona lo
stesso.

## 5. Ferma il bot sul telefono

WhatsApp accetta una sola sessione per account: due istanze collegate insieme
si scollegano a vicenda (`connectionReplaced`).

```bash
pm2 stop gg-bot
```

## 6. Deploy

Dal PC, nella cartella del progetto:

```powershell
fly deploy --ha=false
```

- `--ha=false` evita la seconda macchina che Fly creerebbe di default.
- `strategy = "immediate"` in `fly.toml` sostituisce la macchina senza tenere
  due sessioni WhatsApp in parallelo.

Controlla che ci sia **una sola** macchina:

```powershell
fly status
fly logs
```

Se ne vedi due:

```powershell
fly scale count 1
```

## 7. Primo accesso con il QR

Nei log compare:

```text
QR code saved to /data/qr.png
```

Scaricalo e aprilo:

```powershell
fly sftp get /data/qr.png qr.png
start qr.png
```

Poi scansiona da WhatsApp → **Dispositivi collegati**.

Se `qr.png` esiste già, cancellalo prima: `fly sftp get` non sovrascrive i
file locali.

Dopo la scansione, nei log deve comparire `GG Bot connected.`. La sessione
resta nel volume: ai riavvii successivi il QR non serve più.

Puoi eliminare il PNG dal server:

```powershell
fly ssh console -C "rm -f /data/qr.png"
```

## 8. Carica i PDF

I PDF non sono nel repository. Copiali nel volume:

```powershell
Get-ChildItem libri\*.pdf | ForEach-Object {
    fly sftp put $_.FullName "/data/libri/$($_.Name)"
}
```

Verifica:

```powershell
fly ssh console -C "ls -lh /data/libri"
```

## 9. Aggiornamenti

```powershell
git pull
fly deploy --ha=false
```

Il volume non viene toccato: `auth/`, database e PDF restano.

## 10. Comandi utili

```powershell
fly logs
fly status
fly ssh console
fly scale memory 2048          # se il rendering PDF finisce la RAM
fly apps destroy gg-bot-tuonome
```

`fly apps destroy` elimina anche il volume: usalo solo se vuoi ripartire da zero.

## Alternativa: copiare la sessione dal telefono

Se non vuoi scansionare il QR, puoi riusare `auth/` del telefono. Ferma prima
il bot su Termux, crea un archivio e portalo sul PC (USB, cloud, quello che
preferisci):

```bash
cd /sdcard/Documents/GG-Bot
tar czf /sdcard/Download/auth.tgz auth
```

Poi caricalo sul volume:

```powershell
fly sftp put auth.tgz /data/auth.tgz
fly ssh console -C "tar xzf /data/auth.tgz -C /data"
```

`tar` è già presente nell'immagine.

## Problemi comuni

- **`connectionReplaced`**: c'è un'altra istanza collegata (telefono o seconda
  macchina). Ferma il telefono e controlla `fly scale count 1`.
- **OOM durante `/mandapag`**: `fly scale memory 2048`, poi `fly deploy --ha=false`.
- **`Cannot find native binding`**: il pacchetto `@napi-rs/canvas` sbagliato.
  Rifai `fly deploy --ha=false --no-cache` e controlla i log del build.
- **Il QR non compare**: verifica `QR_IMAGE_PATH` in `fly.toml` e i log per
  errori di scrittura sul volume.
- **Sessione persa a ogni deploy**: il volume non è montato. Controlla
  `fly volumes list` e che `destination = "/data"` corrisponda.
