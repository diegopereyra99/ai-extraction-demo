// Minimal app bootstrap with config check and i18n wiring
(function () {
  const state = {
    files: [],
    fields: [],
    prompt: '',
    systemInstruction: '',
    model: 'gemini-2.5-flash',
    loading: false,
  };

  function $(id) { return document.getElementById(id); }

  function showConfigWarning() {
    const warn = $('configWarning');
    if (!window.APP_CONFIG || !window.APP_CONFIG.API_URL) {
      warn.textContent = I18n.t('errors.configMissing');
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }
  }

  function initLanguage() {
    I18n.init().then(() => {
      // Set default placeholders
      $('systemInput').placeholder = I18n.t('inputs.system.placeholder');
      $('promptInput').placeholder = I18n.t('inputs.prompt.placeholder');
      showConfigWarning();
    });
  }

  function initFiles() {
    const drop = $('dropzone');
    const input = $('fileInput');
    const selectBtn = $('selectFilesBtn');
    const list = $('fileList');

    function renderList() {
      list.innerHTML = '';
      state.files.forEach((f, i) => {
        const li = document.createElement('li');
        const left = document.createElement('span');
        const right = document.createElement('button');
        left.textContent = `${f.name} — ${(f.size/1024).toFixed(1)} KB`;
        right.textContent = '×';
        right.setAttribute('aria-label', 'Remove');
        right.addEventListener('click', () => { state.files.splice(i,1); renderList(); });
        li.appendChild(left); li.appendChild(right); list.appendChild(li);
      });
    }

    ['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, (e) => {
      e.preventDefault(); drop.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
    }));
    drop.addEventListener('drop', (e) => {
      const items = e.dataTransfer?.files || [];
      state.files.push(...items);
      renderList();
      maybeEnableSubmit();
    });
    input.addEventListener('change', () => {
      state.files.push(...input.files);
      input.value = '';
      renderList();
      maybeEnableSubmit();
    });
    selectBtn.addEventListener('click', () => input.click());
  }

  function initSchema() {
    const fieldsEl = $('fieldsContainer');
    const addBtn = $('addFieldBtn');
    const preview = $('schemaPreview');

    function makeField() {
      return { id: crypto.randomUUID(), name: '', required: true, description: '', type: 'STRING' };
    }

    function renderFields() {
      fieldsEl.innerHTML = '';
      state.fields.forEach((fld, idx) => {
        const row = document.createElement('div');
        row.className = 'field-row';
        const name = document.createElement('input');
        name.placeholder = I18n.t('schema.name.placeholder');
        name.value = fld.name;
        name.addEventListener('input', () => { fld.name = name.value; updatePreview(); });

        const type = document.createElement('select');
        ['STRING','NUMBER','BOOLEAN','DATE'].forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t; opt.textContent = I18n.t(`schema.type.${t}`); type.appendChild(opt);
        });
        type.value = fld.type;
        type.addEventListener('change', () => { fld.type = type.value; updatePreview(); });

        const desc = document.createElement('input');
        desc.placeholder = I18n.t('schema.description.placeholder');
        desc.value = fld.description;
        desc.addEventListener('input', () => { fld.description = desc.value; updatePreview(); });

        const req = document.createElement('input');
        req.type = 'checkbox'; req.checked = fld.required;
        req.addEventListener('change', () => { fld.required = req.checked; updatePreview(); });

        const del = document.createElement('button');
        del.textContent = '×'; del.title = I18n.t('actions.remove');
        del.addEventListener('click', () => { state.fields.splice(idx,1); renderFields(); updatePreview(); });

        row.append(name, type, desc, req, del);
        fieldsEl.appendChild(row);
      });
    }

    function buildSchema() {
      const props = {};
      const required = [];
      for (const f of state.fields) {
        if (!f.name) continue;
        const def = {};
        if (f.type === 'DATE') {
          def.type = 'STRING';
          def.format = 'date';
        } else {
          def.type = f.type;
        }
        if (f.description) def.description = f.description;
        props[f.name] = def;
        if (f.required) required.push(f.name);
      }
      return { type: 'OBJECT', properties: props, required: Array.from(new Set(required)) };
    }

    function updatePreview() {
      const schema = buildSchema();
      preview.textContent = JSON.stringify(schema, null, 2);
      maybeEnableSubmit();
    }

    addBtn.addEventListener('click', () => { state.fields.push(makeField()); renderFields(); updatePreview(); });
    // Start with one field for UX
    state.fields.push(makeField());
    renderFields();
    updatePreview();
  }

  function maybeEnableSubmit() {
    const btn = $('submitBtn');
    const valid = state.fields.some(f => f.name && ['STRING','NUMBER','BOOLEAN','DATE'].includes(f.type));
    const hasApi = !!(window.APP_CONFIG && window.APP_CONFIG.API_URL);
    btn.disabled = !(valid && hasApi && !state.loading);
  }

  function initActions() {
    $('clearBtn').addEventListener('click', () => {
      state.files = []; $('fileList').innerHTML='';
      state.fields = []; $('fieldsContainer').innerHTML='';
      $('schemaPreview').textContent='';
      $('promptInput').value=''; $('systemInput').value='';
      $('result').innerHTML=''; $('status').textContent='';
      // re-init schema
      state.fields = []; document.querySelector('#addFieldBtn').click();
      maybeEnableSubmit();
    });
    $('submitBtn').addEventListener('click', onSubmit);
  }

  async function onSubmit() {
    const status = $('status');
    const result = $('result');
    result.innerHTML = '';
    status.textContent = I18n.t('status.loading');
    state.loading = true; maybeEnableSubmit();

    const schema = $('schemaPreview').textContent;
    const url = window.APP_CONFIG?.API_URL || '';
    const localeSel = document.getElementById('langSelect');
    const locale = localeSel ? localeSel.value : 'en';

    try {
      let resp;
      if (state.files.length > 0) {
        const fd = new FormData();
        state.files.forEach(f => fd.append('files[]', f, f.name));
        fd.append('prompt', $('promptInput').value || '');
        fd.append('system_instruction', $('systemInput').value || I18n.t('defaults.systemInstruction'));
        fd.append('schema', schema);
        fd.append('model', $('modelSelect').value);
        fd.append('locale', locale);
        resp = await fetch(url, { method: 'POST', body: fd });
      } else {
        const body = {
          prompt: $('promptInput').value || '',
          system_instruction: $('systemInput').value || I18n.t('defaults.systemInstruction'),
          schema,
          model: $('modelSelect').value,
          locale,
        };
        resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Request failed');
      status.textContent = '';
      renderResult(data);
    } catch (e) {
      status.textContent = '';
      result.innerHTML = `<div class="banner banner-error">${(e && e.message) || 'Error'}</div>`;
    } finally {
      state.loading = false; maybeEnableSubmit();
    }
  }

  function renderResult(payload) {
    const { data, model, trace_id } = payload;
    const result = $('result');
    if (!data || typeof data !== 'object') {
      result.innerHTML = `<div class="banner banner-error">${I18n.t('results.error')}</div>`;
      return;
    }
    const keys = Object.keys(data);
    const table = document.createElement('table');
    table.style.width = '100%'; table.style.borderCollapse = 'collapse';
    const th = document.createElement('tr');
    keys.forEach(k => {
      const c = document.createElement('th'); c.textContent = k; c.style.textAlign='left'; c.style.borderBottom='1px solid var(--border)'; c.style.padding='6px'; th.appendChild(c);
    });
    const tr = document.createElement('tr');
    keys.forEach(k => {
      const c = document.createElement('td'); c.textContent = data[k] === null ? 'null' : String(data[k]); c.style.padding='6px'; tr.appendChild(c);
    });
    const thead = document.createElement('thead'); thead.appendChild(th);
    const tbody = document.createElement('tbody'); tbody.appendChild(tr);
    table.append(thead, tbody);
    const meta = document.createElement('div');
    meta.className = 'status';
    meta.textContent = `${I18n.t('results.model')}: ${model} · ${I18n.t('results.trace')}: ${trace_id}`;
    result.innerHTML = '';
    result.appendChild(table);
    result.appendChild(meta);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLanguage();
    initFiles();
    initSchema();
    initActions();
  });
})();

