# UGC API Contract

## Base
`/api/v1/ugc`

## Endpoints
- `POST /shops`
- `POST /check-in`
- `POST /photos`
- `GET /my-stats`
- `GET /leaderboard`
- `GET /achievements`
- `GET /my-submissions`

Each method/path pair must be unique in router registration.

## Auth
- All user-specific endpoints require authenticated user via `verify_user`.

## Reward behavior
- Reward grant is best-effort and must not block the primary user action.

