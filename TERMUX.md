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

Soluzione: `node_modules` vive in una directory eseguibile del proot
(`/root/GG-Bot-node_modules`) e viene collegato al progetto con un bind mount
ricreato a ogni avvio.

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
mkdir -p /root/GG-Bot-node_modules
cp package.json package-lock.json /root/GG-Bot-node_modules/
npm install --prefix /root/GG-Bot-node_modules
```

Il progetto resta su `/sdcard`, ma le dipendenze no. La copia di
`package*.json` serve perché `npm --prefix` legge il manifest dalla directory
di destinazione. Non copiare `node_modules` da Windows: i binding nativi sono
per un'altra piattaforma.

Se `npm install` dentro il proot fallisce con `ENOENT ... _cacache/tmp`,
evita reinstallazioni cieche e ripara solo il binding mancante con
`fix-native.sh` (vedi sotto).

## Avvio manuale

Dentro il proot:

```bash
cd /sdcard/Documents/GG-Bot
sh ./start.sh
```

`start.sh` controlla che `/root/GG-Bot-node_modules` esista, ricrea il bind
mount su `./node_modules` e lancia `node index.js`.

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
`/root/GG-Bot-node_modules/@napi-rs/canvas-linux-arm64-gnu`. Per forzare una
versione diversa:

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
- `npm install` nel proot può essere rotto: preferisci `fix-native.sh` per
  riparare i binding.
- La cache PDF vive in `data/pdf-cache` (gitignored) e va bene anche su
  `/sdcard`, perché non viene eseguita.

## File di questo branch

| File            | Dove gira        | Scopo                                          |
| --------------- | ---------------- | ---------------------------------------------- |
| `start.sh`      | proot Ubuntu     | bind mount di `node_modules` + `node index.js` |
| `run-pm2.sh`    | Termux           | entra nel proot e lancia `start.sh`            |
| `fix-native.sh` | proot Ubuntu     | installa il binding ARM64 di `@napi-rs/canvas` |
