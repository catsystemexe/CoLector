# CoLector 0.1 — Architektura prototypu digitálních kartiček

## 1. Cíl

CoLector 0.1 je minimální vstupní modul pro digitalizaci pracovních kartiček, které lektor během školení rozdává účastníkům, nechává je vyplnit a následně vybírá pro další zpracování.

Hlavní hypotéza:

> Účastníci dokážou místo papírových pracovních listů vyplnit jednoduchou digitální kartičku v mobilu a lektor získá okamžitě čistá digitální data bez focení, OCR a ručního přepisování.

## 2. Základní workflow

Současný stav:

`papírová kartička → ruční písmo → focení mobilem → OCR / ChatGPT → opravy → třídění → analýza`

Cílový stav 0.1:

`lektor vytvoří kartičku → rozdá ji QR → účastník vyplní → online odeslání nebo offline QR předání → Google Sheets → další zpracování`

## 3. Uživatelský model

### Lektor

- spravuje jednoduchý seznam kartiček,
- vytvoří / upraví kartičku,
- zobrazí QR pro distribuci,
- sleduje počet přijatých odpovědí,
- zobrazí odpovědi,
- zkopíruje / exportuje dataset.

### Účastník

- naskenuje QR,
- otevře kartičku v mobilním prohlížeči,
- vyplní ji bez účtu a instalace,
- odešle online, nebo použije offline QR fallback.

## 4. Kartička

Kartička není volně kreslený dokument. Je to malé schéma formuláře složené z bloků pod sebou.

Podporované prvky 0.1:

- nadpis,
- instrukční text,
- krátký text,
- dlouhý text,
- checkbox,
- jednoduchý výběr možností.

Příklad interního schématu:

```json
{
  "title": "Kompetence",
  "fields": [
    {"id": "teacher_view", "type": "textarea", "label": "Pohled učitele", "required": false},
    {"id": "assistant_view", "type": "textarea", "label": "Pohled asistenta", "required": false},
    {"id": "clarify", "type": "textarea", "label": "Co je potřeba vyjasnit?", "required": false}
  ]
}
```

## 5. Distribuce

Po kliknutí na „Rozdat kartičku“ systém vytvoří QR s URL konkrétní kartičky.

Lektor může QR:

- promítnout projektorem,
- zobrazit na iPadu / telefonu,
- vytisknout.

## 6. Dvě cesty předání

### Online

`účastník → Odeslat → Google Apps Script → Google Sheets`

### Offline fallback

`účastník vyplní → aplikace serializuje odpověď → QR → lektor naskenuje → odpověď se uloží se source=offline_qr`

Offline QR je fallback pro krátké strukturované odpovědi. Verze 0.1 nebude řešit multi-QR transport dlouhých payloadů.

## 7. Technická architektura

```text
QR
↓
Google Apps Script Web App
↓
HTML / CSS / JavaScript
↓
Google Apps Script
↓
Google Sheets
```

Komponenty:

- Frontend: jednoduché HTML/CSS/vanilla JS, mobile-first.
- Hosting: Google Apps Script Web App.
- Backend: Google Apps Script.
- Data: Google Sheets.
- Vývoj: Replit Free.
- Source of truth: GitHub.
- Deploy: z repozitáře do Apps Scriptu; později preferovaně přes `clasp`.

## 8. Google Sheets

V 0.1 fungují Sheets jako jednoduchá datová vrstva i přehled.

Doporučené listy:

### CARDS

- `card_id`
- `title`
- `instructions`
- `schema_json`
- `active`
- `created_at`

### RESPONSES

- `response_id`
- `card_id`
- `timestamp`
- `source`
- `data_json`

Jedna odevzdaná kartička = jeden řádek v `RESPONSES`.

## 9. UI 0.1

Minimální lektorské obrazovky:

1. Moje kartičky
2. Editor kartičky
3. Rozdat / vybrat
4. Odpovědi

Účastník vidí pouze jednu jednoduchou vertikální mobilní stránku s kartičkou a akcemi „Odeslat“ / „Předat přes QR“.

## 10. AI

AI není součástí CoLectoru 0.1.

První verze pouze zajistí čistý digitální sběr. Následné zpracování probíhá mimo aplikaci, například:

`Google Sheets → copy/export → ChatGPT → třídění / shrnutí / analýza / report`

## 11. Kritérium úspěchu

CoLector 0.1 je úspěšný, pokud během reálného školení:

- účastníci otevřou kartičku s minimální instrukcí,
- pohodlně ji vyplní na vlastním telefonu,
- odpovědi se spolehlivě předají,
- lektor získá celý dataset digitálně,
- odpadne focení, OCR a ruční přepis,
- dataset lze okamžitě použít pro další vyhodnocení.
