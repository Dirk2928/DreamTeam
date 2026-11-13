# PKonek

PKonek is a Pasig City civic complaint platform built for a hackathon. Citizens report local issues, officials manage resolution work, and Pasig administrators monitor performance and public accountability.

## Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, Recharts, Leaflet, OpenStreetMap
- **API:** FastAPI, SQLAlchemy, JWT
- **Database and photo storage:** Aiven MySQL over TLS. Photo bytes use `LONGBLOB`; URLs and object storage are not used.
- **Automation:** APScheduler for SLA warnings, escalation, and verification auto-close
- **AI:** Lumen Suite staging APIs for session-based chat and asynchronous OCR, optional local CLIP for image classification/similarity, and optional Tesseract OCR fallback

## Run locally with Aiven

1. Download the Aiven MySQL CA certificate and save it outside source control, for example `backend/ca.pem`.
2. Copy `backend/.env.example` to `backend/.env` and set:
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` from Aiven
   - `MYSQL_SSL_CA=C:/absolute/path/to/backend/ca.pem`
   - `JWT_SECRET` to at least 32 random characters
   - `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`
3. Start the API:

```powershell
Set-Location backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

4. In another terminal, copy `frontend/.env.example` to `frontend/.env.local`, then start Next.js:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open `http://localhost:3000`. API documentation is at `http://localhost:8000/docs`.

## Roles

- **Citizen:** self-registers, reports issues, adds “Me Too,” follows updates, and accepts or rejects completion.
- **Official:** receives assignments, updates progress, uploads after photos, and resolves complaints.
- **Pasig admin:** creates staff accounts and categories, assigns work, reviews audit logs, dashboards, maps, and public outcomes.

See `backend/README.md` and `frontend/README.md` for API and interface details.
