-- ============================================================
-- Meeting Action Board V2 - Complete Database Schema
-- Run this once in Neon SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- WORKSPACES
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin', 'pm', 'member')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, username)
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  project_name VARCHAR(255),
  contact_person VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  industry VARCHAR(100),
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROJECTS (belong to client)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'archived')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MEETINGS (belong to project)
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  attendees TEXT,
  venue VARCHAR(255),
  duration VARCHAR(100),
  objective TEXT,
  discussion_points TEXT,
  ai_summary TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MEETING ATTACHMENTS
CREATE TABLE IF NOT EXISTS meeting_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACTION ITEMS (belong to meeting)
CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id),
  assigned_to_name VARCHAR(255),
  due_date DATE,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'delayed')),
  tracker_item_id UUID,
  is_tracked BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRACKER ITEMS (belong to project, optionally linked to action item)
CREATE TABLE IF NOT EXISTS tracker_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action_item_id UUID REFERENCES action_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  classification VARCHAR(30) NOT NULL DEFAULT 'issue' CHECK (classification IN ('issue', 'new_requirement', 'change_request', 'tbd')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'closed')),
  raised_date DATE,
  dev_start_date DATE,
  deployed_date DATE,
  raised_by VARCHAR(255),
  remarks TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from action_items to tracker_items (after both tables exist)
ALTER TABLE action_items
  ADD CONSTRAINT fk_action_tracker
  FOREIGN KEY (tracker_item_id) REFERENCES tracker_items(id) ON DELETE SET NULL;

-- SHARING (tracker items can be shared with unique access)
CREATE TABLE IF NOT EXISTS tracker_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_item_id UUID REFERENCES tracker_items(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  share_token VARCHAR(100) UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, shared_with_user_id)
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('action_assigned', 'status_changed', 'due_soon', 'overdue', 'meeting_created', 'tracker_updated')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link_type VARCHAR(30),
  link_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'archive', 'restore', 'login', 'logout')),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  entity_name VARCHAR(255),
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON meetings(client_id);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_project ON action_items(project_id);
CREATE INDEX IF NOT EXISTS idx_action_items_assigned ON action_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tracker_project ON tracker_items(project_id);
CREATE INDEX IF NOT EXISTS idx_tracker_client ON tracker_items(client_id);
CREATE INDEX IF NOT EXISTS idx_tracker_action ON tracker_items(action_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
