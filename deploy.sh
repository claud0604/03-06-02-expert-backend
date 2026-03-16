#!/bin/bash
# ============================================
# APL COLOR Expert Backend - Auto Deploy Script
# Google Compute Engine (GCE) Deployment
# ============================================

set -e

PROJECT="gen-lang-client-0436219796"
INSTANCE="apl-backend-server"
ZONE="asia-northeast3-a"
APP_DIR="/home/kimvstiger/apps/expert-backend"
PM2_NAME="expert-backend"

echo "=== APL Expert Backend Deploy ==="
echo "Instance: $INSTANCE ($ZONE)"
echo ""

# Deploy to GCE via SSH
echo "[1/4] Connecting to GCE instance..."
gcloud compute ssh $INSTANCE --zone=$ZONE --project=$PROJECT --command="
  echo '[2/4] Pulling latest code...'
  cd $APP_DIR && git pull origin main

  echo '[3/4] Installing dependencies...'
  npm install --production

  echo '[4/4] Restarting PM2 process...'
  pm2 restart $PM2_NAME

  echo ''
  echo '=== Deploy Complete ==='
  pm2 show $PM2_NAME | head -20
"
