(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  const APP_ID = kintone.app.getId();
  if (!PLUGIN_ID || !APP_ID) {
    return;
  }

  const TEXT = {
    ja: {
      title: 'Outlook メール作成ボタン',
      description: 'レコードに登録された宛先と定型文から Outlook Web の下書きを開くボタンを追加します。',
      toFieldLabel: 'TO フィールド',
      toHint: '複数宛先は改行またはカンマ区切りで記入してください。',
      subjectFieldLabel: '件名フィールド',
      subjectHint: '単一行テキストの利用を推奨します。',
      bodyFieldLabel: '本文フィールド',
      bodyHint: '複数行テキストを推奨します。',
      templateFieldLabel: 'テンプレート名フィールド',
      templateHint: '一覧で表示・絞り込む文字列フィールドを選択してください。',
      viewFieldLabel: '表示するビュー',
      viewHint: '未選択の場合はすべてのビューでボタンを表示します。',
      viewEmpty: 'ビューが見つかりません。',
      buttonLabel: 'ボタン表示テキスト (任意)',
      buttonHint: '未入力の場合は既定文言「Outlook で作成」を使用します。',
      save: '保存',
      cancel: 'キャンセル',
      notSet: '選択してください',
      messageRequired: 'TO・件名・本文・テンプレート名の各フィールドを選択してください。',
      messageSaved: '設定を保存しました。',
      apiError: 'フィールド情報の取得に失敗しました。ページを再読み込みしてください。'
    },
    en: {
      title: 'Outlook Compose Button',
      description: 'Adds a header button that opens an Outlook Web draft using record fields.',
      toFieldLabel: 'To Field',
      toHint: 'Use commas or line breaks to specify multiple recipients.',
      subjectFieldLabel: 'Subject Field',
      subjectHint: 'Single-line text field is recommended.',
      bodyFieldLabel: 'Body Field',
      bodyHint: 'Multi-line text field is recommended.',
      templateFieldLabel: 'Template Name Field',
      templateHint: 'Select the string field used to list and filter templates.',
      viewFieldLabel: 'Views',
      viewHint: 'Leave empty to show the button on all views.',
      viewEmpty: 'No views are available.',
      buttonLabel: 'Button Label (optional)',
      buttonHint: 'If empty, the default “Compose in Outlook” is used.',
      save: 'Save',
      cancel: 'Cancel',
      notSet: 'Select an option',
      messageRequired: 'Select fields for To, Subject, Body, and Template Name.',
      messageSaved: 'Settings saved.',
      apiError: 'Failed to load field information. Please reload the page.'
    }
  };

  const getLang = () => {
    try {
      const lang = window.kintone?.getLoginUser?.().language;
      if (lang && TEXT[lang]) {
        return lang;
      }
    } catch (_err) {
      /* noop */
    }
    return 'ja';
  };

  const lang = getLang();
  const STRINGS = TEXT[lang];

  const allowedTypes = new Set([
    'SINGLE_LINE_TEXT',
    'MULTI_LINE_TEXT',
    'LINK',
    'CALC'
  ]);

  const $ = (id) => document.getElementById(id);
  const messageEl = $('message');
  const toSelect = $('toField');
  const subjectSelect = $('subjectField');
  const bodySelect = $('bodyField');
  const templateSelect = $('templateField');
  const viewListEl = $('viewList');
  const buttonLabelInput = $('buttonLabel');
  const saveBtn = $('save');
  const cancelBtn = $('cancel');

  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  };

  const setTextContent = () => {
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (key && Object.prototype.hasOwnProperty.call(STRINGS, key)) {
        node.textContent = STRINGS[key];
      }
    });
  };

  const showMessage = (text) => {
    if (!messageEl) {
      return;
    }
    if (text) {
      messageEl.textContent = text;
      messageEl.style.display = 'block';
    } else {
      messageEl.textContent = '';
      messageEl.style.display = 'none';
    }
  };

  const clearOptions = (select) => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  };

  const createPlaceholderOption = (select) => {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = STRINGS.notSet;
    select.appendChild(opt);
  };

  const populateSelect = (select, fields, selectedValue) => {
    clearOptions(select);
    createPlaceholderOption(select);
    fields.forEach((field) => {
      const opt = document.createElement('option');
      opt.value = field.code;
      opt.textContent = `${field.label} (${field.code})`;
      if (field.code === selectedValue) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  };

  const fetchFields = async () => {
    const url = kintone.api.url('/k/v1/app/form/fields', true);
    const resp = await kintone.api(url, 'GET', { app: APP_ID });
    const props = resp?.properties || {};
    const results = [];
    Object.values(props).forEach((prop) => {
      if (!prop || typeof prop !== 'object') {
        return;
      }
      if (prop.type === 'SUBTABLE') {
        return;
      }
      if (!allowedTypes.has(prop.type)) {
        return;
      }
      results.push({
        code: prop.code,
        label: prop.label || prop.code,
        type: prop.type
      });
    });
    const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
    results.sort((a, b) => a.label.localeCompare(b.label, locale));
    return results;
  };

  const fetchViews = async () => {
    const url = kintone.api.url('/k/v1/app/views', true);
    const resp = await kintone.api(url, 'GET', { app: APP_ID });
    const views = resp?.views || {};
    const results = [];
    Object.values(views).forEach((view) => {
      const id = view?.id != null ? String(view.id) : '';
      const name = view?.name || '';
      const key = id || `name:${name}`;
      results.push({ key, id, name, type: view?.type || '' });
    });
    const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
    results.sort((a, b) => a.name.localeCompare(b.name, locale));
    return results;
  };

  const renderViewList = (views, selectedIds) => {
    if (!viewListEl) {
      return;
    }
    viewListEl.innerHTML = '';
    const selectedSet = new Set(selectedIds);
    views.forEach((view) => {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = view.key;
      checkbox.checked = selectedSet.has(view.key);

      const text = document.createElement('span');
      text.textContent = view.id ? `${view.name} (ID: ${view.id})` : view.name;

      row.append(checkbox, text);
      viewListEl.appendChild(row);
    });

    if (!views.length) {
      const empty = document.createElement('span');
      empty.className = 'kb-muted';
      empty.textContent = STRINGS.viewEmpty;
      viewListEl.appendChild(empty);
    }
  };

  const parseViewIds = (value) => {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch (_err) {
      /* fallback */
    }
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const loadConfig = () => {
    const stored = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    return {
      toField: stored.toField || '',
      subjectField: stored.subjectField || '',
      bodyField: stored.bodyField || '',
      templateField: stored.templateField || '',
      viewIds: parseViewIds(stored.viewIds || ''),
      buttonLabel: stored.buttonLabel || ''
    };
  };

  const bindEvents = () => {
    saveBtn.addEventListener('click', () => {
      showMessage('');
      const selectedViews = Array.from(viewListEl?.querySelectorAll('input[type="checkbox"]') || [])
        .filter((input) => input.checked)
        .map((input) => input.value);

      const payload = {
        viewIds: selectedViews.length ? JSON.stringify(selectedViews) : '',
        toField: toSelect.value?.trim() ?? '',
        subjectField: subjectSelect.value?.trim() ?? '',
        bodyField: bodySelect.value?.trim() ?? '',
        templateField: templateSelect.value?.trim() ?? '',
        buttonLabel: buttonLabelInput.value?.trim() ?? ''
      };

      if (!payload.toField || !payload.subjectField || !payload.bodyField || !payload.templateField) {
        showMessage(STRINGS.messageRequired);
        return;
      }

      kintone.plugin.app.setConfig(payload, () => {
        window.alert(STRINGS.messageSaved);
      });
    });

    cancelBtn.addEventListener('click', () => {
      history.back();
    });
  };

  onReady(async () => {
    setTextContent();
    try {
      const [fields, views] = await Promise.all([
        fetchFields(),
        fetchViews()
      ]);

      if (!fields.length) {
        showMessage(STRINGS.apiError);
        saveBtn.disabled = true;
        return;
      }

      const config = loadConfig();
      renderViewList(views, config.viewIds);
      populateSelect(toSelect, fields, config.toField);
      populateSelect(subjectSelect, fields, config.subjectField);
      populateSelect(bodySelect, fields, config.bodyField);
      populateSelect(templateSelect, fields, config.templateField);
      buttonLabelInput.value = config.buttonLabel || '';

      bindEvents();
    } catch (err) {
      console.error(err);
      showMessage(STRINGS.apiError);
      saveBtn.disabled = true;
    }
  });
})();
