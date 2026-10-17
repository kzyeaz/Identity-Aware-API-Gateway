CREATE TABLE projects (
    id UUID PRIMARY KEY,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(280) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX projects_owner_created_idx ON projects (owner, created_at DESC);
