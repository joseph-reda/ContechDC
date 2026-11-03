# Contech DC Dashboard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Engineers** submit and follow assigned document requests for construction
  projects.
- **Document Controllers** maintain the official document workflow, registers,
  and records.
- **Department Heads** review department-level work.
- **Administrators** provision accounts, set roles and request-type access, and
  maintain projects and configuration.
- The product is intended to serve multiple construction companies, not only a
  single internal team.

## Product Purpose

Contech DC Dashboard controls construction-document workflows across IR, CPR,
PPIR, TR, reviews, and Shop Drawings. It helps teams standardize the document
cycle, reduce manual administration, and produce Word and Excel outputs from
approved templates. Success means project records, approvals, revisions, and
generated documents are dependable and easy to operate for each company.

## Positioning

An operational document-control workspace that combines controlled request
workflows, role-based ownership and approval, company-managed deployment, and
document/report generation from the team's established templates rather than
requiring a separate cloud document service.

## Operating Context

The application is used by construction project teams while they create,
review, track, archive, restore, and report on document requests. It runs as a
React web application with a Node.js/SQLite backend and supports office-server
deployment. Word templates, checklist templates, and Excel report templates
are part of its day-to-day workflow.

## Capabilities and Constraints

- Request types include IR, CPR, PPIR, TR, reviews, and Shop Drawings.
- Roles are Engineer, Document Controller, Department Head, and Administrator.
- Public registration is intentionally unavailable; administrators create and
  manage user accounts in Admin Mode.
- Account roles and request types are controlled values, not free-form input.
- Revisions must remain connected to their parent document workflow.
- The current implementation supports local development and self-managed
  production deployment; how separate companies' data will be isolated remains
  an open product decision.

## Brand Commitments

The current product name is **Contech DC Dashboard**. The user confirmed that
the Contech identity should be preserved, but the qualifying detail in their
response was incomplete and remains to be confirmed before future branding
work.

## Evidence on Hand

- Product and deployment guidance: `README.md`.
- React application and user-facing workflows: `src/`.
- Node.js API and SQLite implementation: `backend/`.
- Existing Word and checklist templates: `Files/` and `backend/templates/`.
- Existing branding image: `src/images/Contec.jpg`.
- No customer testimonials, case studies, pricing, or externally verified
  performance claims are on hand; future product work must not fabricate them.

## Product Principles

1. Keep every document workflow controlled, traceable, and connected to its
   related records and revisions.
2. Reduce repeat manual work through reliable templates, generated documents,
   and exports.
3. Make responsibility explicit through role-based access and ownership.
4. Support each company's ability to operate the system under its own control.
5. Prefer dependable operational clarity over unnecessary complexity.
