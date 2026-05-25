# Nimbus

A live weather and city-alerts web app — built for the Nura Space full-stack
engineering code challenge.

> This README is a placeholder for the scaffold commit. The reviewer-facing
> README — features, live demo link, getting started, API reference, design
> decisions — is delivered as part of the documentation pass later in the build.

## Packages

- `backend/` — Node.js + Express + Socket.IO API
- `frontend/` — React + Vite single-page app (PWA)

## Local development

Requires Node 20 (see `.nvmrc`).

```bash
# Backend
cd backend && cp .env.example .env && npm install && npm run dev

# Frontend
cd frontend && cp .env.example .env && npm install && npm run dev
```
