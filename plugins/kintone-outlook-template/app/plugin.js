(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;
  if (!PLUGIN_ID) {
    return;
  }

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
      /* ignore */
    }
    return String(value)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const CONFIG = (() => {
    const stored = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
    const normalize = (value) => (typeof value === 'string') ? value.trim() : '';
    return {
      toField: normalize(stored.toField),
      subjectField: normalize(stored.subjectField),
      bodyField: normalize(stored.bodyField),
      templateField: normalize(stored.templateField),
      buttonLabel: normalize(stored.buttonLabel),
      viewIds: parseViewIds(stored.viewIds || '')
    };
  })();

  if (!CONFIG.toField || !CONFIG.subjectField || !CONFIG.bodyField || !CONFIG.templateField) {
    console.warn('[outlook-compose] Plugin is not configured.');
    return;
  }

  const VIEW_ID_SET = new Set(CONFIG.viewIds);
  const hasViewLimit = VIEW_ID_SET.size > 0;

  const TEXT = {
    ja: {
      buttonLabelDefault: 'Outlook で作成',
      alertMissingTo: '宛先が空です。レコードの値を確認してください。',
      alertMissingSubject: '件名が空です。レコードの値を確認してください。',
      alertMissingBody: '本文が空です。レコードの値を確認してください。',
      popupBlocked: 'Outlook を開けませんでした。ブラウザのポップアップ設定をご確認ください。',
      modalSearchPlaceholder: 'テンプレート名で検索',
      modalEmpty: '現在の一覧にはテンプレートがありません。',
      modalCompose: '選択したテンプレで作成',
      modalComposeSingle: 'このテンプレで作成',
      modalClose: '閉じる',
      modalNoSelection: 'テンプレートが選択されていません。'
    },
    en: {
      buttonLabelDefault: 'Compose in Outlook',
      alertMissingTo: 'The To field is empty. Please check the record values.',
      alertMissingSubject: 'The subject is empty. Please check the record values.',
      alertMissingBody: 'The body is empty. Please check the record values.',
      popupBlocked: 'Unable to open Outlook. Please allow pop-ups in your browser.',
      modalSearchPlaceholder: 'Search template name',
      modalEmpty: 'No templates are available in this view.',
      modalCompose: 'Compose with selected',
      modalComposeSingle: 'Compose',
      modalClose: 'Close',
      modalNoSelection: 'No templates selected.'
    }
  };

  const getLang = () => {
    try {
      const lang = window.kintone?.getLoginUser?.().language;
      if (lang && TEXT[lang]) {
        return lang;
      }
    } catch (_err) {
      /* ignore */
    }
    return 'ja';
  };

  const lang = getLang();
  const STRINGS = TEXT[lang];
  const BUTTON_LABEL = CONFIG.buttonLabel || STRINGS.buttonLabelDefault;

  const normalizeLineBreaks = (text) => text.replace(/\r\n?/g, '\n');

  const parseRecipients = (value) => {
    if (!value) {
      return [];
    }
    const normalized = normalizeLineBreaks(value).replace(/[\u3001\uff0c]/gu, ',');
    return normalized
      .split(/[\s,;]+/u)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^mailto:/iu, ''))
      .map((entry) => entry.replace(/[<>]/g, ''));
  };

  const extractText = (field) => {
    if (!field) {
      return '';
    }
    const { value } = field;
    if (typeof value === 'string') {
      return value;
    }
    if (value == null) {
      return '';
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            return item.code || item.name || '';
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }
    return String(value);
  };

  const buildComposeUrl = (mail) => {
    const params = [];
    const add = (key, val) => {
      if (!val) {
        return;
      }
      params.push(`${key}=${encodeURIComponent(val)}`);
    };

    if (mail.to.length) {
      add('to', mail.to.join(';'));
    }
    if (mail.subject) {
      add('subject', mail.subject);
    }
    if (mail.body) {
      const normalized = normalizeLineBreaks(mail.body).replace(/\n/g, '\r\n');
      add('body', normalized);
    }

    const base = 'https://outlook.office.com/mail/deeplink/compose';
    if (!params.length) {
      return base;
    }
    return `${base}?${params.join('&')}`;
  };

  const openDraft = (record) => {
    const to = parseRecipients(extractText(record[CONFIG.toField]));
    if (!to.length) {
      window.alert(STRINGS.alertMissingTo);
      return;
    }

    const subject = extractText(record[CONFIG.subjectField]).trim();
    if (!subject) {
      window.alert(STRINGS.alertMissingSubject);
      return;
    }

    const body = extractText(record[CONFIG.bodyField]);
    if (!body.trim()) {
      window.alert(STRINGS.alertMissingBody);
      return;
    }

    const url = buildComposeUrl({ to, subject, body });
    const win = window.open(url, '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch (_err) {
        /* ignore */
      }
    } else {
      window.alert(STRINGS.popupBlocked);
    }
  };

  const findOrCreateHeaderButton = (host) => {
    if (!host) {
      return null;
    }
    let root = host.querySelector('.kb-root[data-kb-plugin="outlook-compose"]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'kb-root kb-head';
      root.setAttribute('data-kb-plugin', 'outlook-compose');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kb-btn kb-primary';
      button.textContent = BUTTON_LABEL;
      root.appendChild(button);
      host.appendChild(root);
      return button;
    }
    const button = root.querySelector('button');
    if (button && button.textContent !== BUTTON_LABEL) {
      button.textContent = BUTTON_LABEL;
    }
    return button;
  };

  const removeHeaderButton = (host) => {
    if (!host) {
      return;
    }
    const root = host.querySelector('.kb-root[data-kb-plugin="outlook-compose"]');
    if (root) {
      root.remove();
    }
  };

  const buildModal = (records) => {
    if (document.querySelector('.kb-root.kb-backdrop[data-kb-plugin="outlook-compose"]')) {
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'kb-root kb-backdrop';
    backdrop.setAttribute('data-kb-plugin', 'outlook-compose');

    const modal = document.createElement('div');
    modal.className = 'kb-root kb-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', STRINGS.modalTitle);

    const card = document.createElement('div');
    card.className = 'kb-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '16px';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'kb-input';
    searchWrap.style.display = 'flex';
    searchWrap.style.flexDirection = 'column';
    searchWrap.style.gap = '4px';

    const searchLabel = document.createElement('label');
    searchLabel.className = 'kb-label';
    searchLabel.textContent = STRINGS.modalSearchPlaceholder;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = STRINGS.modalSearchPlaceholder;

    searchWrap.append(searchLabel, searchInput);

    const list = document.createElement('ul');
    list.className = 'kb-subtable-list';
    list.style.maxHeight = '360px';
    list.style.overflowY = 'auto';

    const removeModal = () => {
      modal.remove();
      backdrop.remove();
      window.removeEventListener('keydown', handleKeydown);
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        removeModal();
      }
    };

    const items = records.map((record, index) => {
      const templateLabel = extractText(record[CONFIG.templateField]).trim();
      const name = templateLabel || `#${record.$id?.value || index + 1}`;

      const li = document.createElement('li');
      li.className = 'kb-subtable-item';
      li.dataset.templateName = name.toLowerCase();
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '12px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = index.toString();
      checkbox.className = 'kb-input';
      checkbox.style.margin = '0';
      checkbox.setAttribute('aria-label', name);

      const label = document.createElement('div');
      label.style.flex = '1';
      label.style.display = 'flex';
      label.style.flexDirection = 'column';
      label.style.gap = '4px';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'kb-label';
      nameSpan.textContent = name;

      const composeSingleBtn = document.createElement('button');
      composeSingleBtn.type = 'button';
      composeSingleBtn.className = 'kb-btn kb-inline-btn';
      composeSingleBtn.textContent = STRINGS.modalComposeSingle;
      composeSingleBtn.addEventListener('click', () => {
        openDraft(record);
        removeModal();
      });

      label.append(nameSpan);
      li.append(checkbox, label, composeSingleBtn);
      list.appendChild(li);
      return li;
    });

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'kb-muted';
      empty.textContent = STRINGS.modalEmpty;
      list.appendChild(empty);
    }

    const footer = document.createElement('div');
    footer.className = 'kb-toolbar';
    footer.style.display = 'flex';
    footer.style.gap = '16px';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kb-btn';
    closeBtn.textContent = STRINGS.modalClose;

    const composeManyBtn = document.createElement('button');
    composeManyBtn.type = 'button';
    composeManyBtn.className = 'kb-btn kb-primary';
    composeManyBtn.textContent = STRINGS.modalCompose;

    footer.append(closeBtn, composeManyBtn);
    card.append(searchWrap, list, footer);
    modal.appendChild(card);

    const filterList = () => {
      const keyword = searchInput.value.trim().toLowerCase();
      items.forEach((li) => {
        const match = !keyword || li.dataset.templateName?.includes(keyword);
        li.style.display = match ? 'flex' : 'none';
      });
    };

    const composeSelected = () => {
      const selectedIndexes = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.value))
        .filter((idx) => Number.isInteger(idx));

      if (!selectedIndexes.length) {
        window.alert(STRINGS.modalNoSelection);
        return;
      }

      selectedIndexes.forEach((idx, order) => {
        const record = records[idx];
        if (!record) {
          return;
        }
        const delay = order * 250;
        window.setTimeout(() => openDraft(record), delay);
      });

      removeModal();
    };

    searchInput.addEventListener('input', filterList);
    closeBtn.addEventListener('click', removeModal);
    composeManyBtn.addEventListener('click', composeSelected);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        removeModal();
      }
    });
    window.addEventListener('keydown', handleKeydown);

    document.body.append(backdrop, modal);
    searchInput.focus();
    filterList();
  };

  const getViewKey = (event) => {
    if (event.viewId != null) {
      return String(event.viewId);
    }
    if (event.viewName) {
      return `name:${event.viewName}`;
    }
    return '';
  };

  kintone.events.on('app.record.detail.show', (event) => {
    const host = kintone.app?.record?.getHeaderMenuSpaceElement?.() || kintone.app?.getHeaderMenuSpaceElement?.();
    const button = findOrCreateHeaderButton(host);
    if (button) {
      button.onclick = () => openDraft(event.record);
    }
    return event;
  });

  kintone.events.on('app.record.index.show', (event) => {
    const host = kintone.app?.getHeaderMenuSpaceElement?.();
    const records = Array.isArray(event.records) ? event.records : [];
    if (!records.length) {
      removeHeaderButton(host);
      return event;
    }

    if (hasViewLimit) {
      const viewKey = getViewKey(event);
      if (!VIEW_ID_SET.has(viewKey)) {
        removeHeaderButton(host);
        return event;
      }
    }

    const button = findOrCreateHeaderButton(host);
    if (button) {
      button.onclick = () => buildModal(records);
    }
    return event;
  });
})();
