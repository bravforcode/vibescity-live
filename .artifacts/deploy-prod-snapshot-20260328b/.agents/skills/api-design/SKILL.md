---
name: api-design
description: >
  Expert API design skill for REST, GraphQL, and gRPC. ALWAYS use this skill when the user
  asks to: design an API, create API endpoints, write an OpenAPI/Swagger spec, design REST
  routes, create a GraphQL schema, write API documentation, review API design, handle
  API versioning, set up API authentication/authorization, or structure request/response
  schemas. Also triggers for: "how should I structure this endpoint", "what's the right HTTP
  method for X", "design CRUD for Y", "write API contract", "generate Swagger", or any mention
  of REST best practices, GraphQL mutations/queries, API security, rate limiting design, or
  pagination patterns. Delivers complete, production-ready API specs and implementation code.
---

# API Design Skill

## Design Principles
- **RESTful semantics**: Correct HTTP verbs, status codes, resource naming
- **Contract-first**: OpenAPI spec drives implementation
- **Security by default**: Auth on every protected route, input validation always
- **Developer experience**: Consistent error format, self-documenting responses

---

## REST API Design Rules

### Resource Naming
```
✅ GET    /users                    # list
✅ POST   /users                    # create
✅ GET    /users/:id                # get one
✅ PUT    /users/:id                # full replace
✅ PATCH  /users/:id                # partial update
✅ DELETE /users/:id                # delete

✅ GET    /users/:id/posts          # nested resource
✅ POST   /users/:id/posts

# Actions (when REST verbs don't fit)
✅ POST   /users/:id/activate
✅ POST   /orders/:id/cancel
✅ POST   /payments/:id/refund

❌ /getUser         # never verbs in URLs
❌ /user            # always plural nouns
❌ /Users           # lowercase only
```

### HTTP Status Codes
```
200 OK             → successful GET, PATCH, PUT
201 Created        → successful POST (include Location header)
204 No Content     → successful DELETE
400 Bad Request    → validation error (include field errors)
401 Unauthorized   → not authenticated
403 Forbidden      → authenticated but not authorized
404 Not Found      → resource doesn't exist
409 Conflict       → duplicate / state conflict
422 Unprocessable  → semantic validation failed
429 Too Many Reqs  → rate limit hit
500 Server Error   → unexpected error (never leak stack traces)
```

### Standard Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "age",
        "message": "Must be at least 18"
      }
    ],
    "requestId": "req_abc123",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### Pagination (cursor-based preferred for large datasets)
```json
// Response
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6MTAwfQ==",
    "hasNextPage": true,
    "hasPreviousPage": false,
    "totalCount": 1250
  }
}

// Request
GET /users?cursor=eyJpZCI6MTAwfQ==&limit=20
```

Offset pagination (simpler, for smaller datasets):
```
GET /users?page=2&limit=20
→ { data: [...], meta: { page: 2, limit: 20, total: 450, totalPages: 23 } }
```

---

## OpenAPI 3.1 Spec Template

```yaml
openapi: 3.1.0
info:
  title: My API
  version: 1.0.0
  description: |
    RESTful API for MyApp.
    
    ## Authentication
    Use Bearer token in Authorization header.
    
    ## Rate Limiting
    100 requests/minute per API key. Headers: X-RateLimit-Limit, X-RateLimit-Remaining
  contact:
    email: api@myapp.com

servers:
  - url: https://api.myapp.com/v1
    description: Production
  - url: https://staging-api.myapp.com/v1
    description: Staging
  - url: http://localhost:3000/v1
    description: Development

security:
  - BearerAuth: []

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    User:
      type: object
      required: [id, email, createdAt]
      properties:
        id:
          type: string
          example: "usr_abc123"
        email:
          type: string
          format: email
        name:
          type: string
          nullable: true
        role:
          type: string
          enum: [user, admin]
          default: user
        createdAt:
          type: string
          format: date-time

    CreateUserRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
        name:
          type: string

    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
            message:
              type: string
            details:
              type: array
              items:
                type: object
                properties:
                  field:
                    type: string
                  message:
                    type: string

    PaginatedUsers:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
        pagination:
          type: object
          properties:
            cursor:
              type: string
            hasNextPage:
              type: boolean
            totalCount:
              type: integer

  parameters:
    UserId:
      name: id
      in: path
      required: true
      schema:
        type: string

paths:
  /users:
    get:
      tags: [Users]
      summary: List users
      parameters:
        - name: cursor
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaginatedUsers'
        '401':
          $ref: '#/components/responses/Unauthorized'

    post:
      tags: [Users]
      summary: Create user
      security: []        # public endpoint
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: Created
          headers:
            Location:
              schema:
                type: string
              example: /users/usr_abc123
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          $ref: '#/components/responses/ValidationError'
        '409':
          description: Email already exists

  /users/{id}:
    parameters:
      - $ref: '#/components/parameters/UserId'
    
    get:
      tags: [Users]
      summary: Get user by ID
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          $ref: '#/components/responses/NotFound'

    patch:
      tags: [Users]
      summary: Update user
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

    delete:
      tags: [Users]
      summary: Delete user
      responses:
        '204':
          description: Deleted
        '404':
          $ref: '#/components/responses/NotFound'

  components:
    responses:
      Unauthorized:
        description: Not authenticated
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Error'
      NotFound:
        description: Resource not found
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Error'
      ValidationError:
        description: Validation failed
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Error'
```

---

## API Versioning Strategy

```
# URL versioning (most common, clear)
/api/v1/users
/api/v2/users

# Header versioning
Accept: application/vnd.myapp.v2+json

# Query param (avoid for REST, ok for internal)
/users?api-version=2024-01-01
```

## Authentication Patterns

### JWT Middleware (Express)
```typescript
import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'

export interface AuthRequest extends Request {
  user?: { id: string; role: string }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } })
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: string }
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token expired or invalid' } })
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
    }
    next()
  }
}

// Usage
router.get('/admin/users', authenticate, authorize('admin'), listUsers)
```

### Rate Limiting (Express + Redis)
```typescript
import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 100,
  standardHeaders: true,       // sends X-RateLimit-* headers
  legacyHeaders: false,
  store: new RedisStore({ client: redisClient }),
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 5,                      // max 5 login attempts
  skipSuccessfulRequests: true,
})
```

---

## GraphQL Schema Pattern
→ Read `references/graphql-patterns.md` for full GraphQL schema + resolvers template
