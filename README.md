# Alveare — il tavolo da D&D a esagoni

Portale per giocare a D&D in compagnia: una pagina per il **Master**, una per i **giocatori**.
Sito statico (nessuna build) + **Supabase** (database gratuito con aggiornamenti in tempo reale) + **Vercel** (hosting gratuito).

## Cosa fa

**Master** (`/master`)
- Stanze a nido d'ape: disegna muri, pavimento, terreno difficile e acqua; nebbia opzionale; punto di partenza.
- Mostri (bestiario + personalizzati), tesori, trappole e porte, tutti modificabili; ognuno può essere nascosto ai giocatori.
- Quest che aprono le porte: enigma, prova di caratteristica, oggetto-chiave.
- Tutto anche **casuale**: stanza casuale, dungeon di più stanze collegate (con porte, quest, chiavi, trappole), «riempi a caso», mostro/tesoro/trappola/quest casuali.
- Iniziativa e round, turno automatico dei mostri (si avvicinano e attaccano), danni/cura, tiri segreti.

**Giocatori** (`/player`)
- Creazione personaggio: 9 razze, 12 classi, tiro 4d6 o valori standard, PF/CA/velocità calcolati.
- **Movimento in base alla razza**: 5 ft = 1 esagono (nano 25 ft = 5 esagoni, elfo dei boschi 35 ft = 7…). Terreno difficile e acqua costano doppio.
- Attacchi e magie con **gittata in esagoni** evidenziata sulla mappa, linea di vista bloccata dai muri, magie ad area (palla di fuoco con fuoco amico), cure.
- Trappole nascoste (percezione automatica quando ci si avvicina, disarmo, tiro salvezza), forzieri, bottino dei mostri, pozioni, porte con enigmi.
- Dadi (d4…d100, vantaggio/svantaggio, formule come `2d6+3`) con registro condiviso.

## Messa online (circa 10 minuti)

### 1. Database su Supabase
1. Crea un progetto gratuito su <https://supabase.com>.
2. Apri **SQL Editor**, incolla tutto `supabase/schema.sql` e premi **Run**.
3. Apri **Project Settings → API** e copia *Project URL* e *anon public key*.
4. Incollali in `js/config.js`.

### 2. Sito su Vercel
Con GitHub: carica la cartella in un repository, poi su <https://vercel.com> → *Add New → Project* → importa il repository. Framework Preset: **Other**; nessun build command; Output Directory vuota.

Oppure da terminale, dentro la cartella: `npx vercel` (poi `npx vercel --prod`).

### 3. Prova in locale (facoltativo)
`npx serve .` e apri l'indirizzo mostrato. Non aprire i file con doppio clic: i moduli JavaScript richiedono un server.

## Come si gioca
1. Il Master apre la home, scrive il nome della campagna e preme **Crea**. **Salva la chiave del Master** (serve per rientrare da un altro dispositivo).
2. Il Master crea le stanze (o preme *Dungeon casuale*) e passa ai giocatori il **codice** di 6 caratteri.
3. I giocatori aprono la home, inseriscono il codice e creano il personaggio.
4. A inizio scontro: *Tira iniziativa*; a fine round: *Nuovo round* (ridà il movimento a tutti).

## Limiti da conoscere
- **Non è a prova di barare.** Chi conosce la chiave pubblica del database e il codice può leggere anche mostri nascosti, risposte agli enigmi e trappole. Va bene tra amici; per un uso pubblico servirebbero login e regole di accesso più strette.
- La chiave del Master non è leggibile dal browser, ma i dati di gioco sono modificabili da chiunque abbia il codice.
- Regole semplificate: niente slot incantesimo, niente limite di azioni per turno (è il Master a regolare il ritmo), le trappole scattano solo dove ci si ferma.
- Se un aggiornamento in tempo reale si perde, la pagina si risincronizza da sola ogni 45 secondi.

## Struttura
- `index.html`, `master.html`, `player.html`: le tre pagine.
- `js/rules.js`: razze, classi, armi, magie, bestiario, trappole, enigmi (qui si personalizza il gioco).
- `js/hex.js`: geometria a esagoni, percorsi e linea di vista. `js/board.js`: la mappa SVG.
- `js/combat.js`: attacchi, magie, trappole, porte, quest. `js/random.js`: generatori casuali.
- `js/db.js`: collegamento a Supabase. `supabase/schema.sql`: tabelle e funzioni.
