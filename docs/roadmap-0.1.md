# CoLector 0.1 — Roadmap implementace prototypu

## 1. Princip

CoLector má převést pracovní kartičku z papíru do jednoduchého digitálního toku:

`editor formuláře → vlastní Google Sheet → QR distribuce → tým vyplní → data se zapíší → lektor je vidí → export / další zpracování`

M1 a M2 již ověřily základní technický vertical slice:

`QR → mobilní formulář → submit → Google Apps Script → Google Sheets`

Další vývoj proto pokračuje od editoru formulářů a cílového datového modelu.

## 2. Technický baseline

- Frontend: HTML + CSS + vanilla JavaScript
- Backend/runtime: Google Apps Script
- Datová vrstva: Google Sheets
- Hosting: Google Apps Script Web App
- Source of truth: GitHub
- Pracovní prostředí: Replit Free
- Deploy: `GitHub → Replit → npx @google/clasp → Apps Script → Web App deployment`
- Účty účastníků: ne
- Vlastní databáze: ne
- Placená infrastruktura: ne

## 3. Kanonický datový model

### Formulář

Každý formulář má stabilní `form_id` a kanonické `form_schema`.

Minimální struktura:

```json
{
  "form_id": "...",
  "title": "Kompetence",
  "instructions": "...",
  "fields": [
    {
      "id": "teacher_view",
      "type": "textarea",
      "label": "Pohled učitele",
      "required": false
    }
  ]
}
```

### Google Sheet formuláře

Každý vytvořený formulář má vlastní Google Spreadsheet.

Hlavní list `ODPOVĚDI` je human-readable:

| Tým | pole 1 | pole 2 | pole 3 |
|---|---|---|---|
| Tým 1 | ... | ... | ... |
| Tým 2 | ... | ... | ... |

Pravidla:

- sloupce = pole formuláře,
- řádky = týmy / odevzdání,
- počet týmů není předem znám,
- technická metadata nejsou součástí hlavního pohledu.

Technický list `_META` může obsahovat zejména:

- `form_id`
- `team_id`
- `response_id`
- `timestamp`
- `source` (`online` / `offline_qr`)
- verzi schématu

Současný prototypový list `RESPONSES` s `data_json` je technický mezikrok M2, nikoli cílové UX.

## 4. Identita týmu

Počet týmů se předem nenastavuje.

Při prvním otevření formuláře na zařízení vznikne stabilní `team_id`, který se uloží lokálně v prohlížeči. Refresh nesmí vytvořit nový tým.

Server při prvním přijetí nového `team_id` přiřadí čitelné označení:

`team_id → Tým 1 / Tým 2 / Tým 3 ...`

Online i offline QR cesta musí používat stejné `team_id` a skončit ve stejném datasetu.

## 5. Milestone M0 — Scope a architektura

Stav: HOTOVO / průběžně aktualizováno.

Výstup:

- scope CoLector 0.1,
- Apps Script + Sheets architektura,
- bez vlastní DB,
- bez účtů účastníků,
- definice online a offline toku.

## 6. Milestone M1 — QR → mobilní formulář

Stav: HOTOVO.

Ověřeno:

- veřejná Web App URL,
- mobilní vykreslení kartičky,
- QR / URL otevře správný formulář,
- mobile-first viewport funguje.

## 7. Milestone M2 — Online submission → Google Sheets

Stav: HOTOVO jako technický vertical slice.

Ověřeno:

- submit formuláře,
- `response_id`,
- timestamp,
- `source=online`,
- zápis do Google Sheets,
- základní idempotence.

Poznámka: M2 používá dočasný technický formát `RESPONSES + data_json`. Ten bude nahrazen cílovým per-form Spreadsheet modelem.

# DALŠÍ HLAVNÍ OSA VÝVOJE

## 8. Milestone M3 — Editor formulářů

Cíl:

Zdenda vytvoří nový formulář bez zásahu do kódu, JSON nebo Google Sheets.

### M3.1 — Minimální editor

Editor umožní:

- název formuláře,
- instrukční text,
- přidat pole,
- upravit pole,
- smazat pole,
- změnit pořadí nahoru / dolů,
- označit pole jako povinné / volitelné,
- náhled formuláře,
- uložit formulář.

Podporované typy polí pro první verzi:

- krátký text,
- dlouhý text,
- checkbox,
- jednoduchý výběr možností.

Výslovně bez drag-and-drop page builderu.

### M3.2 — `form_schema`

Editor nesmí přímo generovat HTML jako zdroj pravdy.

Výstupem editoru je kanonické `form_schema`, ze kterého se následně generuje participant formulář i hlavička Google Sheet.

### M3.3 — Persistence formulářů

Uložený formulář musí mít:

- stabilní `form_id`,
- `title`,
- `instructions`,
- `schema_json`,
- stav aktivní / neaktivní,
- datum vytvoření / úpravy.

Exit criterion M3:

Zdenda vytvoří nový formulář od nuly, uloží jej a participant view se správně vykreslí ze stejného `form_schema`.

## 9. Milestone M4 — Per-form Google Sheet

Cíl:

Po vytvoření formuláře automaticky vytvořit jeho vlastní human-readable Google Spreadsheet.

Výstup:

- vazba `form_id → spreadsheet_id`,
- list `ODPOVĚDI`,
- první sloupec `Tým`,
- další sloupce podle pořadí polí ve `form_schema`,
- technický list `_META`,
- odkaz „Otevřít Google Sheet“ v CoLectoru.

Exit criterion:

Nově vytvořený formulář má bez ručního zásahu vlastní správně strukturovaný Google Sheet.

