-- Create participants table
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY, -- their actual ID (0001, etc)
  name TEXT NOT NULL,
  department TEXT,
  category TEXT,
  status TEXT DEFAULT 'Active', -- 'Active', 'Winner'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create prizes table
CREATE TABLE IF NOT EXISTS prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  total_amount INTEGER DEFAULT 1,
  drawn_amount INTEGER DEFAULT 0,
  draw_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Ready', -- 'Ready', 'Completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create draw_logs table
CREATE TABLE IF NOT EXISTS draw_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID REFERENCES prizes(id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,
  operator TEXT DEFAULT 'Admin',
  drawn_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert some dummy prizes for testing
INSERT INTO prizes (name, description, total_amount, draw_order) VALUES 
('รางวัลที่ 1: MacBook Pro', 'M2 Chip, 16GB RAM', 1, 1),
('รางวัลที่ 2: iPad Pro', '11 inch, 256GB', 3, 2),
('รางวัลที่ 3: AirPods Pro', 'Gen 2', 5, 3);
