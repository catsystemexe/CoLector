(function () {
  function request(method, args) {
    return fetch('/api/action', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args })
    }).then(async response => {
      if (response.status === 401) {
        window.location.reload();
        throw new Error('Platnost přihlášení vypršela.');
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Aplikace požadavek nezpracovala.');
      return body.result;
    });
  }

  function callbacks(success, failure) {
    const handlers = {
      withSuccessHandler: handler => callbacks(handler, failure),
      withFailureHandler: handler => callbacks(success, handler)
    };
    return new Proxy(handlers, {
      get(target, method) {
        if (Object.hasOwn(target, method)) return target[method];
        return (...args) => request(method, args).then(success, failure || console.error);
      }
    });
  }

  function responseId(formId, teamId, partId, createId) {
    const key = `colector.pending-response.${formId}.${teamId}.${partId}`;
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const id = createId('response');
      localStorage.setItem(key, id);
      return id;
    } catch {
      return createId('response');
    }
  }

  window.colectorApi = {
    run: callbacks(),
    getLocation: callback => callback({
      parameter: Object.fromEntries(new URLSearchParams(location.search))
    }),
    responseId
  };
})();
