# Tartar School system

Run: install Python (python.org), then double-click `start.bat`
(Mac/Linux: `./start.sh`). The local server opens at
https://localhost:8443; HTTP page visits on port 8000 redirect to HTTPS.

The app generates a local self-signed certificate on first start and stores
its certificate and private key outside the project directory under
`%LOCALAPPDATA%\TartarSchool\https` on Windows or
`~/.config/TartarSchool/https` on Mac/Linux. Browsers will show a certificate
warning because the certificate is self-signed. Only continue if you are
using the local Tartar School server. The certificate includes localhost,
the computer name, and its current LAN IP. Other devices on the school Wi-Fi
must accept/trust the certificate separately. Public hosting requires a
trusted certificate issued for the public domain.

For an existing certificate, set both `TARTAR_TLS_CERT` and `TARTAR_TLS_KEY`
to PEM file paths before starting the server. `HTTPS_PORT` and `HTTP_PORT`
can be set to change the default ports 8443 and 8000.

Before starting the server, set `ADMIN_PASSWORD` in your user environment to a
unique password of at least 16 characters. The server will refuse to start if
it is missing or too short; the password is not stored in the source code. The
previous source-code password must be considered exposed and replaced. On
Windows, open PowerShell and set it for your account with a hidden prompt:

```powershell
$secure = Read-Host "Choose a unique admin password (16+ characters)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  [Environment]::SetEnvironmentVariable("ADMIN_PASSWORD", $value, "User")
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable value, secure, ptr
}
```

Close and reopen the terminal before starting the server so it receives the
new variable. Keep the password private and do not put it in source files,
screenshots, or shared command history.

## Google admin sign-in (optional)

Google sign-in uses Google Identity Services. Create a **Web application**
OAuth client in Google Cloud Console. Add this exact authorized JavaScript
origin for local use:

```text
https://localhost:8443
```

If `HTTPS_PORT` is changed, use that port instead. Copy the OAuth **client ID**
(it ends in `.apps.googleusercontent.com`; do not create or share a client
secret for this sign-in flow). Set that client ID and the exact Google account
email allowed to administer this school in the Windows user environment:

```powershell
[Environment]::SetEnvironmentVariable("GOOGLE_CLIENT_ID", "your-client-id.apps.googleusercontent.com", "User")
[Environment]::SetEnvironmentVariable("GOOGLE_ADMIN_EMAILS", "admin@example.com", "User")
```

`GOOGLE_ADMIN_EMAILS` may contain multiple comma-separated authorized emails.
Only those verified Google accounts are accepted. Close and reopen PowerShell,
then restart `start.bat` so the server reads the settings. On the login page,
select **Admin** to load Google sign-in. The local server must be running and
the browser must have internet access to load Google's sign-in service. Never
share a Google password or verification code.

Admin and staff password logins currently use password verification only.
SMS verification is paused by default and can be turned on later by setting
`LOGIN_OTP_ENABLED=1`. When enabled, one-time codes are sent using Africa's
Talking; configure it in the server environment and do not put API credentials
in source files:

- `AT_USERNAME` and `AT_API_KEY` are required.
- `ADMIN_PHONE` is required for the admin password and Google sign-in.
- Staff with a linked staff profile use that profile's phone. Set phone numbers
  for principal/bursar accounts in `/manage.html` > Staff Logins.
- `AT_SENDER` is optional and should only be set to an approved sender ID.

To enable SMS later, set `LOGIN_OTP_ENABLED` to `1` and run these PowerShell
commands, replacing the example values with your Africa's Talking account
details and admin phone:

```powershell
[Environment]::SetEnvironmentVariable("LOGIN_OTP_ENABLED", "1", "User")
[Environment]::SetEnvironmentVariable("AT_USERNAME", "your-username", "User")
[Environment]::SetEnvironmentVariable("AT_API_KEY", "your-api-key", "User")
[Environment]::SetEnvironmentVariable("ADMIN_PHONE", "+2547XXXXXXXX", "User")
```

Close and reopen the terminal (or sign out and back into Windows) before
starting the server so it receives the new environment variables. Each code expires after
5 minutes; incorrect codes are limited to five attempts and new codes are
throttled for one minute. Admin/staff login fails closed if SMS delivery or
account phone configuration is unavailable. Student/access-code logins are
unchanged.

- `/`            login page (access codes, "Student portal", "Staff" and "Admin" links)
- `/school/`     the school system for staff (opens after admin login)
- `/manage.html` learner-portal records, resources and access codes (admin)
- `/student.html` learner portal

The school app's **Timetable** page provides a weekly grid with weekdays as
columns and allocated time slots as rows, with views by class or teacher. The
admin or head of institution can allocate lessons by class, learning area,
teacher, weekday, time and optional room. The server prevents overlapping
allocations for the same class, teacher or room. Teachers can view their own
assigned lessons; only the admin or head of institution can add, edit or remove
allocations. Timetable records are stored in `state.json` and included in the
encrypted backup routine. Time rows come from saved lesson allocations; set
them to match the school's aSc bell schedule when creating lessons. Use
**Print selected class** or **Print selected teacher** for an individual
schedule, or **Print all classes** to print a separate timetable for every
class. Print layouts use landscape orientation.

