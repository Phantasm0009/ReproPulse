# RepoPulse - PR Health & Security Scoring

A comprehensive GitHub App that posts PR Check Runs with overall Health & Security scores (0–100) and provides one-click fixes via Check Run action buttons.

## 🌟 Features

### Core Functionality
- **Automated PR Analysis**: Every pull request triggers comprehensive security analysis
- **Health Score (0-100)**: Weighted scoring across 4 security categories
- **GitHub Check Runs**: Results posted directly to PRs with detailed findings
- **One-Click Fixes**: Apply automated fixes via Check Run action buttons
- **Industry Benchmarks**: Compare your score against thousands of repositories

### Analysis Modules

#### 1. Workflow Security Scanner (0-40 points)
- `pull_request_target` misuse detection
- Unpinned action versions
- Excessive workflow permissions
- Secrets exposure in logs
- Self-hosted runner risks
- Script injection vulnerabilities
- Unsafe `GITHUB_ENV` usage
- Workflow dispatch abuse
- Third-party action trust analysis

#### 2. Supply Chain Scanner (0-30 points)
- Dependency diff analysis (PR vs base)
- SBOM parsing and validation
- Typosquatting detection (Levenshtein distance)
- Known vulnerability checking
- License compatibility analysis
- New dependency risk assessment

#### 3. Maintainability Scanner (0-20 points)
- CI presence verification
- Documentation completeness
- Release cadence tracking
- Issue responsiveness metrics
- SECURITY.md presence
- Code ownership (CODEOWNERS)

#### 4. Attack Pattern Scanner (0-10 points)
- Obfuscated code detection
- Minified code spike detection
- Suspicious file renames
- Build script modifications
- Install script changes
- Permission escalation attempts
- Commit verification shifts

### Team Features
- **Policy Engine**: Configure rules to block, warn, or ignore findings
- **Security Champions**: Assign team members for critical finding notifications
- **Slack/Discord Integration**: Real-time alerts for security events
- **PR Comments**: Detailed finding breakdowns in pull requests

## 📁 Repository Structure

```
repopulse/
├── prisma/
│   └── schema.prisma          # Database schema (PostgreSQL)
├── src/
│   ├── config/
│   │   ├── env.ts             # Environment configuration
│   │   ├── logger.ts          # Winston logger setup
│   │   └── index.ts
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client
│   │   ├── redis.ts           # Redis client
│   │   ├── github.ts          # Octokit wrapper
│   │   └── index.ts
│   ├── analysis/
│   │   ├── workflow-security.ts    # Workflow scanner
│   │   ├── supply-chain.ts         # Supply chain scanner
│   │   ├── maintainability.ts      # Maintainability scanner
│   │   ├── attack-patterns.ts      # Attack pattern scanner
│   │   └── index.ts
│   ├── scoring/
│   │   ├── engine.ts          # Score calculation & benchmarks
│   │   └── index.ts
│   ├── worker/
│   │   ├── queue.ts           # BullMQ queue setup
│   │   ├── processors/
│   │   │   ├── analysis.ts    # Analysis job processor
│   │   │   ├── fixes.ts       # Fix job processor
│   │   │   ├── notifications.ts   # Notification processor
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── webhooks/
│   │   ├── handlers.ts        # GitHub webhook handlers
│   │   └── index.ts
│   ├── services/
│   │   ├── policy-engine.ts   # Policy enforcement
│   │   ├── pr-comments.ts     # PR comment generation
│   │   └── index.ts
│   ├── routes/
│   │   ├── api.ts             # REST API routes
│   │   ├── auth.ts            # OAuth routes
│   │   └── index.ts
│   └── index.ts               # Main server entry
├── web/                       # Next.js dashboard
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                    # Landing page
│   │   │   ├── layout.tsx                  # Root layout
│   │   │   ├── providers.tsx               # React Query + Theme
│   │   │   ├── globals.css                 # Tailwind styles
│   │   │   └── dashboard/
│   │   │       ├── page.tsx                # Overview
│   │   │       ├── repositories/
│   │   │       │   ├── page.tsx            # Repo list
│   │   │       │   └── [id]/page.tsx       # Repo detail
│   │   │       ├── findings/page.tsx       # Findings backlog
│   │   │       ├── fixes/page.tsx          # Fix history
│   │   │       ├── benchmarks/page.tsx     # Benchmark visualization
│   │   │       ├── policies/page.tsx       # Policy editor
│   │   │       ├── notifications/page.tsx  # Notification settings
│   │   │       └── team/page.tsx           # Team management
│   │   ├── components/
│   │   │   ├── ui/                         # Radix UI components
│   │   │   ├── layout.tsx                  # Dashboard layout
│   │   │   ├── score-gauge.tsx             # Score visualization
│   │   │   ├── findings.tsx                # Finding components
│   │   │   └── charts.tsx                  # Recharts wrappers
│   │   └── lib/
│   │       ├── api.ts                      # API client
│   │       └── utils.ts                    # Utility functions
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── next.config.js
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## 🔧 Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/repopulse

# Redis
REDIS_URL=redis://localhost:6379

# GitHub App
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Application
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
JWT_SECRET=your-jwt-secret

# Slack (optional)
SLACK_BOT_TOKEN=xoxb-...

# Discord (optional)
DISCORD_BOT_TOKEN=...
```

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- pnpm (recommended) or npm

### Backend Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Set up database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

### Frontend Setup

