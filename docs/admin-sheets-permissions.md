# Google Spreadsheet Permissions Log - Admin Transition

## 1. Role Definitions
- **Super Admin (Editor)**: Full control over the spreadsheet. Can approve, reject, and modify any data.
- **Admin (Editor)**: Can approve/reject venues and slips, and modify non-sensitive fields.
- **Auditor (Viewer)**: Read-only access to all data for auditing purposes.

## 2. Authorized Emails (Based on ADMIN_EMAIL_ALLOWLIST)
The following users are granted access to the [VibeCity Admin Dashboard Spreadsheet](https://docs.google.com/spreadsheets/d/1X_yUe1mD-zK0Fz9k_G5m9G-p9z8mG-m9G-m9G-m9G):

| Email | Role | Permission Level | Reason |
|-------|------|------------------|--------|
| `admin@vibecity.live` | Super Admin | Editor | Primary system administrator |
| `ops@vibecity.live` | Admin | Editor | Daily operations and approvals |
| `audit@vibecity.live` | Auditor | Viewer | Security and data audit |
| `vibecity-sheets-service@...iam.gserviceaccount.com` | System Service | Editor | Supabase Edge Function Sync (Required) |

## 3. Share Settings Verification
- [x] Link sharing is **OFF** (Restricted).
- [x] "Editors can change permissions and share" is **OFF**.
- [x] "Viewers and commenters can see the option to download, print, and copy" is **OFF**.

## 4. Revision History
- **2026-04-01**: Initial permission setup for Google Sheets transition.
