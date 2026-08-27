# CoLector 0.1 — Architektura prototypu digitálních kartiček

## 1. Cíl

CoLector 0.1 digitalizuje pracovní kartičky používané při školení tak, aby účastníci vyplňovali jednoduchý mobilní formulář a lektor získal okamžitě čitelný dataset bez focení, OCR a ručního přepisu.

Hlavní produktový tok:

`lektor vytvoří formulář → vznikne formulář + jeho Google Sheet → lektor rozdá jeden QR → týmy vyplní → online nebo offline QR předání → odpovědi se zapisují do human-readable tabulky`

AI není součástí CoLectoru 0.1. Následná analýza probíhá až nad sesbíranými daty mimo aplikaci.

## 2. Základní entita: formulář / kartička

Kartička je malé schéma formuláře skládající se z bloků pod sebou. Obsah a počet polí nejsou předem pevné.

Podporované prvky 0.1:

- nadpis,
- instrukční text,
- krátký text,
- dlouhý text,
- checkbox,
- jednoduchý výběr možností.

Příklad schématu:

```json
{
  "form_id": "kompetence",
  "title": "Kompetence",
  "fields": [
    {"id": "teacher_view", "type": "textarea", "label": "Pohled učitele"},
    {"id": "assistant_view", "type": "textarea", "label": "Pohled asistenta"},
    {"id": "clarify", "type": "textarea", "label": "Co je potřeba vyjasnit?"}
  ]
}
```

## 3. Google Sheet vzniká spolu s formulářem

Při vytvoření formuláře CoLector vytvoří nebo přiřadí samostatný Google Sheet určený pro tento formulář.

Sheet je primárně pracovní výstup pro člověka, ne interní technický log.

Hlavní list se jmenuje například `ODPOVĚDI` a má orientaci:

- vodorovně = položky formuláře,
- svisle = jednotlivé týmy,
- jeden tým = jeden řádek.

Příklad:

| Tým | Pohled učitele | Pohled asistenta | Co je potřeba vyjasnit? |
| --- | --- | --- | --- |
| Tým 1 | … | … | … |
| Tým 2 | … | … | … |
| Tým 3 | … | … | … |

Po změně struktury formuláře musí být změna schématu řízená; verze 0.1 nemusí podporovat bezpečné přestavování již používaného formuláře.

## 4. Dynamické týmy

Počet týmů nemusí být znám předem.

Všechny týmy skenují stejný distribuční QR formuláře. Při prvním otevření na konkrétním zařízení vznikne interní `team_id`, který se uloží lokálně v prohlížeči.

Princip:

`první otevření formuláře na zařízení → vytvoření team_id → uložení do localStorage → refresh zachová stejný tým`

Server při prvním přijetí odpovědi přiřadí k internímu `team_id` čitelné pořadí, například `Tým 1`, `Tým 2`, `Tým 3`.

Nový tým tedy nevzniká při každém refreshi. Později lze přidat explicitní akci `Nový tým` pro případ, kdy jedno zařízení postupně používá více skupin.

## 5. Distribuce

Po kliknutí na „Rozdat formulář“ systém zobrazí jeden QR kód s URL konkrétního formuláře.

Lektor může QR:

- promítnout projektorem,
- zobrazit na iPadu / telefonu,
- vytisknout.

Účastník nepotřebuje účet, registraci ani instalaci.

## 6. Dvě cesty předání odpovědi

### Online

`účastník → Odeslat → Google Apps Script → příslušný Google Sheet → ODPOVĚDI`

### Offline QR fallback

`účastník vyplní → aplikace serializuje form_id + team_id + response_id + odpovědi → zobrazí QR → lektor naskenuje → odpověď se uloží do stejného datasetu`

Online i offline odpověď musí skončit ve stejné řádkové struktuře. `response_id` slouží k deduplikaci opakovaného přenosu.

Offline QR je fallback pro krátké strukturované odpovědi. Verze 0.1 nebude řešit multi-QR transport dlouhých payloadů.

## 7. Human-readable a technická vrstva

Každý formulář má dva logické pohledy na data.

### `ODPOVĚDI`

Čitelný pracovní list pro Zdendu:

