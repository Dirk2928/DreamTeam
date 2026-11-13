# PKonek Frontend

PKonek is a Pasig City community issue reporting interface. Residents submit geotagged complaints, officials manage response workflows, administrators manage staff and categories, and the public report shows aggregate outcomes.

## Stack

- Next.js App Router, React, and strict TypeScript
- Tailwind CSS
- Recharts
- Leaflet / react-leaflet with OpenStreetMap tiles
- Lucide icons and Sonner

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The API defaults to `http://localhost:8000`. To use another backend origin, set:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Do not include `/api` or a trailing slash. The client adds `/api` to all contract routes.

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Public landing page with live public totals |
| `/login`, `/register` | Authentication |
| `/dashboard` | Role-aware metrics and priorities |
| `/complaints` | Searchable complaint directory |
| `/complaints/new` | Citizen report flow with Pasig map pin, duplicate check, photos, and AI severity |
| `/complaints/[id]` | Timeline, evidence, citizen verification, and official workflow |
| `/map` | Public marker and hotspot data within the authenticated workspace |
| `/official` | Official response queue |
| `/notifications` | User updates and assignments |
| `/admin/users` | Staff account management |
| `/admin/categories` | Category and SLA management |
| `/admin/audit` | Administrative audit trail |
| `/reports/public` | Public accountability dashboard and client-generated CSV export |

## API integration

`lib/api.ts` is the typed fetch client. IDs remain UUID strings. Wire types mirror the backend's flat complaint, user, category, photo, notification, dashboard, public map/report, and audit schemas. The browser stores the bearer token as `pkonek_access_token`, sends it in the Authorization header, and clears it on a 401 response.

Complaint submission creates the complaint first, then uploads each photo to the complaint-scoped photo endpoint. Failed API mutations remain visible as errors and never become local success states.

## Validation

```powershell
npm run lint
npm run build
```