## 10. Milestone M5 — Dynamické týmy + zápis odpovědí

Cíl:

Napojit existující funkční submit na nový per-form datový model.

Výstup:

- generování stabilního `team_id` na zařízení,
- persistence `team_id` přes refresh,
- serverové přiřazení `Tým N`,
- jeden řádek v `ODPOVĚDI` = jeden tým,
- hodnoty odpovědí v samostatných čitelných sloupcích,
- technická metadata v `_META`,
- ochrana proti duplicitám přes `response_id`.

Exit criterion:

Více zařízení otevře stejný QR, automaticky vzniknou Tým 1, Tým 2, ... a jejich odpovědi se propíší do správných řádků a sloupců.

## 11. Milestone M6 — Distribuce formuláře

Cíl:

Z editoru / seznamu formulářů jedním krokem formulář rozdat.

Výstup:

- akce „Rozdat formulář“,
- QR s URL konkrétního `form_id`,
- kopírovatelný odkaz,
- režim vhodný pro projekci / iPad.

Exit criterion:

Zdenda vytvoří formulář a bez technického kroku jej okamžitě rozdá skupinám.

## 12. Milestone M7 — Import / export formulářů

Import/export formulářů pracuje s definicí formuláře, nikoli s nasbíranými odpověďmi.

Výstup:

- export `form_schema` do přenosného JSON,
- import validního JSON,
- nové `form_id` při importu / duplikaci,
- validace verze schématu,
- možnost duplikovat formulář.

Exit criterion:

Formulář lze přenést nebo znovu použít bez ruční rekonstrukce.

## 13. Milestone M8 — Vizualizace dat v CoLectoru

Cíl:

Zdenda nemusí kvůli průběžné práci otevírat Google Sheets.

Výstup:

- počet přijatých týmů,
- tabulka odpovědí,
- zobrazení po týmech,
- případně zobrazení po otázkách,
- refresh / jednoduchý polling,
- odkaz na zdrojový Google Sheet.

Později lze přidat jednoduché grafy pouze tam, kde dávají smysl pro konkrétní typ pole.

Exit criterion:

Lektor během workshopu vidí aktuální dataset přímo v CoLectoru.

## 14. Milestone M9 — Offline QR fallback

Cíl:

Zachovat nouzovou cestu při absenci internetu.

Tok:

`vyplněný formulář → Předat přes QR → payload s form_id/team_id/response_id/data → lektor načte → zápis do stejného Google Sheet`

Požadavky:

- verzovaný payload,
- `form_id`,
- `team_id`,
- `response_id`,
- odpovědi,
- `source=offline_qr`,
- idempotence,
- jasný limit délky.

V 0.1 se nebude implementovat multi-QR transport dlouhých payloadů.

## 15. Milestone M10 — Export výsledků

Toto je jiný export než export formuláře.

Výstup:

- otevřít / sdílet Google Sheet,
- kopírovat dataset,
- CSV / tabulkový export podle potřeby,
- jednoduchý text / Markdown pro další zpracování.

Exit criterion:

Po workshopu lze celý čistý dataset získat bez přepisu a bez technických mezikroků.

## 16. Milestone M11 — Workshop test a stabilizace

Testovat:

- Android + iPhone,
- více zařízení současně,
- refresh stránky,
- opakované submitnutí,
- různé počty týmů,
- slabé připojení,
- online i offline cestu,
- správnou strukturu Sheet.

Cílové chování:

> Zdenda vytvoří formulář → zobrazí QR → libovolný počet týmů jej otevře → vyplní → data se objeví v čitelném Sheet a v CoLectoru.

## 17. Post-0.1 — AI zpracování a report

AI není podmínkou hotového sběrného modulu 0.1.

Po stabilizaci sběru lze přidat další vrstvu:

`Google Sheet / normalizovaný dataset → AI analýza → strukturovaný výstup → report`

Možné funkce:

- tematické třídění,
- shrnutí,
- porovnání týmů,
- identifikace opakujících se témat,
- návrh závěrů,
- generování reportu,
- export reportu do DOCX/PDF nebo jiného cílového formátu.

AI vrstva musí pracovat nad stabilním datovým kontraktem; nesmí určovat strukturu sběru.

## 18. Aktuální pořadí práce

```text
M0 architektura                 HOTOVO
↓
M1 QR → mobilní formulář       HOTOVO
↓
M2 submit → Sheets             HOTOVO (technický vertical slice)
↓
M3 EDITOR FORMULÁŘŮ            ← AKTUÁLNÍ
↓
M4 per-form human-readable Sheet
↓
M5 dynamické týmy + zápis
↓
M6 distribuce QR
↓
M7 import/export formulářů
↓
M8 vizualizace dat
↓
M9 offline QR fallback
↓
M10 export výsledků
↓
M11 workshop test / stabilizace
↓
AI zpracování + report
```

## 19. Vývojový workflow

Aktuální opakovatelný tok:

`ChatGPT → GitHub → Replit → npx -y @google/clasp@latest push → Apps Script → nová Web App verze → mobilní test`

GitHub je kanonický source of truth. Apps Script je deployment target.

## 20. Nejbližší implementační krok

Začít M3.1 — minimálním editorem formulářů.

První implementace nemá řešit celý management formulářů. Má vytvořit jedinou lektorskou obrazovku, na které lze:

1. zadat název a instrukci,
2. přidávat / upravovat / mazat / řadit pole,
3. vidět náhled,
4. získat validní `form_schema`.

Teprve po ověření editoru se napojí persistence a automatické vytvoření Google Sheet.
