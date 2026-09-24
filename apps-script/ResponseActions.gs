const FORM_DATA_REGISTRY_SHEET = 'FORM_DATA';
const FORM_DATA_REGISTRY_HEADERS = ['form_id', 'spreadsheet_id', 'spreadsheet_url', 'created_at'];
const FORM_TEAMS_SHEET = '_TEAMS';
const FORM_TEAMS_HEADERS = ['team_id', 'team_label', 'opened_at', 'submitted_at'];
const FORM_META_HEADERS = ['timestamp', 'form_id', 'team_id', 'team_label', 'response_id', 'source', 'published_at', 'answers_json', 'round_id'];
const ROUND_STATE_PREFIX = 'colector.rounds.';
const FORM_PART_OPENS_SHEET = '_PART_OPENS';
const FORM_PART_OPENS_HEADERS = ['team_id', 'round_id', 'opened_at'];
const PART_LOCKING_ENABLED = false;

function registerParticipantOpen(payload) {
  if (!payload || !payload.formId || !payload.teamId) throw new Error('Neplatné otevření formuláře.');
  const central = openCentralStore_();
  const published = formRepositoryGetPublished_(payload.formId, central);
  if (!published || !published.schema) throw new Error('Formulář není publikovaný.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const target = getOrCreateFormDataSpreadsheet_(payload.formId, published.schema, central);
    const teams = getOrCreateTeamsSheet_(target);
    const team = ensureParticipantTeam_(teams, payload.teamId);
    return {ok:true,teamLabel:String(team.values[1] || '')};
  } finally {
    lock.releaseLock();
  }
}

function submitParticipantResponse(payload) {
  if (!payload || !payload.formId || !payload.teamId || !payload.responseId || !payload.answers || !payload.roundId) {
    throw new Error('Neplatná odpověď formuláře.');
  }

  const central = openCentralStore_();
  const published = formRepositoryGetPublished_(payload.formId, central);
  if (!published || !published.schema) throw new Error('Formulář není publikovaný.');
  const rounds = schemaRounds_(published.schema);
  if (!rounds.length) throw new Error('Formulář nemá žádný Part.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const target = getOrCreateFormDataSpreadsheet_(payload.formId, published.schema, central);
    const responses = target.getSheetByName('ODPOVĚDI');
    const meta = ensureMetaHeaders_(target);
    const teams = getOrCreateTeamsSheet_(target);
    const team = ensureParticipantTeam_(teams, payload.teamId);
    const teamLabel = String(team.values[1] || '');

    if (hasResponseId_(meta, payload.responseId)) {
      return {ok:true,duplicate:true,teamLabel:teamLabel};
    }

    const completed = completedRoundIdsForTeam_(target, payload.teamId, rounds);
    const nextRound = rounds.find(round => !completed.includes(round.id));
    if (!nextRound) return {ok:true,duplicate:false,teamLabel:teamLabel,complete:true};
    if (String(nextRound.id) !== String(payload.roundId)) throw new Error('Tento Part teď není aktivní.');

    const roundStates = getRoundStates_(payload.formId, published.schema);
    const currentState = roundStates.find(round => String(round.roundId) === String(nextRound.id));
    if (!currentState || !currentState.unlocked) throw new Error('Tento Part je momentálně uzamčený.');

    ensureResponseHeaders_(responses, published.schema);
    upsertTeamResponse_(responses, teamLabel, published.schema, payload.answers);

    meta.appendRow([
      new Date(),
      payload.formId,
      payload.teamId,
      teamLabel,
      payload.responseId,
      'online',
      published.publishedAt || '',
      JSON.stringify(payload.answers),
      nextRound.id
    ]);

    const completedAfter = completed.concat(nextRound.id);
    const complete = rounds.every(round => completedAfter.includes(round.id));
    if (complete) teams.getRange(team.rowIndex, 4).setValue(new Date());

    return {
      ok:true,
      duplicate:false,
      teamLabel:teamLabel,
      roundId:nextRound.id,
      roundNumber:nextRound.number,
      complete:complete
    };
  } finally {
    lock.releaseLock();
  }
}

