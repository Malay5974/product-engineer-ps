# Product Engineering Challenge Submission

## Candidate

- **Name:** Delwadiya Malay
- **Email:** malaydelwadiya3031@gmail.com
- **GitHub:** https://github.com/Malay5974
- **Selected problem:** Problem 1 — Resumable Realtime Conversation
- **Demo video:** [Watch the demo on Google Drive](https://drive.google.com/file/d/1as4W_zlXcjlTZUMb6fXVzqFTRRT8G3hS/view?usp=drive_link)

## Run the project

Requires Node.js 24. Run `nvm use` before installing dependencies.

```text
npm install
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173/client/`. Use the browser controls to start a reply, disconnect, reconnect from the saved cursor, and simulate provider failure.

## Run the tests and benchmark

```text
npm run build
npm test
npm run benchmark
```

The benchmark generates 30 ordered response events, disconnects while generation is active, replays from the recorded cursor, and verifies zero missing and duplicate events.

Optional local configuration is documented in `.env.example`. Recovery can also be requested explicitly with `POST /api/runs/:runId/resume`; the operation is safe to repeat for the same active run.

## Current implementation

The server stores runs and ordered events in SQLite. Versioned migrations are applied automatically at startup, so reviewers do not need to create tables manually. SSE exposes events after a client cursor. The client owns presentation state and deduplicates events by sequence. The deterministic fake provider makes success and failure scenarios repeatable without a paid model API.

## Acceptance scenarios

Implemented: ordered live stream, missed-event replay, replay/live deduplication, durable history across database reopen, partial generation failure, and explicit cursor validation.

## Assumptions and limitations

- The fake generator is used instead of a live model provider.
- A process restart preserves history and automatically resumes an in-progress deterministic generator from its last persisted chunk. A production provider would additionally need an idempotency key or provider-side checkpoint for safe external retries.
- Authentication, multi-user conversations, multiple simultaneous runs, and production-scale deployment are out of scope.

## Technology choices

React and TypeScript provide a small browser client with explicit connection state. Node.js and SSE keep server-to-client streaming simple. SQLite makes durable event history easy for reviewers to run locally. A production multi-instance deployment would likely use PostgreSQL and a shared event or job infrastructure.

## AI usage

I used OpenAI Codex as an engineering assistant during this submission. I used it
to review the problem requirements, inspect the implementation, identify gaps in
failure handling and test coverage, suggest focused changes, and help verify the
repository with the existing test, build and benchmark commands.

I remained responsible for the implementation and reviewed the generated
suggestions against the problem brief and the existing architecture before
applying them. In particular, I checked the run-state transitions, cursor and
event-ordering behavior, restart recovery, validation boundaries and terminal
failure behavior. The final changes were formatted and verified with the
automated test suite and TypeScript/Vite build. AI-generated output was not
accepted without code review and local validation.

## Credibility note

At my previous company, I worked on Blinds To Go, an enterprise-level
e-commerce platform for configuring and purchasing custom window treatments.
One of my main contributions was building product synchronization between the
Experro e-commerce platform and the BTG AS400 database. The synchronization had
to support products with 500+ variants while keeping product data consistent
across systems.

I also implemented frontend product configuration flows. Each style exposes
multiple dependent options, including colors, motor choices, mount types, and
other customization settings. Available options change as the customer makes
selections, so the UI had to represent complex combinations accurately and
prevent invalid configurations. I owned the frontend work for these variant
selection flows as well as the product-sync work described above.

The same configuration model is used throughout the store. A public example is
the [custom roller shades configurator](https://www.blindstogo.com/shades/roller-shades/customize-snow-aurora-vinyl-blackout-roller-shades/),
which demonstrates the dependent product options and customization experience.

I also worked on Forminator at Incsub LLC, a widely installed WordPress form
plugin. I owned the end-to-end Stripe Checkout Session API flow for the
plugin's Stripe field. The previous Payment Intent integration primarily
supported payment methods with immediate confirmation. The new Checkout
Session integration expanded support to Stripe payment methods that require
redirects, delayed confirmation, loans, or installment payments. We handled
those outcomes through Stripe webhooks and moved the integration toward Stripe
Connect rather than relying only on direct API-secret connections.

This work required preserving compatibility in a large, established plugin.
For example, Checkout requirements vary by payment method: some require a
country, email address, phone number, or other customer information. I added
conditional validation in the appropriate form and payment paths instead of
making those fields globally mandatory. I also handled adaptive-pricing and
currency-conversion edge cases where Stripe rejected an amount below the
minimum for the selected currency. When Stripe returned the relevant error, the
integration applied a valid default amount so the Stripe field and currency
selector could render and the user could continue with the correct pricing
flow.

The public [Forminator plugin page and developer changelog](https://wordpress.org/plugins/forminator/#developers)
documents the 1.56.0 release (July 21, 2026), including Stripe Connect OAuth,
Stripe Checkout Sessions, Adaptive Pricing, and migration of existing forms to
the Checkout Sessions API.
