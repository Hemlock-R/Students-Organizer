/* StudyDesk copyright 2026 RANSFORD VINDINOBA. all rights reserved */

/* A. App settings */
    const APP_SETTINGS = {
      // Urgent deadline threshold, in days.
      URGENT_DAYS: 2,
      // Upcoming deadline threshold, in days.
      SOON_DAYS: 7,
      // false = calendar weeks start on Sunday, true = on Monday.
      WEEK_STARTS_ON_MONDAY: false,
      // Time pre-filled in the deadline form (24-hour format, HH:MM).
      DEFAULT_DUE_TIME: '23:59',
      // Maximum upload size in bytes.
      MAX_FILE_BYTES: 200 * 1024 * 1024,
      // Maximum file size included in backups.
      MAX_BACKUP_FILE_BYTES: 2 * 1024 * 1024,
      // Extra weekly checklist items.
      EXTRA_WEEKLY_TASKS: [
        'Check each syllabus for new deadlines',
        'Review next week\u2019s calendar',
        'Back up important files'
      ],
      // The kinds of deadline you can pick in the form.
      DEADLINE_TYPES: ['Assignment', 'Quiz', 'Exam', 'Project', 'Other'],
      // Maximum folder depth.
      MAX_FOLDER_DEPTH: 4,
      // Folder and calendar colors.
      FOLDER_COLORS: ['#2f6fed', '#0ea5a4', '#8b5cf6', '#e0731f', '#d6336c', '#4d9a2f'],
      // Days before showing another backup reminder.
      BACKUP_REMIND_DAYS: 14,
      // A class alert turns RED (urgent) this many minutes before the class begins.
      CLASS_ALERT_MINUTES: 60,
      // Hours before class to start alerts.
      CLASS_ALERT_HOURS: 24
    };

    /* A2. App info */
    const APP_INFO = {
      NAME: 'StudyDesk',
      VERSION: '1.4.0',

      /* Set a Tally form URL to enable Settings > Feedback. */
      TALLY_FORM_URL: 'https://tally.so/r/NqXDdl',   // <-- PASTE YOUR TALLY LINK HERE

      /* Optional contact shown on the Feedback and Privacy tabs. */
      CONTACT_EMAIL: '',    // <-- e.g. 'hello@yourdomain.com'

      /* Update when the Privacy policy changes. */
      PRIVACY_UPDATED: 'November 20, 2026',

      /* Optional donations: configure the payment URL and donor-details endpoint below. */
      DONATE_ENABLED: true,           // set to false to hide every donate button and banner
      DONATE_URL: '',                 // <-- PASTE YOUR PAYMENT LINK HERE (must start with https://)
      DONATE_AMOUNT_PARAM: '',        // optional, e.g. 'amount'
      DONATE_AMOUNT_MULTIPLIER: 1,    // optional, e.g. 100 if your provider counts in pesewas
      DONATE_INFO_ENDPOINT: '',       // <-- PASTE YOUR FORMSPREE (or similar) ADDRESS HERE
      DONATE_CURRENCY: 'GHS',         // shown next to the amounts
      DONATE_AMOUNTS: [5, 10, 20, 50],// quick amount buttons in the donate form

      /* Donation banner timing. */
      DONATE_FIRST_AFTER_OPENS: 4,    // not before the 4th time the app is opened
      DONATE_REMIND_EVERY_DAYS: 14,   // then at most once every 14 days
      DONATE_IGNORE_SNOOZE_DAYS: 30,  // after tapping Ignore, stay quiet for 30 days
      DONATED_SNOOZE_DAYS: 90         // after someone donates, stay quiet for 90 days
    };

    /* Default values for Settings. */
    const DEFAULT_SETTINGS = {
      name: '',                                          // the student's name, used in the greeting
      askedName: false,                                  // true once the welcome question has been answered or skipped
      theme: 'system',                                   // 'system' | 'light' | 'dark'
      urgentDays: APP_SETTINGS.URGENT_DAYS,
      soonDays: APP_SETTINGS.SOON_DAYS,
      weekStartsMonday: APP_SETTINGS.WEEK_STARTS_ON_MONDAY,
      defaultTime: APP_SETTINGS.DEFAULT_DUE_TIME,
      extraTasks: APP_SETTINGS.EXTRA_WEEKLY_TASKS.slice(),
      gradingScale: [
        { letter: 'A', minimum: 80, points: 4 },
        { letter: 'B', minimum: 70, points: 3 },
        { letter: 'C', minimum: 60, points: 2 },
        { letter: 'D', minimum: 50, points: 1 },
        { letter: 'F', minimum: 0, points: 0 }
      ],
      widgets: []                                        // ids of the dashboard widgets switched on in Settings
    };



    /* B. App state */
    let state = emptyState();          // folders, files, deadlines, checklist ticks
    const runtimeFiles = {};           // only used if IndexedDB is blocked: files kept in memory for this visit
    const blobUrls = {};               // temporary preview links for the file viewer (fileId -> url)
    let db = null;                     // the open IndexedDB database (null if the browser blocks it)
    const kvCache = {};                // a copy of every small saved value so the app can read it instantly
    let storageWorks = true;           // flips to false if IndexedDB can't be used
    let storageWarned = false;         // so the "couldn't save" message only shows once
    let toastTimer = null;             // timer that hides the toast message
    let confirmCallback = null;        // what to do when "Delete" is pressed in confirm pop-up

    /* Things that only matter while the page is open (not saved) */
    const ui = {
      view: 'dashboard',
      folderId: null,                                   // folder open on the Files page
      cal: { y: new Date().getFullYear(), m: new Date().getMonth() },  // month shown in calendar
      dismissed: new Set(),                             // banners the user closed
      editingId: null,                                  // deadline being edited (or null)
      viewingId: null,                                  // deadline shown in the read-only pop-up
      settingsTab: 'settings',                          // 'settings' | 'feedback' | 'privacy'
      expanded: new Set(),                              // main folders / subfolders currently opened in the tree
      ttDay: new Date().getDay(),                       // weekday shown on the phone timetable (0 = Sunday)
      editingClassId: null,                             // class being edited in the timetable pop-up (or null)
      more: new Set()                                   // lists where "View more" was pressed
    };

    /* Creates a blank data object. */
    function emptyState() {
      return { v: 1, folders: [], files: [], deadlines: [], timetable: [], checklist: {}, settings: Object.assign({}, DEFAULT_SETTINGS) };
    }


    /* C. Helpers */

    /* Shortcut for document.getElementById. */
    function $(id) { return document.getElementById(id); }

    /* Makes a short random ID for new folders, files and deadlines. */
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    /* Escapes user text before adding it to HTML. */
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    /* Adds a leading zero: 5 -> "05". */
    function pad(n) { return String(n).padStart(2, '0'); }

    /* Turns a Date into "YYYY-MM-DD" (local time). */
    function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    /* Turns "YYYY-MM-DD" back into a Date at midnight (local time). */
    function parseDateStr(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

    /* Today's date as "YYYY-MM-DD". */
    function todayStr() { return toDateStr(new Date()); }

    /* How many calendar days from one date string to another (negative = in the past). */
    function dayDiff(fromStr, toStr) {
      return Math.round((parseDateStr(toStr) - parseDateStr(fromStr)) / 86400000);
    }

    /* Returns the Monday of the week that contains a date, as "YYYY-MM-DD".
       The weekly checklist resets every Monday. */
    function weekStartStr(date) {
      const d = new Date(date);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return toDateStr(d);
    }

    /* "23:59" -> "11:59 PM". Returns "" when there is no time. */
    function formatTime(t) {
      if (!t) return '';
      const p = t.split(':').map(Number);
      const h12 = p[0] % 12 === 0 ? 12 : p[0] % 12;
      return h12 + ':' + pad(p[1]) + ' ' + (p[0] < 12 ? 'AM' : 'PM');
    }

    /* "2026-10-30" -> "Fri, Oct 30". */
    function formatDate(s) {
      return parseDateStr(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    /* 1536000 -> "1.5 MB". */
    function formatSize(b) {
      if (b < 1024) return b + ' B';
      if (b < 1048576) return Math.round(b / 1024) + ' KB';
      return (b / 1048576).toFixed(1) + ' MB';
    }

    /* Gives the short extension shown on a file tile: "lecture.pdf" -> "PDF". */
    function fileExt(name) {
      return name.indexOf('.') > -1 ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
    }

    /* Returns the office-file type that requires downloading, if any. */
    function downloadOnlyKind(name) {
      const ext = (String(name).split('.').pop() || '').toLowerCase();
      if (/^(ppt|pptx|pps|ppsx|odp|key)$/.test(ext)) return 'PowerPoint';
      if (/^(doc|docx|odt|rtf)$/.test(ext)) return 'Word';
      if (/^(xls|xlsx|ods)$/.test(ext)) return 'Excel';
      return '';
    }

    /* Viewer message for files that cannot be previewed. */
    function noPreviewNote(name) {
      const kind = downloadOnlyKind(name);
      if (kind === 'PowerPoint') {
        return '<div class="viewer-note"><strong>PowerPoint slides can\u2019t be previewed here.</strong><br>Tap Download to open them in PowerPoint, or save them as a PDF to read them inside StudyDesk.' +
          '<br><small>PowerPoint: File \u2192 Export \u2192 PDF. Google Slides: File \u2192 Download \u2192 PDF.</small></div>';
      }
      if (kind) {
        return '<div class="viewer-note"><strong>' + kind + ' files can\u2019t be previewed here.</strong><br>Tap Download to open it in another app, or save it as a PDF to read it inside StudyDesk.</div>';
      }
      return '<div class="viewer-note">Browsers can\u2019t preview this file type. Use Download to open it in another app.</div>';
    }

    /* Finds a folder by its ID (or undefined). */
    function folderById(id) { return state.folders.find(function (f) { return f.id === id; }); }

    /* Folder tree helpers */

    /* Folders directly inside a parent ('' = the main, top-level folders). */
    function childFolders(parentId) {
      return state.folders.filter(function (f) { return (f.parentId || '') === (parentId || ''); });
    }

    /* The main (top-level) folders. These act as your courses. */
    function rootFolders() { return childFolders(''); }

    /* Climbs up to the main folder that contains a folder. */
    function rootOf(id) {
      let f = folderById(id), guard = 0;
      while (f && f.parentId && guard++ < 20) {
        const p = folderById(f.parentId);
        if (!p) break;
        f = p;
      }
      return f;
    }

    /* How deep a folder is: 0 = main folder, 1 = subfolder, 2 = sub-subfolder... */
    function folderDepth(id) {
      let d = 0, f = folderById(id);
      while (f && f.parentId && d < 20) { f = folderById(f.parentId); d++; }
      return d;
    }

    /* A folder's id plus the ids of everything inside it, at any depth. */
    function descendantIds(id) {
      let out = [id];
      childFolders(id).forEach(function (c) { out = out.concat(descendantIds(c.id)); });
      return out;
    }

    /* Readable location, e.g. "CICS 111 / Lectures / Week 3". */
    function folderPath(id) {
      const parts = [];
      let f = folderById(id), g = 0;
      while (f && g++ < 20) { parts.unshift(f.name); f = f.parentId ? folderById(f.parentId) : null; }
      return parts.join(' / ');
    }

    /* Number of files in a folder including all its subfolders. */
    function fileCountDeep(id) {
      const ids = descendantIds(id);
      return state.files.filter(function (x) { return ids.indexOf(x.folderId) > -1; }).length;
    }

    /* The course name to display for a deadline. */
    function courseName(id) { const f = folderById(id); return f ? f.name : 'General'; }

    /* The color to display for a deadline's course. */
    function courseColor(id) { const f = rootOf(id); return f ? f.color : '#64748b'; }

    /* Grade helpers */
    function scoredPart(part) {
      return !!part && part.score !== null && part.score !== undefined &&
        part.max !== null && part.max !== undefined && Number(part.max) > 0;
    }

    function courseStanding(course) {
      if (!course || !Array.isArray(course.gradeParts)) return { percentage: null, earnedWeight: 0, scored: 0, total: 0 };
      let earnedMarks = 0;
      let scoredWeight = 0;
      let scored = 0;
      course.gradeParts.forEach(function (part) {
        if (scoredPart(part)) {
          earnedMarks += (Number(part.score) / Number(part.max)) * Number(part.weight);
          scoredWeight += Number(part.weight);
          scored++;
        }
      });
      const percentage = scoredWeight > 0 ? (earnedMarks / scoredWeight) * 100 : null;
      return { percentage: percentage, earnedMarks: earnedMarks, scoredWeight: scoredWeight, scored: scored, total: course.gradeParts.length };
    }

    function gradeForPercentage(percentage) {
      if (!Number.isFinite(percentage) || !state.settings.gradingScale.length) return { letter: '', points: null };
      const scale = state.settings.gradingScale.slice().sort(function (a, b) { return b.minimum - a.minimum; });
      for (let i = 0; i < scale.length; i++) {
        if (percentage >= scale[i].minimum) return { letter: scale[i].letter, points: scale[i].points };
      }
      return { letter: '', points: null };
    }

    function semesterGPA() {
      let pointsCredits = 0;
      let credits = 0;
      rootFolders().forEach(function (course) {
        const standing = courseStanding(course);
        const courseCredits = Number(course.credits);
        if (standing.percentage !== null && Number.isFinite(courseCredits) && courseCredits > 0) {
          const grade = gradeForPercentage(standing.percentage);
          if (Number.isFinite(grade.points)) {
            pointsCredits += grade.points * courseCredits;
            credits += courseCredits;
          }
        }
      });
      return credits > 0 ? pointsCredits / credits : null;
    }

    /* Draws a small inline icon (no external icon library needed). */
    function icon(name) {
      const paths = {
        home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
        folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4',
        bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
        check: 'M20 6L9 17l-5-5',
        trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
        eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
        upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
        heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
        chev: 'M6 9l6 6 6-6',
        sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
        plus: 'M12 5v14M5 12h14',
        left: 'M15 18l-6-6 6-6',
        right: 'M9 18l6-6-6-6',
        x: 'M18 6L6 18M6 6l12 12',
        edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
        alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
        clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
        book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
        share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13'
      };
      return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (paths[name] || '') + '"/></svg>';
    }

    /* Shows a short message at the bottom of the screen. */
    function toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
    }


    /* D. IndexedDB storage */
    const DB_NAME = 'studydesk';        // name of the database inside the browser
    const DB_VERSION = 1;               // only raise this if you add another "store" in openDatabase()
    const STORE_KV = 'kv';              // drawer for small values
    const STORE_FILES = 'files';        // drawer for uploaded files

    /* Keys for saved values. */
    const KEY_STATE = 'state';                  // folders, files list, deadlines, checklist ticks, settings
    const KEY_UI = 'ui';                        // which folders were left open
    const KEY_DONATE = 'donate';                // donate-banner timing
    const KEY_LAST_BACKUP = 'lastBackupAt';          // when the last backup was exported (ms)
    const KEY_BACKUP_SNOOZE = 'backupSnoozeUntil';  // backup reminder stays quiet until then (ms)
    const KEY_NOTE = 'note';                    // the Quick note widget text
    const KEY_INSTALL = 'installDismissed';     // when "Install app" was last dismissed
    const KEY_INSTALLED = 'appInstalled';       // true once the browser reported the app was installed (hides the Install button)

    /* Legacy localStorage keys used during migration. */
    const LEGACY_KEYS = {
      state: 'studydesk.v1', ui: 'studydesk.ui', donate: 'studydesk.donate',
      note: 'studydesk.note', installDismissed: 'studydesk.installDismissed'
    };

    /* Opens the database, or returns null if IndexedDB is unavailable. */
    function openDatabase() {
      return new Promise(function (resolve) {
        if (!window.indexedDB) { resolve(null); return; }
        let req;
        try { req = window.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { resolve(null); return; }
        /* Runs the first time only: creates the two drawers. */
        req.onupgradeneeded = function () {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE_KV)) d.createObjectStore(STORE_KV);
          if (!d.objectStoreNames.contains(STORE_FILES)) d.createObjectStore(STORE_FILES);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      });
    }

    /* Loads saved values into the startup cache. */
    function loadAllValues() {
      return new Promise(function (resolve) {
        if (!db) { resolve(); return; }
        try {
          const req = db.transaction(STORE_KV, 'readonly').objectStore(STORE_KV).openCursor();
          req.onsuccess = function () {
            const cur = req.result;
            if (cur) { kvCache[cur.key] = cur.value; cur.continue(); } else { resolve(); }
          };
          req.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }

    /* Shows a one-time warning if the device refused to save something. */
    function storageProblem() {
      storageWorks = false;
      if (!storageWarned) {
        storageWarned = true;
        toast('Couldn\u2019t save to this device. Free up some space and try again.');
      }
    }

    /* Reads a small saved value (instantly, from the cache). */
    function kvGet(key, fallback) {
      return kvCache[key] === undefined ? fallback : kvCache[key];
    }

    /* Saves a small value and updates the cache immediately. */
    function kvSet(key, value) {
      kvCache[key] = value;
      return new Promise(function (resolve) {
        if (!db) { resolve(false); return; }
        try {
          const tx = db.transaction(STORE_KV, 'readwrite');
          tx.objectStore(STORE_KV).put(value, key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = tx.onabort = function () { storageProblem(); resolve(false); };
        } catch (e) { storageProblem(); resolve(false); }
      });
    }

    /* Deletes a small saved value. */
    function kvDelete(key) {
      delete kvCache[key];
      return new Promise(function (resolve) {
        if (!db) { resolve(); return; }
        try {
          const tx = db.transaction(STORE_KV, 'readwrite');
          tx.objectStore(STORE_KV).delete(key);
          tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }

    /* Saves an uploaded file. Resolves true if it is safely stored on the device,
       false if it could only be kept in memory for this visit (storage blocked or full). */
    function putFileBlob(id, blob) {
      return new Promise(function (resolve) {
        function keepInMemory() { runtimeFiles[id] = blob; resolve(false); }
        if (!db) { keepInMemory(); return; }
        try {
          const tx = db.transaction(STORE_FILES, 'readwrite');
          tx.objectStore(STORE_FILES).put(blob, id);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = tx.onabort = keepInMemory;
        } catch (e) { keepInMemory(); }
      });
    }

    /* Reads an uploaded file back. Resolves with the file, or null if it isn't there. */
    function getFileBlob(id) {
      if (runtimeFiles[id]) return Promise.resolve(runtimeFiles[id]);
      return new Promise(function (resolve) {
        if (!db) { resolve(null); return; }
        try {
          const req = db.transaction(STORE_FILES, 'readonly').objectStore(STORE_FILES).get(id);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }

    /* Deletes one uploaded file from the database. */
    function deleteFileBlob(id) {
      delete runtimeFiles[id];
      return new Promise(function (resolve) {
        if (!db) { resolve(); return; }
        try {
          const tx = db.transaction(STORE_FILES, 'readwrite');
          tx.objectStore(STORE_FILES).delete(id);
          tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }

    /* Deletes every uploaded file from the database. */
    function clearAllFileBlobs() {
      Object.keys(runtimeFiles).forEach(function (k) { delete runtimeFiles[k]; });
      return new Promise(function (resolve) {
        if (!db) { resolve(); return; }
        try {
          const tx = db.transaction(STORE_FILES, 'readwrite');
          tx.objectStore(STORE_FILES).clear();
          tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }

    /* Asks the browser not to clear our data when the phone is low on space.
       Installed apps are usually granted this automatically. */
    function requestPersistentStorage() {
      if (navigator.storage && navigator.storage.persist) {
        return navigator.storage.persist().catch(function () { return false; });
      }
      return Promise.resolve(false);
    }

    /* Saves app state; file contents are stored separately. */
    function saveState() {
      kvSet(KEY_STATE, JSON.stringify(state));
      return true;
    }

    /* Loads saved state, or null for a new user. */
    function loadState() {
      const raw = kvGet(KEY_STATE, null);
      if (!raw) return null;
      try { return normalizeState(JSON.parse(raw)); } catch (e) { return null; }
    }

    /* Checks whether the old demo data is unchanged. */
    function looksLikeDemoData(d) {
      const names = (d.folders || []).map(function (f) { return f && f.name; });
      const titles = (d.deadlines || []).map(function (x) { return x && x.title; });
      const hasAll = function (list, need) { return need.every(function (n) { return list.indexOf(n) > -1; }); };
      return hasAll(names, ['CICS 111', 'MATH 173', 'ENGL 112']) &&
        hasAll(titles, ['Homework 3', 'Quiz 2', 'Essay draft', 'Midterm exam']) && !(d.files || []).length;
    }

    /* Migrates existing users' data from localStorage to IndexedDB once. */
    async function migrateLegacyStorage() {
      let raw = null;
      try { raw = localStorage.getItem(LEGACY_KEYS.state); } catch (e) { return; }
      let legacyData = null;
      let migrationSucceeded = true;
      if (raw) {
        try { legacyData = JSON.parse(raw); } catch (e) { migrationSucceeded = false; }
      }

      if (raw && kvCache[KEY_STATE] === undefined) {
        let data = legacyData;
        if (data && looksLikeDemoData(data)) data = { settings: data.settings };   // keep preferences, drop the demo
        if (data) {
          /* Convert legacy data URLs into stored files. */
          const files = Array.isArray(data.files) ? data.files : [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f && typeof f.data === 'string' && f.data.indexOf('data:') === 0) {
              try {
                f.stored = await putFileBlob(f.id, await (await fetch(f.data)).blob());
              } catch (e) {
                f.stored = false;
              }
              if (!f.stored) migrationSucceeded = false;
            } else if (f) { f.stored = false; }
            if (f) delete f.data;
          }
          if (!await kvSet(KEY_STATE, JSON.stringify(data))) migrationSucceeded = false;
        }
      } else if (raw && legacyData && kvCache[KEY_STATE] !== undefined) {
        let current = null;
        try { current = JSON.parse(kvCache[KEY_STATE]); } catch (e) { migrationSucceeded = false; }
        if (current && Array.isArray(current.files) && Array.isArray(legacyData.files)) {
          let stateChanged = false;
          for (let i = 0; i < legacyData.files.length; i++) {
            const oldFile = legacyData.files[i];
            if (!oldFile || typeof oldFile.data !== 'string' || oldFile.data.indexOf('data:') !== 0) continue;
            const currentFile = current.files.find(function (f) { return f && f.id === oldFile.id; });
            if (!currentFile || currentFile.stored !== false) continue;
            try {
              currentFile.stored = await putFileBlob(oldFile.id, await (await fetch(oldFile.data)).blob());
            } catch (e) {
              currentFile.stored = false;
            }
            if (currentFile.stored) stateChanged = true;
            else migrationSucceeded = false;
          }
          if (stateChanged && !await kvSet(KEY_STATE, JSON.stringify(current))) migrationSucceeded = false;
        }
      }
      /* Copy other legacy values that are not saved yet. */
      const pairs = [[LEGACY_KEYS.ui, KEY_UI, true], [LEGACY_KEYS.donate, KEY_DONATE, true], [LEGACY_KEYS.note, KEY_NOTE, false], [LEGACY_KEYS.installDismissed, KEY_INSTALL, 'num']];
      for (let i = 0; i < pairs.length; i++) {
        let v = null;
        try { v = localStorage.getItem(pairs[i][0]); } catch (e) { v = null; }
        if (v !== null && kvCache[pairs[i][1]] === undefined) {
          let val = v;
          if (pairs[i][2] === true) { try { val = JSON.parse(v); } catch (e) { val = {}; } }
          if (pairs[i][2] === 'num') val = Number(v) || 0;
          if (!await kvSet(pairs[i][1], val)) migrationSucceeded = false;
        }
      }
      /* Remove legacy copies after migration. */
      if (migrationSucceeded) {
        Object.keys(LEGACY_KEYS).forEach(function (k) { try { localStorage.removeItem(LEGACY_KEYS[k]); } catch (e) { /* ignore */ } });
      }
    }

    /* Validates loaded or imported data and applies safe defaults. */
    function normalizeState(data) {
      const st = emptyState();
      if (!data || typeof data !== 'object') return st;
      const folders = (Array.isArray(data.folders) ? data.folders : []).filter(function (f) { return f && typeof f.id === 'string' && typeof f.name === 'string'; })
        .map(function (f) {
          const credits = Number(f.credits);
          const parts = (Array.isArray(f.gradeParts) ? f.gradeParts : []).filter(function (p) {
            return p && typeof p.id === 'string' && typeof p.name === 'string';
          }).map(function (p) {
            const weight = Number(p.weight);
            const score = p.score === '' || p.score === null || p.score === undefined ? null : Number(p.score);
            const max = p.max === '' || p.max === null || p.max === undefined ? null : Number(p.max);
            return {
              id: p.id,
              name: p.name.trim().slice(0, 80),
              weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
              score: Number.isFinite(score) ? Math.max(0, score) : null,
              max: Number.isFinite(max) ? Math.max(0, max) : null
            };
          });
          return {
            id: f.id,
            name: f.name,
            parentId: typeof f.parentId === 'string' ? f.parentId : '',
            color: APP_SETTINGS.FOLDER_COLORS.indexOf(f.color) > -1 ? f.color : APP_SETTINGS.FOLDER_COLORS[0],
            credits: Number.isFinite(credits) && credits >= 0 ? credits : '',
            gradeParts: parts
          };
        });
      /* Remove invalid, missing, or cyclic parent references. */
      const ids = {};
      folders.forEach(function (f) { ids[f.id] = f; });
      folders.forEach(function (f) { if (f.parentId && (!ids[f.parentId] || f.parentId === f.id)) f.parentId = ''; });
      folders.forEach(function (f) {
        let cur = f, steps = 0;
        while (cur && cur.parentId && steps < 50) { cur = ids[cur.parentId]; steps++; }
        if (steps >= 50) f.parentId = '';
      });
      st.folders = folders;
      st.files = (Array.isArray(data.files) ? data.files : []).filter(function (f) { return f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.folderId === 'string'; })
        .map(function (f) { return { id: f.id, folderId: f.folderId, name: f.name, size: Number(f.size) || 0, type: String(f.type || ''), added: typeof f.added === 'string' ? f.added : new Date().toISOString(), stored: f.stored !== false }; });
      st.files = st.files.filter(function (f) { return !!ids[f.folderId]; });   // drop files whose folder is gone
      st.deadlines = (Array.isArray(data.deadlines) ? data.deadlines : []).filter(function (d) { return d && typeof d.id === 'string' && typeof d.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date || ''); })
        .map(function (d) { return { id: d.id, title: d.title, course: String(d.course || ''), type: String(d.type || 'Other'), date: d.date, time: /^\d{2}:\d{2}$/.test(d.time || '') ? d.time : '', done: !!d.done }; });
      st.timetable = (Array.isArray(data.timetable) ? data.timetable : []).filter(function (c) { return c && typeof c.id === 'string' && /^[0-6]$/.test(String(c.day)) && /^\d{2}:\d{2}$/.test(c.start || '') && /^\d{2}:\d{2}$/.test(c.end || ''); })
        .map(function (c) { return { id: c.id, gid: typeof c.gid === 'string' ? c.gid : '', course: (typeof c.course === 'string' && ids[c.course]) ? c.course : '', title: String(c.title || '').slice(0, 80), day: Number(c.day), start: c.start, end: c.end, room: String(c.room || '').slice(0, 40) }; });
      st.checklist = (data.checklist && typeof data.checklist === 'object') ? data.checklist : {};
      const set = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
      if (['system', 'light', 'dark'].indexOf(set.theme) === -1) set.theme = 'system';
      set.name = typeof set.name === 'string' ? set.name.trim().slice(0, 40) : '';
      set.askedName = !!set.askedName;
      set.widgets = (Array.isArray(set.widgets) ? set.widgets : []).filter(function (id, i, arr) {
        return WIDGET_CATALOG.some(function (w) { return w.id === id; }) && arr.indexOf(id) === i;
      });
      if (!Array.isArray(set.extraTasks)) set.extraTasks = DEFAULT_SETTINGS.extraTasks.slice();
      set.gradingScale = (Array.isArray(set.gradingScale) ? set.gradingScale : DEFAULT_SETTINGS.gradingScale).filter(function (row) {
        return row && typeof row.letter === 'string';
      }).map(function (row) {
        const minimum = Number(row.minimum);
        const points = Number(row.points);
        return {
          letter: row.letter.trim().slice(0, 10),
          minimum: Number.isFinite(minimum) ? Math.max(0, Math.min(100, minimum)) : 0,
          points: Number.isFinite(points) ? Math.max(0, points) : 0
        };
      }).filter(function (row) { return row.letter; });
      if (!set.gradingScale.length) set.gradingScale = DEFAULT_SETTINGS.gradingScale.map(function (row) { return Object.assign({}, row); });
      st.settings = set;
      return st;
    }

    /* E. Deadline logic */

    /* Returns all deadlines sorted by date, then time. */
    function sortedDeadlines() {
      return state.deadlines.slice().sort(function (a, b) {
        return (a.date + (a.time || '23:59')).localeCompare(b.date + (b.time || '23:59'));
      });
    }

    /* Deadlines that fall on one specific day. */
    function deadlinesOn(dateStr) {
      return sortedDeadlines().filter(function (d) { return d.date === dateStr; });
    }

    /* Returns the deadline's countdown, status, and display label. */
    function dueInfo(d) {
      const diff = dayDiff(todayStr(), d.date);
      const at = d.time ? ' at ' + formatTime(d.time) : '';
      let overdue = diff < 0;
      if (diff === 0 && d.time) {
        const due = parseDateStr(d.date);
        const p = d.time.split(':').map(Number);
        due.setHours(p[0], p[1], 0, 0);
        overdue = new Date() > due;
      }
      if (d.done) return { diff: diff, overdue: false, level: 'done', label: 'Completed' };
      if (overdue) {
        const label = diff < 0 ? 'Overdue by ' + (-diff) + (diff === -1 ? ' day' : ' days') : 'Overdue' + at;
        return { diff: diff, overdue: true, level: 'danger', label: label };
      }
      let label;
      if (diff === 0) label = 'Due today' + at;
      else if (diff === 1) label = 'Due tomorrow' + at;
      else label = 'Due in ' + diff + ' days';
      const level = diff <= APP_SETTINGS.URGENT_DAYS ? 'danger' : (diff <= APP_SETTINGS.SOON_DAYS ? 'warn' : 'calm');
      return { diff: diff, overdue: false, level: level, label: label };
    }

    /* Counts files added to a folder during the current week. */
    function filesThisWeek(folderId) {
      const wk = weekStartStr(new Date());
      const ids = descendantIds(folderId);   // includes files in all subfolders
      return state.files.filter(function (f) {
        return ids.indexOf(f.folderId) > -1 && weekStartStr(new Date(f.added)) === wk;
      }).length;
    }

    /* Is a weekly checklist item ticked for the current week? */
    function isChecked(key) {
      const wk = state.checklist[weekStartStr(new Date())];
      return !!(wk && wk[key]);
    }

    /* Builds deadline, class, and weekly-slide alerts. */
    function buildAlerts() {
      const out = [];
      state.deadlines.forEach(function (d) {
        if (d.done) return;
        const info = dueInfo(d);
        if (info.level !== 'danger' && info.level !== 'warn') return;
        out.push({
          id: 'dl:' + d.id + ':' + info.level,
          level: info.level,
          rank: info.overdue ? -1000 + info.diff : info.diff,   // most urgent first
          title: d.title,
          course: courseName(d.course),
          message: info.label + (info.level === 'danger' ? '!' : ''),
          deadlineId: d.id
        });
      });
      /* Add class alerts with a live countdown. */
      const nowMs = Date.now();
      state.timetable.forEach(function (c) {
        for (let off = 0; off <= 1; off++) {
          const startTs = classTimeTs(c, c.start, off), endTs = classTimeTs(c, c.end, off);
          if (new Date(startTs).getDay() !== c.day || nowMs >= endTs) continue;   // not that weekday, or already over
          const room = roomText(c) ? ' \u2022 ' + roomText(c) : '';
          if (nowMs >= startTs) {
            out.push({ id: 'cls:' + c.id + ':' + startTs + ':now', level: 'info', rank: 5000, title: classLabel(c), course: courseName(c.course), message: 'In session until ' + formatTime(c.end) + room, classId: c.id });
            continue;
          }
          const left = startTs - nowMs;
          if (left > APP_SETTINGS.CLASS_ALERT_HOURS * 3600000) continue;
          const urgent = left <= APP_SETTINGS.CLASS_ALERT_MINUTES * 60000;
          out.push({
            id: 'cls:' + c.id + ':' + startTs + ':' + (urgent ? 'danger' : 'warn'),
            level: urgent ? 'danger' : 'warn',
            rank: urgent ? -1 + left / 6e7 : left / 86400000,
            title: classLabel(c), course: courseName(c.course),
            message: (off === 0 ? 'Today' : 'Tomorrow') + ' at ' + formatTime(c.start) + room,
            countdownTo: startTs, classId: c.id
          });
        }
      });
      out.sort(function (a, b) { return a.rank - b.rank; });

      const wk = weekStartStr(new Date());
      rootFolders().forEach(function (f) {
        if (filesThisWeek(f.id) === 0 && !isChecked('slides:' + f.id)) {
          out.push({
            id: 'slides:' + f.id + ':' + wk,
            level: 'info',
            rank: 9999,
            title: 'No ' + f.name + ' files uploaded this week',
            course: f.name,
            message: 'Have you added this week\u2019s lecture slides?',
            folderId: f.id
          });
        }
      });
      return out;
    }


    /* F. Navigation and header */

    /* Shows the requested page. */
    function showView(name) {
      ui.view = name;
      ['dashboard', 'files', 'calendar', 'timetable', 'settings'].forEach(function (v) {
        $('view-' + v).hidden = (v !== name);
        $('nav-' + v).setAttribute('aria-current', v === name ? 'page' : 'false');
      });
      renderAll();
      window.scrollTo(0, 0);
    }

    /* Updates the page title and date line at the top. */
    function renderHeader() {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
      const who = state.settings.name ? ', ' + state.settings.name : '';
      const titles = { dashboard: greeting + who, files: 'Files and folders', calendar: 'Study calendar', timetable: 'Class timetable', settings: 'Settings' };
      $('pageTitle').textContent = titles[ui.view];
      $('pageSub').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    /* Fills in the sidebar buttons and the bell with their icons and labels. */
    function renderChrome() {
      $('brandMark').innerHTML = icon('check');
      $('nav-dashboard').innerHTML = icon('home') + '<span>Dashboard</span>';
      $('nav-files').innerHTML = icon('folder') + '<span>Files</span>';
      $('nav-calendar').innerHTML = icon('calendar') + '<span>Calendar</span>';
      $('nav-timetable').innerHTML = icon('clock') + '<span>Timetable</span>';
      $('nav-settings').innerHTML = icon('sliders') + '<span>Settings</span>';
      $('addDeadlineBtn').innerHTML = icon('plus') + '<span>Add deadline</span>';
      $('installBtn').innerHTML = icon('download') + '<span>Install app</span>';
      $('installBtn').hidden = appIsInstalled();
      $('donateBtn').innerHTML = icon('heart') + '<span class="btn-label">Donate</span>';
      $('donateBtn').setAttribute('aria-label', 'Donate to support StudyDesk');
      $('donateBtn').hidden = !APP_INFO.DONATE_ENABLED;
      $('storageNote').textContent = storageWorks ? 'Saved on this device only.' : 'Saving is blocked in this browser. Your data lasts until you close the page.';
    }

    /* Redraws the bell and its red number (urgent + upcoming alerts only). */
    function renderBell() {
      const n = buildAlerts().filter(function (a) { return a.level !== 'info'; }).length;
      $('bellBtn').innerHTML = icon('bell') + (n ? '<span class="count">' + n + '</span>' : '');
      $('bellBtn').setAttribute('aria-label', n ? n + ' deadline alerts' : 'No deadline alerts');
    }

    /* Draws the colored banner at the top for the most urgent open alert. */
    function renderBanner() {
      const alerts = buildAlerts().filter(function (a) { return a.level !== 'info' && !ui.dismissed.has(a.id); });
      const area = $('bannerArea');
      if (!alerts.length) { area.innerHTML = ''; return; }
      const top = alerts[0];
      const more = alerts.length - 1;
      area.innerHTML =
        '<div class="banner banner-' + top.level + '" role="alert">' + icon('alert') +
        '<div class="banner-text">' + esc(top.title) + ' (' + esc(top.course) + '): ' + esc(top.message) + countdownHTML(top) +
        (more > 0 ? '<small>' + more + ' more deadline' + (more > 1 ? 's' : '') + ' need attention</small>' : '') + '</div>' +
        (top.classId ? '<button class="btn btn-small" data-action="nav" data-view="timetable">Timetable</button>' : '<button class="btn btn-small" data-action="view-deadline" data-id="' + esc(top.deadlineId) + '">View</button>') +
        '<button class="icon-btn" data-action="dismiss-banner" data-id="' + esc(top.id) + '" aria-label="Dismiss alert">' + icon('x') + '</button>' +
        '</div>';
    }

    /* Redraws everything that is currently visible. */
    function renderAll() {
      renderChrome();
      renderHeader();
      renderBell();
      renderBanner();
      if (ui.view === 'dashboard') renderDashboard();
      if (ui.view === 'files') renderFiles();
      if (ui.view === 'calendar') renderCalendar();
      if (ui.view === 'timetable') renderTimetable();
      if (ui.view === 'settings') renderSettings();
    }


    /* G. Dashboard */

    /* Builds one deadline row (used on the dashboard and under the calendar). */
    function deadlineRowHTML(d) {
      const info = dueInfo(d);
      return '<li class="dl-row ' + (d.done ? 'is-done' : '') + '" style="--c:' + courseColor(d.course) + '" data-action="view-deadline" data-id="' + esc(d.id) + '">' +
        '<button class="check ' + (d.done ? 'on' : '') + '" data-action="toggle-deadline" data-id="' + esc(d.id) + '" aria-pressed="' + d.done + '" aria-label="Mark ' + esc(d.title) + (d.done ? ' not done' : ' done') + '">' + (d.done ? icon('check') : '') + '</button>' +
        '<div><div class="dl-title">' + esc(d.title) + '</div>' +
        '<div class="dl-meta"><span class="tag-course">' + esc(courseName(d.course)) + '</span>' +
        '<span class="badge type-' + esc(d.type.toLowerCase()) + '">' + esc(d.type) + '</span></div></div>' +
        '<div class="dl-due due-' + info.level + '">' + esc(info.label) + '<small>' + esc(formatDate(d.date)) + (d.time ? ', ' + esc(formatTime(d.time)) : '') + '</small></div>' +
        '<div class="row-actions">' +
        '<button class="icon-btn" data-action="view-deadline" data-id="' + esc(d.id) + '" aria-label="View ' + esc(d.title) + '">' + icon('eye') + '</button>' +
        '<button class="icon-btn danger" data-action="delete-deadline" data-id="' + esc(d.id) + '" aria-label="Delete ' + esc(d.title) + '">' + icon('trash') + '</button>' +
        '</div></li>';
    }

    /* Draws the dashboard sections. */
    function renderDashboard() {
      renderWidgets();
      renderHero();
      renderTodayClasses();
      renderUpcoming();
      renderChecklist();
      renderFolderSummary();
      renderSemesterGPA();
    }

    /* The big blue "next deadline" card at the top of the dashboard. */
    function renderHero() {
      const next = sortedDeadlines().find(function (d) { return !d.done; });
      if (!next) {
        $('heroArea').innerHTML =
          '<div class="hero"><div><div class="hero-when">' + (state.deadlines.length ? 'You\u2019re all caught up' : 'No deadlines yet') + '</div>' +
          '<div class="hero-meta">' + (state.deadlines.length ? 'No open deadlines. Add one when your next assignment is announced.' : 'Add your first assignment, quiz or exam and it will show up here.') + '</div></div>' +
          '<button class="btn" data-action="add-deadline">Add a deadline</button></div>';
        return;
      }
      const info = dueInfo(next);
      $('heroArea').innerHTML =
        '<div class="hero ' + (info.level === 'danger' ? 'is-danger' : '') + '" style="--c:' + courseColor(next.course) + '">' +
        '<div><div class="hero-when">' + esc(info.label) + '</div>' +
        '<div class="hero-title">' + esc(next.title) + ' (' + esc(courseName(next.course)) + ')</div>' +
        '<div class="hero-meta">' + esc(formatDate(next.date)) + (next.time ? ' at ' + esc(formatTime(next.time)) : '') + '</div></div>' +
        '<button class="btn" data-action="view-deadline" data-id="' + esc(next.id) + '">View details</button></div>';
    }

    /* Alerts pop-up */

    /* Builds the list of alerts (or a friendly "all clear" message). */
    function alertListHTML() {
      const alerts = buildAlerts();
      if (!alerts.length) {
        return '<div class="empty"><strong>No alerts right now</strong>Nothing is due in the next ' + APP_SETTINGS.SOON_DAYS + ' days.</div>';
      }
      return alerts.map(function (a) {
        const action = a.classId ? '<button class="btn btn-ghost btn-small" data-action="nav" data-view="timetable">Timetable</button>' : a.deadlineId
          ? '<button class="btn btn-ghost btn-small" data-action="view-deadline" data-id="' + esc(a.deadlineId) + '">View</button>'
          : '<button class="btn btn-ghost btn-small" data-action="goto-folder" data-id="' + esc(a.folderId) + '">Upload</button>';
        return '<div class="alert-row alert-' + a.level + '"' + (a.deadlineId ? ' data-action="view-deadline" data-id="' + esc(a.deadlineId) + '"' : '') + '><span class="alert-dot">' + icon(a.classId ? 'clock' : (a.deadlineId ? (a.level === 'danger' ? 'alert' : 'clock') : 'upload')) + '</span>' +
          '<div class="alert-body"><strong>' + esc(a.title) + '</strong><span>' + esc((a.deadlineId || a.classId) ? a.course + ': ' : '') + esc(a.message) + countdownHTML(a) + '</span></div>' + action + '</div>';
      }).join('');
    }

    /* Opens the alerts pop-up (called when the bell is tapped). */
    function openAlertsDialog() {
      $('alertsHint').textContent = 'Deadlines within ' + APP_SETTINGS.SOON_DAYS + ' days are flagged. You can change this in Settings.';
      $('alertsBody').innerHTML = alertListHTML();
      if (!$('alertsDialog').open) $('alertsDialog').showModal();
    }

    /* The next few open deadlines. */
    function renderUpcoming() {
      const open = sortedDeadlines().filter(function (d) { return !d.done; });
      let html = '<div class="card-head"><h2>Upcoming deadlines</h2><button class="btn btn-ghost btn-small" data-action="nav" data-view="calendar">Open calendar</button></div>';
      if (!open.length) {
        html += '<div class="empty"><strong>Nothing coming up</strong>Click Add deadline to track an assignment, quiz, or exam.</div>';
      } else {
        html += '<ul>' + open.slice(0, 6).map(deadlineRowHTML).join('') + '</ul>';
        if (open.length > 6) html += '<p class="hint" style="margin-top:10px;color:var(--text-muted)">Showing 6 of ' + open.length + '. See all in the calendar.</p>';
      }
      $('upcomingCard').innerHTML = html;
    }

    /* The weekly checklist: slides for every course, plus your extra tasks. */
    function renderChecklist() {
      const wk = weekStartStr(new Date());
      const items = [];
      rootFolders().forEach(function (f) {
        const n = filesThisWeek(f.id);
        items.push({
          key: 'slides:' + f.id,
          label: 'Lecture slides uploaded for ' + f.name,
          hint: n ? '<span class="ok">' + n + (n === 1 ? ' file' : ' files') + ' added this week</span>' : '<span class="missing">No files added this week yet</span>',
          folderId: f.id
        });
      });
      const slideCount = items.length;
      APP_SETTINGS.EXTRA_WEEKLY_TASKS.forEach(function (t, i) { items.push({ key: 'extra:' + i, label: t, hint: '' }); });

      const done = items.filter(function (i) { return isChecked(i.key); }).length;
      const pct = items.length ? Math.round(done / items.length * 100) : 0;
      const weekLabel = parseDateStr(wk).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      let html = '<div class="card-head"><h2>Weekly check-in</h2><span class="hint">Week of ' + esc(weekLabel) + '</span></div>' +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Weekly checklist progress"><div style="width:' + pct + '%"></div></div>';
      if (!items.length) {
        html += '<div class="empty"><strong>No tasks yet</strong>Create a course folder and its slide reminder will appear here.</div>';
      }
      items.forEach(function (it, idx) {
        if (idx === 0 && slideCount) html += '<p class="sec-label" style="margin-top:0">Did you upload all required slides?</p>';
        if (idx === slideCount && idx > 0) html += '<p class="sec-label">Other weekly habits</p>';
        const on = isChecked(it.key);
        html += '<div class="todo ' + (on ? 'is-done' : '') + '">' +
          '<button class="check ' + (on ? 'on' : '') + '" data-action="toggle-check" data-key="' + esc(it.key) + '" aria-pressed="' + on + '" aria-label="' + esc(it.label) + '">' + (on ? icon('check') : '') + '</button>' +
          '<div class="todo-text"><strong>' + esc(it.label) + '</strong>' + (it.hint ? it.hint : '') + '</div>' +
          (it.folderId && !on ? '<button class="btn btn-ghost btn-small" data-action="goto-folder" data-id="' + esc(it.folderId) + '">Upload</button>' : '') +
          '</div>';
      });
      if (items.length && done === items.length) html += '<p style="margin-top:12px;color:var(--ok);font-weight:650">All done for this week.</p>';
      $('checklistCard').innerHTML = html;
    }

    /* A quick list of your folders with file counts. */
    function renderFolderSummary() {
      let html = '<div class="card-head"><h2>Your courses</h2><button class="btn btn-ghost btn-small" data-action="nav" data-view="files">Manage files</button></div>';
      if (!state.folders.length) {
        html += '<div class="empty"><strong>No folders yet</strong>Create one folder per course to keep slides and notes together.<br><button class="btn btn-small" data-action="new-folder">New folder</button></div>';
      } else {
        html += rootFolders().map(function (f) {
          const total = fileCountDeep(f.id);
          return '<button class="mini-folder" data-action="goto-folder" data-id="' + esc(f.id) + '"><span class="fold-tile sm" style="--c:' + f.color + '">' + icon('folder') + '</span>' +
            '<span class="name">' + esc(f.name) + '</span><span class="num">' + total + (total === 1 ? ' file' : ' files') + '</span></button>';
        }).join('');
      }
      $('folderSummaryCard').innerHTML = html;
    }

    /* Semester GPA is shown only when at least one course has a standing and credits. */
    function renderSemesterGPA() {
      const area = $('checklistCard').parentElement;
      const existing = area.querySelector('.semester-gpa-card');
      if (existing) existing.remove();
      const gpa = semesterGPA();
      if (gpa === null) return;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="card-head"><h2>Semester GPA</h2></div>' +
        '<div class="gpa-value">' + gpa.toFixed(2) + '</div>' +
        '<p class="hint">Based on courses with scored marks and credits.</p>';
      card.className = 'card semester-gpa-card';
      area.appendChild(card);
    }


    /* H. Files and folders */

    /* Remember expanded folders. */

    /* Loads the list of folders that were left open last time. */
    function loadUiPrefs() {
      const p = kvGet(KEY_UI, {}) || {};
      (Array.isArray(p.expanded) ? p.expanded : []).forEach(function (id) { ui.expanded.add(id); });
    }

    /* Saves which folders are open. */
    function saveUiPrefs() {
      kvSet(KEY_UI, { expanded: Array.from(ui.expanded) });
    }

    /* Opens a closed folder in the tree, or closes an open one. */
    function toggleExpanded(id) {
      if (ui.expanded.has(id)) ui.expanded.delete(id); else ui.expanded.add(id);
      saveUiPrefs();
    }

    /* Opens every folder above the given one, so it is visible in the tree. */
    function expandPathTo(id) {
      let f = folderById(id), g = 0;
      while (f && f.parentId && g++ < 20) { ui.expanded.add(f.parentId); f = folderById(f.parentId); }
      saveUiPrefs();
    }

    /* Returns the selected folder and its parents. */
    function selectedPathIds() {
      const out = [];
      let f = folderById(ui.folderId), g = 0;
      while (f && g++ < 20) { out.push(f.id); f = f.parentId ? folderById(f.parentId) : null; }
      return out;
    }

    /* Builds the expandable folder tree. */
    function folderTreeHTML(parentId) {
      const kids = childFolders(parentId);
      const limit = parentId ? 5 : 8;                       // <-- how many to show before "View more"
      const key = parentId || 'root';
      const showAll = ui.more.has(key);
      const path = selectedPathIds();
      const visible = kids.filter(function (f, i) { return showAll || i < limit || path.indexOf(f.id) > -1; });
      const hidden = kids.length - visible.length;

      let out = visible.map(function (f) {
        const depth = folderDepth(f.id);
        const color = rootOf(f.id).color;
        const hasKids = childFolders(f.id).length > 0;
        const open = hasKids && ui.expanded.has(f.id);
        return '<div class="folder-item ' + (depth === 0 ? 'is-main' : 'is-sub') + '" style="--depth:' + depth + ';--c:' + color + '">' +
          '<button class="folder-pick" data-action="toggle-folder" data-id="' + esc(f.id) + '" aria-pressed="' + (f.id === ui.folderId) + '"' + (hasKids ? ' aria-expanded="' + open + '"' : '') + '>' +
          (depth === 0 ? '<span class="fold-tile">' + icon('folder') + '</span>' : '<span class="fold-mini">' + icon('folder') + '</span>') +
          '<span class="name">' + esc(f.name) + '</span><span class="num">' + fileCountDeep(f.id) + '</span>' +
          (hasKids ? '<span class="chev ' + (open ? 'open' : '') + '">' + icon('chev') + '</span>' : '') + '</button>' +
          (depth === 0 ? '<button class="icon-btn" data-action="open-grades" data-id="' + esc(f.id) + '" aria-label="Grades for ' + esc(f.name) + '">' + 'G' + '</button>' : '') +
          (depth < APP_SETTINGS.MAX_FOLDER_DEPTH - 1 ? '<button class="icon-btn" data-action="new-folder" data-parent="' + esc(f.id) + '" aria-label="New subfolder in ' + esc(f.name) + '">' + icon('plus') + '</button>' : '') +
          '<button class="icon-btn danger" data-action="delete-folder" data-id="' + esc(f.id) + '" aria-label="Delete folder ' + esc(f.name) + '">' + icon('trash') + '</button></div>' +
          (open ? folderTreeHTML(f.id) : '');
      }).join('');

      const vm = 'style="--depth:' + (parentId ? folderDepth(parentId) + 1 : 0) + '" data-id="' + esc(key) + '"';
      if (hidden > 0) out += '<button class="view-more" ' + vm + ' data-action="view-more">View ' + hidden + ' more</button>';
      else if (showAll && kids.length > limit) out += '<button class="view-more" ' + vm + ' data-action="view-less">Show less</button>';
      return out;
    }

    /* Draws the folder tree and selected folder. */
    function renderFiles() {
      if (!folderById(ui.folderId)) { const r = rootFolders()[0]; ui.folderId = r ? r.id : null; }

      /* --- Left: tree of folders --- */
      let list = '<div class="card-head"><h2>Folders</h2><button class="btn btn-small" data-action="new-folder" data-parent="" aria-label="New main folder">' + icon('plus') + '<span>New</span></button></div>';
      if (!state.folders.length) {
        list += '<div class="empty"><strong>Start with a course folder</strong>For example CICS 111 or MATH 173. You can add subfolders inside it later.</div>';
      } else {
        list += '<div class="folder-tree">' + folderTreeHTML('') + '</div>';
      }
      $('folderListCard').innerHTML = list;

      /* --- Right: the selected folder --- */
      const f = folderById(ui.folderId);
      if (!f) {
        $('folderDetailCard').innerHTML = '<div class="empty"><strong>No folder selected</strong>Create a folder to start uploading files.<br><button class="btn" data-action="new-folder" data-parent="">Create a folder</button></div>';
        return;
      }
      const color = rootOf(f.id).color;
      const subs = childFolders(f.id);
      const files = state.files.filter(function (x) { return x.folderId === f.id; })
        .sort(function (a, b) { return b.added.localeCompare(a.added); });

      /* Breadcrumb path: CICS 111 / Lecture slides (each earlier part is clickable) */
      const chain = [];
      let c = f, g = 0;
      while (c && g++ < 20) { chain.unshift(c); c = c.parentId ? folderById(c.parentId) : null; }
      const crumbs = chain.length > 1 ? '<nav class="crumbs" aria-label="Folder path">' + chain.map(function (x, i) {
        return i < chain.length - 1
          ? '<button class="crumb" data-action="select-folder" data-id="' + esc(x.id) + '">' + esc(x.name) + '</button><span class="sep">/</span>'
          : '<span class="crumb-current">' + esc(x.name) + '</span>';
      }).join('') + '</nav>' : '';

      const canAddSub = folderDepth(f.id) < APP_SETTINGS.MAX_FOLDER_DEPTH - 1;
      let html = crumbs + '<div class="card-head"><div class="folder-title ' + (f.parentId ? 'is-sub' : 'is-main') + '" style="--c:' + color + '">' +
        (f.parentId ? '<span class="fold-mini">' + icon('folder') + '</span>' : '<span class="fold-tile big">' + icon('folder') + '</span>') +
        '<div><h2>' + esc(f.name) + '</h2><span class="kind">' + (f.parentId ? 'Subfolder in ' + esc(folderById(f.parentId) ? folderById(f.parentId).name : '') : 'Main folder') + '</span></div></div>' +
        '<div class="head-actions"><span class="hint">' + files.length + (files.length === 1 ? ' file here' : ' files here') + '</span>' +
        (canAddSub ? '<button class="btn btn-ghost btn-small" data-action="new-folder" data-parent="' + esc(f.id) + '">' + icon('plus') + '<span>New subfolder</span></button>' : '') +
        '<button class="btn btn-ghost btn-small" data-action="open-grades" data-id="' + esc(rootOf(f.id).id) + '">Grades</button>' +
        '</div></div>';

      if (subs.length) {
        html += '<p class="sub-label">Subfolders</p><div class="subfolders">' + subs.map(function (sf) {
          return '<button class="subfolder" style="--c:' + color + '" data-action="select-folder" data-id="' + esc(sf.id) + '">' + icon('folder') +
            '<span class="name">' + esc(sf.name) + '</span><span class="num">' + fileCountDeep(sf.id) + '</span></button>';
        }).join('') + '</div>';
      }

      html += '<div class="dropzone" data-action="pick-files" tabindex="0" role="button" aria-label="Upload files to ' + esc(folderPath(f.id)) + '">' +
        icon('upload') + '<strong>Drop files here or click to choose</strong>' +
        '<span>They will be added to ' + esc(folderPath(f.id)) + '</span>' +
            '<span class="dz-tip">Tip: PDFs, images and text open inside the app. PowerPoint, Word and Excel files are download-only.</span></div>';

      if (!files.length) {
        html += '<div class="empty" style="margin-top:14px"><strong>No files in this folder yet</strong>' + (subs.length ? 'Open a subfolder above, or upload here.' : 'Upload lecture slides, notes, or readings.') + '</div>';
      } else {
        html += '<ul style="margin-top:14px">' + files.map(function (x) {
          return '<li class="file-row"><span class="file-ext">' + esc(fileExt(x.name)) + '</span>' +
            '<div class="file-info"><strong title="' + esc(x.name) + '">' + esc(x.name) + '</strong>' +
            '<span>' + formatSize(x.size) + ', added ' + esc(new Date(x.added).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + (x.stored === false ? ', contents not saved' : '') + (downloadOnlyKind(x.name) ? ' <b class="dl-only">Download only</b>' : '') + '</span></div>' +
            '<button class="icon-btn" data-action="view-file" data-id="' + esc(x.id) + '" aria-label="View ' + esc(x.name) + '">' + icon('eye') + '</button>' +
            '<button class="icon-btn danger" data-action="remove-file" data-id="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">' + icon('trash') + '</button></li>';
        }).join('') + '</ul>';
      }
      $('folderDetailCard').innerHTML = html;
    }

    /* Adds files to a folder and saves them in IndexedDB. */
    function handleFiles(fileList, folderId) {
      const folder = folderById(folderId);
      if (!folder) { toast('Create a folder first, then upload.'); return; }
      const files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;

      /* Skip files bigger than the limit in APP_SETTINGS.MAX_FILE_BYTES */
      const tooBig = files.filter(function (f) { return f.size > APP_SETTINGS.MAX_FILE_BYTES; });
      const okFiles = files.filter(function (f) { return f.size <= APP_SETTINGS.MAX_FILE_BYTES; });
      if (tooBig.length) toast(tooBig[0].name + ' is bigger than ' + formatSize(APP_SETTINGS.MAX_FILE_BYTES) + ' and was skipped.');
      if (!okFiles.length) return;

      Promise.all(okFiles.map(function (file) {
        const rec = { id: uid(), folderId: folderId, name: file.name, size: file.size, type: file.type || '', added: new Date().toISOString(), stored: true };
        return putFileBlob(rec.id, file).then(function (saved) { rec.stored = saved; return rec; });
      })).then(function (recs) {
        recs.forEach(function (r) { state.files.push(r); });
        saveState();
        const unsaved = recs.filter(function (r) { return !r.stored; }).length;
            const noPreview = recs.filter(function (r) { return downloadOnlyKind(r.name); });
        if (unsaved) toast(unsaved + (unsaved === 1 ? ' file' : ' files') + ' couldn\u2019t be saved on this device and will only last until you close the page.');
        else if (noPreview.length) toast(downloadOnlyKind(noPreview[0].name) + ' files can\u2019t be previewed here. Export to PDF to read slides inside StudyDesk.');
            else if (!tooBig.length) toast(recs.length + (recs.length === 1 ? ' file' : ' files') + ' added to ' + folderPath(folderId));
        renderAll();
      });
    }

    /* Detects file type from its MIME type or extension. */
    function guessMime(f, blob) {
      const t = String(f.type || blob.type || '').toLowerCase();
      if (t && t !== 'application/octet-stream') return t;
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const map = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
        txt: 'text/plain', md: 'text/plain', csv: 'text/plain', json: 'text/plain' };
      return map[ext] || t;
    }

    /* Use the page viewer for mobile PDFs. */
    function canShowPdfInline() {
      return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.pdfViewerEnabled !== false;
    }

    /* Loads the PDF reader library the first time it is needed (needs internet once). */
    function loadPdfJs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      return new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    /* Draws every page of a PDF as pictures inside the pop-up. */
    async function renderPdfPages(blob, body) {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
      body.innerHTML = '<div class="pdf-pages"></div>';
      const wrap = body.firstChild;
      const cssWidth = Math.max(240, Math.min(body.clientWidth || 600, 900) - 16);
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (cssWidth / base.width) * (window.devicePixelRatio || 1) });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = cssWidth + 'px';
        wrap.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }
    }

    /* Opens a saved file in the viewer when its type is supported. */
    function openFileViewer(id) {
      const f = state.files.find(function (x) { return x.id === id; });
      if (!f) return;
      $('viewerTitle').textContent = f.name;
      $('viewerMeta').textContent = folderPath(f.folderId) + ', ' + formatSize(f.size);
      const body = $('viewerBody');
      const dl = $('viewerDownload');
      dl.innerHTML = '';
      body.innerHTML = '<div class="viewer-note">Loading\u2026</div>';
      $('viewerDialog').showModal();

      getFileBlob(id).then(function (blob) {
        if (!blob) {
          body.innerHTML = '<div class="viewer-note">This file\u2019s contents aren\u2019t saved on this device (for example it was too big for a backup). Upload it again to view it.</div>';
          return;
        }
        const type = guessMime(f, blob);
        /* Set the MIME type so the browser can preview the file. */
        if (!blobUrls[id]) blobUrls[id] = URL.createObjectURL(type ? new Blob([blob], { type: type }) : blob);
        const src = blobUrls[id];
        const previewable = /^(image|video|audio)\//.test(type) || type === 'application/pdf';
        dl.innerHTML = (previewable ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + esc(src) + '">Open</a> ' : '') +
          '<a class="btn btn-ghost" download="' + esc(f.name) + '" href="' + esc(src) + '">Download</a>';
        if (type.indexOf('image/') === 0) {
          body.innerHTML = '<img alt="' + esc(f.name) + '" src="' + esc(src) + '">';
        } else if (type.indexOf('video/') === 0) {
          body.innerHTML = '<video controls playsinline src="' + esc(src) + '"></video>';
        } else if (type.indexOf('audio/') === 0) {
          body.innerHTML = '<audio controls src="' + esc(src) + '"></audio>';
        } else if (type === 'application/pdf') {
          if (canShowPdfInline()) {
            body.innerHTML = '<iframe title="' + esc(f.name) + '" src="' + esc(src) + '"></iframe>';
          } else {
            body.innerHTML = '<div class="viewer-note">Loading PDF\u2026</div>';
            renderPdfPages(blob, body).catch(function () {
              body.innerHTML = '<div class="viewer-note">Couldn\u2019t show this PDF here (the PDF viewer needs internet the first time). Use Open or Download.</div>';
            });
          }
        } else if (type.indexOf('text/') === 0 || /\.(txt|md|csv|json)$/.test(f.name.toLowerCase())) {
          blobToText(blob).then(function (t) {
            body.innerHTML = '<pre>' + esc(t.slice(0, 20000)) + (t.length > 20000 ? '\n\n(Preview shortened)' : '') + '</pre>';
          }).catch(function () {
            body.innerHTML = '<div class="viewer-note">Couldn\u2019t show a preview. Use Download to open it.</div>';
          });
        } else {
          body.innerHTML = noPreviewNote(f.name);
        }
      });
    }

    /* Reads a file as text (for the .txt/.md/.csv preview). */
    function blobToText(blob) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(String(r.result)); };
        r.onerror = reject;
        r.readAsText(blob);
      });
    }

    /* Reads a file as a "data:" link (used when packing small files into a backup). */
    function blobToDataURL(blob) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(String(r.result)); };
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }

    /* Builds folder destination options. */
    function folderParentOptions(selected) {
      let out = '<option value=""' + (!selected ? ' selected' : '') + '>Main folder (top level)</option>';
      (function walk(pid) {
        childFolders(pid).forEach(function (f) {
          if (folderDepth(f.id) < APP_SETTINGS.MAX_FOLDER_DEPTH - 1) {
            out += '<option value="' + esc(f.id) + '"' + (f.id === selected ? ' selected' : '') + '>Inside: ' + esc(folderPath(f.id)) + '</option>';
          }
          walk(f.id);
        });
      })('');
      return out;
    }

    /* Updates the pop-up title and hides the color choice when making a subfolder
       (subfolders use their main folder's color). */
    function syncFolderModal() {
      const isSub = !!$('folderParent').value;
      $('folderColorField').hidden = isSub;
      $('folderDlgTitle').textContent = isSub ? 'New subfolder' : 'New main folder';
    }

    /* Opens the folder dialog, optionally inside a parent. */
    function openFolderModal(parentId) {
      $('folderForm').reset();
      $('folderError').textContent = '';
      $('folderParent').innerHTML = folderParentOptions(parentId || '');
      const used = rootFolders().map(function (f) { return f.color; });
      const pick = APP_SETTINGS.FOLDER_COLORS.find(function (c) { return used.indexOf(c) === -1; }) || APP_SETTINGS.FOLDER_COLORS[0];
      $('folderColors').innerHTML = APP_SETTINGS.FOLDER_COLORS.map(function (c, i) {
        return '<label><input type="radio" name="fcolor" value="' + c + '" ' + (c === pick ? 'checked' : '') + ' aria-label="Color ' + (i + 1) + '"><span class="dot" style="--c:' + c + '"></span></label>';
      }).join('');
      syncFolderModal();
      $('folderDialog').showModal();
      $('folderName').focus();
    }

    /* Saves the new folder from the pop-up. */
    function saveFolder(e) {
      e.preventDefault();
      const name = $('folderName').value.trim();
      const parentId = $('folderParent').value;
      const err = $('folderError');
      if (!name) { err.textContent = 'Enter a folder name, such as ' + (parentId ? 'Lecture slides.' : 'CICS 111.'); return; }
      if (state.folders.some(function (f) { return (f.parentId || '') === parentId && f.name.toLowerCase() === name.toLowerCase(); })) {
        err.textContent = 'There is already a folder called ' + name + ' here.'; return;
      }
      const checked = document.querySelector('input[name="fcolor"]:checked');
      const color = parentId ? rootOf(parentId).color : (checked ? checked.value : APP_SETTINGS.FOLDER_COLORS[0]);
      const folder = { id: uid(), name: name, color: color, parentId: parentId, credits: '', gradeParts: [] };
      state.folders.push(folder);
      ui.folderId = folder.id;
      expandPathTo(folder.id);   // open the parent so the new subfolder is visible
      saveState();
      $('folderDialog').close();
      if (ui.view !== 'files') showView('files'); else renderAll();
      toast((parentId ? 'Subfolder created: ' : 'Folder created: ') + name);
    }

    /* Deletes a folder, everything inside it, and its files (after confirming).
       Deadlines for a deleted course are kept and shown as General. */
    function deleteFolder(id) {
      const f = folderById(id);
      if (!f) return;
      const ids = descendantIds(id);
      const fileN = state.files.filter(function (x) { return ids.indexOf(x.folderId) > -1; }).length;
      const subN = ids.length - 1;
      const msg = 'This removes the folder' + (subN ? ', its ' + subN + (subN === 1 ? ' subfolder' : ' subfolders') : '') +
        ' and ' + fileN + (fileN === 1 ? ' file' : ' files') + '.' + (f.parentId ? '' : ' Deadlines for this course are kept and shown as General.');
      askConfirm('Delete ' + f.name + '?', msg, 'Delete folder', function () {
        state.files.filter(function (x) { return ids.indexOf(x.folderId) > -1; }).forEach(function (x) { discardFile(x.id); });
        state.files = state.files.filter(function (x) { return ids.indexOf(x.folderId) === -1; });
        state.deadlines.forEach(function (d) { if (ids.indexOf(d.course) > -1) d.course = ''; });
        state.folders = state.folders.filter(function (x) { return ids.indexOf(x.id) === -1; });
        if (ids.indexOf(ui.folderId) > -1) ui.folderId = f.parentId || null;
        saveState(); renderAll(); toast('Folder deleted');
      });
    }

    /* Removes one file (after confirming). */
    function removeFile(id) {
      const f = state.files.find(function (x) { return x.id === id; });
      if (!f) return;
      askConfirm('Remove this file?', f.name + ' will be removed from ' + folderPath(f.folderId) + '.', 'Remove file', function () {
        discardFile(id);
        state.files = state.files.filter(function (x) { return x.id !== id; });
        saveState(); renderAll(); toast('File removed');
      });
    }

    /* Fully removes one file: its saved contents in IndexedDB and its preview link. */
    function discardFile(id) {
      if (blobUrls[id]) { URL.revokeObjectURL(blobUrls[id]); delete blobUrls[id]; }
      deleteFileBlob(id);
    }

    /* Frees every preview link (used before clearing or restoring all data). */
    function releaseAllPreviews() {
      Object.keys(blobUrls).forEach(function (id) { URL.revokeObjectURL(blobUrls[id]); delete blobUrls[id]; });
    }


    /* I. Calendar */

    /* Draws the month grid and the list of that month's deadlines. */
    function renderCalendar() {
      const y = ui.cal.y, m = ui.cal.m;
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const order = APP_SETTINGS.WEEK_STARTS_ON_MONDAY ? names.slice(1).concat(names[0]) : names;
      const first = new Date(y, m, 1);
      const offset = APP_SETTINGS.WEEK_STARTS_ON_MONDAY ? (first.getDay() + 6) % 7 : first.getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
      const today = todayStr();

      let html = '<div class="cal-head"><h2>' + esc(first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })) + '</h2>' +
        '<div class="cal-nav"><button class="btn btn-ghost btn-small" data-action="cal-today">Today</button>' +
        '<button class="icon-btn" style="border-color:var(--border)" data-action="cal-prev" aria-label="Previous month">' + icon('left') + '</button>' +
        '<button class="icon-btn" style="border-color:var(--border)" data-action="cal-next" aria-label="Next month">' + icon('right') + '</button></div></div>' +
        '<div class="cal-grid" role="grid">' + order.map(function (n) { return '<div class="cal-dow">' + n + '</div>'; }).join('');

      for (let i = 0; i < cellCount; i++) {
        const d = new Date(y, m, 1 - offset + i);
        const ds = toDateStr(d);
        const items = deadlinesOn(ds);
        const cls = ['cell'];
        if (d.getMonth() !== m) cls.push('other');
        if (ds === today) cls.push('today');
        const chips = items.slice(0, 3).map(function (it) {
          return '<span class="chip ' + (it.done ? 'is-done' : '') + '" style="--c:' + courseColor(it.course) + '" data-action="view-deadline" data-id="' + esc(it.id) + '" title="' + esc(it.title + ' (' + courseName(it.course) + ')') + '">' + esc(it.title) + '</span>';
        }).join('') + (items.length > 3 ? '<span class="more">+' + (items.length - 3) + '</span>' : '');
        html += '<div class="' + cls.join(' ') + '" tabindex="0" data-action="add-on-day" data-date="' + ds + '" aria-label="' + esc(d.toDateString()) + ', ' + items.length + ' deadlines. Press Enter to add one.">' +
          '<span class="daynum">' + d.getDate() + '</span><div class="chips">' + chips + '</div></div>';
      }
      html += '</div><p style="margin-top:10px;color:var(--text-muted);font-size:13.5px">Click any day to add a deadline. Click a deadline to edit it.</p>';
      $('calendarCard').innerHTML = html;

      /* Month list under the calendar (also the full-detail view on phones) */
      const prefix = y + '-' + pad(m + 1);
      const monthItems = sortedDeadlines().filter(function (d) { return d.date.indexOf(prefix) === 0; });
      let list = '<div class="card-head"><h2>Deadlines in ' + esc(first.toLocaleDateString(undefined, { month: 'long' })) + '</h2><span class="hint">' + monthItems.length + ' total</span></div>';
      list += monthItems.length ? '<ul>' + monthItems.map(deadlineRowHTML).join('') + '</ul>'
        : '<div class="empty"><strong>No deadlines this month</strong>Click a day on the calendar to add one.</div>';
      $('monthListCard').innerHTML = list;
    }

    /* Moves the calendar by a number of months (-1 = back, +1 = forward). */
    function shiftMonth(delta) {
      const d = new Date(ui.cal.y, ui.cal.m + delta, 1);
      ui.cal.y = d.getFullYear();
      ui.cal.m = d.getMonth();
      renderCalendar();
    }


    /* J. Deadline editing */

    /* Opens the deadline pop-up. Pass {date} to add on a day, or {id} to edit. */
    function openDeadlineModal(opts) {
      opts = opts || {};
      const editing = opts.id ? state.deadlines.find(function (d) { return d.id === opts.id; }) : null;
      ui.editingId = editing ? editing.id : null;

      $('deadlineDlgTitle').textContent = editing ? 'Edit deadline' : 'Add deadline';
      $('dlDeleteBtn').hidden = !editing;
      $('dlError').textContent = '';

      /* Course dropdown: your folders plus "General" */
      $('dlCourse').innerHTML = rootFolders().map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>'; }).join('') +
        '<option value="">General (no course)</option>';
      $('dlType').innerHTML = APP_SETTINGS.DEADLINE_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');

      if (editing) {
        $('dlTitle').value = editing.title;
        $('dlCourse').value = editing.course;
        $('dlType').value = editing.type;
        $('dlDate').value = editing.date;
        $('dlTime').value = editing.time || '';
      } else {
        $('dlTitle').value = '';
        $('dlCourse').value = (ui.view === 'files' && ui.folderId && rootOf(ui.folderId)) ? rootOf(ui.folderId).id : (rootFolders()[0] ? rootFolders()[0].id : '');
        $('dlType').value = APP_SETTINGS.DEADLINE_TYPES[0];
        $('dlDate').value = opts.date || todayStr();
        $('dlTime').value = APP_SETTINGS.DEFAULT_DUE_TIME;
      }

      /* Show what's already due on that day, so you can spot clashes */
      const existing = (!editing && opts.date) ? deadlinesOn(opts.date) : [];
      $('dayList').innerHTML = existing.length
        ? '<div class="day-list"><strong>Already due on ' + esc(formatDate(opts.date)) + '</strong><ul>' +
        existing.map(function (d) { return '<li>' + esc(d.title) + ' (' + esc(courseName(d.course)) + ')' + (d.time ? ', ' + esc(formatTime(d.time)) : '') + '</li>'; }).join('') + '</ul></div>'
        : '';

      $('deadlineDialog').showModal();
      $('dlTitle').focus();
    }

    /* Validates and saves the deadline form. */
    function saveDeadline(e) {
      e.preventDefault();
      const title = $('dlTitle').value.trim();
      const date = $('dlDate').value;
      const err = $('dlError');
      if (!title) { err.textContent = 'Enter a title, such as Homework 3.'; $('dlTitle').focus(); return; }
      if (!date) { err.textContent = 'Choose a due date.'; $('dlDate').focus(); return; }

      const data = { title: title, course: $('dlCourse').value, type: $('dlType').value, date: date, time: $('dlTime').value };
      if (ui.editingId) {
        const d = state.deadlines.find(function (x) { return x.id === ui.editingId; });
        if (d) Object.assign(d, data);
      } else {
        state.deadlines.push(Object.assign({ id: uid(), done: false }, data));
      }
      /* Jump the calendar to the month of the saved deadline */
      const dd = parseDateStr(date);
      ui.cal.y = dd.getFullYear(); ui.cal.m = dd.getMonth();
      saveState();
      $('deadlineDialog').close();
      renderAll();
      toast(ui.editingId ? 'Deadline updated' : 'Deadline added');
    }

    /* Ticks a deadline done / not done. */
    function toggleDeadline(id) {
      const d = state.deadlines.find(function (x) { return x.id === id; });
      if (!d) return;
      d.done = !d.done;
      saveState(); renderAll();
      if ($('viewDialog').open && ui.viewingId === id) renderViewDialog();
      toast(d.done ? 'Marked as done' : 'Marked as not done');
    }

    /* Deletes a deadline after confirming. */
    function deleteDeadline(id, closeModalFirst) {
      const d = state.deadlines.find(function (x) { return x.id === id; });
      if (!d) return;
      if (closeModalFirst) $('deadlineDialog').close();
      askConfirm('Delete this deadline?', d.title + ' (' + courseName(d.course) + ') will be removed.', 'Delete deadline', function () {
        state.deadlines = state.deadlines.filter(function (x) { return x.id !== id; });
        if ($('viewDialog').open) $('viewDialog').close();
        saveState(); renderAll(); toast('Deadline deleted');
      });
    }

    /* Ticks / unticks a weekly checklist item. It resets automatically each Monday. */
    function toggleCheck(key) {
      const wk = weekStartStr(new Date());
      state.checklist[wk] = state.checklist[wk] || {};
      state.checklist[wk][key] = !state.checklist[wk][key];
      /* Keep only the 8 most recent weeks so storage stays small */
      Object.keys(state.checklist).sort().slice(0, -8).forEach(function (k) { delete state.checklist[k]; });
      saveState(); renderAll();
    }


    /* J2. Read-only deadline view */

    /* Opens the read-only details pop-up for a deadline. */
    function openViewDialog(id) {
      if (!state.deadlines.some(function (d) { return d.id === id; })) return;
      ui.viewingId = id;
      renderViewDialog();
      if (!$('viewDialog').open) $('viewDialog').showModal();
    }

    /* Fills the details pop-up (also called again after "Mark as done"). */
    function renderViewDialog() {
      const d = state.deadlines.find(function (x) { return x.id === ui.viewingId; });
      if (!d) return;
      const info = dueInfo(d);
      const fullDate = parseDateStr(d.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      $('viewDlBody').innerHTML =
        '<div class="dlg view-dl" style="--c:' + courseColor(d.course) + '">' +
        '<div class="vd-top"><span class="tag-course">' + esc(courseName(d.course)) + '</span>' +
        '<span class="badge type-' + esc(d.type.toLowerCase()) + '">' + esc(d.type) + '</span></div>' +
        '<h2 class="vd-title" id="vdTitle">' + esc(d.title) + '</h2>' +
        '<p class="vd-when due-' + info.level + '">' + esc(info.label) + '</p>' +
        '<dl class="vd-grid">' +
        '<div><dt>Due date</dt><dd>' + esc(fullDate) + '</dd></div>' +
        '<div><dt>Time</dt><dd>' + (d.time ? esc(formatTime(d.time)) : 'No time set') + '</dd></div>' +
        '<div><dt>Course</dt><dd>' + esc(courseName(d.course)) + '</dd></div>' +
        '<div><dt>Status</dt><dd>' + (d.done ? 'Completed' : 'Not done yet') + '</dd></div></dl>' +
        '<div class="dlg-actions">' +
        '<button type="button" class="btn btn-danger" data-action="delete-deadline" data-id="' + esc(d.id) + '">Delete</button>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" data-action="share-deadline" data-id="' + esc(d.id) + '">' + icon('share') + '<span>Share</span></button>' +
        '<button type="button" class="btn btn-ghost" data-action="toggle-deadline" data-id="' + esc(d.id) + '">' + (d.done ? 'Mark as not done' : 'Mark as done') + '</button>' +
        '<button type="button" class="btn" data-action="edit-deadline" data-id="' + esc(d.id) + '">' + icon('edit') + '<span>Edit</span></button>' +
        '</div>' +
        '<div class="dlg-actions" style="margin-top:10px"><button type="button" class="btn btn-ghost" style="width:100%" data-action="close-dialog">Close</button></div>' +
        '</div>';
    }


    /* K. Confirmation and reset */

    /* Shows the "Are you sure?" pop-up; runs onOk if the user confirms. */
    function askConfirm(title, message, okText, onOk) {
      $('confirmTitle').textContent = title;
      $('confirmMsg').textContent = message;
      $('confirmOk').textContent = okText || 'Delete';
      confirmCallback = onOk;
      $('confirmDialog').showModal();
    }

    /* Wipes all data (after confirming). */
    function resetAll() {
      askConfirm('Clear all data?', 'This deletes every folder, file, and deadline stored on this device. It cannot be undone.', 'Clear everything', function () {
        let legacyStorageCleared = true;
        Object.keys(LEGACY_KEYS).forEach(function (k) {
          try { localStorage.removeItem(LEGACY_KEYS[k]); } catch (e) { legacyStorageCleared = false; }
        });
        releaseAllPreviews();
        clearAllFileBlobs();                   // delete every uploaded file from IndexedDB
        kvDelete(KEY_NOTE);                    // and the quick note
        const keepSettings = state.settings;   // clearing data keeps your preferences
        state = emptyState();
        state.settings = keepSettings;
        ui.folderId = null;
        ui.expanded.clear(); saveUiPrefs();
        saveState(); renderAll();
        toast(legacyStorageCleared ? 'All data cleared' : 'Data cleared, but old browser data could not be removed');
      });
    }


    /* L. Event handling */

    /* Every clickable element carries data-action="something". This function
       looks at that name and runs the matching feature. */
    document.addEventListener('click', function (e) {
      const dlg = e.target;
      /* Clicking the dark backdrop closes a pop-up */
      if (dlg.tagName === 'DIALOG' && dlg.id !== 'welcomeDialog') { dlg.close(); return; }

      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      const id = el.dataset.id;

      /* Close alerts before navigating. */
      if (el.closest('#alertsDialog') && /^(view-deadline|goto-folder|nav)$/.test(el.dataset.action)) $('alertsDialog').close();

      switch (action) {
        case 'nav': showView(el.dataset.view); break;
        case 'go-alerts': openAlertsDialog(); break;
        case 'add-deadline': openDeadlineModal({ date: todayStr() }); break;
        case 'add-on-day': openDeadlineModal({ date: el.dataset.date }); break;
        case 'view-deadline': openViewDialog(id); break;
        case 'edit-deadline':
          if ($('viewDialog').open) $('viewDialog').close();   // Edit lives inside the view pop-up
          openDeadlineModal({ id: id });
          break;
        case 'install-app': showInstallPopup(); break;
        case 'settings-tab': ui.settingsTab = el.dataset.tab; renderSettings(); window.scrollTo(0, 0); break;
        case 'export-backup': exportBackup(); break;
        case 'import-backup': $('importInput').click(); break;
        case 'install-now': runInstall(); break;
        case 'install-later': $('installDialog').close(); break;
        case 'skip-name': finishWelcome(''); break;
        case 'toggle-folder': ui.folderId = id; if (childFolders(id).length) toggleExpanded(id); renderFiles(); break;
        case 'view-more': ui.more.add(id); renderFiles(); break;
        case 'view-less': ui.more.delete(id); renderFiles(); break;
        case 'open-donate': openDonateDialog(); break;
        case 'donate-ignore': ignoreDonateBanner(); break;
        case 'goto-widgets':
          ui.settingsTab = 'settings';
          showView('settings');
          setTimeout(function () { const c = $('widgetsCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
          break;
        case 'timer-toggle': toggleTimer(); break;
        case 'timer-reset': timer.running = false; timer.remaining = timer.len; renderWidgets(); break;
        case 'timer-len': timer.len = Number(el.dataset.min) * 60; timer.remaining = timer.len; timer.running = false; renderWidgets(); break;
        case 'toggle-deadline': toggleDeadline(id); break;
        case 'delete-deadline': deleteDeadline(id, false); break;
        case 'delete-from-modal': deleteDeadline(ui.editingId, true); break;
        case 'add-class': openTimetableModal({ day: el.dataset.day }); break;
        case 'edit-class': openTimetableModal({ id: id }); break;
        case 'delete-class-from-modal': deleteClass(ui.editingClassId, true); break;
        case 'tt-day': ui.ttDay = Number(el.dataset.day); renderTimetable(); break;
        case 'share-deadline': shareDeadline(id); break;
        case 'backup-export': hideBackupBanner(); exportBackup(); break;
        case 'backup-later': snoozeBackupBanner(); break;
        case 'dismiss-banner': ui.dismissed.add(id); renderBanner(); break;
        case 'toggle-check': toggleCheck(el.dataset.key); break;
        case 'goto-folder': ui.folderId = id; showView('files'); break;
        case 'new-folder': openFolderModal(el.dataset.parent || ''); break;
        case 'select-folder': expandPathTo(id); ui.folderId = id; renderFiles(); break;
        case 'delete-folder': deleteFolder(id); break;
        case 'open-grades': openGrades(id); break;
        case 'add-grade-part': openGradePartModal(id); break;
        case 'edit-grade-part': openGradePartModal(el.dataset.course, id); break;
        case 'grade-template':
          (function () {
            const course = folderById(id);
            if (!course || course.gradeParts.length) return;
            course.gradeParts = [
              { id: uid(), name: 'Continuous assessment', weight: 30, score: null, max: null },
              { id: uid(), name: 'Exam', weight: 70, score: null, max: null }
            ];
            saveState();
            renderGrades(course.id);
            renderAll();
          })();
          break;
        case 'delete-grade-part': deleteGradePart(); break;
        case 'add-grade-scale':
          state.settings.gradingScale.push({ letter: '', minimum: 0, points: 0 });
          saveState();
          renderSettings();
          break;
        case 'remove-grade-scale':
          state.settings.gradingScale.splice(Number(el.dataset.index), 1);
          saveState();
          renderSettings();
          break;
        case 'pick-files': $('fileInput').click(); break;
        case 'view-file': openFileViewer(id); break;
        case 'remove-file': removeFile(id); break;
        case 'cal-prev': shiftMonth(-1); break;
        case 'cal-next': shiftMonth(1); break;
        case 'cal-today':
          ui.cal.y = new Date().getFullYear(); ui.cal.m = new Date().getMonth(); renderCalendar(); break;
        case 'close-dialog': el.closest('dialog').close(); break;
        case 'reset-all': resetAll(); break;
      }

      if (window.umami && typeof window.umami.track === 'function') {
        if (action === 'add-deadline') {
          window.umami.track('click-add-deadline');
        } else if (action === 'export-backup' || action === 'backup-export') {
          window.umami.track('click-export-backup');
        }
      }
    });

    /* Lets keyboard users press Enter or Space on calendar days and the upload box. */
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.cell, .dropzone')) {
        e.preventDefault();
        e.target.click();
      }
    });

    /* When files are chosen with the file picker. */
    $('fileInput').addEventListener('change', function (e) {
      handleFiles(e.target.files, ui.folderId);
      e.target.value = '';   // lets you pick the same file again later
    });

    /* Drag-and-drop: highlight the box and accept dropped files. */
    document.addEventListener('dragover', function (e) {
      e.preventDefault();   // stops the browser from opening a dropped file in a new tab
      const zone = e.target.closest && e.target.closest('.dropzone');
      document.querySelectorAll('.dropzone.drag-over').forEach(function (z) { if (z !== zone) z.classList.remove('drag-over'); });
      if (zone) zone.classList.add('drag-over');
    });
    document.addEventListener('dragleave', function (e) {
      const zone = e.target.closest && e.target.closest('.dropzone');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      document.querySelectorAll('.dropzone.drag-over').forEach(function (z) { z.classList.remove('drag-over'); });
      if (e.target.closest && e.target.closest('.dropzone')) handleFiles(e.dataTransfer.files, ui.folderId);
    });

    /* Form submissions and the confirm button. */
    $('deadlineForm').addEventListener('submit', saveDeadline);
    $('timetableForm').addEventListener('submit', saveClass);
    $('ttDays').addEventListener('change', onTtDayChange);
    $('folderForm').addEventListener('submit', saveFolder);
    $('folderParent').addEventListener('change', syncFolderModal);
    $('gradePartForm').addEventListener('submit', saveGradePart);
    $('confirmOk').addEventListener('click', function () {
      $('confirmDialog').close();
      if (confirmCallback) { const cb = confirmCallback; confirmCallback = null; cb(); }
    });


    /* L3. Settings, feedback, and privacy */

    /* Applies the saved options to the running app (theme, alert timing, etc.).
       Called at start-up and every time a setting changes. */
    function applySettings() {
      const st = state.settings;
      APP_SETTINGS.URGENT_DAYS = st.urgentDays;
      APP_SETTINGS.SOON_DAYS = st.soonDays;
      APP_SETTINGS.WEEK_STARTS_ON_MONDAY = st.weekStartsMonday;
      APP_SETTINGS.DEFAULT_DUE_TIME = st.defaultTime;
      APP_SETTINGS.EXTRA_WEEKLY_TASKS = st.extraTasks;
      if (st.theme === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', st.theme);
    }

    /* Saves one changed setting, then refreshes the app. */
    function saveSetting(key, val) {
      const st = state.settings;
      switch (key) {
        case 'name': st.name = String(val).trim().slice(0, 40); st.askedName = true; break;
        case 'theme': st.theme = ['light', 'dark', 'system'].indexOf(val) > -1 ? val : 'system'; break;
        case 'urgentDays':
          st.urgentDays = Number(val);
          if (st.soonDays < st.urgentDays) st.soonDays = st.urgentDays;   // keep "soon" at least as long as "urgent"
          break;
        case 'soonDays':
          st.soonDays = Number(val);
          if (st.urgentDays > st.soonDays) st.urgentDays = st.soonDays;
          break;
        case 'weekStart': st.weekStartsMonday = (val === 'monday'); break;
        case 'defaultTime': st.defaultTime = val || DEFAULT_SETTINGS.defaultTime; break;
        case 'extraTasks':
          st.extraTasks = String(val).split('\n').map(function (t) { return t.trim().slice(0, 80); }).filter(Boolean).slice(0, 10);
          break;
        default: return;
      }
      saveState();
      applySettings();
      renderAll();
      toast('Settings saved');
    }

    function saveGradingScale() {
      const scale = [];
      const rows = document.querySelectorAll('.grade-scale-row');
      rows.forEach(function (row) {
        const letter = row.querySelector('[data-grade-letter]');
        const minimum = row.querySelector('[data-grade-minimum]');
        const points = row.querySelector('[data-grade-points]');
        if (!letter) return;
        const minValue = Number(minimum.value);
        const pointValue = Number(points.value);
        scale.push({
          letter: letter.value.trim().slice(0, 10),
          minimum: Number.isFinite(minValue) ? Math.max(0, Math.min(100, minValue)) : 0,
          points: Number.isFinite(pointValue) ? Math.max(0, pointValue) : 0
        });
      });
      state.settings.gradingScale = scale.filter(function (row) { return row.letter; });
      saveState();
      renderAll();
    }

    /* Listens for changes on any control marked with data-setting="...". */
    document.addEventListener('change', function (e) {
      const el = e.target.closest ? e.target.closest('[data-setting]') : null;
      if (el) saveSetting(el.dataset.setting, el.value);
      const sw = e.target.closest ? e.target.closest('[data-widget]') : null;
      if (sw) toggleWidget(sw.dataset.widget, sw.checked);
      const credit = e.target.closest ? e.target.closest('[data-grade-credit]') : null;
      if (credit) {
        const course = folderById(credit.dataset.gradeCredit);
        if (course) {
          const value = credit.value === '' ? '' : Number(credit.value);
          course.credits = Number.isFinite(value) && value >= 0 ? value : '';
          saveState();
          renderAll();
          renderGrades(course.id);
        }
      }
      const scaleLetter = e.target.closest ? e.target.closest('[data-grade-letter], [data-grade-minimum], [data-grade-points]') : null;
      if (scaleLetter) saveGradingScale();
      const needPick = e.target.closest ? e.target.closest('[data-grade-need-part]') : null;
      if (needPick) updateGradeNeed(needPick.dataset.gradeNeedPart);
    });

    document.addEventListener('input', function (e) {
      const target = e.target.closest ? e.target.closest('[data-grade-target]') : null;
      if (target) updateGradeNeed(target.dataset.gradeTarget);
      const pick = e.target.closest ? e.target.closest('[data-grade-need-part]') : null;
      if (pick) updateGradeNeed(pick.dataset.gradeNeedPart);
    });

    /* Draws the Settings page: the tab bar plus whichever tab is open. */
    function renderSettings() {
      const tabs = [['settings', 'Settings'], ['feedback', 'Feedback'], ['privacy', 'Privacy policy']];
      const tab = ui.settingsTab;
      let html = '<div class="tabs" role="tablist">' + tabs.map(function (t) {
        return '<button class="tab" role="tab" aria-selected="' + (t[0] === tab) + '" data-action="settings-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      html += tab === 'feedback' ? feedbackHTML() : (tab === 'privacy' ? privacyHTML() : settingsHTML());
      html += '<p class="settings-copyright">&copy; 2026 StudyDesk. all rights reserved</p>';
      $('settingsArea').innerHTML = html;
    }

    /* One row in the settings list: label + hint on the left, control on the right. */
    function setRow(label, hint, control, stack) {
      return '<div class="set-row' + (stack ? ' stack' : '') + '"><div class="set-text"><strong>' + label + '</strong>' + (hint ? '<span>' + hint + '</span>' : '') + '</div><div class="set-ctl">' + control + '</div></div>';
    }

    /* Course grades */
    function openGrades(courseId) {
      const course = folderById(courseId);
      if (!course) return;
      renderGrades(courseId);
      if (!$('gradesDialog').open) $('gradesDialog').showModal();
    }

    function renderGrades(courseId) {
      const course = folderById(courseId);
      if (!course) return;
      const standing = courseStanding(course);
      const totalWeight = course.gradeParts.reduce(function (sum, part) { return sum + Number(part.weight || 0); }, 0);
      const pct = standing.percentage === null ? null : Math.max(0, Math.min(100, standing.percentage));
      const grade = pct === null ? null : gradeForPercentage(pct);
      const unscored = course.gradeParts.filter(function (part) { return !scoredPart(part); });

      let html = '<div class="dlg grades-dlg" style="--c:' + course.color + '">' +
        '<div class="grades-head"><div><h2>' + esc(course.name) + ' Grades</h2><p class="hint">Check these weights against your course outline.</p></div>' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="close-dialog">Close</button></div>' +
        '<div class="grade-grid">' +
        '<div class="card"><div class="card-head"><h2>Current standing</h2>' + (grade ? '<span class="badge type-project">' + esc(grade.letter) + (grade.points !== null ? ' · ' + grade.points.toFixed(1) + ' pts' : '') + '</span>' : '') + '</div>' +
        '<div class="grade-standing">' + (pct === null ? '<strong>No marks entered</strong>' : '<strong>' + pct.toFixed(1) + '%</strong>') + '</div>' +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + (pct === null ? 0 : Math.round(pct)) + '"><div style="width:' + (pct === null ? 0 : Math.round(pct)) + '%"></div></div>' +
        '<p class="hint grade-mark-count">' + standing.scored + ' of ' + standing.total + ' marks earned</p></div>' +
        '<div class="card"><div class="card-head"><h2>Course details</h2></div>' +
        '<label class="field"><span>Credits</span><input type="number" min="0" step="0.5" data-grade-credit="' + esc(course.id) + '" value="' + (course.credits === '' ? '' : esc(course.credits)) + '" placeholder="e.g. 3"></label>' +
        '<p class="grade-total">Total weight: <strong>' + Number(totalWeight).toFixed(1) + '%</strong></p>' +
        (Math.abs(totalWeight - 100) > 0.01 ? '<p class="hint grade-warning">The total weight is not 100%.</p>' : '') + '</div>' +
        '</div>';

      html += '<div class="card grade-parts-card"><div class="card-head"><h2>Grade parts</h2><button type="button" class="btn btn-small" data-action="add-grade-part" data-id="' + esc(course.id) + '">Add a part</button></div>';
      if (!course.gradeParts.length) {
        html += '<div class="empty"><strong>No grade parts yet</strong>Add your assessment parts, or start with the usual split.<br>' +
          '<button type="button" class="btn btn-ghost btn-small" data-action="grade-template" data-id="' + esc(course.id) + '" style="margin-top:10px">Start from template</button></div>';
      } else {
        html += '<div class="grade-parts">' + course.gradeParts.map(function (part) {
          const hasScore = scoredPart(part);
          return '<button type="button" class="grade-part" data-action="edit-grade-part" data-course="' + esc(course.id) + '" data-id="' + esc(part.id) + '">' +
            '<span><strong>' + esc(part.name) + '</strong><small>' + Number(part.weight).toFixed(1) + '% weight</small></span>' +
            '<span class="grade-part-score">' + (hasScore ? esc(Number(part.score).toFixed(1)) + ' / ' + esc(Number(part.max).toFixed(1)) : '<span class="btn btn-ghost btn-small">Add score</span>') + '</span></button>';
        }).join('') + '</div>';
      }
      html += '</div>';

      html += '<div class="card grade-target-card"><div class="card-head"><h2>What do I need?</h2></div>' +
        '<label class="field"><span>Target percentage</span><input type="number" min="0" max="100" step="0.1" data-grade-target="' + esc(course.id) + '" placeholder="e.g. 70"></label>';
      if (unscored.length > 1) {
        html += '<label class="field"><span>Calculate for</span><select data-grade-need-part="' + esc(course.id) + '">' +
          '<option value="">Choose an unscored part</option>' + unscored.map(function (part) {
            return '<option value="' + esc(part.id) + '">' + esc(part.name) + '</option>';
          }).join('') + '</select></label>';
      }
      html += '<p class="grade-result" id="gradeNeedResult" data-course="' + esc(course.id) + '"></p></div>' +
        '</div>';
      $('gradesBody').innerHTML = html;
    }

    function openGradePartModal(courseId, partId) {
      const course = folderById(courseId);
      if (!course) return;
      const part = partId ? course.gradeParts.find(function (p) { return p.id === partId; }) : null;
      $('gradePartDlgTitle').textContent = part ? 'Edit grade part' : 'Add grade part';
      $('gpCourse').value = courseId;
      $('gpPart').value = part ? part.id : '';
      $('gpName').value = part ? part.name : '';
      $('gpWeight').value = part ? part.weight : '';
      $('gpScore').value = part && scoredPart(part) ? part.score : '';
      $('gpMax').value = part && scoredPart(part) ? part.max : '';
      $('gpDeleteBtn').hidden = !part;
      $('gpError').textContent = '';
      if (!$('gradePartDialog').open) $('gradePartDialog').showModal();
    }

    function saveGradePart(e) {
      e.preventDefault();
      const course = folderById($('gpCourse').value);
      if (!course) return;
      const name = $('gpName').value.trim();
      const weight = Number($('gpWeight').value);
      const scoreRaw = $('gpScore').value.trim();
      const maxRaw = $('gpMax').value.trim();
      if (!name) { $('gpError').textContent = 'Enter a name.'; return; }
      if (!Number.isFinite(weight) || weight < 0) { $('gpError').textContent = 'Enter a valid weight.'; return; }
      if ((scoreRaw && !maxRaw) || (!scoreRaw && maxRaw)) { $('gpError').textContent = 'Enter both score and max, or leave both empty.'; return; }
      const score = scoreRaw ? Number(scoreRaw) : null;
      const max = maxRaw ? Number(maxRaw) : null;
      if ((score !== null && (!Number.isFinite(score) || score < 0)) || (max !== null && (!Number.isFinite(max) || max <= 0))) {
        $('gpError').textContent = 'Enter a valid score and max.';
        return;
      }
      const partId = $('gpPart').value;
      if (partId) {
        const part = course.gradeParts.find(function (p) { return p.id === partId; });
        if (part) Object.assign(part, { name: name.slice(0, 80), weight: weight, score: score, max: max });
      } else {
        course.gradeParts.push({ id: uid(), name: name.slice(0, 80), weight: weight, score: score, max: max });
      }
      saveState();
      $('gradePartDialog').close();
      renderGrades(course.id);
      renderAll();
      toast('Grade part saved');
    }

    function deleteGradePart() {
      const course = folderById($('gpCourse').value);
      const partId = $('gpPart').value;
      if (!course || !partId) return;
      const part = course.gradeParts.find(function (p) { return p.id === partId; });
      if (!part) return;
      askConfirm('Delete ' + part.name + '?', 'This grade part will be removed from ' + course.name + '.', 'Delete part', function () {
        course.gradeParts = course.gradeParts.filter(function (p) { return p.id !== partId; });
        $('gradePartDialog').close();
        saveState();
        renderGrades(course.id);
        renderAll();
        toast('Grade part deleted');
      });
    }

    function updateGradeNeed(courseId) {
      const course = folderById(courseId);
      const targetInput = document.querySelector('[data-grade-target="' + CSS.escape(courseId) + '"]');
      const result = $('gradeNeedResult');
      if (!course || !targetInput || !result) return;
      const target = Number(targetInput.value);
      if (!targetInput.value || !Number.isFinite(target)) { result.textContent = ''; return; }
      const standing = courseStanding(course);
      const earnedMarks = standing.earnedMarks || 0;
      let part = null;
      const unscored = course.gradeParts.filter(function (p) { return !scoredPart(p); });
      if (unscored.length === 1) part = unscored[0];
      else {
        const pick = document.querySelector('[data-grade-need-part="' + CSS.escape(courseId) + '"]');
        if (!pick || !pick.value) { result.textContent = 'Choose which unscored part to calculate for.'; return; }
        part = unscored.find(function (p) { return p.id === pick.value; }) || null;
      }
      if (!part) { result.textContent = 'There are no unscored parts left.'; return; }
      const weight = Number(part.weight);
      if (weight <= 0) { result.textContent = 'This part has no weight.'; return; }
      const needed = ((target - earnedMarks) / weight) * 100;
      if (needed <= 0) result.textContent = 'Your target is already secured.';
      else if (needed > 100) result.textContent = 'Your target is not reachable with this part.';
      else result.textContent = 'You need ' + needed.toFixed(1) + '% on ' + part.name + ' (' + weight.toFixed(1) + '% weight).';
    }

    /* Turns [[value, label], ...] into <option> tags with the current one selected. */
    function optionsHTML(list, current) {
      return list.map(function (o) {
        return '<option value="' + o[0] + '"' + (String(o[0]) === String(current) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('');
    }

    /* The main Settings tab. */
    function settingsHTML() {
      const st = state.settings;
      const days = function (n) { return [n, n + (n === 1 ? ' day' : ' days')]; };
      const urgent = [1, 2, 3, 5].map(days);
      const soon = [3, 5, 7, 10, 14, 21, 30].map(days);

      let h = '<div class="settings-wrap">';

      h += '<div class="card"><div class="card-head"><h2>Profile</h2></div>' +
        setRow('Your name', 'Used in your greeting, like \u201CGood morning, Akua\u201D. Leave it empty to hide it.',
          '<input type="text" data-setting="name" maxlength="40" value="' + esc(st.name || '') + '" placeholder="Your name" autocomplete="given-name" aria-label="Your name">') +
        '</div>';

      h += '<div class="card" id="widgetsCard"><div class="card-head"><h2>Widgets</h2><span class="hint">Shown at the top of your dashboard</span></div>' +
        WIDGET_CATALOG.map(function (w) {
          const on = st.widgets.indexOf(w.id) > -1;
          return setRow(esc(w.name), esc(w.desc),
            '<label class="switch"><input type="checkbox" data-widget="' + w.id + '"' + (on ? ' checked' : '') + ' aria-label="Show the ' + esc(w.name) + ' widget"><span class="slider"></span></label>');
        }).join('') + '</div>';

      h += '<div class="card"><div class="card-head"><h2>Appearance</h2></div>' +
        setRow('Theme', 'Choose light, dark, or follow your device.',
          '<select data-setting="theme" aria-label="Theme">' + optionsHTML([['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], st.theme) + '</select>') +
        '</div>';

      h += '<div class="card" id="gradingScaleCard"><div class="card-head"><h2>Grading scale</h2><button type="button" class="btn btn-ghost btn-small" data-action="add-grade-scale">Add row</button></div>' +
        '<div class="grade-scale-table"><div class="grade-scale-head"><span>Letter</span><span>Minimum %</span><span>Grade points</span><span></span></div>' +
        state.settings.gradingScale.map(function (row, index) {
          return '<div class="grade-scale-row">' +
            '<input type="text" maxlength="10" aria-label="Grade letter" data-grade-letter="' + index + '" value="' + esc(row.letter) + '">' +
            '<input type="number" min="0" max="100" step="0.1" aria-label="Minimum percentage" data-grade-minimum="' + index + '" value="' + esc(row.minimum) + '">' +
            '<input type="number" min="0" step="0.1" aria-label="Grade points" data-grade-points="' + index + '" value="' + esc(row.points) + '">' +
            '<button type="button" class="icon-btn danger" data-action="remove-grade-scale" data-index="' + index + '" aria-label="Remove grading scale row">&times;</button></div>';
        }).join('') + '</div></div>';

      h += '<div class="card"><div class="card-head"><h2>Deadlines and calendar</h2></div>' +
        setRow('Red alert when due within', 'These deadlines show in red on the banner and alerts.',
          '<select data-setting="urgentDays" aria-label="Urgent alert days">' + optionsHTML(urgent, st.urgentDays) + '</select>') +
        setRow('Amber alert when due within', 'Earlier heads-up for upcoming deadlines.',
          '<select data-setting="soonDays" aria-label="Upcoming alert days">' + optionsHTML(soon, st.soonDays) + '</select>') +
        setRow('Default due time', 'Pre-filled when you add a deadline.',
          '<input type="time" data-setting="defaultTime" value="' + esc(st.defaultTime) + '" aria-label="Default due time">') +
        setRow('Calendar week starts on', '',
          '<select data-setting="weekStart" aria-label="Week starts on">' + optionsHTML([['sunday', 'Sunday'], ['monday', 'Monday']], st.weekStartsMonday ? 'monday' : 'sunday') + '</select>') +
        '</div>';

      h += '<div class="card"><div class="card-head"><h2>Weekly check-in</h2></div>' +
        setRow('Your weekly tasks', 'One per line, up to 10. Slide reminders for each course are added automatically.',
          '<textarea data-setting="extraTasks" aria-label="Weekly tasks" maxlength="900">' + esc(st.extraTasks.join('\n')) + '</textarea>', true) +
        '</div>';

      h += '<div class="card"><div class="card-head"><h2>App</h2></div>' +
        setRow('Install on your device', appIsInstalled() ? 'StudyDesk is installed and running as an app.' : 'Open StudyDesk full screen from your home screen, like any other app.',
          appIsInstalled() ? '<span class="badge type-project">Installed</span>' : '<button class="btn btn-ghost btn-small" data-action="install-app">' + icon('download') + '<span>Install app</span></button>') +
        (APP_INFO.DONATE_ENABLED ? setRow('Support StudyDesk', 'Free for students. Donations help keep it going and growing.',
          '<button class="btn btn-ghost btn-small" data-action="open-donate">' + icon('heart') + '<span>Donate</span></button>') : '') +
        '</div>';

      h += '<div class="card"><div class="card-head"><h2>Your data</h2></div>' +
        setRow('Back up', 'Save everything to a file you can keep. Files up to ' + formatSize(APP_SETTINGS.MAX_BACKUP_FILE_BYTES) + ' are included; bigger ones stay on this device, so keep your originals.',
          '<button class="btn btn-ghost btn-small" data-action="export-backup">Export backup</button>') +
        setRow('Restore', 'Load a backup file. This replaces what is in the app now.',
          '<button class="btn btn-ghost btn-small" data-action="import-backup">Import backup</button>') +
        setRow('Clear all data', 'Deletes every folder, file and deadline. Your settings are kept.',
          '<button class="btn btn-danger btn-small" data-action="reset-all">Clear all data</button>') +
        '</div>';

      h += '<div class="card"><div class="card-head"><h2>About</h2></div>' +
        setRow(esc(APP_INFO.NAME) + ' version ' + esc(APP_INFO.VERSION), 'Your information stays on this device.',
          '<button class="btn btn-ghost btn-small" data-action="settings-tab" data-tab="feedback">Send feedback</button>' +
          '<button class="btn btn-ghost btn-small" data-action="settings-tab" data-tab="privacy">Privacy policy</button>') +
        '</div>';

      return h + '</div>';
    }

    /* Builds the embeddable version of the Tally link (or '' if none/invalid).
       Accepts either https://tally.so/r/ID or an https://tally.so/embed/ID link. */
    function feedbackEmbedUrl() {
      let u = String(APP_INFO.TALLY_FORM_URL || '').trim();
      if (!/^https:\/\//i.test(u)) return '';
      u = u.replace('/r/', '/embed/');
      return u + (u.indexOf('?') > -1 ? '&' : '?') + 'alignLeft=1&hideTitle=1&transparentBackground=1';
    }

    /* The Feedback tab: shows your Tally form, or a notice if it isn't connected yet. */
    function feedbackHTML() {
      const embed = feedbackEmbedUrl();
      const mail = APP_INFO.CONTACT_EMAIL ? '<a href="mailto:' + esc(APP_INFO.CONTACT_EMAIL) + '">' + esc(APP_INFO.CONTACT_EMAIL) + '</a>' : '';
      let h = '<div class="settings-wrap"><div class="card prose"><div class="card-head"><h2>Send feedback</h2></div>' +
        '<p class="lead">Tell us what\u2019s working and what isn\u2019t.</p>' +
        '<p>Found a bug, or have an idea that would make ' + esc(APP_INFO.NAME) + ' better for students? Every message is read.</p>';
      if (embed) {
        h += '<iframe class="frame" src="' + esc(embed) + '" title="Feedback form" loading="lazy"></iframe>' +
          '<p style="margin-top:12px"><a class="btn btn-ghost btn-small" href="' + esc(APP_INFO.TALLY_FORM_URL.trim()) + '" target="_blank" rel="noopener">Open the form in a new tab</a></p>';
      } else {
        h += '<div class="empty" style="margin-top:14px"><strong>The feedback form isn\u2019t available yet</strong>' +
          (mail ? 'For now, email us at ' + mail + '.' : 'Please check back soon.') + '</div>';
      }
      return h + '</div></div>';
    }

    /* Update this wording when the app's data practices change. */
    function privacyHTML() {
      const contact = APP_INFO.CONTACT_EMAIL
        ? 'email <a href="mailto:' + esc(APP_INFO.CONTACT_EMAIL) + '">' + esc(APP_INFO.CONTACT_EMAIL) + '</a> or use the Feedback tab'
        : 'use the Feedback tab';
      return '<div class="settings-wrap"><div class="card prose"><div class="card-head"><h2>Privacy policy</h2><span class="hint">Updated ' + esc(APP_INFO.PRIVACY_UPDATED) + '</span></div>' +
        '<p class="lead">' + esc(APP_INFO.NAME) + ' stores your course data and files on this device. Umami receives website usage, performance and error metrics. Feedback and donation details are sent only when you choose to submit them.</p>' +

        '<h3>What the app stores</h3>' +
        '<p>Your course folders, the files you add, your deadlines, your weekly checklist ticks and your settings. All of it is saved in your browser\u2019s private storage (IndexedDB) on this device. Files you add never leave your device.</p>' +

        '<h3>What we don\u2019t do</h3>' +
        '<ul><li>No sign-up or personal accounts.</li><li>No advertising.</li><li>No server-side copy of your course data or files.</li></ul>' +

        '<h3>Analytics</h3>' +
        '<p>' + esc(APP_INFO.NAME) + ' loads the Umami Cloud analytics script to measure page usage, performance and errors, and count clicks on Add deadline and Export backup. These button events send action names only, not form values or file names. Metrics are sent to Umami. See <a href="https://umami.is/privacy" target="_blank" rel="noopener noreferrer">Umami\u2019s privacy policy</a>.</p>' +

        '<h3>Feedback form</h3>' +
        '<p>If you send feedback, what you type (and your email, if you give one) is submitted through Tally, a third-party form service, and reaches the app owner. Tally handles it under its own privacy policy. Please don\u2019t include anything you wouldn\u2019t want to share.</p>' +

        '<h3>Donations</h3>' +
        '<p>Donating is optional. If you choose to donate, the form asks for your name, email, an amount and an optional message. If a donor-information endpoint is configured, these details are sent to that endpoint; otherwise, they are not sent by ' + esc(APP_INFO.NAME) + '. The payment happens on the provider\u2019s own page. ' + esc(APP_INFO.NAME) + ' never sees your card or mobile money details.</p>' +

        '<h3>Installing and offline use</h3>' +
        '<p>If you install the app, your browser keeps a copy of the app\u2019s own files on your device so it can open quickly and work offline. This copy contains no personal information.</p>' +

        '<h3>Your choices</h3>' +
        '<ul><li>Export a backup or restore one at any time in Settings.</li><li>Use Clear all data in Settings to delete everything the app holds.</li><li>Clearing your browser data or uninstalling the app also removes it.</li></ul>' +
        '<p>Because your data lives only on your device, we can\u2019t recover it if it is lost. Back it up with Export backup.</p>' +

        '<h3>Changes and contact</h3>' +
        '<p>If this policy changes, the date above is updated. Questions? ' + contact + '.</p></div></div>';
    }

    /* Saves your data to a .json backup file on the device.
       Small files (see MAX_BACKUP_FILE_BYTES in APP_SETTINGS) are packed inside it;
       bigger files stay on the device only. */
    async function exportBackup() {
      const files = [];
      for (let i = 0; i < state.files.length; i++) {
        const rec = Object.assign({}, state.files[i]);
        if (rec.size <= APP_SETTINGS.MAX_BACKUP_FILE_BYTES) {
          const blob = await getFileBlob(rec.id);
          if (blob) { try { rec.data = await blobToDataURL(blob); } catch (e) { /* leave it out */ } }
        }
        files.push(rec);
      }
      const data = Object.assign({}, state, { files: files, note: kvGet(KEY_NOTE, '') });
      const payload = { app: 'studydesk', version: APP_INFO.VERSION, exported: new Date().toISOString(), data: data };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'studydesk-backup-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      kvSet(KEY_LAST_BACKUP, Date.now());   // remembered for the backup reminder (L9)
      hideBackupBanner();
      toast('Backup saved to your downloads');
    }

    /* Restores a confirmed backup. */
    async function restoreBackup(incoming) {
      releaseAllPreviews();
      await clearAllFileBlobs();
      const next = normalizeState(incoming);
      const dataById = {};
      (Array.isArray(incoming.files) ? incoming.files : []).forEach(function (f) {
        if (f && typeof f.data === 'string' && f.data.indexOf('data:') === 0) dataById[f.id] = f.data;
      });
      for (let i = 0; i < next.files.length; i++) {
        const f = next.files[i];
        f.stored = false;
        if (dataById[f.id]) {
          try { f.stored = await putFileBlob(f.id, await (await fetch(dataById[f.id])).blob()); } catch (e) { f.stored = false; }
        }
      }
      state = next;
      if (typeof incoming.note === 'string') kvSet(KEY_NOTE, incoming.note.slice(0, 2000));
      ui.folderId = rootFolders()[0] ? rootFolders()[0].id : null;
      saveState();
      applySettings();
      renderAll();
      toast('Backup restored');
    }

    /* Reads a backup file and, after confirming, replaces the app's data with it. */
    $('importInput').addEventListener('change', function (e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        let parsed = null;
        try { parsed = JSON.parse(reader.result); } catch (err) { parsed = null; }
        if (!parsed || parsed.app !== 'studydesk' || !parsed.data) { toast('That file isn\u2019t a StudyDesk backup.'); return; }
        askConfirm('Replace your data?', 'Everything currently in the app will be replaced by this backup (' + file.name + ').', 'Restore backup', function () {
          restoreBackup(parsed.data);
        });
      };
      reader.readAsText(file);
    });


    /* L2. Installable app */
    let deferredInstallPrompt = null;                    // the browser's install offer, once it arrives
    const INSTALL_REMIND_DAYS = 7;                       // how long "Not now" silences the pop-up

    /* True when the app is already running installed (not in a normal browser tab). */
    function isStandalone() {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    /* Checks install state, including the saved browser result. */
    function appIsInstalled() {
      return isStandalone() || kvGet(KEY_INSTALLED, false) === true;
    }

    /* True on iPhone/iPad, which has no automatic install button. */
    function isIOS() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    /* Creates the app icon as a PNG data URL. */
    function makeAppIcon(size) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.fillStyle = '#0b1b36';
      x.fillRect(0, 0, size, size);
      const s = size * 0.56, o = (size - s) / 2;
      x.fillStyle = '#2f6fed';
      x.beginPath();
      if (x.roundRect) x.roundRect(o, o, s, s, s * 0.24); else x.rect(o, o, s, s);
      x.fill();
      x.strokeStyle = '#ffffff';
      x.lineWidth = size * 0.065;
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(size * 0.38, size * 0.51); x.lineTo(size * 0.465, size * 0.595); x.lineTo(size * 0.625, size * 0.41);
      x.stroke();
      return c.toDataURL('image/png');
    }

    /* Has the user pressed "Not now" within the last few days? */
    function installRecentlyDismissed() {
      const t = Number(kvGet(KEY_INSTALL, 0));
      return t && (Date.now() - t) < INSTALL_REMIND_DAYS * 86400000;
    }

    /* Remembers that the user closed the pop-up, so it doesn't nag. */
    function rememberInstallDismissed() {
      kvSet(KEY_INSTALL, Date.now());
    }

    /* Updates the Install button. */
    function updateInstallButton() {
      $('installBtn').hidden = appIsInstalled();
    }

    /* Fills and opens the install pop-up with the right instructions for this device. */
    function showInstallPopup() {
      if (appIsInstalled()) return;
      const icon192 = makeAppIcon(112);
      const head = '<div class="install-hero"><img alt="" src="' + icon192 + '"><h2 id="installTitle">Install StudyDesk</h2></div>';
      let body;
      if (deferredInstallPrompt) {
        body = head + '<p style="color:var(--text-muted)">Add StudyDesk to your home screen. It opens full screen like a normal app, with no browser bar, and your data stays on this device.</p>' +
          '<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="install-later">Not now</button>' +
          '<button type="button" class="btn" data-action="install-now">' + icon('download') + '<span>Install app</span></button></div>';
      } else if (isIOS()) {
        body = head + '<p style="color:var(--text-muted)">To install on iPhone or iPad:</p><ol class="install-steps">' +
          '<li>Tap the Share button in Safari.</li><li>Choose Add to Home Screen.</li><li>Tap Add.</li></ol>' +
          '<div class="dlg-actions"><button type="button" class="btn" data-action="install-later">Got it</button></div>';
      } else {
        body = head + '<p style="color:var(--text-muted)">Open your browser menu (the \u22EE or \u22EF button) and choose Install app or Add to Home screen.</p>' +
          '<p style="color:var(--text-muted);margin-top:8px">If you don\u2019t see that option, open this page from its https:// web address instead of from a file saved on your device.</p>' +
          '<div class="dlg-actions"><button type="button" class="btn" data-action="install-later">Got it</button></div>';
      }
      $('installBody').innerHTML = body;
      if (!$('installDialog').open) $('installDialog').showModal();
    }

    /* Shows install help when appropriate. */
    function maybeAutoShowInstall() {
      if (appIsInstalled() || installRecentlyDismissed() || document.querySelector('dialog[open]')) return;
      showInstallPopup();
    }

    /* Runs the browser's real install prompt after the user taps "Install app". */
    function runInstall() {
      if (!deferredInstallPrompt) { showInstallPopup(); return; }
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      $('installDialog').close();
      promptEvent.prompt();
      promptEvent.userChoice.then(function (choice) {
        if (choice.outcome !== 'accepted') rememberInstallDismissed();
      });
    }

    /* Sets up everything that makes the page installable. Runs once at start-up. */
    function setupPWA() {
      /* Home-screen icon for iPhone */
      const apple = document.createElement('link');
      apple.rel = 'apple-touch-icon';
      apple.href = makeAppIcon(180);
      document.head.appendChild(apple);

      /* The app manifest is built here so no extra file is needed.
         It tells the browser the name, icon, colors and "standalone" (no browser bar). */
      if (/^https?:$/.test(location.protocol)) {
        const big = makeAppIcon(512), small = makeAppIcon(192);
        const manifest = {
          name: 'StudyDesk \u2013 Student Organizer',
          short_name: 'StudyDesk',
          description: 'Organize course files, deadlines and weekly reminders.',
          start_url: location.href.split('#')[0],
          scope: new URL('./', location.href).href,
          display: 'standalone',
          background_color: '#0b1b36',
          theme_color: '#0b1b36',
          icons: [
            { src: small, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: big, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: big, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        };
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
        document.head.appendChild(link);

        /* Optional offline support: works when sw.js sits next to this file. */
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* sw.js not found: app still works online */ });
      }

      /* Save the browser's install offer. */
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (kvGet(KEY_INSTALLED, false)) kvSet(KEY_INSTALLED, false);   // the browser offers install again, so the app was uninstalled
        updateInstallButton();
        setTimeout(maybeAutoShowInstall, 1200);
      });

      /* After a successful install. */
      window.addEventListener('appinstalled', function () {
        deferredInstallPrompt = null;
        kvSet(KEY_INSTALLED, true);                 // remember it, so the Install button disappears for good
        if ($('installDialog').open) $('installDialog').close();
        updateInstallButton();                      // hides the header button right away
        if (ui.view === 'settings') renderSettings();
        toast('StudyDesk installed');
      });

      /* Tracks standalone mode and updates the Install button. */
      if (isStandalone()) kvSet(KEY_INSTALLED, true);
      const standaloneQuery = window.matchMedia('(display-mode: standalone)');
      if (standaloneQuery && standaloneQuery.addEventListener) {
        standaloneQuery.addEventListener('change', function () {
          if (isStandalone()) kvSet(KEY_INSTALLED, true);
          updateInstallButton();
        });
      }
      updateInstallButton();

      /* Remember "Not now" when the pop-up is closed any way (button, Esc, backdrop). */
      $('installDialog').addEventListener('close', rememberInstallDismissed);

      /* iPhone never fires the install event, so show the how-to once on a fresh visit. */
      if (isIOS() && !appIsInstalled()) setTimeout(maybeAutoShowInstall, 2000);
    }


    /* L4. First-run welcome */

    /* Shows the welcome pop-up if the name hasn't been given (or skipped) yet. */
    function maybeShowWelcome() {
      const st = state.settings;
      if (st.name || st.askedName) return;
      $('welcomeIcon').src = makeAppIcon(112);
      $('welcomeName').value = '';
      $('welcomeError').textContent = '';
      $('welcomeDialog').showModal();
      setTimeout(function () { $('welcomeName').focus(); }, 60);
    }

    /* Saves the name and closes the welcome dialog. */
    function finishWelcome(name) {
      state.settings.name = name;
      state.settings.askedName = true;
      saveState();
      $('welcomeDialog').close();
      renderAll();
      if (name) toast('Nice to meet you, ' + name + '!');
      setTimeout(maybeAutoShowInstall, 900);   // now it's a good moment to offer installing
    }

    /* Pressing "Get started" with a name typed in. */
    $('welcomeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const name = $('welcomeName').value.trim().slice(0, 40);
      if (!name) { $('welcomeError').textContent = 'Enter your name, or choose Skip for now.'; return; }
      finishWelcome(name);
    });

    /* The Esc key shouldn't dismiss the welcome question by accident. */
    $('welcomeDialog').addEventListener('cancel', function (e) { e.preventDefault(); });


    /* L5. Donations */

    /* Reads the small record of donate-banner timing (kept on this device). */
    function donateState() {
      return kvGet(KEY_DONATE, {}) || {};
    }

    /* Saves that record. */
    function saveDonateState(d) {
      kvSet(KEY_DONATE, d);
    }

    /* Counts how many times the app has been opened (the banner waits a few opens). */
    function countAppOpen() {
      const d = donateState();
      d.opens = (d.opens || 0) + 1;
      saveDonateState(d);
    }

    /* Stops the banner from appearing for a number of days. */
    function snoozeDonate(days) {
      const d = donateState();
      d.snoozeUntil = Date.now() + days * 86400000;
      saveDonateState(d);
    }

    /* Decides whether it is time to show the "Donate or Ignore" banner. */
    function scheduleDonateBanner() {
      if (!APP_INFO.DONATE_ENABLED) return;
      const d = donateState();
      if ((d.opens || 0) < APP_INFO.DONATE_FIRST_AFTER_OPENS) return;
      if (Date.now() < (d.snoozeUntil || 0)) return;
      setTimeout(function () { showDonateBanner(false); }, 8000);   // a few seconds after opening, never instantly
    }

    /* Slides the banner up. It never blocks the app and can always be ignored. */
    function showDonateBanner(retried) {
      if (!APP_INFO.DONATE_ENABLED) return;
      if (document.querySelector('dialog[open]') || !$('backupBanner').hidden) {   // don't interrupt a pop-up or the backup banner; try once more later
        if (!retried) setTimeout(function () { showDonateBanner(true); }, 20000);
        return;
      }
      const b = $('donateBanner');
      b.innerHTML = '<span class="fold-tile" style="--c:#d6336c">' + icon('heart') + '</span>' +
        '<div class="db-text"><strong>' + esc(APP_INFO.NAME) + ' is free for students</strong>' +
        '<span>If it\u2019s helping you, a small donation keeps it going. No pressure at all.</span>' +
        '<div class="db-actions"><button class="btn btn-small" data-action="open-donate">Donate</button>' +
        '<button class="btn btn-ghost btn-small" data-action="donate-ignore">Ignore</button></div></div>';
      b.hidden = false;
      const d = donateState();
      d.lastShown = Date.now();
      d.snoozeUntil = Date.now() + APP_INFO.DONATE_REMIND_EVERY_DAYS * 86400000;   // won't come back soon, even if not tapped
      saveDonateState(d);
    }

    /* Hides the banner. */
    function hideDonateBanner() { $('donateBanner').hidden = true; }

    /* "Ignore": hides the banner and stays quiet for a while. */
    function ignoreDonateBanner() {
      hideDonateBanner();
      snoozeDonate(APP_INFO.DONATE_IGNORE_SNOOZE_DAYS);
    }

    /* Opens the donate form pop-up (from the top bar, Settings, or the banner). */
    function openDonateDialog() {
      if (!APP_INFO.DONATE_ENABLED) return;
      hideDonateBanner();
      renderDonateForm();
      if (!$('donateDialog').open) $('donateDialog').showModal();
    }

    /* Draws the small donate form: name, email, amount, optional message. */
    function renderDonateForm() {
      const amounts = APP_INFO.DONATE_AMOUNTS;
      const def = amounts.length > 1 ? amounts[1] : amounts[0];
      $('donateBody').innerHTML =
        '<form class="dlg" id="donateForm" novalidate>' +
        '<div class="install-hero"><span class="fold-tile big" style="--c:#d6336c">' + icon('heart') + '</span><h2 id="donateTitle">Support ' + esc(APP_INFO.NAME) + '</h2></div>' +
        '<p style="color:var(--text-muted)">' + esc(APP_INFO.NAME) + ' is free for students. A small donation helps keep it running and improving. There is no pressure at all.</p>' +
        '<label class="field"><span>Your name</span><input type="text" id="donName" maxlength="60" autocomplete="name" value="' + esc(state.settings.name || '') + '"></label>' +
        '<label class="field"><span>Email</span><input type="email" id="donEmail" maxlength="100" autocomplete="email" placeholder="So we can say thank you"></label>' +
        '<div class="field"><span>Amount (' + esc(APP_INFO.DONATE_CURRENCY) + ')</span><div class="amounts">' +
        amounts.map(function (a) {
          return '<label><input type="radio" name="donAmt" value="' + a + '"' + (a === def ? ' checked' : '') + '><span class="amt">' + a + '</span></label>';
        }).join('') + '</div>' +
        '<input type="number" id="donCustom" min="1" step="any" inputmode="decimal" placeholder="Or type another amount" style="margin-top:8px"></div>' +
        '<label class="field"><span>Message (optional)</span><input type="text" id="donMsg" maxlength="200" placeholder="Anything you\u2019d like to tell us"></label>' +
        '<p class="small-print">We only use these details to thank you. The payment happens on the payment provider\u2019s own page.</p>' +
        '<p class="error-text" id="donError" role="alert"></p>' +
        '<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="close-dialog">Maybe later</button>' +
        '<button type="submit" class="btn">' + icon('heart') + '<span>Donate</span></button></div></form>';
    }

    /* Typing your own amount un-selects the quick amounts, and the other way round. */
    document.addEventListener('input', function (e) {
      if (e.target.id === 'donCustom' && e.target.value) {
        document.querySelectorAll('input[name="donAmt"]').forEach(function (r) { r.checked = false; });
      }
    });
    document.addEventListener('change', function (e) {
      if (e.target.name === 'donAmt') { const c = $('donCustom'); if (c) c.value = ''; }
    });

    /* Builds the final payment link (adds the amount if you set DONATE_AMOUNT_PARAM). */
    function buildDonateUrl(amount) {
      let url = String(APP_INFO.DONATE_URL || '').trim();
      if (!/^https:\/\//i.test(url)) return '';
      if (APP_INFO.DONATE_AMOUNT_PARAM) {
        const value = Number((amount * (APP_INFO.DONATE_AMOUNT_MULTIPLIER || 1)).toFixed(2));
        url += (url.indexOf('?') > -1 ? '&' : '?') + encodeURIComponent(APP_INFO.DONATE_AMOUNT_PARAM) + '=' + encodeURIComponent(String(value));
      }
      return url;
    }

    /* Checks the form, sends the donor's details to you, and opens the payment page. */
    function submitDonation() {
      const name = $('donName').value.trim();
      const email = $('donEmail').value.trim();
      const message = $('donMsg').value.trim();
      const custom = $('donCustom').value.trim();
      const picked = document.querySelector('input[name="donAmt"]:checked');
      const amount = custom ? Number(custom) : (picked ? Number(picked.value) : 0);
      const err = $('donError');

      if (!name) { err.textContent = 'Please enter your name.'; $('donName').focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email so we can thank you.'; $('donEmail').focus(); return; }
      if (!(amount > 0) || amount > 1000000) { err.textContent = 'Choose an amount, or type your own.'; return; }

      const url = buildDonateUrl(amount);
      if (!url) { renderDonateThanks({ notOpen: true }); return; }   // no payment link set up yet

      /* 1. Send the details to you (if you set DONATE_INFO_ENDPOINT). */
      if (/^https:\/\//i.test(APP_INFO.DONATE_INFO_ENDPOINT || '')) {
        try {
          fetch(APP_INFO.DONATE_INFO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ name: name, email: email, amount: amount, currency: APP_INFO.DONATE_CURRENCY, message: message, app: APP_INFO.NAME + ' ' + APP_INFO.VERSION, date: new Date().toISOString() }),
            keepalive: true
          }).catch(function () { /* ignore: never block the donation */ });
        } catch (e) { /* ignore */ }
      }

      /* 2. Open the payment page in a new tab, and stay quiet for a while. */
      window.open(url, '_blank', 'noopener');
      snoozeDonate(APP_INFO.DONATED_SNOOZE_DAYS);
      renderDonateThanks({ name: name, url: url });
    }

    /* Replaces the form with a thank-you message. */
    function renderDonateThanks(o) {
      const head = '<div class="install-hero"><span class="fold-tile big" style="--c:#d6336c">' + icon('heart') + '</span>';
      let body;
      if (o.notOpen) {
        body = head + '<h2 id="donateTitle">Donations aren\u2019t open yet</h2></div>' +
          '<p style="color:var(--text-muted)">Thank you for wanting to help. Please check back soon.</p>';
      } else {
        body = head + '<h2 id="donateTitle">Thank you, ' + esc(o.name) + '!</h2></div>' +
          '<p style="color:var(--text-muted)">Your support means a lot. A payment page should have opened in a new tab. If it didn\u2019t, use the button below.</p>' +
          '<p style="margin-top:12px"><a class="btn" href="' + esc(o.url) + '" target="_blank" rel="noopener">Open the payment page</a></p>' +
          '<p class="small-print">We\u2019ll use your email only to say thank you.</p>';
      }
      $('donateBody').innerHTML = '<div class="dlg">' + body + '<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="close-dialog">Close</button></div></div>';
    }

    /* Listens for the donate form being submitted. */
    document.addEventListener('submit', function (e) {
      if (e.target.id === 'donateForm') { e.preventDefault(); submitDonation(); }
    });


    /* L6. Dashboard widgets */

    /* Widget options shown in Settings. */
    const WIDGET_CATALOG = [
      { id: 'clock', name: 'Clock', desc: "Live time and today's date.", render: widgetClock },
      { id: 'countdown', name: 'Next deadline', desc: 'A live countdown to your next deadline.', render: widgetCountdown },
      { id: 'today', name: 'Due today', desc: 'Everything due today or overdue.', render: widgetToday },
      { id: 'week', name: 'This week', desc: 'Deadlines ahead and weekly check-in progress.', render: widgetWeek },
      { id: 'focus', name: 'Focus timer', desc: 'A study timer with 15, 30, 45 and 60 minute options.', render: widgetFocus },
      { id: 'note', name: 'Quick note', desc: 'A scratch pad that saves as you type.', render: widgetNote }
    ];

    const timer = { len: 25 * 60, remaining: 25 * 60, running: false, endAt: 0 };   // the focus timer's memory
    let noteTimer = null;

    /* Draws enabled widgets or the setup prompt. */
    function renderWidgets() {
      const area = $('widgetArea');
      const ids = state.settings.widgets;
      if (!ids.length) {
        area.innerHTML = '<div class="widget-empty"><div><strong>Make this dashboard yours</strong><span>Add a clock, countdown, focus timer or quick note.</span></div>' +
          '<button class="btn btn-ghost btn-small" data-action="goto-widgets">' + icon('plus') + '<span>Add widgets</span></button></div>';
        return;
      }
      area.innerHTML = '<div class="widgets">' + WIDGET_CATALOG.filter(function (w) { return ids.indexOf(w.id) > -1; })
        .map(function (w) { return w.render(); }).join('') + '</div>';
    }

    /* Switches a widget on or off (from the Settings page). */
    function toggleWidget(id, on) {
      const cur = state.settings.widgets;
      state.settings.widgets = WIDGET_CATALOG.map(function (w) { return w.id; })
        .filter(function (wid) { return wid === id ? on : cur.indexOf(wid) > -1; });
      saveState();
      toast(on ? 'Widget added to your dashboard' : 'Widget removed');
    }

    /* "10:42 AM" style time. */
    function clockText() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

    /* The exact moment a deadline is due (end of day if no time was set). */
    function dueDateTime(d) {
      const x = parseDateStr(d.date);
      const p = (d.time || '23:59').split(':').map(Number);
      x.setHours(p[0], p[1], 0, 0);
      return x;
    }

    /* "2d 5h", "3h 12m" or "9m 05s" until a moment in time. */
    function countdownText(iso) {
      const ms = new Date(iso) - new Date();
      if (ms <= 0) return 'Overdue';
      const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      if (d > 0) return d + 'd ' + h + 'h';
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm ' + pad(s % 60) + 's';
    }

    /* Widget: clock. */
    function widgetClock() {
      return '<div class="widget w-dark"><div class="w-label">Right now</div><div class="w-big" data-live="clock">' + esc(clockText()) + '</div>' +
        '<div class="w-sub">' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) + '</div></div>';
    }

    /* Widget: live countdown to the next open deadline. */
    function widgetCountdown() {
      const next = sortedDeadlines().find(function (d) { return !d.done && !dueInfo(d).overdue; });
      if (!next) return '<div class="widget"><div class="w-label">Next deadline</div><div class="w-big">None</div><div class="w-sub">Nothing coming up. Enjoy it!</div></div>';
      const iso = dueDateTime(next).toISOString();
      return '<div class="widget w-click" style="border-left:5px solid ' + courseColor(next.course) + '" data-action="view-deadline" data-id="' + esc(next.id) + '">' +
        '<div class="w-label">Next deadline</div><div class="w-big" data-live="countdown" data-due="' + iso + '">' + esc(countdownText(iso)) + '</div>' +
        '<div class="w-sub">' + esc(next.title) + ' (' + esc(courseName(next.course)) + ')</div></div>';
    }

    /* Widget: what is due today (and anything overdue). */
    function widgetToday() {
      const t = todayStr();
      const items = sortedDeadlines().filter(function (d) { return !d.done && d.date <= t; }).slice(0, 4);
      const body = items.length
        ? '<div class="w-list">' + items.map(function (d) {
          return '<button class="w-item" data-action="view-deadline" data-id="' + esc(d.id) + '"><span>' + esc(d.title) + '</span><small>' +
            esc(dueInfo(d).overdue ? 'Overdue' : (d.time ? formatTime(d.time) : 'Today')) + '</small></button>';
        }).join('') + '</div>'
        : '<div class="w-sub" style="margin-top:6px">Nothing due today.</div>';
      return '<div class="widget"><div class="w-label">Due today</div>' + body + '</div>';
    }

    /* How many weekly check-in items are ticked, out of the total. */
    function weeklyProgress() {
      const roots = rootFolders();
      let done = 0, total = roots.length + APP_SETTINGS.EXTRA_WEEKLY_TASKS.length;
      roots.forEach(function (f) { if (isChecked('slides:' + f.id)) done++; });
      APP_SETTINGS.EXTRA_WEEKLY_TASKS.forEach(function (t, i) { if (isChecked('extra:' + i)) done++; });
      return { done: done, total: total };
    }

    /* Widget: this week at a glance. */
    function widgetWeek() {
      const t = todayStr(), end = new Date();
      end.setDate(end.getDate() + 7);
      const endStr = toDateStr(end);
      const ahead = state.deadlines.filter(function (d) { return !d.done && d.date >= t && d.date <= endStr; }).length;
      const pr = weeklyProgress();
      const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
      return '<div class="widget"><div class="w-label">This week</div><div class="w-big">' + ahead + '</div>' +
        '<div class="w-sub">' + (ahead === 1 ? 'deadline' : 'deadlines') + ' in the next 7 days</div>' +
        '<div class="progress" aria-hidden="true"><div style="width:' + pct + '%"></div></div>' +
        '<div class="w-sub">Weekly check-in: ' + pr.done + ' of ' + pr.total + ' done</div></div>';
    }

    /* Seconds left on the focus timer. */
    function timerRemaining() { return timer.running ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining; }

    /* "25:00" style text for the timer. */
    function timerText() { const r = timerRemaining(); return pad(Math.floor(r / 60)) + ':' + pad(r % 60); }

    /* Start or pause the focus timer. */
    function toggleTimer() {
      if (timer.running) {
        timer.remaining = timerRemaining();
        timer.running = false;
      } else {
        if (timer.remaining <= 0) timer.remaining = timer.len;
        timer.endAt = Date.now() + timer.remaining * 1000;
        timer.running = true;
      }
      renderWidgets();
    }

    /* Widget: focus timer. */
    function widgetFocus() {
      const chips = [15, 30, 45, 60].map(function (m) {
        return '<button class="w-chip ' + (timer.len === m * 60 ? 'on' : '') + '" data-action="timer-len" data-min="' + m + '">' + m + ' min</button>';
      }).join('');
      return '<div class="widget"><div class="w-label">Focus timer</div><div class="w-big" data-live="timer">' + timerText() + '</div>' +
        '<div class="w-btns"><button class="btn btn-small" data-action="timer-toggle">' + (timer.running ? 'Pause' : 'Start') + '</button>' +
        '<button class="btn btn-ghost btn-small" data-action="timer-reset">Reset</button></div><div class="w-btns">' + chips + '</div></div>';
    }

    /* The saved text of the quick note. */
    function getNote() { return kvGet(KEY_NOTE, ''); }

    /* Widget: quick note (saved on this device as you type). */
    function widgetNote() {
      return '<div class="widget wide"><div class="w-label">Quick note</div>' +
        '<textarea id="noteWidget" maxlength="2000" placeholder="Jot something down\u2026" aria-label="Quick note">' + esc(getNote()) + '</textarea></div>';
    }

    /* Saves the note shortly after you stop typing. */
    document.addEventListener('input', function (e) {
      if (e.target.id !== 'noteWidget') return;
      const v = e.target.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { kvSet(KEY_NOTE, v); }, 400);
    });

    /* Updates live widget values every second. */
    function tickWidgets() {
      if (timer.running && timerRemaining() <= 0) {
        timer.running = false;
        timer.remaining = 0;
        toast('Focus session finished. Nice work!');
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ }
        if (ui.view === 'dashboard') renderWidgets();
      }
      document.querySelectorAll('[data-live]').forEach(function (el) {
        const k = el.dataset.live;
        if (k === 'clock') el.textContent = clockText();
        else if (k === 'countdown') el.textContent = countdownText(el.dataset.due);
        else if (k === 'timer') el.textContent = timerText();
      });
    }


    /* L7. Weekly timetable */

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    /* Weekday order follows the week-start setting. */
    function weekDayOrder() {
      return APP_SETTINGS.WEEK_STARTS_ON_MONDAY ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    }

    /* "09:30" -> 570 (minutes since midnight). */
    function timeToMinutes(t) {
      return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10);
    }

    /* The classes on one weekday, earliest first. */
    function classesOn(day) {
      return state.timetable.filter(function (c) { return c.day === day; })
        .sort(function (a, b) { return a.start < b.start ? -1 : (a.start > b.start ? 1 : 0); });
    }

    /* What to call a class: its own title, or else the course name. */
    function classLabel(c) { return c.title || courseName(c.course); }

    /* Formats a room label, or returns empty when unset. */
    function roomText(c) {
      if (!c.room) return '';
      return /^room\b/i.test(c.room) ? c.room : 'Room ' + c.room;
    }

    /* One colored class block (used in the desktop columns and the mobile day list). */
    function classBlockHTML(c) {
      return '<button type="button" class="tt-class" style="--c:' + courseColor(c.course) + '" data-action="edit-class" data-id="' + esc(c.id) + '">' +
        '<strong>' + esc(classLabel(c)) + '</strong>' +
        '<span>' + esc(formatTime(c.start)) + ' \u2013 ' + esc(formatTime(c.end)) + '</span>' +
        (c.room ? '<small>' + esc(roomText(c)) + '</small>' : '') + '</button>';
    }

    /* Draws the desktop and mobile timetable. */
    function renderTimetable() {
      const card = $('timetableCard');
      const today = new Date().getDay();
      const order = weekDayOrder();
      let html = '<div class="card-head"><h2>Weekly timetable</h2>' +
        '<button class="btn btn-small" data-action="add-class" data-day="' + ui.ttDay + '">' + icon('plus') + '<span>Add class</span></button></div>';

      if (!state.timetable.length) {
        card.innerHTML = html + '<div class="empty"><strong>No classes yet</strong>Add your weekly lectures and labs. They will show here and on your dashboard.<br>' +
          '<button class="btn" data-action="add-class" data-day="' + today + '">Add a class</button></div>';
        return;
      }

      /* Desktop / tablet: one column per day */
      html += '<div class="tt-grid">' + order.map(function (day) {
        const list = classesOn(day);
        return '<div class="tt-col' + (day === today ? ' is-today' : '') + '"><div class="tt-col-head">' + DAY_SHORT[day] + '</div>' +
          (list.length ? list.map(classBlockHTML).join('') : '<div class="tt-none">\u2014</div>') + '</div>';
      }).join('') + '</div>';

      /* Phone: day pills, one day at a time (starts on today) */
      const dayList = classesOn(ui.ttDay);
      html += '<div class="tt-mobile"><div class="tt-pills" role="group" aria-label="Choose a day">' + order.map(function (day) {
        return '<button type="button" class="tt-pill' + (day === ui.ttDay ? ' active' : '') + (day === today ? ' is-today' : '') + '" data-action="tt-day" data-day="' + day + '" aria-pressed="' + (day === ui.ttDay) + '">' + DAY_SHORT[day] + '</button>';
      }).join('') + '</div><div class="tt-day-list">' +
        (dayList.length ? dayList.map(classBlockHTML).join('') : '<div class="empty">No classes on ' + DAY_NAMES[ui.ttDay] + '.</div>') + '</div></div>';
      card.innerHTML = html;
    }

    /* Opens the class dialog to add or edit entries. */
    function openTimetableModal(opts) {
      opts = opts || {};
      const editing = opts.id ? state.timetable.find(function (c) { return c.id === opts.id; }) : null;
      const byDay = {};
      (editing ? classGroup(editing) : []).forEach(function (c) { byDay[c.day] = c; });
      ui.editingClassId = editing ? editing.id : null;
      $('ttDlgTitle').textContent = editing ? 'Edit class' : 'Add class';
      $('ttDeleteBtn').hidden = !editing;
      $('ttError').textContent = '';
      $('ttCourse').innerHTML = rootFolders().map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>'; }).join('') +
        '<option value="">General (no course)</option>';
      const startDay = (opts.day !== undefined && opts.day !== '') ? Number(opts.day) : ui.ttDay;
      /* One row per weekday: tick it, then set the times for that day */
      $('ttDays').innerHTML = weekDayOrder().map(function (d) {
        const c = byDay[d];
        const on = editing ? !!c : d === startDay;
        return '<div class="tt-dayrow" data-day="' + d + '">' +
          '<label class="tt-daypick"><input type="checkbox" value="' + d + '"' + (on ? ' checked' : '') + '><span>' + DAY_SHORT[d] + '</span></label>' +
          '<div class="tt-times"' + (on ? '' : ' hidden') + '>' +
          '<input type="time" class="tt-s" aria-label="' + DAY_NAMES[d] + ' start time" value="' + (c ? c.start : '09:00') + '">' +
          '<span>to</span>' +
          '<input type="time" class="tt-e" aria-label="' + DAY_NAMES[d] + ' end time" value="' + (c ? c.end : '10:00') + '"></div></div>';
      }).join('');
      if (editing) {
        $('ttCourse').value = editing.course;
        $('ttTitle').value = editing.title;
        $('ttRoom').value = editing.room;
      } else {
        $('ttCourse').value = rootFolders()[0] ? rootFolders()[0].id : '';
        $('ttTitle').value = '';
        $('ttRoom').value = '';
      }
      $('timetableDialog').showModal();
      $('ttTitle').focus();
    }

    /* Shows time fields when a day is selected. */
    function onTtDayChange(e) {
      const box = e.target;
      if (!box.matches || !box.matches('input[type="checkbox"]')) return;
      const row = box.closest('.tt-dayrow');
      row.querySelector('.tt-times').hidden = !box.checked;
      if (!box.checked) return;
      const other = Array.prototype.slice.call($('ttDays').querySelectorAll('.tt-dayrow')).find(function (r) {
        return r !== row && r.querySelector('input[type="checkbox"]').checked;
      });
      if (other) {
        row.querySelector('.tt-s').value = other.querySelector('.tt-s').value;
        row.querySelector('.tt-e').value = other.querySelector('.tt-e').value;
      }
    }

    /* Returns all entries for a grouped class. */
    function classGroup(c) {
      if (!c.gid) return [c];
      return state.timetable.filter(function (x) { return x.gid === c.gid; });
    }

    /* Validates and saves one entry per selected day. */
    function saveClass(e) {
      e.preventDefault();
      const err = $('ttError');
      const days = [];
      const rows = Array.prototype.slice.call($('ttDays').querySelectorAll('.tt-dayrow'));
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.querySelector('input[type="checkbox"]').checked) continue;
        const d = Number(r.dataset.day), s = r.querySelector('.tt-s').value, en = r.querySelector('.tt-e').value;
        if (!s || !en) { err.textContent = 'Choose a start and an end time for ' + DAY_NAMES[d] + '.'; return; }
        if (en <= s) { err.textContent = DAY_NAMES[d] + ' must end after it starts.'; return; }
        days.push({ day: d, start: s, end: en });
      }
      if (!days.length) { err.textContent = 'Tick at least one day.'; return; }
      const wasEditing = !!ui.editingClassId;
      const old = wasEditing ? state.timetable.find(function (x) { return x.id === ui.editingClassId; }) : null;
      const gid = (old && old.gid) || uid();
      if (old) {                                        // replace every day of the class being edited
        const drop = classGroup(old).map(function (x) { return x.id; });
        state.timetable = state.timetable.filter(function (x) { return drop.indexOf(x.id) === -1; });
      }
      const base = { gid: gid, course: $('ttCourse').value, title: $('ttTitle').value.trim(), room: $('ttRoom').value.trim() };
      days.forEach(function (d) { state.timetable.push(Object.assign({ id: uid() }, base, d)); });
      const dayNums = days.map(function (d) { return d.day; });
      ui.ttDay = dayNums.indexOf(ui.ttDay) > -1 ? ui.ttDay : dayNums[0];
      saveState();
      $('timetableDialog').close();
      renderAll();
      toast(wasEditing ? 'Class updated' : (days.length > 1 ? 'Class added on ' + days.length + ' days' : 'Class added'));
    }

    /* Deletes a class (all of its days) after confirming. */
    function deleteClass(id, closeModalFirst) {
      const c = state.timetable.find(function (x) { return x.id === id; });
      if (!c) return;
      const group = classGroup(c);
      const dayText = group.map(function (x) { return x.day; }).sort(function (a, b) { return a - b; }).map(function (d) { return DAY_SHORT[d]; }).join(', ');
      if (closeModalFirst) $('timetableDialog').close();
      askConfirm('Delete this class?', classLabel(c) + ' (' + dayText + ') will be removed.', 'Delete class', function () {
        const drop = group.map(function (x) { return x.id; });
        state.timetable = state.timetable.filter(function (x) { return drop.indexOf(x.id) === -1; });
        saveState(); renderAll(); toast('Class deleted');
      });
    }

    /* Gets today's or tomorrow's timestamp for a class time. */
    function classTimeTs(c, hhmm, offset) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(parseInt(hhmm.slice(0, 2), 10), parseInt(hhmm.slice(3, 5), 10), 0, 0);
      return d.getTime();
    }

    /* 93784000 -> "1d 2h 03m 04s" (the live countdown text). */
    function formatCountdown(ms) {
      const t = Math.floor(Math.max(0, ms) / 1000);
      const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
      return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + pad(m) + 'm ' + pad(s) + 's';
    }

    /* Countdown markup for a class alert. */
    function countdownHTML(a) {
      if (!a.countdownTo) return '';
      return ' \u2014 starts in <b class="cd" data-countdown="' + a.countdownTo + '">' + formatCountdown(a.countdownTo - Date.now()) + '</b>';
    }

    /* Updates class countdowns and refreshes expired alerts. */
    function tickClassCountdowns() {
      let expired = false;
      document.querySelectorAll('[data-countdown]').forEach(function (el) {
        const left = Number(el.dataset.countdown) - Date.now();
        if (left <= 0) expired = true; else el.textContent = formatCountdown(left);
      });
      if (!expired) return;
      renderBell(); renderBanner();
      if ($('alertsDialog').open) $('alertsBody').innerHTML = alertListHTML();
      if (ui.view === 'dashboard' && !document.querySelector('dialog[open]')) renderTodayClasses();
    }

    /* Draws today's classes when any are scheduled. */
    function renderTodayClasses() {
      const area = $('classesArea');
      if (!state.timetable.length) { area.innerHTML = ''; return; }
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const list = classesOn(now.getDay());
      const current = list.find(function (c) { return timeToMinutes(c.start) <= mins && mins < timeToMinutes(c.end); });
      const next = list.find(function (c) { return timeToMinutes(c.start) > mins; });
      let tag, main, sub = '', c = null, cdTs = 0;
      if (current) {
        c = current; tag = 'In class now';
        main = classLabel(c) + ' until ' + formatTime(c.end);
        sub = [roomText(c), next ? 'Then ' + classLabel(next) + ' at ' + formatTime(next.start) : ''].filter(Boolean).join(' \u2022 ');
      } else if (next) {
        c = next; tag = 'Next class'; cdTs = classTimeTs(c, c.start, 0);
        main = classLabel(c) + ' at ' + formatTime(c.start);
        sub = roomText(c);
      } else {
        tag = 'Today\u2019s classes';
        main = list.length ? 'All done for today' : 'No classes today';
      }
      area.innerHTML = '<div class="card today-classes" style="--c:' + (c ? courseColor(c.course) : 'var(--primary)') + '">' +
        '<span class="tc-icon">' + icon('clock') + '</span>' +
        '<div class="tc-text"><small>' + esc(tag) + (list.length ? ' \u2022 ' + list.length + ' today' : '') + '</small><strong>' + esc(main) + '</strong>' +
        ((sub || cdTs) ? '<span>' + esc(sub) + (cdTs ? (sub ? ' \u2022 ' : '') + 'starts in <b class="cd" data-countdown="' + cdTs + '">' + formatCountdown(cdTs - Date.now()) + '</b>' : '') + '</span>' : '') + '</div>' +
        '<button class="btn btn-ghost btn-small" data-action="nav" data-view="timetable">Timetable</button></div>';
    }


    /* L8. Share a deadline */

    /* Shares or copies a deadline summary. */
    function shareDeadline(id) {
      const d = state.deadlines.find(function (x) { return x.id === id; });
      if (!d) return;
      const fullDate = parseDateStr(d.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const text = '\uD83D\uDCCC ' + d.title + '\n' +
        'Course: ' + courseName(d.course) + '\n' +
        'Type: ' + d.type + '\n' +
        'Due: ' + fullDate + (d.time ? ' at ' + formatTime(d.time) : '') + '\n\n' +
        'Tracked with ' + APP_INFO.NAME + '\n' + window.location.origin;
      if (navigator.share) {
        navigator.share({ title: d.title, text: text }).catch(function (err) {
          if (!err || err.name !== 'AbortError') copyShareText(text);   // closing the share sheet is not an error
        });
        return;
      }
      copyShareText(text);
    }

    /* Copies the message so it can be pasted into WhatsApp. */
    function copyShareText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast('Copied \u2014 ready to paste in WhatsApp!'); },
          function () { toast('Couldn\u2019t copy. Please try again.'); }
        );
      } else {
        toast('Sharing isn\u2019t supported in this browser.');
      }
    }


    /* L9. Backup reminder */

    /* True once the student has anything worth backing up. */
    function hasSavedData() {
      return state.folders.length > 0 || state.deadlines.length > 0 || state.files.length > 0;
    }

    /* Is a reminder due? (14+ days since the last backup AND since the last "Later") */
    function backupReminderDue() {
      if (!hasSavedData()) return false;
      const gap = APP_SETTINGS.BACKUP_REMIND_DAYS * 86400000;
      const now = Date.now();
      const last = Number(kvGet(KEY_LAST_BACKUP, 0)) || 0;
      const snooze = Number(kvGet(KEY_BACKUP_SNOOZE, 0)) || 0;
      if (last && now - last < gap) return false;
      if (now < snooze) return false;
      return true;
    }

    /* Checks a little after opening, never instantly. */
    function scheduleBackupBanner() {
      setTimeout(function () { showBackupBanner(false); }, 15000);
    }

    /* Slides the banner up (never over a pop-up or the donate banner). */
    function showBackupBanner(retried) {
      if (!backupReminderDue()) return;
      if (document.querySelector('dialog[open]') || !$('donateBanner').hidden) {
        if (!retried) setTimeout(function () { showBackupBanner(true); }, 20000);
        return;
      }
      const b = $('backupBanner');
      b.innerHTML = '<span class="fold-tile" style="--c:#2f6fed">' + icon('download') + '</span>' +
        '<div class="db-text"><strong>Time for a quick backup?</strong>' +
        '<span>Saving a backup file keeps your courses, deadlines and files safe if you ever clear this browser or change phones.</span>' +
        '<div class="db-actions"><button class="btn btn-small" data-action="backup-export">Export backup</button>' +
        '<button class="btn btn-ghost btn-small" data-action="backup-later">Later</button></div></div>';
      b.hidden = false;
    }

    /* Hides the banner. */
    function hideBackupBanner() { $('backupBanner').hidden = true; }

    /* "Later": stay quiet for another BACKUP_REMIND_DAYS days. */
    function snoozeBackupBanner() {
      hideBackupBanner();
      kvSet(KEY_BACKUP_SNOOZE, Date.now() + APP_SETTINGS.BACKUP_REMIND_DAYS * 86400000);
    }


    /* M. Startup */

    /* Loads saved data and starts the app. */
    async function init() {
      db = await openDatabase();
      storageWorks = !!db;
      if (db) {
        await loadAllValues();             // read every small saved value into memory
        await migrateLegacyStorage();      // one-time move from the old localStorage (existing students)
        requestPersistentStorage();        // ask the browser not to auto-clear our data
      } else {
        /* Use legacy data for this visit if IndexedDB is blocked. */
        try { const raw = localStorage.getItem(LEGACY_KEYS.state); if (raw) kvCache[KEY_STATE] = raw; } catch (e) { /* ignore */ }
      }

      setupPWA();
      loadUiPrefs();
      countAppOpen();
      const saved = loadState();
      if (saved) {
        state = saved;
      } else {
        state = emptyState();   // Start new users with a clean slate.
        saveState();
      }
      applySettings();
      ui.folderId = rootFolders()[0] ? rootFolders()[0].id : null;
      showView('dashboard');
      maybeShowWelcome();
      scheduleDonateBanner();
      scheduleBackupBanner();
      setInterval(tickClassCountdowns, 1000);   // live class countdowns
      setInterval(tickWidgets, 1000);   // Keep widgets updated.

      /* Re-check alerts every minute so "Due in 2 days" stays correct overnight */
      setInterval(function () {
        renderHeader(); renderBell(); renderBanner();
        const typing = document.activeElement && document.activeElement.tagName === 'TEXTAREA';   // don't redraw while typing a note
        if (ui.view === 'dashboard' && !typing && !document.querySelector('dialog[open]')) renderDashboard();
      }, 60000);
    }

    init().catch(function (e) { console.error('StudyDesk failed to start', e); });