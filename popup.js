document.addEventListener('DOMContentLoaded', function() {
  var ticketInput = document.getElementById('ticketInput');
  var intervalInput = document.getElementById('intervalInput');
  var addBtn = document.getElementById('addBtn');
  var addCurrentBtn = document.getElementById('addCurrentBtn');
  var currentInfo = document.getElementById('currentInfo');
  var errorMsg = document.getElementById('errorMsg');
  var ticketListEl = document.getElementById('ticketList');
  var emptyState = document.getElementById('emptyState');
  var listCount = document.getElementById('listCount');
  var testNotifBtn = document.getElementById('testNotifBtn');
  var refreshAllBtn = document.getElementById('refreshAllBtn');
  var clearAllBtn = document.getElementById('clearAllBtn');
  var updateBanner = document.getElementById('updateBanner');
  var updateVersions = document.getElementById('updateVersions');
  var updateChangelog = document.getElementById('updateChangelog');
  var updateLink = document.getElementById('updateLink');
  var updateBtn = document.getElementById('updateBtn');
  var versionLabel = document.getElementById('versionLabel');

  // Show current version
  chrome.runtime.sendMessage({ action: 'getVersion' }, function(resp) {
    if (resp && resp.version) {
      versionLabel.textContent = 'v' + resp.version;
    }
  });

  // Check for cached update info
  chrome.storage.local.get(['updateInfo'], function(data) {
    if (data.updateInfo) showUpdateInfo(data.updateInfo);
  });

  function showUpdateInfo(info) {
    if (info && info.updateAvailable) {
      updateBanner.classList.add('visible');
      updateVersions.textContent = 'v' + info.currentVersion + ' -> v' + info.remoteVersion;
      updateChangelog.textContent = info.changelog || '';
      if (info.downloadUrl) {
        updateLink.href = info.downloadUrl;
      }
    } else {
      updateBanner.classList.remove('visible');
    }
  }

  // Detect current tab ticket
  var currentTabUrl = null;
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs[0];
    if (tab && tab.url) {
      currentTabUrl = tab.url;
      var match = tab.url.match(/(TTN-\d+)\/?/i);
      if (match) {
        var ticket = match[1].toUpperCase();
        currentInfo.textContent = 'Current page: ' + ticket;
        currentInfo.classList.add('visible');
        addCurrentBtn.textContent = '+ Add Current Page (' + ticket + ')';
        addCurrentBtn.dataset.ticket = ticket;
      } else if (tab.url.indexOf('tranzact.zayo.com') !== -1) {
        currentInfo.textContent = 'On TranZact but no ticket number found in URL';
        currentInfo.classList.add('visible');
        addCurrentBtn.style.opacity = '0.4';
      }
    }
  });

  function loadList() {
    chrome.storage.local.get(['monitorList'], function(data) {
      renderList(data.monitorList || []);
    });
  }

  function renderList(list) {
    ticketListEl.querySelectorAll('.ticket-card').forEach(function(el) { el.remove(); });
    listCount.textContent = list.length;

    if (list.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    list.forEach(function(entry, idx) {
      var card = document.createElement('div');
      card.className = 'ticket-card' + (entry.active ? '' : ' paused');

      var lastUp = entry.lastUpdateValue || 'Waiting...';
      var lastCheck = entry.lastChecked
        ? new Date(entry.lastChecked).toLocaleTimeString()
        : '--';
      var changes = entry.changeCount || 0;

      var ticketUrl = entry.url || null;
      var ticketEl = ticketUrl
        ? '<a class="tc-ticket" href="' + ticketUrl + '" target="_blank">' + entry.ticket + '</a>'
        : '<span class="tc-ticket tc-clickable" data-ticket="' + entry.ticket + '">' + entry.ticket + '</span>';

      card.innerHTML =
        '<span class="tc-dot"></span>' +
        '<div class="tc-info">' +
          ticketEl +
          '<div class="tc-meta">' +
            '<span>Every ' + entry.intervalSec + 's</span>' +
            '<span>Checked: ' + lastCheck + '</span>' +
            '<span>Changes: ' + changes + '</span>' +
          '</div>' +
          '<div class="tc-last-update">Last update: ' + lastUp + '</div>' +
        '</div>' +
        '<div class="tc-actions">' +
          '<button class="btn-icon pause" title="' + (entry.active ? 'Pause' : 'Resume') + '">' + (entry.active ? '||' : '>') + '</button>' +
          '<button class="btn-icon remove" title="Remove">x</button>' +
        '</div>';

      card.querySelector('.pause').addEventListener('click', function() { togglePause(idx); });
      card.querySelector('.remove').addEventListener('click', function() { removeTicket(idx); });

      var clickable = card.querySelector('.tc-clickable');
      if (clickable) {
        clickable.addEventListener('click', function() {
          var t = this.dataset.ticket;
          chrome.tabs.query({ url: 'https://tranzact.zayo.com/*' }, function(tabs) {
            for (var i = 0; i < tabs.length; i++) {
              if (tabs[i].url && tabs[i].url.toUpperCase().indexOf(t.toUpperCase()) !== -1) {
                chrome.tabs.update(tabs[i].id, { active: true });
                chrome.windows.update(tabs[i].windowId, { focused: true });
                return;
              }
            }
          });
        });
      }

      ticketListEl.insertBefore(card, emptyState);
    });
  }

  function addTicket(ticketRaw, pageUrl) {
    var ticket = ticketRaw.trim().toUpperCase();
    var interval = parseInt(intervalInput.value, 10);

    if (!ticket.match(/^TTN-\d{5,}$/)) {
      showError('Invalid ticket format. Expected: TTN-##########');
      return;
    }
    if (interval < 15 || interval > 600 || isNaN(interval)) {
      showError('Interval must be 15-600 seconds.');
      return;
    }

    chrome.storage.local.get(['monitorList'], function(data) {
      var list = data.monitorList || [];

      if (list.some(function(e) { return e.ticket === ticket; })) {
        showError(ticket + ' is already in the list.');
        return;
      }

      var entry = {
        ticket: ticket,
        url: pageUrl || null,
        intervalSec: interval,
        active: true,
        addedAt: new Date().toISOString(),
        lastUpdateValue: null,
        lastChecked: null,
        changeCount: 0
      };

      list.push(entry);

      chrome.storage.local.set({ monitorList: list }, function() {
        chrome.runtime.sendMessage({ action: 'startTicket', ticket: ticket, intervalSec: interval });
        renderList(list);
        ticketInput.value = '';
        hideError();
      });
    });
  }

  function removeTicket(idx) {
    chrome.storage.local.get(['monitorList'], function(data) {
      var list = data.monitorList || [];
      var removed = list.splice(idx, 1)[0];
      chrome.storage.local.set({ monitorList: list }, function() {
        if (removed) {
          chrome.runtime.sendMessage({ action: 'stopTicket', ticket: removed.ticket });
        }
        renderList(list);
      });
    });
  }

  function togglePause(idx) {
    chrome.storage.local.get(['monitorList'], function(data) {
      var list = data.monitorList || [];
      if (!list[idx]) return;
      list[idx].active = !list[idx].active;
      chrome.storage.local.set({ monitorList: list }, function() {
        var entry = list[idx];
        if (entry.active) {
          chrome.runtime.sendMessage({ action: 'startTicket', ticket: entry.ticket, intervalSec: entry.intervalSec });
        } else {
          chrome.runtime.sendMessage({ action: 'stopTicket', ticket: entry.ticket });
        }
        renderList(list);
      });
    });
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('visible');
    setTimeout(hideError, 4000);
  }

  function hideError() {
    errorMsg.classList.remove('visible');
  }

  addBtn.addEventListener('click', function() { addTicket(ticketInput.value); });

  ticketInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') addTicket(ticketInput.value);
  });

  addCurrentBtn.addEventListener('click', function() {
    var ticket = addCurrentBtn.dataset.ticket;
    if (ticket) {
      addTicket(ticket, currentTabUrl);
    } else {
      showError('No ticket found on current page.');
    }
  });

  testNotifBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'testNotification' });
  });

  refreshAllBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'checkAllNow' });
  });

  clearAllBtn.addEventListener('click', function() {
    if (confirm('Remove all tickets from the monitoring list?')) {
      chrome.storage.local.set({ monitorList: [] }, function() {
        chrome.runtime.sendMessage({ action: 'stopAll' });
        renderList([]);
      });
    }
  });

  updateBtn.addEventListener('click', function() {
    updateBtn.textContent = '...';
    chrome.runtime.sendMessage({ action: 'checkForUpdate' }, function(result) {
      updateBtn.textContent = 'Updates';
      if (result && result.updateAvailable) {
        showUpdateInfo(result);
      } else if (result && result.error) {
        updateBtn.textContent = 'Error';
        setTimeout(function() { updateBtn.textContent = 'Updates'; }, 2000);
      } else {
        updateBtn.textContent = 'Up to date';
        setTimeout(function() { updateBtn.textContent = 'Updates'; }, 2000);
        updateBanner.classList.remove('visible');
      }
    });
  });

  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.monitorList) {
      renderList(changes.monitorList.newValue || []);
    }
    if (changes.updateInfo) {
      showUpdateInfo(changes.updateInfo.newValue);
    }
  });

  loadList();
});
