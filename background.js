importScripts('config.js');

var ALARM_PREFIX = 'zayo-monitor-';
var UPDATE_ALARM = 'zayo-monitor-update-check';
var CURRENT_VERSION = '2.1';

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === UPDATE_ALARM) {
    checkForUpdate();
    return;
  }
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  var ticket = alarm.name.slice(ALARM_PREFIX.length);
  checkTicket(ticket);
});

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === 'startTicket') {
    startTicketAlarm(msg.ticket, msg.intervalSec);
  } else if (msg.action === 'stopTicket') {
    stopTicketAlarm(msg.ticket);
    notifyBadge(msg.ticket, false);
  } else if (msg.action === 'stopAll') {
    stopAllAlarms();
  } else if (msg.action === 'checkAllNow') {
    checkAllTickets();
  } else if (msg.action === 'testNotification') {
    fireNotification(
      'Zayo Monitor - Test',
      'Notifications are working! You will be alerted when a ticket updates.'
    );
  } else if (msg.action === 'checkForUpdate') {
    checkForUpdate().then(function(result) {
      sendResponse(result);
    });
    return true;
  } else if (msg.action === 'getVersion') {
    sendResponse({ version: CURRENT_VERSION });
  }
});

function startTicketAlarm(ticket, intervalSec) {
  var alarmName = ALARM_PREFIX + ticket;
  chrome.alarms.create(alarmName, {
    delayInMinutes: intervalSec / 60,
    periodInMinutes: intervalSec / 60
  });
  checkTicket(ticket);
}

function stopTicketAlarm(ticket) {
  chrome.alarms.clear(ALARM_PREFIX + ticket);
}

function stopAllAlarms() {
  chrome.alarms.getAll().then(function(alarms) {
    alarms.forEach(function(alarm) {
      if (alarm.name.startsWith(ALARM_PREFIX)) {
        chrome.alarms.clear(alarm.name);
      }
    });
  });
}

function checkAllTickets() {
  chrome.storage.local.get('monitorList').then(function(data) {
    var list = data.monitorList || [];
    list.forEach(function(entry) {
      if (entry.active) checkTicket(entry.ticket);
    });
  });
}

function checkTicket(ticket) {
  chrome.tabs.query({ url: 'https://tranzact.zayo.com/*' }).then(function(tabs) {
    var tab = null;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].url && tabs[i].url.toUpperCase().indexOf(ticket.toUpperCase()) !== -1) {
        tab = tabs[i];
        break;
      }
    }

    if (!tab) {
      console.warn('[ZayoMonitor] No tab found for ' + ticket);
      updateEntry(ticket, { error: 'No tab found - open the ticket page' });
      return;
    }

    chrome.tabs.reload(tab.id, { bypassCache: true }).then(function() {
      setTimeout(function() {
        // Notify badge
        chrome.storage.local.get('monitorList').then(function(data) {
          var list = data.monitorList || [];
          for (var i = 0; i < list.length; i++) {
            if (list[i].ticket === ticket) {
              notifyBadge(ticket, true, list[i].intervalSec);
              break;
            }
          }
        });

        // Scrape with retry
        tryScrape(tab.id, ticket, 0);
      }, 5000);
    });
  });
}

function tryScrape(tabId, ticket, attempt) {
  chrome.tabs.sendMessage(tabId, { action: 'scrapeLastUpdate' }, function(response) {
    if (chrome.runtime.lastError) {
      if (attempt < 1) {
        setTimeout(function() { tryScrape(tabId, ticket, attempt + 1); }, 3000);
      } else {
        console.error('[ZayoMonitor] Content script not responding for ' + ticket);
        updateEntry(ticket, { error: 'Content script not responding' });
      }
      return;
    }

    if (!response || !response.success) {
      updateEntry(ticket, {
        lastChecked: new Date().toISOString(),
        error: (response && response.error) || 'Scrape failed'
      });
      return;
    }

    var newValue = response.value;

    getEntry(ticket).then(function(current) {
      var prevValue = current ? current.lastUpdateValue : null;
      var changeCount = (current && current.changeCount) || 0;

      if (prevValue && prevValue !== newValue) {
        fireNotification(
          ticket + ' Updated!',
          'Previous: ' + prevValue + '\nNew: ' + newValue
        );

        updateEntry(ticket, {
          lastChecked: new Date().toISOString(),
          lastUpdateValue: newValue,
          previousValue: prevValue,
          changeCount: changeCount + 1,
          lastChangeAt: new Date().toISOString(),
          error: null
        });
      } else {
        updateEntry(ticket, {
          lastChecked: new Date().toISOString(),
          lastUpdateValue: newValue,
          error: null
        });
      }
    });
  });
}

function getEntry(ticket) {
  return chrome.storage.local.get('monitorList').then(function(data) {
    var list = data.monitorList || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].ticket === ticket) return list[i];
    }
    return null;
  });
}

function updateEntry(ticket, partial) {
  chrome.storage.local.get('monitorList').then(function(data) {
    var list = data.monitorList || [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].ticket === ticket) { idx = i; break; }
    }
    if (idx === -1) return;
    Object.keys(partial).forEach(function(key) {
      list[idx][key] = partial[key];
    });
    chrome.storage.local.set({ monitorList: list });
  });
}

function fireNotification(title, message) {
  chrome.notifications.create('zayo-' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true
  });
}

function notifyBadge(ticket, active, countdownFrom) {
  chrome.tabs.query({ url: 'https://tranzact.zayo.com/*' }).then(function(tabs) {
    var tab = null;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].url && tabs[i].url.toUpperCase().indexOf(ticket.toUpperCase()) !== -1) {
        tab = tabs[i];
        break;
      }
    }
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'updateBadge',
        active: active,
        ticket: ticket,
        countdownFrom: countdownFrom
      }).catch(function() {});
    }
  });
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function restoreAlarms() {
  chrome.storage.local.get('monitorList').then(function(data) {
    var list = data.monitorList || [];
    list.forEach(function(entry) {
      if (entry.active) {
        startTicketAlarm(entry.ticket, entry.intervalSec);
      }
    });
  });

  // Schedule update checks
  chrome.alarms.create(UPDATE_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: (UPDATE_CONFIG.checkIntervalHours || 6) * 60
  });
  checkForUpdate();
}

function checkForUpdate() {
  var url = UPDATE_CONFIG.repoBase + '/version.json?t=' + Date.now();
  return fetch(url).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }).then(function(remote) {
    var result = {
      currentVersion: CURRENT_VERSION,
      remoteVersion: remote.version,
      changelog: remote.changelog || '',
      downloadUrl: remote.download_url || '',
      updateAvailable: isNewerVersion(remote.version, CURRENT_VERSION)
    };

    chrome.storage.local.set({ updateInfo: result });

    if (result.updateAvailable) {
      // Set badge on extension icon
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#e63946' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    return result;
  }).catch(function(err) {
    console.warn('[ZayoMonitor] Update check failed:', err.message);
    return { updateAvailable: false, error: err.message };
  });
}

function isNewerVersion(remote, current) {
  var r = remote.split('.').map(Number);
  var c = current.split('.').map(Number);
  for (var i = 0; i < Math.max(r.length, c.length); i++) {
    var rv = r[i] || 0;
    var cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
}

chrome.runtime.onStartup.addListener(restoreAlarms);
chrome.runtime.onInstalled.addListener(restoreAlarms);
