// ═══════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════
const pushBtn = document.getElementById('pushBtn');
const pushBtnText = document.getElementById('pushBtnText');
const pushBtnLoader = document.getElementById('pushBtnLoader');

const form = document.getElementById('settingsForm');
const patInput = document.getElementById('pat');
const userInput = document.getElementById('username');
const repoInput = document.getElementById('repo');
const branchInput = document.getElementById('branch');
const prefixInput = document.getElementById('commitPrefix');
const saveBtn = document.getElementById('saveBtn');
const settingsDetails = document.getElementById('settingsDetails');

const togglePat = document.getElementById('togglePat');
const eyeOpen = document.getElementById('eyeOpen');
const eyeClosed = document.getElementById('eyeClosed');

const banner = document.getElementById('statusBanner');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');

const historyList = document.getElementById('historyList');

// ═══════════════════════════════════════════════════
//  LANGUAGE → EXTENSION MAP
// ═══════════════════════════════════════════════════
const LANG_EXT_MAP = {
  'c++': '.cpp', 'cpp': '.cpp', 'c': '.c',
  'java': '.java',
  'python': '.py', 'python3': '.py',
  'javascript': '.js', 'typescript': '.ts',
  'c#': '.cs', 'csharp': '.cs',
  'go': '.go', 'golang': '.go',
  'ruby': '.rb',
  'swift': '.swift',
  'kotlin': '.kt',
  'rust': '.rs',
  'scala': '.scala',
  'php': '.php',
  'dart': '.dart',
  'racket': '.rkt',
  'erlang': '.erl',
  'elixir': '.ex',
};

const CPP_LANGUAGES = new Set(['c++', 'cpp', 'c']);

// ═══════════════════════════════════════════════════
//  INIT – Load saved settings & history
// ═══════════════════════════════════════════════════
chrome.storage.local.get(
  ['github_pat', 'github_username', 'github_repo', 'github_branch', 'commit_prefix', 'push_history'],
  (data) => {
    if (data.github_pat) patInput.value = data.github_pat;
    if (data.github_username) userInput.value = data.github_username;
    if (data.github_repo) repoInput.value = data.github_repo;
    if (data.github_branch) branchInput.value = data.github_branch;
    if (data.commit_prefix) prefixInput.value = data.commit_prefix;

    // Auto-open settings if not configured
    if (!data.github_pat || !data.github_username || !data.github_repo) {
      settingsDetails.open = true;
    }

    // Render push history
    renderHistory(data.push_history || []);
  }
);

// ═══════════════════════════════════════════════════
//  TOGGLE PAT VISIBILITY
// ═══════════════════════════════════════════════════
togglePat.addEventListener('click', () => {
  const isPassword = patInput.type === 'password';
  patInput.type = isPassword ? 'text' : 'password';
  eyeOpen.classList.toggle('hidden', !isPassword);
  eyeClosed.classList.toggle('hidden', isPassword);
});

// ═══════════════════════════════════════════════════
//  SAVE SETTINGS
// ═══════════════════════════════════════════════════
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const pat = patInput.value.trim();
  const username = userInput.value.trim();
  const repo = repoInput.value.trim();
  const branch = branchInput.value.trim() || 'main';
  const prefix = prefixInput.value.trim();

  if (!pat || !username || !repo) {
    showBanner('error', 'PAT, username, and repo are required');
    return;
  }

  // Validate PAT format
  if (!pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
    showBanner('error', 'PAT should start with ghp_ or github_pat_');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.querySelector('.save-btn-text').classList.add('hidden');
  saveBtn.querySelector('.save-btn-loader').classList.remove('hidden');

  chrome.storage.local.set(
    {
      github_pat: pat,
      github_username: username,
      github_repo: repo,
      github_branch: branch,
      commit_prefix: prefix,
    },
    () => {
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.querySelector('.save-btn-text').classList.remove('hidden');
        saveBtn.querySelector('.save-btn-loader').classList.add('hidden');
        showBanner('success', 'Settings saved!');
      }, 300);
    }
  );
});

