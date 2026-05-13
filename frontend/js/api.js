/* ================================================================
   UPT Connect — API Client
   Centraliza todas las llamadas a los 4 microservicios
================================================================= */

const API = {
  auth:   '/api',
  posts:  '/api/posts',
  social: '/api',
  chat:   '/api/chat',
};

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    const encoded = Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('');

    return JSON.parse(decodeURIComponent(encoded));
  } catch (error) {
    console.warn('No se pudo decodificar el JWT local:', error);
    return null;
  }
}

function buildUserFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const numericId = Number(payload.sub);
  const id = Number.isFinite(numericId) ? numericId : payload.sub;

  return {
    id,
    email: payload.email || '',
    name: payload.name || payload.full_name || 'Usuario',
    full_name: payload.full_name || payload.name || 'Usuario',
    avatar_url: payload.avatar_url || null,
    faculty: payload.faculty || '',
    career: payload.career || payload.school || '',
    school: payload.school || payload.career || '',
    area: payload.area || '',
    position_title: payload.position_title || '',
    role: payload.role || 'user',
  };
}

/* ── Token helpers ───────────────────────────────────────────── */
function getToken() { return localStorage.getItem('upt_token'); }
function getBlockedNotice() {
  const raw = localStorage.getItem('upt_blocked_notice');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem('upt_blocked_notice');
    return null;
  }
}
function setBlockedNotice(reason = null, blockedUntil = null, isIndefinite = false) {
  localStorage.setItem('upt_blocked_notice', JSON.stringify({
    reason: reason || null,
    blocked_until: blockedUntil || null,
    is_indefinite: !!isIndefinite,
    created_at: new Date().toISOString(),
  }));
}
function clearBlockedNotice() {
  localStorage.removeItem('upt_blocked_notice');
}
function getUser()  {
  const u = localStorage.getItem('upt_user');
  if (!u) return buildUserFromToken(getToken());

  try {
    const parsed = JSON.parse(u);
    return parsed && typeof parsed === 'object' ? parsed : buildUserFromToken(getToken());
  } catch (error) {
    console.warn('No se pudo leer upt_user desde localStorage:', error);
    localStorage.removeItem('upt_user');
    return buildUserFromToken(getToken());
  }
}
function isLoggedIn() { return !!getToken(); }
function clearSession() {
  localStorage.removeItem('upt_token');
  localStorage.removeItem('upt_user');
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

/* Normaliza respuesta: array directo o {data:[...]} paginado */
function getList(result) {
  if (!result || !result.ok) return [];
  if (Array.isArray(result.data)) return result.data;
  if (result.data && Array.isArray(result.data.data)) return result.data.data;
  return [];
}

function buildResponseData(res, text) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    const normalized = text
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      error: normalized || (res.ok ? 'Respuesta vacia del servidor' : `Error ${res.status}`),
      raw: text,
    };
  }
}

/* ── Generic fetch (JSON) ────────────────────────────────────── */
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      logout();
      return { ok: false, status: 401, data: { error: 'Sesion expirada' } };
    }
    const text = await res.text();
    const data = buildResponseData(res, text);
    if (res.status === 403 && data?.code === 'ACCOUNT_BLOCKED') {
      setBlockedNotice(data.reason || null, data.blocked_until || null, !!data.is_indefinite);
      clearSession();
      window.location.href = '/index.html';
      return { ok: false, status: 403, data };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error('API error:', e);
    return { ok: false, data: { error: 'Error de conexion' } };
  }
}

/* ── Generic fetch (multipart/FormData) ──────────────────────── */
async function apiFetchForm(url, formData, options = {}) {
  try {
    const res = await fetch(url, {
      method: options.method || 'POST',
      ...options,
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        ...(options.headers || {}),
      },
      body: formData,
    });
    if (res.status === 401) {
      logout();
      return { ok: false, status: 401, data: { error: 'Sesion expirada' } };
    }
    const text = await res.text();
    const data = buildResponseData(res, text);
    if (res.status === 403 && data?.code === 'ACCOUNT_BLOCKED') {
      setBlockedNotice(data.reason || null, data.blocked_until || null, !!data.is_indefinite);
      clearSession();
      window.location.href = '/index.html';
      return { ok: false, status: 403, data };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error('API error (form):', e);
    return { ok: false, data: { error: 'Error de conexion' } };
  }
}

