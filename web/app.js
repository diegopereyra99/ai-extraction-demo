// Minimal app bootstrap with config check and i18n wiring
(function () {
  // Helpers to lock/unlock body scroll when a modal is open (mobile)
  let __scrollY = 0;
  function lockBodyScroll() {
    __scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.add('has-modal');
    document.body.style.top = `-${__scrollY}px`;
  }
  function unlockBodyScroll() {
    document.body.classList.remove('has-modal');
    document.body.style.top = '';
    window.scrollTo(0, __scrollY);
  }
  const state = {
    files: [],
    fields: [],
    prompt: '',
    systemInstruction: '',
    model: 'gemini-2.5-flash',
    loading: false,
    errors: { fields: [], global: [] },
    sizeOverLimit: false,
    asList: true,
    view: { open: false, url: null, kind: null, lastFocusEl: null },
  };

  function $(id) { return document.getElementById(id); }

  // Schema field factory usable across handlers
  function makeField() {
    return { id: crypto.randomUUID(), name: '', required: true, description: '', type: 'STRING' };
  }

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
      const sys = I18n.t('inputs.system.placeholder');
      const prm = I18n.t('inputs.prompt.placeholder');
      if (sys && sys !== 'inputs.system.placeholder') $('systemInput').placeholder = sys;
      if (prm && prm !== 'inputs.prompt.placeholder') $('promptInput').placeholder = prm;
      showConfigWarning();
    });
  }

  function initFiles() {
    const drop = $('dropzone');
    const input = $('fileInput');
    const list = $('fileList');
    const overlay = $('fileViewerOverlay');
    const overlayContent = $('fileViewerContent');
    const overlayClose = $('fileViewerClose');

    function totalBytes() { return state.files.reduce((s,f)=>s+Number(f.size||0),0); }
    function human(bytes){ if(bytes<1024) return `${bytes} B`; const kb=bytes/1024; if(kb<1024) return `${kb.toFixed(1)} KB`; const mb=kb/1024; return `${mb.toFixed(2)} MB`; }
    function humanFile(bytes){
      if (!Number.isFinite(bytes)) return '';
      if (bytes < 1024) return `${bytes} B`;
      const kb = bytes / 1024;
      if (kb < 1024) return `${(kb < 10 ? kb.toFixed(1) : Math.round(kb)).toString()} KB`;
      const mb = kb / 1024;
      if (mb < 1024) return `${(mb < 10 ? mb.toFixed(1) : Math.round(mb)).toString()} MB`;
      const gb = mb / 1024;
      return `${(gb < 10 ? gb.toFixed(1) : Math.round(gb)).toString()} GB`;
    }
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
    function iconSvg(kind) {
      const bg = ({
        image: '#3b82f6', // blue
        sheet: '#22c55e', // green
        slide: '#f59e0b', // amber
        doc: '#60a5fa',   // light blue
        txtjson: '#8b5cf6', // violet
        pdf: '#ef4444',   // red
        file: '#64748b',  // slate
      })[kind] || '#64748b';
      switch (kind) {
        case 'image':
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M5 7h14v10H5V7zm3 .5A1.5 1.5 0 1 0 8 10a1.5 1.5 0 0 0 0-3.5zM7 17l4-4 3 3 3-3 2 4H7z"/></svg>`;
        case 'sheet':
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M6 6h12v12H6V6zm2 2h3v3H8V8zm0 5h3v3H8v-3zm5-5h3v3h-3V8zm0 5h3v3h-3v-3z"/></svg>`;
        case 'slide':
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M4 8h16v7H4V8zm2 2h7v2H6v-2z"/><path fill="#fff" d="M13 17l1.5 2h-3L10 17h3z"/></svg>`;
        case 'doc':
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M7 5h7l3 3v9H7V5zm7 .5V9h3.5L14 5.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>`;
        case 'txtjson':
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M7 5h7l3 3v9H7V5zm7 .5V9h3.5L14 5.5zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15z"/></svg>`;
        case 'pdf':
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M8 13.5h2.75a1.75 1.75 0 0 1 0 3.5H8v-3.5zm1.5 1.25v1h1.25a.5.5 0 0 0 0-1H9.5zM12.75 13.5H15a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-.75.75h-2.25v-3.5zm1.5 1.25v1h.75v-1h-.75zM16.5 13.5h2v.75h-1.25V15H18v.75h-.75V17h-1.25v-3.5z"/></svg>`;
        default:
          return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="${bg}"/><path fill="#fff" d="M7 4h7l5 5v10H7V4zm7 1.5V9h4.5L14 5.5z"/></svg>`;
      }
    }

    function getExt(name) {
      const i = name.lastIndexOf('.');
      return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
    }

    function detectKind(file) {
      const type = (file.type || '').toLowerCase();
      const ext = getExt(file.name || '');
      if (type === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', label: 'PDF file' };
      if (type.startsWith('image/')) {
        if (['jpeg','jpg','png','webp','heic','heif'].includes(ext) || ['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(type)) {
          return { kind: 'image', label: 'Image file' };
        }
      }
      if (['docx','xlsx','pptx'].includes(ext)) {
        if (ext === 'docx') return { kind: 'doc', label: 'Document file' };
        if (ext === 'xlsx') return { kind: 'sheet', label: 'Spreadsheet file' };
        if (ext === 'pptx') return { kind: 'slide', label: 'Presentation file' };
      }
      if (type === 'text/plain' || type === 'application/json' || ext === 'txt' || ext === 'json') {
        return { kind: 'txtjson', label: ext === 'json' || type === 'application/json' ? 'JSON file' : 'Text file' };
      }
      return { kind: 'file', label: 'File' };
    }

    function renderList() {
      list.innerHTML = '';
      state.files.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'file-card';
        const left = document.createElement('span');
        left.className = 'file-left';
        const right = document.createElement('button');
        const { kind, label } = detectKind(f);
        const icon = document.createElement('span');
        icon.className = 'file-icon';
        icon.innerHTML = iconSvg(kind);
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = label;
        const nameText = document.createElement('span');
        nameText.className = 'file-name';
        nameText.textContent = `${f.name}`;
        const sizeStr = humanFile(Number(f.size||0));
        const sizeWm = document.createElement('span');
        sizeWm.className = 'file-size-watermark';
        sizeWm.setAttribute('aria-hidden', 'true');
        sizeWm.textContent = sizeStr;
        const srSize = document.createElement('span');
        srSize.className = 'sr-only';
        srSize.textContent = `Size ${sizeStr}`;
        left.append(icon, sr, nameText, srSize);
        // Place watermark on the card but leave space for the remove button
        li.appendChild(sizeWm);
        right.textContent = '×';
        right.setAttribute('aria-label', I18n.t('actions.remove'));
        right.title = I18n.t('actions.remove');
        right.addEventListener('click', () => { state.files.splice(i,1); renderList(); renderSizeInfo(); maybeEnableSubmit(); });
        li.appendChild(left); li.appendChild(right); list.appendChild(li);

        // Clicking the left side opens/replaces the preview overlay
        left.tabIndex = 0;
        left.setAttribute('role', 'button');
        left.setAttribute('aria-label', `Preview ${f.name}`);
        const openPreview = () => showPreview(f, kind, left);
        left.addEventListener('click', openPreview);
        left.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview(); } });
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
    // Click/keyboard on dropzone opens file dialog
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    // Overlay helpers
    function hideOverlay() {
      if (!overlay) return;
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      if (overlayContent) overlayContent.innerHTML = '';
      // Release any object URL if used
      try { if (state.view && state.view.url) URL.revokeObjectURL(state.view.url); } catch {}
      state.view.url = null;
      state.view.open = false;
      // Return focus to previously clicked file item, if any
      try { if (state.view.lastFocusEl && state.view.lastFocusEl.focus) state.view.lastFocusEl.focus(); } catch {}
    }

    function showOverlay() {
      if (!overlay) return;
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }

    function showPreview(file, kind, sourceEl) {
      if (!overlay || !overlayContent) return;
      // If a previous URL exists, revoke it before replacing
      try { if (state.view && state.view.url) URL.revokeObjectURL(state.view.url); } catch {}
      state.view.lastFocusEl = sourceEl || null;
      overlayContent.innerHTML = '';
      let url = null;
      if (kind === 'pdf' || kind === 'image') {
        try { url = URL.createObjectURL(file); } catch {}
      }
      if (kind === 'pdf' && url) {
        const iframe = document.createElement('iframe');
        iframe.className = 'fv-content';
        iframe.src = url;
        iframe.title = `${file.name} preview`;
        iframe.setAttribute('aria-label', `${file.name} preview`);
        overlayContent.appendChild(iframe);
      } else if (kind === 'image' && url) {
        const img = document.createElement('img');
        img.className = 'fv-content';
        img.src = url;
        img.alt = `${file.name} preview`;
        overlayContent.appendChild(img);
      } else {
        const msg = document.createElement('div');
        msg.className = 'fv-message';
        msg.textContent = 'Preview not available';
        overlayContent.appendChild(msg);
      }
      state.view.url = url;
      state.view.open = true;
      showOverlay();
      // Move focus to close for accessibility
      try { if (overlayClose) overlayClose.focus(); } catch {}
    }

    if (overlayClose) overlayClose.addEventListener('click', hideOverlay);
    // Close with ESC at document level too
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.view && state.view.open) {
        e.stopPropagation();
        hideOverlay();
      }
    });
  }

  function initSchema() {
    const fieldsEl = $('fieldsContainer');
    const preview = $('schemaPreview');
    let dragIndex = -1;

    function renderFields(focusNew = false) {
      fieldsEl.innerHTML = '';
      state.fields.forEach((fld, idx) => {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.setAttribute('draggable', 'true');
        row.addEventListener('dragstart', (e) => {
          // Prevent drag from interactive controls
          const tag = e.target && e.target.tagName;
          if (tag && ['INPUT','SELECT','TEXTAREA','BUTTON','LABEL'].includes(tag)) { e.preventDefault(); return; }
          dragIndex = idx;
          row.classList.add('dragging');
          try { e.dataTransfer.effectAllowed = 'move'; } catch {}
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          dragIndex = -1;
          document.querySelectorAll('.field-row.drag-over').forEach(el => el.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
        row.addEventListener('dragleave', () => { row.classList.remove('drag-over'); });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drag-over');
          if (dragIndex === -1 || dragIndex === idx) return;
          const from = dragIndex;
          let to = idx;
          if (from < to) to--; // adjust for removal index shift
          const [moved] = state.fields.splice(from, 1);
          state.fields.splice(to, 0, moved);
          dragIndex = -1;
          renderFields();
          updatePreview();
        });
        const name = document.createElement('input');
        // Bind placeholder to i18n updates and set current value
        name.setAttribute('data-i18n-placeholder', 'schema.name.placeholder');
        name.placeholder = I18n.t('schema.name.placeholder');
        name.value = fld.name;
        name.addEventListener('input', () => { fld.name = name.value; updatePreview(); });

        const type = document.createElement('select');
        ['STRING','NUMBER','BOOLEAN','DATE'].forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.setAttribute('data-i18n', `schema.type.${t}`);
          opt.textContent = I18n.t(`schema.type.${t}`);
          type.appendChild(opt);
        });
        type.value = fld.type;
        type.addEventListener('change', () => { fld.type = type.value; updatePreview(); });

        const desc = document.createElement('input');
        // Bind placeholder to i18n updates and set current value
        desc.setAttribute('data-i18n-placeholder', 'schema.description.placeholder');
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
        // Bind label to i18n updates and set current value
        reqLbl.setAttribute('data-i18n', 'schema.required');
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
      // Add button inside container as last row
      const add = document.createElement('button');
      add.type = 'button';
      add.id = 'addFieldBtn';
      add.className = 'field-add';
      const plus = document.createElement('span'); plus.setAttribute('aria-hidden','true'); plus.textContent = '+';
      const lbl = document.createElement('span');
      // Bind label to i18n updates and set current value
      lbl.setAttribute('data-i18n', 'schema.addField');
      lbl.textContent = I18n.t('schema.addField');
      add.append(plus, lbl);
      add.addEventListener('click', () => {
        state.fields.push(makeField());
        renderFields(true);
        updatePreview();
        try {
          if (fieldsEl.scrollHeight > fieldsEl.clientHeight) {
            fieldsEl.scrollTop = fieldsEl.scrollHeight;
          }
        } catch {}
      });
      fieldsEl.appendChild(add);
      // Ensure any [data-i18n*] we attached are translated immediately
      try { if (window.I18n && typeof I18n.apply === 'function') I18n.apply(fieldsEl); } catch {}
      // Allow dropping at the end to append
      fieldsEl.addEventListener('dragover', (e) => { e.preventDefault(); });
      fieldsEl.addEventListener('drop', (e) => {
        if (dragIndex === -1) return;
        const from = dragIndex;
        let to = state.fields.length; // dropping after last row appends to end
        const [moved] = state.fields.splice(from, 1);
        state.fields.splice(to, 0, moved);
        dragIndex = -1;
        renderFields();
        updatePreview();
        try {
          if (fieldsEl.scrollHeight > fieldsEl.clientHeight) {
            fieldsEl.scrollTop = fieldsEl.scrollHeight;
          }
        } catch {}
      }, { once: true });
      if (focusNew) {
        try {
          if (fieldsEl.scrollHeight > fieldsEl.clientHeight) {
            fieldsEl.scrollTop = fieldsEl.scrollHeight;
          }
        } catch {}
      }
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
      const objSchema = buildSchema();
      const effective = state.asList ? { type: 'ARRAY', items: objSchema } : objSchema;
      preview.textContent = JSON.stringify(effective, null, 2);
      maybeEnableSubmit();
    }

    // Start empty: only inline "+ Add field" button is shown
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
      // Reset file size counter and related state
      state.sizeOverLimit = false;
      const sizeEl = $('fileSizeInfo');
      const dropEl = $('dropzone');
      if (dropEl) dropEl.classList.remove('error');
      if (sizeEl) {
        sizeEl.className = 'status';
        const limit = Number(window.APP_CONFIG?.MAX_TOTAL_UPLOAD_BYTES || 20*1024*1024);
        const human = (bytes) => {
          if (!Number.isFinite(bytes)) return '';
          if (bytes < 1024) return `${bytes} B`;
          const kb = bytes / 1024;
          if (kb < 1024) return `${(kb < 10 ? kb.toFixed(1) : Math.round(kb)).toString()} KB`;
          const mb = kb / 1024;
          if (mb < 1024) return `${(mb < 10 ? mb.toFixed(1) : Math.round(mb)).toString()} MB`;
          const gb = mb / 1024;
          return `${(gb < 10 ? gb.toFixed(1) : Math.round(gb)).toString()} GB`;
        };
        sizeEl.textContent = `${human(0)} / ${human(limit)}`;
      }
      state.fields = [];
      $('schemaPreview').textContent='';
      $('promptInput').value=''; $('systemInput').value='';
      $('result').innerHTML=''; $('status').textContent='';
      // Re-render schema box with only the inline add button
      initSchema();
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
    if (data == null) {
      result.innerHTML = `<div class="banner banner-error">${I18n.t('results.error')}</div>`;
      return;
    }
    const fieldOrder = state.fields.map(f => (f && f.name) ? String(f.name) : '').filter(Boolean);
    if (Array.isArray(data)) {
      if (data.length === 0) {
        result.innerHTML = `<div class="status">${I18n.t('results.empty')}</div>`;
        return;
      }
      const allKeysSet = new Set();
      data.forEach(row => { if (row && typeof row === 'object') Object.keys(row).forEach(k => allKeysSet.add(k)); });
      const allKeys = Array.from(allKeysSet);
      const orderedKeys = [
        ...fieldOrder.filter(k => allKeys.includes(k)),
        ...allKeys.filter(k => !fieldOrder.includes(k)),
      ];
      const table = document.createElement('table');
      table.style.width = '100%'; table.style.borderCollapse = 'collapse';
      const thead = document.createElement('thead');
      const headTr = document.createElement('tr');
      orderedKeys.forEach(k => {
        const c = document.createElement('th'); c.textContent = k; c.style.textAlign='left'; c.style.borderBottom='1px solid var(--border)'; c.style.padding='6px'; headTr.appendChild(c);
      });
      thead.appendChild(headTr);
      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        orderedKeys.forEach(k => {
          const td = document.createElement('td');
          const v = row && typeof row === 'object' ? row[k] : undefined;
          td.textContent = v === null ? 'null' : v === undefined ? '' : String(v);
          td.style.padding='6px';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.append(thead, tbody);
      const meta = document.createElement('div');
      meta.className = 'status';
      meta.textContent = `${I18n.t('results.model')}: ${model} · ${I18n.t('results.trace')}: ${trace_id}`;
      result.innerHTML = '';
      result.appendChild(table);
      result.appendChild(meta);
      return;
    }
    if (typeof data !== 'object') {
      result.innerHTML = `<div class="banner banner-error">${I18n.t('results.error')}</div>`;
      return;
    }
    const dataKeys = Object.keys(data);
    const orderedKeys = [
      ...fieldOrder.filter(k => dataKeys.includes(k)),
      ...dataKeys.filter(k => !fieldOrder.includes(k)),
    ];
    const table = document.createElement('table');
    table.style.width = '100%'; table.style.borderCollapse = 'collapse';
    const th = document.createElement('tr');
    orderedKeys.forEach(k => {
      const c = document.createElement('th'); c.textContent = k; c.style.textAlign='left'; c.style.borderBottom='1px solid var(--border)'; c.style.padding='6px'; th.appendChild(c);
    });
    const tr = document.createElement('tr');
    orderedKeys.forEach(k => {
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

  document.addEventListener('DOMContentLoaded', async () => {
    // Ensure i18n is ready before first render so initial strings are translated
    await I18n.init();
    // Set placeholders derived from i18n and show config warning
    try {
      const sys = I18n.t('inputs.system.placeholder');
      const prm = I18n.t('inputs.prompt.placeholder');
      if (sys && sys !== 'inputs.system.placeholder') $('systemInput').placeholder = sys;
      if (prm && prm !== 'inputs.prompt.placeholder') $('promptInput').placeholder = prm;
    } catch {}
    showConfigWarning();

    initFiles();
    initSchema();
    // Modal helpers (Help and About)
    function setupModal(prefix) {
      const btn = document.getElementById(`${prefix}Btn`);
      const modal = document.getElementById(`${prefix}Modal`);
      const close = document.getElementById(`${prefix}Close`);
      let lastFocusEl = null;
      function open() {
        if (!modal) return;
        lastFocusEl = document.activeElement;
        modal.classList.remove('hidden');
        try { modal.removeAttribute('hidden'); } catch {}
        lockBodyScroll();
        if (close) close.focus();
      }
      function doClose() {
        if (!modal) return;
        modal.classList.add('hidden');
        try { modal.setAttribute('hidden', ''); } catch {}
        unlockBodyScroll();
        if (lastFocusEl && lastFocusEl.focus) { try { lastFocusEl.focus(); } catch {} }
      }
      if (btn) btn.addEventListener('click', open);
      if (close) close.addEventListener('click', doClose);
      if (modal) {
        modal.addEventListener('click', (e) => {
          const target = e.target;
          if (target && target.getAttribute && target.getAttribute('data-close') === prefix) {
            doClose();
          }
        });
      }
      return doClose;
    }
    const closeHelp = setupModal('help');
    const closeAbout = setupModal('about');
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof closeHelp === 'function') closeHelp();
        if (typeof closeAbout === 'function') closeAbout();
      }
    });
    // Collapsible advanced config toggle
    const toggle = document.getElementById('advancedToggle');
    const panel = document.getElementById('advancedPanel');
    if (toggle && panel) {
      // Prepare panel for animation
      panel.classList.remove('hidden');
      panel.style.maxHeight = '0px';
      panel.style.opacity = '0';
      toggle.setAttribute('aria-expanded', 'false');
      let animating = false;
      toggle.addEventListener('click', () => {
        if (animating) return;
        animating = true;
        const opening = !panel.classList.contains('is-open');
        if (opening) {
          panel.classList.add('is-open');
          // set to scrollHeight for transition then clear to auto
          panel.style.maxHeight = panel.scrollHeight + 'px';
          panel.style.opacity = '1';
          const onEnd = () => { panel.style.maxHeight = 'none'; panel.removeEventListener('transitionend', onEnd); animating = false; };
          panel.addEventListener('transitionend', onEnd);
          toggle.setAttribute('aria-expanded', 'true');
        } else {
          // from auto to fixed height to 0
          const current = panel.scrollHeight;
          panel.style.maxHeight = current + 'px';
          // force reflow
          void panel.offsetHeight;
          panel.style.maxHeight = '0px';
          panel.style.opacity = '0';
          const onEnd = () => { panel.classList.remove('is-open'); panel.removeEventListener('transitionend', onEnd); animating = false; };
          panel.addEventListener('transitionend', onEnd);
          toggle.setAttribute('aria-expanded', 'false');
        }
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
    // Extract as list toggle
    const asListToggle = document.getElementById('asListToggle');
    if (asListToggle) {
      asListToggle.checked = true;
      state.asList = true;
      asListToggle.addEventListener('change', () => {
        state.asList = !!asListToggle.checked;
        // Recompute preview to reflect wrapping/unwrapping
        try {
          const props = {};
          const required = [];
          for (const f of state.fields) {
            if (!f || !f.name) continue;
            const def = {};
            if (f.type === 'DATE') { def.type = 'STRING'; def.format = 'date'; }
            else { def.type = f.type; }
            if (f.description) def.description = f.description;
            props[f.name] = def;
            if (f.required) required.push(f.name);
          }
          const objSchema = { type: 'OBJECT', properties: props, required: Array.from(new Set(required)) };
          const effective = state.asList ? { type: 'ARRAY', items: objSchema } : objSchema;
          const prev = document.getElementById('schemaPreview');
          if (prev) prev.textContent = JSON.stringify(effective, null, 2);
        } catch {}
      });
    }
    initActions();
  });
})();
