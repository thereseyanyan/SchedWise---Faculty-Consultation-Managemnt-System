# SchedWise updated project package

This package includes the project source and the current UI/API changes.

## Included updates

- In-app notification center with unread count, refresh/polling, mark-read, and mark-all-read behavior.
- Admin notification events for student registration, appointment requests, and faculty approval/decline. These are database notifications and do not require SMTP.
- Student and faculty login labels distinguish Student ID / Email from Faculty Email. Login role is checked after authentication.
- Replaceable public PNG artwork: `frontend/public/logo.png`, `student.png`, `teacher.png`, `coding.png`, and `logoo.png`.
- Account settings profile image upload and replacement through the avatar endpoint.
- Existing admin portal pages and account controls are included.

## Setup

1. Extract this ZIP.
2. Open the project folder in VS Code.
3. In `backend/config.php`, set the MySQL username/password for your local server. This delivered config is sanitized and uses an empty password by default.
4. Import `database.sql` into your MySQL database named `schedwise` (or update the config to match your database).
5. Install frontend packages from the `frontend` directory and start Vite:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

6. Start the PHP backend from the project root (with PHP available in PATH):

   ```powershell
   php -S 127.0.0.1:8000 -t backend
   ```

7. Keep the frontend and backend running. The API configuration in `frontend/src/api.ts` should match your local backend address if you use a different port.

## Notes

- SMTP is only for email delivery. The in-app notification records are stored in MySQL independently.
- Profile images are uploaded to `backend/uploads/avatars/`; ensure the PHP process can write to that folder.
- Replace the PNG files in `frontend/public/` with your own images using the same filenames to update the visuals without editing React code.
- `node_modules` and `.git` are intentionally excluded from this ZIP. Run `npm install` in `frontend` after extraction.
