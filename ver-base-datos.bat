@echo off
REM ============================================================
REM  KIDS2026 - Abre Prisma Studio para ver/editar la base local
REM  (requiere Postgres corriendo: docker compose -f infra/docker/docker-compose.yml up -d)
REM  Se abre en http://localhost:5555
REM ============================================================
cd /d "%~dp0"
echo Abriendo Prisma Studio en http://localhost:5555 ...
start "" http://localhost:5555
pnpm exec prisma studio --port 5555
pause
