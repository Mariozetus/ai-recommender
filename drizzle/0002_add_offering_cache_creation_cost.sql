-- drizzle/0002_add_offering_cache_creation_cost.sql
-- Añade cache_creation_cost a model_provider_offering para capturar el coste
-- de crear cache de prompts (disponible en LiteLLM y otros providers).

PRAGMA foreign_keys = ON;

ALTER TABLE model_provider_offering
  ADD COLUMN cache_creation_cost_per_million_usd REAL;
