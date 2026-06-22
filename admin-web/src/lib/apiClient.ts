import axios from 'axios';
import { supabase } from './supabaseClient';

const baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL || 'http://localhost:4000';

export const getBackendClient = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  return axios.create({
    baseURL: baseUrl,
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
  });
};