// ═══════════════════════════════════════════════════
//  PUSH TO GITHUB
// ═══════════════════════════════════════════════════
pushBtn.addEventListener('click', async () => {
  const creds = await getCredentials();
  if (!creds.pat || !creds.username || !creds.repo) {
    showBanner('error', 'Configure GitHub settings first');
    settingsDetails.open = true;
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('leetcode.com/problems/')) {
    showBanner('error', 'Open a LeetCode problem page first');
    return;
  }

  setPushLoading(true);
  showBanner('info', 'Scraping solution…');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: scrapeLeetCodePage,
    });

    const scraped = results?.[0]?.result;
    if (!scraped || !scraped.code) {
      showBanner('error', 'Could not extract code from the editor');
      setPushLoading(false);
      return;
    }

    const { title, code, language, difficulty } = scraped;
    const langKey = (language || 'cpp').toLowerCase();
    const ext = LANG_EXT_MAP[langKey] || '.txt';
    const isCpp = CPP_LANGUAGES.has(langKey);

    const finalCode = isCpp ? wrapInBoilerplate(code, title) : code;

    const fileName = title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();

    // Build path with difficulty subfolder
    const diffFolder = difficulty || '';
    const filePath = diffFolder
      ? `${diffFolder}/${fileName}${ext}`
      : `${fileName}${ext}`;

    const displayName = `${fileName}${ext}`;
    showBanner('info', `Pushing ${displayName}…`);

    const result = await pushToGitHub(creds, filePath, fileName, finalCode, displayName);

    if (result.success) {
      showBanner('success', `✓ Pushed ${displayName}`);
      await addToHistory({
        name: title,
        file: displayName,
        language: langKey,
        difficulty: diffFolder,
        url: result.url,
        timestamp: Date.now(),
      });
    } else if (result.skipped) {
      showBanner('success', '✓ Already up to date');
    } else {
      showBanner('error', result.error);
    }
  } catch (err) {
    if (!navigator.onLine) {
      showBanner('error', 'No internet connection');
    } else {
      showBanner('error', err.message);
    }
  } finally {
    setPushLoading(false);
  }
});

// ═══════════════════════════════════════════════════
//  SCRAPER – injected into LeetCode tab
// ═══════════════════════════════════════════════════
function scrapeLeetCodePage() {
  function extractTitle() {
    const selectors = [
      '[data-cy="question-title"]',
      'div[class*="title"] a',
      'a[class*="title"]',
      'div[class*="flexlayout__tab"] div[class*="title"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim().replace(/^\d+\.\s*/, '');
      }
    }
    const pageTitle = document.title;
    if (pageTitle && pageTitle.includes('-')) {
      const name = pageTitle.split('-')[0].trim().replace(/^\d+\.\s*/, '');
      if (name) return name;
    }
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    if (match) {
      return match[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return 'Unknown_Problem';
  }

  function extractCode() {
    // Method 1: Monaco Editor API (works because we inject in MAIN world)
    try {
      if (typeof monaco !== 'undefined' && monaco.editor) {
        const editors = monaco.editor.getEditors ? monaco.editor.getEditors() : null;
        if (editors && editors.length > 0) {
          const code = editors[0].getValue();
          if (code && code.trim().length > 10) return code;
        }
        const models = monaco.editor.getModels();
        if (models && models.length > 0) {
          const code = models[0].getValue();
          if (code && code.trim().length > 10) return code;
        }
      }
    } catch (_) { }

    // Method 2: Try CodeMirror (LeetCode sometimes uses it)
    try {
      const cmElement = document.querySelector('.CodeMirror');
      if (cmElement && cmElement.CodeMirror) {
        const code = cmElement.CodeMirror.getValue();
        if (code && code.trim().length > 10) return code;
      }
    } catch (_) { }

    // Method 3: DOM fallback – collect all view-lines (may be incomplete due to virtualization)
    const viewLines = document.querySelector('.view-lines');
    if (viewLines) {
      const lines = viewLines.querySelectorAll('.view-line');
      const sorted = Array.from(lines)
        .map((line) => ({
          top: parseFloat(line.style.top) || 0,
          text: line.textContent,
        }))
        .sort((a, b) => a.top - b.top);
      const code = sorted.map((l) => l.text).join('\n');
      if (code.trim().length > 10) return code;
    }

    // Method 4: Plain code blocks
    const codePre = document.querySelector('pre[class*="code"], code[class*="language-cpp"]');
    if (codePre) return codePre.textContent;

    return null;
  }

  function extractLanguage() {
    // Method 1: LeetCode's language selector button
    const langBtn = document.querySelector(
      'button[class*="lang-btn"], div[class*="lang-select"] button, ' +
      '[data-cy="lang-select"] button, button[id*="lang"]'
    );
    if (langBtn && langBtn.textContent.trim()) {
      return langBtn.textContent.trim().toLowerCase();
    }

    // Method 2: Look for a dropdown/select with language value
    const langSelect = document.querySelector(
      'div[class*="ant-select-selection-item"][title], ' +
      'span[class*="ant-select-selection-item"]'
    );
    if (langSelect) {
      const lang = langSelect.getAttribute('title') || langSelect.textContent;
      if (lang && lang.trim()) return lang.trim().toLowerCase();
    }

    // Method 3: Check Monaco editor language
    try {
      if (typeof monaco !== 'undefined' && monaco.editor) {
        const models = monaco.editor.getModels();
        if (models && models.length > 0) {
          const langId = models[0].getLanguageId?.() || models[0]._languageId;
          if (langId) return langId.toLowerCase();
        }
      }
    } catch (_) { }

    // Method 4: Scan for any element that shows current language
    const allBtns = document.querySelectorAll('button, [role="button"]');
    const knownLangs = ['c++', 'python', 'python3', 'java', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'swift', 'kotlin', 'c#', 'scala', 'php', 'dart'];
    for (const btn of allBtns) {
      const text = btn.textContent.trim().toLowerCase();
      if (knownLangs.includes(text)) return text;
    }

    return 'cpp';
  }

  function extractDifficulty() {
    // Method 1: Direct difficulty badge
    const diffSelectors = [
      'div[class*="difficulty"] span',
      'span[class*="difficulty"]',
      'div[diff]',
      '[data-degree]',
    ];
    for (const sel of diffSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim().toLowerCase();
        if (text === 'easy') return 'Easy';
        if (text === 'medium') return 'Medium';
        if (text === 'hard') return 'Hard';
      }
    }

    // Method 2: Check by color-coded elements (LeetCode uses specific colors)
    const colorMap = {
      'rgb(0, 184, 163)': 'Easy',    // teal
      'rgb(255, 192, 30)': 'Medium',  // yellow
      'rgb(255, 55, 95)': 'Hard',     // red
    };
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim().toLowerCase();
      if (['easy', 'medium', 'hard'].includes(text)) {
        return text.charAt(0).toUpperCase() + text.slice(1);
      }
    }

    return '';
  }

  return {
    title: extractTitle(),
    code: extractCode(),
    language: extractLanguage(),
    difficulty: extractDifficulty(),
  };
}

