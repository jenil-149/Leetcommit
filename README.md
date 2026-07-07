# LeetCommit

LeetCommit is a clean, modern Chrome/Edge extension built with Manifest V3 that allows you to push your LeetCode C++ solutions directly to a GitHub repository with a single click.

---

##  Features

- **One-Click Pushing**: Automatically extract your solution code and problem title from the active LeetCode page and push it directly to your GitHub repository.
- **C++ Boilerplate Wrapper**: Wrap your editor code inside standard boilerplate templates automatically (adds `#include <bits/stdc++.h>`, namespace `std`, and a `main` execution routine).
- **Auto-Detect File Existence**: Checks if the solution file already exists in your GitHub repo and commits an update instead of throwing an error.
- **Secure Credentials Storage**: Saves your GitHub Personal Access Token (PAT), username, and repository details safely within your browser's local storage.
- Secure input view with a show/hide password toggle for the PAT.

---

## How to Install (Developer Mode)

Since this is a custom extension, you can load it locally:

1. **Download/Clone** this repository to your local machine.
2. Open your web browser (Chrome, Edge, or any Chromium-based browser) and navigate to the Extensions page:
   - In Chrome: `chrome://extensions/`
   - In Edge: `edge://extensions/`
3. Enable **Developer mode** (usually a toggle in the top-right corner).
4. Click on **Load unpacked** (top-left corner).
5. Select the folder containing `manifest.json` (`LeetCommit` folder).
6. The LeetCommit icon will now appear in your extension bar!

---

## GitHub Configuration Setup

To allow LeetCommit to write code into your repository, you need to provide a Personal Access Token (PAT).

1. Go to your GitHub account settings.
2. Navigate to **Developer settings** -> **Personal access tokens** -> **Tokens (classic)**.
3. Click **Generate new token (classic)**.
4. Set a name/note (e.g., `LeetCommit`) and expiration.
5. Under scopes, select **`repo`** (Full control of private repositories).
6. Click **Generate token** and copy the generated key (`ghp_...`).
7. Create a repository on GitHub (e.g. `leetcode-solutions`) if you haven't already.

---

## How to Use

1. Click on the **LeetCommit** extension icon to open the popup.
2. Click the **Settings (gear icon)** to expand the configuration panel.
3. Fill in your details:
   - **Personal Access Token**: Enter the copied token from GitHub.
   - **GitHub Username**: Enter your GitHub username.
   - **Repository Name**: Enter the repository name (e.g., `leetcode-solutions`).
4. Click **Save**.
5. Navigate to any problem on LeetCode (e.g., `https://leetcode.com/problems/two-sum/`).
6. Paste or write your C++ solution in the code editor.
7. Click the **Push to GitHub** button on the LeetCommit popup.
8. Wait for the status banner to display `✓ Pushed [Problem_Name].cpp`. Your solution is now successfully uploaded!

---

##  Project Structure

- `manifest.json` – Web extension manifest definition (V3).
- `popup.html` – Popup user interface.
- `popup.css` – Simplified, comment-free stylesheet utilizing Google Material Symbols.
- `popup.js` – Handles scraping, local storage, API communication, and page interaction.
- `icons/` – Folder containing the LeetCommit branding icons.
