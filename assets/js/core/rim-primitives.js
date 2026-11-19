/**
 * Shared pure helpers for classic bootstrap + modular bridge.
 * Loaded before rim-runtime-bootstrap.js.
 */
(function (global) {
  'use strict';
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function initials(name) {
    return String(name || '?').trim().slice(0, 1).toUpperCase();
  }
  function formatTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }
  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU');
    } catch (_) {
      return '—';
    }
  }
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = String(message ?? '');
    el.style.display = 'block';
    clearTimeout(global.toastTimer);
    global.toastTimer = setTimeout(function () { el.style.display = 'none'; }, 3000);
  }
  global.__rimPrimitives = {
    escapeHtml: escapeHtml,
    esc: escapeHtml,
    initials: initials,
    formatTime: formatTime,
    formatDate: formatDate,
    toast: toast
  };
  // Compatibility aliases used by bootstrap and dual-bind surfaces
  global.esc = global.esc || escapeHtml;
  global.toast = global.toast || toast;
})(typeof window !== 'undefined' ? window : globalThis);
