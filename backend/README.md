# PKonek backend

FastAPI backend for PKonek, a Pasig City civic complaint service. It uses SQLAlchemy 2, Aiven MySQL over TLS, JWT bearer authentication, APScheduler, database-backed photos, and optional external chat, OCR, and CLIP adapters.

## Setup

Python 3.11+ is recommended.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with the Aiven URL, downloaded CA path, and JWT secret.
python run.py
```

Aiven MySQL is the required normal runtime. The recommended setup uses separate `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` values so passwords with URL-special characters work without manual encoding. `MYSQL_SSL_CA` must reference an existing CA certificate. A `mysql+pymysql://...` `DATABASE_URL` remains supported as an alternative. TLS hostname verification is enabled. SQLite works only when explicitly selected, for example `DATABASE_URL=sqlite:///./pkonek.db`; use it for local validation, not deployment.

Interactive API documentation is available at `http://localhost:8000/docs`. Application routes use `/api`. Send JWTs as `Authorization: Bearer <token>`.

## Configuration

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`: recommended Aiven connection fields.
- `DATABASE_URL`: optional alternative to the separate connection fields; use a `mysql+pymysql://` URL.
- `MYSQL_SSL_CA`: downloaded Aiven CA certificate.
- `JWT_SECRET`: at least 32 characters.
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`: create the first administrator at startup if absent.
- `LUMEN_API_BASE`: Lumen Suite gateway origin, currently `https://api.staging.nonlive.lumen.bayanichain.tech`.
- `LUMEN_API_KEY`, `LUMEN_API_SECRET`: organization credentials sent as `lumen-api-key` and `lumen-api-secret`; the key needs AI Chat and OCR grants.
- `LUMEN_INSTANCE_ID`: optional AI Chat instance; when blank, PKonek selects the first active instance returned by Lumen.
- `ENABLE_CLIP`, `CLIP_MODEL`: optional local pretrained CLIP. Install `requirements-ai.txt` first.
- `ENABLE_OCR`, `TESSERACT_CMD`: optional local pytesseract fallback when Lumen OCR is unavailable. Tesseract must also be installed on the host.
- `SCHEDULER_ENABLED`, `SLA_WARNING_HOURS`, `AUTO_CLOSE_HOURS`: SLA worker controls.

Database tables and starter categories are created at startup. `create_all` does not alter an existing schema. Existing deployments must migrate the `photos` table to the current model before rollout; photo bytes now live in the required `data` LONGBLOB column. Existing deployments also need the nullable `complaints.first_response_at` column for response-time reporting.

## API

### System and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Health response |
| POST | `/api/auth/register` | Public | Register a citizen and issue a JWT |
| POST | `/api/auth/login` | Public | Login and issue a JWT |
| GET | `/api/auth/me` | Authenticated | Current profile |
| POST | `/api/auth/staff` | Admin | Create an official or administrator |
| GET | `/api/auth/staff` | Official/Admin | List staff |
| PATCH | `/api/auth/staff/{user_id}/active` | Admin | Activate or deactivate staff |

### Categories

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/categories` | Public | List categories |
| POST | `/api/categories` | Admin | Create category |
| PUT | `/api/categories/{category_id}` | Admin | Update category |
| DELETE | `/api/categories/{category_id}` | Admin | Deactivate category |

### Complaints and photos

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/complaints/duplicates` | Authenticated | Radius search; MySQL uses `ST_Distance_Sphere` |
| POST | `/api/complaints` | Citizen | Create a complaint |
| GET | `/api/complaints` | Authenticated | Community complaint list; citizens use `mine=true` for their own reports |
| GET | `/api/complaints/{complaint_id}` | Authenticated | Complaint details |
| POST | `/api/complaints/{complaint_id}/me-too` | Citizen | Support an open complaint once |
| POST | `/api/complaints/{complaint_id}/assign` | Official/Admin | Assign active staff |
| POST | `/api/complaints/{complaint_id}/status` | Official/Admin | Apply a valid staff workflow transition |
| POST | `/api/complaints/{complaint_id}/updates` | Official/Admin | Add progress update |
| GET | `/api/complaints/{complaint_id}/updates` | Authenticated | Read timeline |
| POST | `/api/complaints/{complaint_id}/verify` | Owning citizen | Accept to close or reject to reopen |
| POST | `/api/complaints/{complaint_id}/photos` | Authenticated | Upload and normalize a before/after image |
| GET | `/api/complaints/{complaint_id}/photos` | Authenticated | List photo metadata |
| GET | `/api/complaints/{complaint_id}/photo-similarity` | Authenticated | Optional CLIP similarity using stored bytes |
| GET | `/api/photos/{photo_id}/content` | Authenticated | Read image bytes with MIME, ETag, and private cache headers |

Creation checks open same-category complaints within 100 metres. A match returns HTTP 409 unless `allow_possible_duplicate=true`; the response can drive the Me Too flow. Pasig bounds are latitude 14.50–14.65 and longitude 121.04–121.15.

Staff acknowledge, assign, begin, resolve, reject, or reopen complaints through validated transitions. A resolved action becomes `pending_verification`. Only the reporting citizen can accept completion or reject it and reopen the complaint. Pending verification auto-closes after `AUTO_CLOSE_HOURS`.

### Notifications, AI, maps, and reporting

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/notifications` | Authenticated | List notifications |
| PATCH | `/api/notifications/{notification_id}/read` | Owner | Mark one read |
| POST | `/api/notifications/read-all` | Authenticated | Mark all read |
| POST | `/api/assistant/chat` | Authenticated | PKonek assistant with optional external provider |
| POST | `/api/ai/ocr` | Authenticated | OCR a stored photo by `photo_id` through Lumen API, with optional Tesseract fallback |
| POST | `/api/ai/classify-image` | Authenticated | Classify a stored photo by `photo_id` |
| POST | `/api/ai/severity` | Authenticated | Rule-based severity score |
| GET | `/api/public/markers` | Public | Complaint map markers |
| GET | `/api/public/hotspots` | Public | Rounded-coordinate active clusters |
| GET | `/api/public/reports` | Public | Aggregate transparency report |
| GET | `/api/dashboard` | Official/Admin | Operational metrics |
| GET | `/api/admin/audit-logs` | Admin | Filtered audit feed |

## Photo processing

Photo bytes are stored in `Photo.data`, using SQLAlchemy `LargeBinary` with a MySQL `LONGBLOB` variant. The API retains MIME type, normalized byte size, dimensions, SHA-256, kind, uploader, timestamps, and optional AI metadata. Uploads accept JPEG, PNG, or WebP up to 10 MB, reject animated or unsafe images, apply EXIF orientation, strip EXIF metadata, cap dimensions at 4096 pixels, and re-encode with format-appropriate compression.

OCR, classification, similarity, and content delivery load bytes from the database. CLIP and OCR remain disabled by default.

## SLA automation

Every complaint receives `created_at + category.sla_hours` as its deadline. The background job runs every five minutes. It warns administrators near deadlines, sends one breach escalation, and auto-closes pending verification after the configured window. Each action creates audit and notification records.

Run one scheduler-enabled application process in a multi-worker deployment, or disable the in-process scheduler and invoke `process_sla` from one dedicated worker.

## Validation

```powershell
python -m compileall -q app run.py
```

Local smoke checks must opt in to SQLite:

```powershell
$env:DATABASE_URL='sqlite:///./pkonek-smoke.db'
$env:JWT_SECRET='local-smoke-secret-at-least-32-characters'
$env:SCHEDULER_ENABLED='false'
python -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); c.__enter__(); print(c.get('/api/health').json()); c.__exit__(None,None,None)"
```
