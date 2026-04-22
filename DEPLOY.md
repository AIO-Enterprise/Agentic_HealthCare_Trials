# Deployment Guide — AIO Health Care Agentic

Live URL: **https://d2s8k22yb5c8me.cloudfront.net**
CloudFront URL: **https://d2s8k22yb5c8me.cloudfront.net**
AWS Region: `us-east-1`
Account ID: `809411919411`

---

## Prerequisites

- Docker Desktop must be **running** before any deploy (check taskbar icon)
- AWS CLI configured (`aws sts get-caller-identity` should return account `809411919411`)

---

## Current Deployed Versions

| Service | Image | Task Definition |
|---|---|---|
| Backend | `backend:v10` | `agentic-healthcare-backend:22` |
| Frontend | `frontend:v12` | `agentic-healthcare-frontend:9` |

---

## Full Redeploy (frontend + backend)

Run these commands in order from the project root (`d:/AIO/Marketing AI/Health_Care_Agentic`):

### 1. ECR Login
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 809411919411.dkr.ecr.us-east-1.amazonaws.com
```

### 2. Build Images
Increment the version tag (e.g. `v10` → `v11`) each deploy. Build backend from repo root (skills/ templates are in context).

```bash
# Backend (context = repo root)
docker build -f backend/Dockerfile -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:vNN .

# Frontend (context = frontend/)
docker build -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:vNN ./frontend
```

### 3. Push to ECR
```bash
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:vNN
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:vNN
```

### 4. Update task-def.json and Register Task Definitions
Update the `image` field in `task-def.json` to the new backend tag, then:

```bash
# Backend (reads task-def.json)
aws ecs register-task-definition --cli-input-json file://task-def.json --region us-east-1

# Frontend (inline JSON — update image tag)
aws ecs register-task-definition \
  --family agentic-healthcare-frontend \
  --task-role-arn "arn:aws:iam::809411919411:role/agentic-healthcare-task-role" \
  --execution-role-arn "arn:aws:iam::809411919411:role/agentic-healthcare-task-role" \
  --network-mode awsvpc --requires-compatibilities FARGATE \
  --cpu "512" --memory "1024" \
  --container-definitions '[{"name":"frontend","image":"809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:vNN","portMappings":[{"containerPort":80,"protocol":"tcp"}],"essential":true,"environment":[{"name":"VITE_API_URL","value":"/api"}],"logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/agentic-healthcare-frontend","awslogs-create-group":"true","awslogs-region":"us-east-1","awslogs-stream-prefix":"ecs"}}}]' \
  --region us-east-1
```

### 5. Deploy
Replace `:NN` with the revision number returned in step 4.

```bash
aws ecs update-service --cluster agentic-healthcare-cluster --service backend-service \
  --task-definition agentic-healthcare-backend:NN --force-new-deployment --region us-east-1

aws ecs update-service --cluster agentic-healthcare-cluster --service frontend-service \
  --task-definition agentic-healthcare-frontend:NN --force-new-deployment --region us-east-1
```

### 6. Wait for Stable
```bash
aws ecs wait services-stable --cluster agentic-healthcare-cluster \
  --services backend-service frontend-service --region us-east-1
```

---

## Env-Only Redeploy (Secrets Manager change, no code change)

ECS pulls fresh secrets on every new task launch. No image rebuild needed.

```bash
aws ecs update-service --cluster agentic-healthcare-cluster --service backend-service \
  --force-new-deployment --region us-east-1

aws ecs wait services-stable --cluster agentic-healthcare-cluster \
  --services backend-service --region us-east-1
```

---

## Backend-Only Deploy

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 809411919411.dkr.ecr.us-east-1.amazonaws.com

docker build -f backend/Dockerfile -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:vNN .
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend:vNN

# Update task-def.json image tag, then:
aws ecs register-task-definition --cli-input-json file://task-def.json --region us-east-1
aws ecs update-service --cluster agentic-healthcare-cluster --service backend-service \
  --task-definition agentic-healthcare-backend:NN --force-new-deployment --region us-east-1
```

## Frontend-Only Deploy

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 809411919411.dkr.ecr.us-east-1.amazonaws.com

docker build -t 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:vNN ./frontend
docker push 809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:vNN

aws ecs register-task-definition \
  --family agentic-healthcare-frontend \
  --task-role-arn "arn:aws:iam::809411919411:role/agentic-healthcare-task-role" \
  --execution-role-arn "arn:aws:iam::809411919411:role/agentic-healthcare-task-role" \
  --network-mode awsvpc --requires-compatibilities FARGATE \
  --cpu "512" --memory "1024" \
  --container-definitions '[{"name":"frontend","image":"809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend:vNN","portMappings":[{"containerPort":80,"protocol":"tcp"}],"essential":true,"environment":[{"name":"VITE_API_URL","value":"/api"}],"logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/agentic-healthcare-frontend","awslogs-create-group":"true","awslogs-region":"us-east-1","awslogs-stream-prefix":"ecs"}}}]' \
  --region us-east-1

