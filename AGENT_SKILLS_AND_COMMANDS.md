# 🤖 Antigravity Kit: Agent Skills & Commands Reference

This document provides a comprehensive list of all available **Slash Commands (Workflows)** and **Agent Skills** that the AI can use within this project.

## ⚡ Slash Commands (Workflows)

You can type these commands directly in the prompt to trigger specific, structured workflows:

- `/brainstorm` : Structured brainstorming for projects and features. Explores multiple options before implementation.
- `/create` : Create new application command. Triggers App Builder skill and starts interactive dialogue with the user.
- `/debug` : Debugging command. Activates DEBUG mode for systematic problem investigation.
- `/deploy` : Deployment command for production releases. Analyzes pre-flight checks and executes deployments.
- `/enhance` : Add or update features in an existing application. Used for iterative development.
- `/orchestrate` : Coordinate multiple agents for complex tasks. Use for multi-perspective analysis, comprehensive reviews, or tasks requiring different domain expertise.
- `/plan` : Create a project plan using the `project-planner` agent. (No code writing - only plan file generation).
- `/preview` : Preview server start, stop, and status check. Simplifies local development server management.
- `/status` : Display agent and project status. Progress tracking and status board summary.
- `/test` : Test generation and test running command. Creates and executes tests for code.
- `/ui-ux-pro-max` : A specialized workflow for planning and implementing high-quality UI/UX designs.

---

## 🧠 Available Agent Skills

The AI will automatically route your requests to the appropriate skill using **Intelligent Routing**, but you can also specifically ask the AI to use one of these skills.

### 🏗️ Architecture & Planning
- `architecture`: Architectural decision-making framework, ADR documentation.
- `plan-writing`: Structured task planning with clear breakdowns and dependencies.
- `database-design`: Schema design, indexing strategy, ORM selection, serverless DBs.
- `api-patterns`: API design principles, REST vs GraphQL vs tRPC, pagination.

### 💻 Development & Coding
- `app-builder`: Main application building orchestrator for full-stack apps.
- `clean-code`: Pragmatic coding standards (concise, direct, no over-engineering).
- `frontend-design`: Web UI component design, layouts, color schemes, typography.
- `nextjs-react-expert`: React and Next.js performance optimization, server/client-side.
- `tailwind-patterns`: Tailwind CSS v4 principles, CSS-first config, container queries.
- `mobile-design`: Mobile-first UX/UI for iOS, Android, cross-platform apps.
- `nodejs-best-practices`: Node.js async patterns, security, and architecture.
- `python-patterns`: Python framework selection, async patterns, type hints.
- `rust-pro`: Master Rust 1.75+ with modern async patterns, Tokio, axum.
- `powershell-windows`: PowerShell Windows patterns, pitfall avoidance.
- `bash-linux`: Bash/Linux terminal patterns, piping, error handling.
- `game-development`: Game development orchestration and platform routing.

### 🐞 Testing & Debugging
- `systematic-debugging`: 4-phase systematic debugging and root cause analysis.
- `testing-patterns`: Unit, integration, and mocking strategies.
- `tdd-workflow`: Test-Driven Development workflow principles (RED-GREEN-REFACTOR).
- `webapp-testing`: Web application testing using E2E, Playwright.

### 🚀 Performance & DevOps
- `performance-profiling`: Measurement, analysis, and optimization techniques.
- `deployment-procedures`: Safe deployment workflows, rollback strategies.
- `server-management`: Process management, monitoring, scaling.
- `mcp-builder`: Model Context Protocol server building principles and tool design.

### 🛡️ Security & Auditing
- `vulnerability-scanner`: Advanced vulnerability analysis (OWASP 2025, Supply Chain).
- `red-team-tactics`: Red team tactics based on MITRE ATT&CK.
- `code-review-checklist`: Guidelines covering code quality, security, and best practices.

### 🌍 SEO, Content & Localization
- `seo-fundamentals`: SEO, Core Web Vitals, E-E-A-T, and Google algorithm principles.
- `geo-fundamentals`: Generative Engine Optimization for AI Search (ChatGPT, Perplexity).
- `i18n-localization`: Managing translations, locale files, RTL support.
- `documentation-templates`: README, API docs, code comments, AI-friendly docs.
- `web-design-guidelines`: UI/UX audits against Web Interface Guidelines.

### 🤖 AI Agent Behavior & Orchestration
- `intelligent-routing`: Automatic agent selection based on context.
- `parallel-agents`: Multi-agent orchestration for independent parallel tasks.
- `behavioral-modes`: Context switching (brainstorm, implement, debug, review, teach, ship).
- `brainstorming`: Socratic questioning protocol (MANDATORY for complex requests).

---
*Tip: You don't need to memorize these. Just talk to the AI naturally, and it will load the right tools for the job!*
