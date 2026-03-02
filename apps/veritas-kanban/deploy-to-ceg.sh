#!/usr/bin/env bash
# deploy-to-ceg.sh — Deploy Veritas Kanban to CEG (100.100.101.1)
#
# Run from KILO terminal (not Claude sandbox — needs interactive SSH):
#   bash apps/veritas-kanban/deploy-to-ceg.sh
#
# Prerequisites:
#   - SSH access to CEG (tailscale ssh cegnode1 or ssh ceg)
#   - Docker + Docker Compose installed on CEG
set -euo pipefail

CEG="cegnode1"  # Tailscale hostname — change to IP if needed: 100.100.101.1
REMOTE_DIR="/opt/zuberi/projects/veritas-kanban"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Veritas Kanban — CEG Deployment ==="
echo "Source:  $LOCAL_DIR"
echo "Target:  $CEG:$REMOTE_DIR"
echo ""

# ── Step 1: Create remote directories ──────────────────────────
echo "[1/5] Creating remote directories..."
ssh "$CEG" "sudo mkdir -p $REMOTE_DIR /opt/zuberi/data/kanban && sudo chown -R \$(whoami):\$(whoami) /opt/zuberi"

# ── Step 2: Copy project files ─────────────────────────────────
echo "[2/5] Copying project files to CEG (excluding node_modules, dist, .git)..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='.veritas-kanban' \
  --exclude='tasks/active' \
  --exclude='tasks/archive' \
  "$LOCAL_DIR/" "$CEG:$REMOTE_DIR/"

# ── Step 3: Build and start container ──────────────────────────
echo "[3/5] Building and starting container on CEG..."
ssh "$CEG" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build"

# ── Step 4: Wait for health check ──────────────────────────────
echo "[4/5] Waiting for health check..."
sleep 10
ssh "$CEG" "docker inspect --format='{{.State.Health.Status}}' veritas-kanban"
ssh "$CEG" "curl -sf http://localhost:3001/health && echo ' OK' || echo ' FAILED'"

# ── Step 5: Add UFW rule ───────────────────────────────────────
echo "[5/5] Adding UFW rule for port 3001 (Tailscale only)..."
ssh "$CEG" "sudo ufw allow in on tailscale0 to any port 3001 proto tcp comment 'Veritas Kanban' 2>/dev/null || echo 'UFW rule may already exist'"
ssh "$CEG" "sudo ufw status | grep 3001"

echo ""
echo "=== Deployment complete ==="
echo "Access: http://100.100.101.1:3001"
echo "Admin Key: b10ae899bb62a711a2bcda8fcb44dcbffa92cd117162feee61f73790e143bc7a"
echo "Logs: ssh $CEG 'docker logs -f veritas-kanban'"
