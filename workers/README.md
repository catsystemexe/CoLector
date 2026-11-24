# Paralelní CoLector na Cloudflare Workers a D1

Tato verze vychází z větve `feature/local-first-sync` na revizi `baeee0a`. Sestavení používá stávající HTML a obsah editoru z adresáře `apps-script`. Ten zůstává zdrojovým kódem původní aplikace i vzhledu pilotu. Při sestavení se adaptéry Apps Scriptu nahradí same-origin HTTP API. Trasy pro účastníky a lektora zůstávají ve stejném formátu na nové doméně.

## Lokálně

Vyžaduje Node.js 22 nebo novější.

```sh
cd workers
npm ci
printf 'ADMIN_PASSWORD="%s"\n' "$(openssl rand -base64 32)" > .dev.vars
npx wrangler d1 migrations apply colector-v2 --local
npm test
npm run dev
```

Na `http://localhost:8787/` otevři Home a přihlas se heslem z `.dev.vars`. Odkaz z QR v anonymním okně funguje bez přihlášení. Při testu na dalším zařízení použij veřejné pilotní nasazení.

## Vlastní bezplatné pilotní nasazení

V účtu Cloudflare Free vytvoř samostatnou D1 a doplň její ID v lokální kopii konfigurace. Zachovej stejné jméno Workeru a subdoménu účtu pro další nasazení.

```sh
npx wrangler login
npx wrangler d1 create colector-v2
cp wrangler.jsonc wrangler.local.jsonc
# Do wrangler.local.jsonc doplň database_id z výstupu předchozího příkazu.
npx wrangler d1 migrations apply colector-v2 --remote --config wrangler.local.jsonc
npm run deploy -- --config wrangler.local.jsonc
npx wrangler secret put ADMIN_PASSWORD --config wrangler.local.jsonc
```

Heslo pro lektora ulož do Worker Secret a použij alespoň 24 znaků s vysokou entropií. Operator má jednu přihlašovací relaci s platností 14 dní. Protočením hesla zneplatníš existující relace. Účastník použije pouze odkaz z QR, veřejné API zpřístupňuje jednotlivé části publikovaného formuláře a přijímá odpovědi.

### Google Sheets

Export je samostatná trvalá fronta v D1 a běží přes Cron Trigger každých pět minut. Session otevře vytvořený soubor nebo umožní ručně spustit nový pokus po chybě. Chyba Google API nemá vliv na přijetí odpovědi. Aplikace zapisuje tabulku `ODPOVĚDI` jako generovaný výstup. Vlastní analýzy a ruční úpravy je vhodné dělat v samostatném listu.

Pro pilot použij samostatnou složku Drive s oprávněním Zdendy. OAuth klient musí mít v Google Cloud zapnuté Google Drive API a Google Sheets API. Vytvoř offline uživatelský OAuth grant účtu, který smí v této složce vytvářet soubory. Scope `https://www.googleapis.com/auth/drive` dává účtu přístup k jeho Drive. Užší `drive.file` se hodí, když už aplikace získala přístup ke zvolené složce. Pro trvalejší nasazení ověř, že refresh token nepochází z krátkodobého režimu Testing.

Přidej čtyři hodnoty jako Worker Secrets přes `npx wrangler secret put NÁZEV --config wrangler.local.jsonc`.

- `GOOGLE_EXPORT_FOLDER_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

### Převzetí formulářů a šablon

Skript přijme read-only JSON odpověď z Google Sheets `spreadsheets.values.batchGet` s rozsahy `FORMS!A:I` a `TEMPLATES!A:F`. Přijímá také stejné tabulkové hodnoty v objektu s klíči `FORMS` a `TEMPLATES`. První řádek musí být hlavička. Časy v ISO formátu přenese, pro jiný formát použije čas vytvoření importního souboru. Záznamy se stejným ID v cílové databázi přeskočí.

```sh
node scripts/import-legacy.mjs /bezpecna/cesta/snapshot.json > /bezpecna/cesta/import.sql
npx wrangler d1 execute colector-v2 --local --file /bezpecna/cesta/import.sql
```

Pro ověřenou pilotní D1 použij `--remote --config wrangler.local.jsonc`. Importované formuláře vstupují jako drafty. Rozdané QR, probíhající a historické odpovědi zůstávají v původním nasazení a tabulkách. Uchovávej export a snapshot mimo repozitář.

## Před výměnou ikony

Proveď jeden pilot přes produkční testovací URL na iPhonu. Ověř spuštění ikony z kořenové adresy, přihlášení, práci s draftem a šablonou, distribuci přes QR, opakování odeslání, Session a skutečný zápis do zvolené Google složky. Přechod naplánuj mezi workshopy. Na nové adrese se ikona přidává jednou z kořenové stránky v Safari.
