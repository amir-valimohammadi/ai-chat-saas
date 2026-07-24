# Frontend CSS architecture

## Rule

Do not add page-specific styles to `app/globals.css`.

- Global reset, typography and design tokens stay in `app/globals.css`, `styles/tokens.css` and `styles/base.css`.
- Every page-specific stylesheet must be created under `frontend/styles`.
- Super Admin styles live under `frontend/styles/super-admin`.
- New Super Admin pages must get their own CSS file and import it from `app/super-admin/layout.tsx` or the page itself.
- Shared Super Admin utilities belong in `styles/super-admin/shared.css`; page-specific selectors do not.

Run this check before building:

```bash
npm run check:styles
```
