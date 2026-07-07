// DOM References 
const pushBtn = document.getElementById('pushBtn');
const pushBtnText = document.getElementById('pushBtnText');
const pushBtnLoader = document.getElementById('pushBtnLoader');

const form = document.getElementById('settingsForm');
const patInput = document.getElementById('pat');
const userInput = document.getElementById('username');
const repoInput = document.getElementById('repo');
const saveBtn = document.getElementById('saveBtn');
const settingsDetails = document.getElementById('settingsDetails');

const togglePat = document.getElementById('togglePat');
const eyeOpen = document.getElementById('eyeOpen');
const eyeClosed = document.getElementById('eyeClosed');

const banner = document.getElementById('statusBanner');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');


chrome.storage.local.get(['github_pat', 'github_username', 'github_repo'], (data) => {
  if (data.github_pat) patInput.value = data.github_pat;
  if (data.github_username) userInput.value = data.github_username;
  if (data.github_repo) repoInput.value = data.github_repo;

  // Auto-open settings if not configured
  if (!data.github_pat || !data.github_username || !data.github_repo) {
    settingsDetails.open = true;
  }
});


//  TOGGLE PAT VISIBILITY
togglePat.addEventListener('click', () => {
  const isPassword = patInput.type === 'password';
  patInput.type = isPassword ? 'text' : 'password';
  eyeOpen.classList.toggle('hidden', !isPassword);
  eyeClosed.classList.toggle('hidden', isPassword);
});


//  SAVE SETTINGS
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const pat = patInput.value.trim();
  const username = userInput.value.trim();
  const repo = repoInput.value.trim();

  if (!pat || !username || !repo) {
    showBanner('error', 'All fields are required');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.querySelector('.save-btn-text').classList.add('hidden');
  saveBtn.querySelector('.save-btn-loader').classList.remove('hidden');

  chrome.storage.local.set(
    { github_pat: pat, github_username: username, github_repo: repo },
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

// PUSH TO GITHUB
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
      func: scrapeLeetCodePage,
    });

    const scraped = results?.[0]?.result;
    if (!scraped || !scraped.code) {
      showBanner('error', 'Could not extract code from the editor');
      setPushLoading(false);
      return;
    }

    const { title, code } = scraped;
    const formattedCode = wrapInBoilerplate(code, title);

    const fileName = title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
    const filePath = `${fileName}.cpp`;

    showBanner('info', `Pushing ${fileName}.cpp…`);

    const result = await pushToGitHub(creds, filePath, fileName, formattedCode);

    if (result.success) {
      showBanner('success', `✓ Pushed ${fileName}.cpp`);
    } else {
      showBanner('error', result.error);
    }
  } catch (err) {
    showBanner('error', err.message);
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

    const codePre = document.querySelector('pre[class*="code"], code[class*="language-cpp"]');
    if (codePre) return codePre.textContent;

    return null;
  }

  return { title: extractTitle(), code: extractCode() };
}

//BoilerPlate
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


//  GITHUB API
async function pushToGitHub(creds, filePath, fileName, content) {
  const apiUrl = `https://api.github.com/repos/${creds.username}/${creds.repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${creds.pat}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'LeetCommit-Extension/2.0',
  };

  let existingSha = null;
  try {
    const checkResp = await fetch(apiUrl, { method: 'GET', headers });
    if (checkResp.ok) {
      const fileData = await checkResp.json();
      existingSha = fileData.sha;
    }
  } catch (_) { }

  const body = {
    message: existingSha ? `Update ${fileName} solution` : `Add ${fileName} solution`,
    content: utf8ToBase64(content),
    branch: 'main',
  };
  if (existingSha) body.sha = existingSha;

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    return { success: false, error: errData.message || `HTTP ${response.status}` };
  }

  const data = await response.json();
  return { success: true, url: data.content?.html_url || '' };
}

//  HELPERS
function getCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['github_pat', 'github_username', 'github_repo'], (data) => {
      resolve({
        pat: data.github_pat || '',
        username: data.github_username || '',
        repo: data.github_repo || '',
      });
    });
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
