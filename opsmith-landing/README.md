# Opsmith — landing page

Single-file marketing site for **Opsmith**, an AI automation studio (pre-launch), with a
waitlist form for cohort one.

- `index.html` — the whole site. No build step, no dependencies. Fonts come from Google Fonts;
  everything else is inline.

## Waitlist storage

The form posts to whatever `submitWaitlist` can reach, in this order:

1. **Claude Artifact store** — when the page runs as a published Claude Artifact, it writes each
   sign-up to the `waitlist` collection via the `db` capability and shows the entrant their
   position. The artifact owner gets a "Waitlist" drawer listing entries.
2. **No store** — on a plain static host (Vercel, S3, anywhere), `window.claude` is absent, the
   form validates locally and points people at `hello@opsmith.co`.

To wire this to a real backend on Vercel, replace the `db.collection("waitlist").add(entry)`
call in the inline script with a `fetch("/api/waitlist", {method:"POST", ...})` and add an
API route that writes to your store of choice. The `entry` object is already the row shape:
`email`, `email_key` (lowercased, for dedupe), `company`, `role`, `team_size`, `workflow`,
`created_at`, `source`.

## Deploying

Static. From this directory: `vercel deploy` (or point any host at `index.html`).

## Editing

`index.html` carries `<!-- ARTIFACT:STRIP-START/END -->` markers around the standalone-document
wrapper (doctype, `<head>`, reset, `</body></html>`). Stripping those regions produces the body
used by the Claude Artifact build of the same page, so the two stay in sync from one source.