- `Tým`
- následně jeden sloupec pro každou položku formuláře.

Tento list je určen pro běžnou práci, kontrolu, copy/export a následnou analýzu v ChatGPT.

### `_META`

Technický list, který může být skrytý:

- `form_id`
- `team_id`
- `team_label`
- `response_id`
- `timestamp`
- `source` (`online` / `offline_qr`)
- případně verze schématu.

Technická metadata se nemají míchat do hlavní čitelné tabulky, pokud nejsou pro lektora užitečná.

## 8. Datový model 0.1

CoLector potřebuje malý registr formulářů, který drží alespoň:

- `form_id`
- `title`
- `instructions`
- `schema_json`
- `sheet_id`
- `active`
- `created_at`

Odpovědi se primárně materializují do samostatného Sheet souboru konkrétního formuláře.

Současný prototypový list `RESPONSES` s `data_json` je považován za technický mezikrok M2, nikoli za cílový lektorský formát.

## 9. Technická architektura

```text
QR
↓
Google Apps Script Web App
↓
HTML / CSS / vanilla JavaScript
↓
Google Apps Script
├─ registr formulářů
├─ dynamická identita týmu
├─ deduplikace response_id
└─ zápis do Sheet konkrétního formuláře
↓
Google Sheets
├─ ODPOVĚDI  ← human-readable
└─ _META     ← technická metadata
```

Komponenty:

- Frontend: HTML/CSS/vanilla JS, mobile-first.
- Hosting: Google Apps Script Web App.
- Backend: Google Apps Script.
- Data: Google Sheets.
- Source of truth kódu: GitHub.
- Pracovní prostředí: Replit.
- Synchronizace do Apps Scriptu: `npx -y @google/clasp@latest push`.

## 10. Minimální lektorské workflow

1. Zdenda vytvoří nový formulář.
2. Zadá název, instrukci a pole.
3. CoLector uloží schéma a vytvoří/přiřadí Google Sheet.
4. CoLector připraví hlavičku `ODPOVĚDI` podle polí formuláře.
5. Zdenda zobrazí distribuční QR.
6. Libovolný počet týmů otevře stejný QR.
7. Každé zařízení získá stabilní `team_id`.
8. Odpovědi přicházejí online nebo přes offline QR fallback.
9. Každý tým se objeví jako jeden řádek v `ODPOVĚDI`.
10. Zdenda může Sheet přímo číst, kopírovat nebo předat ChatGPT.

## 11. Minimální účastnické workflow

1. Naskenuje QR.
2. Otevře se mobilní formulář.
3. Zařízení získá nebo obnoví `team_id`.
4. Účastník vyplní pole.
5. Zvolí `Odeslat` nebo při výpadku připojení `Předat přes QR`.
6. Po úspěšném předání je odpověď považována za odevzdanou.

## 12. Co 0.1 neřeší

- účty účastníků,
- předem definované počty týmů,
- evidenci osob,
- vlastní databázi,
- AI uvnitř aplikace,
- analytické dashboardy,
- LMS funkce,
- nativní Android/iOS aplikaci,
- komplexní historii workshopů,
- multi-QR transport dlouhých offline odpovědí.

## 13. Kritérium úspěchu

CoLector 0.1 je úspěšný, pokud během reálného školení:

- Zdenda dokáže vytvořit formulář bez programování,
- spolu s formulářem vznikne čitelný Sheet,
- libovolný počet týmů otevře stejný QR,
- refresh telefonu nevytváří falešný nový tým,
- odpovědi se spolehlivě předají online i fallbackem,
- každý tým se propíše jako jeden řádek,
- sloupce odpovídají položkám formuláře,
- výsledný Sheet je okamžitě použitelný člověkem a pro následnou AI analýzu.

## 14. Produktová definice 0.1

CoLector 0.1 umožní lektorovi vytvořit jednoduchý digitální formulář, automaticky k němu připravit human-readable Google Sheet, distribuovat formulář všem týmům jedním QR kódem a sesbírat jejich odpovědi online nebo offline QR přenosem tak, aby každý tým tvořil jeden řádek a každá položka formuláře jeden sloupec.
