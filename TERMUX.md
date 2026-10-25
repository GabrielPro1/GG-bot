# Hosting su Termux (proot Ubuntu)

Questa guida copre l'avvio di GG Bot su Android con Termux + `proot-distro`.
Il branch `windows` resta la configurazione "normale" (`npm start`); questo
branch `termux` aggiunge solo script e istruzioni per l'ambiente Android.

## Perché servono gli script

Il progetto sta su `/sdcard` (`/mnt/sdcard`), che è FUSE e montato **noexec**.
Node non riesce a fare `dlopen` dei moduli nativi (`better-sqlite3`,
`@napi-rs/canvas`) e fallisce con:

```
failed to map segment from shared object
```

Soluzione: il progetto resta su `/sdcard`, ma `node_modules` vive in una
directory eseguibile del proot (`/root/GG-Bot-node_modules`) e viene montato
dentro il progetto come `node_modules`: lo vedi e lo usi lì, accanto al codice,
senza gestire a mano la cartella in `/root`.

Inoltre il `pm2` di Termux gira con Node Bionic e non carica gli addon glibc,
quindi il processo del bot deve girare dentro il proot Ubuntu.

## Prerequisiti

- Termux con `proot-distro` e una distro Ubuntu installata.
- Node.js e le dipendenze installate **dentro** il proot, non copiate da Windows.
- `curl` e `tar` disponibili nel proot.

## Setup una tantum

Da Termux:

```bash
pkg install proot-distro
proot-distro install ubuntu
proot-distro login ubuntu
```

Dentro il proot:

```bash
apt update && apt install -y nodejs npm curl tar
cd /sdcard/Documents/GG-Bot

# Installa dalla cartella del progetto: start.sh monta node_modules dentro
# il progetto, quindi npm scrive lì come in un progetto normale.
# Ripeti: ogni tentativo conserva in cache i pacchetti già presi.
for i in 1 2 3 4 5 6; do
    echo "=== tentativo $i ==="
    UV_THREADPOOL_SIZE=1 sh ./start.sh npm install --maxsockets 1 --no-audit --no-fund && break
    sleep 2
done
```

Da fuori `node_modules` è dentro `/sdcard/Documents/GG-Bot`, accanto al codice.
Fisicamente i file stanno in `/root/GG-Bot-node_modules`, perché `/sdcard` è
noexec: il bind mount li rende visibili al progetto. Non devi gestire la
cartella in `/root` a mano: ci pensa `start.sh`.

Non copiare `node_modules` da Windows: i binding nativi sono per un'altra
piattaforma.

`start.sh` accetta anche un comando da eseguire nella cartella del progetto,
con le dipendenze già montate:

```bash
sh ./start.sh npm install
sh ./start.sh node index.js
```

Se hai già un `node_modules` funzionante (contiene
`node_modules/better-sqlite3/package.json` e `node_modules/@napi-rs/`), puoi
saltare l'installazione e passare direttamente all'avvio.

### Errore `ENOENT ... _cacache/tmp` durante `npm install`

