# CoLector

CoLector je prototypální nástroj pro digitalizaci pracovních kartiček používaných během workshopů.

## CoLector 0.1

Cíl verze 0.1 je jednoduchý:

**lektor vytvoří digitální kartičku → rozdá ji přes QR → účastníci ji vyplní na telefonu → odpovědi se uloží do Google Sheets → lektor má čistá data bez focení, OCR a ručního přepisu.**

### Scope 0.1

CoLector 0.1 bude umět:

- vytvořit jednoduchou digitální kartičku,
- uložit ji jako šablonu,
- distribuovat kartičku přes QR,
- otevřít ji v mobilním prohlížeči bez instalace,
- vyplnit textová pole / checkboxy / jednoduché volby,
- odeslat odpověď online,
- nabídnout offline fallback přes QR,
- uložit odpovědi do Google Sheets,
- zobrazit lektorovi sesbírané odpovědi,
- zkopírovat / exportovat dataset pro další zpracování.

### Mimo scope 0.1

- účty účastníků,
- evidence osob,
- školy a organizace jako samostatné entity,
- komplexní role a oprávnění,
- vlastní databáze,
- AI uvnitř aplikace,
- analytické dashboardy,
- LMS funkce,
- nativní Android/iOS aplikace,
- komplexní historie workshopů,
- automatické reporty,
- dokumentový management.

## Technický baseline

- Frontend: HTML + CSS + vanilla JavaScript
- Runtime / backend: Google Apps Script
- Datová vrstva: Google Sheets
- Hosting: Google Apps Script Web App
- Distribuce: QR
- Vývoj: Replit Free
- Source of truth: GitHub
- Produkční provozní náklady prototypu: 0 Kč

## Dokumentace

- `docs/architecture-0.1.md`
- `docs/roadmap-0.1.md`
- `docs/data-contract.md`

## Stav

Repozitář je v inicializační fázi. Implementace začíná od milestone M0 a pokračuje po malých vertikálních řezech až k reálnému workshop testu.
