(async function () {
  const allowsGuestReadonlyRoute = /^#?shared-post(?:[/?]|$)/.test(String(window.location.hash || '').replace(/^#/, ''));
  if (!allowsGuestReadonlyRoute) {
    requireAuth();
  }

  const appView = document.getElementById('app-view');
  const sidebar = document.querySelector('app-sidebar');
  const appState = {
    user: getUser() || {
      id: 0,
      role: 'guest',
      name: 'Invitado',
      full_name: 'Invitado',
      faculty: '',
      career: '',
      school: '',
      avatar_url: null,
    },
    cleanup: null,
  };
  const publicUsersState = {
    loaded: false,
    loading: null,
    map: new Map(),
  };
  const PRESENCE_PING_INTERVAL_MS = 60000;
  const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const GLOBAL_INCOMING_CALL_POLL_INTERVAL_MS = 1000;
  let presencePingTimer = null;
  let presencePingInFlight = false;
  let globalIncomingCallPollTimer = null;
  let globalIncomingCallPollInFlight = false;

  if (!appState.user) {
    logout();
    return;
  }

  if (appState.user.is_profile_complete === false) {
    window.location.href = '/pages/onboarding.html';
    return;
  }

  if (isLoggedIn()) {
    AuthAPI.getProfile().then((bootstrapProfile) => {
      if (!bootstrapProfile?.ok || !bootstrapProfile.data) {
        return;
      }

      updateStoredUser(bootstrapProfile.data);
      appState.user = getUser();

      if (appState.user?.is_profile_complete === false) {
        window.location.href = '/pages/onboarding.html';
        return;
      }

      if (window.setupLayoutData) {
        window.setupLayoutData(appState.user);
      }

      if (window.AppRouter?.currentRoute) {
        const currentRouteName = String(window.AppRouter.currentRoute?.route || '');
        if (currentRouteName !== 'live') {
          window.AppRouter.render();
        }
      }
    }).catch((error) => {
      console.error('No se pudo hidratar la sesion desde /auth/me:', error);
    });
  }

  startPresenceHeartbeat();

  const ROUTE_ALIASES = {
    '': 'feed',
    '/': 'feed',
    'admin_publicaciones': 'admin-posts',
    'admin-publicaciones': 'admin-posts',
  };

  const EMOJI_DATA = {
    '😀': ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤩', '🤔', '😴', '😭', '😡', '🥳', '🤯', '😇', '🙌'],
    '👍': ['👍', '👎', '👏', '🙌', '🤝', '🙏', '✌️', '🤘', '💪', '👀', '🔥', '✨', '🎉', '💯', '📚', '🎓'],
    '❤️': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    '🐶': ['🐶', '🐱', '🐼', '🦊', '🐯', '🦁', '🐵', '🐸', '🐧', '🦄', '🐝', '🦋', '🌱', '🌸', '🌞', '🌙'],
    '🍕': ['🍕', '🍔', '🌮', '🍜', '🍣', '🍩', '🍪', '🍫', '☕', '🍵', '🥤', '🍎', '🍓', '🥑', '🍿', '🎂'],
    '⚽': ['⚽', '🏀', '🏐', '🎾', '🏓', '🥊', '🏃', '🏊', '🚴', '🎮', '🎧', '🎤', '🎸', '🎬', '📷', '💻'],
  };

  const REACTION_META = {
    me_gusta: { emoji: '👍', label: 'Me gusta' },
    me_encanta: { emoji: '❤️', label: 'Me encanta' },
    me_divierte: { emoji: '😂', label: 'Me divierte' },
    me_sorprende: { emoji: '😮', label: 'Me sorprende' },
    me_enoja: { emoji: '😡', label: 'Me enoja' },
  };

  const REACTION_ASSETS = {
    me_gusta: '/assets/reactions/me-gusta.webp',
    me_encanta: '/assets/reactions/me-encanta.webp',
    me_divierte: '/assets/reactions/me-divierte.webp',
    me_sorprende: '/assets/reactions/me-sorprende.webp',
    me_enoja: '/assets/reactions/me-enoja.webp',
  };
  const APP_ASSET_VERSION = (() => {
    try {
      return new URL(document.currentScript?.src || window.location.href).searchParams.get('v') || 'dev';
    } catch {
      return 'dev';
    }
  })();
  const preloadedReactionAssets = new Set();
  const viewTemplateCache = new Map();

  const FACULTY_CAREERS = {
    Todos: ['Todos'],
    FAING: ['Todos', 'Ingeniería Civil', 'Ingeniería de Sistemas', 'Ingeniería Electrónica', 'Ingeniería Agroindustrial', 'Ingeniería Ambiental', 'Ingeniería Industrial'],
    FACEM: ['Todos', 'Ciencias Contables y Financieras', 'Ingeniería Comercial', 'Administración de Negocios Internacionales', 'Administración Turística y Hotelera', 'Economía y Microfinanzas'],
    FAEDCOH: ['Todos', 'Educación', 'Ciencias de la Comunicación', 'Psicología', 'Humanidades'],
    FADE: ['Todos', 'Derecho'],
    FACSA: ['Todos', 'Medicina Humana', 'Odontología', 'Tecnología Médica: Laboratorio Clínico y Anatomía Patológica', 'Tecnología Médica: Terapia Física y Rehabilitación'],
    FAU: ['Todos', 'Arquitectura'],
  };
  const SUPPORTED_UPLOAD_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ]);
  const SUPPORTED_UPLOAD_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
  const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
  const SUPPORTED_UPLOAD_VIDEO_MIME_TYPES = new Set([
    'video/mp4',
    'video/webm',
  ]);
  const SUPPORTED_UPLOAD_VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);
  const VIDEO_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

  let confirmModalPromiseResolver = null;
  let reactionPickerState = null;
  let mobileSidebarCleanup = null;
  let notificationsState = {
    lastIds: [],
    polling: null,
  };
  const NOTIFICATION_SEEN_KEY = 'upt-notifications-seen-v1';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;',
    }[char]));
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  function safeUrl(url) {
    return String(url || '').replace(/'/g, '%27');
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function getResultPaginationMeta(result, fallbackPerPage = 0) {
    const items = getList(result);
    const payload = result?.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? result.data
      : null;

    const currentPage = Math.max(1, Number(payload?.current_page || 1) || 1);
    const lastPage = Math.max(1, Number(payload?.last_page || 1) || 1);
    const perPage = Math.max(1, Number(payload?.per_page || fallbackPerPage || items.length || 1) || 1);
    const total = Math.max(items.length, Number(payload?.total || items.length) || items.length);
    const from = total > 0 ? Number(payload?.from || (((currentPage - 1) * perPage) + 1)) : 0;
    const to = total > 0 ? Number(payload?.to || Math.min(total, from + items.length - 1)) : 0;

    return {
      currentPage,
      lastPage,
      perPage,
      total,
      from,
      to,
      hasMore: currentPage < lastPage,
    };
  }

  function getClientPaginationMeta(totalItems, currentPage = 1, perPage = 30) {
    const normalizedPerPage = Math.max(1, Number(perPage) || 1);
    const total = Math.max(0, Number(totalItems) || 0);
    const lastPage = Math.max(1, Math.ceil(total / normalizedPerPage) || 1);
    const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), lastPage);
    const from = total ? ((safeCurrentPage - 1) * normalizedPerPage) + 1 : 0;
    const to = total ? Math.min(total, from + normalizedPerPage - 1) : 0;

    return {
      currentPage: safeCurrentPage,
      lastPage,
      perPage: normalizedPerPage,
      total,
      from,
      to,
      hasMore: safeCurrentPage < lastPage,
    };
  }

  function paginateClientItems(items, currentPage = 1, perPage = 30) {
    const list = Array.isArray(items) ? items : [];
    const meta = getClientPaginationMeta(list.length, currentPage, perPage);
    const start = (meta.currentPage - 1) * meta.perPage;
    return {
      items: list.slice(start, start + meta.perPage),
      meta,
    };
  }

  function buildPaginationSequence(currentPage, lastPage) {
    if (lastPage <= 1) return [1];

    const pages = new Set([1, lastPage]);
    for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
      if (page > 1 && page < lastPage) {
        pages.add(page);
      }
    }

    const sorted = [...pages].sort((a, b) => a - b);
    const sequence = [];
    let previous = 0;
    sorted.forEach((page) => {
      if (previous && page - previous > 1) {
        sequence.push('ellipsis');
      }
      sequence.push(page);
      previous = page;
    });
    return sequence;
  }

  function renderPagination(container, meta, options = {}) {
    if (!container) return;

    const {
      summaryLabel = 'elementos',
      standalone = false,
    } = options;

    if (!meta || meta.lastPage <= 1) {
      container.innerHTML = '';
      container.classList.add('hidden');
      container.classList.toggle('is-standalone', !!standalone);
      return;
    }

    const pages = buildPaginationSequence(meta.currentPage, meta.lastPage);
    container.classList.remove('hidden');
    container.classList.toggle('is-standalone', !!standalone);
    container.innerHTML = `
      <div class="app-pagination-summary">
        Mostrando ${meta.from}-${meta.to} de ${meta.total} ${escapeHtml(summaryLabel)}
      </div>
      <div class="app-pagination-controls">
        <button type="button" class="app-pagination-btn is-nav" data-page="${meta.currentPage - 1}" ${meta.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        ${pages.map((page) => (
          page === 'ellipsis'
            ? '<span class="app-pagination-ellipsis">…</span>'
            : `<button type="button" class="app-pagination-btn ${page === meta.currentPage ? 'is-active' : ''}" data-page="${page}">${page}</button>`
        )).join('')}
        <button type="button" class="app-pagination-btn is-nav" data-page="${meta.currentPage + 1}" ${meta.currentPage >= meta.lastPage ? 'disabled' : ''}>Siguiente</button>
      </div>
    `;
  }

  function reactionAsset(type) {
    return REACTION_ASSETS[type] || REACTION_ASSETS.me_gusta;
  }

  function ensureReactionAssetsPreloaded() {
    Object.values(REACTION_ASSETS).forEach((src) => {
      if (!src || preloadedReactionAssets.has(src)) return;
      const image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.src = src;
      preloadedReactionAssets.add(src);
    });
  }

  function renderReactionAsset(type, extraClass = '') {
    const meta = REACTION_META[type] || REACTION_META.me_gusta;
    const className = `reaction-asset ${extraClass}`.trim().replace(/\s+/g, ' ');
    return `<img src="${reactionAsset(type)}" alt="${escapeHtml(meta.label)}" class="${className}" />`;
  }

  function extractViewTemplateMarkup(templateText = '') {
    const rawTemplateText = String(templateText || '');
    const rawTemplateMatch = rawTemplateText.match(/<template\b[^>]*id=["']app-view-template["'][^>]*>([\s\S]*?)<\/template>/i);
    if (rawTemplateMatch) {
      return rawTemplateMatch[1].trim();
    }

    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(rawTemplateText, 'text/html');
    const template = parsedDocument.getElementById('app-view-template');
    if (template) {
      return template.innerHTML.trim();
    }
    return parsedDocument.body?.innerHTML?.trim() || rawTemplateText.trim();
  }

  async function loadViewTemplate(templatePath) {
    if (!templatePath) return '';
    if (viewTemplateCache.has(templatePath)) {
      return viewTemplateCache.get(templatePath);
    }

    const templateUrl = new URL(templatePath, window.location.origin);
    templateUrl.searchParams.set('v', APP_ASSET_VERSION);

    const pendingTemplate = fetch(`${templateUrl.pathname}${templateUrl.search}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`No se pudo cargar la plantilla ${templatePath} (${response.status})`);
      }
      const templateText = await response.text();
      return extractViewTemplateMarkup(templateText);
    });

    viewTemplateCache.set(templatePath, pendingTemplate);

    try {
      return await pendingTemplate;
    } catch (error) {
      viewTemplateCache.delete(templatePath);
      throw error;
    }
  }

  function primeViewTemplate(templatePath) {
    if (!templatePath) return null;
    return loadViewTemplate(templatePath).catch((error) => {
      console.warn(`No se pudo precalentar la plantilla ${templatePath}:`, error);
      return '';
    });
  }

  function prewarmViewTemplates(templatePaths = []) {
    const uniquePaths = Array.from(new Set((templatePaths || []).filter(Boolean)));
    uniquePaths.forEach((templatePath) => {
      primeViewTemplate(templatePath);
    });
  }

  function scheduleNonCriticalViewTemplateWarmup(templatePaths = []) {
    const runWarmup = () => prewarmViewTemplates(templatePaths);
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(runWarmup, { timeout: 1800 });
      return;
    }
    window.setTimeout(runWarmup, 200);
  }

  function applyViewTemplateSlots(markup, slots = {}) {
    return String(markup || '').replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(slots, key)) {
        return String(slots[key] ?? '');
      }
      return '';
    });
  }

  async function resolveViewMarkup(view, context) {
    if (view?.templatePath) {
      try {
        const templateMarkup = await loadViewTemplate(view.templatePath);
        const templateSlots = typeof view?.templateSlots === 'function'
          ? (view.templateSlots(context) || {})
          : {};
        return applyViewTemplateSlots(templateMarkup, templateSlots);
      } catch (error) {
        console.error(`No se pudo cargar la vista desde ${view.templatePath}:`, error);
      }
    }

    if (typeof view?.render === 'function') {
      return view.render(context);
    }

    return '';
  }

  function getFacultyCareerOptions(faculty = 'Todos') {
    return FACULTY_CAREERS[faculty] || FACULTY_CAREERS.Todos;
  }

  function getFileExtension(fileName = '') {
    const normalized = String(fileName || '').trim().toLowerCase();
    const lastDot = normalized.lastIndexOf('.');
    return lastDot >= 0 ? normalized.slice(lastDot + 1) : '';
  }

  function validateSupportedImageFile(file, label = 'imagen') {
    if (!file) {
      return { ok: false, error: `Selecciona una ${label} valida.` };
    }

    const mimeType = String(file.type || '').trim().toLowerCase();
    const extension = getFileExtension(file.name);
    const looksLikeImage = mimeType.startsWith('image/') || SUPPORTED_UPLOAD_IMAGE_EXTENSIONS.has(extension);

    if (!looksLikeImage) {
      return { ok: false, error: `Selecciona una ${label} valida.` };
    }

    const isSupportedType = SUPPORTED_UPLOAD_IMAGE_MIME_TYPES.has(mimeType) || SUPPORTED_UPLOAD_IMAGE_EXTENSIONS.has(extension);
    if (!isSupportedType) {
      return { ok: false, error: `La ${label} debe estar en JPG, PNG, GIF o WEBP.` };
    }

    if (Number(file.size || 0) > IMAGE_UPLOAD_MAX_BYTES) {
      return { ok: false, error: `La ${label} no debe superar los 5 MB.` };
    }

    return { ok: true };
  }

  function validateSupportedVideoFile(file, label = 'video') {
    if (!file) {
      return { ok: false, error: `Selecciona un ${label} valido.` };
    }

    const mimeType = String(file.type || '').trim().toLowerCase();
    const extension = getFileExtension(file.name);
    const looksLikeVideo = mimeType.startsWith('video/') || SUPPORTED_UPLOAD_VIDEO_EXTENSIONS.has(extension);

    if (!looksLikeVideo) {
      return { ok: false, error: `Selecciona un ${label} valido.` };
    }

    const isSupportedType = SUPPORTED_UPLOAD_VIDEO_MIME_TYPES.has(mimeType) || SUPPORTED_UPLOAD_VIDEO_EXTENSIONS.has(extension);
    if (!isSupportedType) {
      return { ok: false, error: `El ${label} debe estar en MP4 o WEBM.` };
    }

    if (Number(file.size || 0) > VIDEO_UPLOAD_MAX_BYTES) {
      return { ok: false, error: `El ${label} no debe superar los 30 MB.` };
    }

    return { ok: true };
  }

  function validateSupportedPostMediaFile(file, label = 'archivo multimedia') {
    if (!file) {
      return { ok: false, error: `Selecciona un ${label} valido.` };
    }

    const mimeType = String(file.type || '').trim().toLowerCase();
    const extension = getFileExtension(file.name);

    if (mimeType.startsWith('image/') || SUPPORTED_UPLOAD_IMAGE_EXTENSIONS.has(extension)) {
      return validateSupportedImageFile(file, 'imagen');
    }

    if (mimeType.startsWith('video/') || SUPPORTED_UPLOAD_VIDEO_EXTENSIONS.has(extension)) {
      return validateSupportedVideoFile(file, 'video');
    }

    return { ok: false, error: 'Adjunta una imagen JPG/PNG/GIF/WEBP o un video MP4/WEBM.' };
  }

  function markPreviewUnavailable(previewWrap, previewImage, message) {
    if (!previewWrap) return;
    previewWrap.classList.add('upload-preview-unavailable');
    previewWrap.dataset.previewUnavailable = message || 'Vista previa no disponible';
    if (previewImage) {
      previewImage.classList.add('hidden');
      previewImage.removeAttribute('src');
    }
  }

  function clearPreviewUnavailable(previewWrap, previewImage) {
    if (!previewWrap) return;
    previewWrap.classList.remove('upload-preview-unavailable');
    delete previewWrap.dataset.previewUnavailable;
    if (previewImage) {
      previewImage.classList.remove('hidden');
    }
  }

  ensureReactionAssetsPreloaded();

  function renderSkeletonLines(widths = ['100%', '84%', '58%']) {
    return widths.map((width) => `<div class="skeleton skeleton-text" style="width:${width}"></div>`).join('');
  }

  function renderCardSkeleton({ lines = ['100%', '88%', '56%'], avatar = true, media = false } = {}) {
    return `
      <div class="skeleton-card">
        <div class="flex items-start gap-3">
          ${avatar ? '<div class="skeleton skeleton-avatar shrink-0"></div>' : ''}
          <div class="flex-1 space-y-2">
            ${renderSkeletonLines(lines)}
          </div>
        </div>
        ${media ? '<div class="skeleton rounded-[18px] h-48 mt-4"></div>' : ''}
      </div>
    `;
  }

  function renderListSkeleton(count = 3, options = {}) {
    return Array.from({ length: count }, () => renderCardSkeleton(options)).join('');
  }

  function ensureGlobalUiShell() {
    if (!document.getElementById('global-confirm-modal')) {
      const shell = document.createElement('div');
      shell.innerHTML = `
        <div id="global-confirm-modal" class="fixed inset-0 z-[160] hidden items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4 py-6">
          <div class="w-full max-w-md rounded-[28px] border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div class="px-6 py-5 border-b border-slate-100">
              <p id="global-confirm-kicker" class="text-[11px] uppercase tracking-[0.18em] font-black text-slate-400">Confirmacion</p>
              <h3 id="global-confirm-title" class="text-xl font-black text-slate-900 mt-1">Continuar</h3>
              <p id="global-confirm-copy" class="text-sm text-slate-500 mt-2">Esta accion necesita confirmacion.</p>
            </div>
            <div class="px-6 py-5 flex items-center justify-end gap-3">
              <button id="global-confirm-cancel" type="button" class="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">Cancelar</button>
              <button id="global-confirm-ok" type="button" class="px-5 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#152259] transition-colors">Aceptar</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(shell.firstElementChild);
    }
  }

  function closeConfirmModal(answer = false) {
    const modal = document.getElementById('global-confirm-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    const resolver = confirmModalPromiseResolver;
    confirmModalPromiseResolver = null;
    if (resolver) resolver(answer);
  }

  function confirmAction({
    title = 'Confirmar accion',
    copy = 'Esta accion no se puede deshacer.',
    acceptLabel = 'Aceptar',
    tone = 'primary',
  } = {}) {
    ensureGlobalUiShell();
    const modal = document.getElementById('global-confirm-modal');
    const titleNode = document.getElementById('global-confirm-title');
    const copyNode = document.getElementById('global-confirm-copy');
    const okButton = document.getElementById('global-confirm-ok');
    const cancelButton = document.getElementById('global-confirm-cancel');
    titleNode.textContent = title;
    copyNode.textContent = copy;
    okButton.textContent = acceptLabel;
    okButton.className = `px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1B2A6B] hover:bg-[#152259]'}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise((resolve) => {
      confirmModalPromiseResolver = resolve;
      const cleanup = () => {
        okButton.removeEventListener('click', onOk);
        cancelButton.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
      };
      const onOk = () => {
        cleanup();
        closeConfirmModal(true);
      };
      const onCancel = () => {
        cleanup();
        closeConfirmModal(false);
      };
      const onBackdrop = (event) => {
        if (event.target !== modal) return;
        cleanup();
        closeConfirmModal(false);
      };
      okButton.addEventListener('click', onOk);
      cancelButton.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
    });
  }

  function getVisibilityMeta(visibility) {
    switch (visibility) {
      case 'friends':
        return {
          icon: 'group',
          label: 'Solo amigos',
          tone: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        };
      case 'faculty':
        return {
          icon: 'school',
          label: 'Solo mi facultad',
          tone: 'bg-amber-50 text-amber-700 border border-amber-200',
        };
      default:
        return {
          icon: 'public',
          label: 'Toda la UPT',
          tone: 'bg-slate-100 text-slate-600 border border-slate-200',
        };
    }
  }

  function displayName(user) {
    return window.getDisplayName ? window.getDisplayName(user) : (user?.full_name || user?.name || 'Usuario');
  }

  function careerLabel(user) {
    return window.getCareerLabel ? window.getCareerLabel(user) : (user?.school || user?.career || user?.area || user?.position_title || '');
  }

  function cycleLabel(value, short = false) {
    return window.formatAcademicCycle ? window.formatAcademicCycle(value, short) : String(value || '');
  }

  function userColor(userOrLabel) {
    if (typeof userOrLabel === 'string') return getFacultyColor(userOrLabel);
    return getFacultyColor(userOrLabel?.faculty || userOrLabel?.school || userOrLabel?.career || '');
  }

  function buildGuestProfileHandle(user) {
    const normalized = normalizeSearchText(displayName(user))
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const fallback = `upt_${Number(user?.id || 0) || 'usuario'}`;
    return `@${(normalized || fallback).slice(0, 28)}`;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const timeMs = new Date(dateStr).getTime();
    if (!Number.isFinite(timeMs)) return '';
    const diff = Math.max(0, (Date.now() - timeMs) / 1000);
    if (diff < 60) return 'hace 1 min';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
  }

  function refreshRelativeTimeLabels(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-time-ago]').forEach((node) => {
      const sourceTs = Number(node.getAttribute('data-time-ago-ts') || '');
      const source = node.getAttribute('data-time-ago');
      if (Number.isFinite(sourceTs) && sourceTs > 0) {
        node.textContent = timeAgo(new Date(sourceTs).toISOString());
        return;
      }
      if (!source) return;
      node.textContent = timeAgo(source);
    });
  }

  let relativeTimeTickerStarted = false;
  function ensureRelativeTimeTicker() {
    if (relativeTimeTickerStarted) return;
    relativeTimeTickerStarted = true;
    window.setInterval(() => {
      refreshRelativeTimeLabels(document);
    }, 10000);
  }
  ensureRelativeTimeTicker();

  function formatBlockedUntilLabel(blockedUntil, isIndefinite = false) {
    if (isIndefinite || !blockedUntil) {
      return 'Bloqueo indefinido';
    }

    const date = new Date(blockedUntil);
    if (Number.isNaN(date.getTime())) {
      return 'Bloqueo temporal activo';
    }

    return `Hasta ${date.toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`;
  }

  function buildBlockedDurationPayload(durationValue, customValue, customUnit) {
    if (durationValue === 'indefinite') {
      return {
        blocked_until: null,
        blocked_duration_value: null,
        blocked_duration_unit: null,
        is_indefinite: true,
      };
    }

    if (durationValue === '24h') {
      return { blocked_until: null, blocked_duration_value: 24, blocked_duration_unit: 'hours', is_indefinite: false };
    }
    if (durationValue === '48h') {
      return { blocked_until: null, blocked_duration_value: 48, blocked_duration_unit: 'hours', is_indefinite: false };
    }
    if (durationValue === '1w') {
      return { blocked_until: null, blocked_duration_value: 1, blocked_duration_unit: 'weeks', is_indefinite: false };
    }

    if (durationValue === 'custom') {
      const amount = Number(customValue);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Ingresa una duración manual válida');
      }
      return {
        blocked_until: null,
        blocked_duration_value: amount,
        blocked_duration_unit: customUnit,
        is_indefinite: false,
      };
    }

    return {
      blocked_until: null,
      blocked_duration_value: 24,
      blocked_duration_unit: 'hours',
      is_indefinite: false,
    };
  }

  function formatClock(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
  }

  function isUserOnline(user) {
    if (typeof user?.is_online === 'boolean') {
      return user.is_online;
    }

    if (!user?.last_seen_at) {
      return false;
    }

    const lastSeen = new Date(user.last_seen_at).getTime();
    if (Number.isNaN(lastSeen)) {
      return false;
    }

    return (Date.now() - lastSeen) <= PRESENCE_ONLINE_WINDOW_MS;
  }

  function presenceLabel(user) {
    if (isUserOnline(user)) {
      return 'En linea';
    }

    if (user?.last_seen_at) {
      return `Activo ${timeAgo(user.last_seen_at)}`;
    }

    return 'Inactivo';
  }

  function setBackgroundMedia(element, url, fallbackColor) {
    if (!element) return;
    if (url) {
      element.style.setProperty('background-image', `url("${safeUrl(url)}")`, 'important');
      element.style.setProperty('background-size', 'cover', 'important');
      element.style.setProperty('background-position', 'center', 'important');
      if (fallbackColor) element.style.setProperty('background-color', fallbackColor, 'important');
      return;
    }
    element.style.setProperty('background-image', 'none', 'important');
    element.style.removeProperty('background-size');
    element.style.removeProperty('background-position');
    if (fallbackColor) element.style.setProperty('background-color', fallbackColor, 'important');
  }

  function setAvatarElement(element, user) {
    if (!element) return;
    const name = displayName(user);
    const color = userColor(user);
    if (user?.avatar_url) {
      element.textContent = '';
      element.dataset.avatarPhoto = 'true';
      setBackgroundMedia(element, user.avatar_url, color);
    } else {
      element.textContent = initials(name);
      element.dataset.avatarPhoto = 'false';
      element.style.setProperty('background-image', 'none', 'important');
      element.style.setProperty('background-color', color, 'important');
    }
  }

  function renderAvatar(user, options = {}) {
    const sizeClass = options.sizeClass || 'w-10 h-10';
    const textClass = options.textClass || 'text-white font-bold';
    const extraClass = options.extraClass || '';
    const showOnline = options.showOnline && isUserOnline(user)
      ? '<div class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></div>'
      : '';
    const name = displayName(user);
    const color = userColor(user);

    if (user?.avatar_url) {
      return `
        <div class="${sizeClass} ${extraClass} rounded-full shrink-0 relative bg-cover bg-center" style="background-image:url('${safeUrl(user.avatar_url)}'); background-color:${color}">
          ${showOnline}
        </div>
      `;
    }

    return `
      <div class="${sizeClass} ${extraClass} rounded-full shrink-0 relative flex items-center justify-center ${textClass}" style="background:${color}">
        ${escapeHtml(initials(name))}
        ${showOnline}
      </div>
    `;
  }

  function numericId(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function ensurePublicUsersLoaded(force = false) {
    if (publicUsersState.loaded && !force) return publicUsersState.map;
    if (publicUsersState.loading && !force) return publicUsersState.loading;

    publicUsersState.loading = (async () => {
      const result = await AuthAPI.listPublicUsers();
      if (result?.ok) {
        publicUsersState.map = new Map();
        getList(result).forEach((listedUser) => {
          const id = numericId(listedUser?.id);
          if (id !== null) {
            publicUsersState.map.set(id, listedUser);
          }
        });
        publicUsersState.loaded = true;
      }
      return publicUsersState.map;
    })();

    try {
      return await publicUsersState.loading;
    } finally {
      publicUsersState.loading = null;
    }
  }

  function resolveProfileData(source = {}) {
    const id = numericId(source.id ?? source.user_id);
    const cached = id !== null ? publicUsersState.map.get(id) : null;
    const fullName = source.full_name || source.name || source.user_name || cached?.full_name || cached?.name || (id !== null ? `Usuario #${id}` : 'Usuario');
    const school = source.school || source.user_school || source.career || cached?.career || cached?.school || '';
    const faculty = source.faculty || source.user_faculty || cached?.faculty || '';

    return {
      ...cached,
      ...source,
      id,
      name: fullName,
      full_name: fullName,
      school,
      career: school,
      faculty,
      avatar_url: source.avatar_url || cached?.avatar_url || source.user_avatar || null,
      banner_url: source.banner_url || cached?.banner_url || null,
      last_seen_at: source.last_seen_at || cached?.last_seen_at || null,
      is_online: typeof source.is_online === 'boolean' ? source.is_online : cached?.is_online,
    };
  }

  function normalizeFriendEntries(entries = []) {
    return entries.map((entry) => {
      if (entry && typeof entry === 'object') {
        return resolveProfileData(entry);
      }

      const cached = publicUsersState.map.get(Number(entry));
      return cached ? resolveProfileData(cached) : resolveProfileData({ id: entry });
    }).filter((entry) => entry.id !== null);
  }

  function findIncomingRequest(requests = [], targetUserId) {
    const targetId = numericId(targetUserId);
    return requests.find((request) => numericId(request?.sender_id || request?.sender?.id || request?.sender?.user_id) === targetId) || null;
  }

  function getUserTypeLabel(userType) {
    switch (userType) {
      case 'teacher':
        return 'Docente';
      case 'administrativo':
        return 'Administrativo';
      default:
        return 'Estudiante';
    }
  }

  function getAdminUserTypeLabel(listedUser) {
    return getUserTypeLabel(String(listedUser?.user_type || 'student'));
  }

  function renderAdminRoleBadges(listedUser) {
    const typeLabel = getAdminUserTypeLabel(listedUser);
    const typeTone = {
      Estudiante: 'bg-sky-50 text-sky-700 border-sky-200',
      Docente: 'bg-violet-50 text-violet-700 border-violet-200',
      Administrativo: 'bg-amber-50 text-amber-700 border-amber-200',
    }[typeLabel] || 'bg-slate-100 text-slate-700 border-slate-200';
    const adminBadge = listedUser?.role === 'admin'
      ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#1B2A6B] bg-[#E8EDFF] border border-[#C7D2FE]"><span class="w-1.5 h-1.5 rounded-full bg-[#1B2A6B]"></span> Admin</span>'
      : '';
    return `
      <div class="flex flex-wrap items-center gap-2">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold border ${typeTone}">
          <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>${typeLabel}
        </span>
        ${adminBadge}
      </div>
    `;
  }

  function renderAdminStatsSkeleton(count = 4) {
    return Array.from({ length: count }, () => `
      <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
        <div class="skeleton w-12 h-12 rounded-lg shrink-0"></div>
        <div class="flex-1 space-y-2">
          <div class="skeleton skeleton-text" style="width:36%"></div>
          <div class="skeleton skeleton-text" style="width:72%"></div>
        </div>
      </div>
    `).join('');
  }

  function renderAdminTableSkeleton(columns = 6, rows = 5) {
    return Array.from({ length: rows }, () => `
      <tr>
        <td colspan="${columns}" class="py-3 px-5">
          <div class="flex items-center gap-4">
            <div class="skeleton w-10 h-10 rounded-full shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="skeleton skeleton-text" style="width:38%"></div>
              <div class="skeleton skeleton-text" style="width:64%"></div>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function reactionCountSummary(reactionsCount = {}) {
    return Object.entries(REACTION_META)
      .map(([type, meta]) => ({ type, meta, total: Number(reactionsCount?.[type] || 0) }))
      .filter((entry) => entry.total > 0);
  }

  function getSeenNotificationIds() {
    try {
      const raw = window.localStorage.getItem(NOTIFICATION_SEEN_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (error) {
      return new Set();
    }
  }

  function setSeenNotificationIds(ids) {
    try {
      window.localStorage.setItem(NOTIFICATION_SEEN_KEY, JSON.stringify(Array.from(new Set(ids.map(String)))));
    } catch (error) {
      console.warn('No se pudo guardar el estado de notificaciones vistas:', error);
    }
  }

  function renderReactionSummary(reactionsCount = {}, fallbackTotal = 0, emptyLabel = '') {
    const entries = reactionCountSummary(reactionsCount);
    const topEntries = entries
      .sort((left, right) => right.total - left.total)
      .slice(0, 3);
    const total = entries.reduce((sum, entry) => sum + entry.total, 0) || Number(fallbackTotal || 0);
    if (!total) {
      return emptyLabel
        ? `<span class="social-reaction-summary social-reaction-summary--empty"><span class="social-reaction-count">${escapeHtml(emptyLabel)}</span></span>`
        : '';
    }
    return `
      <span class="social-reaction-summary">
        <span class="social-reaction-icons">
          ${topEntries.map((entry) => `<span class="social-reaction-icon">${renderReactionAsset(entry.type)}</span>`).join('')}
        </span>
        <span class="social-reaction-count">${total}</span>
      </span>
    `;
  }

  function renderReactionTrigger(targetType, targetId, currentReaction, interactive = true) {
    const hasReaction = Boolean(currentReaction && REACTION_META[currentReaction]);
    const activeType = hasReaction ? currentReaction : 'me_gusta';
    const meta = REACTION_META[activeType];
    if (!interactive) {
      return `
        <span class="social-reaction-trigger ${currentReaction ? 'is-active' : ''}">
          ${hasReaction ? renderReactionAsset(activeType) : '<span class="material-symbols-outlined social-reaction-trigger__thumb-icon">thumb_up</span>'}
          <span>${escapeHtml(currentReaction ? meta.label : 'Reaccionar')}</span>
        </span>
      `;
    }
    return `
      <button
        type="button"
        data-action="open-reaction-picker"
        data-target-type="${targetType}"
        data-target-id="${targetId}"
        data-current-reaction="${currentReaction || ''}"
        class="social-reaction-trigger ${currentReaction ? 'is-active' : ''}"
      >
        ${hasReaction ? renderReactionAsset(activeType) : '<span class="material-symbols-outlined social-reaction-trigger__thumb-icon">thumb_up</span>'}
        <span>${escapeHtml(currentReaction ? meta.label : 'Reaccionar')}</span>
      </button>
    `;
  }

  async function reportContent(kind, id) {
    const confirmed = await confirmAction({
      title: `Reportar ${kind}`,
      copy: `Esta accion enviara el reporte para revision del equipo.`,
      acceptLabel: 'Reportar',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    let result = null;
    if (kind === 'publicacion') result = await PostsAPI.reportPost(id);
    if (kind === 'comentario') result = await PostsAPI.reportComment(id);
    if (kind === 'mensaje') result = await ChatAPI.reportMessage(id);

    if (result?.ok) {
      showToast('Reporte enviado correctamente', 'success');
      return;
    }

    showToast(result?.data?.error || 'No se pudo enviar el reporte', 'error');
  }

  let reactionPickerCloseTimer = null;
  let reactionPickerDismissHandlers = null;

  function clearReactionPickerCloseTimer() {
    if (reactionPickerCloseTimer) {
      clearTimeout(reactionPickerCloseTimer);
      reactionPickerCloseTimer = null;
    }
  }

  function pointerWithinReactionZone(nextTarget, trigger = reactionPickerState?.trigger) {
    if (!nextTarget || !trigger) return false;
    if (trigger.contains(nextTarget)) return true;
    return Boolean(
      reactionPickerState?.element
      && reactionPickerState.trigger === trigger
      && reactionPickerState.element.contains(nextTarget)
    );
  }

  function scheduleReactionPickerClose() {
    clearReactionPickerCloseTimer();
    reactionPickerCloseTimer = window.setTimeout(() => closeReactionPicker(), 240);
  }

  function closeReactionPicker() {
    clearReactionPickerCloseTimer();
    if (!reactionPickerState?.element) return;
    if (reactionPickerDismissHandlers) {
      window.removeEventListener('wheel', reactionPickerDismissHandlers.onDismiss, true);
      window.removeEventListener('touchmove', reactionPickerDismissHandlers.onDismiss, true);
      window.removeEventListener('scroll', reactionPickerDismissHandlers.onDismiss, true);
      reactionPickerDismissHandlers = null;
    }
    reactionPickerState.element.remove();
    document.removeEventListener('click', reactionPickerState.outsideHandler, true);
    reactionPickerState = null;
  }

  function warmPublicUsersInBackground(force = false) {
    ensurePublicUsersLoaded(force).catch((error) => {
      console.warn('No se pudo precalentar el directorio publico de usuarios:', error);
    });
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findActiveMentionQuery(value, caretIndex) {
    const text = String(value || '');
    const safeCaretIndex = Math.max(0, Math.min(Number(caretIndex) || 0, text.length));
    const beforeCaret = text.slice(0, safeCaretIndex);
    let atIndex = beforeCaret.lastIndexOf('@');

    while (atIndex >= 0) {
      const previousChar = atIndex > 0 ? beforeCaret.charAt(atIndex - 1) : '';
      if (atIndex > 0 && !/[\s([{>]/.test(previousChar)) {
        atIndex = beforeCaret.lastIndexOf('@', atIndex - 1);
        continue;
      }

      const rawQuery = beforeCaret.slice(atIndex + 1);
      if (/[\r\n\t]/.test(rawQuery)) {
        return null;
      }
      if (rawQuery.length > 48) {
        return null;
      }
      if (/\s$/.test(rawQuery) && rawQuery.trim()) {
        return null;
      }
      if (/[^0-9A-Za-zÀ-ÿ\u00f1\u00d1 ._-]/.test(rawQuery)) {
        return null;
      }

      return {
        start: atIndex,
        end: safeCaretIndex,
        query: rawQuery.trim(),
      };
    }

    return null;
  }

  function createMentionAutocomplete(textarea, options = {}) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return {
        collectMentionUserIds: () => [],
        clear: () => {},
        destroy: () => {},
      };
    }

    const state = {
      activeToken: null,
      highlightedIndex: 0,
      requestVersion: 0,
      suggestions: [],
      selectedMentions: [],
      destroyed: false,
    };
    const panel = document.createElement('div');
    panel.className = 'mention-suggestions hidden';
    document.body.appendChild(panel);
    const shell = document.createElement('div');
    shell.className = 'mention-textarea-shell';
    const mirror = document.createElement('div');
    mirror.className = 'mention-textarea-mirror';
    mirror.setAttribute('aria-hidden', 'true');

    if (textarea.parentNode) {
      textarea.parentNode.insertBefore(shell, textarea);
      shell.appendChild(mirror);
      shell.appendChild(textarea);
    }
    textarea.classList.add('mention-textarea-enabled');

    function syncMirrorStyles() {
      const computed = window.getComputedStyle(textarea);
      mirror.style.paddingTop = computed.paddingTop;
      mirror.style.paddingRight = computed.paddingRight;
      mirror.style.paddingBottom = computed.paddingBottom;
      mirror.style.paddingLeft = computed.paddingLeft;
      mirror.style.font = computed.font;
      mirror.style.lineHeight = computed.lineHeight;
      mirror.style.letterSpacing = computed.letterSpacing;
      mirror.style.textTransform = computed.textTransform;
      mirror.style.textAlign = computed.textAlign;
      mirror.style.borderRadius = computed.borderRadius;
    }

    function renderMentionHighlight() {
      const text = textarea.value || '';
      if (!text) {
        mirror.innerHTML = '&nbsp;';
        return;
      }

      const mentions = [...state.selectedMentions]
        .filter((entry) => entry?.label)
        .sort((left, right) => String(right.label).length - String(left.label).length);

      if (!mentions.length) {
        mirror.innerHTML = `${escapeHtmlWithBreaks(text)}<br>`;
        return;
      }

      let cursor = 0;
      let html = '';

      while (cursor < text.length) {
        const atIndex = text.indexOf('@', cursor);
        if (atIndex === -1) {
          html += escapeHtmlWithBreaks(text.slice(cursor));
          break;
        }

        const previousChar = atIndex > 0 ? text.charAt(atIndex - 1) : '';
        const mention = mentions.find((entry) => {
          if (previousChar && !/[\s([{>]/u.test(previousChar)) {
            return false;
          }
          const label = String(entry.label || '');
          const candidate = text.slice(atIndex + 1, atIndex + 1 + label.length);
          const nextChar = text.charAt(atIndex + 1 + label.length);
          return normalizeSearchText(candidate) === normalizeSearchText(label)
            && isMentionBoundaryAfter(nextChar);
        });

        if (!mention) {
          html += escapeHtmlWithBreaks(text.slice(cursor, atIndex + 1));
          cursor = atIndex + 1;
          continue;
        }

        const label = String(mention.label || '');
        html += escapeHtmlWithBreaks(text.slice(cursor, atIndex));
        html += `<span class="mention-textarea-highlight">@${escapeHtml(label)}</span>`;
        cursor = atIndex + 1 + label.length;
      }

      mirror.innerHTML = `${html}<br>`;
    }

    function syncMirrorScroll() {
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    }

    function getSelectedMentionLabel(user) {
      return displayName(resolveProfileData(user));
    }

    function syncPanelPosition() {
      if (panel.classList.contains('hidden')) return;
      const rect = textarea.getBoundingClientRect();
      panel.style.left = `${Math.max(12, rect.left)}px`;
      panel.style.top = `${Math.min(window.innerHeight - 12, rect.bottom + 8)}px`;
      panel.style.width = `${Math.min(Math.max(rect.width, 260), 420)}px`;
    }

    function closePanel() {
      state.activeToken = null;
      state.suggestions = [];
      panel.classList.add('hidden');
      panel.innerHTML = '';
    }

    function openPanel() {
      panel.classList.remove('hidden');
      syncPanelPosition();
    }

    function upsertSelectedMention(user) {
      const mentionId = Number(user?.id || 0);
      const mentionLabel = getSelectedMentionLabel(user);
      if (!mentionId || !mentionLabel) return;

      state.selectedMentions = state.selectedMentions.filter((entry) => Number(entry.id) !== mentionId);
      state.selectedMentions.push({ id: mentionId, label: mentionLabel });
    }

    function renderSuggestions() {
      if (!state.suggestions.length) {
        closePanel();
        return;
      }

      panel.innerHTML = state.suggestions.map((entry, index) => {
        const user = resolveProfileData(entry);
        return `
          <button
            type="button"
            class="mention-suggestion-item ${index === state.highlightedIndex ? 'is-active' : ''}"
            data-mention-index="${index}"
          >
            ${renderAvatar(user, { sizeClass: 'w-9 h-9', textClass: 'text-white font-bold text-xs' })}
            <span class="mention-suggestion-copy">
              <span class="mention-suggestion-name">${escapeHtml(displayName(user))}</span>
              <span class="mention-suggestion-meta">
                ${escapeHtml(careerLabel(user) || 'Usuario UPT')}
                ${entry.isFriend ? '<span class="mention-suggestion-pill">Amigo</span>' : ''}
              </span>
            </span>
          </button>
        `;
      }).join('');
      openPanel();
    }

    function applySuggestion(user) {
      if (!state.activeToken) return;
      const resolvedUser = resolveProfileData(user);
      const mentionLabel = getSelectedMentionLabel(resolvedUser);
      const currentValue = textarea.value || '';
      const nextValue = `${currentValue.slice(0, state.activeToken.start)}@${mentionLabel} ${currentValue.slice(state.activeToken.end)}`;
      const caretPosition = state.activeToken.start + mentionLabel.length + 2;
      textarea.value = nextValue;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      textarea.setSelectionRange(caretPosition, caretPosition);
      upsertSelectedMention(resolvedUser);
      renderMentionHighlight();
      closePanel();
    }

    async function loadSuggestions(query) {
      const currentRequestVersion = ++state.requestVersion;
      await ensurePublicUsersLoaded();

      const normalizedQuery = normalizeSearchText(query);
      const [friendsResult, directoryResult] = await Promise.all([
        SocialAPI.getFriends(),
        normalizedQuery ? SocialAPI.searchDirectory(query) : Promise.resolve(null),
      ]);

      if (state.destroyed || currentRequestVersion !== state.requestVersion) {
        return;
      }

      const friends = normalizeFriendEntries(getList(friendsResult))
        .filter((entry) => Number(entry.id) !== Number(appState.user?.id || 0));
      const friendIds = new Set(friends.map((entry) => Number(entry.id)));
      const matchesQuery = (entry) => {
        if (!normalizedQuery) return true;
        return normalizeSearchText(displayName(entry)).includes(normalizedQuery);
      };

      const friendMatches = friends
        .filter(matchesQuery)
        .map((entry) => ({ ...entry, isFriend: true }));

      const directorySource = normalizedQuery
        ? getList(directoryResult)
        : Array.from(publicUsersState.map.values());
      const directoryMatches = directorySource
        .map((entry) => resolveProfileData(entry))
        .filter((entry) => entry.id !== null && Number(entry.id) !== Number(appState.user?.id || 0))
        .filter(matchesQuery)
        .map((entry) => ({ ...entry, isFriend: friendIds.has(Number(entry.id)) }));

      const merged = [];
      const seenIds = new Set();
      [...friendMatches, ...directoryMatches]
        .sort((left, right) => {
          if (Boolean(right.isFriend) !== Boolean(left.isFriend)) {
            return right.isFriend ? 1 : -1;
          }
          return displayName(left).localeCompare(displayName(right), 'es', { sensitivity: 'base' });
        })
        .forEach((entry) => {
          const id = Number(entry.id);
          if (!id || seenIds.has(id)) return;
          seenIds.add(id);
          merged.push(entry);
        });

      state.suggestions = merged.slice(0, normalizedQuery ? 8 : 10);
      state.highlightedIndex = 0;
      renderSuggestions();
    }

    function refreshSuggestions() {
      if (state.destroyed) return;
      const activeToken = findActiveMentionQuery(textarea.value, textarea.selectionStart ?? textarea.value.length);
      state.activeToken = activeToken;
      if (!activeToken) {
        closePanel();
        return;
      }
      loadSuggestions(activeToken.query).catch(() => closePanel());
    }

    function collectMentionUserIds() {
      const content = textarea.value || '';
      const collected = state.selectedMentions
        .filter((entry) => entry?.label && content.match(new RegExp(`(^|\\s)@${escapeRegExp(entry.label)}(?=\\s|$|[.,!?;:])`, 'i')))
        .map((entry) => Number(entry.id))
        .filter((entry) => Number.isFinite(entry) && entry > 0);

      return Array.from(new Set(collected));
    }

    function clear() {
      state.selectedMentions = [];
      renderMentionHighlight();
      closePanel();
    }

    function handleInput() {
      renderMentionHighlight();
      refreshSuggestions();
    }

    function handleKeydown(event) {
      if (panel.classList.contains('hidden') || !state.suggestions.length) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.highlightedIndex = (state.highlightedIndex + 1) % state.suggestions.length;
        renderSuggestions();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.highlightedIndex = (state.highlightedIndex - 1 + state.suggestions.length) % state.suggestions.length;
        renderSuggestions();
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applySuggestion(state.suggestions[state.highlightedIndex]);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    }

    function handleDocumentClick(event) {
      if (panel.contains(event.target) || textarea.contains(event.target)) {
        return;
      }
      closePanel();
    }

    function handlePanelPointerDown(event) {
      const button = event.target.closest('[data-mention-index]');
      if (!button) return;
      event.preventDefault();
      const index = Number(button.dataset.mentionIndex || -1);
      if (!Number.isFinite(index) || index < 0 || index >= state.suggestions.length) return;
      applySuggestion(state.suggestions[index]);
    }

    panel.addEventListener('pointerdown', handlePanelPointerDown);
    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('click', refreshSuggestions);
    textarea.addEventListener('keyup', refreshSuggestions);
    textarea.addEventListener('keydown', handleKeydown);
    textarea.addEventListener('focus', refreshSuggestions);
    textarea.addEventListener('scroll', syncMirrorScroll);
    document.addEventListener('click', handleDocumentClick);
    window.addEventListener('resize', syncPanelPosition);
    window.addEventListener('resize', syncMirrorStyles);
    document.addEventListener('scroll', syncPanelPosition, true);
    syncMirrorStyles();
    renderMentionHighlight();
    syncMirrorScroll();

    return {
      collectMentionUserIds,
      clear,
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        panel.removeEventListener('pointerdown', handlePanelPointerDown);
        textarea.removeEventListener('input', handleInput);
        textarea.removeEventListener('click', refreshSuggestions);
        textarea.removeEventListener('keyup', refreshSuggestions);
        textarea.removeEventListener('keydown', handleKeydown);
        textarea.removeEventListener('focus', refreshSuggestions);
        textarea.removeEventListener('scroll', syncMirrorScroll);
        document.removeEventListener('click', handleDocumentClick);
        window.removeEventListener('resize', syncPanelPosition);
        window.removeEventListener('resize', syncMirrorStyles);
        document.removeEventListener('scroll', syncPanelPosition, true);
        textarea.classList.remove('mention-textarea-enabled');
        if (shell.parentNode) {
          shell.parentNode.insertBefore(textarea, shell);
          shell.remove();
        }
        panel.remove();
      },
    };
  }

  function openReactionPicker(trigger, { targetType, targetId, currentReaction, onSelect }) {
    if (reactionPickerState?.element && reactionPickerState.trigger === trigger) {
      clearReactionPickerCloseTimer();
      return;
    }
    closeReactionPicker();
    const rect = trigger.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = Object.entries(REACTION_META).map(([type, meta]) => `
      <button type="button" class="reaction-picker-option ${currentReaction === type ? 'is-active' : ''}" data-picker-reaction="${type}" title="${escapeHtml(meta.label)}">
        ${renderReactionAsset(type)}
      </button>
    `).join('');
    document.body.appendChild(picker);
    const pickerRect = picker.getBoundingClientRect();
    picker.style.left = `${Math.max(12, rect.left + (rect.width / 2) - (pickerRect.width / 2))}px`;
    picker.style.top = `${Math.max(12, rect.top - pickerRect.height - 10)}px`;

    const handleSelect = async (event) => {
      const button = event.target.closest('[data-picker-reaction]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      const reaction = button.dataset.pickerReaction;
      picker.style.pointerEvents = 'none';
      closeReactionPicker();
      await onSelect(reaction);
    };
    const outsideHandler = (event) => {
      if (picker.contains(event.target) || trigger.contains(event.target)) return;
      closeReactionPicker();
    };
    picker.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    picker.addEventListener('click', handleSelect);
    picker.addEventListener('mouseenter', clearReactionPickerCloseTimer);
    picker.addEventListener('mouseleave', (event) => {
      if (pointerWithinReactionZone(event.relatedTarget, trigger)) {
        clearReactionPickerCloseTimer();
        return;
      }
      scheduleReactionPickerClose();
    });
    const dismissOnMove = () => closeReactionPicker();
    reactionPickerDismissHandlers = { onDismiss: dismissOnMove };
    window.addEventListener('wheel', dismissOnMove, true);
    window.addEventListener('touchmove', dismissOnMove, true);
    window.addEventListener('scroll', dismissOnMove, true);
    setTimeout(() => document.addEventListener('click', outsideHandler, true), 0);
    reactionPickerState = { element: picker, outsideHandler, trigger };
  }

  function renderCommentReactionTrigger(commentId, currentReaction, interactive = true) {
    const hasReaction = Boolean(currentReaction && REACTION_META[currentReaction]);
    const label = currentReaction ? REACTION_META[currentReaction].label : 'Me gusta';
    if (!interactive) {
      return `
        <span class="comment-reaction-trigger ${currentReaction ? 'is-active' : ''}">
          ${escapeHtml(label)}
        </span>
      `;
    }
    return `
      <button
        type="button"
        data-action="open-reaction-picker"
        data-target-type="comment"
        data-target-id="${commentId}"
        data-current-reaction="${currentReaction || ''}"
        class="comment-reaction-trigger ${currentReaction ? 'is-active' : ''}"
      >
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderCommentCard(comment, options = {}) {
    const interactive = options.interactive !== false;
    const compact = options.compact !== false;
    const deleteAction = options.deleteAction || '';
    const deleteId = options.deleteId || comment.id;
    const deleteLabel = options.deleteLabel || 'Eliminar comentario';
    const author = resolveProfileData({
      id: comment.user_id,
      user_name: comment.user_name,
      user_faculty: comment.user_faculty,
      user_avatar: comment.user_avatar,
    });

    return `
      <article class="post-comment-card ${compact ? 'post-comment-card--compact' : ''} ${deleteAction ? 'post-comment-card--deletable' : ''}">
        <div class="post-comment-card__wrapper">
          ${renderAvatar(author, { sizeClass: compact ? 'w-8 h-8 md:w-9 md:h-9' : 'w-9 h-9', textClass: 'text-white font-bold text-sm' })}
          <div class="post-comment-card__body">
            <div class="post-comment-card__bubble-stack">
              <div class="post-comment-card__bubble">
                ${deleteAction ? `
                  <button
                    type="button"
                    data-action="${escapeHtml(deleteAction)}"
                    data-comment-id="${escapeHtml(deleteId)}"
                    class="post-comment-card__delete"
                    aria-label="${escapeHtml(deleteLabel)}"
                    title="${escapeHtml(deleteLabel)}"
                  >
                    <span class="material-symbols-outlined">delete</span>
                    <span class="post-comment-card__delete-text">Eliminar</span>
                  </button>
                ` : ''}
                <div class="post-comment-card__meta">
                  <span class="post-comment-card__name">${escapeHtml(displayName(author))}</span>
                  ${author.faculty ? `
                    <span class="post-comment-card__faculty" style="background:${userColor(author)}">
                      ${escapeHtml(author.faculty)}
                    </span>
                  ` : ''}
                  ${comment.created_at ? `
                    <span class="post-comment-card__dot">·</span>
                    <span
                      class="post-comment-card__time"
                      data-time-ago="${escapeHtml(comment.created_at)}"
                      data-time-ago-ts="${escapeHtml(String(new Date(comment.created_at).getTime() || ''))}"
                    >${escapeHtml(timeAgo(comment.created_at))}</span>
                  ` : ''}
                </div>
                <p class="post-comment-card__text content-break content-rich">${renderTextWithMentions(comment.content || '')}</p>
              </div>
              ${Number(comment.reactions_total || 0) > 0 ? `
                <div class="post-comment-card__bubble-reactions">
                  ${renderReactionSummary(comment.reactions_count, comment.reactions_total)}
                </div>
              ` : ''}
            </div>
            <div class="post-comment-card__actions">
              ${renderReactionTrigger('comment', comment.id, comment.current_reaction, interactive)}
              ${interactive ? `
                <button type="button" data-action="report-comment" data-comment-id="${comment.id}" class="post-comment-card__action-btn post-comment-card__action-report">
                  <span class="material-symbols-outlined text-[14px]">flag</span>
                  <span>Reportar</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function bindCommentSortChips(root, select, onSelect) {
    const buttons = Array.from(root?.querySelectorAll('[data-comment-sort-option]') || []);
    const sync = (value = select?.value || 'newest') => {
      buttons.forEach((button) => {
        const isActive = button.dataset.commentSortOption === value;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const nextValue = button.dataset.commentSortOption || 'newest';
        if (select) select.value = nextValue;
        sync(nextValue);
        onSelect?.(nextValue);
      });
    });

    sync();
    return sync;
  }

  function ensurePostImageLightbox() {
    let root = document.getElementById('post-image-lightbox');
    if (root) {
      return root;
    }

    root = document.createElement('div');
    root.id = 'post-image-lightbox';
    root.className = 'post-image-lightbox hidden fixed inset-0 z-[120] items-center justify-center p-4';
    root.innerHTML = `
      <div class="post-image-lightbox__backdrop absolute inset-0"></div>
      <button type="button" class="post-image-lightbox__close" aria-label="Cerrar imagen ampliada">
        <span class="material-symbols-outlined text-[22px]">close</span>
      </button>
      <div class="post-image-lightbox__content relative z-[1]">
        <img id="post-image-lightbox-img" class="post-image-lightbox__img" alt="Imagen ampliada de la publicacion"/>
      </div>
    `;
    document.body.appendChild(root);

    const close = () => {
      root.classList.add('hidden');
      root.classList.remove('flex');
      document.body.classList.remove('overflow-hidden');
      const img = root.querySelector('#post-image-lightbox-img');
      if (img) {
        img.removeAttribute('src');
      }
    };

    root.querySelector('.post-image-lightbox__backdrop')?.addEventListener('click', close);
    root.querySelector('.post-image-lightbox__close')?.addEventListener('click', close);
    root.addEventListener('click', (event) => {
      if (event.target === root) close();
    });
    root.__closeLightbox = close;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !root.classList.contains('hidden')) {
        close();
      }
    });

    return root;
  }

  function openPostImageLightbox(imageUrl, alt = 'Imagen ampliada de la publicacion') {
    if (!imageUrl) return;
    const root = ensurePostImageLightbox();
    const img = root.querySelector('#post-image-lightbox-img');
    if (img) {
      img.src = safeUrl(imageUrl);
      img.alt = alt;
    }
    root.classList.remove('hidden');
    root.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  function escapeHtmlWithBreaks(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  function normalizeRenderableUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (/^www\./i.test(value)) return `https://${value}`;
    return '';
  }

  function renderPlainTextWithLinks(value) {
    const text = String(value || '');
    if (!text) return '';

    const urlRegex = /(?:https?:\/\/|www\.)[^\s<]+/giu;
    let html = '';
    let cursor = 0;
    let match = urlRegex.exec(text);

    while (match) {
      const matchedUrl = match[0];
      const start = match.index;
      const end = start + matchedUrl.length;
      const normalizedUrl = normalizeRenderableUrl(matchedUrl);
      html += escapeHtmlWithBreaks(text.slice(cursor, start));
      html += normalizedUrl
        ? `<a href="${escapeHtml(normalizedUrl)}" class="content-link" target="_blank" rel="noopener noreferrer">${escapeHtml(matchedUrl)}</a>`
        : escapeHtmlWithBreaks(matchedUrl);
      cursor = end;
      match = urlRegex.exec(text);
    }

    html += escapeHtmlWithBreaks(text.slice(cursor));
    return html;
  }

  function getMentionRenderableUsers() {
    return Array.from(publicUsersState.map.values())
      .map((entry) => resolveProfileData(entry))
      .filter((entry) => entry.id !== null)
      .map((entry) => ({
        ...entry,
        mentionLabel: displayName(entry),
        mentionNormalizedLabel: normalizeSearchText(displayName(entry)),
      }))
      .sort((left, right) => right.mentionNormalizedLabel.length - left.mentionNormalizedLabel.length);
  }

  function isMentionBoundaryAfter(char) {
    return !char || /[\s.,!?;:)\]}>"']/u.test(char);
  }

  function findMentionUserAt(text, atIndex, users = getMentionRenderableUsers()) {
    if (atIndex < 0 || text.charAt(atIndex) !== '@') return null;
    const previousChar = atIndex > 0 ? text.charAt(atIndex - 1) : '';
    if (previousChar && !/[\s([{>]/u.test(previousChar)) {
      return null;
    }

    const sliceAfter = text.slice(atIndex + 1);
    for (const user of users) {
      const label = user.mentionLabel || '';
      if (!label) continue;
      const candidateSlice = sliceAfter.slice(0, label.length);
      if (normalizeSearchText(candidateSlice) !== user.mentionNormalizedLabel) {
        continue;
      }

      const nextChar = text.charAt(atIndex + 1 + label.length);
      if (!isMentionBoundaryAfter(nextChar)) {
        continue;
      }

      return {
        user,
        label,
        end: atIndex + 1 + label.length,
      };
    }

    return null;
  }

  function renderMentionLink(user) {
    const resolved = resolveProfileData(user);
    const userId = Number(resolved.id || 0);
    if (!userId) {
      return escapeHtml(`@${displayName(resolved)}`);
    }

    return `<a href="${buildHash('profile', { id: userId })}" class="mention-link" data-action="open-profile" data-user-id="${userId}" data-mention-profile="true" data-mention-user-id="${userId}">@${escapeHtml(displayName(resolved))}</a>`;
  }

  function renderTextWithMentions(value) {
    const text = String(value || '');
    if (!text) return '';

    const users = getMentionRenderableUsers();
    if (!users.length) {
      return renderPlainTextWithLinks(text);
    }

    let cursor = 0;
    let html = '';

    while (cursor < text.length) {
      const atIndex = text.indexOf('@', cursor);
      if (atIndex === -1) {
        html += renderPlainTextWithLinks(text.slice(cursor));
        break;
      }

      const match = findMentionUserAt(text, atIndex, users);
      if (!match) {
        html += renderPlainTextWithLinks(text.slice(cursor, atIndex + 1));
        cursor = atIndex + 1;
        continue;
      }

      html += renderPlainTextWithLinks(text.slice(cursor, atIndex));
      html += renderMentionLink(match.user);
      cursor = match.end;
    }

    return html;
  }

  let mentionProfilePopoverRoot = null;
  let mentionProfilePopoverAnchor = null;
  let mentionProfilePopoverHideTimer = null;

  function clearMentionProfilePopoverHideTimer() {
    if (mentionProfilePopoverHideTimer) {
      window.clearTimeout(mentionProfilePopoverHideTimer);
      mentionProfilePopoverHideTimer = null;
    }
  }

  function resetMediaPreview(previewWrap, previewImage, previewVideo) {
    clearPreviewUnavailable(previewWrap, previewImage);
    if (previewImage) {
      previewImage.onload = null;
      previewImage.onerror = null;
      previewImage.classList.remove('hidden');
      previewImage.removeAttribute('src');
    }
    if (previewVideo) {
      previewVideo.onloadeddata = null;
      previewVideo.onloadedmetadata = null;
      previewVideo.oncanplay = null;
      previewVideo.onerror = null;
      previewVideo.pause?.();
      previewVideo.currentTime = 0;
      previewVideo.loop = true;
      previewVideo.removeAttribute('poster');
      previewVideo.classList.add('hidden');
      previewVideo.removeAttribute('src');
      previewVideo.load?.();
    }
  }

  function getComposerPreviewOverlayElements(previewWrap) {
    if (!previewWrap) return {};
    return {
      overlay: previewWrap.querySelector('[data-composer-upload-overlay]'),
      progressCircle: previewWrap.querySelector('[data-composer-upload-progress-circle]'),
      progressValue: previewWrap.querySelector('[data-composer-upload-progress-value]'),
      status: previewWrap.querySelector('[data-composer-upload-status]'),
    };
  }

  function setComposerPreviewOverlay(previewWrap, {
    visible = false,
    progress = null,
    label = '',
  } = {}) {
    const { overlay, progressCircle, progressValue, status } = getComposerPreviewOverlayElements(previewWrap);
    if (!overlay) return;

    overlay.classList.toggle('hidden', !visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (!visible) {
      progressCircle?.classList.add('is-indeterminate');
      progressCircle?.style.removeProperty('--composer-upload-progress');
      if (progressValue) progressValue.textContent = '...';
      if (status) status.textContent = '';
      return;
    }

    const numericProgress = Number(progress);
    const hasDeterminateProgress = Number.isFinite(numericProgress);
    const normalizedProgress = hasDeterminateProgress
      ? Math.max(0, Math.min(100, numericProgress))
      : 0;

    progressCircle?.classList.toggle('is-indeterminate', !hasDeterminateProgress);
    progressCircle?.style.setProperty('--composer-upload-progress', `${normalizedProgress}%`);
    if (progressValue) {
      progressValue.textContent = hasDeterminateProgress ? `${Math.round(normalizedProgress)}%` : '...';
    }
    if (status) {
      status.textContent = label || (hasDeterminateProgress ? 'Subiendo archivo...' : 'Cargando vista previa...');
    }
  }

  function composerHasSubmittableContent(contentInput, state) {
    const hasText = !!String(contentInput?.value || '').trim();
    const hasMedia = !!state?.file;
    return hasText || hasMedia;
  }

  function syncComposerPublishButton(button, contentInput, state, idleLabel = 'Publicar') {
    if (!button) return;

    if (state?.uploadInProgress) {
      button.disabled = true;
      const numericProgress = Number(state.uploadProgress);
      button.textContent = Number.isFinite(numericProgress)
        ? `Subiendo ${Math.round(numericProgress)}%`
        : 'Subiendo...';
      return;
    }

    button.textContent = idleLabel;

    const hasContent = composerHasSubmittableContent(contentInput, state);
    const mediaReady = !state?.file || !!state?.previewReady;
    const mediaBusy = !!state?.previewLoading || !!state?.uploadInProgress;
    button.disabled = !hasContent || !mediaReady || mediaBusy;
  }

  function clearComposerMediaSelection(state, elements = {}) {
    state.file = null;
    state.kind = null;
    state.previewReady = false;
    state.previewLoading = false;
    state.uploadInProgress = false;
    state.uploadProgress = 0;
    if (elements.fileInput) elements.fileInput.value = '';
    if (elements.cameraInput) elements.cameraInput.value = '';
    if (Array.isArray(elements.extraInputs)) {
      elements.extraInputs.forEach((input) => {
        if (input) input.value = '';
      });
    }
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = '';
    }
    setComposerPreviewOverlay(elements.previewWrap, { visible: false });
    resetMediaPreview(elements.previewWrap, elements.previewImage, elements.previewVideo);
    elements.previewWrap?.classList.add('hidden');
    elements.onStateChange?.();
  }

  function applyComposerMediaSelection(file, state, elements = {}) {
    if (!file) return;
    const validation = validateSupportedPostMediaFile(file);
    if (!validation.ok) {
      clearComposerMediaSelection(state, elements);
      return validation;
    }

    state.file = file;
    state.kind = file.type.startsWith('video/') || SUPPORTED_UPLOAD_VIDEO_EXTENSIONS.has(getFileExtension(file.name))
      ? 'video'
      : 'image';
    state.previewReady = false;
    state.previewLoading = true;
    state.uploadInProgress = false;
    state.uploadProgress = 0;

    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
    }
    state.previewUrl = URL.createObjectURL(file);
    resetMediaPreview(elements.previewWrap, elements.previewImage, elements.previewVideo);
    setComposerPreviewOverlay(elements.previewWrap, {
      visible: true,
      progress: null,
      label: 'Cargando vista previa...',
    });

    const markReady = () => {
      state.previewLoading = false;
      state.previewReady = true;
      setComposerPreviewOverlay(elements.previewWrap, { visible: false });
      elements.onStateChange?.();
    };

    const markFailed = (message) => {
      state.previewLoading = false;
      state.previewReady = false;
      setComposerPreviewOverlay(elements.previewWrap, { visible: false });
      markPreviewUnavailable(elements.previewWrap, elements.previewImage, message);
      elements.onStateChange?.();
    };

    if (state.kind === 'video' && elements.previewVideo) {
      elements.previewImage?.classList.add('hidden');
      elements.previewVideo.classList.remove('hidden');
      elements.previewVideo.muted = true;
      elements.previewVideo.defaultMuted = true;
      elements.previewVideo.autoplay = false;
      elements.previewVideo.loop = false;
      elements.previewVideo.playsInline = true;
      elements.previewVideo.preload = 'metadata';
      let previewMarkedReady = false;
      const markVideoReady = () => {
        if (previewMarkedReady) return;
        previewMarkedReady = true;
        // Seek to first frame for thumbnail — do NOT play
        try { elements.previewVideo.currentTime = 0.01; } catch (_) {}
        markReady();
      };
      elements.previewVideo.onloadedmetadata = markVideoReady;
      elements.previewVideo.onloadeddata = markVideoReady;
      elements.previewVideo.oncanplay = markVideoReady;
      elements.previewVideo.onerror = () => {
        markFailed('Vista previa no disponible para este video.');
      };
      elements.previewVideo.src = state.previewUrl;
      elements.previewVideo.load?.();
    } else if (elements.previewImage) {
      elements.previewVideo?.classList.add('hidden');
      elements.previewImage.classList.remove('hidden');
      elements.previewImage.onload = markReady;
      elements.previewImage.onerror = () => {
        markFailed('Vista previa no disponible para este formato.');
      };
      elements.previewImage.src = state.previewUrl;
    }

    elements.previewWrap?.classList.remove('hidden');
    elements.onStateChange?.();
    return { ok: true, kind: state.kind };
  }

  function ensureMentionProfilePopover() {
    if (mentionProfilePopoverRoot) {
      return mentionProfilePopoverRoot;
    }

    const root = document.createElement('div');
    root.className = 'mention-profile-popover';
    root.setAttribute('aria-hidden', 'true');
    root.addEventListener('mouseenter', clearMentionProfilePopoverHideTimer);
    root.addEventListener('mouseleave', () => {
      scheduleHideMentionProfilePopover();
    });
    document.body.appendChild(root);
    mentionProfilePopoverRoot = root;
    return root;
  }

  function positionMentionProfilePopover(anchor, root) {
    if (!anchor || !root) return;
    const rect = anchor.getBoundingClientRect();
    const topGap = 10;
    const margin = 12;
    const rootWidth = root.offsetWidth || Math.min(320, window.innerWidth - (margin * 2));
    let left = rect.left;
    if (left + rootWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - rootWidth;
    }
    left = Math.max(margin, left);

    let top = rect.bottom + topGap;
    const rootHeight = root.offsetHeight || 0;
    if (top + rootHeight > window.innerHeight - margin) {
      top = rect.top - rootHeight - topGap;
    }
    top = Math.max(margin, top);

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }

  function hideMentionProfilePopover() {
    clearMentionProfilePopoverHideTimer();
    if (!mentionProfilePopoverRoot) return;
    mentionProfilePopoverRoot.classList.remove('is-visible');
    mentionProfilePopoverRoot.setAttribute('aria-hidden', 'true');
    mentionProfilePopoverAnchor = null;
  }

  function scheduleHideMentionProfilePopover() {
    clearMentionProfilePopoverHideTimer();
    mentionProfilePopoverHideTimer = window.setTimeout(() => {
      hideMentionProfilePopover();
    }, 120);
  }

  function showMentionProfilePopover(anchor, userId) {
    if (!isDesktopClient()) return;
    const numericUserId = Number(userId || 0);
    if (!numericUserId) return;
    const user = resolveProfileData(publicUsersState.map.get(numericUserId) || { id: numericUserId });
    const root = ensureMentionProfilePopover();
    const fallbackBanner = userColor(user);
    const bannerStyle = user.banner_url
      ? `background-image:url('${safeUrl(user.banner_url)}'); background-size:cover; background-position:center; background-color:${fallbackBanner};`
      : `background:${fallbackBanner};`;

    root.innerHTML = `
      <div class="mention-profile-popover__banner" style="${bannerStyle}"></div>
      <div class="mention-profile-popover__body">
        <div class="mention-profile-popover__avatar">
          ${renderAvatar(user, { sizeClass: 'w-full h-full', textClass: 'text-white font-bold text-lg' })}
        </div>
        <div class="mention-profile-popover__copy">
          <div class="mention-profile-popover__title">
            <span class="mention-profile-popover__name">${escapeHtml(displayName(user))}</span>
            <span class="mention-profile-popover__faculty" style="background:${userColor(user)}">${escapeHtml(user.faculty || 'UPT')}</span>
          </div>
          <div class="mention-profile-popover__career">${escapeHtml(careerLabel(user) || 'Perfil UPT')}</div>
        </div>
      </div>
    `;
    mentionProfilePopoverAnchor = anchor;
    root.classList.add('is-visible');
    root.setAttribute('aria-hidden', 'false');
    positionMentionProfilePopover(anchor, root);
  }

  function initMentionProfilePopoverBehavior() {
    const handleMouseOver = (event) => {
      if (!isDesktopClient()) return;
      const trigger = event.target.closest?.('[data-mention-profile="true"]');
      if (!trigger) return;
      if (mentionProfilePopoverAnchor === trigger) return;
      clearMentionProfilePopoverHideTimer();
      const userId = trigger.dataset.mentionUserId;
      if (!userId) return;
      showMentionProfilePopover(trigger, userId);
    };

    const handleMouseOut = (event) => {
      const trigger = event.target.closest?.('[data-mention-profile="true"]');
      if (!trigger) return;
      const related = event.relatedTarget;
      if (related instanceof Element && (trigger.contains(related) || mentionProfilePopoverRoot?.contains(related))) {
        return;
      }
      scheduleHideMentionProfilePopover();
    };

    const handleScrollOrResize = () => {
      if (mentionProfilePopoverAnchor && mentionProfilePopoverRoot?.classList.contains('is-visible')) {
        positionMentionProfilePopover(mentionProfilePopoverAnchor, mentionProfilePopoverRoot);
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('click', () => {
      hideMentionProfilePopover();
    }, true);
  }

  initMentionProfilePopoverBehavior();

  function syncCurrentUser(payload) {
    if (payload?.token && payload?.user) {
      saveSession(payload.token, payload.user);
    } else if (payload?.user) {
      updateStoredUser(payload.user);
    } else if (payload) {
      updateStoredUser(payload);
    }

    appState.user = getUser();
    if (appState.user?.id) {
      publicUsersState.map.set(Number(appState.user.id), appState.user);
    }
    if (window.setupLayoutData) window.setupLayoutData(appState.user);
  }

  async function refreshPresence(forceUsers = false) {
    if (!appState.user?.id || presencePingInFlight) {
      return;
    }

    presencePingInFlight = true;

    try {
      const result = await AuthAPI.touchPresence();
      if (result?.ok && result.data?.user) {
        syncCurrentUser(result.data.user);
        publicUsersState.map.set(Number(result.data.user.id), result.data.user);
      }

      if (forceUsers) {
        await ensurePublicUsersLoaded(true);
      }

      window.dispatchEvent(new CustomEvent('presence:updated'));
    } finally {
      presencePingInFlight = false;
    }
  }

  function startPresenceHeartbeat() {
    if (!appState.user?.id || presencePingTimer) {
      return;
    }

    const pingNow = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      refreshPresence(true);
    };

    pingNow();
    presencePingTimer = window.setInterval(pingNow, PRESENCE_PING_INTERVAL_MS);
    window.addEventListener('focus', pingNow);
    document.addEventListener('visibilitychange', pingNow);
  }

  function buildHash(route, params = {}) {
    const shortHashParam = getShortHashRouteParam(route, params);
    if (shortHashParam) {
      const restParams = { ...params };
      delete restParams[shortHashParam.key];
      const searchParams = new URLSearchParams();
      Object.entries(restParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, value);
        }
      });
      const query = searchParams.toString();
      return `#${route}/${encodeResourceHash(shortHashParam.value)}${query ? `?${query}` : ''}`;
    }

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, value);
      }
    });
    const query = searchParams.toString();
    return `#${route}${query ? `?${query}` : ''}`;
  }

  function parseRoute() {
    const rawHash = window.location.hash.replace(/^#/, '');
    const [rawRoute, queryString = ''] = (rawHash || 'feed').split('?');
    const normalized = (rawRoute || 'feed').replace(/^\/+|\/+$/g, '');
    const [routePart, hashPart = ''] = normalized.split('/');
    const route = ROUTE_ALIASES[routePart] || routePart || 'feed';
    const params = Object.fromEntries(new URLSearchParams(queryString));
    const hashParamKey = getShortHashParamKey(route);
    if (hashParamKey && hashPart && !params[hashParamKey]) {
      const decodedId = decodeResourceHash(hashPart);
      if (decodedId) params[hashParamKey] = String(decodedId);
    }
    return { route, params };
  }

  function getShortHashParamKey(route) {
    if (route === 'profile' || route === 'group' || route === 'live' || route === 'shared-post') return 'id';
    if (route === 'messages') return 'user';
    return '';
  }

  function isPublicSharedPostRoute(route = '') {
    return String(route || '').trim() === 'shared-post';
  }

  function canSharePostPublicly(post) {
    if (!post || String(post.post_type || 'standard') !== 'standard') {
      return false;
    }
    if (Number(post.group_id || 0) > 0) {
      return false;
    }
    return String(post.visibility || '').trim() === 'all';
  }

  function buildPublicPostUrl(postId) {
    const hash = buildHash('shared-post', { id: postId });
    return new URL(`${window.location.pathname}${hash}`, window.location.origin).toString();
  }

  async function copyTextToClipboard(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
      return document.execCommand('copy');
    } finally {
      input.remove();
    }
  }

  async function copyPublicPostLink(postId) {
    await copyTextToClipboard(buildPublicPostUrl(postId));
    showToast('Enlace publico copiado', 'success');
  }

  async function handleSharePublicPostAction(actionTarget) {
    if (!actionTarget || actionTarget.dataset.action !== 'share-public-post') {
      return false;
    }

    const postId = Number(actionTarget.dataset.postId || 0);
    if (!postId) {
      showToast('No se pudo generar el enlace publico', 'error');
      return true;
    }

    try {
      await copyPublicPostLink(postId);
    } catch (error) {
      console.warn('No se pudo copiar el enlace publico de la publicacion:', error);
      showToast('No se pudo copiar el enlace publico', 'error');
    }
    return true;
  }

  function getShortHashRouteParam(route, params = {}) {
    const key = getShortHashParamKey(route);
    if (!key || params[key] === undefined || params[key] === null || params[key] === '') return null;
    return { key, value: params[key] };
  }

  function encodeResourceHash(value) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return encodeURIComponent(String(value || ''));
    const mixed = Math.trunc(id) * 7919 + 104729;
    return mixed.toString(36);
  }

  function decodeResourceHash(hash) {
    const mixed = Number.parseInt(String(hash || ''), 36);
    if (!Number.isFinite(mixed)) return null;
    const id = (mixed - 104729) / 7919;
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function liveHostSessionKey(liveId) {
    return `upt.liveHostRoute.${liveId}`;
  }

  function rememberLiveHostRoute(liveId) {
    if (!Number.isFinite(Number(liveId)) || Number(liveId) <= 0) return;
    try {
      window.sessionStorage.setItem(liveHostSessionKey(Number(liveId)), '1');
    } catch (_error) { }
  }

  function forgetLiveHostRoute(liveId) {
    if (!Number.isFinite(Number(liveId)) || Number(liveId) <= 0) return;
    try {
      window.sessionStorage.removeItem(liveHostSessionKey(Number(liveId)));
    } catch (_error) { }
  }

  function isRememberedLiveHostRoute(liveId) {
    if (!Number.isFinite(Number(liveId)) || Number(liveId) <= 0) return false;
    try {
      return window.sessionStorage.getItem(liveHostSessionKey(Number(liveId))) === '1';
    } catch (_error) {
      return false;
    }
  }

  function setDocumentTitle(title) {
    document.title = title ? `${title} - UPT Connect` : 'UPT Connect';
  }

  const LIVESTREAM_IS_LOCAL_ENGINE = ['localhost', '127.0.0.1'].includes(window.location.hostname || '');
  const LIVESTREAM_PRIMARY_TRANSPORT = LIVESTREAM_IS_LOCAL_ENGINE ? 'tcp' : '';
  const LIVESTREAM_FALLBACK_TRANSPORT = LIVESTREAM_IS_LOCAL_ENGINE ? '' : 'tcp';
  const LIVESTREAM_PUBLISH_TRANSPORT = LIVESTREAM_PRIMARY_TRANSPORT;

  function appendLivestreamTransport(url, transport = '') {
    if (!transport) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}transport=${encodeURIComponent(transport)}`;
  }

  function resolveDefaultLivestreamViewerTransport() {
    return LIVESTREAM_PRIMARY_TRANSPORT;
  }

  function getLivestreamEngineHost() {
    return window.location.hostname || 'localhost';
  }

  function buildLivestreamHlsUrl(streamKey, revision = '') {
    const baseUrl = `${window.location.origin}/ome/app/${encodeURIComponent(streamKey)}/master.m3u8`;
    if (!revision) {
      return baseUrl;
    }
    return `${baseUrl}?v=${encodeURIComponent(revision)}`;
  }

  function buildLivestreamWebRtcUrl(streamKey, _revision = '', transport = LIVESTREAM_PRIMARY_TRANSPORT) {
    const hostname = window.location.hostname;
    const encodedKey = encodeURIComponent(streamKey);
    const playbackPath = `app/${encodedKey}/master`;
    const resolvedTransport = (typeof transport === 'string' && transport.length)
      ? transport
      : resolveDefaultLivestreamViewerTransport();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return appendLivestreamTransport(`ws://${hostname}:3333/${playbackPath}`, resolvedTransport);
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return appendLivestreamTransport(`${protocol}//${window.location.host}/ome-ws/${playbackPath}`, resolvedTransport);
  }

  function buildLivestreamProbeUrl(streamKey, revision = '') {
    const baseUrl = `${window.location.origin}/ome-ready/app/${encodeURIComponent(streamKey)}/master.m3u8`;
    if (!revision) {
      return baseUrl;
    }
    return `${baseUrl}?v=${encodeURIComponent(revision)}`;
  }

  function normalizeLivestreamPlaybackUrl(streamKey, _playbackUrl, revision = '') {
    // Always rebuild from stream_key to ensure the viewer uses the frontend proxy.
    return buildLivestreamWebRtcUrl(streamKey, revision);
  }

  function buildLivestreamPublishUrl(streamKey, transport = LIVESTREAM_PUBLISH_TRANSPORT) {
    return appendLivestreamTransport(`${window.location.origin}/ome/app/${encodeURIComponent(streamKey)}?direction=whip`, transport);
  }

  function buildLivestreamStreamKey(userId) {
    const clientTag = isDesktopClient() ? 'pc' : 'mob';
    return `upt-live-${userId}-${clientTag}-${Date.now().toString(36)}`;
  }

  function getInitialLivestreamAspectRatio(source = 'camera') {
    if (source === 'screen') {
      return '16:9';
    }
    return isDesktopClient() ? '16:9' : '9:16';
  }

  function getLivestreamAspectRatioFromSettings(source = 'camera', settings = {}) {
    if (source === 'screen') {
      return '16:9';
    }

    const width = Number(settings.width || 0);
    const height = Number(settings.height || 0);
    if (width > 0 && height > 0) {
      return width >= height ? '16:9' : '9:16';
    }

    return getInitialLivestreamAspectRatio(source);
  }

  async function navigateToLivestream(router, rawId, extraParams = {}) {
    const liveId = Number(rawId);
    if (!Number.isFinite(liveId) || liveId <= 0) {
      return false;
    }
    const nextParams = { id: String(liveId), ...extraParams };
    if (String(nextParams.host || '') === '1') {
      rememberLiveHostRoute(liveId);
      delete nextParams.host;
    }
    router.navigate('live', nextParams);
    return true;
  }

  function isDesktopClient() {
    // Real device detection: UA + pointer + touch — NOT viewport size
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    const isTouchOnly = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && !hasFinePointer;
    // Desktop = not a mobile UA, has a fine pointer (mouse), and is not touch-only
    if (isMobileUA || (hasCoarsePointer && !hasFinePointer) || isTouchOnly) return false;
    return true;
  }

  function isMobileDevice() {
    return !isDesktopClient();
  }

  function loadExternalScript(src, globalName) {
    if (globalName && window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    const existing = document.querySelector(`script[data-external-src="${src}"]`);
    if (existing) {
      return new Promise((resolve, reject) => {
        if (globalName && window[globalName]) {
          resolve(window[globalName]);
          return;
        }

        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.externalSrc = src;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
  }

  function loadExternalStyle(href) {
    if (document.querySelector(`link[data-external-style="${href}"]`)) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.externalStyle = href;
    document.head.appendChild(link);
  }

  async function ensureLivestreamLibraries() {
    await loadExternalScript('https://cdn.jsdelivr.net/npm/ovenplayer@0.10.14/dist/ovenplayer.js', 'OvenPlayer');
    await loadExternalScript('https://cdn.jsdelivr.net/npm/ovenlivekit@latest/dist/OvenLiveKit.min.js', 'OvenLiveKit');
  }

  function renderLivestreamCard(post, currentUserId, options = {}) {
    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
    const isLive = post.live_status === 'live';
    const canDelete = options.canDelete ?? Number(post.user_id) === Number(currentUserId);
    const badgeTone = isLive ? 'bg-[#ff0b53] text-white' : 'bg-slate-200 text-slate-700';
    const canReport = Number(post.user_id) !== Number(currentUserId);

    return `
      <article class="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm overflow-hidden">
        <div class="flex items-start justify-between gap-3 mb-4">
          <button type="button" class="flex items-center gap-3 text-left" data-action="open-profile" data-user-id="${post.user_id}">
            ${renderAvatar(author, { sizeClass: 'w-11 h-11', textClass: 'text-white font-bold', showOnline: true })}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-sm text-slate-900">${escapeHtml(displayName(author))}</span>
                <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(timeAgo(post.created_at))}</p>
            </div>
          </button>
          ${canDelete ? `
            <button type="button" data-action="delete-post" data-post-id="${post.id}" class="text-slate-400 hover:bg-slate-50 p-1 rounded-full shrink-0">
              <span class="material-symbols-outlined">delete</span>
            </button>
          ` : ''}
        </div>
        <div role="button" tabindex="0" data-action="open-livestream" data-live-id="${post.id}" class="block w-full text-left cursor-pointer">
          <div class="rounded-[28px] overflow-hidden relative min-h-[280px] bg-[radial-gradient(circle_at_top_left,_#6d28d9,_#0f172a_55%,_#020617)]">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,132,0,0.26),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.20),_transparent_26%)]"></div>
            <div class="absolute top-4 left-4 right-4 flex items-center justify-between gap-3 z-10">
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-xs font-black tracking-[0.18em] ${badgeTone}">${isLive ? 'LIVE' : 'FINALIZADO'}</span>
                ${isLive ? `
                  <span class="px-3 py-1 rounded-full bg-black/45 text-white text-xs font-semibold flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">visibility</span>
                    ${Number(post.viewer_count || 0)}
                  </span>
                ` : ''}
              </div>
              <span class="px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold">${escapeHtml(post.live_source === 'screen' ? 'Pantalla' : 'Camara')}</span>
            </div>
            <div class="relative z-10 h-full min-h-[280px] flex flex-col justify-end p-5 text-white">
              <h3 class="text-xl md:text-2xl font-black leading-tight max-w-[80%]">${escapeHtml(post.live_title || 'Directo UPT')}</h3>
              <p class="text-sm text-white/80 mt-2 max-w-[80%]">${escapeHtml((post.content || '').slice(0, 140) || 'Transmision en vivo de la comunidad UPT')}</p>
              <div class="live-feed-card-meta mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
                <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/12 text-xs font-semibold max-w-full">
                  ${renderReactionSummary(post.reactions_count, post.reactions_total, 'Sin reacciones')}
                </span>
                <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/12 text-xs font-semibold max-w-full">
                  <span class="material-symbols-outlined text-[14px]">chat</span>
                  ${Number(post.comments_count || 0)} comentarios
                </span>
                ${canReport ? `
                  <button type="button" data-action="report-post" data-post-id="${post.id}" class="live-feed-card-report inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1.5 bg-white/12 text-white text-[11px] sm:text-xs font-semibold hover:bg-white/18 transition-colors whitespace-nowrap shrink-0 min-h-[34px]">
                    <span class="material-symbols-outlined text-[14px]">flag</span>
                    Reportar
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function getPostMediaInfo(post) {
    const mediaType = String(post?.media_type || '').trim().toLowerCase();
    const videoUrl = String(post?.video_url || '').trim();
    const imageUrl = String(post?.image_url || '').trim();
    const videoPosterUrl = String(post?.video_poster_url || '').trim();

    if (mediaType === 'video' && videoUrl) {
      return {
        type: 'video',
        url: safeUrl(videoUrl),
        mimeType: escapeHtml(post?.video_mime_type || 'video/mp4'),
        posterUrl: videoPosterUrl ? safeUrl(videoPosterUrl) : '',
      };
    }

    if (mediaType === 'image' && imageUrl) {
      return {
        type: 'image',
        url: safeUrl(imageUrl),
      };
    }

    if (videoUrl) {
      return {
        type: 'video',
        url: safeUrl(videoUrl),
        mimeType: escapeHtml(post?.video_mime_type || 'video/mp4'),
        posterUrl: videoPosterUrl ? safeUrl(videoPosterUrl) : '',
      };
    }

    if (imageUrl) {
      return {
        type: 'image',
        url: safeUrl(imageUrl),
      };
    }

    return null;
  }

  function hasPostImage(post) {
    return getPostMediaInfo(post)?.type === 'image';
  }

  function hasPostVideo(post) {
    return getPostMediaInfo(post)?.type === 'video';
  }

  function hasPostMedia(post) {
    return Boolean(getPostMediaInfo(post));
  }

  function formatInlineVideoTime(totalSeconds) {
    const numericSeconds = Number(totalSeconds);
    if (!Number.isFinite(numericSeconds) || numericSeconds < 0) {
      return '0:00';
    }
    const rounded = Math.floor(numericSeconds);
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  let socialVideoBindingsReady = false;
  let activeSocialVideoElement = null;
  let lastSocialVideoPointerAction = 0;
  let socialVideoViewportObserver = null;
  let adaptivePostMediaBindingsReady = false;
  let adaptivePostMediaResizeFrame = 0;
  let adaptiveMediaResizeObserver = null;
  let bitmovinPostPlayerAssetsPromise = null;
  let bitmovinPostPlayerViewportObserver = null;
  const bitmovinPostPlayers = new Map();
  const BITMOVIN_POST_PLAYER_SCRIPT = 'https://cdn.bitmovin.com/player/web/8/bitmovinplayer.js';
  const BITMOVIN_POST_PLAYER_STYLE = 'https://cdn.bitmovin.com/player/web/8/bitmovinplayer-ui.css';
  const BITMOVIN_POST_PLAYER_KEY_STORAGE = 'upt-bitmovin-player-key';
  let bitmovinPostPlayerDisabled = false;

  function getBitmovinPostPlayerLicenseKey() {
    const direct =
      window.__UPT_CONFIG?.bitmovinPlayerKey ||
      window.__UPT_BITMOVIN_PLAYER_KEY ||
      document.documentElement?.dataset?.bitmovinPlayerKey ||
      '';
    if (String(direct || '').trim()) {
      return String(direct).trim();
    }
    try {
      return String(window.localStorage.getItem(BITMOVIN_POST_PLAYER_KEY_STORAGE) || '').trim();
    } catch {
      return '';
    }
  }

  function canUseBitmovinPostPlayer() {
    return !bitmovinPostPlayerDisabled && !isDesktopClient() && !!getBitmovinPostPlayerLicenseKey();
  }

  async function ensureBitmovinPostPlayerAssets() {
    if (!canUseBitmovinPostPlayer()) {
      return null;
    }
    if (!bitmovinPostPlayerAssetsPromise) {
      loadExternalStyle(BITMOVIN_POST_PLAYER_STYLE);
      bitmovinPostPlayerAssetsPromise = loadExternalScript(BITMOVIN_POST_PLAYER_SCRIPT, 'bitmovin')
        .then(() => window.bitmovin || null)
        .catch((error) => {
          console.error('No se pudo cargar Bitmovin Player:', error);
          bitmovinPostPlayerAssetsPromise = null;
          return null;
        });
    }
    return bitmovinPostPlayerAssetsPromise;
  }

  function pauseOtherBitmovinPostPlayers(currentShell = null) {
    bitmovinPostPlayers.forEach((entry, shell) => {
      if (!entry?.player || shell === currentShell) return;
      try {
        entry.player.pause?.();
      } catch { }
    });
  }

  function revealBitmovinPostNativeFallback(shell) {
    if (!(shell instanceof HTMLElement)) return;
    const fallbackVideo = shell.querySelector('[data-bitmovin-post-fallback="true"]');
    const launcher = shell.querySelector('[data-bitmovin-post-launcher="true"]');
    if (!(fallbackVideo instanceof HTMLVideoElement)) return;
    const src = String(fallbackVideo.dataset.src || '').trim();
    if (src && !fallbackVideo.getAttribute('src')) {
      fallbackVideo.src = src;
      fallbackVideo.preload = 'metadata';
      try {
        fallbackVideo.load?.();
      } catch { }
    }
    fallbackVideo.controls = true;
    fallbackVideo.hidden = false;
    shell.classList.add('is-bitmovin-fallback');
    launcher?.remove();
  }

  function restoreBitmovinPostShellToLauncher(shell) {
    if (!(shell instanceof HTMLElement)) return;
    shell.classList.remove('is-bitmovin-active', 'is-bitmovin-fallback');
    shell.dataset.bitmovinReady = '0';
    const launcher = shell.querySelector('[data-bitmovin-post-launcher="true"]');
    if (launcher instanceof HTMLElement) {
      launcher.removeAttribute('aria-hidden');
    }
    const mount = shell.querySelector('[data-bitmovin-post-mount="true"]');
    if (mount instanceof HTMLElement) {
      mount.innerHTML = '';
    }
    const fallbackVideo = shell.querySelector('[data-bitmovin-post-fallback="true"]');
    if (fallbackVideo instanceof HTMLVideoElement) {
      fallbackVideo.pause?.();
      fallbackVideo.hidden = true;
      fallbackVideo.controls = false;
    }
  }

  function destroyBitmovinPostPlayer(shell) {
    const entry = bitmovinPostPlayers.get(shell);
    if (!entry) return;
    try {
      entry.player?.pause?.();
    } catch { }
    try {
      entry.player?.destroy?.();
    } catch { }
    bitmovinPostPlayers.delete(shell);
    shell.classList.remove('is-bitmovin-active');
    shell.dataset.bitmovinReady = '0';
  }

  function ensureBitmovinPostPlayerViewportObserver() {
    if (bitmovinPostPlayerViewportObserver || !('IntersectionObserver' in window)) {
      return bitmovinPostPlayerViewportObserver;
    }
    bitmovinPostPlayerViewportObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const shell = entry.target;
        if (!(shell instanceof HTMLElement)) return;
        const instance = bitmovinPostPlayers.get(shell);
        if (!instance?.player) return;
        if (!entry.isIntersecting) {
          try {
            instance.player.pause?.();
          } catch { }
        }
      });
    }, {
      rootMargin: '0px 0px',
      threshold: 0.22,
    });
    return bitmovinPostPlayerViewportObserver;
  }

  function registerBitmovinPostShell(shell) {
    if (!(shell instanceof HTMLElement) || shell.dataset.bitmovinObserved === '1') return;
    shell.dataset.bitmovinObserved = '1';
    ensureBitmovinPostPlayerViewportObserver()?.observe?.(shell);
  }

  async function ensureBitmovinPostPlayer(shell, { autoplay = false } = {}) {
    if (!(shell instanceof HTMLElement) || shell.dataset.bitmovinInitPending === '1') {
      return bitmovinPostPlayers.get(shell)?.player || null;
    }

    const existing = bitmovinPostPlayers.get(shell)?.player;
    if (existing) {
      if (autoplay) {
        pauseOtherSocialVideos(null);
        pauseOtherBitmovinPostPlayers(shell);
        try {
          await existing.play?.();
        } catch { }
      }
      return existing;
    }

    shell.dataset.bitmovinInitPending = '1';
    const bitmovin = await ensureBitmovinPostPlayerAssets();
    if (!bitmovin?.player?.Player) {
      delete shell.dataset.bitmovinInitPending;
      revealBitmovinPostNativeFallback(shell);
      return null;
    }

    const mount = shell.querySelector('[data-bitmovin-post-mount="true"]');
    const mediaUrl = String(shell.dataset.bitmovinPostUrl || '').trim();
    const mimeType = String(shell.dataset.bitmovinPostMime || 'video/mp4').trim();
    const posterUrl = String(shell.dataset.bitmovinPostPoster || '').trim();
    if (!(mount instanceof HTMLElement) || !mediaUrl) {
      delete shell.dataset.bitmovinInitPending;
      revealBitmovinPostNativeFallback(shell);
      return null;
    }

    try {
      const player = new bitmovin.player.Player(mount, {
        key: getBitmovinPostPlayerLicenseKey(),
        playback: {
          autoplay: false,
          muted: false,
        },
      });
      await player.load({
        poster: posterUrl || undefined,
        progressive: [{
          url: mediaUrl,
          type: mimeType || undefined,
        }],
      });
      try {
        player.setVolume?.(100);
      } catch { }
      try {
        player.setLoop?.(true);
      } catch { }
      bitmovinPostPlayers.set(shell, { player });
      registerBitmovinPostShell(shell);
      shell.classList.add('is-bitmovin-active');
      shell.dataset.bitmovinReady = '1';
      const launcher = shell.querySelector('[data-bitmovin-post-launcher="true"]');
      launcher?.setAttribute('aria-hidden', 'true');
      pauseOtherSocialVideos(null);
      pauseOtherBitmovinPostPlayers(shell);
      if (autoplay) {
        try {
          await player.play?.();
        } catch { }
      }
      return player;
    } catch (error) {
      console.error('No se pudo inicializar Bitmovin Player para la publicacion:', error);
      revealBitmovinPostNativeFallback(shell);
      return null;
    } finally {
      delete shell.dataset.bitmovinInitPending;
    }
  }

  function hasHydratedSocialVideoSource(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    return !!String(video.getAttribute('src') || '').trim() || video.dataset.socialVideoHydrated === '1';
  }

  function isMobileFeedVideoPlaybackMode() {
    return window.innerWidth <= 767 || window.matchMedia?.('(pointer: coarse)')?.matches;
  }

  function dehydrateSocialVideoSource(video, { resetTime = true } = {}) {
    if (!(video instanceof HTMLVideoElement)) return;
    if (document.fullscreenElement === video || document.fullscreenElement === video.closest('[data-social-video-player]')) {
      return;
    }
    try {
      video.pause();
    } catch (_) { }
    if (resetTime) {
      try {
        video.currentTime = 0;
      } catch (_) { }
    }
    video.removeAttribute('src');
    video.preload = 'none';
    delete video.dataset.socialVideoHydrated;
    try {
      video.load?.();
    } catch (_) { }
    syncSocialVideoPosterState(video);
  }

  function shouldKeepHydratedSocialVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!isMobileFeedVideoPlaybackMode()) return false;
    if (video === activeSocialVideoElement) return true;
    if (video.closest('#comment-modal, #group-comment-modal, #profile-comment-modal, #admin-comments-modal')) return true;
    if (video.dataset.socialVideoPlayedOnce === '1') return true;
    if (Number(video.currentTime || 0) > 0.05) return true;
    return false;
  }

  function shouldHydrateSocialVideoOnViewport(video, entry) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (hasHydratedSocialVideoSource(video)) return true;
    if (!isMobileFeedVideoPlaybackMode()) return true;
    if (video === activeSocialVideoElement) return true;
    if (video.closest('#comment-modal, #group-comment-modal, #profile-comment-modal, #admin-comments-modal')) return true;
    const hasPoster = Boolean(String(video.getAttribute('poster') || '').trim());
    if (!hasPoster) {
      return Boolean(entry?.intersectionRatio >= 0.35);
    }
    return false;
  }

  function syncSocialVideoPosterState(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const shell = video.closest('[data-social-video-player]');
    if (!(shell instanceof HTMLElement)) return;
    const hasFrames = Number(video.readyState || 0) >= 2 || Number(video.currentTime || 0) > 0.01;
    shell.classList.toggle('is-media-ready', hasFrames);
  }

  function ensureSocialVideoViewportObserver() {
    if (socialVideoViewportObserver || !('IntersectionObserver' in window)) {
      return socialVideoViewportObserver;
    }

    socialVideoViewportObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target;
        if (!(target instanceof HTMLVideoElement)) return;
        if (entry.isIntersecting) {
          if (shouldHydrateSocialVideoOnViewport(target, entry)) {
            hydrateSocialVideoSource(target, { preload: isMobileFeedVideoPlaybackMode() ? 'metadata' : 'metadata' });
          }
          return;
        }
        if (!target.paused) {
          target.pause();
        }
        if (activeSocialVideoElement === target) {
          activeSocialVideoElement = null;
        }
        if (isMobileFeedVideoPlaybackMode() && !shouldKeepHydratedSocialVideo(target)) {
          dehydrateSocialVideoSource(target);
        } else if (isMobileFeedVideoPlaybackMode()) {
          target.preload = 'metadata';
        }
      });
    }, {
      rootMargin: isMobileFeedVideoPlaybackMode() ? '0px 0px' : '90px 0px',
      threshold: isMobileFeedVideoPlaybackMode() ? 0.32 : 0.08,
    });

    return socialVideoViewportObserver;
  }

  function registerSocialVideoElement(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    video.disablePictureInPicture = true;
    video.setAttribute('disableremoteplayback', '');
    if (!video.dataset.socialVideoElementObserved) {
      video.dataset.socialVideoElementObserved = '1';
      ensureSocialVideoViewportObserver()?.observe?.(video);
    }
    syncSocialVideoPosterState(video);
  }

  function hydrateSocialVideoSource(video, { preload = 'metadata' } = {}) {
    if (!(video instanceof HTMLVideoElement)) {
      return Promise.resolve(false);
    }
    if (hasHydratedSocialVideoSource(video)) {
      if (preload === 'auto' && video.preload !== 'auto') {
        video.preload = 'auto';
      }
      return Promise.resolve(true);
    }

    const sourceUrl = String(video.dataset.socialVideoSrc || '').trim();
    if (!sourceUrl) {
      return Promise.resolve(false);
    }

    video.dataset.socialVideoHydrated = '1';
    video.preload = preload;
    video.src = sourceUrl;
    video.load?.();

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        syncSocialVideoPosterState(video);
        resolve(true);
      };

      video.addEventListener('loadedmetadata', finish, { once: true });
      video.addEventListener('loadeddata', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
      window.setTimeout(finish, 1200);
    });
  }

  function syncSocialVideoPlayerUi(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const shell = video.closest('[data-social-video-player]');
    if (!shell) return;
    const toggleIcon = shell.querySelector('[data-social-video-toggle-icon]');
    const volumeIcon = shell.querySelector('[data-social-video-volume-icon]');
    const remainingLabel = shell.querySelector('[data-social-video-remaining]');
    const seek = shell.querySelector('[data-social-video-seek]');
    const volume = shell.querySelector('[data-social-video-volume]');
    const fullscreenIcon = shell.querySelector('[data-social-video-fullscreen-icon]');

    shell.classList.toggle('is-playing', !video.paused && !video.ended);
    shell.classList.toggle('is-muted', !!video.muted || Number(video.volume || 0) <= 0.001);
    syncSocialVideoPosterState(video);

    if (toggleIcon) {
      toggleIcon.textContent = video.paused || video.ended ? 'play_arrow' : 'pause';
    }
    if (volumeIcon) {
      const effectiveVolume = video.muted ? 0 : Number(video.volume || 0);
      volumeIcon.textContent = effectiveVolume <= 0.001
        ? 'volume_off'
        : (effectiveVolume < 0.5 ? 'volume_down' : 'volume_up');
    }
    if (remainingLabel) {
      const duration = Number(video.duration || 0);
      const current = Number(video.currentTime || 0);
      remainingLabel.textContent = `${formatInlineVideoTime(current)} / ${formatInlineVideoTime(duration)}`;
    }
    if (seek) {
      const duration = Number(video.duration || 0);
      seek.max = duration > 0 ? String(duration) : '0';
      if (!seek.matches(':active') && seek.dataset.seeking !== 'true') {
        seek.value = String(Math.min(duration > 0 ? duration : 0, Number(video.currentTime || 0)));
      }
    }
    if (volume instanceof HTMLInputElement && !volume.matches(':active')) {
      volume.value = String(Math.max(0, Math.min(1, video.muted ? 0 : Number(video.volume || 0))));
    }
    if (fullscreenIcon) {
      const fullscreenElement = document.fullscreenElement;
      const isFullscreenActive = fullscreenElement === shell || fullscreenElement === video;
      fullscreenIcon.textContent = isFullscreenActive ? 'fullscreen_exit' : 'fullscreen';
    }
  }

  function shouldSkipSocialVideoUiSync(video, eventName = '') {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (eventName !== 'timeupdate') return false;
    if (!isMobileFeedVideoPlaybackMode()) return false;
    const shell = video.closest('[data-social-video-player]');
    const context = String(shell?.dataset?.adaptiveMediaContext || 'card');
    const now = Date.now();
    const last = Number(video.dataset.socialVideoLastUiSyncAt || 0);
    const minDelta = context === 'card' ? 240 : 120;
    if (last && now - last < minDelta) {
      return true;
    }
    video.dataset.socialVideoLastUiSyncAt = String(now);
    return false;
  }

  function closeOpenSocialVideoVolumePopovers(exceptShell = null) {
    document.querySelectorAll('.social-video-player__volume-shell.is-volume-open').forEach((shell) => {
      if (!(shell instanceof HTMLElement)) return;
      if (exceptShell && shell === exceptShell) return;
      shell.classList.remove('is-volume-open');
    });
  }

  function pauseOtherSocialVideos(currentVideo) {
    document.querySelectorAll('video[data-social-video-element="true"]').forEach((candidate) => {
      if (!(candidate instanceof HTMLVideoElement)) return;
      if (candidate === currentVideo) return;
      if (!candidate.paused) {
        candidate.pause();
      }
      if (isMobileFeedVideoPlaybackMode() && !shouldKeepHydratedSocialVideo(candidate)) {
        dehydrateSocialVideoSource(candidate);
      } else if (isMobileFeedVideoPlaybackMode()) {
        candidate.preload = 'metadata';
      }
    });
    activeSocialVideoElement = currentVideo;
  }

  async function toggleSocialVideoPlayback(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    if (video.paused || video.ended) {
      const needHydrate = !hasHydratedSocialVideoSource(video);
      if (needHydrate) {
        hydrateSocialVideoSource(video, { preload: 'auto' });
      }
      if (video.ended) {
        try {
          video.currentTime = 0;
        } catch { }
      }
      pauseOtherSocialVideos(video);
      video.play().catch(() => syncSocialVideoPlayerUi(video));
    } else {
      video.pause();
    }
    syncSocialVideoPlayerUi(video);
  }

  function waitForSocialVideoMetadata(video) {
    if (!(video instanceof HTMLVideoElement)) {
      return Promise.resolve();
    }
    if (Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 1) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('loadedmetadata', finish);
        video.removeEventListener('loadeddata', finish);
        video.removeEventListener('durationchange', finish);
        resolve();
      };
      video.addEventListener('loadedmetadata', finish, { once: true });
      video.addEventListener('loadeddata', finish, { once: true });
      video.addEventListener('durationchange', finish, { once: true });
      window.setTimeout(finish, 900);
    });
  }

  async function seekSocialVideoTo(video, nextTime) {
    if (!(video instanceof HTMLVideoElement) || !Number.isFinite(nextTime)) {
      return;
    }
    await hydrateSocialVideoSource(video, { preload: 'auto' });
    await waitForSocialVideoMetadata(video);
    const duration = Number(video.duration || 0);
    const boundedTime = duration > 0
      ? Math.max(0, Math.min(duration, nextTime))
      : Math.max(0, nextTime);
    try {
      video.currentTime = boundedTime;
    } catch {
      video.addEventListener('loadedmetadata', () => {
        try {
          video.currentTime = boundedTime;
        } catch { }
      }, { once: true });
    }
    syncSocialVideoPlayerUi(video);
  }

  function resolveSocialVideoContext(control) {
    const shell = control?.closest?.('[data-social-video-player]');
    const video = shell?.querySelector?.('video[data-social-video-element="true"]');
    if (!(shell instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
      return { shell: null, video: null };
    }
    return { shell, video };
  }

  function ensureSocialVideoBindings() {
    if (socialVideoBindingsReady) return;
    socialVideoBindingsReady = true;

    document.addEventListener('play', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLVideoElement) || target.dataset.socialVideoElement !== 'true') return;
      target.dataset.socialVideoPlayedOnce = '1';
      pauseOtherSocialVideos(target);
      target.preload = 'auto';
      syncSocialVideoPlayerUi(target);
    }, true);

    ['pause', 'volumechange', 'loadedmetadata', 'loadeddata', 'durationchange', 'timeupdate', 'ended'].forEach((eventName) => {
      document.addEventListener(eventName, (event) => {
        const target = event.target;
        if (!(target instanceof HTMLVideoElement) || target.dataset.socialVideoElement !== 'true') return;
        if (shouldSkipSocialVideoUiSync(target, eventName)) return;
        if (eventName === 'ended' && activeSocialVideoElement === target && !target.loop) {
          activeSocialVideoElement = null;
        }
        if (eventName === 'pause' && isMobileFeedVideoPlaybackMode()) {
          target.preload = 'metadata';
        }
        syncSocialVideoPlayerUi(target);
      }, true);
    });

    document.addEventListener('fullscreenchange', () => {
      document.querySelectorAll('video[data-social-video-element="true"]').forEach((target) => {
        if (!(target instanceof HTMLVideoElement)) return;
        syncSocialVideoPlayerUi(target);
      });
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        closeOpenSocialVideoVolumePopovers();
        return;
      }
      if (target.closest('.social-video-player__volume-shell')) {
        return;
      }
      closeOpenSocialVideoVolumePopovers();
    }, true);

    window.__uptSocialVideoSurfaceClick = (surface, event) => {
      if (event?.target?.closest?.('[data-social-video-controls]')) return;
      const { video } = resolveSocialVideoContext(surface);
      if (!video) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      toggleSocialVideoPlayback(video);
    };

    window.__uptSocialVideoToggleClick = (button, event) => {
      const { video } = resolveSocialVideoContext(button);
      if (!video) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      toggleSocialVideoPlayback(video);
    };

    window.__uptSocialVideoVolumeToggleClick = (button, event) => {
      const { shell, video } = resolveSocialVideoContext(button);
      if (!shell || !video) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      closeOpenSocialVideoVolumePopovers(button.closest('.social-video-player__volume-shell'));
      const volumeShell = button.closest('.social-video-player__volume-shell');
      if (!(volumeShell instanceof HTMLElement)) return;
      volumeShell.classList.toggle('is-volume-open');
    };

    window.__uptSocialVideoSeekInput = async (input, event) => {
      const { video } = resolveSocialVideoContext(input);
      if (!(input instanceof HTMLInputElement) || !video) return;
      event?.stopPropagation?.();
      const nextTime = Number(input.value);
      if (!Number.isFinite(nextTime)) return;
      input.dataset.seeking = 'true';
      await seekSocialVideoTo(video, nextTime);
      window.setTimeout(() => {
        if (input instanceof HTMLElement) {
          delete input.dataset.seeking;
        }
      }, 120);
    };

    window.__uptSocialVideoVolumeInput = (input, event) => {
      const { shell, video } = resolveSocialVideoContext(input);
      if (!(input instanceof HTMLInputElement) || !shell || !video) return;
      event?.stopPropagation?.();
      const nextVolume = Number(input.value);
      if (!Number.isFinite(nextVolume)) return;
      video.volume = Math.max(0, Math.min(1, nextVolume));
      video.muted = video.volume <= 0.001;
      if (video.volume > 0.001) {
        shell.dataset.previousVolume = String(video.volume);
      }
      syncSocialVideoPlayerUi(video);
    };

    window.__uptSocialVideoFullscreenClick = (button, event) => {
      const { shell, video } = resolveSocialVideoContext(button);
      if (!shell || !video) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      hydrateSocialVideoSource(video, { preload: 'auto' });

      // Exit fullscreen if already active
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      if (fullscreenElement === shell || fullscreenElement === video) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => { });
        return;
      }

      // Detect if inside a modal — if so, fullscreen the VIDEO directly.
      // This bypasses the shell's high-specificity modal CSS overrides
      // (overflow:hidden, border-radius, max-height) that survive :fullscreen.
      const isInModal = Boolean(shell.closest(
        '#comment-modal, #group-comment-modal, #profile-comment-modal, #admin-comments-modal'
      ));

      const target = isInModal ? video : (shell.requestFullscreen ? shell : video);
      const requestFs = (target.requestFullscreen || target.webkitRequestFullscreen)?.bind(target);

      requestFs?.()?.catch?.(() => {
        // Final fallback: try the other element
        const other = target === video ? shell : video;
        (other.requestFullscreen || other.webkitRequestFullscreen)?.call(other)?.catch?.(() => { });
      });
    };

    window.__uptSocialVideoPrime = (element) => {
      const { video } = resolveSocialVideoContext(element);
      if (!video) return;
      if (isMobileFeedVideoPlaybackMode()) return;
      hydrateSocialVideoSource(video, { preload: 'metadata' });
    };

    window.__uptBitmovinPostLauncherClick = async (button, event) => {
      const shell = button?.closest?.('[data-bitmovin-post-shell="true"]');
      if (!(shell instanceof HTMLElement)) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const player = await ensureBitmovinPostPlayer(shell, { autoplay: true });
      if (!player) {
        const fallbackVideo = shell.querySelector('[data-bitmovin-post-fallback="true"]');
        if (fallbackVideo instanceof HTMLVideoElement) {
          pauseOtherSocialVideos(fallbackVideo);
          try {
            await fallbackVideo.play?.();
          } catch { }
        }
      }
    };

    window.__uptPauseOtherBitmovinPosts = (currentVideo) => {
      pauseOtherSocialVideos(currentVideo instanceof HTMLVideoElement ? currentVideo : null);
      pauseOtherBitmovinPostPlayers(currentVideo?.closest?.('[data-bitmovin-post-shell="true"]') || null);
    };
  }

  function resolveAdaptiveMediaRatio(element) {
    if (element instanceof HTMLImageElement) {
      const width = Number(element.naturalWidth || 0);
      const height = Number(element.naturalHeight || 0);
      if (width > 0 && height > 0) {
        return width / height;
      }
      return 0;
    }
    if (element instanceof HTMLVideoElement) {
      const width = Number(element.videoWidth || 0);
      const height = Number(element.videoHeight || 0);
      if (width > 0 && height > 0) {
        return width / height;
      }
      return 0;
    }
    return 0;
  }

  function computeAdaptiveMediaHeight(frame, ratio) {
    const width = Number(frame?.clientWidth || frame?.getBoundingClientRect?.().width || 0);
    const viewportWidth = Number(window.innerWidth || 1280);
    const viewportHeight = Number(window.innerHeight || 900);
    const context = String(frame?.dataset?.adaptiveMediaContext || 'card');
    const isMobile = viewportWidth < 768;

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
      return null;
    }

    let minHeight = isMobile ? 180 : 220;
    let maxHeight = Math.min(680, Math.max(280, viewportHeight * (isMobile ? 0.58 : 0.8)));

    if (context === 'card') {
      minHeight = 0;
    } else if (context === 'shared') {
      minHeight = 0;
      maxHeight = Math.min(720, Math.max(320, viewportHeight * (isMobile ? 0.62 : 0.82)));
    } else if (context === 'modal') {
      minHeight = 0;
      maxHeight = Math.min(760, Math.max(360, viewportHeight * 0.82));
    } else if (context === 'grid') {
      minHeight = 170;
      maxHeight = Math.min(420, Math.max(220, viewportHeight * 0.42));
    }

    let nextHeight = width / ratio;

    if (ratio < 0.72) {
      nextHeight = Math.min(nextHeight, maxHeight);
    }
    if (ratio > 2.1) {
      minHeight = Math.min(minHeight, isMobile ? 165 : 185);
    }

    nextHeight = Math.max(minHeight, Math.min(maxHeight, nextHeight));

    return {
      height: Math.round(nextHeight),
      maxHeight: Math.round(maxHeight),
    };
  }

  function updateAdaptiveMediaFrame(frame) {
    if (!(frame instanceof HTMLElement)) {
      return;
    }
    const context = String(frame.dataset.adaptiveMediaContext || 'card');
    const imageAsset = frame.querySelector('img.post-adaptive-media__asset');
    if (context === 'modal' && imageAsset instanceof HTMLImageElement) {
      frame.style.height = 'auto';
      frame.style.maxHeight = 'none';
      frame.classList.remove('is-pending');
      frame.classList.add('is-ready');
      return;
    }
    const ratio = Number(frame.dataset.mediaRatio || 0);
    const sizing = computeAdaptiveMediaHeight(frame, ratio);
    if (!sizing) {
      return;
    }

    frame.style.height = `${sizing.height}px`;
    frame.style.maxHeight = `${sizing.maxHeight}px`;
    frame.classList.remove('is-pending');
    frame.classList.add('is-ready');

    if (adaptiveMediaResizeObserver) {
      adaptiveMediaResizeObserver.observe(frame);
    }
  }

  function bindAdaptiveMediaElement(element) {
    const frame = element?.closest?.('[data-adaptive-media-frame="true"]');
    if (!(frame instanceof HTMLElement)) {
      return;
    }

    const sync = () => {
      const ratio = resolveAdaptiveMediaRatio(element);
      if (!Number.isFinite(ratio) || ratio <= 0) {
        return;
      }
      frame.dataset.mediaRatio = String(ratio);
      updateAdaptiveMediaFrame(frame);
    };

    if (element instanceof HTMLImageElement) {
      if (element.complete && Number(element.naturalWidth || 0) > 0) {
        sync();
        return;
      }
      element.addEventListener('load', sync, { once: true });
      return;
    }

    if (element instanceof HTMLVideoElement) {
      registerSocialVideoElement(element);
      if (Number(element.videoWidth || 0) > 0 && Number(element.videoHeight || 0) > 0) {
        sync();
        return;
      }
      element.addEventListener('loadedmetadata', sync, { once: true });
      element.addEventListener('loadeddata', sync, { once: true });
    }
  }

  function refreshAdaptiveMediaFrames() {
    document.querySelectorAll('[data-adaptive-media-frame="true"]').forEach((frame) => {
      if (!(frame instanceof HTMLElement)) {
        return;
      }
      if (!Number.isFinite(Number(frame.dataset.mediaRatio || 0)) || Number(frame.dataset.mediaRatio || 0) <= 0) {
        const element = frame.querySelector('img, video');
        if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
          bindAdaptiveMediaElement(element);
        }
      }
      updateAdaptiveMediaFrame(frame);
    });
  }

  function ensureAdaptivePostMediaBindings() {
    if (adaptivePostMediaBindingsReady) {
      return;
    }
    adaptivePostMediaBindingsReady = true;

    window.__uptAdaptiveMediaLoad = (element) => {
      bindAdaptiveMediaElement(element);
    };

    window.addEventListener('resize', () => {
      if (adaptivePostMediaResizeFrame) {
        window.cancelAnimationFrame(adaptivePostMediaResizeFrame);
      }
      adaptivePostMediaResizeFrame = window.requestAnimationFrame(() => {
        adaptivePostMediaResizeFrame = 0;
        refreshAdaptiveMediaFrames();
      });
    });

    if (typeof ResizeObserver === 'function' && !adaptiveMediaResizeObserver) {
      adaptiveMediaResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const frame = entry.target;
          if (!(frame instanceof HTMLElement)) return;
          const ratio = Number(frame.dataset.mediaRatio || 0);
          if (!Number.isFinite(ratio) || ratio <= 0) return;
          const sizing = computeAdaptiveMediaHeight(frame, ratio);
          if (!sizing) return;
          frame.style.height = `${sizing.height}px`;
          frame.style.maxHeight = `${sizing.maxHeight}px`;
        });
      });
    }
  }

  function renderInlineSocialVideoNative(media, options = {}) {
    const heightClass = options.heightClass || '';
    const roundedClass = options.roundedClass || 'rounded-2xl';
    const shellClass = options.shellClass || '';
    const aspectStyle = options.aspectStyle ? ` style="${options.aspectStyle}"` : '';
    const tagLabel = options.tagLabel ? `<span class="social-video-player__tag">${escapeHtml(options.tagLabel)}</span>` : '';
    const adaptiveFrameClass = options.adaptiveFrameClass || '';
    const adaptiveContext = escapeHtml(options.adaptiveContext || 'card');
    const posterAttr = media.posterUrl ? ` poster="${media.posterUrl}"` : '';
    const preloadMode = media.posterUrl ? 'none' : 'metadata';
    const eagerSrcAttr = media.posterUrl ? '' : ` src="${media.url}"`;
    const lazySrcAttr = media.posterUrl ? ` data-social-video-src="${media.url}"` : '';
    const inlinePoster = media.posterUrl
      ? `<img class="social-video-player__poster" src="${media.posterUrl}" alt="" loading="lazy" decoding="async" aria-hidden="true" onload="window.__uptAdaptiveMediaLoad?.(this)"/>`
      : '';

    return `
      <div class="social-video-player post-adaptive-media post-adaptive-media--video is-pending ${roundedClass} ${heightClass} ${shellClass} ${adaptiveFrameClass}" data-social-video-player="true" data-post-card-ignore="true" data-adaptive-media-frame="true" data-adaptive-media-context="${adaptiveContext}"${aspectStyle}>
        <div class="social-video-player__surface" data-social-video-surface="true" onclick="window.__uptSocialVideoSurfaceClick?.(this, event)" onmouseenter="window.__uptSocialVideoPrime?.(this)">
          ${inlinePoster}
          <video
            class="social-video-player__video"
            ${eagerSrcAttr}
            playsinline
            loop
            preload="${preloadMode}"
            ${posterAttr}
            ${lazySrcAttr}
            data-social-video-element="true"
            onloadedmetadata="window.__uptAdaptiveMediaLoad?.(this)"
            onloadeddata="window.__uptAdaptiveMediaLoad?.(this)"
            onerror="this.closest('[data-social-video-player]').style.display='none'"></video>
          <div class="social-video-player__top">
            ${tagLabel}
          </div>
          <div class="social-video-player__controls" data-social-video-controls="true">
            <div class="social-video-player__timeline">
              <input type="range" min="0" max="0" value="0" step="0.1" class="social-video-player__seek" data-social-video-seek="true" aria-label="Progreso del video" oninput="window.__uptSocialVideoSeekInput?.(this, event)"/>
            </div>
            <div class="social-video-player__control-row">
              <button type="button" class="social-video-player__icon-btn" data-social-video-toggle="true" aria-label="Reproducir o pausar" onclick="window.__uptSocialVideoToggleClick?.(this, event)">
                <span class="material-symbols-outlined" data-social-video-toggle-icon="true">play_arrow</span>
              </button>
              <div class="social-video-player__time">
                <span data-social-video-remaining="true">0:00 / 0:00</span>
              </div>
              <div class="social-video-player__control-spacer"></div>
              <div class="social-video-player__audio">
                <div class="social-video-player__volume-shell">
                  <div class="social-video-player__volume-popover">
                    <input type="range" min="0" max="1" value="1" step="0.05" class="social-video-player__volume" data-social-video-volume="true" aria-label="Volumen del video" oninput="window.__uptSocialVideoVolumeInput?.(this, event)"/>
                  </div>
                  <button type="button" class="social-video-player__icon-btn" data-social-video-volume-toggle="true" aria-label="Mostrar control de volumen" onclick="window.__uptSocialVideoVolumeToggleClick?.(this, event)">
                    <span class="material-symbols-outlined" data-social-video-volume-icon="true">volume_up</span>
                  </button>
                </div>
              </div>
              <button type="button" class="social-video-player__icon-btn" data-social-video-fullscreen="true" aria-label="Pantalla completa" onclick="window.__uptSocialVideoFullscreenClick?.(this, event)">
                <span class="material-symbols-outlined" data-social-video-fullscreen-icon="true">fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderBitmovinInlineSocialVideo(media, options = {}) {
    const heightClass = options.heightClass || '';
    const roundedClass = options.roundedClass || 'rounded-2xl';
    const shellClass = options.shellClass || '';
    const aspectStyle = options.aspectStyle ? ` style="${options.aspectStyle}"` : '';
    const tagLabel = options.tagLabel ? `<span class="social-video-player__tag">${escapeHtml(options.tagLabel)}</span>` : '';
    const adaptiveFrameClass = options.adaptiveFrameClass || '';
    const adaptiveContext = escapeHtml(options.adaptiveContext || 'card');
    const posterAttr = media.posterUrl ? ` poster="${media.posterUrl}"` : '';
    const fallbackPoster = media.posterUrl
      ? `<img class="social-video-player__poster" src="${media.posterUrl}" alt="" loading="lazy" decoding="async" aria-hidden="true" onload="window.__uptAdaptiveMediaLoad?.(this)"/>`
      : '';

    return `
      <div
        class="social-video-player bitmovin-post-video post-adaptive-media post-adaptive-media--video is-pending ${roundedClass} ${heightClass} ${shellClass} ${adaptiveFrameClass}"
        data-bitmovin-post-shell="true"
        data-post-card-ignore="true"
        data-adaptive-media-frame="true"
        data-adaptive-media-context="${adaptiveContext}"
        data-bitmovin-post-url="${media.url}"
        data-bitmovin-post-mime="${media.mimeType || 'video/mp4'}"
        data-bitmovin-post-poster="${media.posterUrl || ''}"${aspectStyle}>
        <div class="social-video-player__surface bitmovin-post-video__surface">
          ${fallbackPoster}
          <div class="bitmovin-post-video__mount" data-bitmovin-post-mount="true"></div>
          <video
            class="bitmovin-post-video__fallback"
            hidden
            playsinline
            loop
            preload="none"
            ${posterAttr}
            data-bitmovin-post-fallback="true"
            data-src="${media.url}"
            onloadedmetadata="window.__uptAdaptiveMediaLoad?.(this)"
            onloadeddata="window.__uptAdaptiveMediaLoad?.(this)"
            onplay="window.__uptPauseOtherBitmovinPosts?.(this)"
            onerror="this.closest('[data-bitmovin-post-shell]').style.display='none'"></video>
          <div class="social-video-player__top">
            ${tagLabel}
          </div>
          <button
            type="button"
            class="bitmovin-post-video__launcher"
            data-bitmovin-post-launcher="true"
            aria-label="Reproducir video"
            onclick="window.__uptBitmovinPostLauncherClick?.(this, event)">
            <span class="material-symbols-outlined">play_arrow</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderInlineSocialVideo(media, options = {}) {
    if (canUseBitmovinPostPlayer()) {
      return renderBitmovinInlineSocialVideo(media, options);
    }
    return renderInlineSocialVideoNative(media, options);
  }

  function renderPostMediaBlock(post, options = {}) {
    const media = getPostMediaInfo(post);
    if (!media) return '';

    const adaptiveContext = options.adaptiveContext || 'card';
    const isCard = adaptiveContext === 'card';

    if (isCard) {
      // Card context: media with lateral padding + rounded corners (like ejemplos.html)
      if (media.type === 'image') {
        return `
          <div class="px-3 pt-3">
            <div class="post-adaptive-media post-adaptive-media--image is-pending rounded-xl" data-post-card-ignore="true" data-adaptive-media-frame="true" data-adaptive-media-context="${escapeHtml(adaptiveContext)}">
              <img alt="Imagen de la publicacion" class="post-adaptive-media__asset" src="${media.url}" loading="lazy" decoding="async" fetchpriority="low" onload="window.__uptAdaptiveMediaLoad?.(this)" onerror="this.closest('.px-3').style.display='none'"/>
            </div>
          </div>
        `;
      }
      return `<div class="px-3 pt-3">${renderInlineSocialVideo(media, {
        roundedClass: 'rounded-xl',
        shellClass: '',
        adaptiveContext,
      })}</div>`;
    }

    // Non-card context (modal, shared, etc.)
    if (media.type === 'image') {
      return `
        <div class="post-adaptive-media post-adaptive-media--image is-pending rounded-xl mb-3" data-post-card-ignore="true" data-adaptive-media-frame="true" data-adaptive-media-context="${escapeHtml(adaptiveContext)}">
          <img alt="Imagen de la publicacion" class="post-adaptive-media__asset" src="${media.url}" loading="lazy" decoding="async" fetchpriority="low" onload="window.__uptAdaptiveMediaLoad?.(this)" onerror="this.parentElement.style.display='none'"/>
        </div>
      `;
    }

    return renderInlineSocialVideo(media, {
      roundedClass: 'rounded-xl',
      shellClass: 'mb-3',
      adaptiveContext,
    });
  }

  function renderPublicShareActionButton(post, options = {}) {
    if (!canSharePostPublicly(post)) {
      return '';
    }

    const variant = options.variant || 'card';
    if (variant === 'modal') {
      return `
        <button type="button" class="post-modal-preview-action-btn" data-action="share-public-post" data-post-id="${post.id}">
          <span class="material-symbols-outlined text-[18px]">share</span>
          <span>Compartir</span>
        </button>
      `;
    }

    return `
      <button type="button" data-action="share-public-post" data-post-id="${post.id}" class="social-post-action">
        <span class="material-symbols-outlined text-[18px]">share</span>
        <span>Compartir</span>
      </button>
    `;
  }

  function renderSharedReadonlyPost(post) {
    if (!post) {
      return `
        <div class="guest-shared-loading-card">
          No se pudo cargar la publicacion compartida.
        </div>
      `;
    }

    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
    const authorCareer = careerLabel(author) || 'Comunidad UPT';
    const authorHandle = buildGuestProfileHandle(author);
    const visibilityMeta = getVisibilityMeta(post.visibility);
    const publishedDate = post?.created_at
      ? new Date(post.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Ahora';
    const commentsCount = Number(post.comments_count || 0);
    const repliesLabel = commentsCount === 1 ? 'Leer 1 respuesta' : `Leer ${commentsCount} respuestas`;
    const reactionsTotal = Number(post.reactions_total || 0);

    return `
      <article class="guest-shared-post" data-shared-readonly-post="true">
        <div class="guest-shared-post__head">
          <button type="button" class="guest-shared-post__author text-left min-w-0" data-guest-login-required="true">
            ${renderAvatar(author, { sizeClass: 'w-12 h-12', textClass: 'text-white font-bold text-sm', showOnline: true })}
            <div class="guest-shared-post__author-copy">
              <div class="guest-shared-post__author-main">
                <span class="guest-shared-post__name">${escapeHtml(displayName(author))}</span>
                <span class="guest-shared-post__faculty" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
              </div>
              <div class="guest-shared-post__handle-row">
                <span>${escapeHtml(authorHandle)}</span>
                <span>·</span>
                <span>${escapeHtml(authorCareer)}</span>
                <span>·</span>
                <span class="inline-flex items-center gap-1">
                  <span class="material-symbols-outlined text-[13px]">${visibilityMeta.icon}</span>
                  ${escapeHtml(visibilityMeta.label)}
                </span>
              </div>
            </div>
          </button>
        </div>
        ${post.content ? `<div class="guest-shared-post__copy"><p class="content-break content-rich">${renderTextWithMentions(post.content || '')}</p></div>` : ''}
        ${renderPostMediaBlock(post, { adaptiveContext: 'shared' })}
        <div class="guest-shared-post__meta">
          <span>${escapeHtml(publishedDate)}</span>
          <span>·</span>
          <span>${reactionsTotal > 0 ? `${reactionsTotal} reacciones` : 'Sin reacciones aun'}</span>
        </div>
        <div class="guest-shared-post__divider"></div>
        <div class="space-y-3 text-slate-500">
          <div class="guest-shared-post__stats">
            ${renderReactionSummary(post.reactions_count, post.reactions_total)}
            <button type="button" data-guest-login-required="true" class="text-sm font-medium hover:text-slate-700 transition-colors">
              ${commentsCount} comentarios
            </button>
          </div>
          <div class="social-post-actions social-post-actions--four guest-shared-post__actions">
            <button type="button" class="social-reaction-trigger" data-guest-login-required="true" aria-label="Reaccionar">
              <span class="material-symbols-outlined social-reaction-trigger__thumb-icon">thumb_up</span>
              <span>Reaccionar</span>
            </button>
            <button type="button" class="social-post-action" data-guest-login-required="true" aria-label="Comentar">
              <span class="material-symbols-outlined text-[18px]">chat_bubble_outline</span>
              <span>Comentar</span>
            </button>
            <button type="button" class="social-post-action social-post-action--report" data-guest-login-required="true" aria-label="Reportar">
              <span class="material-symbols-outlined text-[18px]">flag</span>
              <span>Reportar</span>
            </button>
            <button type="button" class="social-post-action" data-guest-login-required="true" aria-label="Compartir">
              <span class="material-symbols-outlined text-[18px]">share</span>
              <span>Compartir</span>
            </button>
          </div>
          <button type="button" class="guest-shared-post__replies" data-guest-login-required="true">
            <span class="material-symbols-outlined text-[20px]">chat_bubble</span>
            <span>${escapeHtml(repliesLabel)}</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderSharedRelevantAuthor(post) {
    if (!post) {
      return `
        <div class="guest-shared-loading-card guest-shared-loading-card--compact">
          No se pudo cargar la persona relevante.
        </div>
      `;
    }

    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
    const handle = buildGuestProfileHandle(author);
    const career = careerLabel(author) || 'Comunidad UPT';

    return `
      <div class="guest-shared-relevant">
        <div>
          <p class="guest-shared-relevant__eyebrow">Persona relevante</p>
          <h2 class="guest-shared-relevant__title">Autor del post</h2>
        </div>
        <div class="guest-shared-relevant__card">
          ${renderAvatar(author, { sizeClass: 'w-14 h-14', textClass: 'text-white font-bold text-base', showOnline: true })}
          <div class="min-w-0">
            <div class="guest-shared-relevant__name">${escapeHtml(displayName(author))}</div>
            <div class="guest-shared-relevant__handle">${escapeHtml(handle)}</div>
            <div class="guest-shared-relevant__meta">
              <span class="guest-shared-relevant__pill">${escapeHtml(career)}</span>
              <span class="guest-shared-relevant__pill" style="color:#fff;background:${userColor(author)};border-color:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPostModalMedia(post, options = {}) {
    const media = getPostMediaInfo(post);
    if (!media) return '';

    const imageAlt = options.imageAlt || 'Imagen de la publicacion';
    if (media.type === 'image') {
      return `
        <div class="post-modal-preview-media">
          <button type="button" class="post-modal-preview-media-button post-adaptive-media post-adaptive-media--image is-pending" data-action="open-post-image" data-image-url="${media.url}" data-image-alt="${escapeHtml(imageAlt)}" data-adaptive-media-frame="true" data-adaptive-media-context="modal">
            <img src="${media.url}" alt="${escapeHtml(imageAlt)}" class="post-adaptive-media__asset" decoding="async" onload="window.__uptAdaptiveMediaLoad?.(this)" onerror="this.closest('.post-modal-preview-media').style.display='none'"/>
          </button>
        </div>
      `;
    }

    return `<div class="post-modal-preview-media">${renderInlineSocialVideo(media, {
      roundedClass: 'rounded-[1.35rem]',
      adaptiveContext: 'modal',
    })}</div>`;
  }

  function renderPostCard(post, currentUserId, options = {}) {
    if ((post.post_type || 'standard') === 'livestream') {
      return renderLivestreamCard(post, currentUserId, options);
    }
    const canDelete = options.canDelete ?? Number(post.user_id) === Number(currentUserId);
    const interactive = options.interactive !== false;
    const clickable = options.clickable !== false;
    const canSharePublic = canSharePostPublicly(post);
    const actionsCount = 3 + (canSharePublic ? 1 : 0);
    const actionsClass = `social-post-actions social-post-actions--${actionsCount}`;
    const hideAudienceBadge = options.hideAudienceBadge === true || (options.hideGroupBadge === true && Number(post.group_id) > 0);
    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
    const authorCareer = careerLabel(author);
    const visibilityMeta = getVisibilityMeta(post.visibility);
    const audienceMarkup = hideAudienceBadge ? '' : post.group_id ? `
        <span class="social-post-card__audience-badge social-post-card__audience-badge--group">
          <span class="material-symbols-outlined text-[14px]">diversity_3</span>
          ${escapeHtml(post.group_name || 'Grupo')}
        </span>
      ` : `
        <span class="social-post-card__audience-badge">
          <span class="material-symbols-outlined text-[14px]">${visibilityMeta.icon}</span>
          ${escapeHtml(visibilityMeta.label)}
        </span>
      `;
    const authorMeta = [
      authorCareer ? `<span>${escapeHtml(authorCareer)}</span>` : '',
      `<span>${escapeHtml(timeAgo(post.created_at))}</span>`,
    ].filter(Boolean).join('<span class="social-post-card__meta-separator">·</span>');

    return `
      <article class="social-post-card bg-white border border-slate-200 ${clickable ? 'cursor-pointer' : ''}" ${clickable ? `data-post-card="true" data-post-id="${post.id}"` : ''}>
        <div class="social-post-card__header">
          <button type="button" class="social-post-card__author" data-action="open-profile" data-user-id="${post.user_id}">
            ${renderAvatar(author, { sizeClass: 'w-12 h-12', textClass: 'text-white font-bold text-sm', extraClass: 'social-post-card__avatar', showOnline: true })}
            <div class="social-post-card__author-copy">
              <div class="social-post-card__author-main">
                <span class="social-post-card__author-name">${escapeHtml(displayName(author))}</span>
                <span class="social-post-card__faculty-badge" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
                ${audienceMarkup}
              </div>
              <div class="social-post-card__author-meta">${authorMeta}</div>
            </div>
          </button>
          <div class="social-post-card__header-actions">
            ${canDelete ? `
            <button type="button" data-action="delete-post" data-post-id="${post.id}" class="social-post-card__menu-btn" aria-label="Eliminar publicacion">
              <span class="material-symbols-outlined">delete</span>
            </button>
            ` : ''}
          </div>
        </div>
          ${post.content ? `<div class="social-post-card__copy"><p class="content-break content-rich">${renderTextWithMentions(post.content || '')}</p></div>` : ''}
          ${renderPostMediaBlock(post, { adaptiveContext: 'card' })}
        ${interactive ? `
          <div class="social-post-card__footer${getPostMediaInfo(post) ? ' has-media' : ''}">
            <div class="social-post-card__stats">
              ${renderReactionSummary(post.reactions_count, post.reactions_total, 'Sin reacciones')}
              <button type="button" data-action="comment-post" data-post-id="${post.id}" class="social-post-card__comments-link">
                ${post.comments_count || 0} comentarios
              </button>
            </div>
            <div class="${actionsClass}">
              ${renderReactionTrigger('post', post.id, post.current_reaction, true)}
              <button type="button" data-action="comment-post" data-post-id="${post.id}" class="social-post-action">
                <span class="material-symbols-outlined">chat_bubble_outline</span>
                <span>Comentar</span>
              </button>
              <button type="button" data-action="report-post" data-post-id="${post.id}" class="social-post-action social-post-action--report">
                <span class="material-symbols-outlined">flag</span>
                <span>Reportar</span>
              </button>
              ${renderPublicShareActionButton(post)}
            </div>
          </div>
        ` : ''}
        <div class="pb-2"></div>
      </article>
    `;
  }

  function renderPostModalPreview(post, currentUserId, options = {}) {
    if (!post) {
      return `
        <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
          No se pudo cargar la publicacion seleccionada.
        </div>
      `;
    }

    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
    const visibilityMeta = getVisibilityMeta(post.visibility);
    const hideAudienceBadge = options.hideAudienceBadge === true || (options.hideGroupBadge === true && Number(post.group_id) > 0);
    const audienceMarkup = hideAudienceBadge ? '' : post.group_id ? `
        <span class="social-post-card__audience-badge social-post-card__audience-badge--group">
          <span class="material-symbols-outlined text-[14px]">diversity_3</span>
          ${escapeHtml(post.group_name || 'Grupo')}
        </span>
      ` : `
        <span class="social-post-card__audience-badge">
          <span class="material-symbols-outlined text-[14px]">${visibilityMeta.icon}</span>
          ${escapeHtml(visibilityMeta.label)}
        </span>
      `;

    const authorCareer = careerLabel(author);
    const authorMeta = [
      authorCareer ? `<span>${escapeHtml(authorCareer)}</span>` : '',
      `<span>${escapeHtml(timeAgo(post.created_at))}</span>`,
    ].filter(Boolean).join('<span class="post-modal-preview-author-dot">·</span>');

    const reactionTotal = Number(post.reactions_total || 0);
    const commentsTotal = Number(post.comments_count || 0);
    const modalActionsCount = 2 + (canSharePostPublicly(post) ? 1 : 0);
    const hasMedia = !!getPostMediaInfo(post);

    return `
      <article class="post-modal-preview-card">
        <div class="post-modal-preview-head">
          <div class="post-modal-preview-author-row">
            <button type="button" class="post-modal-preview-author post-modal-preview-author--button" data-action="open-profile" data-user-id="${post.user_id}">
              ${renderAvatar(author, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm', showOnline: true })}
              <div class="post-modal-preview-author-copy min-w-0">
                <div class="post-modal-preview-author-main">
                  <span class="post-modal-preview-author-name">${escapeHtml(displayName(author))}</span>
                  <span class="post-modal-preview-author-faculty" style="background:${userColor(author)}">
                    ${escapeHtml(author.faculty || 'UPT')}
                  </span>
                  ${audienceMarkup}
                </div>
                <div class="post-modal-preview-author-meta">${authorMeta}</div>
              </div>
            </button>
          </div>
          ${post.content ? `
            <div class="post-modal-preview-copy content-break content-rich">${renderTextWithMentions(post.content)}</div>
          ` : ''}
        </div>
        ${hasMedia ? renderPostModalMedia(post, {}) : ''}
        <div class="post-modal-preview-stats">
          <div class="post-modal-preview-stat">
            ${renderReactionSummary(post.reactions_count, reactionTotal, 'Sin reacciones')}
            ${reactionTotal ? `<span>${reactionTotal} ${reactionTotal === 1 ? 'reaccion' : 'reacciones'}</span>` : ''}
          </div>
          <div class="post-modal-preview-stat">
            <span class="material-symbols-outlined text-[15px]">chat_bubble</span>
            <span>${commentsTotal} ${commentsTotal === 1 ? 'comentario' : 'comentarios'}</span>
          </div>
        </div>
        <div class="post-modal-preview-actions post-modal-preview-actions--${modalActionsCount}">
          ${renderReactionTrigger('post', post.id, post.current_reaction, true)}
          ${renderPublicShareActionButton(post, { variant: 'modal' })}
          <button type="button" class="post-modal-preview-action-btn post-modal-preview-action-btn--report" data-action="report-post" data-post-id="${post.id}">
            <span class="material-symbols-outlined text-[18px]">flag</span>
            <span>Reportar</span>
          </button>
        </div>
      </article>
    `;
  }

  window.__uptFocusPostCommentInput = (trigger, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const scope = trigger?.closest?.('#comment-modal, #group-comment-modal, #profile-comment-modal, #admin-comments-modal');
    if (!(scope instanceof Element)) return;
    const input = scope.querySelector('#comment-input, #group-comment-input, #profile-comment-input, #admin-comment-input');
    if (!(input instanceof HTMLElement)) return;
    input.focus?.();
    if (typeof input.scrollIntoView === 'function') {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  let headerSearchCleanup = null;
  let headerMenusCleanup = null;

  window.setupHeaderSearch = function setupHeaderSearch() {
    const input = document.getElementById('header-search-input');
    const dropdown = document.getElementById('header-search-dropdown');
    const results = document.getElementById('header-search-results');

    if (!input || !dropdown || !results || !window.AppRouter) return;

    if (headerSearchCleanup) {
      headerSearchCleanup();
      headerSearchCleanup = null;
    }

    let debounceTimer = null;
    let requestVersion = 0;

    function closeDropdown() {
      dropdown.classList.add('hidden');
    }

    function openDropdown() {
      dropdown.classList.remove('hidden');
    }

    function renderSearchMessage(message) {
      results.innerHTML = `<div class="px-4 py-4 text-sm text-slate-500 text-center">${escapeHtml(message)}</div>`;
    }

    async function runSearch(query) {
      const normalized = String(query || '').trim();

      if (normalized.length < 1) {
        renderSearchMessage('Escribe al menos 1 letra para buscar.');
        closeDropdown();
        return;
      }

      const currentRequest = ++requestVersion;
      openDropdown();
      renderSearchMessage('Buscando estudiantes...');

      const result = await SocialAPI.searchDirectory(normalized);
      if (currentRequest !== requestVersion) return;

      if (!result?.ok) {
        renderSearchMessage(result?.data?.error || 'No se pudo completar la busqueda.');
        return;
      }

      const users = getList(result)
        .map((entry) => resolveProfileData(entry))
        .filter((entry) => Number(entry.id) !== Number(appState.user.id));

      users.forEach((entry) => {
        if (entry.id !== null) {
          publicUsersState.map.set(Number(entry.id), entry);
        }
      });

      if (!users.length) {
        renderSearchMessage('No se encontraron estudiantes.');
        return;
      }

      results.innerHTML = users.map((entry) => `
        <button type="button" class="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors" data-header-search-user="${entry.id}">
          ${renderAvatar(entry, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-sm text-slate-900 truncate">${escapeHtml(displayName(entry))}</span>
              ${entry.faculty ? `
                <span class="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full" style="background:${userColor(entry)}">
                  ${escapeHtml(entry.faculty)}
                </span>
              ` : ''}
            </div>
            <p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(careerLabel(entry) || 'Perfil UPT')}</p>
          </div>
        </button>
      `).join('');
    }

    function handleInput() {
      const query = input.value;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        runSearch(query);
      }, 220);
    }

    function handleDocumentClick(event) {
      const target = event.target;
      if (target.closest('#header-search-dropdown') || target.closest('#header-search-input')) {
        return;
      }
      closeDropdown();
    }

    function handleResultsClick(event) {
      const button = event.target.closest('[data-header-search-user]');
      if (!button) return;

      input.value = '';
      renderSearchMessage('Escribe al menos 1 letra para buscar.');
      closeDropdown();
      window.AppRouter.navigate('profile', { id: button.dataset.headerSearchUser });
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    }

    input.addEventListener('input', handleInput);
    input.addEventListener('focus', handleInput);
    input.addEventListener('keydown', handleKeydown);
    results.addEventListener('click', handleResultsClick);
    document.addEventListener('click', handleDocumentClick);

    headerSearchCleanup = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      input.removeEventListener('input', handleInput);
      input.removeEventListener('focus', handleInput);
      input.removeEventListener('keydown', handleKeydown);
      results.removeEventListener('click', handleResultsClick);
      document.removeEventListener('click', handleDocumentClick);
    };
  };

  window.setupHeaderMenus = function setupHeaderMenus() {
    const notifContainer = document.getElementById('notif-container');
    const notifToggle = document.getElementById('notif-toggle-btn');
    const notifDropdown = document.getElementById('notifications-dropdown');
    const profileContainer = document.getElementById('profile-menu-container');
    const profileToggle = document.getElementById('header-initials');
    const profileDropdown = document.getElementById('profile-menu-dropdown');

    if (!notifContainer || !notifToggle || !notifDropdown || !profileContainer || !profileToggle || !profileDropdown) {
      return;
    }

    if (headerMenusCleanup) {
      headerMenusCleanup();
      headerMenusCleanup = null;
    }

    function setMenuState(toggle, dropdown, isOpen) {
      dropdown.classList.toggle('hidden', !isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function closeMenus() {
      setMenuState(notifToggle, notifDropdown, false);
      setMenuState(profileToggle, profileDropdown, false);
    }

    function toggleMenu(kind) {
      const targetToggle = kind === 'notifications' ? notifToggle : profileToggle;
      const targetDropdown = kind === 'notifications' ? notifDropdown : profileDropdown;
      const shouldOpen = targetDropdown.classList.contains('hidden');

      closeMenus();

      if (!shouldOpen) {
        return;
      }

      setMenuState(targetToggle, targetDropdown, true);
      if (kind === 'notifications' && window.loadNotifications) {
        window.loadNotifications();
      }
    }

    function handleDocumentClick(event) {
      const target = event.target;
      if (target.closest('#notif-container') || target.closest('#profile-menu-container')) {
        return;
      }
      closeMenus();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        closeMenus();
      }
    }

    function handleNotifToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu('notifications');
    }

    function handleProfileToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu('profile');
    }

    function stopInsideClick(event) {
      event.stopPropagation();
    }

    notifToggle.addEventListener('click', handleNotifToggle);
    profileToggle.addEventListener('click', handleProfileToggle);
    notifDropdown.addEventListener('click', stopInsideClick);
    profileDropdown.addEventListener('click', stopInsideClick);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);

    headerMenusCleanup = () => {
      notifToggle.removeEventListener('click', handleNotifToggle);
      profileToggle.removeEventListener('click', handleProfileToggle);
      notifDropdown.removeEventListener('click', stopInsideClick);
      profileDropdown.removeEventListener('click', stopInsideClick);
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeydown);
      closeMenus();
    };
  };

  window.setupMobileSidebar = function setupMobileSidebar() {
    const toggle = document.getElementById('mobile-sidebar-toggle');
    const drawer = document.getElementById('mobile-sidebar-drawer');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    const closeButton = document.getElementById('mobile-sidebar-close');
    const navLinks = Array.from(document.querySelectorAll('[data-mobile-nav-link="true"]'));
    if (!toggle || !drawer || !backdrop || !closeButton) return;

    if (mobileSidebarCleanup) {
      mobileSidebarCleanup();
      mobileSidebarCleanup = null;
    }

    function setOpen(isOpen) {
      drawer.classList.toggle('is-open', isOpen);
      backdrop.classList.toggle('hidden', !isOpen);
      document.body.classList.toggle('overflow-hidden', isOpen);
    }

    const open = (event) => {
      event?.preventDefault?.();
      setOpen(true);
    };
    const close = (event) => {
      event?.preventDefault?.();
      setOpen(false);
    };
    const closeAfterNavigate = () => {
      window.requestAnimationFrame(() => setOpen(false));
    };

    toggle.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    navLinks.forEach((link) => link.addEventListener('click', closeAfterNavigate));

    mobileSidebarCleanup = () => {
      toggle.removeEventListener('click', open);
      closeButton.removeEventListener('click', close);
      backdrop.removeEventListener('click', close);
      navLinks.forEach((link) => link.removeEventListener('click', closeAfterNavigate));
      setOpen(false);
    };
  };

  function initMessagesView({ container, user, params, callManagerOnly = false }) {
    const messagesLayout = container.querySelector('#messages-layout');
    const inboxPane = container.querySelector('#messages-inbox-pane');
    const inboxList = container.querySelector('#inbox-list');
    const chatPanel = container.querySelector('#chat-panel');
    const messagesSummary = container.querySelector('#messages-summary');
    const messagesCount = container.querySelector('#messages-count');
    const CHAT_POLL_INTERVAL_MS = 1000;
    const CALL_INBOX_POLL_INTERVAL_MS = 650;
    const CALL_SESSION_POLL_INTERVAL_MS = 450;
    const CALL_SIGNAL_POLL_INTERVAL_MS = 250;
    const CALL_ICE_SERVERS = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:uptconnect.duckdns.org:3478' },
      {
        urls: [
          'turn:uptconnect.duckdns.org:3478?transport=udp',
          'turn:uptconnect.duckdns.org:3478?transport=tcp',
        ],
        username: 'uptturn',
        credential: 'UptTurn2026!media',
      },
    ];

    let friends = [];
    let conversations = [];
    let activeChat = params.user ? Number(params.user) : null;
    let activeUser = null;
    let mobileChatOpen = Boolean(activeChat);
    let currentMessages = [];
    let activeConversationToken = 0;
    let chatPollTimer = null;
    let chatPollInFlight = false;
    let callInboxTimer = null;
    let callInboxPollInFlight = false;
    let callSessionTimer = null;
    let callSignalTimer = null;
    let callMeterFrame = null;
    let ringToneRetryTimer = null;
    let callSessionPollInFlight = false;
    let callSignalPollInFlight = false;
    const callRuntimeId = `call-runtime-${Math.random().toString(36).slice(2)}`;

    const callState = {
      session: null,
      otherUser: null,
      mode: 'audio',
      initialMode: 'audio',
      status: 'idle',
      startedAt: 0,
      pendingIncoming: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      lastSignalId: 0,
      drag: null,
      localVideoEnabled: false,
      isMuted: false,
      remoteVolume: 1,
      adjustingVolume: false,
      remoteVideoAspect: null,
      windowWidth: null,
      minimized: false,
      mobileExpanded: false,
      mobileExpandedUsingFullscreen: false,
      mobileExpandSnapshot: null,
      resizing: null,
      outgoingOfferSent: false,
      isFinalizing: false,
      awaitingAnswer: false,
      cameraBusy: false,
      makingOffer: false,
      ignoreOffer: false,
      pendingIceCandidates: [],
      initialVideoSyncDone: false,
      audioSender: null,
      videoSender: null,
      videoTransceiver: null,
      audioContext: null,
      localAudioAnalyser: null,
      localAudioMeterData: null,
      remoteAudioAnalyser: null,
      remoteAudioMeterData: null,
      ringAudio: null,
    };

    function getGlobalCallRuntime() {
      return window.__uptGlobalCallRuntime || null;
    }

    function hasForeignCallManager() {
      return Boolean(window.__uptCallManager && window.__uptCallManager.id !== callRuntimeId);
    }

    function hasForeignActiveCallRuntime() {
      const runtime = getGlobalCallRuntime();
      return Boolean(runtime && runtime.id !== callRuntimeId && runtime.isActive?.());
    }

    function claimCallRuntime() {
      const runtime = getGlobalCallRuntime();
      if (!runtime || runtime.id === callRuntimeId || !runtime.isActive?.()) {
        window.__uptGlobalCallRuntime = {
          id: callRuntimeId,
          isActive: () => Boolean(callState.session),
        };
      }
    }

    function releaseCallRuntime() {
      if (window.__uptGlobalCallRuntime?.id === callRuntimeId) {
        delete window.__uptGlobalCallRuntime;
      }
    }

    function isMessagesMobileViewport() {
      return window.innerWidth < 1024;
    }

    function isMobileCallViewport() {
      return window.innerWidth <= 767;
    }

    function getCallWindowFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function isCallWindowFullscreen(root = ensureCallWindow()) {
      if (!root) return false;
      const fullscreenElement = getCallWindowFullscreenElement();
      return fullscreenElement === root;
    }

    async function requestCallWindowFullscreen(root = ensureCallWindow()) {
      if (!root) return false;
      const requestFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
      if (typeof requestFullscreen !== 'function') return false;
      try {
        const maybePromise = requestFullscreen.call(root, { navigationUI: 'hide' });
        if (maybePromise?.then) {
          await maybePromise;
        }
        return isCallWindowFullscreen(root);
      } catch (_) {
        try {
          const fallback = requestFullscreen.call(root);
          if (fallback?.then) {
            await fallback;
          }
        } catch (_) {
          return false;
        }
        return isCallWindowFullscreen(root);
      }
    }

    async function exitCallWindowFullscreen(root = ensureCallWindow()) {
      if (!isCallWindowFullscreen(root)) return;
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (typeof exitFullscreen !== 'function') return;
      try {
        const maybePromise = exitFullscreen.call(document);
        if (maybePromise?.then) {
          await maybePromise;
        }
      } catch (_) { }
    }

    function clearActiveConversationState() {
      activeConversationToken += 1;
      activeChat = null;
      activeUser = null;
      currentMessages = [];
      mobileChatOpen = false;
      stopChatPolling();
      updateUrlForChat(null);
    }

    function syncMessagesResponsiveLayout() {
      if (!messagesLayout || !inboxPane || !chatPanel) {
        return;
      }

      const shouldUseMobileStack = isMessagesMobileViewport();
      const showChatPanel = !shouldUseMobileStack || mobileChatOpen;
      const showInboxPane = !shouldUseMobileStack || !mobileChatOpen;

      messagesLayout.classList.toggle('lg:flex-row', !shouldUseMobileStack);
      inboxPane.classList.toggle('hidden', !showInboxPane);
      chatPanel.classList.toggle('hidden', !showChatPanel);
    }

    function exitMobileConversationView() {
      clearActiveConversationState();
      renderInbox();
      renderEmptyChatPanel('Selecciona un amigo para empezar a conversar.');
      syncMessagesResponsiveLayout();
    }

    function clampCallWindow(root = ensureCallWindow()) {
      if (!root || root.classList.contains('hidden')) return;
      if (callState.mobileExpanded) {
        root.style.setProperty('position', 'fixed', 'important');
        root.style.setProperty('inset', '0', 'important');
        root.style.setProperty('left', '0', 'important');
        root.style.setProperty('top', '0', 'important');
        root.style.setProperty('right', '0', 'important');
        root.style.setProperty('bottom', '0', 'important');
        return;
      }
      const rect = root.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - root.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - root.offsetHeight - 8);
      root.style.left = `${Math.min(Math.max(8, rect.left), maxLeft)}px`;
      root.style.top = `${Math.min(Math.max(8, rect.top), maxTop)}px`;
      root.style.right = 'auto';
    }

    function captureMobileExpandedSnapshot(root) {
      return {
        position: root.style.position || '',
        inset: root.style.inset || '',
        left: root.style.left || '',
        top: root.style.top || '',
        right: root.style.right || '',
        bottom: root.style.bottom || '',
        zIndex: root.style.zIndex || '',
        width: root.style.width || '',
        maxWidth: root.style.maxWidth || '',
        flexBasis: root.style.flexBasis || '',
        minHeight: root.style.minHeight || '',
        height: root.style.height || '',
        maxHeight: root.style.maxHeight || '',
        borderRadius: root.style.borderRadius || '',
        transform: root.style.transform || '',
        margin: root.style.margin || '',
      };
    }

    function restoreMobileExpandedSnapshot(root, snapshot) {
      const apply = (prop, value) => {
        if (value) {
          root.style.setProperty(prop, value);
        } else {
          root.style.removeProperty(prop);
        }
      };
      apply('position', snapshot?.position || '');
      apply('inset', snapshot?.inset || '');
      apply('left', snapshot?.left || '');
      apply('top', snapshot?.top || '');
      apply('right', snapshot?.right || '');
      apply('bottom', snapshot?.bottom || '');
      apply('z-index', snapshot?.zIndex || '');
      apply('width', snapshot?.width || '');
      apply('max-width', snapshot?.maxWidth || '');
      apply('flex-basis', snapshot?.flexBasis || '');
      apply('min-height', snapshot?.minHeight || '');
      apply('height', snapshot?.height || '');
      apply('max-height', snapshot?.maxHeight || '');
      apply('border-radius', snapshot?.borderRadius || '');
      apply('transform', snapshot?.transform || '');
      apply('margin', snapshot?.margin || '');
    }

    function clearCallWindowExpandedStyles(root = ensureCallWindow()) {
      if (!root) return;
      callState.mobileExpandedUsingFullscreen = false;
      root.classList.remove('call-window--mobile-expanded');
      document.body.classList.remove('call-window-mobile-expanded-active');
      document.documentElement.classList.remove('call-window-mobile-expanded-active');
      [
        'position',
        'inset',
        'left',
        'top',
        'right',
        'bottom',
        'z-index',
        'width',
        'max-width',
        'flex-basis',
        'min-height',
        'height',
        'max-height',
        'border-radius',
        'transform',
        'margin',
      ].forEach((prop) => root.style.removeProperty(prop));
    }

    function applyMobileExpandedCallWindowStyles(root = ensureCallWindow()) {
      if (!root) return;
      document.body.classList.add('call-window-mobile-expanded-active');
      document.documentElement.classList.add('call-window-mobile-expanded-active');
      root.classList.add('call-window--mobile-expanded');
      root.style.setProperty('position', 'fixed', 'important');
      root.style.setProperty('inset', '0', 'important');
      root.style.setProperty('left', '0', 'important');
      root.style.setProperty('top', '0', 'important');
      root.style.setProperty('right', '0', 'important');
      root.style.setProperty('bottom', '0', 'important');
      root.style.setProperty('z-index', '9999', 'important');
      root.style.setProperty('width', '100%', 'important');
      root.style.setProperty('max-width', 'none', 'important');
      root.style.setProperty('flex-basis', 'auto', 'important');
      root.style.setProperty('min-height', '100dvh', 'important');
      root.style.setProperty('height', '100dvh', 'important');
      root.style.setProperty('max-height', '100dvh', 'important');
      root.style.setProperty('border-radius', '0', 'important');
      root.style.setProperty('transform', 'none', 'important');
      root.style.setProperty('margin', '0', 'important');
      root.style.setProperty('box-sizing', 'border-box', 'important');
    }

    function applyDefaultCallWindowPosition(root = ensureCallWindow()) {
      if (!root) return;
      root.style.removeProperty('bottom');
      root.style.removeProperty('margin');
      root.style.removeProperty('transform');
      root.style.setProperty('left', 'auto');
      if (isMobileCallViewport()) {
        root.style.setProperty('top', '8px');
        root.style.setProperty('right', '8px');
      } else {
        root.style.setProperty('top', '96px');
        root.style.setProperty('right', '24px');
      }
    }

    function finalizeMobileExpandedCallWindowExit(root = ensureCallWindow(), { restoreSnapshot = true } = {}) {
      if (!root || !callState.mobileExpanded) return;
      root.classList.remove('call-window--mobile-expanded');
      document.body.classList.remove('call-window-mobile-expanded-active');
      document.documentElement.classList.remove('call-window-mobile-expanded-active');
      if (restoreSnapshot) {
        restoreMobileExpandedSnapshot(root, callState.mobileExpandSnapshot || {});
      } else {
        clearCallWindowExpandedStyles(root);
      }
      callState.mobileExpanded = false;
      callState.mobileExpandedUsingFullscreen = false;
      callState.mobileExpandSnapshot = null;
      syncMinimizedCallWindowLayout(root);
      clampCallWindow(root);
    }

    async function exitMobileExpandedCallWindow(root = ensureCallWindow(), { restoreSnapshot = true } = {}) {
      if (!root || !callState.mobileExpanded) return;
      if (callState.mobileExpandedUsingFullscreen || isCallWindowFullscreen(root)) {
        await exitCallWindowFullscreen(root);
      }
      finalizeMobileExpandedCallWindowExit(root, { restoreSnapshot });
    }

    async function enterMobileExpandedCallWindow(root = ensureCallWindow()) {
      if (!root || callState.mobileExpanded || !isMobileCallViewport()) return;
      callState.mobileExpandSnapshot = captureMobileExpandedSnapshot(root);
      callState.mobileExpanded = true;
      callState.mobileExpandedUsingFullscreen = false;
      applyMobileExpandedCallWindowStyles(root);
      callState.mobileExpandedUsingFullscreen = await requestCallWindowFullscreen(root);
    }

    async function toggleMobileExpandedCallWindow(root = ensureCallWindow()) {
      if (!isMobileCallViewport() || !root || root.classList.contains('hidden')) return;
      if (callState.mobileExpanded) {
        await exitMobileExpandedCallWindow(root);
      } else {
        await enterMobileExpandedCallWindow(root);
      }
    }

    function stopRingTone() {
      if (ringToneRetryTimer) {
        window.clearInterval(ringToneRetryTimer);
        ringToneRetryTimer = null;
      }
      if (!callState.ringAudio) return;
      try {
        callState.ringAudio.pause();
        callState.ringAudio.currentTime = 0;
      } catch (error) {
        console.warn('No se pudo detener el tono:', error);
      }
    }

    async function playRingTone() {
      if (!callState.ringAudio) {
        callState.ringAudio = new Audio('/sonidos/phone-ringing.mp3');
        callState.ringAudio.loop = true;
        callState.ringAudio.preload = 'auto';
      }

      try {
        if (!callState.ringAudio.paused && !callState.ringAudio.ended) {
          return;
        }
        const duration = Number(callState.ringAudio.duration || 0);
        if (callState.ringAudio.ended || (duration && callState.ringAudio.currentTime >= duration - 0.25)) {
          callState.ringAudio.currentTime = 0;
        }
        await callState.ringAudio.play();
      } catch (error) {
        console.warn('No se pudo reproducir el tono:', error);
      }
    }

    function keepRingTonePlaying() {
      playRingTone();
      if (ringToneRetryTimer) return;
      ringToneRetryTimer = window.setInterval(() => {
        if (callState.session?.status !== 'ringing') {
          stopRingTone();
          return;
        }
        playRingTone();
      }, 1200);
    }

    function primeRingToneFromGesture() {
      if (!callState.ringAudio) {
        callState.ringAudio = new Audio('/sonidos/phone-ringing.mp3');
        callState.ringAudio.loop = true;
        callState.ringAudio.preload = 'auto';
      }

      const previousMuted = callState.ringAudio.muted;
      callState.ringAudio.muted = true;
      callState.ringAudio.play()
        .then(() => {
          callState.ringAudio.pause();
          callState.ringAudio.currentTime = 0;
          callState.ringAudio.muted = previousMuted;
        })
        .catch(() => {
          callState.ringAudio.muted = previousMuted;
        });
    }

    function stopAudioMeter() {
      if (callMeterFrame) {
        cancelAnimationFrame(callMeterFrame);
        callMeterFrame = null;
      }
      document.querySelectorAll('[data-audio-meter-bar]').forEach((bar) => {
        bar.style.transform = 'scaleY(0.2)';
        bar.style.opacity = '0.35';
      });
    }

    function renderAudioMeterBars(bars, analyser, meterData, options = {}) {
      const inactiveScale = options.inactiveScale ?? 0.2;
      const inactiveOpacity = options.inactiveOpacity ?? 0.35;
      if (!bars.length) {
        return;
      }

      if (!analyser || !meterData || options.disabled) {
        bars.forEach((bar) => {
          bar.style.transform = `scaleY(${inactiveScale})`;
          bar.style.opacity = String(inactiveOpacity);
        });
        return;
      }

      analyser.getByteFrequencyData(meterData);
      const chunk = Math.max(1, Math.floor(meterData.length / bars.length));
      bars.forEach((bar, index) => {
        const slice = meterData.slice(index * chunk, (index + 1) * chunk);
        const avg = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
        const scale = Math.max(0.2, Math.min(1, avg / 90));
        bar.style.transform = `scaleY(${scale})`;
        bar.style.opacity = String(Math.max(0.35, scale));
      });
    }

    function startAudioMeter() {
      stopAudioMeter();
      const localBars = Array.from(document.querySelectorAll('[data-audio-meter-group="local"]'));
      const remoteBars = Array.from(document.querySelectorAll('[data-audio-meter-group="remote"]'));
      if (!localBars.length && !remoteBars.length) return;

      const tick = () => {
        if (
          !callState.localAudioAnalyser
          && !callState.remoteAudioAnalyser
          && !callState.localAudioMeterData
          && !callState.remoteAudioMeterData
        ) {
          stopAudioMeter();
          return;
        }

        renderAudioMeterBars(localBars, callState.localAudioAnalyser, callState.localAudioMeterData, { disabled: callState.isMuted });
        renderAudioMeterBars(remoteBars, callState.remoteAudioAnalyser, callState.remoteAudioMeterData);

        callMeterFrame = requestAnimationFrame(tick);
      };

      tick();
    }

    function ensureCallAudioContext() {
      if (callState.audioContext) {
        if (callState.audioContext.state === 'closed') {
          callState.audioContext = null;
        } else {
          if (callState.audioContext.state === 'suspended') {
            callState.audioContext.resume().catch(() => { });
          }
          return callState.audioContext;
        }
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }

      callState.audioContext = new AudioContextClass();
      if (callState.audioContext.state === 'suspended') {
        callState.audioContext.resume().catch(() => { });
      }
      return callState.audioContext;
    }

    function ensureLocalAudioMeter() {
      const audioTrack = getLocalAudioTrack();
      const audioContext = ensureCallAudioContext();
      if (!audioTrack || !audioContext || callState.localAudioAnalyser) {
        return;
      }

      const analyserStream = new MediaStream([audioTrack]);
      const source = audioContext.createMediaStreamSource(analyserStream);
      callState.localAudioAnalyser = audioContext.createAnalyser();
      callState.localAudioAnalyser.fftSize = 64;
      callState.localAudioMeterData = new Uint8Array(callState.localAudioAnalyser.frequencyBinCount);
      source.connect(callState.localAudioAnalyser);
      startAudioMeter();
    }

    function ensureRemoteAudioMeter() {
      const remoteAudioTrack = callState.remoteStream?.getAudioTracks()?.find((track) => track.readyState === 'live') || null;
      const audioContext = ensureCallAudioContext();
      if (!remoteAudioTrack || !audioContext || callState.remoteAudioAnalyser) {
        return;
      }

      const analyserStream = new MediaStream([remoteAudioTrack]);
      const source = audioContext.createMediaStreamSource(analyserStream);
      callState.remoteAudioAnalyser = audioContext.createAnalyser();
      callState.remoteAudioAnalyser.fftSize = 64;
      callState.remoteAudioMeterData = new Uint8Array(callState.remoteAudioAnalyser.frequencyBinCount);
      source.connect(callState.remoteAudioAnalyser);
      startAudioMeter();
    }

    function ensureCallWindow() {
      let root = document.getElementById('floating-call-window');
      if (!root) {
        root = document.createElement('div');
        root.id = 'floating-call-window';
        root.className = 'call-window hidden fixed z-[70] flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] sm:w-[400px] sm:max-w-[calc(100vw-1rem)] flex-col overflow-hidden text-white';
        applyDefaultCallWindowPosition(root);
        root.innerHTML = `
          <div class="call-window__header cursor-move select-none" data-call-drag-handle="true">
            <div class="call-window__avatar" id="call-avatar-badge">
              <span class="material-symbols-outlined text-[22px]">person</span>
            </div>
            <div class="call-window__identity min-w-0 flex-1">
              <h3 id="call-window-name" class="call-window__name truncate">Llamada</h3>
              <div class="call-window__meta">
                <p id="call-window-status" class="call-window__status">Esperando...</p>
                <span id="call-mode-badge" class="call-window__mode-badge">VOZ</span>
              </div>
            </div>
            <div class="call-window__header-actions">
              <button type="button" id="call-minimize-btn" class="call-window__icon-btn" aria-label="Minimizar llamada" title="Minimizar">
                <span class="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <button type="button" id="call-expand-btn" class="call-window__icon-btn hidden" aria-label="Maximizar llamada" title="Maximizar">
                <span class="call-window__window-glyph" aria-hidden="true">□</span>
              </button>
              <button type="button" id="call-close-btn" class="call-window__icon-btn" aria-label="Cerrar llamada" title="Cerrar">
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
          <div id="call-video-stage" class="call-window__stage shrink min-h-0">
            <div class="call-window__video-frame relative flex items-center justify-center overflow-hidden">
              <audio id="call-remote-audio" class="hidden" autoplay playsinline></audio>
              <video id="call-remote-video" class="absolute inset-0 hidden h-full w-full object-cover" autoplay playsinline muted></video>
              <div id="call-quality-badge" class="call-window__quality-badge hidden">HD · 1080p</div>
              <div id="call-remote-placeholder" class="call-window__placeholder absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div class="call-window__placeholder-avatar">
                  <div id="call-remote-avatar" class="call-window__placeholder-avatar-inner">
                    <span class="material-symbols-outlined text-[34px]">person</span>
                  </div>
                </div>
                <span id="call-video-placeholder-label" class="call-window__placeholder-label">Camara apagada</span>
                <div id="call-stage-meter" class="call-window__stage-meter hidden" aria-hidden="true">
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar"></span>
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar call-window__meter-bar--medium"></span>
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar call-window__meter-bar--tall"></span>
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar call-window__meter-bar--taller"></span>
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar call-window__meter-bar--tall"></span>
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar call-window__meter-bar--medium"></span>
                  <span data-audio-meter-bar data-audio-meter-group="remote" class="call-window__meter-bar"></span>
                </div>
              </div>
              <div id="call-local-preview-shell" class="call-window__local-preview-shell hidden">
                <video id="call-local-video" class="call-window__local-video absolute hidden object-cover" autoplay playsinline muted></video>
                <div id="call-local-preview-placeholder" class="call-window__local-preview-placeholder">
                  <span class="material-symbols-outlined text-[18px]">videocam_off</span>
                </div>
                <span id="call-local-badge" class="call-window__local-badge">Yo</span>
              </div>
            </div>
          </div>
          <div id="call-actions-row" class="call-window__actions mt-auto">
            <div class="call-window__toolbar">
              <button type="button" id="call-toggle-video-btn" class="call-window__round-btn call-window__round-btn--light">
                <span class="material-symbols-outlined text-[20px]">videocam_off</span>
              </button>
              <div class="call-window__pill call-window__pill--meter">
                <button type="button" id="call-toggle-mic-btn" class="call-window__pill-icon">
                  <span class="material-symbols-outlined text-[20px]">mic</span>
                </button>
                <div class="call-window__meter" aria-label="Medidor de sonido">
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar"></span>
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar call-window__meter-bar--medium"></span>
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar call-window__meter-bar--tall"></span>
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar call-window__meter-bar--taller"></span>
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar call-window__meter-bar--tall"></span>
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar call-window__meter-bar--medium"></span>
                  <span data-audio-meter-bar data-audio-meter-group="local" class="call-window__meter-bar"></span>
                </div>
              </div>
              <div id="call-volume-pill" class="call-window__pill call-window__pill--volume">
                <span class="material-symbols-outlined call-window__volume-icon">volume_down</span>
                <input id="call-remote-volume" type="range" min="0" max="1" step="0.05" value="1" class="call-window__volume-range" aria-label="Volumen de llamada"/>
              </div>
            </div>
            <div class="call-window__footer">
              <button type="button" id="call-accept-btn" class="call-window__action-btn call-window__action-btn--accept hidden"><span class="material-symbols-outlined text-[18px]">call</span><span>Aceptar</span></button>
              <button type="button" id="call-reject-btn" class="call-window__action-btn call-window__action-btn--reject hidden"><span class="material-symbols-outlined text-[18px]">close</span><span>Rechazar</span></button>
              <button type="button" id="call-hangup-btn" class="call-window__end-btn">
                <span class="material-symbols-outlined text-[22px]">call_end</span>
              </button>
            </div>
          </div>
          <div id="call-resize-handle" class="call-window__resize-handle hidden" aria-hidden="true"></div>
        `;
        document.body.appendChild(root);
      }

      if (hasForeignCallManager()) {
        return root;
      }

      if (typeof root.__callCleanup === 'function') {
        root.__callCleanup();
      }

      root.querySelectorAll('button, input[type="range"]').forEach((element) => {
        element.style.touchAction = 'manipulation';
      });

      const bindControlClick = (element, handler) => {
        if (!element) return () => { };
        const listener = (event) => {
          event.preventDefault();
          event.stopPropagation();
          Promise.resolve(handler(event)).catch((error) => {
            console.warn('Error en accion de llamada:', error);
          });
        };
        element.addEventListener('click', listener);
        return () => element.removeEventListener('click', listener);
      };

      const cleanups = [];
      const handle = root.querySelector('[data-call-drag-handle="true"]');
      const resizeHandle = root.querySelector('#call-resize-handle');
      const getMinimumCallWindowWidth = () => Math.min(window.innerWidth - 16, 400);
      const applyCallWindowWidth = (nextWidth) => {
        const safeWidth = Math.round(nextWidth);
        callState.windowWidth = safeWidth;
        root.style.setProperty('--call-window-width', `${safeWidth}px`);
        root.style.setProperty('width', `${safeWidth}px`, 'important');
        root.style.setProperty('max-width', 'calc(100vw - 1rem)', 'important');
        root.style.setProperty('flex-basis', `${safeWidth}px`, 'important');
      };
      const clearCallWindowWidth = () => {
        root.style.removeProperty('--call-window-width');
        root.style.removeProperty('width');
        root.style.removeProperty('max-width');
        root.style.removeProperty('flex-basis');
      };
      handle.style.touchAction = 'none';
      const onPointerDown = (event) => {
        if (callState.mobileExpanded) return;
        if (event.target.closest('button')) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const rect = root.getBoundingClientRect();
        callState.drag = {
          pointerId: event.pointerId,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };
        if (typeof handle.setPointerCapture === 'function') {
          try { handle.setPointerCapture(event.pointerId); } catch (error) { }
        }
        document.body.classList.add('select-none');
        event.preventDefault();
      };
      const onPointerMove = (event) => {
        if (!callState.drag || callState.drag.pointerId !== event.pointerId) return;
        const nextLeft = Math.min(Math.max(8, event.clientX - callState.drag.offsetX), window.innerWidth - root.offsetWidth - 8);
        const nextTop = Math.min(Math.max(8, event.clientY - callState.drag.offsetY), window.innerHeight - root.offsetHeight - 8);
        root.style.left = `${nextLeft}px`;
        root.style.top = `${nextTop}px`;
        root.style.right = 'auto';
      };
      const onPointerUp = (event) => {
        if (!callState.drag || callState.drag.pointerId !== event.pointerId) return;
        if (typeof handle.releasePointerCapture === 'function') {
          try { handle.releasePointerCapture(event.pointerId); } catch (error) { }
        }
        callState.drag = null;
        document.body.classList.remove('select-none');
      };
      handle.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      cleanups.push(() => handle.removeEventListener('pointerdown', onPointerDown));
      cleanups.push(() => window.removeEventListener('pointermove', onPointerMove));
      cleanups.push(() => window.removeEventListener('pointerup', onPointerUp));
      cleanups.push(() => window.removeEventListener('pointercancel', onPointerUp));

      if (resizeHandle) {
        resizeHandle.style.touchAction = 'none';
        const beginResize = (pointerId, clientX, clientY) => {
          const rect = root.getBoundingClientRect();
          callState.resizing = {
            pointerId,
            startWidth: rect.width,
            startHeight: rect.height,
            startX: clientX,
            startY: clientY,
            startLeft: rect.left,
            startTop: rect.top,
          };
        };
        const onResizePointerDown = (event) => {
          if (callState.mobileExpanded) return;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          beginResize(event.pointerId, event.clientX, event.clientY);
          if (typeof resizeHandle.setPointerCapture === 'function') {
            try { resizeHandle.setPointerCapture(event.pointerId); } catch (error) { }
          }
          document.body.classList.add('select-none');
          event.preventDefault();
          event.stopPropagation();
        };
        const onResizePointerMove = (event) => {
          if (!callState.resizing || callState.resizing.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - callState.resizing.startX;
          const nextWidth = Math.min(
            Math.max(getMinimumCallWindowWidth(), callState.resizing.startWidth + deltaX),
            Math.max(getMinimumCallWindowWidth(), window.innerWidth - 16),
          );
          applyCallWindowWidth(nextWidth);
          clampCallWindow(root);
          event.preventDefault();
        };
        const onResizePointerUp = (event) => {
          if (!callState.resizing || callState.resizing.pointerId !== event.pointerId) return;
          if (typeof resizeHandle.releasePointerCapture === 'function') {
            try { resizeHandle.releasePointerCapture(event.pointerId); } catch (error) { }
          }
          callState.resizing = null;
          document.body.classList.remove('select-none');
        };
        const onResizeMouseDown = (event) => {
          if (callState.mobileExpanded) return;
          if (event.button !== 0) return;
          beginResize('mouse', event.clientX, event.clientY);
          document.body.classList.add('select-none');
          event.preventDefault();
          event.stopPropagation();
        };
        const onResizeMouseMove = (event) => {
          if (!callState.resizing || callState.resizing.pointerId !== 'mouse') return;
          const deltaX = event.clientX - callState.resizing.startX;
          const nextWidth = Math.min(
            Math.max(getMinimumCallWindowWidth(), callState.resizing.startWidth + deltaX),
            Math.max(getMinimumCallWindowWidth(), window.innerWidth - 16),
          );
          applyCallWindowWidth(nextWidth);
          clampCallWindow(root);
          event.preventDefault();
        };
        const onResizeMouseUp = () => {
          if (!callState.resizing || callState.resizing.pointerId !== 'mouse') return;
          callState.resizing = null;
          document.body.classList.remove('select-none');
        };
        resizeHandle.addEventListener('pointerdown', onResizePointerDown);
        resizeHandle.addEventListener('mousedown', onResizeMouseDown);
        window.addEventListener('pointermove', onResizePointerMove);
        window.addEventListener('pointerup', onResizePointerUp);
        window.addEventListener('pointercancel', onResizePointerUp);
        window.addEventListener('mousemove', onResizeMouseMove);
        window.addEventListener('mouseup', onResizeMouseUp);
        cleanups.push(() => resizeHandle.removeEventListener('pointerdown', onResizePointerDown));
        cleanups.push(() => resizeHandle.removeEventListener('mousedown', onResizeMouseDown));
        cleanups.push(() => window.removeEventListener('pointermove', onResizePointerMove));
        cleanups.push(() => window.removeEventListener('pointerup', onResizePointerUp));
        cleanups.push(() => window.removeEventListener('pointercancel', onResizePointerUp));
        cleanups.push(() => window.removeEventListener('mousemove', onResizeMouseMove));
        cleanups.push(() => window.removeEventListener('mouseup', onResizeMouseUp));
      }

      const minimizeButton = root.querySelector('#call-minimize-btn');
      const expandButton = root.querySelector('#call-expand-btn');
      const onMinimize = async () => {
        if (callState.mobileExpanded) {
          await exitMobileExpandedCallWindow(root);
        }
        callState.minimized = !callState.minimized;
        root.querySelector('#call-video-stage').classList.toggle('hidden', callState.minimized);
        root.querySelector('#call-actions-row').classList.toggle('hidden', callState.minimized);
        root.classList.toggle('call-window--minimized', callState.minimized);
        syncMinimizedCallWindowLayout(root);
        const icon = minimizeButton.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = callState.minimized ? 'open_in_full' : 'remove';
        }
        minimizeButton.setAttribute('aria-label', callState.minimized ? 'Expandir llamada' : 'Minimizar llamada');
        minimizeButton.setAttribute('title', callState.minimized ? 'Expandir' : 'Minimizar');
        clampCallWindow(root);
      };
      minimizeButton.addEventListener('click', onMinimize);
      cleanups.push(() => minimizeButton.removeEventListener('click', onMinimize));

      const onExpand = async () => {
        if (!isMobileCallViewport() || callState.minimized) return;
        await toggleMobileExpandedCallWindow(root);
        updateCallWindow();
      };
      expandButton?.addEventListener('click', onExpand);
      cleanups.push(() => expandButton?.removeEventListener('click', onExpand));

      const onCallWindowFullscreenChange = () => {
        if (!callState.mobileExpanded) return;
        if (isCallWindowFullscreen(root)) {
          callState.mobileExpandedUsingFullscreen = true;
          applyMobileExpandedCallWindowStyles(root);
          updateCallWindow();
          return;
        }
        if (callState.mobileExpandedUsingFullscreen) {
          finalizeMobileExpandedCallWindowExit(root);
          updateCallWindow();
        }
      };
      document.addEventListener('fullscreenchange', onCallWindowFullscreenChange);
      document.addEventListener('webkitfullscreenchange', onCallWindowFullscreenChange);
      cleanups.push(() => document.removeEventListener('fullscreenchange', onCallWindowFullscreenChange));
      cleanups.push(() => document.removeEventListener('webkitfullscreenchange', onCallWindowFullscreenChange));

      cleanups.push(bindControlClick(root.querySelector('#call-toggle-mic-btn'), toggleMicrophone));
      cleanups.push(bindControlClick(root.querySelector('#call-toggle-video-btn'), toggleCamera));
      cleanups.push(bindControlClick(root.querySelector('#call-hangup-btn'), endActiveCall));
      cleanups.push(bindControlClick(root.querySelector('#call-close-btn'), endActiveCall));
      cleanups.push(bindControlClick(root.querySelector('#call-accept-btn'), acceptIncomingCall));
      cleanups.push(bindControlClick(root.querySelector('#call-reject-btn'), rejectIncomingCall));

      const volumeInput = root.querySelector('#call-remote-volume');
      const onVolumePointerDown = () => {
        callState.adjustingVolume = true;
      };
      const onVolumePointerUp = () => {
        callState.adjustingVolume = false;
      };
      const onVolumePointerCancel = () => {
        callState.adjustingVolume = false;
      };
      const onVolumeChange = () => {
        callState.adjustingVolume = false;
      };
      const onVolumeInput = (event) => {
        const nextVolume = Number(event.target.value);
        callState.remoteVolume = Number.isFinite(nextVolume) ? Math.min(1, Math.max(0, nextVolume)) : 1;
        syncRemoteMediaVolume();
      };
      volumeInput.addEventListener('pointerdown', onVolumePointerDown);
      volumeInput.addEventListener('pointerup', onVolumePointerUp);
      volumeInput.addEventListener('pointercancel', onVolumePointerCancel);
      volumeInput.addEventListener('change', onVolumeChange);
      volumeInput.addEventListener('input', onVolumeInput);
      cleanups.push(() => volumeInput.removeEventListener('pointerdown', onVolumePointerDown));
      cleanups.push(() => volumeInput.removeEventListener('pointerup', onVolumePointerUp));
      cleanups.push(() => volumeInput.removeEventListener('pointercancel', onVolumePointerCancel));
      cleanups.push(() => volumeInput.removeEventListener('change', onVolumeChange));
      cleanups.push(() => volumeInput.removeEventListener('input', onVolumeInput));

      const onResize = () => {
        if (callState.mobileExpanded && !isMobileCallViewport()) {
          exitMobileExpandedCallWindow(root).catch(() => { });
        }
        if (!callState.mobileExpanded && !callState.drag && !callState.resizing) {
          applyDefaultCallWindowPosition(root);
        }
        clampCallWindow(root);
      };
      window.addEventListener('resize', onResize);
      cleanups.push(() => window.removeEventListener('resize', onResize));

      if (typeof ResizeObserver === 'function') {
        const resizeObserver = new ResizeObserver((entries) => {
          const entry = entries?.[0];
          if (!entry || callState.minimized || root.classList.contains('hidden')) return;
          if (!root.classList.contains('call-window--video')) return;
          const nextWidth = Math.round(root.getBoundingClientRect().width || root.offsetWidth || 0);
          if (nextWidth >= getMinimumCallWindowWidth()) {
            callState.windowWidth = nextWidth;
          }
        });
        resizeObserver.observe(root);
        cleanups.push(() => resizeObserver.disconnect());
      }

      root.__callCleanup = () => {
        cleanups.forEach((cleanup) => {
          try { cleanup(); } catch (error) { }
        });
        root.__callCleanup = null;
      };

      return root;
    }

    function updateCallVolumeSliderVisual(volumeInput = ensureCallWindow().querySelector('#call-remote-volume')) {
      if (!volumeInput) {
        return;
      }

      const safeVolume = Number.isFinite(callState.remoteVolume) ? Math.min(1, Math.max(0, callState.remoteVolume)) : 1;
      const percent = Math.round(safeVolume * 100);
      volumeInput.style.setProperty('--call-volume-level', `${percent}%`);

      const volumeIcon = ensureCallWindow().querySelector('.call-window__volume-icon');
      if (volumeIcon) {
        volumeIcon.textContent = safeVolume <= 0.001 ? 'volume_off' : (safeVolume < 0.55 ? 'volume_down' : 'volume_up');
      }
    }

    function syncRemoteMediaVolume() {
      const root = ensureCallWindow();
      const remoteAudio = root.querySelector('#call-remote-audio');
      const remoteVideo = root.querySelector('#call-remote-video');
      const volumeInput = root.querySelector('#call-remote-volume');

      if (volumeInput && !callState.adjustingVolume) {
        volumeInput.value = String(callState.remoteVolume);
      }
      updateCallVolumeSliderVisual(volumeInput);
      if (remoteAudio) {
        remoteAudio.volume = callState.remoteVolume;
      }
      if (remoteVideo) {
        remoteVideo.muted = true;
        remoteVideo.volume = 0;
      }
    }

    function syncMinimizedCallWindowLayout(root = ensureCallWindow()) {
      if (!root) return;
      const stage = root.querySelector('#call-video-stage');
      const actions = root.querySelector('#call-actions-row');

      if (callState.minimized) {
        stage?.style.setProperty('display', 'none', 'important');
        actions?.style.setProperty('display', 'none', 'important');
        root.style.setProperty('min-height', '0', 'important');
        root.style.setProperty('height', 'auto', 'important');
        root.style.setProperty('max-height', 'none', 'important');
        root.style.removeProperty('--call-window-width');
        root.style.removeProperty('width');
        root.style.removeProperty('max-width');
        root.style.removeProperty('flex-basis');
      } else {
        stage?.style.removeProperty('display');
        actions?.style.removeProperty('display');
        root.style.removeProperty('min-height');
        root.style.removeProperty('height');
        root.style.removeProperty('max-height');
        if (callState.windowWidth && !callState.mobileExpanded) {
          root.style.setProperty('--call-window-width', `${callState.windowWidth}px`);
          root.style.setProperty('width', `${callState.windowWidth}px`, 'important');
          root.style.setProperty('max-width', 'calc(100vw - 1rem)', 'important');
          root.style.setProperty('flex-basis', `${callState.windowWidth}px`, 'important');
        }
      }
    }

    function hasLiveRemoteVideo() {
      return Boolean(
        callState.remoteStream
        && callState.remoteStream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted)
      );
    }

    function isPolitePeer() {
      return Number(callState.session?.receiver_id) === Number(user.id);
    }

    async function flushPendingIceCandidates() {
      const peer = callState.peerConnection;
      if (!peer?.remoteDescription) {
        return;
      }

      const pending = callState.pendingIceCandidates.splice(0);
      for (const candidate of pending) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.warn('No se pudo agregar ICE candidate en cola:', error);
        }
      }
    }

    function syncMediaElementStream(element, stream) {
      if (!element) {
        return;
      }

      if (element.srcObject !== stream) {
        element.srcObject = stream;
      }

      if (stream && typeof element.play === 'function') {
        element.play().catch(() => { });
      }
    }

    function updateCallRemoteVideoAspect(video = ensureCallWindow().querySelector('#call-remote-video')) {
      const root = ensureCallWindow();
      const remoteTrack = video?.srcObject?.getVideoTracks?.()?.find((track) => track.readyState === 'live') || null;
      const settings = remoteTrack?.getSettings?.() || {};
      const width = Number(video?.videoWidth || settings.width || 0);
      const height = Number(video?.videoHeight || settings.height || 0);
      if (!video || !width || !height) {
        root.classList.remove('call-window--remote-ready', 'call-window--remote-landscape', 'call-window--remote-portrait');
        root.style.removeProperty('--call-remote-aspect');
        return;
      }

      const ratio = width / height;
      const normalized = `${Math.max(1, Math.round(width))} / ${Math.max(1, Math.round(height))}`;
      callState.remoteVideoAspect = normalized;
      root.style.setProperty('--call-remote-aspect', normalized);
      root.classList.add('call-window--remote-ready');
      root.classList.toggle('call-window--remote-landscape', ratio >= 1);
      root.classList.toggle('call-window--remote-portrait', ratio < 1);
    }

    function bindCallRemoteVideoAspect(video) {
      if (!video || video.dataset.callAspectBound === '1') {
        return;
      }
      video.dataset.callAspectBound = '1';
      video.addEventListener('loadedmetadata', () => updateCallRemoteVideoAspect(video));
      video.addEventListener('resize', () => updateCallRemoteVideoAspect(video));
      video.addEventListener('playing', () => updateCallRemoteVideoAspect(video));
      video.addEventListener('canplay', () => updateCallRemoteVideoAspect(video));
    }

    function getLocalAudioTrack() {
      return callState.localStream?.getAudioTracks()?.[0] || null;
    }

    function getLocalVideoTrack() {
      return callState.localStream?.getVideoTracks()?.[0] || null;
    }

    async function tryPlayRemoteMedia() {
      const root = ensureCallWindow();
      const remoteAudio = root.querySelector('#call-remote-audio');
      const remoteVideo = root.querySelector('#call-remote-video');

      if (remoteAudio?.srcObject) {
        remoteAudio.play().catch(() => { });
      }
      if (remoteVideo?.srcObject) {
        remoteVideo.play().catch(() => { });
      }
    }

    function updateCallWindow() {
      const root = ensureCallWindow();
      const session = callState.session;
      const otherUser = callState.otherUser || {};
      const hasRemoteVideo = hasLiveRemoteVideo();
      const showVideoStage = true;
      const isIncomingRinging = session.status === 'ringing' && Number(session.receiver_id) === Number(user.id);
      const isOutgoingRinging = session.status === 'ringing' && Number(session.caller_id) === Number(user.id);
      const isVideoMode = callState.initialMode === 'video' || callState.localVideoEnabled || hasRemoteVideo;
      const showMicControl = session.status === 'accepted' || isOutgoingRinging;
      const showVideoControl = session.status === 'accepted' || (isOutgoingRinging && callState.initialMode === 'video');
      const showVolumeControl = session.status === 'accepted';
      const remoteAvatar = root.querySelector('#call-remote-avatar');
      const headerAvatar = root.querySelector('#call-avatar-badge');
      const qualityBadge = root.querySelector('#call-quality-badge');
      const stageMeter = root.querySelector('#call-stage-meter');
      const localBadge = root.querySelector('#call-local-badge');
      const localPreviewShell = root.querySelector('#call-local-preview-shell');
      const localPreviewPlaceholder = root.querySelector('#call-local-preview-placeholder');
      const modeBadge = root.querySelector('#call-mode-badge');
      const volumePill = root.querySelector('#call-volume-pill');
      const resizeHandle = root.querySelector('#call-resize-handle');
      const expandButton = root.querySelector('#call-expand-btn');
      const expandIcon = expandButton?.querySelector('.call-window__window-glyph');

      root.classList.toggle('hidden', !session);
      if (!session) {
        releaseCallRuntime();
        stopCallTimers();
        stopRingTone();
        return;
      }

      claimCallRuntime();

      root.classList.toggle('sm:w-[360px]', showVideoStage);
      root.classList.toggle('call-window--video', isVideoMode);
      root.classList.toggle('call-window--audio', !isVideoMode);
      root.classList.toggle('call-window--minimized', callState.minimized);
      root.classList.toggle('call-window--mobile-expanded', callState.mobileExpanded);
      root.classList.toggle('call-window--ringing', session.status === 'ringing');
      root.classList.toggle('call-window--accepted', session.status === 'accepted');
      root.classList.toggle('call-window--incoming', isIncomingRinging);
      root.classList.toggle('call-window--outgoing', isOutgoingRinging);
      if (callState.windowWidth && !callState.minimized && !callState.mobileExpanded) {
        root.style.setProperty('--call-window-width', `${callState.windowWidth}px`);
        root.style.setProperty('width', `${callState.windowWidth}px`, 'important');
        root.style.setProperty('max-width', 'calc(100vw - 1rem)', 'important');
        root.style.setProperty('flex-basis', `${callState.windowWidth}px`, 'important');
      } else if (!callState.minimized && !callState.mobileExpanded) {
        root.style.removeProperty('--call-window-width');
        root.style.removeProperty('width');
        root.style.removeProperty('max-width');
        root.style.removeProperty('flex-basis');
      }
      syncMinimizedCallWindowLayout(root);
      root.querySelector('#call-window-name').textContent = displayName(otherUser);
      root.querySelector('#call-window-status').textContent = describeCallStatus(session.status);
      root.querySelector('#call-video-stage').classList.toggle('hidden', callState.minimized || !showVideoStage);
      root.querySelector('#call-actions-row').classList.toggle('hidden', callState.minimized);
      root.querySelector('#call-accept-btn').classList.toggle('hidden', !isIncomingRinging);
      root.querySelector('#call-reject-btn').classList.toggle('hidden', !isIncomingRinging);
      root.querySelector('#call-toggle-video-btn').classList.toggle('hidden', !showVideoControl);
      root.querySelector('#call-toggle-mic-btn').classList.toggle('hidden', !showMicControl);
      volumePill.classList.toggle('hidden', !showVolumeControl);
      root.querySelector('#call-minimize-btn').classList.toggle('hidden', !showVideoStage);
      expandButton?.classList.toggle('hidden', !isMobileCallViewport() || callState.minimized);

      const micIcon = root.querySelector('#call-toggle-mic-btn .material-symbols-outlined');
      const videoIcon = root.querySelector('#call-toggle-video-btn .material-symbols-outlined');
      const minimizeIcon = root.querySelector('#call-minimize-btn .material-symbols-outlined');
      micIcon.textContent = callState.isMuted ? 'mic_off' : 'mic';
      videoIcon.textContent = callState.localVideoEnabled ? 'videocam' : 'videocam_off';
      if (minimizeIcon) {
        minimizeIcon.textContent = callState.minimized ? 'open_in_full' : 'remove';
      }
      if (expandButton && expandIcon) {
        expandIcon.textContent = callState.mobileExpanded ? '❐' : '□';
        expandButton.setAttribute('aria-label', callState.mobileExpanded ? 'Restaurar llamada' : 'Maximizar llamada');
        expandButton.setAttribute('title', callState.mobileExpanded ? 'Restaurar' : 'Maximizar');
      }

      const remoteVideo = root.querySelector('#call-remote-video');
      const localVideo = root.querySelector('#call-local-video');
      const remotePlaceholder = root.querySelector('#call-remote-placeholder');
      const remoteLabel = root.querySelector('#call-video-placeholder-label');
      bindCallRemoteVideoAspect(remoteVideo);
      updateCallRemoteVideoAspect(remoteVideo);
      if (headerAvatar) setAvatarElement(headerAvatar, otherUser);
      if (remoteAvatar) setAvatarElement(remoteAvatar, otherUser);
      if (modeBadge) modeBadge.textContent = isVideoMode ? 'VIDEO' : 'VOZ';
      if (qualityBadge) qualityBadge.classList.toggle('hidden', !isVideoMode);
      if (stageMeter) stageMeter.classList.toggle('hidden', !(session.status === 'accepted' && !isVideoMode));
      if (localPreviewShell) localPreviewShell.classList.toggle('hidden', !isVideoMode);
      if (localBadge) localBadge.classList.toggle('hidden', !isVideoMode);
      if (localPreviewPlaceholder) {
        localPreviewPlaceholder.classList.toggle('hidden', Boolean(callState.localVideoEnabled && callState.localStream));
      }
      if (resizeHandle) {
        const canResize = isVideoMode && !callState.minimized && !callState.mobileExpanded;
        resizeHandle.classList.toggle('hidden', !canResize);
      }

      remoteVideo.classList.toggle('hidden', !hasRemoteVideo);
      remotePlaceholder.classList.toggle('hidden', hasRemoteVideo);
      localVideo.classList.toggle('hidden', !(callState.localVideoEnabled && callState.localStream));
      remoteLabel.textContent = hasRemoteVideo ? '' : describeCallPlaceholderLabel(session.status, isVideoMode);
      if (session.status === 'ringing') {
        keepRingTonePlaying();
      } else {
        stopRingTone();
      }
      syncRemoteMediaVolume();
      clampCallWindow(root);
    }

    function describeCallStatus(status) {
      if (status === 'ringing') {
        return Number(callState.session?.caller_id) === Number(user.id)
          ? 'Llamando...'
          : (callState.initialMode === 'video' ? 'Videollamada entrante' : 'Llamada entrante');
      }
      if (status === 'accepted') {
        const duration = formatCallDuration();
        return `${callState.localVideoEnabled || hasLiveRemoteVideo() ? 'En llamada' : 'En llamada'}${duration ? ` · ${duration}` : ''}`;
      }
      if (status === 'missed') return 'Llamada perdida';
      if (status === 'rejected') return 'Llamada rechazada';
      if (status === 'ended') return 'Llamada finalizada';
      return 'Conectando...';
    }

    function describeCallPlaceholderLabel(status, isVideoMode = false) {
      if (status === 'ringing') {
        if (Number(callState.session?.caller_id) === Number(user.id)) {
          return isVideoMode ? 'Esperando respuesta...' : '';
        }
        return isVideoMode ? 'Llamada entrante' : '';
      }
      return 'Camara apagada';
    }

    function formatCallDuration() {
      if (!callState.startedAt) return '';
      const totalSeconds = Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function stopCallTimers() {
      if (callInboxTimer) {
        window.clearInterval(callInboxTimer);
        callInboxTimer = null;
      }
      if (callSessionTimer) {
        window.clearInterval(callSessionTimer);
        callSessionTimer = null;
      }
      if (callSignalTimer) {
        window.clearInterval(callSignalTimer);
        callSignalTimer = null;
      }
    }

    function cleanupPeerConnection() {
      if (
        hasForeignCallManager()
        && !callState.session
        && !callState.peerConnection
        && !callState.localStream
        && !callState.remoteStream
      ) {
        return;
      }

      if (callState.peerConnection) {
        try { callState.peerConnection.ontrack = null; } catch (error) { }
        try { callState.peerConnection.onicecandidate = null; } catch (error) { }
        try { callState.peerConnection.close(); } catch (error) { }
      }
      callState.peerConnection = null;
      callState.remoteStream = null;

      if (callState.localStream) {
        callState.localStream.getTracks().forEach((track) => track.stop());
      }
      callState.localStream = null;
      callState.localVideoEnabled = false;
      callState.isMuted = false;
      callState.cameraBusy = false;
      callState.makingOffer = false;
      callState.ignoreOffer = false;
      callState.pendingIceCandidates = [];
      callState.initialVideoSyncDone = false;
      callState.audioSender = null;
      callState.videoSender = null;
      callState.videoTransceiver = null;
      if (callState.audioContext) {
        callState.audioContext.close().catch(() => { });
      }
      callState.audioContext = null;
      callState.localAudioAnalyser = null;
      callState.localAudioMeterData = null;
      callState.remoteAudioAnalyser = null;
      callState.remoteAudioMeterData = null;
      stopAudioMeter();
      stopRingTone();

      const root = ensureCallWindow();
      syncMediaElementStream(root.querySelector('#call-remote-audio'), null);
      syncMediaElementStream(root.querySelector('#call-remote-video'), null);
      syncMediaElementStream(root.querySelector('#call-local-video'), null);
      syncRemoteMediaVolume();
      if (!callState.session) {
        releaseCallRuntime();
      }
    }

    async function ensureLocalStream(mode = 'audio') {
      const needsVideo = mode === 'video';
      if (!callState.localStream) {
        try {
          callState.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: needsVideo,
          });
        } catch (err) {
          // If device is busy (another app using mic/camera), release and retry once
          if (err.name === 'NotReadableError' || err.name === 'AbortError') {
            // Release any partial streams held by other contexts
            releaseCallRuntime();
            await new Promise(r => setTimeout(r, 600));
            callState.localStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: needsVideo,
            });
          } else {
            throw err;
          }
        }
      } else {
        if (!getLocalAudioTrack()) {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          audioStream.getAudioTracks().forEach((track) => callState.localStream.addTrack(track));
        }

        if (needsVideo && !getLocalVideoTrack()) {
          const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          videoStream.getVideoTracks().forEach((track) => callState.localStream.addTrack(track));
        }
      }

      callState.localVideoEnabled = Boolean(getLocalVideoTrack());

      ensureLocalAudioMeter();

      const root = ensureCallWindow();
      const localVideo = root.querySelector('#call-local-video');
      syncMediaElementStream(localVideo, callState.localStream);

      return callState.localStream;
    }

    function createPeerConnection() {
      if (callState.peerConnection) {
        return callState.peerConnection;
      }

      const peer = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
      const root = ensureCallWindow();
      if (!callState.remoteStream) {
        callState.remoteStream = new MediaStream();
      }

      peer.ontrack = (event) => {
        const incomingStream = event.streams?.[0] || null;
        if (incomingStream) {
          incomingStream.getTracks().forEach((track) => {
            const alreadyExists = callState.remoteStream.getTracks().some((item) => item.id === track.id);
            if (!alreadyExists) {
              callState.remoteStream.addTrack(track);
            }
          });
        }

        const trackAlreadyExists = callState.remoteStream.getTracks().some((item) => item.id === event.track.id);
        if (!trackAlreadyExists) {
          callState.remoteStream.addTrack(event.track);
        }

        syncMediaElementStream(root.querySelector('#call-remote-audio'), callState.remoteStream);
        const remoteVideo = root.querySelector('#call-remote-video');
        syncMediaElementStream(remoteVideo, callState.remoteStream);
        bindCallRemoteVideoAspect(remoteVideo);
        updateCallRemoteVideoAspect(remoteVideo);
        window.setTimeout(() => updateCallRemoteVideoAspect(remoteVideo), 180);
        window.setTimeout(() => updateCallRemoteVideoAspect(remoteVideo), 700);
        ensureRemoteAudioMeter();
        syncRemoteMediaVolume();
        tryPlayRemoteMedia();

        event.track.onunmute = () => {
          ensureRemoteAudioMeter();
          tryPlayRemoteMedia();
          updateCallWindow();
        };
        event.track.onmute = () => updateCallWindow();
        event.track.onended = () => {
          try {
            callState.remoteStream.removeTrack(event.track);
          } catch (error) { }
          updateCallWindow();
        };
        updateCallWindow();
      };

      peer.onicecandidate = (event) => {
        if (!event.candidate || !callState.session) return;
        ChatAPI.sendCallSignal(callState.session.id, 'ice-candidate', event.candidate.toJSON());
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          console.warn('La conexion WebRTC fallo');
        }
      };

      if (callState.localStream) {
        callState.localStream.getTracks().forEach((track) => {
          if (track.kind === 'audio') {
            callState.audioSender = peer.addTrack(track, callState.localStream);
          }
        });
      }

      const localVideoTrack = getLocalVideoTrack();
      callState.videoTransceiver = peer.addTransceiver(localVideoTrack || 'video', {
        direction: localVideoTrack ? 'sendrecv' : 'recvonly',
        streams: callState.localStream ? [callState.localStream] : [],
      });
      callState.videoSender = callState.videoTransceiver.sender;

      callState.peerConnection = peer;
      return peer;
    }

    async function renegotiateCall() {
      if (!callState.session || callState.session.status !== 'accepted' || callState.awaitingAnswer || callState.makingOffer) return;
      const peer = createPeerConnection();
      try {
        callState.makingOffer = true;
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await ChatAPI.sendCallSignal(callState.session.id, 'offer', serializeSessionDescription(peer.localDescription || offer));
        callState.awaitingAnswer = true;
      } finally {
        callState.makingOffer = false;
      }
    }

    async function applyRemoteSignal(signal) {
      const peer = createPeerConnection();
      const payload = signal.payload || null;

      if (signal.signal_type === 'offer' && payload) {
        const offerCollision = callState.makingOffer || peer.signalingState !== 'stable';
        callState.ignoreOffer = !isPolitePeer() && offerCollision;
        if (callState.ignoreOffer) {
          return;
        }

        if (offerCollision) {
          await Promise.all([
            peer.setLocalDescription({ type: 'rollback' }),
            peer.setRemoteDescription(new RTCSessionDescription(payload)),
          ]);
        } else {
          await peer.setRemoteDescription(new RTCSessionDescription(payload));
        }

        await flushPendingIceCandidates();

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await ChatAPI.sendCallSignal(callState.session.id, 'answer', serializeSessionDescription(peer.localDescription || answer));
        callState.awaitingAnswer = false;

        if (
          Number(callState.session?.receiver_id) === Number(user.id)
          && callState.initialMode === 'video'
          && callState.localVideoEnabled
          && !callState.initialVideoSyncDone
        ) {
          callState.initialVideoSyncDone = true;
          window.setTimeout(() => {
            renegotiateCall().catch((error) => console.warn('No se pudo sincronizar el video inicial:', error));
          }, 150);
        }
      } else if (signal.signal_type === 'answer' && payload) {
        try {
          const sameAnswer = peer.currentRemoteDescription?.type === 'answer'
            && peer.currentRemoteDescription?.sdp === payload.sdp;

          if (!callState.ignoreOffer && !sameAnswer && peer.signalingState === 'have-local-offer') {
            await peer.setRemoteDescription(new RTCSessionDescription(payload));
            await flushPendingIceCandidates();
          }
        } finally {
          callState.awaitingAnswer = false;
          callState.ignoreOffer = false;
        }
      } else if (signal.signal_type === 'ice-candidate' && payload) {
        if (!peer.remoteDescription) {
          callState.pendingIceCandidates.push(payload);
          return;
        }

        try {
          await peer.addIceCandidate(new RTCIceCandidate(payload));
        } catch (error) {
          if (!callState.ignoreOffer) {
            console.warn('No se pudo agregar ICE candidate:', error);
          }
        }
      }
    }

    function serializeSessionDescription(description) {
      if (!description) {
        return null;
      }

      return {
        type: description.type,
        sdp: description.sdp,
      };
    }

    function resetCallNegotiationState() {
      callState.outgoingOfferSent = false;
      callState.awaitingAnswer = false;
      callState.makingOffer = false;
      callState.ignoreOffer = false;
      callState.lastSignalId = 0;
    }

    async function beginWebRtcIfNeeded() {
      if (!callState.session || callState.session.status !== 'accepted') return;
      const needsVideo = callState.localVideoEnabled;
      const needsLocalStream =
        !callState.localStream
        || !getLocalAudioTrack()
        || (needsVideo && !getLocalVideoTrack());

      if (needsLocalStream) {
        await ensureLocalStream(needsVideo ? 'video' : 'audio');
      }
      const peer = createPeerConnection();

      if (Number(callState.session.caller_id) === Number(user.id) && !callState.outgoingOfferSent) {
        try {
          callState.makingOffer = true;
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await ChatAPI.sendCallSignal(callState.session.id, 'offer', serializeSessionDescription(peer.localDescription || offer));
          callState.outgoingOfferSent = true;
          callState.awaitingAnswer = true;
        } finally {
          callState.makingOffer = false;
        }
      }

      tryPlayRemoteMedia();
      updateCallWindow();
    }

    async function pollCallSignals() {
      if (!callState.session || callState.session.status !== 'accepted' || callSignalPollInFlight) return;
      const expectedSessionId = Number(callState.session.id);
      callSignalPollInFlight = true;
      try {
        const result = await ChatAPI.getCallSignals(expectedSessionId, callState.lastSignalId);
        if (!result?.ok) return;
        if (!callState.session || Number(callState.session.id) !== expectedSessionId) return;

        const signals = getList(result);
        for (const signal of signals) {
          if (!callState.session || Number(callState.session.id) !== expectedSessionId) {
            break;
          }
          callState.lastSignalId = Math.max(callState.lastSignalId, Number(signal.id || 0));
          await applyRemoteSignal(signal);
        }
      } finally {
        callSignalPollInFlight = false;
      }
    }

    async function pollActiveCallState() {
      if (!callState.session || callSessionPollInFlight) return;
      const expectedSessionId = Number(callState.session.id);
      callSessionPollInFlight = true;
      try {
        const result = await ChatAPI.getCall(expectedSessionId);
        if (!result?.ok) return;
        if (!callState.session || Number(callState.session.id) !== expectedSessionId) return;

        const nextSession = result.data || null;
        if (!nextSession) return;

        callState.session = nextSession;
        if (nextSession.status === 'ringing') {
          callState.initialMode = nextSession.mode || callState.initialMode;
        }
        updateCallWindow();

        if (nextSession.status === 'accepted') {
          if (!callState.startedAt) {
            callState.startedAt = Date.now();
          }
          await beginWebRtcIfNeeded();
        } else if (['rejected', 'ended', 'missed'].includes(nextSession.status)) {
          const isCaller = Number(nextSession.caller_id) === Number(user.id);
          const message = nextSession.status === 'rejected'
            ? 'La llamada fue rechazada'
            : nextSession.status === 'missed'
              ? (isCaller ? 'La llamada no fue respondida' : 'Tienes una llamada perdida')
              : 'La llamada termino';
          await finalizeCall(message);
        }
      } finally {
        callSessionPollInFlight = false;
      }
    }

    function presentIncomingCall(incoming) {
      if (!incoming || callState.session) {
        return false;
      }

      const callerId = Number(incoming.caller_id || 0);
      if (!callerId) {
        return false;
      }

      const caller =
        findConversationUser(callerId)
        || publicUsersState.map.get(callerId)
        || {
          id: callerId,
          full_name: `Usuario #${callerId}`,
          name: `Usuario #${callerId}`,
          faculty: '',
          career: '',
          school: '',
          avatar_url: null,
        };

      callState.session = incoming;
      callState.otherUser = resolveProfileData(caller);
      callState.mode = incoming.mode || 'audio';
      callState.initialMode = incoming.mode || 'audio';
      callState.status = incoming.status || 'ringing';
      callState.windowWidth = null;
      callState.minimized = false;
      callState.mobileExpanded = false;
      callState.mobileExpandedUsingFullscreen = false;
      callState.mobileExpandSnapshot = null;
      clearCallWindowExpandedStyles();
      applyDefaultCallWindowPosition();
      resetCallNegotiationState();
      updateCallWindow();
      keepRingTonePlaying();
      startActiveCallPolling();
      return true;
    }

    function startIncomingCallPolling() {
      if (callInboxTimer) return;
      callInboxTimer = window.setInterval(async () => {
        try {
          await pollPendingCallsOnce();
        } catch (error) {
          console.warn('Error de llamadas pendientes:', error);
        }
      }, CALL_INBOX_POLL_INTERVAL_MS);
    }

    async function pollPendingCallsOnce() {
      if (document.hidden || callState.session || callInboxPollInFlight) {
        return false;
      }

      callInboxPollInFlight = true;
      try {
        const result = await ChatAPI.getPendingCalls();
        if (!result?.ok) return false;

        const pending = getList(result);
        if (!pending.length) return false;

        return presentIncomingCall(pending[0]);
      } finally {
        callInboxPollInFlight = false;
      }
    }

    function handleCallRouteChange() {
      if (!callState.session) {
        return;
      }

      window.setTimeout(() => {
        if (!callState.session) {
          return;
        }

        const root = ensureCallWindow();
        syncMediaElementStream(root.querySelector('#call-remote-audio'), callState.remoteStream);
        syncMediaElementStream(root.querySelector('#call-remote-video'), callState.remoteStream);
        syncMediaElementStream(root.querySelector('#call-local-video'), callState.localStream);
        tryPlayRemoteMedia();
        updateCallWindow();
      }, 80);
    }

    function startActiveCallPolling() {
      if (!callState.session) return;

      if (!callSessionTimer) {
        callSessionTimer = window.setInterval(() => {
          pollActiveCallState().catch((error) => console.warn('Error de estado de llamada:', error));
        }, CALL_SESSION_POLL_INTERVAL_MS);
      }

      if (!callSignalTimer) {
        callSignalTimer = window.setInterval(() => {
          pollCallSignals().catch((error) => console.warn('Error de senales de llamada:', error));
        }, CALL_SIGNAL_POLL_INTERVAL_MS);
      }

      pollActiveCallState().catch((error) => console.warn('Error de estado de llamada:', error));
      pollCallSignals().catch((error) => console.warn('Error de senales de llamada:', error));
    }

    async function openOutgoingCall(mode) {
      if (!activeUser?.id) return;

      try {
        await ensureLocalStream(mode);
      } catch (error) {
        const busy = error?.name === 'NotReadableError' || error?.name === 'AbortError';
        showToast(busy
          ? (mode === 'video' ? 'Otro app usa el micrófono/cámara. Ciérrala e inténtalo de nuevo.' : 'Otro app usa el micrófono. Ciérralo e inténtalo de nuevo.')
          : (mode === 'video' ? 'Debes permitir microfono y camara para iniciar la videollamada' : 'Debes permitir el microfono para iniciar la llamada'),
          'error');
        return;
      }

      const result = await ChatAPI.startCall({ receiverId: activeUser.id, mode });
      if (!result?.ok) {
        showToast(result?.data?.error || 'No se pudo iniciar la llamada', 'error');
        cleanupPeerConnection();
        return;
      }

      callState.session = result.data;
      callState.otherUser = resolveProfileData(activeUser);
      callState.mode = mode === 'video' ? 'video' : 'audio';
      callState.initialMode = callState.mode;
      callState.windowWidth = null;
      callState.minimized = false;
      callState.mobileExpanded = false;
      callState.mobileExpandedUsingFullscreen = false;
      callState.mobileExpandSnapshot = null;
      clearCallWindowExpandedStyles();
      applyDefaultCallWindowPosition();
      resetCallNegotiationState();
      tryPlayRemoteMedia();
      updateCallWindow();
      startActiveCallPolling();
      pollActiveCallState().catch((error) => console.warn('Error de estado inicial de llamada:', error));
    }

    async function startOutgoingCallForUser(targetUser, mode) {
      activeUser = resolveProfileData(targetUser);
      await openOutgoingCall(mode);
    }

    async function acceptIncomingCall() {
      if (!callState.session) return;
      stopRingTone();
      try {
        await ensureLocalStream(callState.mode);
      } catch (error) {
        const busy = error?.name === 'NotReadableError' || error?.name === 'AbortError';
        showToast(busy
          ? (callState.mode === 'video' ? 'Otro app usa el micrófono/cámara. Ciérrala e inténtalo de nuevo.' : 'Otro app usa el micrófono. Ciérralo e inténtalo de nuevo.')
          : (callState.mode === 'video' ? 'Debes permitir microfono y camara para aceptar la videollamada' : 'Debes permitir el microfono para aceptar la llamada'),
          'error');
        return;
      }
      const result = await ChatAPI.acceptCall(callState.session.id);
      if (!result?.ok) {
        showToast(result?.data?.error || 'No se pudo aceptar la llamada', 'error');
        return;
      }

      callState.session = result.data;
      callState.startedAt = Date.now();
      resetCallNegotiationState();
      await beginWebRtcIfNeeded();
      tryPlayRemoteMedia();
      startActiveCallPolling();
      pollCallSignals().catch((error) => console.warn('Error de senales al aceptar la llamada:', error));
    }

    async function rejectIncomingCall() {
      if (!callState.session) return;
      await ChatAPI.rejectCall(callState.session.id);
      await finalizeCall('Llamada rechazada');
    }

    async function endActiveCall() {
      if (!callState.session || callState.isFinalizing) return;
      callState.isFinalizing = true;
      const sessionId = callState.session.id;
      const durationSeconds = callState.startedAt ? Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;
      ChatAPI.endCall(sessionId, durationSeconds).catch((error) => {
        console.warn('No se pudo cerrar la llamada en segundo plano:', error);
      });
      await finalizeCall('Llamada finalizada');
    }

    function endCallOnPageLeave() {
      if (!callState.session || callState.isFinalizing) {
        return;
      }

      const token = getToken();
      if (!token) {
        return;
      }

      callState.isFinalizing = true;
      const sessionId = callState.session.id;
      const durationSeconds = callState.startedAt ? Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;

      fetch(`${API.chat}/calls/${sessionId}/end`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ duration_seconds: durationSeconds }),
        keepalive: true,
      }).catch(() => { });
    }

    async function finalizeCall(toastMessage = '') {
      if (!callState.session && !callState.isFinalizing) {
        return;
      }
      const finalSession = callState.session ? { ...callState.session } : null;
      const shouldRefreshNotifications = Boolean(
        finalSession
        && finalSession.status === 'missed'
        && Number(finalSession.receiver_id) === Number(user.id)
        && typeof window.loadNotifications === 'function'
      );
      stopRingTone();
      cleanupPeerConnection();
      stopCallTimers();

      const root = ensureCallWindow();
      await exitCallWindowFullscreen(root);
      clearCallWindowExpandedStyles(root);
      root.classList.add('hidden');
      root.querySelector('#call-video-stage').classList.remove('hidden');
      root.querySelector('#call-window-status').textContent = 'Esperando...';
      root.querySelector('#call-toggle-mic-btn .material-symbols-outlined').textContent = 'mic';
      root.querySelector('#call-toggle-video-btn .material-symbols-outlined').textContent = 'videocam_off';
      root.querySelector('#call-local-video').classList.add('hidden');
      root.querySelector('#call-remote-video').classList.add('hidden');
      root.querySelector('#call-remote-placeholder').classList.remove('hidden');
      root.querySelector('#call-video-placeholder-label').textContent = 'Camara apagada';
      root.classList.remove('call-window--remote-ready', 'call-window--remote-landscape', 'call-window--remote-portrait');
      root.style.removeProperty('--call-remote-aspect');

      callState.session = null;
      callState.otherUser = null;
      callState.mode = 'audio';
      callState.initialMode = 'audio';
      callState.status = 'idle';
      callState.startedAt = 0;
      callState.pendingIncoming = null;
      callState.lastSignalId = 0;
      callState.drag = null;
      callState.minimized = false;
      callState.mobileExpanded = false;
      callState.mobileExpandedUsingFullscreen = false;
      callState.mobileExpandSnapshot = null;
      callState.windowWidth = null;
      callState.isFinalizing = false;
      callState.remoteVideoAspect = null;
      callState.videoSender = null;
      resetCallNegotiationState();
      releaseCallRuntime();

      if (ownsCallLifecycle) {
        startIncomingCallPolling();
        window.setTimeout(() => {
          pollPendingCallsOnce().catch((error) => console.warn('Error de recovery de llamada:', error));
        }, 150);
      } else {
        stopCallTimers();
        window.removeEventListener('hashchange', handleCallRouteChange);
        window.removeEventListener('pagehide', handleCallPageLeave);
        window.removeEventListener('beforeunload', handleCallPageLeave);
      }

      if (toastMessage) {
        showToast(toastMessage, 'success');
      }
      if (shouldRefreshNotifications) {
        window.loadNotifications().catch(() => { });
      }
    }

    async function toggleMicrophone() {
      if (!callState.localStream || !getLocalAudioTrack()) return;
      callState.isMuted = !callState.isMuted;
      callState.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !callState.isMuted;
      });
      startAudioMeter();
      updateCallWindow();
    }

    async function toggleCamera() {
      if (!callState.session || callState.session.status !== 'accepted' || callState.cameraBusy) return;
      callState.cameraBusy = true;
      const root = ensureCallWindow();
      const localVideo = root.querySelector('#call-local-video');
      const peer = createPeerConnection();

      try {
        if (!callState.localVideoEnabled) {
          const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = media.getVideoTracks()[0];

          if (!callState.localStream) {
            await ensureLocalStream('audio');
          }

          callState.localVideoEnabled = true;
          callState.localStream.addTrack(videoTrack);
          syncMediaElementStream(localVideo, callState.localStream);
          if (!callState.videoTransceiver) {
            callState.videoTransceiver = peer.addTransceiver('video', { direction: 'recvonly' });
            callState.videoSender = callState.videoTransceiver.sender;
          }
          callState.videoTransceiver.direction = 'sendrecv';
          await callState.videoSender.replaceTrack(videoTrack);

          await renegotiateCall();
        } else {
          callState.localVideoEnabled = false;
          if (callState.localStream) {
            callState.localStream.getVideoTracks().forEach((track) => {
              track.stop();
              callState.localStream.removeTrack(track);
            });
          }
          if (callState.videoTransceiver) {
            callState.videoTransceiver.direction = 'recvonly';
          }
          if (callState.videoSender?.replaceTrack) {
            await callState.videoSender.replaceTrack(null);
          }
          syncMediaElementStream(localVideo, callState.localStream);
          await renegotiateCall();
        }

        updateCallWindow();
      } finally {
        callState.cameraBusy = false;
      }
    }

    function updateUrlForChat(userId) {
      if (callManagerOnly) {
        return;
      }
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${buildHash('messages', userId ? { user: userId } : {})}`
      );
    }

    function getMessagePreview(message) {
      if (!message) return 'Empieza la conversacion';

      const content = String(message.content || '').trim();
      if (message.image_url && content) return `Imagen · ${content}`;
      if (message.image_url) return 'Imagen enviada';
      return content || 'Empieza la conversacion';
    }

    function buildConversationList(friendEntries, inboxEntries) {
      const inboxByUserId = new Map(
        inboxEntries.map((entry) => [Number(entry.contact_id), entry]).filter(([id]) => Number.isFinite(id))
      );

      return friendEntries
        .map((friend) => {
          const friendId = Number(friend.id);
          const inboxEntry = inboxByUserId.get(friendId) || null;
          return {
            other_user: resolveProfileData(friend),
            last_message: inboxEntry?.last_message || null,
            unread_count: Number(inboxEntry?.unread_count || 0),
          };
        })
        .sort((left, right) => {
          const leftDate = left.last_message?.created_at ? new Date(left.last_message.created_at).getTime() : 0;
          const rightDate = right.last_message?.created_at ? new Date(right.last_message.created_at).getTime() : 0;
          if (leftDate !== rightDate) return rightDate - leftDate;
          return displayName(left.other_user).localeCompare(displayName(right.other_user), 'es', { sensitivity: 'base' });
        });
    }

    function findConversationUser(userId) {
      return conversations.find((item) => Number(item.other_user?.id) === Number(userId))?.other_user || null;
    }

    function renderEmptyChatPanel(message) {
      chatPanel.innerHTML = `
        <div class="flex-1 flex items-center justify-center px-6">
          <p class="text-slate-400 text-sm text-center">${escapeHtml(message)}</p>
        </div>
      `;
    }

    function renderInbox() {
      if (!friends.length) {
        inboxList.innerHTML = '<p class="text-sm text-slate-400 p-4">Aun no tienes amigos para conversar.</p>';
        return;
      }

      if (!conversations.length) {
        inboxList.innerHTML = '<p class="text-sm text-slate-400 p-4">Aun no hay conversaciones, pero ya puedes escribir a tus amigos.</p>';
        return;
      }

      inboxList.innerHTML = conversations.map((conversation) => {
        const otherUser = conversation.other_user || {};
        const isActive = Number(otherUser.id) === Number(activeChat);
        return `
          <button type="button" class="w-full flex items-start gap-3 p-3 mx-2 my-1 ${isActive ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'} rounded-xl cursor-pointer transition-colors text-left" data-open-chat="${otherUser.id}">
            ${renderAvatar(otherUser, { sizeClass: 'w-12 h-12', textClass: 'text-white font-bold', showOnline: true })}
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-3 mb-1">
                <div class="min-w-0">
                  <h3 class="font-bold text-sm text-slate-900 truncate">${escapeHtml(displayName(otherUser))}</h3>
                  <p class="text-xs text-slate-500 truncate">${escapeHtml(careerLabel(otherUser) || otherUser.faculty || 'Amigo UPT')}</p>
                </div>
                ${conversation.unread_count > 0 ? `
                  <span class="min-w-[22px] h-6 px-2 inline-flex items-center justify-center rounded-full bg-[#1B2A6B] text-white text-[11px] font-bold">
                    ${conversation.unread_count}
                  </span>
                ` : ''}
              </div>
              <p class="text-sm text-slate-500 truncate">${escapeHtml(getMessagePreview(conversation.last_message))}</p>
            </div>
          </button>
        `;
      }).join('');
    }

    function updateMessagesMeta() {
      if (messagesSummary) {
        messagesSummary.textContent = friends.length
          ? `Tienes ${friends.length} ${friends.length === 1 ? 'amigo disponible' : 'amigos disponibles'} para chatear.`
          : 'Tus conversaciones con amigos apareceran aqui.';
      }

      if (messagesCount) {
        messagesCount.textContent = String(friends.length || 0);
        messagesCount.classList.toggle('hidden', !friends.length);
      }
    }

    function hasConversationChanged(nextMessages) {
      if (nextMessages.length !== currentMessages.length) {
        return true;
      }

      for (let index = 0; index < nextMessages.length; index += 1) {
        const current = currentMessages[index];
        const next = nextMessages[index];
        if (Number(current?.id) !== Number(next?.id)) {
          return true;
        }
        if (String(current?.content || '') !== String(next?.content || '')) {
          return true;
        }
        if (String(current?.image_url || '') !== String(next?.image_url || '')) {
          return true;
        }
        if (String(current?.created_at || '') !== String(next?.created_at || '')) {
          return true;
        }
      }

      return false;
    }

    function canAppendMessages(nextMessages) {
      if (!currentMessages.length || nextMessages.length <= currentMessages.length) {
        return false;
      }

      for (let index = 0; index < currentMessages.length; index += 1) {
        const current = currentMessages[index];
        const next = nextMessages[index];
        if (
          Number(current?.id) !== Number(next?.id)
          || String(current?.content || '') !== String(next?.content || '')
          || String(current?.image_url || '') !== String(next?.image_url || '')
          || String(current?.created_at || '') !== String(next?.created_at || '')
        ) {
          return false;
        }
      }

      return true;
    }

    function shouldAutoScroll(area) {
      if (!area) return false;
      const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
      return distanceFromBottom <= 80;
    }

    function renderMessages(messages, options = {}) {
      const area = chatPanel.querySelector('#messages-area');
      if (!area) return;
      const preserveScroll = options.preserveScroll === true;
      const autoScroll = !preserveScroll || shouldAutoScroll(area);

      if (!messages.length) {
        area.innerHTML = '<p class="text-center text-slate-400 text-sm">Todavia no hay mensajes. Escribe el primero.</p>';
        currentMessages = [];
        return;
      }

      area.innerHTML = messages.map((message) => {
        const isMine = Number(message.sender_id) === Number(user.id);
        const hasImage = Boolean(message.image_url);
        const hasContent = Boolean(String(message.content || '').trim());
        const bubbleClass = hasImage
          ? `${isMine ? 'bg-[#1B2A6B]/6 border border-[#1B2A6B]/10' : 'bg-white border border-slate-200'} overflow-hidden`
          : `${isMine ? 'bg-[#1B2A6B] text-white' : 'bg-white text-slate-800 border border-slate-200'} px-4 py-3`;

        return `
          <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}">
              <div class="rounded-2xl ${isMine ? 'rounded-br-sm' : 'rounded-bl-sm'} shadow-sm ${bubbleClass}">
                ${hasImage ? `
                  <img src="${safeUrl(message.image_url)}" alt="Imagen enviada" loading="lazy" decoding="async" class="block w-full max-w-[320px] max-h-[320px] object-cover ${hasContent ? '' : 'rounded-2xl'}"/>
                ` : ''}
                ${hasContent ? `
                  <div class="${hasImage ? 'px-4 py-3 text-sm leading-6 text-slate-800 content-rich' : `text-sm leading-6 content-rich ${isMine ? 'content-rich--inverse' : ''}` }">
                    ${renderTextWithMentions(message.content || '')}
                  </div>
                ` : ''}
              </div>
              <div class="mt-1 px-1 flex items-center gap-2">
                <span class="text-[11px] text-slate-500">${escapeHtml(formatClock(message.created_at))}</span>
                ${!isMine ? `
                  <button type="button" data-action="report-message" data-message-id="${message.id}" class="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                    Reportar
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      currentMessages = messages;
      if (autoScroll) {
        area.scrollTop = area.scrollHeight;
      }
    }

    function renderMessageBubble(message, options = {}) {
      const isMine = Number(message.sender_id) === Number(user.id);
      const hasImage = Boolean(message.image_url);
      const hasContent = Boolean(String(message.content || '').trim());
      const enterClass = options.enterAnimation ? ' message-bubble-enter' : '';
      const bubbleClass = hasImage
        ? `${isMine ? 'bg-[#1B2A6B]/6 border border-[#1B2A6B]/10' : 'bg-white border border-slate-200'} overflow-hidden`
        : `${isMine ? 'bg-[#1B2A6B] text-white' : 'bg-white text-slate-800 border border-slate-200'} px-4 py-3`;

      return `
        <div class="flex ${isMine ? 'justify-end' : 'justify-start'}${enterClass}">
          <div class="max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}">
            <div class="rounded-2xl ${isMine ? 'rounded-br-sm' : 'rounded-bl-sm'} shadow-sm ${bubbleClass}">
              ${hasImage ? `
                <img src="${safeUrl(message.image_url)}" alt="Imagen enviada" loading="lazy" decoding="async" class="block w-full max-w-[320px] max-h-[320px] object-cover ${hasContent ? '' : 'rounded-2xl'}"/>
              ` : ''}
              ${hasContent ? `
                <div class="${hasImage ? 'px-4 py-3 text-sm leading-6 text-slate-800 content-rich' : `text-sm leading-6 content-rich ${isMine ? 'content-rich--inverse' : ''}` }">
                  ${renderTextWithMentions(message.content || '')}
                </div>
              ` : ''}
            </div>
            <div class="mt-1 px-1 flex items-center gap-2">
              <span class="text-[11px] text-slate-500">${escapeHtml(formatClock(message.created_at))}</span>
              ${!isMine ? `
                <button type="button" data-action="report-message" data-message-id="${message.id}" class="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                  Reportar
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    function appendNewMessages(messages) {
      const area = chatPanel.querySelector('#messages-area');
      if (!area || !messages.length) return;

      const fragment = document.createDocumentFragment();
      messages.forEach((message) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderMessageBubble(message, { enterAnimation: true }).trim();
        fragment.appendChild(wrapper.firstElementChild);
      });
      area.appendChild(fragment);
      currentMessages = currentMessages.concat(messages);
      area.scrollTop = area.scrollHeight;
    }

    function refreshActiveChatPresenceLabel() {
      if (!activeUser?.id) {
        return;
      }

      const liveUser = publicUsersState.map.get(Number(activeUser.id));
      if (liveUser) {
        activeUser = resolveProfileData(liveUser);
      }

      const headerPresence = chatPanel.querySelector('p.text-sm.text-slate-500.truncate');
      if (!headerPresence) {
        return;
      }

      headerPresence.textContent = `${careerLabel(activeUser) || 'Amigo UPT'} · ${presenceLabel(activeUser)}`;
    }

    function updateConversationPreview(messages) {
      if (!activeChat || !activeUser) {
        return;
      }

      const lastMessage = messages[messages.length - 1] || null;
      const activeChatId = Number(activeChat);
      const liveUser = publicUsersState.map.get(activeChatId);
      const nextUser = resolveProfileData(liveUser || activeUser);

      conversations = conversations
        .map((entry) => {
          if (Number(entry?.other_user?.id) !== activeChatId) {
            return entry;
          }

          return {
            ...entry,
            other_user: nextUser,
            last_message: lastMessage,
            unread_count: 0,
          };
        })
        .sort((left, right) => {
          const leftDate = new Date(left?.last_message?.created_at || 0).getTime();
          const rightDate = new Date(right?.last_message?.created_at || 0).getTime();
          return rightDate - leftDate;
        });

      activeUser = nextUser;
      renderInbox();
      refreshActiveChatPresenceLabel();
    }

    async function loadConversation(userId, otherUser = findConversationUser(userId)) {
      const numericUserId = Number(userId);
      if (!numericUserId) return;
      const conversationToken = ++activeConversationToken;

      const friendProfile = otherUser ? resolveProfileData(otherUser) : findConversationUser(numericUserId);
      if (!friendProfile?.id) {
        clearActiveConversationState();
        renderInbox();
        renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        syncMessagesResponsiveLayout();
        showToast('Solo puedes chatear con tus amigos', 'error');
        return;
      }

      activeChat = numericUserId;
      activeUser = friendProfile;
      mobileChatOpen = true;
      currentMessages = [];
      updateUrlForChat(numericUserId);
      renderInbox();
      syncMessagesResponsiveLayout();

      chatPanel.innerHTML = `
        <div class="flex items-center gap-3 p-3 sm:p-4 bg-white border-b border-slate-200 shrink-0">
          <button id="back-to-inbox-btn" type="button" class="lg:hidden w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-700 shrink-0" title="Volver a conversaciones">
            <span class="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          ${renderAvatar(friendProfile, { sizeClass: 'w-12 h-12', textClass: 'text-white font-bold', showOnline: true })}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="font-bold text-slate-900 text-base sm:text-lg leading-tight">${escapeHtml(displayName(friendProfile))}</h2>
              ${friendProfile.faculty ? `
                <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${userColor(friendProfile)}">
                  ${escapeHtml(friendProfile.faculty)}
                </span>
                ` : ''}
              </div>
            <p class="text-sm text-slate-500 truncate">${escapeHtml(`${careerLabel(friendProfile) || 'Amigo UPT'} · ${presenceLabel(friendProfile)}`)}</p>
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <button id="start-audio-call-btn" type="button" class="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-700" title="Llamada">
              <span class="material-symbols-outlined text-[22px]">call</span>
            </button>
            <button id="start-video-call-btn" type="button" class="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-700" title="Videollamada">
              <span class="material-symbols-outlined text-[22px]">videocam</span>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-3 custom-scrollbar" id="messages-area">
          <p class="text-center text-slate-400 text-sm">Cargando mensajes...</p>
        </div>
        <div class="p-4 bg-white border-t border-slate-200 shrink-0">
          <div class="flex items-end gap-3">
            <textarea id="msg-input" enterkeyhint="send" class="flex-1 bg-slate-100 border border-slate-200 rounded-[1.4rem] px-4 py-3 text-sm focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none min-h-[50px] max-h-36" placeholder="Escribe un mensaje para ${escapeHtml(displayName(friendProfile))}..." rows="1"></textarea>
            <button id="send-msg-btn" type="button" class="w-11 h-11 rounded-full bg-[#D4A017] flex items-center justify-center text-white hover:bg-[#b88a14] transition-colors shrink-0 shadow-sm">
              <span class="material-symbols-outlined text-[20px] ml-0.5">send</span>
            </button>
          </div>
        </div>
      `;

      const area = chatPanel.querySelector('#messages-area');
      const backToInboxButton = chatPanel.querySelector('#back-to-inbox-btn');
      const input = chatPanel.querySelector('#msg-input');
      const sendButton = chatPanel.querySelector('#send-msg-btn');
      const startAudioCallButton = chatPanel.querySelector('#start-audio-call-btn');
      const startVideoCallButton = chatPanel.querySelector('#start-video-call-btn');

      backToInboxButton?.addEventListener('click', () => {
        exitMobileConversationView();
      });

      async function sendMessage() {
        const content = input.value.trim();
        if (!activeChat || !content) return;

        sendButton.disabled = true;

        const result = await ChatAPI.sendMessage({
          receiverId: activeChat,
          content,
        });

        sendButton.disabled = false;

        if (!result?.ok) {
          showToast(result?.data?.error || 'Error al enviar el mensaje', 'error');
          setTimeout(() => {
            const nextInput = chatPanel.querySelector('#msg-input');
            nextInput?.focus();
          }, 0);
          return;
        }

        const createdMessage = result?.data && typeof result.data === 'object'
          ? result.data
          : {
            sender_id: Number(user.id),
            receiver_id: Number(activeChat),
            content,
            image_url: null,
            created_at: new Date().toISOString(),
          };

        input.value = '';
        input.style.height = 'auto';
        appendNewMessages([createdMessage]);
        updateConversationPreview(currentMessages);
        loadInbox(false).catch(() => {});
        setTimeout(() => {
          const nextInput = chatPanel.querySelector('#msg-input');
          nextInput?.focus();
          if (nextInput) {
            nextInput.style.height = 'auto';
            nextInput.style.height = `${Math.min(nextInput.scrollHeight, 144)}px`;
          }
        }, 0);
        startChatPolling();
      }
      sendButton.addEventListener('click', sendMessage);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
      });
      area.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action="report-message"]');
        if (!button) return;
        await reportContent('mensaje', Number(button.dataset.messageId));
      });
      startAudioCallButton?.addEventListener('click', async () => {
        if (window.__uptCallManager?.startOutgoingCall) {
          await window.__uptCallManager.startOutgoingCall(friendProfile, 'audio');
          return;
        }
        await openOutgoingCall('audio');
      });
      startVideoCallButton?.addEventListener('click', async () => {
        if (window.__uptCallManager?.startOutgoingCall) {
          await window.__uptCallManager.startOutgoingCall(friendProfile, 'video');
          return;
        }
        await openOutgoingCall('video');
      });

      const result = await ChatAPI.getConversation(numericUserId);
      if (conversationToken !== activeConversationToken) {
        return;
      }
      if (!result?.ok) {
        if (result?.status === 403) {
          clearActiveConversationState();
          renderInbox();
          renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
          syncMessagesResponsiveLayout();
        } else {
          area.innerHTML = '<p class="text-center text-slate-400 text-sm">No se pudo cargar la conversacion.</p>';
        }
        return;
      }

      renderMessages(getList(result), { preserveScroll: false });
      startChatPolling();
    }

    async function openChatByUserId(userId) {
      const numericUserId = Number(userId);
      if (!numericUserId) return;

      const otherUser = findConversationUser(numericUserId);
      if (!otherUser) {
        showToast('Solo puedes chatear con tus amigos', 'error');
        clearActiveConversationState();
        renderInbox();
        renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        syncMessagesResponsiveLayout();
        return;
      }

      await loadConversation(numericUserId, otherUser);
    }

    async function refreshActiveConversation() {
      if (!activeChat || !activeUser) {
        return;
      }

      const area = chatPanel.querySelector('#messages-area');
      if (!area) {
        return;
      }

      const result = await ChatAPI.getConversation(activeChat);
      if (!result?.ok) {
        if (result?.status === 403) {
          clearActiveConversationState();
          renderInbox();
          renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
          syncMessagesResponsiveLayout();
        }
        return;
      }

      const nextMessages = getList(result);
      if (hasConversationChanged(nextMessages)) {
        if (canAppendMessages(nextMessages)) {
          appendNewMessages(nextMessages.slice(currentMessages.length));
        } else {
          renderMessages(nextMessages, { preserveScroll: true });
        }
        updateConversationPreview(nextMessages);
      }
    }

    function stopChatPolling() {
      if (chatPollTimer) {
        window.clearInterval(chatPollTimer);
        chatPollTimer = null;
      }
      chatPollInFlight = false;
    }

    function startChatPolling() {
      stopChatPolling();
      chatPollTimer = window.setInterval(async () => {
        if (chatPollInFlight || !activeChat || !activeUser) {
          return;
        }

        if (document.hidden) {
          return;
        }

        chatPollInFlight = true;
        try {
          await refreshActiveConversation();
        } finally {
          chatPollInFlight = false;
        }
      }, CHAT_POLL_INTERVAL_MS);
    }

    async function loadInbox(shouldRestoreActiveChat = true) {
      await ensurePublicUsersLoaded();

      const [friendsResult, inboxResult] = await Promise.all([
        SocialAPI.getFriends(),
        ChatAPI.getInbox(),
      ]);

      if (!friendsResult?.ok) {
        inboxList.innerHTML = '<p class="text-sm text-slate-400 p-4">No se pudieron cargar tus amigos.</p>';
        renderEmptyChatPanel('No se pudo cargar la bandeja de mensajes.');
        return;
      }

      const friendEntries = normalizeFriendEntries(getList(friendsResult))
        .filter((entry) => Number(entry.id) !== Number(user.id));

      friends = friendEntries;
      conversations = buildConversationList(friendEntries, getList(inboxResult));
      updateMessagesMeta();
      renderInbox();

      if (!friends.length) {
        clearActiveConversationState();
        renderEmptyChatPanel('Aun no tienes amigos aceptados para conversar.');
        syncMessagesResponsiveLayout();
        return;
      }

      if (!shouldRestoreActiveChat) {
        return;
      }

      if (activeChat) {
        const selectedFriend = findConversationUser(activeChat);
        if (selectedFriend) {
          await loadConversation(activeChat, selectedFriend);
          startChatPolling();
          return;
        }

        clearActiveConversationState();
        showToast('Ese chat solo esta disponible para amigos aceptados', 'error');
      }

      stopChatPolling();
      renderEmptyChatPanel('Selecciona un amigo para empezar a conversar.');
      syncMessagesResponsiveLayout();
    }

    async function handleFriendshipChanged() {
      await loadInbox(Boolean(activeChat || activeUser));
    }

    async function handleBlocksChanged() {
      await loadInbox(Boolean(activeChat || activeUser));
    }

    async function handlePresenceUpdated() {
      renderInbox();
      refreshActiveChatPresenceLabel();
    }

    function handleMessagesVisibilityChange() {
      if (document.hidden) {
        return;
      }

      if (!activeChat || !activeUser || chatPollInFlight) {
        return;
      }

      chatPollInFlight = true;
      refreshActiveConversation().finally(() => {
        chatPollInFlight = false;
      });
    }

    function handleCallPageLeave() {
      endCallOnPageLeave();
    }

    function handleMessagesViewportResize() {
      if (isMessagesMobileViewport() && activeChat) {
        mobileChatOpen = true;
      }
      syncMessagesResponsiveLayout();
    }

    function detachCallRouteLifecycle() {
      window.removeEventListener('hashchange', handleCallRouteChange);
      window.removeEventListener('pagehide', handleCallPageLeave);
      window.removeEventListener('beforeunload', handleCallPageLeave);
    }

    inboxList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-chat]');
      if (!button) return;
      openChatByUserId(button.dataset.openChat);
    });

    const ownsCallLifecycle = callManagerOnly || !hasForeignCallManager();
    if (ownsCallLifecycle) {
      window.__uptCallManager = {
        id: callRuntimeId,
        isActive: () => Boolean(callState.session),
        startOutgoingCall: (targetUser, mode) => startOutgoingCallForUser(targetUser, mode),
        consumeIncomingCall: (incoming) => presentIncomingCall(incoming),
        pollPendingCallsOnce: () => pollPendingCallsOnce(),
      };
    }
    window.addEventListener('friendship:changed', handleFriendshipChanged);
    window.addEventListener('blocks:changed', handleBlocksChanged);
    window.addEventListener('presence:updated', handlePresenceUpdated);
    window.addEventListener('resize', handleMessagesViewportResize);
    document.addEventListener('visibilitychange', handleMessagesVisibilityChange);
    document.addEventListener('pointerdown', primeRingToneFromGesture, { once: true, passive: true });
    document.addEventListener('keydown', primeRingToneFromGesture, { once: true });
    if (ownsCallLifecycle) {
      window.addEventListener('hashchange', handleCallRouteChange);
      window.addEventListener('pagehide', handleCallPageLeave);
      window.addEventListener('beforeunload', handleCallPageLeave);
      ensureCallWindow();
      startIncomingCallPolling();
    }
    loadInbox(Boolean(activeChat));
    syncMessagesResponsiveLayout();

    return () => {
      stopChatPolling();
      if (!callState.session) {
        stopCallTimers();
        cleanupPeerConnection();
      }
      window.removeEventListener('friendship:changed', handleFriendshipChanged);
      window.removeEventListener('blocks:changed', handleBlocksChanged);
      window.removeEventListener('presence:updated', handlePresenceUpdated);
      window.removeEventListener('resize', handleMessagesViewportResize);
      document.removeEventListener('visibilitychange', handleMessagesVisibilityChange);
      document.removeEventListener('pointerdown', primeRingToneFromGesture);
      document.removeEventListener('keydown', primeRingToneFromGesture);
      if (ownsCallLifecycle && !callState.session) {
        detachCallRouteLifecycle();
      }
    };
  }

  const views = {
    feed: {
      title: 'Feed',
      activeNav: 'feed',
      templatePath: '/pages/feed.html',
      templateSlots() {
        return {
          feedInitialSkeleton: renderListSkeleton(3, { lines: ['100%', '92%', '54%'], avatar: true, media: true }),
        };
      },
      mount({ container, user, params, router }) {
        const selectedComposerMedia = {
          file: null, previewUrl: '', kind: null,
          previewReady: false, previewLoading: false,
          uploadInProgress: false, uploadProgress: 0,
          // Pre-upload state
          preUploadAbortController: null,
          preUploadResult: null,
          preUploadInProgress: false,
          preUploadProgress: 0,
        };
        let pendingDeleteId = null;
        let pendingCommentId = null;
        let currentCommentSort = 'newest';
        let feedPosts = [];
        let pendingFeedPosts = [];
        let pendingFeedMeta = null;
        let feedRefreshTimer = null;
        let commentPollTimer = null;
        let feedLoadPromise = null;
        let feedLoadMorePromise = null;
        let feedObserver = null;
        let feedPagination = getClientPaginationMeta(0, 1, 20);
        let lastFeedLoadFinishedAt = 0;
        let latestAppliedFeedSignature = '';
        let latestPendingFeedSignature = '';
        const FEED_PER_PAGE = 20;

        const composerAvatar = container.querySelector('#composer-avatar');
        const postsContainer = container.querySelector('#feed-posts');
        const feedLoadMoreSentinel = container.querySelector('#feed-load-more-sentinel');
        const feedLoadMoreLabel = container.querySelector('#feed-load-more-label');
        const newPostsBanner = container.querySelector('#feed-new-posts-banner');
        const applyNewPostsButton = container.querySelector('#feed-apply-new-posts-btn');
        const onlineFriends = container.querySelector('#online-friends');
        const fileInput = container.querySelector('#file-input');
        const cameraPhotoInput = container.querySelector('#camera-photo-input');
        const cameraVideoInput = container.querySelector('#camera-video-input');
        const cameraCaptureMenu = container.querySelector('#camera-capture-menu');
        const previewWrap = container.querySelector('#img-preview-wrap');
        const previewImage = container.querySelector('#img-preview');
        const previewVideo = container.querySelector('#video-preview');
        const postContent = container.querySelector('#post-content');
        const postVisibility = container.querySelector('#post-visibility');
        const postVisibilityTrigger = container.querySelector('#post-visibility-trigger');
        const postVisibilityText = container.querySelector('#post-visibility-text');
        const postVisibilityMenu = container.querySelector('#post-visibility-menu');
        const deleteModal = container.querySelector('#delete-modal');
        const commentModal = container.querySelector('#comment-modal');
        const livestreamModal = container.querySelector('#livestream-modal');
        const commentPostPreview = container.querySelector('#comment-post-preview');
        const commentList = container.querySelector('#comment-list');
        const commentSort = container.querySelector('#comment-sort');
        const commentInput = container.querySelector('#comment-input');
        const publishButton = container.querySelector('#btn-publish');
        const openLiveModalButton = container.querySelector('#open-live-modal-btn');
        const liveTitleInput = container.querySelector('#live-title-input');
        const postMentionController = createMentionAutocomplete(postContent);
        const commentMentionController = createMentionAutocomplete(commentInput);

        const confirmLiveCreateButton = container.querySelector('#confirm-live-create-btn');
        const liveScreenOption = container.querySelector('#live-screen-option');
        const visibilityLabels = {
          all: 'Toda la comunidad UPT',
          friends: 'Solo amigos',
          faculty: 'Solo mi facultad',
        };
        const syncCommentSortChips = bindCommentSortChips(commentModal, commentSort, (value) => {
          if (!pendingCommentId) return;
          loadComments(pendingCommentId, value, { preserveScroll: false });
        });

        setAvatarElement(composerAvatar, user);

        function cancelPreUpload() {
          if (selectedComposerMedia.preUploadAbortController) {
            try { selectedComposerMedia.preUploadAbortController.abort(); } catch (_) {}
            selectedComposerMedia.preUploadAbortController = null;
          }
          if (selectedComposerMedia.preUploadResult?.ok) {
            const { image_url, video_url } = selectedComposerMedia.preUploadResult;
            PostsAPI.cancelPreuploadedPostMedia({ imageUrl: image_url, videoUrl: video_url }).catch((err) => {
              console.warn('Error al cancelar preupload en servidor:', err);
            });
          }
          selectedComposerMedia.preUploadResult = null;
          selectedComposerMedia.preUploadInProgress = false;
          selectedComposerMedia.preUploadProgress = 0;
        }

        function clearImage() {
          cancelPreUpload();
          clearComposerMediaSelection(selectedComposerMedia, {
            fileInput,
            cameraInput: cameraPhotoInput,
            extraInputs: [cameraPhotoInput, cameraVideoInput],
            previewWrap,
            previewImage,
            previewVideo,
            onStateChange: () => syncComposerPublishButton(publishButton, postContent, selectedComposerMedia),
          });
        }

        function startPreUpload(file) {
          cancelPreUpload();
          selectedComposerMedia.preUploadResult = null;
          selectedComposerMedia.preUploadInProgress = true;
          selectedComposerMedia.preUploadProgress = 0;

          const controller = new AbortController();
          selectedComposerMedia.preUploadAbortController = controller;

          // Show subtle upload progress on the preview overlay
          setComposerPreviewOverlay(previewWrap, {
            visible: true,
            progress: 0,
            label: 'Subiendo...',
          });
          syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);

          PostsAPI.preuploadPostMedia({
            mediaFile: file,
            onUploadProgress: ({ percent }) => {
              if (controller.signal.aborted) return;
              const p = Number.isFinite(Number(percent)) ? Number(percent) : 0;
              selectedComposerMedia.preUploadProgress = p;
              const isProcessing = p >= 99;
              setComposerPreviewOverlay(previewWrap, {
                visible: true,
                progress: isProcessing ? null : p,
                label: isProcessing ? 'Procesando archivo...' : 'Subiendo...',
              });
              syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
            },
          }).then((result) => {
            if (controller.signal.aborted) return;
            selectedComposerMedia.preUploadInProgress = false;
            selectedComposerMedia.preUploadAbortController = null;
            if (result?.ok && result.data) {
              selectedComposerMedia.preUploadResult = result.data;
              setComposerPreviewOverlay(previewWrap, { visible: false });
              syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
            } else {
              // Pre-upload failed silently — will retry on publish
              selectedComposerMedia.preUploadResult = null;
              setComposerPreviewOverlay(previewWrap, { visible: false });
              syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
            }
          }).catch(() => {
            if (controller.signal.aborted) return;
            selectedComposerMedia.preUploadInProgress = false;
            selectedComposerMedia.preUploadAbortController = null;
            selectedComposerMedia.preUploadResult = null;
            setComposerPreviewOverlay(previewWrap, { visible: false });
            syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
          });
        }

        function handleComposerImageFile(file) {
          if (!file) return;
          const validation = validateSupportedPostMediaFile(file);
          if (!validation.ok) {
            clearImage();
            showToast(validation.error, 'error');
            return;
          }
          applyComposerMediaSelection(file, selectedComposerMedia, {
            previewWrap,
            previewImage,
            previewVideo,
            onStateChange: () => syncComposerPublishButton(publishButton, postContent, selectedComposerMedia),
          });
          // Start uploading immediately after preview is ready
          startPreUpload(file);
        }

        function setPostVisibility(value = 'all') {
          if (postVisibility) postVisibility.value = value;
          if (postVisibilityText) postVisibilityText.textContent = visibilityLabels[value] || visibilityLabels.all;
          if (postVisibilityMenu) {
            postVisibilityMenu.querySelectorAll('[data-visibility-option]').forEach((option) => {
              option.classList.toggle('is-active', option.dataset.visibilityOption === value);
            });
          }
        }

        function closeVisibilityMenu() {
          if (!postVisibilityMenu || !postVisibilityTrigger) return;
          postVisibilityMenu.classList.add('hidden');
          postVisibilityTrigger.setAttribute('aria-expanded', 'false');
        }

        function toggleVisibilityMenu() {
          if (!postVisibilityMenu || !postVisibilityTrigger) return;
          const willOpen = postVisibilityMenu.classList.contains('hidden');
          postVisibilityMenu.classList.toggle('hidden', !willOpen);
          postVisibilityTrigger.setAttribute('aria-expanded', String(willOpen));
        }

        function findFeedPost(postId) {
          return feedPosts.find((post) => Number(post.id) === Number(postId)) || null;
        }

        function renderCommentModalPost(postId = pendingCommentId) {
          commentPostPreview.innerHTML = renderPostModalPreview(findFeedPost(postId), user.id);
        }

        function openCommentModal(postId) {
          pendingCommentId = Number(postId);
          commentInput.value = '';
          commentInput.style.height = '';
          commentMentionController.clear();
          commentSort.value = currentCommentSort;
          syncCommentSortChips(currentCommentSort);
          commentModal.classList.remove('hidden');
          commentModal.classList.add('flex');
          renderCommentModalPost(pendingCommentId);
          if (commentPollTimer) {
            window.clearInterval(commentPollTimer);
            commentPollTimer = null;
          }
          loadComments(pendingCommentId, currentCommentSort, { preserveScroll: false });
          setTimeout(() => commentInput.focus(), 60);
          // Re-sync adaptive video heights once modal layout has settled
          setTimeout(() => refreshAdaptiveMediaFrames(), 80);
          setTimeout(() => refreshAdaptiveMediaFrames(), 320);
        }

        function canDeleteFeedComment(comment) {
          return Number(comment.user_id) === Number(user.id) || user?.role === 'admin' || appState.user?.role === 'admin';
        }

        function closeCommentModal() {
          pendingCommentId = null;
          commentMentionController.clear();
          if (commentPollTimer) {
            window.clearInterval(commentPollTimer);
            commentPollTimer = null;
          }
          commentPostPreview.innerHTML = '';
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>';
          commentModal.classList.add('hidden');
          commentModal.classList.remove('flex');
        }

        function openDeleteModal(postId) {
          pendingDeleteId = postId;
          deleteModal.classList.remove('hidden');
        }

        function closeDeleteModal() {
          pendingDeleteId = null;
          deleteModal.classList.add('hidden');
        }

        function openLivestreamModal() {
          livestreamModal.classList.remove('hidden');
          livestreamModal.classList.add('flex');
          liveTitleInput.value = '';

          if (!isDesktopClient() && liveScreenOption) {
            liveScreenOption.classList.add('hidden');
            const cameraOption = livestreamModal.querySelector('input[name="live-source"][value="camera"]');
            if (cameraOption) cameraOption.checked = true;
          } else if (liveScreenOption) {
            liveScreenOption.classList.remove('hidden');
          }
        }

        function closeLivestreamModal() {
          livestreamModal.classList.add('hidden');
          livestreamModal.classList.remove('flex');
        }

        async function loadComments(postId = pendingCommentId, sort = currentCommentSort, { preserveScroll = true } = {}) {
          if (!postId) return;

          currentCommentSort = sort;
          commentSort.value = sort;
          syncCommentSortChips(sort);
          if (!preserveScroll) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Cargando comentarios...</p>';
          }

          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          const comments = getList(result);

          if (!result?.ok) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          if (!comments.length) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Todavia no hay comentarios en esta publicacion.</p>';
            return;
          }

          const previousScroll = commentList.scrollTop;
          commentList.innerHTML = comments.map((comment) => renderCommentCard(comment, {
            deleteAction: canDeleteFeedComment(comment) ? 'delete-comment' : '',
          })).join('');
          refreshRelativeTimeLabels(commentList);

          if (preserveScroll) {
            commentList.scrollTop = previousScroll;
          }
        }

        function applyFeedPosts(posts, options = {}) {
          const isInitialLoad = options.isInitialLoad === true;
          feedPosts = posts;
          if (!posts.length) {
            postsContainer.innerHTML = '<p class="text-center text-slate-400 py-8">No hay publicaciones todavia. Se el primero.</p>';
            updateFeedLoadMoreState();
            return;
          }

          const feedRoot = postsContainer?.closest?.('#app-view') ?? postsContainer?.parentElement;
          if (isInitialLoad && feedRoot) {
            feedRoot.classList.add('feed-initial-load');
            setTimeout(() => feedRoot.classList.remove('feed-initial-load'), 800);
          }

          postsContainer.innerHTML = posts.map((post) => renderPostCard(post, user.id)).join('');
          updateFeedLoadMoreState();
          if (pendingCommentId) {
            renderCommentModalPost(pendingCommentId);
          }
        }

        async function ensureFeedPostAvailable(postId) {
          const numericPostId = Number(postId);
          if (!Number.isFinite(numericPostId) || numericPostId <= 0) {
            return null;
          }

          const existing = findFeedPost(numericPostId);
          if (existing) {
            return existing;
          }

          const result = await PostsAPI.getPost(numericPostId);
          if (!result?.ok || !result.data) {
            return null;
          }

          const post = result.data;
          const nextPosts = [post, ...feedPosts.filter((entry) => Number(entry.id) !== numericPostId)];
          latestAppliedFeedSignature = buildFeedPageSignature(nextPosts);
          applyFeedPosts(nextPosts);
          return post;
        }

        async function maybeOpenFeedRoutePost() {
          const routePostId = Number(params?.post || 0);
          if (!Number.isFinite(routePostId) || routePostId <= 0) {
            return;
          }

          const post = await ensureFeedPostAvailable(routePostId);
          if (!post) {
            return;
          }

          openCommentModal(routePostId);
        }

        function mergeFeedPages(firstPosts, existingPosts = feedPosts) {
          const firstPageIds = new Set(firstPosts.map((post) => Number(post.id)));
          return [
            ...firstPosts,
            ...existingPosts.filter((post) => !firstPageIds.has(Number(post.id))),
          ];
        }

        function updateFeedLoadMoreState(message = '') {
          if (!feedLoadMoreSentinel || !feedLoadMoreLabel) return;
          const shouldShow = feedPagination.hasMore || !!message;
          feedLoadMoreSentinel.classList.toggle('hidden', !shouldShow);
          feedLoadMoreLabel.textContent = message || (feedLoadMorePromise ? 'Cargando más publicaciones...' : (feedPagination.hasMore ? 'Desliza hacia abajo para cargar más publicaciones' : ''));
        }

        function buildFeedPostSnapshot(post) {
          return JSON.stringify({
            id: Number(post?.id || 0),
            comments_count: Number(post?.comments_count || 0),
            reactions_total: Number(post?.reactions_total || 0),
            reactions_count: post?.reactions_count || {},
            current_reaction: post?.current_reaction || '',
            live_status: post?.live_status || '',
            viewer_count: Number(post?.viewer_count || 0),
            content: post?.content || '',
            image_url: post?.image_url || '',
            video_url: post?.video_url || '',
            media_type: post?.media_type || '',
            video_mime_type: post?.video_mime_type || '',
            live_title: post?.live_title || '',
            live_source: post?.live_source || '',
            updated_at: post?.updated_at || '',
          });
        }

        function buildFeedPageSignature(posts = []) {
          return posts
            .slice(0, FEED_PER_PAGE)
            .map((post) => buildFeedPostSnapshot(post))
            .join('|');
        }

        async function loadFeed({ passive = false, force = false } = {}) {
          if (!force && feedPosts.length && lastFeedLoadFinishedAt && (Date.now() - lastFeedLoadFinishedAt) < 1200) {
            return;
          }

          if (feedLoadPromise) {
            return feedLoadPromise;
          }

          feedLoadPromise = (async () => {
            await ensurePublicUsersLoaded();
            const result = await PostsAPI.getFeed({ page: 1, perPage: FEED_PER_PAGE });
            const posts = getList(result);
            const meta = getResultPaginationMeta(result, FEED_PER_PAGE);

            if (!result?.ok) {
              if (!passive) {
                postsContainer.innerHTML = '<p class="text-center text-slate-400 py-8">No se pudo cargar el feed.</p>';
                updateFeedLoadMoreState();
              }
              return;
            }

            if (!passive || !feedPosts.length) {
              pendingFeedPosts = [];
              pendingFeedMeta = null;
              latestPendingFeedSignature = '';
              newPostsBanner?.classList.add('hidden');
              feedPagination = meta;
              const isInitialLoad = feedPosts.length === 0;
              const nextPosts = feedPosts.length ? mergeFeedPages(posts) : posts;
              latestAppliedFeedSignature = buildFeedPageSignature(nextPosts);
              applyFeedPosts(nextPosts, { isInitialLoad });
              return;
            }

            const currentFirstPage = feedPosts.slice(0, FEED_PER_PAGE);
            const currentIds = new Set(currentFirstPage.map((post) => Number(post.id)));
            const nextSignature = buildFeedPageSignature(posts);
            const hasNewPosts = posts.some((post) => !currentIds.has(Number(post.id)));
            const hasStructuralChanges = posts.length !== currentFirstPage.length
              || posts.some((post, index) => Number(post.id) !== Number(currentFirstPage[index]?.id))
              || posts.some((post, index) => buildFeedPostSnapshot(post) !== buildFeedPostSnapshot(currentFirstPage[index]));

            if (!hasNewPosts && hasStructuralChanges) {
              feedPagination = meta;
              const nextPosts = mergeFeedPages(posts);
              latestAppliedFeedSignature = buildFeedPageSignature(nextPosts);
              applyFeedPosts(nextPosts);
              return;
            }

            if (!hasNewPosts) return;
            if (nextSignature && (nextSignature === latestAppliedFeedSignature || nextSignature === latestPendingFeedSignature)) {
              return;
            }
            pendingFeedPosts = posts;
            pendingFeedMeta = meta;
            latestPendingFeedSignature = nextSignature;
            newPostsBanner?.classList.remove('hidden');
          })();

          try {
            return await feedLoadPromise;
          } finally {
            lastFeedLoadFinishedAt = Date.now();
            feedLoadPromise = null;
          }
        }

        async function loadMoreFeedPosts() {
          if (feedLoadMorePromise || !feedPagination.hasMore) {
            return;
          }

          const nextPage = feedPagination.currentPage + 1;
          updateFeedLoadMoreState('Cargando más publicaciones...');
          feedLoadMorePromise = (async () => {
            const result = await PostsAPI.getFeed({ page: nextPage, perPage: FEED_PER_PAGE });
            const posts = getList(result);
            const meta = getResultPaginationMeta(result, FEED_PER_PAGE);

            if (!result?.ok) {
              updateFeedLoadMoreState('No se pudieron cargar más publicaciones.');
              window.setTimeout(() => updateFeedLoadMoreState(), 1800);
              return;
            }

            const existingIds = new Set(feedPosts.map((post) => Number(post.id)));
            const nextPosts = posts.filter((post) => !existingIds.has(Number(post.id)));
            feedPagination = meta;
            const mergedPosts = [...feedPosts, ...nextPosts];
            latestAppliedFeedSignature = buildFeedPageSignature(mergedPosts);
            applyFeedPosts(mergedPosts);
          })();

          try {
            await feedLoadMorePromise;
          } finally {
            feedLoadMorePromise = null;
            updateFeedLoadMoreState();
          }
        }

        async function loadFriends() {
          await ensurePublicUsersLoaded();
          const result = await SocialAPI.getFriends();
          const friends = normalizeFriendEntries(getList(result));
          const activeFriends = friends
            .filter((friend) => isUserOnline(friend))
            .sort((left, right) => {
              const leftSeen = left?.last_seen_at ? new Date(left.last_seen_at).getTime() : 0;
              const rightSeen = right?.last_seen_at ? new Date(right.last_seen_at).getTime() : 0;
              return rightSeen - leftSeen;
            });

          if (!friends.length) {
            onlineFriends.innerHTML = '<p class="text-sm text-slate-400">Sin companeros aun</p>';
            return;
          }

          if (!activeFriends.length) {
            onlineFriends.innerHTML = '<p class="text-sm text-slate-400">No hay companeros activos ahora</p>';
            return;
          }

          onlineFriends.innerHTML = activeFriends.slice(0, 5).map((friend) => `
            <button type="button" class="flex items-center gap-3 text-left" data-open-profile="${friend.id}">
              ${renderAvatar(friend, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold', showOnline: true })}
              <div>
                <p class="text-sm font-bold text-slate-900 leading-tight">${escapeHtml(displayName(friend))}</p>
                <p class="text-xs text-slate-500">${escapeHtml(presenceLabel(friend))}</p>
              </div>
              <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" style="background:${userColor(friend)}">${escapeHtml(friend.faculty || 'UPT')}</span>
            </button>
          `).join('');
        }

        async function publishPost() {
          const content = postContent.value.trim();
          const visibility = postVisibility?.value || 'all';
          const mentionUserIds = postMentionController.collectMentionUserIds();
          if (!content && !selectedComposerMedia.file) {
            showToast('Escribe algo o adjunta una imagen o video', 'error');
            return;
          }
          if (selectedComposerMedia.file && !selectedComposerMedia.previewReady) {
            showToast('Espera a que cargue la vista previa antes de publicar', 'error');
            return;
          }

          // --- If pre-upload is in progress, wait for it to finish ---
          if (selectedComposerMedia.preUploadInProgress && selectedComposerMedia.file) {
            publishButton.disabled = true;
            publishButton.textContent = 'Publicando...';
            const progress = selectedComposerMedia.preUploadProgress;
            const isProcessing = progress >= 99;
            setComposerPreviewOverlay(previewWrap, {
              visible: true,
              progress: isProcessing ? null : progress,
              label: isProcessing ? 'Procesando archivo...' : 'Subiendo archivo...',
            });
            // Poll until pre-upload finishes
            await new Promise((resolve) => {
              const check = setInterval(() => {
                if (!selectedComposerMedia.preUploadInProgress) {
                  clearInterval(check);
                  resolve();
                } else {
                  const curProgress = selectedComposerMedia.preUploadProgress;
                  const curProcessing = curProgress >= 99;
                  setComposerPreviewOverlay(previewWrap, {
                    visible: true,
                    progress: curProcessing ? null : curProgress,
                    label: curProcessing ? 'Procesando archivo...' : 'Subiendo archivo...',
                  });
                }
              }, 200);
            });
            setComposerPreviewOverlay(previewWrap, { visible: false });
          }

          // --- Publish ---
          let result;
          if (selectedComposerMedia.preUploadResult?.ok && selectedComposerMedia.file) {
            publishButton.disabled = true;
            publishButton.textContent = 'Publicando...';
            const { image_url, video_url, video_mime_type } = selectedComposerMedia.preUploadResult;
            result = await PostsAPI.createPost({
              content,
              visibility,
              mentionUserIds,
              imageUrl: image_url,
              videoUrl: video_url,
              videoMimeType: video_mime_type,
            });
          } else {
            // Standard publish (no pre-upload or pre-upload failed)
            selectedComposerMedia.uploadInProgress = !!selectedComposerMedia.file;
            selectedComposerMedia.uploadProgress = 0;
            if (selectedComposerMedia.file) {
              setComposerPreviewOverlay(previewWrap, {
                visible: true,
                progress: 0,
                label: 'Subiendo archivo...',
              });
              syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
            } else {
              publishButton.disabled = true;
              publishButton.textContent = 'Publicando...';
            }

            result = await PostsAPI.createPost({
              content,
              mediaFile: selectedComposerMedia.file,
              visibility,
              mentionUserIds,
              onUploadProgress: ({ percent }) => {
                if (!selectedComposerMedia.file) return;
                const numericPercent = Number(percent);
                if (Number.isFinite(numericPercent)) {
                  selectedComposerMedia.uploadProgress = numericPercent;
                }
                setComposerPreviewOverlay(previewWrap, {
                  visible: true,
                  progress: Number.isFinite(numericPercent) ? numericPercent : null,
                  label: 'Subiendo archivo...',
                });
                syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
              },
            });

            selectedComposerMedia.uploadInProgress = false;
            selectedComposerMedia.uploadProgress = 0;
            setComposerPreviewOverlay(previewWrap, { visible: false });
            syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);
          }

          if (result?.ok) {
            postContent.value = '';
            setPostVisibility('all');
            selectedComposerMedia.preUploadResult = null; // Evita que clearImage/cancelPreUpload borre el archivo recién publicado
            clearImage();
            postMentionController.clear();
            showToast('Publicacion creada', 'success');
            loadFeed({ force: true });
            return;
          }

          showToast(result?.data?.error || 'Error al publicar', 'error');
        }

        async function createLivestream() {
          const liveTitle = liveTitleInput.value.trim();

          const visibility = livestreamModal.querySelector('input[name="live-visibility"]:checked')?.value || 'all';
          const liveSource = livestreamModal.querySelector('input[name="live-source"]:checked')?.value || 'camera';

          if (!liveTitle) {
            showToast('Ponle un titulo al directo', 'error');
            return;
          }

          confirmLiveCreateButton.disabled = true;
          confirmLiveCreateButton.textContent = 'PREPARANDO...';

          // If screen source, request screen selection BEFORE creating the livestream
          let preCapturedStream = null;
          if (liveSource === 'screen' && isDesktopClient()) {
            try {
              preCapturedStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                  // Keep the native tab/window aspect ratio instead of coercing every share into 16:9.
                  frameRate: { ideal: 60, max: 60 },
                },
                audio: true,
              });
            } catch (err) {
              // User cancelled the screen picker
              confirmLiveCreateButton.disabled = false;
              confirmLiveCreateButton.textContent = 'EMPEZAR';
              showToast('No se selecciono ninguna pantalla para compartir', 'error');
              return;
            }
          }

          confirmLiveCreateButton.textContent = 'CREANDO...';

          const streamKey = buildLivestreamStreamKey(user.id);
          const playbackUrl = buildLivestreamHlsUrl(streamKey);

          const result = await PostsAPI.createLivestream({
            liveTitle,

            visibility,
            liveSource,
            streamKey,
            playbackUrl,
            streamAspectRatio: getInitialLivestreamAspectRatio(liveSource),
          });

          confirmLiveCreateButton.disabled = false;
          confirmLiveCreateButton.textContent = 'EMPEZAR';

          if (!result?.ok) {
            // Release pre-captured stream if creation failed
            if (preCapturedStream) {
              preCapturedStream.getTracks().forEach(t => t.stop());
            }
            showToast(result?.data?.error || 'No se pudo crear el directo', 'error');
            return;
          }

          // Store pre-captured stream for the live page to use
          if (preCapturedStream) {
            window.__uptLivePreCapturedStream = preCapturedStream;
          }

          postContent.value = '';
          closeLivestreamModal();
          showToast('Directo creado', 'success');
          await navigateToLivestream(router, result.data.id, { host: '1' });
        }

        async function confirmComment() {
          const content = commentInput.value.trim();
          const mentionUserIds = commentMentionController.collectMentionUserIds();
          if (!pendingCommentId || !content) return;

          const result = await PostsAPI.addComment(pendingCommentId, content, mentionUserIds);
          if (result?.ok) {
            showToast('Comentario anadido', 'success');
            commentInput.value = '';
            commentMentionController.clear();
            await loadFeed({ force: true });
            await loadComments(pendingCommentId, currentCommentSort);
            return;
          }

          showToast(result?.data?.error || 'Error al comentar', 'error');
        }

        async function confirmDelete() {
          if (!pendingDeleteId) return;
          const result = await PostsAPI.deletePost(pendingDeleteId);
          if (result?.ok) {
            showToast('Publicacion eliminada', 'success');
            closeDeleteModal();
            loadFeed({ force: true });
            return;
          }
          showToast(result?.data?.error || 'Error al eliminar', 'error');
        }

        const onDocumentClick = (event) => {
          const insideVisibility = event.target.closest('#post-visibility-trigger, #post-visibility-menu');
          if (!insideVisibility) {
            closeVisibilityMenu();
          }
          const insideCameraCapture = event.target.closest('#pick-camera-btn, #camera-capture-menu');
          if (!insideCameraCapture) {
            cameraCaptureMenu?.classList.add('hidden');
          }
        };

        container.querySelector('#pick-image-btn').addEventListener('click', () => fileInput.click());
        container.querySelector('#pick-camera-btn')?.addEventListener('click', () => {
          cameraCaptureMenu?.classList.toggle('hidden');
        });
        container.querySelector('#camera-capture-photo-btn')?.addEventListener('click', () => {
          if (!cameraPhotoInput) return;
          cameraCaptureMenu?.classList.add('hidden');
          cameraPhotoInput.value = '';
          cameraPhotoInput.click();
        });
        container.querySelector('#camera-capture-video-btn')?.addEventListener('click', () => {
          if (!cameraVideoInput) return;
          cameraCaptureMenu?.classList.add('hidden');
          cameraVideoInput.value = '';
          cameraVideoInput.click();
        });
        container.querySelector('#clear-image-btn').addEventListener('click', clearImage);
        postVisibilityTrigger?.addEventListener('click', toggleVisibilityMenu);
        container.querySelector('#cancel-delete-btn').addEventListener('click', closeDeleteModal);
        container.querySelector('#confirm-delete-btn').addEventListener('click', confirmDelete);
        container.querySelector('#close-comment-top-btn').addEventListener('click', closeCommentModal);
        container.querySelector('#confirm-comment-btn').addEventListener('click', confirmComment);
        openLiveModalButton?.addEventListener('click', openLivestreamModal);
        container.querySelector('#close-live-modal-btn')?.addEventListener('click', closeLivestreamModal);
        container.querySelector('#cancel-live-modal-btn')?.addEventListener('click', closeLivestreamModal);
        confirmLiveCreateButton?.addEventListener('click', createLivestream);
        commentSort.addEventListener('change', () => {
          if (!pendingCommentId) return;
          syncCommentSortChips(commentSort.value);
          loadComments(pendingCommentId, commentSort.value);
        });
        publishButton.addEventListener('click', publishPost);
        postContent?.addEventListener('input', () => syncComposerPublishButton(publishButton, postContent, selectedComposerMedia));

        warmPublicUsersInBackground();

        fileInput.addEventListener('change', (event) => {
          const [file] = event.target.files || [];
          handleComposerImageFile(file);
        });
        cameraPhotoInput?.addEventListener('change', (event) => {
          const [file] = event.target.files || [];
          handleComposerImageFile(file);
        });
        cameraVideoInput?.addEventListener('change', (event) => {
          const [file] = event.target.files || [];
          handleComposerImageFile(file);
        });
        syncComposerPublishButton(publishButton, postContent, selectedComposerMedia);

        postVisibilityMenu?.addEventListener('click', (event) => {
          const option = event.target.closest('[data-visibility-option]');
          if (!option) return;
          setPostVisibility(option.dataset.visibilityOption);
          closeVisibilityMenu();
        });

        commentInput.addEventListener('keydown', async (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await confirmComment();
          }
        });
        commentInput.addEventListener('input', () => {
          commentInput.style.height = 'auto';
          commentInput.style.height = `${Math.min(commentInput.scrollHeight, 96)}px`;
        });

        postsContainer.addEventListener('click', async (event) => {
          const actionTarget = event.target.closest('[data-action]');
          if (actionTarget) {
            if (await handleSharePublicPostAction(actionTarget)) {
              return;
            }
            const postId = Number(actionTarget.dataset.postId);
            if (actionTarget.dataset.action === 'open-profile') {
              router.navigate('profile', { id: actionTarget.dataset.userId });
              return;
            }
            if (actionTarget.dataset.action === 'react-post') {
              await PostsAPI.reactPost(postId, actionTarget.dataset.reaction);
              loadFeed();
              return;
            }
            if (actionTarget.dataset.action === 'open-reaction-picker') {
              openReactionPicker(actionTarget, {
                targetType: 'post',
                targetId: Number(actionTarget.dataset.targetId),
                currentReaction: actionTarget.dataset.currentReaction || '',
                onSelect: async (reaction) => {
                  actionTarget.dataset.currentReaction = reaction;
                  actionTarget.classList.add('is-active');
                  actionTarget.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
                  closeReactionPicker();

                  const result = await PostsAPI.reactPost(Number(actionTarget.dataset.targetId), reaction);
                  if (!result?.ok) {
                    showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
                    await loadFeed();
                    return;
                  }
                  loadFeed({ passive: true }).catch(() => { });
                },
              });
              return;
            }
            if (actionTarget.dataset.action === 'comment-post') {
              openCommentModal(postId);
              return;
            }
            if (actionTarget.dataset.action === 'open-livestream') {
              await navigateToLivestream(router, actionTarget.dataset.liveId);
              return;
            }
            if (actionTarget.dataset.action === 'report-post') {
              await reportContent('publicacion', postId);
              return;
            }
            if (actionTarget.dataset.action === 'delete-post') {
              openDeleteModal(postId);
            }
            return;
          }

          const postCard = event.target.closest('[data-post-card]');
          if (postCard) {
            const ignoredEl = event.target.closest('[data-post-card-ignore="true"]');
            // Images: clicking them should open the modal (only images, not videos)
            const isImageMedia = ignoredEl?.classList.contains('post-adaptive-media--image');
            if (!ignoredEl || isImageMedia) {
              openCommentModal(postCard.dataset.postId);
            }
          }
        });

        postsContainer.addEventListener('mouseover', (event) => {
          const trigger = event.target.closest('[data-action="open-reaction-picker"]');
          if (!trigger || !isDesktopClient()) return;
          if (pointerWithinReactionZone(event.relatedTarget, trigger)) return;
          clearReactionPickerCloseTimer();
          openReactionPicker(trigger, {
            targetType: 'post',
            targetId: Number(trigger.dataset.targetId),
            currentReaction: trigger.dataset.currentReaction || '',
            onSelect: async (reaction) => {
              trigger.dataset.currentReaction = reaction;
              trigger.classList.add('is-active');
              trigger.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
              closeReactionPicker();

              const result = await PostsAPI.reactPost(Number(trigger.dataset.targetId), reaction);
              if (!result?.ok) {
                showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
                await loadFeed();
                return;
              }
              loadFeed({ passive: true }).catch(() => { });
            },
          });
        });

        postsContainer.addEventListener('mouseout', (event) => {
          const trigger = event.target.closest('[data-action="open-reaction-picker"]');
          if (!trigger || !isDesktopClient()) return;
          if (pointerWithinReactionZone(event.relatedTarget, trigger)) return;
          scheduleReactionPickerClose();
        });

        commentList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (!button || !pendingCommentId) return;

          if (button.dataset.action === 'open-profile') {
            event.preventDefault();
            hideMentionProfilePopover();
            router.navigate('profile', { id: button.dataset.userId });
            return;
          }

          if (button.dataset.action === 'open-reaction-picker') {
            openReactionPicker(button, {
              targetType: 'comment',
              targetId: Number(button.dataset.targetId),
              currentReaction: button.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                button.dataset.currentReaction = reaction;
                button.classList.add('is-active');
                button.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
                closeReactionPicker();

                const result = await PostsAPI.reactComment(Number(button.dataset.targetId), reaction);
                if (!result?.ok) {
                  showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
                  await loadComments(pendingCommentId, currentCommentSort, { preserveScroll: true });
                  return;
                }
                loadComments(pendingCommentId, currentCommentSort, { preserveScroll: true }).catch(() => { });
              },
            });
            return;
          }

          if (button.dataset.action === 'react-comment') {
            const result = await PostsAPI.reactComment(button.dataset.commentId, button.dataset.reaction);
            if (result?.ok) {
              await loadComments(pendingCommentId, currentCommentSort);
              return;
            }

            showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
            return;
          }

          if (button.dataset.action === 'report-comment') {
            await reportContent('comentario', Number(button.dataset.commentId));
            return;
          }

          if (button.dataset.action === 'delete-comment') {
            const confirmed = await confirmAction({
              title: 'Eliminar comentario',
              copy: 'El comentario se eliminara y no podra recuperarse.',
              acceptLabel: 'Eliminar',
              tone: 'danger',
            });
            if (!confirmed) return;

            const result = await PostsAPI.deleteComment(null, button.dataset.commentId);
            if (result?.ok) {
              showToast('Comentario eliminado', 'success');
              await loadFeed({ force: true });
              await loadComments(pendingCommentId, currentCommentSort, { preserveScroll: true });
              return;
            }

            showToast(result?.data?.error || 'No se pudo eliminar el comentario', 'error');
          }
        });

        commentList.addEventListener('mouseover', (event) => {
          const trigger = event.target.closest('[data-action="open-reaction-picker"]');
          if (!trigger || !isDesktopClient() || !pendingCommentId) return;
          if (pointerWithinReactionZone(event.relatedTarget, trigger)) return;
          clearReactionPickerCloseTimer();
          openReactionPicker(trigger, {
            targetType: 'comment',
            targetId: Number(trigger.dataset.targetId),
            currentReaction: trigger.dataset.currentReaction || '',
            onSelect: async (reaction) => {
              trigger.dataset.currentReaction = reaction;
              trigger.classList.add('is-active');
              trigger.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
              closeReactionPicker();

              const result = await PostsAPI.reactComment(Number(trigger.dataset.targetId), reaction);
              if (!result?.ok) {
                showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
                await loadComments(pendingCommentId, currentCommentSort, { preserveScroll: true });
                return;
              }
              loadComments(pendingCommentId, currentCommentSort, { preserveScroll: true }).catch(() => { });
            },
          });
        });

        commentList.addEventListener('mouseout', (event) => {
          const trigger = event.target.closest('[data-action="open-reaction-picker"]');
          if (!trigger || !isDesktopClient()) return;
          if (pointerWithinReactionZone(event.relatedTarget, trigger)) return;
          scheduleReactionPickerClose();
        });

        commentPostPreview.addEventListener('click', async (event) => {
          const actionTarget = event.target.closest('[data-action]');
          if (!actionTarget) return;
          if (await handleSharePublicPostAction(actionTarget)) return;

          if (actionTarget.dataset.action === 'open-profile') {
            router.navigate('profile', { id: actionTarget.dataset.userId });
            return;
          }

          if (actionTarget.dataset.action === 'open-post-image') {
            openPostImageLightbox(actionTarget.dataset.imageUrl, actionTarget.dataset.imageAlt || 'Imagen ampliada de la publicacion');
            return;
          }

          if (actionTarget.dataset.action === 'report-post') {
            await reportContent('publicacion', Number(actionTarget.dataset.postId));
            return;
          }

          if (actionTarget.dataset.action === 'open-reaction-picker') {
            openReactionPicker(actionTarget, {
              targetType: 'post',
              targetId: Number(actionTarget.dataset.targetId),
              currentReaction: actionTarget.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                const result = await PostsAPI.reactPost(Number(actionTarget.dataset.targetId), reaction);
                if (result?.ok) {
                  await loadFeed({ force: true });
                  renderCommentModalPost(pendingCommentId);
                  return;
                }
                showToast(result?.data?.error || 'No se pudo reaccionar a la publicacion', 'error');
              },
            });
          }
        });

        onlineFriends.addEventListener('click', (event) => {
          const button = event.target.closest('[data-open-profile]');
          if (!button) return;
          router.navigate('profile', { id: button.dataset.openProfile });
        });

        deleteModal.addEventListener('click', (event) => {
          if (event.target === deleteModal) closeDeleteModal();
        });

        commentModal.addEventListener('click', (event) => {
          if (event.target === commentModal) closeCommentModal();
        });

        setPostVisibility(postVisibility?.value || 'all');
        const applyNewFeedToast = () => {
          if (!pendingFeedPosts.length) return;
          newPostsBanner?.classList.add('hidden');
          feedPagination = pendingFeedMeta || feedPagination;
          const nextPosts = mergeFeedPages(pendingFeedPosts);
          latestAppliedFeedSignature = buildFeedPageSignature(nextPosts);
          applyFeedPosts(nextPosts);
          pendingFeedPosts = [];
          pendingFeedMeta = null;
          latestPendingFeedSignature = '';
          lastFeedLoadFinishedAt = Date.now();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        applyNewPostsButton?.addEventListener('click', (event) => {
          event.stopPropagation();
          applyNewFeedToast();
        });
        newPostsBanner?.addEventListener('click', applyNewFeedToast);
        newPostsBanner?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            applyNewFeedToast();
          }
        });
        document.addEventListener('click', onDocumentClick);
        // Intentionally no auto-apply of new posts; the user chooses via the toast.
        async function handleBlocksChanged() {
          await Promise.all([
            loadFeed(),
            loadFriends(),
          ]);
        }

        window.addEventListener('presence:updated', loadFriends);
        window.addEventListener('blocks:changed', handleBlocksChanged);
        window.addEventListener('focus', handleBlocksChanged);
        document.addEventListener('visibilitychange', handleBlocksChanged);

        if (feedLoadMoreSentinel && 'IntersectionObserver' in window) {
          feedObserver = new IntersectionObserver((entries) => {
            const shouldLoad = entries.some((entry) => entry.isIntersecting);
            if (!shouldLoad || document.hidden) return;
            loadMoreFeedPosts().catch(() => { });
          }, {
            rootMargin: '240px 0px',
          });
          feedObserver.observe(feedLoadMoreSentinel);
        }

        loadFeed().then(() => maybeOpenFeedRoutePost()).catch(() => { });
        loadFriends();
        feedRefreshTimer = window.setInterval(() => {
          if (document.hidden) return;
          loadFeed({ passive: true });
        }, 3000);

        return () => {
          document.removeEventListener('click', onDocumentClick);
          window.removeEventListener('presence:updated', loadFriends);
          window.removeEventListener('blocks:changed', handleBlocksChanged);
          window.removeEventListener('focus', handleBlocksChanged);
          document.removeEventListener('visibilitychange', handleBlocksChanged);
          if (feedRefreshTimer) {
            window.clearInterval(feedRefreshTimer);
            feedRefreshTimer = null;
          }
          if (commentPollTimer) {
            window.clearInterval(commentPollTimer);
            commentPollTimer = null;
          }
          if (feedObserver) {
            feedObserver.disconnect();
            feedObserver = null;
          }
          postMentionController.destroy();
          commentMentionController.destroy();
          closeReactionPicker();
        };
      },
    },
    'shared-post': {
      title: 'Publicacion compartida',
      templatePath: '/pages/shared_post.html',
      publicReadonly: true,
      mount({ container, params }) {
        const host = container.querySelector('#shared-post-container');
        const loginPrompt = container.querySelector('#shared-post-login-prompt');
        const relevantPersonHost = container.querySelector('#shared-post-relevant-person');
        const bottomCta = container.querySelector('#shared-post-bottom-cta');
        const bottomCtaCloseButton = container.querySelector('[data-shared-bottom-cta-close]');
        const rawId = String(params?.id || '').trim();
        const shareHash = String(window.location.hash || '').replace(/^#shared-post\/?/, '').split('?')[0];
        let bottomCtaDismissed = false;

        const renderState = (markup) => {
          if (host) {
            host.innerHTML = markup;
          }
        };

        const renderAuthorCompanions = (post) => {
          if (relevantPersonHost) {
            relevantPersonHost.innerHTML = renderSharedRelevantAuthor(post);
          }
        };

        const showLoginPrompt = () => {
          if (!loginPrompt) return;
          loginPrompt.classList.remove('hidden');
          loginPrompt.setAttribute('aria-hidden', 'false');
        };

        const hideLoginPrompt = () => {
          if (!loginPrompt) return;
          loginPrompt.classList.add('hidden');
          loginPrompt.setAttribute('aria-hidden', 'true');
        };

        const hideBottomCta = () => {
          bottomCtaDismissed = true;
          if (!bottomCta) return;
          bottomCta.classList.add('hidden');
          bottomCta.style.display = 'none';
          bottomCta.setAttribute('aria-hidden', 'true');
        };

        const loadPost = async () => {
          if (!shareHash && !rawId) {
            renderState('<div class="guest-shared-loading-card">Enlace publico invalido.</div>');
            renderAuthorCompanions(null);
            return;
          }

          const result = await PostsAPI.getPublicPost(shareHash || encodeResourceHash(rawId));
          if (!result?.ok || !result?.data?.id) {
            renderState('<div class="guest-shared-loading-card">Esta publicacion ya no esta disponible para invitados.</div>');
            renderAuthorCompanions(null);
            return;
          }

          renderState(renderSharedReadonlyPost(result.data));
          renderAuthorCompanions(result.data);
          refreshAdaptiveMediaFrames();
        };

        const handleClick = (event) => {
          const ctaCloseTarget = event.target.closest?.('[data-shared-bottom-cta-close]');
          if (ctaCloseTarget) {
            event.preventDefault?.();
            event.stopPropagation?.();
            hideBottomCta();
            return;
          }

          const modalCloseButton = event.target.closest?.('[data-shared-modal-close]');
          if (modalCloseButton) {
            event.preventDefault?.();
            event.stopPropagation?.();
            hideLoginPrompt();
            return;
          }

          const actionTarget = event.target.closest?.('[data-guest-login-required], .mention-link, [data-action="open-profile"]');
          if (!actionTarget) return;
          event.preventDefault?.();
          event.stopPropagation?.();
          showLoginPrompt();
        };

        container.addEventListener('click', handleClick);
        if (bottomCtaCloseButton) {
          bottomCtaCloseButton.addEventListener('click', hideBottomCta);
        }
        if (bottomCta && bottomCtaDismissed) {
          hideBottomCta();
        }
        loadPost();

        return () => {
          container.removeEventListener('click', handleClick);
          if (bottomCtaCloseButton) {
            bottomCtaCloseButton.removeEventListener('click', hideBottomCta);
          }
        };
      },
    },
    live: {
      title: 'Directo',
      activeNav: 'feed',
      templatePath: '/pages/live.html',
      mount({ container, user, params, router }) {
        const liveId = Number(params.id || 0);
        const isHostRoute = String(params.host || '') === '1' || isRememberedLiveHostRoute(liveId);
        if (!Number.isFinite(liveId) || liveId <= 0) {
          container.innerHTML = '<section class="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-700">Directo no disponible.</section>';
          return () => { };
        }
        if (String(params.host || '') === '1') {
          rememberLiveHostRoute(liveId);
        }
        const canonicalLiveHash = buildHash('live', { id: String(liveId) });
        if (window.location.hash !== canonicalLiveHash) {
          window.history.replaceState(null, '', `${window.location.pathname}${canonicalLiveHash}`);
        }

        const liveStatusMetaCleanup = (() => {
          if (isDesktopClient()) {
            return () => { };
          }

          const metaSpecs = [
            { name: 'theme-color', content: '#000000' },
            { name: 'apple-mobile-web-app-capable', content: 'yes' },
            { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
          ];
          const previous = metaSpecs.map((spec) => {
            let element = document.head.querySelector(`meta[name="${spec.name}"]`);
            const existed = Boolean(element);
            const content = element?.getAttribute('content') ?? null;
            if (!element) {
              element = document.createElement('meta');
              element.setAttribute('name', spec.name);
              document.head.appendChild(element);
            }
            element.setAttribute('content', spec.content);
            return { element, existed, content };
          });

          return () => {
            previous.forEach(({ element, existed, content }) => {
              if (!element) return;
              if (!existed) {
                element.remove();
              } else if (content !== null) {
                element.setAttribute('content', content);
              }
            });
          };
        })();

        const liveShell = container.querySelector('#live-shell');
        function syncLiveDeviceClasses() {
          if (!liveShell) return;
          const desktop = isDesktopClient();
          liveShell.classList.toggle('live-is-desktop', desktop);
          liveShell.classList.toggle('live-host-mobile', isHostRoute && !desktop);
          liveShell.classList.toggle('live-mobile-shell', !desktop);
          if (desktop) {
            liveShell.style.removeProperty('--live-mobile-vh');
            liveShell.style.removeProperty('--live-mobile-vw');
            liveShell.style.removeProperty('--live-mobile-keyboard-offset');
            liveShell.style.removeProperty('--live-mobile-comments-max');
            liveShell.style.removeProperty('--live-mobile-overlay-max');
          }
        }
        syncLiveDeviceClasses();

        const viewerPlayerRoot = container.querySelector('#live-viewer-player');
        const hostPreviewVideo = container.querySelector('#live-host-preview');
        const liveVideoFallback = container.querySelector('#live-video-fallback');
        const liveFallbackTitle = container.querySelector('#live-fallback-title');
        const liveFallbackCopy = container.querySelector('#live-fallback-copy');
        const liveTitle = container.querySelector('#live-title');
        const liveViewerCount = container.querySelector('#live-viewer-count');
        const livePlayerViewerCount = container.querySelector('#live-player-viewer-count');
        const liveStatusChip = container.querySelector('#live-status-chip');
        const liveStatusDot = container.querySelector('#live-status-dot');
        const liveStatusBadge = container.querySelector('#live-status-badge');
        const liveComments = container.querySelector('#live-comments');
        const liveCommentInput = container.querySelector('#live-comment-input');
        const liveCommentsMobile = container.querySelector('#live-comments-mobile');
        const liveCommentInputMobile = container.querySelector('#live-comment-input-mobile');
        const liveTitleMobile = container.querySelector('#live-title-mobile');
        const liveReportButton = container.querySelector('#live-report-btn');
        const liveReportButtonMobile = container.querySelector('#live-report-btn-mobile');
        const floatingReactions = container.querySelector('#live-floating-reactions');
        const liveSourceTransitionMask = container.querySelector('#live-source-transition-mask');
        const hostEndButton = container.querySelector('#live-host-end-btn');
        const hostTools = container.querySelector('#live-host-tools');
        const toggleMicButton = container.querySelector('#live-toggle-mic-btn');
        const toggleMicMobileButton = container.querySelector('#live-toggle-mic-mobile-btn');
        const toggleSystemAudioButton = container.querySelector('#live-toggle-system-audio-btn');
        const switchSourceButton = container.querySelector('#live-switch-source-btn');
        const flipCameraButton = container.querySelector('#live-flip-camera-btn');
        const flipCameraMobileButton = container.querySelector('#live-flip-camera-mobile-btn');
        const toggleTorchMobileButton = container.querySelector('#live-toggle-torch-mobile-btn');

        const fullscreenBtn = container.querySelector('#live-fullscreen-btn');
        const immersiveBtn = container.querySelector('#live-immersive-btn');
        const reactionTrigger = container.querySelector('#live-reaction-trigger');
        const reactionSelector = container.querySelector('#live-reaction-selector');
        const reactionTriggerDesktop = container.querySelector('#live-reaction-trigger-desktop');
        const reactionSelectorDesktop = container.querySelector('#live-reaction-selector-desktop');
        const liveVideoWrap = container.querySelector('#live-video-wrap');
        const overlays = container.querySelectorAll('[data-live-overlay]');
        const mobileTopbar = container.querySelector('.live-mobile-topbar');
        const liveMobileInputRow = container.querySelector('.live-mobile-input-row');
        const liveMobileHeadingRow = liveTitleMobile?.closest('div');

        let liveData = null;
        let activeReaction = 'me_gusta';
        let commentsTimer = null;
        let heartbeatTimer = null;
        let liveStateTimer = null;
        let lastEventId = 0;
        let reactionEventsCursorReady = false;
        let sourceBusy = false;
        let startedAt = Date.now();
        let ovenLivekit = null;
        let viewerVideo = null;
        let viewerPlayer = null;
        let viewerHls = null;
        let hostMediaBundle = null;
        let hostMicMuted = false;
        let hostSystemMuted = false;
        let endedByHost = false;
        let hostPublishing = false;
        let hostPublishedSource = null;
        let viewerPlayerSourceUrl = null;
        let viewerPlayerCreatedAt = 0;
        let viewerPlayerLastRetryAt = 0;
        let viewerBootstrapInFlight = false;
        let viewerLastMediaTime = 0;
        let viewerLastMediaProgressAt = 0;
        let viewerPendingSourceUrl = null;
        let viewerSwitchPrepared = false;
        let viewerFreezeFrame = null;
        let viewerRetrySpinner = null;
        let viewerReconnectTimer = 0;
        let viewerTapUnmuteHandler = null;
        let viewerIsMuted = false;
        let viewerBoundSourceUrl = '';
        let viewerPlayerMediaObserver = null;
        let suppressViewerShellExit = false;
        let viewerSourceWarmupUntil = 0;
        let viewerTransportMode = LIVESTREAM_PRIMARY_TRANSPORT;
        let viewerTransportEscalated = false;
        let commentsInitialized = false;
        let overlayTimer = null;
        let longPressTimer = null;
        let selectorOpen = false;
        let lastKnownSource = null;
        let lastKnownStreamKey = null;
        let lastKnownSourceRevision = null;
        let currentFacingMode = 'environment'; // default: rear camera on mobile
        let currentVideoDeviceId = '';
        let hostTorchEnabled = false;
        let hostTorchSupported = false;
        let wakeLock = null; // Screen Wake Lock to prevent black screen
        let transitionToken = 0;
        let transitionStartedAt = 0;
        let transitionHideTimer = null;
        let liveMobileViewportSyncRaf = 0;
        let liveMobileViewportSyncTimeout = 0;
        let liveMobileLayoutHeight = 0;

        // Mobile-only player controls (on the video itself)
        const playerMuteBtn = container.querySelector('#live-player-mute-btn');
        const playerFsBtn = container.querySelector('#live-player-fs-btn');

        // Wake Lock: keep screen awake during livestream
        async function requestWakeLock() {
          try {
            if ('wakeLock' in navigator) {
              wakeLock = await navigator.wakeLock.request('screen');
              wakeLock.addEventListener('release', () => { wakeLock = null; });
            }
          } catch (e) { /* not critical */ }
        }

        // If the user is scrolling the chat, avoid snapping back to bottom on the next poll.
        let lastCommentsUserScrollAt = 0;
        function markCommentsUserScroll() {
          lastCommentsUserScrollAt = Date.now();
        }
        function userRecentlyScrolledComments() {
          return (Date.now() - lastCommentsUserScrollAt) < 1500;
        }
        function releaseWakeLock() {
          if (wakeLock) { wakeLock.release().catch(() => { }); wakeLock = null; }
        }
        function syncLiveMobileViewportMetrics() {
          if (!liveShell || isDesktopClient()) {
            return;
          }

          const viewport = window.visualViewport;
          const viewportHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0));
          const viewportWidth = Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0));
          const layoutViewportHeight = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || viewportHeight));
          const activeElement = document.activeElement;
          const keyboardLikelyOpen = activeElement === liveCommentInputMobile || liveMobileInputRow?.contains(activeElement);
          if (!keyboardLikelyOpen || !liveMobileLayoutHeight || viewportHeight > liveMobileLayoutHeight * 0.78) {
            liveMobileLayoutHeight = Math.max(layoutViewportHeight, viewportHeight);
          }
          const stableViewportHeight = Math.max(liveMobileLayoutHeight || 0, layoutViewportHeight, viewportHeight);
          const visualOffsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
          
          let keyboardOffset = 0;
          if (layoutViewportHeight > viewportHeight + 5) {
            keyboardOffset = Math.max(0, stableViewportHeight - viewportHeight - visualOffsetTop);
          }
          const topbarHeight = mobileTopbar?.offsetHeight || 0;
          const headingHeight = liveMobileHeadingRow?.offsetHeight || 0;
          const inputHeight = liveMobileInputRow?.offsetHeight || 0;
          const commentsMax = Math.max(120, Math.min(320, viewportHeight - topbarHeight - headingHeight - inputHeight - 34));
          const overlayMax = Math.max(inputHeight + headingHeight + 24, Math.min(Math.round(viewportHeight * 0.58), commentsMax + headingHeight + inputHeight + 24));

          liveShell.style.setProperty('--live-mobile-vh', `${stableViewportHeight}px`);
          liveShell.style.setProperty('--live-mobile-vw', `${viewportWidth}px`);
          liveShell.style.setProperty('--live-mobile-keyboard-offset', `${keyboardOffset}px`);
          liveShell.style.setProperty('--live-mobile-comments-max', `${commentsMax}px`);
          liveShell.style.setProperty('--live-mobile-overlay-max', `${overlayMax}px`);
        }
        function scheduleLiveMobileViewportSync(delayMs = 0) {
          if (isDesktopClient()) {
            return;
          }

          window.cancelAnimationFrame(liveMobileViewportSyncRaf);
          window.clearTimeout(liveMobileViewportSyncTimeout);

          const run = () => {
            liveMobileViewportSyncRaf = window.requestAnimationFrame(() => {
              syncLiveMobileViewportMetrics();
            });
          };

          if (delayMs > 0) {
            liveMobileViewportSyncTimeout = window.setTimeout(run, delayMs);
            return;
          }

          run();
        }

        function pinLiveMobileViewport() {
          if (isDesktopClient()) {
            return;
          }
          try {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
          } catch (_error) { }
          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(90);
          scheduleLiveMobileViewportSync(240);
        }

        function disconnectViewerPlayerMediaObserver() {
          if (!viewerPlayerMediaObserver) {
            return;
          }
          try {
            viewerPlayerMediaObserver.disconnect();
          } catch (_error) { }
          viewerPlayerMediaObserver = null;
        }

        async function requestLiveShellFullscreen() {
          if (!liveShell || isDesktopClient()) {
            return false;
          }
          if (document.fullscreenElement === liveShell) {
            return true;
          }
          try {
            await liveShell.requestFullscreen({ navigationUI: 'hide' });
            return true;
          } catch (_error) {
            try {
              await liveShell.requestFullscreen();
              return true;
            } catch (__error) {
              return false;
            }
          }
        }

        function restoreViewerShellLayout() {
          if (mobileOverlay) {
            mobileOverlay.style.opacity = '';
            mobileOverlay.style.pointerEvents = '';
          }
          if (immersiveBtn && !isDesktopClient() && !isHostOnMobile) {
            immersiveBtn.classList.remove('hidden');
          }
          showOverlay();
        }

        function recoverUnexpectedViewerFullscreen(video = null) {
          if (isDesktopClient() || isHostOnMobile || !immersiveActive || !liveShell) {
            return;
          }

          window.setTimeout(() => {
            suppressViewerShellExit = true;
            try {
              if (typeof video?.webkitExitFullscreen === 'function' && video.webkitDisplayingFullscreen) {
                video.webkitExitFullscreen();
              }
            } catch (_error) { }

            const fsEl = document.fullscreenElement;
            if (fsEl && fsEl !== liveShell) {
              document.exitFullscreen().catch(() => { });
            }

            restoreViewerShellLayout();
          }, 0);
        }

        function prepareViewerMediaElement(video) {
          if (!video) {
            return;
          }

          video.classList.add('w-full', 'h-full', 'bg-black');
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'contain';
          video.style.zIndex = '1';
          video.style.opacity = '0';
          video.style.transition = 'opacity 160ms ease';
          video.style.pointerEvents = 'none';
          video.autoplay = true;
          video.controls = false;
          video.removeAttribute('controls');
          video.playsInline = true;
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', 'true');
          video.setAttribute('x-webkit-airplay', 'deny');
          try {
            video.disablePictureInPicture = true;
          } catch (_error) { }

          if (video.dataset.liveViewerFullscreenGuardAttached !== '1') {
            const preventFullscreenTakeover = () => {
              recoverUnexpectedViewerFullscreen(video);
            };
            video.addEventListener('webkitbeginfullscreen', preventFullscreenTakeover);
            video.addEventListener('enterpictureinpicture', (event) => {
              event.preventDefault?.();
              preventFullscreenTakeover();
            });
            video.dataset.liveViewerFullscreenGuardAttached = '1';
          }
        }

        function guardViewerPlayerTap(event) {
          if (isDesktopClient() || isHostOnMobile || !liveVideoWrap) {
            return;
          }
          if (isVideoFullscreenActive()) {
            return;
          }
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          if (!liveVideoWrap.contains(target)) {
            return;
          }
          if (target.closest('button, input, textarea')) {
            return;
          }
          event.preventDefault?.();
          event.stopPropagation?.();
          toggleOverlay();
        }

        function observeViewerPlayerMedia(player, sourceUrl, readyAt) {
          disconnectViewerPlayerMediaObserver();
          if (!player || viewerPlayer !== player || !viewerPlayerRoot) {
            return;
          }

          const bindCurrentVideo = () => {
            const mediaElement = viewerPlayerRoot.querySelector('video');
            if (!mediaElement) {
              return false;
            }
            prepareViewerMediaElement(mediaElement);
            bindViewerMediaElement(mediaElement, sourceUrl, readyAt);
            disconnectViewerPlayerMediaObserver();
            return true;
          };

          if (bindCurrentVideo()) {
            return;
          }

          viewerPlayerMediaObserver = new MutationObserver(() => {
            bindCurrentVideo();
          });
          viewerPlayerMediaObserver.observe(viewerPlayerRoot, { childList: true, subtree: true });
          window.setTimeout(() => {
            disconnectViewerPlayerMediaObserver();
          }, 4000);
        }

        // Re-acquire wake lock when page becomes visible again
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && liveData?.live_status === 'live') {
            requestWakeLock();
          }
        });
        requestWakeLock();

        function cleanupMediaBundle(bundle) {
          if (!bundle) {
            return;
          }

          if (typeof bundle.stopVideoTransform === 'function') {
            try {
              bundle.stopVideoTransform();
            } catch (error) {
              console.warn('No se pudo detener el transformador de video del directo:', error);
            }
          }

          const tracks = [];
          [bundle.previewStream, bundle.publishedStream, bundle.micStream, bundle.cameraStream].forEach((stream) => {
            if (stream?.getTracks) {
              tracks.push(...stream.getTracks());
            }
          });

          const seen = new Set();
          tracks.forEach((track) => {
            if (!track || seen.has(track.id)) {
              return;
            }
            seen.add(track.id);
            try {
              track.stop();
            } catch (error) {
              console.warn('No se pudo detener un track del directo:', error);
            }
          });

          if (bundle.audioContext) {
            bundle.audioContext.close().catch(() => { });
          }
        }

        function stopHostStreams() {
          hostTorchEnabled = false;
          hostTorchSupported = false;
          cleanupMediaBundle(hostMediaBundle);
          hostMediaBundle = null;
          hostPreviewVideo.srcObject = null;
        }

        function delay(ms) {
          return new Promise((resolve) => window.setTimeout(resolve, ms));
        }

        function beginLiveSourceTransition() {
          if (!liveSourceTransitionMask) {
            return 0;
          }

          transitionToken += 1;
          transitionStartedAt = Date.now();
          window.clearTimeout(transitionHideTimer);
          liveSourceTransitionMask.classList.remove('hidden', 'is-exiting');
          void liveSourceTransitionMask.offsetWidth;
          liveSourceTransitionMask.classList.add('is-active');
          return transitionToken;
        }

        async function endLiveSourceTransition(token, minDurationMs = 1000) {
          if (!liveSourceTransitionMask) {
            return;
          }

          if (token && token !== transitionToken) {
            return;
          }

          const elapsed = Date.now() - transitionStartedAt;
          const remaining = Math.max(0, minDurationMs - elapsed);
          if (remaining > 0) {
            await delay(remaining);
          }

          if (token && token !== transitionToken) {
            return;
          }

          liveSourceTransitionMask.classList.remove('is-active');
          liveSourceTransitionMask.classList.add('is-exiting');
          const currentToken = transitionToken;
          transitionHideTimer = window.setTimeout(() => {
            if (currentToken !== transitionToken) {
              return;
            }
            liveSourceTransitionMask.classList.add('hidden');
            liveSourceTransitionMask.classList.remove('is-exiting');
          }, 280);
        }

        function syncViewerMuteButtons() {
          const viewerMuteBtn = container.querySelector('#live-viewer-mute-btn');
          const muted = viewerIsMuted;
          const desktopIcon = viewerMuteBtn?.querySelector('.material-symbols-outlined');
          const mobileIcon = playerMuteBtn?.querySelector('.material-symbols-outlined');
          if (desktopIcon) desktopIcon.textContent = muted ? 'volume_off' : 'volume_up';
          if (mobileIcon) mobileIcon.textContent = muted ? 'volume_off' : 'volume_up';
        }

        function applyViewerMuteState() {
          const mediaElements = new Set();
          if (viewerVideo) {
            mediaElements.add(viewerVideo);
          }
          viewerPlayerRoot?.querySelectorAll?.('video').forEach((element) => mediaElements.add(element));

          mediaElements.forEach((element) => {
            element.muted = viewerIsMuted;
            element.defaultMuted = viewerIsMuted;
            element.volume = viewerIsMuted ? 0 : 1;
            if (!viewerIsMuted) {
              Promise.resolve(element.play?.()).catch(() => { });
            }
          });
          if (viewerPlayer?.setMute) {
            try {
              viewerPlayer.setMute(viewerIsMuted);
            } catch (_error) { }
          }
          syncViewerMuteButtons();
        }

        function clearViewerTapToUnmute() {
          if (viewerTapUnmuteHandler && liveVideoWrap) {
            liveVideoWrap.removeEventListener('click', viewerTapUnmuteHandler);
          }
          viewerTapUnmuteHandler = null;
        }

        function armViewerTapToUnmute() {
          clearViewerTapToUnmute();
          if (!viewerIsMuted) {
            return;
          }
          viewerTapUnmuteHandler = () => {
            viewerIsMuted = false;
            applyViewerMuteState();
            clearViewerTapToUnmute();
          };
          liveVideoWrap?.addEventListener('click', viewerTapUnmuteHandler);
        }

        function maybeEscalateViewerTransport() {
          if (viewerTransportEscalated || viewerTransportMode === LIVESTREAM_FALLBACK_TRANSPORT) {
            return false;
          }
          viewerTransportEscalated = true;
          viewerTransportMode = LIVESTREAM_FALLBACK_TRANSPORT;
          window.setTimeout(() => {
            ensureViewerPlayer(true).catch((error) => {
              console.warn('No se pudo reintentar el viewer del directo por transporte alterno:', error);
            });
          }, 120);
          return true;
        }

        function ensureViewerFreezeFrameElement() {
          if (!liveVideoWrap) {
            return null;
          }

          if (!viewerFreezeFrame) {
            viewerFreezeFrame = document.createElement('img');
            viewerFreezeFrame.className = 'live-freeze-frame absolute inset-0 w-full h-full object-contain bg-black pointer-events-none hidden';
            viewerFreezeFrame.style.zIndex = '2';
          }

          if (!viewerFreezeFrame.parentElement) {
            liveVideoWrap.appendChild(viewerFreezeFrame);
          }

          return viewerFreezeFrame;
        }

        function destroyPlayer(options = {}) {
          const preserveFreezeFrame = options.preserveFreezeFrame === true;
          hideViewerRetrySpinner();
          disconnectViewerPlayerMediaObserver();
          if (viewerReconnectTimer) {
            window.clearTimeout(viewerReconnectTimer);
            viewerReconnectTimer = 0;
          }
          if (viewerPlayer && typeof viewerPlayer.remove === 'function') {
            try {
              viewerPlayer.remove();
            } catch (error) {
              console.warn('No se pudo destruir OvenPlayer del viewer:', error);
            }
          }
          viewerPlayer = null;
          if (viewerHls && typeof viewerHls.destroy === 'function') {
            viewerHls.destroy();
          }
          viewerHls = null;
          clearViewerTapToUnmute();
          if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute('src');
            viewerVideo.load();
          }
          viewerVideo = null;
          viewerPlayerSourceUrl = null;
          viewerPlayerCreatedAt = 0;
          viewerLastMediaTime = 0;
          viewerLastMediaProgressAt = 0;
          viewerPendingSourceUrl = null;
          viewerSwitchPrepared = false;
          viewerBoundSourceUrl = '';
          viewerTransportMode = LIVESTREAM_PRIMARY_TRANSPORT;
          viewerTransportEscalated = false;
          viewerPlayerRoot.innerHTML = '';
          viewerRetrySpinner = null;
          if (!preserveFreezeFrame) {
            clearViewerFreezeFrame({ remove: true });
          } else if (viewerFreezeFrame) {
            viewerFreezeFrame.classList.remove('hidden');
          }
        }

        function showViewerRetrySpinner() {
          if (!viewerPlayerRoot) {
            return;
          }

          if (!viewerRetrySpinner) {
            viewerRetrySpinner = document.createElement('div');
            viewerRetrySpinner.className = 'live-retry-spinner';
            viewerRetrySpinner.innerHTML = '<div class="live-retry-spinner__ring"></div>';
          }

          if (!viewerRetrySpinner.parentElement) {
            viewerPlayerRoot.appendChild(viewerRetrySpinner);
          }
          viewerRetrySpinner.classList.remove('hidden');
        }

        function hideViewerRetrySpinner() {
          if (!viewerRetrySpinner) {
            return;
          }
          viewerRetrySpinner.classList.add('hidden');
        }

        function queueViewerReconnect(sourceUrl, delayMs = 550) {
          if (!sourceUrl || viewerReconnectTimer) {
            return;
          }
          viewerPlayerLastRetryAt = Date.now();
          showViewerRetrySpinner();
          viewerReconnectTimer = window.setTimeout(() => {
            viewerReconnectTimer = 0;
            if ((liveData?.live_status || '') !== 'live') {
              return;
            }
            if (viewerPlayerSourceUrl !== sourceUrl) {
              return;
            }
            ensureViewerPlayer(true).catch((error) => {
              console.warn('No se pudo reintentar el viewer del directo tras el cambio de fuente:', error);
            });
          }, delayMs);
        }

        function captureViewerFreezeFrame(options = {}) {
          if (!viewerVideo || !viewerPlayerRoot || !viewerVideo.videoWidth || !viewerVideo.videoHeight) {
            return;
          }

          try {
            const canvas = document.createElement('canvas');
            canvas.width = viewerVideo.videoWidth;
            canvas.height = viewerVideo.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) {
              return;
            }

            context.drawImage(viewerVideo, 0, 0, canvas.width, canvas.height);

            const freezeFrame = ensureViewerFreezeFrameElement();
            if (!freezeFrame) {
              return;
            }

            freezeFrame.src = canvas.toDataURL('image/jpeg', 0.82);
            freezeFrame.classList.remove('hidden');
            if (options.hideVideo && viewerVideo) {
              viewerVideo.style.opacity = '0';
            }
          } catch (error) {
            console.warn('No se pudo capturar el ultimo frame del directo:', error);
          }
        }

        function clearViewerFreezeFrame(options = {}) {
          if (!viewerFreezeFrame) {
            return;
          }

          viewerFreezeFrame.classList.add('hidden');
          if (options.remove) {
            viewerFreezeFrame.remove();
            viewerFreezeFrame = null;
          }
          if (viewerVideo) {
            viewerVideo.style.opacity = '1';
          }
        }

        function bindViewerFreezeFrameEvents(video) {
          if (!video || video.dataset.liveFreezeFrameEventsAttached === '1') {
            return;
          }
          video.dataset.liveFreezeFrameEventsAttached = '1';
          const showLastFrame = () => {
            if (viewerVideo !== video || liveVideoFallback.classList.contains('hidden') === false) {
              return;
            }
            captureViewerFreezeFrame({ hideVideo: true });
          };
          const recover = () => {
            if (viewerVideo !== video || video.readyState < 2) {
              return;
            }
            clearViewerFreezeFrame();
          };
          ['waiting', 'stalled', 'suspend'].forEach((eventName) => {
            video.addEventListener(eventName, showLastFrame);
          });
          ['playing', 'canplay', 'timeupdate'].forEach((eventName) => {
            video.addEventListener(eventName, recover);
          });
        }

        function disposeViewerHlsKeepFrame(nextSourceUrl = null, options = {}) {
          captureViewerFreezeFrame({ hideVideo: true });
          disconnectViewerPlayerMediaObserver();
          if (options.showSpinner) {
            showViewerRetrySpinner();
          } else {
            hideViewerRetrySpinner();
          }

          if (viewerHls) {
            try {
              if (typeof viewerHls.stopLoad === 'function') {
                viewerHls.stopLoad();
              }
            } catch (error) {
              console.warn('No se pudo pausar el HLS del viewer antes del cambio:', error);
            }

            try {
              if (typeof viewerHls.destroy === 'function') {
                viewerHls.destroy();
              }
            } catch (error) {
              console.warn('No se pudo destruir el HLS del viewer antes del cambio:', error);
            }
          }

          if (viewerPlayer && typeof viewerPlayer.remove === 'function') {
            try {
              viewerPlayer.remove();
            } catch (error) {
              console.warn('No se pudo destruir OvenPlayer del viewer antes del cambio:', error);
            }
          }

          viewerPlayer = null;
          viewerHls = null;
          viewerPendingSourceUrl = nextSourceUrl;
          viewerSwitchPrepared = true;
          viewerPlayerLastRetryAt = Date.now();
          clearViewerTapToUnmute();

          if (viewerVideo) {
            try {
              viewerVideo.pause();
              viewerVideo.removeAttribute('src');
              viewerVideo.load();
            } catch (_error) {
              // keep the last rendered frame visible under the next player
            }
          }
          viewerVideo = null;
          viewerBoundSourceUrl = '';
        }

        function showFallback(title, copy) {
          hideViewerRetrySpinner();
          viewerPlayerRoot.classList.add('hidden');
          hostPreviewVideo.classList.add('hidden');
          liveVideoFallback.classList.remove('hidden');
          liveFallbackTitle.textContent = title;
          liveFallbackCopy.textContent = copy;
        }

        function showHostPreview() {
          viewerPlayerRoot.classList.add('hidden');
          hostPreviewVideo.classList.remove('hidden');
          liveVideoFallback.classList.add('hidden');
        }

        function showViewerPlayer() {
          hostPreviewVideo.classList.add('hidden');
          viewerPlayerRoot.classList.remove('hidden');
          if (!viewerVideo) {
            const attachedVideo = viewerPlayerRoot.querySelector('video');
            if (attachedVideo) {
              viewerVideo = attachedVideo;
            }
          }
          // Don't hide fallback yet — wait until video actually has frames
          // The fallback will be hidden in the 'playing' event listener on the video
          if (viewerVideo && viewerVideo.readyState >= 2) {
            liveVideoFallback.classList.add('hidden');
            viewerVideo.style.opacity = '1';
          }
          applyViewerMuteState();
        }


        const commentMarkup = (comment) => {
          const author = resolveProfileData({
            id: comment.user_id,
            user_name: comment.user_name,
            user_faculty: comment.user_faculty,
            user_avatar: comment.user_avatar,
          });
          const avatarBg = author.avatar_url ? `background-image:url('${safeUrl(author.avatar_url)}');background-color:${userColor(author)}` : `background:${userColor(author)}`;
          const avatarContent = author.avatar_url ? '' : escapeHtml(initials(displayName(author)));

          return `
            <div class="flex items-start gap-3" data-comment-id="${comment.id}" style="animation:live-comment-in 0.3s ease-out both;">
              <div class="w-10 h-10 rounded-full bg-slate-600 shrink-0 flex items-center justify-center text-white text-xs font-bold" style="${avatarBg};background-size:cover;background-position:center;">${avatarContent}</div>
              <div class="min-w-0">
                <span class="font-bold text-[13px] text-white">${escapeHtml(displayName(author))}</span>
                <span class="text-[11px] text-white/35 ml-1.5">${escapeHtml(timeAgo(comment.created_at))}</span>
                <p class="text-[13px] text-white/80 mt-0.5 break-words whitespace-pre-wrap">${escapeHtml(comment.content || '')}</p>
              </div>
            </div>
          `;
        };

        const floatingReactionQueues = new WeakMap();
        const floatingReactionState = new WeakMap();

        function getFloatingReactionState(target) {
          let state = floatingReactionState.get(target);
          if (!state) {
            state = {
              activeCount: 0,
              laneCursor: 0,
            };
            floatingReactionState.set(target, state);
          }
          return state;
        }

        function addFloatingReaction(type) {
          const emojiMap = {
            me_gusta: '❤️',
            me_divierte: '😂',
            me_sorprende: '😮',
            me_enoja: '😡',
            me_entristece: '😢',
          };
          const emoji = emojiMap[type] || '❤️';

          [floatingReactions].forEach((target) => {
            if (!target) return;
            const state = getFloatingReactionState(target);
            const nextAvailableAt = floatingReactionQueues.get(target) || 0;
            const now = Date.now();
            const delayMs = Math.max(0, nextAvailableAt - now);
            const spacingMs = isDesktopClient() ? 210 : 255;
            floatingReactionQueues.set(target, Math.max(now, nextAvailableAt) + spacingMs);

            window.setTimeout(() => {
              if (!target.isConnected) {
                return;
              }

              const maxActive = isDesktopClient() ? 10 : 7;
              if (state.activeCount >= maxActive) {
                const oldestBubble = target.querySelector('.live-float-emoji');
                if (oldestBubble) {
                  oldestBubble.remove();
                  state.activeCount = Math.max(0, state.activeCount - 1);
                }
              }

              const bubble = document.createElement('div');
              const lanes = isDesktopClient() ? 6 : 5;
              const lane = state.laneCursor % lanes;
              state.laneCursor += 1;
              const laneOffset = lane * (isDesktopClient() ? 18 : 13);
              const xOffset = ((lane % 2 === 0 ? -1 : 1) * (10 + Math.floor(Math.random() * (isDesktopClient() ? 18 : 12))));
              const durationMs = 2200 + Math.floor(Math.random() * 420);
              bubble.textContent = emoji;
              bubble.className = 'live-float-emoji';
              bubble.style.right = `${8 + laneOffset}px`;
              bubble.style.bottom = `${10 + (lane % 3) * 6}px`;
              bubble.style.setProperty('--float-x', `${xOffset}px`);
              bubble.style.setProperty('--float-rise', `${-150 - lane * (isDesktopClient() ? 16 : 12) - Math.floor(Math.random() * 28)}px`);
              bubble.style.animationDuration = `${durationMs}ms`;
              state.activeCount += 1;
              bubble.addEventListener('animationend', () => {
                bubble.remove();
                state.activeCount = Math.max(0, state.activeCount - 1);
              }, { once: true });
              target.appendChild(bubble);
            }, delayMs);
          });
        }

        function refreshReactionButtons() {
          const emojiLookup = { me_gusta: '❤️', me_divierte: '😂', me_sorprende: '😮', me_enoja: '😡', me_entristece: '😢', me_encanta: '😍' };
          const activeEmoji = emojiLookup[activeReaction] || '❤️';
          // Update BOTH trigger buttons to show the currently active emoji
          [reactionTrigger, reactionTriggerDesktop].forEach(btn => {
            if (!btn) return;
            btn.textContent = activeEmoji;
          });
          // Update ALL selector items: highlight only the active one
          container.querySelectorAll('[data-live-set-reaction]').forEach((button) => {
            const isActive = button.dataset.liveSetReaction === activeReaction;
            button.style.background = isActive ? 'rgba(255,255,255,0.2)' : '';
            button.style.transform = isActive ? 'scale(1.2)' : '';
            button.style.boxShadow = isActive ? '0 0 0 2px rgba(236,72,153,0.5)' : '';
          });
        }

        function setAudioTrackEnabled(tracks, enabled) {
          (tracks || []).forEach((track) => {
            try {
              track.enabled = enabled;
            } catch (error) {
              console.warn('No se pudo cambiar el estado de un track de audio:', error);
            }
          });
        }

        function applyHostAudioState(bundle = hostMediaBundle) {
          if (!bundle) {
            return;
          }

          if (bundle.micGainNode) {
            bundle.micGainNode.gain.value = hostMicMuted ? 0 : (bundle.micBaseGain ?? 1);
          } else {
            setAudioTrackEnabled(bundle.micAudioTracks, !hostMicMuted);
          }

          if (bundle.systemGainNode) {
            bundle.systemGainNode.gain.value = hostSystemMuted ? 0 : (bundle.systemBaseGain ?? 0.85);
          } else {
            setAudioTrackEnabled(bundle.systemAudioTracks, !hostSystemMuted);
          }
        }

        function refreshHostAudioButtons() {
          const allMicBtns = [toggleMicButton].filter(Boolean);
          const allSysBtns = [toggleSystemAudioButton].filter(Boolean);

          allMicBtns.forEach((btn) => {
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostMicMuted ? 'mic_off' : 'mic';
            btn.classList.toggle('gradient-live', hostMicMuted);
            btn.title = hostMicMuted ? 'Activar microfono' : 'Silenciar microfono';
          });

          const isScreenSource = liveData?.live_source === 'screen' && isDesktopClient();
          allSysBtns.forEach((btn) => {
            btn.classList.toggle('hidden', !isScreenSource);
            btn.classList.toggle('flex', isScreenSource);
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostSystemMuted ? 'volume_off' : 'volume_up';
            btn.classList.toggle('gradient-live', hostSystemMuted);
            btn.title = hostSystemMuted ? 'Activar audio del sistema' : 'Silenciar audio del sistema';
          });

          // Flip camera button: only on mobile, camera source, and owner
          const isMobileCamera = !isDesktopClient() && (liveData?.live_source || 'camera') === 'camera' && isHostOwner();
          if (flipCameraButton) {
            flipCameraButton.classList.toggle('hidden', !isMobileCamera);
            flipCameraButton.classList.toggle('flex', isMobileCamera);
          }
          // Also show/hide the mobile input row flip button
          if (flipCameraMobileButton) {
            flipCameraMobileButton.classList.toggle('hidden', !isMobileCamera);
            flipCameraMobileButton.classList.toggle('flex', isMobileCamera);
          }
          const showTorch = isMobileCamera && currentFacingMode === 'environment' && hostTorchSupported;
          if (toggleTorchMobileButton) {
            toggleTorchMobileButton.classList.toggle('hidden', !showTorch);
            toggleTorchMobileButton.classList.toggle('flex', showTorch);
            toggleTorchMobileButton.classList.toggle('gradient-live', hostTorchEnabled);
            toggleTorchMobileButton.title = hostTorchEnabled ? 'Apagar linterna' : 'Encender linterna';
            const icon = toggleTorchMobileButton.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostTorchEnabled ? 'flashlight_off' : 'flashlight_on';
          }
          // Only desktop hosts can switch between screen and camera.
          if (switchSourceButton) {
            const showSwitchSource = isHostOwner() && isDesktopClient();
            switchSourceButton.classList.toggle('hidden', !showSwitchSource);
            switchSourceButton.classList.toggle('inline-flex', showSwitchSource);
          }
        }

        function isHostOwner() {
          return isHostRoute && Number(liveData?.user_id || 0) === Number(user.id);
        }

        function refreshLiveStatusBadge() {
          const isLive = liveData?.live_status === 'live';
          liveStatusBadge.textContent = isLive ? 'LIVE' : 'FINALIZADO';
          liveStatusChip.classList.toggle('gradient-live', isLive);
          liveStatusChip.classList.toggle('live-pulse', isLive);
          liveStatusChip.classList.toggle('bg-slate-700/85', !isLive);
        }

        // Show fullscreen button only for landscape streams (from PC, not mobile camera)
        function updateFullscreenButtonVisibility() {
          if (!fullscreenBtn || isDesktopClient()) return; // always show on desktop
          // Check if the stream is from a screen share (always landscape)
          if (liveData?.live_source === 'screen') {
            fullscreenBtn.classList.remove('hidden');
            return;
          }
          // For camera source: check actual video dimensions if available
          const video = viewerVideo || hostPreviewVideo;
          if (video && video.videoWidth && video.videoHeight) {
            const isLandscape = video.videoWidth > video.videoHeight;
            fullscreenBtn.classList.toggle('hidden', !isLandscape);
          } else {
            // No video yet — hide on mobile by default (will re-check)
            fullscreenBtn.classList.add('hidden');
          }
        }

        // Show mobile-only player controls (mute + fullscreen on the video itself)
        function updateMobilePlayerControls() {
          if (isDesktopClient()) return;
          const isOwner = Number(liveData?.user_id) === Number(user.id) && isHostRoute;
          // Show mute button for viewers on mobile
          if (playerMuteBtn) {
            playerMuteBtn.classList.toggle('hidden', isOwner);
            playerMuteBtn.classList.toggle('flex', !isOwner);
          }
          // Show fullscreen button only for landscape/PC streams on mobile
          if (playerFsBtn) {
            let showFs = false;
            if (liveData?.live_source === 'screen') {
              showFs = true;
            } else if (isMobileCameraStreamKey()) {
              showFs = false;
            } else {
              const video = viewerVideo || hostPreviewVideo;
              if (video && video.videoWidth && video.videoHeight) {
                showFs = video.videoWidth > video.videoHeight;
              }
            }
            playerFsBtn.classList.toggle('hidden', !showFs);
            playerFsBtn.classList.toggle('flex', showFs);
          }
        }

        function isMobileCameraStreamKey() {
          const streamKey = String(liveData?.stream_key || '');
          return (liveData?.live_source || 'camera') === 'camera'
            && /(?:^|-)mob(?:-|$)/.test(streamKey);
        }

        // Detect portrait/phone camera streams for viewer → apply full-bleed TikTok layout
        function normalizeLiveAspectRatio(value, source = 'camera') {
          if (value === '9:16' || value === '16:9') {
            return value;
          }
          return getInitialLivestreamAspectRatio(source);
        }

        function applyStreamAspectLayoutFromMetadata() {
          if (isHostRoute || !liveShell || !liveData) {
            return;
          }
          const liveSource = liveData.live_source || 'camera';
          const aspectRatio = normalizeLiveAspectRatio(liveData.stream_aspect_ratio, liveSource);
          const isPortrait = aspectRatio === '9:16';
          const isPortraitCameraStream = liveSource === 'camera' && isPortrait;
          liveShell.style.setProperty('--live-stream-aspect', isPortrait ? '9 / 16' : '16 / 9');
          liveShell.classList.toggle('live-portrait-stream', isPortrait);
          liveShell.classList.toggle('live-cam-stream', isPortraitCameraStream);
          if (viewerVideo && (!viewerVideo.videoWidth || !viewerVideo.videoHeight)) {
            viewerVideo.style.objectFit = 'contain';
          }
          syncDesktopPortraitLiveSizing();
          updateMobilePlayerControls();
        }

        function syncDesktopPortraitLiveSizing() {
          if (!liveShell || !liveVideoWrap || isHostRoute || !isDesktopClient()) {
            return;
          }

          // On desktop, portrait mobile streams should use the full desktop video
          // panel and let the inner video contain itself naturally, just like the
          // dedicated fullscreen player. Keeping wrapper-level portrait sizing
          // here causes the whole panel (and its overlays) to collapse into a
          // floating mobile card.
          liveShell.style.removeProperty('--live-desktop-portrait-width');
          liveShell.style.removeProperty('--live-desktop-portrait-height');
        }

        function updateStreamLayout() {
          applyStreamAspectLayoutFromMetadata();
          if (isHostRoute) return;
          const video = viewerVideo;
          if (!video || !video.videoWidth || !video.videoHeight) return;
          // Only treat as portrait if significantly taller than wide (ratio < 0.75)
          const ratio = video.videoWidth / video.videoHeight;
          const isPortrait = ratio < 0.75;
          const liveSource = liveData?.live_source || 'camera';
          const isPortraitCameraStream = liveSource === 'camera' && (isPortrait || isMobileCameraStreamKey());
          if (liveShell) {
            liveShell.style.setProperty('--live-stream-aspect', `${Math.max(1, video.videoWidth)} / ${Math.max(1, video.videoHeight)}`);
            liveShell.classList.toggle('live-portrait-stream', isPortrait);
            liveShell.classList.toggle('live-cam-stream', isPortraitCameraStream);
          }
          video.style.objectFit = (!isDesktopClient() && isPortraitCameraStream) ? 'cover' : 'contain';
          syncDesktopPortraitLiveSizing();
          updateMobilePlayerControls();
        }

        function getHostCameraVideoTrack(bundle = hostMediaBundle) {
          const stream = bundle?.cameraStream || bundle?.previewStream || bundle?.publishedStream;
          if (!stream?.getVideoTracks) {
            return null;
          }
          return stream.getVideoTracks()[0] || null;
        }

        async function setHostTorchEnabled(enabled) {
          const videoTrack = getHostCameraVideoTrack();
          if (!videoTrack || !hostTorchSupported || currentFacingMode !== 'environment') {
            hostTorchEnabled = false;
            return false;
          }

          try {
            await videoTrack.applyConstraints({
              advanced: [{ torch: !!enabled }],
            });
            hostTorchEnabled = !!enabled;
            return true;
          } catch (error) {
            console.warn('No se pudo cambiar el estado de la linterna del directo:', error);
            hostTorchEnabled = false;
            hostTorchSupported = false;
            return false;
          }
        }

        async function syncHostTorchSupport(bundle = hostMediaBundle) {
          const videoTrack = getHostCameraVideoTrack(bundle);
          hostTorchSupported = false;

          if (!videoTrack || isDesktopClient() || (liveData?.live_source || 'camera') !== 'camera') {
            hostTorchEnabled = false;
            return;
          }

          try {
            const capabilities = typeof videoTrack.getCapabilities === 'function'
              ? videoTrack.getCapabilities()
              : null;
            hostTorchSupported = !!capabilities?.torch;
          } catch (_error) {
            hostTorchSupported = false;
          }

          if (!hostTorchSupported || currentFacingMode !== 'environment') {
            if (hostTorchEnabled) {
              await setHostTorchEnabled(false);
            } else {
              hostTorchEnabled = false;
            }
          }
        }

        function viewerPlaybackLooksStalled() {
          if (!viewerVideo || !viewerPlayerSourceUrl) {
            return false;
          }

          const now = Date.now();
          // Give player plenty of time before declaring stalled (mobile needs more time)
          if ((now - viewerPlayerCreatedAt) < 8000 || (now - viewerPlayerLastRetryAt) < 8000) {
            return false;
          }

          // No data at all: definitely stalled.
          if (viewerVideo.readyState < 1 && viewerVideo.paused) return true;

          // If playback time is not progressing for several seconds while live is active,
          // the player is likely stuck on an old segment loop after a source restart.
          const currentTime = Number(viewerVideo.currentTime || 0);
          if (currentTime > (viewerLastMediaTime + 0.05)) {
            viewerLastMediaTime = currentTime;
            viewerLastMediaProgressAt = now;
            return false;
          }

          if (!viewerLastMediaProgressAt) {
            viewerLastMediaProgressAt = now;
            viewerLastMediaTime = currentTime;
            return false;
          }

          if (!viewerVideo.paused && viewerVideo.readyState >= 2 && (now - viewerLastMediaProgressAt) > 5000) {
            return true;
          }
          return false;
        }

        function syncViewerToLiveEdge(force = false) {
          if (!viewerHls || !viewerVideo) {
            return;
          }

          const syncPosition = viewerHls.liveSyncPosition;
          if (!Number.isFinite(syncPosition) || syncPosition <= 0) {
            return;
          }

          const currentTime = Number(viewerVideo.currentTime || 0);
          const drift = syncPosition - currentTime;

          // Only seek on force or very large drift — seeking causes black frames
          // Seek on initial load OR if truly stuck/looping (drift > 4s)
          if ((force && currentTime <= 0) || drift > 4) {
            try {
              viewerVideo.currentTime = syncPosition;
            } catch (error) {
              console.warn('No se pudo saltar al borde en vivo del directo:', error);
            }
          }

          // Speed up gently if behind — avoids stutter but corrects drift
          if (drift > 1.5) {
            viewerVideo.playbackRate = Math.min(1.06, 1 + drift / 14);
            return;
          }

          if (viewerFreezeFrame && viewerVideo.readyState >= 2) {
            viewerVideo.style.opacity = '1';
            clearViewerFreezeFrame();
          }
          viewerVideo.playbackRate = 1;
        }

        async function ensureViewerManifest(url, options = {}) {
          const attempts = Number(options.attempts || 5);
          const pauseMs = Number(options.pauseMs || 650);
          const requestTimeoutMs = Number(options.requestTimeoutMs || 2200);
          const probeUrl = options.probeUrl || url;

          for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
              const controller = new AbortController();
              const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
              const response = await fetch(`${probeUrl}${probeUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
              });
              window.clearTimeout(timeoutId);
              if (response.status === 204) {
                // Todavia no esta listo; seguimos intentando sin ensuciar la consola.
              } else if (response.ok) {
                const manifest = await response.text();
                if (manifest.includes('#EXTM3U')) {
                  return true;
                }
              }
            } catch (error) {
              // seguimos intentando unos segundos antes de rendirnos
            }

            if (attempt < attempts - 1) {
              await new Promise((resolve) => window.setTimeout(resolve, pauseMs));
            }
          }

          return false;
        }

        async function waitForPublishedManifest(streamKey, options = {}) {
          if (!streamKey) {
            return false;
          }

          const attempts = Number(options.attempts || 18);
          const pauseMs = Number(options.pauseMs || 180);
          const requestTimeoutMs = Number(options.requestTimeoutMs || 1500);
          const manifestUrl = buildLivestreamProbeUrl(streamKey);

          for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
              const controller = new AbortController();
              const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
              const response = await fetch(`${manifestUrl}?t=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
              });
              window.clearTimeout(timeoutId);

              if (response.status === 204) {
                // OME proxy reports "not ready yet" without polluting the console with 404s.
              } else if (response.ok) {
                const manifest = await response.text();
                if (manifest.includes('#EXTM3U')) {
                  return true;
                }
              }
            } catch (_error) {
              // seguimos intentando un corto tiempo
            }

            if (attempt < attempts - 1) {
              await delay(pauseMs);
            }
          }

          return false;
        }

        function createViewerVideo() {
          const video = document.createElement('video');
          video.className = 'w-full h-full object-contain bg-black absolute inset-0';
          prepareViewerMediaElement(video);
          bindViewerFreezeFrameEvents(video);
          video.muted = true;
          if (viewerTapUnmuteHandler && liveVideoWrap) {
            liveVideoWrap.removeEventListener('click', viewerTapUnmuteHandler);
          }
          // Don't clear innerHTML yet — keep old video visible until new one is ready
          viewerPlayerRoot.appendChild(video);
          viewerVideo = video;
          // Tap on video to unmute (only fires once)
          viewerTapUnmuteHandler = () => {
            if (viewerVideo && viewerVideo.muted) {
              viewerVideo.muted = false;
            }
            if (liveVideoWrap && viewerTapUnmuteHandler) {
              liveVideoWrap.removeEventListener('click', viewerTapUnmuteHandler);
            }
            viewerTapUnmuteHandler = null;
          };
          liveVideoWrap?.addEventListener('click', viewerTapUnmuteHandler);
          // Re-check layout once dimensions are known
          video.addEventListener('loadedmetadata', () => {
            updateFullscreenButtonVisibility();
            updateMobilePlayerControls();
            updateStreamLayout();
            // Now safe to remove previous video elements
            Array.from(viewerPlayerRoot.children).forEach(el => {
              if (el !== video) viewerPlayerRoot.removeChild(el);
            });
          }, { once: true });
          // Hide fallback once video is actually rendering frames
          const hideFallback = () => {
            liveVideoFallback.classList.add('hidden');
            video.style.opacity = '1';
            clearViewerFreezeFrame();
            hideViewerRetrySpinner();
            endLiveSourceTransition(transitionToken, 1000).catch(() => { });
          };
          video.addEventListener('playing', hideFallback, { once: true });
          video.addEventListener('canplay', hideFallback, { once: true });
          // Generous timeout: only hide fallback after 8s as last resort
          setTimeout(() => {
            if (viewerVideo === video && !liveVideoFallback.classList.contains('hidden')) {
              hideFallback();
            }
          }, 8000);
          return video;
        }

        function bindViewerMediaElement(video, sourceUrl, readyAt) {
          if (!video) {
            return null;
          }

          const isSameBinding = viewerVideo === video && viewerBoundSourceUrl === sourceUrl;
          viewerVideo = video;

          if (isSameBinding) {
            applyViewerMuteState();
            return video;
          }

          prepareViewerMediaElement(video);
          bindViewerFreezeFrameEvents(video);
          viewerBoundSourceUrl = sourceUrl;
          applyViewerMuteState();
          armViewerTapToUnmute();

          const handleMetadata = () => {
            updateFullscreenButtonVisibility();
            updateMobilePlayerControls();
            updateStreamLayout();
          };
          video.addEventListener('loadedmetadata', handleMetadata, { once: true });

          const hideFallback = () => {
            if (viewerPlayerSourceUrl && viewerPlayerSourceUrl !== sourceUrl) {
              return;
            }
            showViewerPlayer();
            liveVideoFallback.classList.add('hidden');
            video.style.opacity = '1';
            clearViewerFreezeFrame();
            hideViewerRetrySpinner();
            endLiveSourceTransition(transitionToken, 1000).catch(() => { });
          };
          video.addEventListener('playing', hideFallback, { once: true });
          video.addEventListener('canplay', hideFallback, { once: true });
          const pollForFrames = (remainingChecks = 20) => {
            if (viewerVideo !== video || liveVideoFallback.classList.contains('hidden')) {
              return;
            }
            if (video.readyState >= 2 || (video.videoWidth > 0 && video.videoHeight > 0) || Number(video.currentTime || 0) > 0.05) {
              hideFallback();
              return;
            }
            if (remainingChecks <= 0) {
              return;
            }
            window.setTimeout(() => pollForFrames(remainingChecks - 1), 150);
          };
          pollForFrames();
          if (video.readyState >= 2 || (video.videoWidth > 0 && video.videoHeight > 0)) {
            window.requestAnimationFrame(hideFallback);
          }
          window.setTimeout(() => {
            if (viewerVideo === video && viewerPlayerSourceUrl === sourceUrl && !liveVideoFallback.classList.contains('hidden')) {
              if (!maybeEscalateViewerTransport()) {
                showViewerRetrySpinner();
              }
            }
          }, 3000);

          viewerPlayerCreatedAt = readyAt;
          viewerPlayerLastRetryAt = readyAt;
          viewerLastMediaTime = 0;
          viewerLastMediaProgressAt = 0;
          return video;
        }

        function scheduleViewerMediaBinding(player, sourceUrl, readyAt, attempts = 12) {
          if (!player || viewerPlayer !== player || !viewerPlayerRoot) {
            return;
          }

          const mediaElement = viewerPlayerRoot.querySelector('video');

          if (mediaElement) {
            prepareViewerMediaElement(mediaElement);
            bindViewerMediaElement(mediaElement, sourceUrl, readyAt);
            return;
          }

          if (attempts <= 0) {
            return;
          }

          window.setTimeout(() => {
            if (viewerPlayer === player) {
              scheduleViewerMediaBinding(player, sourceUrl, readyAt, attempts - 1);
            }
          }, 120);
        }

        async function ensureViewerPlayer(forceRestart = false) {
          if (viewerBootstrapInFlight) {
            return;
          }

          if (!liveData?.stream_key) {
            showFallback('Preparando directo', 'La transmision todavia esta preparando su senal en vivo.');
            return;
          }

          viewerBootstrapInFlight = true;

          try {
            await ensureLivestreamLibraries();
            const sourceRevision = `${liveData.live_source || 'camera'}:${liveData.stream_key || ''}`;
            const sourceUrl = buildLivestreamWebRtcUrl(liveData.stream_key, sourceRevision, viewerTransportMode);
            const switchingExistingStream = !!(viewerPlayerSourceUrl && viewerPlayerSourceUrl !== sourceUrl);
            const restartingCurrentStream = !!(forceRestart && viewerPlayerSourceUrl === sourceUrl);
            if (switchingExistingStream) {
              beginLiveSourceTransition();
            }
            if (!forceRestart && viewerPlayer && viewerPlayerSourceUrl === sourceUrl) {
              scheduleViewerMediaBinding(viewerPlayer, sourceUrl, viewerPlayerCreatedAt || Date.now());
              showViewerPlayer();
              return;
            }

            if (switchingExistingStream && (!viewerSwitchPrepared || viewerPendingSourceUrl !== sourceUrl)) {
              disposeViewerHlsKeepFrame(sourceUrl);
            }
            if (restartingCurrentStream && (!viewerSwitchPrepared || viewerPendingSourceUrl !== sourceUrl)) {
              disposeViewerHlsKeepFrame(sourceUrl, { showSpinner: true });
            }

            if (!switchingExistingStream && !restartingCurrentStream) {
              destroyPlayer();
            }

            showViewerPlayer();
            const readyAt = Date.now();
            if (!window.OvenPlayer?.create) {
              showFallback('Reproduccion no compatible', 'Este navegador no pudo cargar el directo.');
              return;
            }

            const playerMount = document.createElement('div');
            playerMount.id = `live-viewer-player-mount-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            playerMount.className = 'absolute inset-0 w-full h-full bg-black';
            viewerPlayerRoot.appendChild(playerMount);
            viewerPlayerSourceUrl = sourceUrl;
            viewerPendingSourceUrl = null;
            viewerSwitchPrepared = false;
            const player = window.OvenPlayer.create(playerMount, {
              autoStart: true,
              controls: false,
              mute: viewerIsMuted,
              sources: [{ type: 'webrtc', file: sourceUrl }],
            });
            viewerPlayer = player;
            observeViewerPlayerMedia(player, sourceUrl, readyAt);
            scheduleViewerMediaBinding(player, sourceUrl, readyAt);
            if (typeof player.on === 'function') {
              player.on('ready', () => {
                if (viewerPlayer !== player) {
                  return;
                }
                observeViewerPlayerMedia(player, sourceUrl, readyAt);
                scheduleViewerMediaBinding(player, sourceUrl, readyAt);
              });
              player.on('stateChanged', (data) => {
                if (viewerPlayer !== player) {
                  return;
                }
                const nextState = String(data?.newstate || '').toLowerCase();
                if (nextState === 'playing') {
                  if (viewerReconnectTimer) {
                    window.clearTimeout(viewerReconnectTimer);
                    viewerReconnectTimer = 0;
                  }
                  scheduleViewerMediaBinding(player, sourceUrl, readyAt);
                  showViewerPlayer();
                  liveVideoFallback.classList.add('hidden');
                  hideViewerRetrySpinner();
                  clearViewerFreezeFrame();
                } else if ((nextState === 'stalled' || nextState === 'error') && liveData?.live_status === 'live') {
                  captureViewerFreezeFrame({ hideVideo: true });
                  if (!maybeEscalateViewerTransport()) {
                    queueViewerReconnect(sourceUrl, 700);
                  }
                }
              });
              player.on('destroy', () => {
                if (viewerPlayer === player) {
                  viewerPlayer = null;
                }
              });
            }

            window.setTimeout(() => {
              if (viewerPlayer === player && viewerPlayerSourceUrl === sourceUrl && !viewerVideo) {
                if (!maybeEscalateViewerTransport()) {
                  queueViewerReconnect(sourceUrl, 900);
                }
              }
            }, 1500);
          } finally {
            viewerBootstrapInFlight = false;
          }
        }

        function stopMediaStreamVideoTracks(stream) {
          if (!stream || typeof stream.getVideoTracks !== 'function') {
            return;
          }

          stream.getVideoTracks().forEach((track) => {
            try {
              track.stop();
            } catch (error) {
              console.warn('No se pudo detener un track de video antes del cambio de camara:', error);
            }
          });
        }

        function releaseBundleVideoTracks(bundle) {
          if (!bundle) {
            return;
          }

          hostTorchEnabled = false;
          hostTorchSupported = false;

          if (bundle.videoTransformer?.stop) {
            try {
              bundle.videoTransformer.stop();
            } catch (error) {
              console.warn('No se pudo detener el transformador de video del directo:', error);
            }
          }

          stopMediaStreamVideoTracks(bundle.previewStream);
          if (bundle.publishedStream !== bundle.previewStream) {
            stopMediaStreamVideoTracks(bundle.publishedStream);
          }
          if (bundle.cameraStream && bundle.cameraStream !== bundle.previewStream && bundle.cameraStream !== bundle.publishedStream) {
            stopMediaStreamVideoTracks(bundle.cameraStream);
          }
        }

        function pickPreferredMobileCameraDevice(videoInputs, desiredFacing, currentDeviceId) {
          if (!Array.isArray(videoInputs) || !videoInputs.length) {
            return null;
          }

          const normalizedFacing = desiredFacing === 'user' ? 'user' : 'environment';
          const facingPattern = normalizedFacing === 'user'
            ? /(front|frontal|user|selfie)/i
            : /(back|rear|environment|trasera|posterior)/i;

          const differentDevice = videoInputs.filter((device) => device.deviceId && device.deviceId !== currentDeviceId);
          return (
            differentDevice.find((device) => facingPattern.test(device.label || ''))
            || differentDevice[0]
            || videoInputs.find((device) => facingPattern.test(device.label || ''))
            || videoInputs[0]
          );
        }

        function buildStrictPortraitCameraConstraints(preferredDeviceId, facingMode) {
          const variants = [
            { width: { exact: 720 }, height: { exact: 1280 }, aspectRatio: { exact: 9 / 16 }, resizeMode: 'crop-and-scale' },
            { width: { exact: 1080 }, height: { exact: 1920 }, aspectRatio: { exact: 9 / 16 }, resizeMode: 'crop-and-scale' },
            { width: { ideal: 720, max: 1080 }, height: { ideal: 1280, max: 1920 }, aspectRatio: { ideal: 9 / 16 }, resizeMode: 'crop-and-scale' },
          ];

          const result = [];
          variants.forEach((base) => {
            if (preferredDeviceId) {
              result.push({ ...base, deviceId: { exact: preferredDeviceId } });
            }
            if (facingMode) {
              result.push({ ...base, facingMode: { exact: facingMode } });
              result.push({ ...base, facingMode: { ideal: facingMode } });
            }
          });
          result.push(getLiveVideoConstraints('camera'));
          return result;
        }

        function getLiveAudioConstraints(profile = 'voice') {
          const musicLike = profile === 'screen' || profile === 'mixed' || profile === 'system';
          return musicLike
            ? {
              echoCancellation: { ideal: false },
              noiseSuppression: { ideal: false },
              autoGainControl: { ideal: false },
              channelCount: { ideal: 2 },
              sampleRate: { ideal: 48000 },
              sampleSize: { ideal: 16 },
            }
            : {
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: true },
              autoGainControl: { ideal: false },
              channelCount: { ideal: 1 },
              sampleRate: { ideal: 48000 },
              sampleSize: { ideal: 16 },
            };
        }

        function getLiveVideoConstraints(source, overrides = {}) {
          const desktop = isDesktopClient();
          const base = source === 'screen'
            ? {
              // Preserve the shared source dimensions; forcing 1920x1080 stretches narrow windows.
              frameRate: { ideal: 60, max: 60 },
            }
            : desktop
              ? {
                width: { ideal: 1920, max: 1920 },
                height: { ideal: 1080, max: 1080 },
                frameRate: { ideal: 60, max: 60 },
                aspectRatio: { ideal: 16 / 9 },
              }
              : {
                // Mobile camera: start from a lighter baseline so movement under
                // weak networks does not punish viewers immediately.
                width: { ideal: 960, max: 1280 },
                height: { ideal: 540, max: 720 },
                frameRate: { ideal: 24, max: 30 },
              };

          return { ...base, ...overrides };
        }

        function applyLiveTrackHints(stream, source) {
          if (!stream?.getTracks) {
            return;
          }

          stream.getVideoTracks().forEach((track) => {
            try {
              track.contentHint = source === 'screen' ? 'detail' : 'motion';
            } catch (_error) { }
          });

          stream.getAudioTracks().forEach((track) => {
            try {
              track.contentHint = source === 'screen' ? 'music' : 'speech';
            } catch (_error) { }
          });
        }

        function createMixedAudioTrack(displayAudioTrack, micAudioTrack) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass || !displayAudioTrack || !micAudioTrack) {
            return null;
          }

          try {
            let audioContext;
            try {
              audioContext = new AudioContextClass({ sampleRate: 48000 });
            } catch (_error) {
              audioContext = new AudioContextClass();
            }

            const destination = audioContext.createMediaStreamDestination();
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.value = -14;
            compressor.knee.value = 18;
            compressor.ratio.value = 2;
            compressor.attack.value = 0.008;
            compressor.release.value = 0.18;

            const displaySource = audioContext.createMediaStreamSource(new MediaStream([displayAudioTrack]));
            const micSource = audioContext.createMediaStreamSource(new MediaStream([micAudioTrack]));
            const systemGainNode = audioContext.createGain();
            const micGainNode = audioContext.createGain();
            systemGainNode.gain.value = 0.95;
            micGainNode.gain.value = 0.92;

            displaySource.connect(systemGainNode).connect(compressor);
            micSource.connect(micGainNode).connect(compressor);
            compressor.connect(destination);

            const mixedTrack = destination.stream.getAudioTracks()[0] || null;
            if (mixedTrack) {
              try {
                mixedTrack.contentHint = 'music';
              } catch (_error) { }
            }

            if (audioContext.state === 'suspended') {
              audioContext.resume().catch(() => { });
            }

            return {
              audioContext,
              systemGainNode,
              micGainNode,
              mixedTrack,
            };
          } catch (error) {
            console.warn('No se pudo crear la mezcla optimizada de audio:', error);
            return null;
          }
        }

        async function createMobilePortraitCameraOutput(cameraStream) {
          const sourceTrack = cameraStream?.getVideoTracks?.()[0] || null;
          if (!sourceTrack) {
            return null;
          }

          const probeVideo = document.createElement('video');
          probeVideo.muted = true;
          probeVideo.playsInline = true;
          probeVideo.setAttribute('playsinline', '');
          probeVideo.srcObject = cameraStream;

          await new Promise((resolve) => {
            if (probeVideo.readyState >= 1) {
              resolve();
              return;
            }
            const done = () => resolve();
            probeVideo.addEventListener('loadedmetadata', done, { once: true });
            window.setTimeout(done, 700);
          });
          await probeVideo.play().catch(() => { });

          const sourceWidth = Number(probeVideo.videoWidth || sourceTrack.getSettings?.().width || 0);
          const sourceHeight = Number(probeVideo.videoHeight || sourceTrack.getSettings?.().height || 0);
          if (!sourceWidth || !sourceHeight || sourceHeight >= sourceWidth) {
            probeVideo.pause();
            probeVideo.srcObject = null;
            return null;
          }

          const canvas = document.createElement('canvas');
          canvas.width = 720;
          canvas.height = 1280;
          const context = canvas.getContext('2d', { alpha: false });
          if (!context || typeof canvas.captureStream !== 'function') {
            probeVideo.pause();
            probeVideo.srcObject = null;
            return null;
          }

          let stopped = false;
          let animationFrame = 0;
          const drawFrame = () => {
            if (stopped) {
              return;
            }

            const videoWidth = Number(probeVideo.videoWidth || sourceWidth);
            const videoHeight = Number(probeVideo.videoHeight || sourceHeight);
            context.fillStyle = '#000';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.save();
            const scale = Math.max(canvas.width / videoWidth, canvas.height / videoHeight);
            const drawWidth = videoWidth * scale;
            const drawHeight = videoHeight * scale;
            context.drawImage(
              probeVideo,
              (canvas.width - drawWidth) / 2,
              (canvas.height - drawHeight) / 2,
              drawWidth,
              drawHeight
            );
            context.restore();
            animationFrame = window.requestAnimationFrame(drawFrame);
          };
          drawFrame();

          const canvasStream = canvas.captureStream(24);
          const portraitStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...cameraStream.getAudioTracks(),
          ]);

          return {
            stream: portraitStream,
            settings: {
              width: canvas.width,
              height: canvas.height,
              frameRate: 24,
              facingMode: sourceTrack.getSettings?.().facingMode || currentFacingMode,
              deviceId: sourceTrack.getSettings?.().deviceId || '',
              transformedFrom: `${sourceWidth}x${sourceHeight}`,
            },
            stop() {
              stopped = true;
              if (animationFrame) {
                window.cancelAnimationFrame(animationFrame);
              }
              probeVideo.pause();
              probeVideo.srcObject = null;
            },
          };
        }

        async function buildHostInputStream(source) {
          const bundle = {
            source,
            previewStream: null,
            publishedStream: null,
            cameraStream: null,
            micStream: null,
            audioContext: null,
            systemAudioTracks: [],
            micAudioTracks: [],
            systemGainNode: null,
            micGainNode: null,
            systemBaseGain: 0.85,
            micBaseGain: 1,
            videoTransformer: null,
          };

          if (source === 'screen' && isDesktopClient()) {
            // Reuse pre-captured stream from the modal if available
            let displayStream;
            if (window.__uptLivePreCapturedStream) {
              displayStream = window.__uptLivePreCapturedStream;
              window.__uptLivePreCapturedStream = null;
            } else {
              displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: getLiveVideoConstraints('screen'),
                audio: true,
              });
            }
            let micStream = null;

            try {
              micStream = await navigator.mediaDevices.getUserMedia({ audio: getLiveAudioConstraints('voice'), video: false });
            } catch (error) {
              micStream = null;
            }

            bundle.previewStream = displayStream;
            bundle.micStream = micStream;

            const finalStream = new MediaStream();
            displayStream.getVideoTracks().forEach((track) => finalStream.addTrack(track));

            const displayAudioTracks = displayStream.getAudioTracks();
            const micAudioTracks = micStream?.getAudioTracks() || [];
            bundle.systemAudioTracks = displayAudioTracks;
            bundle.micAudioTracks = micAudioTracks;

            if (displayAudioTracks.length && micAudioTracks.length) {
              const mixedAudio = createMixedAudioTrack(displayAudioTracks[0], micAudioTracks[0]);
              if (mixedAudio?.mixedTrack) {
                bundle.audioContext = mixedAudio.audioContext;
                bundle.systemGainNode = mixedAudio.systemGainNode;
                bundle.micGainNode = mixedAudio.micGainNode;
                finalStream.addTrack(mixedAudio.mixedTrack);
              } else {
                finalStream.addTrack(displayAudioTracks[0]);
              }
            } else if (displayAudioTracks.length) {
              finalStream.addTrack(displayAudioTracks[0]);
            } else if (micAudioTracks.length) {
              finalStream.addTrack(micAudioTracks[0]);
            }

            bundle.publishedStream = finalStream;
            bundle.videoSettings = displayStream.getVideoTracks()[0]?.getSettings?.() || {};
            applyLiveTrackHints(bundle.previewStream, 'screen');
            applyLiveTrackHints(bundle.publishedStream, 'screen');
            applyHostAudioState(bundle);
            return bundle;
          }

          // On mobile use facingMode for front/rear camera; on desktop just { video: true }
          let cameraStream = null;
          let preferredMobileDevice = null;
          if (isDesktopClient()) {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              video: getLiveVideoConstraints('camera'),
              audio: getLiveAudioConstraints('voice'),
            });
          } else {
            const videoInputs = await navigator.mediaDevices.enumerateDevices()
              .then((devices) => devices.filter((device) => device.kind === 'videoinput'))
              .catch(() => []);
            preferredMobileDevice = pickPreferredMobileCameraDevice(videoInputs, currentFacingMode, currentVideoDeviceId);
            const candidateConstraints = [];

            if (preferredMobileDevice?.deviceId) {
              candidateConstraints.push({
                ...getLiveVideoConstraints('camera'),
                deviceId: { exact: preferredMobileDevice.deviceId },
              });
            }

            candidateConstraints.push(
              getLiveVideoConstraints('camera', { facingMode: { exact: currentFacingMode } }),
              getLiveVideoConstraints('camera', { facingMode: { ideal: currentFacingMode } }),
              getLiveVideoConstraints('camera')
            );

            let lastCameraError = null;
            for (const videoConstraints of candidateConstraints) {
              try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                  video: videoConstraints,
                  audio: getLiveAudioConstraints('voice'),
                });
                break;
              } catch (error) {
                lastCameraError = error;
              }
            }

            if (!cameraStream) {
              throw lastCameraError || new Error('No se pudo obtener la camara');
            }
          }

          const selectedVideoTrack = cameraStream.getVideoTracks()[0] || null;
          let selectedSettings = selectedVideoTrack?.getSettings?.() || {};

          if (selectedSettings.deviceId) {
            currentVideoDeviceId = selectedSettings.deviceId;
          }
          if (selectedSettings.facingMode === 'user' || selectedSettings.facingMode === 'environment') {
            currentFacingMode = selectedSettings.facingMode;
          }
          bundle.cameraStream = cameraStream;
          // Keep the mobile camera stream native. Repainting every frame through a
          // portrait canvas looks neat visually, but it is too expensive under
          // real movement and weak devices, which is exactly when the livestream
          // starts looking like slides for viewers.
          bundle.previewStream = cameraStream;
          bundle.publishedStream = cameraStream;
          bundle.micAudioTracks = cameraStream.getAudioTracks();
          bundle.videoSettings = selectedSettings;
          applyLiveTrackHints(bundle.previewStream, 'camera');
          applyHostAudioState(bundle);
          await syncHostTorchSupport(bundle);
          return bundle;
        }

        async function syncLivestreamSourceState(source, streamKey = null, streamAspectRatio = null) {
          if (!liveId || !PostsAPI.updateLivestreamSource) {
            throw new Error('No existe API para sincronizar la fuente del directo');
          }

          const result = await PostsAPI.updateLivestreamSource(liveId, source, streamKey, streamAspectRatio || getInitialLivestreamAspectRatio(source));
          if (!result?.ok || !result.data) {
            throw new Error(result?.data?.error || 'No se pudo sincronizar la fuente del directo');
          }

          liveData = { ...liveData, ...result.data };
          applyStreamAspectLayoutFromMetadata();
          return result.data;
        }

        async function waitForViewerReadyStream(streamKey) {
          if (!streamKey) {
            return false;
          }
          return waitForPublishedManifest(streamKey, {
            attempts: 8,
            pauseMs: 80,
            requestTimeoutMs: 600,
          });
        }

        function createOvenLivekit() {
          return window.OvenLiveKit.create({
            callbacks: {
              error: (error) => {
                console.error('OvenLiveKit error:', error);
              },
            },
          });
        }

        function buildLivestreamConnectionConfig(source, transportMode = LIVESTREAM_PRIMARY_TRANSPORT) {
          const isScreen = source === 'screen';
          const desktop = isDesktopClient();
          const targetVideoBitrate = isScreen ? 12000 : (desktop ? 10000 : 3800);
          const startBitrate = isScreen ? 8000 : (desktop ? 7600 : 2400);
          const minBitrate = isScreen ? 3200 : (desktop ? 3500 : 1200);

          return {
            preferredVideoFormat: 'H264',
            maxVideoBitrate: targetVideoBitrate,
            sdp: {
              appendFmtp: `x-google-start-bitrate=${startBitrate};x-google-max-bitrate=${targetVideoBitrate};x-google-min-bitrate=${minBitrate}`,
            },
          };
        }

        function normalizeWhipResourceUrl(url) {
          if (!url || typeof url !== 'string') {
            return '';
          }

          try {
            const resolved = new URL(url, window.location.origin);
            if (window.location.protocol === 'https:' && resolved.protocol === 'http:' && resolved.host === window.location.host) {
              resolved.protocol = 'https:';
            }
            return resolved.toString();
          } catch (_error) {
            return url;
          }
        }

        async function disposeOvenLivekit(targetLivekit = ovenLivekit, options = {}) {
          const clearCurrent = options.clearCurrent !== false;

          if (!targetLivekit) {
            if (clearCurrent) {
              hostPublishing = false;
              hostPublishedSource = null;
              ovenLivekit = null;
            }
            return;
          }

          const isCurrentLivekit = targetLivekit === ovenLivekit;
          let stoppedCleanly = false;
          if (typeof targetLivekit.stopStreaming === 'function') {
            try {
              await Promise.resolve(targetLivekit.stopStreaming());
              stoppedCleanly = true;
            } catch (error) {
              console.warn('No se pudo detener la transmision antes de reiniciar la fuente:', error);
            }
          }

          if (!stoppedCleanly) {
            const directDeleteUrl = normalizeWhipResourceUrl(targetLivekit.resourceUrl);
            if (directDeleteUrl) {
              try {
                const deleteResponse = await fetch(directDeleteUrl, { method: 'DELETE' });
                stoppedCleanly = deleteResponse.ok || deleteResponse.status === 404;
              } catch (error) {
                console.warn('No se pudo cerrar directamente la sesion WHIP anterior:', error);
              }
            }
          }

          if (!stoppedCleanly && typeof targetLivekit.remove === 'function') {
            try {
              targetLivekit.remove();
            } catch (error) {
              console.warn('No se pudo limpiar OvenLiveKit antes de reiniciar la fuente:', error);
            }
          }

          if (clearCurrent && isCurrentLivekit) {
            ovenLivekit = null;
            hostPublishing = false;
            hostPublishedSource = null;
          }
        }

        function isWhipConflictError(error) {
          const message = String(error?.message || error || '');
          return message.includes('409');
        }

        async function attachAndPublishBundle(livekit, bundle, source, streamKey, transportMode = LIVESTREAM_PRIMARY_TRANSPORT) {
          livekit.attachMedia(hostPreviewVideo);
          await livekit.setMediaStream(bundle.publishedStream);
          hostPreviewVideo.srcObject = bundle.previewStream || bundle.publishedStream;
          hostPreviewVideo.style.objectFit = (!isDesktopClient() && source === 'camera') ? 'cover' : 'contain';
          showHostPreview();
          await hostPreviewVideo.play().catch(() => { });

          await livekit.startStreaming(
            buildLivestreamPublishUrl(streamKey, transportMode),
            buildLivestreamConnectionConfig(source, transportMode),
          );
          if (
            window.location.protocol === 'https:'
            && typeof livekit.resourceUrl === 'string'
            && livekit.resourceUrl.startsWith('http://')
          ) {
            livekit.resourceUrl = livekit.resourceUrl.replace(/^http:\/\//i, 'https://');
          }
        }

        async function publishHostBundle(bundle, source, streamKey) {
          let livekit = createOvenLivekit();
          try {
            await attachAndPublishBundle(livekit, bundle, source, streamKey);
          } catch (error) {
            const shouldRetryWithFallback = !isWhipConflictError(error);
            if (!shouldRetryWithFallback) {
              console.warn('OME todavia no libero la sesion anterior; reintentando cambio de fuente...', error);
            } else {
              console.warn('No se pudo publicar por transporte primario; reintentando con transporte ampliado...', error);
            }
            await disposeOvenLivekit(livekit, { clearCurrent: false });
            await delay(shouldRetryWithFallback ? 400 : 900);
            livekit = createOvenLivekit();
            try {
              await attachAndPublishBundle(livekit, bundle, source, streamKey, LIVESTREAM_FALLBACK_TRANSPORT);
            } catch (fallbackError) {
              await disposeOvenLivekit(livekit, { clearCurrent: false });
              throw fallbackError;
            }
          }

          return livekit;
        }

        function nextLivestreamStreamKey() {
          return buildLivestreamStreamKey(Number(liveData?.user_id || user.id || 0));
        }

        async function startHostSource(nextSource = null, forceRestart = false, options = {}) {
          if (sourceBusy || !liveData?.stream_key) return false;
          sourceBusy = true;
          const shouldShowTransition = hostPublishing || forceRestart;
          const transitionId = shouldShowTransition ? beginLiveSourceTransition() : 0;

          let nextBundle = null;
          let nextLivekit = null;
          const previousBundle = hostMediaBundle;
          const previousLivekit = ovenLivekit;
          const previousStreamKey = liveData?.stream_key || nextLivestreamStreamKey();
          const previousSource = hostPublishedSource || previousBundle?.source || liveData?.live_source || 'camera';
          const previousFacingMode = options.previousFacingMode || currentFacingMode;
          const isMobileCameraFlip = !!(options.isCameraFlip && !isDesktopClient() && previousSource === 'camera');
          const isInitialPublish = !hostPublishing && !forceRestart;
          let releasedPreviousCamera = false;

          try {
            await ensureLivestreamLibraries();
            const source = nextSource || liveData?.live_source || 'camera';
            if (hostPublishing && !forceRestart && hostPublishedSource === source) {
              return true;
            }

            const nextStreamKey = isInitialPublish
              ? (liveData?.stream_key || nextLivestreamStreamKey())
              : nextLivestreamStreamKey();

            if (isMobileCameraFlip && previousBundle) {
              releaseBundleVideoTracks(previousBundle);
              releasedPreviousCamera = true;
              await delay(140);
            }

            nextBundle = await buildHostInputStream(source);
            nextLivekit = await publishHostBundle(nextBundle, source, nextStreamKey);
            const viewerReadyPromise = waitForViewerReadyStream(nextStreamKey).catch(() => false);
            const nextAspectRatio = getLivestreamAspectRatioFromSettings(source, nextBundle?.videoSettings || {});
            liveData.live_source = source;
            liveData.stream_key = nextStreamKey;
            liveData.stream_aspect_ratio = nextAspectRatio;
            liveData.updated_at = new Date().toISOString();
            await syncLivestreamSourceState(source, nextStreamKey, nextAspectRatio);
            await viewerReadyPromise;
            ovenLivekit = nextLivekit;
            hostMediaBundle = nextBundle;
            hostPublishing = true;
            hostPublishedSource = source;
            refreshHostAudioButtons();
            showHostPreview();
            if (previousLivekit && previousLivekit !== nextLivekit) {
              await delay(450);
              await disposeOvenLivekit(previousLivekit, { clearCurrent: false });
            }
            if (previousBundle && previousBundle !== nextBundle) {
              cleanupMediaBundle(previousBundle);
            }
            return true;
          } catch (error) {
            console.error('No se pudo iniciar el directo con OME:', error);
            if (nextLivekit) {
              await disposeOvenLivekit(nextLivekit, { clearCurrent: false });
            }
            if (nextBundle) {
              cleanupMediaBundle(nextBundle);
            }

            let restored = false;
            if (previousLivekit && previousBundle && !isMobileCameraFlip && !releasedPreviousCamera) {
              ovenLivekit = previousLivekit;
              hostMediaBundle = previousBundle;
              hostPublishing = true;
              hostPublishedSource = previousSource;
              liveData.live_source = previousSource;
              liveData.stream_key = previousStreamKey;
              liveData.stream_aspect_ratio = getLivestreamAspectRatioFromSettings(previousSource, previousBundle?.videoSettings || {});
              liveData.updated_at = new Date().toISOString();
              await syncLivestreamSourceState(previousSource, previousStreamKey, liveData.stream_aspect_ratio);
              refreshHostAudioButtons();
              showHostPreview();
              restored = true;
            } else if ((hostPublishing || forceRestart || releasedPreviousCamera) && previousSource) {
              try {
                currentFacingMode = previousFacingMode;
                const recoveredBundle = await buildHostInputStream(previousSource);
                const recoveryStreamKey = nextLivestreamStreamKey();
                const recoveredLivekit = await publishHostBundle(recoveredBundle, previousSource, recoveryStreamKey);
                const recoveryViewerReadyPromise = waitForViewerReadyStream(recoveryStreamKey).catch(() => false);
                ovenLivekit = recoveredLivekit;
                hostMediaBundle = recoveredBundle;
                hostPublishing = true;
                hostPublishedSource = previousSource;
                const recoveredAspectRatio = getLivestreamAspectRatioFromSettings(previousSource, recoveredBundle?.videoSettings || {});
                liveData.live_source = previousSource;
                liveData.stream_key = recoveryStreamKey;
                liveData.stream_aspect_ratio = recoveredAspectRatio;
                liveData.updated_at = new Date().toISOString();
                await syncLivestreamSourceState(previousSource, recoveryStreamKey, recoveredAspectRatio);
                await recoveryViewerReadyPromise;
                restored = true;
                showHostPreview();
                refreshHostAudioButtons();
                if (previousLivekit && previousLivekit !== recoveredLivekit) {
                  await disposeOvenLivekit(previousLivekit, { clearCurrent: false });
                }
                if (previousBundle && previousBundle !== recoveredBundle) {
                  cleanupMediaBundle(previousBundle);
                }
              } catch (restoreError) {
                console.error('No se pudo restaurar la fuente anterior del directo:', restoreError);
              }
            }

            if (!restored) {
              await disposeOvenLivekit();
              cleanupMediaBundle(previousBundle);
              hostMediaBundle = null;
              hostPublishing = false;
              hostPublishedSource = null;
              showFallback('Fuente no disponible', getHostSourceUnavailableCopy(error));
            }
            showToast(restored ? 'No se pudo cambiar la fuente del directo' : 'No se pudo iniciar la transmision en vivo', 'error');
            return false;
          } finally {
            sourceBusy = false;
            if (transitionId) {
              endLiveSourceTransition(transitionId, 1000).catch(() => { });
            }
          }
        }

        async function loadLivestream() {
          const result = await PostsAPI.getLivestream(liveId);
          if (!result?.ok) {
            liveTitle.textContent = 'No se pudo cargar el directo';
            showFallback('No se pudo cargar el directo', result?.data?.error || 'Este directo ya no esta disponible.');
            return;
          }

          liveData = result.data;
          applyStreamAspectLayoutFromMetadata();
          const titleText = liveData.live_title || 'Directo UPT';
          liveTitle.textContent = titleText;
          if (liveTitleMobile) liveTitleMobile.textContent = titleText;
          const viewCount = String(liveData.live_status === 'live' ? Number(liveData.viewer_count || 0) : 0);
          liveViewerCount.textContent = viewCount;
          if (livePlayerViewerCount) livePlayerViewerCount.textContent = viewCount;

          activeReaction = liveData.current_reaction || activeReaction;
          refreshReactionButtons();
          refreshLiveStatusBadge();

          const isOwner = Number(liveData.user_id) === Number(user.id) && isHostRoute;
          hostEndButton.classList.toggle('hidden', !isOwner);
          hostTools.classList.toggle('hidden', !isOwner);
          hostTools.classList.toggle('flex', isOwner);
          [liveReportButton, liveReportButtonMobile].forEach((button) => {
            if (!button) return;
            button.classList.toggle('hidden', isOwner);
            button.classList.toggle('inline-flex', !isOwner);
          });

          refreshHostAudioButtons();

          // Show viewer mute button only for viewers (not host) — desktop
          const viewerMuteBtn = container.querySelector('#live-viewer-mute-btn');
          if (viewerMuteBtn) {
            viewerMuteBtn.classList.toggle('hidden', isOwner);
            viewerMuteBtn.classList.toggle('flex', !isOwner);
          }
          // Mobile mic button — host only
          if (toggleMicMobileButton) {
            toggleMicMobileButton.classList.toggle('hidden', !isOwner);
            toggleMicMobileButton.classList.toggle('flex', isOwner && !isDesktopClient());
          }

          const isViewerReady = !!(liveData?.stream_key && liveData?.live_status === 'live');

          if (!isOwner && liveData.live_status === 'live' && isViewerReady) {
            // Detect source change → force viewer restart
            const currentSource = liveData.live_source || 'camera';
            const currentStreamKey = liveData.stream_key || '';
            const currentRevision = `${currentSource}:${currentStreamKey}`;
            const sourceChanged = (lastKnownSource && lastKnownSource !== currentSource)
              || (lastKnownStreamKey && lastKnownStreamKey !== currentStreamKey)
              || (lastKnownSourceRevision && lastKnownSourceRevision !== currentRevision);
            lastKnownSource = currentSource;
            lastKnownStreamKey = currentStreamKey;
            lastKnownSourceRevision = currentRevision;
            if (sourceChanged) {
              viewerTransportMode = LIVESTREAM_PRIMARY_TRANSPORT;
              viewerTransportEscalated = false;
              viewerBoundSourceUrl = '';
              viewerSourceWarmupUntil = Date.now() + 180;
              captureViewerFreezeFrame({ hideVideo: true });
              beginLiveSourceTransition();
              showViewerPlayer();
            }
            if (viewerSourceWarmupUntil && Date.now() < viewerSourceWarmupUntil) {
              showViewerRetrySpinner();
              return;
            }
            if (viewerSourceWarmupUntil) {
              viewerSourceWarmupUntil = 0;
            }
            await ensureViewerPlayer(sourceChanged || viewerPlaybackLooksStalled());
            syncViewerToLiveEdge();
            updateFullscreenButtonVisibility();
            updateMobilePlayerControls();
            updateStreamLayout();
          } else if (!isOwner && liveData.live_status === 'live') {
            lastKnownSource = liveData.live_source || 'camera';
            lastKnownStreamKey = liveData.stream_key || '';
            lastKnownSourceRevision = `${lastKnownSource}:${lastKnownStreamKey}`;
            destroyPlayer();
            showFallback('Preparando directo', 'El stream todavia se esta preparando para los espectadores.');
          }

          if (liveData.live_status !== 'live') {
            destroyPlayer();
            showFallback('Directo finalizado', 'La transmision termino, pero puedes seguir viendo su registro y comentarios.');
          }

          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(140);
        }

        function isCommentsNearBottom(element) {
          if (!element || element.clientHeight <= 0) return true;
          return (element.scrollHeight - element.scrollTop - element.clientHeight) < 72;
        }

        function getActiveCommentsContainer() {
          if (!isDesktopClient() && liveCommentsMobile) {
            return liveCommentsMobile;
          }
          return liveComments;
        }

        function shouldStickCommentsToBottom() {
          if (!commentsInitialized) return true;
          return isCommentsNearBottom(getActiveCommentsContainer());
        }

        function refreshMobileCommentsOverflowState() {
          if (!liveCommentsMobile) {
            return;
          }

          scheduleLiveMobileViewportSync();
        }

        async function loadComments() {
          const stickToBottom = shouldStickCommentsToBottom();
          const result = await PostsAPI.getComments(liveId, 'newest');
          const comments = getList(result).slice().reverse().slice(-40);
          if (!result?.ok) {
            const errHtml = '<p class="text-sm text-white/55">No se pudieron cargar los comentarios.</p>';
            liveComments.innerHTML = errHtml;
            if (liveCommentsMobile) liveCommentsMobile.innerHTML = errHtml;
            return;
          }
          if (!comments.length) {
            if (!commentsInitialized) {
              const emptyHtml = '<p class="text-sm text-white/55">Todavia no hay comentarios en este directo.</p>';
              liveComments.innerHTML = emptyHtml;
              if (liveCommentsMobile) liveCommentsMobile.innerHTML = '';
            }
            commentsInitialized = true;
            return;
          }

          // Build set of new comment IDs
          const newIds = new Set(comments.map(c => String(c.id)));
          const existingIds = new Set();
          liveComments.querySelectorAll('[data-comment-id]').forEach(el => existingIds.add(el.dataset.commentId));

          // First load or major mismatch: full render
          if (!commentsInitialized || existingIds.size === 0) {
            const html = comments.map(c => commentMarkup(c)).join('');
            liveComments.innerHTML = html;
            if (liveCommentsMobile) liveCommentsMobile.innerHTML = html;
          } else {
            // Remove comments that are no longer in the list (old ones rotated out)
            liveComments.querySelectorAll('[data-comment-id]').forEach(el => {
              if (!newIds.has(el.dataset.commentId)) el.remove();
            });
            if (liveCommentsMobile) {
              liveCommentsMobile.querySelectorAll('[data-comment-id]').forEach(el => {
                if (!newIds.has(el.dataset.commentId)) el.remove();
              });
            }
            // Append only truly new comments
            const fragment = document.createDocumentFragment();
            const fragmentMobile = document.createDocumentFragment();
            comments.forEach(c => {
              if (!existingIds.has(String(c.id))) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = commentMarkup(c);
                const node = wrapper.firstElementChild;
                if (node) {
                  fragment.appendChild(node);
                  fragmentMobile.appendChild(node.cloneNode(true));
                }
              }
            });
            if (fragment.childNodes.length) {
              liveComments.appendChild(fragment);
              if (liveCommentsMobile) liveCommentsMobile.appendChild(fragmentMobile);
            }
          }

          commentsInitialized = true;
          window.requestAnimationFrame(refreshMobileCommentsOverflowState);
          if (stickToBottom && !userRecentlyScrolledComments()) {
            const activeCommentsContainer = getActiveCommentsContainer();
            if (activeCommentsContainer) {
              activeCommentsContainer.scrollTop = activeCommentsContainer.scrollHeight;
            }
          }

          scheduleLiveMobileViewportSync();
        }

        async function sendComment() {
          const content = (liveCommentInput?.value || liveCommentInputMobile?.value || '').trim();
          if (!content) return;
          const result = await PostsAPI.addComment(liveId, content);
          if (!result?.ok) {
            showToast(result?.data?.error || 'No se pudo comentar en el directo', 'error');
            return;
          }
          if (liveCommentInput) liveCommentInput.value = '';
          if (liveCommentInputMobile) liveCommentInputMobile.value = '';
          await loadComments();
        }

        async function heartbeat() {
          if (liveData?.live_status !== 'live') {
            liveViewerCount.textContent = '0';
            if (livePlayerViewerCount) livePlayerViewerCount.textContent = '0';
            return;
          }
          const result = await PostsAPI.livestreamHeartbeat(liveId);
          if (result?.ok) {
            const count = String(Number(result.data?.viewer_count || 0));
            liveViewerCount.textContent = count;
            if (livePlayerViewerCount) livePlayerViewerCount.textContent = count;
          }
        }

        let isPollingEvents = false;
        async function pollReactionEvents() {
          if (isPollingEvents) return;
          isPollingEvents = true;
          try {
            const result = await PostsAPI.getLivestreamEvents(liveId, lastEventId);
            const events = getList(result);
            if (!result?.ok) return;

            if (!events.length) {
              reactionEventsCursorReady = true;
              return;
            }
            events.forEach((event) => {
              const eventId = Number(event.id || 0);
              if (reactionEventsCursorReady && eventId > lastEventId) {
                addFloatingReaction(event.reaction_type);
              }
              lastEventId = Math.max(lastEventId, eventId);
            });
            reactionEventsCursorReady = true;
          } finally {
            isPollingEvents = false;
          }
        }

        async function sendActiveReaction() {
          const result = await PostsAPI.reactLivestream(liveId, activeReaction);
          if (!result?.ok) {
            showToast(result?.data?.error || 'No se pudo enviar la reaccion', 'error');
            return;
          }
          lastEventId = Math.max(lastEventId, Number(result.data?.event_id || 0));
          addFloatingReaction(activeReaction);
        }

        let endingLivestream = false;
        let pageLeaveEndSent = false;
        function getLivestreamDurationSeconds() {
          return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        }

        function shouldAutoEndHostStream() {
          return isHostOwner() && !endedByHost && liveData?.live_status === 'live' && liveId;
        }

        function endHostStreamOnPageLeave() {
          if (pageLeaveEndSent || !shouldAutoEndHostStream()) return;
          pageLeaveEndSent = true;
          const body = JSON.stringify({ duration_seconds: getLivestreamDurationSeconds() });

          try {
            fetch(`/api/livestreams/${liveId}/end`, {
              method: 'PUT',
              headers: {
                ...authHeaders(),
                'Content-Type': 'application/json',
              },
              body,
              keepalive: true,
            }).catch(() => { });
          } catch (_error) { }
        }

        async function endLivestream() {
          if (endingLivestream) return;
          endingLivestream = true;
          if (hostEndButton) {
            hostEndButton.disabled = true;
            hostEndButton.textContent = 'FINALIZANDO...';
            hostEndButton.classList.add('opacity-70', 'cursor-not-allowed');
          }
          const durationSeconds = getLivestreamDurationSeconds();
          const result = await PostsAPI.endLivestream(liveId, durationSeconds);
          if (!result?.ok) {
            showToast(result?.data?.error || 'No se pudo finalizar el directo', 'error');
            if (hostEndButton) {
              hostEndButton.disabled = false;
              hostEndButton.textContent = 'FINALIZAR';
              hostEndButton.classList.remove('opacity-70', 'cursor-not-allowed');
            }
            endingLivestream = false; // allow retry
            return;
          }
          endedByHost = true;
          forgetLiveHostRoute(liveId);
          if (ovenLivekit && typeof ovenLivekit.stopStreaming === 'function') {
            try {
              ovenLivekit.stopStreaming();
            } catch (error) {
              console.warn('No se pudo detener OvenLiveKit al finalizar:', error);
            }
          }
          showToast('Directo finalizado', 'success');
          // Reset stuck flag then navigate
          exitingLivestream = false;
          exitLivestream();
        }

        const commentsLoop = () => loadComments().catch(() => { });
        const heartbeatLoop = () => heartbeat().catch(() => { });
        const stateLoop = async () => {
          await loadLivestream();
          await pollReactionEvents();
        };

        // ── Auto-hide overlay (desktop hover / mobile tap-to-toggle) ──
        window.addEventListener('pagehide', endHostStreamOnPageLeave);
        window.addEventListener('beforeunload', endHostStreamOnPageLeave);

        const mobileOverlay = container.querySelector('#live-mobile-overlay');
        const playerControls = container.querySelector('#live-player-controls');
        const playerTapCatcher = container.querySelector('#live-player-tap-catcher');
        let inVideoFullscreen = false; // landscape fullscreen (video only)
        let overlayVisible = true;
        let fullscreenHudVisible = true;
        const isHostOnMobile = isHostRoute && !isDesktopClient();
        const isHostOnDesktop = isHostRoute && isDesktopClient();

        function isVideoFullscreenActive() {
          return Boolean(
            inVideoFullscreen
            || document.fullscreenElement === liveVideoWrap
            || liveVideoWrap?.matches?.(':fullscreen')
          );
        }

        function setVideoFullscreenHudVisible(visible) {
          fullscreenHudVisible = visible;
          overlayVisible = visible;
          liveVideoWrap?.classList.toggle('live-video-hud-hidden', !visible);
          if (playerControls) {
            playerControls.style.opacity = '1';
            playerControls.style.pointerEvents = 'none';
            playerControls.style.visibility = 'visible';
          }
          if (mobileOverlay) {
            mobileOverlay.style.opacity = '0';
            mobileOverlay.style.pointerEvents = 'none';
          }
        }

        function toggleVideoFullscreenHud() {
          setVideoFullscreenHudVisible(!fullscreenHudVisible);
        }

        function showOverlay() {
          clearTimeout(overlayTimer);
          if (isVideoFullscreenActive()) {
            setVideoFullscreenHudVisible(true);
            return;
          }
          overlayVisible = true;
          overlays.forEach(el => { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; });
          if (playerControls) {
            playerControls.style.opacity = '1';
            playerControls.style.pointerEvents = 'auto';
            playerControls.style.visibility = 'visible';
          }
          // Show X button on mobile viewers only (host never sees X)
          if (immersiveBtn && !isDesktopClient() && !isHostOnMobile) {
            immersiveBtn.classList.remove('hidden'); // clear display:none from video-fullscreen
            immersiveBtn.style.opacity = '1';
            immersiveBtn.style.pointerEvents = 'auto';
          }
          if (!isHostOnDesktop && !inVideoFullscreen) {
            overlayTimer = setTimeout(hideOverlay, 5000);
          }
        }
        function hideOverlay() {
          if (isHostOnDesktop) return;
          if (selectorOpen) return;
          clearTimeout(overlayTimer);
          if (isVideoFullscreenActive()) {
            setVideoFullscreenHudVisible(false);
            return;
          }
          overlayVisible = false;
          overlays.forEach(el => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
          // Hide player controls
          if (playerControls) {
            playerControls.style.opacity = '0';
            playerControls.style.pointerEvents = 'none';
            playerControls.style.visibility = 'hidden';
          }
          // Hide X button
          if (immersiveBtn && !isDesktopClient()) {
            immersiveBtn.style.opacity = '0';
            immersiveBtn.style.pointerEvents = 'none';
          }
          // DO NOT hide mobile-overlay (title/comments/input/reactions must always be visible)
          if (isVideoFullscreenActive()) {
            if (mobileOverlay) { mobileOverlay.style.opacity = '0'; mobileOverlay.style.pointerEvents = 'none'; }
          }
        }
        function toggleOverlay() {
          if (isVideoFullscreenActive()) {
            toggleVideoFullscreenHud();
            return;
          }
          if (overlayVisible) { clearTimeout(overlayTimer); hideOverlay(); }
          else { showOverlay(); }
        }

        function movePlayerControlsToFullscreenHud() {
          if (!liveVideoWrap || !playerControls) return;
          if (playerControls.parentElement !== liveVideoWrap) {
            liveVideoWrap.appendChild(playerControls);
          }
        }

        function restorePlayerControlsParent() {
          if (!playerControls || !liveVideoWrap) return;
          if (playerControls.parentElement !== liveVideoWrap) {
            liveVideoWrap.appendChild(playerControls);
          }
        }
        function maybeRequestViewerShellFullscreenFromGesture() {
          if (isDesktopClient() || isHostOnMobile || shouldUseFullscreenOnlyImmersive || !immersiveActive || !liveShell) return;
          if (document.fullscreenElement) return;
          requestLiveShellFullscreen().catch(() => { });
        }
        let lastTouchTime = 0; // guard against synthetic mouse events after touch
        if (liveVideoWrap) {
          liveVideoWrap.addEventListener('mouseenter', () => { if (Date.now() - lastTouchTime > 600) showOverlay(); });
          liveVideoWrap.addEventListener('mousemove', () => { if (Date.now() - lastTouchTime > 600) showOverlay(); });
          liveVideoWrap.addEventListener('mouseleave', () => {
            if (isHostOnDesktop) return;
            if (Date.now() - lastTouchTime > 600) {
              clearTimeout(overlayTimer);
              overlayTimer = setTimeout(hideOverlay, 1200);
            }
          });
          // Mobile: touchend toggles overlay
          let lastTouchToggleTime = 0;
          liveVideoWrap.addEventListener('touchend', (e) => {
            if (isVideoFullscreenActive()) return;
            if (e.target.closest('button')) return;
            lastTouchTime = Date.now();
            lastTouchToggleTime = Date.now();
            toggleOverlay();
            maybeRequestViewerShellFullscreenFromGesture();
          }, { passive: true });
          // Prevent click from re-toggling after a touch-toggle
          let lastVideoWrapTouchTime = 0;
          liveVideoWrap.addEventListener('touchend', () => {
            lastVideoWrapTouchTime = Date.now();
          }, { passive: true, capture: true }); // capture phase to record time before other handlers
          liveVideoWrap.addEventListener('click', (e) => {
            if (Date.now() - lastTouchToggleTime < 600) e.stopImmediatePropagation();
          }, true);
        }
        // Also toggle on tap anywhere on the live shell (not just video wrap)
        let lastGlobalShellTouchTime = 0;
        let lastFullscreenDirectEventTime = 0;
        let lastFullscreenTapEvent = null;
        const handleGlobalLiveTouchToggle = (e) => {
          if (isDesktopClient() || !liveShell || !liveShell.isConnected) return;
          const target = e.target;
          if (!(target instanceof Element)) return;
          if (target.closest('button, input, textarea, #live-comments-mobile, .live-mobile-input, #live-reaction-selector, [data-live-set-reaction]')) return;
          if (liveVideoWrap && liveVideoWrap.contains(target)) return;
          if (target.closest('#live-shell') || target.closest('#app-view')) {
            const now = Date.now();
            if (now - lastGlobalShellTouchTime < 400) return;
            lastGlobalShellTouchTime = now;
            toggleOverlay();
            maybeRequestViewerShellFullscreenFromGesture();
          }
        };
        const handleVideoFullscreenTouchToggle = (e) => {
          if (!isVideoFullscreenActive()) return;
          if (e === lastFullscreenTapEvent) return;
          lastFullscreenTapEvent = e;
          const now = Date.now();
          if (e.type === 'click' && now - lastFullscreenDirectEventTime < 800) return;
          if (e.type !== 'click' && now - lastFullscreenDirectEventTime < 90) return;
          const target = e.target;
          if (target instanceof Element && target.closest('button, input, textarea, #live-reaction-selector, [data-live-set-reaction]')) return;
          if (e.type !== 'click') {
            lastFullscreenDirectEventTime = now;
          }
          e.preventDefault?.();
          e.stopPropagation?.();
          toggleVideoFullscreenHud();
        };
        const addFullscreenTapListeners = (target) => {
          if (!target?.addEventListener) return;
          target.addEventListener('pointerdown', handleVideoFullscreenTouchToggle, true);
          target.addEventListener('touchstart', handleVideoFullscreenTouchToggle, { passive: false, capture: true });
          target.addEventListener('click', handleVideoFullscreenTouchToggle, true);
        };
        const removeFullscreenTapListeners = (target) => {
          if (!target?.removeEventListener) return;
          target.removeEventListener('pointerdown', handleVideoFullscreenTouchToggle, true);
          target.removeEventListener('touchstart', handleVideoFullscreenTouchToggle, true);
          target.removeEventListener('click', handleVideoFullscreenTouchToggle, true);
        };
        if (!isDesktopClient()) {
          addFullscreenTapListeners(document);
          addFullscreenTapListeners(liveVideoWrap);
          addFullscreenTapListeners(viewerPlayerRoot);
          addFullscreenTapListeners(playerTapCatcher);
          document.addEventListener('touchend', handleGlobalLiveTouchToggle, { passive: true });
          if (liveVideoWrap) {
            liveVideoWrap.addEventListener('touchend', guardViewerPlayerTap, true);
            liveVideoWrap.addEventListener('click', guardViewerPlayerTap, true);
          }
          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(140);
          scheduleLiveMobileViewportSync(320);
        }
        // On desktop show overlay initially, on mobile start hidden (tap to reveal)
        if (isDesktopClient()) {
          showOverlay();
        } else {
          hideOverlay();
          // Host on mobile: always hide X button
          if (isHostOnMobile && immersiveBtn) {
            immersiveBtn.style.display = 'none';
          }
        }

        // ── Video Fullscreen (landscape, video only) ──
        let pendingVideoFs = false;
        if (fullscreenBtn && liveVideoWrap) {
          fullscreenBtn.addEventListener('click', async () => {
            if (document.fullscreenElement === liveVideoWrap) {
              document.exitFullscreen().catch(() => { });
              try { screen.orientation.unlock(); } catch (e) { }
            } else {
              pendingVideoFs = true;
              try {
                await liveVideoWrap.requestFullscreen();
                try { await screen.orientation.lock('landscape'); } catch (e) { }
              } catch (e) { }
              pendingVideoFs = false;
            }
          });
        }

        // ── Immersive mode (hides page chrome, keeps chat) ──
        let immersiveActive = false;
        let immersiveBtnOriginalParent = immersiveBtn?.parentElement || null;
        let exitingLivestream = false;
        const shouldAutoEnterImmersive = !isDesktopClient();
        const shouldUseFullscreenOnlyImmersive = !isDesktopClient() && !isHostOnMobile;

        function syncMobileCloseButton() {
          if (isDesktopClient() || !immersiveBtn) {
            return;
          }
          const icon = immersiveBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = 'close';
          immersiveBtn.title = 'Cerrar directo';
        }

        function activateImmersive() {
          immersiveActive = true;
          document.body.classList.add('live-immersive-active');
          if (!shouldUseFullscreenOnlyImmersive) liveShell.classList.add('live-immersive-shell');
          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(140);
          scheduleLiveMobileViewportSync(320);

          if (!isDesktopClient()) {
            if (shouldUseFullscreenOnlyImmersive) {
              // Viewer mobile: CSS-only immersive. Keep the normal stacked layout and
              // never request Fullscreen API from mount/taps, otherwise Android Chrome
              // can promote the inner video into an unwanted vertical fullscreen takeover.
            } else {
              // Host mobile: full-bleed camera mode.
              requestLiveShellFullscreen().catch(() => { });
              // Move the X button out of the overlay so overlay timer can't hide it
              if (immersiveBtn && liveShell) liveShell.appendChild(immersiveBtn);
            }
            syncMobileCloseButton();
            if (mobileOverlay) {
              mobileOverlay.style.opacity = '';
              mobileOverlay.style.pointerEvents = '';
            }
            showOverlay();
          } else {
            const icon = immersiveBtn?.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'close_fullscreen';
          }
        }

        function deactivateImmersive() {
          immersiveActive = false;
          document.body.classList.remove('live-immersive-active');
          liveShell.classList.remove('live-immersive-shell');
          liveShell.classList.remove('live-shell-fullscreen');

          // Exit fullscreen if shell is the fullscreen element
          if (document.fullscreenElement === liveShell) {
            document.exitFullscreen().catch(() => { });
          }

          // Mobile: move button back to its original parent (the overlay)
          if (!isDesktopClient() && !shouldUseFullscreenOnlyImmersive && immersiveBtn && immersiveBtnOriginalParent) {
            immersiveBtnOriginalParent.appendChild(immersiveBtn);
          }

          if (!isDesktopClient()) {
            syncMobileCloseButton();
          } else {
            const icon = immersiveBtn?.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'open_in_full';
          }
        }

        function exitLivestream() {
          if (exitingLivestream) return;
          exitingLivestream = true;
          // Fade to black instantly to prevent flicker of normal layout
          if (liveShell) liveShell.style.opacity = '0';
          // Exit fullscreen then navigate
          const doNav = () => {
            setTimeout(() => {
              if (window.history.length > 1) history.back();
              else router.navigate('feed');
            }, 50);
          };
          if (document.fullscreenElement) {
            document.exitFullscreen().then(doNav).catch(doNav);
          } else {
            doNav();
          }
        }

        if (immersiveBtn && liveShell) {
          immersiveBtn.addEventListener('click', () => {
            if (!isDesktopClient()) {
              exitLivestream();
            } else {
              // Desktop: toggle immersive mode
              if (immersiveActive) { deactivateImmersive(); } else { activateImmersive(); }
            }
          });
        }

        // Unified fullscreenchange handler
        const handleFullscreenChange = () => {
          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(140);
          scheduleLiveMobileViewportSync(320);
          if (exitingLivestream) return;

          const fsEl = document.fullscreenElement;

          if (fsEl === liveVideoWrap) {
            pendingVideoFs = false;
            // Entered video fullscreen (landscape)
            inVideoFullscreen = true;
            liveVideoWrap?.classList.remove('live-video-hud-hidden');
            const icon = fullscreenBtn?.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'fullscreen_exit';
            const playerFsIcon = playerFsBtn?.querySelector('.material-symbols-outlined');
            if (playerFsIcon) playerFsIcon.textContent = 'fullscreen_exit';
            if (immersiveBtn && !isDesktopClient() && !isHostOnMobile) {
              immersiveBtn.classList.remove('hidden');
            }
            setVideoFullscreenHudVisible(true);
          } else if (fsEl === liveShell) {
            // Shell fullscreen active — show overlay so X reappears
            if (!isDesktopClient()) {
              // Ensure mobileOverlay is visible
              if (mobileOverlay) { mobileOverlay.style.opacity = ''; mobileOverlay.style.pointerEvents = ''; }
              showOverlay();
            }
          } else if (!isDesktopClient() && !isHostOnMobile && fsEl && liveVideoWrap?.contains(fsEl)) {
            recoverUnexpectedViewerFullscreen(viewerVideo);
          } else if (!fsEl) {
            pendingVideoFs = false;
            if (suppressViewerShellExit) {
              suppressViewerShellExit = false;
              restoreViewerShellLayout();
              return;
            }
            if (inVideoFullscreen) {
              // Exited video fullscreen → restore mobileOverlay, re-enter shell fullscreen
              inVideoFullscreen = false;
              liveVideoWrap?.classList.remove('live-video-hud-hidden');
              try { screen.orientation.unlock(); } catch (e) { }
              const icon = fullscreenBtn?.querySelector('.material-symbols-outlined');
              if (icon) icon.textContent = 'fullscreen';
              const playerFsIcon = playerFsBtn?.querySelector('.material-symbols-outlined');
              if (playerFsIcon) playerFsIcon.textContent = 'fullscreen';
              // Restore mobile overlay immediately
              if (mobileOverlay) { mobileOverlay.style.opacity = ''; mobileOverlay.style.pointerEvents = ''; }
              if (immersiveBtn && !isDesktopClient() && !isHostOnMobile) {
                immersiveBtn.classList.remove('hidden');
              }
              showOverlay();
              return;
            } else if (immersiveActive && !isDesktopClient()) {
              restoreViewerShellLayout();
            }
          }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        if (!isDesktopClient()) {
          syncMobileCloseButton();
        }

        if (!isDesktopClient() && liveCommentInputMobile) {
          liveCommentInputMobile.addEventListener('focus', pinLiveMobileViewport);
          liveCommentInputMobile.addEventListener('blur', pinLiveMobileViewport);
          window.visualViewport?.addEventListener('resize', pinLiveMobileViewport);
          window.visualViewport?.addEventListener('scroll', pinLiveMobileViewport);
        }

        function getHostSourceUnavailableCopy(error) {
          const message = String(error?.message || error || '').toLowerCase();
          const insecureRemoteHost = !window.isSecureContext && !isDesktopClient() && window.location.protocol !== 'https:';
          if (insecureRemoteHost) {
            return 'En celular, la camara y el microfono se bloquean si entras por http usando la IP de la PC. Usa https:// o abre la app desde localhost.';
          }
          if (message.includes('notallowed') || message.includes('permission') || message.includes('denied')) {
            return 'El navegador no tiene permiso para acceder a la camara o al microfono. Revisa los permisos del sitio e intenta de nuevo.';
          }
          if (message.includes('notfound') || message.includes('devicesnotfound') || message.includes('overconstrained')) {
            return 'No se encontro una camara compatible para iniciar el directo. Revisa la camara del dispositivo e intenta de nuevo.';
          }
          return 'No se pudo acceder a la camara o pantalla compartida para el directo.';
        }

        // On mobile, auto-enter fullscreen shell. Viewers keep the standard layout; hosts keep the immersive shell layout.
        if (shouldAutoEnterImmersive && liveShell) {
          activateImmersive();
        }

        // ── Viewer mute/unmute button (desktop) ──
        const viewerMuteBtn = container.querySelector('#live-viewer-mute-btn');
        if (viewerMuteBtn) {
          viewerMuteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            viewerIsMuted = !viewerIsMuted;
            applyViewerMuteState();
            if (!viewerIsMuted) clearViewerTapToUnmute();
            else armViewerTapToUnmute();
          });
        }

        // ── Mobile player mute button ──
        if (playerMuteBtn) {
          playerMuteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            viewerIsMuted = !viewerIsMuted;
            applyViewerMuteState();
            if (!viewerIsMuted) clearViewerTapToUnmute();
            else armViewerTapToUnmute();
          });
        }
        syncViewerMuteButtons();

        // ── Mobile mic button (in input row, host only) ──
        if (toggleMicMobileButton) {
          toggleMicMobileButton.addEventListener('click', () => {
            hostMicMuted = !hostMicMuted;
            applyHostAudioState();
            refreshHostAudioButtons();
            const icon = toggleMicMobileButton.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostMicMuted ? 'mic_off' : 'mic';
          });
        }

        // ── Mobile player fullscreen button (video-only landscape) ──
        if (playerFsBtn && liveVideoWrap) {
          playerFsBtn.addEventListener('click', async () => {
            if (document.fullscreenElement === liveVideoWrap) {
              document.exitFullscreen().catch(() => { });
              try { screen.orientation.unlock(); } catch (e) { }
            } else {
              pendingVideoFs = true;
              try {
                await liveVideoWrap.requestFullscreen();
                try { await screen.orientation.lock('landscape'); } catch (e) { }
              } catch (e) {
                pendingVideoFs = false;
              }
            }
          });
        }

        // ── Long-press reaction selector (both mobile + desktop) ──
        let selectorAutoCloseTimer = null;
        function openSelector(sel) {
          if (!sel) return;
          sel.classList.remove('hidden'); sel.classList.add('flex');
          selectorOpen = true;
          // Auto-close after 5s if no interaction
          if (selectorAutoCloseTimer) clearTimeout(selectorAutoCloseTimer);
          selectorAutoCloseTimer = setTimeout(() => closeAllSelectors(), 5000);
        }
        function closeAllSelectors() {
          [reactionSelector, reactionSelectorDesktop].forEach(sel => {
            if (sel) { sel.classList.add('hidden'); sel.classList.remove('flex'); }
          });
          selectorOpen = false;
          if (selectorAutoCloseTimer) { clearTimeout(selectorAutoCloseTimer); selectorAutoCloseTimer = null; }
        }

        function bindTrigger(trigger, selector) {
          if (!trigger) return;
          let lpTimer = null;
          let openedByLongPress = false;
          trigger.addEventListener('click', () => {
            // If selector was just opened by long-press, don't close it on the click release
            if (openedByLongPress) { openedByLongPress = false; return; }
            if (selectorOpen) { closeAllSelectors(); return; }
            sendActiveReaction();
          });
          trigger.addEventListener('pointerdown', () => {
            openedByLongPress = false;
            lpTimer = setTimeout(() => { openSelector(selector); openedByLongPress = true; }, 400);
          });
          trigger.addEventListener('pointerup', () => clearTimeout(lpTimer));
          trigger.addEventListener('pointerleave', () => clearTimeout(lpTimer));
        }
        bindTrigger(reactionTrigger, reactionSelector);
        bindTrigger(reactionTriggerDesktop, reactionSelectorDesktop);

        // Selector item click (all)
        container.querySelectorAll('[data-live-set-reaction]').forEach((button) => {
          button.addEventListener('click', async () => {
            activeReaction = button.dataset.liveSetReaction || 'me_gusta';
            refreshReactionButtons();
            closeAllSelectors();
            await sendActiveReaction();
          });
        });

        // Close selectors on outside click
        document.addEventListener('click', (e) => {
          if (!selectorOpen) return;
          const clickedInsideTrigger = (reactionTrigger?.contains(e.target)) || (reactionTriggerDesktop?.contains(e.target));
          const clickedInsideSelector = (reactionSelector?.contains(e.target)) || (reactionSelectorDesktop?.contains(e.target));
          if (!clickedInsideTrigger && !clickedInsideSelector) closeAllSelectors();
        });

        // ─── Comment events (Enter to send, no send button) ───
        function bindCommentInput(input) {
          if (!input) return;
          input.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              const text = input.value.trim();
              if (!text) return;
              // Copy value to canonical input for sendComment
              liveCommentInput && (liveCommentInput.value = text);
              liveCommentInputMobile && (liveCommentInputMobile.value = text);
              await sendComment();
              input.value = '';
              if (liveCommentInput) liveCommentInput.value = '';
              if (liveCommentInputMobile) liveCommentInputMobile.value = '';
            }
          });
        }
        bindCommentInput(liveCommentInput);
        bindCommentInput(liveCommentInputMobile);

        // Mark user interaction with comments so polling doesn't fight touch scrolling.
        [liveComments, liveCommentsMobile].forEach((el) => {
          if (!el) return;
          el.addEventListener('scroll', markCommentsUserScroll, { passive: true });
          el.addEventListener('touchstart', markCommentsUserScroll, { passive: true });
          el.addEventListener('touchmove', markCommentsUserScroll, { passive: true });
        });
        const handleLiveResize = () => {
          syncLiveDeviceClasses();
          refreshHostAudioButtons();
          refreshMobileCommentsOverflowState();
          syncDesktopPortraitLiveSizing();
          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(140);
        };
        window.addEventListener('resize', handleLiveResize);
        window.visualViewport?.addEventListener('resize', handleLiveResize);
        window.visualViewport?.addEventListener('scroll', handleLiveResize);

        // ─── Host buttons ───
        hostEndButton.addEventListener('click', endLivestream);
        [liveReportButton, liveReportButtonMobile].forEach((button) => {
          if (!button) return;
          button.addEventListener('click', async () => {
            await reportContent('publicacion', liveId);
          });
        });
        const toggleMicHandler = () => {
          hostMicMuted = !hostMicMuted;
          applyHostAudioState();
          refreshHostAudioButtons();
        };
        toggleMicButton.addEventListener('click', toggleMicHandler);

        toggleSystemAudioButton.addEventListener('click', () => {
          hostSystemMuted = !hostSystemMuted;
          applyHostAudioState();
          refreshHostAudioButtons();
        });
        switchSourceButton.addEventListener('click', async () => {
          const next = liveData?.live_source === 'screen' ? 'camera' : 'screen';
          await startHostSource(next, true);
        });

        // Flip camera on mobile (front ↔ rear) — desktop host tool button
        if (flipCameraButton) {
          flipCameraButton.addEventListener('click', async () => {
            const previousFacingMode = currentFacingMode;
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            const changed = await startHostSource('camera', true, {
              isCameraFlip: true,
              previousFacingMode,
            });
            if (!changed) {
              currentFacingMode = previousFacingMode;
            }
            if (hostPreviewVideo) {
              hostPreviewVideo.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : '';
            }
          });
        }
        // Flip camera — mobile input row button (same logic)
        if (flipCameraMobileButton) {
          flipCameraMobileButton.addEventListener('click', async () => {
            const previousFacingMode = currentFacingMode;
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            const changed = await startHostSource('camera', true, {
              isCameraFlip: true,
              previousFacingMode,
            });
            if (!changed) {
              currentFacingMode = previousFacingMode;
            }
            if (hostPreviewVideo) {
              hostPreviewVideo.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : '';
            }
          });
        }
        if (toggleTorchMobileButton) {
          toggleTorchMobileButton.addEventListener('click', async () => {
            const nextValue = !hostTorchEnabled;
            const changed = await setHostTorchEnabled(nextValue);
            if (!changed && nextValue) {
              showToast('La linterna no esta disponible en esta camara o dispositivo.', 'error');
            }
            refreshHostAudioButtons();
          });
        }

        loadLivestream().then(async () => {
          refreshReactionButtons();
          await loadComments();
          await heartbeat();
          await pollReactionEvents();
          if (isHostOwner()) {
            startedAt = Date.now();
            await startHostSource(liveData?.live_source || 'camera');
          }
          // Show fullscreen button only for landscape streams (from PC)
          updateFullscreenButtonVisibility();
          scheduleLiveMobileViewportSync();
          scheduleLiveMobileViewportSync(140);
          scheduleLiveMobileViewportSync(320);
        });

        commentsTimer = window.setInterval(commentsLoop, 2200);
        heartbeatTimer = window.setInterval(heartbeatLoop, 10000);
        liveStateTimer = window.setInterval(stateLoop, 650);

        return () => {
          if (commentsTimer) window.clearInterval(commentsTimer);
          if (heartbeatTimer) window.clearInterval(heartbeatTimer);
          if (liveStateTimer) window.clearInterval(liveStateTimer);
          window.removeEventListener('resize', handleLiveResize);
          window.visualViewport?.removeEventListener('resize', handleLiveResize);
          window.visualViewport?.removeEventListener('scroll', handleLiveResize);
          liveCommentInputMobile?.removeEventListener('focus', pinLiveMobileViewport);
          liveCommentInputMobile?.removeEventListener('blur', pinLiveMobileViewport);
          window.visualViewport?.removeEventListener('resize', pinLiveMobileViewport);
          window.visualViewport?.removeEventListener('scroll', pinLiveMobileViewport);
          if (overlayTimer) clearTimeout(overlayTimer);
          if (longPressTimer) clearTimeout(longPressTimer);
          window.cancelAnimationFrame(liveMobileViewportSyncRaf);
          window.clearTimeout(liveMobileViewportSyncTimeout);
          document.removeEventListener('touchend', handleGlobalLiveTouchToggle);
          removeFullscreenTapListeners(document);
          removeFullscreenTapListeners(liveVideoWrap);
          removeFullscreenTapListeners(viewerPlayerRoot);
          removeFullscreenTapListeners(playerTapCatcher);
          if (liveVideoWrap) {
            liveVideoWrap.removeEventListener('touchend', guardViewerPlayerTap, true);
            liveVideoWrap.removeEventListener('click', guardViewerPlayerTap, true);
          }
          document.removeEventListener('fullscreenchange', handleFullscreenChange);
          liveStatusMetaCleanup();
          // Clean up immersive mode
          document.body.classList.remove('live-immersive-active');
          if (liveShell) {
            liveShell.classList.remove('live-immersive-shell');
            liveShell.classList.remove('live-shell-fullscreen');
          }
          releaseWakeLock();
          // If host mobile navigates away while stream is active, auto-end the stream via API
          window.removeEventListener('pagehide', endHostStreamOnPageLeave);
          window.removeEventListener('beforeunload', endHostStreamOnPageLeave);
          if (shouldAutoEndHostStream()) {
            endHostStreamOnPageLeave();
          }
          if (isHostRoute) {
            forgetLiveHostRoute(liveId);
          }
          if (!endedByHost && ovenLivekit && typeof ovenLivekit.stopStreaming === 'function') {
            try {
              ovenLivekit.stopStreaming();
            } catch (error) {
              console.warn('No se pudo detener la transmision al salir del live:', error);
            }
          }
          hostPublishing = false;
          hostPublishedSource = null;
          if (ovenLivekit && typeof ovenLivekit.remove === 'function') {
            ovenLivekit.remove();
          }
          ovenLivekit = null;
          destroyPlayer();
          stopHostStreams();
        };
      },
    },
    messages: {
      title: 'Mensajes',
      activeNav: 'messages',
      templatePath: '/pages/messages.html',
      mount({ container, user, params, router }) {
        return initMessagesView({ container, user, params, router });
      },
    },
    companions: {
      title: 'Compañeros',
      activeNav: 'companions',
      templatePath: '/pages/companions.html',
      mount({ container, router, user }) {
        const grid = container.querySelector('#directory-grid');
        const pagination = container.querySelector('#companions-pagination');
        const filterFaculty = container.querySelector('#filter-faculty');
        const filterCareer = container.querySelector('#filter-career');
        const emptyState = container.querySelector('#companions-empty-state');
        const filtersWrap = container.querySelector('#companions-directory-filters');
        const tabButtons = Array.from(container.querySelectorAll('[data-companions-tab]'));
        let activeTab = 'directory';
        let directoryUsers = [];
        let blockedUsers = [];
        let directoryPage = 1;
        let blockedPage = 1;
        const COMPANIONS_PER_PAGE = 12;

        function setCompanionsTab(tab) {
          activeTab = tab;
          tabButtons.forEach((button) => {
            const isActive = button.dataset.companionsTab === tab;
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('shadow-sm', isActive);
            button.classList.toggle('text-slate-900', isActive);
            button.classList.toggle('font-semibold', isActive);
            button.classList.toggle('text-slate-600', !isActive);
            button.classList.toggle('font-medium', !isActive);
          });
          filtersWrap.classList.toggle('hidden', tab !== 'directory');
        }

        function syncCareerOptions() {
          const faculty = filterFaculty.value || 'Todos';
          const careers = getFacultyCareerOptions(faculty);
          const previous = filterCareer.value;
          filterCareer.innerHTML = careers.map((career) => `<option value="${escapeHtml(career)}">${escapeHtml(career)}</option>`).join('');
          if (careers.includes(previous)) {
            filterCareer.value = previous;
          }
        }

        function renderCards(users, options = {}) {
          const {
            emptyMessage = 'No hay usuarios para mostrar.',
            blocked = false,
          } = options;

          if (!users.length) {
            grid.innerHTML = '';
            emptyState.textContent = emptyMessage;
            emptyState.classList.remove('hidden');
            return;
          }

          emptyState.classList.add('hidden');
          grid.innerHTML = users.map((directoryUser) => `
              <div class="bg-white rounded-[24px] border border-slate-200 p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow relative">
                <div class="absolute top-3 right-3">
                  <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${userColor(directoryUser)}">${escapeHtml(directoryUser.faculty || 'UPT')}</span>
                </div>
                ${renderAvatar(directoryUser, { sizeClass: 'w-20 h-20', textClass: 'text-white font-bold text-2xl', extraClass: 'mb-3 border-2 border-slate-100' })}
                <h3 class="font-bold text-[16px] leading-tight text-slate-900 mb-1">${escapeHtml(displayName(directoryUser))}</h3>
                <p class="text-[13px] text-slate-500 mb-4">${escapeHtml(careerLabel(directoryUser) || getUserTypeLabel(directoryUser.user_type || 'student'))}</p>
                ${blocked ? '<div class="mb-4 inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 px-3 py-1 text-[11px] font-bold">Usuario bloqueado</div>' : ''}
                <div class="w-full mt-auto flex flex-col gap-2">
                  <button type="button" data-view-profile="${directoryUser.id}" class="w-full py-1.5 px-4 rounded-lg border border-[#1B2A6B] text-[#1B2A6B] font-medium text-sm hover:bg-[#1B2A6B] hover:text-white transition-colors">Ver perfil</button>
                  ${blocked ? `
                    <button type="button" data-unblock-user="${directoryUser.id}" class="w-full py-1.5 px-4 rounded-lg bg-slate-100 text-slate-700 font-medium text-sm hover:bg-slate-200 transition-colors">Desbloquear</button>
                  ` : ''}
                </div>
              </div>
            `).join('');
        }

        function renderCompanionsPage() {
          const isBlockedTab = activeTab === 'blocked';
          const sourceUsers = isBlockedTab ? blockedUsers : directoryUsers;
          const currentPage = isBlockedTab ? blockedPage : directoryPage;
          const pageSlice = paginateClientItems(sourceUsers, currentPage, COMPANIONS_PER_PAGE);
          if (isBlockedTab) {
            blockedPage = pageSlice.meta.currentPage;
          } else {
            directoryPage = pageSlice.meta.currentPage;
          }
          renderCards(pageSlice.items, {
            blocked: isBlockedTab,
            emptyMessage: isBlockedTab ? 'No tienes usuarios bloqueados.' : 'No se encontraron compañeros.',
          });
          renderPagination(pagination, pageSlice.meta, { summaryLabel: isBlockedTab ? 'usuarios bloqueados' : 'compañeros', standalone: true });
        }

        async function loadDirectory() {
          const faculty = filterFaculty.value;
          const career = filterCareer.value;
          const query = new URLSearchParams();
          if (faculty && faculty !== 'Todos') query.set('faculty', faculty);
          if (career && career !== 'Todos') query.set('career', career);
          const params = query.toString();
          const result = await SocialAPI.getDirectory(params);
          const users = getList(result).filter((directoryUser) => Number(directoryUser.id) !== Number(user.id));

          if (!result?.ok) {
            grid.innerHTML = '';
            emptyState.textContent = 'No se pudieron cargar los companeros.';
            emptyState.classList.remove('hidden');
            pagination?.classList.add('hidden');
            return;
          }

          directoryUsers = users;
          directoryPage = 1;
          renderCompanionsPage();
        }

        async function loadBlockedUsers() {
          const result = await SocialAPI.getBlockedDirectory();
          const users = getList(result).filter((blockedUser) => Number(blockedUser.id) !== Number(user.id));

          if (!result?.ok) {
            grid.innerHTML = '';
            emptyState.textContent = 'No se pudo cargar la lista de bloqueados.';
            emptyState.classList.remove('hidden');
            pagination?.classList.add('hidden');
            return;
          }

          blockedUsers = users;
          blockedPage = 1;
          renderCompanionsPage();
        }

        async function loadActiveTab() {
          grid.innerHTML = '<p class="text-slate-400 text-sm col-span-3 text-center py-8">Cargando...</p>';
          emptyState.classList.add('hidden');
          pagination?.classList.add('hidden');

          if (activeTab === 'blocked') {
            await loadBlockedUsers();
            return;
          }

          await loadDirectory();
        }

        async function handleBlocksChanged() {
          await loadActiveTab();
        }

        filterFaculty.value = 'Todos';
        syncCareerOptions();
        filterFaculty.addEventListener('change', async () => {
          syncCareerOptions();
          await loadActiveTab();
        });
        filterCareer.addEventListener('change', loadActiveTab);
        tabButtons.forEach((button) => {
          button.addEventListener('click', async () => {
            setCompanionsTab(button.dataset.companionsTab);
            await loadActiveTab();
          });
        });
        grid.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-view-profile]');
          if (button) {
            router.navigate('profile', { id: button.dataset.viewProfile });
            return;
          }

          const unblockButton = event.target.closest('[data-unblock-user]');
          if (!unblockButton) return;

          const result = await SocialAPI.unblockUser(unblockButton.dataset.unblockUser);
          if (result?.ok) {
            showToast('Usuario desbloqueado', 'success');
            window.dispatchEvent(new CustomEvent('blocks:changed'));
            await loadActiveTab();
            return;
          }

          showToast(result?.data?.error || 'No se pudo desbloquear al usuario', 'error');
        });

        pagination?.addEventListener('click', (event) => {
          const button = event.target.closest('[data-page]');
          if (!button) return;
          if (activeTab === 'blocked') {
            blockedPage = Number(button.dataset.page) || 1;
          } else {
            directoryPage = Number(button.dataset.page) || 1;
          }
          renderCompanionsPage();
        });

        setCompanionsTab('directory');
        loadActiveTab();

        window.addEventListener('blocks:changed', handleBlocksChanged);

        return () => {
          window.removeEventListener('blocks:changed', handleBlocksChanged);
        };
      },
    },
    groups: {
      title: 'Grupos',
      activeNav: 'groups',
      templatePath: '/pages/groups.html',
      templateSlots() {
        return {
          groupsInitialSkeleton: renderListSkeleton(4, { lines: ['72%', '100%', '88%'], media: true, avatar: false }),
        };
      },
      mount({ container, router }) {
        const grid = container.querySelector('#groups-grid');
        const pagination = container.querySelector('#groups-pagination');
        const emptyState = container.querySelector('#groups-empty-state');
        const searchInput = container.querySelector('#groups-search');
        const hideMineCheckbox = container.querySelector('#groups-hide-mine-checkbox');
        const privacyFilter = container.querySelector('#groups-privacy-filter');
        const discoverToolbar = container.querySelector('#groups-discover-toolbar');
        const listSection = container.querySelector('#groups-list-section');
        const createSection = container.querySelector('#groups-create-section');
        const form = container.querySelector('#create-group-form');
        const submitButton = container.querySelector('#create-group-submit');
        const coverInput = container.querySelector('#group-cover');
        const coverPreview = container.querySelector('#group-cover-preview');
        const pickCoverButton = container.querySelector('#pick-group-cover-btn');
        const clearCoverButton = container.querySelector('#clear-group-cover-btn');
        const cropModal = container.querySelector('#group-create-crop-modal');
        const cropStage = container.querySelector('#group-create-crop-stage');
        const cropImage = container.querySelector('#group-create-crop-image');
        const cropPreviewCanvas = container.querySelector('#group-create-crop-preview');
        const cropZoom = container.querySelector('#group-create-crop-zoom');
        const cropZoomLabel = container.querySelector('#group-create-crop-zoom-label');
        const cropSaveButton = container.querySelector('#group-create-crop-save-btn');
        const cropCancelButton = container.querySelector('#group-create-crop-cancel-btn');
        const cropCloseButton = container.querySelector('#group-create-crop-close-btn');
        const tabButtons = Array.from(container.querySelectorAll('[data-groups-tab]'));
        let activeTab = 'discover';
        let searchTimer = null;
        let selectedCoverFile = null;
        let selectedCoverPreviewUrl = '';
        let discoverGroups = [];
        let myGroups = [];
        let discoverPage = 1;
        let myGroupsPage = 1;
        const GROUPS_PER_PAGE = 8;
        const cropState = {
          file: null,
          objectUrl: '',
          image: null,
          naturalWidth: 0,
          naturalHeight: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          minScale: 1,
          scale: 1,
          zoom: 1,
          maxZoom: 4,
          offsetX: 0,
          offsetY: 0,
          pointerId: null,
          dragStartX: 0,
          dragStartY: 0,
          dragOffsetX: 0,
          dragOffsetY: 0,
          saving: false,
        };

        function releaseCropObjectUrl() {
          if (!cropState.objectUrl) return;
          URL.revokeObjectURL(cropState.objectUrl);
          cropState.objectUrl = '';
        }

        function releaseCreateCoverPreviewUrl() {
          if (!selectedCoverPreviewUrl) return;
          URL.revokeObjectURL(selectedCoverPreviewUrl);
          selectedCoverPreviewUrl = '';
        }

        function resetCropState(clearInput = false) {
          releaseCropObjectUrl();
          cropState.file = null;
          cropState.image = null;
          cropState.naturalWidth = 0;
          cropState.naturalHeight = 0;
          cropState.viewportWidth = 0;
          cropState.viewportHeight = 0;
          cropState.minScale = 1;
          cropState.scale = 1;
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          cropState.offsetX = 0;
          cropState.offsetY = 0;
          cropState.pointerId = null;
          cropState.saving = false;
          cropImage.removeAttribute('src');
          cropZoom.value = '100';
          cropZoomLabel.textContent = '100%';
          if (clearInput) coverInput.value = '';
        }

        function closeCropModal(clearInput = false) {
          cropModal.classList.add('hidden');
          cropModal.classList.remove('flex');
          resetCropState(clearInput);
        }

        function drawCreateCropPreview() {
          if (!cropState.image) return;
          cropPreviewCanvas.width = 640;
          cropPreviewCanvas.height = 200;
          const context = cropPreviewCanvas.getContext('2d');
          if (!context) return;
          const sourceX = Math.max(0, -cropState.offsetX / cropState.scale);
          const sourceY = Math.max(0, -cropState.offsetY / cropState.scale);
          const sourceWidth = Math.min(cropState.naturalWidth, cropState.viewportWidth / cropState.scale);
          const sourceHeight = Math.min(cropState.naturalHeight, cropState.viewportHeight / cropState.scale);
          context.clearRect(0, 0, cropPreviewCanvas.width, cropPreviewCanvas.height);
          context.drawImage(cropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cropPreviewCanvas.width, cropPreviewCanvas.height);
        }

        function clampCreateCropAxis(offset, viewportSize, scaledSize) {
          if (scaledSize <= viewportSize) return (viewportSize - scaledSize) / 2;
          const minOffset = viewportSize - scaledSize;
          return Math.min(0, Math.max(minOffset, offset));
        }

        function renderCreateCropStage() {
          if (!cropState.image) return;
          const scaledWidth = cropState.naturalWidth * cropState.scale;
          const scaledHeight = cropState.naturalHeight * cropState.scale;
          cropState.offsetX = clampCreateCropAxis(cropState.offsetX, cropState.viewportWidth, scaledWidth);
          cropState.offsetY = clampCreateCropAxis(cropState.offsetY, cropState.viewportHeight, scaledHeight);
          cropImage.style.width = `${scaledWidth}px`;
          cropImage.style.height = `${scaledHeight}px`;
          cropImage.style.transform = `translate3d(${cropState.offsetX}px, ${cropState.offsetY}px, 0)`;
          cropZoomLabel.textContent = `${Math.round(cropState.zoom * 100)}%`;
          drawCreateCropPreview();
        }

        function initializeCreateCropViewport() {
          if (!cropState.image) return false;
          const rect = cropStage.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          cropState.viewportWidth = rect.width;
          cropState.viewportHeight = rect.height;
          cropState.minScale = Math.max(rect.width / cropState.naturalWidth, rect.height / cropState.naturalHeight);
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          cropState.scale = cropState.minScale;
          cropState.offsetX = (rect.width - cropState.naturalWidth * cropState.scale) / 2;
          cropState.offsetY = (rect.height - cropState.naturalHeight * cropState.scale) / 2;
          cropZoom.min = '100';
          cropZoom.max = `${Math.round(cropState.maxZoom * 100)}`;
          cropZoom.value = '100';
          renderCreateCropStage();
          return true;
        }

        function setCreateCropZoom(nextZoom) {
          if (!cropState.image) return;
          const boundedZoom = Math.min(cropState.maxZoom, Math.max(1, nextZoom));
          const previousScale = cropState.scale || cropState.minScale;
          const focusX = cropState.viewportWidth / 2;
          const focusY = cropState.viewportHeight / 2;
          const imageFocusX = (focusX - cropState.offsetX) / previousScale;
          const imageFocusY = (focusY - cropState.offsetY) / previousScale;
          cropState.zoom = boundedZoom;
          cropState.scale = cropState.minScale * cropState.zoom;
          cropState.offsetX = focusX - imageFocusX * cropState.scale;
          cropState.offsetY = focusY - imageFocusY * cropState.scale;
          cropZoom.value = `${Math.round(cropState.zoom * 100)}`;
          renderCreateCropStage();
        }

        async function openCreateCropModal(file) {
          const validation = validateSupportedImageFile(file, 'portada');
          if (!validation.ok) {
            showToast(validation.error, 'error');
            coverInput.value = '';
            return;
          }
          resetCropState();
          cropState.file = file;
          cropState.objectUrl = URL.createObjectURL(file);
          cropState.image = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada. Usa JPG, PNG, GIF o WEBP.'));
            image.src = cropState.objectUrl;
          });
          cropState.naturalWidth = cropState.image.naturalWidth;
          cropState.naturalHeight = cropState.image.naturalHeight;
          cropImage.src = cropState.objectUrl;
          cropModal.classList.remove('hidden');
          cropModal.classList.add('flex');
          requestAnimationFrame(() => {
            if (!initializeCreateCropViewport()) {
              setTimeout(() => initializeCreateCropViewport(), 40);
            }
          });
        }

        function updateCreateCoverPreview(file = null) {
          if (file) {
            releaseCreateCoverPreviewUrl();
            clearPreviewUnavailable(coverPreview);
            selectedCoverPreviewUrl = URL.createObjectURL(file);
            coverPreview.style.backgroundImage = `url('${safeUrl(selectedCoverPreviewUrl)}')`;
            coverPreview.style.backgroundSize = 'cover';
            coverPreview.style.backgroundPosition = 'center';
            clearCoverButton.classList.remove('hidden');
            return;
          }
          releaseCreateCoverPreviewUrl();
          clearPreviewUnavailable(coverPreview);
          coverPreview.style.backgroundImage = '';
          coverPreview.style.background = 'linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)';
          clearCoverButton.classList.add('hidden');
        }

        function setTab(tab) {
          activeTab = tab;
          tabButtons.forEach((button) => {
            const isActive = button.dataset.groupsTab === tab;
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('shadow-sm', isActive);
            button.classList.toggle('text-slate-900', isActive);
            button.classList.toggle('font-semibold', isActive);
            button.classList.toggle('text-slate-600', !isActive);
            button.classList.toggle('font-medium', !isActive);
          });

          const showCreate = tab === 'create';
          listSection.classList.toggle('hidden', showCreate);
          createSection.classList.toggle('hidden', !showCreate);
          searchInput.closest('div').classList.toggle('hidden', showCreate);
          discoverToolbar.classList.toggle('hidden', showCreate || tab !== 'discover');
          pagination?.classList.toggle('hidden', showCreate);
        }

        function renderGroupCard(group) {
          const membershipLabel = group.is_member
            ? 'Ya pertenezco'
            : group.current_membership_status === 'pending'
              ? 'Solicitud enviada'
              : group.privacy === 'public'
                ? 'Publico'
                : 'Privado';

          return `
            <article class="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
              <button type="button" data-open-group="${group.id}" class="w-full text-left">
                <div class="h-40 bg-slate-200 bg-cover bg-center" style="${group.cover_url ? `background-image:url('${safeUrl(group.cover_url)}')` : 'background:linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)'}"></div>
                <div class="p-5">
                  <div class="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 class="text-lg font-bold text-slate-900 leading-tight">${escapeHtml(group.name)}</h3>
                      <div class="flex items-center gap-2 flex-wrap mt-1">
                        <p class="text-xs text-slate-500">${escapeHtml(group.member_count || 0)} miembros</p>
                        ${group.is_member ? '<span class="inline-flex items-center rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-bold">Ya pertenezco</span>' : ''}
                      </div>
                    </div>
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.privacy === 'private' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                      <span class="material-symbols-outlined text-[14px]">${group.privacy === 'private' ? 'lock' : 'public'}</span>
                      ${group.privacy === 'private' ? 'Privado' : 'Publico'}
                    </span>
                  </div>
                  <p class="text-sm text-slate-600 leading-6 min-h-[72px]">${escapeHtml((group.description || 'Sin descripcion').slice(0, 170))}</p>
                </div>
              </button>
              <div class="px-5 pb-5 flex items-center justify-between gap-3">
                <span class="text-xs font-semibold text-slate-500">${escapeHtml(membershipLabel)}</span>
                <div class="flex items-center gap-2">
                  ${!group.is_member && group.current_membership_status !== 'pending' ? `
                    <button type="button" data-join-group="${group.id}" class="px-4 py-2 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">
                      ${group.privacy === 'private' ? 'Solicitar ingreso' : 'Unirme'}
                    </button>
                  ` : ''}
                  <button type="button" data-open-group="${group.id}" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Ver grupo</button>
                </div>
              </div>
            </article>
          `;
        }

        function renderList(groups, emptyMessage) {
          if (!groups.length) {
            grid.innerHTML = '';
            emptyState.textContent = emptyMessage;
            emptyState.classList.remove('hidden');
            return;
          }

          emptyState.classList.add('hidden');
          grid.innerHTML = groups.map(renderGroupCard).join('');
        }

        function renderGroupsPage() {
          const isMineTab = activeTab === 'mine';
          const sourceGroups = isMineTab ? myGroups : discoverGroups;
          const currentPage = isMineTab ? myGroupsPage : discoverPage;
          const pageSlice = paginateClientItems(sourceGroups, currentPage, GROUPS_PER_PAGE);
          if (isMineTab) {
            myGroupsPage = pageSlice.meta.currentPage;
          } else {
            discoverPage = pageSlice.meta.currentPage;
          }
          renderList(pageSlice.items, isMineTab ? 'Todavia no perteneces a ningun grupo.' : 'No se encontraron grupos con esos criterios.');
          renderPagination(pagination, pageSlice.meta, { summaryLabel: 'grupos', standalone: true });
        }

        async function loadDiscover() {
          grid.innerHTML = renderListSkeleton(4, { lines: ['72%', '100%', '88%'], media: true, avatar: false });
          emptyState.classList.add('hidden');
          pagination?.classList.add('hidden');
          const result = await SocialAPI.discoverGroups(searchInput.value.trim());
          if (!result?.ok) {
            renderList([], 'No se pudieron cargar los grupos.');
            pagination?.classList.add('hidden');
            return;
          }

          discoverGroups = getList(result).filter((group) => {
            const passMine = !hideMineCheckbox.checked || !group.is_member;
            const passPrivacy = privacyFilter.value === 'all' || group.privacy === privacyFilter.value;
            return passMine && passPrivacy;
          });
          discoverPage = 1;
          renderGroupsPage();
        }

        async function loadMine() {
          grid.innerHTML = renderListSkeleton(4, { lines: ['72%', '100%', '88%'], media: true, avatar: false });
          emptyState.classList.add('hidden');
          pagination?.classList.add('hidden');
          const result = await SocialAPI.getMyGroups();
          if (!result?.ok) {
            renderList([], 'No se pudieron cargar tus grupos.');
            pagination?.classList.add('hidden');
            return;
          }

          myGroups = getList(result);
          myGroupsPage = 1;
          renderGroupsPage();
        }

        async function loadActiveTab() {
          if (activeTab === 'mine') {
            await loadMine();
            return;
          }
          if (activeTab === 'discover') {
            await loadDiscover();
          }
        }

        searchInput.addEventListener('input', () => {
          if (activeTab !== 'discover') return;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => {
            loadDiscover();
          }, 280);
        });
        hideMineCheckbox.addEventListener('change', () => {
          if (activeTab !== 'discover') return;
          loadDiscover();
        });

        privacyFilter.addEventListener('change', () => {
          if (activeTab !== 'discover') return;
          loadDiscover();
        });

        tabButtons.forEach((button) => {
          button.addEventListener('click', async () => {
            setTab(button.dataset.groupsTab);
            await loadActiveTab();
          });
        });

        grid.addEventListener('click', async (event) => {
          const openButton = event.target.closest('[data-open-group]');
          if (openButton) {
            router.navigate('group', { id: openButton.dataset.openGroup });
            return;
          }

          const joinButton = event.target.closest('[data-join-group]');
          if (!joinButton) return;

          const result = await SocialAPI.joinGroup(joinButton.dataset.joinGroup);
          if (result?.ok) {
            showToast(result.data?.message || 'Solicitud enviada', 'success');
            await loadActiveTab();
            return;
          }

          showToast(result?.data?.error || 'No se pudo procesar la solicitud', 'error');
        });

        pagination?.addEventListener('click', (event) => {
          const button = event.target.closest('[data-page]');
          if (!button) return;
          if (activeTab === 'mine') {
            myGroupsPage = Number(button.dataset.page) || 1;
          } else {
            discoverPage = Number(button.dataset.page) || 1;
          }
          renderGroupsPage();
        });

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          submitButton.disabled = true;
          submitButton.textContent = 'Creando...';

          const payload = {
            name: form.name.value.trim(),
            description: form.description.value.trim(),
            privacy: form.privacy.value,
            coverFile: selectedCoverFile,
          };

          const result = await SocialAPI.createGroup(payload);
          submitButton.disabled = false;
          submitButton.textContent = 'Crear grupo';

          if (result?.ok) {
            showToast('Grupo creado', 'success');
            router.navigate('group', { id: result.data.id });
            return;
          }

          showToast(result?.data?.error || 'No se pudo crear el grupo', 'error');
        });

        pickCoverButton.addEventListener('click', () => coverInput.click());
        clearCoverButton.addEventListener('click', () => {
          selectedCoverFile = null;
          coverInput.value = '';
          updateCreateCoverPreview(null);
        });
        coverInput.addEventListener('change', async (event) => {
          const [file] = event.target.files || [];
          if (!file) return;
          try {
            await openCreateCropModal(file);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
            closeCropModal(true);
          }
        });
        cropZoom.addEventListener('input', (event) => {
          setCreateCropZoom(Number(event.target.value) / 100);
        });
        cropCancelButton.addEventListener('click', () => closeCropModal(true));
        cropCloseButton.addEventListener('click', () => closeCropModal(true));
        cropModal.addEventListener('click', (event) => {
          if (event.target === cropModal) closeCropModal(true);
        });
        cropStage.addEventListener('pointerdown', (event) => {
          if (!cropState.image || cropState.saving) return;
          cropState.pointerId = event.pointerId;
          cropState.dragStartX = event.clientX;
          cropState.dragStartY = event.clientY;
          cropState.dragOffsetX = cropState.offsetX;
          cropState.dragOffsetY = cropState.offsetY;
          cropStage.setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        cropStage.addEventListener('pointermove', (event) => {
          if (cropState.pointerId !== event.pointerId) return;
          cropState.offsetX = cropState.dragOffsetX + (event.clientX - cropState.dragStartX);
          cropState.offsetY = cropState.dragOffsetY + (event.clientY - cropState.dragStartY);
          renderCreateCropStage();
          event.preventDefault();
        });
        const stopCreateCropDrag = (event) => {
          if (cropState.pointerId === null) return;
          if (event && cropState.pointerId !== event.pointerId) return;
          if (event && cropStage.hasPointerCapture(event.pointerId)) {
            cropStage.releasePointerCapture(event.pointerId);
          }
          cropState.pointerId = null;
        };
        cropStage.addEventListener('pointerup', stopCreateCropDrag);
        cropStage.addEventListener('pointercancel', stopCreateCropDrag);
        cropStage.addEventListener('lostpointercapture', () => {
          cropState.pointerId = null;
        });
        cropSaveButton.addEventListener('click', async () => {
          if (!cropState.image || cropState.saving) return;
          cropState.saving = true;
          cropSaveButton.disabled = true;
          cropSaveButton.textContent = 'Preparando...';
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1600;
            canvas.height = 500;
            const context = canvas.getContext('2d');
            const sourceX = Math.max(0, -cropState.offsetX / cropState.scale);
            const sourceY = Math.max(0, -cropState.offsetY / cropState.scale);
            const sourceWidth = Math.min(cropState.naturalWidth, cropState.viewportWidth / cropState.scale);
            const sourceHeight = Math.min(cropState.naturalHeight, cropState.viewportHeight / cropState.scale);
            context.drawImage(cropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) throw new Error('No se pudo preparar la portada');
            selectedCoverFile = new File([blob], `group-cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
            updateCreateCoverPreview(selectedCoverFile);
            closeCropModal(false);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
          } finally {
            cropState.saving = false;
            cropSaveButton.disabled = false;
            cropSaveButton.textContent = 'Usar portada';
          }
        });

        setTab('discover');
        loadActiveTab();
      },
    },
    group: {
      title: 'Grupo',
      activeNav: 'groups',
      templatePath: '/pages/group.html',
      mount({ container, user, params, router }) {
        const groupId = Number(params.id);
        const cover = container.querySelector('#group-cover-shell');
        const title = container.querySelector('#group-title');
        const description = container.querySelector('#group-description');
        const memberCount = container.querySelector('#group-member-count');
        const creatorLabel = container.querySelector('#group-creator-label');
        const privacyBadge = container.querySelector('#group-privacy-badge');
        const actionsWrap = container.querySelector('#group-actions');
        const infoTab = container.querySelector('#group-tab-info');
        const conversationTab = container.querySelector('#group-tab-conversation');
        const peopleTab = container.querySelector('#group-tab-people');
        const mediaTab = container.querySelector('#group-tab-media');
        const tabButtons = Array.from(container.querySelectorAll('[data-group-tab]'));
        const editModal = container.querySelector('#group-edit-modal');
        const editForm = container.querySelector('#edit-group-modal-form');
        const editNameInput = container.querySelector('#edit-group-name');
        const editPrivacyInput = container.querySelector('#edit-group-privacy');
        const editDescriptionInput = container.querySelector('#edit-group-description');
        const editCoverInput = container.querySelector('#edit-group-cover-input');
        const editCoverPreview = container.querySelector('#edit-group-cover-preview');
        const pickEditCoverButton = container.querySelector('#pick-edit-group-cover-btn');
        const clearEditCoverButton = container.querySelector('#clear-edit-group-cover-btn');
        const closeEditModalButton = container.querySelector('#close-group-edit-modal-btn');
        const cancelEditModalButton = container.querySelector('#cancel-group-edit-modal-btn');
        const saveEditModalButton = container.querySelector('#save-group-edit-modal-btn');
        const editCropModal = container.querySelector('#group-edit-crop-modal');
        const editCropStage = container.querySelector('#group-edit-crop-stage');
        const editCropImage = container.querySelector('#group-edit-crop-image');
        const editCropPreviewCanvas = container.querySelector('#group-edit-crop-preview');
        const editCropZoom = container.querySelector('#group-edit-crop-zoom');
        const editCropZoomLabel = container.querySelector('#group-edit-crop-zoom-label');
        const editCropSaveButton = container.querySelector('#group-edit-crop-save-btn');
        const editCropCancelButton = container.querySelector('#group-edit-crop-cancel-btn');
        const editCropCloseButton = container.querySelector('#group-edit-crop-close-btn');
        const commentModal = container.querySelector('#group-comment-modal');
        const commentPostPreview = container.querySelector('#group-comment-post-preview');
        const commentList = container.querySelector('#group-comment-list');
        const commentSort = container.querySelector('#group-comment-sort');
        const commentInput = container.querySelector('#group-comment-input');
        const syncCommentSortChips = bindCommentSortChips(commentModal, commentSort, (value) => {
          if (!pendingCommentPostId) return;
          loadComments(pendingCommentPostId, value);
        });
        let groupData = null;
        let groupPosts = [];
        let currentTab = 'info';
        const selectedGroupComposerMedia = { file: null, previewUrl: '', kind: null, previewReady: false, previewLoading: false, uploadInProgress: false, uploadProgress: 0 };
        let selectedEditCoverFile = null;
        let selectedEditCoverPreviewUrl = '';
        let pendingCommentPostId = null;
        let currentCommentSort = 'newest';
        let groupPostMentionController = null;
        let groupCommentMentionController = createMentionAutocomplete(commentInput);
        const editCropState = {
          file: null,
          objectUrl: '',
          image: null,
          naturalWidth: 0,
          naturalHeight: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          minScale: 1,
          scale: 1,
          zoom: 1,
          maxZoom: 4,
          offsetX: 0,
          offsetY: 0,
          pointerId: null,
          dragStartX: 0,
          dragStartY: 0,
          dragOffsetX: 0,
          dragOffsetY: 0,
          saving: false,
        };

        function setTab(tab) {
          currentTab = tab;
          tabButtons.forEach((button) => {
            const isActive = button.dataset.groupTab === tab;
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('shadow-sm', isActive);
            button.classList.toggle('text-slate-900', isActive);
            button.classList.toggle('font-semibold', isActive);
            button.classList.toggle('text-slate-600', !isActive);
            button.classList.toggle('font-medium', !isActive);
          });
          infoTab.classList.toggle('hidden', tab !== 'info');
          conversationTab.classList.toggle('hidden', tab !== 'conversation');
          peopleTab.classList.toggle('hidden', tab !== 'people');
          mediaTab.classList.toggle('hidden', tab !== 'media');
        }

        function groupCanManage() {
          return !!groupData?.is_admin;
        }

        function isSystemAdmin() {
          return appState.user?.role === 'admin' || user?.role === 'admin';
        }

        function updateEditCoverPreview(file = null) {
          if (selectedEditCoverPreviewUrl) {
            URL.revokeObjectURL(selectedEditCoverPreviewUrl);
            selectedEditCoverPreviewUrl = '';
          }

          if (file) {
            clearPreviewUnavailable(editCoverPreview);
            selectedEditCoverPreviewUrl = URL.createObjectURL(file);
            editCoverPreview.style.backgroundImage = `url('${safeUrl(selectedEditCoverPreviewUrl)}')`;
            editCoverPreview.style.backgroundSize = 'cover';
            editCoverPreview.style.backgroundPosition = 'center';
            clearEditCoverButton.classList.remove('hidden');
            return;
          }

          clearPreviewUnavailable(editCoverPreview);
          if (groupData?.cover_url) {
            editCoverPreview.style.backgroundImage = `url('${safeUrl(groupData.cover_url)}')`;
            editCoverPreview.style.backgroundSize = 'cover';
            editCoverPreview.style.backgroundPosition = 'center';
            clearEditCoverButton.classList.add('hidden');
            return;
          }

          editCoverPreview.style.backgroundImage = '';
          editCoverPreview.style.background = 'linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)';
          clearEditCoverButton.classList.add('hidden');
        }

        function releaseEditCropObjectUrl() {
          if (!editCropState.objectUrl) return;
          URL.revokeObjectURL(editCropState.objectUrl);
          editCropState.objectUrl = '';
        }

        function resetEditCropState(clearInput = false) {
          releaseEditCropObjectUrl();
          editCropState.file = null;
          editCropState.image = null;
          editCropState.naturalWidth = 0;
          editCropState.naturalHeight = 0;
          editCropState.viewportWidth = 0;
          editCropState.viewportHeight = 0;
          editCropState.minScale = 1;
          editCropState.scale = 1;
          editCropState.zoom = 1;
          editCropState.maxZoom = 4;
          editCropState.offsetX = 0;
          editCropState.offsetY = 0;
          editCropState.pointerId = null;
          editCropState.saving = false;
          editCropImage.removeAttribute('src');
          editCropZoom.value = '100';
          editCropZoomLabel.textContent = '100%';
          if (clearInput) editCoverInput.value = '';
        }

        function closeEditCropModal(clearInput = false) {
          editCropModal.classList.add('hidden');
          editCropModal.classList.remove('flex');
          resetEditCropState(clearInput);
        }

        function drawEditCropPreview() {
          if (!editCropState.image) return;
          editCropPreviewCanvas.width = 640;
          editCropPreviewCanvas.height = 200;
          const context = editCropPreviewCanvas.getContext('2d');
          if (!context) return;
          const sourceX = Math.max(0, -editCropState.offsetX / editCropState.scale);
          const sourceY = Math.max(0, -editCropState.offsetY / editCropState.scale);
          const sourceWidth = Math.min(editCropState.naturalWidth, editCropState.viewportWidth / editCropState.scale);
          const sourceHeight = Math.min(editCropState.naturalHeight, editCropState.viewportHeight / editCropState.scale);
          context.clearRect(0, 0, editCropPreviewCanvas.width, editCropPreviewCanvas.height);
          context.drawImage(editCropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, editCropPreviewCanvas.width, editCropPreviewCanvas.height);
        }

        function clampEditCropAxis(offset, viewportSize, scaledSize) {
          if (scaledSize <= viewportSize) return (viewportSize - scaledSize) / 2;
          const minOffset = viewportSize - scaledSize;
          return Math.min(0, Math.max(minOffset, offset));
        }

        function renderEditCropStage() {
          if (!editCropState.image) return;
          const scaledWidth = editCropState.naturalWidth * editCropState.scale;
          const scaledHeight = editCropState.naturalHeight * editCropState.scale;
          editCropState.offsetX = clampEditCropAxis(editCropState.offsetX, editCropState.viewportWidth, scaledWidth);
          editCropState.offsetY = clampEditCropAxis(editCropState.offsetY, editCropState.viewportHeight, scaledHeight);
          editCropImage.style.width = `${scaledWidth}px`;
          editCropImage.style.height = `${scaledHeight}px`;
          editCropImage.style.transform = `translate3d(${editCropState.offsetX}px, ${editCropState.offsetY}px, 0)`;
          editCropZoomLabel.textContent = `${Math.round(editCropState.zoom * 100)}%`;
          drawEditCropPreview();
        }

        function initializeEditCropViewport() {
          if (!editCropState.image) return false;
          const rect = editCropStage.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          editCropState.viewportWidth = rect.width;
          editCropState.viewportHeight = rect.height;
          editCropState.minScale = Math.max(rect.width / editCropState.naturalWidth, rect.height / editCropState.naturalHeight);
          editCropState.zoom = 1;
          editCropState.maxZoom = 4;
          editCropState.scale = editCropState.minScale;
          editCropState.offsetX = (rect.width - editCropState.naturalWidth * editCropState.scale) / 2;
          editCropState.offsetY = (rect.height - editCropState.naturalHeight * editCropState.scale) / 2;
          editCropZoom.min = '100';
          editCropZoom.max = `${Math.round(editCropState.maxZoom * 100)}`;
          editCropZoom.value = '100';
          renderEditCropStage();
          return true;
        }

        function setEditCropZoom(nextZoom) {
          if (!editCropState.image) return;
          const boundedZoom = Math.min(editCropState.maxZoom, Math.max(1, nextZoom));
          const previousScale = editCropState.scale || editCropState.minScale;
          const focusX = editCropState.viewportWidth / 2;
          const focusY = editCropState.viewportHeight / 2;
          const imageFocusX = (focusX - editCropState.offsetX) / previousScale;
          const imageFocusY = (focusY - editCropState.offsetY) / previousScale;
          editCropState.zoom = boundedZoom;
          editCropState.scale = editCropState.minScale * editCropState.zoom;
          editCropState.offsetX = focusX - imageFocusX * editCropState.scale;
          editCropState.offsetY = focusY - imageFocusY * editCropState.scale;
          editCropZoom.value = `${Math.round(editCropState.zoom * 100)}`;
          renderEditCropStage();
        }

        async function openEditCropModal(file) {
          const validation = validateSupportedImageFile(file, 'portada');
          if (!validation.ok) {
            showToast(validation.error, 'error');
            editCoverInput.value = '';
            return;
          }
          resetEditCropState();
          editCropState.file = file;
          editCropState.objectUrl = URL.createObjectURL(file);
          editCropState.image = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada. Usa JPG, PNG, GIF o WEBP.'));
            image.src = editCropState.objectUrl;
          });
          editCropState.naturalWidth = editCropState.image.naturalWidth;
          editCropState.naturalHeight = editCropState.image.naturalHeight;
          editCropImage.src = editCropState.objectUrl;
          editCropModal.classList.remove('hidden');
          editCropModal.classList.add('flex');
          requestAnimationFrame(() => {
            if (!initializeEditCropViewport()) {
              setTimeout(() => initializeEditCropViewport(), 40);
            }
          });
        }

        function openEditModal() {
          if (!groupData) return;
          selectedEditCoverFile = null;
          editCoverInput.value = '';
          editNameInput.value = groupData.name || '';
          editPrivacyInput.value = groupData.privacy || 'public';
          editDescriptionInput.value = groupData.description || '';
          const editPostsLockedInput = container.querySelector('#edit-group-posts-locked');
          if (editPostsLockedInput) {
            editPostsLockedInput.checked = !!groupData.posts_locked;
          }
          updateEditCoverPreview(null);
          editModal.classList.remove('hidden');
          editModal.classList.add('flex');
        }

        function closeEditModal() {
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
          selectedEditCoverFile = null;
          if (selectedEditCoverPreviewUrl) {
            URL.revokeObjectURL(selectedEditCoverPreviewUrl);
            selectedEditCoverPreviewUrl = '';
          }
          editCoverInput.value = '';
          updateEditCoverPreview(null);
        }

        function findGroupPost(postId) {
          return groupPosts.find((post) => Number(post.id) === Number(postId)) || null;
        }

        function renderHeader() {
          if (!groupData) return;
          title.textContent = groupData.name;
          description.textContent = groupData.description || 'Este grupo todavia no tiene una descripcion.';
          memberCount.textContent = `${groupData.member_count || 0} miembros`;
          creatorLabel.textContent = `Creador: ${displayName(groupData.creator || { full_name: 'Usuario' })}`;
          privacyBadge.innerHTML = `
            <span class="material-symbols-outlined text-[14px]">${groupData.privacy === 'private' ? 'lock' : 'public'}</span>
            ${groupData.privacy === 'private' ? 'Privado' : 'Publico'}
          `;
          privacyBadge.className = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${groupData.privacy === 'private' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`;

          if (groupData.cover_url) {
            cover.style.backgroundImage = `url('${safeUrl(groupData.cover_url)}')`;
            cover.style.backgroundSize = 'cover';
            cover.style.backgroundPosition = 'center';
          }

          const actionButtons = [];
          if (groupData.is_member) {
            actionButtons.push(`<button type="button" data-leave-group class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Salir del grupo</button>`);
          } else if (groupData.current_membership_status === 'pending') {
            actionButtons.push(`<span class="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200">Solicitud pendiente</span>`);
          } else {
            actionButtons.push(`<button type="button" data-join-group class="px-4 py-2 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">${groupData.privacy === 'private' ? 'Solicitar ingreso' : 'Unirme al grupo'}</button>`);
          }

          if (groupCanManage()) {
            actionButtons.push(`<button type="button" data-edit-group class="px-4 py-2 rounded-xl border border-[#1B2A6B] text-[#1B2A6B] text-sm font-semibold hover:bg-[#1B2A6B] hover:text-white transition-colors">Editar grupo</button>`);
          }

          actionsWrap.innerHTML = actionButtons.join('');
        }

        function renderInfoTab() {
          if (!groupData) return;
          infoTab.innerHTML = `
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div class="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 class="text-lg font-bold text-slate-900 mb-3">Sobre este grupo</h2>
                <p class="text-sm text-slate-600 leading-7">${escapeHtml(groupData.description || 'Sin descripcion todavia.')}</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Privacidad</p>
                    <p class="mt-2 text-sm font-semibold text-slate-800">${groupData.privacy === 'private' ? 'Privado' : 'Publico'}</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Miembros</p>
                    <p class="mt-2 text-sm font-semibold text-slate-800">${groupData.member_count || 0}</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Creador</p>
                    <p class="mt-2 text-sm font-semibold text-slate-800">${escapeHtml(displayName(groupData.creator || { full_name: 'Usuario' }))}</p>
                  </div>
                </div>
              </div>
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 class="text-lg font-bold text-slate-900 mb-3">Estado</h2>
                <div class="space-y-3 text-sm text-slate-600">
                  <p>Rol actual: <span class="font-semibold text-slate-800">${escapeHtml(groupData.current_role || 'Visitante')}</span></p>
                  <p>Acceso a conversacion: <span class="font-semibold text-slate-800">${groupData.can_view_conversation ? 'Si' : 'No'}</span></p>
                  <p>Nuevas publicaciones: <span class="font-semibold ${groupData.posts_locked ? 'text-amber-700' : 'text-emerald-700'}">${groupData.posts_locked ? 'Bloqueadas temporalmente' : 'Disponibles'}</span></p>
                </div>
              </div>
            </div>
            `;
        }

        function renderConversationTabSkeleton() {
          if (!groupData?.can_view_conversation) {
            conversationTab.innerHTML = `
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
                <p class="text-slate-600 text-sm">Debes pertenecer al grupo para ver y publicar en la conversacion.</p>
              </div>
            `;
            return;
          }

          const composerMarkup = groupData.can_post ? `
            <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 bg-cover bg-center" id="group-composer-avatar" style="background:#1B2A6B">U</div>
                <div class="flex-1">
                  <textarea id="group-post-content" rows="3" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none" placeholder="Comparte algo con tu grupo"></textarea>
                  <div id="group-image-preview-wrap" class="hidden mt-3 relative rounded-2xl overflow-hidden border border-slate-200">
                    <img id="group-image-preview" class="w-full max-h-64 object-contain bg-slate-950" alt="Vista previa de imagen del grupo"/>
                    <video id="group-video-preview" class="hidden w-full max-h-64 object-contain bg-slate-950" playsinline muted autoplay loop preload="metadata"></video>
                    <div class="feed-composer-preview__overlay hidden" data-composer-upload-overlay="true" aria-hidden="true">
                      <div class="feed-composer-preview__progress is-indeterminate" data-composer-upload-progress-circle="true">
                        <span data-composer-upload-progress-value="true">...</span>
                      </div>
                      <div class="feed-composer-preview__status" data-composer-upload-status="true">Cargando vista previa...</div>
                    </div>
                    <button id="group-clear-image-btn" type="button" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/75 transition-colors">x</button>
                  </div>
                </div>
              </div>
              <input type="file" id="group-file-input" accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" class="hidden"/>
              <input type="file" id="group-camera-photo-input" accept="image/*" capture="environment" class="hidden"/>
              <input type="file" id="group-camera-video-input" accept="video/*" capture="environment" class="hidden"/>
              <div class="mt-4 flex flex-wrap justify-between gap-3">
                <div class="relative flex flex-wrap gap-3">
                  <button id="group-pick-image-btn" type="button" class="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <span class="material-symbols-outlined text-[18px]">image</span>
                    Agregar archivo
                  </button>
                  <button id="group-pick-camera-btn" type="button" class="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <span class="material-symbols-outlined text-[18px]">photo_camera</span>
                    Capturar
                  </button>
                  <div id="group-camera-capture-menu" class="hidden absolute left-0 top-full z-30 mt-2 min-w-[210px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <button id="group-camera-capture-photo-btn" type="button" class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      <span class="material-symbols-outlined text-[18px]">photo_camera</span>
                      <span>Tomar foto</span>
                    </button>
                    <button id="group-camera-capture-video-btn" type="button" class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      <span class="material-symbols-outlined text-[18px]">videocam</span>
                      <span>Grabar video</span>
                    </button>
                  </div>
                </div>
                <button id="group-publish-btn" type="button" class="px-5 py-2 rounded-xl bg-[#E5D59A] text-[#5A4A1A] text-sm font-bold hover:bg-[#d8c686] transition-colors">Publicar</button>
              </div>
            </div>
          ` : `
            <div class="bg-white rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
              <div class="flex items-start gap-3">
                <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <span class="material-symbols-outlined text-[22px]">lock</span>
                </div>
                <div>
                  <p class="text-sm font-semibold text-amber-900">Publicaciones nuevas bloqueadas temporalmente</p>
                  <p class="mt-1 text-sm text-amber-700">Solo los administradores del grupo pueden publicar mientras este bloqueo este activo.</p>
                </div>
              </div>
            </div>
          `;

          conversationTab.innerHTML = `
            ${composerMarkup}
            <div id="group-posts-list" class="space-y-4">
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Cargando publicaciones...</div>
            </div>
          `;
        }

        function openCommentModal(postId) {
          pendingCommentPostId = Number(postId);
          commentInput.value = '';
          groupCommentMentionController?.clear();
          commentSort.value = currentCommentSort;
          syncCommentSortChips(currentCommentSort);
          commentModal.classList.remove('hidden');
          commentModal.classList.add('flex');
          commentPostPreview.innerHTML = renderPostModalPreview(findGroupPost(postId), user.id, { hideGroupBadge: true });
          loadComments(postId, currentCommentSort);
          // Re-sync adaptive video heights once modal layout has settled
          setTimeout(() => refreshAdaptiveMediaFrames(), 80);
          setTimeout(() => refreshAdaptiveMediaFrames(), 320);
        }

        function closeCommentModal() {
          pendingCommentPostId = null;
          groupCommentMentionController?.clear();
          commentModal.classList.add('hidden');
          commentModal.classList.remove('flex');
          commentPostPreview.innerHTML = '';
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>';
        }

        async function loadComments(postId = pendingCommentPostId, sort = currentCommentSort) {
          if (!postId) return;
          currentCommentSort = sort;
          commentSort.value = sort;
          syncCommentSortChips(sort);
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Cargando comentarios...</p>';
          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          if (!result?.ok) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          const comments = getList(result);
          if (!comments.length) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No hay comentarios todavia.</p>';
            return;
          }

          commentList.innerHTML = comments.map((comment) => {
            const canDelete = Number(comment.user_id) === Number(user.id) || groupCanManage() || isSystemAdmin();
            return renderCommentCard(comment, {
              deleteAction: canDelete ? 'group-delete-comment' : '',
            });
          }).join('');
          refreshRelativeTimeLabels(commentList);
        }

        async function loadConversation() {
          renderConversationTabSkeleton();
          if (!groupData?.can_view_conversation) return;
          groupPostMentionController?.destroy();
          groupPostMentionController = null;

          const composerAvatar = conversationTab.querySelector('#group-composer-avatar');
          const fileInput = conversationTab.querySelector('#group-file-input');
          const cameraPhotoInput = conversationTab.querySelector('#group-camera-photo-input');
          const cameraVideoInput = conversationTab.querySelector('#group-camera-video-input');
          const cameraCaptureMenu = conversationTab.querySelector('#group-camera-capture-menu');
          const previewWrap = conversationTab.querySelector('#group-image-preview-wrap');
          const previewImage = conversationTab.querySelector('#group-image-preview');
          const previewVideo = conversationTab.querySelector('#group-video-preview');
          const contentInput = conversationTab.querySelector('#group-post-content');
          const publishButton = conversationTab.querySelector('#group-publish-btn');
          const postsList = conversationTab.querySelector('#group-posts-list');

          if (contentInput) {
            groupPostMentionController = createMentionAutocomplete(contentInput);
          }

          if (composerAvatar) {
            setAvatarElement(composerAvatar, user);
          }

          function clearImage() {
            clearComposerMediaSelection(selectedGroupComposerMedia, {
              fileInput,
              cameraInput: cameraPhotoInput,
              extraInputs: [cameraPhotoInput, cameraVideoInput],
              previewWrap,
              previewImage,
              previewVideo,
              onStateChange: () => syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia),
            });
          }

          function setComposerImage(file) {
            if (!file) {
              clearImage();
              return;
            }

            const validation = validateSupportedPostMediaFile(file);
            if (!validation.ok) {
              clearImage();
              showToast(validation.error, 'error');
              return;
            }

            applyComposerMediaSelection(file, selectedGroupComposerMedia, {
              previewWrap,
              previewImage,
              previewVideo,
              onStateChange: () => syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia),
            });
          }

          function renderPosts() {
            if (!groupPosts.length) {
              postsList.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Aun no hay publicaciones en este grupo.</div>';
              return;
            }

            postsList.innerHTML = groupPosts.map((post) => renderPostCard(post, user.id, {
              canDelete: Number(post.user_id) === Number(user.id) || groupCanManage(),
              hideGroupBadge: true,
            })).join('');
          }

          async function reloadPosts() {
            await ensurePublicUsersLoaded();
            const result = await PostsAPI.getGroupPosts(groupId);
            if (!result?.ok) {
              postsList.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">No se pudieron cargar las publicaciones del grupo.</div>';
              return;
            }

            groupPosts = getList(result);
            renderPosts();
            if (pendingCommentPostId) {
              commentPostPreview.innerHTML = renderPostModalPreview(findGroupPost(pendingCommentPostId), user.id, { hideGroupBadge: true });
            }
          }

          if (groupData.can_post && fileInput && previewWrap && previewImage && contentInput && publishButton) {
            conversationTab.querySelector('#group-pick-image-btn').addEventListener('click', () => fileInput.click());
            conversationTab.querySelector('#group-pick-camera-btn')?.addEventListener('click', () => {
              cameraCaptureMenu?.classList.toggle('hidden');
            });
            conversationTab.querySelector('#group-camera-capture-photo-btn')?.addEventListener('click', () => {
              if (!cameraPhotoInput) return;
              cameraCaptureMenu?.classList.add('hidden');
              cameraPhotoInput.value = '';
              cameraPhotoInput.click();
            });
            conversationTab.querySelector('#group-camera-capture-video-btn')?.addEventListener('click', () => {
              if (!cameraVideoInput) return;
              cameraCaptureMenu?.classList.add('hidden');
              cameraVideoInput.value = '';
              cameraVideoInput.click();
            });
            conversationTab.querySelector('#group-clear-image-btn').addEventListener('click', clearImage);
            fileInput.addEventListener('change', (event) => {
              const [file] = event.target.files || [];
              setComposerImage(file);
            });
            cameraPhotoInput?.addEventListener('change', (event) => {
              const [file] = event.target.files || [];
              setComposerImage(file);
            });
            cameraVideoInput?.addEventListener('change', (event) => {
              const [file] = event.target.files || [];
              setComposerImage(file);
            });
            conversationTab.addEventListener('click', (event) => {
              const insideCameraCapture = event.target.closest('#group-pick-camera-btn, #group-camera-capture-menu');
              if (!insideCameraCapture) {
                cameraCaptureMenu?.classList.add('hidden');
              }
            });
            contentInput.addEventListener('input', () => syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia));

            publishButton.addEventListener('click', async () => {
              const content = contentInput.value.trim();
              const mentionUserIds = groupPostMentionController?.collectMentionUserIds?.() || [];
              if (!content && !selectedGroupComposerMedia.file) {
                showToast('Escribe algo o adjunta una imagen o video', 'error');
                return;
              }
              if (selectedGroupComposerMedia.file && !selectedGroupComposerMedia.previewReady) {
                showToast('Espera a que cargue la vista previa antes de publicar', 'error');
                return;
              }

              selectedGroupComposerMedia.uploadInProgress = !!selectedGroupComposerMedia.file;
              selectedGroupComposerMedia.uploadProgress = 0;
              if (selectedGroupComposerMedia.file) {
                setComposerPreviewOverlay(previewWrap, {
                  visible: true,
                  progress: 0,
                  label: 'Subiendo archivo...',
                });
                syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia);
              } else {
                publishButton.disabled = true;
                publishButton.textContent = 'Publicando...';
              }

              const result = await PostsAPI.createGroupPost(groupId, {
                content,
                mediaFile: selectedGroupComposerMedia.file,
                mentionUserIds,
                onUploadProgress: ({ percent }) => {
                  if (!selectedGroupComposerMedia.file) return;
                  const numericPercent = Number(percent);
                  if (Number.isFinite(numericPercent)) {
                    selectedGroupComposerMedia.uploadProgress = numericPercent;
                  }
                  setComposerPreviewOverlay(previewWrap, {
                    visible: true,
                    progress: Number.isFinite(numericPercent) ? numericPercent : null,
                    label: 'Subiendo archivo...',
                  });
                  syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia);
                },
              });

              selectedGroupComposerMedia.uploadInProgress = false;
              selectedGroupComposerMedia.uploadProgress = 0;
              setComposerPreviewOverlay(previewWrap, { visible: false });
              syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia);

              if (result?.ok) {
                contentInput.value = '';
                clearImage();
                groupPostMentionController?.clear();
                showToast('Publicacion creada', 'success');
                await reloadPosts();
                return;
              }

              showToast(result?.data?.error || 'No se pudo publicar en el grupo', 'error');
            });
            syncComposerPublishButton(publishButton, contentInput, selectedGroupComposerMedia);
          }

          postsList.addEventListener('click', async (event) => {
            const profileButton = event.target.closest('[data-action="open-profile"]');
            if (profileButton) {
              hideMentionProfilePopover();
              router.navigate('profile', { id: profileButton.dataset.userId });
              return;
            }

            const deleteButton = event.target.closest('[data-action="delete-post"]');
            if (deleteButton) {
              const confirmed = await confirmAction({
                title: 'Eliminar publicacion',
                copy: 'Esta publicacion del grupo se eliminara de forma permanente.',
                acceptLabel: 'Eliminar',
                tone: 'danger',
              });
              if (!confirmed) return;

              const result = await PostsAPI.deletePost(deleteButton.dataset.postId);
              if (result?.ok) {
                showToast('Publicacion eliminada', 'success');
                await reloadPosts();
                return;
              }

              showToast(result?.data?.error || 'No se pudo eliminar la publicacion', 'error');
              return;
            }

            const commentButton = event.target.closest('[data-action="comment-post"]');
            if (commentButton) {
              openCommentModal(commentButton.dataset.postId);
              return;
            }

            const liveButton = event.target.closest('[data-action="open-livestream"]');
            if (liveButton) {
              await navigateToLivestream(router, liveButton.dataset.liveId);
              return;
            }

            const reportButton = event.target.closest('[data-action="report-post"]');
            if (reportButton) {
              const result = await PostsAPI.reportPost(reportButton.dataset.postId);
              showToast(result?.ok ? 'Publicacion reportada' : (result?.data?.error || 'No se pudo reportar'), result?.ok ? 'success' : 'error');
              return;
            }

            const reactionButton = event.target.closest('[data-action="react-post"]');
            if (reactionButton) {
              const result = await PostsAPI.reactPost(reactionButton.dataset.postId, reactionButton.dataset.reaction);
              if (result?.ok) {
                await reloadPosts();
              } else {
                showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
              }
              return;
            }

            const reactionPickerButton = event.target.closest('[data-action="open-reaction-picker"]');
            if (reactionPickerButton) {
              openReactionPicker(reactionPickerButton, {
                targetType: 'post',
                targetId: Number(reactionPickerButton.dataset.targetId),
                currentReaction: reactionPickerButton.dataset.currentReaction || '',
                onSelect: async (reaction) => {
                  reactionPickerButton.dataset.currentReaction = reaction;
                  reactionPickerButton.classList.add('is-active');
                  reactionPickerButton.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
                  closeReactionPicker();

                  const result = await PostsAPI.reactPost(Number(reactionPickerButton.dataset.targetId), reaction);
                  if (!result?.ok) {
                    showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
                    await reloadPosts();
                    return;
                  }

                  await reloadPosts();
                },
              });
              return;
            }
          });

          await reloadPosts();
        }

        async function renderPeopleTab() {
          peopleTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Cargando miembros...</div>';
          const [membersResult, requestsResult] = await Promise.all([
            SocialAPI.getGroupMembers(groupId),
            groupCanManage() ? SocialAPI.getGroupRequests(groupId) : Promise.resolve({ ok: true, data: [] }),
          ]);

          if (!membersResult?.ok) {
            peopleTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">No se pudo cargar la lista de miembros.</div>';
            return;
          }

          const members = getList(membersResult);
          const requests = getList(requestsResult);
          peopleTab.innerHTML = `
            ${groupCanManage() ? `
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 class="text-lg font-bold text-slate-900 mb-4">Solicitudes pendientes</h2>
                <div id="group-requests-list" class="space-y-3">
                  ${requests.length ? requests.map((request) => `
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <p class="font-semibold text-slate-900">${escapeHtml(displayName(request.user || { full_name: 'Usuario' }))}</p>
                        <p class="text-sm text-slate-500">${escapeHtml(careerLabel(request.user || {}))}</p>
                      </div>
                      <div class="flex gap-2">
                        <button type="button" data-approve-group-request="${request.membership_id}" class="px-4 py-2 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Aprobar</button>
                        <button type="button" data-reject-group-request="${request.membership_id}" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Rechazar</button>
                      </div>
                    </div>
                  `).join('') : '<p class="text-sm text-slate-400">No hay solicitudes pendientes.</p>'}
                </div>
              </div>
            ` : ''}
            <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Miembros</h2>
              <div id="group-members-list" class="space-y-3">
                ${members.map((member) => {
            const isSelf = Number(member.user_id) === Number(user.id);
            const canManageMember = groupCanManage() && member.role !== 'creator' && !isSelf;
            const canChangeRole = (groupData.current_role === 'creator' || isSystemAdmin()) && member.role !== 'creator' && !isSelf;
            const roleLabel = member.role === 'creator'
              ? 'Creador'
              : member.role === 'admin'
                ? 'Administrador'
                : 'Miembro';
            return `
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                      <div class="flex items-center gap-3">
                        ${renderAvatar(member.user || {}, { sizeClass: 'w-11 h-11', textClass: 'text-white font-bold text-sm' })}
                        <div>
                          <p class="font-semibold text-slate-900">${escapeHtml(displayName(member.user || { full_name: 'Usuario' }))}</p>
                          <p class="text-sm text-slate-500">${escapeHtml(careerLabel(member.user || {}))}</p>
                        </div>
                      </div>
                      <div class="flex flex-wrap items-center justify-start md:justify-end gap-2 md:max-w-[24rem] md:min-w-[18rem]">
                        <span class="inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap ${member.role === 'creator' ? 'bg-sky-50 text-sky-700 border border-sky-200' : member.role === 'admin' ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${escapeHtml(roleLabel)}</span>
                        ${canChangeRole ? `
                          <select data-group-role-user="${member.user_id}" class="min-w-[8.75rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:border-[#1B2A6B] focus:outline-none focus:ring-2 focus:ring-[#1B2A6B]/10">
                            <option value="member" ${member.role === 'member' ? 'selected' : ''}>Miembro</option>
                            <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Administrador</option>
                          </select>
                        ` : ''}
                        ${canManageMember ? `
                          <button type="button" data-remove-group-member="${member.user_id}" class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-white text-red-600 text-sm font-semibold shadow-sm hover:bg-red-50 transition-colors whitespace-nowrap">
                            <span class="material-symbols-outlined text-[18px] leading-none">person_remove</span>
                            <span>Expulsar</span>
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  `;
          }).join('')}
              </div>
            </div>
          `;

          peopleTab.addEventListener('click', async (event) => {
            const approveButton = event.target.closest('[data-approve-group-request]');
            if (approveButton) {
              const result = await SocialAPI.approveGroupRequest(groupId, approveButton.dataset.approveGroupRequest);
              if (result?.ok) {
                showToast('Solicitud aprobada', 'success');
                await loadGroup();
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo aprobar la solicitud', 'error');
              return;
            }

            const rejectButton = event.target.closest('[data-reject-group-request]');
            if (rejectButton) {
              const result = await SocialAPI.rejectGroupRequest(groupId, rejectButton.dataset.rejectGroupRequest);
              if (result?.ok) {
                showToast('Solicitud rechazada', 'success');
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo rechazar la solicitud', 'error');
              return;
            }

            const removeButton = event.target.closest('[data-remove-group-member]');
            if (removeButton) {
              const confirmed = await confirmAction({
                title: 'Expulsar miembro',
                copy: 'La persona sera retirada del grupo y tendra que volver a solicitar acceso si quiere regresar.',
                acceptLabel: 'Expulsar',
                tone: 'danger',
              });
              if (!confirmed) return;
              const result = await SocialAPI.removeGroupMember(groupId, removeButton.dataset.removeGroupMember);
              if (result?.ok) {
                showToast('Miembro expulsado', 'success');
                await loadGroup();
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo expulsar al miembro', 'error');
            }
          }, { once: true });

          peopleTab.querySelectorAll('[data-group-role-user]').forEach((select) => {
            select.addEventListener('change', async () => {
              const result = await SocialAPI.updateGroupMemberRole(groupId, select.dataset.groupRoleUser, select.value);
              if (result?.ok) {
                showToast('Rol actualizado', 'success');
                await loadGroup();
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo actualizar el rol', 'error');
            });
          });
        }

        async function renderMediaTab() {
          mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Cargando multimedia...</div>';
          if (!groupData?.can_view_conversation) {
            mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Debes pertenecer al grupo para ver su multimedia.</div>';
            return;
          }

          const result = await PostsAPI.getGroupMedia(groupId);
          if (!result?.ok) {
            mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">No se pudo cargar la multimedia.</div>';
            return;
          }

          const posts = getList(result);
          if (!posts.length) {
            mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Todavia no hay multimedia en este grupo.</div>';
            return;
          }

          mediaTab.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              ${posts.map((post) => `
                <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div class="h-52 bg-slate-100">
                    ${hasPostVideo(post)
                      ? `<video src="${safeUrl(post.video_url)}" class="w-full h-full object-contain bg-slate-950" playsinline controls preload="metadata"></video>`
                      : `<img src="${safeUrl(post.image_url)}" alt="Imagen publicada en el grupo" loading="lazy" decoding="async" class="w-full h-full object-cover"/>`}
                  </div>
                  <div class="p-4">
                    <p class="font-semibold text-slate-900 text-sm">${escapeHtml(displayName(resolveProfileData({
            id: post.user_id,
            user_name: post.user_name,
            user_faculty: post.user_faculty,
            user_school: post.user_school,
            user_avatar: post.user_avatar,
          })))}</p>
                    <p class="text-xs text-slate-500 mt-1">${escapeHtml(timeAgo(post.created_at))}</p>
                    ${post.content ? `<p class="text-sm text-slate-600 mt-3 leading-6">${escapeHtml(post.content.slice(0, 120))}</p>` : ''}
                  </div>
                </article>
              `).join('')}
            </div>
          `;
        }

        async function loadGroup() {
          const result = await SocialAPI.getGroup(groupId);
          if (!result?.ok) {
            container.innerHTML = `
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <p class="text-slate-500 text-sm">No se pudo cargar el grupo.</p>
              </div>
            `;
            return false;
          }

          groupData = result.data;
          renderHeader();
          renderInfoTab();
          return true;
        }

        async function ensureGroupPostAvailable(postId) {
          const numericPostId = Number(postId);
          if (!Number.isFinite(numericPostId) || numericPostId <= 0) {
            return null;
          }

          const existing = findGroupPost(numericPostId);
          if (existing) {
            return existing;
          }

          const result = await PostsAPI.getPost(numericPostId);
          if (!result?.ok || !result.data) {
            return null;
          }

          groupPosts = [result.data, ...groupPosts.filter((post) => Number(post.id) !== numericPostId)];
          return result.data;
        }

        async function maybeOpenGroupRoutePost() {
          const routePostId = Number(params?.post || 0);
          if (!Number.isFinite(routePostId) || routePostId <= 0) {
            return;
          }

          setTab('conversation');
          await loadConversation();
          const post = await ensureGroupPostAvailable(routePostId);
          if (!post) {
            return;
          }

          openCommentModal(routePostId);
        }

        actionsWrap.addEventListener('click', async (event) => {
          const joinButton = event.target.closest('[data-join-group]');
          if (joinButton) {
            const result = await SocialAPI.joinGroup(groupId);
            if (result?.ok) {
              showToast(result.data?.message || 'Operacion completada', 'success');
              await loadGroup();
              if (currentTab === 'conversation') await loadConversation();
              if (currentTab === 'people') await renderPeopleTab();
              if (currentTab === 'media') await renderMediaTab();
              return;
            }
            showToast(result?.data?.error || 'No se pudo procesar la solicitud', 'error');
            return;
          }

          const leaveButton = event.target.closest('[data-leave-group]');
          if (leaveButton) {
            const confirmed = await confirmAction({
              title: 'Salir del grupo',
              copy: 'Perderas acceso al contenido privado y a tu participacion actual en este grupo.',
              acceptLabel: 'Salir',
              tone: 'danger',
            });
            if (!confirmed) return;
            const result = await SocialAPI.leaveGroup(groupId);
            if (result?.ok) {
              showToast('Saliste del grupo', 'success');
              await loadGroup();
              setTab('info');
              return;
            }
            showToast(result?.data?.error || 'No se pudo salir del grupo', 'error');
            return;
          }

          const editButton = event.target.closest('[data-edit-group]');
          if (editButton) {
            openEditModal();
          }
        });

        tabButtons.forEach((button) => {
          button.addEventListener('click', async () => {
            setTab(button.dataset.groupTab);
            if (currentTab === 'conversation') await loadConversation();
            if (currentTab === 'people') await renderPeopleTab();
            if (currentTab === 'media') await renderMediaTab();
          });
        });

        pickEditCoverButton.addEventListener('click', () => editCoverInput.click());
        clearEditCoverButton.addEventListener('click', () => {
          selectedEditCoverFile = null;
          editCoverInput.value = '';
          updateEditCoverPreview(null);
        });
        editCoverInput.addEventListener('change', async (event) => {
          const [file] = event.target.files || [];
          if (!file) return;
          try {
            await openEditCropModal(file);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
            closeEditCropModal(true);
          }
        });
        editCropZoom.addEventListener('input', (event) => {
          setEditCropZoom(Number(event.target.value) / 100);
        });
        editCropCancelButton.addEventListener('click', () => closeEditCropModal(true));
        editCropCloseButton.addEventListener('click', () => closeEditCropModal(true));
        editCropModal.addEventListener('click', (event) => {
          if (event.target === editCropModal) closeEditCropModal(true);
        });
        editCropStage.addEventListener('pointerdown', (event) => {
          if (!editCropState.image || editCropState.saving) return;
          editCropState.pointerId = event.pointerId;
          editCropState.dragStartX = event.clientX;
          editCropState.dragStartY = event.clientY;
          editCropState.dragOffsetX = editCropState.offsetX;
          editCropState.dragOffsetY = editCropState.offsetY;
          editCropStage.setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        editCropStage.addEventListener('pointermove', (event) => {
          if (editCropState.pointerId !== event.pointerId) return;
          editCropState.offsetX = editCropState.dragOffsetX + (event.clientX - editCropState.dragStartX);
          editCropState.offsetY = editCropState.dragOffsetY + (event.clientY - editCropState.dragStartY);
          renderEditCropStage();
          event.preventDefault();
        });
        const stopEditCropDrag = (event) => {
          if (editCropState.pointerId === null) return;
          if (event && editCropState.pointerId !== event.pointerId) return;
          if (event && editCropStage.hasPointerCapture(event.pointerId)) {
            editCropStage.releasePointerCapture(event.pointerId);
          }
          editCropState.pointerId = null;
        };
        editCropStage.addEventListener('pointerup', stopEditCropDrag);
        editCropStage.addEventListener('pointercancel', stopEditCropDrag);
        editCropStage.addEventListener('lostpointercapture', () => {
          editCropState.pointerId = null;
        });
        editCropSaveButton.addEventListener('click', async () => {
          if (!editCropState.image || editCropState.saving) return;
          editCropState.saving = true;
          editCropSaveButton.disabled = true;
          editCropSaveButton.textContent = 'Preparando...';
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1600;
            canvas.height = 500;
            const context = canvas.getContext('2d');
            const sourceX = Math.max(0, -editCropState.offsetX / editCropState.scale);
            const sourceY = Math.max(0, -editCropState.offsetY / editCropState.scale);
            const sourceWidth = Math.min(editCropState.naturalWidth, editCropState.viewportWidth / editCropState.scale);
            const sourceHeight = Math.min(editCropState.naturalHeight, editCropState.viewportHeight / editCropState.scale);
            context.drawImage(editCropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) throw new Error('No se pudo preparar la portada');
            selectedEditCoverFile = new File([blob], `group-cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
            updateEditCoverPreview(selectedEditCoverFile);
            closeEditCropModal(false);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
          } finally {
            editCropState.saving = false;
            editCropSaveButton.disabled = false;
            editCropSaveButton.textContent = 'Usar portada';
          }
        });

        const closeEditModalIfBackdrop = (event) => {
          if (event.target === editModal) closeEditModal();
        };
        editModal.addEventListener('click', closeEditModalIfBackdrop);
        closeEditModalButton.addEventListener('click', closeEditModal);
        cancelEditModalButton.addEventListener('click', closeEditModal);
        editForm.addEventListener('submit', async (submitEvent) => {
          submitEvent.preventDefault();
          const editPostsLockedInput = container.querySelector('#edit-group-posts-locked');
          saveEditModalButton.disabled = true;
          saveEditModalButton.textContent = 'Guardando...';
          const result = await SocialAPI.updateGroup(groupId, {
            name: editNameInput.value.trim(),
            description: editDescriptionInput.value.trim(),
            privacy: editPrivacyInput.value,
            postsLocked: !!editPostsLockedInput?.checked,
            coverFile: selectedEditCoverFile,
          });
          saveEditModalButton.disabled = false;
          saveEditModalButton.textContent = 'Guardar cambios';
          if (result?.ok) {
            showToast('Grupo actualizado', 'success');
            await loadGroup();
            if (currentTab === 'people') await renderPeopleTab();
            if (currentTab === 'media') await renderMediaTab();
            closeEditModal();
            return;
          }
          showToast(result?.data?.error || 'No se pudo actualizar el grupo', 'error');
        });

        commentModal.addEventListener('click', (event) => {
          if (event.target === commentModal) closeCommentModal();
        });
        container.querySelector('#group-close-comment-top-btn').addEventListener('click', closeCommentModal);
        commentSort.addEventListener('change', () => {
          syncCommentSortChips(commentSort.value);
          loadComments(pendingCommentPostId, commentSort.value);
        });
        commentPostPreview.addEventListener('click', async (event) => {
          const actionTarget = event.target.closest('[data-action]');
          if (!actionTarget) return;
          if (await handleSharePublicPostAction(actionTarget)) return;

          if (actionTarget.dataset.action === 'open-profile') {
            router.navigate('profile', { id: actionTarget.dataset.userId });
            return;
          }

          if (actionTarget.dataset.action === 'open-post-image') {
            openPostImageLightbox(actionTarget.dataset.imageUrl, actionTarget.dataset.imageAlt || 'Imagen ampliada de la publicacion');
            return;
          }

          if (actionTarget.dataset.action === 'report-post') {
            await reportContent('publicacion', Number(actionTarget.dataset.postId));
            return;
          }

          if (actionTarget.dataset.action === 'open-reaction-picker') {
            openReactionPicker(actionTarget, {
              targetType: 'post',
              targetId: Number(actionTarget.dataset.targetId),
              currentReaction: actionTarget.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                const result = await PostsAPI.reactPost(Number(actionTarget.dataset.targetId), reaction);
                if (result?.ok) {
                  await loadConversation();
                  if (pendingCommentPostId) {
                    commentPostPreview.innerHTML = renderPostModalPreview(findGroupPost(pendingCommentPostId), user.id, { hideGroupBadge: true });
                  }
                  return;
                }
                showToast(result?.data?.error || 'No se pudo reaccionar a la publicacion', 'error');
              },
            });
          }
        });
        container.querySelector('#group-confirm-comment-btn').addEventListener('click', async () => {
          const content = commentInput.value.trim();
          const mentionUserIds = groupCommentMentionController?.collectMentionUserIds?.() || [];
          if (!pendingCommentPostId || !content) return;

          const result = await PostsAPI.addComment(pendingCommentPostId, content, mentionUserIds);
          if (result?.ok) {
            commentInput.value = '';
            groupCommentMentionController?.clear();
            await loadComments(pendingCommentPostId, currentCommentSort);
            await loadConversation();
            return;
          }
          showToast(result?.data?.error || 'No se pudo comentar', 'error');
        });

        commentList.addEventListener('click', async (event) => {
          const profileButton = event.target.closest('[data-action="open-profile"]');
          if (profileButton) {
            event.preventDefault();
            router.navigate('profile', { id: profileButton.dataset.userId });
            return;
          }

          const deleteButton = event.target.closest('[data-action="group-delete-comment"]');
          if (deleteButton) {
            const result = await PostsAPI.deleteComment(null, deleteButton.dataset.commentId);
            if (result?.ok) {
              showToast('Comentario eliminado', 'success');
              await loadComments(pendingCommentPostId, currentCommentSort);
              await loadConversation();
              return;
            }
            showToast(result?.data?.error || 'No se pudo eliminar el comentario', 'error');
            return;
          }

          const reportButton = event.target.closest('[data-action="report-comment"]');
          if (reportButton) {
            const result = await PostsAPI.reportComment(reportButton.dataset.commentId);
            showToast(result?.ok ? 'Comentario reportado' : (result?.data?.error || 'No se pudo reportar'), result?.ok ? 'success' : 'error');
            return;
          }

          const pickerButton = event.target.closest('[data-action="open-reaction-picker"]');
          if (pickerButton) {
            openReactionPicker(pickerButton, {
              targetType: 'comment',
              targetId: Number(pickerButton.dataset.targetId),
              currentReaction: pickerButton.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                const result = await PostsAPI.reactComment(Number(pickerButton.dataset.targetId), reaction);
                if (result?.ok) {
                  await loadComments(pendingCommentPostId, currentCommentSort);
                  await loadConversation();
                } else {
                  showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
                }
              },
            });
            return;
          }

          const reactionButton = event.target.closest('[data-action="react-comment"]');
          if (reactionButton) {
            const result = await PostsAPI.reactComment(reactionButton.dataset.commentId, reactionButton.dataset.reaction);
            if (result?.ok) {
              await loadComments(pendingCommentPostId, currentCommentSort);
              await loadConversation();
            } else {
              showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
            }
          }
        });

        return (async () => {
          const ok = await loadGroup();
          if (!ok) return null;
          if (params?.post) {
            await maybeOpenGroupRoutePost();
          } else {
            setTab('info');
            renderInfoTab();
          }
          return () => {
            groupPostMentionController?.destroy();
            groupCommentMentionController?.destroy();
          };
        })();
      },
    },
    profile: {
      title: 'Perfil',
      activeNav: 'profile',
      templatePath: '/pages/profile.html',
      templateSlots() {
        const profileCycleOptions = Array.from({ length: 10 }, (_, index) => index + 1).map((value) => `
          <option value="${value}">${value}vo ciclo</option>
        `).join('');

        return {
          profileCycleOptions,
          profilePostsSkeleton: renderListSkeleton(2, { lines: ['100%', '92%', '54%'], avatar: true, media: true }),
        };
      },
      mount({ container, user, params, router }) {
        const bannerView = container.querySelector('#profile-banner-view');
        const avatarView = container.querySelector('#profile-avatar-view');
        const profileName = container.querySelector('#profile-name');
        const profileCareer = container.querySelector('#profile-career');
        const profileBadges = container.querySelector('#profile-badges');
        const profileActions = container.querySelector('#profile-actions');
        const profileCode = container.querySelector('#profile-code');
        const profileEmail = container.querySelector('#profile-email');
        const profileCycle = container.querySelector('#profile-cycle');
        const profileBio = container.querySelector('#profile-bio');
        const postsList = container.querySelector('#profile-posts-list');
        const profileCommentModal = container.querySelector('#profile-comment-modal');
        const profileCommentPostPreview = container.querySelector('#profile-comment-post-preview');
        const profileCommentList = container.querySelector('#profile-comment-list');
        const profileCommentSort = container.querySelector('#profile-comment-sort');
        const profileCommentInput = container.querySelector('#profile-comment-input');
        const syncProfileCommentSortChips = bindCommentSortChips(profileCommentModal, profileCommentSort, (value) => {
          if (!pendingProfileCommentId) return;
          loadProfileComments(pendingProfileCommentId, value);
        });
        const profileBioActionButton = container.querySelector('#profile-bio-action-btn');
        const profileBioActionIcon = container.querySelector('#profile-bio-action-icon');
        const profileBioActionLabel = container.querySelector('#profile-bio-action-label');
        const profileBioCancelButton = container.querySelector('#profile-bio-cancel-btn');
        const changeAvatarButton = container.querySelector('#change-avatar-btn');
        const changeBannerButton = container.querySelector('#change-banner-btn');
        const avatarInput = container.querySelector('#avatar-input');
        const bannerInput = container.querySelector('#banner-input');
        const mediaCropModal = container.querySelector('#media-crop-modal');
        const mediaCropTitle = container.querySelector('#media-crop-title');
        const mediaCropImage = container.querySelector('#media-crop-image');
        const mediaCropStage = container.querySelector('#media-crop-stage');
        const mediaCropHelp = container.querySelector('#media-crop-help');
        const mediaCropZoom = container.querySelector('#media-crop-zoom');
        const mediaCropZoomLabel = container.querySelector('#media-crop-zoom-label');
        const mediaCropPreviewAvatar = container.querySelector('#media-crop-preview-avatar');
        const mediaCropPreviewBanner = container.querySelector('#media-crop-preview-banner');
        const mediaCropSaveButton = container.querySelector('#media-crop-save-btn');
        const mediaCropResetButton = container.querySelector('#media-crop-reset-btn');
        const mediaCropCancelButton = container.querySelector('#media-crop-cancel-btn');
        const mediaCropCloseButton = container.querySelector('#media-crop-close-btn');
        const profileCommentMentionController = createMentionAutocomplete(profileCommentInput);

        let profileData = null;
        let incomingRequestId = null;
        let isOwnProfile = false;
        let originalBio = '';
        let profilePosts = [];
        let pendingProfileCommentId = null;
        let currentProfileCommentSort = 'newest';
        let profileRelationshipPollTimer = null;
        let profileLoadToken = 0;
        const sentFriendRequestStorageKey = `upt.sentFriendRequests.${appState.user?.id || user?.id || 'local'}`;
        const sentFriendRequestProfileIds = new Set((() => {
          try {
            return JSON.parse(sessionStorage.getItem(sentFriendRequestStorageKey) || '[]')
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value));
          } catch {
            return [];
          }
        })());
        const PROFILE_RELATIONSHIP_POLL_INTERVAL_MS = 2000;
        const cropConfigs = {
          avatar: {
            field: 'avatar',
            title: 'Ajustar foto de perfil',
            help: 'Arrastra la imagen para elegir la zona visible. La vista previa circular muestra como se vera tu foto.',
            previewCanvas: mediaCropPreviewAvatar,
            outputWidth: 640,
            outputHeight: 640,
            previewWidth: 240,
            previewHeight: 240,
            mimeType: 'image/png',
          },
          banner: {
            field: 'banner',
            title: 'Ajustar portada',
            help: 'Mueve la imagen para centrar el encuadre y usa el zoom para destacar la parte rectangular que quieras mostrar.',
            previewCanvas: mediaCropPreviewBanner,
            outputWidth: 1600,
            outputHeight: 500,
            previewWidth: 640,
            previewHeight: 200,
            mimeType: 'image/jpeg',
          },
        };
        const cropState = {
          mode: null,
          file: null,
          objectUrl: '',
          image: null,
          naturalWidth: 0,
          naturalHeight: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          minScale: 1,
          scale: 1,
          zoom: 1,
          maxZoom: 4,
          offsetX: 0,
          offsetY: 0,
          dragStartX: 0,
          dragStartY: 0,
          dragOffsetX: 0,
          dragOffsetY: 0,
          pointerId: null,
          saving: false,
        };

        function placeCaretAtEnd(element) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        function getBioDraft() {
          return profileBio.textContent.replace(/\u00A0/g, ' ').trim();
        }

        function setBioContent(value) {
          const text = String(value || '');
          profileBio.textContent = text;
          profileBio.dataset.empty = text.trim() ? 'false' : 'true';
        }

        function bioChanged() {
          return getBioDraft() !== originalBio;
        }

        function updateBioEditorState() {
          profileBio.dataset.empty = getBioDraft() ? 'false' : 'true';
          profileBio.classList.toggle('is-own', isOwnProfile);
          profileBio.setAttribute('contenteditable', isOwnProfile ? 'true' : 'false');

          profileBioActionButton.classList.toggle('hidden', !isOwnProfile);
          profileBioActionButton.classList.toggle('inline-flex', isOwnProfile);

          const changed = isOwnProfile && bioChanged();
          profileBioCancelButton.classList.toggle('hidden', !changed);
          profileBioCancelButton.classList.toggle('inline-flex', changed);
          profileBioActionIcon.textContent = changed ? 'save' : 'edit';
          profileBioActionLabel.textContent = changed ? 'Guardar' : 'Editar';
        }

        async function saveBio() {
          if (!profileData || !isOwnProfile || !bioChanged()) {
            profileBio.focus();
            placeCaretAtEnd(profileBio);
            return;
          }

          const result = await AuthAPI.updateProfile({ bio: getBioDraft() });
          if (result?.ok) {
            syncCurrentUser(result.data);
            showToast('Biografia actualizada', 'success');
            await loadProfile();
            return;
          }

          showToast(result?.data?.error || 'No se pudo guardar la biografia', 'error');
        }

        function getCropConfig(mode = cropState.mode) {
          return mode ? cropConfigs[mode] : null;
        }

        function clearCropInput(mode = cropState.mode) {
          if (mode === 'avatar') avatarInput.value = '';
          if (mode === 'banner') bannerInput.value = '';
        }

        function releaseCropObjectUrl() {
          if (!cropState.objectUrl) return;
          URL.revokeObjectURL(cropState.objectUrl);
          cropState.objectUrl = '';
        }

        function resetCropTransientState() {
          cropState.pointerId = null;
          cropState.saving = false;
          mediaCropStage.classList.remove('is-dragging');
        }

        function closeCropModal(options = {}) {
          const clearInput = options.clearInput !== false;
          const modeToClear = options.mode || cropState.mode;

          mediaCropModal.classList.add('hidden');
          mediaCropModal.classList.remove('flex');
          mediaCropPreviewAvatar.classList.toggle('hidden', false);
          mediaCropPreviewBanner.classList.toggle('hidden', true);
          mediaCropStage.classList.remove('is-avatar', 'is-banner', 'is-dragging');
          mediaCropImage.removeAttribute('src');
          mediaCropZoom.value = '100';
          mediaCropZoomLabel.textContent = '100%';
          mediaCropSaveButton.disabled = false;
          mediaCropSaveButton.textContent = 'Guardar';

          releaseCropObjectUrl();
          resetCropTransientState();

          cropState.mode = null;
          cropState.file = null;
          cropState.image = null;
          cropState.naturalWidth = 0;
          cropState.naturalHeight = 0;
          cropState.viewportWidth = 0;
          cropState.viewportHeight = 0;
          cropState.minScale = 1;
          cropState.scale = 1;
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          cropState.offsetX = 0;
          cropState.offsetY = 0;

          if (clearInput) clearCropInput(modeToClear);
        }

        function clampCropAxis(offset, viewportSize, scaledSize) {
          if (scaledSize <= viewportSize) {
            return (viewportSize - scaledSize) / 2;
          }

          const minOffset = viewportSize - scaledSize;
          const maxOffset = 0;
          return Math.min(maxOffset, Math.max(minOffset, offset));
        }

        function clampCropOffsets() {
          const scaledWidth = cropState.naturalWidth * cropState.scale;
          const scaledHeight = cropState.naturalHeight * cropState.scale;
          cropState.offsetX = clampCropAxis(cropState.offsetX, cropState.viewportWidth, scaledWidth);
          cropState.offsetY = clampCropAxis(cropState.offsetY, cropState.viewportHeight, scaledHeight);
        }

        function getCropSourceRect() {
          const scale = cropState.scale || 1;
          const sourceX = Math.max(0, -cropState.offsetX / scale);
          const sourceY = Math.max(0, -cropState.offsetY / scale);
          const sourceWidth = Math.min(cropState.naturalWidth, cropState.viewportWidth / scale);
          const sourceHeight = Math.min(cropState.naturalHeight, cropState.viewportHeight / scale);

          return { sourceX, sourceY, sourceWidth, sourceHeight };
        }

        function drawCropToCanvas(canvas) {
          const context = canvas.getContext('2d');
          if (!context || !cropState.image) return;

          const { sourceX, sourceY, sourceWidth, sourceHeight } = getCropSourceRect();
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            cropState.image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width,
            canvas.height
          );
        }

        function drawCropPreview() {
          const config = getCropConfig();
          if (!config?.previewCanvas || !cropState.image) return;

          config.previewCanvas.width = config.previewWidth;
          config.previewCanvas.height = config.previewHeight;
          drawCropToCanvas(config.previewCanvas);
        }

        function renderCropStage() {
          if (!cropState.image) return;

          clampCropOffsets();
          mediaCropImage.style.width = `${cropState.naturalWidth * cropState.scale}px`;
          mediaCropImage.style.height = `${cropState.naturalHeight * cropState.scale}px`;
          mediaCropImage.style.transform = `translate3d(${cropState.offsetX}px, ${cropState.offsetY}px, 0)`;
          mediaCropZoomLabel.textContent = `${Math.round(cropState.zoom * 100)}%`;
          drawCropPreview();
        }

        function centerCropImage() {
          cropState.scale = cropState.minScale * cropState.zoom;
          cropState.offsetX = (cropState.viewportWidth - cropState.naturalWidth * cropState.scale) / 2;
          cropState.offsetY = (cropState.viewportHeight - cropState.naturalHeight * cropState.scale) / 2;
        }

        function initializeCropViewport() {
          if (!cropState.image) return false;

          const rect = mediaCropStage.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;

          cropState.viewportWidth = rect.width;
          cropState.viewportHeight = rect.height;
          cropState.minScale = Math.max(
            cropState.viewportWidth / cropState.naturalWidth,
            cropState.viewportHeight / cropState.naturalHeight
          );
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          centerCropImage();
          mediaCropZoom.min = '100';
          mediaCropZoom.max = `${Math.round(cropState.maxZoom * 100)}`;
          mediaCropZoom.value = '100';
          renderCropStage();
          return true;
        }

        function setCropZoom(nextZoom) {
          if (!cropState.image) return;

          const boundedZoom = Math.min(cropState.maxZoom, Math.max(1, nextZoom));
          const previousScale = cropState.scale || cropState.minScale;
          const focusX = cropState.viewportWidth / 2;
          const focusY = cropState.viewportHeight / 2;
          const imageFocusX = (focusX - cropState.offsetX) / previousScale;
          const imageFocusY = (focusY - cropState.offsetY) / previousScale;

          cropState.zoom = boundedZoom;
          cropState.scale = cropState.minScale * cropState.zoom;
          cropState.offsetX = focusX - imageFocusX * cropState.scale;
          cropState.offsetY = focusY - imageFocusY * cropState.scale;
          mediaCropZoom.value = `${Math.round(cropState.zoom * 100)}`;
          renderCropStage();
        }

        async function loadImageForCrop() {
          return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
            image.src = cropState.objectUrl;
          });
        }

        async function openCropModal(mode, file) {
          if (!isOwnProfile) {
            showToast('Solo puedes editar tu propio perfil', 'error');
            clearCropInput(mode);
            return;
          }
          if (!file) return;
          const validation = validateSupportedImageFile(file, mode === 'avatar' ? 'foto de perfil' : 'portada');
          if (!validation.ok) {
            showToast(validation.error, 'error');
            clearCropInput(mode);
            return;
          }

          const config = getCropConfig(mode);
          if (!config) return;

          closeCropModal({ clearInput: false, mode });

          cropState.mode = mode;
          cropState.file = file;
          cropState.objectUrl = URL.createObjectURL(file);

          try {
            cropState.image = await loadImageForCrop();
          } catch (error) {
            releaseCropObjectUrl();
            showToast(error.message || 'No se pudo preparar la imagen. Usa JPG, PNG, GIF o WEBP.', 'error');
            clearCropInput(mode);
            return;
          }

          cropState.naturalWidth = cropState.image.naturalWidth;
          cropState.naturalHeight = cropState.image.naturalHeight;
          mediaCropTitle.textContent = config.title;
          mediaCropHelp.textContent = config.help;
          mediaCropStage.classList.toggle('is-avatar', mode === 'avatar');
          mediaCropStage.classList.toggle('is-banner', mode === 'banner');
          mediaCropPreviewAvatar.classList.toggle('hidden', mode !== 'avatar');
          mediaCropPreviewBanner.classList.toggle('hidden', mode !== 'banner');
          mediaCropImage.src = cropState.objectUrl;
          mediaCropModal.classList.remove('hidden');
          mediaCropModal.classList.add('flex');

          requestAnimationFrame(() => {
            if (!initializeCropViewport()) {
              setTimeout(() => initializeCropViewport(), 40);
            }
          });
        }

        async function uploadMedia(field, file) {
          if (!isOwnProfile) {
            showToast('Solo puedes editar tu propio perfil', 'error');
            return false;
          }
          if (!file) return false;
          const formData = new FormData();
          formData.append(field, file);

          const result = await AuthAPI.updateProfile(formData);
          if (result?.ok) {
            syncCurrentUser(result.data);
            await ensurePublicUsersLoaded(true);
            showToast(field === 'avatar' ? 'Avatar actualizado' : 'Portada actualizada', 'success');
            await loadProfile();
            if (field === 'avatar') avatarInput.value = '';
            if (field === 'banner') bannerInput.value = '';
            return true;
          }

          showToast(result?.data?.error || 'No se pudo actualizar el perfil', 'error');
          return false;
        }

        async function saveCroppedMedia() {
          const config = getCropConfig();
          if (!config || !cropState.image || cropState.saving) return;

          cropState.saving = true;
          mediaCropSaveButton.disabled = true;
          mediaCropSaveButton.textContent = 'Guardando...';

          try {
            const canvas = document.createElement('canvas');
            canvas.width = config.outputWidth;
            canvas.height = config.outputHeight;
            drawCropToCanvas(canvas);

            const mimeType = config.mimeType;
            const extension = mimeType === 'image/png' ? 'png' : 'jpg';
            const blob = await new Promise((resolve, reject) => {
              canvas.toBlob((fileBlob) => {
                if (fileBlob) {
                  resolve(fileBlob);
                  return;
                }
                reject(new Error('No se pudo generar la imagen recortada.'));
              }, mimeType, 0.92);
            });

            const croppedFile = new File([blob], `${config.field}-${Date.now()}.${extension}`, { type: mimeType });
            const uploaded = await uploadMedia(config.field, croppedFile);
            if (uploaded) {
              closeCropModal({ mode: cropState.mode });
            }
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la imagen', 'error');
          } finally {
            cropState.saving = false;
            mediaCropSaveButton.disabled = false;
            mediaCropSaveButton.textContent = 'Guardar';
          }
        }

        function findProfilePost(postId) {
          return profilePosts.find((post) => Number(post.id) === Number(postId)) || null;
        }

        function renderProfileCommentModalPost(postId = pendingProfileCommentId) {
          profileCommentPostPreview.innerHTML = renderPostModalPreview(findProfilePost(postId), user.id);
        }

        function openProfileCommentModal(postId) {
          pendingProfileCommentId = Number(postId);
          profileCommentInput.value = '';
          profileCommentInput.style.height = '';
          profileCommentMentionController.clear();
          profileCommentSort.value = currentProfileCommentSort;
          syncProfileCommentSortChips(currentProfileCommentSort);
          profileCommentModal.classList.remove('hidden');
          profileCommentModal.classList.add('flex');
          renderProfileCommentModalPost(pendingProfileCommentId);
          loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
          setTimeout(() => profileCommentInput.focus(), 60);
          // Re-sync adaptive video heights once modal layout has settled
          setTimeout(() => refreshAdaptiveMediaFrames(), 80);
          setTimeout(() => refreshAdaptiveMediaFrames(), 320);
        }

        function closeProfileCommentModal() {
          pendingProfileCommentId = null;
          profileCommentMentionController.clear();
          profileCommentPostPreview.innerHTML = '';
          profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>';
          profileCommentModal.classList.add('hidden');
          profileCommentModal.classList.remove('flex');
        }

        async function loadProfileComments(postId = pendingProfileCommentId, sort = currentProfileCommentSort) {
          if (!postId) return;

          currentProfileCommentSort = sort;
          profileCommentSort.value = sort;
          syncProfileCommentSortChips(sort);
          profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Cargando comentarios...</p>';

          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          const comments = getList(result);

          if (!result?.ok) {
            profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          if (!comments.length) {
            profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Todavia no hay comentarios en esta publicacion.</p>';
            return;
          }

          profileCommentList.innerHTML = comments.map((comment) => renderCommentCard(comment, {
            deleteAction: (Number(comment.user_id) === Number(user.id) || user?.role === 'admin' || appState.user?.role === 'admin') ? 'profile-delete-comment' : '',
          })).join('');
        }

        async function confirmProfileComment() {
          const content = profileCommentInput.value.trim();
          const mentionUserIds = profileCommentMentionController.collectMentionUserIds();
          if (!pendingProfileCommentId || !content) return;

          const result = await PostsAPI.addComment(pendingProfileCommentId, content, mentionUserIds);
          if (result?.ok) {
            showToast('Comentario anadido', 'success');
            profileCommentInput.value = '';
            profileCommentMentionController.clear();
            await loadPosts(profileData.id);
            await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
            return;
          }

          showToast(result?.data?.error || 'Error al comentar', 'error');
        }

        async function loadPosts(targetUserId) {
          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getFeed();
          if (!result?.ok) {
            postsList.innerHTML = `
              <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 profile-posts-empty flex items-center justify-center">
                <p class="text-gray-500 text-sm">No se pudieron cargar las publicaciones.</p>
              </div>
            `;
            return;
          }

          const posts = getList(result).filter((post) => Number(post.user_id) === Number(targetUserId));
          profilePosts = posts;

          if (!posts.length) {
            postsList.innerHTML = `
              <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 profile-posts-empty flex items-center justify-center">
                <p class="text-gray-500 text-sm">No hay publicaciones todavia.</p>
              </div>
            `;
            return;
          }

          postsList.innerHTML = posts.map((post) => renderPostCard(post, user.id, { canDelete: false })).join('');
          if (pendingProfileCommentId) {
            renderProfileCommentModalPost(pendingProfileCommentId);
          }

          const routePostId = Number(params?.post || 0);
          if (Number.isFinite(routePostId) && routePostId > 0 && Number(params?.id || user.id) === Number(targetUserId)) {
            const selectedPost = findProfilePost(routePostId);
            if (selectedPost && pendingProfileCommentId !== routePostId) {
              openProfileCommentModal(routePostId);
            }
          }
        }

        function stopProfileRelationshipPolling() {
          if (profileRelationshipPollTimer) {
            window.clearInterval(profileRelationshipPollTimer);
            profileRelationshipPollTimer = null;
          }
        }

        function syncProfileRelationshipPolling() {
          stopProfileRelationshipPolling();
          if (!profileData || isOwnProfile) {
            return;
          }

          profileRelationshipPollTimer = window.setInterval(() => {
            if (document.hidden) return;
            loadProfile({ skipPosts: true, silent: true }).catch(() => { });
          }, PROFILE_RELATIONSHIP_POLL_INTERVAL_MS);
        }

        async function loadProfile(options = {}) {
          const {
            skipPosts = false,
            silent = false,
          } = options;
          const targetUserId = params.id ? Number(params.id) : Number(user.id);
          const loadToken = ++profileLoadToken;
          isOwnProfile = Number(targetUserId) === Number(appState.user.id);
          changeAvatarButton.classList.add('hidden');
          changeAvatarButton.classList.remove('inline-flex');
          changeBannerButton.classList.add('hidden');
          changeBannerButton.classList.remove('inline-flex');
          avatarInput.value = '';
          bannerInput.value = '';
          const result = await AuthAPI.getProfile(targetUserId);

          if (!result?.ok) {
            if (silent || loadToken !== profileLoadToken) {
              return;
            }
            appView.innerHTML = `
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <p class="text-slate-500 text-sm">No se pudo cargar el perfil.</p>
              </div>
            `;
            return;
          }

          await ensurePublicUsersLoaded();
          if (loadToken !== profileLoadToken) {
            return;
          }
          profileData = resolveProfileData(result.data);
          if (profileData.id !== null) {
            publicUsersState.map.set(Number(profileData.id), profileData);
          }
          isOwnProfile = Number(profileData.id) === Number(appState.user.id);
          incomingRequestId = null;

          const [friendsResult, pendingResult, blockContextResult, friendshipStatusResult] = isOwnProfile
            ? [null, null, null, null]
            : await Promise.all([
              SocialAPI.getFriends(true),
              SocialAPI.getPendingRequests(),
              SocialAPI.getBlockContext(),
              SocialAPI.getFriendshipStatus(profileData.id),
            ]);

          const friends = friendsResult ? normalizeFriendEntries(getList(friendsResult)) : [];
          const pending = pendingResult ? getList(pendingResult) : [];
          const relationshipStatus = friendshipStatusResult?.ok ? (friendshipStatusResult.data || {}) : null;
          const isFriend = relationshipStatus
            ? Boolean(relationshipStatus.is_friend)
            : friends.some((friend) => Number(friend.id) === Number(profileData.id));
          const blockedIds = blockContextResult?.ok && Array.isArray(blockContextResult.data?.blocked_ids)
            ? blockContextResult.data.blocked_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : [];
          const hiddenIds = blockContextResult?.ok && Array.isArray(blockContextResult.data?.hidden_user_ids)
            ? blockContextResult.data.hidden_user_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : [];
          const isBlockedByMe = blockedIds.includes(Number(profileData.id));
          const isBlockedByOther = hiddenIds.includes(Number(profileData.id)) && !isBlockedByMe;
          const incoming = findIncomingRequest(pending, profileData.id);
          if (relationshipStatus && Number.isFinite(Number(relationshipStatus.incoming_request_id))) {
            incomingRequestId = Number(relationshipStatus.incoming_request_id);
          } else if (incoming) {
            incomingRequestId = incoming.id;
          }
          const outgoingRequestPending = relationshipStatus
            ? Boolean(relationshipStatus.outgoing_request_pending)
            : sentFriendRequestProfileIds.has(Number(profileData.id));
          if (isFriend) {
            forgetSentFriendRequest(profileData.id);
          } else if (!outgoingRequestPending) {
            forgetSentFriendRequest(profileData.id);
          }

          const color = userColor(profileData);
          setBackgroundMedia(bannerView, profileData.banner_url, color);
          setAvatarElement(avatarView, profileData);
          avatarView.style.backgroundColor = color;
          profileName.textContent = displayName(profileData);
          profileCareer.textContent = careerLabel(profileData) || 'Sin informacion academica registrada';
          profileCode.textContent = profileData.student_code || 'No registrado';
          profileEmail.textContent = profileData.email || 'No registrado';
          profileCycle.textContent = cycleLabel(profileData.academic_cycle, true) || 'No registrado';
          setDocumentTitle(isOwnProfile ? 'Mi perfil' : displayName(profileData));

          originalBio = String(profileData.bio || '').trim();
          if (isOwnProfile) {
            setBioContent(profileData.bio || '');
            profileBio.dataset.placeholder = 'Cuentanos algo de ti';
          } else {
            setBioContent(profileData.bio || 'Este usuario aun no agrego una biografia.');
            profileBio.dataset.placeholder = 'Este usuario aun no agrego una biografia.';
          }

          profileBadges.innerHTML = `
            <span class="text-white text-xs font-semibold px-3 py-1.5 rounded-full" style="background:${color}">
              ${escapeHtml(profileData.faculty || 'UPT')}
            </span>
            ${profileData.academic_cycle ? `
              <span class="bg-white text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[14px]">calendar_month</span>
                ${escapeHtml(cycleLabel(profileData.academic_cycle, true))}
              </span>
            ` : ''}
            ${profileData.user_type ? `
              <span class="bg-white text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 flex items-center gap-1.5">
                ${escapeHtml(getUserTypeLabel(profileData.user_type))}
              </span>
            ` : ''}
          `;

          changeAvatarButton.classList.toggle('hidden', !isOwnProfile);
          changeAvatarButton.classList.toggle('inline-flex', isOwnProfile);
          changeBannerButton.classList.toggle('hidden', !isOwnProfile);
          changeBannerButton.classList.toggle('inline-flex', isOwnProfile);
          updateBioEditorState();
          syncProfileRelationshipPolling();

          if (isOwnProfile) {
            profileActions.innerHTML = '';
          } else if (isBlockedByOther) {
            profileActions.innerHTML = `
              <div class="bg-slate-100 text-slate-600 font-medium text-sm px-5 py-2.5 rounded-lg border border-slate-200">
                Este usuario no esta disponible
              </div>
            `;
          } else if (isBlockedByMe) {
            profileActions.innerHTML = `
              <button type="button" data-profile-action="unblock-user" class="bg-white border border-slate-200 text-slate-700 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-slate-50">
                <span class="material-symbols-outlined text-[20px]">undo</span>
                Desbloquear
              </button>
            `;
          } else if (isFriend) {
            profileActions.innerHTML = `
                <button type="button" disabled class="bg-[#1B2A6B] text-white font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm flex items-center gap-2 cursor-not-allowed opacity-95">
                <span class="material-symbols-outlined text-[20px]">group</span>
                Ya son amigos
              </button>
                <button type="button" data-profile-action="message" class="bg-white border border-slate-200 text-slate-700 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-slate-50">
                  <span class="material-symbols-outlined text-[20px]">chat</span>
                  Mensaje
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
          } else if (incomingRequestId) {
            profileActions.innerHTML = `
                <button type="button" data-profile-action="accept-request" class="bg-[#1B2A6B] hover:bg-[#152259] text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">how_to_reg</span>
                  Aceptar solicitud
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
          } else if (outgoingRequestPending) {
            profileActions.innerHTML = `
                <button type="button" data-profile-action="request-sent" disabled class="bg-[#D4A017] text-black/80 font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm flex items-center gap-2 cursor-not-allowed opacity-80">
                  <span class="material-symbols-outlined text-[20px]">hourglass_empty</span>
                  Solicitud enviada
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
          } else {
            profileActions.innerHTML = `
                <button type="button" data-profile-action="send-request" class="bg-[#D4A017] hover:bg-[#C19015] text-black font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">person_add</span>
                  Enviar solicitud
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
          }

          if (!skipPosts) {
            await loadPosts(profileData.id);
          }
        }

        function handleProfileFriendshipChanged() {
          loadProfile({ skipPosts: true, silent: true }).catch(() => { });
        }

        function persistSentFriendRequests() {
          try {
            sessionStorage.setItem(sentFriendRequestStorageKey, JSON.stringify([...sentFriendRequestProfileIds]));
          } catch {
            // Storage may be unavailable; the in-memory set still prevents duplicate clicks.
          }
        }

        function rememberSentFriendRequest(profileId) {
          const id = Number(profileId);
          if (!Number.isFinite(id)) return;
          sentFriendRequestProfileIds.add(id);
          persistSentFriendRequests();
        }

        function forgetSentFriendRequest(profileId) {
          const id = Number(profileId);
          if (!Number.isFinite(id)) return;
          sentFriendRequestProfileIds.delete(id);
          persistSentFriendRequests();
        }

        function setFriendRequestSentButton(button) {
          button.disabled = true;
          button.dataset.profileAction = 'request-sent';
          button.className = 'bg-[#D4A017] text-black/80 font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm flex items-center gap-2 cursor-not-allowed opacity-80';
          button.innerHTML = '<span class="material-symbols-outlined text-[20px]">hourglass_empty</span>Solicitud enviada';
        }

        function handleProfileVisibilityChange() {
          if (document.hidden) {
            return;
          }
          loadProfile({ skipPosts: true, silent: true }).catch(() => { });
        }

        profileActions.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-profile-action]');
          if (!button || !profileData) return;

          if (button.dataset.profileAction === 'message') {
            router.navigate('messages', { user: profileData.id });
            return;
          }

          if (button.dataset.profileAction === 'block-user') {
            const confirmed = await confirmAction({
              title: 'Bloquear usuario',
              copy: 'Se cortara la amistad, el chat y las interacciones sociales entre ambos.',
              acceptLabel: 'Bloquear',
              tone: 'danger',
            });
            if (!confirmed) return;

            const result = await SocialAPI.blockUser(profileData.id);
            if (result?.ok) {
              showToast('Usuario bloqueado', 'success');
              window.dispatchEvent(new CustomEvent('friendship:changed'));
              window.dispatchEvent(new CustomEvent('blocks:changed'));
              if (window.loadNotifications) window.loadNotifications();
              loadProfile();
              return;
            }

            showToast(result?.data?.error || 'No se pudo bloquear al usuario', 'error');
            return;
          }

          if (button.dataset.profileAction === 'unblock-user') {
            const result = await SocialAPI.unblockUser(profileData.id);
            if (result?.ok) {
              showToast('Usuario desbloqueado', 'success');
              window.dispatchEvent(new CustomEvent('blocks:changed'));
              loadProfile();
              return;
            }

            showToast(result?.data?.error || 'No se pudo desbloquear al usuario', 'error');
            return;
          }

          if (button.dataset.profileAction === 'send-request') {
            const originalClassName = button.className;
            const originalHtml = button.innerHTML;
            setFriendRequestSentButton(button);
            rememberSentFriendRequest(profileData.id);

            const result = await SocialAPI.sendRequest(profileData.id);
            if (result?.ok) {
              showToast('Solicitud enviada', 'success');
              window.dispatchEvent(new CustomEvent('friendship:changed'));
              return;
            }

            const errorText = result?.data?.error || '';
            if (/pendiente|existe/i.test(errorText)) {
              showToast('Solicitud enviada', 'success');
              return;
            }

            forgetSentFriendRequest(profileData.id);
            button.disabled = false;
            button.dataset.profileAction = 'send-request';
            button.className = originalClassName;
            button.innerHTML = originalHtml;
            showToast(result?.data?.error || 'No se pudo enviar la solicitud', 'error');
            return;
          }

          if (button.dataset.profileAction === 'accept-request' && incomingRequestId) {
            const result = await SocialAPI.acceptRequest(incomingRequestId);
            if (result?.ok) {
              showToast('Solicitud aceptada', 'success');
              window.dispatchEvent(new CustomEvent('friendship:changed'));
              if (window.loadNotifications) window.loadNotifications();
              loadProfile();
              return;
            }
            showToast(result?.data?.error || 'No se pudo aceptar la solicitud', 'error');
            return;
          }

        });

        postsList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (button) {
            if (await handleSharePublicPostAction(button)) {
              return;
            }
            if (button.dataset.action === 'open-profile') {
              router.navigate('profile', { id: button.dataset.userId });
              return;
            }
            if (button.dataset.action === 'react-post') {
              await PostsAPI.reactPost(Number(button.dataset.postId), button.dataset.reaction);
              await loadPosts(profileData.id);
              return;
            }
            if (button.dataset.action === 'comment-post') {
              openProfileCommentModal(button.dataset.postId);
              return;
            }
            if (button.dataset.action === 'open-livestream') {
              await navigateToLivestream(router, button.dataset.liveId);
              return;
            }
            if (button.dataset.action === 'report-post') {
              await reportContent('publicacion', Number(button.dataset.postId));
              return;
            }
          }

          const postCard = event.target.closest('[data-post-card]');
          if (postCard && !event.target.closest('[data-post-card-ignore="true"]')) {
            openProfileCommentModal(postCard.dataset.postId);
          }
        });

        profileCommentList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (!button || !pendingProfileCommentId) return;

          if (button.dataset.action === 'open-profile') {
            event.preventDefault();
            hideMentionProfilePopover();
            router.navigate('profile', { id: button.dataset.userId });
            return;
          }

          if (button.dataset.action === 'open-reaction-picker') {
            openReactionPicker(button, {
              targetType: 'comment',
              targetId: Number(button.dataset.targetId),
              currentReaction: button.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                const result = await PostsAPI.reactComment(Number(button.dataset.targetId), reaction);
                if (result?.ok) {
                  await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
                  return;
                }
                showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
              },
            });
            return;
          }

          if (button.dataset.action === 'react-comment') {
            const result = await PostsAPI.reactComment(button.dataset.commentId, button.dataset.reaction);
            if (result?.ok) {
              await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
              return;
            }

            showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
            return;
          }

          if (button.dataset.action === 'report-comment') {
            await reportContent('comentario', Number(button.dataset.commentId));
            return;
          }

          if (button.dataset.action === 'profile-delete-comment') {
            const confirmed = await confirmAction({
              title: 'Eliminar comentario',
              copy: 'El comentario se eliminara y no podra recuperarse.',
              acceptLabel: 'Eliminar',
              tone: 'danger',
            });
            if (!confirmed) return;

            const result = await PostsAPI.deleteComment(null, button.dataset.commentId);
            if (result?.ok) {
              showToast('Comentario eliminado', 'success');
              await loadPosts(profileData.id);
              await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
              return;
            }

            showToast(result?.data?.error || 'No se pudo eliminar el comentario', 'error');
          }
        });

        profileCommentPostPreview.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (!button) return;
          if (await handleSharePublicPostAction(button)) return;

          if (button.dataset.action === 'open-profile') {
            router.navigate('profile', { id: button.dataset.userId });
            return;
          }

          if (button.dataset.action === 'open-post-image') {
            openPostImageLightbox(button.dataset.imageUrl, button.dataset.imageAlt || 'Imagen ampliada de la publicacion');
            return;
          }

          if (button.dataset.action === 'report-post') {
            await reportContent('publicacion', Number(button.dataset.postId));
            return;
          }

          if (button.dataset.action === 'open-reaction-picker') {
            openReactionPicker(button, {
              targetType: 'post',
              targetId: Number(button.dataset.targetId),
              currentReaction: button.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                const result = await PostsAPI.reactPost(Number(button.dataset.targetId), reaction);
                if (result?.ok) {
                  await loadPosts(profileData.id);
                  renderProfileCommentModalPost(pendingProfileCommentId);
                  return;
                }
                showToast(result?.data?.error || 'No se pudo reaccionar a la publicacion', 'error');
              },
            });
          }
        });

        changeAvatarButton.addEventListener('click', () => {
          if (!isOwnProfile) {
            showToast('Solo puedes editar tu propio perfil', 'error');
            return;
          }
          avatarInput.click();
        });
        changeBannerButton.addEventListener('click', () => {
          if (!isOwnProfile) {
            showToast('Solo puedes editar tu propio perfil', 'error');
            return;
          }
          bannerInput.click();
        });
        avatarInput.addEventListener('change', (event) => openCropModal('avatar', event.target.files?.[0]));
        bannerInput.addEventListener('change', (event) => openCropModal('banner', event.target.files?.[0]));
        mediaCropZoom.addEventListener('input', (event) => {
          setCropZoom(Number(event.target.value) / 100);
        });
        mediaCropResetButton.addEventListener('click', () => {
          if (!cropState.image) return;
          initializeCropViewport();
        });
        mediaCropSaveButton.addEventListener('click', saveCroppedMedia);
        mediaCropCancelButton.addEventListener('click', () => closeCropModal({ mode: cropState.mode }));
        mediaCropCloseButton.addEventListener('click', () => closeCropModal({ mode: cropState.mode }));
        mediaCropModal.addEventListener('click', (event) => {
          if (event.target === mediaCropModal) {
            closeCropModal({ mode: cropState.mode });
          }
        });
        mediaCropStage.addEventListener('pointerdown', (event) => {
          if (!cropState.image || cropState.saving) return;
          cropState.pointerId = event.pointerId;
          cropState.dragStartX = event.clientX;
          cropState.dragStartY = event.clientY;
          cropState.dragOffsetX = cropState.offsetX;
          cropState.dragOffsetY = cropState.offsetY;
          mediaCropStage.classList.add('is-dragging');
          mediaCropStage.setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        mediaCropStage.addEventListener('pointermove', (event) => {
          if (cropState.pointerId !== event.pointerId) return;
          cropState.offsetX = cropState.dragOffsetX + (event.clientX - cropState.dragStartX);
          cropState.offsetY = cropState.dragOffsetY + (event.clientY - cropState.dragStartY);
          renderCropStage();
          event.preventDefault();
        });
        const stopCropDrag = (event) => {
          if (cropState.pointerId === null) return;
          if (event && cropState.pointerId !== event.pointerId) return;

          if (event && mediaCropStage.hasPointerCapture(event.pointerId)) {
            mediaCropStage.releasePointerCapture(event.pointerId);
          }
          cropState.pointerId = null;
          mediaCropStage.classList.remove('is-dragging');
        };
        mediaCropStage.addEventListener('pointerup', stopCropDrag);
        mediaCropStage.addEventListener('pointercancel', stopCropDrag);
        mediaCropStage.addEventListener('lostpointercapture', () => {
          cropState.pointerId = null;
          mediaCropStage.classList.remove('is-dragging');
        });
        container.querySelector('#profile-close-comment-top-btn').addEventListener('click', closeProfileCommentModal);
        container.querySelector('#profile-confirm-comment-btn').addEventListener('click', confirmProfileComment);
        profileCommentSort.addEventListener('change', () => {
          if (!pendingProfileCommentId) return;
          syncProfileCommentSortChips(profileCommentSort.value);
          loadProfileComments(pendingProfileCommentId, profileCommentSort.value);
        });
        profileCommentModal.addEventListener('click', (event) => {
          if (event.target === profileCommentModal) closeProfileCommentModal();
        });
        profileCommentInput.addEventListener('keydown', async (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await confirmProfileComment();
          }
        });
        profileCommentInput.addEventListener('input', () => {
          profileCommentInput.style.height = 'auto';
          profileCommentInput.style.height = `${Math.min(profileCommentInput.scrollHeight, 96)}px`;
        });
        profileBioActionButton.addEventListener('click', async () => {
          if (!isOwnProfile) return;
          if (bioChanged()) {
            await saveBio();
            return;
          }

          profileBio.focus();
          placeCaretAtEnd(profileBio);
        });
        profileBioCancelButton.addEventListener('click', () => {
          setBioContent(originalBio);
          updateBioEditorState();
          profileBio.blur();
        });
        profileBio.addEventListener('input', updateBioEditorState);
        profileBio.addEventListener('keydown', async (event) => {
          if (!isOwnProfile) return;
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && bioChanged()) {
            event.preventDefault();
            await saveBio();
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setBioContent(originalBio);
            updateBioEditorState();
            profileBio.blur();
          }
        });

        window.addEventListener('friendship:changed', handleProfileFriendshipChanged);
        window.addEventListener('blocks:changed', handleProfileFriendshipChanged);
        document.addEventListener('visibilitychange', handleProfileVisibilityChange);

        loadProfile();
        return () => {
          stopProfileRelationshipPolling();
          window.removeEventListener('friendship:changed', handleProfileFriendshipChanged);
          window.removeEventListener('blocks:changed', handleProfileFriendshipChanged);
          document.removeEventListener('visibilitychange', handleProfileVisibilityChange);
          profileCommentMentionController.destroy();
        };
      },
    },
    admin: {
      title: 'Admin',
      activeNav: 'admin',
      adminOnly: true,
      templatePath: '/pages/admin.html',
      templateSlots() {
        return {
          adminUserStatsSkeleton: renderAdminStatsSkeleton(4),
          adminUsersTableSkeleton: renderAdminTableSkeleton(6, 5),
        };
      },
      mount({ container, router, user }) {
        const stats = container.querySelector('#admin-user-stats');
        const tbody = container.querySelector('#users-tbody');
        const pagination = container.querySelector('#admin-users-pagination');
        const searchInput = container.querySelector('#admin-user-search');
        const sanctionedOnlyCheckbox = container.querySelector('#admin-user-sanctioned-only');
        const facultyFilter = container.querySelector('#admin-user-faculty-filter');
        const careerFilter = container.querySelector('#admin-user-career-filter');
        const roleFilter = container.querySelector('#admin-user-role-filter');
        const editModal = container.querySelector('#edit-user-modal');
        const editForm = container.querySelector('#edit-user-form');
        const sanctionModal = container.querySelector('#user-sanction-modal');
        const sanctionForm = container.querySelector('#user-sanction-form');

        let allUsers = [];
        let filteredUsers = [];
        let usersPage = 1;
        const USERS_PER_PAGE = 30;

        function toggleUserSanctionCustomFields(durationValue) {
          const customGroup = container.querySelector('#user-sanction-custom-group');
          customGroup.classList.toggle('hidden', durationValue !== 'custom');
        }

        function syncAdminEditFields(userType) {
          const isStudent = userType === 'student';
          const isAdministrative = userType === 'administrativo';
          container.querySelector('#edit-user-career-group').style.display = isStudent ? 'flex' : 'none';
          container.querySelector('#edit-user-cycle-group').style.display = isStudent ? 'flex' : 'none';
          container.querySelector('#edit-user-code-group').style.display = isStudent ? 'flex' : 'none';
          container.querySelector('#edit-user-area-group').style.display = isStudent ? 'none' : 'flex';
          container.querySelector('#edit-user-position-group').style.display = isStudent ? 'none' : 'flex';
          container.querySelector('#edit-user-faculty-label').textContent = isAdministrative ? 'Dependencia / facultad' : 'Facultad';
        }

        function syncAdminFilterAvailability() {
          const selectedRole = String(roleFilter.value || 'Todos');
          const shouldDisableCareer = ['teacher', 'administrativo'].includes(selectedRole);
          careerFilter.disabled = shouldDisableCareer;
          careerFilter.classList.toggle('opacity-60', shouldDisableCareer);
          careerFilter.classList.toggle('cursor-not-allowed', shouldDisableCareer);
          if (shouldDisableCareer) {
            careerFilter.value = 'Todos';
          }
        }

        function openModal() {
          editModal.classList.remove('hidden');
          editModal.classList.add('flex');
        }

        function closeModal() {
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
        }

        function setUserSanctionDurationFromUser(listedUser) {
          const blockedUntilRaw = listedUser?.blocked_until;
          if (!blockedUntilRaw || listedUser?.is_blocked_indefinitely) {
            container.querySelector('#user-sanction-duration').value = listedUser?.is_active === false ? 'indefinite' : '24h';
            container.querySelector('#user-sanction-custom-value').value = '1';
            container.querySelector('#user-sanction-custom-unit').value = 'hours';
            toggleUserSanctionCustomFields(container.querySelector('#user-sanction-duration').value);
            return;
          }

          const blockedUntil = new Date(blockedUntilRaw);
          const diffMinutes = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 60000));
          if (diffMinutes === 24 * 60) {
            container.querySelector('#user-sanction-duration').value = '24h';
            toggleUserSanctionCustomFields('24h');
            return;
          }
          if (diffMinutes === 48 * 60) {
            container.querySelector('#user-sanction-duration').value = '48h';
            toggleUserSanctionCustomFields('48h');
            return;
          }
          if (diffMinutes === 7 * 24 * 60) {
            container.querySelector('#user-sanction-duration').value = '1w';
            toggleUserSanctionCustomFields('1w');
            return;
          }

          let value = diffMinutes;
          let unit = 'minutes';
          if (diffMinutes % (7 * 24 * 60) === 0) {
            value = diffMinutes / (7 * 24 * 60);
            unit = 'weeks';
          } else if (diffMinutes % (24 * 60) === 0) {
            value = diffMinutes / (24 * 60);
            unit = 'days';
          } else if (diffMinutes % 60 === 0) {
            value = diffMinutes / 60;
            unit = 'hours';
          }
          container.querySelector('#user-sanction-duration').value = 'custom';
          container.querySelector('#user-sanction-custom-value').value = String(value);
          container.querySelector('#user-sanction-custom-unit').value = unit;
          toggleUserSanctionCustomFields('custom');
        }

        function renderUserSanctionHistory(listedUser) {
          const history = container.querySelector('#user-sanction-history');
          const activeCard = container.querySelector('#user-sanction-active-card');
          if (!history) return;
          const isBlocked = listedUser.is_active === false;
          if (activeCard) {
            activeCard.classList.toggle('hidden', !isBlocked);
          }
          history.innerHTML = isBlocked
            ? `
              <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Sanción vigente</p>
                    <p class="text-xs text-slate-500 mt-1">${escapeHtml(formatBlockedUntilLabel(listedUser.blocked_until, listedUser.is_blocked_indefinitely))}</p>
                  </div>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Bloqueado
                  </span>
                </div>
                <p class="text-sm text-slate-700 mt-3">${escapeHtml(listedUser.blocked_reason || 'Sin razón registrada')}</p>
              </div>
            `
            : '';
        }

        function openUserSanctionModal(listedUser) {
          const isBlocked = listedUser.is_active === false;
          container.querySelector('#user-sanction-id').value = listedUser.id;
          container.querySelector('#user-sanction-name').textContent = displayName(listedUser);
          container.querySelector('#user-sanction-email').textContent = listedUser.email || '-';
          container.querySelector('#user-sanction-current').textContent = isBlocked
            ? `Bloqueado: ${formatBlockedUntilLabel(listedUser.blocked_until, listedUser.is_blocked_indefinitely)}`
            : 'Estado actual: Activo';
          container.querySelector('#user-sanction-title').textContent = isBlocked ? 'Editar sanción' : 'Bloquear usuario';
          container.querySelector('#user-sanction-subtitle').textContent = isBlocked
            ? 'Actualiza la duración o la razón del bloqueo actual.'
            : 'Define la duración del bloqueo y una razón opcional visible para el usuario.';
          container.querySelector('#submit-user-sanction-btn').textContent = isBlocked ? 'Guardar cambios' : 'Bloquear cuenta';
          container.querySelector('#remove-user-sanction-btn').classList.toggle('hidden', !isBlocked);
          container.querySelector('#user-sanction-reason').value = listedUser.blocked_reason || '';
          setUserSanctionDurationFromUser(listedUser);
          renderUserSanctionHistory(listedUser);
          sanctionModal.classList.remove('hidden');
          sanctionModal.classList.add('flex');
        }

        function closeUserSanctionModal() {
          sanctionModal.classList.add('hidden');
          sanctionModal.classList.remove('flex');
          sanctionForm.reset();
          toggleUserSanctionCustomFields('24h');
        }

        function renderStats(users) {
          const total = users.length;
          const active = users.filter((item) => item.is_active !== false && isUserOnline(item)).length;
          const admins = users.filter((item) => item.role === 'admin').length;
          const completed = users.filter((item) => item.is_profile_complete).length;

          const cards = [
            { value: total, label: 'Usuarios totales', color: '#4A6BFF', bg: '#EBF0FF', icon: 'group' },
            { value: active, label: 'Usuarios activos', color: '#ffffff', bg: '#D4A017', icon: 'show_chart' },
            { value: admins, label: 'Administradores', color: '#4A55A2', bg: '#F0F2FB', icon: 'admin_panel_settings' },
            { value: completed, label: 'Perfiles completos', color: '#6B7280', bg: '#F3F4F6', icon: 'person' },
          ];

          stats.innerHTML = cards.map((card) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style="background:${card.bg}; color:${card.color}">
                <span class="material-symbols-outlined text-[24px]">${card.icon}</span>
              </div>
              <div>
                <p class="text-[28px] font-bold text-slate-900 leading-none mb-1">${card.value}</p>
                <p class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">${card.label}</p>
              </div>
            </div>
          `).join('');
        }

        function renderUsers(users) {
          if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">No se encontraron usuarios.</td></tr>';
            return;
          }

          tbody.innerHTML = users.map((listedUser) => {
            const active = listedUser.is_active !== false;
            const isAdmin = listedUser.role === 'admin';
            const isSelf = Number(listedUser.id) === Number(user.id);
            return `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-5">
                  <div class="flex items-center gap-3">
                    ${renderAvatar(listedUser, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
                    <div>
                      <div class="font-bold text-sm text-slate-900">${escapeHtml(displayName(listedUser))}</div>
                      <div class="text-xs text-slate-500">${escapeHtml(listedUser.email || '-')}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-5 text-sm text-slate-700">${escapeHtml(careerLabel(listedUser) || '-')}</td>
                <td class="py-3 px-5"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide" style="background:${userColor(listedUser)}">${escapeHtml(listedUser.faculty || 'UPT')}</span></td>
                <td class="py-3 px-5">
                  ${active
                ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#16A34A] bg-[#DCFCE7]"><span class="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></span> Activo</span>'
                : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#DC2626] bg-[#FEE2E2]"><span class="w-1.5 h-1.5 rounded-full bg-[#DC2626]"></span> Bloqueado</span>'
              }
                </td>
                <td class="py-3 px-5">
                  ${renderAdminRoleBadges(listedUser)}
                </td>
                <td class="py-3 px-5">
                  <div class="flex justify-end gap-2 flex-wrap">
                    <button type="button" data-edit-user="${listedUser.id}" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">edit</span> Editar
                    </button>
                    <button type="button" data-role-user="${listedUser.id}" data-next-role="${isAdmin ? 'user' : 'admin'}" ${isSelf && isAdmin ? 'disabled' : ''} class="flex items-center gap-1.5 px-3 py-1.5 ${isAdmin ? 'bg-[#EEF2FF] text-[#1B2A6B] border border-[#C7D2FE]' : 'bg-[#1B2A6B] text-white border border-[#1B2A6B]'} rounded-lg text-xs font-medium ${isSelf && isAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'} transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> ${isAdmin ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    <button type="button" data-toggle-user="${listedUser.id}" data-active="${active ? '1' : '0'}" ${isSelf ? 'disabled' : ''} class="flex items-center gap-1.5 px-3 py-1.5 ${active ? 'bg-white text-slate-700 border border-slate-200' : 'bg-[#1B2A6B] text-white'} rounded-lg text-xs font-medium ${isSelf ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'} transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">power_settings_new</span> ${active ? 'Bloquear' : 'Editar sanción'}
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }

        function syncAdminCareerFilter() {
          const faculty = facultyFilter.value || 'Todos';
          const careers = getFacultyCareerOptions(faculty);
          const previous = careerFilter.value;
          careerFilter.innerHTML = careers.map((career, index) => `<option value="${escapeHtml(career)}">${escapeHtml(index === 0 ? 'Carrera: Todos' : career)}</option>`).join('');
          if (careers.includes(previous)) {
            careerFilter.value = previous;
          }
        }

        const sortFilter = container.querySelector('#admin-user-sort-filter');
        const editFaculty = container.querySelector('#edit-user-faculty');
        const editCareer = container.querySelector('#edit-user-career');
        const editCycle = container.querySelector('#edit-user-cycle');
        const editCode = container.querySelector('#edit-user-code');

        function findMatchingCareerOption(careers, desiredCareer) {
          const normalizedDesired = normalizeSearchText(desiredCareer);
          if (!normalizedDesired) {
            return '';
          }

          const exactMatch = careers.find((career) => career === desiredCareer);
          if (exactMatch) {
            return exactMatch;
          }

          return careers.find((career) => normalizeSearchText(career) === normalizedDesired) || '';
        }

        function updateEditUserCareers(preferredCareer = '') {
          const faculty = editFaculty.value;
          const currentVal = preferredCareer || editCareer.value;
          const careers = getFacultyCareerOptions(faculty).filter(c => c !== 'Todos');
          editCareer.innerHTML = '<option disabled selected value="">Selecciona tu carrera</option>';
          careers.forEach((career) => {
            const option = document.createElement('option');
            option.value = career;
            option.textContent = career;
            editCareer.appendChild(option);
          });
          editCareer.disabled = careers.length === 0;
          const matchedCareer = findMatchingCareerOption(careers, currentVal);
          if (matchedCareer) {
            editCareer.value = matchedCareer;
          }
          updateEditUserCycles();
        }

        function updateEditUserCycles() {
          const school = editCareer.value;
          let maxCycles = 10;
          if (school === 'Derecho') maxCycles = 12;
          if (school === 'Medicina Humana') maxCycles = 14;

          const currentVal = editCycle.value;
          editCycle.innerHTML = '<option disabled selected value="">Selecciona tu ciclo actual</option>';

          const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
          for (let i = 1; i <= maxCycles; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = romanNumerals[i-1] + ' Ciclo';
            editCycle.appendChild(option);
          }

          if (currentVal && currentVal <= maxCycles) {
            editCycle.value = currentVal;
          }
        }

        function renderUsersPage() {
          const pageSlice = paginateClientItems(filteredUsers, usersPage, USERS_PER_PAGE);
          usersPage = pageSlice.meta.currentPage;
          renderUsers(pageSlice.items);
          renderPagination(pagination, pageSlice.meta, { summaryLabel: 'usuarios' });
        }

        function applyAdminUserFilters({ resetPage = true } = {}) {
          const query = normalizeSearchText(searchInput.value);
          const faculty = facultyFilter.value;
          const career = careerFilter.value;
          const role = roleFilter.value;
          const sortOrder = sortFilter ? sortFilter.value : 'desc';
          const onlySanctioned = !!sanctionedOnlyCheckbox?.checked;

          let filtered = allUsers.filter((listedUser) => {
            const name = normalizeSearchText(displayName(listedUser));
            const email = normalizeSearchText(String(listedUser.email || ''));
            const matchesQuery = !query || name.includes(query) || email.includes(query);
            const matchesFaculty = !faculty || faculty === 'Todos' || String(listedUser.faculty || '') === faculty;
            const matchesCareer = !career || career === 'Todos'
              || normalizeSearchText(careerLabel(listedUser) || '') === normalizeSearchText(career);
            const matchesRole = !role || role === 'Todos'
              || (role === 'admin' ? String(listedUser.role || 'user') === 'admin' : String(listedUser.user_type || 'student') === role);
            const matchesSanction = !onlySanctioned || listedUser.is_active === false;
            return matchesQuery && matchesFaculty && matchesCareer && matchesRole && matchesSanction;
          });

          filtered.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
          });

          filteredUsers = filtered;
          if (resetPage) {
            usersPage = 1;
          }
          renderUsersPage();
        }

        async function loadUsers() {
          const result = await AuthAPI.listAdminUsers();
          if (!result?.ok) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">No se pudieron cargar los usuarios.</td></tr>';
            pagination?.classList.add('hidden');
            return;
          }
          allUsers = getList(result);
          renderStats(allUsers);
          syncAdminCareerFilter();
          applyAdminUserFilters();
        }

        searchInput.addEventListener('input', applyAdminUserFilters);
        sanctionedOnlyCheckbox?.addEventListener('change', applyAdminUserFilters);
        facultyFilter.addEventListener('change', () => {
          syncAdminCareerFilter();
          applyAdminUserFilters();
        });
        careerFilter.addEventListener('change', applyAdminUserFilters);
        roleFilter.addEventListener('change', () => {
          syncAdminFilterAvailability();
          applyAdminUserFilters();
        });

        tbody.addEventListener('click', async (event) => {
          const editButton = event.target.closest('[data-edit-user]');
          if (editButton) {
            const listedUser = allUsers.find((item) => Number(item.id) === Number(editButton.dataset.editUser));
            if (!listedUser) return;
            const userCareer = careerLabel(listedUser);
            container.querySelector('#edit-user-id').value = listedUser.id;
            container.querySelector('#edit-user-name').value = displayName(listedUser);
            container.querySelector('#edit-user-type').value = listedUser.user_type || 'student';
            container.querySelector('#edit-user-faculty').value = listedUser.faculty || 'FAING';
            updateEditUserCareers(userCareer);
            updateEditUserCycles();
            container.querySelector('#edit-user-cycle').value = listedUser.academic_cycle || '';
            container.querySelector('#edit-user-code').value = listedUser.student_code || '';
            container.querySelector('#edit-user-area').value = listedUser.area || '';
            container.querySelector('#edit-user-position').value = listedUser.position_title || '';
            syncAdminEditFields(container.querySelector('#edit-user-type').value);
            openModal();
            return;
          }

          const toggleButton = event.target.closest('[data-toggle-user]');
          const roleButton = event.target.closest('[data-role-user]');

          if (roleButton) {
            const result = await AuthAPI.updateUserRole(roleButton.dataset.roleUser, roleButton.dataset.nextRole);
            if (result?.ok) {
              showToast(result.data?.message || 'Rol actualizado', 'success');
              loadUsers();
              return;
            }
            showToast(result?.data?.error || 'No se pudo actualizar el rol', 'error');
            return;
          }

          if (!toggleButton) return;
          const listedUser = allUsers.find((item) => Number(item.id) === Number(toggleButton.dataset.toggleUser));
          if (!listedUser) return;
          openUserSanctionModal(listedUser);
        });

        container.querySelector('#go-admin-posts-btn').addEventListener('click', () => router.navigate('admin-posts'));
        container.querySelector('#go-admin-reports-btn').addEventListener('click', () => router.navigate('admin-reports'));
        container.querySelector('#close-edit-user-modal-btn').addEventListener('click', closeModal);
        container.querySelector('#cancel-edit-user-btn').addEventListener('click', closeModal);
        container.querySelector('#close-user-sanction-modal-btn').addEventListener('click', closeUserSanctionModal);
        container.querySelector('#cancel-user-sanction-btn').addEventListener('click', closeUserSanctionModal);
        container.querySelector('#user-sanction-duration').addEventListener('change', (event) => {
          toggleUserSanctionCustomFields(event.target.value);
        });
        editFaculty.addEventListener('change', updateEditUserCareers);
        editCareer.addEventListener('change', updateEditUserCycles);
        editCode.addEventListener('input', (event) => {
          event.target.value = event.target.value.replace(/\D+/g, '').slice(0, 10);
        });
        editCode.addEventListener('blur', (event) => {
          if (!event.target.value) return;
          event.target.value = event.target.value.replace(/\D+/g, '').slice(0, 10);
        });

        if (sortFilter) {
          sortFilter.addEventListener('change', applyAdminUserFilters);
        }

        pagination?.addEventListener('click', (event) => {
          const button = event.target.closest('[data-page]');
          if (!button) return;
          usersPage = Number(button.dataset.page) || 1;
          renderUsersPage();
        });

        container.querySelector('#edit-user-type').addEventListener('change', (event) => {
          syncAdminEditFields(event.target.value);
        });
        editModal.addEventListener('click', (event) => {
          if (event.target === editModal) closeModal();
        });
        sanctionModal.addEventListener('click', (event) => {
          if (event.target === sanctionModal) closeUserSanctionModal();
        });

        editForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const userId = container.querySelector('#edit-user-id').value;
          if (container.querySelector('#edit-user-type').value === 'student' && !/^\d{10}$/.test(String(container.querySelector('#edit-user-code').value || ''))) {
            showToast('El codigo de estudiante debe tener exactamente 10 digitos numericos', 'error');
            return;
          }
          const result = await AuthAPI.updateAcademic(userId, {
            user_type: container.querySelector('#edit-user-type').value,
            faculty: container.querySelector('#edit-user-faculty').value,
            career: container.querySelector('#edit-user-career').value,
            area: container.querySelector('#edit-user-area').value,
            position_title: container.querySelector('#edit-user-position').value,
            academic_cycle: container.querySelector('#edit-user-cycle').value,
            student_code: container.querySelector('#edit-user-code').value,
          });

          if (result?.ok) {
            showToast('Usuario actualizado', 'success');
            closeModal();
            loadUsers();
            return;
          }

          showToast(result?.data?.error || 'No se pudo guardar el usuario', 'error');
        });

        sanctionForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const userId = container.querySelector('#user-sanction-id').value;
          const blockedReason = container.querySelector('#user-sanction-reason').value.trim();
          const durationValue = container.querySelector('#user-sanction-duration').value;
          const customValue = container.querySelector('#user-sanction-custom-value').value;
          const customUnit = container.querySelector('#user-sanction-custom-unit').value;

          let blockPayload;
          try {
            blockPayload = buildBlockedDurationPayload(durationValue, customValue, customUnit);
          } catch (error) {
            showToast(error.message || 'No se pudo calcular la duración del bloqueo', 'error');
            return;
          }

          const result = await AuthAPI.toggleUser(userId, {
            blocked_reason: blockedReason || null,
            blocked_until: blockPayload.blocked_until,
            blocked_duration_value: blockPayload.blocked_duration_value,
            blocked_duration_unit: blockPayload.blocked_duration_unit,
            is_indefinite: blockPayload.is_indefinite,
          });

          if (result?.ok) {
            showToast(result.data?.message || 'Sanción actualizada', 'success');
            closeUserSanctionModal();
            loadUsers();
            return;
          }

          showToast(result?.data?.error || 'No se pudo guardar la sanción', 'error');
        });

        container.querySelector('#remove-user-sanction-btn').addEventListener('click', async () => {
          const userId = container.querySelector('#user-sanction-id').value;
          if (!userId) return;
          const result = await AuthAPI.toggleUser(userId);
          if (result?.ok) {
            showToast(result.data?.message || 'Sanción retirada', 'success');
            closeUserSanctionModal();
            loadUsers();
            return;
          }
          showToast(result?.data?.error || 'No se pudo levantar la sanción', 'error');
        });

        syncAdminFilterAvailability();
        loadUsers();
      },
    },
    'admin-reports': {
      title: 'Admin reportes',
      activeNav: 'admin',
      adminOnly: true,
      templatePath: '/pages/admin_reportes.html',
      templateSlots() {
        return {
          adminReportsTableSkeleton: renderAdminTableSkeleton(5, 5),
        };
      },
      mount({ container, router }) {
        const tbody = container.querySelector('#admin-reports-tbody');
        const pagination = container.querySelector('#admin-reports-pagination');
        const typeFilter = container.querySelector('#admin-report-type-filter');
        const orderFilter = container.querySelector('#admin-report-order-filter');
        const reviewModal = container.querySelector('#review-report-modal');
        const sanctionModal = container.querySelector('#sanction-report-modal');
        const sanctionForm = container.querySelector('#sanction-report-form');
        let reportRows = [];
        let filteredReportRows = [];
        let reportsPage = 1;
        const REPORTS_PER_PAGE = 30;
        let adminPostsById = new Map();

        function toggleSanctionCustomFields(durationValue) {
          const customGroup = container.querySelector('#sanction-custom-group');
          customGroup.classList.toggle('hidden', durationValue !== 'custom');
        }

        function toggleSanctionBlockAccordion(isEnabled) {
          const blockConfig = container.querySelector('#sanction-block-config');
          if (!blockConfig) return;
          blockConfig.classList.toggle('is-open', !!isEnabled);
          blockConfig.setAttribute('aria-hidden', isEnabled ? 'false' : 'true');
        }

        function resolveRelatedPost(report) {
          const postId = Number(report.target_type === 'comment' ? report.post_id : report.target_id);
          return adminPostsById.get(postId) || null;
        }

        function enrichReportWithPost(report) {
          const relatedPost = resolveRelatedPost(report);
          if (!relatedPost) return report;
          const isRelatedStream = String(relatedPost.post_type || '').toLowerCase() === 'livestream';
          const preview = String(report.content_preview || '').trim();
          const content = String(report.content || '').trim();
          return {
            ...report,
            post_type: report.post_type || relatedPost.post_type || null,
            live_title: report.live_title || relatedPost.live_title || null,
            content_preview: isRelatedStream && (!preview || preview === 'Sin contenido de texto')
              ? (relatedPost.live_title || preview)
              : report.content_preview,
            content: isRelatedStream && !content
              ? (relatedPost.live_title || report.content)
              : report.content,
          };
        }


        function formatReportType(report) {
          if (report.service === 'chat') return 'message';
          if (report.target_type === 'comment') return 'comment';
          if ((report.post_type || '').toLowerCase() === 'livestream' || String(report.live_title || '').trim() !== '') return 'livestream';
          return 'post';
        }

        function getReportTypeMeta(report) {
          return {
            post: { label: 'Publicacion', classes: 'bg-sky-50 text-sky-700 border-sky-200', icon: 'article' },
            livestream: { label: 'Stream', classes: 'bg-red-50 text-red-600 border-red-200', icon: 'live_tv' },
            comment: { label: 'Comentario', classes: 'bg-violet-50 text-violet-700 border-violet-200', icon: 'chat_bubble' },
            message: { label: 'Mensaje', classes: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'mail' },
          }[formatReportType(report)];
        }

        function renderReportTypeBadge(report) {
          const meta = getReportTypeMeta(report);
          return `<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.classes}"><span class="material-symbols-outlined text-[13px]">${meta.icon}</span>${meta.label}</span>`;
        }

        function closeReviewModal() {
          const reviewImage = container.querySelector('#review-report-image');
          const reviewVideo = container.querySelector('#review-report-video');
          if (reviewImage) {
            reviewImage.src = '';
            reviewImage.classList.add('hidden');
          }
          if (reviewVideo) {
            reviewVideo.pause();
            reviewVideo.removeAttribute('src');
            reviewVideo.load();
            reviewVideo.classList.add('hidden');
          }
          reviewModal.classList.add('hidden');
          reviewModal.classList.remove('flex');
        }

        function closeSanctionModal() {
          sanctionModal.classList.add('hidden');
          sanctionModal.classList.remove('flex');
          sanctionForm.reset();
          toggleSanctionCustomFields('24h');
          toggleSanctionBlockAccordion(false);
        }

        async function fetchReportDetails(report) {
          const api = report.service === 'chat' ? ChatAPI : PostsAPI;
          const result = await api.getReportDetails(report.id);
          if (!result?.ok) {
            throw new Error(result?.data?.error || 'No se pudo cargar el reporte');
          }

          return enrichReportWithPost({ ...report, ...result.data });
        }

        function renderSanctionActions(report) {
          const isLivestreamReport = formatReportType(report) === 'livestream';
          const primaryActions = [`
            <div id="sanction-action-block-card" class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <label class="flex items-start gap-3">
                <input id="sanction-action-block" type="checkbox" class="mt-1 rounded border-slate-300 text-[#1B2A6B] focus:ring-[#1B2A6B]" checked/>
                <span>
                  <span class="block text-sm font-semibold text-slate-900">Bloquear usuario</span>
                  <span class="block text-xs text-slate-500 mt-1">Activa el accordion para definir la duración y la razón del bloqueo.</span>
                </span>
              </label>
            </div>
          `];
          const secondaryActions = [];

          if (report.service === 'posts' && report.target_type === 'post') {
            secondaryActions.push(`
              <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <input id="sanction-action-delete-post" type="checkbox" class="mt-1 rounded border-slate-300 text-[#1B2A6B] focus:ring-[#1B2A6B]"/>
                <span>
                  <span class="block text-sm font-semibold text-slate-900">${isLivestreamReport ? 'Eliminar Stream' : 'Eliminar publicacion'}</span>
                  <span class="block text-xs text-slate-500 mt-1">${isLivestreamReport ? 'Quita el stream denunciado de la plataforma.' : 'Quita la publicación denunciada del feed.'}</span>
                </span>
              </label>
            `);
          }

          if (report.service === 'posts' && report.target_type === 'comment') {
            secondaryActions.push(`
              <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <input id="sanction-action-delete-comment" type="checkbox" class="mt-1 rounded border-slate-300 text-[#1B2A6B] focus:ring-[#1B2A6B]"/>
                <span>
                  <span class="block text-sm font-semibold text-slate-900">Eliminar comentario</span>
                  <span class="block text-xs text-slate-500 mt-1">Quita el comentario denunciado de la publicación.</span>
                </span>
              </label>
            `);
          }

          const primaryContainer = container.querySelector('#sanction-actions-primary');
          const secondaryContainer = container.querySelector('#sanction-actions-secondary');
          if (primaryContainer) {
            primaryContainer.innerHTML = primaryActions.join('');
          }
          if (secondaryContainer) {
            secondaryContainer.innerHTML = secondaryActions.join('');
          }
          toggleSanctionBlockAccordion(true);
        }

        async function openReviewModal(report) {
          try {
            const details = await fetchReportDetails(report);
            container.querySelector('#review-report-user').textContent = details.reported_user_name || `Usuario #${details.reported_user_id ?? '-'}`;
            container.querySelector('#review-report-type').textContent = getReportTypeMeta(details).label;
            container.querySelector('#review-report-date').textContent = details.created_at
              ? new Date(details.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
              : '-';
            container.querySelector('#review-report-content').textContent = details.content || details.content_preview || 'Sin contenido disponible';
            const reviewImage = container.querySelector('#review-report-image');
            const reviewVideo = container.querySelector('#review-report-video');
            if (details.video_url) {
              if (reviewImage) {
                reviewImage.src = '';
                reviewImage.classList.add('hidden');
              }
              if (reviewVideo) {
                reviewVideo.src = details.video_url;
                reviewVideo.load();
                reviewVideo.classList.remove('hidden');
              }
            } else if (details.image_url) {
              if (reviewVideo) {
                reviewVideo.pause();
                reviewVideo.removeAttribute('src');
                reviewVideo.load();
                reviewVideo.classList.add('hidden');
              }
              reviewImage.src = details.image_url;
              reviewImage.classList.remove('hidden');
            } else {
              if (reviewVideo) {
                reviewVideo.pause();
                reviewVideo.removeAttribute('src');
                reviewVideo.load();
                reviewVideo.classList.add('hidden');
              }
              reviewImage.src = '';
              reviewImage.classList.add('hidden');
            }
            reviewModal.classList.remove('hidden');
            reviewModal.classList.add('flex');
          } catch (error) {
            showToast(error.message || 'No se pudo cargar el contenido denunciado', 'error');
          }
        }

        async function openSanctionModal(report) {
          try {
            const details = await fetchReportDetails(report);
            container.querySelector('#sanction-report-id').value = details.id;
            container.querySelector('#sanction-report-service').value = details.service;
            container.querySelector('#sanction-report-target-type').value = details.target_type || 'message';
            container.querySelector('#sanction-report-target-id').value = details.target_id || details.message_id || '';
            container.querySelector('#sanction-report-user-id').value = details.reported_user_id || '';
            container.querySelector('#sanction-report-user').textContent = details.reported_user_name || `Usuario #${details.reported_user_id ?? '-'}`;
            container.querySelector('#sanction-duration').value = '24h';
            container.querySelector('#sanction-custom-value').value = '1';
            container.querySelector('#sanction-custom-unit').value = 'hours';
            container.querySelector('#sanction-reason').value = '';
            toggleSanctionCustomFields('24h');
            renderSanctionActions(details);
            toggleSanctionBlockAccordion(true);
            sanctionModal.classList.remove('hidden');
            sanctionModal.classList.add('flex');
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la sancion', 'error');
          }
        }

        function formatReportRows(reports) {
          if (!reports.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">No hay reportes pendientes.</td></tr>';
            return;
          }

          tbody.innerHTML = reports.map((rawReport) => {
            const report = enrichReportWithPost(rawReport);
            const preview = formatReportType(report) === 'livestream'
              ? (report.live_title || report.content_preview || 'Stream sin titulo')
              : (report.content_preview || 'Sin contenido');
            return `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-4 px-5">
                  <div class="font-semibold text-sm text-slate-900">${escapeHtml(report.reported_user_name || `Usuario #${report.reported_user_id ?? '-'}`)}</div>
                  <div class="text-xs text-slate-500">${escapeHtml(report.service === 'chat' ? 'Mensajes' : 'Publicaciones')}</div>
                </td>
                <td class="py-4 px-5 text-sm text-slate-600">${renderReportTypeBadge(report)}</td>
                <td class="py-4 px-5 text-sm text-slate-700">
                  <p class="line-clamp-2 content-break">${escapeHtml(preview)}</p>
                </td>
                <td class="py-4 px-4 text-sm text-slate-500 whitespace-nowrap">${escapeHtml(timeAgo(report.created_at))}</td>
                <td class="py-4 pl-6 pr-5">
                  <div class="flex justify-end gap-2 flex-nowrap">
                    <button type="button" data-report-review="${report.id}" class="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50">Revisar</button>
                    <button type="button" data-report-dismiss="${report.id}" class="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50">Descartar</button>
                    <button type="button" data-report-sanction="${report.id}" class="px-2.5 py-1.5 rounded-lg bg-[#1B2A6B] text-[11px] font-semibold text-white hover:bg-[#15215a]">Sancionar</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }

        function renderReportsPage() {
          const pageSlice = paginateClientItems(filteredReportRows, reportsPage, REPORTS_PER_PAGE);
          reportsPage = pageSlice.meta.currentPage;
          formatReportRows(pageSlice.items);
          renderPagination(pagination, pageSlice.meta, { summaryLabel: 'reportes' });
        }

        function applyAdminReportFilters({ resetPage = true } = {}) {
          let filtered = [...reportRows];
          const type = typeFilter.value;
          const order = orderFilter.value;
          if (type && type !== 'Todos') {
            filtered = filtered.filter((report) => formatReportType(enrichReportWithPost(report)) === type);
          }
          filtered.sort((left, right) => {
            const delta = new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
            return order === 'oldest' ? -delta : delta;
          });
          filteredReportRows = filtered;
          if (resetPage) {
            reportsPage = 1;
          }
          renderReportsPage();
        }

        async function loadReports() {
          await ensurePublicUsersLoaded();
          const [postReports, chatReports, adminPosts] = await Promise.all([
            PostsAPI.listReports('pending'),
            ChatAPI.listReports('pending'),
            PostsAPI.listAdminPosts(),
          ]);

          adminPostsById = new Map(getList(adminPosts).map((post) => [Number(post.id), post]));

          const reports = [];
          if (postReports?.ok) reports.push(...getList(postReports).map((item) => enrichReportWithPost({ ...item, service: 'posts' })));
          if (chatReports?.ok) {
            reports.push(...getList(chatReports).map((item) => {
              const relatedUser = publicUsersState.map.get(Number(item.reported_user_id));
              return {
                ...item,
                service: 'chat',
                target_type: 'message',
                target_id: item.message_id,
                reported_user_name: relatedUser ? displayName(relatedUser) : (item.reported_user_name || `Usuario #${item.reported_user_id ?? '-'}`),
              };
            }));
          }

          reports.sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
          reportRows = reports;
          applyAdminReportFilters();
        }

        container.querySelector('#go-admin-users-btn').addEventListener('click', () => router.navigate('admin'));
        container.querySelector('#go-admin-posts-btn').addEventListener('click', () => router.navigate('admin-posts'));
        typeFilter.addEventListener('change', applyAdminReportFilters);
        orderFilter.addEventListener('change', applyAdminReportFilters);
        pagination?.addEventListener('click', (event) => {
          const button = event.target.closest('[data-page]');
          if (!button) return;
          reportsPage = Number(button.dataset.page) || 1;
          renderReportsPage();
        });
        container.querySelector('#close-review-report-modal-btn').addEventListener('click', closeReviewModal);
        container.querySelector('#close-review-report-footer-btn').addEventListener('click', closeReviewModal);
        container.querySelector('#close-sanction-report-modal-btn').addEventListener('click', closeSanctionModal);
        container.querySelector('#cancel-sanction-report-btn').addEventListener('click', closeSanctionModal);
        container.querySelector('#sanction-duration').addEventListener('change', (event) => {
          toggleSanctionCustomFields(event.target.value);
        });
        reviewModal.addEventListener('click', (event) => {
          if (event.target === reviewModal) closeReviewModal();
        });
        sanctionModal.addEventListener('click', (event) => {
          if (event.target === sanctionModal) closeSanctionModal();
        });
        sanctionModal.addEventListener('change', (event) => {
          if (event.target.id === 'sanction-action-block') {
            toggleSanctionBlockAccordion(!!event.target.checked);
          }
        });
        tbody.addEventListener('click', async (event) => {
          const reviewButton = event.target.closest('[data-report-review]');
          if (reviewButton) {
            const report = reportRows.find((item) => Number(item.id) === Number(reviewButton.dataset.reportReview));
            if (report) await openReviewModal(report);
            return;
          }

          const dismissButton = event.target.closest('[data-report-dismiss]');
          if (dismissButton) {
            const report = reportRows.find((item) => Number(item.id) === Number(dismissButton.dataset.reportDismiss));
            if (!report) return;
            const api = report.service === 'chat' ? ChatAPI : PostsAPI;
            const result = await api.updateReportStatus(report.id, {
              status: 'dismissed',
              resolution_notes: null,
            });

            if (result?.ok) {
              showToast('Reporte descartado', 'success');
              await loadReports();
              return;
            }

            showToast(result?.data?.error || 'No se pudo descartar el reporte', 'error');
            return;
          }

          const sanctionButton = event.target.closest('[data-report-sanction]');
          if (sanctionButton) {
            const report = reportRows.find((item) => Number(item.id) === Number(sanctionButton.dataset.reportSanction));
            if (report) await openSanctionModal(report);
          }
        });

        sanctionForm.addEventListener('submit', async (event) => {
          event.preventDefault();

          const reportId = container.querySelector('#sanction-report-id').value;
          const service = container.querySelector('#sanction-report-service').value;
          const targetId = container.querySelector('#sanction-report-target-id').value;
          const reportedUserId = container.querySelector('#sanction-report-user-id').value;
          const durationValue = container.querySelector('#sanction-duration').value;
          const customValue = container.querySelector('#sanction-custom-value').value;
          const customUnit = container.querySelector('#sanction-custom-unit').value;
          const sanctionReason = container.querySelector('#sanction-reason').value.trim();
          const shouldBlock = container.querySelector('#sanction-action-block')?.checked ?? false;
          const shouldDeletePost = container.querySelector('#sanction-action-delete-post')?.checked ?? false;
          const shouldDeleteComment = container.querySelector('#sanction-action-delete-comment')?.checked ?? false;

          if (!shouldBlock && !shouldDeletePost && !shouldDeleteComment) {
            showToast('Selecciona al menos una accion para sancionar', 'error');
            return;
          }

          let blockPayload = { blocked_until: null, blocked_duration_value: null, blocked_duration_unit: null, is_indefinite: false };
          if (shouldBlock) {
            try {
              blockPayload = buildBlockedDurationPayload(durationValue, customValue, customUnit);
            } catch (error) {
              showToast(error.message || 'No se pudo calcular la duracion del bloqueo', 'error');
              return;
            }
          }

          if (shouldDeletePost) {
            const deletePostResult = await PostsAPI.adminDeletePost(targetId);
            if (!deletePostResult?.ok) {
              showToast(deletePostResult?.data?.error || 'No se pudo eliminar la publicacion', 'error');
              return;
            }
          }

          if (shouldDeleteComment) {
            const deleteCommentResult = await PostsAPI.adminDeleteComment(targetId);
            if (!deleteCommentResult?.ok) {
              showToast(deleteCommentResult?.data?.error || 'No se pudo eliminar el comentario', 'error');
              return;
            }
          }

          if (shouldBlock) {
            const blockResult = await AuthAPI.toggleUser(reportedUserId, {
              blocked_reason: sanctionReason || null,
              blocked_until: blockPayload.blocked_until,
              blocked_duration_value: blockPayload.blocked_duration_value,
              blocked_duration_unit: blockPayload.blocked_duration_unit,
              is_indefinite: blockPayload.is_indefinite,
            });

            if (!blockResult?.ok) {
              showToast(blockResult?.data?.error || 'No se pudo bloquear al usuario', 'error');
              return;
            }
          }

          const api = service === 'chat' ? ChatAPI : PostsAPI;
          const resolveResult = await api.updateReportStatus(reportId, {
            status: 'sanctioned',
            resolution_notes: sanctionReason || null,
          });

          if (resolveResult?.ok) {
            showToast('Sancion aplicada correctamente', 'success');
            closeSanctionModal();
            await loadReports();
            return;
          }

          showToast(resolveResult?.data?.error || 'No se pudo cerrar el reporte como sancionado', 'error');
        });

        loadReports();
      },
    },
    'admin-posts': {
      title: 'Admin publicaciones',
      activeNav: 'admin',
      adminOnly: true,
      templatePath: '/pages/admin_publicaciones.html',
      templateSlots() {
        return {
          adminPostsStatsSkeleton: renderAdminStatsSkeleton(4),
          adminPostsTableSkeleton: renderAdminTableSkeleton(4, 5),
        };
      },
      mount({ container, router }) {
        const stats = container.querySelector('#admin-post-stats');
        const tbody = container.querySelector('#admin-posts-tbody');
        const pagination = container.querySelector('#admin-posts-pagination');
        const typeFilter = container.querySelector('#admin-post-type-filter');
        const facultyFilter = container.querySelector('#admin-post-faculty-filter');
        const authorFilter = container.querySelector('#admin-post-author-filter');
        const dateFromFilter = container.querySelector('#admin-post-date-from-filter');
        const dateToFilter = container.querySelector('#admin-post-date-to-filter');
        const orderFilter = container.querySelector('#admin-post-order-filter');
        const clearFiltersButton = container.querySelector('#admin-post-clear-filters-btn');
        const commentsModal = container.querySelector('#admin-comments-modal');
        const commentPostPreview = container.querySelector('#admin-comment-post-preview');
        const commentsList = container.querySelector('#admin-comments-list');
        const commentsSort = container.querySelector('#admin-comments-sort');
        const commentsInput = container.querySelector('#admin-comment-input');
        const confirmCommentButton = container.querySelector('#admin-confirm-comment-btn');
        const adminCommentMentionController = createMentionAutocomplete(commentsInput);
        const syncCommentsSortChips = bindCommentSortChips(commentsModal, commentsSort, (value) => {
          if (!currentCommentsPostId) return;
          showComments(currentCommentsPostId, value);
        });

        let allPosts = [];
        let filteredPosts = [];
        let postsPage = 1;
        const POSTS_PER_PAGE = 30;
        let currentCommentsPostId = null;

        function closeCommentsModal() {
          currentCommentsPostId = null;
          adminCommentMentionController.clear();
          commentsModal.classList.add('hidden');
          commentsModal.classList.remove('flex');
        }

        function openCommentsModal() {
          commentsModal.classList.remove('hidden');
          commentsModal.classList.add('flex');
        }

        function renderStats(posts) {
          const total = posts.length;
          const withImages = posts.filter((item) => hasPostImage(item)).length;
          const withVideos = posts.filter((item) => hasPostVideo(item)).length;
          const comments = posts.reduce((sum, item) => sum + Number(item.comments_count || 0), 0);
          const reactions = posts.reduce((sum, item) => sum + Number(item.reactions_total || 0), 0);

          const cards = [
            { value: total, label: 'Publicaciones', color: '#4A6BFF', bg: '#EBF0FF', icon: 'article' },
            { value: withImages, label: 'Con imagen', color: '#ffffff', bg: '#D4A017', icon: 'image' },
            { value: withVideos, label: 'Con video', color: '#ffffff', bg: '#7C3AED', icon: 'videocam' },
            { value: comments, label: 'Comentarios', color: '#4A55A2', bg: '#F0F2FB', icon: 'chat_bubble' },
            { value: reactions, label: 'Reacciones', color: '#6B7280', bg: '#F3F4F6', icon: 'favorite' },
          ];

          stats.innerHTML = cards.map((card) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style="background:${card.bg}; color:${card.color}">
                <span class="material-symbols-outlined text-[24px]">${card.icon}</span>
              </div>
              <div>
                <p class="text-[28px] font-bold text-slate-900 leading-none mb-1">${card.value}</p>
                <p class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">${card.label}</p>
              </div>
            </div>
          `).join('');
        }

        function renderPosts(posts) {
          if (!posts.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400">No hay publicaciones para mostrar.</td></tr>';
            return;
          }

          tbody.innerHTML = posts.map((post) => {
            const author = resolveProfileData({
              id: post.user_id,
              user_name: post.user_name,
              user_faculty: post.user_faculty,
              user_school: post.user_school,
              user_avatar: post.user_avatar,
            });

            return `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-4 px-5">
                  <div class="flex items-center gap-3">
                    ${renderAvatar(author, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
                    <div>
                      <div class="font-bold text-sm text-slate-900">${escapeHtml(displayName(author))}</div>
                      <span class="inline-flex items-center px-2.5 py-0.5 mt-0.5 rounded-full text-[10px] font-bold text-white tracking-wide" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
                    </div>
                  </div>
                </td>
                <td class="py-4 px-5">
                  <div class="flex gap-3 items-start">
                      ${hasPostImage(post)
                        ? `<img alt="Miniatura" class="w-12 h-12 rounded-lg object-cover" src="${safeUrl(post.image_url)}" loading="lazy" decoding="async" onerror="this.style.display='none'"/>`
                        : (hasPostVideo(post)
                          ? '<div class="w-12 h-12 rounded-lg bg-slate-950 text-white flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[18px]">videocam</span></div>'
                          : '')}
                    <div class="min-w-0">
                      <p class="content-break text-sm text-slate-700 mb-1.5">${escapeHtml(((post.post_type || 'standard') === 'livestream' ? (post.live_title || 'Directo UPT') : ((post.content || '').slice(0, 140))) || 'Sin contenido')}</p>
                      <div class="flex flex-wrap gap-2">
                        <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${(post.post_type || 'standard') === 'livestream' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-sky-50 text-sky-700 border-sky-200'}"><span class="material-symbols-outlined text-[13px]">${(post.post_type || 'standard') === 'livestream' ? 'live_tv' : 'article'}</span>${(post.post_type || 'standard') === 'livestream' ? 'Stream' : 'Publicacion'}</span>
                        ${post.group_id ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium border border-amber-200"><span class="material-symbols-outlined text-[12px]">groups</span>${escapeHtml(post.group_name || `Grupo #${post.group_id}`)}</span>` : ''}
                        ${hasPostImage(post) ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] text-[#4F46E5] rounded text-[10px] font-medium border border-[#E0E7FF]"><span class="material-symbols-outlined text-[12px]">image</span>Con imagen</span>' : ''}
                        ${hasPostVideo(post) ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px] font-medium border border-violet-200"><span class="material-symbols-outlined text-[12px]">videocam</span>Con video</span>' : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="py-4 px-5 text-sm text-slate-500">${escapeHtml(timeAgo(post.created_at))}</td>
                <td class="py-4 px-5">
                  <div class="flex justify-end gap-2">
                    <button type="button" data-view-comments="${post.id}" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">visibility</span> Ver mas <span class="font-semibold ml-1">${post.comments_count || 0}</span>
                    </button>
                    <button type="button" data-delete-post="${post.id}" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-[#DC2626] hover:bg-slate-50 transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">delete</span> Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }

        function renderPostsPage() {
          const pageSlice = paginateClientItems(filteredPosts, postsPage, POSTS_PER_PAGE);
          postsPage = pageSlice.meta.currentPage;
          renderPosts(pageSlice.items);
          renderPagination(pagination, pageSlice.meta, { summaryLabel: 'publicaciones' });
        }

        function applyAdminPostFilters({ resetPage = true } = {}) {
          let filtered = [...allPosts];
          const type = typeFilter.value;
          const faculty = facultyFilter?.value || 'Todos';
          const authorQuery = normalizeSearchText(authorFilter?.value || '');
          const fromValue = dateFromFilter?.value || '';
          const toValue = dateToFilter?.value || '';
          const order = orderFilter.value;
          if (type && type !== 'Todos') {
            filtered = filtered.filter((post) => {
              const postType = String(post.post_type || 'standard');
              if (type === 'image') return hasPostImage(post);
              if (type === 'video') return hasPostVideo(post);
              if (type === 'text') return postType === 'standard' && !hasPostMedia(post);
              if (type === 'group') return !!post.group_id;
              if (type === 'live_camera') return postType === 'livestream' && (post.live_source || 'camera') === 'camera';
              if (type === 'live_screen') return postType === 'livestream' && post.live_source === 'screen';
              return postType === type;
            });
          }
          if (faculty && faculty !== 'Todos') {
            filtered = filtered.filter((post) => String(post.user_faculty || '').trim() === faculty);
          }
          if (authorQuery) {
            filtered = filtered.filter((post) => normalizeSearchText(post.user_name || '').includes(authorQuery));
          }
          if (fromValue) {
            const fromTime = new Date(`${fromValue}T00:00:00`).getTime();
            filtered = filtered.filter((post) => new Date(post.created_at || 0).getTime() >= fromTime);
          }
          if (toValue) {
            const toTime = new Date(`${toValue}T23:59:59`).getTime();
            filtered = filtered.filter((post) => new Date(post.created_at || 0).getTime() <= toTime);
          }
          if (order === 'oldest') {
            filtered.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          } else if (order === 'comments') {
            filtered.sort((a, b) => Number(b.comments_count || 0) - Number(a.comments_count || 0));
          } else {
            filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
          }
          filteredPosts = filtered;
          if (resetPage) {
            postsPage = 1;
          }
          renderPostsPage();
        }

        function clearAdminPostFilters() {
          typeFilter.value = 'Todos';
          if (facultyFilter) facultyFilter.value = 'Todos';
          if (authorFilter) authorFilter.value = '';
          if (dateFromFilter) dateFromFilter.value = '';
          if (dateToFilter) dateToFilter.value = '';
          orderFilter.value = 'newest';
          applyAdminPostFilters();
        }

        function renderFacultyFilterOptions(posts) {
          if (!facultyFilter) return;
          const faculties = [...new Set(posts.map((post) => String(post.user_faculty || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'es'));
          const currentValue = facultyFilter.value || 'Todos';
          facultyFilter.innerHTML = [
            '<option value="Todos">Facultad: Todas</option>',
            ...faculties.map((faculty) => `<option value="${escapeHtml(faculty)}">${escapeHtml(faculty)}</option>`),
          ].join('');
          facultyFilter.value = faculties.includes(currentValue) ? currentValue : 'Todos';
        }

        async function loadPosts() {
          await ensurePublicUsersLoaded();
          const result = await PostsAPI.listAdminPosts();
          if (!result?.ok) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400">No se pudieron cargar las publicaciones.</td></tr>';
            pagination?.classList.add('hidden');
            return;
          }

          allPosts = getList(result);
          renderFacultyFilterOptions(allPosts);
          renderStats(allPosts);
          applyAdminPostFilters();
        }

        async function showComments(postId, sort = commentsSort.value || 'newest') {
          currentCommentsPostId = Number(postId);
          commentsSort.value = sort;
          syncCommentsSortChips(sort);
          openCommentsModal();
          const selectedPost = allPosts.find((post) => Number(post.id) === currentCommentsPostId);
          commentPostPreview.innerHTML = renderPostModalPreview(selectedPost, appState.user?.id);
          // Re-sync adaptive video heights once modal layout has settled
          setTimeout(() => refreshAdaptiveMediaFrames(), 80);
          setTimeout(() => refreshAdaptiveMediaFrames(), 320);
          commentsList.innerHTML = '<p class="text-slate-400 text-sm text-center">Cargando comentarios...</p>';

          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          const comments = getList(result);

          if (!result?.ok) {
            commentsList.innerHTML = '<p class="text-slate-400 text-sm text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          if (!comments.length) {
            commentsList.innerHTML = '<p class="text-slate-400 text-sm text-center">No hay comentarios para esta publicacion.</p>';
            return;
          }

          commentsList.innerHTML = comments.map((comment) => renderCommentCard(comment, {
            deleteAction: 'delete-admin-comment',
          })).join('');
          refreshRelativeTimeLabels(commentsList);
        }

        async function confirmAdminComment() {
          const content = commentsInput.value.trim();
          const mentionUserIds = adminCommentMentionController.collectMentionUserIds();
          if (!currentCommentsPostId || !content) return;

          confirmCommentButton.disabled = true;
          const result = await PostsAPI.addComment(currentCommentsPostId, content, mentionUserIds);
          confirmCommentButton.disabled = false;

          if (result?.ok) {
            showToast('Comentario anadido', 'success');
            commentsInput.value = '';
            commentsInput.style.height = '';
            adminCommentMentionController.clear();
            await loadPosts();
            await showComments(currentCommentsPostId, commentsSort.value);
            return;
          }

          showToast(result?.data?.error || 'Error al comentar', 'error');
        }

        container.querySelector('#go-admin-users-btn').addEventListener('click', () => router.navigate('admin'));
        container.querySelector('#go-admin-reports-btn').addEventListener('click', () => router.navigate('admin-reports'));
        typeFilter.addEventListener('change', applyAdminPostFilters);
        facultyFilter?.addEventListener('change', applyAdminPostFilters);
        authorFilter?.addEventListener('input', applyAdminPostFilters);
        dateFromFilter?.addEventListener('change', applyAdminPostFilters);
        dateToFilter?.addEventListener('change', applyAdminPostFilters);
        orderFilter.addEventListener('change', applyAdminPostFilters);
        clearFiltersButton?.addEventListener('click', clearAdminPostFilters);
        pagination?.addEventListener('click', (event) => {
          const button = event.target.closest('[data-page]');
          if (!button) return;
          postsPage = Number(button.dataset.page) || 1;
          renderPostsPage();
        });
        container.querySelector('#close-comments-modal-btn').addEventListener('click', closeCommentsModal);
        confirmCommentButton.addEventListener('click', confirmAdminComment);
        commentsInput.addEventListener('keydown', async (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await confirmAdminComment();
          }
        });
        commentsInput.addEventListener('input', () => {
          commentsInput.style.height = 'auto';
          commentsInput.style.height = `${Math.min(commentsInput.scrollHeight, 96)}px`;
        });
        commentsSort.addEventListener('change', () => {
          if (!currentCommentsPostId) return;
          showComments(currentCommentsPostId, commentsSort.value);
        });
        commentsModal.addEventListener('click', (event) => {
          if (event.target === commentsModal) closeCommentsModal();
        });

        tbody.addEventListener('click', async (event) => {
          const commentsButton = event.target.closest('[data-view-comments]');
          if (commentsButton) {
            showComments(commentsButton.dataset.viewComments);
            return;
          }

          const deleteButton = event.target.closest('[data-delete-post]');
          if (!deleteButton) return;
          const confirmed = await confirmAction({
            title: 'Eliminar publicacion',
            copy: 'La publicacion se eliminara y no podra recuperarse.',
            acceptLabel: 'Eliminar',
            tone: 'danger',
          });
          if (!confirmed) return;

          const result = await PostsAPI.adminDeletePost(deleteButton.dataset.deletePost);
          if (result?.ok) {
            showToast('Publicacion eliminada', 'success');
            loadPosts();
            return;
          }
          showToast(result?.data?.error || 'No se pudo eliminar la publicacion', 'error');
        });

        commentsList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (!button || !currentCommentsPostId) return;

          if (button.dataset.action === 'open-profile') {
            event.preventDefault();
            hideMentionProfilePopover();
            router.navigate('profile', { id: button.dataset.userId });
            return;
          }

          if (button.dataset.action === 'open-reaction-picker') {
            openReactionPicker(button, {
              targetType: 'comment',
              targetId: Number(button.dataset.targetId),
              currentReaction: button.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                button.dataset.currentReaction = reaction;
                button.classList.add('is-active');
                button.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
                closeReactionPicker();

                const result = await PostsAPI.reactComment(Number(button.dataset.targetId), reaction);
                if (!result?.ok) {
                  showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
                  await showComments(currentCommentsPostId, commentsSort.value);
                  return;
                }
                showComments(currentCommentsPostId, commentsSort.value).catch(() => { });
              },
            });
            return;
          }

          if (button.dataset.action === 'report-comment') {
            await reportContent('comentario', Number(button.dataset.commentId));
            return;
          }

          const deleteCommentButton = button.dataset.action === 'delete-admin-comment' ? button : null;
          if (!deleteCommentButton) return;

          const result = await PostsAPI.adminDeleteComment(deleteCommentButton.dataset.commentId);
          if (result?.ok) {
            showToast('Comentario eliminado', 'success');
            await loadPosts();
            await showComments(currentCommentsPostId, commentsSort.value);
            return;
          }

          showToast(result?.data?.error || 'No se pudo eliminar el comentario', 'error');
        });

        commentsList.addEventListener('mouseover', (event) => {
          const trigger = event.target.closest('[data-action="open-reaction-picker"]');
          if (!trigger || !isDesktopClient() || !currentCommentsPostId) return;
          if (pointerWithinReactionZone(event.relatedTarget, trigger)) return;
          clearReactionPickerCloseTimer();
          openReactionPicker(trigger, {
            targetType: 'comment',
            targetId: Number(trigger.dataset.targetId),
            currentReaction: trigger.dataset.currentReaction || '',
            onSelect: async (reaction) => {
              trigger.dataset.currentReaction = reaction;
              trigger.classList.add('is-active');
              trigger.innerHTML = `${renderReactionAsset(reaction)}<span>${escapeHtml(REACTION_META[reaction]?.label || 'Reaccionar')}</span>`;
              closeReactionPicker();

              const result = await PostsAPI.reactComment(Number(trigger.dataset.targetId), reaction);
              if (!result?.ok) {
                showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
                await showComments(currentCommentsPostId, commentsSort.value);
                return;
              }
              showComments(currentCommentsPostId, commentsSort.value).catch(() => { });
            },
          });
        });

        commentsList.addEventListener('mouseout', (event) => {
          const trigger = event.target.closest('[data-action="open-reaction-picker"]');
          if (!trigger || !isDesktopClient()) return;
          if (pointerWithinReactionZone(event.relatedTarget, trigger)) return;
          scheduleReactionPickerClose();
        });

        commentPostPreview.addEventListener('click', async (event) => {
          const actionTarget = event.target.closest('[data-action]');
          if (!actionTarget || !currentCommentsPostId) return;
          if (await handleSharePublicPostAction(actionTarget)) return;

          if (actionTarget.dataset.action === 'open-profile') {
            router.navigate('profile', { id: actionTarget.dataset.userId });
            return;
          }

          if (actionTarget.dataset.action === 'open-post-image') {
            openPostImageLightbox(actionTarget.dataset.imageUrl, actionTarget.dataset.imageAlt || 'Imagen ampliada de la publicacion');
            return;
          }

          if (actionTarget.dataset.action === 'report-post') {
            await reportContent('publicacion', Number(actionTarget.dataset.postId));
            return;
          }

          if (actionTarget.dataset.action === 'open-reaction-picker') {
            openReactionPicker(actionTarget, {
              targetType: 'post',
              targetId: Number(actionTarget.dataset.targetId),
              currentReaction: actionTarget.dataset.currentReaction || '',
              onSelect: async (reaction) => {
                const result = await PostsAPI.reactPost(Number(actionTarget.dataset.targetId), reaction);
                if (result?.ok) {
                  await loadPosts();
                  const selectedPost = allPosts.find((post) => Number(post.id) === currentCommentsPostId);
                  commentPostPreview.innerHTML = renderPostModalPreview(selectedPost, appState.user?.id);
                  return;
                }
                showToast(result?.data?.error || 'No se pudo reaccionar a la publicacion', 'error');
              },
            });
          }
        });

        loadPosts();
        return () => {
          adminCommentMentionController.destroy();
        };
      },
    },
  };

  views.messages.mount = initMessagesView;

  function applyViewShellMode(view) {
    const isPublicReadonly = view?.publicReadonly === true;
    document.body.classList.toggle('guest-shared-post-page', isPublicReadonly);
  }

  const AppRouter = {
    currentRoute: null,
    navigate(route, params = {}, options = {}) {
      if (route === 'live') {
        const nextLiveId = Number(params?.id);
        if (!Number.isFinite(nextLiveId) || nextLiveId <= 0) {
          return;
        }
        params = { ...params, id: String(nextLiveId) };
      }
      const targetHash = buildHash(route, params);
      const targetUrl = `${window.location.pathname}${targetHash}`;

      if (options.replace) {
        window.history.replaceState(null, '', targetUrl);
      } else {
        window.history.pushState(null, '', targetUrl);
      }

      this.render();
    },
    async render() {
      const parsed = parseRoute();
      const view = views[parsed.route] || views.feed;
      applyViewShellMode(view);

      if (view.adminOnly && appState.user.role !== 'admin') {
        showToast('No tienes acceso a esa seccion', 'error');
        this.navigate('feed', {}, { replace: true });
        return;
      }

      if (appState.cleanup) {
        try {
          appState.cleanup();
        } catch (error) {
          console.error('Cleanup error:', error);
        }
        appState.cleanup = null;
      }

      this.currentRoute = parsed;
      appView.innerHTML = await resolveViewMarkup(view, { user: appState.user, params: parsed.params, router: this });
      if (sidebar && !view.publicReadonly) {
        sidebar.setAttribute('active-nav', view.activeNav || parsed.route);
      }
      if (window.setupLayoutData && !view.publicReadonly) window.setupLayoutData(appState.user);
      setDocumentTitle(view.title || parsed.route);

      if (view.mount) {
        const cleanup = await view.mount({
          container: appView,
          user: appState.user,
          params: parsed.params,
          router: this,
        });
        appState.cleanup = typeof cleanup === 'function' ? cleanup : null;
      }
    },
  };

  async function bootstrapGlobalCallManager() {
    if (window.__uptCallManager?.id) {
      return;
    }

    const host = document.createElement('div');
    host.id = 'global-call-runtime-host';
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = await resolveViewMarkup(views.messages, {
      user: appState.user,
      params: {},
      router: AppRouter,
    });
    document.body.appendChild(host);

    const cleanup = initMessagesView({
      container: host,
      user: appState.user,
      params: {},
      callManagerOnly: true,
    });

    if (typeof cleanup === 'function') {
      window.__uptCallManagerCleanup = cleanup;
    }
  }

  function startGlobalIncomingCallWatcher() {
    if (globalIncomingCallPollTimer) {
      return;
    }

    globalIncomingCallPollTimer = window.setInterval(async () => {
      if (document.hidden || globalIncomingCallPollInFlight) {
        return;
      }

      if (window.__uptGlobalCallRuntime?.isActive?.()) {
        return;
      }

      globalIncomingCallPollInFlight = true;
      try {
        await window.__uptCallManager?.pollPendingCallsOnce?.();
      } finally {
        globalIncomingCallPollInFlight = false;
      }
    }, GLOBAL_INCOMING_CALL_POLL_INTERVAL_MS);
  }

  function startNotificationsPolling() {
    if (notificationsState.polling) return;
    notificationsState.polling = window.setInterval(() => {
      if (document.hidden) return;
      if (typeof window.loadNotifications === 'function') {
        window.loadNotifications();
      }
    }, 20000);
  }

  window.AppRouter = AppRouter;

  document.addEventListener('click', (event) => {
    const shareButton = event.target.closest?.('[data-action="share-public-post"]');
    if (!shareButton) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    handleSharePublicPostAction(shareButton);
  });

  window.addEventListener('hashchange', () => {
    closeReactionPicker();
    AppRouter.render();
  });

  if (!window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${buildHash('feed')}`);
  }

  const initialRoute = parseRoute();
  const initialView = views[initialRoute.route] || views.feed;
  const shouldBootAuthenticatedRuntime = isLoggedIn();
  prewarmViewTemplates([
    initialView?.templatePath,
    views.feed?.templatePath,
    views.messages?.templatePath,
    views.live?.templatePath,
  ]);
  scheduleNonCriticalViewTemplateWarmup(
    Object.values(views).map((view) => view?.templatePath).filter(Boolean),
  );

  if (window.setupLayoutData && shouldBootAuthenticatedRuntime && !initialView?.publicReadonly) window.setupLayoutData(appState.user);
  if (shouldBootAuthenticatedRuntime) {
    startGlobalIncomingCallWatcher();
    startNotificationsPolling();
  }
  ensureSocialVideoBindings();
  ensureAdaptivePostMediaBindings();
  AppRouter.render();
  window.requestAnimationFrame(() => refreshAdaptiveMediaFrames());
  if (shouldBootAuthenticatedRuntime) {
    bootstrapGlobalCallManager().catch((error) => {
      console.error('Global call manager bootstrap error:', error);
    });
  }
})().catch((error) => {
  console.error('App bootstrap error:', error);
  const appView = document.getElementById('app-view');
  if (appView) {
    appView.innerHTML = `
      <div class="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
        <h2 class="text-base font-bold text-red-600 mb-2">No se pudo iniciar la aplicacion</h2>
        <p class="text-sm text-slate-600">Recarga la pagina. Si el problema continua, vuelve a iniciar sesion.</p>
      </div>
    `;
  }
});
