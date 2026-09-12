-- Migration: Add drone_flying_zone column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS drone_flying_zone TEXT;
