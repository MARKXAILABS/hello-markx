'use strict';

/**
 * sw.js — Web Push receipt and notification-click routing for the phone PWA
 * (02-UI-SPEC.md S5), and deliberately nothing else. Four listeners:
 * install, activate, push, notificationclick.
 *
 * No fetch handler, no Cache Storage, no importScripts, no eval. A cached
 * ask is a stale ask, and this origin changes on every tunnel restart
 * (D-19) — a service worker with notification permission that ALSO
 * intercepts fetch would be an interception point on the phone's own
 * authenticated origin for no benefit this contract asked for
 * (T-P02-09-03).
 */

self.addEventListener('install', function () {
  // An origin that changes every restart (D-19) means there is nothing to
  // migrate — the newest worker should take over immediately.
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var name = typeof data.agent === 'string' && data.agent ? data.agent : 'Someone';
  var taskId = typeof data.taskId === 'string' ? data.taskId : '';
  event.waitUntil(
    self.registration.showNotification(name, {
      // The body is the fixed phrase, unconditionally — the question text is
      // NEVER in the notification. It renders on a locked screen, and the
      // floor's questions quote source, paths and occasionally secrets.
      body: 'is waiting on you',
      // Re-poll replaces rather than stacks a notification for the same ask.
      tag: 'ask:' + taskId,
      data: { taskId: taskId }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  var taskId = (event.notification.data && event.notification.data.taskId) || '';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf('/phone/') !== -1 && 'focus' in client) {
          client.postMessage({ type: 'ask', taskId: taskId });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/phone/');
      return undefined;
    })
  );
});