aws ecs update-service --cluster agentic-healthcare-cluster --service frontend-service \
  --task-definition agentic-healthcare-frontend:NN --force-new-deployment --region us-east-1
```

---

## Checking Logs

```bash
# Backend logs (live tail)
aws logs tail /ecs/agentic-healthcare-backend --follow --region us-east-1

# Frontend logs
aws logs tail /ecs/agentic-healthcare-frontend --follow --region us-east-1
```

---

## AWS Resource Reference

| Resource | Name / Value |
|---|---|
| ECS Cluster | `agentic-healthcare-cluster` |
| Backend Service | `backend-service` |
| Frontend Service | `frontend-service` |
| Backend ECR | `809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/backend` |
| Frontend ECR | `809411919411.dkr.ecr.us-east-1.amazonaws.com/agentic_healthcare/frontend` |
| Task Role | `arn:aws:iam::809411919411:role/agentic-healthcare-task-role` |
| Secrets Manager | `healthcare/prod/app-JcG6Qx` |
| EFS Filesystem | `fs-0659fc740beab1a68` |
| S3 Upload Bucket | `agentic-healthcare-uploads-809411919411-us-east-1-an` |
| Backend Log Group | `/ecs/agentic-healthcare-backend` |
| Frontend Log Group | `/ecs/agentic-healthcare-frontend` |
| ALB | `agentic-healthcare-alb` |
| ALB Subnets | `subnet-0c2744272d4343731` (us-east-1a), `subnet-0fe1d9f094a74f687` (us-east-1b) |

## EFS Access Points (Backend)

| Volume | Access Point | Container Path |
|---|---|---|
| `efs-uploads` | `fsap-0551a0032cdc4be17` | `/app/uploads` |
| `efs-outputs` | `fsap-06cba660d7961b136` | `/app/outputs` |
| `efs-static-logos` | `fsap-0030e2dc9bdc63e4f` | `/app/static/logos` |
| `efs-db` | `fsap-06ee9a3140ae7369a` | `/db` |

## Secrets Injected into Backend Container

| Secret Key (in Secrets Manager) | Env Var |
|---|---|
| `SECRET_KEY` | `SECRET_KEY` |
| `ELEVENLABS_API_KEY` | `ELEVENLABS_API_KEY` |
| `AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_API_KEY` |
| `AZURE_OPENAI_ENDPOINT` | `AZURE_OPENAI_ENDPOINT` |

---

## Image Version History

| Image | Notes |
|---|---|
| `backend:v1–v4` | Initial builds |
| `backend:v5` | EFS storage, async training, DB pool tuning, doc upload fixes |
| `backend:v6` | S3 pre-signed URL support for document uploads |
| `backend:v7` | Explicit SigV4 signing for S3 pre-signed URLs |
| `backend:v8` | Background tasks for all LLM endpoints — fixes CloudFront 504 on strategy gen |
| `backend:v9` | Added `/api/company` to onboarding security allowlist — fixes location save 403 |
| `backend:v10` | Env/secrets update redeploy |
| `frontend:v8` | S3 pre-signed upload with direct multipart fallback |
| `frontend:v9` | Auto-fallback on S3 403 (IAM AccessDenied) |
| `frontend:v10` | HTTP polling for creative/website/review background tasks |
| `frontend:v11` | Onboarding retry logic — per-step completion flags, no data loss on retry |
| `frontend:v12` | Env update redeploy |

---

## Troubleshooting

### Changes not showing up after deploy
1. Hard refresh: `Ctrl + Shift + R`
2. Check rollout status:
   ```bash
   aws ecs describe-services --cluster agentic-healthcare-cluster \
     --services frontend-service backend-service --region us-east-1 \
     --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,rollout:deployments[0].rolloutState}"
   ```

### Task fails to start (ECS events)
```bash
aws ecs describe-services --cluster agentic-healthcare-cluster \
  --services backend-service --region us-east-1 \
  --query 'services[0].events[:5]'
```

### "Target is in an Availability Zone not enabled for the load balancer"
Restrict subnets to ALB-aligned ones:
```bash
aws ecs update-service \
  --cluster agentic-healthcare-cluster --service backend-service \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-0c2744272d4343731,subnet-0fe1d9f094a74f687],securityGroups=<keep existing>,assignPublicIp=ENABLED}" \
  --force-new-deployment --region us-east-1
```

### S3 upload 403 AccessDenied
The task role's inline IAM policy may be blocked by a permission boundary. Add a **bucket policy** on `agentic-healthcare-uploads-*` granting the task role `s3:PutObject/GetObject/DeleteObject`. Resource-based bucket policies bypass permission boundaries.

### Docker Desktop not running
Error: `failed to connect to docker API`. Open Docker Desktop and wait for "Engine running" in the taskbar.
