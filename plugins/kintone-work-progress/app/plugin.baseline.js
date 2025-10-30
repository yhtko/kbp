(function (PLUGIN_ID) {
  'use strict';

  if (!PLUGIN_ID) {
    console.warn('kintone-work-progress: 繝励Λ繧ｰ繧､繝ｳID繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・);
    return;
  }

  const DEFAULTS = {
    subtableCode: '險ｼ諡',
    fileFieldCode: '逕ｻ蜒・,
    memoFieldCode: '繝｡繝｢',
    authorFieldCode: '',
    timestampFieldCode: '',
    layout: 'grid',
    compressionEnabled: true,
    maxImageEdge: 1600,
    imageQuality: 0.85,
    memoTemplate: '繧ｹ繧ｯ繧ｷ繝ｧ霑ｽ蜉',
    postAddBehavior: 'instant',
    commentEnabled: false,
    commentBody: '繧ｹ繧ｯ繧ｷ繝ｧ繧定ｿｽ蜉縺励∪縺励◆'
  };

  const state = {
    settings: null,
    appId: kintone.app.getId(),
    recordId: null,
    revision: null,
    record: null,
    rows: [],
    canEdit: true,
    busy: false,
    elements: {},
    lightbox: null
  };

  const EVENT_TYPES = ['app.record.detail.show'];

  function parseSettings(raw) {
    if (!raw) {
      return { ...DEFAULTS };
    }
    try {
      if (raw.settings) {
        return { ...DEFAULTS, ...JSON.parse(raw.settings) };
      }
      return { ...DEFAULTS, ...raw };
    } catch (error) {
      console.warn('kintone-work-progress: 險ｭ螳壹・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺溘◆繧∵里螳壼､繧剃ｽｿ逕ｨ縺励∪縺吶・, error);
      return { ...DEFAULTS };
    }
  }

  function formatTimestamp(iso) {
    if (!iso) {
      return '---';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '---';
    }
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate()),
      ' ',
      pad(date.getHours()),
      ':',
      pad(date.getMinutes())
    ].join('');
  }

  function getRequestToken() {
    if (typeof kintone.getRequestToken === 'function') {
      return kintone.getRequestToken();
    }
    const token = document.querySelector('input[name="__REQUEST_TOKEN__"]');
    return token ? token.value : '';
  }

  function resolveMountPoint() {
    const sidebar = document.querySelector('.gaia-argoui-app-show-sidebar');
    if (sidebar) {
      return sidebar;
    }
    const detail = document.querySelector('.gaia-argoui-app-show');
    if (detail) {
      return detail;
    }
    const contents = document.querySelector('.record-gaia');
    return contents || document.body;
  }

  function hideNativeSubtable() {
    const { subtableCode } = state.settings;
    const element = kintone.app.record.getFieldElement(subtableCode);
    if (element) {
      element.style.display = 'none';
      element.setAttribute('aria-hidden', 'true');
    }
  }

  function createPanel() {
    if (state.elements.panel && state.elements.panel.parentNode) {
      state.elements.panel.parentNode.removeChild(state.elements.panel);
    }

    const container = document.createElement('section');
    container.className = 'kwp-panel';

    const header = document.createElement('header');
    header.className = 'kwp-panel__header';
    header.innerHTML = [
      '<div class="kwp-panel__title">',
      '<h2>騾ｲ謐励せ繧ｯ繧ｷ繝ｧ繝ｻ繧ｮ繝｣繝ｩ繝ｪ繝ｼ</h2>',
      '<p data-kwp-status class="kwp-panel__status">Ctrl/竚・V 縺ｧ縺吶＄縺ｫ雋ｼ繧贋ｻ倥￠繧峨ｌ縺ｾ縺・/p>',
      '</div>'
    ].join('');

    const controls = document.createElement('div');
    controls.className = 'kwp-panel__controls';

    const focusButton = document.createElement('button');
    focusButton.type = 'button';
    focusButton.className = 'kwp-button kwp-button--ghost';
    focusButton.dataset.kwpFocus = 'true';
    focusButton.textContent = '雋ｼ繧贋ｻ倥￠繝懊ャ繧ｯ繧ｹ繧偵ヵ繧ｩ繝ｼ繧ｫ繧ｹ';

    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'kwp-upload';
    uploadLabel.innerHTML = '<input type="file" accept="image/*" data-kwp-file multiple><span>繝輔ぃ繧､繝ｫ繧帝∈謚・/span>';

    controls.appendChild(uploadLabel);
    controls.appendChild(focusButton);
    header.appendChild(controls);

    const dropzone = document.createElement('div');
    dropzone.className = 'kwp-dropzone';
    dropzone.dataset.kwpDropzone = 'true';
    dropzone.tabIndex = 0;
    dropzone.innerHTML = [
      '<p class="kwp-dropzone__label">縺薙％縺ｫ雋ｼ繧贋ｻ倥￠ / 繝峨Λ繝・げ&繝峨Ο繝・・</p>',
      '<p class="kwp-dropzone__hint">逕ｻ蜒丈ｻ･螟悶・繝・・繧ｿ縺ｯ辟｡隕悶＆繧後∪縺・/p>'
    ].join('');

    const list = document.createElement('ul');
    list.className = 'kwp-gallery';
    list.dataset.kwpList = 'true';

    const empty = document.createElement('p');
    empty.className = 'kwp-empty';
    empty.dataset.kwpEmpty = 'true';
    empty.textContent = '縺ｾ縺險ｼ諡縺後≠繧翫∪縺帙ｓ縲・trl/竚・V 縺ｧ霑ｽ蜉縺励∪縺励ｇ縺・・;

    const toastStack = document.createElement('div');
    toastStack.className = 'kwp-toast-stack';
    toastStack.dataset.kwpToast = 'true';

    container.appendChild(header);
    container.appendChild(dropzone);
    container.appendChild(list);
    container.appendChild(empty);
    container.appendChild(toastStack);

    const mountPoint = resolveMountPoint();
    mountPoint.insertBefore(container, mountPoint.firstChild);

    state.elements = {
      panel: container,
      status: container.querySelector('[data-kwp-status]'),
      dropzone,
      fileInput: container.querySelector('[data-kwp-file]'),
      focusButton,
      list,
      empty,
      toastStack
    };
    updatePanelMode();
    attachPanelHandlers();
  }

  function updatePanelMode() {
    const { panel } = state.elements;
    if (!panel) {
      return;
    }
    panel.classList.toggle('kwp-panel--scroll', state.settings.layout === 'scroll');
    panel.classList.toggle('kwp-panel--readonly', !state.canEdit);
  }

  function attachPanelHandlers() {
    const { dropzone, panel, fileInput, focusButton } = state.elements;
    if (!dropzone || !panel || !fileInput) {
      return;
    }

    const onPaste = (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter((item) => item.type && item.type.startsWith('image/'))
        .map((item, index) => {
          const file = item.getAsFile();
          if (file) {
            return new File([file], file.name || `clipboard-${Date.now()}-${index}.png`, {
              type: file.type || 'image/png'
            });
          }
          return null;
        })
        .filter(Boolean);
      if (files.length === 0) {
        pushToast('逕ｻ蜒上ョ繝ｼ繧ｿ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲・, 'info');
        return;
      }
      event.preventDefault();
      processFiles(files);
    };

    const onDragOver = (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      dropzone.classList.add('kwp-dropzone--active');
    };

    const onDragLeave = (event) => {
      if (event.target === dropzone) {
        dropzone.classList.remove('kwp-dropzone--active');
      }
    };

    const onDrop = (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      event.preventDefault();
      dropzone.classList.remove('kwp-dropzone--active');
      const files = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) {
        pushToast('逕ｻ蜒上ヵ繧｡繧､繝ｫ繧偵ラ繝ｭ繝・・縺励※縺上□縺輔＞縲・, 'info');
        return;
      }
      processFiles(files);
    };

    const onFileChange = (event) => {
      if (!state.canEdit || state.busy) {
        return;
      }
      const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) {
        pushToast('逕ｻ蜒上ヵ繧｡繧､繝ｫ繧帝∈謚槭＠縺ｦ縺上□縺輔＞縲・, 'info');
        return;
      }
      processFiles(files);
    };

    const onFocusButtonClick = () => {
      state.elements.dropzone?.focus();
    };

    dropzone.addEventListener('paste', onPaste);
    panel.addEventListener('paste', onPaste);
    dropzone.addEventListener('dragover', onDragOver);
    dropzone.addEventListener('dragleave', onDragLeave);
    dropzone.addEventListener('drop', onDrop);
    fileInput.addEventListener('change', onFileChange);
    focusButton.addEventListener('click', onFocusButtonClick);

    panel.dataset.handlersAttached = 'true';
  }

  function clearList() {
    if (!state.elements.list) {
      return;
    }
    state.elements.list.innerHTML = '';
  }

  function renderGallery() {
    const { list, empty } = state.elements;
    if (!list || !empty) {
      return;
    }
    clearList();
    const rows = state.rows;
    if (!rows || rows.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      if (!row.file) {
        return;
      }
      const item = document.createElement('li');
      item.className = 'kwp-card';
      item.dataset.rowId = row.id;

      const thumbButton = document.createElement('button');
      thumbButton.type = 'button';
      thumbButton.className = 'kwp-card__thumb';

      const img = document.createElement('img');
      const fileUrl = `${kintone.api.url('/k/v1/file', true)}?fileKey=${encodeURIComponent(row.file.fileKey)}`;
      img.src = fileUrl;
      img.alt = row.memoText || '險ｼ諡逕ｻ蜒・;
      img.loading = 'lazy';
      thumbButton.appendChild(img);

      thumbButton.addEventListener('click', () => {
        openLightbox(row);
      });

      const body = document.createElement('div');
      body.className = 'kwp-card__body';

      const memo = document.createElement('button');
      memo.type = 'button';
      memo.className = 'kwp-card__memo';
      memo.textContent = row.memoText || '繝｡繝｢縺ｯ譛ｪ蜈･蜉・;
      memo.title = state.canEdit ? '繧ｯ繝ｪ繝・け縺励※邱ｨ髮・ : '髢ｲ隕ｧ縺ｮ縺ｿ';
      memo.disabled = !state.canEdit;
      memo.addEventListener('click', () => {
        if (!state.canEdit) {
          return;
        }
        openMemoEditor(row);
      });

      const meta = document.createElement('footer');
      meta.className = 'kwp-card__meta';
      meta.innerHTML = [
        `<time datetime="${row.timestamp || ''}">${formatTimestamp(row.timestamp)}</time>`,
        row.authorName ? `<span class="kwp-card__author">${row.authorName}</span>` : ''
      ].join('');

      body.appendChild(memo);
      body.appendChild(meta);
      item.appendChild(thumbButton);
      item.appendChild(body);

      fragment.appendChild(item);
    });
    list.appendChild(fragment);
  }

  function openMemoEditor(row) {
    const item = state.elements.list?.querySelector(`.kwp-card[data-row-id="${row.id}"]`);
    if (!item) {
      return;
    }
    const memoButton = item.querySelector('.kwp-card__memo');
    if (!memoButton || memoButton.dataset.editing === 'true') {
      return;
    }
    memoButton.dataset.editing = 'true';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'kwp-card__memo-input';
    input.value = row.memoText;
    input.maxLength = 254;
    memoButton.textContent = '';
    memoButton.appendChild(input);
    input.focus();
    input.select();

    const finish = async (commit) => {
      if (memoButton.dataset.editing !== 'true') {
        return;
      }
      const newValue = commit ? input.value.trim() : row.memoText;
      memoButton.dataset.editing = 'false';
      memoButton.innerHTML = '';
      memoButton.textContent = newValue || '繝｡繝｢縺ｯ譛ｪ蜈･蜉・;
      if (commit && newValue !== row.memoText) {
        memoButton.disabled = true;
        try {
          await updateMemo(row.id, newValue);
          pushToast('繝｡繝｢繧呈峩譁ｰ縺励∪縺励◆縲・, 'success');
        } catch (error) {
          console.error(error);
          pushToast('繝｡繝｢縺ｮ譖ｴ譁ｰ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, 'error');
        } finally {
          memoButton.disabled = false;
        }
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  async function updateMemo(rowId, memoText) {
    await ensureLatestRecord();
    const subtable = state.record?.[state.settings.subtableCode];
    if (!subtable || !Array.isArray(subtable.value)) {
      throw new Error('繧ｵ繝悶ユ繝ｼ繝悶Ν繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・);
    }
    const payloadRows = subtable.value.map((row) => ({
      id: row.id,
      value: JSON.parse(JSON.stringify(row.value))
    }));
    const target = payloadRows.find((row) => row.id === rowId);
    if (!target) {
      throw new Error('蟇ｾ雎｡縺ｮ陦後′隕九▽縺九ｊ縺ｾ縺帙ｓ縲・);
    }
    if (!target.value[state.settings.memoFieldCode]) {
      target.value[state.settings.memoFieldCode] = { value: '' };
    }
    target.value[state.settings.memoFieldCode].value = memoText;
    const body = {
      app: state.appId,
      id: state.recordId,
      revision: state.revision,
      record: {
        [state.settings.subtableCode]: {
          value: payloadRows
        }
      }
    };
    const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
    state.revision = Number(response.revision);
    await refreshRecord({ silent: true });
  }

  function openLightbox(row) {
    if (!row.file) {
      return;
    }
    if (!state.lightbox) {
      const overlay = document.createElement('div');
      overlay.className = 'kwp-lightbox';
      overlay.innerHTML = '<div class="kwp-lightbox__backdrop"></div><img class="kwp-lightbox__image" alt=""><button type="button" class="kwp-lightbox__close" aria-label="髢峨§繧・>ﾃ・/button>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target.classList.contains('kwp-lightbox__close') || event.target.classList.contains('kwp-lightbox__backdrop')) {
          overlay.classList.remove('kwp-lightbox--visible');
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          overlay.classList.remove('kwp-lightbox--visible');
        }
      });
      state.lightbox = {
        overlay,
        image: overlay.querySelector('.kwp-lightbox__image')
      };
    }
    state.lightbox.image.src = `${kintone.api.url('/k/v1/file', true)}?fileKey=${encodeURIComponent(row.file.fileKey)}`;
    state.lightbox.image.alt = row.memoText || row.file.name || '險ｼ諡逕ｻ蜒・;
    state.lightbox.overlay.classList.add('kwp-lightbox--visible');
  }

  async function ensureLatestRecord() {
    if (!state.recordId) {
      throw new Error('繝ｬ繧ｳ繝ｼ繝迂D縺御ｸ肴・縺ｧ縺吶・);
    }
    const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
      app: state.appId,
      id: state.recordId
    });
    state.record = response.record;
    state.revision = Number(response.record?.$revision?.value || response.record?.$revision || state.revision || 0);
    state.rows = mapRows(response.record);
    state.canEdit = detectEditable(response.record);
    updatePanelMode();
  }

  function detectEditable(record) {
    if (record && record.$permissions && typeof record.$permissions.editable === 'boolean') {
      return record.$permissions.editable;
    }
    return true;
  }

  function mapRows(record) {
    const subtable = record?.[state.settings.subtableCode];
    if (!subtable || subtable.type !== 'SUBTABLE') {
      return [];
    }
    const rows = subtable.value
      .map((row) => {
        const fileField = row.value[state.settings.fileFieldCode];
        const memoField = row.value[state.settings.memoFieldCode];
        const authorField = state.settings.authorFieldCode ? row.value[state.settings.authorFieldCode] : null;
        const timestampField = state.settings.timestampFieldCode ? row.value[state.settings.timestampFieldCode] : null;

        const file = Array.isArray(fileField?.value) ? fileField.value[0] : null;
        const memoText = memoField?.value || '';

        let authorName = '';
        if (authorField && Array.isArray(authorField.value) && authorField.value.length > 0) {
          authorName = authorField.value[0].name || authorField.value[0].code || '';
        }
        const timestamp = timestampField?.value || '';

        return {
          id: row.id,
          file,
          memoText,
          authorName,
          timestamp
        };
      })
      .filter((row) => Boolean(row.file));
    return rows.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      return b.id - a.id;
    });
  }

  function setBusy(isBusy, message) {
    state.busy = isBusy;
    const { panel, status } = state.elements;
    if (panel) {
      panel.classList.toggle('kwp-panel--busy', isBusy);
    }
    if (status) {
      status.textContent = message || (isBusy ? '蜃ｦ逅・ｸｭ縺ｧ縺吮ｦ' : 'Ctrl/竚・V 縺ｧ縺吶＄縺ｫ雋ｼ繧贋ｻ倥￠繧峨ｌ縺ｾ縺・);
    }
  }

  function pushToast(message, tone) {
    const stack = state.elements.toastStack;
    if (!stack) {
      return;
    }
    const toast = document.createElement('div');
    toast.className = `kwp-toast kwp-toast--${tone || 'info'}`;
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('kwp-toast--visible');
    });
    setTimeout(() => {
      toast.classList.remove('kwp-toast--visible');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      }, { once: true });
    }, 3600);
  }

  function sanitizeFileName(name) {
    const base = name.replace(/\.[^.]+$/, '');
    return `${base}.jpg`;
  }

  async function createDrawableSource(file) {
    if (typeof window.createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        release() {
          bitmap.close();
        },
        draw(ctx, width, height) {
          ctx.drawImage(bitmap, 0, 0, width, height);
        }
      };
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      return {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        release() {
          URL.revokeObjectURL(url);
        },
        draw(ctx, width, height) {
          ctx.drawImage(image, 0, 0, width, height);
        }
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function compressImage(file) {
    if (!state.settings.compressionEnabled) {
      return file;
    }
    if (!file.type.startsWith('image/')) {
      return file;
    }
    const maxEdge = state.settings.maxImageEdge || 1600;
    const quality = state.settings.imageQuality || 0.85;
    const drawable = await createDrawableSource(file);
    const { width, height } = drawable;
    const edge = Math.max(width, height);
    const ratio = edge > maxEdge ? maxEdge / edge : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d', { alpha: false });
    drawable.draw(context, canvas.width, canvas.height);
    drawable.release();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('逕ｻ蜒上・蝨ｧ邵ｮ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・));
          return;
        }
        resolve(result);
      }, 'image/jpeg', quality);
    });
    const fileName = sanitizeFileName(file.name || `evidence-${Date.now()}.jpg`);
    return new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
  }

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('__REQUEST_TOKEN__', getRequestToken());
    formData.append('file', file, file.name);
    const response = await kintone.api(kintone.api.url('/k/v1/file', true), 'POST', formData);
    return {
      fileKey: response.fileKey,
      name: file.name,
      size: file.size,
      contentType: file.type
    };
  }

  async function processFiles(files) {
    if (!files || files.length === 0) {
      return;
    }
    setBusy(true, '逕ｻ蜒上ｒ蜃ｦ逅・＠縺ｦ縺・∪縺吮ｦ');
    try {
      const compressed = [];
      for (const file of files) {
        try {
          const converted = await compressImage(file);
          compressed.push(converted);
        } catch (error) {
          console.error(error);
          pushToast(`蝨ｧ邵ｮ縺ｫ螟ｱ謨励＠縺ｾ縺励◆: ${file.name}`, 'error');
        }
      }
      if (compressed.length === 0) {
        pushToast('繧｢繝・・繝ｭ繝ｼ繝牙庄閭ｽ縺ｪ逕ｻ蜒上′縺ゅｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲・, 'error');
        return;
      }
      await ensureLatestRecord();
      const uploads = [];
      for (const file of compressed) {
        const uploaded = await uploadFile(file);
        uploads.push({ file, uploaded });
      }
      await appendRows(uploads);
      if (state.settings.commentEnabled) {
        await postComment(uploads.length);
      }
      pushToast(`險ｼ諡繧・{uploads.length}莉ｶ霑ｽ蜉縺励∪縺励◆縲Ａ, 'success');
    } catch (error) {
      console.error(error);
      pushToast('險ｼ諡縺ｮ霑ｽ蜉縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, 'error');
    } finally {
      setBusy(false);
      if (state.elements.fileInput) {
        state.elements.fileInput.value = '';
      }
    }
  }

  async function appendRows(uploads) {
    const subtable = state.record?.[state.settings.subtableCode];
    if (!subtable || !Array.isArray(subtable.value)) {
      throw new Error('繧ｵ繝悶ユ繝ｼ繝悶Ν繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・);
    }
    const existing = subtable.value.map((row) => ({
      id: row.id,
      value: JSON.parse(JSON.stringify(row.value))
    }));
    const loginUser = kintone.getLoginUser();
    uploads.forEach(({ uploaded }) => {
      const createdAt = new Date().toISOString();
      const rowValue = {};
      rowValue[state.settings.fileFieldCode] = {
        value: [
          {
            fileKey: uploaded.fileKey,
            name: uploaded.name,
            size: uploaded.size,
            contentType: uploaded.contentType
          }
        ]
      };
      rowValue[state.settings.memoFieldCode] = {
        value: state.settings.memoTemplate || ''
      };
      if (state.settings.authorFieldCode) {
        rowValue[state.settings.authorFieldCode] = {
          value: loginUser ? [{ code: loginUser.code, name: loginUser.name }] : []
        };
      }
      if (state.settings.timestampFieldCode) {
        rowValue[state.settings.timestampFieldCode] = {
          value: createdAt
        };
      }
      existing.push({ value: rowValue });
    });
    const body = {
      app: state.appId,
      id: state.recordId,
      revision: state.revision,
      record: {
        [state.settings.subtableCode]: {
          value: existing
        }
      }
    };
    const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
    state.revision = Number(response.revision);
    if (state.settings.postAddBehavior === 'instant') {
      await refreshRecord({ silent: true });
    } else {
      await ensureLatestRecord();
      renderGallery();
    }
  }

  async function postComment(count) {
    const message = state.settings.commentBody || '繧ｹ繧ｯ繧ｷ繝ｧ繧定ｿｽ蜉縺励∪縺励◆縲・;
    try {
      await kintone.api(kintone.api.url('/k/v1/record/comment', true), 'POST', {
        app: state.appId,
        record: state.recordId,
        comment: {
          text: `${message} (${count}莉ｶ)`
        }
      });
    } catch (error) {
      console.warn('kintone-work-progress: 繧ｳ繝｡繝ｳ繝域兜遞ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, error);
    }
  }

  async function refreshRecord(options) {
    await ensureLatestRecord();
    renderGallery();
    if (!options || !options.silent) {
      setBusy(false);
    }
  }

  function initialize() {
    state.settings = parseSettings(kintone.plugin.app.getConfig(PLUGIN_ID));
    if (!state.settings.subtableCode || !state.settings.fileFieldCode || !state.settings.memoFieldCode) {
      console.warn('kintone-work-progress: 險ｭ螳壹′荳崎ｶｳ縺励※縺・ｋ縺溘ａ蛛懈ｭ｢縺励∪縺吶・);
      return false;
    }
    injectStyles();
    return true;
  }

  function injectStyles() {
    if (document.getElementById('kwp-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'kwp-styles';
    style.textContent = `
      .kwp-panel {
        position: relative;
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        padding: 16px;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .kwp-panel__header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .kwp-panel__title h2 {
        margin: 0;
        font-size: 18px;
      }
      .kwp-panel__status {
        margin: 4px 0 0;
        font-size: 12px;
        color: #64748b;
      }
      .kwp-panel__controls {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .kwp-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        font-size: 13px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1f2937;
        cursor: pointer;
        transition: background 0.2s ease, border 0.2s ease;
      }
      .kwp-button:hover {
        background: #f1f5f9;
      }
      .kwp-button--ghost {
        border: 1px dashed #cbd5e1;
      }
      .kwp-upload {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        padding: 0 12px;
        border-radius: 8px;
        font-size: 13px;
        background: #2563eb;
        color: #ffffff;
        cursor: pointer;
      }
      .kwp-upload input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .kwp-dropzone {
        border: 2px dashed #cbd5e1;
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        color: #475569;
        transition: border-color 0.2s ease, background 0.2s ease;
        outline: none;
      }
      .kwp-dropzone:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
      }
      .kwp-dropzone--active {
        border-color: #2563eb;
        background: rgba(37, 99, 235, 0.05);
        color: #1e3a8a;
      }
      .kwp-dropzone__label {
        margin: 0;
        font-weight: 600;
      }
      .kwp-dropzone__hint {
        margin: 4px 0 0;
        font-size: 12px;
        color: #94a3b8;
      }
      .kwp-gallery {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 12px;
      }
      .kwp-panel--scroll .kwp-gallery {
        display: flex;
        overflow-x: auto;
        padding-bottom: 6px;
        gap: 12px;
      }
      .kwp-panel--scroll .kwp-card {
        min-width: 200px;
      }
      .kwp-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #f8fafc;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        padding: 8px;
      }
      .kwp-card__thumb {
        border: none;
        background: #0f172a;
        border-radius: 8px;
        padding: 0;
        cursor: pointer;
        overflow: hidden;
      }
      .kwp-card__thumb img {
        display: block;
        width: 100%;
        height: 140px;
        object-fit: cover;
        transition: transform 0.2s ease;
      }
      .kwp-card__thumb:hover img {
        transform: scale(1.04);
      }
      .kwp-card__body {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .kwp-card__memo {
        border: none;
        background: transparent;
        text-align: left;
        color: #1f2937;
        font-size: 13px;
        cursor: pointer;
        padding: 0;
        min-height: 32px;
      }
      .kwp-card__memo:disabled {
        cursor: default;
        color: #6b7280;
      }
      .kwp-card__memo-input {
        width: 100%;
        border: 1px solid #2563eb;
        border-radius: 6px;
        padding: 4px 6px;
        font-size: 13px;
      }
      .kwp-card__meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #64748b;
      }
      .kwp-card__author {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .kwp-empty {
        margin: 12px 0 0;
        font-size: 13px;
        color: #64748b;
      }
      .kwp-toast-stack {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 999;
      }
      .kwp-toast {
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.25s ease, transform 0.25s ease;
        padding: 10px 16px;
        border-radius: 8px;
        color: #fff;
        font-size: 13px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.25);
      }
      .kwp-toast--visible {
        opacity: 1;
        transform: translateY(0);
      }
      .kwp-toast--info {
        background: #2563eb;
      }
      .kwp-toast--success {
        background: #16a34a;
      }
      .kwp-toast--error {
        background: #dc2626;
      }
      .kwp-panel--busy::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 12px;
        pointer-events: none;
      }
      .kwp-panel--readonly .kwp-panel__controls,
      .kwp-panel--readonly .kwp-dropzone {
        display: none;
      }
      .kwp-lightbox {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.8);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        z-index: 1000;
      }
      .kwp-lightbox--visible {
        opacity: 1;
        pointer-events: auto;
      }
      .kwp-lightbox__image {
        max-width: 90vw;
        max-height: 90vh;
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
      }
      .kwp-lightbox__close {
        position: absolute;
        top: 24px;
        right: 24px;
        background: rgba(15, 23, 42, 0.6);
        color: #fff;
        border: none;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
      }
      @media (max-width: 768px) {
        .kwp-panel {
          margin: 0 0 20px;
        }
        .kwp-toast-stack {
          right: 12px;
          left: 12px;
        }
        .kwp-toast {
          align-self: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (!initialize()) {
    return;
  }

  EVENT_TYPES.forEach((eventType) => {
    kintone.events.on(eventType, async (event) => {
      state.recordId = event.recordId || kintone.app.record.getId();
      state.record = null;
      state.rows = [];
      hideNativeSubtable();
      createPanel();
      try {
        await refreshRecord({ silent: true });
      } catch (error) {
        console.error(error);
        pushToast('險ｼ諡繧定ｪｭ縺ｿ霎ｼ繧√∪縺帙ｓ縺ｧ縺励◆縲・, 'error');
      }
      return event;
    });
  });
})(kintone.$PLUGIN_ID);

