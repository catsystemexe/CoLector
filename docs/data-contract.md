# CoLector 0.1 — Datový kontrakt

Tento dokument definuje minimální datový model pro prototyp 0.1. Cílem je udržet implementaci jednoduchou a stabilní i při změnách struktury jednotlivých kartiček.

## 1. CARDS

Jedna kartička = jeden řádek v listu `CARDS`.

Doporučené sloupce:

| Sloupec | Typ | Význam |
|---|---|---|
| `card_id` | string | Stabilní unikátní ID kartičky |
| `title` | string | Název kartičky |
| `instructions` | string | Krátká instrukce pro účastníka |
| `schema_json` | JSON string | Definice polí kartičky |
| `active` | boolean | Zda je kartička dostupná |
| `created_at` | datetime | Čas vytvoření |

### Příklad `schema_json`

```json
{
  "version": 1,
  "fields": [
    {
      "id": "teacher_view",
      "type": "textarea",
      "label": "Pohled učitele",
      "required": false
    },
    {
      "id": "assistant_view",
      "type": "textarea",
      "label": "Pohled asistenta",
      "required": false
    }
  ]
}
```

## 2. RESPONSES

Jedna odevzdaná kartička = jeden řádek v listu `RESPONSES`.

Doporučené sloupce:

| Sloupec | Typ | Význam |
|---|---|---|
| `response_id` | string | Unikátní ID odpovědi, základ idempotence |
| `card_id` | string | Odkaz na kartičku |
| `timestamp` | datetime | Serverový čas přijetí |
| `source` | enum | `online` nebo `offline_qr` |
| `data_json` | JSON string | Vyplněná data |

### Příklad `data_json`

```json
{
  "teacher_view": "...",
  "assistant_view": "..."
}
```

## 3. Pravidla ID

### `card_id`

- musí být stabilní,
- nesmí se měnit při úpravě kartičky,
- pro 0.1 stačí náhodný krátký token / UUID.

### `response_id`

- vzniká při zahájení nebo odevzdání odpovědi,
- stejné `response_id` nesmí vytvořit více záznamů,
- používá se pro ochranu proti duplicitnímu submitu i opakovanému skenu offline QR.

## 4. Supported field types 0.1

Povolené hodnoty `type`:

- `text`
- `textarea`
- `checkbox`
- `select`
- `radio`

Každé vstupní pole musí mít:

- unikátní `id` v rámci kartičky,
- `type`,
- `label`.

Volitelně:

- `required`,
- `options` pro `select` / `radio`,
- `placeholder`.

## 5. Validace

Server při online submitu musí minimálně ověřit:

- že `card_id` existuje,
- že kartička je aktivní,
- že `response_id` není už uložené,
- že přijímaná data jsou JSON objekt,
- že field IDs odpovídají schématu kartičky,
- povinná pole, pokud `required=true`.

Neznámá pole se nemají tiše zapisovat.

## 6. Offline QR payload

Pro offline fallback použít kompaktní verzovaný formát.

Koncept:

```json
{
  "v": 1,
  "c": "card-id",
  "r": "response-id",
  "d": {
    "field-id": "value"
  }
}
```

Význam:

- `v` — verze payloadu,
- `c` — card_id,
- `r` — response_id,
- `d` — odpovědi.

Import musí ověřit:

- podporovanou verzi,
- existenci `card_id`,
- duplicitu `response_id`,
- validitu dat vůči schématu.

## 7. Evoluce datového modelu

V 0.1 se struktura odpovědí ukládá jako JSON záměrně. Důvodem je, aby změny schématu kartičky nevyžadovaly změny sloupců v Google Sheets.

Pokud projekt později přejde na skutečnou databázi, `card_id`, `response_id`, `schema_json` a `data_json` představují přirozený migrační základ.
