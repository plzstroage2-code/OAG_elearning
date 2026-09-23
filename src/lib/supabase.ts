import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_LUCKYDRAW_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_LUCKYDRAW_SUPABASE_KEY || 'mock-key';

export const isSupabaseConfigured = supabaseUrl !== 'https://mock.supabase.co' && supabaseKey !== 'mock-key';
export const isDemoMode = !isSupabaseConfigured && process.env.NODE_ENV !== 'production';

export const supabase = createClient(supabaseUrl, supabaseKey);
