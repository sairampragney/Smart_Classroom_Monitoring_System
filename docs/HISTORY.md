# History & Persistence (Phase 9)

Local storage of monitoring records, and the API + page that display them.

> **The backend owns persistence.** The frontend only reads; it never inserts a
> record. This is what prevents React re-renders, reconnects or duplicate
> WebSockets from ever writing rows.

---

## 1. Storage technology

**SQLite**, via Python's bundled `sqlite3` module.

Why SQLite and not a client/server database:

- ships with Python — nothing to install or configure
- no server process, no credentials, no ports
- a single local file is easy to inspect, copy or delete before a demo
- sufficient for a single-machine, single-user classroom rig

MySQL/PostgreSQL would add an installation dependency for no benefit here.

## 2. Location

```
backend/data/history.db
```

- git-ignored (`.gitignore` excludes `backend/data/*` and `*.db`)
- created automatically on first backend start; **never** overwritten
- `.gitkeep` is committed so the folder survives a fresh clone

## 3. Schema

```sql
CREATE TABLE IF NOT EXISTS history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT    NOT NULL,   -- ISO-8601 UTC
    temperature   REAL,               -- degC,  NULL when the DHT failed
    humidity      REAL,               -- %RH,   NULL when the DHT failed
    light         INTEGER,            -- LDR ADC, NULL when unknown
    motion        INTEGER,            -- 0/1,     NULL when unknown
    head_count    INTEGER,            -- CV faces, NULL when CV is off
    ml_prediction TEXT,               -- OCCUPIED / EMPTY, NULL when no model
    ml_confidence REAL,               -- real probability, NULL if unsupported
    ml_model      TEXT,               -- model name, NULL when no model
    arduino       TEXT,               -- connection state at write time
    cv_state      TEXT,
    ml_state      TEXT,
    monitoring    INTEGER             -- 1 while monitoring runs
);
CREATE INDEX IF NOT EXISTS idx_history_ts ON history (ts DESC);
```

**Nullability matters.** A failed DHT read is stored as `NULL`, never `0`.
A `0` would be indistinguishable from a genuine zero reading, and the frontend
renders `NULL` as `--`.

## 4. Timestamps

One convention everywhere: **timezone-aware ISO-8601 in UTC**, matching
`app.models.cv` and the rest of the backend, e.g. `2026-10-02T00:20:11+00:00`.

The browser never generates a stored timestamp — the row is written by the
backend at sample time. `toLocaleString()` in the UI is display formatting
only; the stored value stays UTC.

## 5. Write strategy

The firmware samples every 1 s and CV publishes at ~30 FPS. Writing on every
event would grow the database without bound, so a background recorder
(`HistoryRecorder`) samples the state every **2 s** and writes a row only when
it is *meaningfully* different from the last written row:

| Trigger | Threshold |
| --- | --- |
| temperature | change ≥ 0.5 °C |
| humidity | change ≥ 2 %RH |
| light | change ≥ 5 ADC |
| motion / head_count / ml_prediction / monitoring / arduino | any change |
| a value appearing or disappearing (NULL ↔ number) | always |
| heartbeat | a row every 60 s even if nothing changed |

Plus a **minimum gap of 2 s** between writes, so rapid flapping cannot produce a
burst of rows.

An all-`NULL` row is never written: if no sensor, CV or ML data has ever
arrived, there is nothing to record.

### Duplicate protection

Identical repeated readings produce **zero** additional rows. Verified by an
integration run: 6 identical recorder ticks → still exactly 1 row. The
frontend cannot create duplicates because it has no write path at all.

---

## 6. Concurrency

- SQLite connections are not thread-safe, so each thread gets its own
  connection via `threading.local`.
- **WAL journal mode** means API reads never block the recorder's write.
- Writes are short, single-statement transactions guarded by a lock, so the
  event loop is never held for long.
- CV is sampled as an aggregate (`head_count`) — never per-face, per-frame.

## 7. Retention

**No automatic deletion.** The database grows only as fast as meaningful state
changes occur (roughly one row per change, not per second). `HISTORY_MAX_ROWS`
exists in config as a cap for future pruning, but no pruning is implemented
yet — the database is never silently cleared, on startup or otherwise.

## 8. API

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/history?limit=100` | `{count, limit, total_rows, records[]}` |
| GET | `/api/history/latest` | `{record, has_data}` |
| GET | `/api/history/stats` | `{path, rows, exists}` |

- Ordering: **newest first** (`ORDER BY id DESC`)
- `limit` validated 1–1000 → `422` on 0, negative, > 1000 or non-numeric
- Database errors surface as `503`, never as a crash

```powershell
Invoke-RestMethod 'http://localhost:8000/api/history?limit=20' | ConvertTo-Json -Depth 4
```

## 9. History page

| State | What the user sees |
| --- | --- |
| Loading | `Loading history…` |
| Empty | `NO HISTORY AVAILABLE` + explanation |
| Backend down | `History unavailable` + the actual error |
| Populated | table of real records, newest first, with a stored-row count |

`--` is rendered for any `NULL` value, with a footnote stating that `--` means
unavailable rather than zero. **No fake rows are ever rendered.**

The formatting rules live in `src/utils/historyFormat.ts` as pure functions —
no DOM, no API calls — following the `utils/cvMapping.ts` convention, so they
are unit-tested with Node's built-in TypeScript support:

```powershell
node frontend/tests/historyFormat.test.ts
```

The tests pin the rule that a genuine `0` (an empty room, no motion) is shown
as a real reading, while a `NULL` (sensor never answered) shows `--` — the two
must never collapse into each other.

## 10. Inspecting the database

```powershell
# Via the API
Invoke-RestMethod http://localhost:8000/api/history/stats

# Directly (no extra tooling needed)
.\backend\.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect(r'backend\data\history.db'); print(c.execute('SELECT COUNT(*) FROM history').fetchone())"

# Start completely fresh (only when you intend to)
Remove-Item backend\data\history.db* -Force
```

## 11. Known limitations

1. **No automatic retention policy** — the table grows indefinitely. Fine for
   a demo, but a long-running install would eventually need pruning.
2. **Single-process writer.** Safe here because only the recorder thread
   writes, but two backend instances against the same file would not be.
3. **No indexing on measurement columns** — only `ts` is indexed, which is what
   the UI actually queries. Trend queries would need more indexes.
4. **Aggregate CV only.** Face boxes are never stored; a per-face timeline
   would need a separate table and a much higher write rate.
5. **ML confidence is `NULL` for KNN/SVM**, because those models cannot report
   a calibrated probability. That is honest, not missing data.

## 12. Verification summary

| Category | Result |
| --- | --- |
| Database tests | **PASS** — init, idempotent re-init, insert, ordering, limits, nulls |
| API tests | **PASS** — empty, populated, limit, 422 validation, latest, stats |
| Recorder tests | **PASS** — change detection, epsilon suppression, no-data skip, lifecycle |
| Duplicate handling | **PASS** — 6 identical ticks → 1 row (integration) |
| End-to-end integration | **PASS** — sensor → StateStore → ML → recorder → SQLite → API |
| Frontend build | **PASS** |
| Frontend format tests | **PASS** — 37 checks in `frontend/tests/historyFormat.test.ts` |
| Frontend browser check | **NOT PERFORMED** — no browser automation available |
| Physical hardware | **NOT PERFORMED** — no Arduino connected; integration used injected state |
