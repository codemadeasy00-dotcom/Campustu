-- Migration: Lost & Found System
CREATE TYPE item_status AS ENUM ('lost', 'found', 'claimed', 'returned');

CREATE TABLE lost_found_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id INT REFERENCES colleges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    status item_status NOT NULL DEFAULT 'lost',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_name VARCHAR(255) NOT NULL, -- e.g., "Central Library 2nd Floor"
    security_question VARCHAR(255),       -- For 3A verification
    security_answer_hash VARCHAR(255),    -- Hashed answer for verification
    dropoff_location VARCHAR(255),        -- For 3B campus security spot
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE lost_found_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES lost_found_items(id) ON DELETE CASCADE,
    storage_key VARCHAR(500) NOT NULL,
    position INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE item_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES lost_found_items(id) ON DELETE CASCADE,
    claimant_id UUID REFERENCES users(id) ON DELETE CASCADE,
    answer_attempt VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    handover_pass_code VARCHAR(50),     -- Unique QR/Pass code for 3B
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_lost_found_college ON lost_found_items(college_id, status);
CREATE INDEX idx_claims_item ON item_claims(item_id);