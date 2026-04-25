# Production & Deployment Guide

This document outlines how to deploy the Voice Call Bot to an Ubuntu VPS (e.g., DigitalOcean, AWS EC2, Hetzner).

## 1. Prerequisites
- Ubuntu 22.04 / 24.04 server.
- Domain name pointed to the server's IP address (A Record).
- Docker and Docker Compose installed.

## 2. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose plugin
sudo apt-get install docker-compose-plugin -y
```

## 3. Application Deployment

Clone the repository to `/opt/voicebot`:

```bash
cd /opt
git clone <your-repo-url> voicebot
cd voicebot
```

Create and configure your `.env` file:
```bash
cp .env.example .env
nano .env
```
Ensure `TWILIO_WEBHOOK_BASE_URL` is set to `https://your-domain.com`.

## 4. Starting the Cluster

```bash
docker-compose -f docker-compose.yml up --build -d
```

## 5. Nginx & Let's Encrypt (SSL)

To expose the application securely over HTTPS, we use Nginx on the host machine (or a container) and Certbot.

```bash
sudo apt install nginx certbot python3-certbot-nginx -y

# Copy our nginx config to the system
sudo cp nginx/nginx.conf /etc/nginx/sites-available/voicebot.conf
sudo ln -s /etc/nginx/sites-available/voicebot.conf /etc/nginx/sites-enabled/

# Remove default nginx config
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Obtain SSL Certificate
sudo certbot --nginx -d your-domain.com
```

## 6. Security Hardening

- **Firewall Setup (UFW):**
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- **Twilio Webhook Verification:** 
  In a production setup, ensure that the middleware validates the `X-Twilio-Signature` header to guarantee that incoming requests are actually from Twilio, preventing attackers from falsifying DTMF inputs or call statuses.

## 7. Monitoring Strategy

- **Application Logs**: View via `docker logs voicebot_api_1 -f`.
- **Worker Logs**: View Celery tasks via `docker logs voicebot_celery_worker_1 -f`.
- **Database Backups**: Set up a cron job to run `pg_dump` daily and upload it to an S3 bucket.
- **Sentry/Datadog**: For a real startup, integrate Sentry SDK into FastAPI for real-time error tracking and Datadog for APM metrics.