# The Daily Brief ☕📰

Serverless news notification platform that fetches, formats, and delivers daily news digests via email and SMS. Built end-to-end on AWS — Lambda, DynamoDB, SQS, SES, SNS, EventBridge, S3, and Cognito.

🔗 **Live:** [thedailybrief.click](https://thedailybrief.click)

> **Note:** This is a backend-only repository. The frontend is an Angular application hosted separately via AWS Amplify. If you'd like to connect a frontend, build your own Angular app and configure AWS Amplify with your Cognito User Pool.

---

## Architecture

```
EventBridge (daily schedule)
        │
        ▼
  fetch-users Lambda
  ├── Checks S3 for today's PDF
  ├── If missing → fetches news from NewsData.io → generates PDF → uploads to S3
  ├── Scans all users from DynamoDB
  └── Queues each user to SQS
        │
        ▼
  send-notifications Lambda (SQS trigger)
  ├── Sends email via SES (presigned S3 PDF link)
  ├── Sends SMS via SNS (if phone number exists)
  └── Writes delivery status to DynamoDB emailLog
        │
        ▼ (on failure → DLQ)
  dlq-handler Lambda
  └── Marks failed records in DynamoDB emailLog

User-triggered (via API Gateway):
  ├── email-me Lambda        → on-demand PDF generation + email queue
  ├── save-phone Lambda      → saves phone number to DynamoDB + Cognito
  └── get-failed-logs Lambda → returns failed email records (admin use)

Auth:
  └── Cognito User Pool
        └── post-confirmation Lambda trigger → writes new user to DynamoDB
```

---

## Tech Stack

| Layer | Service |
|---|---|
| Auth | AWS Cognito |
| Compute | AWS Lambda (Node.js ESM) |
| Database | AWS DynamoDB |
| Storage | AWS S3 |
| Messaging | AWS SQS + SNS |
| Email | AWS SES |
| Scheduling | AWS EventBridge |
| API | AWS API Gateway |
| CDN | AWS CloudFront |
| Frontend Hosting | AWS Amplify |

---

## Hosting

The application is hosted entirely on AWS:

- **Frontend** — Angular app deployed via **AWS Amplify**, served through **CloudFront** (CDN) with a custom domain configured via **Route 53**
- **Backend** — All logic runs on **AWS Lambda** (serverless, no servers to manage)
- **API** — Exposed via **AWS API Gateway** with Cognito JWT authorizer
- **Storage** — PDFs stored in **S3**, served via presigned URLs (48hr expiry)
- **Database** — **DynamoDB** for users and email logs

---

## Lambdas

| Lambda | Trigger | Description |
|---|---|---|
| `post-confirmation` | Cognito Post-Confirmation | Writes new user to DynamoDB on signup |
| `save-phone` | API Gateway | Saves phone number to DynamoDB + Cognito |
| `email-me` | API Gateway | Generates PDF, queues email for current user |
| `fetch-users` | EventBridge (daily) | Fetches all users, generates PDF, queues notifications |
| `send-notifications` | SQS | Sends email (SES) + SMS (SNS), logs status |
| `dlq-handler` | SQS Dead Letter Queue | Marks failed notifications in DynamoDB |
| `get-failed-logs` | API Gateway | Returns failed email log records |

---

## Environment Variables

Secrets and config are never hardcoded. Each Lambda reads values from **AWS Lambda Environment Variables** (set via the Lambda Console under Configuration → Environment Variables).

| Variable | Used In | Description |
|---|---|---|
| `NEWS_API_KEY` | `email-me`, `fetch-users` | [NewsData.io](https://newsdata.io) API key |
| `BUCKET_NAME` | `email-me`, `fetch-users` | S3 bucket name for PDF storage |
| `SQS_QUEUE_URL` | `fetch-users` | Full SQS queue URL |
| `COGNITO_USER_POOL_ID` | `save-phone` | Cognito User Pool ID |
| `SES_SENDER_EMAIL` | `send-notifications` | SES verified sender email |

---

## Deploying a Lambda

Each Lambda is deployed independently. Repeat these steps for each one.

**1. Navigate to the Lambda folder**
```bash
cd lambdas/fetch-users
```

**2. Install dependencies**
```bash
npm install
```

**3. Zip the folder contents**
```bash
# Mac / Linux
zip -r fetch-users.zip .

# Windows (PowerShell)
Compress-Archive -Path * -DestinationPath fetch-users.zip
```

> ⚠️ Zip the **contents** of the folder, not the folder itself. `index.mjs` and `node_modules/` must be at the root of the zip.

**4. Upload to AWS Lambda Console**
- Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
- Select your Lambda function
- **Code** tab → **Upload from** → **.zip file**
- Upload your zip → **Save**

**5. Set environment variables**
- **Configuration** tab → **Environment variables**
- Add the required key-value pairs for that Lambda (see table above)

**6. Verify the handler**
- **Configuration** → **General configuration**
- Handler: `index.handler`
- Runtime: `Node.js 18.x` or above

---

## DynamoDB Tables

### `newspaper-users`
| Attribute | Type | Notes |
|---|---|---|
| `userId` | String (PK) | Cognito `sub` |
| `name` | String | |
| `email` | String | |
| `phoneNumber` | String | Optional |
| `createdAt` | String | ISO timestamp |
| `updatedAt` | String | ISO timestamp |

### `newspaper-emailLog`
| Attribute | Type | Notes |
|---|---|---|
| `emailId` | String (PK) | UUID |
| `userId` | String | |
| `email` | String | |
| `phoneNumber` | String | Optional |
| `presignedUrl` | String | S3 presigned URL (48hr expiry) |
| `emailStatus` | String | `Pending` / `Sent` / `Failed` |
| `createdAt` | String | ISO timestamp |

> Create a GSI on `newspaper-emailLog` with partition key `emailStatus`, named `emailStatus-index`. Required by `get-failed-logs`.

---

## Known Limitations

- `fetch-users` uses DynamoDB `Scan` — reads the full table every run. Fine for small user bases; production would use pagination.
- `generatePDF` and `fetchNews` are duplicated across `email-me` and `fetch-users` — a future refactor would extract these into a shared Lambda Layer.
- No rollback if Cognito update fails after DynamoDB write in `save-phone` — a saga pattern would handle this in production.

---

## License

MIT
