(function() {
  var badgeEl = null;
  var countdownInterval = null;

  function getTicketFromURL() {
    var match = window.location.href.match(/(TTN-\d+)\/?/i);
    return match ? match[1].toUpperCase() : null;
  }

  function injectBadge(ticket, isActive) {
    if (badgeEl) badgeEl.remove();

    badgeEl = document.createElement('div');
    badgeEl.id = 'zayo-monitor-badge';
    if (!isActive) badgeEl.classList.add('zm-inactive');

    badgeEl.innerHTML =
      '<span class="zm-dot"></span>' +
      '<span class="zm-label">MONITORING</span>' +
      '<span class="zm-ticket">' + (ticket || '--') + '</span>' +
      '<span class="zm-countdown"></span>';

    document.body.appendChild(badgeEl);
  }

  function updateBadge(active, ticket) {
    if (!badgeEl) {
      injectBadge(ticket, active);
      return;
    }
    if (active) {
      badgeEl.classList.remove('zm-inactive');
      var ticketSpan = badgeEl.querySelector('.zm-ticket');
      if (ticketSpan) ticketSpan.textContent = ticket || '--';
    } else {
      badgeEl.classList.add('zm-inactive');
    }
  }

  function updateCountdown(seconds) {
    if (!badgeEl) return;
    var cd = badgeEl.querySelector('.zm-countdown');
    if (cd) {
      cd.textContent = seconds > 0 ? ('next: ' + seconds + 's') : '';
    }
  }

  function scrapeLastUpdate() {
    var datePattern = /\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}:\d{2}(AM|PM)/i;

    // Strategy 1: Find a label containing "Last Update" and grab the date from
    // a sibling or nearby element within the same parent/row.
    var allElements = document.querySelectorAll('*');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var directText = '';
      for (var c = 0; c < el.childNodes.length; c++) {
        if (el.childNodes[c].nodeType === 3) {
          directText += el.childNodes[c].textContent;
        }
      }
      if (/last\s*update/i.test(directText)) {
        // Found a label element - now look in parent/siblings for the date
        var container = el.parentElement;
        // Check up to 3 levels of parent
        for (var lvl = 0; lvl < 3 && container; lvl++) {
          var spans = container.querySelectorAll('span');
          for (var s = 0; s < spans.length; s++) {
            var spanText = spans[s].textContent.trim();
            if (datePattern.test(spanText)) {
              return { success: true, value: spanText, timestamp: new Date().toISOString() };
            }
          }
          container = container.parentElement;
        }
      }
    }

    // Strategy 2: Search page text for "Last Update" line and extract date after it
    var bodyText = document.body.innerText;
    var lastUpdateMatch = bodyText.match(/Last\s*Update[^:]*:?\s*(\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}:\d{2}(?:AM|PM))/i);
    if (lastUpdateMatch) {
      return { success: true, value: lastUpdateMatch[1].trim(), timestamp: new Date().toISOString() };
    }

    // Strategy 3: Collect ALL dates on the page, skip the first one (Date/Time Opened),
    // and return the second one (Last Update)
    var allDates = [];
    var allSpans = document.querySelectorAll('span');
    for (var j = 0; j < allSpans.length; j++) {
      var t = allSpans[j].textContent.trim();
      if (datePattern.test(t)) {
        allDates.push(t);
      }
    }
    // Index 0 = Date/Time Opened, Index 1 = Last Update Date/Time
    if (allDates.length >= 2) {
      return { success: true, value: allDates[1], timestamp: new Date().toISOString() };
    }

    return { success: false, value: null, error: 'Last Update Date/Time not found', timestamp: new Date().toISOString() };
  }

  // Scrape all ticket links from the dashboard/list page
  function scrapeTicketList() {
    var tickets = [];
    var seen = {};
    var links = document.querySelectorAll('a[href]');

    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || '';
      var match = href.match(/(TTN-\d{5,})/i);
      if (match) {
        var ticket = match[1].toUpperCase();
        if (!seen[ticket]) {
          seen[ticket] = true;
          tickets.push({
            ticket: ticket,
            url: href
          });
        }
      }
    }

    // Also check onclick handlers and ng-click attributes that might contain ticket refs
    var allEls = document.querySelectorAll('[ng-click], [onclick]');
    for (var j = 0; j < allEls.length; j++) {
      var text = allEls[j].textContent.trim();
      var attrMatch = text.match(/(TTN-\d{5,})/i);
      if (attrMatch) {
        var t = attrMatch[1].toUpperCase();
        if (!seen[t]) {
          seen[t] = true;
          tickets.push({
            ticket: t,
            url: null
          });
        }
      }
    }

    // Fallback: scan all visible text for TTN patterns and find nearest link
    if (tickets.length === 0) {
      var body = document.body.innerText;
      var re = /TTN-\d{5,}/gi;
      var m;
      while ((m = re.exec(body)) !== null) {
        var tk = m[0].toUpperCase();
        if (!seen[tk]) {
          seen[tk] = true;
          tickets.push({ ticket: tk, url: null });
        }
      }
    }

    return { success: tickets.length > 0, tickets: tickets, count: tickets.length };
  }

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'scrapeLastUpdate') {
      sendResponse(scrapeLastUpdate());
    }
    else if (msg.action === 'scrapeTicketList') {
      sendResponse(scrapeTicketList());
    }
    else if (msg.action === 'getTicketFromURL') {
      sendResponse({ ticket: getTicketFromURL() });
    }
    else if (msg.action === 'updateBadge') {
      updateBadge(msg.active, msg.ticket);
      if (msg.active && msg.countdownFrom) {
        startCountdown(msg.countdownFrom);
      }
    }
    else if (msg.action === 'showBadge') {
      updateBadge(true, msg.ticket);
    }
    else if (msg.action === 'hideBadge') {
      updateBadge(false, null);
    }
    return true;
  });

  function startCountdown(totalSec) {
    if (countdownInterval) clearInterval(countdownInterval);
    var remaining = totalSec;
    updateCountdown(remaining);
    countdownInterval = setInterval(function() {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        updateCountdown(0);
      } else {
        updateCountdown(remaining);
      }
    }, 1000);
  }

  function init() {
    var ticket = getTicketFromURL();
    if (!ticket) return;

    chrome.storage.local.get(['monitorList'], function(data) {
      var list = data.monitorList || [];
      var entry = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].ticket === ticket && list[i].active) {
          entry = list[i];
          break;
        }
      }
      if (entry) {
        injectBadge(ticket, true);
        if (entry.intervalSec) startCountdown(entry.intervalSec);
      }
    });
  }

  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.monitorList) {
      var ticket = getTicketFromURL();
      if (!ticket) return;
      var list = changes.monitorList.newValue || [];
      var found = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].ticket === ticket && list[i].active) {
          found = true;
          break;
        }
      }
      if (found) {
        updateBadge(true, ticket);
      } else {
        updateBadge(false, null);
      }
    }
  });

  init();
})();
