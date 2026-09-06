# Parser service

A small FastAPI service that does the two jobs Python is simply better at than
Node: pulling text out of a PDF, and extracting skill keywords from prose.

It is deliberately a **separate service**, not a route in the Next.js app. It
has no database access and holds no state — it takes bytes or text in and
returns structured JSON. All persistence, tenancy and RLS stay in the main app,
which means this service can be scaled, restarted or rewritten without touching
student data.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Point the Next.js app at it with `PARSER_SERVICE_URL=http://localhost:8000`.
When that variable is unset the main app falls back to a plain-text-only path
and reports PDF parsing as unavailable rather than failing silently.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | Liveness check, also reports whether PDF support loaded |
| `POST` | `/parse/resume` | Multipart file upload -> extracted text + detected skills |
| `POST` | `/extract/keywords` | JD text -> weighted keywords + detected skills |

Auth: if `PARSER_SERVICE_TOKEN` is set, every request must carry
`Authorization: Bearer <token>`. Set it in any deployment where the service is
reachable from outside the cluster.

## Tests

```bash
pip install pytest && python -m pytest
```
