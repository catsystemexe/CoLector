const PERF_LOG_ENABLED = true;

function perfStart_(operation) {
  return {
    operation: String(operation || ''),
    startedAt: Date.now(),
    marks: []
  };
}

function perfMark_(perf, label, extra) {
  if (!PERF_LOG_ENABLED || !perf) return;
  const mark = {
    label: String(label || ''),
    ms: Date.now() - perf.startedAt
  };
  if (extra && typeof extra === 'object') mark.extra = extra;
  perf.marks.push(mark);
}

function perfEnd_(perf, extra) {
  if (!PERF_LOG_ENABLED || !perf) return;
  const entry = {
    operation: perf.operation,
    durationMs: Date.now() - perf.startedAt,
    marks: perf.marks || []
  };
  if (extra && typeof extra === 'object') entry.extra = extra;
  console.log('[PERF] ' + JSON.stringify(entry));
}
