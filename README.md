# La Smorfia di Nuffle — GitHub Pages + Supabase

App statica da zero per la tombola Blood Bowl del BolognaBowl. I giocatori non devono creare account. Le cartelle e le spunte sono condivise tra tutti tramite Supabase Realtime.

## Cosa include

- Pagina introduttiva natalizia e navigazione Home / Cartelle / Eventi / Organizzatore.
- 30 eventi, 6 per cartella, fino a 100 cartelle.
- Generazione con distribuzione bilanciata degli eventi.
- Spunte globali atomiche: un evento segnato da un giocatore si aggiorna su tutte le cartelle e su tutti i dispositivi.
- Link condivisibili per aprire una specifica cartella.
- Area organizzatore con codice verificato esclusivamente da una Supabase Edge Function.
- Nessuna registrazione o login per i partecipanti.

## 1. Crea il progetto Supabase

1. Crea un progetto su https://supabase.com/.
2. Apri **SQL Editor → New query**.
3. Incolla ed esegui tutto `supabase/schema.sql`.
4. Vai in **Project Settings → API** e copia:
   - Project URL
   - anon / public key

La anon key è pubblica e può stare in `config.js`. Non inserire mai nel frontend la `service_role` key.

## 2. Configura l'app

Apri `config.js` e sostituisci i due valori segnaposto:

```js
window.NUFFLE_CONFIG = {
  SUPABASE_URL: "https://TUO-PROGETTO.supabase.co",
  SUPABASE_ANON_KEY: "LA-TUA-ANON-PUBLIC-KEY"
};
```

## 3. Configura il codice organizzatore

Serve Supabase CLI. Installa la CLI seguendo la guida ufficiale:
https://supabase.com/docs/guides/cli

Dalla cartella principale del progetto esegui:

```bash
supabase login
supabase link --project-ref TUO_PROJECT_REF
supabase secrets set ORGANIZER_CODE="INSERISCI-UN-CODICE-LUNGO-E-IMPREVEDIBILE"
supabase functions deploy generate-game --no-verify-jwt
```

La funzione usa automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` del progetto Supabase. Questi segreti restano sul server e non vanno mai inseriti in GitHub o in `config.js`.

**Importante:** scegli un codice lungo e non riutilizzato altrove. Chi conosce il codice può rigenerare le cartelle e azzerare la partita.

## 4. Pubblica su GitHub Pages

1. Crea un repository GitHub, per esempio `smorfia-di-nuffle`.
2. Carica tutti i file e le cartelle di questo progetto nella root del repository.
3. Vai in **Settings → Pages**.
4. In **Build and deployment**, scegli **Deploy from a branch**.
5. Seleziona branch `main` e cartella `/ (root)`, poi Save.
6. Attendi la pubblicazione: GitHub mostrerà l'indirizzo del sito.

Non è necessario un build step: è una pagina HTML/CSS/JS statica.

## 5. Test consigliato prima dell'evento

1. Apri il sito e accedi all'area Organizzatore.
2. Genera 10 cartelle.
3. Apri il sito da un secondo browser o telefono.
4. Apri la stessa cartella o la sezione Eventi e segna un evento: deve aggiornarsi anche sull'altro dispositivo.
5. Prova a rigenerare le cartelle e verifica che le vecchie cartelle non siano più disponibili.

## Sicurezza e limiti

- Le tabelle consentono lettura pubblica ma non scrittura diretta dal browser.
- Le spunte passano da una funzione SQL atomica che accetta soltanto ID evento da 1 a 30.
- Generazione e azzeramento passano da una Edge Function che controlla il codice organizzatore lato server e usa la service role key solo sul server.
- La pagina non implementa un sistema di account o di identità personale.
- Il codice organizzatore resta nella memoria della pagina finché l'organizzatore non esce o ricarica.
- Il piano gratuito di Supabase può avere limiti di utilizzo e può cambiare nel tempo: controlla la dashboard del progetto prima dell'evento.
- GitHub Pages serve il sito statico; non è il database.

## File principali

- `index.html`, `styles.css`, `app.js`: app.
- `config.js`: URL e anon key pubblica.
- `supabase/schema.sql`: tabelle, RLS, funzione di toggle e Realtime.
- `supabase/functions/generate-game/index.ts`: endpoint protetto per amministrazione.
- `supabase/config.toml`: configurazione Edge Function.