The homepage **Apply for Admission**, **CLICK HERE**, and **Admissions now open**
links open an application form for the learner's name, date of birth, class or
grade sought, and parent/guardian contact details. Submissions are saved locally
in `admissions.json` for the administrator to review in **Management > Admissions**;
the submitter must confirm they are authorized and consent to admissions follow-up.
Only the administrator can view, update, or delete applications. The server limits
submissions from a single connection and validates the submitted fields. These
records contain children's personal information: restrict access to the computer
and backups, review submissions only for admissions, and delete them when no
longer needed. The encrypted `Backup-System.ps1` routine includes this file if
it exists.

Learners who can sign in to `/student.html` can request up to two clubs or
societies, including Chess, Debate, Scouts, Coding and Robotics, Science and
Innovation, Environmental Conservation (4K), Journalism, Music and Dance,
Drama, Art and Craft, Mathematics, Young Farmers, Red Cross/First Aid, and
Community Service. Requests start as **Pending** and need school-leadership
approval. Administrators can review them in **Management > Clubs & Societies**;
the Head of Institution can also review them in the staff system's
**Clubs & Societies** page. Learners can change and resubmit their choices; resubmitted
choices return to Pending. Requests are stored in `club-requests.json`, are
visible only to the learner who submitted them and school leadership, and are
included in the encrypted backup routine.

Use the browser's Back/Forward buttons or Alt+Left/Alt+Right to navigate
between system pages and portal sign-in screens. Restored staff/admin pages
recheck the login session before displaying protected content.

Logins: the admin creates the head of institution and bursar logins in
`/manage.html` > Staff Logins. The head of institution adds teachers, deputy and senior
teachers (and their logins) on the Staff page. Passwords are stored hashed in `users.json`.

Data files created next to `server.py`: `state.json` (school system),
`data.json` (learner portal), `codes.json` (access codes), `admissions.json`
(admission applications), `club-requests.json` (learner activity requests),
`uploads/`, `backups/`. Back these up to a separate
location regularly. Daily school-state
snapshots are kept in `backups/state-YYYYMMDD.json`; before relying on a
backup, confirm it opens as JSON and contains the expected records. The
snapshots contain sensitive learner information and must be protected like
the live data. The current restore process is manual: stop the server, preserve
the current `state.json`, then copy the chosen snapshot to `state.json` before
restarting.

## Encrypted backup routine (Windows and Google Drive)

Google Drive for desktop is not installed on this computer yet. Install it,
sign in locally with the school-managed account, and choose a Drive folder
that is available in File Explorer. Do not share account passwords or
verification codes. Use a restricted school account because even encrypted
backups should be access-controlled.

`Backup-System.ps1` creates one authenticated, AES-256 encrypted `.tsb`
archive before placing it in the destination. Names, learner records,
uploaded resources and the file manifest are inside the encrypted archive;
the Google Drive folder receives only the encrypted file. A passphrase of at
least 16 characters is entered through a hidden prompt and confirmed for each
backup. No passphrase is stored in the script or supplied on the command
line. Keep the passphrase in an approved password manager and maintain a
separate recovery copy. Losing it means the backup cannot be restored.

After Drive for desktop is installed, run a manual backup to a folder inside
the school account's Drive, using its actual local path:

```powershell
Set-Location -LiteralPath "C:\Users\tartar primary\Desktop\tartarsms\tartar-school-system\tartar-school-system"
.\Backup-System.ps1 -Destination "C:\path\to\Google Drive\TartarSchoolBackups"
```

The script stages readable files only in a temporary local folder, validates
JSON, resource references and SHA-256 checksums, encrypts and verifies the
archive, then removes the temporary plaintext. It retains encrypted archives
on the destination and does not automatically delete older backups.
When it prints the `.tsb` path, wait for Google Drive for desktop to show that
sync is complete before considering the off-device copy current. The script
cannot verify Google's remote sync status. If a backup fails or the Drive
folder is unavailable, investigate the error and retry; do not assume an old
copy is current.

Do not delete older backup files until the new archive has finished syncing
and you have verified that a separate recovery copy is available. Manage
Drive storage manually so an interrupted upload cannot trigger automatic
deletion of the only good remote copy.

Verify a backup by entering the same passphrase:

```powershell
.\Backup-System.ps1 -VerifyBackup "C:\path\to\Google Drive\TartarSchoolBackups\TartarSchool-Backup-YYYYMMDDTHHMMSSfffZ.tsb"
```

For a recovery drill, restore to a new, separate test folder; the script
refuses to overwrite existing folders or restore inside the application
folder:

```powershell
.\Backup-System.ps1 -RestoreBackup "C:\path\to\Google Drive\TartarSchoolBackups\TartarSchool-Backup-YYYYMMDDTHHMMSSfffZ.tsb" -RestoreDestination "C:\TartarRestoreTest"
```

Inspect the restored files and test them only in an isolated copy, never over
live school data. At least monthly, perform this restore drill on a different
computer if possible. Keep a second copy in a separate physical location.

Because backups use a manually entered portable passphrase, this version is
intentionally interactive and is not suitable for unattended Task Scheduler
runs. Run it daily while an authorized user is present, and after major
imports or admissions. Do not put the passphrase in task arguments, scripts,
or an unprotected file. A future unattended setup needs a separately designed
secure credential mechanism and tested recovery procedure.

Project layout:
- `portal/pages/` contains the public login, management and learner pages.
- `portal/assets/` contains assets used by those pages.
- `school/app/` and `school/assets/` contain the staff school system.
- `server.py` serves both applications and their API.
