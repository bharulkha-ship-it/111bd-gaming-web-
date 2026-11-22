# 111BD Bangla Gaming Web

A mobile-friendly, black-and-gold casino-style **demo** website starter.

## Included
- Responsive homepage and game cards
- Register/login with hashed passwords
- SQLite user database and session login
- Virtual-credit wallet and transaction history
- One demo slot game
- Admin dashboard and demo-credit adjustment
- No real-money deposits, withdrawals, cash prizes, or payment integration

## Run locally
Requires Node.js 18+.

```bash
npm install
```

Copy `.env.example` to `.env`, then set a long random `SESSION_SECRET`, and change the admin email/password. Export those variables in your terminal or use a dotenv loader of your choice.

Linux/macOS example:
```bash
export SESSION_SECRET='replace-with-a-long-random-secret'
export ADMIN_EMAIL='admin@example.com'
export ADMIN_PASSWORD='ChangeThisAdminPassword123!'
npm start
```

Windows PowerShell:
```powershell
$env:SESSION_SECRET='replace-with-a-long-random-secret'
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_PASSWORD='ChangeThisAdminPassword123!'
npm start
```

Open http://localhost:3000

The admin account is created at first startup if ADMIN_EMAIL and ADMIN_PASSWORD are set and that email does not already exist. Change the sample credentials before deployment.

## Before public deployment
Use HTTPS, a persistent session store, CSRF protection, secure secrets, backups, monitoring, and a proper production database. Review local laws and hosting requirements. This starter is intentionally demo-only and does not implement real-money gambling or payment processing.
