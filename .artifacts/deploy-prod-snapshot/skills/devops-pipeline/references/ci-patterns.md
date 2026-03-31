# CI/CD Platform Patterns

## GitLab CI (.gitlab-ci.yml)
```yaml
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

default:
  image: node:20-alpine
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/

test:
  stage: test
  script:
    - npm ci
    - npm run lint
    - npm test -- --coverage
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker buildx build
        --cache-from $CI_REGISTRY_IMAGE:cache
        --cache-to $CI_REGISTRY_IMAGE:cache,mode=max
        --tag $IMAGE_TAG
        --push .
  only:
    - main
    - develop

deploy:production:
  stage: deploy
  image: bitnami/kubectl:latest
  environment:
    name: production
    url: https://myapp.com
  script:
    - kubectl set image deployment/myapp app=$IMAGE_TAG
    - kubectl rollout status deployment/myapp
  only:
    - main
  when: manual
```

## CircleCI (.circleci/config.yml)
```yaml
version: 2.1

orbs:
  node: circleci/node@5
  docker: circleci/docker@2

executors:
  node-executor:
    docker:
      - image: cimg/node:20.0

jobs:
  test:
    executor: node-executor
    steps:
      - checkout
      - node/install-packages:
          cache-path: ~/project/node_modules
          override-ci-command: npm ci
      - run: npm run lint
      - run: npm test

  build-push:
    machine:
      image: ubuntu-2204:current
    steps:
      - checkout
      - docker/check
      - docker/build:
          image: myorg/myapp
          tag: $CIRCLE_SHA1
      - docker/push:
          image: myorg/myapp
          tag: $CIRCLE_SHA1

workflows:
  ci-cd:
    jobs:
      - test
      - build-push:
          requires:
            - test
          filters:
            branches:
              only: main
```

## Bitbucket Pipelines (bitbucket-pipelines.yml)
```yaml
image: node:20-alpine

definitions:
  caches:
    npm: ~/.npm

pipelines:
  default:
    - step:
        name: Test
        caches:
          - npm
        script:
          - npm ci
          - npm test

  branches:
    main:
      - step:
          name: Test & Build
          caches:
            - npm
            - docker
          services:
            - docker
          script:
            - npm ci && npm test
            - docker build -t myapp:$BITBUCKET_COMMIT .
            - docker push myapp:$BITBUCKET_COMMIT
```

## Monorepo Pipeline Strategy (GitHub Actions)
```yaml
# Detect changed services and run only relevant pipelines
name: Monorepo CI

on:
  push:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.changed.outputs.services }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - id: changed
        run: |
          SERVICES=$(git diff --name-only HEAD~1 HEAD \
            | grep -oP '^apps/\K[^/]+' | sort -u \
            | jq -R -s -c 'split("\n")[:-1]')
          echo "services=$SERVICES" >> $GITHUB_OUTPUT

  build-matrix:
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.services != '[]' }}
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build ${{ matrix.service }}
        run: |
          cd apps/${{ matrix.service }}
          docker build -t myapp/${{ matrix.service }}:${{ github.sha }} .
```

## Secret Scanning (add to any pipeline)
```yaml
# GitHub Actions - Gitleaks
- name: Scan for secrets
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# Trivy vulnerability scan
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE_TAG }}
    format: sarif
    output: trivy-results.sarif
    severity: CRITICAL,HIGH
    exit-code: '1'
```