È un bug noto di proot con Node multithread
(<https://github.com/termux/proot/issues/326>), non un problema del progetto,
della cache o dello spazio disco.

Il ciclo di tentativi qui sopra è il workaround: ogni esecuzione conserva i
pacchetti già scaricati, quindi i buchi diminuiscono. Se dopo 6 tentativi non
è finito, rilancia lo stesso `for`.

Puoi anche aumentare i retry e ridurre ancora la concorrenza:

```bash
cd /sdcard/Documents/GG-Bot
UV_THREADPOOL_SIZE=1 sh ./start.sh npm install --maxsockets 1 --fetch-retries 10 \
    --no-audit --no-fund
```

### Se npm non riesce proprio

`node_modules` va costruito su Linux ARM64 fuori da proot e poi copiato in
`/root/GG-Bot-node_modules`. Le strade pratiche sono due:

1. un runner GitHub Actions `ubuntu-24.04-arm` che esegue `npm ci` e pubblica
   `node_modules` come artifact;
2. una macchina Linux ARM64 con la stessa versione di Node.

In entrambi i casi il risultato va copiato in `/root/GG-Bot-node_modules`.

## Avvio manuale

Dentro il proot:

```bash
cd /sdcard/Documents/GG-Bot
sh ./start.sh
```

`start.sh` crea `/root/GG-Bot-node_modules` se manca, monta la cartella su
`./node_modules` e lancia `node index.js`.

## Avvio con pm2

Il `pm2` va usato da Termux (non dal proot) e lancia `run-pm2.sh`, che entra
nel proot ed esegue `start.sh`:

```bash
cd /sdcard/Documents/GG-Bot
pm2 start run-pm2.sh --name gg-bot --interpreter bash
pm2 save
```

Comandi utili:

```bash
pm2 status
pm2 logs gg-bot
pm2 restart gg-bot
```

## Binding nativo mancante (PDF e immagini)

Sintomo:

```
Cannot find native binding
```

oppure `/mandapag` risponde con "motore di rendering non disponibile".
Manca `@napi-rs/canvas-linux-arm64-gnu`.

Dentro il proot:

```bash
cd /sdcard/Documents/GG-Bot
sh ./fix-native.sh
```

Lo script scarica il pacchetto dalla registry npm e lo estrae in
`/root/GG-Bot-node_modules/@napi-rs/canvas-linux-arm64-gnu` (visibile anche
come `node_modules/@napi-rs/canvas-linux-arm64-gnu`). Per forzare
una versione diversa:

```bash
CANVAS_NATIVE_VERSION=0.1.100 sh ./fix-native.sh
```

Verifica:

```bash
node -e "import('@napi-rs/canvas').then(() => console.log('canvas ok'))"
```

## Verifica end-to-end

Dentro il proot, dalla cartella del progetto:

```bash
node -e "
import('./lib/pdf/sender.js').then(async ({ PdfSender }) => {
  const { getPdfConfig } = await import('./lib/pdf/pdf-library.config.js');
  const sender = new PdfSender(getPdfConfig());
  const sent = [];
  const res = await sender.sendPageRange({
    bookQuery: 'libro di prova',
    spec: { start: 1, end: 1 },
    sendImage: async (buffer) => sent.push(buffer.length),
  });
  console.log(res, sent);
});
"
```

Risultato atteso: `ok: true`, `sentPages: [1]`, `failedPages: []` e un JPEG
di alcune decine di KB. Il comando presume che `libri/libro-di-prova.pdf`
esista: se non c'è, copia un PDF qualsiasi nella cartella `libri/` e cambia
`bookQuery`.

## Caveat

- Il bind mount vale per la sessione: se lanci `node index.js` a mano da una
  nuova sessione senza `start.sh`, l'errore `failed to map segment` torna.
- Non copiare `node_modules` da Windows.
- `npm install` nel proot può fallire per il bug di proot: usa il ciclo di
  tentativi descritto sopra, oppure `fix-native.sh` se manca solo il binding.
- Usa `npm install`, non `npm ci`: `npm ci` cancella `node_modules`, che qui è
  un punto di mount.
- `/root/GG-Bot-node_modules` è dentro la rootfs del proot: se reinstalli la
  distro sparisce, ma si ricrea con `npm install`. Il progetto e i dati
  restano su `/sdcard`.
- La cache PDF vive in `data/pdf-cache` (gitignored) e va bene anche su
  `/sdcard`, perché non viene eseguita.

## File di questo branch

| File            | Dove gira        | Scopo                                          |
| --------------- | ---------------- | ---------------------------------------------- |
| `start.sh`      | proot Ubuntu     | monta `node_modules` nel progetto + `node index.js` |
| `run-pm2.sh`    | Termux           | entra nel proot e lancia `start.sh`            |
| `fix-native.sh` | proot Ubuntu     | installa il binding ARM64 di `@napi-rs/canvas` |