function getParticipantRoundView(payload) {
  if (!payload || !payload.formId || !payload.teamId) throw new Error('Neplatné otevření formuláře.');
  const central = openCentralStore_();
  const published = formRepositoryGetPublished_(payload.formId, central);
  if (!published || !published.schema) return {status:'unavailable'};

  const rounds = schemaRounds_(published.schema);
  if (!rounds.length) return {status:'unavailable'};

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const target = getOrCreateFormDataSpreadsheet_(payload.formId, published.schema, central);
    const teams = getOrCreateTeamsSheet_(target);
    const team = ensureParticipantTeam_(teams, payload.teamId);
    const teamLabel = String(team.values[1] || '');
    const completed = completedRoundIdsForTeam_(target, payload.teamId, rounds);
    const nextRound = rounds.find(round => !completed.includes(round.id));

    if (!nextRound) {
      return {status:'complete',teamLabel:teamLabel,completedRoundIds:completed,roundCount:rounds.length};
    }

    const states = getRoundStates_(payload.formId, published.schema);
    const state = states.find(item => item.roundId === nextRound.id);
    if (!state || !state.unlocked) {
      return {
        status:'locked',
        teamLabel:teamLabel,
        roundId:nextRound.id,
        roundNumber:nextRound.number,
        roundCount:rounds.length,
        completedRoundIds:completed
      };
    }

    markPartOpened_(target, payload.teamId, nextRound.id, rounds);

    return {
      status:'ready',
      teamLabel:teamLabel,
      roundId:nextRound.id,
      roundNumber:nextRound.number,
      roundCount:rounds.length,
      completedRoundIds:completed,
      schema:{
        version:3,
        formId:payload.formId,
        roundId:nextRound.id,
        roundNumber:nextRound.number,
        title:nextRound.title || '',
        instructions:nextRound.instructions || '',
        fields:nextRound.fields || []
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function getRoundLockState(payload) {
  if (!payload || !payload.formId || !payload.roundId) throw new Error('Neplatný dotaz na Part.');
  if (!PART_LOCKING_ENABLED) return {ok:true,roundId:String(payload.roundId),unlocked:true,lockingEnabled:false};
  const properties = PropertiesService.getScriptProperties();
  const key = ROUND_STATE_PREFIX + payload.formId;
  let values = {};
  try { values = JSON.parse(properties.getProperty(key) || '{}'); } catch (error) { values = {}; }
  const unlocked = typeof values[String(payload.roundId)] === 'boolean'
    ? values[String(payload.roundId)]
    : Number(payload.roundNumber || 0) === 1;
  return {ok:true,roundId:String(payload.roundId),unlocked:unlocked};
}

function setRoundLock(payload) {
  if (!payload || !payload.formId || !payload.roundId || typeof payload.unlocked !== 'boolean') {
    throw new Error('Neplatná změna Partu.');
  }
  const published = getPublishedForm(payload.formId);
  if (!published || !published.schema) throw new Error('Formulář není publikovaný.');

  const rounds = schemaRounds_(published.schema);
  if (!rounds.some(round => String(round.id) === String(payload.roundId))) throw new Error('Part nebyl nalezen.');

  const properties = PropertiesService.getScriptProperties();
  const key = ROUND_STATE_PREFIX + payload.formId;
  let values = {};
  try { values = JSON.parse(properties.getProperty(key) || '{}'); } catch (error) { values = {}; }
  values[String(payload.roundId)] = payload.unlocked;
  properties.setProperty(key, JSON.stringify(values));

  return {ok:true,rounds:getRoundStates_(payload.formId, published.schema)};
}

function schemaRounds_(schema) {
  if (!schema) return [];
  const source = Array.isArray(schema.rounds) && schema.rounds.length
    ? schema.rounds
    : [{id:'round_1',title:schema.title || '',instructions:schema.instructions || '',fields:Array.isArray(schema.fields) ? schema.fields : []}];

  return source.map((round,index) => ({
    id:String(round.id || ('round_' + (index + 1))),
    number:index + 1,
    title:String(round.title || ''),
    instructions:String(round.instructions || ''),
    fields:Array.isArray(round.fields) ? round.fields : []
  }));
}

function getRoundStates_(formId, schema) {
  const rounds = schemaRounds_(schema);
  if (!PART_LOCKING_ENABLED) {
    return rounds.map((round,index) => ({
      roundId:round.id,
      number:index + 1,
      unlocked:true,
      lockingEnabled:false
    }));
  }

  const properties = PropertiesService.getScriptProperties();
  const key = ROUND_STATE_PREFIX + formId;
  let stored = {};
  try { stored = JSON.parse(properties.getProperty(key) || '{}'); } catch (error) { stored = {}; }

  return rounds.map((round,index) => ({
    roundId:round.id,
    number:index + 1,
    unlocked:typeof stored[round.id] === 'boolean' ? stored[round.id] : index === 0,
    lockingEnabled:true
  }));
}

function ensureParticipantTeam_(teams, teamId) {
  let team = findTeamRow_(teams, teamId);
  if (team) return team;
  const label = nextTeamLabelFromTeams_(teams);
  teams.appendRow([teamId, label, new Date(), '']);
  return findTeamRow_(teams, teamId);
}

function ensureMetaHeaders_(spreadsheet) {
  // Compatibility alias for mutating paths.
  return ensureMetaStore_(spreadsheet);
}

function completedRoundIdsForTeam_(spreadsheet, teamId, rounds) {
  const meta = getMetaStore_(spreadsheet);
  if (!meta || meta.getLastRow() < 2) return [];
  const firstRoundId = rounds[0] ? rounds[0].id : '';
  const completed = [];
  meta.getRange(2, 1, meta.getLastRow() - 1, FORM_META_HEADERS.length).getValues().forEach(row => {
    if (String(row[2] || '') !== String(teamId)) return;
    const roundId = String(row[8] || firstRoundId);
    if (roundId && !completed.includes(roundId)) completed.push(roundId);
  });
  return completed;
}

function getOrCreatePartOpensSheet_(spreadsheet, rounds) {
  // Compatibility alias for mutating paths.
  return ensurePartOpensStore_(spreadsheet, rounds);
}

function markPartOpened_(spreadsheet, teamId, roundId, rounds) {
  const sheet = getOrCreatePartOpensSheet_(spreadsheet, rounds);
  if (sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    if (values.some(row => String(row[0]) === String(teamId) && String(row[1]) === String(roundId))) return;
  }
  sheet.appendRow([String(teamId), String(roundId), new Date()]);
}

function partDistributedCounts_(spreadsheet, rounds) {
  const counts = {};
  (rounds || []).forEach(round => counts[String(round.id)] = 0);
  const sheet = getPartOpensStore_(spreadsheet);
  if (!sheet) return derivePartDistributedCounts_(spreadsheet, rounds, counts);
  if (sheet.getLastRow() < 2) return counts;

  const seen = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(row => {
    const teamId = String(row[0] || '');
    const roundId = String(row[1] || '');
    if (!teamId || !roundId || !Object.prototype.hasOwnProperty.call(counts, roundId)) return;
    const key = teamId + '|' + roundId;
    if (seen[key]) return;
    seen[key] = true;
    counts[roundId] += 1;
  });
  return counts;
}

function derivePartDistributedCounts_(spreadsheet, rounds, counts) {
  const seen = {};
  const firstRoundId = rounds && rounds[0] ? String(rounds[0].id) : '';
  const teams = getTeamsStore_(spreadsheet);
  if (firstRoundId && teams && teams.getLastRow() > 1) {
    teams.getRange(2, 1, teams.getLastRow() - 1, 3).getValues().forEach(row => {
      const teamId = String(row[0] || '');
      if (!teamId) return;
      const key = teamId + '|' + firstRoundId;
      if (seen[key]) return;
      seen[key] = true;
      if (Object.prototype.hasOwnProperty.call(counts, firstRoundId)) counts[firstRoundId] += 1;
    });
  }

  const meta = getMetaStore_(spreadsheet);
  if (meta && meta.getLastRow() > 1) {
    meta.getRange(2, 1, meta.getLastRow() - 1, FORM_META_HEADERS.length).getValues().forEach(row => {
      const teamId = String(row[2] || '');
      const roundId = String(row[8] || firstRoundId);
      if (!teamId || !roundId || !Object.prototype.hasOwnProperty.call(counts, roundId)) return;
      const key = teamId + '|' + roundId;
      if (seen[key]) return;
      seen[key] = true;
      counts[roundId] += 1;
    });
  }
  return counts;
}

function getSessionView(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const central = openCentralStore_();
  const published = formRepositoryGetPublished_(formId, central);
  if (!published || !published.schema) throw new Error('Formulář není publikovaný.');

  const rounds = schemaRounds_(published.schema);
  const roundStates = getRoundStates_(formId, published.schema);
  const dataRecord = getFormDataRecord_(formId, central);
  const spreadsheetId = dataRecord ? dataRecord.spreadsheetId : '';
  const spreadsheetUrl = dataRecord ? dataRecord.spreadsheetUrl : '';

  const teams = [];
  const answersByTeamRound = {};
  let distributedByRound = {};
  if (spreadsheetId) {
    try {
      const target = SpreadsheetApp.openById(spreadsheetId);
      const teamSheet = getTeamsStore_(target);
      const completedByTeam = {};
      distributedByRound = partDistributedCounts_(target, rounds);

      if (teamSheet && teamSheet.getLastRow() > 1) {
        teamSheet.getRange(2, 1, teamSheet.getLastRow() - 1, 4).getValues().forEach(row => {
          if (!row[0]) return;
          const teamId = String(row[0]);
          completedByTeam[teamId] = [];
          teams.push({
            teamId:teamId,
            teamLabel:String(row[1] || ''),
            openedAt:row[2] ? new Date(row[2]).toISOString() : '',
            submittedAt:row[3] ? new Date(row[3]).toISOString() : '',
            submitted:!!row[3],
            completedRoundIds:[]
          });
        });
      }

      const meta = getMetaStore_(target);
      if (meta && meta.getLastRow() > 1) {
        meta.getRange(2, 1, meta.getLastRow() - 1, FORM_META_HEADERS.length).getValues().forEach(row => {
          const teamId = String(row[2] || '');
          if (!teamId || !row[7]) return;
          const roundId = String(row[8] || (rounds[0] && rounds[0].id) || '');
          if (!roundId) return;
          if (!completedByTeam[teamId]) completedByTeam[teamId] = [];
          if (!completedByTeam[teamId].includes(roundId)) completedByTeam[teamId].push(roundId);
          if (!answersByTeamRound[teamId]) answersByTeamRound[teamId] = {};
          try {
            answersByTeamRound[teamId][roundId] = {
              submittedAt:row[0] ? new Date(row[0]).toISOString() : '',
              answers:JSON.parse(String(row[7]))
            };
          } catch (error) {}
        });
      }

      teams.forEach(team => {
        team.completedRoundIds = completedByTeam[team.teamId] || [];
        team.submitted = rounds.length > 0 && rounds.every(round => team.completedRoundIds.includes(round.id));
      });
    } catch (error) {}
  }

  const roundViews = rounds.map((round,index) => {
    const lockState = roundStates.find(item => item.roundId === round.id);
    return {
      roundId:round.id,
      number:index + 1,
      title:round.title || '',
      instructions:round.instructions || '',
      fields:round.fields || [],
      unlocked:!!(lockState && lockState.unlocked),
      submittedCount:teams.filter(team => (team.completedRoundIds || []).includes(round.id)).length,
      distributedCount:Number(distributedByRound[round.id]) || 0
    };
  });

  return {
    formId:formId,
    schema:published.schema,
    publishedAt:published.publishedAt || '',
    rounds:roundViews,
    teams:teams,
    answersByTeamRound:answersByTeamRound,
    spreadsheetUrl:spreadsheetUrl
  };
}

function getHomeFormSummaries() {
  const central = openCentralStore_();
  const forms = formRepositoryList_(central);
  const registry = getFormDataRegistryStore_(central);
  const dataByForm = {};
  if (registry && registry.getLastRow() > 1) {
    registry.getRange(2, 1, registry.getLastRow() - 1, FORM_DATA_REGISTRY_HEADERS.length).getValues().forEach(row => {
      if (row[0]) dataByForm[String(row[0])] = {spreadsheetId:String(row[1] || ''), spreadsheetUrl:String(row[2] || '')};
    });
  }

  const schemaByForm = {};
  const formsSheet = getFormsStore_(central);
  if (formsSheet && formsSheet.getLastRow() > 1) {
    formsSheet.getRange(2, 1, formsSheet.getLastRow() - 1, FORMS_HEADERS.length).getValues().forEach(row => {
      if (!row[0]) return;
      let draftSchema = null;
      let publishedSchema = null;
      try { draftSchema = row[3] ? JSON.parse(String(row[3])) : null; } catch (error) {}
      try { publishedSchema = row[7] ? JSON.parse(String(row[7])) : null; } catch (error) {}
      schemaByForm[String(row[0])] = {draftSchema:draftSchema,publishedSchema:publishedSchema};
    });
  }

  return forms.map(form => {
    const data = dataByForm[form.formId] || null;
    const schemas = schemaByForm[form.formId] || {};
    const effectiveSchema = schemas.publishedSchema || schemas.draftSchema || null;
    const rounds = effectiveSchema ? schemaRounds_(effectiveSchema) : [];
    const completedByTeam = {};
    let totalParticipants = 0;
    let collected = 0;
    let distributedByRound = {};

    if (data && data.spreadsheetId) {
      try {
        const target = SpreadsheetApp.openById(data.spreadsheetId);
        const teams = getTeamsStore_(target);
        if (teams && teams.getLastRow() > 1) {
          const rows = teams.getRange(2, 1, teams.getLastRow() - 1, 4).getValues();
          totalParticipants = rows.filter(row => row[0]).length;
          rows.forEach(row => { if (row[0]) completedByTeam[String(row[0])] = []; });
        }

        if (rounds.length) {
          distributedByRound = partDistributedCounts_(target, rounds);
          const meta = getMetaStore_(target);
          if (meta && meta.getLastRow() > 1) {
            meta.getRange(2, 1, meta.getLastRow() - 1, FORM_META_HEADERS.length).getValues().forEach(row => {
              const teamId = String(row[2] || '');
              if (!teamId) return;
              const roundId = String(row[8] || rounds[0].id);
              if (!completedByTeam[teamId]) completedByTeam[teamId] = [];
              if (!completedByTeam[teamId].includes(roundId)) completedByTeam[teamId].push(roundId);
            });
          }
          collected = Object.keys(completedByTeam).filter(teamId => rounds.every(round => completedByTeam[teamId].includes(round.id))).length;
        }
      } catch (error) {}
    }

    const roundStates = schemas.publishedSchema ? getRoundStates_(form.formId, schemas.publishedSchema) : [];
    const roundSummary = rounds.map((round,index) => ({
      roundId:round.id,
      number:index + 1,
      unlocked:!!((roundStates.find(item => item.roundId === round.id) || {}).unlocked),
      submittedCount:Object.keys(completedByTeam).filter(teamId => (completedByTeam[teamId] || []).includes(round.id)).length,
      distributedCount:Number(distributedByRound[round.id]) || 0
    }));

    return Object.assign({}, form, {
      distributedCount:totalParticipants,
      totalParticipants:totalParticipants,
      collectedCount:collected,
      dataUrl:data ? data.spreadsheetUrl : '',
      rounds:roundSummary
    });
  });
}

function getOrCreateFormDataUrl(formId) {
  if (!formId) throw new Error('Chybí form_id.');

  const central = openCentralStore_();
  const source = formRepositoryGetDraft_(formId, central);
  if (!source || !source.schema) throw new Error('Formulář nebyl nalezen.');

  const target = getOrCreateFormDataSpreadsheet_(formId, source.schema, central);
  return {
    ok: true,
    formId: formId,
    url: target.getUrl()
  };
}

function getOrCreateFormDataSpreadsheet_(formId, schema, centralStore) {
  const central = centralStore || openCentralStore_();
  const existing = openFormDataStore_(formId, central);
  if (existing) {
    ensureTeamsStore_(existing);
    ensureMetaStore_(existing);
    return existing;
  }

  const registry = ensureFormDataRegistryStore_(central);
  const title = String(schema.internalTitle || schema.title || 'Formulář').trim() || 'Formulář';
  const spreadsheet = SpreadsheetApp.create('CoLector — ' + title);
  const first = spreadsheet.getSheets()[0];
  first.setName('ODPOVĚDI');
  first.clear();

  ensureMetaStore_(spreadsheet);
  ensureTeamsStore_(spreadsheet);
  ensureResponseHeaders_(first, schema);
  registry.appendRow([formId, spreadsheet.getId(), spreadsheet.getUrl(), new Date()]);
  return spreadsheet;
}

function getOrCreateTeamsSheet_(spreadsheet) {
  // Compatibility alias for mutating paths.
  return ensureTeamsStore_(spreadsheet);
}

function findTeamRow_(sheet, teamId) {
  if (sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const index = rows.findIndex(row => String(row[0]) === String(teamId));
  return index === -1 ? null : {rowIndex:index + 2, values:rows[index]};
}

function nextTeamLabelFromTeams_(sheet) {
  if (sheet.getLastRow() < 2) return 'Tým 1';
  const labels = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().flat().filter(Boolean);
  let max = 0;
  labels.forEach(label => {
    const match = String(label).match(/^Tým\s+(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return 'Tým ' + (max + 1);
}

function getOrCreateFormDataRegistry_(spreadsheet) {
  // Compatibility alias for mutating paths.
  return ensureFormDataRegistryStore_(spreadsheet);
}

function participantFields_(schema) {
  const rounds = schemaRounds_(schema);
  const multi = rounds.length > 1;
  const fields = [];
  rounds.forEach((round, roundIndex) => {
    (round.fields || []).filter(field => ['textarea', 'checkbox', 'yes_no'].includes(field.type)).forEach((field, fieldIndex) => {
      const copy = Object.assign({}, field);
      copy._roundId = round.id;
      copy._roundNumber = roundIndex + 1;
      copy._columnLabel = (multi ? ('Part ' + String.fromCharCode(65 + roundIndex) + ' · ') : '') + String(field.label || ('Položka ' + (fieldIndex + 1)));
      fields.push(copy);
    });
  });
  return fields;
}

function ensureResponseHeaders_(sheet, schema) {
  if (!sheet) return;
  const fields = participantFields_(schema);
  const headers = ['Tým'].concat(fields.map(field => field._columnLabel));
  const width = Math.max(1, headers.length);
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  const matches = headers.every((header,index) => current[index] === header);
  if (!matches) sheet.getRange(1, 1, 1, width).setValues([headers]);
  sheet.setFrozenRows(1);
}

function upsertTeamResponse_(sheet, teamLabel, schema, answers) {
  const fields = participantFields_(schema);
  let rowIndex = 0;
  if (sheet.getLastRow() > 1) {
    const labels = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const index = labels.indexOf(teamLabel);
    if (index !== -1) rowIndex = index + 2;
  }

  const existing = rowIndex ? sheet.getRange(rowIndex, 1, 1, fields.length + 1).getValues()[0] : [];
  const row = [teamLabel].concat(fields.map((field,index) => {
    if (Object.prototype.hasOwnProperty.call(answers, field.id)) return normalizeAnswerForSheet_(field, answers[field.id]);
    return existing[index + 1] == null ? '' : existing[index + 1];
  }));

  if (rowIndex) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function normalizeAnswerForSheet_(field, value) {
  if (field.type === 'checkbox') {
    const selected = Array.isArray(value) ? value : [];
    const labels = selected.map(id => {
      const option = (field.options || []).find(item => String(item.id || item.label || '') === String(id));
      return option ? String(option.label || '') : String(id || '');
    }).filter(Boolean);
    return labels.join(', ');
  }
  if (field.type === 'yes_no') return value === 'yes' ? 'Ano' : value === 'no' ? 'Ne' : '';
  return value == null ? '' : String(value);
}

function hasResponseId_(meta, responseId) {
  const lastRow = meta.getLastRow();
  if (lastRow < 2) return false;
  return meta.getRange(2, 5, lastRow - 1, 1).getValues().flat().includes(responseId);
}
