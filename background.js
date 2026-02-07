importScripts('config.js');

var ALARM_PREFIX = 'zayo-monitor-';
var UPDATE_ALARM = 'zayo-monitor-update-check';
var CURRENT_VERSION = '2.5';

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
    var active = list.filter(function(e) { return e.active; });
    runSequential(active, 0);
  });
}

function runSequential(list, idx) {
  if (idx >= list.length) return;
  checkTicket(list[idx].ticket);
  // Stagger each ticket by 10s so tabs have time to load before the next one fires
  setTimeout(function() {
    runSequential(list, idx + 1);
  }, 10000);
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

    if (tab) {
      // Save real URL if we don't have one yet
      updateEntry(ticket, { url: tab.url });
      doReloadAndScrape(tab.id, ticket);
    } else {
      // Check if we have a stored URL to auto-open
      getEntryUrl(ticket).then(function(url) {
        if (url) {
          chrome.tabs.create({ url: url, active: false }, function(newTab) {
            setTimeout(function() {
              tryScrape(newTab.id, ticket, 0);
              notifyCountdown(ticket);
            }, 8000);
          });
        } else {
          updateEntry(ticket, { error: 'No tab found - open the ticket page first' });
        }
      });
    }
  });
}

function getEntryUrl(ticket) {
  return chrome.storage.local.get('monitorList').then(function(data) {
    var list = data.monitorList || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].ticket === ticket && list[i].url) return list[i].url;
    }
    return null;
  });
}

function doReloadAndScrape(tabId, ticket) {
  chrome.tabs.reload(tabId, { bypassCache: true }).then(function() {
    setTimeout(function() {
      notifyCountdown(ticket);
      tryScrape(tabId, ticket, 0);
    }, 5000);
  });
}

function notifyCountdown(ticket) {
  chrome.storage.local.get('monitorList').then(function(data) {
    var list = data.monitorList || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].ticket === ticket) {
        notifyBadge(ticket, true, list[i].intervalSec);
        break;
      }
    }
  });
}

function tryScrape(tabId, ticket, attempt) {
  chrome.tabs.sendMessage(tabId, { action: 'scrapeLastUpdate' }, function(response) {
    if (chrome.runtime.lastError) {
      if (attempt < 3) {
        // On first failure, try injecting the content script manually
        if (attempt === 1) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).catch(function() {});
          chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['badge.css']
          }).catch(function() {});
        }
        setTimeout(function() { tryScrape(tabId, ticket, attempt + 1); }, 4000);
      } else {
        console.error('[ZayoMonitor] Content script not responding for ' + ticket);
        updateEntry(ticket, { error: 'Content script not responding', lastChecked: new Date().toISOString() });
      }
      return;
    }

    if (!response || !response.success) {
      // Page might still be loading Angular - retry if no date found yet
      if (attempt < 3) {
        setTimeout(function() { tryScrape(tabId, ticket, attempt + 1); }, 4000);
      } else {
        updateEntry(ticket, {
          lastChecked: new Date().toISOString(),
          error: (response && response.error) || 'Scrape failed'
        });
      }
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
