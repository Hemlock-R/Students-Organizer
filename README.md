# StudyDesk

StudyDesk is a lightweight student organizer built with plain HTML, CSS, and JavaScript. It helps students organize course files, deadlines, weekly tasks, and class schedules.

## Features

- Organize course files in color-coded folders and subfolders.
- Add deadlines and view them in the dashboard, alerts, and calendar.
- Track weekly tasks and recurring classes.
- Customize reminders, appearance, and dashboard widgets.
- Export and restore backups.
- Install as a progressive web app and use the cached app shell offline.

## Run locally

No build step or package installation is required.

1. Start a local web server from the project directory:

   ```sh
   python -m http.server 8000
   ```

2. Open [http://localhost:8000](http://localhost:8000) in a browser.

Service workers require HTTPS or a local development address such as `localhost`; opening `index.html` directly as a file will not enable offline support. For installation on a phone or another device, host the files over HTTPS.

## Data and backups

StudyDesk stores app settings, deadlines, folders, and uploaded files in the browser's IndexedDB storage. Clearing browser data can remove them, so export backups regularly.

- Individual uploads can be up to 200 MB.
- Backup exports include files up to 2 MB each. Larger files remain on the device and are not included in the backup.
- Backup files are plain JSON; store them somewhere private.

## Offline support

The service worker caches the app page, stylesheet, and main script, then uses the network when available and the cache when offline. The first visit must be online to install the service worker and cache the app shell.

Some optional features use network resources: Umami receives page usage, performance and error metrics, plus clicks on the Add deadline and Export backup actions. Mobile PDF previews can load PDF.js from a CDN when needed.

## Security

The app applies a Content Security Policy for its current scripts, styles, previews, and feedback form. If you change the analytics or feedback provider, or configure a donor-information endpoint, update the policy in the `<head>` of `index.html` to allow that provider.

Render static sites receive response headers from the Render Dashboard. For additional protection, open your static site's **Headers** settings and add:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000` |

Render's Content Security Policy header adds a framing restriction to the policy in the HTML. Keep HSTS only while the site is served over HTTPS.

## Configuration

Edit `APP_SETTINGS` and `APP_INFO` near the top of `script.js` to adjust reminder defaults, upload limits, contact details, feedback, and donation options. The app version is also defined in `APP_INFO`.
