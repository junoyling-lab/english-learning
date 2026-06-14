# Privacy and Backup

## Local Data

Vocabulary, rules, operation logs, and the Gemini API key are stored in this browser on this device.

## Gemini

Messages sent to Gemini leave your device. Avoid sending sensitive personal or work information unless you are comfortable with that.

## Backup

Use Export regularly. This app does not automatically connect to cloud drives and does not automatically sync. Export downloads a JSON backup file. You can then manually save that file to OneDrive, Google Drive, iCloud Drive, or a local folder.

Whether cloud storage is free depends on your own cloud account allowance. OneDrive, Google Drive, and iCloud usually provide a free storage tier, but extra storage may require payment.

The backup JSON contains:

- Vocabulary
- Current rules
- Operation logs

Keep the backup somewhere safe, such as OneDrive, Google Drive, iCloud Drive, or a local folder.

## Future Cloud Sync

The v1 data model uses stable IDs, timestamps, soft deletion, and sync status fields. That keeps future migration to a cloud database realistic without redesigning the whole app.
