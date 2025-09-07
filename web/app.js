// Minimal app bootstrap with config check and i18n wiring
(function () {
  const state = {
    files: [],
    fields: [],
    prompt: '',
    systemInstruction: '',
    model: 'gemini-2.5-flash',
    loading: false,
    errors: { fields: [], global: [] },
    sizeOverLimit: false,
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

    function totalBytes() { return state.files.reduce((s,f)=>s+Number(f.size||0),0); }
    function human(bytes){ if(bytes<1024) return `${bytes} B`; const kb=bytes/1024; if(kb<1024) return `${kb.toFixed(1)} KB`; const mb=kb/1024; return `${mb.toFixed(2)} MB`; }
    function getLimit() { return Number(window.APP_CONFIG?.MAX_TOTAL_UPLOAD_BYTES || 20*1024*1024); }
    function renderSizeInfo(){
      const el = $('fileSizeInfo');
      const limit = getLimit();
      const bytes = totalBytes();
      const over = bytes > limit;
      const warn = !over && bytes > 0.8*limit;
      state.sizeOverLimit = over;
      el.className = `status${over ? ' error' : warn ? ' warn' : ''}`;
      const note = over ? ` — ${I18n.t('errors.sizeExceeded')}` : warn ? ` — ${I18n.t('errors.sizeWarning')}` : '';
      el.textContent = `${human(bytes)} / ${human(limit)}${note}`;
      const drop = $('dropzone');
      if (drop) { if (over) drop.classList.add('error'); else drop.classList.remove('error'); }
    }
    function renderList() {
      list.innerHTML = '';
      state.files.forEach((f, i) => {
        const li = document.createElement('li');
        const left = document.createElement('span');
        const right = document.createElement('button');
        left.textContent = `${f.name} — ${(f.size/1024).toFixed(1)} KB`;
        right.textContent = '×';
        right.setAttribute('aria-label', I18n.t('actions.remove'));
        right.title = I18n.t('actions.remove');
        right.addEventListener('click', () => { state.files.splice(i,1); renderList(); renderSizeInfo(); maybeEnableSubmit(); });
        li.appendChild(left); li.appendChild(right); list.appendChild(li);
      });
      renderSizeInfo();
    }

    ['dragenter','dragover'].forEach(evt => drop.addEventListener(evt, (e) => {
      e.preventDefault(); drop.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(evt => drop.addEventListener(evt, (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
    }));
    drop.addEventListener('drop', (e) => {
      const items = e.dataTransfer?.files || [];
      // Allow adding, but enforce block on submit; optionally, block additions if exceeding
      state.files.push(...items);
      renderList(); renderSizeInfo(); maybeEnableSubmit();
    });
    input.addEventListener('change', () => {
      state.files.push(...input.files);
      input.value = '';
      renderList(); renderSizeInfo(); maybeEnableSubmit();
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

    function renderFields(focusNew = false) {
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

        const reqWrap = document.createElement('label');
        reqWrap.style.display = 'inline-flex';
        reqWrap.style.alignItems = 'center';
        reqWrap.style.gap = '6px';
        const req = document.createElement('input');
        req.type = 'checkbox'; req.checked = fld.required; req.id = `req_${fld.id}`;
        req.addEventListener('change', () => { fld.required = req.checked; updatePreview(); });
        const reqLbl = document.createElement('span');
        reqLbl.textContent = I18n.t('schema.required');
        reqWrap.htmlFor = req.id;
        reqWrap.append(req, reqLbl);

        const del = document.createElement('button');
        del.textContent = '×'; del.title = I18n.t('actions.remove'); del.setAttribute('aria-label', I18n.t('actions.remove'));
        del.addEventListener('click', () => {
          state.fields.splice(idx,1);
          renderFields(); updatePreview();
          const addBtn = document.getElementById('addFieldBtn');
          if (addBtn) addBtn.focus();
        });

        row.append(name, type, desc, reqWrap, del);
        fieldsEl.appendChild(row);
        if (focusNew && idx === state.fields.length - 1) { name.focus(); }
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

    addBtn.addEventListener('click', () => { state.fields.push(makeField()); renderFields(true); updatePreview(); });
    // Start with one field for UX
    state.fields.push(makeField());
    renderFields();
    updatePreview();
  }

  function validateSchema() {
    const seen = new Set();
    const fieldErrs = [];
    let hasAny = false;
    state.fields.forEach((f) => { if (f.name && ['STRING','NUMBER','BOOLEAN','DATE'].includes(f.type)) hasAny = true; });
    state.fields.forEach((f) => {
      const errs = [];
      const name = (f.name || '').trim();
      if (!name) errs.push('errors.nameRequired');
      const key = name.toLowerCase();
      if (name && seen.has(key)) errs.push('errors.duplicateName');
      seen.add(key);
      fieldErrs.push(errs);
    });
    const global = [];
    if (!hasAny) global.push('errors.noFields');
    state.errors = { fields: fieldErrs, global };
    applyFieldErrorStyles();
    const g = document.getElementById('schemaErrors');
    const fieldMsgKeys = fieldErrs.flat();
    const allKeys = [...new Set([...global, ...fieldMsgKeys])];
    const text = allKeys.map(k => I18n.t(k)).join(' · ');
    g.className = `status${text ? ' error':''}`;
    g.textContent = text ? `${I18n.t('errors.pleaseFix')}: ${text}` : '';
  }

  function applyFieldErrorStyles() {
    const rows = document.querySelectorAll('#fieldsContainer .field-row');
    rows.forEach((row, idx) => {
      const nameInput = row.querySelector('input[type="text"], input:not([type])');
      const hasErr = (state.errors.fields[idx] || []).length > 0;
      if (nameInput) {
        if (hasErr) nameInput.classList.add('invalid'); else nameInput.classList.remove('invalid');
      }
    });
  }

  function maybeEnableSubmit() {
    const btn = $('submitBtn');
    const hasApi = !!(window.APP_CONFIG && window.APP_CONFIG.API_URL);
    const disabled = !(hasApi && !state.loading) || state.sizeOverLimit;
    btn.disabled = disabled;
    btn.title = disabled ? [
      !hasApi ? I18n.t('errors.configMissing') : '',
      state.sizeOverLimit ? I18n.t('errors.sizeExceeded') : ''
    ].filter(Boolean).join(' · ') : '';
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
      // Validate once on submit; if invalid, show errors and abort request
      if (state.sizeOverLimit) {
        status.textContent = '';
        return;
      }
      validateSchema();
      const hasFieldErrs = state.errors.fields.some(arr => arr.length > 0);
      const hasGlobalErrs = state.errors.global.length > 0;
      if (hasFieldErrs || hasGlobalErrs) {
        status.textContent = '';
        // Keep focus on first invalid field if any
        const firstInvalid = document.querySelector('#fieldsContainer .invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }
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
    // Collapsible advanced config toggle
    const toggle = document.getElementById('advancedToggle');
    const panel = document.getElementById('advancedPanel');
    if (toggle && panel) {
      toggle.addEventListener('click', () => {
        const hidden = panel.classList.toggle('hidden');
        toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      });
    }
    // Schema preview toggle (default off)
    const prevToggle = document.getElementById('schemaPreviewToggle');
    const prevBlock = document.getElementById('schemaPreviewBlock');
    if (prevToggle && prevBlock) {
      prevToggle.checked = false;
      prevBlock.classList.add('hidden');
      prevToggle.addEventListener('change', () => {
        if (prevToggle.checked) prevBlock.classList.remove('hidden');
        else prevBlock.classList.add('hidden');
      });
    }
    initActions();
  });
})();
