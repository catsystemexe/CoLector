# CoLector 0.1 — Roadmap implementace prototypu

## Princip

Cílem není stavět plnohodnotnou aplikaci. Cílem je ověřit jediný pracovní tok:

`QR → mobilní formulář → odpověď → Google Sheets`

Vše ostatní je sekundární.

## Technický baseline

- Frontend: HTML + CSS + vanilla JavaScript
- Backend/runtime: Google Apps Script
- Datová vrstva: Google Sheets
- Hosting: Google Apps Script Web App
- Vývoj: Replit Free
- Source of truth: GitHub
- AI uvnitř aplikace: ne
- Placené služby: ne

## M0 — Scope + datový kontrakt

Výstup:

- uzavřený scope 0.1,
- schéma `CARDS`,
- schéma `RESPONSES`,
- formát `schema_json`,
- formát `data_json`,
- pravidla `response_id` a idempotence.

Exit criteria:

- datový kontrakt je dostatečně přesný pro implementaci bez dalších produktových rozhodnutí.

## M1 — QR → mobilní kartička

Nejprve pouze read-only render jedné ručně vložené testovací kartičky.

Výstup:

- testovací záznam v `CARDS`,
- veřejná URL kartičky,
- QR s touto URL,
- mobile-first formulář vygenerovaný ze `schema_json`.

Exit criteria:

- QR lze načíst běžným Android/iPhone telefonem,
- formulář je čitelný a použitelný bez vysvětlování.

## M2 — Online submission → Sheets

Výstup:

- odeslání formuláře,
- serverová validace `card_id`,
- generování / kontrola `response_id`,
- serverový timestamp,
- `source=online`,
- zápis do `RESPONSES`.

Exit criteria:

- série testovacích odeslání neztrácí ani nepřepisuje odpovědi,
- duplicitní submit nevytváří nekontrolované duplicity.

## M3 — Minimální přehled odpovědí

Výstup:

- počet odpovědí na kartičku,
- seznam přijatých odpovědí,
- jednoduchý refresh / polling,
- detail odpovědi.

Exit criteria:

- lektor během simulace vidí, kolik odpovědí dorazilo a jejich obsah.

## M4 — Editor kartiček

Podporované bloky 0.1:

- instrukční text,
- krátké textové pole,
- dlouhé textové pole,
- checkbox,
- jednoduchý select/radio.

Editor bude používat jednoduché akce:

- přidat,
- upravit,
- smazat,
- posunout nahoru/dolů,
- náhled,
- uložit.

Výslovně bez drag-and-drop builderu.

Exit criteria:

- lektor vytvoří novou kartičku bez ruční editace Sheets/JSON.

## M5 — Distribuce kartičky

Výstup:

- akce „Rozdat kartičku“,
- generovaný QR,
- případně kopírovatelný odkaz,
- zobrazení vhodné pro projekci / iPad.

Exit criteria:

- lektor vytvoří kartičku a bez dalších technických kroků ji rozdá účastníkům.

## M6 — Offline QR fallback

Výstup:

- akce „Předat přes QR“,
- kompaktní verzovaný payload,
- QR s odpovědí,
- limit délky a srozumitelné chybové hlášení při překročení kapacity.

Příklad konceptu payloadu:

```json
{
  "v": 1,
  "c": "card-id",
  "r": "response-id",
  "d": {
    "field-1": "text"
  }
}
```

V 0.1 se nebude implementovat multi-QR transport.

Exit criteria:

- krátkou odpověď lze předat bez internetu z telefonu účastníka lektorovi.

## M7 — Import offline odpovědi

Výstup:

- sken offline QR lektorem,
- dekódování a validace payloadu,
- kontrola verze a `card_id`,
- idempotence přes `response_id`,
- uložení s `source=offline_qr`.

Exit criteria:

- stejné QR načtené dvakrát nevytvoří dva záznamy.

## M8 — Copy / export

Výstup:

- „Kopírovat celý dataset kartičky“,
- jednoduchý text/Markdown vhodný pro ChatGPT,
- CSV export jako sekundární formát.

Exit criteria:

- lektor dostane celý dataset jedním krokem mimo CoLector.

## M9 — Simulovaný a reálný workshop test

Testovat minimálně:

- různé Android telefony,
- iPhone,
- různé velikosti obrazovky,
- více současných odeslání,
- slabé / přerušené připojení,
- online i offline cestu.

Sledovat:

- čas k otevření,
- čas k pochopení,
- čas k vyplnění,
- chybovost,
- počet dotazů na lektora,
- úspěšnost odevzdání.

Cílové chování:

> Lektor řekne „naskenujte QR a vyplňte“ a prakticky nic dalšího nevysvětluje.

## Kritérium hotového CoLectoru 0.1

```text
lektor vybere / vytvoří kartičku
↓
zobrazí QR
↓
účastníci ji otevřou
↓
vyplní
↓
odevzdají online nebo offline QR
↓
lektor vidí všechny odpovědi
↓
copy/export
↓
další analýza mimo CoLector
```

## Pravidla proti scope creepu

Do 0.1 nepřidávat:

- účty účastníků,
- organizace / školy jako entity,
- komplexní workshopy a historii,
- vlastní databázi,
- AI integraci,
- reportovací engine,
- analytický dashboard,
- nativní mobilní aplikaci,
- komplexní permissions,
- dokumentový management.

Nový požadavek se nejdřív posoudí otázkou:

> Je nutný k ověření workflow digitální kartička → sběr → dataset?

Pokud ne, patří do pozdější verze.

## Vývojový workflow

`ChatGPT → GitHub → Replit → test → GitHub → Google Apps Script → mobilní test → Google Sheets`

GitHub je kanonický zdroj kódu a projektové dokumentace. Replit je pracovní vývojové prostředí. Google Apps Script je deployment target, nikoli primární editor/source of truth.