```bash
cd web

# Install dependencies
npm install

# Set environment
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local

# Start development server
npm run dev
```

### Database Migrations

```bash
# Create a migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset
```

## 🏗️ Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://repopulse:password@db:5432/repopulse
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  worker:
    build: .
    command: npm run worker
    environment:
      - DATABASE_URL=postgresql://repopulse:password@db:5432/repopulse
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  web:
    build: ./web
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001

  db:
    image: postgres:14
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=repopulse
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=repopulse

  redis:
    image: redis:6-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### Production Deployment

1. **Database**: Use managed PostgreSQL (Neon recommended, or Supabase, AWS RDS)
2. **Redis**: Use managed Redis (Upstash recommended, or Redis Cloud)
3. **Backend**: Deploy to Railway, Render, Fly.io, or AWS ECS
4. **Frontend**: Deploy to Vercel, Netlify, or Cloudflare Pages
5. **Workers**: Run as separate process or use serverless functions

### Free Tier Recommendations

#### PostgreSQL - Neon (Recommended)
[Neon](https://neon.tech) offers a generous free tier:
- 0.5 GB storage
- Serverless (scales to zero)
- Branching for dev/preview environments

```env
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/repopulse?sslmode=require
```

#### Redis - Upstash (Recommended)
[Upstash](https://upstash.com) offers serverless Redis:
- 10,000 commands/day free
- 256MB storage
- REST API + Redis protocol
- Works great with BullMQ

```env
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379
```

**Alternative**: [Redis Cloud](https://redis.com/try-free/) offers 30MB free tier with standard Redis protocol.

## 🔐 GitHub App Setup

### 1. Create GitHub App

Go to GitHub Settings > Developer Settings > GitHub Apps > New GitHub App

**Basic Information:**
- App name: RepoPulse
- Homepage URL: Your app URL
- Webhook URL: `https://your-api-url/webhooks/github`
- Webhook secret: Generate a secure secret - 3f0be8834a9343c2d3b2078e342ec9cd70393513988d1d93eb72045e573679ab

### 2. Required Permissions

**Repository Permissions:**
| Permission | Access |
|------------|--------|
| Actions | Read |
| Checks | Read & Write |
| Contents | Read & Write |
| Issues | Read & Write |
| Metadata | Read |
| Pull requests | Read & Write |
| Workflows | Read |

**Organization Permissions:**
| Permission | Access |
|------------|--------|
| Members | Read |

### 3. Subscribe to Events

- Check run
- Check suite
- Installation
- Installation repositories
- Pull request
- Push

### 4. Generate Private Key

Download the private key and add it to your `.env` file.

### 5. Install on Repositories

Install the app on your organization or specific repositories.

## 📊 API Reference

### Authentication

```
GET /auth/github          # Initiate OAuth flow
GET /auth/github/callback # OAuth callback
POST /api/auth/logout     # Logout
GET /api/auth/me          # Get current user
```

### Installations

```
GET /api/installations              # List installations
GET /api/installations/:id          # Get installation
GET /api/installations/:id/stats    # Get dashboard stats
```

### Repositories

```
GET /api/installations/:id/repositories  # List repos
GET /api/repositories/:id                # Get repo
POST /api/repositories/:id/analyze       # Trigger analysis
```

### Analyses

```
GET /api/repositories/:id/analyses  # List analyses
GET /api/analyses/:id               # Get analysis
```

### Findings

```
GET /api/repositories/:id/findings  # List findings
PATCH /api/findings/:id             # Update finding
POST /api/findings/:id/fix          # Trigger fix
```

### Policies

```
GET /api/installations/:id/policies    # List policies
POST /api/installations/:id/policies   # Create policy
PATCH /api/policies/:id                # Update policy
DELETE /api/policies/:id               # Delete policy
```

### Notifications

```
GET /api/installations/:id/notifications    # List configs
POST /api/installations/:id/notifications   # Create config
PATCH /api/notifications/:id                # Update config
DELETE /api/notifications/:id               # Delete config
```

### Security Champions

```
GET /api/installations/:id/champions    # List champions
POST /api/installations/:id/champions   # Add champion
DELETE /api/champions/:id               # Remove champion
```

### Benchmarks

```
GET /api/benchmarks  # Get benchmark data
```

## 🎯 Scoring Breakdown

| Category | Max Points | Weight |
|----------|------------|--------|
| Workflow Security | 40 | 40% |
| Supply Chain | 30 | 30% |
| Maintainability | 20 | 20% |
| Hygiene | 10 | 10% |

**PR-Introduced Findings:** Findings introduced in the current PR are weighted 2.5x more heavily than existing issues.

**Score Ranges:**
- 90-100: Excellent (Green)
- 75-89: Good (Light Green)
- 50-74: Moderate (Yellow)
- 25-49: Poor (Orange)
- 0-24: Critical (Red)

## 🔧 One-Click Fixes

Available fix types:

| Fix Type | Description |
|----------|-------------|
| `pin_actions` | Pins GitHub Actions to full SHA |
| `add_permissions` | Adds explicit permissions to workflows |
| `open_issue` | Creates a tracking issue for the finding |

Fixes are applied via:
1. Check Run action buttons
2. Dashboard "Fix" buttons
3. API endpoint

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 🆘 Support

- [GitHub Issues](https://github.com/repopulse/repopulse/issues)
- [Discord Community](https://discord.gg/repopulse)
- [Documentation](https://docs.repopulse.dev)
