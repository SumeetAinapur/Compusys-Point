import { createClient } from '@supabase/supabase-js';

// Configuration provided by the user
const supabaseUrl: string = "https://dytlmvfelsjspfzrgnxf.supabase.co";
const supabaseAnonKey: string = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5dGxtdmZlbHNqc3BmenJnbnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc4MTQsImV4cCI6MjA4NjkxMzgxNH0.WKxO6Y4E-ZYYb_d5HcJacjXddmzmrsOh6qioPNFOxEU";

// Fallbacks for safety
const placeholderUrl: string = 'https://placeholder.supabase.co';
const placeholderKey: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

/* Fix for TypeScript error: Ensuring the comparison is valid between string types */
export const isConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== placeholderUrl);

export const supabase = createClient(
  supabaseUrl || placeholderUrl,
  supabaseAnonKey || placeholderKey
);