# Legal & compliance notes (NovaSuite)

This is operational guidance for operators — not legal advice. Consult counsel for your jurisdiction.

## Recommended practices

1. **Terms of Use & Privacy Policy** — publish pages and set `TERMS_URL` / `PRIVACY_URL` (or CMS settings). Bot surfaces them under Terms / Privacy.
2. **Age gate** — Terms state 18+. Enforce offline if required in your market.
3. **AML / crypto** — manual deposit review checklist documents human verification of on-chain payments.
4. **Records** — keep `transactions`, `audit_logs`, `treasury_logs`, and backups for accounting and disputes.
5. **User data** — Telegram IDs and wallet addresses are stored for operations; Privacy policy should describe retention and deletion requests via Support.
6. **Advertising** — you are not responsible for third-party ad destinations; stated in Terms.
7. **No interest / securities claims** — PTC rewards are task-based, not investment products; avoid promotional language that implies guaranteed returns.

## Operator checklist before launch

- [ ] Strong `ADMIN_CMS_PASSWORD` and `ADMIN_CMS_SECRET` (≥32 random chars)
- [ ] Trust wallet controlled only by operators
- [ ] Payment addresses set and verified
- [ ] Support contact reachable
- [ ] Backup schedule (`pg_dump` + optional `npm run backup`)
- [ ] Legal pages reviewed by counsel