// ═══════════════════════════════════════════════════
//  BOILERPLATE (C++ only)
// ═══════════════════════════════════════════════════
function wrapInBoilerplate(rawCode, problemName) {
  return `/**
 * LeetCode Problem: ${problemName}
 * Pushed by LeetCommit
 * Date: ${new Date().toISOString().split('T')[0]}
 */

#include <bits/stdc++.h>
using namespace std;

// --- LeetCode Solution ---
${rawCode}

int main() {
    return 0;
}
`;
}

// ═══════════════════════════════════════════════════
//  GITHUB API
// ═══════════════════════════════════════════════════
async function pushToGitHub(creds, filePath, fileName, content, displayName) {
  const apiUrl = `https://api.github.com/repos/${creds.username}/${creds.repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${creds.pat}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'LeetCommit-Extension/2.1',
  };

  let existingSha = null;
  let existingContent = null;

  try {
    const checkResp = await fetch(apiUrl, { method: 'GET', headers });

    if (checkResp.status === 401) {
      return { success: false, error: 'Invalid GitHub token. Check your PAT in settings.' };
    }
    if (checkResp.status === 403) {
      const rateLimitRemaining = checkResp.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        const resetTime = checkResp.headers.get('X-RateLimit-Reset');
        const minutesLeft = resetTime
          ? Math.ceil((parseInt(resetTime) * 1000 - Date.now()) / 60000)
          : '?';
        return { success: false, error: `GitHub rate limit exceeded. Try again in ${minutesLeft} min.` };
      }
      return { success: false, error: 'Access denied. Check PAT permissions (needs repo scope).' };
    }

    if (checkResp.ok) {
      const fileData = await checkResp.json();
      existingSha = fileData.sha;
      existingContent = fileData.content; // base64-encoded
    }
  } catch (err) {
    if (!navigator.onLine) {
      return { success: false, error: 'No internet connection.' };
    }
    // File doesn't exist yet — that's fine, we'll create it
  }

  // Duplicate check: compare new content with existing
  const newContentB64 = utf8ToBase64(content);
  if (existingContent) {
    const cleanExisting = existingContent.replace(/\s/g, '');
    const cleanNew = newContentB64.replace(/\s/g, '');
    if (cleanExisting === cleanNew) {
      return { success: false, skipped: true };
    }
  }

  const commitPrefix = creds.prefix ? `${creds.prefix} ` : '';
  const commitMsg = existingSha
    ? `${commitPrefix}Update ${displayName || fileName} solution`
    : `${commitPrefix}Add ${displayName || fileName} solution`;

  const body = {
    message: commitMsg,
    content: newContentB64,
    branch: creds.branch,
  };
  if (existingSha) body.sha = existingSha;

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (!navigator.onLine) {
      return { success: false, error: 'No internet connection.' };
    }
    return { success: false, error: `Network error: ${err.message}` };
  }

  if (response.status === 401) {
    return { success: false, error: 'Invalid GitHub token. Check your PAT in settings.' };
  }
  if (response.status === 403) {
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    if (rateLimitRemaining === '0') {
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const minutesLeft = resetTime
        ? Math.ceil((parseInt(resetTime) * 1000 - Date.now()) / 60000)
        : '?';
      return { success: false, error: `GitHub rate limit exceeded. Try again in ${minutesLeft} min.` };
    }
    return { success: false, error: 'Access denied. Check PAT permissions (needs repo scope).' };
  }
  if (response.status === 404) {
    return { success: false, error: 'Repository not found. Check your username and repo name.' };
  }
  if (response.status === 422) {
    const errData = await response.json().catch(() => ({}));
    if (errData.message?.includes('sha')) {
      return { success: false, error: 'File was modified externally. Try pushing again.' };
    }
    return { success: false, error: errData.message || 'Validation failed.' };
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    return { success: false, error: errData.message || `HTTP ${response.status}` };
  }

  const data = await response.json();
  return { success: true, url: data.content?.html_url || '' };
}

// ═══════════════════════════════════════════════════
//  PUSH HISTORY
// ═══════════════════════════════════════════════════
async function addToHistory(entry) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['push_history'], (data) => {
      const history = data.push_history || [];
      history.unshift(entry);
      // Keep only last 20
      const trimmed = history.slice(0, 20);
      chrome.storage.local.set({ push_history: trimmed }, () => {
        renderHistory(trimmed);
        resolve();
      });
    });
  });
}

function renderHistory(history) {
  if (!historyList) return;
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No pushes yet</div>';
    return;
  }

  historyList.innerHTML = history
    .map((entry) => {
      const timeAgo = getRelativeTime(entry.timestamp);
      const langBadge = entry.language
        ? `<span class="lang-badge">${entry.language}</span>`
        : '';
      const diffBadge = entry.difficulty
        ? `<span class="diff-badge diff-${entry.difficulty.toLowerCase()}">${entry.difficulty}</span>`
        : '';
      const link = entry.url
        ? `<a href="${entry.url}" target="_blank" class="history-link" title="View on GitHub">↗</a>`
        : '';

      return `
        <div class="history-item">
          <div class="history-info">
            <span class="history-name">${escapeHtml(entry.name)}</span>
            <div class="history-meta">
              ${langBadge}${diffBadge}
              <span class="history-time">${timeAgo}</span>
            </div>
          </div>
          ${link}
        </div>`;
    })
    .join('');
}

function getRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════
function getCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['github_pat', 'github_username', 'github_repo', 'github_branch', 'commit_prefix'],
      (data) => {
        resolve({
          pat: data.github_pat || '',
          username: data.github_username || '',
          repo: data.github_repo || '',
          branch: data.github_branch || 'main',
          prefix: data.commit_prefix || '',
        });
      }
    );
  });
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function setPushLoading(isLoading) {
  pushBtn.disabled = isLoading;
  pushBtnText.classList.toggle('hidden', isLoading);
  pushBtnLoader.classList.toggle('hidden', !isLoading);
  document.querySelector('.push-btn-icon').style.display = isLoading ? 'none' : '';
}

function showBanner(type, message) {
  banner.className = `status-banner ${type}`;
  statusIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : '⏳';
  statusText.textContent = message;
  if (type !== 'error') {
    setTimeout(() => banner.classList.add('hidden'), 4000);
  }
}