/* ── Auth Service ─────────────────────────────────────────────── */
const AuthAPI = {
  googleLogin: (idToken) => apiFetch(`${API.auth}/auth/google`, {
    method: 'POST', body: JSON.stringify({ id_token: idToken })
  }),
  completeProfile: (data) => apiFetch(`${API.auth}/auth/complete-profile`, {
    method: 'POST', body: JSON.stringify(data)
  }),
  getProfile: (userId) => {
    if (!userId) return apiFetch(`${API.auth}/auth/me`);
    return apiFetch(`${API.auth}/auth/users/${userId}`);
  },
  touchPresence: () => apiFetch(`${API.auth}/auth/presence`, {
    method: 'POST'
  }),
  updateProfile: (data) => {
    if (data instanceof FormData) {
      return apiFetchForm(`${API.auth}/auth/profile`, data);
    }
    return apiFetch(`${API.auth}/auth/profile`, {
      method: 'PUT', body: JSON.stringify(data)
    });
  },
  updateAcademic: (userId, data) => apiFetch(`${API.auth}/auth/admin/users/${userId}/academic`, {
    method: 'PUT', body: JSON.stringify(data)
  }),
  updateUserRole: (userId, role) => apiFetch(`${API.auth}/auth/admin/users/${userId}/role`, {
    method: 'PUT', body: JSON.stringify({ role })
  }),
  toggleUser: (userId, data = {}) => apiFetch(`${API.auth}/auth/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  listUsers: (params = '') => apiFetch(`${API.auth}/auth/users?${params}`),
  listPublicUsers: (params = '') => apiFetch(`${API.auth}/auth/users?${params}`),
  listAdminUsers: (params = '') => apiFetch(`${API.auth}/auth/admin/users${params ? `?${params}` : ''}`),
};

/* ── Posts Service ────────────────────────────────────────────── */
const PostsAPI = {
  getFeed: async (page = 1) => {
    let friendIds = [];
    const friendsResult = await SocialAPI.getFriends();
    if (friendsResult?.ok) {
      friendIds = getList(friendsResult)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    }

    const currentUser = getUser();
    return apiFetch(`${API.posts}?page=${page}`, {
      headers: {
        'X-Friend-Ids': JSON.stringify(friendIds),
        'X-User-Faculty': currentUser?.faculty || '',
      },
    });
  },

  // Crea un post. Si imageFile es un File, usa multipart; si no, usa JSON.
  createPost: ({ content, imageFile, visibility = 'all' }) => {
    if (imageFile) {
      const fd = new FormData();
      if (content) fd.append('content', content);
      fd.append('image', imageFile);
      fd.append('visibility', visibility);
      return apiFetchForm(`${API.posts}`, fd);
    }
    return apiFetch(`${API.posts}`, {
      method: 'POST',
      body: JSON.stringify({ content, visibility }),
    });
  },
  createLivestream: ({ liveTitle, content = '', visibility = 'all', liveSource = 'camera', streamKey, playbackUrl }) => apiFetch(`/api/livestreams`, {
    method: 'POST',
    body: JSON.stringify({
      live_title: liveTitle,
      content,
      visibility,
      live_source: liveSource,
      stream_key: streamKey,
      playback_url: playbackUrl,
    }),
  }),
  getActiveLivestreams: () => apiFetch(`/api/livestreams/active`, {
    headers: {
      ...authHeaders(),
      'X-Friend-Ids': JSON.stringify((window.__friendIdsCache || [])),
      'X-User-Faculty': getUser()?.faculty || '',
    },
  }),
  getLivestream: (id) => apiFetch(`/api/livestreams/${id}`),
  endLivestream: (id, durationSeconds = 0) => apiFetch(`/api/livestreams/${id}/end`, {
    method: 'PUT',
    body: JSON.stringify({ duration_seconds: durationSeconds }),
  }),
  livestreamHeartbeat: (id) => apiFetch(`/api/livestreams/${id}/heartbeat`, { method: 'POST' }),
  reactLivestream: (id, reactionType) => apiFetch(`/api/livestreams/${id}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ reaction_type: reactionType }),
  }),
  getLivestreamEvents: (id, after = 0) => apiFetch(`/api/livestreams/${id}/events?after=${after}`),

  deletePost: (id) => apiFetch(`${API.posts}/${id}`, { method: 'DELETE' }),
  adminDeletePost: (id) => apiFetch(`${API.posts}/${id}/admin`, { method: 'DELETE' }),
  likePost: (id) => apiFetch(`${API.posts}/${id}/like`, { method: 'POST' }),
  reactPost: (id, reactionType = 'me_gusta') => apiFetch(`${API.posts}/${id}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ reaction_type: reactionType }),
  }),
  getComments: (postId, sort = 'oldest') => apiFetch(`${API.posts}/${postId}/comments?sort=${encodeURIComponent(sort)}`),
  addComment: (postId, content) => apiFetch(`${API.posts}/${postId}/comments`, {
    method: 'POST', body: JSON.stringify({ content })
  }),
  likeComment: (commentId) => apiFetch(`/api/comments/${commentId}/like`, { method: 'POST' }),
  reactComment: (commentId, reactionType = 'me_gusta') => apiFetch(`/api/comments/${commentId}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ reaction_type: reactionType }),
  }),
  deleteComment: (_postId, commentId) => apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' }),
  adminDeleteComment: (commentId) => apiFetch(`/api/comments/${commentId}/admin`, { method: 'DELETE' }),
  reportPost: (id, reason = null) => apiFetch(`${API.posts}/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  reportComment: (id, reason = null) => apiFetch(`/api/comments/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  listReports: (status = '') => apiFetch(`${API.posts}/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getReportDetails: (reportId) => apiFetch(`${API.posts}/admin/reports/${reportId}`),
  updateReportStatus: (reportId, payload) => apiFetch(`${API.posts}/admin/reports/${reportId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  getGroupPosts: (groupId) => apiFetch(`/api/group-posts/${groupId}`),
  createGroupPost: (groupId, { content, imageFile }) => {
    if (imageFile) {
      const fd = new FormData();
      if (content) fd.append('content', content);
      fd.append('image', imageFile);
      return apiFetchForm(`/api/group-posts/${groupId}`, fd);
    }

    return apiFetch(`/api/group-posts/${groupId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },
  getGroupMedia: (groupId) => apiFetch(`/api/group-posts/${groupId}/media`),
};

/* ── Social Service ───────────────────────────────────────────── */
const SocialAPI = {
  getDirectory: (params = '') => apiFetch(`/api/directory?${params}`),
  searchDirectory: (query) => apiFetch(`/api/directory/search?q=${encodeURIComponent(query)}`),
  getBlockedDirectory: () => apiFetch(`/api/directory/blocked`),
  getFriends: () => apiFetch(`/api/friends`),
  getPendingRequests: () => apiFetch(`/api/friends/pending`),
  sendRequest: (receiverId) => apiFetch(`/api/friends/request`, {
    method: 'POST', body: JSON.stringify({ receiver_id: receiverId })
  }),
  acceptRequest: (requestId) => apiFetch(`/api/friends/${requestId}/accept`, { method: 'PUT' }),
  rejectRequest: (requestId) => apiFetch(`/api/friends/${requestId}/reject`, { method: 'PUT' }),
  removeFriend: (friendId) => apiFetch(`/api/friends/${friendId}`, { method: 'DELETE' }),
  getBlockedUsers: () => apiFetch(`/api/blocks`),
  getBlockContext: () => apiFetch(`/api/blocks/context`),
  blockUser: (userId) => apiFetch(`/api/blocks/${userId}`, { method: 'POST' }),
  unblockUser: (userId) => apiFetch(`/api/blocks/${userId}`, { method: 'DELETE' }),
  discoverGroups: (query = '') => apiFetch(`/api/groups/discover${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  getMyGroups: () => apiFetch(`/api/groups/mine`),
  createGroup: ({ name, description, privacy, coverFile = null }) => {
    if (coverFile) {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('description', description || '');
      fd.append('privacy', privacy);
      fd.append('cover', coverFile);
      return apiFetchForm(`/api/groups`, fd);
    }

    return apiFetch(`/api/groups`, {
      method: 'POST',
      body: JSON.stringify({ name, description, privacy }),
    });
  },
  getGroup: (groupId) => apiFetch(`/api/groups/${groupId}`),
  joinGroup: (groupId) => apiFetch(`/api/groups/${groupId}/join`, { method: 'POST' }),
  leaveGroup: (groupId) => apiFetch(`/api/groups/${groupId}/leave`, { method: 'POST' }),
  updateGroup: (groupId, { name, description, privacy, coverFile = null }) => {
    if (coverFile) {
      const fd = new FormData();
      if (name !== undefined) fd.append('name', name);
      if (description !== undefined) fd.append('description', description);
      if (privacy !== undefined) fd.append('privacy', privacy);
      fd.append('cover', coverFile);
      return apiFetchForm(`/api/groups/${groupId}`, fd, { method: 'PUT' });
    }

    return apiFetch(`/api/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description, privacy }),
    });
  },
  getGroupMembers: (groupId) => apiFetch(`/api/groups/${groupId}/members`),
  getGroupRequests: (groupId) => apiFetch(`/api/groups/${groupId}/requests`),
  approveGroupRequest: (groupId, requestId) => apiFetch(`/api/groups/${groupId}/requests/${requestId}/approve`, { method: 'PUT' }),
  rejectGroupRequest: (groupId, requestId) => apiFetch(`/api/groups/${groupId}/requests/${requestId}/reject`, { method: 'PUT' }),
  updateGroupMemberRole: (groupId, userId, role) => apiFetch(`/api/groups/${groupId}/members/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  }),
  removeGroupMember: (groupId, userId) => apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
};

/* ── Chat Service ─────────────────────────────────────────────── */
const ChatAPI = {
  getInbox: () => apiFetch(`${API.chat}/inbox`),
  getConversation: (userId, limit = 50) => apiFetch(`${API.chat}/messages/${userId}?limit=${limit}`),
  sendMessage: ({ receiverId, content = '', imageFile = null, imageUrl = null }) => {
    if (imageFile) {
      const fd = new FormData();
      fd.append('receiver_id', receiverId);
      if (content) fd.append('content', content);
      fd.append('image', imageFile);
      return apiFetchForm(`${API.chat}/messages`, fd);
    }

    return apiFetch(`${API.chat}/messages`, {
      method: 'POST',
      body: JSON.stringify({ receiver_id: receiverId, content, image_url: imageUrl }),
    });
  },
  reportMessage: (messageId, reason = null) => apiFetch(`${API.chat}/messages/${messageId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  listReports: (status = '') => apiFetch(`${API.chat}/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getReportDetails: (reportId) => apiFetch(`${API.chat}/admin/reports/${reportId}`),
  updateReportStatus: (reportId, payload) => apiFetch(`${API.chat}/admin/reports/${reportId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  startCall: ({ receiverId, mode = 'audio' }) => apiFetch(`${API.chat}/calls`, {
    method: 'POST',
    body: JSON.stringify({ receiver_id: receiverId, mode }),
  }),
  getPendingCalls: () => apiFetch(`${API.chat}/calls/pending`),
  getCall: (callId) => apiFetch(`${API.chat}/calls/${callId}`),
  acceptCall: (callId) => apiFetch(`${API.chat}/calls/${callId}/accept`, { method: 'PUT' }),
  rejectCall: (callId) => apiFetch(`${API.chat}/calls/${callId}/reject`, { method: 'PUT' }),
  endCall: (callId, durationSeconds = 0) => apiFetch(`${API.chat}/calls/${callId}/end`, {
    method: 'PUT',
    body: JSON.stringify({ duration_seconds: durationSeconds }),
  }),
  updateCallMode: (callId, mode) => apiFetch(`${API.chat}/calls/${callId}/mode`, {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  }),
  sendCallSignal: (callId, signalType, payload = null) => apiFetch(`${API.chat}/calls/${callId}/signal`, {
    method: 'POST',
    body: JSON.stringify({ signal_type: signalType, payload }),
  }),
  getCallSignals: (callId, after = 0) => apiFetch(`${API.chat}/calls/${callId}/signals?after=${after}`),
};

/* ── Auth actions ─────────────────────────────────────────────── */
function saveSession(token, user) {
  localStorage.setItem('upt_token', token);
  localStorage.setItem('upt_user', JSON.stringify(user));
}

function updateStoredUser(patch) {
  const current = getUser() || {};
  const updated = { ...current, ...patch };
  localStorage.setItem('upt_user', JSON.stringify(updated));
  return updated;
}

function logout() {
  clearBlockedNotice();
  clearSession();
  window.location.href = '/index.html';
}

/* ── Faculty color helper ─────────────────────────────────────── */
const FACULTY_COLORS = {
  'FAING':    '#6B1B1B',
  'FACEM':    '#1B6B2A',
  'FAEDCOH':  '#1B2A6B',
  'FADE':     '#1B8BC9',
  'FACSA':    '#6B1B6B',
  'FAU':      '#C96B1B',
};

// Also map school names to faculty for backwards compatibility
const SCHOOL_TO_FACULTY = {
  'Ingeniería Civil': 'FAING', 'Ingeniería de Sistemas': 'FAING',
  'Ingeniería Electrónica': 'FAING', 'Ingeniería Agroindustrial': 'FAING',
  'Ingeniería Ambiental': 'FAING', 'Ingeniería Industrial': 'FAING',
  'Ciencias Contables y Financieras': 'FACEM', 'Ingeniería Comercial': 'FACEM',
  'Administración de Negocios Internacionales': 'FACEM',
  'Administración Turístico Hotelera': 'FACEM', 'Economía y Microfinanzas': 'FACEM',
  'Educación': 'FAEDCOH', 'Ciencias de la Comunicación': 'FAEDCOH',
  'Psicología': 'FAEDCOH', 'Humanidades': 'FAEDCOH',
  'Derecho': 'FADE',
  'Medicina Humana': 'FACSA', 'Odontología': 'FACSA',
  'Tecnología Médica: Laboratorio Clínico y Anatomía Patológica': 'FACSA',
  'Tecnología Médica: Terapia Física y Rehabilitación': 'FACSA',
  'Arquitectura': 'FAU',
};

function getFacultyColor(facultyOrSchool) {
  if (!facultyOrSchool) return '#1B2A6B';
  // Direct faculty sigla match
  if (FACULTY_COLORS[facultyOrSchool]) return FACULTY_COLORS[facultyOrSchool];
  // School name match
  const faculty = SCHOOL_TO_FACULTY[facultyOrSchool];
  if (faculty) return FACULTY_COLORS[faculty];
  return '#1B2A6B';
}

function initials(name) {
  if (!name) return 'U';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function getDisplayName(userOrName) {
  if (!userOrName) return 'Usuario';
  if (typeof userOrName === 'string') return userOrName;
  return userOrName.full_name || userOrName.name || 'Usuario';
}

function getCareerLabel(user) {
  if (!user) return '';
  return user.school || user.career || user.area || user.position_title || '';
}

function formatAcademicCycle(value, short = false) {
  if (!value) return '';

  const raw = String(value).trim();
  const compact = raw.toUpperCase();
  const numeric = Number.parseInt(raw, 10);

  if (Number.isInteger(numeric) && numeric > 0) {
    return short ? `${numeric}vo Ciclo` : `${numeric}vo ciclo`;
  }

  const romanMap = {
    I: 1, II: 2, III: 3, IV: 4, V: 5,
    VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  };

  if (romanMap[compact]) {
    return short ? `${compact} Ciclo` : `${compact} ciclo`;
  }

  return raw;
}

/* ── Toast ────────────────────────────────────────────────────── */
function showToast(msg, type = '') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
      toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

/* ── Guard: redirect to login if not authenticated ────────────── */
function requireAuth() {
  if (!isLoggedIn()) { window.location.href = '/index.html'; }
}

/* ── Activity-based JWT refresh ──────────────────────────────── */
(function initTokenRefresh() {
  let lastActivity = Date.now();

  // Track user activity
  const activityEvents = ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'];
  const markActivity = () => { lastActivity = Date.now(); };
  activityEvents.forEach(evt => document.addEventListener(evt, markActivity, { passive: true }));

  // Check session state every 1 minute
  setInterval(async () => {
    if (!isLoggedIn()) return;

    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 min in ms
    // Skip inactivity logout if user is in a livestream (watching or streaming)
    const isInLive = document.body.classList.contains('live-immersive-active')
                  || !!document.querySelector('#live-shell')
                  || window.location.hash?.includes('/live/');
    if (!isInLive && Date.now() - lastActivity >= INACTIVITY_LIMIT) {
      logout();
      return;
    }

    const token = getToken();
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return;

    const now = Math.floor(Date.now() / 1000);
    const timeLeft = payload.exp - now;
    const REFRESH_THRESHOLD = 30 * 60; // refresh if less than 30 min left

    if (timeLeft < REFRESH_THRESHOLD) {
      try {
        const res = await fetch(`${API.auth}/auth/refresh`, {
          method: 'POST',
          headers: authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            saveSession(data.token, data.user || getUser());
          }
        }
      } catch (e) {
        // Silent fail — will retry next interval
      }
    }
  }, 60 * 1000); // every 1 minute
})();

/* ── Guard: redirect to feed if already authenticated ─────────── */
function requireGuest() {
  if (getBlockedNotice()) {
    if (!isLoggedIn()) return;
    clearBlockedNotice();
  }
  if (!isLoggedIn()) return;

  const user = getUser();
  if (user && user.is_profile_complete === false) {
    window.location.href = '/pages/onboarding.html';
    return;
  }

  window.location.href = '/app.html#feed';
}

/* ── Notifications (friend requests) ─────────────────────────── */
async function loadNotifications() {
  const list = document.getElementById('notifications-list');
  if (!list) return;
  list.innerHTML = '<div class="px-4 py-6 text-sm text-slate-500 text-center">Cargando...</div>';

  const [result, usersResult] = await Promise.all([
    SocialAPI.getPendingRequests(),
    AuthAPI.listPublicUsers(),
  ]);
  const requests = getList(result);
  const usersById = new Map(getList(usersResult).map((item) => [Number(item.id), item]));
  if (result && result.ok) {
    if (requests.length === 0) {
      list.innerHTML = '<div class="px-4 py-6 text-sm text-slate-500 text-center">No tienes notificaciones pendientes</div>';
      const badge = document.getElementById('notif-badge');
      if (badge) badge.classList.add('hidden');
    } else {
      const badge = document.getElementById('notif-badge');
      if (badge) badge.classList.remove('hidden');
      list.innerHTML = requests.map(req => {
        const senderId = Number(req.sender_id || req.sender?.id || 0);
        const u = req.sender || usersById.get(senderId) || {};
        const userName = getDisplayName(u);
        const userSchool = getCareerLabel(u);
        const ini = initials(userName);
        const color = getFacultyColor(u.faculty || userSchool || '');
        return `
          <div class="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style="background:${color}">${ini}</div>
                <div>
                  <div class="font-bold text-sm text-slate-900">${userName || 'Usuario'}</div>
                  <div class="text-xs text-slate-500">Solicitud de amistad</div>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <button onclick="acceptFriendRequest(${req.id})" class="text-[10px] font-bold text-white bg-[#1B2A6B] hover:bg-[#142052] px-2 py-1 rounded">Aceptar</button>
                <button onclick="rejectFriendRequest(${req.id})" class="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Rechazar</button>
              </div>
            </div>
          </div>`;
      }).join('');
    }
  } else {
    list.innerHTML = '<div class="px-4 py-6 text-sm text-slate-500 text-center">Error al cargar</div>';
  }
}

async function acceptFriendRequest(id) {
  const result = await SocialAPI.acceptRequest(id);
  if (result && result.ok) {
    showToast('Solicitud aceptada');
    loadNotifications();
    window.dispatchEvent(new CustomEvent('friendship:changed'));
  }
  else { showToast('Error al aceptar', 'error'); }
}

async function rejectFriendRequest(id) {
  const result = await SocialAPI.rejectRequest(id);
  if (result && result.ok) {
    showToast('Solicitud rechazada');
    loadNotifications();
    window.dispatchEvent(new CustomEvent('friendship:changed'));
  }
  else { showToast('Error al rechazar', 'error'); }
}

/* Auto-check pending requests on page load */
document.addEventListener('DOMContentLoaded', async () => {
  if (isLoggedIn() && document.getElementById('notif-badge')) {
    const result = await SocialAPI.getPendingRequests();
    if (getList(result).length > 0) {
      document.getElementById('notif-badge').classList.remove('hidden');
    }
  }
});
