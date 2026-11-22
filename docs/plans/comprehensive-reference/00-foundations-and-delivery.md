# Recipe Box Comprehensive Reference: Foundations and Delivery

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Product purpose and principles, technology
> and hosting architecture, deferred scope, and test-first delivery.

## 1. Product Vision and Paradigm

### 1.1 The Problem Being Solved

- **Azure DevOps Work Items Appeal:** Clean information density, relational
  records, and useful multi-field filtering.
- **Azure DevOps Dealbreaker:** Inability to have multi-value picklists (enums/tags) on work items, plus an awkward
  domain mismatch for cooking data.
- **Fibery Experience:** Loved the relational database backing, bi-directional linking, and cross-linking between books
  and recipes. Strongly disliked the user experience ("all panes, like Azure Portal instead of Azure DevOps").
- **Generic Tools Failure:** Notion feels sluggish and unstructured; Jira is rigid and pane-heavy; consumer recipe apps
  (Paprika, AnyList) lack deep relational modeling, domain-aware search, and customizable taxonomies.

### 1.2 Core Architectural Philosophy

- **Dual-Platform Intentionality:** Desktop and mobile are treated as distinct interaction paradigms sharing a common
  data model and business logic, not a desktop site compressed into mobile viewports.
  - **Desktop:** Keyboard-first, dense detail layout, multi-column editing,
    quick recipe filters, and a compact source Library.
  - **Mobile:** Touch-first, quick capture/editing, fast search, kitchen-friendly cooking layout (large checkboxes, bold
    quantities, prominent scaling).
- **Relational Integrity:** Strong foreign keys and database constraints rather than loose no-code schemas.
- **Progressive Web App (PWA):** Installable, globally accessible via Vercel hosting, using Supabase for authentication,
  Postgres storage, and private media buckets. Native mobile apps (React Native / Expo) are deferred until native-only
  capabilities (offline camera scanner, local push notifications) are needed.
- Every route ends with a muted, right-aligned document footer showing the
  application version from `package.json`. On short pages it sits at the
  viewport bottom; on longer pages it follows the content and scrolls with the
  document. It never stays fixed to the viewport.

---

## 14. Technology Stack and Hosting Architecture

- **Frontend / Fullstack:** Next.js (App Router), React, TypeScript, Tailwind CSS.
- **Instruction editor:** Tiptap 3.31.4 with its Markdown extension and custom
  ingredient-mention node/tokenizer. The Markdown extension is early release;
  parser/serializer compatibility remains covered by automated tests in the
  instruction-editor implementation slice.
- **Hosting:** Vercel (Production and Preview deployments).
- **Database:** Supabase Postgres.
- **Auth:** Supabase Auth (Email/Password + Google OAuth).
- **Storage:** Supabase Storage (Private media buckets with signed URLs).
- **Client Architecture:** Progressive Web App (PWA) with a manifest and root
  service worker. The worker keeps at most 10 recently viewed active recipe
  detail snapshots in browser-local Cache Storage for read-only offline access;
  snapshots omit remote media and server-dependent controls. Public pages and
  API responses are excluded, and sign-out clears every private offline cache
  before the server session ends. Browser installation is native; physical
  device checks are deferred to Slice 25.
- **Concurrent Edits:** Each recipe carries a version number. A save based on a stale version is rejected, and the user
  chooses between reloading the current version and keeping their edits.
- **Environments:** Development runs entirely locally: a local Supabase stack, a local email catcher, open sign-up, and
  no email verification. Production setup (Supabase, Vercel, Google, email delivery) comes last. Schema changes ship as
  versioned migrations. Unit, end-to-end, and accessibility checks run locally with one command.

---

## 15. Deferred Features Catalog

The following features were discussed and intentionally set aside for post-v1 releases:

- OCR and camera capture for paper cookbook recipes
- Automated web recipe URL scrapers
- Ingredient alias mapping (e.g., `bell pepper` $\leftrightarrow$ `capsicum`)
- Formal allergen and dietary restriction tags/warnings
- Full cooking attempt logs, historical Score changes over time, and cook
  history remain deferred; DLC 49 adds only a per-recipe count and latest
  timestamp, with structured Find filters but no date-by-date journal
- Multi-user household collaboration and role permissions
- Native mobile applications (Expo / React Native)
- Historical version rollback/restoration engine
- Dark theme (v1 ships a single light theme)
- UK imperial units (v1 volume units are US customary and metric)

---

## 16. Testability and test-first delivery

Testability is a non-negotiable product and architecture constraint. Every
requirement, state, rule, permission boundary, and user-visible workflow must
have deterministic automated acceptance coverage; a manual demonstration
supplements that coverage but never replaces it.

- Write the focused automated tests before production code for each behavior.
  Start with a failing test that expresses the slice's acceptance criterion,
  implement only enough to make it pass, then refactor with the tests green.
- Design APIs, database boundaries, time-dependent behavior, external services,
  browser capabilities, and UI state so tests can control inputs and observe
  outputs without relying on hidden state, live hosted services, or manual
  inspection.
- Cover the appropriate layers: unit tests for deterministic logic, integration
  tests for database, authentication, storage, and API boundaries, end-to-end
  tests for user workflows, and automated accessibility checks for every screen.
- Add regression coverage before correcting a defect. When a requirement cannot
  be tested automatically, treat that as a design issue to resolve in the slice
  brief before implementation rather than an exception to the rule.

Slice briefs define the specific test cases, fixtures, and local test commands
before implementation begins. A slice is not complete until its automated tests
pass locally alongside its demonstrable acceptance workflow.
