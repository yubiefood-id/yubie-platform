#!/usr/bin/env bash
set -euo pipefail

echo "Restore test checklist:"
echo "  1. Restore latest Zammad Postgres dump to isolated instance"
echo "  2. Restore storage volume snapshot"
echo "  3. Run verify.sh against restored instance"
echo "  4. Confirm ticket search and article read work"
echo "  5. Do NOT point production Meta WhatsApp until sign-off"
