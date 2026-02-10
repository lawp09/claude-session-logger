#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# CSL — Smoke Test Post-Deploiement
# Valide que tous les endpoints sont fonctionnels en prod.
# ──────────────────────────────────────────────────────────

CSL_URL="${CSL_URL:-https://csl.philippelawson.net}"
CSL_TOKEN="${CSL_TOKEN:-}"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  ((PASS++))
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  ((FAIL++))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
}

echo -e "${BOLD}CSL Smoke Test${NC}"
echo "URL: ${CSL_URL}"
echo ""

# ── 1. Health check ──────────────────────────────────────
echo -e "${BOLD}[1/4] GET /api/health${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${CSL_URL}/api/health")
if [ "$HTTP_CODE" = "200" ]; then
  pass "/api/health -> 200 OK"
else
  fail "/api/health -> HTTP $HTTP_CODE (attendu 200)"
fi

# ── 2. Ingest (Bearer token) ────────────────────────────
echo -e "${BOLD}[2/4] POST /api/ingest${NC}"
if [ -z "$CSL_TOKEN" ]; then
  warn "CSL_TOKEN non defini — test ingest ignore"
  warn "Definir CSL_TOKEN pour tester l'ingestion"
else
  INGEST_PAYLOAD='{
    "session": {
      "sessionId": "00000000-0000-0000-0000-000000000000",
      "projectPath": "/tmp/smoke-test",
      "projectSlug": "smoke-test",
      "filePath": "/tmp/smoke-test.jsonl"
    },
    "messages": [],
    "fileOffset": 0
  }'

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${CSL_TOKEN}" \
    -d "$INGEST_PAYLOAD" \
    "${CSL_URL}/api/ingest")

  if [ "$HTTP_CODE" = "200" ]; then
    pass "/api/ingest -> 200 OK (Bearer token valide)"
  else
    fail "/api/ingest -> HTTP $HTTP_CODE (attendu 200)"
  fi

  # Test sans token -> doit retourner 401
  HTTP_CODE_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$INGEST_PAYLOAD" \
    "${CSL_URL}/api/ingest")

  if [ "$HTTP_CODE_NOAUTH" = "401" ]; then
    pass "/api/ingest sans token -> 401 Unauthorized"
  else
    fail "/api/ingest sans token -> HTTP $HTTP_CODE_NOAUTH (attendu 401)"
  fi
fi

# ── 3. Sessions list ────────────────────────────────────
echo -e "${BOLD}[3/4] GET /api/sessions${NC}"
SESSIONS_RESPONSE=$(curl -s -w "\n%{http_code}" "${CSL_URL}/api/sessions?limit=1")
SESSIONS_CODE=$(echo "$SESSIONS_RESPONSE" | tail -1)
SESSIONS_BODY=$(echo "$SESSIONS_RESPONSE" | head -n -1)

if [ "$SESSIONS_CODE" = "200" ]; then
  # Verifier que la reponse est du JSON valide
  if echo "$SESSIONS_BODY" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    pass "/api/sessions -> 200 OK (JSON valide)"
  else
    fail "/api/sessions -> 200 mais JSON invalide"
  fi
else
  fail "/api/sessions -> HTTP $SESSIONS_CODE (attendu 200)"
fi

# ── 4. SSE connexion ────────────────────────────────────
echo -e "${BOLD}[4/4] GET /api/sse${NC}"
SSE_OUTPUT=$(timeout 3 curl -s -N \
  -H "Accept: text/event-stream" \
  "${CSL_URL}/api/sse" 2>/dev/null || true)

if echo "$SSE_OUTPUT" | grep -q "connected"; then
  pass "/api/sse -> connexion SSE etablie (: connected recu)"
else
  fail "/api/sse -> pas de message 'connected' recu en 3s"
fi

# ── Resume ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}Resume${NC}"
echo -e "  ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo -e "${RED}Des tests ont echoue.${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}Tous les tests sont passes.${NC}"
exit 0
