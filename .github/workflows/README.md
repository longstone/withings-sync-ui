# GitHub Actions CI/CD Pipeline

This document explains the CI/CD pipeline setup for the withings-sync project.

## Pipeline Overview

The pipeline consists of 6 jobs that run on push/PR to main and develop branches:

### 1. Test Job
- Runs in parallel for frontend and backend using matrix strategy
- Installs dependencies with `npm ci` for faster installs
- Runs security audit with `npm audit`
- Generates Prisma client for backend
- Executes unit tests using proper npm scripts
- Uploads coverage reports to Codecov (backend only)

### 2. Build Job
- Runs after tests pass
- Builds both frontend and backend applications
- Generates Prisma client and runs migrations
- Uploads build artifacts for use in subsequent jobs

### 3. Docker Job
- Builds and pushes Docker image to GitHub Container Registry
- Runs on push and release events; pushes images for main, release/* branches, and tags
- Uses Docker Buildx with GitHub Actions cache for faster builds
- Tags images with branch name, PR number, and SHA
- Pushes to registry only on main branch

## Required Secrets

Add these secrets to your GitHub repository:

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions
- `CODECOV_TOKEN`: Optional, for coverage report uploads (get from Codecov)

## Environment Variables

- `NODE_VERSION`: Set to '24.x' (can be updated as needed)
- `REGISTRY`: Set to 'ghcr.io' (GitHub Container Registry)
- `DATABASE_URL`: Set to SQLite file path for CI

## Local Development

To test the pipeline locally:

```bash
# Install act for local GitHub Actions testing
brew install act

# Run the workflow linting job
act -j lint-workflows

# Run the test job matrix
act -j test

# Simulate a main push (build + docker + e2e + security)
act push -b main

# Simulate a tag/release build and image push
act release -e <(echo '{"ref":"refs/tags/v1.0.0","repository":{"owner":{"login":"you"},"name":"repo"}}')

# Run the full workflow
act
```

## Customization

### Adding New Steps

1. For new test types, add to the `test` job matrix
2. For new build artifacts, update the `build` job
3. For additional security scans, add to the `security` job

### Modifying Triggers

Change the `on` section at the top of the workflow:

```yaml
on:
  push:
    branches: [main, develop, release/*]
    tags: ['v*', 'release-*']
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
```

### Environment-Specific Behavior

The pipeline uses GitHub environments for deployment:
- `production`: Protected environment for main branch deployments
- Add more environments as needed (staging, dev, etc.)

## Troubleshooting

### Common Issues

1. **Prisma migrations failing**: Ensure DATABASE_URL is properly set
2. **Docker build failures**: Check Dockerfile and context
3. **E2E test timeouts**: Increase health check timeout or add better health endpoints
4. **Cache misses**: Verify cache keys and dependency paths

### Debugging Failed Runs

1. Check the Actions tab in GitHub
2. Download artifacts for detailed logs
3. Use `act` locally to reproduce issues
4. Add debug steps with `run: |` and `set -x`

## Best Practices

1. Keep secrets out of the workflow file
2. Use matrix strategy for parallel jobs
3. Leverage caching for faster builds
4. Upload artifacts for debugging
5. Use environments for deployment protection
6. Regularly update action versions
7. Monitor security scan results
