-- VibeCity Memory Service — pgvector setup
-- Run this ONCE in Supabase SQL Editor before enabling memory service.
--
-- This enables the vector extension needed by mem0 for semantic search.
-- mem0 will create its own tables automatically — do NOT pre-create them.

CREATE EXTENSION IF NOT EXISTS vector;
