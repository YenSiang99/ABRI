#!/bin/bash
cd "$(dirname "$0")"

# Always kill the server on exit, even if a step below fails/crashes —
# otherwise a stale process keeps squatting port 4000, silently serving
# every future run with whatever env vars/code it booted with.
trap 'pkill -f "node src/index.js" 2>/dev/null' EXIT

pkill -f "node src/index.js" 2>/dev/null
sleep 0.5
(node src/index.js > /tmp/abri.log 2>&1 &)
sleep 1

echo "--- register a fresh admin account (harmless 409 if it already exists) ---"
curl -s -X POST http://localhost:4000/auth/register -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"password123","name":"Admin","phone":"010-000 0000","role":"Admin"}'
echo
echo

echo "=== TEST A: two competing manual claims on novatech-consulting ==="
curl -s -X POST http://localhost:4000/businesses/claim -H "Content-Type: application/json" -d '{"businessId":"novatech-consulting","businessName":"NovaTech Consulting","category":"IT Consulting","location":"Shah Alam","repName":"Impostor One","repEmail":"impostor1@gmail.com","repPhone":"010-000 0001","repRole":"Owner","password":"password123"}'
echo
curl -s -X POST http://localhost:4000/businesses/claim -H "Content-Type: application/json" -d '{"businessId":"novatech-consulting","businessName":"NovaTech Consulting","category":"IT Consulting","location":"Shah Alam","repName":"Real Owner","repEmail":"realowner2@gmail.com","repPhone":"010-000 0002","repRole":"Owner","password":"password123"}'
echo

echo "--- log in as admin (admin@example.com) ---"
curl -s -c /tmp/admin.txt -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"password123"}'
echo

echo "--- GET /admin/claims (should show both pending) ---"
curl -s -b /tmp/admin.txt http://localhost:4000/admin/claims
echo

WINNER_ID=$(curl -s -b /tmp/admin.txt "http://localhost:4000/admin/claims" | node -e "process.stdin.on('data',d=>{const c=JSON.parse(d).claims.find(x=>x.email==='realowner2@gmail.com');console.log(c.id)})")

echo "--- admin approves the real owner ($WINNER_ID) ---"
curl -s -b /tmp/admin.txt -X POST http://localhost:4000/admin/claims/$WINNER_ID/approve
echo

echo "--- claims list now (impostor should be gone) ---"
curl -s -b /tmp/admin.txt http://localhost:4000/admin/claims
echo
echo

echo "=== TEST B: domain-match arrives after an impostor's manual claim on puchong-tax-advisory ==="
curl -s -X POST http://localhost:4000/businesses/claim -H "Content-Type: application/json" -d '{"businessId":"puchong-tax-advisory","businessName":"Puchong Tax Advisory","category":"Accounting & Tax","location":"Puchong","repName":"Impostor Two","repEmail":"impostor2@gmail.com","repPhone":"010-000 0003","repRole":"Owner","password":"password123"}'
echo

CLAIM2=$(curl -s -X POST http://localhost:4000/businesses/claim -H "Content-Type: application/json" -d '{"businessId":"puchong-tax-advisory","businessName":"Puchong Tax Advisory","category":"Accounting & Tax","location":"Puchong","repName":"Real Owner Two","repEmail":"owner@puchongtaxadvisory.my","repPhone":"010-000 0004","repRole":"Owner","password":"password123"}')
echo "$CLAIM2"
TOKEN2=$(echo "$CLAIM2" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

echo "--- consuming the domain-verified claimant's token (should win + evict the impostor) ---"
curl -s -X POST http://localhost:4000/auth/verify-claim/$TOKEN2
echo

echo "--- claims list (impostor2 should be gone too) ---"
curl -s -b /tmp/admin.txt http://localhost:4000/admin/claims
echo
echo

echo "=== TEST C: SSM verify/revoke on meridian-accounting ==="
curl -s -b /tmp/admin.txt -X POST http://localhost:4000/admin/businesses/meridian-accounting/verify-ssm
echo
curl -s -b /tmp/admin.txt -X POST http://localhost:4000/admin/businesses/meridian-accounting/revoke-ssm
echo

echo "--- server log ---"
cat /tmp/abri.log
