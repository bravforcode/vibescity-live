# Google Sheets Credentials

This directory stores local service-account credentials for Google Sheets export.

## Files

- `google-sheets-credentials.json` - local runtime credential file (ignored by git)
- `google-sheets-credentials.example.json` - example structure to copy from

## Quick setup

1. Create a Google Cloud project.
2. Enable APIs:
   - Google Sheets API
   - Google Drive API
3. Create a Service Account and generate a JSON key.
4. Save the downloaded JSON as:
   - `backend/credentials/google-sheets-credentials.json`
5. Share your target Google Sheet with the service account email (Editor access).
6. Set `GOOGLE_SHEETS_SPREADSHEET_ID` in `backend/.env`.

## Spreadsheet ID format

Given URL:

`https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMKUVfIGWHV3ksRTsWduRDe2y9MYlqU/edit#gid=0`

Spreadsheet ID is:

`1BxiMVs0XRA5nFMKUVfIGWHV3ksRTsWduRDe2y9MYlqU`
