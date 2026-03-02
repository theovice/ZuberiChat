// Usage tracker API client
// TODO: Wire to real backend at http://100.100.101.1:3002 when deployed

export interface UsageStats {
  total_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  window_start: string;
  window_end: string;
}

export interface UsageLimits {
  monthly_limit_usd: number;
  monthly_spent_usd: number;
  monthly_remaining_usd: number;
  percent_used: number;
}

// Mock data — replace with real API calls later
const MOCK_MODE = true;
const USAGE_API = 'http://100.100.101.1:3002';

export async function getStats5h(): Promise<UsageStats> {
  if (MOCK_MODE) {
    return {
      total_events: 7,
      total_input_tokens: 12400,
      total_output_tokens: 4200,
      total_cost_usd: 0.10,
      window_start: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      window_end: new Date().toISOString(),
    };
  }
  const res = await fetch(`${USAGE_API}/stats/5h`);
  return res.json();
}

export async function getStatsWeek(): Promise<UsageStats> {
  if (MOCK_MODE) {
    return {
      total_events: 42,
      total_input_tokens: 89000,
      total_output_tokens: 31000,
      total_cost_usd: 0.73,
      window_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      window_end: new Date().toISOString(),
    };
  }
  const res = await fetch(`${USAGE_API}/stats/week`);
  return res.json();
}

export async function getLimits(): Promise<UsageLimits> {
  if (MOCK_MODE) {
    return {
      monthly_limit_usd: 20.00,
      monthly_spent_usd: 2.47,
      monthly_remaining_usd: 17.53,
      percent_used: 12,
    };
  }
  const res = await fetch(`${USAGE_API}/limits`);
  return res.json();
}
